// Windward Line - main.js (M8): boot, fixed-step loop, input, save, window.WL.
import { defaultCfg, cloneCfg, STAGES, PHASE, MAP_W, MAP_H, CELL_PX } from './contract.js';
import { createState, startRun, step, queueCallin, finishRun, hashState } from './sim.js';
import { applyAction, undo, refundAll, rebuild, buildingAt, costOf } from './plan.js';
import { initRender, draw, screenToCell, fitView } from './render.js';
import { initUI } from './ui.js';
import { copyReport, initTweak } from './tweak.js';
import { installTestHook } from './testhook.js';

const SAVE_KEY = 'wl-save-v1';
const params = new URLSearchParams(location.search);

// ---------- save ----------
let save = { unlocked: [], best: {}, seed: 1 };
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (Array.isArray(o.unlocked)) save.unlocked = o.unlocked.filter((s) => typeof s === 'string');
        if (o.best && typeof o.best === 'object') save.best = o.best;
        if (Number.isFinite(o.seed)) save.seed = o.seed | 0;
      }
    }
  } catch (e) { /* storage blocked: run without save */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
loadSave();

// ---------- core vars ----------
const app = document.getElementById('app');
const canvas = document.getElementById('map');
let cfg = cloneCfg(defaultCfg);
let state = null;
let stage = 1;
let seed = save.seed || 1;
let stageForced = false; // ?stage=2 URL lets the tester jump even if locked
let tool = null;         // 'zone'|'break'|'road'|'crew'|'pump'|null
let breakWidth = cfg.breakWidth;
let armed = null;        // 'bomber'|'dozer'|null
let overlay = { preview: null, armed: null, aim: null, selectBuilding: null };
let view = { ox: 0, oy: 0, scale: 1 };
let fit = { scale: 1 };
let rect = { x: 0, y: 0, w: 320, h: 480 };
let cssW = 320, cssH = 480, dpr = 1;
let ui = null, rend = null;
let resultShown = false;
let settingsOpen = false, pausedBeforeSettings = false;
let viewReady = false;

const isUnlocked = (t) => (t === 'dozer' ? save.unlocked.includes('dozer') : true);
const stage2Open = () => save.unlocked.includes('dozer') || stageForced;

function toast(t) { try { ui && ui.toast && ui.toast(t); } catch (e) { /* ignore */ } }

// ---------- state creation ----------
function newState(st, sd) {
  stage = st === 2 ? 2 : 1;
  if (Number.isFinite(sd)) seed = sd | 0;
  state = createState(stage, cfg, seed);
  clearInteraction();
  resultShown = false;
  if (viewReady) fitCamera();
  return state;
}
function rebuildSame(keepPlan) {
  const old = state.plan.slice();
  state = createState(state.stage, cfg, state.seed);
  stage = state.stage;
  for (const a of old) applyAction(state, a);
  clearInteraction();
  resultShown = false;
  if (ui) { ui.hideOverlays(); ui.update(state); }
  return state;
}
function clearInteraction() {
  tool = null; armed = null;
  overlay = { preview: null, armed: null, aim: null, selectBuilding: null };
}

// ---------- api for ui ----------
const api = {
  getState: () => state,
  getTool: () => tool,
  setTool(t) {
    tool = (t && t === tool) ? null : (t || null);
    armed = null; overlay.armed = null; overlay.aim = null; overlay.preview = null; overlay.selectBuilding = null;
    if (ui) ui.update(state);
    return tool;
  },
  setBreakWidth(w) { breakWidth = Math.max(1, Math.min(5, w | 0)); if (ui) ui.update(state); },
  getBreakWidth: () => breakWidth,
  undo() { const r = undo(state); if (r && r.ok === false) toast(r.reason || 'Nothing to undo'); ui.update(state); return r; },
  clearAll() { const r = refundAll(state); ui.update(state); return r; },
  start() {
    if (state.phase !== PHASE.PLAN) return;
    tool = null; overlay.preview = null;
    startRun(state);
    state.speed = state.speed || 1;
    state.paused = false;
    ui.update(state);
  },
  pause(b) { state.paused = !!b; ui.update(state); },
  setSpeed(n) { state.speed = n; ui.update(state); },
  armCallin(type) {
    if (!type || type === armed) armed = null; else armed = type;
    if (armed) { tool = null; overlay.preview = null; } // integrator: disarming must not drop the plan tool
    overlay.aim = null; overlay.armed = armed;
    ui.update(state);
    return armed;
  },
  getArmed: () => armed,
  getPreview: () => overlay.preview,
  retry() { rebuildSame(); api.start(); },
  editPlan() { rebuildSame(); },
  nextStage() { if (state.stage === 1 && stage2Open()) api.goStage(2); },
  goStage(n) {
    n = n === 2 ? 2 : 1;
    if (n === 2 && !stage2Open()) { toast('Win stage 1 first'); return; }
    newState(n, seed);
    ui.hideOverlays(); ui.update(state);
  },
  openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    pausedBeforeSettings = state.paused;
    state.paused = true;
    const el = document.getElementById('settings');
    if (ui && typeof ui.openSettings === 'function') ui.openSettings();
    else if (el) { el.hidden = false; el.classList.add('open'); }
    ui.update(state);
  },
  closeSettings() {
    if (!settingsOpen) return;
    settingsOpen = false;
    state.paused = pausedBeforeSettings;
    const el = document.getElementById('settings');
    if (ui && typeof ui.closeSettings === 'function') ui.closeSettings();
    else if (el) { el.hidden = true; el.classList.remove('open'); }
    ui.update(state);
  },
  getCfg: () => cfg,
  setCfg(c) {
    cfg = cloneCfg(c);
    breakWidth = cfg.breakWidth;
    // integrator: new cfg applies to a fresh PLAN state; the plan is re-applied (actions that no longer fit drop)
    const old = state ? state.plan.slice() : [];
    newState(stage, seed);
    for (const a of old) applyAction(state, a);
    ui.hideOverlays(); ui.update(state);
  },
  setSeed(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return;
    seed = n | 0; save.seed = seed; writeSave();
    newState(stage, seed);
    ui.update(state);
  },
  copyReport() {
    try {
      const r = copyReport(state);
      const done = () => toast('Report copied');
      if (typeof r === 'string') {
        if (navigator.clipboard) navigator.clipboard.writeText(r).then(done, () => toast('Copy blocked')); else toast('Copy blocked');
      } else if (r && typeof r.then === 'function') r.then(done, () => toast('Copy blocked'));
      else done();
    } catch (e) { toast('Copy failed'); }
  },
  isUnlocked,
};

// ---------- layout / camera ----------
function visible(el) {
  if (!el) return null;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}
function computeRect() {
  // integrator: the canvas sits in the #app grid 'map' area (top bar and tray are outside it), so the visible
  // map rect is the whole canvas in canvas-local px. (Old version subtracted window-space bars a second time.)
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  return { x: 0, y: 0, w: Math.max(40, w), h: Math.max(40, h) };
}
function worldCentre() { // visible-rect centre in world px
  return { x: (view.ox + rect.x + rect.w / 2) / view.scale, y: (view.oy + rect.y + rect.h / 2) / view.scale };
}
function setCentre(c) {
  view.ox = c.x * view.scale - (rect.x + rect.w / 2);
  view.oy = c.y * view.scale - (rect.y + rect.h / 2);
}
function computeFit() {
  const f = fitView(rect.w, rect.h);
  fit = { scale: f.scale || 1, ox: f.ox, oy: f.oy };
}
function fitCamera() {
  computeFit();
  view.scale = fit.scale;
  setCentre({ x: MAP_W * CELL_PX / 2, y: MAP_H * CELL_PX / 2 });
}
function clampView() {
  const lo = fit.scale * 0.8, hi = fit.scale * 8;
  view.scale = Math.max(lo, Math.min(hi, view.scale));
  const c = worldCentre();
  c.x = Math.max(0, Math.min(MAP_W * CELL_PX, c.x));
  c.y = Math.max(0, Math.min(MAP_H * CELL_PX, c.y));
  setCentre(c);
}
function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const nw = Math.max(1, Math.round(app.clientWidth || W)), nh = Math.max(1, Math.round(app.clientHeight || H));
  const centre = viewReady ? worldCentre() : null;
  const wasFit = viewReady && Math.abs(view.scale - fit.scale) < 1e-6;
  // integrator: render.js is the single owner of the canvas backing size and dpr transform
  cssW = nw; cssH = nh;
  rect = computeRect();
  const oldFit = fit.scale;
  computeFit();
  if (!viewReady) { fitCamera(); viewReady = true; return; }
  // keep camera centre; if user was at fit zoom, follow the new fit
  if (wasFit) view.scale = fit.scale;
  else view.scale = Math.max(fit.scale * 0.8, view.scale * (fit.scale / oldFit));
  setCentre(centre);
  clampView();
}

// ---------- render ----------
function render() {
  if (!rend || !state) return;
  overlay.armed = armed;
  draw(rend, state, view, overlay);
}

// ---------- input ----------
const ptrs = new Map(); // id -> {x,y}
let gesture = null;     // {kind:'pan'|'draw'|'aim'|'pinch'|'none', ...}
const cvRect = () => canvas.getBoundingClientRect();
function local(e) { const r = cvRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function cellAt(p) { const c = screenToCell(view, p.x, p.y); return { x: Math.floor(c.x), y: Math.floor(c.y) }; }
const clampCell = (c) => ({ x: Math.max(0, Math.min(MAP_W - 1, c.x)), y: Math.max(0, Math.min(MAP_H - 1, c.y)) });

function zoomAt(px, py, factor) {
  const wx = (view.ox + px) / view.scale, wy = (view.oy + py) / view.scale;
  view.scale = Math.max(fit.scale * 0.8, Math.min(fit.scale * 8, view.scale * factor));
  view.ox = wx * view.scale - px; view.oy = wy * view.scale - py;
  clampView();
}
function mid2() {
  const a = [...ptrs.values()];
  return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 };
}
function costInfo(action) {
  let cost = 0, ok = true;
  try {
    const c = costOf(state, action);
    if (typeof c === 'number') cost = c;
    else if (c && typeof c === 'object') { cost = c.cost || 0; if (c.ok === false) ok = false; }
  } catch (e) { ok = false; }
  if (cost > state.money) ok = false;
  return { cost, ok };
}
function buildAction(g, cur) {
  if (tool === 'zone') {
    const x = Math.min(g.c0.x, cur.x), y = Math.min(g.c0.y, cur.y);
    return { t: 'zone', x, y, w: Math.abs(cur.x - g.c0.x) + 1, h: Math.abs(cur.y - g.c0.y) + 1 };
  }
  if (tool === 'break') return { t: 'break', x0: g.c0.x, y0: g.c0.y, x1: cur.x, y1: cur.y, width: breakWidth };
  if (tool === 'road') return { t: 'road', x0: g.c0.x, y0: g.c0.y, x1: cur.x, y1: cur.y };
  return null;
}
function previewFor(a) {
  const { cost, ok } = costInfo(a);
  const p = { t: a.t, ok, cost };
  if (a.t === 'zone') Object.assign(p, { x: a.x, y: a.y, w: a.w, h: a.h, x0: a.x, y0: a.y, x1: a.x + a.w - 1, y1: a.y + a.h - 1 });
  else Object.assign(p, { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, width: a.width });
  return p;
}
function inPlan() { return state.phase === PHASE.PLAN && !settingsOpen; }

canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = local(e);
  ptrs.set(e.pointerId, p);
  if (ptrs.size >= 2) {
    const m = mid2();
    gesture = { kind: 'pinch', mx: m.x, my: m.y, d: m.d };
    overlay.preview = null; overlay.aim = null;
    return;
  }
  const c = clampCell(cellAt(p));
  if (armed && state.phase === PHASE.RUN) {
    gesture = { kind: 'aim' }; overlay.aim = { x: c.x, y: c.y };
  } else if (tool && inPlan()) {
    if (tool === 'crew' || tool === 'pump') {
      const b = buildingAt(state, c.x, c.y);
      gesture = { kind: 'tap', c0: c, p0: p };
      overlay.selectBuilding = b ? b.id : null;
    } else {
      gesture = { kind: 'draw', c0: c };
      overlay.preview = previewFor(buildAction(gesture, c));
    }
  } else {
    gesture = { kind: 'pan', last: p };
  }
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const p = local(e);
  ptrs.set(e.pointerId, p);
  if (!gesture) return;
  if (gesture.kind === 'pinch' && ptrs.size >= 2) {
    const m = mid2();
    view.ox -= m.x - gesture.mx; view.oy -= m.y - gesture.my;
    zoomAt(m.x, m.y, m.d / gesture.d);
    gesture.mx = m.x; gesture.my = m.y; gesture.d = m.d;
    return;
  }
  const c = clampCell(cellAt(p));
  if (gesture.kind === 'pan') {
    view.ox -= p.x - gesture.last.x; view.oy -= p.y - gesture.last.y;
    gesture.last = p; clampView();
  } else if (gesture.kind === 'aim') {
    overlay.aim = { x: c.x, y: c.y };
  } else if (gesture.kind === 'draw') {
    overlay.preview = previewFor(buildAction(gesture, c));
  } else if (gesture.kind === 'tap') {
    const b = buildingAt(state, c.x, c.y);
    overlay.selectBuilding = b ? b.id : null;
  }
  e.preventDefault();
});

function endPointer(e, cancelled) {
  if (!ptrs.has(e.pointerId)) return;
  const p = local(e);
  ptrs.delete(e.pointerId);
  const g = gesture;
  if (g && g.kind === 'pinch') {
    if (ptrs.size === 1) { const [rest] = ptrs.values(); gesture = { kind: 'none', last: rest }; } // finger lift ends gesture
    if (ptrs.size === 0) gesture = null;
    return;
  }
  gesture = null;
  if (!g || cancelled) { overlay.preview = null; overlay.aim = null; overlay.selectBuilding = null; return; }
  const c = clampCell(cellAt(p));
  if (g.kind === 'aim') {
    const r = queueCallin(state, armed, c.x, c.y);
    overlay.aim = null;
    if (r && r.ok === false) toast(r.reason || 'Call-in refused');
    else { armed = null; overlay.armed = null; }
    ui.update(state);
  } else if (g.kind === 'draw') {
    const a = buildAction(g, c);
    overlay.preview = null;
    if (a && inPlan()) {
      const r = applyAction(state, a);
      if (r && r.ok === false) toast(r.reason || 'Cannot build there');
      ui.update(state);
    }
  } else if (g.kind === 'tap') {
    overlay.selectBuilding = null;
    const b = buildingAt(state, c.x, c.y);
    if (b && inPlan()) {
      const r = applyAction(state, { t: tool, buildingId: b.id });
      if (r && r.ok === false) toast(r.reason || 'Cannot place there');
      ui.update(state);
    } else if (inPlan()) toast('Tap a building');
  }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = local(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Space') {
    if (state.phase === PHASE.RUN) { e.preventDefault(); api.pause(!state.paused); }
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    if (state.phase === PHASE.RUN) api.setSpeed([1, 2, 4][+e.key - 1]);
  } else if (e.key === 'Escape') {
    if (settingsOpen) api.closeSettings();
    else { tool = null; armed = null; overlay.armed = null; overlay.preview = null; overlay.aim = null; ui.update(state); }
  }
});

// ---------- result handling ----------
function onResult() {
  resultShown = true;
  const r = state.result;
  if (r) {
    const prev = save.best[state.stage] || 0;
    if (r.pct > prev) save.best[state.stage] = r.pct;
  }
  let newUnlock = false;
  if (r && r.win && state.stage === 1 && !save.unlocked.includes('dozer')) { save.unlocked.push('dozer'); newUnlock = true; }
  save.seed = seed; writeSave();
  ui.update(state);
  ui.showResult(state);
  if (newUnlock) ui.showUnlock('Call it in during a run to cut a fuel neck. Lands 10 s after you aim.');
}

// ---------- loop ----------
let last = 0, acc = 0, uiAcc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
  last = t;
  try {
    if (state.phase === PHASE.RUN && !state.paused) {
      acc += dt * (state.speed || 1) / cfg.tickSec;
      let n = Math.min(8, Math.floor(acc));
      acc -= n; if (acc > 8) acc = 0;
      while (n-- > 0 && state.phase === PHASE.RUN) step(state);
    } else acc = 0;
    if (state.phase === PHASE.RESULT && !resultShown) onResult();
    uiAcc += dt;
    if (uiAcc >= 0.1) { uiAcc = 0; ui.update(state); }
    render();
  } catch (err) { console.error(err); }
}

// ---------- boot ----------
function boot() {
  const qs = Number(params.get('seed')), qst = Number(params.get('stage'));
  if (params.has('seed') && Number.isFinite(qs)) seed = qs | 0;
  let st = 1;
  if (qst === 2) { st = 2; stageForced = true; }
  resize();
  rend = initRender(canvas);
  ui = initUI(app, api); // integrator: style.css lays out topbar/map/tray as #app grid areas
  try { initTweak(document.getElementById('tweak-panel'), api.getCfg, api.setCfg); } catch (e) { console.error(e); }
  newState(st, seed);
  resize();
  ui.update(state);
  if (params.get('bench') === '1') {
    newState(2, seed);
    startRun(state);
    const t0 = performance.now();
    for (let i = 0; i < 600 && state.phase === PHASE.RUN; i++) step(state);
    const ms = (performance.now() - t0) / 600;
    toast('bench: ' + ms.toFixed(3) + ' ms/tick (600 ticks, stage 2)');
    window.__bench = { msPerTick: ms, hash: hashState(state) };
    state.paused = true;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => resize());
    for (const id of ['topbar', 'tray-plan', 'tray-run', 'app']) { const el = document.getElementById(id); if (el) ro.observe(el); }
  }
  window.WL = {
    get state() { return state; },
    get cfg() { return cfg; },
    get view() { return view; },
    get ui() { return ui; },
    get overlay() { return overlay; },
    set resultShown(v) { resultShown = !!v; },
    api,
    newState(s, sd) { const r = newState(s, sd); if (ui) { ui.hideOverlays(); ui.update(state); } return r; },
    render,
    setOverlay(o) { overlay = Object.assign({ preview: null, armed: null, aim: null, selectBuilding: null }, o || {}); armed = overlay.armed || null; },
    finishRun: (s) => finishRun(s || state),
    rebuild: (s) => rebuild(s || state),
  };
  requestAnimationFrame(frame);
  installTestHook(window.WL);
}
boot();
