// Windward Line - DOM UI (M7). initUI(root, api) -> {update, showResult, showUnlock, hideOverlays, toast, openSettings, closeSettings}
// Builds every element inside root except #map (already there). update() runs every frame: DOM touched only on change.
import { resultMark } from './render.js';
import { breakRating, STAGES, CELL_PX, fmtTime, cfgDiffers, windVec, defaultCfg } from './contract.js';

const TOOL_NAME = { zone: 'Shelter', break: 'Firebreak', road: 'Road', crew: 'Crew', pump: 'Pump' };
const TOOL_HINT = {
  zone: 'Drag a box over town roads: road cells on the edge become gates',
  break: 'Drag a line to cut a firebreak (pick 1, 2 or 3 wide)',
  road: 'Drag a line to lay road; bridges cross water',
  crew: 'Tap a building to station a hose crew',
  pump: 'Tap a building to make it a pump house (1 per round)',
};
const PLAN_TOOLS = ['zone', 'break', 'road', 'crew', 'pump'];
const CALLINS = ['bomber', 'dozer'];
const CALLIN_NAME = { bomber: 'Bomber', dozer: 'Dozer' };

export function initUI(root, api) {
  const A = api || {};
  const call = (n, ...a) => { try { return typeof A[n] === 'function' ? A[n](...a) : undefined; } catch (e) { return undefined; } };

  function el(tag, cls, text, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function btn(cls, text, attrs) { const b = el('button', 'btn ' + (cls || ''), text, attrs); b.type = 'button'; return b; }
  // cached writers
  function setText(e, s) { if (e._t !== s) { e._t = s; e.textContent = s; } }
  function setCls(e, c, on) { on = !!on; if (e['_c' + c] !== on) { e['_c' + c] = on; e.classList.toggle(c, on); } }
  function setAttr(e, k, v) { const key = '_a' + k; if (e[key] !== v) { e[key] = v; if (v === null) e.removeAttribute(k); else e.setAttribute(k, v); } }
  function setHidden(e, h) { h = !!h; if (e._h !== h) { e._h = h; e.hidden = h; } }
  function setDis(e, d) { d = !!d; if (e._d !== d) { e._d = d; e.disabled = d; } }

  root.setAttribute('data-phase', 'plan');

  // ---------- top bar ----------
  const top = el('div', null, null, { id: 'topbar' });
  const r1 = el('div', 'tb-row1');
  const tMoney = el('span', 'tb-money', '$0');
  const tSafe = el('span', 'tb-safe', 'Alive 100% · need 25%');
  const tTime = el('span', 'tb-time', '0:00');
  const bSettings = btn('', '⚙', { id: 'btn-settings', 'aria-label': 'Settings' });
  r1.append(tMoney, tSafe, tTime, bSettings);
  const r2 = el('div', 'tb-row2');
  const tStage = el('span', 'tb-stage', 'Valley 1 · stage 1/2');
  const dev = el('span', null, 'DEV', { id: 'dev-badge' }); dev.hidden = true;
  tStage.append(dev);
  const windBox = el('span', 'tb-wind');
  const svgNS = 'http://www.w3.org/2000/svg';
  const windSvg = document.createElementNS(svgNS, 'svg');
  windSvg.setAttribute('viewBox', '-10 -10 20 20'); windSvg.setAttribute('aria-hidden', 'true');
  const wg = document.createElementNS(svgNS, 'g');
  const wp = document.createElementNS(svgNS, 'path'); wp.setAttribute('d', 'M-7 0H7M2 -5L7 0L2 5');
  wg.appendChild(wp); windSvg.appendChild(wg);
  const tWind = el('span', 'tb-windtxt', 'Wind steady');
  windBox.append(windSvg, tWind);
  r2.append(tStage, windBox);
  top.append(r1, r2);
  // text node of stage label lives before the badge: keep a dedicated span for it
  tStage.textContent = ''; const tStageTxt = el('span', null, 'Valley 1 · stage 1/2'); tStage.append(tStageTxt, dev);

  // ---------- plan tray ----------
  const trayPlan = el('div', null, null, { id: 'tray-plan' });
  const info = el('div', 'info');
  const infoTxt = el('span', null, 'Pick a tool, or drag the map to pan');
  info.appendChild(infoTxt);
  const tools = el('div', 'tools');
  const toolBtns = {};
  for (const t of PLAN_TOOLS) {
    const b = btn('', null, { 'data-tool': t, 'aria-pressed': 'false' });
    const n = el('span', 'tool tool-name', TOOL_NAME[t]); const c = el('small', 'tool tool-cost', '');
    b.append(n, c); b._c = c; toolBtns[t] = b; tools.appendChild(b);
  }
  const rowB = el('div', 'row-b');
  const chips = el('div', 'chips');
  const wBtns = {};
  for (const w of [1, 2, 3]) {
    const b = btn('', w + ' wide', { 'data-width': String(w), 'aria-label': 'Break width ' + w + ' cells', 'aria-pressed': 'false' });
    wBtns[w] = b; chips.appendChild(b);
  }
  const bUndo = btn('edit', 'Undo', { 'data-act': 'undo' });
  const bClear = btn('edit', 'Clear all', { 'data-act': 'clear' });
  const bStart = btn('primary', 'START', { id: 'btn-start' });
  rowB.append(chips, bUndo, bClear, bStart);
  trayPlan.append(info, tools, rowB);

  // ---------- run tray ----------
  const trayRun = el('div', null, null, { id: 'tray-run' });
  const callins = el('div', 'runrow callins');
  const ciBtns = {};
  for (const t of CALLINS) {
    const b = btn('', null, { 'data-callin': t, 'aria-pressed': 'false' });
    const n = el('span', null, CALLIN_NAME[t]); const s = el('small', null, '');
    b.append(n, s); b._n = n; b._s = s; ciBtns[t] = b; callins.appendChild(b);
  }
  const runRow = el('div', 'runrow');
  const bPause = btn('pause', 'Pause', { 'data-act': 'pause' });
  const spBtns = {};
  runRow.appendChild(bPause);
  for (const s of [1, 2, 4]) { const b = btn('', s + 'x', { 'data-speed': String(s), 'aria-pressed': 'false' }); spBtns[s] = b; runRow.appendChild(b); }
  trayRun.append(callins, runRow);

  // ---------- result ----------
  const result = el('div', 'overlay', null, { id: 'result', role: 'dialog', 'aria-label': 'Result' }); result.hidden = true;
  const rCard = el('div', 'card');
  const rBig = el('div', 'big', '0%');
  const rVerdict = el('div', 'verdict', '');
  const rStars = el('div', 'stars', '');
  const starEls = [];
  for (let i = 0; i < 3; i++) { const sp = el('span', 'star', '★'); starEls.push(sp); rStars.appendChild(sp); }
  const rCause = el('div', null, '', { id: 'cause' });
  const rNote = el('div', 'note', '');
  const bRetry = btn('primary', 'Retry same plan', { 'data-act': 'retry' });
  const bEdit = btn('', 'Edit plan', { 'data-act': 'edit' });
  const bNext = btn('accent', 'Next stage', { 'data-act': 'next' });
  const bSee = btn('', 'See on map', { 'data-act': 'see-map' }); bSee.hidden = true;
  rCard.append(rBig, rVerdict, rStars, rCause, rNote, bSee, bRetry, bEdit, bNext);
  result.appendChild(rCard);

  // ---------- unlock ----------
  const unlock = el('div', 'overlay', null, { id: 'unlock', role: 'dialog', 'aria-label': 'Unlocked' }); unlock.hidden = true;
  const uCard = el('div', 'card');
  const uHead = el('h2', null, 'Dozer line unlocked');
  const uBody = el('p', null, '');
  const bOk = btn('accent', 'OK', { 'data-act': 'unlock-ok' });
  uCard.append(uHead, uBody, bOk);
  unlock.appendChild(uCard);

  // ---------- no-shelter warning (stage1-clarity fix 1) ----------
  const warn = el('div', 'overlay', null, { id: 'warn', role: 'dialog', 'aria-label': 'No shelter' }); warn.hidden = true;
  const wCard = el('div', 'card');
  const wHead = el('h2', null, 'No shelter');
  const wBody = el('p', null, 'No shelter: people have nowhere safe to go. Start anyway?');
  const bWarnGo = btn('', 'Start anyway', { 'data-act': 'warn-go' });
  const bWarnBack = btn('primary', 'Back to plan', { 'data-act': 'warn-back' });
  wCard.append(wHead, wBody, bWarnBack, bWarnGo);
  warn.appendChild(wCard);

  // ---------- settings ----------
  const settings = el('div', 'overlay', null, { id: 'settings', role: 'dialog', 'aria-label': 'Settings' }); settings.hidden = true;
  const panel = el('div', 'panel');
  const pHead = el('div', 'panel-head');
  const bClose = btn('', 'Close', { 'data-act': 'close-settings' });
  bClose.style.flexDirection = 'row';
  pHead.append(el('h2', null, 'Settings'), bClose);
  const pBody = el('div', 'panel-body');
  const secRun = el('section');
  const line1 = el('div', 'line');
  const bCopy = btn('', 'Copy report', { id: 'btn-copy' });
  const bSave = btn('', 'Save preset', { id: 'btn-save-preset' });
  line1.append(bCopy, bSave);
  secRun.append(line1);
  const secSeed = el('section');
  secSeed.append(el('h3', null, 'Seed'));
  const line2 = el('div', 'line');
  const seedIn = el('input', null, null, { type: 'number', inputmode: 'numeric', step: '1', 'aria-label': 'Seed', id: 'seed-input' });
  seedIn.value = '1';
  const bApply = btn('', 'Apply', { 'data-act': 'seed-apply' });
  bApply.style.flex = '0 0 96px';
  line2.append(seedIn, bApply);
  secSeed.append(line2);
  const secStage = el('section');
  secStage.append(el('h3', null, 'Stage'));
  const line3 = el('div', 'line');
  const bS1 = btn('', 'Stage 1', { 'data-stage': '1' });
  const bS2 = btn('', 'Stage 2', { 'data-stage': '2' });
  line3.classList.add('stack'); line3.append(bS1, bS2);
  secStage.append(line3);
  const secTweak = el('section');
  secTweak.append(el('h3', null, 'Tweaks'));
  const tweakPanel = el('div', null, null, { id: 'tweak-panel' });
  secTweak.append(tweakPanel);
  const secCalm = el('section');
  secCalm.append(el('h3', null, 'Motion'));
  const bCalm = btn('', 'Calm motion: off', { id: 'calm-toggle', 'aria-pressed': 'false' });
  bCalm.style.minHeight = '48px'; // integrator: layout gate tap >= 48
  secCalm.append(bCalm);
  pBody.append(secRun, secSeed, secStage, secCalm, secTweak);
  panel.append(pHead, pBody);
  settings.appendChild(panel);

  const toastEl = el('div', null, '', { id: 'toast', role: 'status', 'aria-live': 'polite' }); toastEl.hidden = true;

  const bBack = btn('accent', 'Back to result', { 'data-act': 'back-result' }); bBack.hidden = true;
  Object.assign(bBack.style, { position: 'fixed', zIndex: '25', left: '50%', transform: 'translateX(-50%)', width: 'auto', minWidth: '160px', height: '48px', minHeight: '48px', padding: '0 20px', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', flexDirection: 'row' });
  root.append(bBack, top, trayPlan, trayRun, result, unlock, warn, settings, toastEl);

  // ---------- state ----------
  let armed = null;       // armed call-in (local mirror unless api.getArmed exists)
  let bw = 2;             // break width
  let last = null;        // last state seen
  let evSeen = 0, warned = false, shiftedEv = false, evStateId = null;
  let toastTimer = 0, toastOut = 0;
  let countRaf = 0, starTimers = [];
  let moneyShown = null, moneyRaf = 0, moneyFrom = 0, moneyTo = 0, moneyT0 = 0;
  const isCalm = () => !!(A.getCalm ? call('getCalm') : false); // admin default guard
  const noTween = () => isCalm() || !!(window.__test && window.__test.busy);
  const eoc = (t) => 1 - Math.pow(1 - t, 3);
  let presetN = 0;
  let resultWanted = false, mapMode = false; // result sheet logically open (hidden visually while the unlock card shows)
  const cfgOf = (s) => (s && s.cfg) || call('getCfg') || defaultCfg;

  // ---------- overlay stacking ----------
  function syncInert() {
    const anyOpen = (resultWanted && !mapMode) || !unlock.hidden || !settings.hidden || !warn.hidden;
    for (const e of [top, trayPlan, trayRun, document.getElementById('map')]) {
      if (!e) continue;
      setAttr(e, 'aria-hidden', anyOpen ? 'true' : null);
      setAttr(e, 'inert', anyOpen ? '' : null);
    }
    const topIsUnlock = !unlock.hidden;
    const resCovered = topIsUnlock || !settings.hidden;
    setHidden(result, resultWanted && !unlock.hidden ? true : (!resultWanted || mapMode));
    bBack.hidden = !(resultWanted && mapMode) || !settings.hidden;
    setAttr(result, 'aria-hidden', resCovered ? 'true' : null);
    setAttr(result, 'inert', resCovered ? '' : null);
    const setCovered = !unlock.hidden;
    setAttr(settings, 'aria-hidden', setCovered ? 'true' : null);
    setAttr(settings, 'inert', setCovered ? '' : null);
  }
  function refreshStagePicker() {
    const un = !!call('isUnlocked', 'dozer');
    setText(bS2, un ? 'Stage 2' : 'Stage 2 (locked: win stage 1)');
    setDis(bS2, !un);
    const cur = last ? last.stage : 1;
    setCls(bS1, 'on', cur === 1); setCls(bS2, 'on', cur === 2);
    setAttr(bS1, 'aria-pressed', cur === 1 ? 'true' : 'false'); setAttr(bS2, 'aria-pressed', cur === 2 ? 'true' : 'false');
  }
  function refreshCalm() {
    const on = isCalm();
    setAttr(bCalm, 'aria-pressed', on ? 'true' : 'false'); setText(bCalm, 'Calm motion: ' + (on ? 'on' : 'off'));
    setDis(bCalm, !A.setCalm);
  }
  function openSettings() {
    if (!settings.hidden) return;
    refreshStagePicker(); refreshCalm();
    settings.hidden = false; syncInert();
    call('openSettings');
  }
  function closeSettings() {
    if (settings.hidden) return;
    settings.hidden = true; syncInert();
    call('closeSettings');
  }

  function showResult(state) {
    const s = state || last; if (!s) return;
    const r = s.result || { win: false, pct: s.counts ? Math.floor(100 * s.counts.safe / Math.max(1, s.counts.people0)) : 0, stars: 0, cause: '' };
    const floor = cfgOf(s).winFloor;
    cancelAnimationFrame(countRaf); for (const id of starTimers) clearTimeout(id); starTimers = [];
    setText(rVerdict, (r.win ? 'PASS' : 'FAIL') + ' · floor ' + floor + '%');
    setCls(rVerdict, 'pass', r.win); setCls(rVerdict, 'fail', !r.win);
    const n = Math.max(0, Math.min(3, r.stars | 0));
    for (let i = 0; i < 3; i++) { starEls[i].classList.remove('pop'); setCls(starEls[i], 'on', false); }
    const earn = () => { for (let i = 0; i < n; i++) starEls[i].classList.add('on'); };
    const popStars = () => { for (let i = 0; i < n; i++) starTimers.push(setTimeout(() => { starEls[i].classList.add('on', 'pop'); }, i * 250)); };
    if (noTween()) { rBig._t = null; setText(rBig, r.pct + '%'); earn(); }
    else {
      rBig._t = null; setText(rBig, '0%');
      const t0 = performance.now(), target = r.pct;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        const v = Math.round(target * eoc(k)); rBig.textContent = v + '%'; rBig._t = v + '%';
        if (k < 1) countRaf = requestAnimationFrame(step); else { setText(rBig, target + '%'); popStars(); }
      };
      countRaf = requestAnimationFrame(step);
    }
    setAttr(rStars, 'aria-label', n + ' of 3 stars');
    setText(rCause, r.cause || '');
    const st = s.stage;
    setHidden(bNext, !(r.win && st === 1));
    setText(rNote, r.win && st === 2 ? 'Valley 1 continues - stages 3 to 5 later' : '');
    setHidden(rNote, !(r.win && st === 2));
    mapMode = false; bSee.hidden = !resultMark(s);
    resultWanted = true; syncInert();
  }
  function seeOnMap() {
    const s = last, mk = resultMark(s), W = window.WL, v = W && W.view, m = document.getElementById('map');
    if (mk && v && m) { // centre the camera on the mark (admin default)
      const S = CELL_PX * v.scale;
      v.ox = (mk.x + 0.5) * S - (m.clientWidth || window.innerWidth) / 2;
      v.oy = (mk.y + 0.5) * S - (m.clientHeight || window.innerHeight) / 2;
    }
    mapMode = true; syncInert(); try { W && W.render && W.render(); } catch (e) { /* ignore */ }
  }
  function showUnlock(text) {
    let body = String(text == null ? '' : text).replace(/^\s*Dozer line unlocked\s*[:.\-–]?\s*/i, '');
    setText(uBody, body); setHidden(uBody, !body);
    unlock.hidden = false; refreshStagePicker(); syncInert();
  }
  function hideOverlays() {
    resultWanted = false; mapMode = false; unlock.hidden = true; warn.hidden = true; syncInert();
  }
  function toast(text) {
    toastEl.textContent = String(text == null ? '' : text); toastEl.hidden = false; toastEl.classList.remove('out');
    clearTimeout(toastTimer); clearTimeout(toastOut);
    toastTimer = setTimeout(() => { toastEl.classList.add('out'); toastOut = setTimeout(() => { toastEl.hidden = true; toastEl.classList.remove('out'); }, 200); }, 2200);
  }

  // ---------- events ----------
  root.addEventListener('click', (ev) => {
    const t = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!t || t.disabled || !root.contains(t)) return;
    if (t.dataset.tool) {
      const cur = call('getTool');
      call('setTool', cur === t.dataset.tool ? null : t.dataset.tool);
      armed = null; call('armCallin', null);
      if (last) update(last);
    } else if (t.dataset.width) {
      bw = +t.dataset.width; call('setBreakWidth', bw); if (last) update(last);
    } else if (t.dataset.callin) {
      const k = t.dataset.callin;
      const cur = typeof A.getArmed === 'function' ? call('getArmed') : armed;
      armed = cur === k ? null : k;
      call('armCallin', armed);
      if (last) update(last);
    } else if (t.dataset.speed) {
      call('setSpeed', +t.dataset.speed);
    } else if (t.dataset.stage) {
      hideOverlays(); closeSettings(); call('goStage', +t.dataset.stage);
    } else if (t.id === 'btn-start') {
      const noShelter = !(last && last.zones && last.zones.length);
      if (noShelter) { warn.hidden = false; syncInert(); const f = warn.querySelector('[data-act="warn-back"]'); if (f && f.focus) f.focus(); } else call('start');
    } else if (t.id === 'calm-toggle') { if (A.setCalm) { call('setCalm', !isCalm()); refreshCalm(); }
    } else if (t.id === 'btn-settings') { openSettings();
    } else if (t.id === 'btn-copy') { call('copyReport');
    } else if (t.id === 'btn-save-preset') {
      import('./tweak.js').then((m) => { presetN++; m.savePreset('preset-' + presetN, call('getCfg') || defaultCfg); toast('Preset saved'); })
        .catch(() => toast('Preset save unavailable'));
    } else {
      switch (t.dataset.act) {
        case 'undo': call('undo'); break;
        case 'clear': call('clearAll'); break;
        case 'pause': call('pause', !(last && last.paused)); break;
        case 'see-map': seeOnMap(); break;
        case 'back-result': mapMode = false; syncInert(); break;
        case 'retry': hideOverlays(); call('retry'); break;
        case 'edit': hideOverlays(); call('editPlan'); break;
        case 'next': hideOverlays(); call('nextStage'); break;
        case 'warn-back': warn.hidden = true; syncInert(); break;
        case 'warn-go': warn.hidden = true; syncInert(); call('start'); break;
        case 'unlock-ok': unlock.hidden = true; syncInert(); break; // result sheet comes back
        case 'close-settings': closeSettings(); break;
        case 'seed-apply': { const n = parseInt(seedIn.value, 10); if (isFinite(n)) { call('setSeed', n); toast('Seed ' + n); } break; }
      }
    }
  });
  seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') bApply.click(); });

  function setMoney(v) {
    if (moneyShown === null || noTween()) { moneyShown = v; moneyTo = v; cancelAnimationFrame(moneyRaf); moneyRaf = 0; setText(tMoney, '$' + v); return; }
    if (v === moneyTo) return;
    moneyFrom = moneyShown; moneyTo = v; moneyT0 = performance.now();
    if (moneyRaf) return;
    const step = (now) => {
      const k = Math.min(1, (now - moneyT0) / 300);
      moneyShown = Math.round(moneyFrom + (moneyTo - moneyFrom) * eoc(k));
      setText(tMoney, '$' + moneyShown);
      moneyRaf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    moneyRaf = requestAnimationFrame(step);
  }

  // ---------- per-frame update ----------
  function update(state) {
    if (!state) return;
    if (state !== last) { // new state object: reset event tracking
      if (!last || last.stage !== state.stage) refreshStagePicker();
      last = state; evSeen = 0; warned = false; shiftedEv = false;
    }
    const cfg = cfgOf(state);
    const phase = state.phase || 'plan';
    setAttr(root, 'data-phase', phase);
    const stg = STAGES[state.stage] || STAGES[1];

    // top bar
    setMoney(Math.max(0, Math.round(state.money)));
    const c = state.counts || { lost: 0, people0: 1 };
    // integrator: score = % alive (lead call); shown as Alive N% / floor
    const pct = phase === 'result' && state.result ? state.result.pct : Math.floor(100 * (c.people0 - (c.lost || 0)) / Math.max(1, c.people0));
    setText(tSafe, 'Alive ' + pct + '% · need ' + cfg.winFloor + '%');
    setCls(tSafe, 'ok', pct >= cfg.winFloor); setCls(tSafe, 'low', pct < cfg.winFloor && phase !== 'plan');
    setText(tTime, fmtTime(phase === 'plan' ? 0 : state.tick * cfg.tickSec));
    setText(tStageTxt, 'Valley 1 · stage ' + state.stage + '/2');
    setHidden(dev, !cfgDiffers(cfg));
    if (state.wind) {
      const v = state.wind.vx != null ? { x: state.wind.vx, y: state.wind.vy } : windVec(state.wind.deg);
      const ang = Math.round(Math.atan2(v.y, v.x) * 180 / Math.PI);
      setAttr(wg, 'transform', 'rotate(' + ang + ')');
    }
    // forecast strip
    const evs = state.events || [];
    if (evs.length < evSeen) { evSeen = 0; warned = false; shiftedEv = false; }
    for (; evSeen < evs.length; evSeen++) {
      const k = evs[evSeen].kind;
      if (k === 'wind-shift-warn') warned = true;
      if (k === 'wind-shift') shiftedEv = true;
    }
    const w = state.wind || {};
    let wt = 'Wind steady', warn = false;
    if (phase === 'plan') {
      if (w.shiftAtTick != null || stg.shiftDeg) wt = 'Wind now → +' + stg.shiftAtSec + ' s shift';
    } else if (w.shifted || shiftedEv) { wt = 'Wind shifted'; warn = true; }
    else if (warned && w.shiftAtTick != null) { wt = 'Wind shift in ' + Math.max(0, Math.ceil((w.shiftAtTick - state.tick) * cfg.tickSec)) + ' s'; warn = true; }
    setText(tWind, wt); setCls(windBox, 'warn', warn);

    if (phase === 'plan') updatePlan(state, cfg, stg); else updateRun(state, cfg, stg, phase);
  }

  function updatePlan(state, cfg, stg) {
    const tool = call('getTool') || null;
    const allowed = stg.tools || [];
    for (const t of PLAN_TOOLS) {
      const b = toolBtns[t];
      setHidden(b, allowed.indexOf(t) < 0);
      const on = tool === t;
      setAttr(b, 'aria-pressed', on ? 'true' : 'false'); setCls(b, 'on', on);
    }
    setText(toolBtns.zone._c, '$' + cfg.zoneCostPerCell + '/edge');
    setText(toolBtns.break._c, '$' + cfg.breakCost + '/cell');
    setText(toolBtns.road._c, '$' + cfg.roadCost + '/cell');
    setText(toolBtns.crew._c, '$' + cfg.crewBase + '+');
    setText(toolBtns.pump._c, '$' + cfg.pumpCost);
    for (const k in wBtns) { const on = +k === bw; setAttr(wBtns[k], 'aria-pressed', on ? 'true' : 'false'); setCls(wBtns[k], 'on', on); }
    const hasPlan = !!(state.plan && state.plan.length);
    setDis(bUndo, !hasPlan); setDis(bClear, !hasPlan);
    // info row
    let name = '', msg = '', bad = false;
    const zs = state.zones || [];
    let capTxt = '';
    if (tool === 'zone' || zs.length) {
      let held = 0; for (const z of zs) held += Math.min(z.cap || 0, cfg.zoneCapMax || 1e9);
      capTxt = 'Shelters hold ' + held + ' of ' + stg.people + ' people';
    }
    if (!tool) { msg = capTxt || 'Pick a tool, or drag the map to pan'; }
    else {
      name = TOOL_NAME[tool] || tool;
      let p = null;
      try { p = (typeof A.getPreview === 'function' ? A.getPreview() : (window.WL && window.WL.overlay && window.WL.overlay.preview)) || null; } catch (e) { p = null; }
      if (p && p.cost != null) { msg = '$' + p.cost + (p.ok === false ? ' - cannot place here' : ''); bad = p.ok === false; }
      else msg = TOOL_HINT[tool] || '';
      if (tool === 'break' && !bad) { // stage1-clarity fix 2: hold strength vs the wind right now
        const r = breakRating(cfg, bw, state.wind && state.wind.level);
        if (!(p && p.cost != null)) msg = 'Drag a line';
        msg += ' · ' + bw + ' wide: ' + r.text;
      }
      if (capTxt && tool === 'zone' && !(p && p.cost != null)) msg = capTxt;
      else if (capTxt) msg += ' · ' + capTxt;
    }
    const key = name + '|' + msg + '|' + bad;
    if (infoTxt._k !== key) {
      infoTxt._k = key; infoTxt.textContent = '';
      infoTxt.classList.toggle('bad', bad);
      if (name) infoTxt.appendChild(el('b', null, name + ': '));
      infoTxt.appendChild(document.createTextNode(msg));
    }
  }

  function updateRun(state, cfg, stg, phase) {
    const allowed = stg.tools || [];
    const ci = state.callins || {};
    const live = typeof A.getArmed === 'function' ? call('getArmed') : armed;
    for (const t of CALLINS) {
      const b = ciBtns[t];
      setHidden(b, allowed.indexOf(t) < 0);
      const left = ci[t] ? ci[t].left : 0;
      let eta = null;
      const q = ci.queue || [];
      for (let i = 0; i < q.length; i++) if (q[i].type === t && !q[i].done) { const s = Math.ceil((q[i].atTick - state.tick) * cfg.tickSec); if (eta == null || s < eta) eta = s; }
      const isArmed = live === t && left > 0 && phase === 'run';
      setText(b._n, CALLIN_NAME[t] + ' ×' + left);
      setText(b._s, eta != null ? 'lands in ' + Math.max(0, eta) + ' s' : (isArmed ? 'tap map to aim' : (left > 0 ? 'ready' : 'none left')));
      setDis(b, phase !== 'run' || (left <= 0 && !isArmed));
      setCls(b, 'armed', isArmed); setAttr(b, 'aria-pressed', isArmed ? 'true' : 'false');
    }
    if (armed && (phase !== 'run' || (ci[armed] && ci[armed].left <= 0))) armed = null;
    setText(bPause, state.paused ? 'Resume' : 'Pause');
    setAttr(bPause, 'aria-pressed', state.paused ? 'true' : 'false'); setCls(bPause, 'paused', state.paused);
    setDis(bPause, phase !== 'run');
    for (const k in spBtns) { const on = +k === state.speed; setAttr(spBtns[k], 'aria-pressed', on ? 'true' : 'false'); setCls(spBtns[k], 'on', on); setDis(spBtns[k], phase !== 'run'); }
  }

  syncInert();
  return { update, showResult, showUnlock, hideOverlays, toast, openSettings, closeSettings };
}
