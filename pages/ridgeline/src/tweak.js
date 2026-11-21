// Ridgeline tweak panel (slice 6). DOM only.
import { formatTelemetry } from './telemetry.js';
import { DEFAULTS, cfg, META, setCfg, resetCfg, isDefault, diffFromDefault, applyPreset, DUNE_KEYS } from './config.js';

const KEY = 'ridgeline.presets.v1';
const VKEY = 'rl-visual';
const VDEF = { quality: 'high', post: true };
const vListeners = [];
function vLoad() {
  const o = { ...VDEF };
  try {
    const j = JSON.parse(localStorage.getItem(VKEY) || '{}');
    if (j && (j.quality === 'low' || j.quality === 'high')) o.quality = j.quality;
    if (j && typeof j.post === 'boolean') o.post = j.post;
  } catch (e) { /* ignore */ }
  return o;
}
let vPrefs = vLoad();
function vSave() { try { localStorage.setItem(VKEY, JSON.stringify(vPrefs)); } catch (e) { /* ignore */ } }
function vQuery() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    return q === 'low' || q === 'high' ? q : null;
  } catch (e) { return null; }
}
export function getVisualPrefs() {
  return { quality: vQuery() || vPrefs.quality, post: vPrefs.post };
}
export function isVisualDefault() {
  const p = getVisualPrefs();
  return p.quality === VDEF.quality && p.post === VDEF.post;
}
export function onVisualPrefs(fn) {
  if (typeof fn === 'function') vListeners.push(fn);
}
function setVisual(patch) {
  vPrefs = { ...vPrefs, ...patch };
  vSave();
  for (const f of vListeners) { try { f(getVisualPrefs()); } catch (e) { /* ignore */ } }
}
const CSS = `
.rlt{position:fixed;inset:0;z-index:50;background:#0b1220;color:#e8f0ff;font:15px/1.3 system-ui,sans-serif;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));box-sizing:border-box;display:none}
.rlt.open{display:block}
.rlt *{box-sizing:border-box}
.rlt h2{margin:6px 0 8px;font-size:18px}
.rlt h3{margin:14px 0 6px;font-size:14px;color:#9db4d8;text-transform:uppercase;letter-spacing:.06em}
.rlt .bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.rlt button{min-height:56px;min-width:56px;padding:0 14px;border:0;border-radius:10px;background:#24365a;color:#fff;font:600 15px system-ui,sans-serif;touch-action:manipulation}
.rlt button:active{background:#37528a}
.rlt button.pri{background:#e8731f}
.rlt button.dng{background:#7a2530}
.rlt .row{display:flex;flex-direction:column;min-height:64px;padding:4px 0;border-bottom:1px solid #1a2744}
.rlt .row .top{flex:none;display:flex;justify-content:space-between;gap:8px;min-width:0}
.rlt .row .lbl{min-width:0;overflow-wrap:anywhere}
.rlt .row .val{flex:none}
.rlt .row .val{font-variant-numeric:tabular-nums}
.rlt .row.chg .lbl,.rlt .row.chg .val{color:#ffb347;font-weight:700}
.rlt input[type=range]{flex:1 1 auto;display:block;width:100%;max-width:100%;min-height:40px;margin:0;padding:0;background:transparent;accent-color:#e8731f;-webkit-appearance:none;appearance:none;touch-action:pan-y}
.rlt input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:#37528a}
.rlt input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:30px;height:30px;margin-top:-11px;border-radius:50%;background:#e8731f;border:2px solid #fff}
.rlt input[type=range]::-moz-range-track{height:8px;border-radius:4px;background:#37528a}
.rlt input[type=range]::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#e8731f;border:2px solid #fff}
.rlt input[type=text],.rlt textarea{width:100%;min-height:56px;padding:0 10px;border-radius:10px;border:1px solid #37528a;background:#101b33;color:#fff;font:15px system-ui,sans-serif}
.rlt textarea{padding:8px 10px;min-height:84px;font:12px monospace}
.rlt .seg{display:flex;gap:8px;margin:4px 0}
.rlt .seg button{flex:1;min-height:48px}
.rlt .seg button.on{background:#e8731f}
.rlt .msg{min-height:22px;margin:6px 0;font-weight:600}
.rlt .msg.err{color:#ff7b7b}.rlt .msg.ok{color:#8be28b}
.rlt .pr{display:flex;align-items:center;gap:8px;margin:6px 0}
.rlt .pr .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

function lsGet() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter(p => p && typeof p.name === 'string' && p.values && typeof p.values === 'object') : [];
  } catch (e) { return []; }
}
function lsSet(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

export function encodeCode(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
// returns {ok, values?|error}
export function decodeCode(str) {
  try {
    const s = String(str || '').trim();
    if (!s) return { ok: false, error: 'Code is empty' };
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Code is not a settings object' };
    for (const k of Object.keys(obj)) {
      const m = META[k];
      if (!m) return { ok: false, error: 'Unknown setting: ' + k };
      const v = obj[k];
      if (typeof v !== 'number' || !isFinite(v)) return { ok: false, error: 'Bad value for ' + k };
      if (v < m.min || v > m.max) return { ok: false, error: 'Out of range: ' + k };
    }
    return { ok: true, values: obj };
  } catch (e) { return { ok: false, error: 'Not a valid code' }; }
}

export function buildReport(info) {
  info = info || {};
  const st = info.stats || info.renderer || {};
  const fmt = v => (v === undefined || v === null || v === '' ? '-' : String(v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : fmt(v));
  const gp = info.gatesPassed, gm = info.gatesMissed;
  const gates = info.gates !== undefined ? fmt(info.gates) : (gp !== undefined || gm !== undefined ? `${fmt(gp)} passed / ${fmt(gm)} missed` : '-');
  const allDiff = diffFromDefault();
  const duneKeys = Object.values(DUNE_KEYS);
  const diff = {};
  for (const k of Object.keys(allDiff)) if (!duneKeys.includes(k)) diff[k] = allDiff[k];
  const keys = Object.keys(diff);
  const lines = [
    'Ridgeline report',
    'build: ' + fmt(info.build),
    'seed: ' + fmt(info.seed),
    'mode: ' + fmt(info.mode),
    'result: ' + fmt(info.result),
    'theme: ' + fmt(info.theme),
    'time: ' + num(info.time, 2) + ' s',
    'gates: ' + gates,
    'crash z: ' + (info.crashZ === undefined || info.crashZ === null ? '-' : num(info.crashZ, 1)),
    'quality: ' + getVisualPrefs().quality,
    'post: ' + (getVisualPrefs().post ? 'on' : 'off'),
    'fps avg: ' + num(info.fpsAvg !== undefined ? info.fpsAvg : info.fps, 1),
    'renderer: calls ' + fmt(st.calls) + ', triangles ' + fmt(st.triangles),
    'cfg diff: ' + (keys.length ? '' : '(defaults)')
  ];
  for (const k of keys) lines.push(`  ${k}: ${diff[k]} (default ${DEFAULTS[k]})`);
  const dn = [];
  for (const [name, k] of Object.entries(DUNE_KEYS)) if (allDiff[k] !== undefined) dn.push(`${name} ${allDiff[k]} (default ${DEFAULTS[k]})`);
  const atlas = typeof window !== 'undefined' && window.__duneAtlas ? String(window.__duneAtlas) : 'n/a';
  lines.push('dune: theme ' + fmt(info.theme) + ', atlas ' + (atlas === 'ok' ? 'loaded yes' : atlas === 'fail' ? 'loaded no' : atlas === 'pending' ? 'pending' : 'n/a') + ', calls ' + fmt(st.calls) + ', tris ' + fmt(st.triangles) + ', tweaks ' + (dn.length ? dn.join(', ') : '(defaults)'));
  const fl = info.flow, md = info.medal;
  lines.push('Flow: ' + (fl ? `peak ${fmt(fl.peak)}, links ${fmt(fl.links)}, razor ${fmt(fl.razors)}, inner ${fmt(fl.inners)}, centred gates ${fmt(fl.centred)}, boost links ${fmt(fl.boostLinks)}, flow5 ${num(fl.flow5T, 1)} s` : '-'));
  lines.push('Medal: ' + (!md ? '-' : md.hidden ? 'off (DEV)' : `${md.name || 'none'} (gold ${num(md.gold, 1)} s, summit ${num(md.summit, 1)} s)`));
  if (info.tele) lines.push(...formatTelemetry(info.tele, info.device));
  return lines.join('\n');
}

export async function copyText(str) {
  str = String(str);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, str.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (e) { return false; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createTweak(rootEl, opts) {
  opts = opts || {};
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  const onCopyReport = typeof opts.onCopyReport === 'function' ? opts.onCopyReport : null;

  if (!document.getElementById('rlt-style')) {
    const st = document.createElement('style');
    st.id = 'rlt-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const panel = el('div', 'rlt');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Settings');
  rootEl.appendChild(panel);

  const msg = el('div', 'msg');
  msg.setAttribute('aria-live', 'polite');
  let msgTimer = 0;
  function say(text, ok) {
    msg.textContent = text;
    msg.className = 'msg ' + (ok ? 'ok' : 'err');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg.textContent = ''; msg.className = 'msg'; }, 4000);
  }

  const rows = {};
  const sliders = el('div', 'sliders');
  const presetBox = el('div', 'presets');
  let nameInput, codeArea;

  function fmtVal(k, v) {
    const step = META[k].step;
    const dec = step >= 1 ? 0 : Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
    return Number(v).toFixed(dec);
  }
  function refreshRow(k) {
    const r = rows[k];
    if (!r) return;
    const v = cfg[k];
    r.input.value = v;
    r.val.textContent = fmtVal(k, v);
    r.row.classList.toggle('chg', v !== DEFAULTS[k]);
  }
  function refreshAll() { for (const k of Object.keys(rows)) refreshRow(k); }

  for (const k of Object.keys(META)) {
    const m = META[k];
    const row = el('div', 'row');
    const top = el('div', 'top');
    const lbl = el('span', 'lbl', m.label || k);
    const val = el('span', 'val');
    top.append(lbl, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = m.min; input.max = m.max; input.step = m.step;
    input.setAttribute('aria-label', m.label || k);
    input.addEventListener('input', () => {
      setCfg(k, parseFloat(input.value));
      refreshRow(k);
      onChange();
    });
    row.append(top, input);
    sliders.appendChild(row);
    rows[k] = { row, input, val };
  }

  const visBox = el('div', 'visual');
  const visBtns = [];
  function visRow(label, key, opts) {
    const row = el('div', 'row');
    const topEl = el('div', 'top', label);
    row.appendChild(topEl);
    const locked = key === 'quality' && !!vQuery();
    if (locked) {
      const n = el('span', 'val', ' set by link');
      n.style.cssText = 'font-size:11px;opacity:.7;margin-left:8px;font-weight:600';
      topEl.appendChild(n);
      row.style.opacity = '0.6';
    }
    const seg = el('div', 'seg');
    for (const [text, val] of opts) {
      const b = el('button', '', text);
      b.type = 'button';
      b.dataset.act = key + '-' + text.toLowerCase();
      if (locked) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.style.pointerEvents = 'none'; }
      b.addEventListener('click', () => { if (locked) return; setVisual({ [key]: val }); onChange(); refreshVisual(); });
      seg.appendChild(b);
      visBtns.push({ b, key, val, row });
    }
    row.appendChild(seg);
    visBox.appendChild(row);
  }
  visRow('Quality', 'quality', [['Low', 'low'], ['High', 'high']]);
  visRow('Post', 'post', [['On', true], ['Off', false]]);
  function refreshVisual() {
    const p = getVisualPrefs();
    for (const x of visBtns) {
      const on = p[x.key] === x.val;
      x.b.classList.toggle('on', on);
      x.b.setAttribute('aria-pressed', on ? 'true' : 'false');
      x.row.classList.toggle('chg', p[x.key] !== VDEF[x.key]);
    }
  }
  refreshVisual();

  function btn(text, cls, fn) {
    const b = el('button', cls || '', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function renderPresets() {
    presetBox.textContent = '';
    const list = lsGet();
    if (!list.length) presetBox.appendChild(el('div', '', 'No saved presets'));
    list.forEach((p, i) => {
      const r = el('div', 'pr');
      r.appendChild(el('span', 'nm', p.name));
      const ld = btn('Load', '', () => {
        const cur = lsGet()[i];
        if (!cur) return;
        resetCfg();
        applyPreset(cur.values);
        refreshAll();
        onChange();
        say('Loaded ' + cur.name, true);
      });
      ld.dataset.act = 'load';
      const dl = btn('Delete', 'dng', () => {
        const l = lsGet();
        l.splice(i, 1);
        lsSet(l);
        renderPresets();
        say('Deleted', true);
      });
      dl.dataset.act = 'delete';
      r.append(ld, dl);
      presetBox.appendChild(r);
    });
  }

  function saveNamed() {
    const name = nameInput.value.trim().slice(0, 40);
    if (!name) { say('Type a preset name first', false); return; }
    const list = lsGet();
    const entry = { name, values: diffFromDefault() };
    const ix = list.findIndex(p => p.name === name);
    if (ix >= 0) list[ix] = entry; else list.push(entry);
    if (!lsSet(list)) { say('Could not save (storage blocked)', false); return; }
    nameInput.value = '';
    renderPresets();
    say('Saved ' + name, true);
  }

  async function doCopy(text, okMsg) {
    const ok = await copyText(text);
    say(ok ? okMsg : 'Copy failed', ok);
    return ok;
  }

  function applyCode() {
    const res = decodeCode(codeArea.value);
    if (!res.ok) { say(res.error, false); return; }
    resetCfg();
    applyPreset(res.values);
    refreshAll();
    onChange();
    say('Code applied', true);
  }

  const head = el('h2', '', 'Settings');
  const bar = el('div', 'bar');
  const bClose = btn('Close', 'pri', () => api.close());
  bClose.dataset.act = 'close';
  const bReset = btn('Reset all', 'dng', () => {
    resetCfg(); refreshAll(); onChange(); say('Reset to defaults', true);
  });
  bReset.dataset.act = 'reset';
  const bReport = btn('Copy report', '', async () => {
    if (onCopyReport) {
      try { await onCopyReport(); } catch (e) { say('Report failed', false); return; }
      say('Report handled', true);
    } else {
      await doCopy(buildReport({}), 'Report copied');
    }
  });
  bReport.dataset.act = 'report';
  bar.append(bClose, bReset, bReport);

  nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Preset name';
  nameInput.maxLength = 40;
  nameInput.setAttribute('aria-label', 'Preset name');
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveNamed(); });
  const bSave = btn('Save preset', '', saveNamed);
  bSave.dataset.act = 'save';
  const saveRow = el('div', 'bar');
  saveRow.append(bSave);

  const bCode = btn('Copy preset code', '', () => doCopy(encodeCode(diffFromDefault()), 'Preset code copied'));
  bCode.dataset.act = 'copycode';
  codeArea = document.createElement('textarea');
  codeArea.placeholder = 'Paste preset code here';
  codeArea.setAttribute('aria-label', 'Preset code');
  codeArea.spellcheck = false;
  const bApply = btn('Apply code', '', applyCode);
  bApply.dataset.act = 'apply';
  const codeRow = el('div', 'bar');
  codeRow.append(bCode, bApply);

  panel.append(
    head, bar, msg,
    ...(opts.themeEl ? [opts.themeEl] : []),
    el('h3', '', 'Presets'), nameInput, saveRow, presetBox,
    el('h3', '', 'Share'), codeArea, codeRow,
    el('h3', '', 'Look'), visBox,
    el('h3', '', 'Values'), sliders
  );
  const bClose2 = btn('Close', 'pri', () => api.close());
  bClose2.style.cssText = 'width:100%;margin-top:14px';
  panel.appendChild(bClose2);

  refreshAll();
  renderPresets();

  const api = {
    open() { refreshAll(); refreshVisual(); renderPresets(); panel.classList.add('open'); panel.scrollTop = 0; },
    close() { panel.classList.remove('open'); },
    isOpen() { return panel.classList.contains('open'); }
  };
  return api;
}
