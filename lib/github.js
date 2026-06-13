/**
 * GITHUB VAULT ACCESS - the "database" layer.
 * All paths are validated server-side before any API call; the LLM is never
 * trusted to produce safe paths.
 */

import { Octokit } from '@octokit/rest';

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

// GitHub contents API only returns inline content for files up to 1MB,
// so that is the practical per-note ceiling (plenty for markdown notes).
const MAX_WRITE_BYTES = 1_000_000;

let octokit;
function client() {
  if (!process.env.GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GitHub vault not configured (GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO)');
  }
  if (!octokit) octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  return octokit;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------
const BLOCKED_SEGMENTS = [
  '.env',
  '.git',
  '.github',
  '.logs',
  '.secrets',
  'node_modules',
  'secret',
  'credentials',
  'password',
];

function validateVaultPath(path, { mustBeMarkdown = false } = {}) {
  if (typeof path !== 'string' || !path.length || path.length > 255) return false;
  // Repo-relative paths only: no leading slash, no traversal, no backslashes
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return false;
  // Allowlist of characters
  if (!/^[\w\-./ ]+$/.test(path)) return false;
  // No hidden files/dirs and no blocked names in any segment
  const segments = path.toLowerCase().split('/');
  if (segments.some((s) => s.startsWith('.') || !s.length)) return false;
  if (segments.some((s) => BLOCKED_SEGMENTS.some((b) => s.includes(b)))) return false;
  if (mustBeMarkdown && !path.toLowerCase().endsWith('.md')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
async function readFile(path) {
  if (!validateVaultPath(path)) return 'Error: cannot access that file.';
  try {
    const res = await client().rest.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
    });
    if (Array.isArray(res.data) || !res.data.content) {
      return 'Error: that path is a directory, not a file.';
    }
    return Buffer.from(res.data.content, 'base64').toString('utf-8');
  } catch (error) {
    if (error.status === 404) return 'Error: file not found.';
    console.error('[GITHUB_READ_ERROR]', error.status, error.message);
    return 'Error: could not access the vault.';
  }
}

// The schema (CLAUDE.md) is the one file the LLM must update but must never
// regenerate from scratch — write_file overwrites the whole file, and an
// unreliable model tends to emit a stub instead of read-modify-write. These
// markers MUST survive any write to the schema; their absence means the model
// gutted it, so we reject the write before it can destroy the schema.
const SCHEMA_PATH = 'claude.md';
const SCHEMA_REQUIRED_MARKERS = ['## Structure', '## Note conventions', '## Workflows'];

function schemaWriteIsDestructive(newContent, existingContent) {
  for (const marker of SCHEMA_REQUIRED_MARKERS) {
    if (!newContent.includes(marker)) return true;
  }
  // A legitimate edit adds/changes a line; it never collapses the file.
  if (existingContent && newContent.length < existingContent.length * 0.7) return true;
  return false;
}

async function writeFile(path, content, message) {
  if (!validateVaultPath(path, { mustBeMarkdown: true })) {
    return 'Error: invalid file path (only .md files inside the vault are allowed).';
  }
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_WRITE_BYTES) {
    return 'Error: content missing or too large (max 1MB).';
  }
  try {
    let sha;
    let existingContent = '';
    try {
      const existing = await client().rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path,
      });
      if (!Array.isArray(existing.data)) {
        sha = existing.data.sha;
        if (existing.data.content) {
          existingContent = Buffer.from(existing.data.content, 'base64').toString('utf8');
        }
      }
    } catch {
      // 404 = new file, fine
    }

    // Guard the schema against destructive overwrites.
    if (path.toLowerCase() === SCHEMA_PATH && schemaWriteIsDestructive(content, existingContent)) {
      return 'Error: that write would erase the vault schema. CLAUDE.md must keep its ## Structure, ## Note conventions, and ## Workflows sections. To change it, read_file("CLAUDE.md") first, make only the minimal edit (usually one line in the Structure tree), and write back the COMPLETE document with every section intact.';
    }
    await client().rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
      message: String(message || `Update ${path}`).slice(0, 200),
      content: Buffer.from(content).toString('base64'),
      ...(sha && { sha }),
    });
    return `File saved: ${path}`;
  } catch (error) {
    console.error('[GITHUB_WRITE_ERROR]', error.status, error.message);
    return 'Error: could not save the file.';
  }
}

/**
 * Full recursive file listing via the git trees API: ONE API call for the
 * whole vault (vs one call per directory with the contents API). This is
 * what keeps a 5000-file vault cheap.
 */
async function listTree() {
  const res = await client().rest.git.getTree({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    tree_sha: 'HEAD',
    recursive: '1',
  });
  return res.data.tree
    .filter((item) => item.type === 'blob' && item.path.toLowerCase().endsWith('.md'))
    .filter((item) => validateVaultPath(item.path))
    .map((item) => ({ path: item.path, size: item.size }));
}

async function listFiles(dirPath = '') {
  if (dirPath && !validateVaultPath(dirPath)) return 'Error: invalid directory path.';
  try {
    const all = await listTree();
    const prefix = dirPath ? dirPath.replace(/\/+$/, '') + '/' : '';
    const files = prefix ? all.filter((f) => f.path.startsWith(prefix)) : all;
    return JSON.stringify(files.slice(0, 200));
  } catch (error) {
    if (error.status === 404 || error.status === 409) return JSON.stringify([]); // empty repo
    console.error('[GITHUB_LIST_ERROR]', error.status, error.message);
    return 'Error: could not list vault files.';
  }
}

async function searchFiles(query) {
  if (typeof query !== 'string' || !query.trim()) return JSON.stringify([]);
  const q = query.trim().slice(0, 200);
  try {
    // 1. Content search via GitHub code search
    const res = await client().rest.search.code({
      q: `repo:${GITHUB_OWNER}/${GITHUB_REPO} ${q}`,
      per_page: 10,
    });
    const hits = (res.data.items || [])
      .filter((item) => item.path.toLowerCase().endsWith('.md'))
      .map((item) => ({ path: item.path, name: item.name }));
    if (hits.length) return JSON.stringify(hits);
  } catch (error) {
    // Code search can fail on private repos / rate limits; fall through
    console.error('[GITHUB_SEARCH_WARN]', error.status, error.message);
  }
  try {
    // 2. Fallback: filename keyword match over the full tree
    const all = await listTree();
    const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = all.filter((f) =>
      keywords.some((kw) => f.path.toLowerCase().includes(kw))
    );
    return JSON.stringify(matches.slice(0, 10));
  } catch (error) {
    console.error('[GITHUB_SEARCH_ERROR]', error.status, error.message);
    return 'Error: vault search failed.';
  }
}

async function getVaultStatus() {
  // Latest commit on the vault repo: tells the user whether their local
  // (Obsidian) edits have reached GitHub, i.e. whether Daemon sees them.
  const res = await client().rest.repos.listCommits({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    per_page: 1,
  });
  const head = res.data[0];
  if (!head) return { sha: null, message: 'empty repository', date: null };
  return {
    sha: head.sha.slice(0, 7),
    message: head.commit.message.split('\n')[0].slice(0, 100),
    date: head.commit.committer?.date || head.commit.author?.date || null,
  };
}

export { readFile, writeFile, searchFiles, listFiles, validateVaultPath, getVaultStatus };
