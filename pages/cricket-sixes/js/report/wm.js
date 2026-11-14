// wa1 Copy report: wheel upgrade lines (SPEC 2026-11-14 s5 line 6). Pure: state in, strings / a small object out. Flag off -> nothing.
// Lines: per-wheel full-tree value ratio (design), tokens used per wheel this season (cap), match-day cap, and the Find check:
// avg careful Find rate at an 18% activity, run through the game's own Find wheel. Above 55% = bug.
import { FLAGS } from '../data/flags.js';
import { WM, NODES } from '../data/wheelmeta.js';
import { makeRng } from '../core/rng.js';
import { effective, metaReport, metaOf, matchKeyOf, TOKEN_WHEELS } from '../core/wheelmeta.js';
import { findWheel, findWheelResult, modsFor } from '../core/dialreel.js';

const FIND_SPEC = ['sp_fnd_n', 'sp_fnd_r']; // Sharp Eyes, Second Cheer: not in the SPEC s3a "full tree" column
export const FIND_CHECK = { rate: 18, n: 3000, bug: 55, none: 22.9, full: 47.1 }; // SPEC s1 + s3a (avg careful at 18%)

const memo = new Map(); // same tree -> same number (seeded); a copy calls this twice
/** Avg careful Find % at an 18% activity for the tree in `s` (seeded, game code). @param {any} s @param {number} [n] */
export function findCareful(s, n = FIND_CHECK.n) {
  const E = effective(s), mods = { ...modsFor(E, 'find'), cheer: 0 } /* wa1 findtune: Second Cheer is 1 a season, not a per-spin rate */, ctl = E.find || {}, key = JSON.stringify([mods, ctl, n]);
  if (memo.has(key)) return memo.get(key);
  const w = findWheel({ find: FIND_CHECK.rate, mix: { coins: 1 } }, mods, ctl), rng = makeRng('report|findcheck');
  let hit = 0; for (let i = 0; i < n; i++) if (findWheelResult(rng, w, true).find) hit++;
  const v = Math.round((1000 * hit) / n) / 10; if (memo.size > 20) memo.clear(); memo.set(key, v); return v;
}
/** The same state with every tree node at max rank (the design's "full tree"). @param {any} s */
export function fullTreeOf(s, skip = []) {
  const n = { ...s, wheelMeta: { ...metaOf(s), owned: {} }, wheelCraft: { ...(s.wheelCraft || {}), owned: {} } };
  for (const x of NODES) { if (skip.includes(x.id)) continue; if (x.branch === 'craft') n.wheelCraft.owned[x.id] = x.max_rank; else n.wheelMeta.owned[x.id] = x.max_rank; }
  return n;
}
const usedOn = (/** @type {any} */ m, /** @type {string} */ w) => { const u = ((m.tokUsed || {})[w]) | 0; return w === 'spot' ? Math.max(u, m.spotTokensUsed | 0) : u; };

/** Compact numbers for the JSON block: {tok:{wheel:n}, md:n, fc:[yours, design full (no Find Specialist), every node], bug:0|1}. null with the flag off. @param {any} s */
export function wmJson(s) {
  if (!FLAGS.wheelMeta || !s) return null;
  const m = metaOf(s), tok = {}; for (const w of TOKEN_WHEELS) tok[w] = usedOn(m, w);
  const md = m.matchTokUsed && m.matchTokUsed.key === matchKeyOf(s) ? m.matchTokUsed.n | 0 : 0;
  const yours = findCareful(s), design = findCareful(fullTreeOf(s, FIND_SPEC)), all = findCareful(fullTreeOf(s));
  return { tok, md, fc: [yours, design, all], bug: Math.max(yours, design, all) > FIND_CHECK.bug ? 1 : 0 };
}

/** Report lines: core's metaReport (tree, tokens, Control, ratios, tokens per wheel, match cap) + the Find check. [] with the flag off. @param {any} s */
export function wmLines(s) {
  if (!FLAGS.wheelMeta || !s) return [];
  const out = metaReport(s).slice(), j = wmJson(s); if (!j) return out;
  out.push(`Find check (${FIND_CHECK.rate}% activity, avg careful): your tree ${j.fc[0]}%, full tree ${j.fc[1]}%, every node ${j.fc[2]}% [design none ${FIND_CHECK.none}, full ${FIND_CHECK.full}; over ${FIND_CHECK.bug}% = bug] ${j.bug ? 'BUG' : 'ok'}`);
  const caps = /** @type {any} */ (WM.TOKEN_CAP_WHEEL_SEASON), full = TOKEN_WHEELS.filter((w) => caps[w] != null && j.tok[w] >= caps[w]);
  if (full.length) out.push(`Token cap reached this season: ${full.join(', ')}`);
  return out;
}
