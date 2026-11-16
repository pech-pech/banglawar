// @ts-check
// Finals prize reveal in the store (S0 Z1, owner T4).
import { ECON as E } from '../../data/economy.js';
import { DR } from '../../data/dialreel.js';
import { effective, recordSpin } from '../../core/wheelmeta.js';
import { revealWheel, revealResult } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';
import { clone, on, rngFor, seasonN, wmTokensOf } from './common.js';
import { ctlOf } from './common.js';

export const finalsKey = (/** @type {any} */ s) => `${seasonN(s)}|${s.fixture.kind}|${s.fixture.round}`;
/** Command guard for FinalsSpin: result screen of a semi or final, not spun for this fixture. @param {any} s */
export const canFinalsSpin = (s) => on() && !!s.season && !!s.fixture && s.stage === 'done' && (s.fixture.kind === 'semi' || s.fixture.kind === 'final') && !(s.finalsSpin && s.finalsSpin.key === finalsKey(s));
/** One Finals reel spin: pays Coins / TP / Fans / Medal now (ledger row), keeps s.finalsSpin for a reload, recordSpin. @param {any} s */
export function finalsSpin(s) {
  const w = revealWheel('finals', modsFor(effective(s), 'finals')), r = revealResult(rngFor(s, 'finals', finalsKey(s)), w);
  const n = clone(recordSpin(s, 'finals')), row = finalsRow(s, { ...r, wheel: w });
  const { coins, tp, fans, medal } = row;
  if (n.econ) {
    n.econ.coins += coins; n.econ.fans += fans; n.econ.medals = (n.econ.medals | 0) + medal;
    n.econ.ledger.push({ k: 'finalsprize', kind: n.fixture.kind, coins, tp, fans, medals: medal });
    if (n.econ.ledger.length > E.LEDGER_MAX) n.econ.ledger.splice(0, n.econ.ledger.length - E.LEDGER_MAX);
  }
  if (tp && n.training) { n.training.tp += tp; if (n.season) n.season.tpWon += tp; }
  n.finalsSpin = row;
  return n;
}
/** The stored Finals prize (+ .src for a token). @param {any} s @param {any} r */
export function finalsRow(s, r) {
  const fx = r.fx || {};
  return { key: finalsKey(s), index: r.index, id: r.id, label: r.label, coins: fx.coins | 0, tp: fx.tp | 0, fans: fx.fans | 0, medal: fx.medal | 0, ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) };
}
/** Finals reveal props for the result screen. due = a semi/final result is showing and the prize is not spun. null otherwise. @param {any} s */
export function finalsSpinVM(s) {
  if (!on() || !s.season || !s.fixture || s.stage !== 'done' || (s.fixture.kind !== 'semi' && s.fixture.kind !== 'final')) return null;
  const fs = s.finalsSpin && s.finalsSpin.key === finalsKey(s) ? s.finalsSpin : null, w = fs && fs.src && fs.src.wheel ? fs.src.wheel : revealWheel('finals', modsFor(effective(s), 'finals'));
  return { due: !fs, cells: w.slices.map((/** @type {any} */ c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), ...ctlOf(s, 'finals'), tokens: wmTokensOf(s, 'finals'),
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
