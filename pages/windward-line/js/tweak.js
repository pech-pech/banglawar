// Windward Line - tweak menu, presets, report (M9). Imports only ./contract.js.
import { GAME, defaultCfg, TWEAK_SPEC, getPath, setPath, cloneCfg, fmtTime } from './contract.js';

const PRESET_KEY = 'wl-presets-v1';

// ---------- cfg diff / preset code ----------
// Flat diff of cfg vs defaultCfg: {'ignite.2': 0.2, 'stars': [..]}; leaves = numbers/strings/bools/arrays.
function flatten(o, pre, out) {
  for (const k of Object.keys(o || {})) {
    const v = o[k], p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out); else out[p] = v;
  }
  return out;
}
function cfgDiff(cfg) {
  const a = flatten(cfg || {}, '', {}), b = flatten(defaultCfg, '', {}), d = {};
  for (const k of Object.keys(b)) if (k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])) d[k] = a[k];
  return d;
}
function applyDiff(diff) {
  const cfg = cloneCfg(defaultCfg);
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return null;
  for (const k of Object.keys(diff)) {
    const def = getPath(defaultCfg, k), v = diff[k];
    if (def === undefined) continue;                       // unknown key: ignore
    if (Array.isArray(def)) { if (Array.isArray(v) && v.every((n) => typeof n === 'number' && isFinite(n))) setPath(cfg, k, v.slice()); else return null; }
    else if (typeof def === 'number') { if (typeof v === 'number' && isFinite(v)) setPath(cfg, k, v); else return null; }
    else if (typeof v === typeof def) setPath(cfg, k, v); else return null;
  }
  return cfg;
}
const b64 = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
const unb64 = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));

export function presetCode(cfg) {
  try { return 'WL1:' + b64(JSON.stringify(cfgDiff(cfg))); } catch (e) { return 'WL1:' + b64('{}'); }
}
export function parsePresetCode(code) {
  try {
    const s = String(code || '').trim();
    if (s.slice(0, 4) !== 'WL1:') return null;
    const body = s.slice(4).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) return null;
    return applyDiff(JSON.parse(unb64(body)));
  } catch (e) { return null; }
}

// ---------- presets in localStorage ----------
function readAll() {
  try { const o = JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
function writeAll(o) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
export function listPresets() { try { return Object.keys(readAll()).sort(); } catch (e) { return []; } }
export function savePreset(name, cfg) {
  try {
    const n = String(name == null ? '' : name).trim().slice(0, 40);
    if (!n) return false;
    const all = readAll(); all[n] = cfgDiff(cfg); return writeAll(all);
  } catch (e) { return false; }
}
export function loadPreset(name) {
  try { const all = readAll(); return Object.prototype.hasOwnProperty.call(all, name) ? applyDiff(all[name]) : null; } catch (e) { return null; }
}
export function deletePreset(name) {
  try { const all = readAll(); if (!Object.prototype.hasOwnProperty.call(all, name)) return false; delete all[name]; return writeAll(all); } catch (e) { return false; }
}

// ---------- report ----------
export function copyReport(state) {
  const L = [];
  try {
    const s = state || {};
    let build = 'n/a';
    try { if (typeof document !== 'undefined') { const m = document.querySelector('meta[name="pgs-build"]'); if (m && m.content) build = m.content; } } catch (e) {}
    const ts = (s.cfg && s.cfg.tickSec) || defaultCfg.tickSec;
    const tick = s.tick | 0, sec = tick * ts;
    L.push('Windward Line report');
    L.push('game: ' + GAME + '  build: ' + build);
    L.push('stage: ' + s.stage + '  seed: ' + s.seed + '  phase: ' + s.phase);
    L.push('tick: ' + tick + '  sec: ' + sec.toFixed(1) + ' (' + fmtTime(sec) + ')');
    const r = s.result;
    if (r) L.push('result: ' + r.pct + '%  ' + (r.win ? 'PASS' : 'FAIL') + '  stars ' + r.stars + '  hash ' + r.hash + '  sec ' + r.sec + '\ncause: ' + r.cause);
    else L.push('result: none yet');
    L.push('plan:');
    const plan = s.plan || [];
    if (!plan.length) L.push('  (empty)');
    plan.forEach((a, i) => L.push('  ' + (i + 1) + '. ' + Object.keys(a).map((k) => k + '=' + a[k]).join(' ')));
    const ins = s.inputs || [];
    L.push('call-ins: ' + (ins.length ? ins.map((c) => c.type + '@t' + c.tick + '(' + c.x + ',' + c.y + ')').join('; ') : 'none'));
    const c = s.counts || {};
    L.push('counts: ' + Object.keys(c).map((k) => k + '=' + c[k]).join(' '));
    L.push('money: ' + s.money);
    const ev = s.events || [];
    L.push('events (first 20 of ' + ev.length + '):');
    ev.slice(0, 20).forEach((e) => L.push('  ' + fmtTime(e.tick * ts) + ' t' + e.tick + ' ' + e.kind + ' (' + e.x + ',' + e.y + ') ' + (e.text || '')));
    const w = s.wind;
    L.push('wind: ' + (w ? 'deg=' + w.deg + ' level=' + w.level + ' shifted=' + w.shifted + (w.shiftAtTick != null ? ' shiftAtTick=' + w.shiftAtTick : '') : 'n/a'));
    L.push('cfg: ' + presetCode(s.cfg || defaultCfg));
    if (typeof navigator !== 'undefined' && navigator.userAgent) L.push('ua: ' + navigator.userAgent);
    if (typeof window !== 'undefined' && window.innerWidth) L.push('window: ' + window.innerWidth + 'x' + window.innerHeight);
  } catch (e) { L.push('report error: ' + (e && e.message)); }
  return L.join('\n');
}

// ---------- panel ----------
const CSS = `
.tw-root{color:#e6edf3;background:#0d1117;font:14px/1.3 system-ui,sans-serif;box-sizing:border-box;max-width:100%;overflow-x:hidden}
.tw-root *{box-sizing:border-box;max-width:100%}
.tw-row{padding:6px 8px;border-bottom:1px solid #222a33;border-left:3px solid transparent}
.tw-row.tw-diff{border-left-color:#39d0ff;color:#39d0ff}
.tw-head{display:flex;justify-content:space-between;gap:8px;font-size:14px;min-height:20px}
.tw-label{font-size:14px;overflow-wrap:anywhere}
.tw-val{font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tw-ctl{display:flex;gap:8px;align-items:center}
.tw-range{flex:1 1 auto;min-width:0;height:48px;margin:0;accent-color:#39d0ff;background:transparent}
.tw-num,.tw-name,.tw-code{background:#161b22;color:#e6edf3;border:1px solid #39424e;border-radius:6px;font:14px system-ui,sans-serif}
.tw-num{flex:0 0 88px;width:88px;height:48px;padding:0 6px}
.tw-row.tw-diff .tw-num{border-color:#39d0ff;color:#39d0ff}
.tw-btn{min-width:48px;min-height:48px;padding:0 12px;background:#161b22;color:#e6edf3;border:1px solid #39d0ff;border-radius:6px;font:14px system-ui,sans-serif;cursor:pointer}
.tw-btn:active{background:#0e3a48}
.tw-btn.tw-wide{width:100%;margin:8px 0}
.tw-pre{padding:8px}
.tw-pre h3{margin:4px 0 8px;font-size:14px;color:#39d0ff}
.tw-line{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.tw-name{flex:1 1 auto;min-width:0;height:48px;padding:0 8px}
.tw-item{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.tw-iname{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;font-size:14px}
.tw-code{display:block;width:100%;height:84px;padding:6px;resize:vertical;overflow-wrap:anywhere}
.tw-none{font-size:12px;color:#8b949e;margin-bottom:6px}
`;

function fmtV(v, step) {
  if (typeof v !== 'number') return String(v);
  const dec = (String(step).split('.')[1] || '').length;
  return v.toFixed(Math.min(dec, 3));
}

export function initTweak(panelEl, getCfg, setCfg) {
  if (!panelEl || typeof document === 'undefined') return;
  try {
    if (!document.getElementById('tw-style')) {
      const st = document.createElement('style'); st.id = 'tw-style'; st.textContent = CSS; document.head.appendChild(st);
    }
  } catch (e) {}
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const root = el('div', 'tw-root');
  panelEl.textContent = '';
  panelEl.appendChild(root);
  const rows = []; // {key,row,range,num,val,step}

  function cur() { try { return getCfg() || cloneCfg(defaultCfg); } catch (e) { return cloneCfg(defaultCfg); } }
  function commit(next) { try { setCfg(next); } catch (e) {} refresh(); }
  function refresh() {
    const c = cur();
    for (const r of rows) {
      const v = getPath(c, r.key), d = getPath(defaultCfg, r.key);
      r.val.textContent = fmtV(v, r.step);
      if (document.activeElement !== r.num) r.num.value = v;
      r.range.value = v;
      r.row.classList.toggle('tw-diff', v !== d);
    }
  }

  for (const [key, label, min, max, step] of TWEAK_SPEC) {
    const row = el('div', 'tw-row');
    const head = el('div', 'tw-head'); const lab = el('span', 'tw-label', label); const val = el('span', 'tw-val');
    head.appendChild(lab); head.appendChild(val);
    const ctl = el('div', 'tw-ctl');
    const range = el('input', 'tw-range'); range.type = 'range'; range.min = min; range.max = max; range.step = step; range.setAttribute('aria-label', label);
    const num = el('input', 'tw-num'); num.type = 'number'; num.min = min; num.max = max; num.step = step; num.inputMode = 'decimal'; num.setAttribute('aria-label', label + ' value');
    const set = (raw) => {
      let v = parseFloat(raw); if (!isFinite(v)) return refresh();
      v = Math.min(max, Math.max(min, v));
      v = Math.round(v / step) * step; v = parseFloat(v.toFixed(6));
      const next = cloneCfg(cur()); setPath(next, key, v); commit(next);
    };
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('change', () => set(num.value));
    ctl.appendChild(range); ctl.appendChild(num);
    row.appendChild(head); row.appendChild(ctl); root.appendChild(row);
    rows.push({ key, row, range, num, val, step });
  }

  const reset = el('button', 'tw-btn tw-wide', 'Reset all to default'); reset.type = 'button';
  reset.addEventListener('click', () => commit(cloneCfg(defaultCfg)));
  const rw = el('div', 'tw-pre'); rw.appendChild(reset); root.appendChild(rw);

  // presets
  const pre = el('div', 'tw-pre'); pre.appendChild(el('h3', null, 'Presets'));
  const line = el('div', 'tw-line');
  const name = el('input', 'tw-name'); name.type = 'text'; name.placeholder = 'Preset name'; name.maxLength = 40; name.setAttribute('aria-label', 'Preset name');
  const save = el('button', 'tw-btn', 'Save'); save.type = 'button';
  line.appendChild(name); line.appendChild(save); pre.appendChild(line);
  const list = el('div', 'tw-list'); pre.appendChild(list);
  const code = el('textarea', 'tw-code'); code.setAttribute('aria-label', 'Preset code'); code.placeholder = 'WL1:...'; code.spellcheck = false;
  pre.appendChild(code);
  const cl = el('div', 'tw-line'); cl.style.marginTop = '8px';
  const copy = el('button', 'tw-btn', 'Copy code'); copy.type = 'button';
  const apply = el('button', 'tw-btn', 'Apply code'); apply.type = 'button';
  cl.appendChild(copy); cl.appendChild(apply); pre.appendChild(cl);
  const msg = el('div', 'tw-none', ''); pre.appendChild(msg);
  root.appendChild(pre);

  function say(t) { msg.textContent = t; }
  function renderList() {
    list.textContent = '';
    const names = listPresets();
    if (!names.length) list.appendChild(el('div', 'tw-none', 'No saved presets'));
    for (const n of names) {
      const it = el('div', 'tw-item'); it.appendChild(el('span', 'tw-iname', n));
      const ld = el('button', 'tw-btn', 'Load'); ld.type = 'button'; ld.setAttribute('aria-label', 'Load ' + n);
      const dl = el('button', 'tw-btn', 'Delete'); dl.type = 'button'; dl.setAttribute('aria-label', 'Delete ' + n);
      ld.addEventListener('click', () => { const c = loadPreset(n); if (c) { commit(c); say('Loaded ' + n); } else say('Could not load ' + n); });
      dl.addEventListener('click', () => { deletePreset(n); renderList(); say('Deleted ' + n); });
      it.appendChild(ld); it.appendChild(dl); list.appendChild(it);
    }
  }
  save.addEventListener('click', () => {
    if (savePreset(name.value, cur())) { say('Saved ' + name.value.trim()); name.value = ''; } else say('Enter a name (storage may be blocked)');
    renderList();
  });
  copy.addEventListener('click', async () => {
    const t = presetCode(cur()); code.value = t;
    try { await navigator.clipboard.writeText(t); say('Code copied'); }
    catch (e) { try { code.select(); document.execCommand('copy'); say('Code copied'); } catch (e2) { say('Select the code and copy it'); } }
  });
  apply.addEventListener('click', () => {
    const c = parsePresetCode(code.value);
    if (c) { commit(c); say('Code applied'); } else say('Bad code');
  });

  renderList();
  refresh();
}
