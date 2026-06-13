/**
 * GET  /api/schema  → { content, exists } — the current CLAUDE.md
 * POST /api/schema  → body { content, message } writes CLAUDE.md
 *
 * This is the manual schema editor, used when the user is not satisfied with
 * Daemon's automatic update. It bypasses the LLM entirely (and the destructive
 * write guard in writeFile) because it is a trusted human editing the full
 * document, not the model regenerating a stub.
 */

import { withSecurity } from '../../lib/security.js';
import * as vault from '../../lib/github.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { content, exists } = await vault.getSchema();
      return res.json({ content, exists });
    } catch (error) {
      console.error('[SCHEMA_GET_ERROR]', error.status || '', error.message);
      return res.status(503).json({ error: 'Could not read the schema' });
    }
  }

  if (req.method === 'POST') {
    const { content, message } = req.body || {};
    const result = await vault.writeSchema(content, message);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSecurity(handler); // requireAuth: true (default)

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
