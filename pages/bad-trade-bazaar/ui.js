// Bad Trade Bazaar UI (btb-lessons-1, RUN-UI). Owns boot, router, run screen, settings, toasts, window.__btb.
// Morning / end / shop screens are rendered by ui-day.js through ctx.
import * as core from './core.js';
import * as house from './house.js';
import * as report from './report.js';
import * as day from './ui-day.js';

const { DEFAULTS, SCARS, PERKS, GOODS } = core;
const $ = (id) => document.getElementById(id);
const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

const END_IGNORE_MS = 600;
const SPARK_N = 30;
const SCREENS = ['start', 'morning', 'run', 'end', 'shop'];
const PERK_SHORT = { seed: 'Purse', fee: 'Tax-Man', scales: 'Scales', streak: 'Streak', clean: 'Clean', tycoon: 'Patient', spec0: 'Calm Spec', spec1: 'Mid Spec', wild: 'Wild Spec' };

// ---------- boot: config, profile ----------
const params = new URLSearchParams(location.search);
const tickOverride = params.has('tick') && Number(params.get('tick')) > 0 ? Number(params.get('tick')) : null;

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) out[k] = isObj(b[k]) && isObj(a[k]) ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

let baseConfig = core.mkConfig(house.loadConfig(DEFAULTS) || {});   // what the Tweak menu edits and saves
let config = effectiveConfig();                                      // baseConfig + ?tick override (this page load only)
function effectiveConfig() {
  return core.mkConfig(tickOverride ? { ...baseConfig, tickMs: tickOverride } : baseConfig);
}

function makeSalt() {
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  } catch (e) {
    return Math.random().toString(36).slice(2, 10);
  }
}
function freshProfile() {
  const p = core.newProfile(makeSalt());
  house.saveProfile(p);
  return p;
}
let profile = house.loadProfile();
if (!profile || profile.v !== 2 || !profile.salt || !Array.isArray(profile.cover)) profile = freshProfile();

let state = null;          // current / last run State
let screen = 'start';
let endShownAt = 0;
let runFinished = true;
let evIdx = 0;
let toastTimer = 0;
const saveProfile = () => house.saveProfile(profile);

// ---------- router ----------
function go(name) {
  if (!SCREENS.includes(name)) return;
  screen = name;
  for (const s of SCREENS) {
    const el = $('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  }
  document.body.dataset.screen = name;
  if (name === 'end') endShownAt = performance.now();
  if (name === 'start') renderStart();
  if (name === 'run') { render(); requestAnimationFrame(() => { if (screen === 'run') render(); }); }
}

function applyDev() {
  const dev = !!house.isDev(baseConfig, DEFAULTS);
  document.body.classList.toggle('dev', dev);
  const b = $('dev-badge');
  if (b) b.hidden = !dev;
}

function renderStart() {
  const p = $('btn-play');
  if (p) setText(p, profile.day > 0 ? 'Continue: day ' + (profile.day + 1) : 'Play'); // admin default: next day number
}

// ---------- day lifecycle ----------
function startDay() {
  state = core.newDay(profile, config);
  runFinished = false;
  evIdx = 0;
  acc = 0; last = null;
  stopPress();
  const t = $('toast');
  if (t) { t.textContent = ''; t.classList.remove('show'); }
  go('run');
}

function finishDay() {
  if (runFinished || !state) return;
  runFinished = true;
  stopPress();
  flushEvents();
  const summary = core.endDay(profile, state);
  saveProfile();
  day.showEnd(summary);
  go('end');
}

function newStall() {
  core.newStall(profile, config);
  saveProfile();
  day.showMorning();
  go('morning');
}

function doTicks(n) {
  if (!state || runFinished) return;
  for (let k = 0; k < n; k++) {
    core.tick(state);
    if (state.over) { finishDay(); return; }
  }
  render();
}

// ---------- fixed-step clock ----------
let acc = 0;
let last = null;
function frame(ts) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = null; return; }
  if (last == null) { last = ts; return; }
  const dt = Math.min(ts - last, 5000);
  last = ts;
  if (screen !== 'run' || !state || runFinished || isSettingsOpen()) { acc = 0; return; }
  acc += dt;
  const tm = Math.max(1, config.tickMs || 1000);
  let steps = Math.floor(acc / tm);
  if (steps > 0) {
    acc -= steps * tm;
    if (steps > 3) { steps = 3; acc = 0; }   // catch-up cap 3
    doTicks(steps);
  }
}
document.addEventListener('visibilitychange', () => { last = null; acc = 0; stopPress(); });

// ---------- helpers ----------
const money = (v) => Math.abs(v).toFixed(2);
const signed = (v) => (v < 0 ? '−$' : '+$') + money(v);
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const scarName = (t) => (SCARS[t] ? SCARS[t].name : 'Lesson');
const priceNow = (i) => state.px[i][Math.min(state.t, state.px[i].length - 1)];

// ---------- toasts ----------
function showToast(msg) {
  const el = $('toast');
  if (!el || !msg) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function flushEvents() {
  if (!state || !Array.isArray(state.events)) return;
  const ev = state.events;
  const msgs = [];
  let sold = '';
  for (; evIdx < ev.length; evIdx++) {
    const e = ev[evIdx];
    if (!e) continue;
    if (e.k === 'paid') msgs.push('Lesson paid you $' + money(e.amount || 0));
    else if (e.k === 'drop') msgs.push('New lesson: ' + scarName(e.type));
    else if (e.k === 'bell') msgs.push('Closing bell');
    else if (e.k === 'sell') sold = 'Sold ' + signed(e.pnl || 0);
  }
  if (!msgs.length && sold) msgs.push(sold);
  if (msgs.length) showToast(msgs.join(' · '));
}

// ---------- run render ----------
function render() {
  if (!state || screen !== 'run') return;
  flushEvents();
  const free = core.freeLots(state);
  setText($('hud-day'), 'Day ' + (profile.day + 1));
  setText($('hud-timer'), fmtTime(state.c.runSec - state.t));
  setText($('hud-cash'), '$' + state.cash.toFixed(2));
  setText($('hud-lots'), `Lots ${free}/${state.c.lots} free`);
  renderStrip();
  for (let i = 0; i < 3; i++) renderRow(i);
}

function renderStrip() {
  const keys = profile.perks || [];
  for (let k = 0; k < 3; k++) {
    const el = $('strip-power-' + k);
    if (!el) continue;
    const key = keys[k];
    const has = key != null && state.has(key);
    setText(el, has ? (PERK_SHORT[key] || key) : '');
    el.classList.toggle('filled', has);
    const pk = has ? PERKS.find((p) => p.key === key) : null;
    el.title = pk ? pk.name : '';
  }
  const les = state.lessons || [];
  for (let k = 0; k < 2; k++) {
    const el = $('strip-lesson-' + k);
    if (!el) continue;
    const type = les[k];
    const has = type != null;
    el.dataset.type = has ? String(type) : '';
    el.classList.toggle('filled', has);
    let n = el.querySelector('.n'), c = el.querySelector('.c');
    if (!n) {
      el.textContent = '';
      n = document.createElement('span'); n.className = 'n';
      c = document.createElement('span'); c.className = 'c';
      el.append(n, c);
    }
    setText(n, has ? scarName(type) : '');
    setText(c, has ? 'covers $' + money(state.cover[type] || 0) : '');
  }
}

function buyReason(i) {
  if (state.over || state.t >= state.c.runSec) return 'Closed';
  if (core.freeLots(state) <= 0) return 'Lots full';
  if (core.lotsOf(state, i).length >= state.c.maxPerGood) return 'Max lots';
  return 'Low cash';
}

function renderRow(i) {
  const row = $('row-' + i);
  if (!row) return;
  const g = state.goods[i];
  const p = priceNow(i);
  setText(row.querySelector('.stock-name'), g.name);
  setText(row.querySelector('.kind'), g.kind);
  setText($('price-' + i), '$' + p.toFixed(2));
  const lots = core.lotsOf(state, i);
  let held = 'No lots';
  if (lots.length) {
    let pnl = 0;
    for (const l of lots) pnl += l.qty * p - l.cost;
    held = `${lots.length} lot${lots.length > 1 ? 's' : ''} ${signed(pnl)}`;
  }
  setText($('lots-' + i), held);
  // buy
  const buy = $('buy-' + i);
  const ok = core.canBuy(state, i);
  setText(buy.querySelector('.face'), ok ? 'BUY $' + core.buyPreview(state, i).toFixed(2) : 'BUY');
  const bc = buy.querySelector('.chip');
  setText(bc, ok ? '' : buyReason(i));
  bc.hidden = ok;
  buy.setAttribute('aria-disabled', ok ? 'false' : 'true');
  // sell
  const sell = $('sell-' + i);
  const sp = lots.length ? core.sellPreview(state, i, 'best') : null;
  const sf = sell.querySelector('.face'), sc = sell.querySelector('.chip');
  if (sp) {
    sell.dataset.loss = sp.loss > 0 || sp.pnl < 0 ? '1' : '0';
    setText(sf, 'SELL ' + signed(sp.pnl));
    let chip = '';
    if (sp.scarType != null) chip = '+' + scarName(sp.scarType);
    else if (sp.refund > 0) chip = 'lesson pays $' + money(sp.refund);
    setText(sc, chip);
    sc.hidden = !chip;
    sell.setAttribute('aria-disabled', 'false');
  } else {
    sell.dataset.loss = '0';
    setText(sf, 'SELL');
    setText(sc, 'no lot');
    sc.hidden = false;
    sell.setAttribute('aria-disabled', 'true');
  }
  row.dataset.loss = sp && sell.dataset.loss === '1' ? '1' : '0';
  row.dataset.win = sp && sell.dataset.loss === '0' ? '1' : '0';
  drawSpark($('spark-' + i), i, lots);
}

function drawSpark(cv, i, lots) {
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw) cv.width = pw;
  if (cv.height !== ph) cv.height = ph;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const px = state.px[i];
  const t = Math.min(state.t, px.length - 1);
  const s = px.slice(Math.max(0, t - (SPARK_N - 1)), t + 1);
  let lo = Math.min(...s), hi = Math.max(...s);
  let buy = null;
  if (lots.length) {
    let q = 0, c = 0;
    for (const l of lots) { q += l.qty; c += l.cost; }
    buy = q > 0 ? c / q : null;   // average buy price of held lots
  }
  if (buy != null) { lo = Math.min(lo, buy); hi = Math.max(hi, buy); }
  if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
  const pad = 3;
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
  const x = (k) => (s.length <= 1 ? w - 2 : 2 + (k / (SPARK_N - 1)) * (w - 4));
  if (buy != null) {
    g.save();
    g.strokeStyle = '#ffb347'; g.lineWidth = 1; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(0, y(buy)); g.lineTo(w, y(buy)); g.stroke();
    g.restore();
  }
  const lastP = s[s.length - 1];
  g.strokeStyle = buy != null && lastP < buy ? '#ff8a73' : '#f3d9a4';
  g.lineWidth = 2; g.lineJoin = 'round';
  g.beginPath();
  s.forEach((v, k) => { if (k) g.lineTo(x(k), y(v)); else g.moveTo(x(k), y(v)); });
  g.stroke();
  g.fillStyle = g.strokeStyle;
  g.beginPath(); g.arc(x(s.length - 1), y(lastP), 2.5, 0, 6.2832); g.fill();
}

// ---------- buy / sell input ----------
const lockUntil = [0, 0, 0];
let press = null; // {i, timer, fired}

function actionOk() {
  return screen === 'run' && state && !runFinished && !isSettingsOpen();
}

function doBuy(i) {
  if (!actionOk()) return;
  if (core.buy(state, i)) lockUntil[i] = performance.now() + (config.buyLockMs || 0);
  render();
}

function doSell(i, which) {
  if (!actionOk()) return;
  if (performance.now() < lockUntil[i]) return;  // buyLockMs: ignore an instant sell after a buy
  if (core.lotsOf(state, i).length) core.sell(state, i, which);
  render();
}

function stopPress() {
  if (press) { clearTimeout(press.timer); const b = $('sell-' + press.i); if (b) b.classList.remove('holding'); }
  press = null;
}

function sellDown(i, ev) {
  if (ev.button > 0 || !actionOk()) return;
  stopPress();
  const b = $('sell-' + i);
  if (!core.lotsOf(state, i).length) return;
  b.classList.add('holding');
  const p = { i, fired: false, timer: 0 };
  p.timer = setTimeout(() => { p.fired = true; b.classList.remove('holding'); doSell(i, 'worst'); }, config.longPressMs || 450);
  press = p;
}
function sellUp(i) {
  const p = press;
  if (!p || p.i !== i) return;
  clearTimeout(p.timer);
  $('sell-' + i).classList.remove('holding');
  press = null;
  if (!p.fired) doSell(i, 'best');
}

// ---------- settings ----------
function isSettingsOpen() {
  const s = $('settings');
  return !!s && s.classList.contains('open');
}
let settingsMounted = false;
function openSettings() {
  const s = $('settings');
  if (!s) return;
  if (!settingsMounted) mountSettingsOnce();
  stopPress();
  s.classList.add('open');
}
function closeSettings() {
  const s = $('settings');
  if (s) s.classList.remove('open');
  last = null;
  if (state && screen === 'run') render();
}
function applyConfig(cfg) {
  baseConfig = core.mkConfig(cfg);
  house.saveConfig(baseConfig);
  config = effectiveConfig();   // applies from the next day; the running day keeps state.c
  applyDev();
}
function mountSettingsOnce() {
  const body = $('settings-body');
  if (!body) return;
  settingsMounted = true;
  house.mountSettings(body, {
    DEFAULTS,
    getConfig: () => baseConfig,
    setConfig: applyConfig,
    getReport: () => report.report(profile, config),
    onResetProgress: () => {
      profile = freshProfile();
      state = null; runFinished = true;
      closeSettings();
      go('start');
    },
    onClose: closeSettings,
  });
}

// ---------- ctx for ui-day.js ----------
const ctx = {
  core, report, house,
  getProfile: () => profile,
  saveProfile,
  getConfig: () => config,
  go,
  startDay,
  newStall,
  toast: showToast,
};

// ---------- wiring ----------
function wire() {
  setText($('build-id'), core.BUILD);
  const play = $('btn-play');
  if (play) play.addEventListener('click', () => {
    if (screen !== 'start') return;
    day.showMorning();
    go('morning');
  });
  for (const id of ['btn-settings-start', 'btn-settings']) {
    const b = $(id);
    if (b) b.addEventListener('click', openSettings);
  }
  const close = $('btn-settings-close');
  if (close) close.addEventListener('click', closeSettings);

  for (let i = 0; i < 3; i++) {
    const buy = $('buy-' + i), sell = $('sell-' + i);
    buy.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); doBuy(i); });
    buy.addEventListener('click', (e) => { if (e.detail === 0) doBuy(i); });          // keyboard
    sell.addEventListener('pointerdown', (e) => sellDown(i, e));
    sell.addEventListener('pointerup', () => sellUp(i));
    sell.addEventListener('pointercancel', stopPress);
    sell.addEventListener('pointerleave', stopPress);
    sell.addEventListener('click', (e) => { if (e.detail === 0) doSell(i, 'best'); }); // keyboard
    for (const b of [buy, sell]) b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  window.addEventListener('blur', stopPress);

  // L-PV-9: end screen ignores taps for 600 ms after it shows
  const endEl = $('screen-end');
  if (endEl) for (const t of ['click', 'pointerdown', 'pointerup']) {
    endEl.addEventListener(t, (e) => {
      if (performance.now() - endShownAt < END_IGNORE_MS) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
  window.addEventListener('resize', () => { if (state && screen === 'run') render(); });
}

function rerenderDayScreen() {
  if (screen === 'morning') day.showMorning();
  else if (screen === 'shop') day.showShop();
}

window.__btb = {
  getState: () => state,
  getProfile: () => profile,
  getConfig: () => config,
  setConfig(partial) {
    applyConfig(deepMerge(baseConfig, partial || {}));
    if (state && screen === 'run') render();
    return config;
  },
  tick(n = 1) {
    if (screen === 'run' && state && !runFinished) doTicks(Math.max(0, n | 0));
    return state;
  },
  go,
  setCash(n) {
    profile.cash = Number(n);
    saveProfile();
    rerenderDayScreen();
  },
  report: () => report.report(profile, config),
  BUILD: core.BUILD,
};

wire();
day.initDay(ctx);
applyDev();
go('start');
requestAnimationFrame(frame);
