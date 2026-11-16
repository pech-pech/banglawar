// @ts-check
// Scout list reveal in the store (S0 Z1, owner T4).
import { effective, recordSpin } from '../../core/wheelmeta.js';
import { revealWheel, revealResult } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';
import { clone, on, rngFor, seasonN, wmTokensOf } from './common.js';
import { ctlOf } from './common.js';

/** Command guard for ScoutSpin: flag, the list is still open, not spun this season. @param {any} s @param {()=>any[]} list */
export const canScoutSpin = (s, list) => on() && !!s.season && !(s.scoutSpin && s.scoutSpin.n === seasonN(s)) && list().length > 0;
/** One Scout spin: stores s.scoutSpin {n,index,id,steps,extra} (scoutList in core/training.js reads it) + recordSpin. @param {any} s */
export function scoutSpin(s) {
  const w = revealWheel('scout', modsFor(effective(s), 'scout')), r = revealResult(rngFor(s, 'scout', String(seasonN(s))), w);
  const n = clone(recordSpin(s, 'scout'));
  n.scoutSpin = scoutRow(s, { ...r, wheel: w });
  return n;
}
/** The stored Scout result (+ .src for a token). @param {any} s @param {any} r */
export const scoutRow = (s, r) => ({ n: seasonN(s), index: r.index, id: r.id, steps: +r.fx.steps || 0, extra: +r.fx.extraName || 0, ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) });
/** Scout reveal props. spun = already spun this season. @param {any} s */
export function scoutSpinVM(s) {
  if (!on() || !s.season) return null;
  const w = revealWheel('scout', modsFor(effective(s), 'scout')), sp = s.scoutSpin && s.scoutSpin.n === seasonN(s) ? s.scoutSpin : null;
  const g = sp && sp.src && sp.src.wheel ? sp.src.wheel : w; // the wheel that was spun (a token re-spins that one)
  return { cells: g.slices.map((/** @type {any} */ c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), spun: !!sp, ...ctlOf(s, 'scout'), tokens: wmTokensOf(s, 'scout'),
    pending: sp ? { index: sp.index, steps: sp.steps, extra: sp.extra, jackpot: sp.id === 'top2', lifted: !!sp.lifted } : null };
}
