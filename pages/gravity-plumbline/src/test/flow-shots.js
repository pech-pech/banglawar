// flow-shots.js: screenshots of every screen of the built game (index.html served over local http so assets load)
// at 475x638, 344x882, 816x568, deviceScaleFactor 2 -> src/review/shots-beta/flow-<screen>-<WxH>.png.
// Also checks the live layout (pad rects from PL.Input.layout) for overlaps and < 56 px targets.
// Run: node pages/gravity-plumbline/src/test/flow-shots.js   (needs playwright; build index.html first)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.resolve(__dirname, '..', 'review', 'shots-beta');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VPS = [[475, 638], [344, 882], [816, 568]];
const problems = [];

srv.listen(0, '127.0.0.1', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = srv.address().port, browser = await chromium.launch();
  let n = 0;
  for (const [W, H] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?seed=7`);
    await page.waitForFunction(() => window.PL_TEST && PL_TEST.screen, null, { timeout: 8000 });
    await page.waitForFunction(() => PL.Assets && PL.Assets.attempted && PL.Assets.attempted(), null, { timeout: 8000 }).catch(() => {});
    await sleep(900);
    const ev = (f, a) => page.evaluate(f, a);
    const shot = async (name) => { await sleep(120); await page.screenshot({ path: path.join(OUT, `flow-${name}-${W}x${H}.png`) }); n++; };
    // live-layout check: overlaps between leaf rects (room/padBox/list/card are containers, toast/tag overlays)
    const check = async (label) => {
      const bad = await ev(() => {
        const r = PL_TEST.rects(); if (!r.rects) return [];
        const L = PL_TEST.layout(r.name), C = (L && L.containers) || [], O = (L && L.overlays) || [], out = [];
        const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        const leaf = Object.keys(r.rects).filter((k) => C.indexOf(k) < 0 && O.indexOf(k) < 0 && k !== 'screen');
        for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) if (hit(r.rects[leaf[i]], r.rects[leaf[j]])) out.push('overlap ' + leaf[i] + ' x ' + leaf[j]);
        for (const t of r.targets) { const q = r.rects[t]; if (t !== 'screen' && (q.w < 56 || q.h < 56)) out.push('small target ' + t + ' ' + q.w + 'x' + q.h); }
        if (L && L.rects.room && L.rects.padBox && hit(L.rects.room, L.rects.padBox)) out.push('room hits pad');
        return out;
      });
      for (const b of bad) problems.push(`${W}x${H} ${label}: ${b}`);
    };
    await shot('firstOpen'); await check('firstOpen');
    await ev(() => PL_TEST.go('firstOpen'));
    await ev(() => { const r = PL_TEST.rects().rects.start; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 })); });
    await sleep(500); await shot('tutorial'); await check('tutorial');
    await ev(() => PL_TEST.menu()); await sleep(300); await shot('menu'); await check('menu');
    await ev(() => PL_TEST.go('shaftPick')); await sleep(200); await shot('shaftPick'); await check('shaftPick');
    await ev(() => PL_TEST.startMode('short', 7)); await sleep(700); await shot('play'); await check('play');
    await ev(() => { PL_TEST.tick(30); PL_TEST.kill('spike'); }); await sleep(90); await shot('death'); await check('death');
    await sleep(1800);
    await ev(() => PL_TEST.winRoom()); await sleep(350); await shot('roomClear'); await check('roomClear');
    await ev(() => PL_TEST.advance()); await sleep(400);
    await ev(() => PL_TEST.go('pause')); await sleep(250); await shot('pause'); await check('pause');
    await ev(() => { const r = PL_TEST.rects().rects.leave; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 })); });
    await sleep(200); await shot('pauseConfirm'); await check('pauseConfirm');
    await ev(() => { const r = PL_TEST.rects().rects.stay; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 })); });
    await ev(() => { const r = PL_TEST.rects().rects.settings; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 })); });
    await sleep(250); await shot('settings'); await check('settings');
    await ev(() => PL_TEST.setScroll(1000)); await sleep(150); await shot('settingsScrolled'); await check('settingsScrolled');
    await ev(() => PL_TEST.go('tweak')); await sleep(200); await shot('tweak'); await check('tweak');
    // open the Physics group and change one value: DEV badge + changed row
    await ev(() => { PL.Tweak.set('G', 1700); });
    await ev(() => { const rows = PL_TEST.tweakRows(), i = rows.findIndex((r) => r.kind === 'head' && r.group === 'Physics'); const r = PL_TEST.layout('tweak').rects['t' + i]; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 20 })); });
    await sleep(200); await shot('tweakOpen'); await check('tweakOpen');
    await ev(() => { PL_TEST.go('play'); }); await ev(() => { PL_TEST.startMode('short', 7); }); await sleep(500); await shot('playDev'); await check('playDev');
    // shaft complete (tuned -> "not saved"), then untuned with a medal
    await ev(() => { for (let i = 0; i < 6 && !PL_TEST.isComplete(); i++) { PL_TEST.winRoom(); PL_TEST.advance(); } });
    await sleep(700); await shot('shaftCompleteTuned'); await check('shaftCompleteTuned');
    await ev(() => { PL.Tweak.resetAll(); PL_TEST.startMode('short', 7); for (let i = 0; i < 6 && !PL_TEST.isComplete(); i++) { PL_TEST.tick(20); PL_TEST.winRoom(); PL_TEST.advance(); } });
    await sleep(700); await shot('shaftComplete'); await check('shaftComplete');
    // settings reset-bests confirm
    await ev(() => { PL_TEST.menu(); }); await ev(() => { PL_TEST.go('settings'); });
    await ev(() => PL_TEST.setScroll(1000)); await sleep(100);
    await ev(() => { const r = PL_TEST.rects().rects.reset; const c = document.querySelector('canvas'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 20 })); });
    await sleep(200); await shot('confirmReset'); await check('confirmReset');
    // left hand + text 1.3 on play
    await ev(() => { PL.Input.setHand('left'); }); await ev(() => { PL_TEST.go('menu'); PL_TEST.startMode('long', 7); }); await sleep(500);
    await shot('playLeft'); await check('playLeft');
    await ev(() => { PL.Input.setHand('right'); });
    if (errs.length) problems.push(`${W}x${H} page errors: ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log('flow-shots: ' + n + ' png in ' + OUT);
  console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'layout check: no overlaps, no target < 56 px');
  process.exit(problems.length ? 1 : 0);
});
