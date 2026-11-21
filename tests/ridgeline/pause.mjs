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
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
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
const ok = (c, m) => { if (!c) { failed = true; console.error('FAIL ' + m); } else console.log('ok   ' + m); };
const browser = await chromium.launch();
try {
  for (const [w, h] of [[475, 638], [344, 882]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/ridgeline/?vis=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ridgeline && window.__ridgeline.ready, null, { timeout: 20000 });
    await page.evaluate(() => window.__ridgeline.start('random'));
    await page.waitForTimeout(1500);
    const tag = w + 'x' + h;
    const z = () => page.evaluate(() => window.__ridgeline.state.z);
    ok((await page.evaluate(() => window.__ridgeline.phase)) === 'run', tag + ' in run');
    const btn = page.locator('.rlh-menubtn');
    const bb = await btn.boundingBox();
    ok(bb && bb.width >= 44 && bb.height >= 44, tag + ' MENU target >= 44 px (' + (bb && bb.width) + 'x' + (bb && bb.height) + ')');
    await page.screenshot({ path: path.join(out, `pause-hud-${tag}.png`) });
    await btn.click();
    await page.waitForTimeout(200);
    ok(await page.locator('.rlh-pause').isVisible(), tag + ' pause menu visible');
    const z1 = await z(); await page.waitForTimeout(1200); const z2 = await z();
    ok(z1 === z2, tag + ' frozen while paused (' + z1 + ' vs ' + z2 + ')');
    await page.screenshot({ path: path.join(out, `pause-menu-${tag}.png`) });
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(800);
    ok((await z()) > z2 + 1, tag + ' resumes');
    ok(!(await page.locator('.rlh-pause').isVisible()), tag + ' pause hidden after resume');
    // keyboard
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok(await page.locator('.rlh-pause').isVisible(), tag + ' Esc pauses');
    // Restart
    await page.getByRole('button', { name: 'Restart' }).click(); await page.waitForTimeout(600);
    ok(!(await page.locator('.rlh-pause').isVisible()) && (await z()) < 60, tag + ' restart: fresh run, menu closed');
    // Settings opens tweak, then back to pause
    await page.locator('.rlh-menubtn').click(); await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !!document.querySelector('.rlt.open')), tag + ' settings panel opens from pause');
    await page.screenshot({ path: path.join(out, `pause-settings-${tag}.png`) });
    await page.locator('.rlt [data-act=close]').first().click(); await page.waitForTimeout(150);
    ok(await page.locator('.rlh-pause').isVisible(), tag + ' back at pause menu after settings');
    // Quit
    await page.getByRole('button', { name: 'Quit to title' }).click(); await page.waitForTimeout(600);
    ok((await page.evaluate(() => window.__ridgeline.phase)) === 'home', tag + ' quit -> home');
    ok(!(await page.locator('.rlh-pause').isVisible()), tag + ' pause hidden at home');
    // end card still has HOME next to RIDE AGAIN
    await page.evaluate(() => window.__ridgeline.start('random'));
    await page.waitForFunction(() => window.__ridgeline.phase === 'end', null, { timeout: 90000 }).catch(() => {});
    if ((await page.evaluate(() => window.__ridgeline.phase)) === 'end') {
      await page.waitForTimeout(1500);
      ok(await page.locator('.b4ec [data-a=home]').isVisible() && await page.locator('.b4ec [data-a=again]').isVisible(), tag + ' end card shows RIDE AGAIN + HOME');
      ok(!(await page.locator('.rlh-menubtn').isVisible()), tag + ' MENU hidden on end card');
      await page.screenshot({ path: path.join(out, `end-card-${tag}.png`) });
    } else console.log('note: run did not end in 90 s (end card not checked)');
    await ctx.close();
  }
  if (errors.length) { failed = true; console.error(errors.join('\n')); }
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
