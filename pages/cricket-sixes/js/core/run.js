// @ts-check
// The run: 12 seasons (RUN.seasons), table-only promotion, chapters, score, carryover. Pure and seeded: no Math.random, no clock, no DOM.
import { RUN } from '../data/run.js';
import { LEAGUES, leagueOf } from '../data/leagues.js';
import { SEASON } from '../data/season.js';
import { COACHES } from '../data/training.js';
import { makeRng } from './rng.js';
import { makeClubs, aiPickSix } from './clubs.js';
import { placeOf, ME } from './season.js';
import { shownAbility, rawAbility, capSum } from './ability.js';

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));
const clone = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));
const FOCI = ['Power', 'Technique', 'Pace', 'Craft'];

/** Fresh run record. @param {string} root game seed (run 1) or the run's root seed @param {number} [no] run number */
export function newRun(root, no = 1) {
  return { no, root: String(root), n: 1, league: 1, best: 1, titles: 0, finals: 0, wins: 0, bestAbility: 0, history: [], chapters: {}, last: null, ended: false };
}

/** 1 -> "1st", 12 -> "12th". @param {number} n */
export function ordinal(n) {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'}`;
}

/** TP multiplier of a league. @param {number} league */
export const tpMultiplier = (league) => leagueOf(league).tpMultiplier;

/** Best club-grown player (the carried legend never counts). @param {any} state */
function bestOwn(state) {
  const mine = state.clubs.find((/** @type {any} */ c) => c.id === ME).squad.filter((/** @type {any} */ p) => !p.legend);
  return mine.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => shownAbility(b) - shownAbility(a) || (a.id < b.id ? -1 : 1))[0] || null;
}

/** Place, promotion and the plain line for a finished season. @param {any} state */
export function seasonResult(state) {
  const se = state.season, league = se.league || 1;
  const place = placeOf(se.table, ME);
  const promoted = place <= RUN.promoteTop && league < LEAGUES.max;
  const toLeague = promoted ? league + 1 : league;
  const line = promoted ? `Promoted to League ${toLeague}.`
    : league >= LEAGUES.max ? `Finished ${ordinal(place)}. League ${LEAGUES.max} is the top league.`
      : `Finished ${ordinal(place)}. Top ${RUN.promoteTop} go up.`;
  return { place, promoted, toLeague, stayed: !promoted, line };
}

/** @param {any} run @param {any} feat */
function featMet(run, feat) {
  const v = feat.kind === 'wins' ? run.wins : feat.kind === 'finals' ? run.finals : feat.kind === 'titles' ? run.titles : run.best;
  return v >= feat.target;
}

/**
 * Close the season on entry to 'end': record it, apply promotion data, fire the chapter, pay its TP, claim any open feat now met.
 * Runs once per season (run.last.n guards it). Returns a new state.
 * @param {any} state
 */
export function closeSeason(state) {
  if (!state.run || (state.run.last && state.run.last.n === state.season.n)) return state;
  const n = clone(state), se = n.season, run = n.run;
  const res = seasonResult(n);
  const row = se.table.find((/** @type {any} */ r) => r.id === ME);
  const finals = res.place >= 1 && res.place <= SEASON.finalsTeams, champion = se.champion === ME;
  run.history.push({ n: se.n, league: se.league || 1, place: res.place, wins: row ? row.w : 0, finals, champion });
  run.titles += champion ? 1 : 0; run.finals += finals ? 1 : 0; run.wins += row ? row.w : 0;
  run.best = Math.max(run.best, res.toLeague);
  const star = bestOwn(n);
  if (star) run.bestAbility = Math.max(run.bestAbility, shownAbility(star));
  let chapter = null;
  const def = RUN.chapters.find((c) => c.season === se.n);
  if (def) {
    run.chapters[def.season] = { season: def.season, name: def.name, tp: def.tp, coins: def.coins, medals: 0, coinsPaid: false, featDone: false, featSeason: null };
    n.training.tp += def.tp; // Coins and Medals are logged only: no currency exists yet
  }
  const claimed = [];
  for (const c of RUN.chapters) {
    const rec = run.chapters[c.season];
    if (rec && !rec.featDone && featMet(run, c.feat)) {
      rec.featDone = true; rec.featSeason = se.n; rec.medals = c.medals;
      if (c.season !== se.n) claimed.push(c.name);
    }
  }
  if (def) chapter = { name: def.name, reward: `TP ${def.tp}`, feat: { text: def.feat.text, done: run.chapters[def.season].featDone } };
  run.last = { n: se.n, league: se.league || 1, ...res, champion, finals, chapter, claimed };
  return n;
}

/** Chapter lines for the hub header. @param {any} run */
export function chapterNames(run) {
  const fired = RUN.chapters.filter((c) => run.chapters[c.season]);
  const next = RUN.chapters.find((c) => !run.chapters[c.season]);
  return { chapter: fired.length ? fired[fired.length - 1].name : null, nextChapter: next ? { season: next.season, name: next.name } : null };
}

/** Score rows and total. Inputs with no game source yet count 0 and are marked pending. @param {any} state */
export function runScore(state) {
  const run = state.run;
  const star = bestOwn(state);
  const best = Math.max(run.bestAbility, star ? shownAbility(star) : 0);
  const values = { titles: run.titles, league: run.best, sgrads: 0, fans: 0, best_player: best, club_build: 0, finals: run.finals };
  const rows = RUN.score.inputs.map((d) => {
    const v = values[/** @type {keyof typeof values} */ (d.key)];
    const frac = d.key === 'league' ? (v - 1) / (d.full - 1) : d.floor != null ? (v - d.floor) / (d.full - d.floor) : v / d.full;
    const points = d.pending ? 0 : Math.round(d.weight * clamp(frac, 0, 1));
    return { key: d.key, label: d.label, value: d.pending ? 0 : v, points, maxPoints: d.weight, pending: !!d.pending };
  });
  const sum = rows.reduce((a, r) => a + r.points, 0);
  const score = Math.min(RUN.score.max, Math.round(sum / RUN.score.roundTo) * RUN.score.roundTo);
  return { score, rows };
}

/** Rivals re-made at the league's mean. New names and seed `${seed}|L${league}|s${n}`; c0 is untouched. @param {any[]} clubs @param {string} seed @param {number} league @param {number} n */
export function remakeRivals(clubs, seed, league, n) {
  const D = { ...SEASON, league: { number: league, ratingMean: leagueOf(league).ratingMean, ratingSd: LEAGUES.ratingSd } };
  const fresh = makeClubs(makeRng(`${seed}|L${league}|s${n}`), D);
  return [clubs.find((c) => c.id === ME), ...fresh.slice(1)];
}

/** The legend as he arrives: every rating at RUN.carry.legendPct of his final value, potential capped at that level. @param {any} p */
export function legendOf(p) {
  const f = RUN.carry.legendPct / 100;
  const L = { ...clone(p), legend: true };
  for (const k of ['bp', 'bs', 'spd', 'bsk']) L[k] = Math.max(1, Math.round(p[k] * f));
  L.drillsHere = SEASON.myDrills.full; L.nodes = { bat: 0, bowl: 0 };
  const sum = L.bp + L.bs + L.spd + L.bsk;
  let P = clamp(Math.round(rawAbility(L)), 20, 200);
  while (P < 200 && capSum(P) < sum) P++;
  L.potential = P;
  return L;
}

/** Coach at the carried level, in his best focus. @param {any} c */
export function carryCoach(c) {
  const best = FOCI.slice().sort((a, b) => (c.lv[b] || 0) - (c.lv[a] || 0))[0];
  const L = RUN.carry.coachLevel;
  return { ...clone(c), candidate: false, lv: Object.fromEntries(FOCI.map((f) => [f, f === best ? L : 0])), xp: Object.fromEntries(FOCI.map((f) => [f, f === best ? COACHES.xp[L - 1] : 0])) };
}

/** What would carry into the next run. @param {any} state @param {string} [coachId] */
export function carryOf(state, coachId) {
  const own = bestOwn(state);
  const staff = (state.coaches || []).filter((/** @type {any} */ c) => !c.candidate);
  const coach = staff.find((/** @type {any} */ c) => c.id === coachId) || staff[0] || null;
  return { legend: own ? legendOf(own) : null, coach: coach ? carryCoach(coach) : null };
}

/** Put the carried legend (replacing M's weakest) and coach into a fresh new-game state. @param {any} fresh @param {{legend:any, coach:any}} carry */
export function applyCarry(fresh, carry) {
  const n = clone(fresh), mine = n.clubs.find((/** @type {any} */ c) => c.id === ME);
  if (carry.legend) {
    const weakest = mine.squad.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => rawAbility(a) - rawAbility(b) || (a.id < b.id ? -1 : 1))[0];
    const i = mine.squad.findIndex((/** @type {any} */ p) => p.id === weakest.id);
    mine.squad[i] = { ...carry.legend, id: weakest.id };
    mine.six = aiPickSix(mine);
  }
  if (carry.coach) { n.coaches = [carry.coach]; n.coachPicked = true; n.stage = 'hub'; }
  return n;
}

