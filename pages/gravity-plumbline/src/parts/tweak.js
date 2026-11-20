// tweak.js - S1: PL.store (versioned localStorage helper) + PL.Tweak registry. DOM-free, Node-loadable.
// Loads after core.js and camera.js (needs PL.C, PL.CAM), before input/draw/meta/ui.
// Rules (parts/tweak-tech.md sections 1 and 4):
// - Every PL.C value except DT is registered; defaults are read from code at registration.
// - set() clamps to [min,max] and snaps to the step grid; ids with target 'C' / 'CAM' write PL.C / PL.CAM at once.
//   core.js reads PL.C only at attempt start (PL.newState), so sim edits apply from the next attempt.
// - isDirty() = any non-default value (DEV badge; run is tuned, never saved as a best). isDirty('sim') = sim ids only.
// - Tweaks persist in 'plumbline.tweaks.v1' {v:1,t:{id:val}} (admin default: Q4 option a). Presets in
//   'plumbline.presets.v1' {v:1,list:[{name,t}]}, max 12, name <= 24 chars. Codes: 'PLT1:' + base64 of {v:1,t}.
// - Stored v newer than this code = read-only: never applied, never overwritten (no downgrade).
const PL = (globalThis.PL = globalThis.PL || {});

PL.store = (function () {
  'use strict';
  function ls() { try { return typeof localStorage !== 'undefined' && localStorage ? localStorage : null; } catch (e) { return null; } }
  function getRaw(key) { try { const s = ls(); return s ? s.getItem(key) : null; } catch (e) { return null; } }
  function setRaw(key, str) { try { const s = ls(); if (!s) return false; s.setItem(key, str); return true; } catch (e) { return false; } }
  function get(key) {
    try { const o = JSON.parse(getRaw(key)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
  }
  // -> {v, data, readOnly}; v 0 when missing or corrupt; readOnly when the stored v is newer than ver
  function load(key, ver) {
    const o = get(key);
    if (!o) return { v: 0, data: null, readOnly: false };
    const v = typeof o.v === 'number' ? o.v : 1;
    return { v, data: o, readOnly: v > ver };
  }
  // writes {v:ver, ...data}; refuses (false) when the stored copy is newer
  function save(key, ver, data) {
    if (load(key, ver).readOnly) return false;
    return setRaw(key, JSON.stringify(Object.assign({ v: ver }, data)));
  }
  function remove(key) { try { const s = ls(); if (s) s.removeItem(key); } catch (e) {} }
  function has() { return !!ls(); }
  return { get, getRaw, setRaw, load, save, remove, has };
})();

PL.Tweak = (function () {
  'use strict';
  const KEY = 'plumbline.tweaks.v1', PKEY = 'plumbline.presets.v1', VER = 1, PVER = 1, MAXP = 12, NAMEMAX = 24;
  const defs = Object.create(null), order = [], vals = Object.create(null), listeners = [], MAXCODE = 8192;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  let readOnly = false, loading = false, mem = null, presetsMem = [];

  function round(v) { return Number((+v).toFixed(6)); }
  function clamp(d, v) {
    if (d.list) return d.list.indexOf(v) >= 0 ? v : undefined;
    if (typeof v !== 'number' || !isFinite(v)) return undefined;
    v = Math.max(d.min, Math.min(d.max, v));
    if (d.step > 0) v = d.min + Math.round((v - d.min) / d.step) * d.step;
    return round(Math.max(d.min, Math.min(d.max, v)));
  }
  function push(id, v) {
    const d = defs[id];
    if (d.target === 'C' && PL.C) PL.C[d.key] = v;
    else if (d.target === 'CAM' && PL.CAM) PL.CAM[d.key] = v;
  }
  // def: {group, label, def, min, max, step, sim?, target? ('C'|'CAM'|null), key?, list?, help?}
  function register(id, def) {
    if (!def || (!def.list && !(typeof def.min === 'number' && typeof def.max === 'number'))) throw new Error('Tweak.register ' + id + ': needs min/max (or list)');
    const target = def.target !== undefined ? def.target : null;
    const key = def.key || id;
    let dv = def.def;
    if (target === 'C' && PL.C && PL.C[key] !== undefined) dv = PL.C[key];
    if (target === 'CAM' && PL.CAM && PL.CAM[key] !== undefined) dv = PL.CAM[key];
    const d = { id, group: def.group || 'Other', label: def.label || id, def: dv, min: def.min, max: def.max, step: def.step || 0,
      list: def.list || null, sim: !!def.sim, target, key, help: def.help || '' };
    if (!defs[id]) order.push(id);
    defs[id] = d;
    const had = Object.prototype.hasOwnProperty.call(vals, id) ? clamp(d, vals[id]) : undefined;
    vals[id] = had !== undefined ? had : d.def;
    if (mem && own(mem, id)) { const v = clamp(d, mem[id]); if (v !== undefined) vals[id] = v; }
    push(id, vals[id]);
    return d;
  }
  function has(id) { return !!defs[id]; }
  function get(id) { return defs[id] ? vals[id] : undefined; }
  function set(id, v) {
    const d = defs[id]; if (!d) return undefined;
    const c = clamp(d, v);
    if (c === undefined) return vals[id];
    if (c !== vals[id]) {
      vals[id] = c; push(id, c); persist();
      for (const f of listeners) { try { f(id, c); } catch (e) {} }
    }
    return c;
  }
  function reset(id) { return defs[id] ? set(id, defs[id].def) : undefined; }
  function resetAll() { for (const id of order) reset(id); }
  function diff(only) {
    const o = {};
    for (const id of order) if (vals[id] !== defs[id].def && (only !== 'sim' || defs[id].sim)) o[id] = vals[id];
    return o;
  }
  function isDirty(only) { return Object.keys(diff(only)).length > 0; }
  function apply(obj) {
    let n = 0;
    for (const id in obj || {}) if (own(obj, id) && defs[id] && clamp(defs[id], obj[id]) !== undefined) { set(id, obj[id]); n++; }
    return n;
  }
  function persist() {
    if (loading) return;
    // keep stored values of ids not registered yet (a later part may register them)
    const keep = {};
    for (const id in mem || {}) if (own(mem, id) && !defs[id] && id !== '__proto__') keep[id] = mem[id];
    mem = Object.assign(keep, diff());
    if (!readOnly) PL.store.save(KEY, VER, { t: mem });
  }
  function load() {
    const r = PL.store.load(KEY, VER);
    readOnly = r.readOnly;
    if (!r.data || r.readOnly || !r.data.t || typeof r.data.t !== 'object') { mem = null; return; }
    mem = r.data.t;
    loading = true;
    try { for (const id in mem) if (own(mem, id) && defs[id]) set(id, mem[id]); } finally { loading = false; }
  }
  // ---- codes ----
  function b64e(s) { return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); }
  function b64d(s) { return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); }
  function clean(t) {
    const o = {};
    for (const id in t || {}) if (own(t, id) && defs[id]) { const v = clamp(defs[id], t[id]); if (v !== undefined) o[id] = v; }
    return o;
  }
  function encode(t) { return 'PLT1:' + b64e(JSON.stringify({ v: 1, t: clean(t || diff()) })); }
  function decode(code) {
    try {
      if (typeof code === 'string' && code.length > MAXCODE) return null;
      const m = /^\s*PLT1:([A-Za-z0-9+/=]+)\s*$/.exec(String(code || ''));
      if (!m) return null;
      const o = JSON.parse(b64d(m[1]));
      if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1 || !o.t || typeof o.t !== 'object') return null;
      return clean(o.t);
    } catch (e) { return null; }
  }
  function exportCode() { return encode(diff()); }
  // replaces current values: ids not in the code go back to default. Returns ids applied, -1 if invalid.
  function importCode(code) {
    const t = decode(code); if (!t) return -1;
    for (const id of order) if (!own(t, id)) reset(id);
    return apply(t);
  }
  // ---- presets ----
  function readPresets() {
    const r = PL.store.load(PKEY, PVER);
    if (r.data && !r.readOnly && Array.isArray(r.data.list)) {
      presetsMem = r.data.list.filter((p) => p && typeof p.name === 'string' && p.t && typeof p.t === 'object').slice(0, MAXP)
        .map((p) => ({ name: p.name.slice(0, NAMEMAX), t: p.t }));
    }
    return presetsMem;
  }
  // true when written (or when there is no localStorage at all: presets then live in memory only)
  function writePresets(list) {
    const ok = PL.store.has() ? PL.store.save(PKEY, PVER, { list }) : true;
    if (ok) presetsMem = list;
    return ok;
  }
  function nameOf(n) { return String(n == null ? '' : n).trim().slice(0, NAMEMAX); }
  function listPresets() { return readPresets().map((p) => ({ name: p.name, t: clean(p.t) })); }
  const R = (ok, reason) => ({ ok, reason: ok ? null : reason });
  // -> {ok, reason}; reason 'blank' | 'full' | 'storage' (write failed or the stored copy is newer = read-only)
  function savePresetR(name, t) {
    const nm = nameOf(name); if (!nm) return R(false, 'blank');
    const list = readPresets().slice(), i = list.findIndex((p) => p.name === nm);
    const entry = { name: nm, t: clean(t || diff()) };
    if (i >= 0) list[i] = entry;
    else { if (list.length >= MAXP) return R(false, 'full'); list.push(entry); }
    return R(writePresets(list), 'storage');
  }
  function savePreset(name, t) { return savePresetR(name, t).ok; }
  function loadPreset(name) {
    const p = readPresets().find((q) => q.name === nameOf(name)); if (!p) return false;
    const t = clean(p.t);
    for (const id of order) if (!own(t, id)) reset(id);
    apply(t); return true;
  }
  // -> {ok, reason}; reason 'missing' (no such preset) | 'storage'
  function deletePresetR(name) {
    const list = readPresets().slice(), i = list.findIndex((p) => p.name === nameOf(name)); if (i < 0) return R(false, 'missing');
    list.splice(i, 1); return R(writePresets(list), 'storage');
  }
  function deletePreset(name) { return deletePresetR(name).ok; }
  function ids() { return order.slice(); }
  function def(id) { return defs[id] ? Object.assign({}, defs[id]) : undefined; }
  // rows for a Settings/Tweak screen: [{group, ids:[...]}] in registration order
  function groups() {
    const g = [];
    for (const id of order) { const gr = defs[id].group; let e = g.find((x) => x.group === gr); if (!e) g.push(e = { group: gr, ids: [] }); e.ids.push(id); }
    return g;
  }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  // Copy report line: "G=1600* CAP=700 ..." (* = non-default), only dirty ids when short=true
  function reportLine(short) {
    const d = diff(); const ids2 = short ? Object.keys(d) : order;
    return ids2.map((id) => id + '=' + vals[id] + (id in d ? '*' : '')).join(' ') || 'none';
  }
  return { register, has, get, set, reset, resetAll, diff, isDirty, apply, encode, decode, exportCode, importCode,
    savePreset, savePresetR, loadPreset, deletePreset, deletePresetR, listPresets, ids, def, groups, onChange, reportLine, load,
    readOnly: () => readOnly, MAX_PRESETS: MAXP, NAME_MAX: NAMEMAX };
})();

// ---- built-in ids (defaults come from PL.C / PL.CAM; ranges from tweak-tech.md section 1, U for feel) ----
(function () {
  'use strict';
  const T = PL.Tweak;
  const C = (id, group, label, min, max, step) => T.register(id, { group, label, min, max, step, sim: true, target: 'C' });
  C('G', 'Physics', 'Gravity', 800, 2400, 100);
  C('CAP', 'Physics', 'Speed cap', 400, 1000, 50);
  C('DIVE_CAP', 'Physics', 'Dive speed cap', 600, 1300, 50);
  C('DIVE_ADD', 'Physics', 'Dive push', 0, 500, 25);
  C('DIVE_BOOST_T', 'Physics', 'Dive boost time s', 0.1, 0.6, 0.05);
  C('DIVE_CD', 'Physics', 'Dive cooldown s', 0.2, 1.0, 0.05);
  C('FRIC', 'Physics', 'Ground friction', 200, 2000, 100);
  C('DRAG', 'Physics', 'Air drag /s', 0, 1, 0.05);
  C('DRAG_AFTER', 'Physics', 'Drag after s', 0, 1, 0.05);
  C('BOUNCE_SIDE', 'Physics', 'Side bounce', 0, 0.6, 0.05);
  C('HALF', 'Physics', 'Hero half size px', 8, 14, 1);
  C('GATE_V', 'Physics', 'Gate speed', 0, 300, 20);
  C('CHARGES', 'Assists', 'Moves in the air', 1, 5, 1);
  C('BUFFER', 'Assists', 'Flip buffer s', 0, 0.25, 0.01);
  C('COYOTE_T', 'Assists', 'Coyote time s', 0, 0.2, 0.01);
  C('WALL_RIDE_T', 'Assists', 'Wall-ride refill s', 0.1, 0.6, 0.05);
  C('CRUMBLE_T', 'Hazards', 'Crumble delay s', 0.1, 1.0, 0.05);
  C('CRUSHER_PERIOD', 'Hazards', 'Crusher period s', 1.2, 4.0, 0.2);
  C('SPIKE_SHRINK', 'Hazards', 'Spike forgiveness px', 0, 6, 1);
  C('EXIT_R', 'Hazards', 'Exit radius px', 12, 32, 2);
  C('CRUSH_OVERLAP', 'Hazards', 'Crush overlap px', 0, 4, 1);
  C('RESPAWN_T', 'Hazards', 'Respawn s', 0.1, 1.0, 0.1);
  const K = (id, label, min, max, step) => T.register(id, { group: 'Camera', label, min, max, step, target: 'CAM' });
  K('LOOK_WIDE', 'Look-ahead wide s', 0, 0.8, 0.05);
  K('LOOK_TALL', 'Look-ahead tall s', 0, 0.8, 0.05);
  K('MAX_W', 'Max visible width', 336, 600, 12);
  K('POS_T', 'Follow smoothing s', 0.05, 1.0, 0.05);
  K('ZOOM_T', 'Zoom smoothing s', 0.05, 1.0, 0.05);
  K('BOB_MAX_Y', 'Hero max screen y', 0.4, 0.7, 0.05);
  K('FIT_MIN', 'Fit floor (scale)', 0.6, 1.0, 0.02);
  // read by input.js (PL.Input.layout); no sim effect
  // pad group (overlay build): PAD_ALPHA/PAD_SIDE are read by input.js + the pad drawing (L2) and camera/screens (L1)
  T.register('PAD_ALPHA', { group: 'Pad', label: 'Pad opacity', def: 0.45, min: 0.2, max: 1, step: 0.05 });
  T.register('PAD_SIDE', { group: 'Pad', label: 'Pad side', def: 0, min: 0, max: 1, step: 1, list: [0, 1], help: '0 right, 1 left' });
  T.register('PAD_KEY', { group: 'Pad', label: 'Arrow key size', def: 60, min: 48, max: 80, step: 4 });
  T.register('PAD_DIVE', { group: 'Pad', label: 'Dive key size', def: 56, min: 40, max: 72, step: 4 });
  T.register('PAD_GAP', { group: 'Pad', label: 'Key gap', def: 4, min: 0, max: 12, step: 2 });
  T.register('HAPTIC_MS', { group: 'Input', label: 'Key buzz ms', def: 8, min: 0, max: 30, step: 2 });
  // read by draw.js / ui.js (other slices); 0 SHAFT_N = use the mode's 5 or 7
  T.register('PATH_S', { group: 'Assists', label: 'Path preview s', def: 0.8, min: 0.2, max: 1.6, step: 0.2 });
  T.register('SHAFT_N', { group: 'Session', label: 'Shaft rooms (0 = mode)', def: 0, min: 0, max: 12, step: 1, sim: true });
  T.load();
})();
