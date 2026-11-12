// @ts-check
// Training rolls, drill room (cap, balance, 99), grade reveal, coach XP, week end. Pure and seeded:
// every function takes the state (and an rng that doDrill draws ONE number from) and returns a new state.
// An invalid command returns the SAME state object. No Math.random, Date or DOM.
import { DRILLS, ODDS, COACHES } from '../data/training.js';
import { capSum, bandOf, isHidden } from './ability.js';

export const DRILL_IDS = DRILLS.list.map((d) => d.id);
export const TP_PER_DRILL = DRILLS.costTp;
const RATINGS = ['bp', 'bs', 'spd', 'bsk'];

/** @param {string} id */
export const drillDef = (id) => DRILLS.list.find((d) => d.id === id) || null;

/** Okay/Good/Great percentages for a Nets level (1..5) and the best matching coach focus level (0..5). Table rows from tuning.json. */
export function drillOdds(nets, coachLevelN) {
  const n = Math.min(5, Math.max(1, nets | 0)), c = Math.min(5, Math.max(0, coachLevelN | 0));
  const r = ODDS.table.find((x) => x.nets === n && x.coach === c);
  return { okay: r.okay, good: r.good, great: r.great };
}
/** x in [0,100). Okay if x < okay, Good if x < okay+good, else Great. */
export function rollOutcome(odds, x) {
  const i = x < odds.okay ? 0 : x < odds.okay + odds.good ? 1 : 2;
  return { outcome: DRILLS.outcomes[i], gain: DRILLS.gains[i] };
}
/** One draw: rng.random(). */
export function rollDrill(rng, nets, coachLevelN) {
  const odds = drillOdds(nets, coachLevelN); const x = rng.random() * 100;
  return { odds, x, ...rollOutcome(odds, x) };
}

const staff = (coaches) => (coaches || []).filter((c) => !c.candidate && !(c.away > 0));
/** Level of the best staff coach in a focus (0 = nobody has it). */
export function coachLevel(coaches, focus) { return staff(coaches).reduce((m, c) => Math.max(m, c.lv?.[focus] || 0), 0); }
/** Best matching coach for a focus: highest level, then most XP, then first. Level 0 never helps. */
export function bestCoach(coaches, focus) {
  let best = null;
  for (const c of staff(coaches)) {
    const L = c.lv?.[focus] || 0; if (!L) continue;
    if (!best || L > best.lv[focus] || (L === best.lv[focus] && (c.xp?.[focus] || 0) > (best.xp?.[focus] || 0))) best = c;
  }
  return best;
}
/** Coach level for an XP total: cut-offs 0/30/70/125/190 are levels 1..5. */
export function levelOfXp(xp) { let L = 1; COACHES.xp.forEach((t, i) => { if (xp >= t) L = i + 1; }); return L; }

/** Coach pick, once per save, rejected after any drill. The chosen candidate joins the staff; the others go. */
export function pickCoach(state, { coachId } = {}) {
  if (state.coachPicked || (state.training?.drillCount || 0) > 0) return state;
  const c = (state.coaches || []).find((x) => x.id === coachId && x.candidate);
  if (!c) return state;
  const n = structuredClone(state);
  n.coaches = n.coaches.filter((x) => !x.candidate || x.id === coachId).map((x) => ({ ...x, candidate: false }));
  n.coachPicked = true;
  return n;
}

const squadOf = (s) => (s.clubs || []).find((c) => c.id === 'c0')?.squad || [];
/** @param {any} s @param {string} id */
export const findPlayer = (s, id) => squadOf(s).find((p) => p.id === id) || null;

/**
 * How much a drill on one rating can add: the least of the cap-sum room, the balance room (15 above the
 * player's own lowest) and the 99 limit. why = which one binds ('cap' wins ties, then 'balance', then 'max').
 */
export function drillRoom(p, drillId) {
  const d = drillDef(drillId); if (!d) return { room: 0, locked: true, why: 'unknown', lowest: 0 };
  const r = p[d.rating], lowest = Math.min(...RATINGS.map((k) => p[k]));
  const cap = capSum(p.potential) - RATINGS.reduce((a, k) => a + p[k], 0);
  const bal = lowest + DRILLS.balance - r, top = DRILLS.hardCap - r;
  const room = Math.min(cap, bal, top);
  const why = room === cap ? 'cap' : room === bal ? 'balance' : 'max';
  return { room, locked: room <= 0, why, lowest, capRoom: cap, balanceRoom: bal, maxRoom: top, upTo: room < DRILLS.gains[2] && room > 0 ? room : null };
}
const WHY_REASON = { cap: 'peak', balance: 'balance', max: 'max' };

/** { ok, reason } with reason one of: 'unknown' 'week' 'tp' 'peak' 'balance' 'max'. */
export function canDrill(state, playerId, drillId) {
  const p = findPlayer(state, playerId);
  if (!p || !drillDef(drillId)) return { ok: false, reason: 'unknown' };
  if (state.training.drilled?.[playerId]) return { ok: false, reason: 'week' };
  const room = drillRoom(p, drillId);
  if (room.locked) return { ok: false, reason: WHY_REASON[room.why], room };
  if (state.training.tp < TP_PER_DRILL) return { ok: false, reason: 'tp', room };
  return { ok: true, reason: '', room };
}

const ensureWeekStart = (n) => {
  n.training.weekStart ||= {};
  for (const p of squadOf(n)) n.training.weekStart[p.id] ||= RATINGS.map((k) => p[k]);
};
const logEntry = (n, e) => { (n.training.weekLog ||= []).push(e); };

/**
 * One drill. Rolls Okay/Good/Great (ONE rng.random()), cuts the gain to the room, spends 15 TP,
 * counts a drill here (the grade shows on the 5th), and gives the best matching coach XP equal to the points made.
 * Locked, repeat or unaffordable drills return the same state and spend nothing.
 */
export function doDrill(state, { playerId, drillId } = {}, rng) {
  const chk = canDrill(state, playerId, drillId); if (!chk.ok) return state;
  const n = structuredClone(state); ensureWeekStart(n);
  const p = findPlayer(n, playerId), d = drillDef(drillId);
  const level = coachLevel(n.coaches, d.focus), nets = n.nets || 1;
  const roll = rollDrill(rng, nets, level);
  const gain = Math.min(roll.gain, chk.room.room), before = p[d.rating];
  p[d.rating] = before + gain;
  const wasHidden = isHidden(p);
  p.drillsHere += 1;
  n.training.tp -= TP_PER_DRILL; n.training.drilled = { ...n.training.drilled, [playerId]: true };
  n.training.drillCount = (n.training.drillCount || 0) + 1;
  const rec = { playerId, drillId, rating: d.rating, outcome: roll.outcome, rolled: roll.gain, gain, cut: gain < roll.gain,
    why: gain < roll.gain ? chk.room.why : null, before, after: p[d.rating], odds: roll.odds, nets, coachLevel: level, tp: TP_PER_DRILL,
    revealed: false, grade: null, coach: null };
  const c = bestCoach(n.coaches, d.focus);
  if (c) {
    const mine = n.coaches.find((x) => x.id === c.id), from = mine.lv[d.focus];
    mine.xp[d.focus] = (mine.xp[d.focus] || 0) + gain; mine.lv[d.focus] = Math.max(from, levelOfXp(mine.xp[d.focus]));
    rec.coach = { id: mine.id, focus: d.focus, xp: gain, from, to: mine.lv[d.focus] };
    if (mine.lv[d.focus] > from) logEntry(n, { type: 'CoachLevelUp', coachId: mine.id, focus: d.focus, from, to: mine.lv[d.focus] });
  }
  logEntry(n, { type: 'Drill', playerId, drillId, outcome: roll.outcome, gain });
  if (wasHidden && !isHidden(p)) {
    rec.revealed = true; rec.grade = bandOf(p.potential);
    logEntry(n, { type: 'GradeRevealed', playerId, grade: rec.grade });
  }
  n.training.last = rec;
  return n;
}

/**
 * Close the training week: build the summary (gains, reveals, nodes, coach level-ups), clear the
 * one-drill and one-node marks, take a new rating snapshot, and move training.week on by one.
 */
export function endWeek(state) {
  const n = structuredClone(state); ensureWeekStart(n);
  const log = n.training.weekLog || [];
  const gains = squadOf(n).map((p) => ({ playerId: p.id, by: RATINGS.map((k, i) => p[k] - n.training.weekStart[p.id][i]) }))
    .filter((g) => g.by.some((v) => v !== 0)).map((g) => ({ ...g, total: g.by.reduce((a, b) => a + b, 0) }));
  n.training.weekSummary = { week: n.training.week, gains,
    reveals: log.filter((e) => e.type === 'GradeRevealed').map((e) => ({ playerId: e.playerId, grade: e.grade })),
    nodes: log.filter((e) => e.type === 'NodeUnlocked').map((e) => ({ playerId: e.playerId, side: e.side, node: e.node })),
    coachUps: log.filter((e) => e.type === 'CoachLevelUp').map((e) => ({ coachId: e.coachId, focus: e.focus, from: e.from, to: e.to })) };
  n.training.week += 1; n.training.drilled = {}; n.training.nodeBought = {}; n.training.last = null; n.training.weekLog = [];
  n.training.weekStart = Object.fromEntries(squadOf(n).map((p) => [p.id, RATINGS.map((k) => p[k])]));
  return n;
}
