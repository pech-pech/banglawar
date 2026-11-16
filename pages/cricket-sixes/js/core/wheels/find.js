// @ts-check
// Find slot reel (aimable), pity find and the Find big wheel. Pure: every roll uses the rng handed in. S0 Z1 split of js/core/dialreel.js (owner T4).
import { DR } from '../../data/dialreel.js';
import { FIND_WHEEL } from '../../data/dialreel.js'; // wa1 find: Find big wheel
import { spinResult } from '../training.js'; // wa1 find: Find big wheel physics
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
  for (const c of fc) { if (x < c.w) return { index: c.index, type: c.type }; x -= c.w; }
  const c = fc[fc.length - 1]; return { index: c.index, type: c.type };
}

// ---------------------------------------------------------------- Find big wheel (wa1 slice A, agent "find")
/**
 * Find big wheel for an activity {find: percent, mix} (SPEC 2026-11-14 s1 + s3a, sim/find_fast_sim.py). C = 10 units: BLOCKS equal find blocks (total
 * width = find rate x C) each followed by an equal Nothing gap. Tree: every block + goldAdd (Widener) + rareAdd (Sharp Eyes); Extra Gold = one more block
 * (EXTRA_W x a block) with its own gap, the gaps shrink so C stays 10. Inside a block the types split by the mix (order Coach, Coins, Player).
 * Control ctl {w0Mult, jMult, guide}: phys W0 = 36 x w0Mult, J = 0.8 x jMult, D = 2.0, SD = 0.11 (0.08 with Aim Guide). Big-wheel shape for training.js
 * spinResult: slices (1 find, 0 Nothing), widths, jackpotIndex, golds [] (no jackpot block: a find is not a "gold" for tokens), finds (find slice indices),
 * aims (block centres = careful targets), phys; plus cells [{index,type,find,block,w,a,b}] and mods.
 * @param {{find:number,mix:Record<string,number>}} act @param {any} [mods] @param {{w0Mult?:number,jMult?:number,guide?:boolean}} [ctl]
 */
export function findWheel(act, mods = neutralMods(), ctl = {}) {
  const F = FIND_WHEEL, m = { ...neutralMods(), ...mods }, f = clamp((act.find || 0) / 100, 0, 1);
  /** @type {any[]} */ let sh = Object.entries(act.mix || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, v]);
  if (!sh.length) sh = [['coins', 1]];
  const shTot = sum(sh.map((x) => x[1])); sh = sh.map(([k, v]) => [k, v / shTot]).sort((a, b) => F.ORDER.indexOf(a[0]) - F.ORDER.indexOf(b[0]));
  const bw = f * F.C / F.BLOCKS + (m.goldAdd || 0) + (m.rareAdd || 0), nx = Math.max(0, m.extra | 0);
  const blocks = Array.from({ length: F.BLOCKS }, () => bw).concat(Array.from({ length: nx }, () => bw * F.EXTRA_W));
  /** @type {any[]} */ const raw = [];
  const gap = Math.max(0, (F.C - sum(blocks)) / blocks.length);
  blocks.forEach((w, bi) => { for (const [type, v] of sh) raw.push({ type, find: true, block: bi, w: w * v }); if (gap > 0) raw.push({ type: 'nothing', find: false, block: -1, w: gap }); });
  const tot = sum(raw.map((c) => c.w)); let x = 0;
  const cells = raw.map((c, i) => { const w = F.C * c.w / tot, a = x; x += w; return { index: i, type: c.type, find: c.find, block: c.block, second: c.block >= F.BLOCKS, w, a, b: x }; });
  cells[cells.length - 1].b = F.C;
  const aims = blocks.map((_, bi) => { const bc = cells.filter((c) => c.block === bi); return (bc[0].a + bc[bc.length - 1].b) / 2; });
  const finds = cells.filter((c) => c.find).map((c) => c.index), w0 = +(ctl.w0Mult ?? 1) || 1, jm = +(ctl.jMult ?? 1);
  return { kind: 'wheel', wheel: 'find', C: F.C, slices: cells.map((c) => (c.find ? 1 : 0)), widths: cells.map((c) => c.w), jackpotIndex: finds[0] || 0, golds: [], finds, aims, cells,
    phys: { W0: F.W0 * w0, J: F.J * (Number.isFinite(jm) ? jm : 1), D: F.D, SD: ctl.guide ? F.GUIDE_SD : F.SD }, mods: m, actFind: act.find };
}
/**
 * One Find big-wheel spin (stop: as spinResult: {t,phi?,e?} the player's STOP, true = careful synthetic tap, false = random). Always draws 8 numbers
 * (5 spinResult + cheer + 2 booster). Second Cheer: a Nothing landing gets one more random pick by width. Booster: a hidden boosted cell (any cell);
 * landing on it pays bval x 10 Coins when it is a Coins find. Returns {index, type, find, second, boosted, coinsBonus, t, phi, e}.
 * @param {{random:()=>number}} rng @param {any} wheel @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 */
export function findWheelResult(rng, wheel, stop = false) {
  const r = spinResult(rng, wheel, stop), d = [rng.random(), rng.random(), rng.random()], m = wheel.mods || neutralMods();
  let cell = wheel.cells[r.index], second = false;
  const cheered = !cell.find && !!m.cheer; // wa1 findtune: the free re-spin was used (found or not); the store caps it at 1 a season
  if (cheered) { const c2 = wheel.cells[cellAt(wheel.cells, d[0] * wheel.C)]; if (c2.find) { cell = c2; second = true; } }
  let coinsBonus = 0, boosted = false;
  if (m.bch && d[1] < m.bch) { const bi = Math.min(wheel.cells.length - 1, Math.floor(d[2] * wheel.cells.length)); if (bi === r.index && cell.type === 'coins' && !second) { coinsBonus = m.bval * DR.UNIT.find; boosted = true; } }
  return { index: r.index, type: cell.find ? cell.type : null, find: cell.find, second, cheered, boosted, coinsBonus, t: r.t, phi: r.phi, e: r.e };
}
