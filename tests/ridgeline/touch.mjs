// Real-touch steering test (Fold cover, hasTouch). Regression for "controls don't work" on phone:
// starts via a tapped button, then drags a finger over the HUD-covered screen and checks the sled moves sideways.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
let ok = true;
try {
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/ridgeline/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ridgeline);
  await page.waitForTimeout(400);
  // tap the first start button like a finger would
  const btn = page.locator('button', { hasText: /daily|start|ride|go/i }).first();
  await btn.tap();
  await page.waitForTimeout(800);
  const phaseOk = await page.evaluate(() => window.__ridgeline.state && window.__ridgeline.state.z > 0);
  if (!phaseOk) { console.log('FAIL: run did not start from tap'); ok = false; }
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  async function drag(dx) {
    const x0 = await page.evaluate(() => window.__ridgeline.state.x - window.__ridgeline.course.centerX(window.__ridgeline.state.z));
    await touch('touchStart', 237, 450);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', 237 + dx * i / 8, 450); await page.waitForTimeout(30); }
    await page.waitForTimeout(700);
    const x1 = await page.evaluate(() => window.__ridgeline.state.x - window.__ridgeline.course.centerX(window.__ridgeline.state.z));
    await touch('touchEnd', 0, 0);
    await page.waitForTimeout(300);
    return x1 - x0;
  }
  const right = await drag(90);
  const left = await drag(-90);
  console.log(`steer right moved ${right.toFixed(2)} m, left moved ${left.toFixed(2)} m`);
  if (!(right > 1)) { console.log('FAIL: right drag did not steer'); ok = false; }
  if (!(left < -1)) { console.log('FAIL: left drag did not steer'); ok = false; }
  const rep = await page.evaluate(() => window.__ridgeline.report());
  console.log('--- sample report ---\n' + rep + '\n---');
  const tm = /^\s*touches: (\d+)/m.exec(rep), dm = /^\s*drags: (\d+)/m.exec(rep);
  if (!tm || +tm[1] < 2) { console.log('FAIL: report touches'); ok = false; }
  if (!dm || +dm[1] < 2) { console.log('FAIL: report drags'); ok = false; }
} finally { await browser.close(); server.close(); }
console.log(ok ? 'TOUCH PASS' : 'TOUCH FAIL');
process.exit(ok ? 0 : 1);
