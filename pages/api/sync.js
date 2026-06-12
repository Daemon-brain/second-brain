/**
 * GET /api/sync
 * Returns the latest commit on the vault repo. Daemon always reads GitHub
 * live, so "sync" means confirming the vault's current state: if the user
 * just edited notes in Obsidian, this tells them whether that push has
 * landed (and is therefore visible to Daemon).
 */

import { withSecurity } from '../../lib/security.js';
import * as vault from '../../lib/github.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const status = await vault.getVaultStatus();
    return res.json(status);
  } catch (error) {
    console.error('[SYNC_ERROR]', error.status || '', error.message);
    return res.status(503).json({ error: 'Vault unreachable' });
  }
}

export default withSecurity(handler); // requireAuth: true (default)
