// @ts-check
// Pure commands: (state, payload) -> new state. rng is derived per command from state, never stored.
import { makeRng } from '../core/rng.js';
import { eligibleBowlers, newInnings, playOver, phaseOf, centreOf } from '../core/match.js';
import { pickBowler, pickIntent, pickField, rivalCall } from '../core/ai.js';
import { makeStartState } from '../data/m0-fixture.js';
import { FLAGS } from '../data/flags.js';
import { SEASON } from '../data/season.js';
import { makeClubs, growClubs, aiPickSix } from '../core/clubs.js';
import { makeSchedule, makeTable, applyResult, placeOf, inTopFour, finalsDraw, finalFrom, koWinner, matchPay, tpAward, simRound, simMatch, simFinals, ME } from '../core/season.js';
import { planOf, setPlan as setTrainPlan, runNets, endWeek, coachList, coachStepInUse, startCoach as makeStartCoach, passScout, courseUsesLicence, courseCost, signCoach, releaseCoach, pickWeekCoach, canCourse, courseWheel, runCourse, wheelSlices, spinResult } from '../core/training.js';
import { unlockNode, makeFx } from '../core/skills.js';
import { defaultOvers } from '../core/plan.js';
import { newEconomy, applyMatch, tickBuild, finalsReward, finalsTp, payCourse, useHeld, startBuild, buySink, buyMedal, buyLegacy } from '../core/economy.js';
import { newRun, closeSeason, remakeRivals, carryOf, applyCarry } from '../core/run.js';
import { RUN, SQUAD } from '../data/run.js';
import { newBook, isBook, recordOver } from '../core/pairing.js';
import { activityOptions, pickActivity, signTrial, declineTrial, actLedger, roundKey } from '../core/activities.js';
import { takeFreePick } from '../core/economy.js';
import { VERSION } from '../core/save-migrate.js';
import { rollMatchday, teamBoost, scaleRatings, resolvePep } from '../core/matchday.js';
import { MD } from '../data/matchday.js';

const ovStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Look settings (UI only, never read by the rules). Absent field = 'green'. */
export const THEMES = ['green', 'scorebook'];

/** Figures snapshot of innings 1 (newInnings resets some player fields before the chase). */
function summarise(s) {
  const inn = s.inn1;
  return {
    runs: inn.runs, wk: inn.wk, balls: inn.balls, overs: ovStr(inn.balls),
    bat: s.rival.players.map((p) => ({ name: p.name, bat: p.bat, r: p.inn.r, b: p.inn.b, out: p.inn.out })),
    bowl: s.me.players.map((p) => ({ name: p.name, bowl: p.bowl, overs: p.overs, r: p.figs.r, w: p.figs.w })),
  };
}

/** M's pick (12b): every over's call starts neutral. Bowling: Protect. Batting: Rotate (shown as "Steady"). Never the last call. */
export const NEUTRAL_FIELD = 'P';
export const NEUTRAL_INTENT = 'R';
const NEUTRAL_FIELDS = () => [NEUTRAL_FIELD, NEUTRAL_FIELD, NEUTRAL_FIELD];

/** Default Call: the planned bowler (season) or first eligible, field Protect unless the player's own plan set a phase field. null when no one can bowl. */
function defaultCall(s) {
  const el = eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last);
  if (!el.length) return null;
  if (s.season && s.plan) { // season: the planned bowler (when allowed) and the planned field for this phase
    const planned = s.plan.overs[s.inn1.over - 1];
    return { bowler: el.includes(planned) ? planned : el[0], field: s.plan.fields[phaseOf(s.inn1.over)] || NEUTRAL_FIELD };
  }
  return { bowler: el[0], field: NEUTRAL_FIELD };
}

/** Skill-tree effects for the match, in a season only (a step-0 match passes no fx, so its numbers are unchanged). */
const fxOf = (s) => (s.season ? makeFx(s.coaches) : undefined);

function newMatch(payload) {
  const seed = String(payload && payload.seed != null ? payload.seed : '0');
  const { me, rival } = makeStartState(makeRng(`${seed}|teams`));
  const s = {
    seed, stage: 'bowl', me, rival,
    inn1: newInnings(rival.players, me.players, null),
    inn2: null, call: null, last: null, result: null, inn1Summary: null,
  };
  s.call = defaultCall(s);
  return s;
}

function makeCall(s, p) {
  if (s.stage !== 'bowl') return s;
  const el = eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last);
  if (!p || !el.includes(p.bowler) || (p.field !== 'A' && p.field !== 'P')) return s;
  const n = structuredClone(s);
  n.call = { bowler: p.bowler, field: p.field };
  return n;
}

function bowlOver(s, p) {
  const n = structuredClone(s);
  if (n.stage === 'bowl') {
    const inn = n.inn1;
    const rng = makeRng(`${n.seed}|${n.stage}|${inn.over}`);
    const el = eligibleBowlers(n.me.players, inn.over, inn.last);
    const call = n.call && el.includes(n.call.bowler) ? n.call : defaultCall(n);
    if (!call) return s;
    const good = rivalCall(rng, FLAGS.rivalGoodShare);
    const intent = pickIntent(inn, false, rng, good);
    const over = inn.over;
    const balls = playOver(rng, inn, n.rival.players, n.me.players, call.bowler, intent, call.field, fxOf(n), centreOf(n), !!n.season, roarOpts(n, 'bowl', 0));
    n.last = { balls, over, bowler: call.bowler, intent, field: call.field };
    countBook(n, balls, n.rival.players, n.me.players);
    if (inn.done) { n.stage = 'break'; n.call = null; n.inn1Summary = summarise(n); } else n.call = defaultCall(n);
    return n;
  }
  if (n.stage === 'chase') {
    const inn = n.inn2;
    const rng = makeRng(`${n.seed}|${n.stage}|${inn.over}`);
    const intent = p && ['D', 'R', 'A'].includes(p.intent) ? p.intent : NEUTRAL_INTENT;
    const good = rivalCall(rng, FLAGS.rivalGoodShare);
    const batters = [n.me.players[inn.crease[0]], n.me.players[inn.crease[1]]];
    const bowler = pickBowler(n.rival.players, inn, batters, rng, good);
    const field = pickField(inn, batters, rng, good, centreOf(n));
    const over = inn.over;
    const balls = playOver(rng, inn, n.me.players, n.rival.players, bowler, intent, field, fxOf(n), centreOf(n), !!n.season, roarOpts(n, 'bat', 1));
    n.last = { balls, over, bowler, intent, field };
    countBook(n, balls, n.me.players, n.rival.players);
    if (inn.done) {
      n.stage = 'done';
      n.result = inn.runs > n.inn1.runs ? 'won' : inn.runs === n.inn1.runs ? 'tied' : 'lost';
    }
    return n;
  }
  return s;
}

/** Pairing Book (P4): count the over's balls, either innings, and record the cells found at the end of the over in n.last.found. Season matches only. Mutates the private copy n. */
function countBook(n, balls, bats, bowls) {
  if (!n.season) return;
  const r = recordOver(isBook(n.book) ? n.book : newBook(), balls, bats, bowls);
  n.book = r.book;
  n.last.found = r.newly;
}

function startChase(s) {
  if (s.stage !== 'break') return s;
  const n = structuredClone(s);
  if (!n.inn1Summary) n.inn1Summary = summarise(n);
  n.inn2 = newInnings(n.me.players, n.rival.players, n.inn1.runs);
  n.stage = 'chase'; n.last = null; n.call = null;
  return n;
}


// ---------------------------------------------------------------- season (CONTRACT m0 section 2)
const DEFAULT_OVERS = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
const clone = (x) => JSON.parse(JSON.stringify(x));

const COACH_NAMES = ['Okafor', 'Lindqvist', 'Mehta', 'Bryce', 'Haldane', 'Pryce', 'Tanaka', 'Vickers'];

/** M's pair for a league round: { round, kind, opp }. */
function leagueFixture(season, round) {
  const pair = season.fixtures[round - 1].find((p) => p.a === ME || p.b === ME);
  return { round, kind: 'league', opp: pair.a === ME ? pair.b : pair.a };
}

function newSeasonData(seed, n, clubs, league = 1) {
  const ids = clubs.map((c) => c.id);
  const season = {
    n, league, seed: n === 1 ? seed : `${seed}|s${n}`, round: 1, phase: 'league',
    fixtures: makeSchedule(ids, makeRng(`${seed}|sched|${n}`)), results: [], table: makeTable(ids), finals: null, champion: null, tpWon: 0, last: null,
  };
  return season;
}

const blankMatch = () => ({ me: null, rival: null, inn1: null, inn2: null, call: null, last: null, result: null, inn1Summary: null });

function newGame(payload) {
  const seed = String(payload && payload.seed != null ? payload.seed : '0');
  const clubs = makeClubs(makeRng(`${seed}|clubs`), SEASON);
  // Squad of 8 (SPEC s6): M keeps slots 1-6 plus 9 and 10. The AI clubs keep their 10.
  const mine = clubs[0];
  mine.squad = SQUAD.startSlots.map((i) => mine.squad[i]);
  mine.six = aiPickSix(mine);
  const season = newSeasonData(seed, 1, clubs);
  return {
    v: VERSION, salt: '', features: true, seed, stage: 'hub', ...blankMatch(), run: newRun(seed), book: newBook(),
    season, clubs, plan: { overs: DEFAULT_OVERS.slice(), fields: NEUTRAL_FIELDS(), edited: false, key: '' },
    econ: newEconomy(), coaches: [makeStartCoach('k0', COACH_NAMES[makeRng(`${seed}|coaches`).int(COACH_NAMES.length)])], coachPicked: true, nets: 1, releaseLedger: [],
    training: { tp: 450, week: 1, nodeBought: {}, weekLog: [], weekStart: {}, netsRuns: 0, focusChanges: 0, focus: 'bat', effort: 'normal', spotlight_id: null, coach_id: null, last_plan: null },
    fixture: leagueFixture(season, 1),
  };
}

// ---- squad of 8 (SPEC s6)
/** True when M's squad is at the cap. @param {any} s */
export const squadFull = (s) => s.clubs[0].squad.length >= SQUAD.size;
/** Sign / academy gate: { ok, why }. A full squad needs a release first (declining stays free). @param {any} s */
export function canAddPlayer(s) { return squadFull(s) ? { ok: false, why: SQUAD.fullText } : { ok: true, why: '' }; }
/** Sale gate. A starter (in the Six) can only go at season end; nobody goes below the minimum. @param {any} s @param {string} id */
export function canSell(s, id) {
  const c = s.clubs[0];
  if (!c.squad.some((p) => p.id === id)) return { ok: false, why: 'Not in your squad' };
  if (c.squad.length <= SQUAD.min) return { ok: false, why: `Keep at least ${SQUAD.min} players` };
  const six = c.six.length === SEASON.sixSize ? c.six : aiPickSix(c);
  if (six.includes(id) && !(s.stage === 'end' || (s.season && s.season.phase === 'over'))) return { ok: false, why: 'A starter can only leave at season end' };
  return { ok: true, why: '' };
}
function addPlayer(s, p) {
  if (!p || !p.player || !p.player.id || !canAddPlayer(s).ok || s.clubs[0].squad.some((x) => x.id === p.player.id)) return s;
  const n = clone(s);
  n.clubs[0].squad.push({ drillsHere: 0, nodes: { bat: 0, bowl: 0 }, ...clone(p.player) });
  return n;
}
function sellPlayer(s, p) {
  if (!p || !canSell(s, p.id).ok) return s;
  const n = clone(s), c = n.clubs[0];
  c.squad = c.squad.filter((x) => x.id !== p.id);
  c.six = aiPickSix(c);
  n.plan = { ...n.plan, edited: false, key: '' };
  return n;
}

function setSix(s, p) {
  if (s.stage !== 'squad' || !p || !Array.isArray(p.ids) || p.ids.length !== SEASON.sixSize) return s;
  const have = new Set(s.clubs[0].squad.map((x) => x.id));
  if (new Set(p.ids).size !== p.ids.length || !p.ids.every((id) => have.has(id))) return s;
  const n = clone(s);
  n.clubs[0].six = p.ids.slice();
  const key = planKey(s);
  if (!(s.plan.edited && s.plan.key === key)) n.plan = { overs: suggestedOvers(n), fields: NEUTRAL_FIELDS(), edited: false, key }; // never overwrite a plan the player set for this match
  n.stage = 'plan';
  if (screenDue(n)) { n.stage = 'matchday'; n.fixture = { ...n.fixture, md: mdFor(n, p.ids) }; }
  return n;
}

/** Bowling plan rules: 10 overs, each of the six bowls 1-2 overs, never two in a row. Returns a reason or null. */
export function planProblem(overs) {
  if (!Array.isArray(overs) || overs.length !== 10) return 'Pick a bowler for every over.';
  if (!overs.every((b) => Number.isInteger(b) && b >= 0 && b < SEASON.sixSize)) return 'Pick a bowler for every over.';
  const cnt = Array(SEASON.sixSize).fill(0);
  overs.forEach((b) => cnt[b]++);
  if (cnt.some((c) => c === 0)) return 'Everyone bowls at least 1 over.';
  if (cnt.some((c) => c > 2)) return 'Nobody bowls more than 2 overs.';
  if (overs.some((b, i) => i > 0 && overs[i - 1] === b)) return 'Nobody bowls two overs in a row.';
  return null;
}

const planKey = (s) => (s.fixture && s.season ? `${s.season.n}|${s.fixture.kind}|${s.fixture.round}|${s.fixture.opp}` : '');

/** Pre-filled overs: best matchups against this opponent's batters, for the current six. Falls back to the plain rota. */
function suggestedOvers(s) {
  const fx = s.fixture;
  const opp = fx && s.clubs.find((c) => c.id === fx.opp);
  const mine = s.clubs[0];
  if (!opp || mine.six.length !== SEASON.sixSize) return DEFAULT_OVERS.slice();
  const byId = (club, id) => club.squad.find((x) => x.id === id);
  return defaultOvers(mine.six.map((id) => byId(mine, id)), aiPickSix(opp).map((id) => byId(opp, id)), isBook(s.book) ? s.book : undefined);
}

/** Player edits while the plan screen is open. Keeps half-filled plans (null = still to pick); marks the plan as the player's own. */
function editPlan(s, p) {
  if (s.stage !== 'plan' || !p || !Array.isArray(p.overs) || p.overs.length !== 10) return s;
  if (!p.overs.every((b) => b === null || (Number.isInteger(b) && b >= 0 && b < SEASON.sixSize))) return s;
  if (!Array.isArray(p.fields) || p.fields.length !== 3 || !p.fields.every((f) => f === 'A' || f === 'P')) return s;
  const n = clone(s);
  n.plan = { overs: p.overs.slice(), fields: p.fields.slice(), edited: true, key: planKey(s) };
  return n;
}

function setPlan(s, p) {
  if (s.stage !== 'plan' || !p || planProblem(p.overs)) return s;
  if (!Array.isArray(p.fields) || p.fields.length !== 3 || !p.fields.every((f) => f === 'A' || f === 'P')) return s;
  const n = clone(s);
  n.plan = { overs: p.overs.slice(), fields: p.fields.slice(), edited: true, key: planKey(s) };
  return n;
}

const copyPlayer = (p) => ({ ...clone(p), overs: 0, figs: { r: 0, w: 0 }, inn: { r: 0, b: 0, out: false } });

function seasonMatch(s) {
  if (s.stage !== 'plan' || !s.fixture || planProblem(s.plan.overs)) return s;
  const fx = s.fixture;
  const mine = s.clubs[0], opp = s.clubs.find((c) => c.id === fx.opp);
  const byId = (club, id) => club.squad.find((x) => x.id === id);
  const seed = `${s.season.seed}|${fx.kind}|${fx.round}|${s.salt}`;
  const md = FLAGS.matchday ? mdFor(s, mine.six) : null; // rolled once per fixture; hype, toss and pep scale COPIES of our six (never the save)
  const n = {
    ...s, ...blankMatch(), seed, stage: 'bowl',
    me: { name: mine.name, players: mine.six.map((id) => (md ? scaleRatings(copyPlayer(byId(mine, id)), teamBoost(md, id)) : copyPlayer(byId(mine, id)))) },
    rival: { name: opp.name, players: aiPickSix(opp).map((id) => copyPlayer(byId(opp, id))) },
  };
  if (md) { n.match = { md }; n.fixture = { ...fx, md }; }
  n.inn1 = newInnings(n.rival.players, n.me.players, null);
  n.call = defaultCall(n);
  return n;
}

function finishMatch(s) {
  if (s.stage !== 'done' || !s.season || !s.fixture) return s;
  const n = clone(s), se = n.season, fx = n.fixture;
  const res = { round: fx.round, kind: fx.kind, a: ME, b: fx.opp, ra: n.inn2.runs, wa: n.inn2.wk, rb: n.inn1.runs, wb: n.inn1.wk, winner: null };
  let outcome = n.result;
  if (fx.kind === 'league') res.winner = res.ra > res.rb ? ME : res.ra < res.rb ? fx.opp : null;
  else { res.winner = koWinner(res, placeOf(se.table, ME), placeOf(se.table, fx.opp)); outcome = res.winner === ME ? 'won' : 'lost'; }
  se.results.push(res);
  const pay = matchPay(n, { outcome, kind: fx.kind });
  const finKey = fx.kind === 'semi' ? (outcome === 'lost' ? 'semi' : null) : fx.kind === 'final' ? (outcome === 'won' ? 'champ' : 'runner') : null;
  if (finKey) pay.total = finalsTp(finKey);
  n.training.tp += pay.total; se.tpWon += pay.total;
  n.pay = { ...pay, outcome, opp: fx.opp, round: fx.round };
  Object.assign(n, tickBuild(applyMatch(n, { win: outcome === 'won', tie: outcome === 'tied', ...(FLAGS.matchday && n.fixture.md ? { hypeIdx: n.fixture.md.hypeIdx } : {}) })));
  if (finKey) Object.assign(n, finalsReward(n, finKey));
  se.last = { kind: fx.kind, round: fx.round };
  n.fixture = null;

  if (fx.kind === 'league') {
    se.table = applyResult(se.table, res);
    for (const r of simRound(n, fx.round)) { se.table = applyResult(se.table, r); se.results.push(r); }
    if (fx.round === SEASON.leagueMatches) {
      if (inTopFour(se.table, ME)) {
        se.finals = finalsDraw(se.table); se.phase = 'semi';
        const i = se.finals.semis.findIndex((m) => m.a === ME || m.b === ME);
        const m = se.finals.semis[i];
        n.fixture = { round: 10 + i, kind: 'semi', opp: m.a === ME ? m.b : m.a };
      } else {
        const r = simFinals(n);
        se.finals = r.finals; se.champion = r.champion; se.results.push(...r.results); se.phase = 'over';
      }
    } else n.fixture = null;
  } else if (fx.kind === 'semi') {
    const i = fx.round - 10, j = 1 - i, F = se.finals;
    F.semis[i].winner = res.winner;
    const o = F.semis[j], r = simMatch(n, o.a, o.b, 'semi', 10 + j);
    o.winner = r.winner; se.results.push(r);
    F.final = finalFrom(F.semis);
    if (res.winner === ME) { se.phase = 'final'; n.fixture = { round: 12, kind: 'final', opp: F.final.a === ME ? F.final.b : F.final.a }; }
    else { const fr = simMatch(n, F.final.a, F.final.b, 'final', 12); F.final.winner = fr.winner; se.champion = fr.winner; se.results.push(fr); se.phase = 'over'; }
  } else {
    se.finals.final.winner = res.winner; se.champion = res.winner; se.phase = 'over';
  }
  n.stage = 'train';
  return n;
}

function nextWeek(s) {
  if (s.stage !== 'week') return s;
  const n = clone(s), se = n.season;
  if (se.phase === 'over') { const c = closeSeason(n); c.stage = 'end'; return c; }
  if (se.phase === 'league') { se.round += 1; n.fixture = leagueFixture(se, se.round); n.stage = 'hub'; return n; }
  n.stage = se.phase; // 'semi' or 'final': fixture was set by FinishMatch
  return n;
}

function newSeason(s) {
  if (s.stage !== 'end' || !s.season || !s.run || s.season.n >= RUN.seasons) return s;
  const n = clone(closeSeason(s)); // old saves reach 'end' without a closed season
  const league = n.run.last.toLeague, nn = n.season.n + 1;
  n.clubs = n.run.last.promoted ? remakeRivals(n.clubs, n.run.root, league, nn) : growClubs(n.clubs, SEASON.aiGrowth);
  n.season = newSeasonData(baseSeed(s), nn, n.clubs, league);
  n.run.n = nn; n.run.league = league;
  Object.assign(n, blankMatch());
  n.stage = 'hub';
  n.fixture = leagueFixture(n.season, 1);
  return n;
}

function runEnd(s) {
  if (s.stage !== 'end' || !s.season || !s.run || s.season.n < RUN.seasons) return s;
  const n = clone(closeSeason(s));
  n.run.ended = true; n.stage = 'runend';
  return n;
}

/** New run: season 1, League 1, a fresh club; only the legend and one level-2 coach carry. */
function newRunFrom(s, p) {
  if (s.stage !== 'runend' || !s.run) return s;
  const no = s.run.no + 1;
  const fresh = newGame({ seed: `${s.run.root}|R${no}` });
  const n = applyCarry(fresh, carryOf(s, p && p.coachId));
  n.run = newRun(`${s.run.root}|R${no}`, no);
  n.salt = s.salt;
  return n;
}
/** The game seed is the first season's seed; later seasons append |s<n>. */
const baseSeed = (s) => String(s.season.seed).replace(/\|s\d+$/, '');

/**
 * @param {any} s current state (may be null)
 * @param {string} cmd NewMatch | MakeCall | BowlOver | StartChase
 * @param {any} [payload]
 */
export function applyCommand(s, cmd, payload = {}) {
  const n = applyCommandCore(s, cmd, payload);
  // The look setting rides along every command that rebuilds the state (NewGame, new run, ...); absent = the default look.
  const t = s && s.theme && n && n !== s && n.theme === undefined ? { ...n, theme: s.theme } : n;
  const u = s && s.autoMatchday && t && t !== s && t.autoMatchday === undefined && t.stage ? { ...t, autoMatchday: true } : t;
  // The features switch (M 18:37) also rides along: a rebuilt state keeps the player's choice (absent on an old save = on).
  return cmd !== 'SetFeatures' && s && s.features === false && u && u !== s && u.stage && u.features !== false ? { ...u, features: false } : u;
}
function applyCommandCore(s, cmd, payload) {
  if (cmd === 'SetTheme') return s && s.stage && THEMES.includes(payload && payload.theme) && (s.theme || 'green') !== payload.theme ? { ...s, theme: payload.theme } : s;
  if (cmd === 'NewGame') return newGame(payload);
  if (cmd === 'NewMatch' && !(s && s.season)) return newMatch(payload);
  if (!s || !s.stage) return s;
  switch (cmd) {
    case 'NewMatch': return seasonMatch(s);
    case 'Reseed': return payload && typeof payload.salt === 'string' && payload.salt !== s.salt ? { ...s, salt: payload.salt } : s;
    case 'SeeFirstStrip': return seeFirstStrip(s);
    case 'OpenSquad': return ['hub', 'semi', 'final', 'plan'].includes(s.stage) && s.season ? { ...s, stage: 'squad' } : s;
    case 'SetSix': return setSix(s, payload);
    case 'SetFeatures': return payload && typeof payload.on === 'boolean' && (s.features !== false) !== payload.on ? { ...s, features: payload.on } : s;
    case 'PickActivity': return pickAct(s, payload);
    case 'SignTrial': return FLAGS.activities && s.econ ? signTrial(s) : s;
    case 'DeclineTrial': return FLAGS.activities && s.econ ? declineTrial(s) : s;
    case 'TakeFreePick': return FLAGS.freePick && s.econ && payload && typeof payload.what === 'string' ? takeFreePick(s, payload.what) : s;
    case 'OpenMatchday': return openMatchday(s);
    case 'MatchdayGo': return matchdayGo(s);
    case 'BackToSquad': return backToSquad(s);
    case 'SetAutoMatchday': return payload && typeof payload.on === 'boolean' && !!s.autoMatchday !== payload.on ? { ...s, autoMatchday: payload.on } : s;
    case 'SetPlan': return setPlan(s, payload);
    case 'TeamSix': return teamSix(s, payload);
    case 'TeamPlan': return teamPlan(s, payload);
    case 'TeamSuggest': return teamSuggest(s);
    case 'StartMatch': return startMatch(s);
    case 'EditPlan': return editPlan(s, payload);
    case 'FinishMatch': return finishMatch(s);
    case 'SetTrainPlan': return viaTrain(s, (x) => setTrainPlan(x, payload || {}));
    case 'Spin': return viaTrain(s, (x) => spin(x, payload));
    case 'RunNets': return viaTrain(s, doRunNets);
    case 'PickWeekCoach': return viaTrain(s, (x) => pickWeekCoach(x, payload && payload.coachId != null ? payload.coachId : null));
    case 'PassScout': return viaTrain(s, passScout);
    case 'SignCoach': return viaTrain(s, (x) => signCoach(x, payload && payload.coachId));
    case 'ReleaseCoach': return viaTrain(s, (x) => releaseCoach(x, payload && payload.coachId));
    case 'CourseSpin': return viaTrain(s, (x) => courseSpin(x, payload));
    case 'RunCourse': return viaTrain(s, (x) => doRunCourse(x, payload));
    case 'TipsSeen': return s.stage === 'train' && !s.training.tipsSeen ? { ...s, training: { ...s.training, tipsSeen: true } } : s;
    case 'UnlockNode': return s.stage === 'train' ? unlockNode(s, payload || {}) : s;
    case 'EndWeek': return s.stage === 'train' ? { ...sync(clearWeek(endWeek(s))), stage: 'week' } : s;
    case 'StartBuild': return s.season && payload ? startBuild(s, payload.what) : s;
    case 'BuySink': return s.season && payload ? buySink(s, payload.id) : s;
    case 'BuyMedal': return s.season && payload ? buyMedal(s, payload.id) : s;
    case 'BuyLegacy': return s.season ? buyLegacy(s) : s;
    case 'AddPlayer': return addPlayer(s, payload);
    case 'SellPlayer': return sellPlayer(s, payload);
    case 'DismissNotice': return s.notice ? (({ notice, ...rest }) => rest)(s) : s;
    case 'NextWeek': return nextWeek(s);
    case 'NewSeason': return newSeason(s);
    case 'RunEnd': return runEnd(s);
    case 'NewRun': return newRunFrom(s, payload);
    case 'MakeCall': return makeCall(s, payload);
    case 'BowlOver': return bowlOver(s, payload);
    case 'StartChase': return startChase(s);
    default: return s;
  }
}

// ---- r9 match day (flag matchday). One roll per fixture, kept on the fixture; Back to Squad reuses it.
/** Crowd roar for our side: only with both flags on and a rolled match day (else playOver gets no opts = as today). */
function roarOpts(n, ours, innIdx) {
  const md = n.match && n.match.md;
  return FLAGS.roar && md ? { ours, md, innIdx } : undefined;
}
/** Tilts of recent fan activities, newest first: this round, last, the one before (ECON actLedger). */
export const actLedgerOf = (s) => (FLAGS.activities && s.econ && s.econ.act ? actLedger(s) : []);
/** The match day for this fixture: the stored roll, or a new one from the match seed. Pep follows the slot in the CURRENT six. */
export function mdFor(s, sixIds) {
  const fx = s.fixture;
  if (!FLAGS.matchday || !fx || !s.season) return null;
  const seed = `${s.season.seed}|${fx.kind}|${fx.round}|${s.salt}`;
  const md = fx.md || rollMatchday(seed, { fans: s.econ ? s.econ.fans : 0, actLedger: actLedgerOf(s), sixIds });
  return { ...md, pepId: resolvePep(md, sixIds) };
}
/** Show the screen? Flag on, and auto is off or fewer than the first N screens have been seen. */
function screenDue(s) {
  return !!(FLAGS.matchday && s.season && s.fixture && (!s.autoMatchday || (s.mdSeen || 0) < MD.MATCHDAY_FIRST_N_SHOWN));
}
/** One fan activity (or Rest week) per round, from the hub. The find roll has its own stream: save seed + round, never the ball RNG. */
function pickAct(s, p) {
  if (!FLAGS.activities || !s.season || !s.fixture || !s.econ || !HUB_STAGES.includes(s.stage) || !p || typeof p.id !== 'string') return s;
  return pickActivity(s, p.id, makeRng(`${baseSeed(s)}|act|${roundKey(s)}|${s.salt}`));
}
function openMatchday(s) {
  if (!FLAGS.matchday || !s.season || !s.fixture || !['hub', 'semi', 'final', 'squad', 'plan'].includes(s.stage)) return s;
  const t = withSix(s);
  return { ...t, stage: 'matchday', fixture: { ...t.fixture, md: mdFor(t, t.clubs[0].six) } };
}
function matchdayGo(s) {
  if (s.stage !== 'matchday' || !s.fixture) return s;
  const t = withSix(s), fx = t.fixture;
  const seen = fx.mdDone ? (t.mdSeen || 0) : (t.mdSeen || 0) + 1;
  const base = { ...t, mdSeen: seen, fixture: { ...fx, mdDone: true } };
  delete base.fixture.mdThen;
  if (fx.mdThen === 'start') { const plan = livePlan(base); return planProblem(plan.overs) ? { ...base, stage: 'hub' } : seasonMatch({ ...base, stage: 'plan', plan }); }
  return { ...base, stage: 'plan', plan: livePlan(base) };
}
function backToSquad(s) {
  return ['matchday', 'plan'].includes(s.stage) && s.season && s.fixture ? { ...s, stage: 'squad' } : s;
}

// ---- b-p6: team sheet on the hub and one Start match (stage stays on the hub; the old squad and plan stages still work)
const HUB_STAGES = ['hub', 'semi', 'final'];
const onHub = (s) => !!(s && s.season && s.fixture && HUB_STAGES.includes(s.stage));
/** The six as saved; a club that never picked one gets the AI pick, kept from now on. */
function withSix(s) {
  if (s.clubs[0].six.length === SEASON.sixSize) return s;
  const n = clone(s);
  n.clubs[0].six = aiPickSix(n.clubs[0]);
  return n;
}
/** The plan the hub shows and Start uses: the player's own when it is for this match, else the suggested one for the current six. */
export function livePlan(s) {
  const t = withSix(s), key = planKey(t);
  if (t.plan.edited && t.plan.key === key) return t.plan;
  return { overs: suggestedOvers(t), fields: NEUTRAL_FIELDS(), edited: false, key };
}
/** Run an old stage-bound command from the hub, then put the stage back. `plan` replaces the stored plan first (the live one). Unchanged -> the same state. */
function viaStage(s, stage, fn, plan) {
  const staged = { ...withSix(s), stage, ...(plan ? { plan } : {}) };
  const n = fn(staged);
  return n === staged ? s : { ...n, stage: s.stage };
}
function teamSix(s, p) { return onHub(s) ? viaStage(s, 'squad', (x) => setSix(x, p)) : s; }
function teamPlan(s, p) { return onHub(s) ? viaStage(s, 'plan', (x) => editPlan(x, p), livePlan(s)) : s; }
function teamSuggest(s) {
  if (!onHub(s)) return s;
  const t = withSix(s), n = clone(t);
  n.plan = { overs: suggestedOvers(t), fields: NEUTRAL_FIELDS(), edited: false, key: planKey(t) };
  return n;
}
/** One Start match: the saved six and plan (suggested if none) go straight to the match. A broken plan does nothing. */
function startMatch(s) {
  if (!onHub(s)) return s;
  const t = withSix(s), plan = livePlan(t);
  if (planProblem(plan.overs)) return s;
  if (screenDue(t) && !(t.fixture && t.fixture.mdDone)) return { ...t, stage: 'matchday', fixture: { ...t.fixture, md: mdFor(t, t.clubs[0].six), mdThen: 'start' } }; // match-day screen first; Go starts the match
  return seasonMatch({ ...t, stage: 'plan', plan });
}

// ---- P11 training redo: plan, nets, spotlight wheel, coaches, courses. The maths is in core/training.js; these only route and seed.
const TRAIN_RNG = (s, tag, extra = '') => makeRng(`${s.season.seed}|${tag}|${s.training.week}|${extra}|${s.salt}`);
/** Mirror the plan into the named save fields (focus, effort, spotlight_id, last_plan) so a save reads plainly. Returns the same state when nothing moved. */
function sync(s) {
  if (s === undefined || !s.training) return s;
  const p = planOf(s), T = s.training, lp = T.last_plan || T.lastPlan || null;
  if (T.focus === p.focus && T.effort === p.effort && T.spotlight_id === p.spotlightId && T.last_plan === lp && !T.lastPlan && !T.sel) return s;
  const { lastPlan, sel, ...rest } = T;
  return { ...s, training: { ...rest, focus: p.focus, effort: p.effort, spotlight_id: p.spotlightId, coach_id: p.coachId, last_plan: lp } };
}
/** Tap the wheel (SPIN then STOP): the result waits in training.pending until Run nets. One spin a week, and only with a spotlight player. */
function spin(s, p) {
  const T = s.training, plan = planOf(s);
  const two = !!(p && p.slot === 2), key = two ? 'pending2' : 'pending'; // slot 2 = the Twin Spotlight Pass wheel
  if (!(two ? plan.spotlight2Id : plan.spotlightId) || (T[key] && T[key].week === T.week) || (T.nets && T.nets.week === T.week)) return s;
  const wheel = wheelSlices(plan.effort, coachStepInUse(s)), careful = !!(p && p.careful);
  const result = spinResult(TRAIN_RNG(s, two ? 'spin2' : 'spin'), wheel, careful);
  const n = clone(s);
  n.training[key] = { week: T.week, careful, wheel, result };
  return n;
}
function doRunNets(s) {
  const T = s.training;
  if (T.nets && T.nets.week === T.week) return s;
  const plan = planOf(s), pend = T.pending && T.pending.week === T.week && plan.spotlightId ? T.pending : null;
  const pend2 = T.pending2 && T.pending2.week === T.week && plan.spotlight2Id ? T.pending2 : null;
  const r = runNets(s, TRAIN_RNG(s, 'nets'), { ...(pend ? { wheel: pend.result } : {}), ...(pend2 ? { wheel2: pend2.result } : {}) });
  if (!r || !r.state || r.state === s) return s;
  const usedTwin = !!plan.spotlight2Id && (r.lines || []).some((l) => l.id === plan.spotlight2Id && l.wheelGain !== undefined);
  let n = clone(usedTwin ? useHeld(r.state, 'twin_drill') : r.state); // the Twin Pass is used up by the nets run it covered
  delete n.training.pending; delete n.training.pending2;
  n.training.nets = { week: T.week, lines: r.lines || [], cost: r.cost || 0, skipped: r.skipped || 0 };
  n.training.last_plan = { focus: plan.focus, effort: plan.effort, spotlight_id: plan.spotlightId || null, coachId: plan.coachId || null };
  return sync(n);
}
function courseSpin(s, p) {
  const id = p && p.coachId, T = s.training;
  if (!id || !canCourse(s, id).ok || (T.coursePending && T.coursePending.coachId === id)) return s;
  const c = coachList(s).find((x) => x.id === id);
  const wheel = courseWheel(c.step), careful = !!p.careful;
  const n = clone(s);
  n.training.coursePending = { coachId: id, careful, wheel, result: spinResult(TRAIN_RNG(s, 'course', id), wheel, careful) };
  return n;
}
function doRunCourse(s, p) {
  const id = p && p.coachId, pend = s.training.coursePending;
  if (!id || !pend || pend.coachId !== id || !canCourse(s, id).ok) return s;
  const cost = courseCost(s, id), paid = payCourse(s, cost); // Coins go through the economy; training's own deduct is bypassed
  if (cost > 0 && paid === s) return s;
  const lic = courseUsesLicence(s, id); // a 2nd course this season spends the Master Coach Licence
  const bare = { ...s }; delete bare.econ;
  const n = runCourse(bare, TRAIN_RNG(s, 'course', id), id, pend.result, lic);
  if (!n || n === bare) return s;
  const m = clone(n);
  if (paid.econ) m.econ = clone(paid.econ);
  if (lic && m.econ) m.econ = clone(useHeld(m, 'master_licence').econ);
  const was = coachList(s).find((x) => x.id === id), now = coachList(m).find((x) => x.id === id);
  m.training.courseDone = { week: s.training.week, coachId: id, name: was.name, from: was.step, to: now.step, gain: now.step - was.step, jackpot: !!pend.result.jackpot };
  delete m.training.coursePending;
  return m;
}
const clearWeek = (s) => { const n = clone(s); delete n.training.pending; delete n.training.pending2; delete n.training.nets; delete n.training.coursePending; return n; };
const viaTrain = (s, fn) => { if (s.stage !== 'train') return s; const n = fn(s); return n === s ? s : sync(n); };

/** The first-match strip is done (Skip). Once per save. */
function seeFirstStrip(s) {
  if (!s.stage || (s.seen && s.seen.firstStrip)) return s;
  return { ...s, seen: { ...(s.seen || {}), firstStrip: 1 } };
}
