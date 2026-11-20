import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const errors = [];
let failed = false;
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 475, height: 638 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // shipped default: no ?still
  await page.goto(`http://127.0.0.1:${port}/ridgeline/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ridgeline, null, { timeout: 10000 });
  await page.evaluate(() => window.__ridgeline.start && window.__ridgeline.start('daily'));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({ still: typeof window.__stillInfo, fps: window.__ridgeline.fps }));
  console.log('default', JSON.stringify(r));
  if (r.still !== 'undefined') { failed = true; console.error('FAIL __stillInfo defined without ?still'); }
  if (typeof r.fps !== 'number') { failed = true; console.error('FAIL __ridgeline.fps not a number: ' + r.fps); }
} catch (e) { failed = true; console.error('FAIL', e.message); }
await browser.close();
server.close();
if (errors.length) { failed = true; console.error(errors.join('\n')); }
console.log(failed ? 'STILL FAIL' : 'STILL PASS');
process.exit(failed ? 1 : 0);
