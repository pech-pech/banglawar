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
    pending: sp ? { index: sp.index, steps: sp.steps, extra: sp.extra, jackpot: sp.id === 'top2', lifted: !!sp.lifted } : null,
    // new wheel (SPEC 9): ring rows, the 10 cards, the stored stop (a reload opens on it, never re-spins). Additive; old fields above unchanged.
    wheelId: 'scout', spinKey: scoutSeasonId(s), ring: SCOUT_SLICES.map((c) => ({ ...c })), cards: scoutCardsOf(s).map((c) => ({ ...c })),
    stored: scoutSliceRow(s) ? { sliceId: scoutSliceRow(s).sliceId, value: scoutSliceRow(s).value, card: { ...scoutSliceRow(s).card }, tokUsed: scoutSliceRow(s).tokUsed | 0 } : null };
}

// ---------------------------------------------------------------- new Scout wheel (SPEC 9, 11a, 13; T4 wave 2)
// Cards = makeScoutCards (one per slice), stored in wheels.scoutCards[seasonId]. The result is decided at STOP from SCOUT_SLICES (stop.sliceId, sent by
// the view) and written at once to s.scoutSpin + wheels.stops.scout[seasonId], so a reload shows the same slice. The old reveal path (no stop.sliceId) is kept.
import { makeScoutCards } from '../../core/scout-cards.js';
import { SCOUT_SLICES } from '../../data/wheels/scout.js';
import { scoutSliceId, scoutIsGold, scoutKeep, scoutNudge } from '../../core/wheels/scout.js';
import { STEPS } from '../../core/letters.js';
const stepOfLetter = (/** @type {string} */ g) => { const r = STEPS.find((x) => x.letter === g); return r ? r.step : 1; };

export const scoutSeasonId = (/** @type {any} */ s) => String(seasonN(s)); // CONTRACT-A lead call 5: seasonIdOf (js/core/spin-keys.js) not landed; same value, stubbed
const leagueOf = (/** @type {any} */ s) => Math.min(5, Math.max(1, (s.season && s.season.league) || (s.run && s.run.league) || 1));
/** This season's 10 cards: the stored ones, else regenerated from the season seed (same generator, so identical). Never writes. @param {any} s */
export function scoutCardsOf(s) {
  const st = s && s.wheels && s.wheels.scoutCards && s.wheels.scoutCards[scoutSeasonId(s)];
  return Array.isArray(st) && st.length === SCOUT_SLICES.length ? st : makeScoutCards(s.seed, seasonN(s), leagueOf(s));
}
/** Store this season's cards on the draft `n` if missing (season start / first use). @param {any} n */
export function ensureScoutCards(n) {
  const w = n.wheels && typeof n.wheels === 'object' ? n.wheels : (n.wheels = {});
  const sc = w.scoutCards && typeof w.scoutCards === 'object' ? w.scoutCards : (w.scoutCards = {}), k = scoutSeasonId(n);
  if (!Array.isArray(sc[k]) || sc[k].length !== SCOUT_SLICES.length) sc[k] = makeScoutCards(n.seed, seasonN(n), leagueOf(n));
  return sc[k];
}

// recordStop: CONTRACT-A sec 7 / lead call 9 = recordStop(n, wheelId, spinKey, rec) in js/core/wheel-stops.js (T1/S0). That file is NOT in the tree yet, so
// a local writer with the sec 6/7 shape is the default; wheel-stops.js (or the app) swaps in the real one with setRecordStop.
/** @type {(n:any, wheelId:string, spinKey:string, rec:any) => any} */
let recordStopFn = (n, wheelId, spinKey, rec) => {
  const w = n.wheels && typeof n.wheels === 'object' ? n.wheels : (n.wheels = {});
  const by = w.stops && typeof w.stops === 'object' ? w.stops : (w.stops = {});
  const wh = by[wheelId] && typeof by[wheelId] === 'object' ? by[wheelId] : (by[wheelId] = {});
  const e = wh[spinKey] || (wh[spinKey] = { stops: [], kept: 0, spent: false }), { kept, spent, ...r } = rec;
  e.stops.push(r);
  if (kept != null) e.kept = kept; else if (r.value > e.stops[e.kept | 0].value) e.kept = e.stops.length - 1; // higher keeps, tie keeps the first
  if (spent != null) e.spent = !!spent;
  const st = w.stats && typeof w.stats === 'object' ? w.stats : (w.stats = {});
  const a = st[wheelId] || (st[wheelId] = { n: 0, careful: 0, early: 0, late: 0, taps: [] });
  a.n++;
  if (!r.auto) { if (r.value > 0.5) a.careful++; if (r.tInCycle < 3.2) a.early++; if (r.tInCycle > 3.8) a.late++; a.taps.push({ cycle: r.cycle, tInCycle: r.tInCycle }); if (a.taps.length > 200) a.taps.splice(0, a.taps.length - 200); }
  return n;
};
/** Swap in the shared recordStop. @param {typeof recordStopFn} fn */
export const setRecordStop = (fn) => { if (typeof fn === 'function') recordStopFn = fn; };

const recOf = (/** @type {any} */ stop, /** @type {number} */ sliceId, /** @type {number} */ respin) => ({
  stopT: Math.max(0, Math.round(+stop.stopT || 0)), cycle: Math.max(1, stop.cycle | 0 || 1), tInCycle: +stop.tInCycle || 0, sliceId, value: SCOUT_SLICES[sliceId].value, auto: !!stop.auto, respin });
const rowOfSlice = (/** @type {any} */ s, /** @type {number} */ id, /** @type {any} */ cards, /** @type {any} */ extra) => ({
  n: seasonN(s), index: id, id: SCOUT_SLICES[id].gold ? 'top2' : 'slice', steps: 0, extra: 0, sliceId: id, value: SCOUT_SLICES[id].value, card: { ...cards[id] }, tokUsed: 0, ...extra });

/** Does the payload carry a new-wheel STOP (a valid sliceId)? @param {any} p */
export const isSliceStop = (p) => !!(p && p.stop && typeof p.stop === 'object' && scoutSliceId(p.stop.sliceId) >= 0);
/**
 * ScoutSpin on the new wheel: p.stop = {sliceId, stopT, cycle, tInCycle, auto?}. Decided here, stored, recorded. Same s when not allowed (guard is canScoutSpin).
 * @param {any} s @param {any} p
 */
export function scoutSliceSpin(s, p) {
  if (!isSliceStop(p)) return s;
  const id = scoutSliceId(p.stop.sliceId), n = clone(recordSpin(s, 'scout')); // one Spoke per spin, as before
  const cards = ensureScoutCards(n);
  n.scoutSpin = rowOfSlice(n, id, cards, {});
  recordStopFn(n, 'scout', scoutSeasonId(n), recOf(p.stop, id, 0));
  return n;
}
/** The stored Scout result row for this season, new wheel only. @param {any} s */
export const scoutSliceRow = (s) => (s && s.scoutSpin && s.scoutSpin.n === seasonN(s) && scoutSliceId(s.scoutSpin.sliceId) >= 0 ? s.scoutSpin : null);

/**
 * Token on the landed Scout slice (new wheel): at most 1 per spin, none on a gold result, none after a collected (signed / passed) list.
 * kind 'again': p.stop = the second STOP (respin 1), the higher value is kept, a tie keeps the first. kind 'nudge': a non-gold neighbour with a strictly higher value.
 * The shared pool / 2-a-season cap is NOT touched here (CONTRACT unclear: wmUseToken in wmstore.js owns it). Same s when not allowed.
 * @param {any} s @param {{kind:string, stop?:any}} p
 */
export function scoutSliceToken(s, p) {
  const r = scoutSliceRow(s); if (!r || !p || (r.tokUsed | 0) >= 1 || scoutIsGold(r.sliceId) || (s.scout && s.scout.n === seasonN(s))) return s;
  const n = clone(s), cards = ensureScoutCards(n);
  if (p.kind === 'nudge') {
    const to = scoutNudge(r.sliceId); if (to < 0) return s;
    n.scoutSpin = rowOfSlice(n, to, cards, { tokUsed: 1, nudged: true });
    return n;
  }
  if (p.kind === 'again' && isSliceStop(p)) {
    const b = scoutSliceId(p.stop.sliceId), keep = scoutKeep(r.sliceId, b);
    recordStopFn(n, 'scout', scoutSeasonId(n), { ...recOf(p.stop, b, 1), kept: keep === r.sliceId ? 0 : 1, spent: true });
    n.scoutSpin = rowOfSlice(n, keep, cards, { tokUsed: 1 });
    return n;
  }
  return s;
}

/** The landed card added as the first name: scoutList(s) (core/training.js, unchanged) with the card first. id `sc<n>-c`; step from the grade. Empty list stays empty. @param {any} s @param {any[]} list */
export function withLandedCard(s, list) {
  const r = scoutSliceRow(s); if (!r || !list.length) return list;
  return [{ id: `sc${seasonN(s)}-c`, name: r.card.surname, step: stepOfLetter(r.card.grade), strong: [r.card.focus], landed: true }, ...list];
}
