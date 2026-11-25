// gameHash per CONTRACT section 9. Copy verbatim into the plugin hook (no cross-repo import).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function gameHash(dir) {
  const files = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (!rel && e.name === 'qa') continue; // top-level qa/ excluded
        walk(join(abs, e.name), r);
      } else if (e.isFile()) {
        if (e.name.startsWith('.')) continue;
        if (!rel && e.name === 'sw.js') continue; // top-level sw.js excluded
        files.push(r);
      }
    }
  };
  walk(dir, '');
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const h = createHash('sha256');
  for (const r of files) {
    h.update(r);
    h.update('\0');
    h.update(readFileSync(join(dir, ...r.split('/'))));
    h.update('\0');
  }
  return 'sha256:' + h.digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('usage: node hash.mjs pages/<game>'); process.exit(2); }
  console.log(gameHash(process.argv[2]));
}
