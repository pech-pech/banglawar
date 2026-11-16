// @ts-check
// Scout list reveal in the store (S0 Z1, owner T4).
import { effective, recordSpin } from '../../core/wheelmeta.js';
import { revealWheel, revealResult } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';
import { clone, on, rngFor, seasonN, wmTokensOf, medianOf } from './common.js';
import { recordStop, storedStop } from '../../core/wheel-stops.js';
import { seasonIdOf } from '../../core/spin-keys.js';
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
    wheelId: 'scout', spinKey: scoutSeasonId(s), ring: scoutRingOf(s).map((c) => ({ ...c })), cards: scoutCardsOf(s).map((c) => ({ ...c })),
    stored: scoutSliceRow(s) ? storedStop(s, 'scout', scoutSeasonId(s)) : null };
}

// ---------------------------------------------------------------- new Scout wheel (SPEC 9, 11a, 13; T4 wave 2)
// Cards = makeScoutCards (one per slice), stored in wheels.scoutCards[seasonId]. The result is decided at STOP from SCOUT_SLICES (stop.sliceId, sent by
// the view) and written at once to s.scoutSpin + wheels.stops.scout[seasonId], so a reload shows the same slice. The old reveal path (no stop.sliceId) is kept.
import { makeScoutCards } from '../../core/scout-cards.js';
import { SCOUT_SLICES } from '../../data/wheels/scout.js';
import { stopConsistent, scoutRingFor } from '../../core/wheels/scout.js';
import { STEPS } from '../../core/letters.js';
const stepOfLetter = (/** @type {string} */ g) => { const r = STEPS.find((x) => x.letter === g); return r ? r.step : 1; };

/** THE Scout ring for this state: scoutRingFor(tree mods) (Widener / Extra Gold, SPEC 11b). No tree nodes owned = SCOUT_SLICES exactly. The landed slice index is an index into THIS ring
 *  (the same ring scoutSpinVM hands the view). @param {any} s */
export const scoutRingOf = (s) => scoutRingFor(modsFor(effective(s), 'scout'));
const idIn = (/** @type {any[]} */ ring, /** @type {any} */ x) => (Number.isInteger(x) && x >= 0 && x < ring.length ? x : -1);
/** Slice id check; without s the bound is the widest ring (10 + 1 Extra Gold) and scoutSliceSpin re-checks against the real ring. */
const sliceIdOf = (/** @type {any} */ x, /** @type {any} */ s) => (s ? idIn(scoutRingOf(s), x) : (Number.isInteger(x) && x >= 0 && x <= SCOUT_SLICES.length ? x : -1));
const goldIn = (/** @type {any[]} */ ring, /** @type {number} */ id) => !!(ring[id] && ring[id].gold);
const keepIn = (/** @type {any[]} */ ring, /** @type {number} */ a, /** @type {number} */ b) => (ring[b].value > ring[a].value ? b : a);
/** Nudge target on the live ring: a non-gold neighbour (wraps) with a strictly higher value; both = higher value, then the first. -1 = none. */
function nudgeIn(/** @type {any[]} */ ring, /** @type {number} */ id) {
  const n = ring.length, cur = ring[id]; if (!cur) return -1;
  const c = [(id + n - 1) % n, (id + 1) % n].filter((j) => !ring[j].gold && ring[j].value > cur.value);
  if (!c.length) return -1;
  return c.length === 2 && ring[c[1]].value > ring[c[0]].value ? c[1] : c[0];
}
/** Base 10 cards spread onto the ring: row i takes the card of its source slice (a second +2 piece shares the +2 card). Identity on the 10-slice ring. */
const spread = (/** @type {any[]} */ base, /** @type {any[]} */ ring) => {
  if (ring.length === base.length) return base;
  let skip = 0; // ring ids are renumbered in ring order, so walk it: a `second` piece repeats the +2 card (base[0]), every other row advances the source index
  return ring.map((r, i) => { if (r.second) { skip++; return base[Math.max(0, ring.findIndex((x) => x.gold && !x.second))]; } return base[i - skip]; });
};

export const scoutSeasonId = (/** @type {any} */ s) => seasonIdOf(s); // CONTRACT-A lead call 5: the shared seasonIdOf
const leagueOf = (/** @type {any} */ s) => Math.min(5, Math.max(1, (s.season && s.season.league) || (s.run && s.run.league) || 1));
/** This season's 10 cards: the stored ones, else regenerated from the season seed (same generator, so identical). Never writes. @param {any} s */
export function scoutCardsOf(s) {
  const st = s && s.wheels && s.wheels.scoutCards && s.wheels.scoutCards[scoutSeasonId(s)];
  return spread(Array.isArray(st) && st.length === SCOUT_SLICES.length ? st : makeScoutCards(s.seed, seasonN(s), leagueOf(s)), scoutRingOf(s));
}
/** Store this season's cards on the draft `n` if missing (season start / first use). @param {any} n */
export function ensureScoutCards(n) {
  const w = n.wheels && typeof n.wheels === 'object' ? n.wheels : (n.wheels = {});
  const sc = w.scoutCards && typeof w.scoutCards === 'object' ? w.scoutCards : (w.scoutCards = {}), k = scoutSeasonId(n);
  if (!Array.isArray(sc[k]) || sc[k].length !== SCOUT_SLICES.length) sc[k] = makeScoutCards(n.seed, seasonN(n), leagueOf(n));
  return sc[k];
}

// recordStop is the shared one (js/core/wheel-stops.js, CONTRACT-A sec 7); careful = value above the Scout wheel median.
const SCOUT_MEDIAN = medianOf(SCOUT_SLICES.map((/** @type {any} */ x) => x.value));
/** @type {(n:any, wheelId:string, spinKey:string, rec:any) => any} */
const recordStopFn = (n, wheelId, spinKey, rec) => recordStop(n, wheelId, spinKey, rec, { median: SCOUT_MEDIAN });
/** Old seam, kept so callers compile: the shared recordStop is always used now. @param {any} [_fn] */
export const setRecordStop = (_fn) => {};

const recOf = (/** @type {any[]} */ ring, /** @type {any} */ stop, /** @type {number} */ sliceId, /** @type {number} */ respin) => ({
  stopT: Math.max(0, Math.round(+stop.stopT || 0)), cycle: Math.max(1, stop.cycle | 0 || 1), tInCycle: +stop.tInCycle || 0, sliceId, value: ring[sliceId].value, auto: !!stop.auto, respin });
const rowOfSlice = (/** @type {any[]} */ ring, /** @type {any} */ s, /** @type {number} */ id, /** @type {any} */ cards, /** @type {any} */ extra) => ({
  n: seasonN(s), index: id, id: ring[id].gold ? 'top2' : 'slice', steps: ring[id].value | 0, extra: 0, sliceId: id, value: ring[id].value, card: { ...cards[id] }, tokUsed: 0, ...extra });

/** Does the payload carry a new-wheel STOP (a valid sliceId)? @param {any} p @param {any} [s] state: checks the id against this state's ring */
export const isSliceStop = (p, s) => !!(p && p.stop && typeof p.stop === 'object' && sliceIdOf(p.stop.sliceId, s) >= 0 && stopConsistent(p.stop));
/** A stop object that is not valid: sliceId given but out of range, or timing that disagrees with itself. Rejected, never turned into a draw. @param {any} p @param {any} [s] */
export const isBadStop = (p, s) => !!(p && p.stop && typeof p.stop === 'object' && ((p.stop.sliceId != null && sliceIdOf(p.stop.sliceId, s) < 0) || !stopConsistent(p.stop)));
/** Width-weighted seeded draw on the live ring: one rng.random() (same draw as scoutAutoSlice on the 10-slice ring). */
function autoIn(/** @type {any[]} */ ring, /** @type {any} */ rng) {
  const tot = ring.reduce((a, c) => a + c.w, 0); let x = rng.random() * tot;
  for (let i = 0; i < ring.length; i++) { x -= ring[i].w; if (x < 0) return i; }
  return ring.length - 1;
}
/** Stop-less ScoutSpin (Auto / leave): a seeded width-weighted draw on SCOUT_SLICES, recorded auto:true. @param {any} s */
export const scoutAutoStop = (s) => ({ stop: { sliceId: autoIn(scoutRingOf(s), rngFor(s, 'scout', String(seasonN(s)))), stopT: 0, cycle: 1, tInCycle: 0, auto: true } });
/**
 * ScoutSpin on the new wheel: p.stop = {sliceId, stopT, cycle, tInCycle, auto?}. Decided here, stored, recorded. Same s when not allowed (guard is canScoutSpin).
 * @param {any} s @param {any} p
 */
export function scoutSliceSpin(s, p) {
  if (!isSliceStop(p, s)) return s;
  const ring = scoutRingOf(s), id = sliceIdOf(p.stop.sliceId, s), n = clone(recordSpin(s, 'scout')); // one Spoke per spin, as before
  const cards = spread(ensureScoutCards(n), ring);
  n.scoutSpin = rowOfSlice(ring, n, id, cards, {});
  recordStopFn(n, 'scout', scoutSeasonId(n), recOf(ring, p.stop, id, 0));
  return n;
}
/** The stored Scout result row for this season, new wheel only. @param {any} s */
export const scoutSliceRow = (s) => (s && s.scoutSpin && s.scoutSpin.n === seasonN(s) && sliceIdOf(s.scoutSpin.sliceId, s) >= 0 ? s.scoutSpin : null);

/**
 * Token on the landed Scout slice (new wheel): at most 1 per spin, none on a gold result, none after a collected (signed / passed) list.
 * kind 'again': p.stop = the second STOP (respin 1), the higher value is kept, a tie keeps the first. kind 'nudge': a non-gold neighbour with a strictly higher value.
 * The shared pool / 2-a-season cap is NOT touched here (CONTRACT unclear: wmUseToken in wmstore.js owns it). Same s when not allowed.
 * @param {any} s @param {{kind:string, stop?:any}} p
 */
export function scoutSliceToken(s, p) {
  const r = scoutSliceRow(s), ring = scoutRingOf(s); if (!r || !p || (r.tokUsed | 0) >= 1 || goldIn(ring, r.sliceId) || (s.scout && s.scout.n === seasonN(s))) return s;
  const n = clone(s), cards = spread(ensureScoutCards(n), ring);
  if (p.kind === 'nudge') {
    const to = nudgeIn(ring, r.sliceId); if (to < 0) return s;
    n.scoutSpin = rowOfSlice(ring, n, to, cards, { tokUsed: 1, nudged: true });
    return n;
  }
  if (p.kind === 'again' && isSliceStop(p, s)) {
    const b = sliceIdOf(p.stop.sliceId, s), keep = keepIn(ring, r.sliceId, b);
    recordStopFn(n, 'scout', scoutSeasonId(n), { ...recOf(ring, p.stop, b, 1), kept: keep === r.sliceId ? 0 : 1, spent: true });
    n.scoutSpin = rowOfSlice(ring, n, keep, cards, { tokUsed: 1 });
    return n;
  }
  return s;
}

/** The landed card added as the first name: scoutList(s) (core/training.js, unchanged) with the card first. id `sc<n>-c`; step from the grade. Empty list stays empty. @param {any} s @param {any[]} list */
export function withLandedCard(s, list) {
  const r = scoutSliceRow(s); if (!r || !list.length) return list;
  return [{ id: `sc${seasonN(s)}-c`, name: r.card.surname, step: stepOfLetter(r.card.grade), strong: [r.card.focus], landed: true }, ...list];
}
