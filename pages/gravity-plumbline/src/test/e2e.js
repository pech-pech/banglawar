// node e2e.js : playwright end-to-end on built index.html (menu build)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, port, W, H, ctxOpts, url) {
  const context = ctxOpts && ctxOpts.context || await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (!(ctxOpts && ctxOpts.context)) await context.addInitScript(() => {
    window.__copied = null; window.__txt = [];
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {}
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (window.__txt.length < 4000) window.__txt.push(String(t)); return ft.apply(this, arguments); };
  });
  const page = await context.newPage();
  const errs = [], dialogs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('dialog', d => { dialogs.push(d.type()); d.dismiss(); });
  await page.goto(`http://127.0.0.1:${port}/index.html${url || '?seed=1'}`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene, null, { timeout: 5000 });
  await sleep(250);
  const H_ = {
    page, context, errs, dialogs, W, H,
    ptr: (type, x, y, id = 1) => page.evaluate(([type, x, y, id]) => {
      const el = document.elementFromPoint(x, y) || document.querySelector('canvas');
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
    }, [type, x, y, id]),
    st: () => page.evaluate(() => { const s = PL_TEST.getState(); return { g: s.g, flips: s.flips, t: s.t, diveCd: s.diveCd, vx: s.vx, vy: s.vy }; }),
    scene: () => page.evaluate(() => PL_TEST.scene()),
    view: () => ({ W, H, dpr: 1, inset: { t: 0, r: 0, b: 0, l: 0 } }),
  };
  H_.swipe = async (x, y, dx, dy) => { await H_.ptr('pointerdown', x, y); for (let i = 1; i <= 6; i++) { await H_.ptr('pointermove', x + dx * i / 6, y + dy * i / 6); await sleep(10); } await H_.ptr('pointerup', x + dx, y + dy); await sleep(120); };
  H_.tap = async (x, y) => { await H_.ptr('pointerdown', x, y); await sleep(50); await H_.ptr('pointerup', x, y); await sleep(150); };
  H_.hold = async (x, y, ms) => { await H_.ptr('pointerdown', x, y, 9); await sleep(ms); await H_.ptr('pointerup', x, y, 9); await sleep(150); };
  H_.menuRects = () => page.evaluate(v => PL.menuLayout(v, [{ id: 'tutorial' }, { id: 'daily' }, { id: 'seed' }, { id: 'best' }]).map(i => ({ id: i.id, ...i.rect })), H_.view());
  H_.menuTap = async id => { const r = (await H_.menuRects()).find(i => i.id === id); await H_.tap(r.x + r.w / 2, r.y + r.h / 2); };
  H_.btn = name => page.evaluate(([v, n]) => { const r = PL.BTN[n](v); return Array.isArray(r) ? { x: r[0], y: r[1], w: r[2], h: r[3] } : r; }, [H_.view(), name]);
  H_.btnClick = async name => { const r = await H_.btn(name); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await sleep(300); };
  H_.ls = k => page.evaluate(k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, k);
  // clear tutorial seed 1. realRoom1: real solver inputs (flip right @0, dive @1, flip down @20); other rooms teleported to exit.
  H_.clearTutorial = (real) => page.evaluate(real => {
    PL_TEST.startMode('tutorial', 1);
    if (real) { PL_TEST.inject([{ k: 'flip', dir: 1 }]); PL_TEST.tick(1); PL_TEST.inject([{ k: 'dive' }]); PL_TEST.tick(19); PL_TEST.inject([{ k: 'flip', dir: 2 }]); PL_TEST.tick(400); }
    const out = { real: real, reportAfterR1: real ? PL_TEST.report() : null, solved: real ? PL_TEST.attempts().some(a => a.room === 1 && a.result === 'win') : null };
    for (let i = 0; i < 3 && !PL_TEST.isComplete(); i++) {
      const s = PL_TEST.getState();
      if (!s.won) { s.x = s.room.exit.x; s.y = s.room.exit.y; }
      PL_TEST.tick(1); PL_TEST.tick(80);
    }
    out.complete = PL_TEST.isComplete(); out.report = PL_TEST.report(); return out;
  }, real);
  return H_;
}

async function suite(browser, port, W, H) {
  const tag = W + 'x' + H;
  const stripY = Math.round(H * 0.8), topY = Math.round(H * 0.3), cx = Math.round(W / 2);
  // ---- A: menu + input ----
  let h = await open(browser, port, W, H);
  ok(await h.scene() === 'menu', `${tag} boots to menu`);
  await h.page.screenshot({ path: `/tmp/pl-shots/menu-${tag}.png` });
  const rects = await h.menuRects();
  ok(rects.length === 4 && rects.every(r => r.h >= 56 && r.w >= 56 && r.x >= 0 && r.x + r.w <= W && r.y + r.h <= H), `${tag} menu buttons >= 56px and on screen (${rects.map(r => Math.round(r.w) + 'x' + Math.round(r.h)).join(' ')})`);
  await h.menuTap('tutorial');
  ok(await h.scene() === 'play', `${tag} Tutorial reachable by tap`);
  await sleep(300);
  let a = await h.st();
  await h.swipe(cx, stripY, 90, 0);
  let b = await h.st();
  ok(b.g === 1 && b.flips > a.flips, `${tag} swipe in strip flips gravity (g=${b.g})`);
  await h.page.screenshot({ path: `/tmp/pl-shots/mid-${tag}.png` });
  await h.page.evaluate(() => PL_TEST.room(1)); await sleep(200); a = await h.st();
  await h.swipe(cx, topY, 90, 0); b = await h.st();
  ok(b.g === a.g && b.flips === a.flips, `${tag} swipe in top 60% does NOT flip`);
  await h.page.evaluate(() => PL_TEST.room(1)); await sleep(200); a = await h.st();
  await h.tap(cx, stripY); b = await h.st();
  ok(b.diveCd > 0 || b.vy !== a.vy || b.vx !== a.vx, `${tag} tap dives (diveCd=${b.diveCd})`);
  // copy button + determinism after really clearing room 1
  const rc = await h.clearTutorial(true);
  ok(rc.solved, `${tag} room 1 cleared with real inputs (flip1@0, dive@1, flip2@20)`);
  ok(/determinism OK/.test(rc.reportAfterR1 || ''), `${tag} report after cleared room 1 has 'determinism OK'`);
  ok(rc.complete, `${tag} complete screen reached`);
  ok(/medal/.test(rc.report) && /determinism (OK|FAIL)/.test(rc.report), `${tag} report has medal line (${(rc.report.match(/result:.*/) || [''])[0]})`);
  const cb = await h.btn('copy');
  ok(Math.round(cb.w) === 56 && Math.round(cb.h) === 56, `${tag} Copy button 56x56`);
  await h.btnClick('copy');
  const copied = await h.page.evaluate(() => window.__copied);
  ok(!!copied && /input log|tick/i.test(copied), `${tag} Copy click yields report with input log`);
  ok(/WebGPU output: NOT seen/.test(copied || ''), `${tag} report WebGPU line`);
  if (copied) fs.writeFileSync(`/tmp/pl-shots/report-${tag}.txt`, copied);
  await h.page.screenshot({ path: `/tmp/pl-shots/complete-${tag}.png` });
  // menu from complete: Daily + Seed overlay
  await h.page.evaluate(() => PL_TEST.menu());
  await h.menuTap('daily');
  ok(await h.scene() === 'play' && await h.page.evaluate(() => PL_TEST.getRunStats && PL_TEST.getState().room !== undefined), `${tag} Daily reachable`);
  await h.page.evaluate(() => PL_TEST.menu());
  await h.menuTap('seed'); await sleep(300);
  const inp = await h.page.$('input');
  ok(!!inp, `${tag} Seed overlay opens with input`);
  if (inp) {
    await inp.fill(''); await h.page.keyboard.type('a4b2c'); 
    ok(await inp.inputValue() === '42', `${tag} seed input digits only (got '${await inp.inputValue()}')`);
    const bs = await h.page.$$eval('button', bs => bs.filter(b => b.offsetParent).map(b => [b.textContent, b.getBoundingClientRect().width, b.getBoundingClientRect().height]));
    ok(bs.length >= 2 && bs.every(x => x[2] >= 56), `${tag} overlay buttons >= 56px tall (${bs.map(x => x[0] + ':' + Math.round(x[2])).join(',')})`);
    await h.page.screenshot({ path: `/tmp/pl-shots/seed-${tag}.png` });
    await h.page.click('text=Start'); await sleep(300);
    ok(await h.scene() === 'play', `${tag} Seed overlay Start begins run`);
  }
  ok(h.dialogs.length === 0, `${tag} no dialogs (${h.dialogs})`);
  ok(h.errs.length === 0, `${tag} no console errors ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();

  // ---- B: tuning long-press, tuned run not saved ----
  h = await open(browser, port, W, H);
  await h.menuTap('tutorial'); await sleep(200);
  await h.hold(20, 20, 1000);
  const wasOpen = await h.page.evaluate(() => PL_TEST.tuning()); // toggles: returns new state
  ok(wasOpen === false, `${tag} long-press top-left opens tuning panel`);
  await h.page.evaluate(() => PL_TEST.tuning());           // reopen
  const plus = await h.page.evaluate(v => { const l = PL.tuningLayout(v, [{ id: 'G', label: 'Gravity', value: PL.C.G }, { id: 'CAP', label: 'Speed cap', value: PL.C.CAP }, { id: 'CHARGES', label: 'Charges', value: PL.C.CHARGES }]); const r = l[0].plus; return Array.isArray(r) ? { x: r[0], y: r[1], w: r[2], h: r[3] } : r; }, h.view());
  await h.page.screenshot({ path: `/tmp/pl-shots/tuning-${tag}.png` });
  await h.tap(plus.x + plus.w / 2, plus.y + plus.h / 2);
  ok(await h.page.evaluate(() => PL_TEST.getRunStats().tuned), `${tag} tuning tap marks run tuned`);
  await h.page.evaluate(() => PL_TEST.tuning());           // close
  const tr = await h.page.evaluate(() => {
    for (let i = 0; i < 3 && !PL_TEST.isComplete(); i++) { const s = PL_TEST.getState(); if (!s.won) { s.x = s.room.exit.x; s.y = s.room.exit.y; } PL_TEST.tick(1); PL_TEST.tick(80); }
    return { complete: PL_TEST.isComplete(), report: PL_TEST.report() };
  });
  ok(tr.complete, `${tag} tuned run completes`);
  const lsT = await h.ls('plumbline.v1');
  ok(!lsT || !/ticks/.test(lsT), `${tag} tuned run NOT saved to localStorage best (${lsT})`);
  await h.context.close();

  // ---- C: untuned best persists; mute persists ----
  h = await open(browser, port, W, H);
  await h.menuTap('tutorial'); await sleep(200);
  await h.clearTutorial(true);
  const lsC = await h.ls('plumbline.v1');
  ok(!!lsC && /ticks/.test(lsC), `${tag} untuned clear saves best (${lsC})`);
  await h.page.evaluate(() => PL_TEST.menu());
  await h.menuTap('tutorial'); await sleep(100);
  await h.page.evaluate(() => PL_TEST.menu());
  await h.page.reload(); await h.page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene); await sleep(300);
  await h.page.evaluate(() => { window.__txt = []; });
  await h.menuTap('best'); await sleep(300);
  const txt = (await h.page.evaluate(() => window.__txt)).join(' | ');
  ok(/Tutorial: [\d.]+s/.test(txt), `${tag} best shown on next load (${(txt.match(/Tutorial: [^|]*/) || ['none'])[0]})`);
  await h.page.screenshot({ path: `/tmp/pl-shots/best-${tag}.png` });
  // mute
  await h.menuTap('tutorial'); await sleep(200);
  const before = await h.ls('plumbline.mute');
  await h.btnClick('snd');
  const after = await h.ls('plumbline.mute');
  ok(before !== after && after === '1', `${tag} mute toggle writes localStorage (${before}->${after})`);
  await h.page.reload(); await h.page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene); await sleep(200);
  await h.menuTap('tutorial'); await sleep(400);
  const txt2 = (await h.page.evaluate(() => window.__txt)).join(' | ');
  ok(/Muted/.test(txt2) && await h.ls('plumbline.mute') === '1', `${tag} mute persists after reload (HUD shows Muted)`);
  ok(h.errs.length === 0, `${tag} no console errors (C) ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();
}
(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.log('FAIL index.html missing'); process.exit(2); }
  fs.mkdirSync('/tmp/pl-shots', { recursive: true });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  for (const [w, h] of [[344, 882], [475, 638]]) {
    try { await suite(browser, port, w, h); } catch (e) { fails.push('exception ' + e.message); console.log('FAIL exception', e.stack); }
  }
  await browser.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
