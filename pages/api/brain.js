/**
 * POST /api/brain
 * The vault query endpoint: runs an agentic loop against Groq (Llama 3.3
 * 70B) with four whitelisted tools backed by the GitHub vault.
 *
 * Differences from the original spec, on purpose:
 * - Groq uses the OpenAI chat format: the system prompt is a messages[0]
 *   entry with role "system" (there is no top-level `system:` param), and
 *   tool results are role "tool" messages carrying tool_call_id.
 * - Client-supplied messages are sanitized: only user/assistant roles with
 *   string content are accepted, so a malicious client cannot smuggle in
 *   its own system or tool messages.
 * - The loop is bounded (MAX_TOOL_ROUNDS) so a confused model cannot spin
 *   forever burning the free tier or hitting the Vercel timeout.
 */

import Groq from 'groq-sdk';
const { withSecurity, logSecurityEvent } = require('../../lib/security');
const { SYSTEM_PROMPT } = require('../../lib/system-prompt');
import * as vault from '../../lib/github';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 6;
const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 8000;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a markdown file from the vault',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path, e.g. notes/UN-Certification.md' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or update a markdown file in the vault',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Vault-relative path ending in .md' },
          content: { type: 'string', description: 'Full markdown content of the file' },
          message: { type: 'string', description: 'Short commit message' },
        },
        required: ['path', 'content', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search the vault for files matching keywords. Returns file paths, not contents.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords, e.g. "UN certification"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List markdown files in a vault directory. Empty string lists the whole vault.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path, e.g. "notes", or "" for all' },
        },
        required: ['path'],
      },
    },
  },
];

async function executeTool(name, args) {
  switch (name) {
    case 'read_file':
      return vault.readFile(args.path);
    case 'write_file':
      return vault.writeFile(args.path, args.content, args.message);
    case 'search_files':
      return vault.searchFiles(args.query);
    case 'list_files':
      return vault.listFiles(args.path ?? '');
    default:
      // Whitelist enforcement: the model asked for a tool we never offered
      logSecurityEvent('UNKNOWN_TOOL_CALL', 'model', name);
      return 'Error: unknown tool.';
  }
}

/** Accept only plain user/assistant turns from the client. */
function sanitizeClientMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null;
    if (m.role !== 'user' && m.role !== 'assistant') return null;
    if (typeof m.content !== 'string' || !m.content.trim()) return null;
    if (m.content.length > MAX_CONTENT_CHARS) return null;
    clean.push({ role: m.role, content: m.content });
  }
  if (clean[clean.length - 1].role !== 'user') return null;
  return clean;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clean = sanitizeClientMessages(req.body?.messages);
  if (!clean) {
    return res.status(400).json({ error: 'Invalid request format' });
  }

  if (
    !process.env.GROQ_API_KEY ||
    !process.env.GROQ_API_KEY.startsWith('gsk_') ||
    process.env.GROQ_API_KEY.includes('YOUR_')
  ) {
    logSecurityEvent('GROQ_NOT_CONFIGURED', 'system');
    return res.status(503).json({ error: 'Vault brain is not configured yet' });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const conversation = [{ role: 'system', content: SYSTEM_PROMPT }, ...clean];

  // Groq free tier allows 12k tokens/min; a multi-round agentic loop can
  // exceed that mid-request. Brief backoff on 429 usually rides it out.
  let tokensUsed = 0; // total tokens this request spent (for the usage bar)
  const createCompletion = async (withTools, extraMessages = []) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
          model: GROQ_MODEL,
          // Groq's TPM pre-check reserves prompt+max_tokens against the
          // 12k/min budget; keep the reservation small so multi-round
          // loops fit. 768 is plenty for a note or an answer.
          max_tokens: 768,
          temperature: 0.3,
          messages: [...conversation, ...extraMessages],
          ...(withTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
        });
        tokensUsed += completion.usage?.total_tokens || 0;
        return completion;
      } catch (err) {
        if (err?.status !== 429 || attempt >= 1) throw err;
        // One short backoff only: a long wait risks blowing Vercel's 60s
        // function limit (which surfaces to the user as a 504). Fail fast to
        // a clean "try again" instead of a timeout.
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  // Llama on Groq sometimes emits a malformed tool call and the API rejects
  // it with 400 tool_use_failed. Retry once with tools, then fall back to a
  // plain completion so the user still gets an answer instead of a 500.
  const isToolUseFailed = (err) =>
    err?.status === 400 &&
    (err?.error?.error?.code === 'tool_use_failed' || String(err?.message || '').includes('tool_use_failed'));

  try {
    let wroteFile = false; // did a real write_file actually succeed this request?
    // Vercel hobby kills the function at 60s (surfaces as a 504 "Error
    // communicating with vault"). Stop starting new rounds past this deadline
    // and return what we have instead — saved work is reported honestly.
    const deadline = Date.now() + 50000;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      if (Date.now() > deadline) {
        logSecurityEvent('QUERY_DEADLINE', req.user.email, `${round} round(s)`);
        return res.status(200).json({
          response: wroteFile
            ? 'Saved to your vault. (I ran out of time to write the full report, but the note is in.)'
            : "That request is taking too long on the free tier — nothing was saved. Please try again, or split it into a smaller step.",
          tokensUsed,
        });
      }
      let completion;
      try {
        completion = await createCompletion(true);
      } catch (err) {
        if (!isToolUseFailed(err)) throw err;
        logSecurityEvent('GROQ_TOOL_USE_FAILED', req.user?.email || 'unknown', `round ${round}, retrying`);
        try {
          completion = await createCompletion(true);
        } catch (retryErr) {
          if (!isToolUseFailed(retryErr)) throw retryErr;
          completion = await createCompletion(false, [{
            role: 'system',
            content: 'Vault tools are temporarily unavailable for this reply. Answer from your general knowledge, and do not claim to have searched or read any notes.',
          }]);
        }
      }

      const message = completion.choices[0]?.message;
      if (!message) throw new Error('Empty completion from Groq');
      conversation.push(message);

      // Llama frequently FAKES tool calls as plain text instead of making a
      // real one. Observed forms: "<function=name ...>", "<function(name>...",
      // "</function>", and markdown like `read_file("x")` or ```write_file(...)```.
      // Either way nothing executed, so never show it to the user — tell the
      // model to correct itself and run another round.
      const content = message.content || '';
      const fakesToolCall =
        /<\/?function[=\s(>]/.test(content) ||
        /(?:read_file|write_file|search_files|list_files)\s*[("'>]/.test(content);
      if (!message.tool_calls?.length && fakesToolCall && round < MAX_TOOL_ROUNDS) {
        conversation.push({
          role: 'system',
          content: 'STOP. Your last reply only TALKED about calling tools (e.g. wrote read_file(...) as text or in a code block). That executes NOTHING. You must invoke the tools through the real function-calling interface, not by writing their names in your message. Now actually call the needed tool. If you do not need any tool, answer the user in plain prose and never mention tool names or pretend to have run them.',
        });
        continue;
      }

      // The model sometimes emits the architect "I saved it" format (or claims
      // a note was added) without ever calling write_file — a hallucinated save.
      // If it used that format but no write actually ran, make it do the work.
      const claimsSaveFormat =
        /knowledge note/i.test(content) ||
        /###\s*\d\.\s*classification/i.test(content) ||
        (/compressed insight/i.test(content) && /key principles/i.test(content));
      if (!message.tool_calls?.length && claimsSaveFormat && !wroteFile && round < MAX_TOOL_ROUNDS) {
        conversation.push({
          role: 'system',
          content: 'You presented a note in the architect format but never actually called write_file, so NOTHING was saved to the vault. Make the real write_file function call now, with the note path and the full content INCLUDING the YAML frontmatter tags. Only after a write_file call has succeeded may you report the note as saved.',
        });
        continue;
      }

      if (!message.tool_calls?.length) {
        // Last-round safety net: if the model produced the "I saved it" format
        // but never actually wrote (the re-prompt above only fires while
        // round < MAX), don't hand the user a fake success.
        if (claimsSaveFormat && !wroteFile) {
          logSecurityEvent('QUERY_HALLUCINATED_SAVE', req.user.email);
          return res.status(200).json({
            response: "I wasn't able to finish saving that to your vault (the write didn't go through). Please send it again — it usually works on a second try.",
            tokensUsed,
          });
        }
        logSecurityEvent('QUERY_SUCCESS', req.user.email, `${round} tool round(s)`);
        return res.status(200).json({
          response: message.content || 'Done.',
          tokensUsed,
          // Return only the visible turns; never echo the system prompt
          messages: conversation
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        });
      }

      if (round === MAX_TOOL_ROUNDS) {
        // Tool budget exhausted, but the work may well have succeeded (e.g.
        // the model looped re-doing a write that already worked). Drop the
        // unexecuted trailing tool call and ask for a plain-prose summary of
        // what was actually done instead of reporting a failure.
        logSecurityEvent('QUERY_TOOL_LIMIT', req.user.email);
        conversation.pop();
        const summary = await createCompletion(false, [{
          role: 'system',
          content: 'The tool budget for this reply is used up. Based on the tool results above, tell the user in 1-3 sentences what was actually accomplished (files created or updated, with their paths) and what, if anything, remains undone. Plain prose only.',
        }]).catch(() => null);
        return res.status(200).json({
          response: summary?.choices[0]?.message?.content ||
            'That request needed too many vault operations. Try narrowing it down.',
          tokensUsed,
          messages: clean,
        });
      }

      for (const toolCall of message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          // Model produced malformed JSON; report it back as a tool error
        }
        // A failing vault call must not 500 the whole request: report the
        // failure as the tool result so the model can tell the user what
        // happened (vault empty, repo unreachable, file not found, ...).
        let result;
        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (toolError) {
          logSecurityEvent('TOOL_FAILED', req.user?.email || 'unknown', `${toolCall.function.name}: ${toolError.message}`);
          result = `Error: the "${toolCall.function.name}" vault operation failed (${toolError.status === 404 ? 'not found' : 'vault unavailable'}). Tell the user briefly, and answer from your own knowledge if you can.`;
        }
        if (toolCall.function.name === 'write_file' && typeof result === 'string' && result.startsWith('File saved')) {
          wroteFile = true;
        }
        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }
  } catch (error) {
    if (error?.status === 429) {
      logSecurityEvent('GROQ_RATE_LIMITED', 'system', error.message);
      // When it's the DAILY (TPD) cap, Groq states the real numbers in the
      // message — surface them so the usage bar can show the true daily total.
      const haystack = [
        error?.message,
        error?.error?.message,
        error?.error?.error?.message,
      ].filter(Boolean).join(' ');
      const tpd = /tokens per day \(TPD\): Limit (\d+), Used (\d+)/.exec(haystack);
      return res.status(503).json({
        error: 'Service temporarily unavailable, try again in a minute',
        ...(tpd ? { dailyLimit: Number(tpd[1]), dailyUsed: Number(tpd[2]) } : {}),
      });
    }
    if (error?.status === 401) {
      // Invalid Groq API key - configuration problem, not a user problem
      logSecurityEvent('GROQ_AUTH_ERROR', 'system');
      return res.status(503).json({ error: 'Vault brain is not configured yet' });
    }
    logSecurityEvent('QUERY_ERROR', req.user?.email || 'unknown', error.message);
    console.error('[BRAIN_ERROR]', error.status || '', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withSecurity(handler); // requireAuth: true (default)

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  // Vercel Hobby defaults to 10s; agentic loops with 429 backoff need more
  maxDuration: 60,
};
