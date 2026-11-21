import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages');
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
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
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/ridgeline/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ridgeline, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'menu.png') });
  await page.evaluate(() => window.__ridgeline.start('daily'));
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const r = window.__ridgeline;
    return { z: r.state.z, speed: r.state.speed, crashed: r.state.crashed, fps: r.fps ?? null, stats: typeof r.stats === 'function' ? r.stats() : r.stats ?? null, keys: Object.keys(r) };
  });
  console.log('state', JSON.stringify(info));
  await page.screenshot({ path: path.join(out, 'run.png') });
  await page.setViewportSize({ width: 344, height: 882 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'run-344.png') });
  if (!(info.z > 20)) { failed = true; console.error('FAIL state.z ' + info.z + ' not > 20'); }
} catch (e) { failed = true; console.error('FAIL', e.message); }
await browser.close();
server.close();
if (errors.length) { failed = true; console.error('FAIL errors:\n' + errors.join('\n')); }
console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS');
process.exit(failed ? 1 : 0);
