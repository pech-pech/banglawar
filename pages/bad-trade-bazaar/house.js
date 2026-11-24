// Bad Trade Bazaar house: storage, config, presets, settings panel, SW. Browser only; every storage access in try/catch.
const K_PROFILE = 'btb-profile-v1', K_CONFIG = 'btb-config-v1', K_PRESETS = 'btb-presets-v1';
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const rd = (k) => { try { const s = store(); const v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const wr = (k, v) => { try { const s = store(); if (!s) return false; s.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function loadProfile() {
  const p = rd(K_PROFILE);
  return p && typeof p === 'object' && Array.isArray(p.collection) ? p : null;
}
export function saveProfile(p) {
  try {
    const old = rd(K_PROFILE);
    if (old && typeof old.v === 'number' && p && typeof p.v === 'number' && old.v > p.v) return false; // never overwrite newer v with older
    return wr(K_PROFILE, p);
  } catch { return false; }
}
export function loadConfig(DEFAULTS) {
  const cfg = clone(DEFAULTS);
  const s = rd(K_CONFIG);
  if (s && typeof s === 'object') for (const k of Object.keys(DEFAULTS)) if (k in s && typeof s[k] === typeof DEFAULTS[k] && Array.isArray(s[k]) === Array.isArray(DEFAULTS[k])) cfg[k] = s[k];
  return cfg;
}
export function saveConfig(cfg) { return wr(K_CONFIG, cfg); }
export function diffConfig(cfg, DEFAULTS) {
  const d = {};
  for (const k of Object.keys(DEFAULTS)) if (cfg && k in cfg && !same(cfg[k], DEFAULTS[k])) d[k] = cfg[k];
  return d;
}
export function isDev(cfg, DEFAULTS) { return Object.keys(diffConfig(cfg, DEFAULTS)).length > 0; }

const b64e = (s) => { const u = new TextEncoder().encode(s); let bin = ''; u.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); };
const b64d = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
export function presetCode(cfg, DEFAULTS) { return 'BTB1:' + b64e(JSON.stringify(diffConfig(cfg, DEFAULTS))); }
export function parsePresetCode(str) {
  try {
    const s = String(str || '').trim();
    if (!s.startsWith('BTB1:')) return null;
    const o = JSON.parse(b64d(s.slice(5)));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
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

export function registerSW() {
  try { if (window.isSecureContext && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
}

const STEPS = { runSec: 5, tickMs: 50, startCash: 5, slots: 1, stackCap: 1, volScale: 0.1, K: 0.01, M: 0.1, regimeMin: 1, regimeMax: 1, pUp: 0.05, pDown: 0.05, saleCut: 0.005, lossLine: 0.005, holdSec: 1, spareCash: 1, spareCap: 1, buyLockMs: 50 };
const stepFor = (key, v) => STEPS[key] ?? (key === 'base' ? 1 : key === 'vol' ? 0.001 : key === 'perk' ? 0.05 : (Math.abs(v) >= 10 ? 1 : 0.01));
const LABELS = { sameMarkets: 'Same markets every run (fair test)' };
const nice = (k) => LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const CSS = `
.tw-note{font-size:14px;margin:0 0 10px;opacity:.85}
.tw-bar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.tw-bar .btn,.tw-row .tw-reset{min-height:56px;font-size:14px}
.tw-bar .btn{flex:1 1 140px}
.tw-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}
.tw-label{flex:1 1 100%;font-size:14px}
.tw-input{min-height:48px;font-size:16px;min-width:0;flex:1 1 80px;box-sizing:border-box}
.tw-row .tw-reset{flex:0 0 auto;min-width:56px}
.tw-h{font-size:16px;margin:16px 0 4px;font-weight:700}
.tw-msg{font-size:14px;min-height:20px;margin:4px 0}
.tw-pre{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}
.tw-pre span{flex:1 1 100px;font-size:14px;overflow-wrap:anywhere}
.tw-pre .btn{min-height:56px;flex:0 0 auto}
.tw-tog{min-height:56px;min-width:96px;flex:0 0 auto}
`;

export function mountSettings(rootEl, { DEFAULTS, SCARS, STOCKS, getConfig, setConfig, getReport, onResetProgress, onClose }) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = '';
  const st = doc.createElement('style'); st.textContent = CSS; rootEl.appendChild(st);
  const el = (tag, cls, text, attrs) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const btn = (text, fn, id) => { const b = el('button', 'btn', text, { type: 'button' }); if (id) b.id = id; b.addEventListener('click', fn); return b; };
  const msg = el('div', 'tw-msg', '', { role: 'status' });
  const say = (t) => { msg.textContent = t; };
  const cfgNow = () => clone(getConfig());
  const apply = (cfg) => { setConfig(cfg); };

  rootEl.appendChild(el('p', 'tw-note', 'Changes apply from the next run'));

  // Buttons row: Copy report, Save preset adjacent
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
      r.appendChild(btn('Load', () => { const c = loadPreset(n); if (c) { const m = { ...clone(DEFAULTS), ...c }; apply(m); renderRows(); say('Loaded ' + n); } }));
      r.appendChild(btn('Delete', () => { deletePreset(n); renderPresets(); say('Deleted ' + n); }));
      presetList.appendChild(r);
    }
  }

  const bar2 = el('div', 'tw-bar');
  bar2.appendChild(btn('Copy preset code', async () => say(await copyText(presetCode(cfgNow(), DEFAULTS)) ? 'Preset code copied' : 'Copy failed'), 'btn-copy-preset'));
  bar2.appendChild(btn('Reset all', () => { apply(clone(DEFAULTS)); renderRows(); say('All reset to default'); }, 'btn-reset-all'));
  rootEl.appendChild(bar2);
  const pasteIn = el('input', 'tw-input', null, { type: 'text', placeholder: 'Paste preset code (BTB1:...)', 'aria-label': 'Paste preset code', id: 'tw-paste' });
  const pasteRow = el('div', 'tw-row'); pasteRow.appendChild(pasteIn);
  pasteRow.appendChild(btn('Apply', () => {
    const d = parsePresetCode(pasteIn.value);
    if (!d) return say('Not a valid preset code');
    const m = clone(DEFAULTS); for (const k of Object.keys(DEFAULTS)) if (k in d && typeof d[k] === typeof DEFAULTS[k] && Array.isArray(d[k]) === Array.isArray(DEFAULTS[k])) m[k] = d[k];
    apply(m); renderRows(); pasteIn.value = ''; say('Preset applied');
  }, 'btn-apply-preset'));
  rootEl.appendChild(pasteRow);

  rootEl.appendChild(el('div', 'tw-h', 'Tweak'));
  const rows = el('div', 'tw-rows', null, { id: 'tw-rows' });
  rootEl.appendChild(rows);

  const labelFor = (key, i) => key === 'base' || key === 'vol' ? `${nice(key)}: ${STOCKS[i] ?? i}` : key === 'perk' ? `Perk: ${SCARS[i] ? SCARS[i].name : i}` : `${nice(key)} ${i + 1}`;
  function renderRows() {
    rows.textContent = '';
    const cfg = getConfig();
    for (const key of Object.keys(DEFAULTS)) {
      const def = DEFAULTS[key], cur = cfg[key] ?? def;
      const items = Array.isArray(def) ? def.map((d, i) => [i, d, cur[i] ?? d]) : [[null, def, cur]];
      for (const [i, d, v] of items) {
        const row = el('div', 'tw-row', null, { 'data-key': key });
        const id = 'tw-' + key + (i === null ? '' : '-' + i);
        row.appendChild(el('label', 'tw-label', i === null ? nice(key) : labelFor(key, i), { for: id }));
        const set = (nv) => { const c = cfgNow(); if (i === null) c[key] = nv; else { c[key] = (c[key] || clone(def)).slice(); c[key][i] = nv; } apply(c); };
        let input;
        if (typeof d === 'boolean') {
          input = btn(v ? 'On' : 'Off', () => { const nv = !(getConfig()[key] ?? d); set(nv); input.textContent = nv ? 'On' : 'Off'; input.setAttribute('aria-pressed', String(nv)); }); input.classList.add('tw-tog');
          input.id = id; input.setAttribute('aria-pressed', String(!!v));
        } else if (typeof d === 'number') {
          input = el('input', 'tw-input', null, { type: 'number', inputmode: 'decimal', step: String(stepFor(key, d)), id });
          input.value = v;
          input.addEventListener('change', () => { const n = parseFloat(input.value); if (Number.isFinite(n)) set(n); else input.value = i === null ? getConfig()[key] : getConfig()[key][i]; });
        } else {
          input = el('input', 'tw-input', null, { type: 'text', id }); input.value = v;
          input.addEventListener('change', () => set(input.value));
        }
        row.appendChild(input);
        row.appendChild(btn('Reset', () => { set(i === null ? clone(d) : d); renderRows(); }));
        row.lastChild.classList.add('tw-reset'); row.lastChild.setAttribute('aria-label', 'Reset ' + (i === null ? nice(key) : labelFor(key, i)));
        rows.appendChild(row);
      }
    }
  }

  // Reset progress: in-panel 2-step confirm
  rootEl.appendChild(el('div', 'tw-h', 'Progress'));
  const rp = el('div', 'tw-bar');
  const rpBtn = btn('Reset progress', () => {
    if (rpBtn.dataset.armed !== '1') { rpBtn.dataset.armed = '1'; rpBtn.textContent = 'Tap again to erase all progress'; clearTimeout(rpBtn._t); rpBtn._t = setTimeout(disarm, 5000); return; }
    disarm(); try { onResetProgress && onResetProgress(); } catch {} say('Progress erased');
  }, 'btn-reset-progress');
  const disarm = () => { rpBtn.dataset.armed = '0'; rpBtn.textContent = 'Reset progress'; };
  rp.appendChild(rpBtn);
  const cancel = btn('Cancel', () => { disarm(); say(''); });
  rp.appendChild(cancel);
  rootEl.appendChild(rp);

  renderRows(); renderPresets();
  return { refresh: () => { renderRows(); renderPresets(); } };
}
