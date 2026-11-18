/* golden-over-view: Captain's Over (CONTRACT-GO s1, s2, s4). Six timing taps on a top-down pixel pitch (S1 art, mode A1 of the prototype).
   playGolden(el, { dispatch, getVM, bowler, onDone }) mounts into el (a .wm root, so wheelmatch-view leaves it alone) and runs:
   calibration (first use) -> GoldenStart -> pad tap starts the over -> 6 balls, each: 900 ms lead, 800 ms ball travel, 3-beat tick at 800/400/0 ms
   before the cross -> pointerdown grades by event.timeStamp vs the frame-synced cross time -> GoldenTap {err} (or {err:null, miss:true} when no tap
   lands before the Good window has closed) -> floating word + runs -> next ball -> floating over summary + NEXT button -> onDone().
   Reads only goldenVM (via getVM) and dispatch(GoldenStart / GoldenTap / GoldenCal). Reload mid-over: vm.active + vm.taps resume at the next ball.
   Layout (M): no text row; six circles, the next empty one ringed; per-ball result and the summary float over the field. Reduced motion: linear ball
   travel kept, no shake, flash or hit-stop. Second gold ring (#D2B357) round the six circles once the over is done. */
import { ballWord } from './over-panel.js';
import { openCalibration } from './golden-cal.js';
import { beat } from './golden-audio.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG_BASE = new URL('../../img/golden/', import.meta.url).href;
const NAMES = ['ball-0', 'ball-1', 'ball-2', 'ball-3', 'band', 'batter-stance', 'batter-backswing', 'batter-hit', 'batter-miss', 'batter-run1', 'batter-run2',
  'bowler-runup1', 'bowler-runup2', 'bowler-release', 'bowler-follow', 'fielder-idle', 'fielder-crouch', 'dash', 'ground', 'shadow', 'stumps', 'stumps-broken'];
const LEAD = 900, TRAVEL = 800, GAP = 700, STRAY = 100, MISS_PAD = 60; // ms: run-in lead, ball travel (A1 Medium), pause after a ball, earliest tap, grace past the window
const WORD = { P: 'PERFECT', G: 'GOOD', M: 'MISS' };
const GCOL = { P: '#5fd38a', G: '#e6b422', M: '#e0685c' };
const FIELD = [[.2, .36, 'idle'], [.17, .58, 'crouch'], [.14, .9, 'idle'], [.82, .3, 'crouch'], [.76, .62, 'idle']];

// ---------- sprites (loaded once) ----------
let IMG = null;
function loadArt() {
  if (IMG) return IMG;
  IMG = {};
  for (const n of NAMES) { const i = new Image(); i.src = IMG_BASE + n + '.webp'; IMG[n] = i; }
  return IMG;
}
const ready = (n) => IMG && IMG[n] && IMG[n].complete && IMG[n].naturalWidth > 0;
const artOn = () => ['ground', 'batter-stance', 'band', 'dash', 'shadow', 'bowler-runup1', 'ball-0'].every(ready);

const reduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const tapTime = (ev) => { const now = performance.now(), ts = ev && ev.timeStamp; return typeof ts === 'number' && ts > 0 && Math.abs(ts - now) < 1000 ? ts : now; };
const kindOf = (o) => (o === 'W' ? 'w' : o === 6 ? 's' : o === 4 ? 'f' : 'n');

/** Pure: pad-pixel layout of the lane and sprite scale for a field of w x h css px. */
export function layoutOf(w, h) {
  const k = Math.max(1, Math.min(3, Math.floor(h / 360)));
  const lw = Math.max(Math.min(w * .17, h * .3), 50 * k > w * .4 ? w * .4 : 50 * k);
  return { k, lw, lx: w / 2, y0: 8 * k, yL: h * .8, band: 24 * k };
}
/** Pure: grade words and runs for a ball outcome. */
export function ballText(g, o) { return { word: WORD[g] || '', res: o === 'W' ? 'OUT' : o == null ? '' : ballWord(o) }; }
/** Pure: "Taps 10 of 12. Runs 11, wheel average 7.3" (+ wickets when any). Perfect counts 2 taps, Good 1. */
export function summaryText(taps, avg) {
  const gs = taps.map((t) => t.g), n = gs.reduce((a, g) => a + (g === 'P' ? 2 : g === 'G' ? 1 : 0), 0);
  let runs = 0, wk = 0; for (const t of taps) { if (t.o === 'W') wk += 1; else runs += Number(t.o) || 0; }
  return 'Taps ' + n + ' of 12. Runs ' + runs + (wk ? ', wickets ' + wk : '') + ', wheel average ' + (avg == null ? '-' : Number(avg).toFixed(1));
}

// ---------- selectors without an engine import in the view: app.js may pass getVM; else lazy selectors + the page store ----------
let selMod = null, selP = null;
export function goldenInfo() { // sync, null until the selectors have loaded (wheelmatch-view re-renders when it is ready)
  try { const s = window.__store && window.__store.get(); return selMod && s ? selMod.goldenVM(s) : null; } catch (e) { return null; }
}
export function whenReady(cb) {
  if (selMod) return;
  if (!selP) selP = import('../store/selectors.js').then((m) => { selMod = m; return m; }, () => null);
  selP.then((m) => { if (m && typeof cb === 'function') cb(); });
}
const stageNow = () => { try { return window.__store.get().stage; } catch (e) { return ''; } };
const lastOver = () => { try { const l = window.__store.get().last; return l && l.golden ? l : null; } catch (e) { return null; } };

/** Mount and play. opts = { dispatch, getVM?, bowler?, onDone(), onCancel?() }. Returns { close }. */
export function playGolden(el, opts) {
  const { dispatch } = opts;
  const getVM = opts.getVM || goldenInfo;
  loadArt();
  const dbg = /[?&]godebug=1/.test(location.search);
  let root = null, cv = null, cx = null, raf = 0, calH = null, closed = false, handle = null;
  const timers = [];
  const S = { phase: 'ready', i: 0, taps: [], b: null, floatT: 0, hitStopUntil: 0, shakeUntil: 0, ticks: 0, gvm: null, started: false };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  function close() {
    if (closed) return; closed = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout);
    if (calH && calH.close) { try { calH.close(); } catch (e) { /* ignore */ } }
    removeEventListener('resize', fit); document.removeEventListener('keydown', onKey, true);
    if (root && root.parentNode) root.remove();
  }
  function exit() { close(); if (opts.onDone) opts.onDone(handle); }

  // ----- step 1: calibration on first use (not locked yet: Cancel goes back to the pick screen), then lock and play -----
  const g0 = getVM();
  if (!g0) { close(); if (opts.onCancel) opts.onCancel(); return { close }; }
  if (g0.needCal && !g0.active) {
    calH = openCalibration(calHolder(), {
      onDone(offset, n) { calH = null; dispatch('GoldenCal', { offset, n }); begin(); },
      onCancel() { calH = null; close(); if (opts.onCancel) opts.onCancel(); },
    });
  } else begin();

  function calHolder() { el.innerHTML = ''; const h = document.createElement('div'); h.className = 'wm go-calhold'; el.appendChild(h); return h; }
  function begin() {
    let g = getVM();
    if (g && !g.active) { // lock the over (cannot be undone)
      const r = dispatch('GoldenStart', opts.bowler != null ? { bowler: opts.bowler } : {});
      if (r && typeof r.release === 'function') handle = r;
      g = getVM();
    }
    if (!g || !g.active) { close(); if (opts.onCancel) opts.onCancel(); return; }
    S.gvm = g; S.taps = g.taps.map((t) => ({ g: t.g, o: t.ball })); S.i = S.taps.length; S.started = false;
    mount();
  }

  // ----- DOM -----
  function circlesHtml() {
    return Array.from({ length: 6 }, (_, i) => '<li class="go-c" data-go="ball" data-i="' + i + '"></li>').join('');
  }
  function mount() {
    root = document.createElement('div');
    root.className = 'wm go';
    root.innerHTML =
      '<div class="go-field"><canvas class="go-cv" aria-label="Pitch: the ball runs down the lane, tap as it crosses the gold band" role="img"></canvas>' +
      '<div class="go-float" role="status" aria-live="polite" hidden></div></div>' +
      '<div class="go-low"><ol class="go-circles" aria-label="Balls this over">' + circlesHtml() + '</ol>' +
      '<button type="button" class="c-btn c-btn--primary c-btn--cta go-pad" data-go="pad"><span class="go-pad-t">TAP</span></button></div>' +
      '<button type="button" class="go-recal" data-go="recal">Recalibrate</button>';
    el.innerHTML = ''; el.appendChild(root);
    cv = root.querySelector('.go-cv'); cx = cv.getContext('2d');
    const pad = root.querySelector('.go-pad');
    pad.style.touchAction = 'none';
    pad.addEventListener('pointerdown', onPad);
    pad.addEventListener('click', (e) => { if (e.detail === 0) onPad(e); }); // keyboard Enter / Space only (a pointer tap already ran in pointerdown)
    root.querySelector('.go-recal').addEventListener('click', () => { if (S.phase === 'ready' && S.i === 0 && !S.started) recal(); });
    addEventListener('resize', fit); document.addEventListener('keydown', onKey, true);
    paintCircles(); setPad(S.i ? 'TAP to continue' : 'TAP to start', true);
    fit(); raf = requestAnimationFrame(frame);
  }
  function onKey(e) { if (e.key === 'Escape') e.stopPropagation(); }
  function recal() { // before the first tap only; the over is already locked, so this re-runs the 10 beat screen and comes back
    cancelAnimationFrame(raf); const keep = root; root = null;
    calH = openCalibration(calHolder(), { onDone(offset, n) { calH = null; dispatch('GoldenCal', { offset, n }); back(); }, onCancel() { calH = null; back(); } });
    function back() { if (closed) return; root = keep; el.innerHTML = ''; el.appendChild(root); cv = root.querySelector('.go-cv'); cx = cv.getContext('2d'); fit(); S.gvm = getVM() || S.gvm; raf = requestAnimationFrame(frame); }
  }
  function setPad(txt, big) { const p = root.querySelector('.go-pad-t'); if (p) p.textContent = txt; root.classList.toggle('is-ready', !!big); }
  function paintCircles() {
    const cs = root.querySelectorAll('.go-c');
    cs.forEach((c, i) => {
      const t = S.taps[i];
      if (t && t.g) c.setAttribute('data-grade', t.g); else c.removeAttribute('data-grade');
      c.className = 'go-c' + (t ? ' is-filled k-' + kindOf(t.o) + ' g-' + (t.g || 'G') : '') + (!t && i === S.i && S.phase !== 'done' ? ' is-next' : '') + (S.phase === 'done' ? ' is-gold' : '');
      c.textContent = t ? String(t.o) : '';
      c.setAttribute('aria-label', t ? 'Ball ' + (i + 1) + ': ' + ballText(t.g, t.o).word.toLowerCase() + ', ' + ballText(t.g, t.o).res.toLowerCase() : 'Ball ' + (i + 1) + (i === S.i ? ', next' : ''));
    });
  }
  function fit() {
    if (!cv) return; const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); cx.setTransform(d, 0, 0, d, 0, 0);
  }
  function float(html, cls, ms) {
    const f = root.querySelector('.go-float'); if (!f) return;
    f.className = 'go-float' + (cls ? ' ' + cls : ''); if (cls === 'is-sum') f.setAttribute('data-go', 'summary'); else f.removeAttribute('data-go'); f.innerHTML = html; f.hidden = false;
    clearTimeout(S.floatT); if (ms) S.floatT = later(() => { f.hidden = true; }, ms);
  }

  // ----- play -----
  function onPad(ev) {
    ev.preventDefault && ev.preventDefault();
    try { beat.prime(); } catch (e) { /* audio is optional */ }
    const pad = root.querySelector('.go-pad');
    if (S.phase === 'done') return;
    if (!reduced()) { pad.classList.add('is-flash'); later(() => pad.classList.remove('is-flash'), 80); }
    if (S.phase === 'ready') { S.started = true; root.querySelector('.go-recal').hidden = true; startBall(); return; }
    if (S.phase === 'ball') {
      const b = S.b, t = tapTime(ev);
      if (b.tapped || t < b.startT - STRAY) return;
      b.tapped = true; b.tapPos = (t - b.startT) / TRAVEL;
      resolve(t - b.hitT, false);
    }
  }
  function startBall() {
    const now = performance.now(), g = S.gvm;
    S.b = { startT: now + LEAD, hitT: now + LEAD + TRAVEL, tapped: false, ticks: 0, win: g && g.win ? g.win : { p: 55, g: 120 }, offset: g ? g.offset || 0 : 0 };
    if (dbg) window.__goDebug = { crossTime: () => (S.b && S.phase === 'ball' ? S.b.hitT : null) };
    root.dataset.hit = String(Math.round(S.b.hitT)); root.dataset.ball = String(S.taps.length); // read by test/e2e/golden-over.mjs
    S.phase = 'ball'; setPad('TAP', false); float('', '', 0); root.querySelector('.go-float').hidden = true; paintCircles();
  }
  function resolve(err, miss) {
    const b = S.b; if (b.res !== undefined) return; b.res = null;
    const n0 = S.taps.length;
    dispatch('GoldenTap', miss ? { err: null, miss: true } : { err });
    let g = getVM(), t = g && g.active ? g.taps[n0] : null, tapsNow = g && g.active ? g.taps : null;
    let fin = !g || !g.active || (g.taps && g.taps.length >= 6);
    if (!t) { // the sixth tap (or the innings end) commits the over: read the result from the committed over
      const L = lastOver(); const i = n0;
      if (L && L.balls && L.balls[i]) { t = { g: L.taps && L.taps[i] ? L.taps[i].g : 'G', ball: L.balls[i].o }; tapsNow = L.balls.map((x, k) => ({ g: L.taps && L.taps[k] ? L.taps[k].g : 'G', ball: x.o })); fin = true; }
    }
    if (tapsNow && tapsNow.length > S.taps.length) S.taps = tapsNow.map((x, k) => (k === n0 && t ? { g: t.g, o: t.ball } : { g: x.g, o: x.ball })); else if (t) S.taps.push({ g: t.g, o: t.ball });
    else S.taps.push({ g: miss ? 'M' : 'G', o: 0 });
    const cur = S.taps[S.taps.length - 1];
    b.grade = cur.g; b.res = cur.o; b.doneT = performance.now(); b.err = err; b.miss = miss;
    const tx = ballText(cur.g, cur.o), ms = miss || err == null ? 'no tap' : Math.abs(Math.round(err - b.offset)) + ' ms ' + (err - b.offset < 0 ? 'early' : 'late');
    float('<b class="go-fw go-g-' + cur.g + '">' + tx.word + '</b><span class="go-fr k-' + kindOf(cur.o) + '">' + esc(tx.res) + '</span><small>' + esc(ms) + '</small>', 'is-show', GAP - 100);
    try { beat.hit(cur.g); } catch (e) { /* audio optional */ }
    if (cur.g === 'P' && !reduced()) { b.hitStopUntil = performance.now() + 40; S.hitStopUntil = b.hitStopUntil; S.shakeUntil = performance.now() + 220; }
    if (cur.g === 'P') { try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* ignore */ } }
    S.phase = 'gap'; paintCircles();
    if (!fin) S.gvm = g;
    later(() => { if (closed) return; if (fin) finish(); else { S.i = S.taps.length; S.gvm = getVM() || S.gvm; startBall(); } }, GAP);
  }
  function finish() {
    root.dataset.done = '1';
    S.phase = 'done'; S.i = 6; paintCircles();
    const avg = S.gvm ? S.gvm.wheelAvg : null, st = stageNow();
    const nx = st === 'done' ? 'See result' : st === 'break' ? 'Innings break' : 'NEXT OVER';
    float('<b class="go-sumh">Captain\'s Over</b><span class="go-sumt">' + esc(summaryText(S.taps, avg)) + '</span>', 'is-sum', 0);
    const pad = root.querySelector('.go-pad'); pad.setAttribute('data-go', 'next'); pad.classList.remove('is-ready'); setPad(nx, false);
    pad.removeEventListener('pointerdown', onPad); pad.addEventListener('click', () => exit(), { once: true }); pad.focus();
  }

  // ----- canvas -----
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!cv || !cv.isConnected) return;
    const now = performance.now();
    const b = S.b;
    if (b && S.phase === 'ball') { // beat ticks at 800 / 400 / 0 ms before the cross, frame-synced
      while (b.ticks < 3 && now >= b.hitT - TRAVEL + b.ticks * (TRAVEL / 2)) { try { beat.tick(b.ticks < 2 ? 'pre' : 'cross'); } catch (e) { /* optional */ } b.ticks++; }
      if (!b.tapped && now > b.hitT + b.win.g + b.offset + MISS_PAD) { b.tapped = true; b.tapPos = undefined; resolve(null, true); }
    }
    if (now < S.hitStopUntil) return; // Perfect hit-stop: 40 ms on the last frame
    draw(now);
  }
  function draw(now) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    cx.clearRect(0, 0, w, h);
    const shaking = now < S.shakeUntil;
    cx.save(); if (shaking) cx.translate(Math.round((Math.random() - .5) * 4), Math.round((Math.random() - .5) * 4));
    const art = artOn(), L = layoutOf(w, h), { k, lw, lx, y0, yL, band } = L;
    cx.imageSmoothingEnabled = !art;
    const yB = art ? 54 * k : y0;
    if (art) {
      const s = lw / 203, gw = 1344 * s, gh = 1792 * s, dx = lx - 671.5 * s; cx.imageSmoothingEnabled = false;
      for (let y = 0; y < h; y += gh) cx.drawImage(IMG.ground, dx, y, gw, gh);
      band3(Math.round(lx - lw / 2 - 10 * k), Math.round(yL - band / 2), Math.round(lw + 20 * k), band, k);
    } else {
      cx.fillStyle = '#2e6b3f'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#c9b27a'; cx.fillRect(lx - lw / 4, 0, lw / 2, h);
      cx.fillStyle = '#e6b422'; cx.globalAlpha = .9; cx.fillRect(lx - lw / 2 - 10, yL - band / 2, lw + 20, band); cx.globalAlpha = 1;
    }
    const b = S.b, live = !!b && (S.phase === 'ball' || S.phase === 'gap'), u0 = b ? (now - b.startT) / TRAVEL : -1;
    if (art) {
      for (const [fx, fy, fk] of FIELD) spr('fielder-' + fk, w * fx, Math.min(h * fy + 20 * k, h - 3), k, 22 * k);
      const bandL = lx - lw / 2 - 10 * k, yb = yL + band / 2 + 2 * k;
      const wk = live && S.phase === 'gap' && b.res === 'W';
      spr(wk ? 'stumps-broken' : 'stumps', lx, yL + band / 2 + 24 * k, k, 22 * k);
      let bf = 'batter-stance';
      if (live) { const g = b.grade; if (g === 'P' || g === 'G') bf = 'batter-hit'; else if (g === 'M') bf = 'batter-miss'; else if (u0 >= .72 && u0 < 1.1) bf = 'batter-backswing'; }
      let bx = bandL - 11 * k, bdy = 0;
      const running = live && S.phase === 'gap' && b.doneT && [1, 2, 3].includes(b.res) && !reduced();
      if (running) { const t = now - b.doneT; bf = Math.floor(t / 140) % 2 ? 'batter-run2' : 'batter-run1'; bdy = Math.sin(Math.PI * Math.min(1, t / 700)) * 6 * k; bx = bandL - 3 * k - IMG[bf].naturalWidth * k / 2; }
      else if (bf === 'batter-miss') bx = bandL - k - IMG[bf].naturalWidth * k / 2;
      spr(bf, bx, yb - bdy, k, 22 * k, bdy);
      let wf = Math.floor(now / 200) % 2 ? 'bowler-runup2' : 'bowler-runup1';
      if (live && u0 >= 0) wf = u0 < .18 ? 'bowler-release' : 'bowler-follow';
      spr(wf, lx, y0 + 44 * k, k, 20 * k);
    }
    if (b && (S.phase === 'ball' || S.phase === 'gap')) {
      if (u0 >= 0 && u0 < 1.35 && !(b.tapped && b.doneT)) {
        const y = yB + (yL - yB) * u0; // linear travel (also with reduced motion)
        if (art) {
          shade(lx, y + 8 * k, 12 * k);
          for (let i = 1; i <= 3; i++) { const ty = y - (5 + i * 7) * k; if (ty > yB - 4 * k) { cx.globalAlpha = .7 - i * .2; cx.drawImage(IMG.dash, Math.round(lx - 6 * k), Math.round(ty - k), 12 * k, 3 * k); } }
          cx.globalAlpha = 1; cx.drawImage(IMG['ball-' + (Math.floor(now / 70) % 4)], Math.round(lx - 7 * k), Math.round(y - 7 * k), 14 * k, 14 * k);
        } else { cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(lx, y, 6 * k, 0, 6.3); cx.fill(); }
      }
      if (b.tapped && b.tapPos !== undefined && b.grade) { // tap tick on the lane: where you were, coloured by grade
        const y = yB + (yL - yB) * b.tapPos; cx.strokeStyle = GCOL[b.grade] || '#fff'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(lx - lw / 2 - 14 * k, y); cx.lineTo(lx + lw / 2 + 14 * k, y); cx.stroke();
      }
    }
    cx.restore();
  }
  function shade(x, y, sw) { const s = IMG.shadow, h = sw * s.naturalHeight / s.naturalWidth; cx.globalAlpha = .35; cx.drawImage(s, Math.round(x - sw / 2), Math.round(y - h / 2), sw, h); cx.globalAlpha = 1; }
  function band3(x, y, w, h, k) { const im = IMG.band, c = 6, sw = im.naturalWidth, sh = im.naturalHeight; cx.drawImage(im, 0, 0, c, sh, x, y, c * k, h); cx.drawImage(im, c, 0, sw - 2 * c, sh, x + c * k, y, w - 2 * c * k, h); cx.drawImage(im, sw - c, 0, c, sh, x + w - c * k, y, c * k, h); }
  function spr(n, x, yb, k, shadowW, sdy) { const im = IMG[n], w = im.naturalWidth * k, h = im.naturalHeight * k; if (shadowW) shade(x, yb - k + (sdy || 0), shadowW); cx.drawImage(im, Math.round(x - w / 2), Math.round(yb - h), w, h); }

  return { close };
}
