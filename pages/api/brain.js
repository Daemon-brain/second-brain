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

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: 2048,
        temperature: 0.3,
        messages: conversation,
        tools: TOOLS,
        tool_choice: 'auto',
      });

      const message = completion.choices[0]?.message;
      if (!message) throw new Error('Empty completion from Groq');
      conversation.push(message);

      if (!message.tool_calls?.length) {
        logSecurityEvent('QUERY_SUCCESS', req.user.email, `${round} tool round(s)`);
        return res.status(200).json({
          response: message.content || 'Done.',
          // Return only the visible turns; never echo the system prompt
          messages: conversation
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        });
      }

      if (round === MAX_TOOL_ROUNDS) {
        logSecurityEvent('QUERY_TOOL_LIMIT', req.user.email);
        return res.status(200).json({
          response: 'That request needed too many vault operations. Try narrowing it down.',
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
        const result = await executeTool(toolCall.function.name, args);
        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }
  } catch (error) {
    if (error?.status === 429) {
      logSecurityEvent('GROQ_RATE_LIMITED', 'system');
      return res.status(503).json({ error: 'Service temporarily unavailable, try again in a minute' });
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
};
