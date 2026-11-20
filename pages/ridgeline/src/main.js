import { hashSeed, dailySeedString } from './rng.js';
import { cfg, isDefault, diffFromDefault } from './config.js';
import { createCourse } from './terrain.js';
import { FIXED_DT, createSled, stepSled } from './sled.js';
import { createView } from './render.js';
import { createHud } from './hud.js';
import { getThemeId, setThemeId, createThemePicker } from './themeui.js';
import { THEMES } from './themes.js';
import { createTweak, buildReport, copyText } from './tweak.js';

const BUILD = 'ridgeline-proto-1';
const BEST_KEY = 'ridgeline.best.v1';
const COUNTER_KEY = 'ridgeline.counter.v1';
const MAX_STEPS = 8;

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
  view = createView(canvas, course, cfg, getThemeId());
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
  phase = 'run';
  hud.showRun();
  hud.setDev(!isDefault());
}

function startMode(m) { begin(m, pickSeed(m)); }

function retry() {
  // same seed; rebuild only if cfg changed, else reuse course
  if (!course || JSON.stringify(cfg) !== builtCfg) { begin(mode, seedStr); return; }
  state = createSled(course);
  input.steer = 0; input.fire = false; fireNext = false;
  acc = 0; last = 0; fpsSum = 0; fpsN = 0; fpsAvg = 0; crashZ = null;
  phase = 'run';
  hud.showRun();
  hud.setDev(!isDefault());
}

function endRun() {
  phase = 'end';
  const finished = !!state.finished;
  const crashed = !!state.crashed;
  if (crashed) crashZ = state.z;
  const key = mode + ':' + seedStr;
  if (finished) saveBest(key, state.t);
  const result = finished ? 'finish' : (crashed ? 'crash' : 'end');
  lastResult = {
    result, time: state.t, gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed,
  };
  hud.showEnd({
    finished, crashed, time: state.t,
    gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed,
    best: bestFor(key),
  });
}

function copyReport() {
  const info = {
    build: BUILD, seed: seedStr, mode,
    result: lastResult ? lastResult.result : (phase === 'run' ? 'running' : 'none'),
    time: lastResult ? lastResult.time : (state ? state.t : 0),
    gatesPassed: lastResult ? lastResult.gatesPassed : (state ? state.gatesPassed : 0),
    gatesMissed: lastResult ? lastResult.gatesMissed : (state ? state.gatesMissed : 0),
    crashZ,
    fpsAvg: fpsN ? fpsSum / fpsN : fpsAvg,
    stats: view ? view.stats() : { calls: 0, triangles: 0 },
    diff: diffFromDefault(),
    theme: getThemeId(),
  };
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
    else { try { view.dispose(); } catch (e) { /* ignore */ } view = createView(canvas, course, cfg, id); const [w, h] = size(); view.resize(w, h); }
  }
  for (const p of pickers) p.refresh();
  return true;
}
const startPicker = createThemePicker(hud.themeMount, { onChange: (id) => applyTheme(id) });
const settingsPicker = createThemePicker(null, { onChange: (id) => applyTheme(id) });
pickers.push(startPicker, settingsPicker);
const tweak = createTweak(ui, { themeEl: settingsPicker.el, onChange() { hud.setDev(!isDefault()); } });
applyTheme(getThemeId());

hud.showStart({ build: BUILD, dailySeed: dailySeedString(new Date()), best: bestFor('daily:' + dailySeedString(new Date())) });
hud.setDev(!isDefault());

// ---- input ----
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

canvas.addEventListener('pointerdown', (e) => {
  if (phase !== 'run' || pointerId !== null) return;
  pointerId = e.pointerId;
  startX = e.clientX;
  input.steer = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  input.steer = clamp((e.clientX - startX) / 80, -1, 1);
  e.preventDefault();
});
function release(e, fire) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  input.steer = 0;
  if (fire && phase === 'run') fireNext = true;
}
canvas.addEventListener('pointerup', (e) => release(e, true));
canvas.addEventListener('pointercancel', (e) => release(e, false));
for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(ev, (e) => { if (e.target === canvas || ev !== 'touchstart') e.preventDefault(); }, { passive: false });
}

window.addEventListener('keydown', (e) => {
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
    if (phase === 'run') { fpsSum += inst; fpsN++; fpsAvg = fpsSum / fpsN; }
  }
  if (phase !== 'run' || !state) return;
  if (tweak.isOpen()) { hud.update(state, fpsNow); return; }

  acc += Math.min(dt, 0.25);
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS && phase === 'run') {
    input.steer = currentSteer();
    const fire = fireNext;
    fireNext = false;
    const inp = { steer: input.steer, fire };
    stepSled(state, course, inp, cfg);
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
  setTheme(id) { return applyTheme(id); },
  start(m) { startMode(m === 'random' ? 'random' : 'daily'); },
  stats() { return view ? view.stats() : null; },
};
