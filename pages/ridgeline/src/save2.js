// Save v2 for Ridgeline. Storage is injected ({get(key), set(key, val), remove?(key)}),
// so node tests use a Map. Never throws. Never downgrades a best. No Date.now.
import { pad2 } from './daily.js';

export const KEYS = {};
export const SAVE_KEY = 'ridgeline.save.v2';
export const BAK_KEY = SAVE_KEY + '.bak';
export const BAD_KEY = SAVE_KEY + '.bad';
export const LEGACY = { bestdist: 'ridgeline.bestdist.v1', best: 'ridgeline.best.v1', medal: 'ridgeline.medal.v1', presets: 'ridgeline.presets.v1' };
export const LOG_DAYS = 30;
export const TOAST_RESET = 'Save reset, backup kept';
export const TOAST_RULES = 'Physics updated: distances cleared, marks kept.';

const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);
const uniq = (a) => [...new Set(a)];

export function defaults(rulesVersion = 1, today = '') {
  return {
    v: 2, rulesVersion, rules: rulesVersion, best: null, bestByHull: {}, marks: [], hulls: ['wren'], hull: 'wren', zones: {}, zoneCount: {},
    stats: { runs: 0, dist: 0, wrecks: 0, night: 0, rock: 0, clean: 0, longestFlightS: 0 },
    presets: [], daily: { date: today, seed: '', best: 0, hull: '', runs: 0, log: {} }, legacy: {},
  };
}

// Returns a cleaned state or null if the shape or any field type is wrong (no silent coercion).
// Accepts spec shape (rules, zones object, zoneCount) and array zones from older drafts.
const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const okStrArr = (a) => Array.isArray(a) && a.every(x => typeof x === 'string');
const optNum = (o, k) => o[k] === undefined || isNum(o[k]);
export function validate(o, rulesVersion = 1, today = '') {
  if (!isObj(o) || o.v !== 2) return null;
  const rv = o.rulesVersion !== undefined ? o.rulesVersion : o.rules;
  if (!isNum(rv)) return null;
  if (!okStrArr(o.marks) || !okStrArr(o.hulls)) return null;
  if (o.hull !== undefined && typeof o.hull !== 'string') return null;
  if (!isObj(o.stats) || !Object.keys(o.stats).every(k => isNum(o.stats[k]))) return null;
  if (!isObj(o.daily)) return null;
  const d = o.daily;
  if (!optNum(d, 'best') || !optNum(d, 'runs')) return null;
  for (const k of ['date', 'seed', 'hull']) if (d[k] !== undefined && typeof d[k] !== 'string') return null;
  if (d.log !== undefined && !isObj(d.log)) return null;
  let zones = {};
  if (okStrArr(o.zones)) for (const k of o.zones) zones[k] = 1;
  else if (isObj(o.zones) && Object.keys(o.zones).every(k => isNum(o.zones[k]))) zones = { ...o.zones };
  else return null;
  if (o.zoneCount !== undefined && !(isObj(o.zoneCount) && Object.keys(o.zoneCount).every(k => isNum(o.zoneCount[k])))) return null;
  const b = o.best;
  if (b != null) {
    if (!isObj(b) || !isNum(b.dist)) return null;
    for (const k of ['zone', 'lap', 'rules']) if (!optNum(b, k)) return null;
    for (const k of ['hull', 'seed']) if (b[k] !== undefined && typeof b[k] !== 'string') return null;
  }
  if (o.bestByHull !== undefined && !(isObj(o.bestByHull) && Object.keys(o.bestByHull).every(k => isNum(o.bestByHull[k])))) return null;
  if (o.presets !== undefined && !Array.isArray(o.presets)) return null;
  if (o.legacy !== undefined && !isObj(o.legacy)) return null;
  const s = defaults(rulesVersion, today);
  s.rulesVersion = rv;
  s.best = b ? { dist: Math.floor(b.dist), hull: b.hull || 'wren', zone: b.zone || 0, lap: b.lap || 0, seed: b.seed || '', rules: isNum(b.rules) ? b.rules : rv } : null;
  s.bestByHull = { ...(o.bestByHull || {}) };
  s.marks = uniq(o.marks);
  s.hulls = uniq(['wren', ...o.hulls]);
  s.hull = o.hull && s.hulls.includes(o.hull) ? o.hull : 'wren';
  s.zones = zones;
  s.zoneCount = { ...(o.zoneCount || {}) };
  for (const k of Object.keys(s.stats)) s.stats[k] = o.stats[k] || 0;
  s.presets = (o.presets || []).filter(p => p && typeof p.name === 'string' && p.values && typeof p.values === 'object');
  s.daily = { date: d.date || '', seed: d.seed || '', best: d.best || 0, hull: d.hull || '', runs: d.runs || 0, log: { ...(d.log || {}) } };
  s.legacy = { ...(o.legacy || {}) };
  return s;
}

export function createSave({ storage, rulesVersion = 1, today = () => '', dev = () => false } = {}) {
  let state = defaults(rulesVersion, today());
  let toast = '';
  const log = [];

  const sget = (k) => { try { const v = storage.get(k); return v == null ? null : String(v); } catch (e) { return null; } };
  const sset = (k, v) => { try { storage.set(k, v); return true; } catch (e) { log.push('set ' + k); return false; } };
  const parse = (raw) => { try { return validate(JSON.parse(raw), rulesVersion, today()); } catch (e) { return null; } };

  function migrateV1() {
    const s = defaults(rulesVersion, today());
    let found = false;
    const d = parseFloat(sget(LEGACY.bestdist));
    if (isFinite(d) && d > 0) { s.best = { dist: Math.floor(d), hull: 'wren', zone: 0, lap: 0, seed: '', rules: rulesVersion }; s.bestByHull.wren = s.best.dist; s.legacy.bestdist = s.best.dist; found = true; }
    for (const k of ['best', 'medal']) {
      try { const o = JSON.parse(sget(LEGACY[k])); if (o && typeof o === 'object') { s.legacy[k] = Object.keys(o).length; found = true; } } catch (e) { /* none */ }
    }
    try {
      const p = JSON.parse(sget(LEGACY.presets));
      if (Array.isArray(p)) { s.presets = p.filter(x => x && typeof x.name === 'string' && x.values && typeof x.values === 'object'); if (s.presets.length) found = true; }
    } catch (e) { /* none */ }
    return found ? s : null;
  }

  function rollover() {
    const t = today();
    const d = state.daily;
    if (d.date === t) return false;
    if (d.date && d.best > 0) d.log[d.date] = { best: d.best, hull: d.hull };
    const keep = Object.keys(d.log).sort().slice(-LOG_DAYS);
    const nl = {}; for (const k of keep) nl[k] = d.log[k];
    state.daily = { date: t, seed: '', best: 0, hull: '', runs: 0, log: nl };
    return true;
  }

  function applyRules() {
    if (state.rulesVersion === rulesVersion) return false;
    if (state.rulesVersion > rulesVersion) return false; // newer save on older build: leave alone
    state.rulesVersion = rulesVersion;
    state.best = null; state.bestByHull = {};
    state.daily.best = 0; state.daily.hull = ''; state.daily.seed = ''; state.daily.runs = 0; state.daily.log = {};
    toast = TOAST_RULES;
    return true;
  }

  // A save from a newer rules version is read-only for this (older) build.
  const locked = () => state.rulesVersion > rulesVersion;
  function write() {
    if (locked()) return false;
    state.rules = state.rulesVersion;
    const prev = sget(SAVE_KEY);
    if (prev != null && parse(prev)) sset(BAK_KEY, prev);
    return sset(SAVE_KEY, JSON.stringify(state));
  }
  const persist = () => write();

  function load() {
    toast = '';
    const raw = sget(SAVE_KEY);
    let s = raw != null ? parse(raw) : null;
    let dirty = false;
    if (raw != null && !s) {
      sset(BAD_KEY, raw);
      const bak = sget(BAK_KEY);
      s = bak != null ? parse(bak) : null;
      toast = TOAST_RESET; dirty = true;
    } else if (raw == null) {
      s = migrateV1(); dirty = true;
    }
    state = s || defaults(rulesVersion, today());
    if (applyRules()) dirty = true;
    if (rollover()) dirty = true;
    if (dirty && !dev() && !locked()) write();
    return { state, toast };
  }

  // Merge a candidate best, never downgrade. Same-rules only.
  const better = (cur, dist) => !cur || cur.rules !== rulesVersion || dist > cur.dist;

  // run: {dist, hull, zone, lap, seed, cause:'night'|'rock', wrecks, clean, longestFlightS, daily:bool, flow, landings}
  function recordRun(run) {
    if (locked()) return { saved: false, newBest: false, delta: 0, locked: true };
    rollover();
    const dist = Math.floor(num(run.dist));
    const hull = run.hull || state.hull;
    const prev = state.best && state.best.rules === rulesVersion ? state.best.dist : 0;
    let newBest = false;
    if (!dev() && better(state.best, dist) && dist > 0) {
      state.best = { dist, hull, zone: num(run.zone), lap: num(run.lap), seed: String(run.seed || ''), rules: rulesVersion };
      newBest = true;
    }
    if (!dev() && !(state.bestByHull[hull] >= dist)) state.bestByHull[hull] = dist;
    const st = state.stats;
    st.runs += 1; st.dist += dist; st.wrecks += num(run.wrecks); st.clean += num(run.clean);
    if (run.cause === 'night') st.night += 1; else if (run.cause === 'rock') st.rock += 1;
    st.longestFlightS = Math.max(st.longestFlightS, num(run.longestFlightS));
    let dailyBest = false;
    if (run.daily && !dev()) {
      const d = state.daily;
      if (dist > d.best) { d.best = dist; d.hull = hull; dailyBest = true; }
      d.seed = String(run.seed || d.seed);
    }
    const saved = write();
    return { saved, newBest, delta: dist - prev, dailyBest };
  }

  return {
    load, rollover, get: () => state, get toast() { return toast; }, get errors() { return log; },
    recordRun,
    // first 5 m of a run: counts daily attempts
    addDailyRun(seed) { if (locked() || dev()) return false; rollover(); state.daily.runs += 1; if (seed) state.daily.seed = String(seed); return write(); },
    unlockMark(id) { if (dev() || locked() || state.marks.includes(id)) return false; state.marks.push(id); return write(); },
    unlockHull(id) { if (dev() || locked() || state.hulls.includes(id)) return false; state.hulls.push(id); return write(); },
    setHull(id) { if (!state.hulls.includes(id)) return false; state.hull = id; return write(); },
    noteZone(zone, lap) { if (locked()) return false; const k = `${zone | 0}.${lap | 0}`; const z = String(zone | 0); state.zoneCount[z] = (state.zoneCount[z] || 0) + 1; state.zones[k] = 1; return write(); },
    setPresets(list) { state.presets = Array.isArray(list) ? list : []; return write(); },
    bestFor(hull) { return state.bestByHull[hull] || 0; },
    dailyToday() { if (!locked()) rollover(); return state.daily; },
    flush: persist,
  };
}

export { pad2 };
