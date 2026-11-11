// Fit suite for the full-screen frame (pick 43 replaces pick 1: "It should be full screen. No bars on the sides.").
// Usage: node src/test-fit.js [path/to/index.html] [shotsDir]
//   default page: ../index.html next to src/. default shots: src/shots/fit/
// Per size: frame is 882 tall and W = clamp(round(W/H x 882), 344, 800) wide, fills the screen (no bars) unless the clamp bites, nothing is drawn outside it,
// DEPLOY / HUD / bottom berm are inside the frame and the viewport, a tap on DEPLOY lands, a screen point maps
// to the right frame point (elementFromPoint + __pv.toFrame), a drag that starts in a bar steers the hero,
// and the canvas never exceeds 688 x 1764 px.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const SHOTS = path.resolve(process.argv[3] || path.join(__dirname, 'shots', 'fit'));
// dpr: 2.625 is M's Fold reading; dpr 1 for the desktop-style test viewports (guess, matches e2e.js).
const SIZES = [[344, 882, 2.625], [475, 638, 2.625], [704, 783, 2.625], [1104, 884, 1], [750, 832, 1]];   // 704x783: M's Fold inner screen in the browser
const FH = 882, BERM = 30, FW_MIN = 344, FW_MAX = 800;
const frameW = (W, H) => Math.max(FW_MIN, Math.min(FW_MAX, Math.round(W / H * FH)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const rows = [];
function ok(c, name, info){ (c ? pass++ : fail++); const r = (c ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''); rows.push(r); console.log(r); }

async function size(browser, W, H, dpr) {
  const tag = W + 'x' + H;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file://' + PAGE + '?seed=7&gpu=0&fresh=1');
  await page.waitForFunction(() => window.__pv && window.__pv.R, null, { timeout: 15000 });
  await sleep(300);
  const g = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const dep = document.getElementById('btnDeploy') || [...document.querySelectorAll('#home button')].find(b => /deploy/i.test(b.textContent));
    const c = document.getElementById('c2d');
    return { st: { l: st.left, t: st.top, r: st.right, b: st.bottom, w: st.width, h: st.height }, dep: rect(dep), fr: window.__pv.frame, view: Object.assign({}, window.__pv.view),
      canvas: { w: c.width, h: c.height }, home: window.__pv.home, bg: getComputedStyle(document.body).backgroundColor };
  });
  const FW = frameW(W, H), st = g.st, ratio = st.w / st.h, want = FW / FH, clamped = FW !== Math.round(W / H * FH);
  ok(Math.abs(ratio / want - 1) <= 0.01, tag + ' frame shape is ' + FW + ':882 within 1%', `${st.w.toFixed(1)}x${st.h.toFixed(1)} ratio ${ratio.toFixed(4)} vs ${want.toFixed(4)}`);
  const s = Math.min(W / FW, H / FH);
  ok(Math.abs(g.fr.scale - s) < 1e-3, tag + ' scale = min(W/FW, H/882)', `scale ${g.fr.scale.toFixed(4)} want ${s.toFixed(4)}`);
  if (!clamped) ok(st.l <= 1 && W - st.r <= 1 && st.t <= 1 && H - st.b <= 1, tag + ' full screen: no bars', `L ${st.l.toFixed(1)} R ${(W - st.r).toFixed(1)} T ${st.t.toFixed(1)} B ${(H - st.b).toFixed(1)}`);
  ok(Math.abs(st.l - (W - st.r)) <= 1 && Math.abs(st.t - (H - st.b)) <= 1, tag + ' frame centred', `bars L ${st.l.toFixed(1)} R ${(W - st.r).toFixed(1)} T ${st.t.toFixed(1)} B ${(H - st.b).toFixed(1)}`);
  ok(st.l >= -0.5 && st.t >= -0.5 && st.r <= W + 0.5 && st.b <= H + 0.5, tag + ' frame fully on screen', JSON.stringify(st));
  ok(g.bg === 'rgb(11, 14, 17)', tag + ' bars are flat --pv-ui-bg', g.bg);
  // Nothing drawn in the bars: no visible element outside the frame except the body/html themselves.
  const stray = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    return [...document.body.querySelectorAll('*')].filter(e => !e.closest('#stage') && !['SCRIPT', 'STYLE', 'TEXTAREA', 'svg'].includes(e.tagName) && e.offsetParent !== null)
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && (r.right > st.right + 1 || r.left < st.left - 1 || r.top < st.top - 1 || r.bottom > st.bottom + 1); })
      .map(e => e.tagName + '#' + e.id);
  });
  ok(stray.length === 0, tag + ' nothing drawn in the bars', stray.join(','));
  // Pixel check of the bars (screenshot) for wide views.
  if (st.l >= 10) {   // 6 px margin: device-pixel rounding of the clip at dpr 2.625 can catch the 1 px edge line
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: Math.floor(st.l) - 6, height: H - 1 } });   // last row: fractional device row at dpr 2.625 (638 x 2.625 = 1674.75) reads #161717
    const uniq = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let bad = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 11) > 2 || Math.abs(d[i + 1] - 14) > 2 || Math.abs(d[i + 2] - 17) > 2) bad++;
      return bad;
    }, shot.toString('base64'));
    ok(uniq === 0, tag + ' left bar pixels are all #0b0e11', `${uniq} off-colour px`);
  }
  ok(g.canvas.w <= FW * 2 + 1 && g.canvas.h <= 1764, tag + ' canvas pixels capped at 2x frame', `${g.canvas.w}x${g.canvas.h}`);
  const inFrame = (r) => r && r.l >= st.l - 0.5 && r.r <= st.r + 0.5 && r.t >= st.t - 0.5 && r.b <= st.b + 0.5 && r.l >= 0 && r.t >= 0 && r.r <= W + 0.5 && r.b <= H + 0.5;
  ok(inFrame(g.dep) && g.dep.h >= 20, tag + ' DEPLOY button inside frame and viewport', JSON.stringify(g.dep && { l: g.dep.l | 0, t: g.dep.t | 0, w: g.dep.w | 0, h: g.dep.h | 0 }));
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, tag + '-home.png') });
  // Tap mapping: the frame point of DEPLOY's centre maps back to it, and elementFromPoint at the screen point hits it.
  const cx = g.dep.l + g.dep.w / 2, cy = g.dep.t + g.dep.h / 2;
  const map = await page.evaluate(([x, y]) => { const f = window.__pv.toFrame(x, y); const el = document.elementFromPoint(x, y); return { f, hit: !!(el && el.closest('#btnDeploy, .hm-deploy')) }; }, [cx, cy]);
  const dep = await page.evaluate(() => { const b = document.getElementById('btnDeploy'); return { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight, ox: (function(e){ let x = 0, y = 0; while (e && e.id !== 'stage') { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return { x, y }; })(b) }; });
  const fx = dep.ox.x + dep.w / 2, fy = dep.ox.y + dep.h / 2;
  ok(map.hit && Math.abs(map.f.x - fx) <= 1.5 && Math.abs(map.f.y - fy) <= 1.5, tag + ' screen point maps to the right frame point', `screen (${cx.toFixed(1)},${cy.toFixed(1)}) -> frame (${map.f.x.toFixed(1)},${map.f.y.toFixed(1)}); DEPLOY centre in frame (${fx.toFixed(1)},${fy.toFixed(1)}); hit ${map.hit}`);
  await page.touchscreen.tap(cx, cy);
  await sleep(500);
  const run = await page.evaluate(() => ({ home: window.__pv.home, phase: window.__pv.S.phase }));
  ok(run.home === false && run.phase === 'play', tag + ' tap on DEPLOY starts the run', JSON.stringify(run));
  // HUD and bottom berm inside the frame and viewport.
  const r2 = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const v = window.__pv.view, f = window.__pv.frame;
    return { hud: rect(document.getElementById('hud')), pause: rect(document.querySelector('#pauseBtn span')), /* visible plate; the 56 px hit box overhangs by design */ bermFrame: v.oy + 15 * v.s + 30, bermScreen: f.top + (v.oy + 15 * v.s + 30) * f.scale, roomW: 9 * v.s, ox: v.ox };
  });
  ok(inFrame(r2.hud) && inFrame(r2.pause), tag + ' HUD and pause button inside frame and viewport', `hud ${r2.hud.w.toFixed(0)}x${r2.hud.h.toFixed(0)} at ${r2.hud.t.toFixed(0)}; pause ${r2.pause.l.toFixed(0)},${r2.pause.t.toFixed(0)}`);
  ok(r2.bermFrame <= FH + 0.5 && r2.bermScreen <= H + 0.5 && r2.ox >= -0.5, tag + ' room and bottom berm not clipped', `berm bottom frame y ${r2.bermFrame.toFixed(1)} / 882, screen y ${r2.bermScreen.toFixed(1)} / ${H}; room ${r2.roomW.toFixed(1)} wide`);
  // Drag: inside the frame (all sizes) and from a bar (when there are bars). Drag up = hero goes north.
  await page.evaluate(() => { window.__pv.S.enemies.forEach(e => { e.hp = 1e9; }); });
  const drag = async (x, y) => {
    const y0 = await page.evaluate(() => window.__pv.S.hero.y);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 20, { steps: 4 }); await page.mouse.move(x, y - 60, { steps: 4 });
    await sleep(500); const y1 = await page.evaluate(() => window.__pv.S.hero.y); await page.mouse.up(); await sleep(150);
    return y1 - y0;
  };
  const dIn = await drag(st.l + st.w / 2, st.t + st.h * 0.93);
  ok(dIn < -0.3, tag + ' drag inside the frame steers the hero north', `dy ${dIn.toFixed(2)} tiles`);
  if (st.l >= 20) {
    const dBar = await drag(st.l / 2, H * 0.7);
    ok(dBar < -0.3, tag + ' drag that starts in a bar steers too', `dy ${dBar.toFixed(2)} tiles`);
  }
  await page.screenshot({ path: path.join(SHOTS, tag + '-run.png') });
  // Resize changes the scale and pauses the run (fold / unfold).
  if (W !== H) {
    await page.setViewportSize({ width: H > W ? Math.round(W * 1.6) : Math.round(W * 0.6), height: Math.round(H * 0.7) });
    await sleep(300);
    const p = await page.evaluate(() => ({ paused: window.__pv.paused, ratio: (() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.width / r.height; })() }));
    const nw = H > W ? Math.round(W * 1.6) : Math.round(W * 0.6), nh = Math.round(H * 0.7), w2 = frameW(nw, nh) / FH;
    ok(p.paused && Math.abs(p.ratio / w2 - 1) <= 0.01, tag + ' resize reshapes the frame and pauses the run', JSON.stringify(p) + ' want ' + w2.toFixed(4));
  }
  ok(errs.length === 0, tag + ' no page errors', errs.join(' | ').slice(0, 200));
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.error('no page at ' + PAGE); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  try { for (const [w, h, d] of SIZES) await size(browser, w, h, d); }
  catch (e) { ok(false, 'suite crashed', String(e && e.stack || e).slice(0, 300)); }
  await browser.close();
  console.log(`\nfit: ${pass} pass, ${fail} fail (page ${PAGE}, shots ${SHOTS})`);
  process.exit(fail ? 1 : 0);
})();
