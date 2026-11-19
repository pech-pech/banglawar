// Burn Window TWEAK: live gameplay-value overrides for testing. BW.tweak. Mutates BW.sim.C in place (browser only).
// Defaults are snapshotted at load, before anything is changed. Persists changed values in localStorage (bw:tweaks).
(function (root) {
  'use strict';
  const BW = root.BW = root.BW || {};
  const sim = (typeof module !== 'undefined' && module.exports) ? require('./sim.js') : BW.sim;
  if (!sim || !sim.C) return;
  const C = sim.C, KEY = 'bw:tweaks', PKEY = 'bw:tweakpresets';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const ROWS = [
    ['THRUST', 'Thrust'], ['FUEL_RATE', 'Fuel burn rate'], ['FUEL0', 'Base fuel'], ['GATE_R', 'Gate radius'],
    ['DOCK_V', 'Dock speed limit'], ['CRASH_PAD', 'Crash margin'], ['THROTTLE_MIN', 'Min throttle'],
    ['GM.small', 'Gravity, small'], ['GM.medium', 'Gravity, medium'], ['GM.large', 'Gravity, large']
  ].map(r => ({ k: r[0], label: r[1] }));
  const rd = k => k.indexOf('GM.') === 0 ? C.GM[k.slice(3)] : C[k];
  const wr = (k, v) => { if (k.indexOf('GM.') === 0) C.GM[k.slice(3)] = v; else C[k] = v; };
  const DEF = {}; ROWS.forEach(r => { DEF[r.k] = rd(r.k); });
  const known = k => Object.prototype.hasOwnProperty.call(DEF, k);
  function range(k) {
    const d = DEF[k], step = Math.pow(10, Math.floor(Math.log10(d * 0.02)));
    let max = d * 2; if (k === 'THROTTLE_MIN') max = 1;
    return { min: d * 0.5, max: max, step: step };
  }
  function clamp(k, v) {
    const r = range(k); v = +v; if (!isFinite(v)) return DEF[k];
    v = Math.max(r.min, Math.min(r.max, v));
    const dec = Math.max(0, -Math.floor(Math.log10(r.step)));
    v = +(Math.round(v / r.step) * r.step).toFixed(dec);
    return Math.abs(v - DEF[k]) < r.step / 2 ? DEF[k] : v;
  }
  const api = { ROWS, onChange: null };
  api.range = range;
  api.def = k => DEF[k];
  api.get = k => known(k) ? rd(k) : undefined;
  function persist() { lsSet(KEY, JSON.stringify(api.diff())); }
  function note() { try { api.onChange && api.onChange(); } catch (e) {} }
  api.set = function (k, v) { if (!known(k)) return; wr(k, clamp(k, v)); persist(); note(); };
  api.reset = function (k) { if (!known(k)) return; wr(k, DEF[k]); persist(); note(); };
  api.resetAll = function () { ROWS.forEach(r => wr(r.k, DEF[r.k])); persist(); note(); };
  api.diff = function () { const o = {}; ROWS.forEach(r => { if (rd(r.k) !== DEF[r.k]) o[r.k] = rd(r.k); }); return o; };
  // replace all tweaks with obj (unknown keys ignored, values clamped); keys absent go back to default
  api.apply = function (obj, quiet) {
    ROWS.forEach(r => wr(r.k, obj && typeof obj === 'object' && known(r.k) && Object.prototype.hasOwnProperty.call(obj, r.k) ? clamp(r.k, obj[r.k]) : DEF[r.k]));
    persist(); if (!quiet) note();
  };
  api.encode = function () { try { return btoa(JSON.stringify({ v: 1, tweaks: api.diff() })); } catch (e) { return ''; } };
  api.decode = function (code) {
    try { const o = JSON.parse(atob(String(code).trim())); if (o && o.v === 1 && o.tweaks && typeof o.tweaks === 'object') { const t = {}; for (const k in o.tweaks) if (known(k) && isFinite(+o.tweaks[k])) t[k] = clamp(k, o.tweaks[k]); return t; } } catch (e) {}
    return null;
  };
  api.format = function (k, v) { const r = range(k), dec = Math.max(0, -Math.floor(Math.log10(r.step))); return v >= 10000 ? String(Math.round(v)) : v.toFixed(dec); };
  function plist() { try { const a = JSON.parse(lsGet(PKEY) || '[]'); return Array.isArray(a) ? a.filter(p => p && typeof p.name === 'string' && p.tweaks && typeof p.tweaks === 'object') : []; } catch (e) { return []; } }
  api.presets = {
    list: () => plist(),
    save: function (name) {
      name = String(name || '').trim().slice(0, 24); const a = plist();
      if (!name) { let n = 1; while (a.some(p => p.name === 'Preset ' + n)) n++; name = 'Preset ' + n; }
      const e = { name: name, tweaks: api.diff() }, i = a.findIndex(p => p.name === name);
      if (i >= 0) a[i] = e; else a.push(e);
      lsSet(PKEY, JSON.stringify(a)); return name;
    },
    load: function (name) { const p = plist().find(q => q.name === name); if (!p) return false; api.apply(api.decode(btoa(JSON.stringify({ v: 1, tweaks: p.tweaks }))) || {}); return true; },
    remove: function (name) { lsSet(PKEY, JSON.stringify(plist().filter(p => p.name !== name))); }
  };
  // reapply saved tweaks at startup, before the first sector is generated
  try { const o = JSON.parse(lsGet(KEY) || 'null'); if (o && typeof o === 'object') api.apply(o, true); } catch (e) {}
  BW.tweak = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
