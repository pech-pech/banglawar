import { hashSeed, dailySeedString } from './rng.js';
import { cfg, isDefault, diffFromDefault } from './config.js';
import { createCourse } from './terrain.js';
import { FIXED_DT, createSled, stepSled } from './sled.js';
import { medalTimes, medalFor, MEDALS } from './medals.js';
import { createView } from './render.js';
import { createHud } from './hud.js';
import { getThemeId, setThemeId, createThemePicker } from './themeui.js';
import { THEMES } from './themes.js';
import { createTelemetry, deviceInfo } from './telemetry.js';
import { createTweak, buildReport, copyText, getVisualPrefs, onVisualPrefs, isVisualDefault } from './tweak.js';

const BUILD = 'ridgeline-proto-8';
const BEST_KEY = 'ridgeline.best.v1';
const COUNTER_KEY = 'ridgeline.counter.v1';
const MAX_STEPS = 8;
// look-still hook (?still=1): deterministic frame, sim frozen once gate 2 is the next gate. Not a shipped path.
const STILL = new URLSearchParams(location.search).get('still') === '1';
let stillState = 0; // 0 pending, 1 frozen
const STILLFX = STILL ? new URLSearchParams(location.search).get('stillfx') : null; // still-only: 1 = mid-boost carving, 2 = crash shred burst
function stillAdvance() {
  const run = (n, drawEvery, inp) => {
    for (let i = 0; i < n && !state.crashed && !state.finished; i++) {
      stepSled(state, course, inp || { steer: 0, fire: false }, cfg);
      if (drawEvery && i % drawEvery === 0 && view) view.draw(state, state.t);
    }
  };
  let n = 0;
  const SG = +(new URLSearchParams(location.search).get('stillgate')) || 2; // still-only: freeze when gate SG is next
  while (state.nextGate < SG && n < 60000 && !state.crashed) { stepSled(state, course, { steer: 0, fire: false }, cfg); n++; }
  const total = n;
  state = createSled(course);
  if (STILLFX === '1') {
    // pose: from step s0 fire a boost, then carve (steer) until gate 1 is passed, freeze a little after the pass
    const s0 = Math.max(0, total - 330);
    run(s0, 0);
    state.boost = 1;
    const plan = (k) => ({ steer: k > 150 ? 0.7 : 0, fire: k === 170 });
    let k = 0, pass = -1;
    while (k < 600 && !state.crashed && pass < 0 + 0) { stepSled(state, course, plan(k), cfg); if (k > 150 && k % 2 === 0 && view) view.draw(state, state.t); if (state.nextGate >= 2) pass = k; k++; }
    window.__pass = pass;
    for (let j = 0; j < 4; j++) { stepSled(state, course, plan(k + j), cfg); if (j % 2 === 0 && view) view.draw(state, state.t); }
  } else {
    run(Math.max(0, total - 120), 0);
    run(120, 2);
    if (STILLFX === '2' && view) view.fx({ type: 'crash', x: state.x, rockId: -1 });
  }
  window.__stillInfo = { steps: total, nextGate: state.nextGate, z: state.z, crashed: !!state.crashed, speed: state.speed, vx: state.vx, boostT: state.boostT, stats: view && view.stats ? view.stats() : null };
  stillState = 1;
}
const tele = createTelemetry();
let gpuStr = null;
function gpuName() {
  if (gpuStr !== null) return gpuStr;
  gpuStr = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const x = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (x) gpuStr = String(gl.getParameter(x.UNMASKED_VENDOR_WEBGL)) + ' / ' + String(gl.getParameter(x.UNMASKED_RENDERER_WEBGL));
    const l = gl && gl.getExtension('WEBGL_lose_context');
    if (l) l.loseContext();
  } catch (e) { /* ignore */ }
  return gpuStr;
}

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

let state = null;
let course = null;
let view = null;
let builtCfg = '';
let mode = 'daily';
let seedStr = '';
let seedInt = 0;
let phase = 'menu'; // menu | run | end
let lastResult = null;
let crashZ = null;

// input
const input = { steer: 0, fire: false };
let fireNext = false;
let pointerId = null;
let startX = 0;
const keys = { left: false, right: false };

// timing
let last = 0;
let acc = 0;
let fpsAvg = 0;
let fpsSum = 0;
let fpsN = 0;
const fpsWin = [];
let fpsNow = 0;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

function loadBest() {
  try { return JSON.parse(lsGet(BEST_KEY)) || {}; } catch (e) { return {}; }
}
function bestFor(key) {
  const b = loadBest()[key];
  return typeof b === 'number' ? b : null;
}
function saveBest(key, time) {
  try {
    const all = loadBest();
    if (typeof all[key] !== 'number' || time < all[key]) {
      all[key] = time;
      lsSet(BEST_KEY, JSON.stringify(all));
    }
  } catch (e) { /* ignore */ }
}

function pickSeed(m) {
  if (m === 'daily') return dailySeedString(new Date());
  let n = parseInt(lsGet(COUNTER_KEY) || '0', 10);
  if (!Number.isFinite(n)) n = 0;
  n += 1;
  lsSet(COUNTER_KEY, String(n));
  return 'random-' + n;
}

function size() {
  return [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)];
}

function buildCourse() {
  if (view) { try { view.dispose(); } catch (e) { /* ignore */ } view = null; }
  course = createCourse(seedInt, cfg);
  view = createView(canvas, course, cfg, getThemeId(), { ...getVisualPrefs(), still: STILL });
  const [w, h] = size();
  view.resize(w, h);
  builtCfg = JSON.stringify(cfg);
}

function begin(m, seedString) {
  mode = m;
  seedStr = seedString;
  seedInt = hashSeed(seedStr);
  // rebuild always: new seed or changed cfg; disposing the old view first
  buildCourse();
  state = createSled(course);
  input.steer = 0; input.fire = false; fireNext = false;
  acc = 0; last = 0; fpsSum = 0; fpsN = 0; fpsAvg = 0; crashZ = null;
  tele.reset(performance.now());
  phase = 'run';
  hud.showRun();
  hud.setDev(!isDefault() || !isVisualDefault());
}

function startMode(m) { begin(m, pickSeed(m)); }

function retry() {
  // same seed; rebuild only if cfg changed, else reuse course
  if (!course || JSON.stringify(cfg) !== builtCfg) { begin(mode, seedStr); return; }
  state = createSled(course);
  input.steer = 0; input.fire = false; fireNext = false;
  acc = 0; last = 0; fpsSum = 0; fpsN = 0; fpsAvg = 0; crashZ = null;
  tele.reset(performance.now());
  phase = 'run';
  hud.showRun();
  hud.setDev(!isDefault() || !isVisualDefault());
}

const MEDAL_KEY = 'ridgeline.medal.v1';
function saveMedal(key, name) {
  if (!name) return;
  try {
    let all = {};
    try { all = JSON.parse(lsGet(MEDAL_KEY)) || {}; } catch (e) { all = {}; }
    const old = MEDALS.indexOf(all[key]);
    if (old < 0 || MEDALS.indexOf(name) < old) { all[key] = name; lsSet(MEDAL_KEY, JSON.stringify(all)); }
  } catch (e) { /* ignore */ }
}
function flowInfo() {
  const s = state || {};
  return {
    peak: s.flowPeak || 0, links: s.links || 0, razors: s.razors || 0, inners: s.inners || 0,
    centred: s.centred || 0, boostLinks: s.boostLinks || 0, flow5T: Math.round((s.flow5T || 0) * 10) / 10,
  };
}

function endRun() {
  phase = 'end';
  const finished = !!state.finished;
  const crashed = !!state.crashed;
  if (crashed) crashZ = state.z;
  if (finished) tele.finish();
  const key = mode + ':' + seedStr;
  if (finished) saveBest(key, state.t);
  const result = finished ? 'finish' : (crashed ? 'crash' : 'end');
  const hidden = !isDefault() || !isVisualDefault();
  const times = medalTimes(course, cfg);
  let medal = { name: null, next: null, gap: null, hidden };
  if (finished && !hidden) {
    medal = Object.assign(medalFor(state.t, times), { hidden: false });
    saveMedal(key, medal.name);
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  lastResult = {
    result, time: state.t, gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed,
    flow: flowInfo(),
    medal: { name: medal.name, gold: r1(times.gold), summit: r1(times.summit), hidden },
  };
  hud.showEnd({
    medal, flowPeak: state.flowPeak || 0,
    finished, crashed, time: state.t, z: state.z,
    gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed,
    best: bestFor(key),
  });
}

function buildInfo() {
  return {
    build: BUILD, seed: seedStr, mode,
    result: lastResult ? lastResult.result : (phase === 'run' ? 'running' : 'none'),
    time: lastResult ? lastResult.time : (state ? state.t : 0),
    gatesPassed: lastResult ? lastResult.gatesPassed : (state ? state.gatesPassed : 0),
    gatesMissed: lastResult ? lastResult.gatesMissed : (state ? state.gatesMissed : 0),
    crashZ,
    flow: lastResult ? lastResult.flow : flowInfo(),
    medal: lastResult ? lastResult.medal : null,
    fpsAvg: fpsN ? fpsSum / fpsN : fpsAvg,
    stats: view ? view.stats() : { calls: 0, triangles: 0 },
    diff: diffFromDefault(),
    theme: getThemeId(),
    tele: tele.snapshot(),
    device: deviceInfo(null, gpuName()),
  };
}

function copyReport() {
  const info = buildInfo();
  Promise.resolve(copyText(buildReport(info))).then((ok) => {
    hud.toast(ok ? 'Report copied' : 'Copy failed');
  }, () => hud.toast('Copy failed'));
}

const hud = createHud(ui, {
  onStart: startMode,
  onRetry: retry,
  onMenu() { phase = 'menu'; },
  onSettings() { tweak.open(); },
  onCopyReport: copyReport,
});
const pickers = [];
function applyTheme(id) {
  if (!Object.prototype.hasOwnProperty.call(THEMES, id)) return false;
  setThemeId(id);
  const t = THEMES[id];
  const root = document.documentElement;
  if (t.uiAccent) {
    root.style.setProperty('--rl-accent', t.uiAccent);
    const n = parseInt(t.uiAccent.slice(1), 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    root.style.setProperty('--rl-ink', lum > 0.5 ? '#10141c' : '#ffffff');
  }
  hud.setThemeLabel(t.name || id);
  if (view) {
    if (typeof view.setTheme === 'function') view.setTheme(id);
    else { try { view.dispose(); } catch (e) { /* ignore */ } view = createView(canvas, course, cfg, id, { ...getVisualPrefs(), still: STILL }); const [w, h] = size(); view.resize(w, h); }
  }
  for (const p of pickers) p.refresh();
  return true;
}
const startPicker = createThemePicker(hud.themeMount, { onChange: (id) => applyTheme(id) });
const settingsPicker = createThemePicker(null, { onChange: (id) => applyTheme(id) });
pickers.push(startPicker, settingsPicker);
const tweak = createTweak(ui, { themeEl: settingsPicker.el, onChange() { hud.setDev(!isDefault() || !isVisualDefault()); } });
applyTheme(getThemeId());
onVisualPrefs(() => {
  hud.setDev(!isDefault() || !isVisualDefault());
  if (!view) return;
  try { view.dispose(); } catch (e) { /* ignore */ }
  view = createView(canvas, course, cfg, getThemeId(), { ...getVisualPrefs(), still: STILL });
  const [w, h] = size(); view.resize(w, h);
});

hud.showStart({ build: BUILD, dailySeed: dailySeedString(new Date()), best: bestFor('daily:' + dailySeedString(new Date())) });
hud.setDev(!isDefault() || !isVisualDefault());

// ---- input ----
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Listen on window: the HUD root sits over the canvas full-screen and takes the
// touches (#ui > * gets pointer-events:auto), so canvas listeners never fired on phones.
function isControl(t) {
  return !!(t && t.closest && t.closest('button, input, select, textarea, a, label'));
}
window.addEventListener('pointerdown', (e) => {
  if (phase === 'run' && !tweak.isOpen()) {
    if (isControl(e.target)) tele.touchIgnored(performance.now(), true);
    else if (pointerId !== null) tele.touchIgnored(performance.now(), false);
  }
  if (phase !== 'run' || pointerId !== null || isControl(e.target) || tweak.isOpen()) return;
  tele.touchDown(performance.now(), e.clientX, e.clientY);
  pointerId = e.pointerId;
  startX = e.clientX;
  input.steer = 0;
  try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  tele.touchMove(e.clientX, e.clientY);
  input.steer = clamp((e.clientX - startX) / 80, -1, 1);
  e.preventDefault();
});
function release(e, fire) {
  if (e.pointerId !== pointerId) return;
  tele.touchUp(performance.now(), state ? state.boost : 0, !!(fire && phase === 'run'));
  pointerId = null;
  input.steer = 0;
  if (fire && phase === 'run') fireNext = true;
}
window.addEventListener('pointerup', (e) => release(e, true));
window.addEventListener('pointercancel', (e) => release(e, false));
for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(ev, (e) => {
    // touchmove inside a scrollable panel (Settings/Tweak, theme list, menus) must scroll natively: never block it there
    if (ev === 'touchmove' && e.target && e.target.closest && e.target.closest('.rlt, .rlh-themebody, .rlh-screen')) return;
    if (ev !== 'touchstart' || (phase === 'run' && !isControl(e.target))) e.preventDefault();
  }, { passive: false });
}

window.addEventListener('keydown', (e) => {
  if (phase === 'run' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) tele.key();
  if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space') { if (phase === 'run' && !e.repeat) fireNext = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') keys.left = false;
  else if (e.code === 'ArrowRight') keys.right = false;
});

function currentSteer() {
  if (pointerId !== null) return input.steer;
  return (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}

// ---- resize / visibility ----
function onResize() {
  if (!view) return;
  const [w, h] = size();
  view.resize(w, h);
}
window.addEventListener('resize', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { last = 0; });

// ---- loop ----
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = 0; return; }
  if (!last) { last = now; return; }
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0) {
    const inst = 1 / dt;
    fpsWin.push(inst);
    if (fpsWin.length > 30) fpsWin.shift();
    let s = 0; for (const v of fpsWin) s += v;
    fpsNow = s / fpsWin.length;
    if (phase === 'run' && !tweak.isOpen()) tele.frame(dt * 1000);
    if (phase === 'run') { fpsSum += inst; fpsN++; fpsAvg = fpsSum / fpsN; }
  }
  if (phase !== 'run' || !state) return;
  if (STILL) {
    if (!stillState) stillAdvance();
    if (view) view.draw(state, state.t);
    hud.update(state, fpsNow);
    return;
  }
  if (tweak.isOpen()) { hud.update(state, fpsNow); return; }

  acc += Math.min(dt, 0.25);
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS && phase === 'run') {
    input.steer = currentSteer();
    const fire = fireNext;
    fireNext = false;
    const inp = { steer: input.steer, fire };
    const evs = stepSled(state, course, inp, cfg);
    tele.step(FIXED_DT, input.steer, state.speed, state.charging, Math.abs(state.x - course.centerX(state.z)) > course.halfWidth(state.z));
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (typeof hud !== 'undefined' && hud && typeof hud.event === 'function') hud.event(ev);
      if (view && typeof view.fx === 'function') view.fx(ev);
      if (ev.type === 'boost') tele.boost(ev.amount);
      else if (ev.type === 'crash') {
        let rk = null;
        for (const r of state._rocks) if (r.id === ev.rockId) { rk = r; break; }
        tele.crash({ rockId: ev.rockId, rockX: rk ? rk.x : NaN, rockZ: rk ? rk.z : NaN, sledX: ev.x, vx: state.vx });
      }
    }
    acc -= FIXED_DT;
    steps++;
    if (state.crashed || state.finished) { endRun(); break; }
  }
  if (steps >= MAX_STEPS) acc = 0;
  if (view) view.draw(state, now / 1000);
  hud.update(state, fpsNow);
}
requestAnimationFrame(frame);

window.__ridgeline = {
  get state() { return state; },
  get course() { return course; },
  cfg,
  get view() { return view; },
  get hud() { return hud; },
  setTheme(id) { return applyTheme(id); },
  start(m) { startMode(m === 'random' ? 'random' : 'daily'); },
  stats() { return view ? view.stats() : null; },
  medals() { return medalTimes(course, cfg); },
  report() { return buildReport(buildInfo()); },
};
