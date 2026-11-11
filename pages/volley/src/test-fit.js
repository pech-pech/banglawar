// Fit suite for R42 (pick 43): stepped room, real CSS px, no scaled frame. Spec: FULLSCREEN-LAYOUT.md sections 1, 3, 4 and 6.
// Usage: node src/test-fit.js [path/to/index.html] [shotsDir]
//   default page: ../index.html next to src/ (the built page). default shots: src/shots/fit/
// Per size: formula (C, tile, room, apron within 0.5 px of the spec), no bars (room edges within one tile of the usable width
// unless clamped; no flat background colour at the screen edges), nothing clipped and no page scroll, every tap target >= 44 x 44
// (list printed, L-TD-4), no text under 11 px, canvas backing = CSS size x dpr capped at 2 (L-PV-15), a sheet leaves the raised
// Deploy tile hittable (L-PV-16), a tap on DEPLOY starts a run, a drag steers, and a resize pauses the run with C changing only at the next room.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const SHOTS = path.resolve(process.argv[3] || path.join(__dirname, 'shots', 'fit'));
// dpr 2.625 = M's Fold reading (FULLSCREEN-LAYOUT s1); 1280 x 720 is a desktop window at dpr 1.
const SIZES = [[344, 882, 2.625], [475, 590, 2.625], [475, 638, 2.625], [475, 694, 2.625], [704, 783, 2.625], [704, 879, 2.625], [1280, 720, 1]];
// FULLSCREEN-LAYOUT s1 table (columns, tile px, room px, apron px). 1280 x 720 is the clamp case.
const TABLE = { '344x882': [9, 38.2, 344, 573, 245], '475x590': [13, 35.1, 456, 526, 0], '475x638': [13, 36.5, 475, 548, 26], '475x694': [11, 42.0, 462, 630, 0],
  '704x783': [15, 46.9, 704, 704, 15], '704x879': [13, 54.2, 704, 812, 3], '1280x720': [15, 43.7, 656, 656, 0] };
const TOL_TABLE = 0.6;   // the table is rounded to 0.1 px (tile) or 1 px (room, apron): 0.5 px plus the table's own rounding
// Independent copy of the R42 rule (CONTRACT.md), so the page is checked against the spec and not against itself.
function r42(W, H, C) {
  const Wu = W, playH = H - 64, t0 = Math.min(playH / 15, 64);
  let n = Math.ceil(Wu / t0 - 1 - 1e-9); if (n % 2 === 0) n++;
  const Cv = Math.max(9, Math.min(15, n)), c = C || Cv, tile = Math.min(t0, Wu / c);
  return { C: Cv, c, tile, roomW: c * tile, roomH: 15 * tile, ox: (Wu - c * tile) / 2, oy: 64, apron: Math.max(0, H - 64 - 15 * tile), clamped: Wu / t0 > 16 };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, info) { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); }
function info(name, text) { console.log('INFO ' + name + '  [' + text + ']'); }

// In-page probes. Visible = laid out, not visibility:hidden, non-zero box.
const PROBE = () => {
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01; };
  const clipsAnc = e => { for (let a = e.parentElement; a && a.id !== 'stage' && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return a; } return null; };
  const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  // the part of an element a user can actually see: its rect cut by every clipping ancestor
  const seen = e => { let r = e.getBoundingClientRect(), l = r.left, t = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = a.getBoundingClientRect(); l = Math.max(l, q.left); t = Math.max(t, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
    return { w: R - l, h: B - t }; };
  window.__fit = {
    targets() {
      const W = innerWidth, H = innerHeight;
      return [...document.querySelectorAll('button, [role=button], a[href], input, select, textarea:not(#copyArea), .pv-tab')].filter(vis)
        .filter(e => !e.closest('[hidden]') && !e.disabled)
        .filter(e => { const s = seen(e); return s.w > 1 && s.h > 1; })   // scrolled out of sight is not a target now
        .map(e => { const r = e.getBoundingClientRect(); return { n: name(e) + (e.textContent ? ' "' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 18) + '"' : ''), w: Math.round(r.width), h: Math.round(r.height) }; });
    },
    smallText() {
      const out = [];
      for (const e of document.querySelectorAll('#stage *')) {
        if (!vis(e) || e.closest('svg')) continue;
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const s = seen(e); if (s.w < 1 || s.h < 1) continue;
        const fz = parseFloat(getComputedStyle(e).fontSize);
        if (fz < 11 - 0.01) out.push(name(e) + ' ' + fz + 'px "' + e.textContent.trim().slice(0, 20) + '"');
      }
      return out;
    },
    clipped() {
      const W = innerWidth, H = innerHeight, out = [];
      for (const e of document.querySelectorAll('#stage *')) {
        if (!vis(e) || e.closest('svg') || e.closest('#dmgLayer')) continue;
        if (clipsAnc(e)) continue;                                  // clipped by its own scroll box or panel: that box is checked instead
        const r = e.getBoundingClientRect();
        if (e.tagName === 'CANVAS') continue;
        if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) out.push(name(e) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      }
      return out;
    },
    truncated() {
      return [...document.querySelectorAll('#stage *')].filter(vis).filter(e => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1).map(e => name(e) + ' "' + e.textContent.trim().slice(0, 24) + '"');
    },
    scroll() { const d = document.scrollingElement; return { sw: d.scrollWidth, sh: d.scrollHeight, x: scrollX, y: scrollY }; }
  };
};

async function pixelsAt(page, y, xs) {
  // device pixel colours of the screenshot row y at the CSS x positions xs
  const buf = await page.screenshot({ clip: { x: 0, y: Math.floor(y), width: page.viewportSize().width, height: 1 } });
  return page.evaluate(async ([b64, xs]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const k = img.width / innerWidth; return xs.map(px => Array.from(x.getImageData(Math.min(img.width - 1, Math.round(px * k)), 0, 1, 1).data.slice(0, 3)));
  }, [buf.toString('base64'), xs]);
}

async function screenChecks(page, tag, screen, W, H) {
  const t = await page.evaluate(() => window.__fit.targets());
  const small = t.filter(x => x.w < 44 || x.h < 44);
  ok(small.length === 0, `${tag} ${screen}: every tap target >= 44 x 44`, small.map(x => `${x.n} ${x.w}x${x.h}`).join('; '));
  info(`${tag} ${screen} tap targets (${t.length})`, t.map(x => `${x.n} ${x.w}x${x.h}`).join('; '));
  const tx = await page.evaluate(() => window.__fit.smallText());
  ok(tx.length === 0, `${tag} ${screen}: no text under 11 px`, tx.slice(0, 8).join('; '));
  const cl = await page.evaluate(() => window.__fit.clipped());
  ok(cl.length === 0, `${tag} ${screen}: nothing crosses the viewport`, cl.slice(0, 8).join('; '));
  const sc = await page.evaluate(() => window.__fit.scroll());
  ok(sc.sw <= W && sc.sh <= H && sc.x === 0 && sc.y === 0, `${tag} ${screen}: no page scroll`, JSON.stringify(sc));
  const tr = await page.evaluate(() => window.__fit.truncated());
  if (tr.length) info(`${tag} ${screen} ellipsized text`, tr.join('; '));
}

async function size(browser, W, H, dpr) {
  const tag = W + 'x' + H;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(PROBE);
  await page.goto('file://' + PAGE + '?seed=7&gpu=0&fresh=1&title=0');
  await page.waitForFunction(() => window.__pv && window.__pv.R, null, { timeout: 15000 });
  await sleep(400);
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = n => page.screenshot({ path: path.join(SHOTS, tag + '-' + n + '.png') });

  // ---- formula ----
  const L = await page.evaluate(() => window.__pv.layout);
  const want = r42(W, H), T = TABLE[tag];
  ok(L && L.colsNext === want.C && Math.abs(L.tile - want.tile) <= 0.5 && Math.abs(L.roomW - want.roomW) <= 0.5 && Math.abs(L.apron - want.apron) <= 0.5 && Math.abs(L.ox - want.ox) <= 0.5 && L.oy === 64,
    `${tag} formula: C, tile, room, apron match R42 within 0.5 px`, `page C${L.colsNext} tile ${L.tile.toFixed(2)} room ${L.roomW.toFixed(1)}x${L.roomH.toFixed(1)} apron ${L.apron.toFixed(1)} ox ${L.ox.toFixed(1)}; rule C${want.C} tile ${want.tile.toFixed(2)} apron ${want.apron.toFixed(1)}`);
  if (T) ok(L.colsNext === T[0] && Math.abs(L.tile - T[1]) <= TOL_TABLE && Math.abs(L.roomW - T[2]) <= 1 && Math.abs(L.roomH - T[3]) <= 1 && Math.abs(L.apron - T[4]) <= 1,
    `${tag} formula matches the FULLSCREEN-LAYOUT s1 table`, `table C${T[0]} ${T[1]} px room ${T[2]}x${T[3]} apron ${T[4]}`);
  const pure = await page.evaluate(([W, H]) => window.V.Layout.colsFor(W, H, { t: 0, r: 0, b: 0, l: 0 }), [W, H]);
  ok(pure === want.C, `${tag} V.Layout.colsFor(W, H, insets) = ${want.C}`, 'got ' + pure);
  const cls = await page.evaluate(() => document.body.className);
  ok(cls.includes(W < 600 ? 'w-narrow' : 'w-wide') && cls.includes('h-short') === (H < 720), `${tag} width and height classes`, cls);

  // ---- canvas backing ----
  const cv = await page.evaluate(() => { const c = document.getElementById('c2d'); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cw: r.width, ch: r.height }; });
  const k = Math.min(dpr, 2);
  ok(Math.abs(cv.w - Math.round(W * k)) <= 1 && Math.abs(cv.h - Math.round(H * k)) <= 1 && Math.abs(cv.cw - W) <= 0.5 && Math.abs(cv.ch - H) <= 0.5,
    `${tag} canvas backing = CSS size x min(dpr, 2)`, `${cv.w}x${cv.h} for ${cv.cw}x${cv.ch} css at dpr ${dpr}`);

  // ---- Home screens ----
  for (const tab of ['deploy', 'armory', 'operator', 'upgrades', 'intel']) {
    await page.evaluate(t => window.V.Home.go(t), tab); await sleep(250);
    await shot('home-' + tab);
    await screenChecks(page, tag, 'home ' + tab, W, H);
  }
  // L-PV-16: a sheet ends above the tab bar, so the raised Deploy tile stays hittable.
  await page.evaluate(() => window.V.Home.go('armory')); await sleep(150);
  const opened = await page.evaluate(() => { const b = document.querySelector('#pane-armory .ta-head'); if (b) b.click(); return !!document.querySelector('.ta-scrim'); });
  await sleep(200);
  if (opened) {
    await shot('home-armory-sheet');
    await screenChecks(page, tag, 'armory sheet', W, H);
    const hit = await page.evaluate(() => { const t = document.querySelector('.pv-tab--center .pv-tab__icon'), r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 6); return { hit: !!(e && e.closest('.pv-tab--center')), sheet: (() => { const s = document.querySelector('.ta-sheet').getBoundingClientRect(); return { w: Math.round(s.width), b: Math.round(s.bottom) }; })() }; });
    ok(hit.hit && (W < 600 || hit.sheet.w <= 480), `${tag} sheet open: raised Deploy tile still hittable${W >= 600 ? ', sheet <= 480 wide' : ''}`, JSON.stringify(hit));
    await page.evaluate(() => { const s = document.querySelector('.ta-scrim'); if (s) s.click(); }); await sleep(150);
  } else info(tag + ' armory sheet', 'no .ta-head to open');
  await page.evaluate(() => window.V.Home.go('deploy'));
    await page.evaluate(() => { window.V.Home.deploy.state().boost = { id: 'D2', tier: 0 }; window.V.Home.deploy.paint(); });
    await sleep(2200);   // Deploy roll guard: reveal 1.5 s + 350 ms (05 3.10)

  // ---- DEPLOY tap ----
  const dep = await page.evaluate(() => { const r = document.getElementById('btnDeploy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  await page.touchscreen.tap(dep.x, dep.y); await sleep(500);
  const run = await page.evaluate(() => ({ home: window.__pv.home, phase: window.__pv.S.phase, cols: window.__pv.S.cols }));
  ok(run.home === false && run.phase === 'play', `${tag} tap on DEPLOY starts a run`, JSON.stringify(run));
  await page.evaluate(() => { window.__pv.S.enemies.forEach(e => { e.hp = 1e9; e.atk = 0; }); window.__pv.S.hero.invulnT = 1e9; });
  await sleep(150);
  await shot('run');
  await screenChecks(page, tag, 'run', W, H);
  const v = await page.evaluate(() => Object.assign({}, window.__pv.view));
  ok(v.scale === 1 && Math.abs(v.s - want.tile) <= 0.5 && Math.abs(v.ox - want.ox) <= 0.5 && v.oy === 64 && v.w === W && v.h === H, `${tag} view: scale 1, s = tile, room origin, viewport size`, `s ${v.s.toFixed(2)} ox ${v.ox.toFixed(1)} oy ${v.oy} ${v.w}x${v.h} C${v.C}`);
  ok(run.cols === undefined || run.cols === want.C, `${tag} the run's first room has C = ${want.C}`, 'S.cols ' + run.cols + (run.cols === undefined ? ' (sim without S.cols yet)' : ''));
  // the room reaches the side edges (at most one tile of wall in total), and all 15 rows plus the door are on screen
  const roomW = (v.C || want.C) * v.s, spare = W - roomW;
  ok(want.clamped ? spare > 0 : spare <= v.s + 0.5 && spare >= -0.5, want.clamped ? `${tag} clamp: room stops at 15 columns, ground beside it` : `${tag} no bars: room within one tile of the usable width`, `room ${roomW.toFixed(1)} of ${W}, spare ${spare.toFixed(1)}, tile ${v.s.toFixed(1)}`);
  ok(v.oy + 15 * v.s <= H + 0.5, `${tag} all 15 rows visible, room does not scroll`, `room bottom ${(v.oy + 15 * v.s).toFixed(1)} of ${H}`);
  const hud = await page.evaluate(() => { const r = document.getElementById('hud').getBoundingClientRect(); const x = document.getElementById('xpWrap').getBoundingClientRect(); return { h: r.height, w: r.width, xp: x.width }; });
  ok(Math.abs(hud.h - 64) <= 0.5 && Math.abs(hud.w - W) <= 0.5 && hud.xp <= 360.5, `${tag} HUD: 48 bar + 16 HP strip = 64, full width, XP bar <= 360`, JSON.stringify(hud));
  // no flat background colour at the screen edges beside the room (screenshot pixels at mid-room height)
  const px = await pixelsAt(page, v.oy + 7.5 * v.s, [0.5, W - 0.5]);
  const flat = px.filter(c => Math.abs(c[0] - 11) <= 3 && Math.abs(c[1] - 14) <= 3 && Math.abs(c[2] - 17) <= 3);
  ok(flat.length === 0, `${tag} no flat --pv-ui-bg bar at the side edges`, JSON.stringify(px));
  // drag steers (drag up = north), from the middle of the room and from the far edge / beside the room
  const drag = async (x, y) => {
    const y0 = await page.evaluate(() => window.__pv.S.hero.y);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 20, { steps: 4 }); await page.mouse.move(x, y - 60, { steps: 4 });
    await sleep(450); const y1 = await page.evaluate(() => window.__pv.S.hero.y); await page.mouse.up(); await sleep(150);
    return y1 - y0;
  };
  const dIn = await drag(W / 2, Math.min(H - 70, v.oy + 13 * v.s));
  ok(dIn < -0.3, `${tag} drag in the room steers the hero north`, `dy ${dIn.toFixed(2)} tiles`);
  const dEdge = await drag(want.clamped ? v.ox / 2 : 6, Math.min(H - 70, v.oy + 13 * v.s));
  ok(dEdge < -0.3, `${tag} drag from ${want.clamped ? 'the ground beside the room' : 'the side edge'} steers too`, `dy ${dEdge.toFixed(2)} tiles`);

  // ---- overlays ----
  await page.evaluate(() => window.__pv.pause()); await sleep(200);
  await shot('pause');
  await screenChecks(page, tag, 'pause', W, H);
  const lbl = await page.evaluate(() => document.getElementById('rlblPause').textContent);
  ok(lbl.includes(tag) && lbl.includes('c' + want.C) && /dpr/.test(lbl), `${tag} renderer label shows viewport, column class, tile and dpr`, lbl);
  const pz = await page.evaluate(() => document.querySelector('#ovPause .pz').getBoundingClientRect().width);
  ok(pz <= 400.5, `${tag} pause panel <= 400 wide`, pz.toFixed(0));
  await page.evaluate(() => window.__pv.resume());
  await page.evaluate(() => window.__pv.freeze(true));
  await page.evaluate(() => { const S = window.__pv.S; S.phase = 'pick'; S.cards = [0, 1, 2]; window.__pv.step(1); }); await sleep(200);
  await shot('cards');
  await screenChecks(page, tag, 'level-up', W, H);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#cardList .card')].map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
  ok(cards.length === 3 && cards.every(c => c.w <= 560 && c.w >= Math.min(560, W - 16) - 1 && c.h >= 96), `${tag} level-up: 3 stacked rows, full width less 16 (at most 560), 96 high`, JSON.stringify(cards));
  await page.evaluate(() => window.__pv.pick(0)); await sleep(100);
  await page.evaluate(() => { const S = window.__pv.S; S.phase = 'results'; S.result = { win: false, stage: 3, t: 200, kills: 30, level: 4, dmgTaken: 900, credits: 120 }; window.__pv.step(1); }); await sleep(1300);   // 0.9 s death beat (QA-LOOK L4) before the card shows
  await shot('results');
  await screenChecks(page, tag, 'results', W, H);
  const res = await page.evaluate(() => { const r = document.getElementById('resStats').getBoundingClientRect(), b = document.getElementById('btnRestart').getBoundingClientRect(); return { w: Math.round(r.width), bh: Math.round(b.height), bb: Math.round(b.bottom) }; });
  ok(res.w <= 480 && res.bh >= 64, `${tag} results column <= 480, buttons 64 high`, JSON.stringify(res));
  ok(errs.length === 0, `${tag} no page errors`, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

// Resize inside a room: pauses, keeps C and refits the tile; C changes only at the next room.
async function resize(browser) {
  const tag = 'resize 475x694 -> 704x783';
  const ctx = await browser.newContext({ viewport: { width: 475, height: 694 }, deviceScaleFactor: 2.625, hasTouch: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + PAGE + '?seed=7&gpu=0&fresh=1&home=0&title=0');
  await page.waitForFunction(() => window.__pv && window.__pv.R, null, { timeout: 15000 });
  await sleep(400);
  const a = await page.evaluate(() => ({ cols: window.__pv.S.cols, C: window.__pv.view.C, stage: window.__pv.S.stage, paused: window.__pv.paused }));
  await page.setViewportSize({ width: 704, height: 783 }); await sleep(400);
  const b = await page.evaluate(() => ({ cols: window.__pv.S.cols, C: window.__pv.view.C, s: window.__pv.view.s, paused: window.__pv.paused, next: window.V.Layout.cols() }));
  const fit = r42(704, 783, a.C);
  ok(b.paused, `${tag}: the resize pauses the run`, JSON.stringify(b));
  ok(b.C === a.C && (a.cols === undefined || b.cols === a.cols) && Math.abs(b.s - fit.tile) <= 0.5, `${tag}: C kept (${a.C}) and the tile refitted`, `tile ${b.s.toFixed(2)} want ${fit.tile.toFixed(2)}; next room C${b.next}`);
  await page.screenshot({ path: path.join(SHOTS, 'resize-paused.png') });
  await page.evaluate(() => window.__pv.resume());
  await page.evaluate(() => window.__pv.freeze(true));
  // play the room out with __pv.step: enemies one hit, hero unhurt, walk to the door once clear
  const c = await page.evaluate(() => {
    const P = window.__pv, S0 = P.S, st = S0.stage;
    for (let i = 0; i < 9000; i++) {
      const S = P.S; S.hero.hp = S.hero.maxHp; S.enemies.forEach(e => { if (e.hp > 1) e.hp = 1; });
      if (S.phase === 'pick') { P.pick(0); continue; }
      if (S.phase === 'supply') { P.pickSupply(0); continue; }
      P.step(1, s => s.phase === 'clear' ? P.doorDir() : { mx: 0, my: 0 });
      if (P.S.stage !== st) break;
    }
    P.step(2);
    return { stage: P.S.stage, cols: P.S.cols, C: P.view.C, s: P.view.s };
  });
  const nf = r42(704, 783);
  ok(c.stage > a.stage && c.C === nf.C && (c.cols === undefined || c.cols === nf.C) && Math.abs(c.s - nf.tile) <= 0.5,
    `${tag}: C changes at the next room entry (C${a.C} -> C${nf.C})`, JSON.stringify(c) + (c.cols === undefined ? ' (sim has no S.cols yet)' : ''));
  await page.screenshot({ path: path.join(SHOTS, 'resize-next-room.png') });
  ok(errs.length === 0, `${tag}: no page errors`, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.error('no page at ' + PAGE); process.exit(2); }
  const browser = await chromium.launch();
  try { for (const [w, h, d] of SIZES) await size(browser, w, h, d); await resize(browser); }
  catch (e) { ok(false, 'suite crashed', String(e && e.stack || e).slice(0, 400)); }
  await browser.close();
  console.log(`\nfit: ${pass} pass, ${fail} fail (page ${PAGE}, shots ${SHOTS})`);
  process.exit(fail ? 1 : 0);
})();
