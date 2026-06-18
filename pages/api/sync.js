/**
 * /api/sync
 * GET  → read-only: returns the vault's latest commit (status only).
 * POST → also reconciles the auto-managed live-structure block in CLAUDE.md
 *        with the real folders. Daemon reads GitHub live, so Sync both reports
 *        the latest push (e.g. notes you added in Obsidian) and refreshes the
 *        schema's structure mirror to match — deterministically, touching only
 *        the marked block, per the rules in CLAUDE.md.
 */

import { withSecurity } from '../../lib/security.js';
import * as vault from '../../lib/github.js';

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let schemaUpdated = false;
    if (req.method === 'POST') {
      const r = await vault.reconcileStructure().catch(() => ({ changed: false }));
      schemaUpdated = !!r.changed;
    }
    const status = await vault.getVaultStatus();
    return res.json({ ...status, schemaUpdated });
  } catch (error) {
    console.error('[SYNC_ERROR]', error.status || '', error.message);
    return res.status(503).json({ error: 'Vault unreachable' });
  }
}

export default withSecurity(handler); // requireAuth: true (default)
