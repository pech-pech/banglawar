import { hashSeed, mulberry32 } from './rng.js';
import { loadRapier, createPhysics } from './physics.js';
import { cfg, isDefault, diffFromDefault } from './config.js';
import { createCourse } from './terrain.js';
import { createProps } from './props.js';
import { FIXED_DT, createSled, stepSled } from './sled.js';
import { medalTimes, medalFor, MEDALS } from './medals.js';
import { createView } from './render.js';
import { createHud } from './hud.js';
import { getThemeId, setThemeId, createThemePicker } from './themeui.js';
import { THEMES } from './themes.js';
import { createTelemetry, deviceInfo } from './telemetry.js';
import { createSave } from './save2.js';
import { dailySeed, dailyDate, dailyCopyText } from './daily.js';
import { HULLS, HULL_IDS } from './hulls.js';
import { createMarks } from './marks.js';
import { createTweak, buildReport, physText, copyText, getVisualPrefs, onVisualPrefs, isVisualDefault } from './tweak.js';
// B4 VIS begin
import { UNLOCK_M } from './vis/index.js';
import { createAudioGlue, isAudioKey } from './audioglue.js'; // B5 AUDIO
// B4 VIS end

const BUILD = 'ridgeline-proto-14';
const RULES_VERSION = 1;
const BEST_KEY = 'ridgeline.best.v1';
const COUNTER_KEY = 'ridgeline.counter.v1';
const MAX_STEPS = 8;
// look-still hook (?still=1): deterministic frame, sim frozen once gate 2 is the next gate. Not a shipped path.
const STILL = new URLSearchParams(location.search).get('still') === '1';
// the still hook needs a finite, deterministic course: it runs on a local cfg copy with endless off (DEFAULTS untouched)
const STILL_CFG = STILL ? { ...cfg, endless: 0 } : null;
const rc = () => (STILL ? STILL_CFG : cfg);
const isEndless = () => !!course && !Number.isFinite(course.length);
let stillState = 0; // 0 pending, 1 frozen
// B4 VIS begin: visual showcase on unless ?vis=0 (or the still path). Home -> run -> end card flow lives in the vis block below.
const VIS_ON = !STILL && new URLSearchParams(location.search).get('vis') !== '0';
let runTop = 0, runLandings = 0;
// B4 VIS end
const STILLFX = STILL ? new URLSearchParams(location.search).get('stillfx') : null; // still-only: 1 = mid-boost carving, 2 = crash shred burst
function stillAdvance() {
  const run = (n, drawEvery, inp) => {
    for (let i = 0; i < n && !state.crashed && !state.finished; i++) {
      stepP(inp || IN0);
      if (drawEvery && i % drawEvery === 0 && view) view.draw(state, state.t);
    }
  };
  let n = 0;
  const SG = +(new URLSearchParams(location.search).get('stillgate')) || 2; // still-only: freeze when gate SG is next
  const IN0 = { steer: 0, fire: false, down: false };
  const stepP = (inp) => { phys.update(state.physZ ?? state.z); return stepSled(state, course, inp, rc()); };
  while (state.nextGate < SG && n < 60000 && !state.crashed) { stepP(IN0); n++; }
  const total = n;
  newSled();
  if (STILLFX === '1') {
    // pose: from step s0 fire a boost, then carve (steer) until gate 1 is passed, freeze a little after the pass
    const s0 = Math.max(0, total - 330);
    run(s0, 0);
    state.boost = 1;
    const plan = (k) => ({ steer: k > 150 ? 0.7 : 0, fire: k === 170, down: false });
    let k = 0, pass = -1;
    while (k < 600 && !state.crashed && pass < 0 + 0) { stepP(plan(k)); if (k > 150 && k % 2 === 0 && view) view.draw(state, state.t); if (state.nextGate >= 2) pass = k; k++; }
    window.__pass = pass;
    for (let j = 0; j < 4; j++) { stepP(plan(k + j)); if (j % 2 === 0 && view) view.draw(state, state.t); }
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
let phase = 'menu'; // menu | run | end (B4 VIS: + home | garage)
let lastResult = null;
let crashZ = null;
let R = null; // rapier module once loaded
let phys = null;
let props = null;
let physErr = null;
let startAfterLoad = null;
const physPromise = loadRapier().then((m) => { R = m; return m; });

// input
const input = { steer: 0, fire: false, down: false };
let fireNext = false;
let pointerId = null;
let startX = 0;
const keys = { left: false, right: false, space: false };

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

// ---- B3 LOOP: save v2, hulls, daily ----
// DEV (any non-default tweak, ignoring the first-run mercy flag main sets itself) never writes bests or marks.
const ag = createAudioGlue(() => cfg); // B5 AUDIO: levels are cfg.audio*, never DEV
function devNow() { const d = diffFromDefault(); delete d.firstRunMercy; for (const k of Object.keys(d)) if (isAudioKey(k)) delete d[k]; return Object.keys(d).length > 0; }
const isDev = () => devNow() || !isVisualDefault();
const save = createSave({
  storage: { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) },
  rulesVersion: RULES_VERSION,
  today: () => dailyDate(Date.now()),
  dev: devNow,
});
const saveLoad = save.load();
let hullId = (() => { const h = save.get().hull; return HULLS[h] && save.get().hulls.includes(h) ? h : 'wren'; })();
let runReached = new Set(), runNew = [], runWrecks = 0, runOverEv = null, runCaught = 0, runZoneKey = '';
const unlockedList = () => (devNow() ? HULL_IDS.slice() : HULL_IDS.filter((h) => save.get().hulls.includes(h) || sessionUnlocked.has(h)));
const sessionUnlocked = new Set();
const bestDist = () => { const b = save.get().best; return b && b.rules === RULES_VERSION ? b.dist : 0; };
function nextGoalFor(dist) {
  return createMarks({ reached: new Set(save.get().marks) }, cfg).nextGoal(dist, unlockedList());
}
function setHullId(id) {
  if (!HULLS[id] || !unlockedList().includes(id)) return false;
  hullId = id; save.setHull(id);
  return true;
}
function startInfo() {
  const b = bestDist();
  return { build: BUILD, dailySeed: dailySeed(dailyDate(Date.now()), RULES_VERSION), best: b ? 'Best ' + b + ' m' : null, hull: HULLS[hullId].name, unlockedCount: unlockedList().length };
}
function dailyInfo() { const d = save.dailyToday(); return { seed: dailySeed(dailyDate(Date.now()), RULES_VERSION), best: d.best || 0 }; }
function applyMercy() { cfg.firstRunMercy = save.get().stats.wrecks < 2 ? 1 : 0; }

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
  if (m === 'daily') return dailySeed(dailyDate(Date.now()), RULES_VERSION);
  let n = parseInt(lsGet(COUNTER_KEY) || '0', 10);
  if (!Number.isFinite(n)) n = 0;
  n += 1;
  lsSet(COUNTER_KEY, String(n));
  return 'random-' + n;
}

function size() {
  return [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)];
}

function viewOpts() { return { ...getVisualPrefs(), still: STILL, vis: VIS_ON ? visHooks : false }; } // B4 VIS: vis hooks
function buildCourse() {
  if (view) { try { view.dispose(); } catch (e) { /* ignore */ } view = null; }
  course = createCourse(seedInt, rc());
  view = createView(canvas, course, rc(), getThemeId(), viewOpts());
  const [w, h] = size();
  view.resize(w, h);
  builtCfg = JSON.stringify(cfg);
}

function newSled() {
  if (phys) { try { phys.dispose(); } catch (e) { /* ignore */ } phys = null; }
  phys = createPhysics(R, course, rc());
  phys.update(0);
  if (props) { try { props.dispose(); } catch (e) { /* ignore */ } props = null; }
  if (!STILL) props = createProps(R, phys, course, cfg);
  runReached = new Set(save.get().marks); runNew = []; runWrecks = 0; runOverEv = null; runCaught = 0; runZoneKey = '';
  state = createSled(course, phys, mulberry32((seedInt ^ 0x5bd1e995) >>> 0), { hull: hullId, reached: runReached, seed: seedStr, daily: mode === 'daily' });
  state._props = props;
}

// ---- pause (MENU button, Esc / P) ----
// Pausing only stops the fixed-step loop from advancing: no sim step, no RNG draw, no physics update, so a paused-and-resumed
// run replays exactly like an unpaused one. Audio clock is suspended; the telemetry frame clock is skipped.
let paused = false;
function clearPause() {
  if (!paused) return;
  paused = false; hud.hidePause(); ag.pause(false); last = 0; acc = 0;
}
function setPaused(on) {
  if (on === paused) return;
  if (on) {
    if (phase !== 'run' || !state || tweak.isOpen()) return;
    if (pointerId !== null) { tele.touchUp(performance.now(), state.boost, false); pointerId = null; } // drop a held steer without firing boost
    input.steer = 0; input.down = false; fireNext = false; keys.left = keys.right = keys.space = false;
    paused = true; hud.showPause(); ag.pause(true);
  } else clearPause();
}
function quitToTitle() {
  clearPause();
  if (VIS_ON) { goHome(); return; }
  phase = 'menu'; ag.silence(); ag.bgm('menu'); hud.showStart(startInfo());
}

function begin(m, seedString) {
  if (!R) { startAfterLoad = () => begin(m, seedString); return; }
  // B4 VIS: keep the home world when it already is this seed + cfg (camera blends from the title, no cut)
  const keep = VIS_ON && course && view && seedString === seedStr && JSON.stringify(cfg) === builtCfg;
  clearPause();
  mode = m;
  seedStr = seedString;
  applyMercy();
  seedInt = hashSeed(seedStr);
  // rebuild always: new seed or changed cfg; disposing the old view first
  if (!keep) buildCourse();
  newSled();
  input.steer = 0; input.fire = false; fireNext = false;
  acc = 0; last = 0; fpsSum = 0; fpsN = 0; fpsAvg = 0; crashZ = null;
  tele.reset(performance.now());
  phase = 'run';
  hud.showRun();
  hud.setDev(isDev());
  visRunStart(); // B4 VIS
  ag.bgm('run'); // B5 AUDIO
}

function startMode(m) { begin(m, pickSeed(m)); }

function retry() {
  clearPause();
  applyMercy();
  // same seed; rebuild only if cfg changed, else reuse course
  if (!course || JSON.stringify(cfg) !== builtCfg) { begin(mode, seedStr); return; }
  newSled();
  input.steer = 0; input.fire = false; fireNext = false;
  acc = 0; last = 0; fpsSum = 0; fpsN = 0; fpsAvg = 0; crashZ = null;
  tele.reset(performance.now());
  phase = 'run';
  hud.showRun();
  hud.setDev(isDev());
  visRunStart(); // B4 VIS
  ag.bgm('run'); // B5 AUDIO
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
  if (isEndless()) {
    const cause = state.runOverCause || 'rock';
    const distance = Math.floor(runOverEv && runOverEv.dist != null ? runOverEv.dist : (state.dist || state.z || 0));
    const daily = mode === 'daily';
    const prevBest = bestDist();
    const rec = save.recordRun({
      dist: distance, hull: hullId, zone: state.zone, lap: state.lap, seed: seedStr, cause, wrecks: runWrecks,
      clean: state.cleans || 0, longestFlightS: state.longestAir || 0, daily, flow: state.flowPeak || 0, landings: state.landings || 0,
    });
    const bestDistance = bestDist();
    let zoneName = '';
    try { const zi = course.zoneAt(state.z); zoneName = zi.name || String(zi.zone); } catch (e) { /* ignore */ }
    const stats = {
      flights: state.launches || 0, cleanLands: state.cleans || 0, grazes: (state.razors || 0) + (state.inners || 0),
      gates: state.gatesPassed || 0, maxFlow: state.flowPeak || 0,
    };
    lastResult = {
      result: cause === 'night' ? 'night' : 'crash', cause, time: state.t, distance, gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed,
      flow: flowInfo(), medal: null,
    };
    const payload = {
      endless: true, distance, bestDistance, delta: rec.delta, newBest: !!rec.newBest, cause, zone: state.zone, zoneName, lap: state.lap, hull: hullId,
      nextGoal: nextGoalFor(Math.max(distance, bestDistance)), stats, newMarks: runNew.slice(), dev: devNow(), daily,
      // old keys, still callable
      crashed: true, finished: false, time: state.t, z: state.z, medal: null, flowPeak: state.flowPeak || 0,
      gatesPassed: state.gatesPassed, gatesMissed: state.gatesMissed, best: bestDistance,
    };
    if (daily) {
      payload.dailyBest = !!rec.dailyBest;
      payload.dailyCopy = dailyCopyText({ date: dailyDate(Date.now()), dist: distance, hull: hullId, zone: state.zone, lap: state.lap, flow: state.flowPeak || 0, clean: state.cleans || 0, landings: state.landings || 0, cause });
    }
    hud.showEnd(payload);
    ag.silence(); ag.bgm('menu'); // B5 AUDIO
    lastGoal = payload.nextGoal; // B5: end card progress line
    hud.setStartInfo(startInfo());
    if (VIS_ON) lastVisEnd = { finished: false, crashed }; // B4 VIS
    visEnd(distance, prevBest || 0); // B4 VIS: spring end card
    return;
  }
  if (finished) saveBest(key, state.t);
  const result = finished ? 'finish' : (crashed ? 'crash' : 'end');
  const hidden = !isDefault() || !isVisualDefault();
  const times = medalTimes(course, cfg);
  let medal = { name: null, next: null, gap: null, hidden };
  if (finished && !hidden) {
    medal = Object.assign(medalFor(state.t, times), { hidden: false });
    saveMedal(key, medal.name);
  }
  if (VIS_ON) lastVisEnd = { finished, crashed }; // B4 VIS
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
  visEnd(); // B4 VIS: spring end card over the old (hidden) end screen
}

function physInfo() {
  if (!phys || !phys.stats) return null;
  return phys.stats;
}
function physLine() {
  const p = physInfo();
  return physErr ? 'Phys: load failed' : p ? 'Phys: ' + physText(p) : R ? 'Phys: loaded, no run yet' : 'Phys: loading...';
}

function endlessInfo() {
  if (!course || !state || Number.isFinite(course.length)) return null;
  let zn = '-', lap = '-';
  try { const zi = course.zoneAt(state.z); zn = zi.name || zi.zone; lap = zi.lap; } catch (e) { /* ignore */ }
  const ps = props && props.stats ? props.stats : {};
  return {
    dist: Math.floor(state.dist || 0), zone: zn, lap,
    features: course.features ? course.features.length : 0,
    rocks: state._rocks ? state._rocks.length : 0,
    shifts: phys && phys.origin ? phys.origin.count : 0,
    propsLive: props ? props.live() : 0, propsMax: cfg.propMaxDynamic ?? 16, hits: ps.hits || 0, frozen: ps.frozen || 0,
  };
}

function nightInfo() {
  if (!state || !state._night) return null;
  const n = state._night.state();
  return { gap: state.gap, vf: state.vf, stage: state.nightStage, caught: runCaught, caughtTotal: save.get().stats.night, minGap: n.minGap, hits: n.hitTotal };
}
function recoverInfo() {
  if (!state || !state._night) return null;
  const n = state._night.state();
  return { wrecks: runWrecks, floorUsed: n.floorUsed, mercy: cfg.firstRunMercy ? 1 : 0, mercied: state.mercied || 0, wrecksSaved: save.get().stats.wrecks };
}
function speedInfo() {
  if (!state) return null;
  return { speed: state.speed, flow: state.flow, flowPeak: state.flowPeak || 0, hull: hullId, daily: mode === 'daily' ? 1 : 0, seed: seedStr };
}

function buildInfo() {
  return {
    phys: physInfo(),
    endless: endlessInfo(),
    build: BUILD, seed: seedStr, mode,
    result: lastResult ? lastResult.result : (phase === 'run' ? 'running' : 'none'),
    time: lastResult ? lastResult.time : (state ? state.t : 0),
    gatesPassed: lastResult ? lastResult.gatesPassed : (state ? state.gatesPassed : 0),
    gatesMissed: lastResult ? lastResult.gatesMissed : (state ? state.gatesMissed : 0),
    night: nightInfo(), recover: recoverInfo(), speed: speedInfo(),
    crashZ,
    flow: lastResult ? lastResult.flow : flowInfo(),
    medal: lastResult ? lastResult.medal : null,
    fpsAvg: fpsN ? fpsSum / fpsN : fpsAvg,
    stats: view ? view.stats() : { calls: 0, triangles: 0 },
    diff: diffFromDefault(),
    theme: getThemeId(),
    tele: tele.snapshot(),
    device: deviceInfo(null, gpuName()),
    // B4 VIS begin
    visLine: view && view.vis ? view.vis.probeLine() : (VIS_ON ? 'Vis: no view' : 'Vis: off (?vis=0)'),
    webgpu: !!(view && view.renderer && view.renderer.isWebGPURenderer),
    rendererType: view && view.renderer ? (view.renderer.isWebGPURenderer ? 'WebGPURenderer' : 'WebGLRenderer, ' + (view.renderer.capabilities && view.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1')) : '',
    // B4 VIS end
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
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
  onRestart: retry,
  onQuit: () => quitToTitle(),
  onSettings() { tweak.open(); },
  onHull() { const l = unlockedList(); setHullId(l[(l.indexOf(hullId) + 1) % l.length]); hud.setStartInfo(startInfo()); },
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
    else { try { view.dispose(); } catch (e) { /* ignore */ } view = createView(canvas, course, rc(), id, viewOpts()); const [w, h] = size(); view.resize(w, h); }
  }
  for (const p of pickers) p.refresh();
  return true;
}
const startPicker = createThemePicker(hud.themeMount, { onChange: (id) => applyTheme(id) });
const settingsPicker = createThemePicker(null, { onChange: (id) => applyTheme(id) });
pickers.push(startPicker, settingsPicker);
const tweak = createTweak(ui, { themeEl: settingsPicker.el, physLine, onChange() { hud.setDev(isDev()); ag.applyLevels(); } });
applyTheme(getThemeId());
onVisualPrefs(() => {
  hud.setDev(isDev());
  if (!view) return;
  try { view.dispose(); } catch (e) { /* ignore */ }
  view = createView(canvas, course, rc(), getThemeId(), viewOpts());
  const [w, h] = size(); view.resize(w, h);
});

hud.setLoading('loading');
physPromise.then(() => {
  hud.setLoading('ready');
  if (startAfterLoad) { const f = startAfterLoad; startAfterLoad = null; f(); }
}, (e) => { physErr = e; hud.setLoading('error', e && e.message ? e.message : String(e)); });

hud.showStart(startInfo());
if (saveLoad.toast) hud.toast(saveLoad.toast);
hud.setDev(isDev());

// B4 VIS begin: front door, garage, run start / end events, end card, photo
let lastVisEnd = null, lastGoal = null;
const bestM = () => bestDist() ?? 0; // B2's bestDist() is null when there is no best yet
function savedHull() {
  return hullId; // B5: B3 save owns the chosen hull
}
function peekSeed() {
  let n = parseInt(lsGet(COUNTER_KEY) || '0', 10);
  if (!Number.isFinite(n)) n = 0;
  return 'random-' + (n + 1);
}
// parked sled pose for the home / garage world (no physics needed: Rapier may still be loading)
function parkedState(c) {
  const x = c.centerX(0), y = c.height(x, 0);
  return { x, y, z: 0, vx: 0, vy: 0, speed: 0, mode: 'ground', grounded: true, pitch: 0, roll: 0, quat: null, bodyY: y + 0.5,
    diving: false, comp: 0.35, boost: 0, boostT: 0, t: 0, flow: 0, gatesPassed: 0, gatesMissed: 0, nextGate: 0, crashed: false, finished: false, charging: false, heading: 0 };
}
const visHooks = {
  getPhase: () => (phase === 'menu' ? 'home' : phase),
  hull: savedHull,
  bestM,
  onRun: () => startMode('random'),
  onDaily: () => startMode('daily'),
  onGarage: () => { if (phase === 'home') phase = 'garage'; },
  onSettings: () => tweak.open(),
  unlockM: () => unlockedList().reduce((m, id) => Math.max(m, UNLOCK_M[id] || 0), devNow() ? 1e9 : 0), // B5: garage locks follow B3 unlocks
  onRide: (id) => { window.__rl.game.setHull(id); window.__rl.game.startRun(); },
  onGarageClose: () => { if (phase === 'garage') phase = 'home'; },
};
function goHome() {
  if (!VIS_ON) return;
  clearPause();
  if (props) { try { props.dispose(); } catch (e) { /* ignore */ } props = null; } // B2 props live in phys' world: free first
  if (phys) { try { phys.dispose(); } catch (e) { /* ignore */ } phys = null; }
  phase = 'home';
  ag.silence(); ag.bgm('menu'); // B5 AUDIO
  lastResult = null; lastVisEnd = null;
  hud.b4('home');
  mode = 'random';
  seedStr = peekSeed();
  seedInt = hashSeed(seedStr);
  buildCourse();
  state = parkedState(course);
  last = 0;
}
function visRunStart() {
  runTop = 0; runLandings = 0;
  if (!view || !view.vis) return;
  view.vis.hideEnd();
  view.vis.attachPhys(phys);
  view.vis.fx({ type: 'run_start' });
}
// endless runs pass B2's distance + the best before this run (endRun already saved it); finite runs compute + save here
function visEnd(endDist, endPrev) {
  if (!VIS_ON || !view || !view.vis || !state) return;
  const v = view.vis;
  const fromEndless = typeof endDist === 'number';
  const dist = fromEndless ? endDist : (typeof state.dist === 'number' ? state.dist : Math.max(0, state.z));
  const prev = fromEndless ? endPrev : bestM();
  if (!fromEndless && dist > prev) lsSet(BESTDIST_KEY, String(Math.round(dist)));
  const caught = !!state.caught;
  v.fx({ type: caught ? 'caught' : 'run_over' });
  const cause = caught ? 'caught' : lastVisEnd && lastVisEnd.finished ? 'finish' : 'run_over';
  v.endCard({ cause, dist, best: prev, top: runTop, landings: runLandings, newBest: prev > 0 && dist > prev, goal: lastGoal }, {
    onRideAgain: retry, onHome: goHome, onPhoto: photo, onCopyReport: copyReport,
  });
  hud.b4('end');
}
function photo() {
  try {
    if (view && state) view.draw(state, performance.now() / 1000); // fresh frame in this task (no preserveDrawingBuffer)
    canvas.toBlob((b) => {
      if (!b) { hud.toast('Photo failed'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'ridgeline-' + Math.round(state ? Math.max(0, state.z) : 0) + 'm.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      hud.toast('Photo saved');
    }, 'image/png');
  } catch (e) { hud.toast('Photo failed'); }
}
if (VIS_ON) goHome(); // boot into the world title + drawer
// B4 VIS end

// ---- input ----
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Listen on window: the HUD root sits over the canvas full-screen and takes the
// touches (#ui > * gets pointer-events:auto), so canvas listeners never fired on phones.
function isControl(t) {
  return !!(t && t.closest && t.closest('button, input, select, textarea, a, label'));
}
window.addEventListener('pointerdown', (e) => {
  if (phase === 'run' && !tweak.isOpen() && !paused) {
    if (isControl(e.target)) tele.touchIgnored(performance.now(), true);
    else if (pointerId !== null) tele.touchIgnored(performance.now(), false);
  }
  if (phase !== 'run' || paused || pointerId !== null || isControl(e.target) || tweak.isOpen()) return;
  tele.touchDown(performance.now(), e.clientX, e.clientY);
  pointerId = e.pointerId;
  input.down = true;
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
  input.down = false;
  if (fire && phase === 'run') fireNext = true;
}
window.addEventListener('pointerup', (e) => release(e, true));
// B4 VIS begin: tap the world at home = ride (buttons and open panels keep their own taps)
window.addEventListener('pointerup', (e) => {
  if (phase !== 'home' || !view || !view.vis || tweak.isOpen()) return;
  const t = e.target;
  if (isControl(t) || (t && t.closest && t.closest('.fd-sheet, .gr, .rlt, .b4ec'))) return;
  view.vis.tapWorld();
});
// B4 VIS end
window.addEventListener('pointercancel', (e) => release(e, false));
for (const ev of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(ev, (e) => {
    // touchmove inside a scrollable panel (Settings/Tweak, theme list, menus) must scroll natively: never block it there
    if (ev === 'touchmove' && e.target && e.target.closest && e.target.closest('.rlt, .rlh-themebody, .rlh-screen, .rlh-pause')) return;
    if (ev !== 'touchstart' || (phase === 'run' && !isControl(e.target))) e.preventDefault();
  }, { passive: false });
}

window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !tweak.isOpen()) { if (paused) { setPaused(false); e.preventDefault(); return; } if (phase === 'run') { setPaused(true); e.preventDefault(); return; } }
  if (phase === 'run' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) tele.key();
  if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  else if (e.code === 'Space') { keys.space = true; if (phase === 'run' && !e.repeat) fireNext = true; e.preventDefault(); }
  if (phase === 'home' && (e.code === 'Space' || e.code === 'Enter') && !e.repeat && view && view.vis && !tweak.isOpen()) view.vis.tapWorld(); // B4 VIS
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') keys.left = false;
  else if (e.code === 'ArrowRight') keys.right = false;
  else if (e.code === 'Space') keys.space = false;
});
function currentDown() { return pointerId !== null || keys.left || keys.right || keys.space; }

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
    if (phase === 'run' && !tweak.isOpen() && !paused) tele.frame(dt * 1000);
    if (phase === 'run' && !paused) { fpsSum += inst; fpsN++; fpsAvg = fpsSum / fpsN; }
  }
  // B4 VIS begin: home / garage / end keep drawing (title, garage camera, end pull-back)
  if (VIS_ON && phase !== 'run' && phase !== 'menu' && state && view) {
    if (!tweak.isOpen() || phase !== 'end') view.draw(state, now / 1000);
    return;
  }
  // B4 VIS end
  if (phase !== 'run' || !state) return;
  if (paused) { if (view) view.draw(state, now / 1000); hud.update(state, fpsNow); return; } // paused: no sim step, audio suspended
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
    const inp = { steer: input.steer, fire, down: currentDown() };
    if (view && view.vis) view.vis.setInput(input.steer); // B4 VIS: steer for fins / lean
    phys.update(state.physZ ?? state.z);
    if (props) props.update(state.z);
    const evs = stepSled(state, course, inp, rc());
    ag.step(state); // B5 AUDIO: gap every step
    tele.step(FIXED_DT, input.steer, state.speed, state.charging, Math.abs(state.x - course.centerX(state.z)) > course.halfWidth(state.z));
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (typeof hud !== 'undefined' && hud && typeof hud.event === 'function') hud.event(ev);
      if (view && typeof view.fx === 'function') view.fx(ev);
      ag.event(ev); // B5 AUDIO
      if (ev.type === 'run_start') { if (ev.daily) save.addDailyRun(seedStr); }
      else if (ev.type === 'recover_start') runWrecks++;
      else if (ev.type === 'caught') runCaught++;
      else if (ev.type === 'run_over') runOverEv = ev;
      else if (ev.type === 'milestone') {
        if (!ev.repeat) { runNew.push(ev.id); save.unlockMark(ev.id); hud.toast('Mark: ' + String(ev.id).replace(/_/g, ' ')); }
      } else if (ev.type === 'hull_unlock') {
        sessionUnlocked.add(ev.hull); save.unlockHull(ev.hull);
        if (HULLS[ev.hull]) hud.toast(HULLS[ev.hull].name + ' unlocked');
        hud.setStartInfo(startInfo());
      }
      if (ev.type === 'land' && ev.grade === 'clean' && !ev.hop) runLandings++; // B4 VIS end-card stat
      if (ev.type === 'boost') tele.boost(ev.amount);
      else if (ev.type === 'crash') {
        let rk = null;
        for (const r of (state._rocks || [])) if (r.id === ev.rockId) { rk = r; break; }
        tele.crash({ rockId: ev.rockId, rockX: rk ? rk.x : NaN, rockZ: rk ? rk.z : NaN, sledX: ev.x, vx: state.vx });
      }
    }
    const zk = state.zone + '.' + state.lap;
    if (zk !== runZoneKey) { runZoneKey = zk; save.noteZone(state.zone, state.lap); }
    acc -= FIXED_DT;
    steps++;
    if (state.speed > runTop) runTop = state.speed; // B4 VIS
    if (state.crashed || state.finished) { endRun(); break; }
  }
  if (steps >= MAX_STEPS) acc = 0;
  if (props && view && view.setProps) view.setProps(props.poses());
  if (view) view.draw(state, now / 1000);
  hud.update(state, fpsNow);
}
requestAnimationFrame(frame);

window.__ridgeline = {
  get state() { return state; },
  get course() { return course; },
  cfg,
  get view() { return view; },
  get phys() { return phys; },
  get hud() { return hud; },
  setTheme(id) { return applyTheme(id); },
  get ready() { return !!R; },
  start(m) { startMode(m === 'random' ? 'random' : 'daily'); },
  stats() { return view ? view.stats() : null; },
  get props() { return props; },
  get fps() { return fpsNow; },
  medals() { return isEndless() ? null : medalTimes(course, cfg); },
  report() { return buildReport(buildInfo()); },
  // B4 VIS begin
  get phase() { return phase; },
  get vis() { return view ? view.vis : null; },
  home() { goHome(); },
  // B4 VIS end
};

// B3 LOOP: game API for B4 (home, garage, end card)
window.__rl = window.__rl || {};
window.__rl.audio = ag; // B5 AUDIO (QA hook)
for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, () => ag.unlock(), { once: false, passive: true, capture: true });
window.__rl.game = {
  get hull() { return hullId; },
  hulls: HULLS,
  get unlocked() { return unlockedList(); },
  get best() { return bestDist(); },
  get marks() { return save.get().marks.slice(); },
  nextGoal: (dist) => nextGoalFor(dist == null ? bestDist() : dist),
  setHull(id) { const ok = setHullId(id); if (ok) hud.setStartInfo(startInfo()); return ok; },
  startRun(o) { startMode(o && o.daily ? 'daily' : 'random'); return true; },
  get daily() { return dailyInfo(); },
};
