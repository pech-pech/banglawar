// @ts-check
// Find slot reel (aimable), pity find and the Find big wheel. Pure: every roll uses the rng handed in. S0 Z1 split of js/core/dialreel.js (owner T4).
import { DR } from '../../data/dialreel.js';
import { FIND_WHEEL } from '../../data/dialreel.js'; // wa1 find: Find big wheel
import { spinResult } from '../training.js'; // wa1 find: Find big wheel physics
import { FIND_AIM_MIN_W } from '../find-aim.js';
import { FIND_SLICES, FIND_J, FIND_RATES } from '../../data/wheels/find.js'; // wheels-like-match SPEC s5: ring tables
import { neutralMods, clamp, sum, carefulTap, landingPhase, cellAt } from './common.js';

// ---------------------------------------------------------------- Find reel
/**
 * Find reel for an activity {find: percent, mix: {coins, player, coach}} (js/data/activities.js ACT.TABLE row). 12-unit loop, N F N F N F N F:
 * find shares split (largest halved) until 4 find cells, order Coach, Coins, Player. Tree: find cells + rareAdd (Sharp Eyes), first Coins cell + goldAdd (Widener),
 * Extra Gold = one more Coins cell (0.75 of the first) at the end of the loop (no extra Nothing cell, so finds rise); the loop is rescaled to 12 units. Cell: {index,type,find,w,a,b,gold}.
 * @param {{find:number,mix:Record<string,number>}} act @param {any} [mods]
 */
export function findReel(act, mods = neutralMods()) {
  const R = DR.REEL, m = { ...neutralMods(), ...mods }, f = (act.find || 0) / 100;
  /** @type {any[]} */ let sh = Object.entries(act.mix || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, v / 100]);
  if (!sh.length) sh = [['coins', 1]];
  // ties: Player, then Coins, then Coach is halved first
  while (sh.length < R.CELLS) { sh.sort((a, b) => b[1] - a[1] || R.ORDER.indexOf(b[0]) - R.ORDER.indexOf(a[0])); const [k, v] = sh.shift(); sh.push([k, v / 2], [k, v / 2]); }
  sh.sort((a, b) => R.ORDER.indexOf(a[0]) - R.ORDER.indexOf(b[0]));
  /** @type {any[]} */ const raw = [];
  const nothing = (1 - f) * R.C / R.CELLS;
  let goldDone = false;
  for (const [type, v] of sh) {
    raw.push({ type: 'nothing', find: false, w: nothing });
    const gold = type === 'coins' && !goldDone; if (gold) goldDone = true;
    raw.push({ type, find: true, gold, w: f * R.C * v + m.rareAdd * R.RARE_K + (gold ? m.goldAdd * R.GOLD_K : 0) });
  }
  const g0 = raw.find((c) => c.gold);
  for (let e = 0; e < m.extra && g0; e++) { raw.push({ type: 'coins', find: true, gold: false, second: true, w: g0.w * DR.EXTRA_W }); }
  const tot = sum(raw.map((c) => c.w)); let x = 0;
  const cells = raw.map((c, i) => { const w = R.C * c.w / tot, a = x; x += w; return { index: i, type: c.type, find: c.find, gold: !!c.gold, second: !!c.second, w, a, b: x }; });
  cells[cells.length - 1].b = R.C;
  return { kind: 'reel', wheel: 'find', C: R.C, V: R.V, G: R.G, J: R.J, cells, targets: cells.filter((c) => c.find).map((c) => (c.a + c.b) / 2), mods: m, actFind: act.find };
}

/** Where a STOP = {t, phi, e} lands on the reel: {t, e, base, dist, q, x (offset 0..C), index}. @param {any} reel @param {any} stop */
export function reelLanding(reel, stop) {
  const l = landingPhase(reel, stop), x = ((l.q % reel.C) + reel.C) % reel.C;
  return { ...l, phi: stop.phi, x, index: cellAt(reel.cells, x) };
}

/**
 * Find result (same stop forms as dialResult). Always draws 8 numbers. Second Cheer: a Nothing landing gets one more random pick by width. Booster: +10 x value Coins
 * when the hidden boosted non-gold cell lands. Returns {index, type: 'coins'|'player'|'coach'|null, find, second, boosted, coinsBonus, t, phi, e, x}.
 * Coins/Player/Coach themselves are resolved by the caller as in fans-matchday SPEC s2.
 * @param {{random:()=>number}} rng @param {any} reel @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 */
export function reelResult(rng, reel, stop = false) {
  const d = Array.from({ length: 8 }, () => rng.random()), o = stop && typeof stop === 'object' ? stop : null;
  const phi = o && Number.isFinite(o.phi) ? /** @type {number} */ (o.phi) : d[0] * reel.C;
  const e = o && Number.isFinite(o.e) ? /** @type {number} */ (o.e) : (d[2] * 2 - 1) * reel.J;
  const t = o && Number.isFinite(o.t) ? o.t : stop === true ? carefulTap(reel.targets, reel.C, reel.V, reel.G, phi, 1 - d[3], d[4]) : DR.STOP_FROM + d[1] * (DR.COAST - DR.STOP_FROM);
  const L = reelLanding(reel, { t, phi, e }), m = reel.mods;
  let cell = reel.cells[L.index], second = false;
  if (!cell.find && m.cheer) { const c2 = reel.cells[cellAt(reel.cells, d[5] * reel.C)]; if (c2.find) { cell = c2; second = true; } }
  let coinsBonus = 0, boosted = false;
  if (m.bch && d[6] < m.bch) {
    const cand = reel.cells.filter((/** @type {any} */ c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[7] * cand.length))];
    if (bi && bi.index === L.index) { coinsBonus = m.bval * DR.UNIT.find; boosted = true; }
  }
  return { index: L.index, type: cell.find ? cell.type : null, find: cell.find, second, boosted, coinsBonus, t: L.t, phi, e: L.e, x: L.x };
}

/** Pity find: a reveal-only pick among the find cells only, by width (no aim, one draw). @param {{random:()=>number}} rng @param {any} reel */
export function pityFind(rng, reel) {
  const fc = reel.cells.filter((/** @type {any} */ c) => c.find), tot = sum(fc.map((/** @type {any} */ c) => c.w)); let x = rng.random() * tot;
  const typeIn = (/** @type {any} */ c, /** @type {number} */ u) => (reel.mix ? findTypeAt(reel, u / c.w) : c.type); // big wheel: the type from the mix, on the draw's remainder in the block
  for (const c of fc) { if (x < c.w) return { index: c.index, type: typeIn(c, x) }; x -= c.w; }
  const c = fc[fc.length - 1]; return { index: c.index, type: typeIn(c, c.w * 0.5) };
}

// ---------------------------------------------------------------- Find big wheel (wheels-like-match SPEC s5; replaces the wa1 3-block wheel)
/** Hard ceiling for one slice (SPEC 11b, SLICE_CEIL_P 13.0%) in rim units of the 10-unit ring. */
export const FIND_SLICE_CEIL = 1.3;
/** The ring a find rate (percent, ACT.TABLE `find`) uses: nearest of 8 / 18 / 26, a tie going to the lower ring (14 and 16 -> 18, 22 -> 18). */
export function findRateOf(pct) {
  const p = (+pct || 0) / 100; let best = FIND_RATES[0];
  for (const r of FIND_RATES) if (Math.abs(r - p) < Math.abs(best - p) - 1e-12) best = r;
  return best;
}
const labelOf = (w) => (w < 0.7 ? 'F' : 'FIND'); // SPEC 2f: under 7% exactly one character
/**
 * Find big wheel for an activity {find: percent, mix} (SPEC s5): the find rate picks the ring (8 / 18 / 26) from FIND_SLICES: 2 FIND blocks (3 at 26%,
 * 12 / 12 / 2) each followed by CHEER pieces. A FIND block is ONE slice (its type, Coins / Player / Coach by the mix, is drawn when it lands).
 * Tree: Widener (goldAdd) + Sharp Eyes (rareAdd) widen every FIND block, clamped to FIND_SLICE_CEIL, never re-split; Extra Gold = one more FIND block,
 * 0.75 x the first block, put on the boundary farthest round the ring from the first FIND block. The extra width comes off the CHEER pieces pro rata,
 * so the ring stays 10. Control ctl {w0Mult, jMult, guide}: phys W0 = 36 x w0Mult, J = FIND_J (1.5) x jMult, D = 2.0, SD = 0.11 (0.08 with Aim Guide).
 * Shape for training.js spinResult: slices (1 find, 0 CHEER), widths, jackpotIndex, golds (= finds: FIND is gold, no token on it), finds, aims (block
 * centres = careful targets); plus rows [{id,w,value,label,tier,gold}], cells [{index,type 'find'|'cheer',find,block,second,w,a,b}], mix, rate, mods.
 * @param {{find:number,mix:Record<string,number>}} act @param {any} [mods] @param {{w0Mult?:number,jMult?:number,guide?:boolean}} [ctl]
 */
export function findWheel(act, mods = neutralMods(), ctl = {}) {
  const F = FIND_WHEEL, m = { ...neutralMods(), ...mods }, rate = findRateOf(act.find);
  /** @type {any[]} */ let mix = Object.entries(act.mix || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, v]);
  if (!mix.length) mix = [['coins', 1]];
  const mt = sum(mix.map((x) => x[1])); mix = mix.map(([k, v]) => [k, v / mt]).sort((a, b) => F.ORDER.indexOf(a[0]) - F.ORDER.indexOf(b[0]));
  const add = (m.goldAdd || 0) + (m.rareAdd || 0), base = FIND_SLICES[/** @type {0.08} */ (rate)];
  /** @type {any[]} */ let rows = base.map((r) => ({ find: r.gold, w: r.gold ? Math.min(FIND_SLICE_CEIL, r.w + add) : r.w, second: false }));
  const nx = Math.max(0, m.extra | 0);
  for (let e = 0; e < nx; e++) {
    const firstW = rows.find((r) => r.find).w, first = rows.findIndex((r) => r.find);
    let pos = 0; const starts = rows.map((r) => { const s0 = pos; pos += r.w; return s0; });
    const centre = starts[first] + rows[first].w / 2; // boundary b sits before row b; candidates: between two CHEER pieces first, else any boundary
    const cand = rows.map((_, b) => b).filter((b) => b > 0 && !rows[b].find && !rows[b - 1].find);
    const pool = cand.length ? cand : rows.map((_, b) => b).filter((b) => b > 0);
    let bi = pool[0], bd = -1;
    for (const b of pool) { const dx = Math.abs(starts[b] - centre), d = Math.min(dx, 10 - dx); if (d > bd + 1e-12) { bd = d; bi = b; } }
    rows.splice(bi, 0, { find: true, w: Math.min(FIND_SLICE_CEIL, firstW * F.EXTRA_W), second: true });
  }
  const fw = sum(rows.filter((r) => r.find).map((r) => r.w)), cw = sum(rows.filter((r) => !r.find).map((r) => r.w)), k = cw > 0 ? Math.max(0, (F.C - fw) / cw) : 1;
  rows = rows.map((r) => (r.find ? r : { ...r, w: r.w * k }));
  let x = 0, bn = 0;
  const cells = rows.map((r, i) => { const a = x; x += r.w; return { index: i, type: r.find ? 'find' : 'cheer', find: r.find, block: r.find ? bn++ : -1, second: r.second, w: r.w, a, b: x }; });
  cells[cells.length - 1].b = F.C;
  const ring = cells.map((c) => ({ id: c.index, w: c.w, value: c.find ? 1 : 0, label: c.find ? labelOf(c.w) : 'CHEER', tier: c.find ? 'top' : 'mid', gold: c.find }));
  const finds = cells.filter((c) => c.find).map((c) => c.index), aims = finds.filter((i) => cells[i].w >= FIND_AIM_MIN_W).map((i) => (cells[i].a + cells[i].b) / 2); // SPEC 5 tie rule: a block under 0.3 unit is never a target
  const w0 = +(ctl.w0Mult ?? 1) || 1, jm = +(ctl.jMult ?? 1);
  return { kind: 'wheel', wheel: 'find', C: F.C, rate, slices: cells.map((c) => (c.find ? 1 : 0)), widths: cells.map((c) => c.w), jackpotIndex: finds[0] || 0, golds: finds.slice(), finds, aims, cells, rows: ring, mix,
    phys: { W0: F.W0 * w0, J: FIND_J * (Number.isFinite(jm) ? jm : 1), D: F.D, SD: ctl.guide ? F.GUIDE_SD : F.SD }, mods: m, actFind: act.find };
}
/** The type a landed FIND block pays, from one draw u in [0,1) and the wheel's mix (order Coach, Coins, Player). @param {any} wheel @param {number} u */
export function findTypeAt(wheel, u) { let x = u; for (const [t, v] of wheel.mix) { if (x < v) return t; x -= v; } return wheel.mix[wheel.mix.length - 1][0]; }
/**
 * One Find big-wheel spin (stop: as spinResult: {t,phi?,e?} the player's STOP, true = careful synthetic tap, false = random). Always draws 8 numbers
 * (5 spinResult + type + 2 booster). The result is decided here, at STOP; Second Cheer is a separate free aimed spin the store runs (no re-pick here).
 * Booster: a hidden boosted cell (any cell); landing on it pays bval x 10 Coins when it is a Coins find.
 * Returns {index, type 'coins'|'player'|'coach'|null, find, second, cheered:false, boosted, coinsBonus, t, phi, e}.
 * @param {{random:()=>number}} rng @param {any} wheel @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 */
export function findWheelResult(rng, wheel, stop = false) {
  const r = spinResult(rng, wheel, stop), d = [rng.random(), rng.random(), rng.random()], m = wheel.mods || neutralMods(), cell = wheel.cells[r.index];
  const type = cell.find ? findTypeAt(wheel, d[0]) : null;
  let coinsBonus = 0, boosted = false;
  if (m.bch && d[1] < m.bch) { const bi = Math.min(wheel.cells.length - 1, Math.floor(d[2] * wheel.cells.length)); if (bi === r.index && type === 'coins') { coinsBonus = m.bval * DR.UNIT.find; boosted = true; } }
  return { index: r.index, type, find: cell.find, second: !!cell.second, cheered: false, boosted, coinsBonus, t: r.t, phi: r.phi, e: r.e };
}
