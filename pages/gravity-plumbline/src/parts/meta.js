// meta.js - Plumbline medals, bests, daily seed. DOM-free; localStorage only, always in try/catch.
// S1: save versioning. Key stays 'plumbline.v1' (old builds keep reading it); the object gains '_v' (2).
// Stored _v newer than VER = read-only: bests shown, never written (no downgrade). Old data (no _v) = 1, kept.
// Bests are per keyFor(mode, seed, n): 5-room and 7-room climbs never share a best. A run is never saved as a
// best when run.tuned or any Tweak is non-default (PL.Tweak.isDirty()). Per-room seconds: best.rooms (when
// given) and roomSummary()/reportLines() for the Copy report.
const PL = (globalThis.PL = globalThis.PL || {});
PL.meta = (function () {
  'use strict';
  const KEY = 'plumbline.v1', VER = 2;
  let readOnly = false;
  const DT = (PL.C && PL.C.DT) || 1 / 120;
  const BANDS = { n: 7, bronze: 240, silver: 150, gold: 105, plumb: 75, plumbFlips: 12, flipStar: 15 };
  const RANK = { none: 0, bronze: 1, silver: 2, gold: 3, plumb: 4 };
  const k = (n) => (n > 0 ? n : BANDS.n) / BANDS.n;
  // Medal seconds per shaft length: one source of truth. 5 and 7 are set from bot medians + 4 s reading time
  // per room (src/review/medal-bands-beta.md); other lengths scale the 7-room row. Medals are recomputed from
  // stored seconds, so these numbers may be loosened later but never tightened.
  const BY_N = { 5: { bronze: 170, silver: 105, gold: 75, plumb: 55 }, 7: { bronze: BANDS.bronze, silver: BANDS.silver, gold: BANDS.gold, plumb: BANDS.plumb } };
  function bandsFor(n) {
    if (BY_N[n]) return BY_N[n];
    const f = k(n);
    return { bronze: BANDS.bronze * f, silver: BANDS.silver * f, gold: BANDS.gold * f, plumb: BANDS.plumb * f };
  }

  function flipStar(flips, nRooms) { return flips <= BANDS.flipStar * k(nRooms); }
  function medalFor(ticks, flips, nRooms) {
    const s = ticks * DT, f = k(nRooms), b = bandsFor(nRooms > 0 ? nRooms : BANDS.n);
    if (s <= b.plumb && flips <= BANDS.plumbFlips * f) return 'plumb';
    if (s <= b.gold) return 'gold';
    if (s <= b.silver) return 'silver';
    if (s <= b.bronze) return 'bronze';
    return 'none';
  }
  function dailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function keyFor(mode, seed, n) { return mode + ':' + seed + ':' + n; }
  function raw() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) {}
    return {};
  }
  // bests only (the '_v' marker is stripped)
  function load() {
    const o = raw(), v = typeof o._v === 'number' ? o._v : 1;
    readOnly = v > VER;
    const out = {};
    for (const k in o) if (k !== '_v') out[k] = o[k];
    return out;
  }
  function save(o) {
    const cur = raw();
    if (typeof cur._v === 'number' && cur._v > VER) { readOnly = true; return false; }
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ _v: VER }, o))); return true; } catch (e) { return false; }
  }
  function isTuned(run) {
    if (run && run.tuned) return true;
    try { return !!(PL.Tweak && PL.Tweak.isDirty('sim')); } catch (e) { return false; }
  }
  function getBest(key) {
    const b = load()[key];
    return b && typeof b.ticks === 'number' ? b : null;
  }
  function nOf(key) { const n = parseInt(String(key).split(':')[2], 10); return n > 0 ? n : BANDS.n; }
  function recordRun(key, run) {
    const n = nOf(key), ticks = run.ticks, flips = run.flips || 0;
    const medal = medalFor(ticks, flips, n), star = flipStar(flips, n);
    const prev = getBest(key);
    if (isTuned(run)) return { isBest: false, best: prev, medal, flipStar: star, tuned: true };
    const better = !prev || (RANK[medal] || 0) > (RANK[prev.medal] || 0) ||
      ((RANK[medal] || 0) === (RANK[prev.medal] || 0) && ticks < prev.ticks);
    if (!better) return { isBest: false, best: prev, medal, flipStar: star };
    const best = { ticks, flips, medal };
    if (Array.isArray(run.rooms)) best.rooms = run.rooms.map((x) => Math.round(x * 100) / 100);
    const o = load(); o[key] = best;
    if (!save(o)) return { isBest: false, best: prev, medal, flipStar: star, readOnly: true };
    return { isBest: true, best, medal, flipStar: star };
  }
  // attempts: [{room (1-based), ticks, result ('win'|'death'|'restart'|...), cause?}] ->
  // [{room, seconds (all attempts in that room), clearS (winning attempt, null if not cleared), attempts, deaths, causes:{cause:n}}]
  function roomSummary(attempts, nRooms) {
    const out = [];
    for (let r = 1; r <= nRooms; r++) {
      const a = (attempts || []).filter((x) => x.room === r);
      const win = a.find((x) => x.result === 'win');
      const causes = {};
      for (const x of a) if (x.result === 'death') causes[x.cause || '?'] = (causes[x.cause || '?'] || 0) + 1;
      out.push({ room: r, seconds: Math.round(a.reduce((t, x) => t + (x.ticks || 0), 0) * DT * 100) / 100,
        clearS: win ? Math.round(win.ticks * DT * 100) / 100 : null, attempts: a.length,
        deaths: a.filter((x) => x.result === 'death').length, causes });
    }
    return out;
  }
  function reportLines(attempts, nRooms) {
    return ['per-room seconds [room: total s, clear s, attempts, deaths, causes]:'].concat(roomSummary(attempts, nRooms).map((r) =>
      '  room ' + r.room + ': ' + r.seconds.toFixed(2) + 's, clear ' + (r.clearS == null ? '-' : r.clearS.toFixed(2) + 's') +
      ', ' + r.attempts + ' att, ' + r.deaths + ' deaths' + (r.deaths ? ' (' + Object.keys(r.causes).map((k) => k + ' ' + r.causes[k]).join(', ') + ')' : '')));
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }
  return { BANDS, bandsFor, VER, medalFor, flipStar, dailySeed, keyFor, load, recordRun, getBest, reset, roomSummary, reportLines,
    isReadOnly: () => { load(); return readOnly; } };
})();
