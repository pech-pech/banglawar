// @ts-check
// Pure commands: (state, payload) -> new state. rng is derived per command from state, never stored.
import { makeRng } from '../core/rng.js';
import { eligibleBowlers, newInnings, playOver, phaseOf, centreOf } from '../core/match.js';
import { pickBowler, pickIntent, pickField, rivalCall } from '../core/ai.js';
import { makeStartState } from '../data/m0-fixture.js';
import { FLAGS } from '../data/flags.js';
import { SEASON } from '../data/season.js';
import { SKILLS, COACHES } from '../data/training.js';
import { makeClubs, growClubs, aiPickSix } from '../core/clubs.js';
import { makeSchedule, makeTable, applyResult, placeOf, inTopFour, finalsDraw, finalFrom, koWinner, tpAward, simRound, simMatch, simFinals, ME } from '../core/season.js';
import { pickCoach, doDrill, endWeek, levelOfXp } from '../core/training.js';
import { unlockNode, makeFx } from '../core/skills.js';
import { defaultOvers } from '../core/plan.js';
import { newRun, closeSeason, remakeRivals, carryOf, applyCarry } from '../core/run.js';
import { RUN } from '../data/run.js';

const ovStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Figures snapshot of innings 1 (newInnings resets some player fields before the chase). */
function summarise(s) {
  const inn = s.inn1;
  return {
    runs: inn.runs, wk: inn.wk, balls: inn.balls, overs: ovStr(inn.balls),
    bat: s.rival.players.map((p) => ({ name: p.name, bat: p.bat, r: p.inn.r, b: p.inn.b, out: p.inn.out })),
    bowl: s.me.players.map((p) => ({ name: p.name, bowl: p.bowl, overs: p.overs, r: p.figs.r, w: p.figs.w })),
  };
}

/** Default Call: first eligible bowler, field A. null when no one can bowl. */
function defaultCall(s) {
  const el = eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last);
  if (!el.length) return null;
  if (s.season && s.plan) { // season: the planned bowler (when allowed) and the planned field for this phase
    const planned = s.plan.overs[s.inn1.over - 1];
    return { bowler: el.includes(planned) ? planned : el[0], field: s.plan.fields[phaseOf(s.inn1.over)] || 'A' };
  }
  return { bowler: el[0], field: 'A' };
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
    const balls = playOver(rng, inn, n.rival.players, n.me.players, call.bowler, intent, call.field, fxOf(n), centreOf(n));
    n.last = { balls, over, bowler: call.bowler, intent, field: call.field };
    if (inn.done) { n.stage = 'break'; n.call = null; n.inn1Summary = summarise(n); } else n.call = defaultCall(n);
    return n;
  }
  if (n.stage === 'chase') {
    const inn = n.inn2;
    const rng = makeRng(`${n.seed}|${n.stage}|${inn.over}`);
    const intent = p && ['D', 'R', 'A'].includes(p.intent) ? p.intent : 'R';
    const good = rivalCall(rng, FLAGS.rivalGoodShare);
    const batters = [n.me.players[inn.crease[0]], n.me.players[inn.crease[1]]];
    const bowler = pickBowler(n.rival.players, inn, batters, rng, good);
    const field = pickField(inn, batters, rng, good, centreOf(n));
    const over = inn.over;
    const balls = playOver(rng, inn, n.me.players, n.rival.players, bowler, intent, field, fxOf(n), centreOf(n));
    n.last = { balls, over, bowler, intent, field };
    if (inn.done) {
      n.stage = 'done';
      n.result = inn.runs > n.inn1.runs ? 'won' : inn.runs === n.inn1.runs ? 'tied' : 'lost';
    }
    return n;
  }
  return s;
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
const FOCI = ['Power', 'Technique', 'Pace', 'Craft'];
const COACH_NAMES = ['Okafor', 'Lindqvist', 'Mehta', 'Bryce', 'Haldane', 'Pryce', 'Tanaka', 'Vickers'];
const DEFAULT_OVERS = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Level 3 coach candidates, one focus each (training core's pickCoach keeps the one picked). */
function makeCandidates(rng) {
  const foci = rng.shuffle(FOCI.slice()).slice(0, 3);
  const names = rng.shuffle(COACH_NAMES.slice());
  return foci.map((f, i) => ({
    id: `k${i}`, name: names[i], candidate: true,
    xp: Object.fromEntries(FOCI.map((x) => [x, x === f ? COACHES.xp[2] : 0])),
    lv: Object.fromEntries(FOCI.map((x) => [x, x === f ? 3 : 0])),
  }));
}

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
  const season = newSeasonData(seed, 1, clubs);
  return {
    v: 2, salt: '', seed, stage: 'coach', ...blankMatch(), run: newRun(seed),
    season, clubs, plan: { overs: DEFAULT_OVERS.slice(), fields: ['A', 'A', 'A'], edited: false, key: '' },
    coaches: makeCandidates(makeRng(`${seed}|coaches`)), coachPicked: false, nets: 1,
    training: { tp: 450, week: 1, drilled: {}, nodeBought: {}, last: null, weekLog: [], weekStart: {}, drillCount: 0 },
    fixture: leagueFixture(season, 1),
  };
}

function setSix(s, p) {
  if (s.stage !== 'squad' || !p || !Array.isArray(p.ids) || p.ids.length !== SEASON.sixSize) return s;
  const have = new Set(s.clubs[0].squad.map((x) => x.id));
  if (new Set(p.ids).size !== p.ids.length || !p.ids.every((id) => have.has(id))) return s;
  const n = clone(s);
  n.clubs[0].six = p.ids.slice();
  const key = planKey(s);
  if (!(s.plan.edited && s.plan.key === key)) n.plan = { overs: suggestedOvers(n), fields: ['A', 'A', 'A'], edited: false, key }; // never overwrite a plan the player set for this match
  n.stage = 'plan';
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
  return defaultOvers(mine.six.map((id) => byId(mine, id)), aiPickSix(opp).map((id) => byId(opp, id)));
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
  const n = {
    ...s, ...blankMatch(), seed, stage: 'bowl',
    me: { name: mine.name, players: mine.six.map((id) => copyPlayer(byId(mine, id))) },
    rival: { name: opp.name, players: aiPickSix(opp).map((id) => copyPlayer(byId(opp, id))) },
  };
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
  const tp = tpAward(fx.kind, outcome, se.league);
  n.training.tp += tp; se.tpWon += tp;
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
  if (cmd === 'NewGame') return newGame(payload);
  if (cmd === 'NewMatch' && !(s && s.season)) return newMatch(payload);
  if (!s || !s.stage) return s;
  switch (cmd) {
    case 'NewMatch': return seasonMatch(s);
    case 'Reseed': return payload && typeof payload.salt === 'string' && payload.salt !== s.salt ? { ...s, salt: payload.salt } : s;
    case 'PickCoach': { const n = s.stage === 'coach' ? pickCoach(s, payload || {}) : s; return n === s ? s : { ...n, stage: 'hub' }; }
    case 'OpenSquad': return ['hub', 'semi', 'final', 'plan'].includes(s.stage) && s.season ? { ...s, stage: 'squad' } : s;
    case 'SetSix': return setSix(s, payload);
    case 'SetPlan': return setPlan(s, payload);
    case 'TeamSix': return teamSix(s, payload);
    case 'TeamPlan': return teamPlan(s, payload);
    case 'TeamSuggest': return teamSuggest(s);
    case 'StartMatch': return startMatch(s);
    case 'EditPlan': return editPlan(s, payload);
    case 'FinishMatch': return finishMatch(s);
    case 'Drill': return s.stage === 'train' ? doDrill(s, payload || {}, makeRng(`${s.season.seed}|drill|${s.training.week}|${payload && payload.playerId}|${s.salt}`)) : s;
    case 'UnlockNode': return s.stage === 'train' ? unlockNode(s, payload || {}) : s;
    case 'EndWeek': return s.stage === 'train' ? { ...endWeek(s), stage: 'week' } : s;
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
  return { overs: suggestedOvers(t), fields: ['A', 'A', 'A'], edited: false, key };
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
  n.plan = { overs: suggestedOvers(t), fields: ['A', 'A', 'A'], edited: false, key: planKey(t) };
  return n;
}
/** One Start match: the saved six and plan (suggested if none) go straight to the match. A broken plan does nothing. */
function startMatch(s) {
  if (!onHub(s)) return s;
  const t = withSix(s), plan = livePlan(t);
  if (planProblem(plan.overs)) return s;
  return seasonMatch({ ...t, stage: 'plan', plan });
}
