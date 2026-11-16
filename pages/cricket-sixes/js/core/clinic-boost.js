// @ts-check
// Clinic boost + jackpot extra run (coach-weekly SPEC s6, s7, s10; CONTRACT-B s5, s6). Owner: T6.
// Called from the netsRun listener (clinic-hooks.js) on the reducer DRAFT n, which is mutated in place (hook rule).
// Boost: each boosted player's nets gain this week x (1 + sum of his pcts / 100), whole number by seeded stochastic
// rounding, then clamped to his room (cap sum, balance rule, 99). Jackpot: one extra roll at ODDS_EASY + the week's Q,
// same focus, 0 TP, never boosted, no XP; it follows room like any run and skips a player who cannot gain (no cost).
// RNG: own stream makeRng(`${seed}|clinic|${weekKey}|${playerId}`), draw 0 = boost rounding, draw 1 = jackpot roll.
// Never draws from the nets rng, so nets rolls and the frozen vectors do not change. No listeners registered here.
import { CLINIC_PCT, ODDS_EASY, CLINIC_SLICES } from '../data/clinic.js';
import { TRAIN2 } from '../data/training.js';
import { makeRng } from './rng.js';
import { weekKey } from './week-key.js';
import { stepOfRaw } from './letters.js';
import { drillRoom, focusRating, findPlayer, planOf, netsQuality, coachQuality } from './training.js';

const KINDS = /** @type {const} */ (['S', 'M', 'L', 'JP']);
const PCT_SET = new Set(Object.values(CLINIC_PCT));
const WORDS = ['Okay', 'Good', 'Great'];
const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** Boost percent of a slice kind: S 5, M 10, L 20; JP and unknown 0 (JP is the extra run). @param {any} kind */
export function boostPctFor(kind) { return Object.prototype.hasOwnProperty.call(CLINIC_PCT, kind) ? CLINIC_PCT[/** @type {'S'|'M'|'L'} */ (kind)] : 0; }

/** Clean boost entry {pcts:int[], extraRun:bool}: drops pcts that are not a Clinic percent; bad input = empty entry. @param {any} e */
export function normBoost(e) {
  const pcts = isObj(e) && Array.isArray(e.pcts) ? e.pcts.filter((/** @type {any} */ v) => PCT_SET.has(v)) : [];
  return { pcts, extraRun: isObj(e) && e.extraRun === true };
}

/** Stack a landed slice kind onto a player's boost entry (pure, new object). Pcts add (two spins, one player); JP sets extraRun. @param {any} entry @param {any} kind */
export function stackBoost(entry, kind) {
  const e = normBoost(entry);
  if (kind === 'JP') return { pcts: e.pcts, extraRun: true };
  const pct = boostPctFor(kind);
  return pct > 0 ? { pcts: [...e.pcts, pct], extraRun: e.extraRun } : e;
}

/** Sum of a boost entry's pcts. @param {any} entry */
export const boostSum = (entry) => normBoost(entry).pcts.reduce((a, b) => a + b, 0);

/** Fresh stats block (CONTRACT-B s1). */
export const emptyStats = () => ({ slices: { S: 0, M: 0, L: 0, JP: 0 }, boostedGain: 0, jackpotRuns: 0, pointsGross: 0, netGain: 0 });
/** Clean a stats block: non-finite or negative numbers read 0. @param {any} st */
export function normStats(st) {
  const o = emptyStats(), num = (/** @type {any} */ v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (!isObj(st)) return o;
  for (const k of KINDS) o.slices[k] = num(isObj(st.slices) ? st.slices[k] : 0);
  o.boostedGain = num(st.boostedGain); o.jackpotRuns = num(st.jackpotRuns); o.pointsGross = num(st.pointsGross); o.netGain = num(st.netGain);
  return o;
}
/** The draft's stats block, cleaned and attached (creates n.clinic when missing). @param {any} n */
function statsOf(n) { if (!isObj(n.clinic)) n.clinic = {}; n.clinic.stats = normStats(n.clinic.stats); return n.clinic.stats; }

/** Count one landed slice in clinic.stats.slices (for the STOP save; applyBoost never counts slices). @param {any} n @param {any} kind */
export function countSlice(n, kind) { if (!(kind in CLINIC_SLICES)) return n; statsOf(n).slices[/** @type {'S'|'M'|'L'|'JP'} */ (kind)] += 1; return n; }

/** This week's boost map, or {} when the clinic block is missing or belongs to another week (SPEC s9). @param {any} n */
export function boostsOf(n) {
  const c = n && n.clinic;
  if (!isObj(c) || c.week !== weekKey(n) || !isObj(c.boost)) return {};
  return c.boost;
}

/** The player's own Clinic stream (CONTRACT-B s5). @param {any} n @param {string} playerId @param {number} [wk] */
export const clinicRng = (n, playerId, wk = weekKey(n)) => makeRng(`${(n && n.seed) || 'sixes'}|clinic|${wk}|${playerId}`);

/**
 * gain x (1 + pct/100), whole number by stochastic rounding with draw u in [0,1): floor + 1 with chance = fraction.
 * Integer math (gain*(100+pct)) so 1 x 1.05 has fraction exactly 0.05. @param {number} gain @param {number} pct @param {number} u
 */
export function roundBoost(gain, pct, u) {
  const g = Math.max(0, Math.trunc(gain) || 0), p = Math.max(0, Math.trunc(pct) || 0);
  const num = g * (100 + p), whole = Math.floor(num / 100), frac = num - whole * 100;
  return whole + (u * 100 < frac ? 1 : 0);
}

/** Jackpot odds: ODDS_EASY with the week's Q (Okay -Q, Good/Great +Q/2), Balanced halves Good/Great, as effortOdds. @param {number} q @param {boolean} balanced */
export function jackpotOdds(q = 0, balanced = false) {
  const qq = Number.isFinite(q) ? q : 0;
  let ok = Math.max(0, ODDS_EASY.okay - qq), g = ODDS_EASY.good + qq / 2, t = ODDS_EASY.great + qq / 2;
  if (balanced) { g *= TRAIN2.balancedGG; t *= TRAIN2.balancedGG; ok = 100 - g - t; }
  const sum = ok + g + t; return { okay: ok * 100 / sum, good: g * 100 / sum, great: t * 100 / sum };
}

/**
 * Apply this week's boosts to the main nets lines (draft n mutated in place; lines are the runNets line objects).
 * Per boosted player with a line: base = toRaw - fromRaw (his main gain this week), target = roundBoost(base, sum),
 * extra = min(target - base, room left). The player's rating, line.toRaw, line.breakthrough and line.clinic change.
 * A boosted player without a line, or with no room, gains nothing and pays nothing (wasted, SPEC s7).
 * Idempotent: a line that already carries line.clinic is skipped. Returns [{playerId, pct, base, target, extra}].
 * @param {any} n @param {any[]} lines
 */
export function applyBoost(n, lines) {
  const out = [], boosts = boostsOf(n), wk = weekKey(n);
  if (!Array.isArray(lines)) return out;
  const st = statsOf(n);
  for (const line of lines) {
    if (!isObj(line) || line.clinic) continue;
    const b = normBoost(boosts[line.id]), pct = boostSum(b);
    if (!pct && !b.extraRun) continue;
    line.clinic = { pcts: b.pcts.slice(), pct, extra: 0 };
    if (!pct) continue;
    const p = findPlayer(n, line.id), rating = line.rating;
    if (!p || typeof rating !== 'string' || !Number.isFinite(p[rating])) continue;
    const base = Math.max(0, (line.toRaw | 0) - (line.fromRaw | 0));
    const u = clinicRng(n, line.id, wk).random(); // draw 0: rounding (always drawn, so draw 1 is fixed for the jackpot)
    const target = roundBoost(base, pct, u), want = Math.max(0, target - base);
    const extra = Math.max(0, Math.min(want, drillRoom(p, rating).room));
    p[rating] += extra; line.toRaw = p[rating];
    if (extra > 0 && stepOfRaw(line.toRaw) > stepOfRaw(line.fromRaw)) line.breakthrough = true;
    line.clinic.extra = extra;
    st.pointsGross += want; st.boostedGain += extra; st.netGain += extra;
    out.push({ playerId: line.id, pct, base, target, extra });
  }
  return out;
}

/**
 * Jackpot extra runs: one per player whose boost entry has extraRun, right after the main run (and the boost).
 * Needs that player's main line this week (he trained; a TP-short or skipped player gets no free run). Rolls at
 * jackpotOdds(q, focus bal) on his focus stat (re-read, lowest of the set), clamped to room; no room = skipped, no cost,
 * nothing refunded. Not boosted, 0 TP, no XP, no drillsHere count. Result stored on line.clinic.extraRun
 * {rating, stat, fromRaw, toRaw, rolled, gain, word} or {skipped:true}. Idempotent per line.
 * info (optional, the netsRun info): {q, plan:{focus}, lines}; missing -> n.training.last.lines, planOf(n), netsQuality+coachQuality.
 * Returns [{playerId, rolled, gain, skipped}].
 * @param {any} n @param {{q?:number, plan?:{focus?:string}, lines?:any[]}} [info]
 */
export function jackpotRun(n, info = {}) {
  const out = [], boosts = boostsOf(n), wk = weekKey(n);
  const lines = Array.isArray(info.lines) ? info.lines : (n.training && n.training.last && n.training.last.lines) || [];
  const focus = (info.plan && info.plan.focus) || planOf(n).focus;
  const q = Number.isFinite(info.q) ? /** @type {number} */ (info.q) : netsQuality(n) + coachQuality(n);
  const odds = jackpotOdds(q, focus === 'bal');
  const st = statsOf(n);
  for (const line of lines) {
    if (!isObj(line)) continue;
    const b = normBoost(boosts[line.id]);
    if (!b.extraRun) continue;
    if (!line.clinic) line.clinic = { pcts: b.pcts.slice(), pct: boostSum(b), extra: 0 };
    if (line.clinic.extraRun) continue; // already run
    const p = findPlayer(n, line.id);
    if (!p) { line.clinic.extraRun = { skipped: true }; out.push({ playerId: line.id, rolled: 0, gain: 0, skipped: true }); continue; }
    const rating = focusRating(p, focus), room = drillRoom(p, rating).room;
    if (room <= 0) { line.clinic.extraRun = { skipped: true }; out.push({ playerId: line.id, rolled: 0, gain: 0, skipped: true }); continue; }
    const rng = clinicRng(n, line.id, wk); rng.random(); // skip draw 0 (boost rounding)
    const x = rng.random() * 100, rolled = x < odds.okay ? 1 : x < odds.okay + odds.good ? 2 : 3;
    const from = p[rating], gain = Math.min(rolled, room);
    p[rating] = from + gain;
    line.clinic.extraRun = { rating, stat: TRAIN2.statNames[rating], fromRaw: from, toRaw: p[rating], rolled, gain, word: WORDS[rolled - 1] };
    st.jackpotRuns += 1; st.pointsGross += rolled; st.netGain += gain;
    out.push({ playerId: line.id, rolled, gain, skipped: false });
  }
  return out;
}
