// node l1-shots.js OUTDIR : overlay-build L1 screenshots (play/tutorial) at 475x638 and 344x882, dSF 1; prints room rect, scale, hero px.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.argv[2] || '.';
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, browser = await chromium.launch();
  for (const [W, H] of [[475, 638], [344, 882]]) for (const mode of ['play', 'tutorial']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html?seed=1`);
    await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene, null, { timeout: 5000 });
    const res = await page.evaluate((mode) => {
      PL_TEST.startMode(mode, 1); PL_TEST.room(1);
      const s = PL_TEST.getState(), v = { W: innerWidth, H: innerHeight, inset: { t: 0, r: 0, b: 0, l: 0 } };
      const f = PL.camUpdate(PL.camNew(), s, v, 1 / 60);
      return { mode: PL.Input.layout(v.W, v.H).mode, scale: f.scale, hudTop: f.hudTop, room: f.roomRect, heroPx: 2 * 11 * f.scale, errs: 0 };
    }, mode);
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `L1-${mode}-${W}x${H}.png`) });
    console.log(`${W}x${H} ${mode}: layout ${res.mode} scale ${res.scale.toFixed(4)} hudTop ${res.hudTop} room ${JSON.stringify(res.room, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v)} hero ~${res.heroPx.toFixed(1)}px dia ${errs.length ? 'ERR ' + errs[0] : ''}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
