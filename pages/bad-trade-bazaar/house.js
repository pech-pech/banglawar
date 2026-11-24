// Bad Trade Bazaar house: storage, config, presets, settings panel, SW. Browser only; every storage access in try/catch.
const K_PROFILE = 'btb-profile-v2', K_CONFIG = 'btb-config-v2', K_PRESETS = 'btb-presets-v2', PREFIX = 'BTB2:';
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const rd = (k) => { try { const s = store(); const v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const wr = (k, v) => { try { const s = store(); if (!s) return false; s.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
// deep equality for plain JSON values (objects compared per key, arrays per element)
function deepSame(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepSame(x, b[i]));
  if (isObj(a) && isObj(b)) { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => k in b && deepSame(a[k], b[k])); }
  return false;
}
// deep merge saved over defaults: only keys known to defaults, only matching types; arrays merged per element (length kept)
function mergeOver(def, saved) {
  if (Array.isArray(def)) {
    const out = clone(def);
    if (Array.isArray(saved)) for (let i = 0; i < out.length; i++) if (i < saved.length) out[i] = mergeOver(def[i], saved[i]);
    return out;
  }
  if (isObj(def)) {
    const out = {};
    for (const k of Object.keys(def)) out[k] = isObj(saved) && Object.prototype.hasOwnProperty.call(saved, k) ? mergeOver(def[k], saved[k]) : clone(def[k]);
    return out;
  }
  return typeof saved === typeof def && (typeof def !== 'number' || Number.isFinite(saved)) ? saved : def;
}
// minimal diff: objects per key, arrays whole when any element differs
function diffVal(cur, def) {
  if (deepSame(cur, def)) return undefined;
  if (isObj(def) && isObj(cur)) {
    const d = {};
    for (const k of Object.keys(def)) if (k in cur) { const x = diffVal(cur[k], def[k]); if (x !== undefined) d[k] = x; }
    return d;
  }
  return clone(cur);
}

export function loadProfile() {
  const p = rd(K_PROFILE);
  return p && typeof p === 'object' && !Array.isArray(p) && p.v === 2 ? p : null; // admin default: v2 profile shape
}
export function saveProfile(p) {
  try {
    const old = rd(K_PROFILE);
    if (old && typeof old.v === 'number' && p && typeof p.v === 'number' && old.v > p.v) return false; // never overwrite newer v with older
    return wr(K_PROFILE, p);
  } catch { return false; }
}
export function loadConfig(DEFAULTS) { return mergeOver(DEFAULTS, rd(K_CONFIG)); }
export function saveConfig(cfg) { return wr(K_CONFIG, cfg); }
export function diffConfig(cfg, DEFAULTS) {
  const d = {};
  if (!isObj(cfg)) return d;
  for (const k of Object.keys(DEFAULTS)) if (k in cfg) { const x = diffVal(cfg[k], DEFAULTS[k]); if (x !== undefined) d[k] = x; }
  return d;
}
export function isDev(cfg, DEFAULTS) { return Object.keys(diffConfig(cfg, DEFAULTS)).length > 0; }

const b64e = (s) => { const u = new TextEncoder().encode(s); let bin = ''; u.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); };
const b64d = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
export function presetCode(cfg, DEFAULTS) { return PREFIX + b64e(JSON.stringify(diffConfig(cfg, DEFAULTS))); }
export function parsePresetCode(str) {
  try {
    const s = String(str || '').trim();
    if (!s.startsWith(PREFIX)) return null;
    const o = JSON.parse(b64d(s.slice(PREFIX.length)));
    return isObj(o) ? o : null;
  } catch { return null; }
}

export function listPresets() { const p = rd(K_PRESETS); return p && typeof p === 'object' ? Object.keys(p) : []; }
export function savePreset(name, cfg) {
  name = String(name || '').trim().slice(0, 24);
  if (!name) return false;
  const p = rd(K_PRESETS) || {};
  p[name] = clone(cfg);
  return wr(K_PRESETS, p);
}
export function loadPreset(name) { const p = rd(K_PRESETS); return p && p[name] ? clone(p[name]) : null; }
export function deletePreset(name) { const p = rd(K_PRESETS) || {}; delete p[name]; return wr(K_PRESETS, p); }

export async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); t.remove(); return !!ok;
  } catch { return false; }
}

// ---- Tweak menu ----
const GROUPS = [ // admin default grouping per contract
  ['Day & market', ['runSec', 'tickMs', 'buyLockMs', 'longPressMs', 'startCash', 'slotVol', 'tierVol', 'volScale', 'K', 'M', 'regimeMin', 'regimeMax', 'pUp', 'pDown']],
  ['Lots & sale', ['lots', 'maxPerGood', 'saleCut', 'lossLine', 'holdSec', 'endScar', 'dumpSec']],
  ['Lessons', ['lessonRate', 'stopLine', 'lessonSlots', 'lessonsOn']],
  ['Shop & perks', ['perkSlots', 'shopOn', 'priceScale', 'streakMax', 'perkVal', 'price']],
  ['Goods ladder', ['tierUnlock', 'bustCash']],
  ['Test', ['run1Seed', 'sameMarkets', 'protoMinTrades', 'protoTarget']],
];
const SLOT_NAMES = ['Calm', 'Middle', 'Wild'];
const PERK_NAMES = { seed: 'purse-belt', fee: 'tax-man', scales: 'scales', streak: 'streak', clean: 'clean slate', tycoon: 'tycoon', spec0: 'calm spec', spec1: 'middle spec', wild: 'wild spec' };
const STEP_KEY = { // admin default steps: money 1, rates 0.005, vol 0.001, seconds 1, ms 50, scales 0.05
  runSec: 1, tickMs: 50, buyLockMs: 50, longPressMs: 50, startCash: 1, slotVol: 0.001, tierVol: 0.05, volScale: 0.05, K: 0.01, M: 0.05,
  regimeMin: 1, regimeMax: 1, pUp: 0.005, pDown: 0.005, lots: 1, maxPerGood: 1, saleCut: 0.005, lossLine: 0.005, holdSec: 1, dumpSec: 1,
  lessonRate: 0.005, stopLine: 0.005, lessonSlots: 1, perkSlots: 1, priceScale: 0.05, streakMax: 1, tierUnlock: 1, bustCash: 1,
  protoMinTrades: 1, protoTarget: 0.05,
};
const stepFor = (path) => (path[0] === 'perkVal' ? (path[1] === 'seed' ? 1 : 0.05) : path[0] === 'price' ? 1 : STEP_KEY[path[0]] ?? 0.01);
const nice = (k) => k === 'sameMarkets' ? 'Same markets every run (fair test)' : k === 'run1Seed' ? 'Run 1 seed' : k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function labelFor(path) {
  const [k, sub] = path;
  if (sub === undefined) return nice(k);
  if (k === 'tierVol' || k === 'tierUnlock') return `${k} tier ${sub + 1}`;
  if (Array.isArray(sub) || typeof sub === 'number') return `${k} ${SLOT_NAMES[sub] ?? sub + 1}`;
  return `${k} ${PERK_NAMES[sub] || sub}`;
}
// flatten a DEFAULTS value into editable leaves: [[path, defaultLeaf], ...]
function leaves(key, def) {
  if (Array.isArray(def)) return def.map((d, i) => [[key, i], d]);
  if (isObj(def)) return Object.keys(def).map(k => [[key, k], def[k]]);
  return [[[key], def]];
}
const getAt = (o, path) => path.reduce((x, p) => (x == null ? undefined : x[p]), o);
function setAt(o, path, v) { let x = o; for (let i = 0; i < path.length - 1; i++) x = x[path[i]]; x[path[path.length - 1]] = v; }

const CSS = `
.tw-note{font-size:14px;margin:0 0 10px;opacity:.85}
.tw-bar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.tw-bar .btn,.tw-row .tw-reset{min-height:56px;font-size:14px}
.tw-bar .btn{flex:1 1 140px}
.tw-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;padding:2px 6px;border-left:4px solid transparent;border-radius:6px}
.tw-row.tw-changed{border-left-color:#e8a33d;background:rgba(232,163,61,.14)}
.tw-label{flex:1 1 100%;font-size:14px}
.tw-input{min-height:48px;font-size:16px;min-width:0;flex:1 1 80px;box-sizing:border-box}
.tw-row .tw-reset{flex:0 0 auto;min-width:56px}
.tw-row:not(.tw-changed) .tw-reset{opacity:.45}
.tw-h{font-size:16px;margin:16px 0 4px;font-weight:700}
.tw-msg{font-size:14px;min-height:20px;margin:4px 0}
.tw-pre{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}
.tw-pre span{flex:1 1 100px;font-size:14px;overflow-wrap:anywhere}
.tw-pre .btn{min-height:56px;flex:0 0 auto}
.tw-tog{min-height:56px;min-width:96px;flex:0 0 auto}
`;

export function mountSettings(rootEl, { DEFAULTS, getConfig, setConfig, getReport, onResetProgress, onClose }) { // SCARS/STOCKS ignored if passed
  const doc = rootEl.ownerDocument;
  rootEl.textContent = '';
  const st = doc.createElement('style'); st.textContent = CSS; rootEl.appendChild(st);
  const el = (tag, cls, text, attrs) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const btn = (text, fn, id) => { const b = el('button', 'btn', text, { type: 'button' }); if (id) b.id = id; b.addEventListener('click', fn); return b; };
  const msg = el('div', 'tw-msg', '', { role: 'status' });
  const say = (t) => { msg.textContent = t; };
  const cfgNow = () => clone(getConfig());
  const apply = (cfg) => { setConfig(cfg); };

  rootEl.appendChild(el('p', 'tw-note', 'Changes apply from the next day'));

  const nameIn = el('input', 'tw-input', null, { type: 'text', placeholder: 'Preset name', 'aria-label': 'Preset name', maxlength: '24', id: 'tw-preset-name' });
  const bar = el('div', 'tw-bar');
  bar.appendChild(btn('Copy report', async () => say(await copyText(getReport()) ? 'Report copied' : 'Copy failed'), 'btn-copy-report-settings'));
  bar.appendChild(btn('Save preset', () => { const n = nameIn.value.trim(); if (!n) return say('Type a preset name first'); say(savePreset(n, cfgNow()) ? 'Saved ' + n : 'Save failed'); renderPresets(); }, 'btn-save-preset'));
  rootEl.appendChild(bar);
  rootEl.appendChild(nameIn);
  const presetList = el('div', 'tw-presets');
  rootEl.appendChild(presetList);
  rootEl.appendChild(msg);

  function renderPresets() {
    presetList.textContent = '';
    for (const n of listPresets()) {
      const r = el('div', 'tw-pre'); r.appendChild(el('span', '', n));
      r.appendChild(btn('Load', () => { const c = loadPreset(n); if (c) { apply(mergeOver(DEFAULTS, c)); renderRows(); say('Loaded ' + n); } }));
      r.appendChild(btn('Delete', () => { deletePreset(n); renderPresets(); say('Deleted ' + n); }));
      presetList.appendChild(r);
    }
  }

  const bar2 = el('div', 'tw-bar');
  bar2.appendChild(btn('Copy preset code', async () => say(await copyText(presetCode(cfgNow(), DEFAULTS)) ? 'Preset code copied' : 'Copy failed'), 'btn-copy-preset'));
  bar2.appendChild(btn('Reset all', () => { apply(clone(DEFAULTS)); renderRows(); say('All reset to default'); }, 'btn-reset-all'));
  rootEl.appendChild(bar2);
  const pasteIn = el('input', 'tw-input', null, { type: 'text', placeholder: 'Paste preset code (BTB2:...)', 'aria-label': 'Paste preset code', id: 'tw-paste' });
  const pasteRow = el('div', 'tw-row'); pasteRow.appendChild(pasteIn);
  pasteRow.appendChild(btn('Apply', () => {
    const d = parsePresetCode(pasteIn.value);
    if (!d) return say('Not a valid preset code');
    apply(mergeOver(DEFAULTS, d)); renderRows(); pasteIn.value = ''; say('Preset applied');
  }, 'btn-apply-preset'));
  rootEl.appendChild(pasteRow);

  rootEl.appendChild(el('div', 'tw-h', 'Tweak'));
  const rows = el('div', 'tw-rows', null, { id: 'tw-rows' });
  rootEl.appendChild(rows);

  function renderRows() {
    rows.textContent = '';
    const cfg = getConfig();
    const seen = new Set();
    const groups = GROUPS.map(([h, ks]) => [h, ks.filter(k => k in DEFAULTS)]);
    groups.forEach(([, ks]) => ks.forEach(k => seen.add(k)));
    const rest = Object.keys(DEFAULTS).filter(k => !seen.has(k));
    if (rest.length) groups.push(['Other', rest]);
    for (const [head, keys] of groups) {
      if (!keys.length) continue;
      rows.appendChild(el('div', 'tw-h', head));
      for (const key of keys) {
        for (const [path, d] of leaves(key, DEFAULTS[key])) {
          const v = getAt(cfg, path) ?? d;
          const changed = !deepSame(v, d);
          const row = el('div', 'tw-row' + (changed ? ' tw-changed' : ''), null, { 'data-key': key });
          const id = 'tw-' + path.join('-');
          const label = labelFor(path);
          row.appendChild(el('label', 'tw-label', label, { for: id }));
          const set = (nv) => { const c = cfgNow(); setAt(c, path, nv); apply(c); row.classList.toggle('tw-changed', !deepSame(nv, d)); };
          let input;
          if (typeof d === 'boolean') {
            input = btn(v ? 'On' : 'Off', () => { const nv = !getAt(getConfig(), path); set(nv); input.textContent = nv ? 'On' : 'Off'; input.setAttribute('aria-pressed', String(nv)); }); input.classList.add('tw-tog');
            input.id = id; input.setAttribute('aria-pressed', String(!!v));
          } else if (typeof d === 'number') {
            input = el('input', 'tw-input', null, { type: 'number', inputmode: 'decimal', step: String(stepFor(path)), id });
            input.value = v;
            input.addEventListener('change', () => { const n = parseFloat(input.value); if (Number.isFinite(n)) set(n); else input.value = getAt(getConfig(), path); });
          } else {
            input = el('input', 'tw-input', null, { type: 'text', id }); input.value = v;
            input.addEventListener('change', () => set(input.value));
          }
          row.appendChild(input);
          const rb = btn('Reset', () => { set(clone(d)); renderRows(); });
          rb.classList.add('tw-reset'); rb.setAttribute('aria-label', 'Reset ' + label);
          row.appendChild(rb);
          rows.appendChild(row);
        }
      }
    }
  }

  rootEl.appendChild(el('div', 'tw-h', 'Progress'));
  const rp = el('div', 'tw-bar');
  const rpBtn = btn('Reset progress', () => {
    if (rpBtn.dataset.armed !== '1') { rpBtn.dataset.armed = '1'; rpBtn.textContent = 'Tap again to erase all progress'; clearTimeout(rpBtn._t); rpBtn._t = setTimeout(disarm, 5000); return; }
    disarm(); try { onResetProgress && onResetProgress(); } catch {} say('Progress erased');
  }, 'btn-reset-progress');
  const disarm = () => { clearTimeout(rpBtn._t); rpBtn.dataset.armed = '0'; rpBtn.textContent = 'Reset progress'; };
  rp.appendChild(rpBtn);
  rp.appendChild(btn('Cancel', () => { disarm(); say(''); }));
  rootEl.appendChild(rp);

  renderRows(); renderPresets();
  return { refresh: () => { renderRows(); renderPresets(); } };
}
