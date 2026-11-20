// node overlay-layout.js : Layout A (overlay pad) checks on the built index.html. Run after `python3 src/inline.py`.
// 475x638 overlay numbers, PAD_SIDE, left-hand mirror, Retry, DEV badge; 344x882 'below'; 624x912, 704x783, 816x568 no-overlap sweep.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onScreen = (r, W, H) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.01 && r.y + r.h <= H + 0.01;
const finite = (r) => r && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(r[k]));

async function open(browser, port, W, H) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await context.addInitScript(() => {
    window.__txt = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (window.__txt.length < 4000) window.__txt.push(String(t)); return ft.apply(this, arguments); };
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=7`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen && window.PL && window.PL.Assets && window.PL.UI, null, { timeout: 8000 });
  await page.evaluate(() => {
    window.__hero = { n: 0, px: 0 }; window.__pa = { up: null };
    const o = PL.Assets.drawHero;
    PL.Assets.drawHero = function (ctx, pose, x, y, h, opt) {
      const m = ctx.getTransform(), det = Math.abs(m.a * m.d - m.b * m.c);
      window.__hero.n++; window.__hero.px = h * Math.sqrt(det) / (window.devicePixelRatio || 1);
      return o.apply(this, arguments);
    };
    const ak = PL.UI.arrowKey;
    PL.UI.arrowKey = function (ctx, r, st) { if (st && st.dir === 'up' && !st.pressed) window.__pa.up = ctx.globalAlpha; return ak.apply(this, arguments); };
  });
  await page.evaluate(() => { PL_TEST.startMode('short', 7); });
  await sleep(1200);
  return { page, context, errs };
}
// snapshot of everything we assert on
const snap = (page) => page.evaluate(() => {
  const L = PL_TEST.pad().layout, R = PL_TEST.rects(), st = PL_TEST.getState();
  return { screen: PL_TEST.screen(), L, rects: R.rects, room: PL_TEST.roomRect(), roomW: st && st.room ? st.room.w : 336,
    Wv: innerWidth, Hv: innerHeight, hero: window.__hero.n ? window.__hero.px : 0, alpha: window.__pa.up,
    tw: { a: PL.Tweak.get('PAD_ALPHA'), s: PL.Tweak.get('PAD_SIDE') }, txt: window.__txt.join('|'), hand: PL.Input.getHand() };
});
const fresh = async (page) => { await page.evaluate(() => { window.__hero.n = 0; window.__txt = []; window.__pa.up = null; }); await sleep(350); return snap(page); };

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();

  // ---------- 475x638 ----------
  {
    const W = 475, H = 638, t = '475x638 ';
    const { page, errs } = await open(browser, port, W, H);
    let s = await fresh(page);
    ok(s.screen === 'play', t + 'in play (screen=' + s.screen + ')');
    ok(s.L.mode === 'overlay', t + "Input.layout mode 'overlay' (got " + s.L.mode + ')');
    ok(Math.abs(W - (s.L.box.x + s.L.box.w) - 8) < 0.5, t + 'pad right edge 8 px from screen edge (gap ' + (W - s.L.box.x - s.L.box.w) + ')');
    ok(Math.abs(H - (s.L.box.y + s.L.box.h) - 8) < 0.5, t + 'pad bottom edge 8 px from screen edge (gap ' + (H - s.L.box.y - s.L.box.h) + ')');
    ok(s.room && s.room.h >= 560, t + 'room rect height >= 560 (got ' + (s.room && s.room.h) + ')');
    const sc = s.room ? s.room.w / s.roomW : 0;
    ok(sc >= 1.12, t + 'camera scale >= 1.12 (got ' + sc.toFixed(3) + ')');
    ok(s.hero >= 33, t + 'hero drawn bbox >= 33 px (got ' + s.hero.toFixed(1) + ')');
    ok(s.tw.a === 0.45, t + 'PAD_ALPHA tweak default 0.45 (got ' + s.tw.a + ')');
    ok(s.alpha != null && Math.abs(s.alpha - 0.45) < 0.01, t + 'pad drawn at alpha 0.45 at rest (drawn ' + s.alpha + ')');
    ok(s.rects && s.rects.retry && s.rects.retry.w === 60 && s.rects.retry.h === 60, t + 'Retry 60x60 (' + JSON.stringify(s.rects && s.rects.retry) + ')');
    ok(!hit(s.rects.retry, s.L.box), t + 'Retry does not overlap pad');
    const baseRetry = s.rects.retry, baseBox = s.L.box;

    // PAD_SIDE = 1
    await page.evaluate(() => PL.Tweak.set('PAD_SIDE', 1));
    s = await fresh(page);
    ok(Math.abs(s.L.box.x - 8) < 0.5, t + 'PAD_SIDE=1 pad box left at x=8 (got ' + s.L.box.x + ')');
    ok(!hit(s.rects.retry, s.L.box), t + 'PAD_SIDE=1 Retry does not overlap pad');
    await page.evaluate(() => PL.Tweak.set('PAD_SIDE', 0));

    // left-hand mirror
    await page.evaluate(() => PL.Input.setHand('left'));
    s = await fresh(page);
    ok(Math.abs(s.L.box.x - 8) < 0.5 && s.L.box.x < baseBox.x, t + 'left hand: pad moves to left edge (x=' + s.L.box.x + ')');
    ok(s.rects.retry.x > baseRetry.x, t + 'left hand: Retry moves to the right (x ' + baseRetry.x + ' -> ' + s.rects.retry.x + ')');
    ok(!hit(s.rects.retry, s.L.box), t + 'left hand: Retry does not overlap pad');
    await page.evaluate(() => PL.Input.setHand('right'));

    // DEV badge
    s = await fresh(page);
    ok(!/DEV/.test(s.txt), t + 'no DEV badge at defaults');
    await page.evaluate(() => PL.Tweak.set('PAD_ALPHA', 0.6));
    s = await fresh(page);
    ok(/DEV/.test(s.txt), t + 'DEV badge visible with PAD_ALPHA=0.6');
    ok(s.alpha != null && Math.abs(s.alpha - 0.6) < 0.01, t + 'pad drawn at alpha 0.6 after tweak (drawn ' + s.alpha + ')');
    await page.evaluate(() => PL.Tweak.resetAll());
    s = await fresh(page);
    ok(!/DEV/.test(s.txt), t + 'DEV badge gone after reset');
    ok(errs.length === 0, t + 'no page errors ' + errs.join(';'));
    await page.context().close();
  }

  // ---------- 344x882: below ----------
  {
    const W = 344, H = 882, t = '344x882 ';
    const { page, errs } = await open(browser, port, W, H);
    const s = await fresh(page);
    ok(s.L.mode === 'below', t + "mode 'below' (got " + s.L.mode + ')');
    ok(s.room && !hit(s.room, s.L.box), t + 'pad box does NOT overlap room rect (room ' + JSON.stringify(s.room) + ' pad ' + JSON.stringify(s.L.box) + ')');
    ok(errs.length === 0, t + 'no page errors');
    await page.context().close();
  }

  // ---------- sweep ----------
  for (const [W, H] of [[624, 912], [704, 783], [816, 568]]) {
    const t = W + 'x' + H + ' ';
    const { page, errs } = await open(browser, port, W, H);
    const s = await fresh(page), r = s.rects || {};
    for (const n of ['hudRoom', 'hudTime', 'pips']) ok(r[n] && !hit(r[n], s.L.box), t + n + ' pill does not overlap pad');
    ok(onScreen(r.retry, W, H), t + 'Retry fully on screen ' + JSON.stringify(r.retry));
    ok(!hit(r.retry, s.L.box), t + 'Retry does not overlap pad');
    const all = [s.L.box, s.room, r.retry, r.pause, r.hudRoom, r.hudTime, r.pips];
    ok(all.every(finite) && Number.isFinite(s.hero), t + 'no NaN in layout rects / hero (mode ' + s.L.mode + ')');
    ok(errs.length === 0, t + 'no page errors ' + errs.join(';'));
    await page.context().close();
  }

  await browser.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
