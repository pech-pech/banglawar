// meta.js - Plumbline medals, bests, daily seed. DOM-free; localStorage only, always in try/catch.
const PL = (globalThis.PL = globalThis.PL || {});
PL.meta = (function () {
  'use strict';
  const KEY = 'plumbline.v1';
  const DT = (PL.C && PL.C.DT) || 1 / 120;
  const BANDS = { n: 7, bronze: 240, silver: 150, gold: 105, plumb: 75, plumbFlips: 12, flipStar: 15 };
  const RANK = { none: 0, bronze: 1, silver: 2, gold: 3, plumb: 4 };
  const k = (n) => (n > 0 ? n : BANDS.n) / BANDS.n;

  function flipStar(flips, nRooms) { return flips <= BANDS.flipStar * k(nRooms); }
  function medalFor(ticks, flips, nRooms) {
    const s = ticks * DT, f = k(nRooms);
    if (s <= BANDS.plumb * f && flips <= BANDS.plumbFlips * f) return 'plumb';
    if (s <= BANDS.gold * f) return 'gold';
    if (s <= BANDS.silver * f) return 'silver';
    if (s <= BANDS.bronze * f) return 'bronze';
    return 'none';
  }
  function dailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function keyFor(mode, seed, n) { return mode + ':' + seed + ':' + n; }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) {}
    return {};
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function getBest(key) {
    const b = load()[key];
    return b && typeof b.ticks === 'number' ? b : null;
  }
  function nOf(key) { const n = parseInt(String(key).split(':')[2], 10); return n > 0 ? n : BANDS.n; }
  function recordRun(key, run) {
    const n = nOf(key), ticks = run.ticks, flips = run.flips || 0;
    const medal = medalFor(ticks, flips, n), star = flipStar(flips, n);
    const prev = getBest(key);
    if (run.tuned) return { isBest: false, best: prev, medal, flipStar: star };
    const better = !prev || (RANK[medal] || 0) > (RANK[prev.medal] || 0) ||
      ((RANK[medal] || 0) === (RANK[prev.medal] || 0) && ticks < prev.ticks);
    if (!better) return { isBest: false, best: prev, medal, flipStar: star };
    const best = { ticks, flips, medal };
    const o = load(); o[key] = best; save(o);
    return { isBest: true, best, medal, flipStar: star };
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }
  return { BANDS, medalFor, flipStar, dailySeed, keyFor, load, recordRun, getBest, reset };
})();
