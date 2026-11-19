// node pad-shots.js : S1 arrow pad + camera fit, real build. For 475x638, 344x882, 816x568 (and 475x638 left hand):
// reads the live camera frame and PL.Input.layout in the page, checks the room rect never touches the pad box,
// Retry or Pause, taps each arrow key and checks gravity follows, saves src/review/shots-beta/s1-pad-<view>.png.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, '..', 'review', 'shots-beta');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, browser = await chromium.launch();
  for (const [W, H, hand] of [[475, 638, 'right'], [344, 882, 'right'], [816, 568, 'right'], [475, 638, 'left']]) {
    const tag = W + 'x' + H + (hand === 'left' ? '-left' : '');
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?seed=1`);
    await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene, null, { timeout: 5000 });
    const res = await page.evaluate(([hand]) => {
      PL.Input.setHand(hand); PL_TEST.startMode('tutorial', 1); PL_TEST.room(1);
      const s = PL_TEST.getState(), v = { W: innerWidth, H: innerHeight, inset: { t: 0, r: 0, b: 0, l: 0 } };
      const f = PL.camUpdate(PL.camNew(), s, v, 1 / 60);
      const room = { x: (0 - f.cx) * f.scale + v.W / 2, y: (0 - f.cy) * f.scale + v.H / 2, w: s.room.w * f.scale, h: s.room.h * f.scale };
      return { f, room, L: PL.Input.layout(v.W, v.H) };
    }, [hand]);
    const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const { room, L, f } = res;
    ok(f.fit && f.scale >= 0.84, `${tag} fit scale ${f.scale.toFixed(4)} >= 0.84`);
    for (const k of ['box', 'retry', 'pause']) ok(!inter(room, L[k]), `${tag} room x ${room.x.toFixed(1)}-${(room.x + room.w).toFixed(1)} y ${room.y.toFixed(1)}-${(room.y + room.h).toFixed(1)} clear of ${k}`);
    // tap each key: gravity follows (room 1 starts grounded, so flips are free)
    const got = [];
    for (const d of [1, 0, 3, 2]) {
      await page.evaluate(() => PL_TEST.room(1));
      const r = L.keys[d];
      await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); await sleep(60);
      got.push(await page.evaluate(() => PL_TEST.getState().g));
    }
    ok(got.join() === '1,0,3,2', `${tag} real touch taps on arrow keys set gravity (${got})`);
    await page.evaluate(() => { PL_TEST.room(1); }); await sleep(250);
    await page.screenshot({ path: path.join(OUT, `s1-pad-${tag}.png`) });
    ok(errs.length === 0, `${tag} no console errors ${errs.slice(0, 2).join(' | ')}`);
    await page.evaluate(() => PL.Input.setHand('right'));
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
