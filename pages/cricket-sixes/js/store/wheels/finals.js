// @ts-check
// Finals prize reveal in the store (S0 Z1, owner T4).
import { ECON as E } from '../../data/economy.js';
import { DR } from '../../data/dialreel.js';
import { effective, recordSpin } from '../../core/wheelmeta.js';
import { revealResult } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';
import { finalsWheel, finalsRing, FINALS_MULT } from '../../core/wheels/finals.js';
import { clone, on, rngFor, wmTokensOf, stopOf, medianOf } from './common.js';
import { recordStop, spinKeyOf } from '../../core/wheel-stops.js';
import { ctlOf } from './common.js';

/** The Coin / Fans multipliers on the Finals prize: none exist today (the old reel paid fx raw), so x1. One place to change if one is ever added. @param {any} _s */
export const finalsMult = (_s) => FINALS_MULT;
/** The 12-slice Finals wheel for this save (tree applied, labels = paid amounts). @param {any} s */
export const finalsWheelOf = (s) => finalsWheel(modsFor(effective(s), 'finals'), finalsMult(s));

/** Old seam, kept so callers compile: recordStop / spinKeyOf are imported from js/core/wheel-stops.js now, nothing to wire. @param {any} [_h] */
export const wireStops = (_h) => {};

/** The result AT STOP: sliceId (the view's STOP slice) pins the slice, else the seeded width-weighted draw. Same 6 draws as revealResult. @param {{random:()=>number}} rng @param {any} wheel @param {any} [sliceId] */
export function finalsResultAt(rng, wheel, sliceId) {
  if (!Number.isInteger(sliceId) || sliceId < 0 || sliceId >= wheel.slices.length) return revealResult(rng, wheel);
  const c = wheel.slices[sliceId]; let first = true;
  return revealResult({ random: () => { const v = rng.random(); if (first) { first = false; return ((c.a + c.b) / 2) / wheel.total; } return v; } }, wheel);
}

/** season|kind|round (semi and final each spin once): thin wrapper of spinKeyOf(s, 'finals'). */
export const finalsKey = (/** @type {any} */ s) => spinKeyOf(s, 'finals');
/** Command guard for FinalsSpin: result screen of a semi or final, not spun for this fixture. @param {any} s */
export const canFinalsSpin = (s) => on() && !!s.season && !!s.fixture && s.stage === 'done' && (s.fixture.kind === 'semi' || s.fixture.kind === 'final') && !(s.finalsSpin && s.finalsSpin.key === finalsKey(s));
/** One Finals reel spin: pays Coins / TP / Fans / Medal now (ledger row), keeps s.finalsSpin for a reload, recordSpin. @param {any} s */
export function finalsSpin(s, p) {
  const w = finalsWheelOf(s), st = p && p.stop && typeof p.stop === 'object' ? p.stop : null, r = finalsResultAt(rngFor(s, 'finals', finalsKey(s)), w, st ? st.sliceId : undefined);
  const n = clone(recordSpin(s, 'finals')), row = finalsRow(s, { ...r, wheel: w });
  const { coins, tp, fans, medal } = row;
  if (n.econ) {
    n.econ.coins += coins; n.econ.fans += fans; n.econ.medals = (n.econ.medals | 0) + medal;
    n.econ.ledger.push({ k: 'finalsprize', kind: n.fixture.kind, coins, tp, fans, medals: medal });
    if (n.econ.ledger.length > E.LEDGER_MAX) n.econ.ledger.splice(0, n.econ.ledger.length - E.LEDGER_MAX);
  }
  if (tp && n.training) { n.training.tp += tp; if (n.season) n.season.tpWon += tp; }
  n.finalsSpin = row;
  { // synchronous with the result, same dispatch (CONTRACT-A sec 7); stopOf keeps the old careful / random payloads working
    const o = /** @type {any} */ (stopOf(p)) || {}, c = w.slices[r.index], t = Number.isFinite(o.t) ? o.t : 0;
    recordStop(n, 'finals', spinKeyOf(s, 'finals', { key: row.key }),
      { stopT: Math.round(Number.isFinite(st && st.stopT) ? st.stopT : t * 1000), cycle: Math.max(1, (st && st.cycle) | 0 || 1), tInCycle: Number.isFinite(st && st.tInCycle) ? st.tInCycle : t,
        sliceId: r.index, value: c.value, paid: row.paid, auto: !st, respin: st && st.respin ? 1 : 0 }, { median: medianOf(w.slices.map((/** @type {any} */ x) => x.value)) });
  }
  return n;
}
/** The stored Finals prize (+ .src for a token). @param {any} s @param {any} r */
export function finalsRow(s, r) {
  const fx = r.fx || {}, c = r.wheel && r.wheel.slices && r.wheel.slices[r.index], k = c && c.type ? ({ Coins: 'coins', TP: 'tp', Fans: 'fans', Medal: 'medal' })[/** @type {'Coins'} */ (c.type)] : null;
  return { key: finalsKey(s), sliceId: r.index, paid: k ? fx[k] | 0 : 0, index: r.index, id: r.id, label: r.label, coins: fx.coins | 0, tp: fx.tp | 0, fans: fx.fans | 0, medal: fx.medal | 0, ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) };
}
/** Finals reveal props for the result screen. due = a semi/final result is showing and the prize is not spun. null otherwise. @param {any} s */
export function finalsSpinVM(s) {
  if (!on() || !s.season || !s.fixture || s.stage !== 'done' || (s.fixture.kind !== 'semi' && s.fixture.kind !== 'final')) return null;
  const fs = s.finalsSpin && s.finalsSpin.key === finalsKey(s) ? s.finalsSpin : null, w = fs && fs.src && fs.src.wheel ? fs.src.wheel : finalsWheelOf(s);
  return { due: !fs, ring: w.slices[0] && w.slices[0].type ? finalsRing(w) : null, cells: w.slices.map((/** @type {any} */ c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), ...ctlOf(s, 'finals'), tokens: wmTokensOf(s, 'finals'),
    pending: fs ? { index: fs.index, label: fs.label, coins: fs.coins, tp: fs.tp, fans: fs.fans, medal: fs.medal, jackpot: fs.medal > 0, lifted: !!fs.lifted, ...finalsWhy(fs, w) } : null };
}
/** wa1 fixreel (QA V7): why the prize differs from the cell. base = the cell's Coins/TP/Fans (+ Booster Coins) before Prize Pair; pair = Prize Pair owned (x1.5, never Medals);
 * lift = Coins a Lucky Lift added (paid - cell x Pair). @param {any} fs @param {any} w */
function finalsWhy(fs, w) {
  const c = w && w.slices && w.slices[fs.index], m = (w && w.mods) || {}; if (!c) return {};
  const fx = c.fx || {}, base = { coins: (fx.coins | 0) + (fs.src && fs.src.boosted ? (m.bval || 1) * DR.UNIT.finals : 0), tp: fx.tp | 0, fans: fx.fans | 0 };
  const pair = !!m.nb && !(fx.medal > 0) && (base.coins + base.tp + base.fans > 0), x = (/** @type {number} */ v) => (pair && v ? Math.floor(v * 1.5 + 0.5) : v);
  const lift = fs.lifted ? Math.max(0, (fs.coins | 0) - x(base.coins)) : 0;
  return { base, pair, lift };
}
