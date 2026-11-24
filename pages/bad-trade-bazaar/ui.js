// Bad Trade Bazaar UI logic (maker 2b). Renders into ids owned by index.html (maker 2a).
import * as core from './core.js';
import * as house from './house.js';

const { DEFAULTS, STOCKS, SCARS } = core;
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

const END_IGNORE_MS = 600;
const SPARK_N = 30;
const SCREENS = ['start', 'run', 'end', 'slot'];

// ---------- boot: config, profile ----------
const params = new URLSearchParams(location.search);
const tickOverride = params.has('tick') && Number(params.get('tick')) > 0 ? Number(params.get('tick')) : null;
let baseConfig = house.loadConfig(DEFAULTS);          // what the Tweak menu edits and saves
let config = effectiveConfig();                        // baseConfig + ?tick override (this page load only)

function effectiveConfig() {
  const c = { ...baseConfig };
  if (tickOverride) c.tickMs = tickOverride;
  return c;
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
if (!profile || !Array.isArray(profile.collection) || !profile.salt) profile = freshProfile();
profile.build = core.validateBuild(profile, config);

let state = null;        // current run State
let lastState = null;    // finished run State (for end screen)
let lastSummary = null;
let screen = 'start';
let endShownAt = 0;
let runFinished = false;
let selectedType = null; // slot screen: selected collection card
let toastTimer = 0;

// ---------- screens / layout ----------
function setScreen(name) {
  screen = name;
  for (const s of SCREENS) {
    const el = $('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  }
  document.body.dataset.screen = name;
  if (name === 'end') endShownAt = performance.now();
  if (name === 'slot') renderSlot();
  if (name === 'run') render();
  requestAnimationFrame(() => { if (screen === 'run') render(); });
}

function applyLayout() {
  const t = window.innerHeight / Math.max(1, window.innerWidth) > 2.0;
  document.body.classList.toggle('layout-t', t);
  document.body.classList.toggle('layout-s', !t);
}

function applyDev() {
  const dev = house.isDev(config, DEFAULTS) || !!tickOverride;
  document.body.classList.toggle('dev', dev);
  const b = $('dev-badge');
  if (b) b.hidden = !dev;
}

// ---------- run lifecycle ----------
const lockUntil = [0, 0, 0];
const pressing = [false, false, false];
const shownDrops = {};

function startRun() {
  profile.build = core.validateBuild(profile, config);
  state = core.newRun(profile, config);
  runFinished = false;
  acc = 0;
  last = null;
  lockUntil[0] = lockUntil[1] = lockUntil[2] = 0;
  pressing[0] = pressing[1] = pressing[2] = false;
  for (const k of Object.keys(shownDrops)) delete shownDrops[k];
  const tray = $('tray');
  if (tray) tray.replaceChildren();
  setText($('toast'), '');
  const toast = $('toast');
  if (toast) toast.classList.remove('show');
  setScreen('run');
}

function finishRun() {
  if (runFinished || !state) return;
  runFinished = true;
  lastState = state;
  lastSummary = core.endRun(profile, state);
  house.saveProfile(profile);
  renderEnd();
  setScreen('end');
}

function processEvents(events) {
  for (const e of events || []) {
    if (e && e.kind === 'end') { /* state.over handled by caller */ }
  }
}

function doTicks(n) {
  if (!state || runFinished) return;
  for (let k = 0; k < n; k++) {
    processEvents(core.tick(state));
    if (state.over) { finishRun(); return; }
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
  const paused = isSettingsOpen();
  if (screen !== 'run' || !state || runFinished || paused) { acc = 0; return; }
  acc += dt;
  const tm = Math.max(1, config.tickMs || 1000);
  let steps = Math.floor(acc / tm);
  if (steps > 0) {
    acc -= steps * tm;
    if (steps > 3) { steps = 3; acc = 0; }   // catch-up cap 3
    doTicks(steps);
  }
}
document.addEventListener('visibilitychange', () => { last = null; acc = 0; });

// ---------- helpers ----------
const money = (v) => {
  const a = Math.abs(v);
  const r = Math.round(a);
  if (r === 0 && a > 0.005) return a.toFixed(1);
  return String(r);
};
const signed = (v) => (v < 0 ? '−$' : '+$') + money(v);
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const scarName = (t) => (SCARS[t] ? SCARS[t].name : 'Scar');

function ensureToggle(tog) {
  let face = tog.querySelector('.face');
  let chip = tog.querySelector('.chip');
  if (!face) {
    Array.from(tog.childNodes).forEach((n) => { if (n.nodeType === 3) n.remove(); });
    face = document.createElement('span');
    face.className = 'face';
    tog.insertBefore(face, tog.firstChild);
  }
  if (!chip) {
    chip = document.createElement('span');
    chip.className = 'chip';
    tog.appendChild(chip);
  }
  return { face, chip };
}

// ---------- run render ----------
function render() {
  if (!state) return;
  setText($('hud-timer'), fmtTime(state.runSec - state.t));
  setText($('hud-cash'), '$' + Math.round(state.cash));
  renderBuildStrip();
  for (let i = 0; i < 3; i++) renderRow(i);
  renderTray();
}

function renderBuildStrip() {
  const slots = $$('#build-strip .slot');
  const build = state.build || [];
  slots.forEach((el, k) => {
    const t = build[k];
    const has = t != null;
    setText(el, has ? scarName(t) : '');
    el.dataset.type = has ? String(t) : '';
    el.classList.toggle('filled', has);
  });
}

function renderRow(i) {
  const row = $('row-' + i);
  const tog = $('tog-' + i);
  if (!row || !tog) return;
  const price = state.px[i][Math.min(state.t, state.px[i].length - 1)];
  const pos = state.pos[i];
  setText(row.querySelector('.stock-name'), STOCKS[i]);
  setText(row.querySelector('.price'), '$' + price.toFixed(2));
  setText(row.querySelector('.held'), pos ? `Held ${pos.qty.toFixed(1)} · avg $${pos.buyPrice.toFixed(2)}` : 'Flat');
  const { face, chip } = ensureToggle(tog);
  const now = performance.now();
  const locked = now < lockUntil[i];
  tog.classList.toggle('locked', locked);
  if (!pressing[i]) {
    if (pos) {
      const sp = core.sellPreview(state, i);
      const neg = sp.pnl < 0;
      tog.dataset.mode = 'sell';
      tog.dataset.loss = sp.loss ? '1' : '0';
      tog.dataset.win = neg ? '0' : '1';
      setText(face, 'SELL ' + (neg ? '−$' : '+$') + money(sp.pnl));
      let c = '';
      if (sp.loss) c = sp.scar ? (sp.scar.spare ? 'SPARE' : '+SCAR ' + sp.scar.name) : 'NO SCAR';
      else if (neg) c = 'NO SCAR';
      else if (sp.perkTag) c = sp.perkTag;
      setText(chip, c);
      chip.hidden = !c;
      tog.removeAttribute('aria-disabled');
    } else {
      const ok = core.canBuy(state, i);
      const lot = core.buyPreview(state, i).lot;
      tog.dataset.mode = 'buy';
      tog.dataset.loss = '0';
      tog.dataset.win = '0';
      setText(face, 'BUY $' + Math.floor(lot));
      setText(chip, '');
      chip.hidden = true;
      if (ok) tog.removeAttribute('aria-disabled'); else tog.setAttribute('aria-disabled', 'true');
    }
  }
  drawSpark(row.querySelector('canvas.spark'), i, pos);
}

function drawSpark(cv, i, pos) {
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw) cv.width = pw;
  if (cv.height !== ph) cv.height = ph;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const px = state.px[i];
  const t = Math.min(state.t, px.length - 1);
  const from = Math.max(0, t - (SPARK_N - 1));
  const s = px.slice(from, t + 1);
  let lo = Math.min(...s), hi = Math.max(...s);
  const buy = pos ? pos.buyPrice : null;
  const tickP = buy != null ? buy * (1 - state.config.lossLine) : null;
  if (buy != null) { lo = Math.min(lo, tickP); hi = Math.max(hi, buy); }
  if (hi - lo < 0.01) { hi += 0.5; lo -= 0.5; }
  const padT = 3, padB = 3;
  const y = (p) => padT + (1 - (p - lo) / (hi - lo)) * (h - padT - padB);
  const x = (k) => (s.length <= 1 ? w - 2 : 2 + (k / (SPARK_N - 1)) * (w - 4));
  // buy line + 4% tick
  if (buy != null) {
    ctx.save();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, y(buy)); ctx.lineTo(w, y(buy)); ctx.stroke();
    ctx.restore();
    const ty = y(tickP);
    ctx.strokeStyle = '#e8604c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w - 14, ty); ctx.lineTo(w, ty); ctx.stroke();
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillStyle = '#e8604c';
    ctx.textAlign = 'right';
    ctx.textBaseline = ty > h - 9 ? 'bottom' : 'top';
    ctx.fillText('4%', w - 17, ty > h - 9 ? ty + 1 : ty - 7 < 0 ? 0 : ty - 7);
  }
  // price line
  const lastP = s[s.length - 1];
  const down = buy != null && lastP < buy;
  ctx.strokeStyle = down ? '#ff8a73' : '#f3d9a4';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  s.forEach((p, k) => { if (k) ctx.lineTo(x(k), y(p)); else ctx.moveTo(x(k), y(p)); });
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(x(s.length - 1), y(lastP), 2.5, 0, 6.2832); ctx.fill();
}

function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function renderTray() {
  const tray = $('tray');
  if (!tray) return;
  const counts = {};
  for (const d of state.drops || []) counts[d.type] = (counts[d.type] || 0) + 1;
  for (const k of Object.keys(counts)) {
    const type = Number(k);
    const n = counts[k];
    if (shownDrops[k] === n) continue;
    const isNew = !shownDrops[k];
    shownDrops[k] = n;
    let card = tray.querySelector(`.tray-card[data-type="${type}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'tray-card';
      card.dataset.type = String(type);
      card.title = scarName(type);
      const ini = document.createElement('span');
      ini.className = 'ini';
      ini.textContent = initials(scarName(type));
      const badge = document.createElement('span');
      badge.className = 'badge';
      card.append(ini, badge);
      tray.appendChild(card);
    }
    setText(card.querySelector('.badge'), '×' + n);
    card.classList.remove('flip');
    void card.offsetWidth;
    card.classList.add('flip');
    setTimeout(() => card.classList.remove('flip'), 450);
    void isNew;
  }
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ---------- toggles ----------
function onToggleDown(i, ev) {
  if (screen !== 'run' || !state || runFinished || isSettingsOpen()) return;
  if (ev && ev.cancelable) ev.preventDefault();
  const tog = $('tog-' + i);
  if (performance.now() < lockUntil[i]) return;
  if (state.pos[i]) {
    const ev2 = core.sell(state, i);
    if (ev2) {
      const pnl = ev2.pnl || 0;
      let msg = `SOLD ${STOCKS[i]} ${signed(pnl)}`;
      if (ev2.loss && ev2.scar) {
        msg += ev2.scar.spare ? ' · SPARE +1 cash next run' : ` · SCAR ${ev2.scar.name}`;
      }
      showToast(msg);
    }
  } else if (core.canBuy(state, i)) {
    if (core.buy(state, i)) {
      lockUntil[i] = performance.now() + (config.buyLockMs || 0);
      setTimeout(() => { if (state) render(); }, (config.buyLockMs || 0) + 20);
    }
  }
  pressing[i] = false;
  render();
  pressing[i] = true;               // label stays put while pointer is down
  if (tog) tog.classList.add('down');
}

function releaseAll() {
  let any = false;
  for (let i = 0; i < 3; i++) {
    if (pressing[i]) { pressing[i] = false; any = true; const t = $('tog-' + i); if (t) t.classList.remove('down'); }
  }
  if (any && state && screen === 'run') render();
}

// ---------- end screen ----------
function renderEnd() {
  const sum = lastSummary, st = lastState;
  if (!sum || !st) return;
  const start = Math.round(sum.startCash), end = Math.round(sum.endCash);
  setText($('end-cash'), `${start} → ${end}`);
  const pl = sum.endCash - sum.startCash;
  const nScars = (st.drops || []).length;
  setText($('end-pl'), `P/L ${signed(pl)} · scars +${nScars}`);
  const box = $('end-scars');
  if (box) {
    box.replaceChildren();
    const agg = {};
    for (const d of st.drops || []) {
      const a = agg[d.type] || (agg[d.type] = { n: 0, spare: false });
      a.n++;
      if (d.spare) a.spare = true;
    }
    const types = Object.keys(agg).map(Number).sort((a, b) => a - b);
    for (const type of types) {
      const a = agg[type];
      const c = document.createElement('div');
      c.className = 'scar-card';
      c.dataset.type = String(type);
      c.dataset.spare = a.spare ? '1' : '0';
      const nm = document.createElement('b'); nm.className = 'sn'; nm.textContent = scarName(type);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = '×' + a.n;
      const pk = document.createElement('span'); pk.className = 'pk'; pk.textContent = core.perkText(type, config).replace(/\n/g, ' ');
      c.append(nm, cnt, pk);
      if (a.spare) {
        const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = 'SPARE';
        c.appendChild(chip);
      }
      box.appendChild(c);
    }
    if (!types.length) {
      const e = document.createElement('div');
      e.className = 'no-scars';
      e.textContent = 'No scars this run';
      box.appendChild(e);
    }
  }
  setText($('end-proto'), protoText());
}

function protoText() {
  const p = core.protoCheck(profile);
  const n = profile.runs.length;
  if (p.ratio == null) return `Play 5 runs for the test (${Math.min(n, 5)}/5)`;
  const pct = Math.round(p.ratio < 10 ? p.ratio * 100 : p.ratio);
  return `Run 1 ${Math.round(p.run1)} · median runs 3-5 ${Math.round(p.medianR3to5)} · ${pct}% ${p.pass ? 'PASS' : 'FAIL'}`;
}

function endTapOk() {
  return performance.now() - endShownAt >= END_IGNORE_MS;
}

// ---------- slot screen ----------
function slottedCount(type) {
  return (profile.build || []).filter((t) => t === type).length;
}

function renderSlot() {
  const slotsBox = $('slots');
  if (slotsBox) {
    let bigs = $$('.slot-big', slotsBox);
    while (bigs.length < (config.slots || 3)) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'slot-big';
      d.dataset.slot = String(bigs.length);
      slotsBox.appendChild(d);
      bigs.push(d);
    }
    bigs.forEach((el, k) => {
      const t = (profile.build || [])[k];
      const has = t != null;
      el.dataset.slot = String(k);
      el.dataset.type = has ? String(t) : '';
      el.classList.toggle('filled', has);
      el.replaceChildren();
      const nm = document.createElement('b');
      nm.className = 'sn';
      nm.textContent = has ? scarName(t) : 'EMPTY';
      el.appendChild(nm);
      if (has) {
        const pk = document.createElement('span');
        pk.className = 'pk';
        pk.textContent = core.perkText(t, config).replace(/\n/g, ' ');
        el.appendChild(pk);
      }
    });
  }
  const coll = $('collection');
  if (coll) {
    coll.replaceChildren();
    for (const sc of SCARS) {
      const own = profile.collection[sc.type] || 0;
      const free = own - slottedCount(sc.type);
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'coll-card';
      c.dataset.type = String(sc.type);
      const off = own <= 0 || free <= 0;
      c.disabled = off;
      c.classList.toggle('disabled', off);
      c.classList.toggle('selected', selectedType === sc.type);
      const nm = document.createElement('b'); nm.className = 'sn'; nm.textContent = sc.name;
      const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = '×' + own;
      const pk = document.createElement('span'); pk.className = 'pk'; pk.textContent = core.perkText(sc.type, config).replace(/\n/g, ' ');
      c.append(nm, cnt, pk);
      coll.appendChild(c);
    }
  }
  // effect line
  const counts = {};
  for (const t of profile.build || []) if (t != null) counts[t] = (counts[t] || 0) + 1;
  const parts = Object.keys(counts).map(Number).map((t) => core.perkText(t, config).replace(/\n/g, ' ') + (counts[t] > 1 ? ` ×${counts[t]}` : ''));
  setText($('slot-effect'), parts.length ? parts.join(' · ') : 'No scars slotted');
  setText($('spare-note'), `+${profile.sparesNext || 0} cash from spares at start`);
}

function setSlot(idx, type) {
  if (core.setSlot(profile, idx, type, config)) {
    house.saveProfile(profile);
    return true;
  }
  return false;
}

function onCollTap(type) {
  const c = $('collection') && $('collection').querySelector(`.coll-card[data-type="${type}"]`);
  if (c && c.disabled) return;
  const empty = (profile.build || []).findIndex((t) => t == null);
  if (empty >= 0) {
    setSlot(empty, type);
    selectedType = null;
  } else {
    selectedType = selectedType === type ? null : type;
  }
  renderSlot();
}

function onSlotTap(idx) {
  const cur = (profile.build || [])[idx];
  if (selectedType != null) {
    setSlot(idx, selectedType);
    selectedType = null;
  } else if (cur != null) {
    setSlot(idx, null);
  }
  renderSlot();
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
  s.classList.add('open');
}
function closeSettings() {
  const s = $('settings');
  if (s) s.classList.remove('open');
  last = null;
  if (state && screen === 'run') render();
}
function mountSettingsOnce() {
  const body = $('settings-body');
  if (!body) return;
  settingsMounted = true;
  house.mountSettings(body, {
    DEFAULTS, SCARS, STOCKS,
    getConfig: () => ({ ...baseConfig }),
    setConfig: (cfg) => {
      baseConfig = { ...cfg };
      house.saveConfig(baseConfig);
      config = effectiveConfig();      // applies to the NEXT run; current run keeps state.config
      applyDev();
    },
    getReport: () => core.report(profile, config),
    onResetProgress: () => {
      profile = freshProfile();
      state = null; lastState = null; lastSummary = null; runFinished = false;
      selectedType = null;
      closeSettings();
      setScreen('start');
    },
    onClose: closeSettings,
  });
}

// ---------- wiring ----------
function wire() {
  setText($('build-id'), core.BUILD);
  const play = $('btn-play');
  if (play) play.addEventListener('click', () => {
    if (screen !== 'start') return;
    const owns = (profile.collection || []).some((n) => n > 0);
    if (owns) { selectedType = null; setScreen('slot'); } else startRun();
  });
  for (const id of ['btn-settings-start', 'btn-settings']) {
    const b = $(id);
    if (b) b.addEventListener('click', openSettings);
  }
  const close = $('btn-settings-close');
  if (close) close.addEventListener('click', closeSettings);

  for (let i = 0; i < 3; i++) {
    const tog = $('tog-' + i);
    if (tog) {
      tog.addEventListener('pointerdown', (e) => onToggleDown(i, e));
      tog.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  window.addEventListener('pointerup', releaseAll);
  window.addEventListener('pointercancel', releaseAll);
  window.addEventListener('blur', releaseAll);

  const copy = $('btn-copy-report');
  if (copy) copy.addEventListener('click', async () => {
    if (!endTapOk()) return;
    const ok = await house.copyText(core.report(profile, config));
    const old = copy.dataset.label || copy.textContent;
    copy.dataset.label = old;
    copy.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => { copy.textContent = old; }, 1500);
  });
  const reset = $('btn-reset-run');
  if (reset) reset.addEventListener('click', () => {
    if (screen !== 'end' || !endTapOk()) return;
    selectedType = null;
    setScreen('slot');
  });

  const coll = $('collection');
  if (coll) coll.addEventListener('click', (e) => {
    const c = e.target.closest('.coll-card');
    if (c && !c.disabled) onCollTap(Number(c.dataset.type));
  });
  const slots = $('slots');
  if (slots) slots.addEventListener('click', (e) => {
    const s = e.target.closest('.slot-big');
    if (s) onSlotTap(Number(s.dataset.slot));
  });
  const go = $('btn-start-run');
  if (go) go.addEventListener('click', () => { if (screen === 'slot') startRun(); });

  window.addEventListener('resize', () => { applyLayout(); if (state && screen === 'run') render(); });
}

window.__btb = {
  getState: () => state,
  getProfile: () => profile,
  getConfig: () => config,
  step(n = 1) {
    if (screen === 'run' && state && !runFinished) doTicks(Math.max(0, n | 0));
    return state;
  },
  report: () => core.report(profile, config),
};

wire();
applyLayout();
applyDev();
setScreen('start');
requestAnimationFrame(frame);
