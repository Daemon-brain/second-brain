/**
 * GET /api/graph
 * Returns all files in the vault as a force-directed graph (nodes + links).
 * Parses notes for [[wikilinks]] to detect connections.
 */

import { withSecurity } from '../../lib/security.js';
import * as vault from '../../lib/github.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all files
    const fileList = JSON.parse(await vault.listFiles(''));
    if (!Array.isArray(fileList) || fileList.length === 0) {
      return res.json({ nodes: [], links: [] });
    }

    const nodes = fileList.map((file) => ({
      id: file.path,
      name: file.path.split('/').pop().replace('.md', ''),
      size: file.size || 100,
    }));

    // Parse each file for links to other notes
    const links = [];
    const linkMap = new Set();

    for (const file of fileList) {
      try {
        const content = await vault.readFile(file.path);
        // Find [[wikilinks]] and [markdown links](path.md)
        const wikiRegex = /\[\[([^\]]+)\]\]/g;
        const markdownRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;

        let match;
        while ((match = wikiRegex.exec(content)) !== null) {
          const targetName = match[1].toLowerCase().replace(/\s+/g, '-');
          const target = fileList.find((f) => f.name?.toLowerCase().includes(targetName));
          if (target && target.path !== file.path) {
            const linkKey = [file.path, target.path].sort().join('→');
            if (!linkMap.has(linkKey)) {
              links.push({ source: file.path, target: target.path });
              linkMap.add(linkKey);
            }
          }
        }

        while ((match = markdownRegex.exec(content)) !== null) {
          const targetPath = match[2];
          const target = fileList.find((f) => f.path === targetPath);
          if (target && target.path !== file.path) {
            const linkKey = [file.path, target.path].sort().join('→');
            if (!linkMap.has(linkKey)) {
              links.push({ source: file.path, target: target.path });
              linkMap.add(linkKey);
            }
          }
        }
      } catch {
        // File read error; skip parsing
      }
    }

    return res.json({ nodes, links });
  } catch (error) {
    console.error('[GRAPH_ERROR]', error.message);
    return res.status(500).json({ error: 'Could not build graph' });
  }
}

export default withSecurity(handler); // requireAuth: true (default)
