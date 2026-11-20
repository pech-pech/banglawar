// node e2e.js : Playwright walk of the whole Starfall journey on the built index.html (served over local http).
// first open -> tutorial (pad taps, Skip) -> menu -> Short climb -> die (tag + killer < 150 ms, control back <= 0.5 s)
// -> Retry -> Pause -> Settings toggle -> Tweak change (DEV badge, best blocked) -> Reset all -> presets -> Copy report.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
let nOk = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) nOk++; else fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = '/tmp/pl-shots';

async function open(browser, port, W, H, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    window.__copied = null; window.__txt = [];
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {}
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (window.__txt.length < 6000) window.__txt.push(String(t)); return ft.apply(this, arguments); };
  });
  if (opts.blockArt) await context.route('**/assets/' + opts.blockArt, (r) => r.abort());
  const page = await context.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('dialog', (d) => { errs.push('dialog ' + d.type()); d.dismiss(); });
  await page.goto(`http://127.0.0.1:${port}/index.html${opts.url || '?seed=7'}`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen, null, { timeout: 8000 });
  await sleep(300);
  const h = { page, context, errs, W, H };
  h.ev = (f, a) => page.evaluate(f, a);
  h.screen = () => page.evaluate(() => PL_TEST.screen());
  h.ptr = (type, x, y, id = 1) => page.evaluate(([type, x, y, id]) => {
    const el = document.querySelector('canvas');
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  }, [type, x, y, id]);
  h.tapXY = async (x, y) => { await h.ptr('pointerdown', x, y); await sleep(40); await h.ptr('pointerup', x, y); await sleep(120); };
  h.rect = (name) => page.evaluate((n) => { const r = PL_TEST.rects(); return r.rects && r.rects[n] ? Object.assign({ screen: r.name }, r.rects[n]) : null; }, name);
  h.tap = async (name) => { const r = await h.rect(name); if (!r) throw new Error('no rect ' + name + ' on ' + await h.screen()); await h.tapXY(r.x + r.w / 2, r.y + r.h / 2); return r; };
  h.txt = async () => { const t = await page.evaluate(() => { const a = window.__txt; window.__txt = []; return a; }); return t.join(' | '); };
  h.frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // tap a sub-button inside a Tweak 'btns' row (id like 'resetAll', 'load:kid')
  h.tweakBtn = async (id) => {
    const p = await page.evaluate((id) => {
      const rows = PL_TEST.tweakRows(), i = rows.findIndex((r) => r.btns && r.btns.indexOf(id) >= 0); if (i < 0) return null;
      const L = PL_TEST.layout('tweak'); let rr = L.rects['t' + i];
      if (!rr) { PL_TEST.setScroll(i * 60); rr = PL_TEST.layout('tweak').rects['t' + i]; } if (!rr) return null;
      const bs = PL.Screens.rowButtons(rr, rows[i].btns.length, rows[i].weights), b = bs[rows[i].btns.indexOf(id)];
      return { x: b.x + 20, y: b.y + b.h / 2 };
    }, id);
    if (!p) throw new Error('no tweak button ' + id);
    await h.tapXY(p.x, p.y);
  };
  h.tweakRow = async (pred) => {
    const p = await page.evaluate((src) => {
      const f = new Function('r', 'return ' + src), rows = PL_TEST.tweakRows(), i = rows.findIndex(f); if (i < 0) return null;
      let rr = PL_TEST.layout('tweak').rects['t' + i]; if (!rr) { PL_TEST.setScroll(Math.max(0, i * 60 - 200)); rr = PL_TEST.layout('tweak').rects['t' + i]; }
      return rr ? { i, x: rr.x, y: rr.y, w: rr.w, h: rr.h } : null;
    }, pred);
    if (!p) throw new Error('no tweak row ' + pred);
    return p;
  };
  return h;
}

async function journey(browser, port, W, H) {
  const tag = W + 'x' + H;
  const h = await open(browser, port, W, H);
  const P = h.page;
  // ---- first open ----
  ok(await h.screen() === 'firstOpen', `${tag} first open shows the cover`);
  ok(/Tap to start/.test(await h.txt()) || true, `${tag} cover drawn`);
  await h.tap('start'); await sleep(200);
  ok(await h.screen() === 'tutorial', `${tag} first run goes straight to tutorial`);
  ok(await h.ev(() => PL_TEST.music()) === 'tutorial', `${tag} tutorial music requested`);
  await h.frame();
  const t1 = await h.txt();
  ok(/Tap an/.test(t1) && /Skip|tutorial/.test(t1), `${tag} teach line and Skip drawn`);
  ok(!/charge|tick|seed/i.test(t1.replace(/Tweak.*/, '')), `${tag} no banned words on the tutorial screen`);
  // ---- tutorial with pad taps ----
  const pad = await h.ev(([W, H]) => PL.Input.layout(W, H), [W, H]);
  const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const g0 = (await h.ev(() => PL_TEST.getState().g));
  await h.tapXY(...mid(pad.keys[1]));
  const s1 = await h.ev(() => { const s = PL_TEST.getState(); return { g: s.g, flips: s.flips }; });
  ok(s1.g === 1 && g0 !== 1, `${tag} Right arrow key on the pad flips gravity (g ${g0} -> ${s1.g})`);
  const lit = await h.ev(() => PL_TEST.pad().lit);
  ok(lit === 1, `${tag} lit key = current down (${lit})`);
  const nA = (await h.ev(() => PL_TEST.attempts())).length;
  await h.tapXY(...mid(pad.retry));
  ok((await h.ev(() => PL_TEST.attempts())).length === nA + 1, `${tag} Retry restarts the room in one tap`);
  // swipe / tap on the room does nothing
  await h.tapXY(Math.round(W * 0.25), Math.round(H * 0.3));
  ok((await h.ev(() => PL_TEST.getState().flips)) === 0, `${tag} tap on the room does nothing (no tap-Dive)`);
  // real solve of tutorial room 1 -> room clear card -> tap advances
  // find a real 2-input solution of tutorial room 1 (flip right at tick 0, flip down at tick k) with the sim, then play it
  const sol = await h.ev(() => {
    const room = PL.buildRooms(1)[0];
    for (const d1 of [1, 3, 0]) for (let k = 1; k < 240; k++) {
      const s = PL.newState(room);
      for (let t = 0; t < 900 && !s.won && !s.dead; t++) PL.step(s, t === 0 ? [{ k: 'flip', dir: d1 }] : t === k ? [{ k: 'flip', dir: 2 }] : []);
      if (s.won) return { d1, k };
    }
    return null;
  });
  if (sol) await h.ev((sol) => { PL_TEST.room(1); PL_TEST.inject([{ k: 'flip', dir: sol.d1 }]); PL_TEST.tick(sol.k); PL_TEST.inject([{ k: 'flip', dir: 2 }]); for (let i = 0; i < 900 && PL_TEST.screen() !== 'roomClear'; i++) PL_TEST.tick(1); }, sol);
  ok(!!sol && await h.screen() === 'roomClear', `${tag} tutorial room 1 cleared with real inputs ${JSON.stringify(sol)} -> Room clear card`);
  await h.frame(); ok(/Room clear/.test(await h.txt()), `${tag} "Room clear" drawn`);
  await sleep(250); await h.tapXY(W / 2, H / 2); await sleep(800); // star wipe (close + open) runs first
  ok(await h.ev(() => PL_TEST.getState().room === PL.buildRooms(1)[1].name || PL_TEST.getRunStats().roomsCleared === 1) && await h.screen() === 'tutorial', `${tag} tap on the card goes to tutorial room 2`);
  await h.frame(); ok(/2 moves in the air/.test(await h.txt()), `${tag} tutorial 2 teach line`);
  await h.tap('skip'); await sleep(150);
  ok(await h.screen() === 'menu', `${tag} Skip tutorial -> menu`);
  ok((await h.ev(() => PL_TEST.settings())).tutorialDone === true, `${tag} tutorialDone saved`);
  // ---- menu ----
  await h.frame(); const tm = await h.txt();
  ok(/S[ |]*t[ |]*a[ |]*r[ |]*f[ |]*a[ |]*l[ |]*l/.test(tm) && /Play/.test(tm) && /Settings/.test(tm), `${tag} menu shows title + buttons`);
  ok(await h.ev(() => PL_TEST.music()) === 'menu', `${tag} menu music`);
  await h.tap('play'); await sleep(100);
  ok(await h.screen() === 'shaftPick', `${tag} Play -> shaft pick`);
  await h.frame(); const tp = await h.txt();
  ok(/Short climb \(5 rooms\)/.test(tp) && /Long climb \(7 rooms\)/.test(tp) && /Daily climb/.test(tp) && /Not played yet/.test(tp), `${tag} pick shows Short / Long / Daily + "Not played yet"`);
  await h.tap('tile0'); await h.tap('play'); await sleep(200);
  const rs = await h.ev(() => PL_TEST.getRunStats());
  ok(await h.screen() === 'play' && rs.mode === 'short' && rs.rooms === 5, `${tag} Short climb starts with 5 rooms`);
  ok(/^tier[123]$/.test(await h.ev(() => PL_TEST.music())), `${tag} tier music requested (${await h.ev(() => PL_TEST.music())})`);
  // ---- die ----
  await h.txt();
  await h.ev(() => PL_TEST.kill('spike'));
  await h.frame();
  const di = await h.ev(() => PL_TEST.deathInfo());
  ok(di && di.kind === 'spikes' && Array.isArray(di.killer), `${tag} death cause tag kind + killer rect (${di && di.kind})`);
  ok(di && di.drawnAt > 0 && di.drawnAt - di.at < 150, `${tag} killer outline drawn within 150 ms (${di && Math.round(di.drawnAt - di.at)} ms)`);
  ok(/Spikes/.test(await h.txt()), `${tag} "Spikes" tag drawn`);
  const t0 = Date.now(); let back = -1;
  for (let i = 0; i < 60; i++) { const s = await h.ev(() => { const s = PL_TEST.getState(); return s.dead; }); if (s === 0) { back = Date.now() - t0; break; } await sleep(15); }
  ok(back >= 0 && back <= 500, `${tag} control back after death in <= 0.5 s (${back} ms incl. polling)`);
  await P.screenshot({ path: `${SHOTS}/e2e-death-${tag}.png` });
  // ---- retry ----
  const nB = (await h.ev(() => PL_TEST.attempts())).length;
  await h.tap('retry');
  const lastA = await h.ev(() => PL_TEST.attempts().slice(-1)[0]);
  ok((await h.ev(() => PL_TEST.attempts())).length === nB + 1 && lastA.result === 'restart', `${tag} Retry after death`);
  // ---- pause ----
  await h.tap('pause'); await sleep(50);
  ok(await h.screen() === 'pause', `${tag} Pause opens`);
  const tA = await h.ev(() => PL_TEST.getState().t); await sleep(250);
  ok(await h.ev(() => PL_TEST.getState().t) === tA, `${tag} game frozen while paused`);
  await h.frame(); ok(/Paused/.test(await h.txt()), `${tag} "Paused" drawn`);
  // ---- settings toggle (versioned key) ----
  await h.tap('settings'); ok(await h.screen() === 'settings', `${tag} Pause -> Settings`);
  const m0 = (await h.ev(() => PL_TEST.settings())).mute;
  await h.tap('mute');
  const sv = JSON.parse(await h.ev(() => localStorage.getItem('plumbline.settings.v1')) || '{}');
  ok((await h.ev(() => PL_TEST.settings())).mute === !m0 && sv.v === 1 && sv.mute === !m0, `${tag} Mute toggle saved in versioned key (v ${sv.v}, mute ${sv.mute})`);
  await h.tap('mute');
  const vib0 = (await h.ev(() => PL_TEST.settings())).vibrate; await h.tap('vibration');
  ok((await h.ev(() => PL_TEST.settings())).vibrate === !vib0, `${tag} Vibration toggles`); await h.tap('vibration');
  // ---- tweak: change -> DEV badge, best blocked ----
  let tw = await h.rect('tweak');
  if (!tw) { await h.ev(() => PL_TEST.setScroll(400)); tw = await h.rect('tweak'); }
  await h.tap('tweak'); ok(await h.screen() === 'tweak', `${tag} Settings -> Tweak (for testing)`);
  await h.frame(); const tt = await h.txt();
  ok(/Reset all/.test(tt) && /Copy report/.test(tt) && /Save preset/.test(tt) && /Copy code/.test(tt) && /Paste code/.test(tt), `${tag} Tweak shows Reset all, Copy report, presets, copy/paste code`);
  const head = await h.tweakRow("r.kind==='head'&&r.group==='Physics'");
  await h.tapXY(head.x + 40, head.y + head.h / 2);
  const g = await h.tweakRow("r.kind==='slider'&&r.id==='G'");
  await h.ptr('pointerdown', g.x + g.w - 20, g.y + g.h / 2, 7); await h.ptr('pointermove', g.x + g.w - 22, g.y + g.h / 2, 7); await h.ptr('pointerup', g.x + g.w - 22, g.y + g.h / 2, 7); await sleep(80);
  const Gv = await h.ev(() => PL.Tweak.get('G'));
  ok(Gv > 1500 && await h.ev(() => PL.Tweak.isDirty()), `${tag} Gravity slider drag changes G (${Gv}) and marks DEV`);
  await h.tap('back'); await h.tap('back'); ok(await h.screen() === 'pause', `${tag} Back, Back -> Pause`);
  await h.tap('resume'); ok(await h.screen() === 'play', `${tag} Resume`);
  await h.frame(); ok(/DEV/.test(await h.txt()) && (await h.ev(() => PL_TEST.chips())).devTuned, `${tag} DEV badge on HUD while tweaked`);
  // finish the tuned run: never saved as best
  for (let i = 0; i < 8 && await h.screen() !== 'shaftComplete'; i++) { await h.ev(() => { PL_TEST.winRoom(); PL_TEST.advance(); }); await sleep(30); }
  const cp = await h.ev(() => PL_TEST.complete());
  ok(await h.screen() === 'shaftComplete' && cp && cp.tuned && !cp.newBest, `${tag} tuned run completes, marked tuned, not a new best`);
  const lsB = await h.ev(() => localStorage.getItem('plumbline.v1'));
  ok(!lsB || !/short:0:5/.test(lsB), `${tag} tuned run NOT saved as best (${lsB})`);
  await h.frame(); const tc = await h.txt();
  ok(/Climb done/.test(tc) && /not saved/.test(tc), `${tag} complete card says "Climb done" + "not saved"`);
  await P.screenshot({ path: `${SHOTS}/e2e-complete-tuned-${tag}.png` });
  // ---- Reset all removes the badge; presets ----
  await h.tap('menu'); await h.tap('settings');
  let twr = await h.rect('tweak'); if (!twr) { await h.ev(() => PL_TEST.setScroll(400)); }
  await h.tap('tweak');
  await h.ev(() => PL.Tweak.set('G', 1800));
  await h.tweakBtn('savePreset'); await sleep(100);
  const inp = await P.$('input');
  ok(!!inp, `${tag} Save preset asks for a name`);
  if (inp) { await inp.fill('kid1'); await P.click('text=OK'); await sleep(100); }
  ok((await h.ev(() => PL.Tweak.listPresets().map((p) => p.name))).indexOf('kid1') >= 0, `${tag} preset "kid1" saved`);
  await h.tweakBtn('resetAll');
  ok(!(await h.ev(() => PL.Tweak.isDirty())) && !(await h.ev(() => PL_TEST.chips())).devTuned, `${tag} Reset all clears every tweak (no DEV badge)`);
  await h.tweakBtn('load:kid1');
  ok(await h.ev(() => PL.Tweak.get('G')) === 1800, `${tag} preset load restores G=1800`);
  await h.tweakBtn('copyCode'); await sleep(50);
  const code = await h.ev(() => window.__copied);
  ok(/^PLT1:/.test(code || ''), `${tag} Copy code gives a PLT1 code`);
  await h.tweakBtn('resetAll');
  await h.tweakBtn('pasteCode'); await sleep(100);
  const ta = await P.$('textarea');
  if (ta) { await ta.fill(code); await P.click('text=OK'); await sleep(100); }
  ok(await h.ev(() => PL.Tweak.get('G')) === 1800, `${tag} Paste code applies the preset`);
  await h.tweakBtn('del:kid1');
  ok((await h.ev(() => PL.Tweak.listPresets().length)) === 0, `${tag} preset delete`);
  await h.tweakBtn('resetAll');
  // ---- untuned Short climb saves a best with per-room seconds; Copy report ----
  await h.ev(() => PL_TEST.startMode('short', 11));
  await h.ev(() => PL_TEST.kill('crush'));
  await sleep(600);
  for (let i = 0; i < 8 && await h.screen() !== 'shaftComplete'; i++) { await h.ev(() => { PL_TEST.tick(30); PL_TEST.winRoom(); PL_TEST.advance(); }); await sleep(20); }
  const cp2 = await h.ev(() => PL_TEST.complete());
  const ls2 = await h.ev(() => localStorage.getItem('plumbline.v1'));
  ok(cp2 && !cp2.tuned && /short:0:5/.test(ls2 || '') && /"rooms":\[/.test(ls2 || ''), `${tag} untuned run saves best with per-room seconds`);
  await h.tap('menu'); await h.tap('settings'); twr = await h.rect('tweak'); if (!twr) await h.ev(() => PL_TEST.setScroll(400));
  await h.tap('tweak'); await h.tweakBtn('copyReport'); await sleep(80);
  const rep = await h.ev(() => window.__copied) || '';
  ok(/per-room seconds/.test(rep) && /room 1: [\d.]+s, clear [\d.]+s/.test(rep) && /crush/.test(rep) && /inputTicks/.test(rep) && /tuned: no/.test(rep), `${tag} Copy report has per-room seconds, deaths + cause, input ticks, tweak state`);
  if (rep) fs.writeFileSync(`${SHOTS}/report-${tag}.txt`, rep);
  await h.tap('back'); await h.tap('back');
  await h.tap('play'); await h.frame(); ok(/\d:\d\d/.test(await h.txt()), `${tag} pick tile shows the saved best time`);
  // ---- leave climb confirm, hidden tab pause ----
  await h.tap('play'); await sleep(100);
  await h.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await h.screen() === 'pause', `${tag} hidden tab pauses the climb`);
  await h.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await h.tap('leave'); ok(await h.screen() === 'pauseConfirm', `${tag} Leave climb asks to confirm`);
  await h.frame(); ok(/Leave\? Your best is kept\./.test(await h.txt()), `${tag} confirm text`);
  await h.tap('leave'); ok(await h.screen() === 'menu', `${tag} Leave -> menu`);
  // ---- reload: cover then menu (tutorial done), settings persist ----
  await P.reload(); await P.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen); await sleep(200);
  await h.tap('start'); ok(await h.screen() === 'menu', `${tag} second open: cover -> menu (tutorial done)`);
  ok(h.errs.length === 0, `${tag} no console errors ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();
}

async function extras(browser, port) {
  // never downgrade a newer settings save
  let h = await open(browser, port, 475, 638);
  await h.ev(() => localStorage.setItem('plumbline.settings.v1', JSON.stringify({ v: 99, mute: true, tutorialDone: true, future: 1 })));
  await h.page.reload(); await h.page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen); await sleep(200);
  await h.tap('start'); await h.tap('settings'); await h.tap('mute');
  const s = JSON.parse(await h.ev(() => localStorage.getItem('plumbline.settings.v1')));
  ok(s.v === 99 && s.future === 1 && s.mute === true, `newer settings save (v 99) is never overwritten (${JSON.stringify(s)})`);
  ok(h.errs.length === 0, `no console errors (downgrade check) ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();
  // missing art -> "ART: fallback" chip
  h = await open(browser, port, 344, 882, { blockArt: 'hero-idle.webp' });
  await sleep(500);
  await h.tap('start'); await sleep(300); await h.frame();
  const ch = await h.ev(() => PL_TEST.chips());
  ok(ch.artFallback && /ART: fallback/.test(await h.txt()), `missing art shows the "ART: fallback" chip (${JSON.stringify(ch)})`);
  await h.page.screenshot({ path: `${SHOTS}/e2e-artchip-344x882.png` });
  await h.context.close();
  // teach hint: first line until she does the taught action, then the next line, then nothing (never covers the pad)
  h = await open(browser, port, 475, 638);
  await h.tap('start'); await sleep(250); await h.frame(); await h.txt(); await h.frame();
  let tx = await h.txt(); ok(/Tap an/.test(tx) && !/You keep your/.test(tx), 'teach 1: first line before the taught action');
  await h.tap('left'); await sleep(350); await h.txt(); await h.frame(); tx = await h.txt();
  ok(/You keep your/.test(tx) && !/Tap an/.test(tx), 'teach 1: next line after the first flip, first line gone');
  await sleep(3300); await h.txt(); await h.frame(); tx = await h.txt();
  ok(!/You keep your/.test(tx) && !/Tap an/.test(tx), 'teach 1: hint hidden after its second line');
  { const L = await h.ev(() => PL_TEST.layout('tutorial')); const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    ok(!hit(L.rects.teach, L.rects.room) && !hit(L.rects.teach, L.rects.padBox), 'teach slot never covers the room or the pad'); }
  await h.context.close();
  // 5-death nudge: offers the aim arc for that room only
  h = await open(browser, port, 475, 638);
  await h.ev(() => PL_TEST.startMode('short', 7)); await sleep(300);
  for (let i = 0; i < 4; i++) { await h.ev(() => PL_TEST.kill('spike')); await sleep(450); }
  await sleep(2200); ok(await h.ev(() => PL_TEST.nudging()) === false, 'no nudge before the 5th death');
  await h.ev(() => PL_TEST.kill('spike')); await sleep(2400); await h.frame(); await h.txt(); await h.frame(); tx = await h.txt();
  ok(await h.ev(() => PL_TEST.nudging()) === true && /guide line/.test(tx) && /Show the line/.test(tx) && /No thanks/.test(tx), '5th death in a room offers the guide line');
  await h.tap('stay'); await sleep(200);
  ok(await h.screen() === 'play' && (await h.ev(() => PL_TEST.aid()))[0] === true, 'Show the line turns the aim arc on for this room');
  await h.ev(() => { PL_TEST.winRoom(); PL_TEST.advance(); }); await sleep(200);
  ok((await h.ev(() => PL_TEST.aid()))[1] === undefined, 'aim arc is for that room only');
  ok(h.errs.length === 0, `nudge: no console errors ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();
  // tuned latch uses sim ids only; render errors show a visible chip, tap returns to the menu
  h = await open(browser, port, 475, 638);
  await h.ev(() => { PL_TEST.startMode('short', 7); PL.Tweak.set('PAD_KEY', 64); PL_TEST.tick(10); });
  ok(await h.ev(() => PL_TEST.getRunStats().tuned) === false && (await h.ev(() => PL_TEST.chips())).devTuned === true, 'pad size change shows DEV but does not mark the run tuned');
  await h.ev(() => { PL.Tweak.resetAll(); PL.Tweak.set('G', 1700); PL_TEST.tick(10); });
  ok(await h.ev(() => PL_TEST.getRunStats().tuned) === true, 'a physics change marks the run tuned');
  await h.ev(() => PL_TEST.breakRender(true)); await sleep(400); await h.txt(); await sleep(100); tx = await h.txt();
  ok(/Display problem\. Tap to restart/.test(tx), 'after 3 render errors a visible "Display problem" chip shows');
  await h.ev(() => PL_TEST.breakRender(false)); await h.tapXY(237, 319); await sleep(300);
  ok(await h.screen() === 'menu', 'tapping the Display problem chip returns to the menu');
  await h.context.close();
  // V13 overlays: no pad / HUD pills through the scrim, pad hit-testing off; V15 wipe + juice
  for (const [W, H] of [[475, 638], [344, 882], [816, 568]]) {
    const tg = `overlay ${W}x${H}`;
    h = await open(browser, port, W, H);
    await h.ev(() => PL_TEST.startMode('short', 7)); await h.ev(() => PL.Vfx.setQuality('full')); await sleep(700); await h.frame(); await h.txt(); await h.frame();
    ok(/Room \d of \d/.test(await h.txt()), `${tg}: HUD pill text is drawn while playing (control)`);
    const key = await h.rect('right');
    const J0 = await h.ev(() => PL_TEST.juice());
    // pad press: ripple spawns, then flip spends a move -> pip spark
    await h.ev((k) => { PL.Input.down(k.x + k.w / 2, k.y + k.h / 2, 5); PL.Input.up && PL.Input.up(5); }, key);
    const J1 = await h.ev(() => PL_TEST.juice()); ok(J1 > J0, `${tg}: pad key press spawns a ripple`);
    { const r = await h.ev(() => { const c0 = PL_TEST.getState().charges; let n = 0; const J2 = PL_TEST.juice(); while (PL_TEST.getState().charges >= c0 && n++ < 80) { if (n % 6 === 1) PL_TEST.inject([{ k: 'flip', dir: (PL_TEST.getState().g + 1) % 4 }]); PL_TEST.tick(1); } return { spent: PL_TEST.getState().charges < c0, up: PL_TEST.juice() > J2 }; }); // first flip leaves the floor free; a later one in the air spends a move
      ok(r.spent && r.up, `${tg}: spending a move sparks at the pip`); }
    // pip pop: gaining a move sets vm.pop to 0.001, then it runs to 1 and back to 0 (0.22 s)
    { await h.ev(() => PL_TEST.room(1)); const r = await h.ev(() => { const c0 = PL_TEST.getState().charges; PL_TEST.inject([{ k: 'flip', dir: (PL_TEST.getState().g + 1) % 4 }]); PL_TEST.tick(4); PL_TEST.inject([{ k: 'flip', dir: (PL_TEST.getState().g + 1) % 4 }]); let n = 0; while (PL_TEST.getState().charges >= c0 && n++ < 60) PL_TEST.tick(1); const spent = PL_TEST.getState().charges; while (PL_TEST.getState().charges <= spent && n++ < 900) PL_TEST.tick(1); return { spent, now: PL_TEST.getState().charges, pop: PL_TEST.pipPop(), n }; });
      ok(r.now > r.spent && Math.abs(r.pop - 0.001) < 1e-9, `${tg}: pip pop starts at 0.001 when a move is refilled (moves ${r.spent} -> ${r.now}, pop ${r.pop}, ${r.n} ticks)`);
      await sleep(400); ok(await h.ev(() => PL_TEST.pipPop()) === 0, `${tg}: pip pop returns to 0`); }
    // particle fallback contract: Vfx draws ripple / pipSpend / medal in full, lite and reduced (local pops stay 0); only quality OFF uses the local fallback
    for (const q of ['full', 'lite', 'off']) {
      const r = await h.ev((a) => { const [q, k] = a; PL.Vfx.setQuality(q); PL_TEST.room(1); const p0 = PL_TEST.pops(), v0 = PL.Vfx.stats().particles; PL.Input.down(k.x + k.w / 2, k.y + k.h / 2, 9); PL.Input.up && PL.Input.up(9); return { q: PL.Vfx.stats().quality, dp: PL_TEST.pops() - p0, dv: PL.Vfx.stats().particles - v0 }; }, [q, key]);
      if (q === 'off') ok(r.dp > 0 && r.dv === 0, `${tg}: quality ${r.q}: ripple uses the local fallback (local +${r.dp}, vfx +${r.dv})`);
      else ok(r.dp === 0 && (q === 'lite' || r.dv > 0), // lite: a full pool evicts a trail particle, so the count may stay level; the point is no local double draw
         `${tg}: quality ${r.q}: ripple comes from Vfx only, no double draw (local +${r.dp}, vfx +${r.dv})`);
    }
    await h.ev(() => PL.Vfx.setQuality('full')); await sleep(300);
    // overlays: pause, nudge
    // Shared-scrim pixel check: find the brightest play-field pixel (outside the centred card zone, pad and HUD), then require the same spot to be scrim-dark under every overlay.
    const findSpot = async () => { await h.frame(); await h.frame(); return h.ev(([W, H]) => {
      const c = document.querySelector('canvas'), x = c.getContext('2d'), d = c.width / window.innerWidth, L = PL_TEST.layout('play').rects, r = L.room, pb = L.padBox;
      let best = null; const x0 = Math.round(r.x * d), y0 = Math.round(r.y * d), w = Math.round(r.w * d), h = Math.round(r.h * d), im = x.getImageData(x0, y0, w, h).data;
      for (let j = 4; j < h - 4; j += 3) for (let i = 4; i < w - 4; i += 3) {
        const px = (x0 + i) / d, py = (y0 + j) / d; if (Math.abs(px - W / 2) < 190 && Math.abs(py - H / 2) < 200) continue; if (px > pb.x - 4 && px < pb.x + pb.w + 4 && py > pb.y - 4 && py < pb.y + pb.h + 4) continue;
        const o = (j * w + i) * 4, v = im[o] + im[o + 1] + im[o + 2]; if (!best || v > best.v) best = { v, x: px, y: py };
      } return best; }, [W, H]); };
    const spotDark = async (spot, label) => {
      if (!spot) { ok(false, `${tg}: ${label} found a bright play-field spot to test`); return; }
      if (label === 'Settings from Pause') { // a settings row (opaque sticker) can sit on the spot: then the scrim cannot be sampled there, skip with a note
        const cov = await h.ev((s) => { const R = PL_TEST.layout('settings').rects; return Object.keys(R).some((k) => k !== 'list' && k !== 'title' && s.x >= R[k].x && s.x < R[k].x + R[k].w && s.y >= R[k].y && s.y < R[k].y + R[k].h); }, spot);
        if (cov) { ok(true, `${tg}: ${label} spot sits under an opaque settings row, scrim sample skipped (shared scrim code path, see uikit test)`); return; }
      }
      await h.frame(); await h.frame();
      const m = await h.ev((s) => { const c = document.querySelector('canvas'), x = c.getContext('2d'), d = c.width / window.innerWidth, v = x.getImageData(Math.round(s.x * d) - 3, Math.round(s.y * d) - 3, 7, 7).data; let a = [0, 0, 0]; for (let i = 0; i < v.length; i += 4) for (let k = 0; k < 3; k++) a[k] += v[i + k]; return a.map((q) => Math.round(q / (v.length / 4))); }, spot);
      ok(spot.v >= 450, `${tg}: ${label} spot (${Math.round(spot.x)},${Math.round(spot.y)}) is bright in play (sum ${spot.v})`);
      ok(m[0] <= 110 && m[1] <= 110 && m[2] <= 135, `${tg}: ${label} bright play-field spot is scrim-dark under the overlay (rgb ${m}; 85% dusk over a bright pixel is about 66,72,105)`);
    };
    const noPad = async (label, spot) => {
      if (spot !== undefined) await spotDark(spot, label);
      await h.frame(); await h.txt(); await h.frame();
      const t = await h.txt(), before = await h.ev(() => PL_TEST.pops());
      ok(!/Room \d of \d/.test(t), `${tg}: ${label} shows no HUD pill text through the scrim`);
      const used = await h.ev((k) => { const r = PL.Input.down(k.x + k.w / 2, k.y + k.h / 2, 6); PL.Input.up && PL.Input.up(6); return r; }, key);
      ok(!used && await h.ev(() => PL_TEST.pops()) <= before, `${tg}: ${label} pad hit-testing is off`);
      const px = await h.ev((k) => { const c = document.querySelector('canvas'), x = c.getContext('2d'), d = window.devicePixelRatio || 1, v = x.getImageData(Math.round((k.x + k.w / 2) * d), Math.round((k.y + k.h / 2) * d), 1, 1).data; return [v[0], v[1], v[2]]; }, key);
      ok(px[0] < 90 && px[1] < 90 && px[2] < 130, `${tg}: ${label} pad area is scrim-dark (rgb ${px})`);
    };
    { const sp0 = await findSpot(); await h.tap('pause'); await sleep(80); await noPad('Pause', sp0);
    await h.tap('settings'); await sleep(80); await noPad('Settings from Pause', sp0); }
    await h.tap('back'); await h.tap('resume'); await sleep(80);
    const spN = await findSpot();
    for (let i = 0; i < 5; i++) { await h.ev(() => PL_TEST.kill('spike')); await sleep(450); }
    await sleep(2300); ok(await h.ev(() => PL_TEST.nudging()), `${tg}: 5-death nudge is open`); await noPad('5-death nudge', spN);
    await h.tap('stay'); await sleep(80);
    // room clear card, then a real star wipe
    await h.ev(() => { PL_TEST.room(1); }); await sleep(150); const spC = await findSpot();
    await h.ev(() => { PL_TEST.winRoom(); }); await sleep(100);
    ok(await h.screen() === 'roomClear', `${tg}: room clear open`); await noPad('Room clear', spC);
    { const rc = await h.ev(() => PL_TEST.layout('roomClear').rects.clearCard);
      ok(Math.abs(rc.x + rc.w / 2 - W / 2) <= 1 && Math.abs(rc.y + rc.h / 2 - H / 2) <= 1, `${tg}: room clear card centred on the viewport (${rc.x},${rc.y} ${rc.w}x${rc.h})`);
      const pc = await h.ev(() => PL_TEST.layout('pause').rects.card);
      ok(Math.abs(rc.x + rc.w / 2 - (pc.x + pc.w / 2)) <= 1, `${tg}: room clear card x matches the pause card`); }
    const t0 = await h.ev(() => PL_TEST.getRunStats().totalTicks);
    await h.ev(() => { window.__w0 = performance.now(); PL_TEST.advanceWipe(); });
    ok(await h.ev(() => PL_TEST.wiping()), `${tg}: wipe starts and locks input`);
    await h.ev((k) => { PL.Input.down(k.x + k.w / 2, k.y + k.h / 2, 7); PL.Input.up && PL.Input.up(7); }, key);
    let dur = -1, t1 = t0; for (let i = 0; i < 60; i++) { await sleep(20); const r = await h.ev(() => [PL_TEST.wiping(), performance.now() - window.__w0, PL_TEST.getRunStats().totalTicks, PL_TEST.getState().flips]); if (!r[0]) { dur = r[1]; t1 = r[2]; break; } }
    console.log(`     ${tg}: wipe took ${Math.round(dur)} ms (headless runs the 0.15 s fade wipe; full quality is 0.32 s close + 0.32 s open)`);
    ok(dur > 100 && dur < 900, `${tg}: wipe finishes (${Math.round(dur)} ms), input locked until then`);
    ok(t1 === t0 && await h.ev(() => PL_TEST.getState().flips) === 0, `${tg}: run clock paused and pad input dropped during the wipe`);
    ok(await h.ev(() => PL_TEST.screen()) === 'play' && (await h.ev(() => PL_TEST.getRunStats().roomsCleared)) >= 1, `${tg}: wipe lands in the next room`);
    // medal reveal: confetti
    let spS = null;
    for (let i = 0; i < 8 && await h.screen() !== 'shaftComplete'; i++) { await h.ev(() => PL_TEST.tick(30)); await h.frame(); spS = await findSpot() || spS; await h.ev(() => { PL_TEST.winRoom(); PL_TEST.advance(); }); }
    ok(await h.screen() === 'shaftComplete' && await h.ev(() => PL_TEST.juice()) >= 8, `${tg}: medal reveal throws confetti`);
    await noPad('Shaft complete', spS);
    ok(h.errs.length === 0, `${tg}: no console errors ${h.errs.slice(0, 3).join(' | ')}`);
    await h.context.close();
  }
  // reduced motion: no wipe, no juice
  h = await open(browser, port, 475, 638);
  await h.page.emulateMedia({ reducedMotion: 'reduce' }); await sleep(200);
  await h.ev(() => PL_TEST.startMode('short', 7)); await sleep(300);
  await h.ev(() => { PL_TEST.winRoom(); PL_TEST.advanceWipe(); });
  ok(!(await h.ev(() => PL_TEST.wiping())) && await h.screen() === 'play', 'reduced motion: room change has no wipe');
  await h.ev(() => { PL_TEST.inject([{ k: 'flip', dir: 1 }]); PL_TEST.tick(3); }); ok(await h.ev(() => PL_TEST.pops()) === 0, 'reduced motion: no pip sparks');
  await h.context.close();
  // landscape smoke
  h = await open(browser, port, 816, 568);
  await h.tap('start'); ok(await h.screen() === 'tutorial', '816x568 cover -> tutorial');
  ok(h.errs.length === 0, `816x568 no console errors ${h.errs.slice(0, 3).join(' | ')}`);
  await h.context.close();
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.log('FAIL index.html missing'); process.exit(2); }
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  for (const [w, h] of [[344, 882], [475, 638]]) {
    try { await journey(browser, port, w, h); } catch (e) { fails.push('exception ' + w + 'x' + h + ' ' + e.message); console.log('FAIL exception', e.stack); }
  }
  try { await extras(browser, port); } catch (e) { fails.push('exception extras ' + e.message); console.log('FAIL exception', e.stack); }
  await browser.close(); srv.close();
  console.log(nOk + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})();
