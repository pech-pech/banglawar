// @ts-check
// Training rolls, drill room (cap, balance, 99), grade reveal, coach XP, week end. Pure and seeded:
// every function takes the state (and an rng that doDrill draws ONE number from) and returns a new state.
// An invalid command returns the SAME state object. No Math.random, Date or DOM.
import { DRILLS, ODDS, COACHES } from '../data/training.js';
import { BRIDGE_DRILL_MULT } from '../data/leagues.js';
import { SKILLS } from '../data/training.js';
import { aiPickSix } from './clubs.js';
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
  if (!bridgeOn(state) && state.training.tp < TP_PER_DRILL) return { ok: false, reason: 'tp', room };
  return { ok: true, reason: '', room };
}

/** Bridge lever on from run season 2. */
const bridgeOn = (s) => !!(s.season && s.season.n >= 2);

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
  const bridge = bridgeOn(n);
  // Bridge (remove when economy lands): from run season 2 one tap runs floor(m) + (rng < frac(m)) drills; extra rng is drawn only then.
  const reps = bridge ? Math.floor(BRIDGE_DRILL_MULT) + (rng.random() < BRIDGE_DRILL_MULT - Math.floor(BRIDGE_DRILL_MULT) ? 1 : 0) : 1;
  const level = coachLevel(n.coaches, d.focus), nets = n.nets || 1;
  const rec = { playerId, drillId, rating: d.rating, outcome: 'Okay', rolled: 0, gain: 0, cut: false, why: null, before: p[d.rating], after: p[d.rating],
    odds: null, nets, coachLevel: level, tp: bridge ? 0 : TP_PER_DRILL, reps, revealed: false, grade: null, coach: null };
  const rank = { Okay: 0, Good: 1, Great: 2 };
  for (let i = 0; i < reps; i++) {
    const room = i === 0 ? chk.room : drillRoom(p, drillId);
    if (room.locked) break;
    const roll = rollDrill(rng, nets, coachLevel(n.coaches, d.focus));
    const gain = Math.min(roll.gain, room.room), before = p[d.rating];
    p[d.rating] = before + gain;
    const wasHidden = isHidden(p);
    p.drillsHere += 1;
    n.training.drillCount = (n.training.drillCount || 0) + 1;
    rec.rolled += roll.gain; rec.gain += gain; rec.after = p[d.rating]; rec.odds = rec.odds || roll.odds;
    if (rec.drills == null || (rank[roll.outcome] ?? 0) > (rank[rec.outcome] ?? 0)) rec.outcome = roll.outcome;
    rec.drills = (rec.drills || 0) + 1;
    if (gain < roll.gain) { rec.cut = true; rec.why = room.why; }
    const c = bestCoach(n.coaches, d.focus);
    if (c) {
      const mine = n.coaches.find((x) => x.id === c.id), from = mine.lv[d.focus];
      mine.xp[d.focus] = (mine.xp[d.focus] || 0) + gain; mine.lv[d.focus] = Math.max(from, levelOfXp(mine.xp[d.focus]));
      rec.coach = { id: mine.id, focus: d.focus, xp: (rec.coach ? rec.coach.xp : 0) + gain, from: rec.coach ? rec.coach.from : from, to: mine.lv[d.focus] };
      if (mine.lv[d.focus] > from) logEntry(n, { type: 'CoachLevelUp', coachId: mine.id, focus: d.focus, from, to: mine.lv[d.focus] });
    }
    logEntry(n, { type: 'Drill', playerId, drillId, outcome: roll.outcome, gain });
    if (wasHidden && !isHidden(p)) {
      rec.revealed = true; rec.grade = bandOf(p.potential);
      logEntry(n, { type: 'GradeRevealed', playerId, grade: rec.grade });
    }
  }
  if (!bridge) n.training.tp -= TP_PER_DRILL;
  n.training.drilled = { ...n.training.drilled, [playerId]: true };
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
  const drillsLogged = log.filter((e) => e.type === 'Drill'); // Repeat last week reads this; a skipped week keeps the older plan
  if (drillsLogged.length) n.training.lastPlan = Object.fromEntries(drillsLogged.map((e) => [e.playerId, e.drillId]));
  n.training.bulk = null;
  n.training.week += 1; n.training.drilled = {}; n.training.nodeBought = {}; n.training.last = null; n.training.weekLog = [];
  n.training.weekStart = Object.fromEntries(squadOf(n).map((p) => [p.id, RATINGS.map((k) => p[k])]));
  return n;
}

// ---- bulk drills (P7+P11): Drill all (the Six), Repeat last week, Auto-train bench. Each drill is one doDrill, so a bulk run
// rolls exactly like tapping by hand in the same order. rngFor(playerId) gives the same rng the Drill command uses.
const FOCUS_OF = (p) => [SKILLS.trees[p.bat] && SKILLS.trees[p.bat].focus, SKILLS.trees[p.bowl] && SKILLS.trees[p.bowl].focus];

/** The Six in list order (saved six, else the AI pick like the selectors). @param {any} s */
export function sixOf(s) {
  const c = (s.clubs || []).find((x) => x.id === 'c0');
  if (!c) return [];
  return c.six && c.six.length === 6 ? c.six.slice() : aiPickSix(c).slice(0, 6);
}
/** Bench in squad order. */
export const benchOf = (s) => { const six = sixOf(s); return squadOf(s).filter((p) => !six.includes(p.id)).map((p) => p.id); };

/** Suggested drill: his lowest rating that still has room; tie goes to his tree focus, then drill order. null when nothing has room. */
export function suggestedDrill(p) {
  const foci = FOCUS_OF(p); let best = null;
  for (const d of DRILLS.list) {
    if (drillRoom(p, d.id).room <= 0) continue;
    if (!best || p[d.rating] < p[best.rating] || (p[d.rating] === p[best.rating] && foci.includes(d.focus) && !foci.includes(best.focus))) best = d;
  }
  return best ? best.id : null;
}
/** The drill a bulk run gives him: { drillId, fresh } or null. Repeat uses last week's drill when he has one with room; otherwise Suggested (fresh = true). */
export function planDrill(s, p, mode) {
  if (!p) return null;
  const last = s.training.lastPlan && s.training.lastPlan[p.id];
  if (mode === 'repeat' && last && drillDef(last) && drillRoom(p, last).room > 0) return { drillId: last, fresh: false };
  const d = suggestedDrill(p);
  return d ? { drillId: d, fresh: mode === 'repeat' } : null;
}
export const hasLastPlan = (s) => !!(s.training.lastPlan && Object.keys(s.training.lastPlan).length);
/** The plan setting: saved choice, else Repeat when there is a last week. */
export const planMode = (s) => s.training.plan === 'suggested' || s.training.plan === 'repeat' ? (s.training.plan === 'repeat' && !hasLastPlan(s) ? 'suggested' : s.training.plan) : (hasLastPlan(s) ? 'repeat' : 'suggested');

/** Who a run would drill, in order, capped by TP (no cap from season 2: the bridge drills cost nothing). */
export function bulkPlan(s, mode, ids) {
  const out = []; let tp = s.training.tp;
  for (const id of ids) {
    if (s.training.drilled && s.training.drilled[id]) continue;
    const p = findPlayer(s, id), pl = planDrill(s, p, mode);
    if (!pl || drillRoom(p, pl.drillId).room <= 0) continue;
    if (!bridgeOn(s)) { if (tp < TP_PER_DRILL) break; tp -= TP_PER_DRILL; }
    out.push({ playerId: id, ...pl });
  }
  return out;
}

function runBulk(state, mode, ids, rngFor) {
  let n = state; const items = [];
  for (const step of bulkPlan(state, mode, ids)) {
    const next = doDrill(n, { playerId: step.playerId, drillId: step.drillId }, rngFor(step.playerId));
    if (next === n) continue;
    n = next; const r = n.training.last;
    items.push({ playerId: step.playerId, drillId: step.drillId, fresh: step.fresh, outcome: r.outcome, gain: r.gain, revealed: !!r.revealed, grade: r.grade, coach: r.coach ? r.coach.id : null });
  }
  return { n, items };
}

/** Drill all: the Six, who have not drilled, one drill each (mode 'repeat' | 'suggested'). Same state back when nobody can drill. */
export function drillAll(state, mode, rngFor) {
  const m = mode === 'repeat' || mode === 'suggested' ? mode : planMode(state);
  const { n, items } = runBulk(state, m, sixOf(state), rngFor);
  if (!items.length) return state;
  n.training.plan = m;
  const prev = state.training.bulk;
  n.training.bulk = { plan: m, items: (prev ? prev.items : []).concat(items) };
  return n;
}
/** Repeat last week: needs a last week. */
export const repeatWeek = (state, rngFor) => (hasLastPlan(state) ? drillAll(state, 'repeat', rngFor) : state);

/** Auto-train bench setting (default off, kept across weeks). on: true/false, or omit to flip. */
export function setAutoBench(state, on) {
  const v = typeof on === 'boolean' ? on : !state.training.autoBench;
  if (!!state.training.autoBench === v) return state;
  const n = structuredClone(state); n.training.autoBench = v; return n;
}
/** At End week with Auto-train bench on: each bench player not yet drilled gets his Suggested drill while TP lasts. */
export function autoBenchDrills(state, rngFor) {
  if (!state.training.autoBench) return state;
  return runBulk(state, 'suggested', benchOf(state), rngFor).n;
}
/** The Repeat / Suggested switch (saved per game). */
export function setDrillPlan(state, mode) {
  if ((mode !== 'repeat' && mode !== 'suggested') || state.training.plan === mode) return state;
  const n = structuredClone(state); n.training.plan = mode; return n;
}
export function seeTips(state) {
  if (state.training.tipsSeen) return state;
  const n = structuredClone(state); n.training.tipsSeen = true; return n;
}
