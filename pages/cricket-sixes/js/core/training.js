// @ts-check
// Weekly nets (P11 redo): Focus + Effort + optional Spotlight wheel, coaches (grade steps, scout list, courses), week end.
// Pure and seeded: every function takes the state (and an rng where it rolls) and returns a NEW state; an invalid
// command returns the SAME state object. No Math.random, Date or DOM. Numbers: data/training.js TRAIN2 (SPEC 2026-11-13).
import { DRILLS, TRAIN2 } from '../data/training.js';
import { SURNAMES } from '../data/names.js';
import { makeRng } from './rng.js';
import { aiPickSix } from './clubs.js';
import { capSum, bandOf, isHidden } from './ability.js';
import { stepOfRaw } from './letters.js';

export const EFFORTS = ['easy', 'normal', 'push'];
export const FOCUSES = ['bat', 'bowl', 'bal'];
const RATINGS = ['bp', 'bs', 'spd', 'bsk'];
const CO = TRAIN2.coach;
const clone = (/** @type {any} */ x) => structuredClone(x);

// ---- squad helpers
const squadOf = (/** @type {any} */ s) => (s.clubs || []).find((/** @type {any} */ c) => c.id === 'c0')?.squad || [];
/** @param {any} s @param {string} id */
export const findPlayer = (s, id) => squadOf(s).find((/** @type {any} */ p) => p.id === id) || null;
/** The Six in list order (saved six, else the AI pick). @param {any} s */
export function sixOf(s) {
  const c = (s.clubs || []).find((/** @type {any} */ x) => x.id === 'c0');
  if (!c) return [];
  return c.six && c.six.length === 6 ? c.six.slice() : aiPickSix(c).slice(0, 6);
}
/** Bench in squad order. @param {any} s */
export const benchOf = (s) => { const six = sixOf(s); return squadOf(s).filter((/** @type {any} */ p) => !six.includes(p.id)).map((/** @type {any} */ p) => p.id); };
const leagueOfState = (/** @type {any} */ s) => Math.min(5, Math.max(1, (s.season && s.season.league) || (s.run && s.run.league) || 1));
const seasonN = (/** @type {any} */ s) => (s.season && s.season.n) || 1;

/**
 * How much a stat can still gain: least of cap-sum room, balance room (15 above his own lowest) and the 99 limit.
 * @param {any} p @param {string} rating bp|bs|spd|bsk
 */
export function drillRoom(p, rating) {
  const r = p[rating], lowest = Math.min(...RATINGS.map((k) => p[k]));
  const cap = capSum(p.potential) - RATINGS.reduce((a, k) => a + p[k], 0);
  const bal = lowest + DRILLS.balance - r, top = DRILLS.hardCap - r;
  const room = Math.min(cap, bal, top);
  return { room, locked: room <= 0, why: room === cap ? 'cap' : room === bal ? 'balance' : 'max', lowest };
}
/** The stat a focus rolls on: the lowest rating of its set (first on ties). @param {any} p @param {string} focus */
export function focusRating(p, focus) {
  const set = TRAIN2.focusRatings[focus] || TRAIN2.focusRatings.bat;
  return set.reduce((/** @type {string} */ b, /** @type {string} */ k) => (p[k] < p[b] ? k : b), set[0]);
}

// ---- plan
/** Held Twin Spotlight Passes / Master Coach Licences: the Medal shop's buy count in econ.sinks (old saves keep what they bought). @param {any} s */
export const twinHeld = (s) => (s.econ && s.econ.sinks && s.econ.sinks.twin_drill) | 0;
/** @param {any} s */
export const licenceHeld = (s) => (s.econ && s.econ.sinks && s.econ.sinks.master_licence) | 0;
// ONE plan record (r7): the live choice is training.focus / effort / spotlight_id / coach_id; training.last_plan is last week's record
// ({focus, effort, ...}). Legacy lastPlan / sel are read as a fallback and turned into these by save-migrate (tidyPlan).
const lastOf = (/** @type {any} */ s) => { const T = s.training || {}, l = T.last_plan || T.lastPlan; return l && typeof l.focus === 'string' ? l : null; };
/** The week's plan; focus and effort default to last week's. @param {any} s */
export function planOf(s) {
  const T = s.training || {}, leg = T.sel || {};
  const sel = { focus: T.focus ?? leg.focus, effort: T.effort ?? leg.effort, spotlightId: T.spotlight_id ?? leg.spotlightId, coachId: T.coach_id ?? leg.coachId }, last = lastOf(s);
  const focus = FOCUSES.includes(sel.focus) ? sel.focus : last && FOCUSES.includes(last.focus) ? last.focus : 'bat';
  const effort = EFFORTS.includes(sel.effort) ? sel.effort : last && EFFORTS.includes(last.effort) ? last.effort : 'normal';
  const spotlightId = sel.spotlightId && findPlayer(s, sel.spotlightId) ? sel.spotlightId : null;
  const co = sel.coachId ? (s.coaches || []).find((/** @type {any} */ c) => c.id === sel.coachId) : null;
  const sp2 = T.spotlight2_id, spotlight2Id = spotlightId && twinHeld(s) > 0 && sp2 && sp2 !== spotlightId && findPlayer(s, sp2) ? sp2 : null; // 2nd Spotlight: only with a held Twin Pass
  return { focus, effort, spotlightId, ...(spotlight2Id ? { spotlight2Id } : {}), coachId: co && !(co.away > 0) ? co.id : null };
}
/** Patch { focus?, effort?, spotlightId?, coachId? }. Bad values return the same state. @param {any} s @param {any} patch */
export function setPlan(s, patch = {}) {
  if (patch.focus !== undefined && !FOCUSES.includes(patch.focus)) return s;
  if (patch.effort !== undefined && !EFFORTS.includes(patch.effort)) return s;
  if (patch.spotlightId && !findPlayer(s, patch.spotlightId)) return s;
  if (patch.spotlight2Id && (!findPlayer(s, patch.spotlight2Id) || !twinHeld(s))) return s;
  if (patch.coachId) { const c = (s.coaches || []).find((/** @type {any} */ x) => x.id === patch.coachId); if (!c || c.away > 0) return s; }
  const n = clone(s); n.training ||= {};
  const cur = planOf(s), T = n.training;
  delete T.sel;
  if (patch.focus !== undefined && patch.focus !== cur.focus) T.focusChanges = (T.focusChanges || 0) + 1;
  T.focus = cur.focus; T.effort = cur.effort; T.spotlight_id = cur.spotlightId; T.coach_id = cur.coachId;
  if (patch.focus !== undefined) T.focus = patch.focus;
  if (patch.effort !== undefined) T.effort = patch.effort;
  if (patch.spotlightId !== undefined) T.spotlight_id = patch.spotlightId || null;
  if (patch.spotlight2Id !== undefined) T.spotlight2_id = patch.spotlight2Id || null;
  if (!T.spotlight_id || T.spotlight2_id === T.spotlight_id) T.spotlight2_id = null;
  if (patch.coachId !== undefined) T.coach_id = patch.coachId || null;
  return n;
}

// ---- odds, quality
/** Okay/Good/Great percentages at an effort, Quality q and focus. Okay -q, Good/Great +q/2; Balanced scales Good/Great by 0.5. */
export function effortOdds(effort, q = 0, balanced = false) {
  const e = TRAIN2.efforts[effort] || TRAIN2.efforts.normal;
  let ok = Math.max(0, e.okay - q), g = e.good + q / 2, t = e.great + q / 2;
  if (balanced) { g *= TRAIN2.balancedGG; t *= TRAIN2.balancedGG; ok = 100 - g - t; }
  const sum = ok + g + t; return { okay: ok * 100 / sum, good: g * 100 / sum, great: t * 100 / sum };
}
/** Mean gain of an odds row. @param {{okay:number,good:number,great:number}} o */
export const meanGain = (o) => (o.okay + 2 * o.good + 3 * o.great) / 100;

// ---- coaches
/** @param {any} s */
const coachById = (s, id) => (s.coaches || []).find((/** @type {any} */ c) => c.id === id) || null;
/** Coaches in slot order, normalised to { id, name, step, strong, away, courseSeason }. @param {any} s */
export function coachList(s) { return (s.coaches || []).filter((/** @type {any} */ c) => !c.candidate).map(normCoach); }
function normCoach(/** @type {any} */ c) {
  if (typeof c.step === 'number' && Array.isArray(c.strong)) return { ...c, away: c.away | 0 };
  return coachFromOld(c);
}
/** Old coach (lv per Power/Technique/Pace/Craft) -> new: step = min(21, 4 + 3 x max lv); strong from top ratings. @param {any} c */
export function coachFromOld(c) {
  const lv = c.lv || {}, mx = Math.max(0, ...Object.values(lv).map((v) => Number(v) || 0));
  const bat = Math.max(lv.Power || 0, lv.Technique || 0), bowl = Math.max(lv.Pace || 0, lv.Craft || 0);
  const strong = mx === 0 ? ['bat', 'bowl'] : bat === bowl ? ['bat', 'bowl'] : bat > bowl ? ['bat'] : ['bowl'];
  return { id: c.id, name: c.name, step: Math.min(CO.maxStep, CO.oldStepBase + CO.oldStepPerLevel * mx), strong, away: 0, courseSeason: null };
}
/** The coach a new game starts with: step 4 (E-), strong Batting + Bowling. @param {string} id @param {string} name */
export const startCoach = (id, name) => ({ id, name, step: CO.start.step, strong: CO.start.strong.slice(), away: 0, courseSeason: null });
/** Old-shape helper kept for skills.js: best old-style level (0..5) a staff coach has on a side's focus. @param {any[]} coaches @param {string} focus Power|Technique|Pace|Craft|bat|bowl */
export function coachLevel(coaches, focus) {
  const side = focus === 'bat' || focus === 'bowl' ? focus : focus === 'Power' || focus === 'Technique' ? 'bat' : 'bowl';
  let best = 0;
  for (const raw of coaches || []) {
    if (raw.candidate) continue; const c = normCoach(raw);
    if (c.away > 0 || !(c.strong.includes(side) || c.strong.includes('bal'))) continue;
    best = Math.max(best, Math.min(5, Math.max(0, Math.floor((c.step - CO.oldStepBase) / CO.oldStepPerLevel))));
  }
  return best;
}
/** Pick this week's coach by hand (null = none). Away or unknown coaches are refused. @param {any} s @param {string|null} id */
export const pickWeekCoach = (s, id) => setPlan(s, { coachId: id || null });
/** Quality the picked coach adds this week: 0.95 x step when strong in the focus, else 0. @param {any} s */
export function coachQuality(s) {
  const p = planOf(s), raw = p.coachId && coachById(s, p.coachId); if (!raw) return 0;
  const c = normCoach(raw);
  return c.strong.includes(p.focus) ? CO.qualityPerStep * c.step : 0;
}
/** Grade step of the coach helping this week (0 = none). @param {any} s */
export function coachStepInUse(s) { const q = coachQuality(s); return q > 0 ? Math.round(q / CO.qualityPerStep) : 0; }
export const MAX_COACHES = CO.slots;

/** @param {any} s @returns {{n:number, signed:string|null, passed:boolean}|null} */
const scoutRec = (s) => (s.scout && s.scout.n === seasonN(s) ? s.scout : null);
/** This season's scout list: [{ id, name, step, strong }] (deterministic from seed, season, league). Empty once you signed or passed. */
export function scoutList(s) {
  if (scoutRec(s)) return [];
  const L = leagueOfState(s), n = seasonN(s), rng = makeRng(`${s.seed || 'sixes'}|scout|${n}|${L}`);
  const count = CO.scoutSize[L - 1], out = [];
  for (let i = 0; i < count; i++) {
    const step = Math.max(1, Math.min(CO.maxStep, CO.scoutCentre[L - 1] + rng.int(2 * CO.scoutSpread + 1) - CO.scoutSpread));
    const strong = rng.shuffle(FOCUSES.slice()).slice(0, 1 + rng.int(2));
    out.push({ id: `sc${n}-${i}`, name: rng.pick(SURNAMES), step, strong });
  }
  return out;
}
/** Can the player still sign someone? { ok, why: ''|'closed'|'full'|'unknown' } @param {any} s @param {string} [id] */
export function canSign(s, id) {
  if (scoutRec(s)) return { ok: false, why: 'closed' };
  if (coachList(s).length >= CO.slots) return { ok: false, why: 'full' };
  if (id && !scoutList(s).some((c) => c.id === id)) return { ok: false, why: 'unknown' };
  return { ok: true, why: '' };
}
/** Sign one scouted coach (free). Full slots: release one first. @param {any} s @param {string} id */
export function signCoach(s, id) {
  if (!canSign(s, id).ok) return s;
  const c = scoutList(s).find((x) => x.id === id); if (!c) return s;
  const n = clone(s); n.coaches = (n.coaches || []).concat([{ ...c, away: 0, courseSeason: null }]);
  n.scout = { n: seasonN(s), signed: id, passed: false };
  return n;
}
/** Pass on this season's scout list. @param {any} s */
export function passScout(s) { if (scoutRec(s)) return s; const n = clone(s); n.scout = { n: seasonN(s), signed: null, passed: true }; return n; }
/** Release a coach (frees a slot). @param {any} s @param {string} id */
export function releaseCoach(s, id) {
  if (!coachById(s, id)) return s;
  const n = clone(s); n.coaches = n.coaches.filter((/** @type {any} */ c) => c.id !== id);
  if (n.training) { if (n.training.coach_id === id) n.training.coach_id = null; if (n.training.sel && n.training.sel.coachId === id) n.training.sel.coachId = null; }
  return n;
}

/** Coin price of a course (spec price; free until Coins ship, CONTRACT). @param {any} s @param {string} coachId */
export function courseCost(s, coachId) {
  const c = coachById(s, coachId); if (!c) return 0;
  return Math.round((CO.courseBase + CO.coursePerStep * normCoach(c).step) * CO.courseFactor[leagueOfState(s) - 1]);
}
/** { ok, why: ''|'unknown'|'max'|'away'|'season'|'coins' } (coins checked only when s.econ exists; licence = override for a held Master Coach Licence) @param {any} s @param {string} coachId @param {boolean} [licence] */
export function canCourse(s, coachId, licence) {
  const raw = coachById(s, coachId); if (!raw) return { ok: false, why: 'unknown' };
  const c = normCoach(raw);
  if (c.step >= CO.maxStep) return { ok: false, why: 'max' };
  if (c.away > 0) return { ok: false, why: 'away' };
  // Master Coach Licence: lifts the 1-course-a-season cap once, for one 2nd course (licence = override when econ is not on the state)
  if (c.courseSeason === seasonN(s) && !((licence ?? licenceHeld(s) > 0) && c.licenceSeason !== seasonN(s))) return { ok: false, why: 'season' };
  if (s.econ && (s.econ.coins || 0) < courseCost(s, coachId)) return { ok: false, why: 'coins' };
  return { ok: true, why: '' };
}

/** True when this coach already took a course this season, so the next one spends the Master Coach Licence. @param {any} s @param {string} coachId */
export function courseUsesLicence(s, coachId) { const c = coachById(s, coachId); return !!c && normCoach(c).courseSeason === seasonN(s); }

// ---- wheels
const ARRANGE = (/** @type {number[]} */ rest) => { // spread equal numbers apart: low, high, low, high ...
  const a = rest.slice().sort((x, y) => x - y), out = []; let i = 0, j = a.length - 1;
  while (i <= j) { out.push(a[i++]); if (i <= j) out.push(a[j--]); }
  return out;
};
function buildWheel(/** @type {number[]} */ base, /** @type {number} */ jackpot, /** @type {number} */ aim) {
  return { slices: [jackpot].concat(ARRANGE(base)), jackpotIndex: 0, jackpotGain: jackpot, aim };
}
/**
 * Spotlight wheel: 10 slices (index 0 is the jackpot). coachStep = grade step of the coach helping this week (0 = none):
 * every 6 coach Quality turns one +1 slice into +2 (one +1 stays); careful aim +0.003 per step.
 * @param {string} effort @param {number} [coachStep]
 */
export function wheelSlices(effort, coachStep = 0) {
  const w = TRAIN2.wheel[effort] || TRAIN2.wheel.normal, base = w.slices.slice();
  const up = Math.round(CO.qualityPerStep * coachStep * CO.wheelUpPerQ);
  for (let i = 0; i < up && base.filter((v) => v === 1).length > 1; i++) base[base.indexOf(1)] = 2;
  return buildWheel(base, w.jackpot, w.aim + CO.aimPerStep * coachStep);
}
/** Course wheel: +1 x5, +2 x4, jackpot +3 (coach step does not change it). @param {number} [_coachStep] */
export function courseWheel(_coachStep = 0) { const w = CO.courseWheel; return buildWheel(w.slices, w.jackpot, w.aim); }
/**
 * Where the wheel stops. Two draws always. A careful tap lands on the jackpot with probability aim, else the natural
 * (uniform) landing; a random tap is the natural landing. @param {{random:()=>number}} rng @param {{slices:number[],jackpotIndex:number,aim:number}} wheel @param {boolean} [careful]
 */
export function spinResult(rng, wheel, careful = false) {
  const a = rng.random(), b = rng.random();
  const index = careful && a < wheel.aim ? wheel.jackpotIndex : Math.min(wheel.slices.length - 1, Math.floor(b * wheel.slices.length));
  return { index, gain: wheel.slices[index], jackpot: index === wheel.jackpotIndex };
}
/** Course: coach gains the wheel's steps (cap S+), is away one week, one course a season. spin = a spinResult (or none: random tap). @param {any} s @param {{random:()=>number}} rng @param {string} coachId @param {{gain?:number}|null} [spin] @param {boolean} [licence] true = a held Licence may cover a 2nd course (the caller consumes it) */
export function runCourse(s, rng, coachId, spin, licence) {
  if (!canCourse(s, coachId, licence).ok) return s;
  const price = courseCost(s, coachId);
  const n = clone(s), i = n.coaches.findIndex((/** @type {any} */ c) => c.id === coachId);
  // TODO: swap for economy.payCourse(n, price) once js/core/economy.js (ECON-CORE) lands; until then deduct directly.
  if (n.econ) n.econ.coins = (n.econ.coins || 0) - price;
  const c = Object.assign(n.coaches[i], normCoach(n.coaches[i]));
  const gain = spin && Number.isFinite(spin.gain) ? /** @type {number} */ (spin.gain) : spinResult(rng, courseWheel(c.step), false).gain;
  c.step = Math.min(CO.maxStep, c.step + gain); c.away = CO.awayWeeks; if (c.courseSeason === seasonN(s)) c.licenceSeason = seasonN(s); c.courseSeason = seasonN(s);
  if (n.training) { if (n.training.coach_id === coachId) n.training.coach_id = null; if (n.training.sel && n.training.sel.coachId === coachId) n.training.sel.coachId = null; }
  return n;
}

// ---- nets
/** Who trains this week, in Six-first order: trainIds (TP covers), shortIds (can gain, TP short), skippedIds (no legal gain, free). @param {any} s */
function roster(s) {
  const plan = planOf(s), cost = TRAIN2.efforts[plan.effort].cost;
  const six = sixOf(s), sq = squadOf(s);
  const order = six.map((/** @type {string} */ id) => findPlayer(s, id)).filter(Boolean).concat(sq.filter((/** @type {any} */ p) => !six.includes(p.id)));
  const skippedIds = [], able = [];
  for (const p of order) (drillRoom(p, focusRating(p, plan.focus)).locked ? skippedIds : able).push(p);
  let pool = (s.training && s.training.tp) || 0; const trainIds = [], shortIds = [];
  for (const p of able) { if (pool >= cost) { pool -= cost; trainIds.push(p.id); } else shortIds.push(p.id); }
  return { plan, cost, trainIds, shortIds, skippedIds: skippedIds.map((p) => p.id), ableCount: able.length };
}
/** What Run would do: { cost, trainIds, skippedIds, shortIds, hint|null }. @param {any} s */
export function netsPreview(s) {
  const r = roster(s);
  const hint = r.ableCount < TRAIN2.lockedHintBelow ? `Only ${r.ableCount} can train. Try Balanced or the other focus.` : null;
  return { cost: r.cost * r.trainIds.length, trainIds: r.trainIds, skippedIds: r.skippedIds, shortIds: r.shortIds, hint };
}

const logEntry = (/** @type {any} */ n, /** @type {any} */ e) => { (n.training.weekLog ||= []).push(e); };
const ensureWeekStart = (/** @type {any} */ n) => { n.training.weekStart ||= {}; for (const p of squadOf(n)) n.training.weekStart[p.id] ||= RATINGS.map((k) => p[k]); };

/**
 * Run the nets: one roll per player who can gain (Six first), same effort and cost each; the Spotlight player takes the
 * wheel result instead of his roll. opts.wheel = a spinResult ({ index, gain, jackpot }); missing = a random-tap spin
 * (opts.careful for the careful rate). Draws one rng.random() per rolled player (two for a self-spun wheel). One run a week.
 * @param {any} s @param {{random:()=>number}} rng @param {{wheel?:{gain:number,jackpot?:boolean}|null, wheel2?:{gain:number,jackpot?:boolean}|null, careful?:boolean}} [opts]
 */
export function runNets(s, rng, opts = {}) {
  const none = { state: s, lines: [], cost: 0, skipped: 0 };
  if (!s.training || s.training.netsWeek === s.training.week) return none;
  const r = roster(s); if (!r.trainIds.length) return { ...none, skipped: r.skippedIds.length };
  const n = clone(s); ensureWeekStart(n);
  const { plan } = r, q = TRAIN2.netsTerm * ((n.nets || 1) - 1) + coachQuality(s);
  const odds = effortOdds(plan.effort, q, plan.focus === 'bal'), lines = [];
  const wheelOn = plan.spotlightId && r.trainIds.includes(plan.spotlightId);
  const wheel2On = plan.spotlight2Id && r.trainIds.includes(plan.spotlight2Id); // Twin Pass: a second, separate spin
  const wheel2 = wheel2On ? (opts.wheel2 && Number.isFinite(opts.wheel2.gain) ? opts.wheel2 : spinResult(rng, wheelSlices(plan.effort, coachStepInUse(s)), !!opts.careful)) : null;
  const wheel = wheelOn ? (opts.wheel && Number.isFinite(opts.wheel.gain) ? opts.wheel : spinResult(rng, wheelSlices(plan.effort, coachStepInUse(s)), !!opts.careful)) : null;
  const words = ['Okay', 'Good', 'Great'];
  for (const id of r.trainIds) {
    const p = findPlayer(n, id), st = focusRating(p, plan.focus), room = drillRoom(p, st).room;
    let rolled, wheelGain, wh = wheel;
    if (wheel2On && id === plan.spotlight2Id && wheel2) { rolled = wheel2.gain; wheelGain = wheel2.gain; wh = wheel2; }
    else if (wheelOn && id === plan.spotlightId && wheel) { rolled = wheel.gain; wheelGain = wheel.gain; }
    else { const x = rng.random() * 100; rolled = x < odds.okay ? 1 : x < odds.okay + odds.good ? 2 : 3; }
    const gain = Math.min(rolled, room), from = p[st], wasHidden = isHidden(p);
    p[st] = from + gain; p.drillsHere += 1;
    const word = words[Math.min(3, wheelGain !== undefined ? Math.max(1, wheelGain >= 3 ? 3 : wheelGain) : rolled) - 1];
    const jackpot = wheelGain !== undefined && !!wh && !!wh.jackpot;
    const breakthrough = (wheelGain === undefined && rolled === 3) || jackpot || stepOfRaw(p[st]) > stepOfRaw(from);
    /** @type {any} */ const line = { id, name: p.name, stat: TRAIN2.statNames[st], rating: st, fromRaw: from, toRaw: p[st], word, breakthrough };
    if (wheelGain !== undefined) line.wheelGain = wheelGain;
    lines.push(line);
    logEntry(n, { type: 'Drill', playerId: id, rating: st, outcome: word, gain });
    if (wasHidden && !isHidden(p)) logEntry(n, { type: 'GradeRevealed', playerId: id, grade: bandOf(p.potential) });
  }
  const cost = r.cost * r.trainIds.length;
  n.training.tp -= cost; n.training.netsWeek = n.training.week; n.training.netsRuns = (n.training.netsRuns || 0) + 1; // netsRuns: report counter; p.drillsHere stays the grade-reveal counter
  n.training.last = { week: n.training.week, lines, cost, skipped: r.skippedIds.length };
  return { state: n, lines, cost, skipped: r.skippedIds.length, skippedIds: r.skippedIds, shortIds: r.shortIds };
}

/**
 * Close the training week: summary (gains, grade reveals, nodes), remember focus + effort, clear the week's coach and spotlight,
 * bring away coaches back, snapshot ratings, week + 1.
 * @param {any} state
 */
export function endWeek(state) {
  const n = clone(state); ensureWeekStart(n);
  const log = n.training.weekLog || [];
  const gains = squadOf(n).map((/** @type {any} */ p) => ({ playerId: p.id, by: RATINGS.map((k, i) => p[k] - n.training.weekStart[p.id][i]) }))
    .filter((/** @type {any} */ g) => g.by.some((/** @type {number} */ v) => v !== 0)).map((/** @type {any} */ g) => ({ ...g, total: g.by.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) }));
  let letters = 0; // letter steps crossed this week, all players and ratings (a step = one rung of the 21-letter ladder)
  for (const p of squadOf(n)) RATINGS.forEach((k, i) => { letters += Math.max(0, stepOfRaw(p[k]) - stepOfRaw(n.training.weekStart[p.id][i])); });
  n.training.weekSummary = { week: n.training.week, steps: gains.reduce((/** @type {number} */ a, /** @type {any} */ g) => a + g.total, 0), letters, gains,
    reveals: log.filter((/** @type {any} */ e) => e.type === 'GradeRevealed').map((/** @type {any} */ e) => ({ playerId: e.playerId, grade: e.grade })),
    nodes: log.filter((/** @type {any} */ e) => e.type === 'NodeUnlocked').map((/** @type {any} */ e) => ({ playerId: e.playerId, side: e.side, node: e.node })),
    lines: (n.training.last && n.training.last.lines) || [] };
  const pl = planOf(state);
  n.training.last_plan = { focus: pl.focus, effort: pl.effort };
  delete n.training.lastPlan; delete n.training.sel;
  n.training.focus = pl.focus; n.training.effort = pl.effort; n.training.spotlight_id = null; n.training.spotlight2_id = null; n.training.coach_id = null;
  for (const c of n.coaches || []) if (c.away > 0) c.away -= 1;
  n.training.week += 1; n.training.nodeBought = {}; n.training.last = null; n.training.weekLog = []; n.training.netsWeek = null;
  n.training.weekStart = Object.fromEntries(squadOf(n).map((/** @type {any} */ p) => [p.id, RATINGS.map((k) => p[k])]));
  return n;
}
/** @param {any} state */
export function seeTips(state) {
  if (state.training.tipsSeen) return state;
  const n = clone(state); n.training.tipsSeen = true; return n;
}
