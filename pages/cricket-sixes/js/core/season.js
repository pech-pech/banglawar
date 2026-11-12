// @ts-check
// Season scheduler, league table, top-4 bracket, AI-v-AI simulation. Pure and seeded: no Math.random, no clock, no DOM, no storage.
import { SEASON } from '../data/season.js';
import { FLAGS } from '../data/flags.js';
import { leagueOf } from '../data/leagues.js';
import { makeRng } from './rng.js';
import { newInnings, playOver, centreOf } from './match.js';
import { pickBowler, pickIntent, pickField, rivalCall } from './ai.js';
import { aiPickSix } from './clubs.js';

export const ME = 'c0';
const P = SEASON.points;

/**
 * Circle-method round robin. clubIds[0] is the home club (M): it plays each other club once, always as `a`.
 * Club order and round order are shuffled by rng; other pairs alternate home/away.
 * @param {string[]} clubIds @param {{shuffle:(a:any[])=>any[]}} rng
 * @returns {{a:string,b:string}[][]} 9 rounds of 5 pairs for 10 clubs, M's pair first
 */
export function makeSchedule(clubIds, rng) {
  const [home, ...others] = clubIds;
  const ring = rng.shuffle(others.slice());
  const n = clubIds.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const arr = [home, ...ring];
    const pairs = [{ a: home, b: arr[n - 1] }];
    for (let i = 1; i < n / 2; i++) {
      const x = arr[i], y = arr[n - 1 - i];
      pairs.push((i + r) % 2 === 0 ? { a: x, b: y } : { a: y, b: x });
    }
    rounds.push(pairs);
    ring.unshift(/** @type {string} */ (ring.pop())); // rotate everyone but the fixed club
  }
  return rng.shuffle(rounds);
}

const row0 = (/** @type {string} */ id) => ({ id, p: 0, w: 0, l: 0, t: 0, pts: 0, rf: 0, ra: 0 });

/** Order: points, run difference, wins, then club id. Never rng. Returns a new array. @param {any[]} table */
export function tableOrder(table) {
  return table.slice().sort((x, y) => y.pts - x.pts || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** Empty table, sorted. @param {string[]} clubIds */
export function makeTable(clubIds) { return tableOrder(clubIds.map(row0)); }

/**
 * Add one league result. Runs are derived from ra/rb (res.winner is not trusted). Unknown ids or a self-match return the table unchanged.
 * @param {any[]} table @param {{a:string,b:string,ra:number,rb:number}} res
 */
export function applyResult(table, res) {
  const ia = table.findIndex((r) => r.id === res.a), ib = table.findIndex((r) => r.id === res.b);
  if (ia < 0 || ib < 0 || ia === ib) return tableOrder(table);
  const t = table.map((r) => ({ ...r }));
  const apply = (/** @type {any} */ r, /** @type {number} */ f, /** @type {number} */ ag) => {
    r.p++; r.rf += f; r.ra += ag;
    if (f > ag) { r.w++; r.pts += P.win; } else if (f < ag) { r.l++; r.pts += P.loss; } else { r.t++; r.pts += P.tie; }
  };
  apply(t[ia], res.ra, res.rb); apply(t[ib], res.rb, res.ra);
  return tableOrder(t);
}

/** 1-based table place of a club (the table is re-ordered first). @param {any[]} table @param {string} id */
export function placeOf(table, id) { return tableOrder(table).findIndex((r) => r.id === id) + 1; }
/** @param {any[]} table @param {string} id */
export function inTopFour(table, id) { const p = placeOf(table, id); return p >= 1 && p <= SEASON.finalsTeams; }

/** Semis 1v4 and 2v3; the final is filled in by finalFrom. @param {any[]} table */
export function finalsDraw(table) {
  const o = tableOrder(table).map((r) => r.id);
  return { semis: [{ a: o[0], b: o[3], winner: null }, { a: o[1], b: o[2], winner: null }], final: { a: null, b: null, winner: null } };
}

/** Final from the two semi winners (1v4 winner is a). null until both are decided. @param {{winner:string|null}[]} semis */
export function finalFrom(semis) {
  return semis[0].winner && semis[1].winner ? { a: semis[0].winner, b: semis[1].winner, winner: null } : null;
}

/**
 * Knockout winner: more runs wins; equal runs go to the higher table place (no super over).
 * @param {{a:string,b:string,ra:number,rb:number}} res @param {number} seedA table place of a @param {number} seedB table place of b @returns {string} club id
 */
export function koWinner(res, seedA, seedB) {
  if (res.ra !== res.rb) return res.ra > res.rb ? res.a : res.b;
  return seedA <= seedB ? res.a : res.b;
}

/** TP for one match. @param {'league'|'semi'|'final'} kind @param {'won'|'tied'|'lost'} result @param {number} [league] 1-5 */
export function tpAward(kind, result, league = 1) {
  const T = SEASON.tp;
  const m = T.leagueMultiplier * leagueOf(league).tpMultiplier;
  if (kind === 'league') return (T.perMatch + (result === 'won' ? T.perWin : 0)) * m;
  if (kind === 'semi') return result === 'lost' ? T.semiLoser : 0; // the winner is paid for the final
  return result === 'won' ? T.champion : T.runnerUp;
}

/** Copy of a club's picked six, ready for the match core. */
function sixOf(/** @type {any} */ club) {
  const ids = club.six && club.six.length === 6 ? club.six : aiPickSix(club);
  return ids.map((/** @type {string} */ id) => ({ ...club.squad.find((/** @type {any} */ p) => p.id === id), overs: 0, figs: { r: 0, w: 0 }, inn: { r: 0, b: 0, out: false } }));
}

/**
 * Play one match between two clubs with the real match core, both sides on rivalCall.
 * a is home and chases; b bats first. The stream is keyed by season seed, kind, round, the pair and the salt only.
 * @param {any} state needs clubs, salt, season.seed (and season.table for knockouts) @param {string} a @param {string} b
 * @param {'league'|'semi'|'final'} kind @param {number} round
 */
export function simMatch(state, a, b, kind, round) {
  const ca = state.clubs.find((/** @type {any} */ c) => c.id === a), cb = state.clubs.find((/** @type {any} */ c) => c.id === b);
  const rng = makeRng(`${state.season.seed}|ai|${kind}|${round}|${a}|${b}|${state.salt || ''}`);
  const A = sixOf(ca), B = sixOf(cb), centre = centreOf(state); // the league's rival strength, same for both sides
  const innings = (/** @type {any[]} */ bat, /** @type {any[]} */ bowl, /** @type {number|null} */ target) => {
    const inn = newInnings(bat, bowl, target);
    while (!inn.done) {
      const goodBowl = rivalCall(rng, FLAGS.rivalGoodShare), goodBat = rivalCall(rng, FLAGS.rivalGoodShare);
      const batters = [bat[inn.crease[0]], bat[inn.crease[1]]];
      const bi = pickBowler(bowl, inn, batters, rng, goodBowl);
      const field = pickField(inn, batters, rng, goodBowl, centre);
      const intent = pickIntent(inn, target != null, rng, goodBat);
      playOver(rng, inn, bat, bowl, bi, intent, field, undefined, centre);
    }
    return inn;
  };
  const first = innings(B, A, null);
  const second = innings(A, B, first.runs);
  const res = { round, kind, a, b, ra: second.runs, wa: second.wk, rb: first.runs, wb: first.wk, winner: /** @type {string|null} */ (null) };
  if (kind === 'league') res.winner = res.ra > res.rb ? a : res.ra < res.rb ? b : null;
  else res.winner = koWinner(res, placeOf(state.season.table, a), placeOf(state.season.table, b));
  return res;
}

/**
 * The AI-v-AI league matches of one round (M's own pair is skipped; the store plays that one). Returns results, not state.
 * Each match has its own stream, so the order of calls and unrelated draws cannot change a result. The third argument of the
 * contract signature (rng) is not needed and is ignored.
 * @param {any} state @param {number} round 1..9
 */
export function simRound(state, round) {
  return state.season.fixtures[round - 1].filter((/** @type {any} */ p) => p.a !== ME && p.b !== ME).map((/** @type {any} */ p) => simMatch(state, p.a, p.b, 'league', round));
}

/** When M is not in the top 4: play both semis and the final. @param {any} state needs season.table @returns {{finals:any, champion:string, results:any[]}} */
export function simFinals(state) {
  const finals = finalsDraw(state.season.table);
  const results = [];
  finals.semis.forEach((s, i) => { const r = simMatch(state, s.a, s.b, 'semi', 10 + i); s.winner = r.winner; results.push(r); });
  finals.final = /** @type {any} */ (finalFrom(finals.semis));
  const fr = simMatch(state, finals.final.a, finals.final.b, 'final', 12);
  finals.final.winner = fr.winner; results.push(fr);
  return { finals, champion: /** @type {string} */ (fr.winner), results };
}
