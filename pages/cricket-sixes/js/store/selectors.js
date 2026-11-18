// @ts-check
// View models. Pure; views read only these.
import { phaseOf, PHASE_NAMES, matchup, eligibleBowlers, centreOf } from '../core/match.js';
import { gradeOf, previewCount, shownAbility, shownBat, shownBowl, atPeak, isMax, batPart, bowlPart } from '../core/ability.js';
import { SEASON } from '../data/season.js';
import { DRILLS, SKILLS, TRAIN2 } from '../data/training.js';
import { aiPickSix } from '../core/clubs.js';
import { tagInfo } from '../core/tags.js';
import { tableOrder, placeOf, ME, matchPay, gapLetters, koWinner } from '../core/season.js';
import { scoutPassed, planOf, netsPreview, coachList, scoutCandidates, canSign, coachQuality, coachStepInUse, courseCost, courseUsesLicence, canCourse, twinHeld, licenceHeld, effortOdds, meanGain, wheelSlices, courseWheel, EFFORTS, FOCUSES, MAX_COACHES, sixOf, drillRoom, focusRating } from '../core/training.js';
import { netsFacLevel, netsQuality } from '../core/training.js'; // wa1 train
import { letterOfRaw, letterOfShown, letterOfStep, ticksOfRaw, fillOfRaw, stepOfRaw } from '../core/letters.js';
import { nodeStatus, treeBoost, treeOf, NODE_COUNT } from '../core/skills.js';
import { goldSlot, goldenNext } from './spins/golden.js';
import { windowFor } from '../core/golden-over.js';
import { isWheelMatch, rivalBowler, suggestedBowler, modelOf } from './wheelmatch-store.js';
import { planProblem, livePlan, squadFull, canSell, squadMax } from './commands.js';
import { recruitList, recruitRec, recruitOpen } from '../core/recruit.js';
import { skewOn } from '../core/skew.js';
import { wageOf } from '../core/economy.js';
import { RUN, SQUAD } from '../data/run.js';
import { seasonResult, chapterNames, runScore, carryOf } from '../core/run.js';
import { PAIRING } from '../data/pairing.js';
import { coachVmFields } from '../core/coach-vmfields.js';
import { FLAGS } from '../data/flags.js';
import { whyShort, keyBall } from '../ui/why.js';
import { ACT } from '../data/activities.js';
import { activityOptions, trialOf, canSignTrial } from '../core/activities.js';
import { freePickOptions, freePickPending, matchIncome } from '../core/economy.js';
import { MD } from '../data/matchday.js';
import { ECON as ECON_DATA } from '../data/economy.js';
const ECON_FANS_GATE = ECON_DATA.STADIUM_FANS;
import { WM, NODES } from '../data/wheelmeta.js';
import { metaOf, rankOf, tierOf, tierNow, canBuy, effective, metaWheel, otherMultOf, tokenOptions, powerDone, nextTierUp } from '../core/wheelmeta.js';
import { teamBoost, roarAt, resolvePep, matchCoachText } from '../core/matchday.js';
import { matchCoachOf } from '../core/training.js';
import { clinicCoachVM, clinicBoostMap } from '../core/clinic-vm.js'; /* VM:T6 */
export { clinicWheelVM } from '../core/clinic-vm.js'; /* VM:T6 */
import { mdSpinVM, findSpinVM, scoutSpinVM, finalsSpinVM } from './wmstore.js';
import { scoutSliceRow } from './wheels/scout.js';
import { wmTokens } from './wmstore.js'; // wa1 wire: token buttons for Hype / Toss / Pep / Scout / Finals
import { BATS, BOWLS, CELLS, COMBOS, SEEN_BALLS, cellIndex, cellOf, cellName, comboOf, isBook, newBook, winOf, nearestCell } from '../core/pairing.js';

const ovStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const scoreOf = (inn) => ({ runs: inn.runs, wk: inn.wk, balls: inn.balls, overs: ovStr(inn.balls) });
const gradeChip = (p) => gradeOf(p) || '?';
const phaseNum = (inn) => phaseOf(Math.min(inn.over, 10));

function crease(inn, players, extra) {
  return inn.crease.map((pi, k) => {
    const p = players[pi];
    const row = { i: pi, name: p.name, bat: p.bat, r: p.inn.r, b: p.inn.b, onStrike: inn.strike === k };
    return extra ? Object.assign(row, extra(p, pi)) : row;
  });
}

/** Batters in the order a bowler meets them: striker, non-striker, then the next batters in order. */
function battersFromStriker(inn, players) {
  const order = [inn.crease[inn.strike], inn.crease[1 - inn.strike]];
  for (let i = inn.next; i < players.length; i++) order.push(i);
  return order.filter((i) => !players[i].inn.out);
}

/** P13: the inline why line for the last over on the bowl / chase call screen. {key, text, say} or null (flag off, first over of the innings). Derived only; nothing saved. */
export function lastWhyVM(s) {
  if (!FLAGS.whyInline || !s || !s.last || !(s.last.balls || []).length) return null;
  const you = s.stage === 'chase' ? 'bat' : 'bowl';
  const bats = (you === 'bowl' ? s.rival : s.me).players, bowls = (you === 'bowl' ? s.me : s.rival).players;
  const bw = bowls[s.last.bowler] || {};
  const balls = s.last.balls.slice(0, 6);
  const key = keyBall(balls);
  if (key < 0) return null;
  const b = balls[key], bt = bats[b.batter] || {};
  const r = whyShort({ ...b, bowlType: bw.bowl }, { you, K: bw.bowl, R: bt.bat, bat: bt.name, bowl: bw.name });
  return { key, text: r.text, say: r.say };
}

export function bowlVM(s) {
  const inn = s.inn1, me = s.me.players, bats = s.rival.players;
  const ph = phaseNum(inn);
  const el = eligibleBowlers(me, inn.over, inn.last);
  const order = battersFromStriker(inn, bats);
  const bowlers = me.map((p, i) => {
    const eligible = el.includes(i);
    const reason = eligible ? null : i === inn.last ? 'bowled last' : p.overs >= 2 ? '2 overs' : 'must save overs';
    const previews = order.slice(0, previewCount(p)).map((bi) => {
      const m = matchup('bowl', bats[bi], p, ph);
      return { name: bats[bi].name, bat: bats[bi].bat, label: m.label, g: m.g, inPhase: m.inPhase };
    });
    return { i, name: p.name, bowl: p.bowl, overs: p.overs, eligible, reason, grade: gradeChip(p), previews, ability: shownAbility(p),
      book: eligible ? bowlBookLine(isBook(s.book) ? s.book : null, crease(inn, bats), p.bowl, ph) : null };
  });
  const call = s.call || { bowler: el.length ? el[0] : -1, field: 'P' };
  // 12b suggestion chip (never pre-applied; the call itself starts neutral: Protect). League 1 only. TODO: or the club bought a Coach (no coach-buying code yet).
  // Pair rule: Attack if (bp1+bp2)/2 + (bs1+bs2)/2 < 2*centre ("weak pair"). Protect chip only for a big hitting pair (mean bp - centre >= 8).
  // Anything else is not worth 1 win point (12b table 1), so no chip.
  const pair = inn.crease.map((i) => bats[i]).filter(Boolean);
  const showHint = !!(s.season && (s.season.league || 1) === 1) && pair.length > 0;
  const mean = (k) => pair.reduce((a, b) => a + b[k], 0) / (pair.length || 1);
  const centre = centreOf(s);
  const pick = mean('bp') + mean('bs') < 2 * centre ? 'A' : 'P';
  const worth = pick === 'A' || mean('bp') - centre >= 8;
  const names = pair.map((b) => b.name).join(' and ');
  // The reason names the pair and uses the same rule that picked the chip, so it can never contradict it.
  const why = pick === 'A' ? `${names}: weak bats on average, try Attack` : `${names}: big hitters, keep Protect`;
  const fieldHint = showHint && worth ? { pick, why } : null;
  return {
    over: inn.over, phase: ph, phaseName: PHASE_NAMES[ph], score: scoreOf(inn),
    crease: crease(inn, bats), bowlers, call, batNames: bats.map((p) => p.name), bowlNames: me.map((p) => p.name), fieldHint,
    canBowl: s.stage === 'bowl' && el.includes(call.bowler), last: s.last, lastWhy: lastWhyVM(s), firstStrip: firstStripOn(s),
    bookNote: bowlers.some((b) => b.book) ? BOOK_PICK_NOTE : null,
    ...mdExtras(s, inn.over - 1),
  };
}

export function chaseVM(s) {
  const inn = s.inn2, me = s.me.players, ai = s.rival.players;
  const ph = phaseNum(inn);
  const target = s.inn1.runs + 1;
  const aiOrder = ai.map((p, i) => i).filter((i) => ai[i].overs < 2)
    .sort((a, b) => (ai[a].overs - ai[b].overs) || (a - b));
  const last = s.last;
  const lb = last ? ai[last.bowler] : null;
  return {
    over: inn.over, phase: ph, phaseName: PHASE_NAMES[ph], target,
    need: Math.max(0, target - inn.runs), ballsLeft: Math.max(0, (11 - inn.over) * 6),
    score: scoreOf(inn), batNames: me.map((p) => p.name), bowlNames: ai.map((p) => p.name),
    crease: crease(inn, me, (p) => ({
      grade: gradeChip(p), ability: shownAbility(p), // one scale: the 20-200 overall ability, same helper as the team sheet, training and player sheet

      previews: aiOrder.slice(0, previewCount(p)).map((bi) => {
        const m = matchup('bat', p, ai[bi], ph);
        return { name: ai[bi].name, bowl: ai[bi].bowl, label: m.label, g: m.g, inPhase: m.inPhase };
      }),
    })),
    aiBowler: lb ? { name: lb.name, bowl: lb.bowl } : null,
    // 12b suggestion chip: League 1 only (TODO: or a Coach), only where worth >= 1 win point: Attack in the last 3 overs. Steady is the default, so no chip before that.
    intentHint: s.season && (s.season.league || 1) === 1 && inn.over >= 8
      ? { pick: 'A', why: 'Last 3 overs: Attack. Before that: Steady.' } : null,
    last, lastWhy: lastWhyVM(s), ...mdExtras(s, 10 + inn.over - 1),
  };
}

export function breakVM(s) {
  const sum = s.inn1Summary;
  const bat = sum.bat.map((x, i) => ({ x, i })).filter(({ x }) => x.b > 0)
    .sort((a, b) => b.x.r - a.x.r || a.i - b.i).slice(0, 2).map(({ x }) => x);
  const bowl = sum.bowl.map((x, i) => ({ x, i })).filter(({ x }) => x.overs > 0)
    .sort((a, b) => b.x.w - a.x.w || a.x.r - b.x.r || a.i - b.i).slice(0, 2).map(({ x }) => x);
  return { runs: sum.runs, wk: sum.wk, overs: sum.overs, target: sum.runs + 1, top: { bat, bowl } };
}

const RESULT_KIND = { league: 'League match', semi: 'Semi-final', final: 'Final' };
export function resultVM(s) {
  const a = s.inn1, b = s.inn2;
  let line = 'Tied';
  if (s.result === 'won') { const w = 5 - b.wk; line = `You won by ${w} wicket${w === 1 ? '' : 's'}`; }
  else if (s.result === 'lost') { const r = a.runs - b.runs; line = `You lost by ${r} run${r === 1 ? '' : 's'}`; }
  // Rival club name, match kind and TP for this match (TP is paid when the match is finished, same rule as finishMatch).
  const fx = s.season && s.fixture ? s.fixture : null;
  const opp = fx ? s.clubs.find((c) => c.id === fx.opp) : null;
  let tpEarned = null, pay = null;
  if (fx && s.me && s.me.players) {
    let outcome = s.result;
    if (fx.kind !== 'league') {
      const w = koWinner({ a: ME, b: fx.opp, ra: b.runs, rb: a.runs }, placeOf(s.season.table, ME), placeOf(s.season.table, fx.opp));
      outcome = w === ME ? 'won' : 'lost';
    }
    pay = matchPay(s, { outcome, kind: fx.kind });
    tpEarned = pay.total;
  }
  return {
    result: s.result, line, inn1: scoreOf(a), inn2: scoreOf(b), inSeason: !!s.season, seed: s.seed,
    oppName: opp ? opp.name : 'Rival', kindLabel: fx ? RESULT_KIND[fx.kind] : 'Friendly', tpEarned, pay, money: moneyPreview(s, pay),
    finals: spokesOn(finalsSpinVM(s), s, 'finals'), look: FLAGS.wheelMeta ? craftLook(s) : null, // wheel meta: the Finals prize reel (null with the flag off / a league match)
  };
}
/** r9 QA3 M1: what FinishMatch will pay and charge for this match (the same matchIncome call and hype index), shown on the result screen.
 *  null with the features off, outside a season or without an economy. crowd = the match-day hype word, or null without match day. */
function moneyPreview(s, pay) {
  const fx = s.season && s.fixture ? s.fixture : null;
  if (!fx || !s.econ || !pay || !(FLAGS.matchday || FLAGS.activities)) return null;
  let outcome = s.result;
  if (fx.kind !== 'league') outcome = koWinner({ a: ME, b: fx.opp, ra: s.inn2.runs, rb: s.inn1.runs }, placeOf(s.season.table, ME), placeOf(s.season.table, fx.opp)) === ME ? 'won' : 'lost';
  const md = FLAGS.matchday && fx.md ? fx.md : null;
  let inc = null; try { inc = matchIncome(s, { win: outcome === 'won', tie: outcome === 'tied', ...(md ? { hypeIdx: md.hypeIdx } : {}) }); } catch (e) { return null; }
  const e = s.econ, coinsIn = inc.gate + inc.winBonus + inc.shop, due = inc.wages + inc.upkeep + (e.arrears | 0), left = (e.coins | 0) + coinsIn;
  return {
    crowd: md ? { level: md.hype, word: HYPE_WORD[md.hype] || 'Crowd' } : null,
    fans: inc.fans | 0, gate: inc.gate | 0, wages: inc.wages | 0,
    extra: (inc.winBonus | 0) + (inc.shop | 0), upkeep: inc.upkeep | 0, winBonus: inc.winBonus | 0, shop: inc.shop | 0,
    net: inc.net | 0, coinsAfter: Math.max(0, left - due), short: due > left ? due - left : 0,
  };
}

// ---------------------------------------------------------------- season and training (CONTRACT m0 section 5)
const RATING_KEY = { bp: 'batPower', bs: 'batSkill', spd: 'bowlSpeed', bsk: 'bowlSkill' };
const RATINGS = ['bp', 'bs', 'spd', 'bsk'];
const pipsOf = (p) => Math.min(DRILLS.revealAfter, p.drillsHere | 0);
const mine = (s) => s.clubs[0];
const club = (s, id) => s.clubs.find((c) => c.id === id);
const clubName = (s, id) => (id ? club(s, id).name : null);
const player = (s, id) => mine(s).squad.find((p) => p.id === id) || null;
const sixIds = (s) => (mine(s).six.length === SEASON.sixSize ? mine(s).six : aiPickSix(mine(s)));
const overall = (p) => 0.5 * batPart(p) + 0.5 * bowlPart(p);
const strengthOf = (c, ids) => ids.reduce((a, id) => a + overall(c.squad.find((p) => p.id === id)), 0) / ids.length;

function tableRows(s) {
  return tableOrder(s.season.table).map((r, i) => ({ pos: i + 1, name: clubName(s, r.id), tag: tagInfo(club(s, r.id)), p: r.p, w: r.w, l: r.l, t: r.t, pts: r.pts, rd: r.rf - r.ra, me: r.id === ME }));
}

const KIND_WORD = { league: 'League match', semi: 'Semi-final', final: 'Final' };
const PHASE_WORD = { league: 'League', semi: 'Semi-final', final: 'Final', over: 'Season over' };

export function hubVM(s) {
  const se = s.season, fx = s.fixture;
  const rows = tableRows(s);
  const at = Math.max(0, rows.findIndex((r) => r.me));
  const from = Math.min(Math.max(0, at - 2), rows.length - 5);
  let next = { oppName: '', kindWord: PHASE_WORD[se.phase], oppStrength: 'Even' };
  if (fx) {
    const opp = club(s, fx.opp);
    const d = strengthOf(opp, aiPickSix(opp)) - strengthOf(mine(s), sixIds(s));
    next = { oppName: opp.name, tag: tagInfo(opp), kindWord: KIND_WORD[fx.kind], oppStrength: d > 2 ? 'Stronger' : d < -2 ? 'Weaker' : 'Even', letters: gapLetters(s, opp) };
  }
  return {
    season: { n: se.n, league: se.league }, round: se.phase === 'league' ? se.round : se.phase === 'semi' ? SEASON.leagueMatches + 1 : SEASON.leagueMatches + 2,
    phaseWord: PHASE_WORD[se.phase], next, table5: rows.slice(from, from + 5), tp: s.training.tp, cta: 'Pick your six',
    run: s.run ? { season: se.n, of: RUN.seasons, league: se.league || 1, ...chapterNames(s.run) } : undefined,
    notice: noticeOf(s), squadFull: squadFull(s),
  };
}

/** The one gentle line after a v5 load (SPEC s7). null once dismissed. */
export function noticeOf(s) {
  const keys = String(s.notice || '').split('+');
  const lines = [];
  if (keys.includes('squad8')) { const n = (s.releaseLedger || []).length; lines.push(`The squad is now ${SQUAD.size}.${n ? ` ${n} player${n === 1 ? '' : 's'} moved on.` : ''}`); }
  if (keys.includes('econ-backfill')) lines.push('Club accounts caught up for the matches you already played.');
  if (!lines.length) return null;
  return { key: keys.includes('squad8') ? 'squad8' : 'econ-backfill', line: lines.join(' '), moved: (s.releaseLedger || []).length };
}

function finalsVM(s) {
  const F = s.season.finals;
  if (!F) return null;
  const m = (x) => (x && x.a ? { a: clubName(s, x.a), b: clubName(s, x.b), winner: clubName(s, x.winner) } : null);
  return { semis: F.semis.map(m), final: m(F.final) };
}

export function tableVM(s) { return { rows: tableRows(s), finals: finalsVM(s), fansGate: fansGateVM(s) }; }

/** Spare Spokes swap offer: {open, spokes (what the swap would spend), coins, rate}. open = flag on, power tree done, an economy, and at least one pair. Used by the Workshop and the season-end screen. */
export function swapVM(s) {
  const sp = metaOf(s).spokes | 0, coins = Math.floor(sp / WM.SWAP_RATE);
  return { open: !!(FLAGS.wheelMeta && s.econ && powerDone(s) && coins >= 1), spokes: coins * WM.SWAP_RATE, coins, rate: WM.SWAP_RATE };
}
export function endVM(s) {
  const se = s.season, run = s.run;
  const last = run && run.last && run.last.n === se.n ? run.last : null;
  const res = last || seasonResult(s); // an old save can sit at 'end' before the season is closed
  const lastSeason = se.n >= RUN.seasons;
  return {
    rows: tableRows(s), finals: finalsVM(s), champion: clubName(s, se.champion), myPlace: placeOf(se.table, ME), tpWon: se.tpWon,
    result: { place: res.place, promoted: res.promoted, toLeague: res.toLeague, stayed: res.stayed, line: res.line },
    chapter: last ? last.chapter : null, claimed: last ? last.claimed : [],
    notebook: last && last.notebook != null ? bookCell(last.notebook, isBook(s.book) ? s.book : null) : null,
    lastSeason, promoteTop: RUN.promoteTop, cta: lastSeason ? 'RunEnd' : 'NewSeason',
    season: se.n, runNo: run ? run.no : 1, swap: lastSeason ? { open: false } : swapVM(s), // wheel meta: the last season swaps by itself at run end
    recruits: recruitsVM(s),
  };
}
/** s1 season-end recruits (null on old saves). Rows carry the trial card's fields so the two read the same. @param {any} s */
export function recruitsVM(s) {
  if (!skewOn(s) || !s.season) return null;
  const rec = recruitRec(s), sq = mine(s).squad, max = squadMax(s);
  const row = (/** @type {any} */ p) => ({ id: p.id, name: p.name, role: p.bat, type: p.bowl, shown: shownAbility(p), batShown: shownBat(p), bowlShown: shownBowl(p) });
  const full = sq.length >= max;
  return {
    list: recruitOpen(s) ? recruitList(s).map((p) => ({ ...row(p), wage: wageOf(p) })) : [],
    full, release: full && recruitOpen(s) ? sq.map(row) : [], size: sq.length, max,
    signed: rec && rec.signed ? String(rec.name || '') : null, left: rec && rec.left ? String(rec.left) : null, passed: !!(rec && rec.passed),
  };
}

/** Hall of Fame: score, rows, what carries. Reads the run record; the score is recomputed from state each time. */
export function runEndVM(s) {
  const run = s.run, sc = runScore(s), carry = carryOf(s);
  const legendAbility = carry.legend ? shownAbility(carry.legend) : 0;
  return {
    score: sc.score, max: RUN.score.max, rows: sc.rows.map((r) => ({ ...r, note: r.pending ? 'Comes with the stadium' : '' })),
    seasons: run.history.length, bestLeague: run.best, titles: run.titles,
    chapters: RUN.chapters.map((c) => ({ name: c.name, done: !!(run.chapters[c.season] && run.chapters[c.season].featDone), reached: !!run.chapters[c.season] })),
    carry: [
      { key: 'legend', label: 'Legend', detail: carry.legend ? `${carry.legend.name} at ${RUN.carry.legendPct}% (${letterOfShown(legendAbility)})` : 'No player to carry', available: !!carry.legend },
      { key: 'coach', label: 'Coach', detail: carry.coach ? `${carry.coach.name}, grade ${letterOfStep(carry.coach.step)}` : 'No coach to carry', available: !!carry.coach },
      { key: 'stadium', label: 'Stadium', detail: 'Comes with the stadium', available: false },
    ],
    swapped: run.spokeSwap ? { spokes: run.spokeSwap.spokes | 0, coins: run.spokeSwap.coins | 0 } : null, // wheel meta: leftover Spokes swapped at run end
    cta: 'NewRun',
  };
}

// ---- coach scouting (one list a season; sign one or pass)
const SIDE_WORD = TRAIN2.focusLabels;
const strongWords = (strong) => (strong || []).map((f) => SIDE_WORD[f]);
/** T8: the card the Scout wheel landed on this season ({ name, letter, strong, strongWords, steps, gold, line }), or null (no spin, old-reveal spin, flag off). The same card is also cands[0] (landed:true), signable; the view shows it once, in the list. */
export function scoutLandedVM(s) {
  const r = s && s.season ? scoutSliceRow(s) : null; if (!r || !r.card || !r.card.surname) return null;
  const st = r.steps | 0, gold = r.id === 'top2', strong = [r.card.focus];
  return { name: r.card.surname, letter: r.card.grade, strong, strongWords: strongWords(strong), steps: st, gold, line: (gold ? 'Top name: ' : '') + r.card.surname + ' (' + r.card.grade + ') joins as your first name' + (st > 0 ? ', +' + st + (st === 1 ? ' step' : ' steps') : '') + '.' };
}
export function coachPickVM(s) {
  const open = canSign(s).ok, signed = s.scout && s.scout.n === (s.season && s.season.n) ? s.scout.signed : null;
  const cands = scoutCandidates(s).map((c) => ({ landed: !!c.landed, id: c.id, name: c.name, letter: letterOfStep(c.step), step: c.step, strong: c.strong.slice(), strongWords: strongWords(c.strong) }));
  return { landed: scoutLandedVM(s), cands, open, full: coachList(s).length >= MAX_COACHES, mine: coachList(s).map((c) => ({ id: c.id, name: c.name, letter: letterOfStep(c.step), strong: c.strong.slice() })), picked: signed, passed: scoutPassed(s), why: canSign(s).why, spin: open ? spokesOn(scoutSpinVM(s), s, 'scout') : null, look: FLAGS.wheelMeta ? craftLook(s) : null };
}

// ---- squad and plan
/** Letter, fill (0..1 inside the step) and lit ticks (0..3) of a player's overall raw rating. */
export const letterVM = (p) => { const r = 0.5 * batPart(p) + 0.5 * bowlPart(p); return { letter: letterOfRaw(r), fill: fillOfRaw(r), ticks: ticksOfRaw(r), step: stepOfRaw(r) }; };
/** The two bench places are soft slots: "Bench batter" and "Bench bowler". A fit gets a hint tick; nothing here ever blocks Confirm. */
function benchSlots(s) {
  const six = sixIds(s), bench = mine(s).squad.filter((p) => !six.includes(p.id));
  const lean = (p) => batPart(p) - bowlPart(p);
  const sorted = bench.slice().sort((a, b) => lean(b) - lean(a) || (a.id < b.id ? -1 : 1));
  const bat = sorted[0] || null, bowl = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  return [
    { key: 'batter', label: 'Bench batter', playerId: bat ? bat.id : null, fit: !!bat && lean(bat) > 0 },
    { key: 'bowler', label: 'Bench bowler', playerId: bowl ? bowl.id : null, fit: !!bowl && lean(bowl) < 0 },
  ];
}
export function squadVM(s) {
  const six = sixIds(s), slots = benchSlots(s);
  return {
    title: 'Pick your six', sub: s.fixture ? `Next: ${clubName(s, s.fixture.opp)}. Choose 6 of ${mine(s).squad.length}; first pick bats first.` : undefined,
    players: mine(s).squad.map((p) => ({
      /* VM:T6 */ boost: clinicBoostMap(s)[p.id] || null,
      id: p.id, name: p.name, role: p.bat, type: p.bowl, bat: shownBat(p), bowl: shownBowl(p), ability: shownAbility(p), ...letterVM(p),
      grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), order: six.includes(p.id) ? six.indexOf(p.id) : null,
      benchSlot: (slots.find((x) => x.playerId === p.id) || {}).label || null,
    })),
    bench: slots, full: squadFull(s), squadFull: squadFull(s), fullText: squadFull(s) ? SQUAD.fullText : '', size: mine(s).squad.length, max: squadMax(s),
    count: six.length, valid: six.length === SEASON.sixSize, reason: six.length === SEASON.sixSize ? '' : `Pick ${SEASON.sixSize} players.`,
  };
}

export function planVM(s) {
  const six = sixIds(s).map((id) => player(s, id));
  const overs = s.plan.overs;
  const prob = planProblem(overs);
  return {
    sub: s.fixture ? `vs ${clubName(s, s.fixture.opp)}` : undefined,
    overs: overs.map((b, i) => ({ over: i + 1, phase: PHASE_NAMES[phaseOf(i + 1)], bowler: b, warn: null })),
    bowlers: six.map((p, i) => ({ i, name: p.name, bowl: p.bowl, ability: shownAbility(p), set: overs.filter((x) => x === i).length })),
    fields: s.plan.fields.slice(), valid: !prob, reason: prob || '',
    hint: s.season && s.fixture ? (s.plan.edited ? 'Your plan. Tap any over to change.' : 'Suggested by matchups. Tap any over to change.') : undefined,
    ...mdExtras(s, -1),
  };
}

// ---- training (P11 redo): Focus + Effort + Spotlight, one Run
const rowOrder = (s) => { const six = sixIds(s); return [...six.map((id) => player(s, id)), ...mine(s).squad.filter((p) => !six.includes(p.id))]; };

/** The four raw 1-99 ratings of a row, in the order the row draws them (Batting Power, Batting Skill, Bowling Speed, Bowling Skill). */
export const ratesOf = (p) => ({ batPower: p.bp, batSkill: p.bs, bowlSpeed: p.spd, bowlSkill: p.bsk });

/** Booster / Hot Streak on a stored result, for the result card: {boosted, boostBy, hot, hotBy}; {} with the flag off. Booster: the shining slice paid boostBy more. Hot Streak: a gold right after a gold paid hotBy more (Spotlight only). */
const boostOf = (s, wid, r) => {
  if (!FLAGS.wheelMeta || !r) return {};
  const X = effective(s)[wid] || {}, boosted = !!r.boosted, hot = wid === 'spot' && !!r.jackpot && !!X.streak && (r.streak0 | 0) >= 1;
  return { boosted, boostBy: boosted && X.booster ? X.booster.value : 0, hot, hotBy: hot ? Math.round(Math.min(r.streak0 | 0, WM.STREAK_MAX) * WM.UNIT.spot * 1000) / 1000 : 0 };
};
/** Course wheel meta extras: course.wheel (tree applied, or the stored wheel while a result waits), guide, tokens, look. */
const courseMeta = (s, c, used) => { const x = metaExtras(s, 'course', courseWheel(c.step), used ? s.training.coursePending : null, 1); return { wheel: x.wheel, guide: x.guide, zone: x.zone, chime: x.chime, tokens: used ? x.tokens : [], look: x.look, spokeGain: used ? spokeGainOf(s, 'course') : 0 }; };
const coachRow = (s, c) => {
  const cc = canCourse(s, c.id), used = s.training.coursePending && s.training.coursePending.coachId === c.id;
  return {
    /* VM:T6 */ clinic: clinicCoachVM(s, c),
    id: c.id, name: c.name, step: c.step, letter: letterOfStep(c.step), strong: c.strong.slice(), strongWords: strongWords(c.strong),
    here: !(c.away > 0), away: c.away | 0, ...coachVmFields(s, c), course: { ok: cc.ok, why: cc.why, licence: cc.ok && courseUsesLicence(s, c.id), cost: courseCost(s, c.id), free: !s.econ, spun: !!used, pending: used ? { index: s.training.coursePending.result.index, gain: s.training.coursePending.result.gain, jackpot: s.training.coursePending.result.jackpot, ...boostOf(s, 'course', s.training.coursePending.result) } : null,
      ...(FLAGS.wheelMeta ? courseMeta(s, c, used) : otherMultOf(s) !== 1 ? { wheel: wheelVM(used && s.training.coursePending.wheel ? s.training.coursePending.wheel : metaWheel(courseWheel(c.step), 'course', s)) } : {}) },
  };
};
/** Gain the spotlight player really gets after the cap-sum, balance and 99 limits. */
const spotApplied = (s, plan, gain, id = plan.spotlightId) => { const p = id && player(s, id); return p ? Math.max(0, Math.min(gain, drillRoom(p, focusRating(p, plan.focus)).room)) : 0; };
const wheelVM = (w) => ({ slices: w.slices.slice(), jackpotIndex: w.jackpotIndex, jackpotGain: w.jackpotGain, widths: w.widths ? w.widths.slice() : undefined, ...(w.phys ? { phys: { ...w.phys } } : {}), ...(w.golds ? { golds: w.golds.slice() } : {}) });
/** Spokes the last spin on this wheel dropped (the tally already counts it: tier before it + base). 0 with the flag off or no spin yet. */
/** Add spokeGain to a reel VM once it has a stored result. @param {any} vm */
const spokesOn = (vm, s, wheel) => (vm ? { ...vm, spokeGain: vm.pending ? spokeGainOf(s, wheel) : 0 } : vm);
export const spokeGainOf = (s, wheel) => { if (!FLAGS.wheelMeta) return 0; const m = metaOf(s), t = m.tally | 0; if (t < 1) return 0; const tw = wheel === 'toss' && s.fixture && s.fixture.md && s.fixture.md.wm && s.fixture.md.wm.toss; return (WM.SPOKE_BASE[wheel] || 0) + WM.SPOKE_PER_TIER * tierOf(t - 1) + (tw && tw.id === 'sport' && !tw.kept ? 1 : 0); }; // QA3 NEW-4: the No-boost slice pays +1 on top (recordSpin sportSlice), so the row shows what the store adds
/** Wheel meta extras for a wheel open site (flag on only): the wheel with the tree applied (or the stored one while a result waits), guide, tokens, look. */
const metaExtras = (s, wid, base, pend, slot) => {
  const wheel = wheelVM(pend && pend.wheel ? pend.wheel : metaWheel(base, wid, s));
  const fx = effective(s)[wid] || {};
  return { wheel, guide: !!fx.guide, zone: +fx.zone || 0, chime: !!fx.chime, tokens: tokenVM(s, wid, slot).options, look: craftLook(s) };
};

export function trainingVM(s) {
  const T = s.training, plan = planOf(s), pre = netsPreview(s), six = sixIds(s);
  const train = new Set(pre.trainIds), short = new Set(pre.shortIds), skip = new Set(pre.skippedIds);
  const rows = rowOrder(s).map((p) => {
    const st = focusRating(p, plan.focus), line = T.nets && T.nets.week === T.week ? T.nets.lines.find((l) => l.id === p.id) : null;
    return {
      id: p.id, name: p.name, bench: !six.includes(p.id), role: p.bat, type: p.bowl, ...letterVM(p), grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), rates: ratesOf(p),
      status: train.has(p.id) ? 'train' : short.has(p.id) ? 'short' : skip.has(p.id) ? 'skip' : 'train', stat: TRAIN2.statNames[st], spotlight: plan.spotlightId === p.id, spotlight2: plan.spotlight2Id === p.id, line,
    };
  });
  const efforts = EFFORTS.map((id) => { const e = TRAIN2.efforts[id]; return { id, label: e.label, cost: e.cost, mean: Math.round(meanGain(effortOdds(id, 0, plan.focus === 'bal')) * 100) / 100, on: plan.effort === id }; });
  const focuses = FOCUSES.map((id) => ({ id, label: TRAIN2.focusLabels[id], on: plan.focus === id }));
  const mcId = matchCoachIdOf(s);
  const coaches = coachList(s).map((c) => ({ ...coachRow(s, c), picked: plan.coachId === c.id, helps: c.strong.includes(plan.focus), matchCoach: !!mcId && mcId === c.id }));
  const hasP1 = !!(T.pending && T.pending.week === T.week), hasP2 = !!(T.pending2 && T.pending2.week === T.week);
  const capped = (id, has) => FLAGS.wheelMeta && skip.has(id) && !has; // 02 section 7: a Spotlight player who cannot gain is not offered the wheel (no tally, no Spokes)
  const baseW = plan.spotlightId && !capped(plan.spotlightId, hasP1) ? wheelSlices(plan.effort, coachStepInUse(s)) : null, M = FLAGS.wheelMeta;
  const mx1 = baseW && M ? metaExtras(s, 'spot', baseW, T.pending && T.pending.week === T.week ? T.pending : null, 1) : null;
  const mx2 = baseW && M && plan.spotlight2Id && !capped(plan.spotlight2Id, hasP2) ? metaExtras(s, 'spot', baseW, T.pending2 && T.pending2.week === T.week ? T.pending2 : null, 2) : null;
  const wheel = baseW ? (mx1 ? mx1.wheel : wheelVM(metaWheel(baseW, 'spot', s))) : null; // flag off: metaWheel = baseW unless Dev otherMult
  const done = !!(T.nets && T.nets.week === T.week);
  return {
    tp: T.tp, week: T.week, plan, focuses, efforts, rows, coaches, coachQuality: coachQuality(s), coachLetter: coachStepInUse(s) ? letterOfStep(coachStepInUse(s)) : null,
    preview: { cost: pre.cost, tpLeft: T.tp - pre.cost, trainCount: pre.trainIds.length, shortCount: pre.shortIds.length, skipCount: pre.skippedIds.length, hint: pre.hint },
    spotlight: { id: plan.spotlightId, wheel, ...(mx1 ? { guide: mx1.guide, zone: mx1.zone, chime: mx1.chime, tokens: hasP1 ? mx1.tokens : [], look: mx1.look, spokeGain: hasP1 ? spokeGainOf(s, 'spot') : 0 } : {}), pending: T.pending && T.pending.week === T.week ? { careful: T.pending.careful, index: T.pending.result.index, gain: T.pending.result.gain, jackpot: T.pending.result.jackpot, ...boostOf(s, 'spot', T.pending.result), applied: spotApplied(s, plan, T.pending.result.gain) } : null },
    twin: { held: twinHeld(s), line: twinHeld(s) > 0 ? 'Twin Spotlight Pass: pick 2' : '', id: plan.spotlight2Id, wheel: plan.spotlight2Id && !capped(plan.spotlight2Id, hasP2) ? (mx2 ? mx2.wheel : wheel) : null, ...(mx2 ? { guide: mx2.guide, zone: mx2.zone, chime: mx2.chime, tokens: hasP2 ? mx2.tokens : [], look: mx2.look, spokeGain: hasP2 ? spokeGainOf(s, 'spot') : 0 } : {}),
      pending: T.pending2 && T.pending2.week === T.week ? { careful: T.pending2.careful, index: T.pending2.result.index, gain: T.pending2.result.gain, jackpot: T.pending2.result.jackpot, ...boostOf(s, 'spot', T.pending2.result), applied: spotApplied(s, plan, T.pending2.result.gain, plan.spotlight2Id) } : null },
    licence: { held: licenceHeld(s), line: licenceHeld(s) > 0 ? 'Licence: 2nd course allowed' : '' },
    done, result: done ? { lines: T.nets.lines, cost: T.nets.cost, skipped: T.nets.skipped } : null, tips: !T.tipsSeen && !(T.netsRuns > 0),
    canRun: !done && pre.trainIds.length > 0, notice: noticeOf(s),
    // wa1 train (SPEC 2026-11-14 s2/s4): coach strip on the Training tab (3 slots, scout list) + Nets level/quality. Owner: train.
    strip: { slots: MAX_COACHES, free: Math.max(0, MAX_COACHES - coaches.length), scoutOpen: !!canSign(s).ok, scoutPassed: scoutPassed(s) }, nets: { level: netsFacLevel(s), q: netsQuality(s) },
  };
}

export function playerVM(s, id) {
  const p = player(s, id);
  if (!p) return null;
  const six = sixIds(s);
  const open = [];
  for (const side of ['bat', 'bowl']) for (let n = 1; n <= NODE_COUNT; n++) { const st = nodeStatus(s, id, side, n); if (st.status === 'available') { open.push(st.cost); break; } }
  const hidden = gradeOf(p) === null;
  return {
    id, name: p.name, bench: !six.includes(id), role: p.bat, type: p.bowl, grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), ...letterVM(p),
    potential: hidden ? null : p.potential, potentialLetter: hidden ? null : letterOfShown(p.potential), previews: previewCount(p), tp: s.training.tp,
    ability: { bat: shownBat(p), bowl: shownBowl(p), overall: shownAbility(p) },
    ratings: RATINGS.map((k) => ({ key: RATING_KEY[k], val: p[k], letter: letterOfRaw(p[k]), ticks: ticksOfRaw(p[k]), fill: fillOfRaw(p[k]), limit: Math.min(DRILLS.hardCap, p[k] + Math.max(0, drillRoom(p, k).room)) })),
    limitLine: `Ratings go up to ${DRILLS.hardCap}, and no more than ${DRILLS.balance} above the lowest one.`,
    capLine: null, node: { cost: open.length ? Math.min(...open) : null, label: 'Skill trees' },
  };
}

const WEEK_REASON = 'One new skill a week';
/** Plain name and one plain line for each skill node: [name, line]. Tuning (data/training.js) holds the numbers; players never see them. */
const NODE_INFO = {
  Opener: [['Steady start', 'Fewer wickets in overs 1-3'], ['Safe matchups', 'A weak matchup hurts less'], ['Fast start', 'More 4s and 6s in overs 1-3'], ['Spin basher', 'More 4s against spin'], ['Rock solid', 'A weak matchup hurts even less']],
  Middle: [['Nudge and run', 'More singles in overs 4-7'], ['Calm hands', 'Weak matchups hurt less'], ['Gap finder', 'More 4s in overs 4-7'], ['Pace smasher', 'More 6s against fast bowlers'], ['Anchor', 'Weak matchups hurt much less, and fewer wickets in overs 4-7']],
  Lower: [['Tail guard', 'Fewer wickets in overs 8-10'], ['Brave tail', 'Weak matchups hurt a lot less'], ['Big finish', 'More 6s in overs 8-10'], ['Medium muncher', 'More 4s against medium bowlers'], ['Go for it', 'On Attack, more 4s and 6s']],
  Fast: [['Quick strike', 'More wickets in overs 1-3'], ['Middle breaker', 'Middle-order batters hit fewer great shots'], ['Death stopper', 'Fewer 6s in overs 8-10'], ['Hunter field', 'More wickets with the Attack field'], ['Burst', 'One over each innings with extra wickets']],
  Medium: [['Tight finish', 'Fewer 4s in overs 8-10'], ['Tail tamer', 'Lower-order batters hit fewer great shots'], ['Boundary guard', 'Fewer 6s'], ['Middle trap', 'More wickets in overs 4-7'], ['Safe field', 'Fewer 4s with the Protect field']],
  Spin: [['Slow squeeze', 'Fewer 4s in overs 4-7'], ['Opener puzzle', 'Opening batters hit fewer great shots'], ['Turn and take', 'More wickets in overs 4-7'], ['Six stopper', 'Fewer 6s'], ['Burst', 'One over each innings with extra wickets']],
};
export function treeVM(s, id) {
  const p = player(s, id);
  if (!p) return null;
  const trees = ['bat', 'bowl'].map((side) => {
    const tree = treeOf(p, side), def = SKILLS.trees[tree], boosted = treeBoost(s.coaches, tree) > 1, need = (lv) => letterOfStep(TRAIN2.coach.oldStepBase + TRAIN2.coach.oldStepPerLevel * lv);
    const owned = p.nodes ? p.nodes[side] || 0 : 0;
    return {
      side, title: side === 'bat' ? `${tree} batting` : `${tree} bowling`, key: tree.toLowerCase(), owned, boost: { on: boosted, text: boosted ? 'Coach bonus: effects x1.5' : `Needs a ${need(SKILLS.boostMinLevel)} coach strong in ${SIDE_WORD[side]} for x${SKILLS.boost}` },
      nodes: def.nodes.map((nd, k) => {
        const i = k + 1, st = nodeStatus(s, id, side, i);
        const state = st.status === 'owned' ? 'done' : i === owned + 1 ? 'next' : 'locked';
        const reason = st.status === 'owned' || st.status === 'available' ? null : st.reason === 'order' ? 'Buy the earlier node first.' : st.reason === 'coach' ? `Needs a ${need(nd.needsCoachLevel)} coach strong in ${SIDE_WORD[side]}.` : null;
        const info = NODE_INFO[tree] && NODE_INFO[tree][k];
        const weekLock = st.status === 'locked' && st.reason === 'week';
        return { i, name: info ? info[0] : `Skill ${i}`, text: info ? info[1] : nd.text, cost: nd.cost, state: weekLock ? 'locked' : state, reason: weekLock ? WEEK_REASON : reason, weekLock };
      }),
    };
  });
  return { id, name: p.name, tp: s.training.tp, blocked: s.training.nodeBought && s.training.nodeBought[id] ? WEEK_REASON + '.' : null, trees };
}

export function coachesVM(s) {
  const plan = planOf(s), list = coachList(s), mcId = matchCoachIdOf(s);
  return {
    coaches: list.map((c) => ({ ...coachRow(s, c), picked: plan.coachId === c.id, helps: c.strong.includes(plan.focus), matchCoach: !!mcId && mcId === c.id })),
    licence: { held: licenceHeld(s), line: licenceHeld(s) > 0 ? 'Licence: 2nd course allowed' : '' },
    slots: MAX_COACHES, free: Math.max(0, MAX_COACHES - list.length), full: list.length >= MAX_COACHES, scout: coachPickVM(s),
    note: 'Pick a coach for the week. He helps only when he is strong in the focus. A course makes a coach better and takes him away for a week.',
  };
}

// ---- week summary
export function weekVM(s) {
  const W = s.training.weekSummary || { week: s.training.week - 1, gains: [], reveals: [], nodes: [], lines: [] };
  const name = (id) => (player(s, id) || { name: '?' }).name;
  const gains = rowOrder(s).map((p) => {
    const g = W.gains.find((x) => x.playerId === p.id);
    const after = letterVM(p);
    if (!g) return { id: p.id, name: p.name, rating: null, n: 0, before: after.letter, after: after.letter, ...after };
    const prev = { ...p }; RATINGS.forEach((k, i) => { prev[k] = p[k] - g.by[i]; });
    const at = g.by.findIndex((v) => v > 0);
    return { id: p.id, name: p.name, rating: at >= 0 ? RATING_KEY[RATINGS[at]] : null, n: g.total, before: letterVM(prev).letter, after: after.letter, ...after, stepUp: letterVM(prev).step < after.step };
  });
  const last = s.season.last;
  const results = s.season.results.filter((r) => last && r.kind === last.kind && (last.kind !== 'league' || r.round === last.round));
  return {
    week: W.week, pos: placeOf(s.season.table, ME), tp: s.training.tp, cta: s.season.phase === 'over' ? 'See season results' : 'Next match', gains, lines: W.lines || [],
    reveals: W.reveals.map((r) => ({ name: name(r.playerId), grade: r.grade })),
    nodes: W.nodes.map((n) => ({ name: name(n.playerId), node: n.node })),
    coachUps: [], course: s.training.courseDone && s.training.courseDone.week === W.week ? { ...s.training.courseDone, fromLetter: letterOfStep(s.training.courseDone.from), toLetter: letterOfStep(s.training.courseDone.to) } : null, pay: s.pay || null,
    roundResults: results.map((r) => ({ a: clubName(s, r.a), b: clubName(s, r.b), ra: r.ra, wa: r.wa, rb: r.rb, wb: r.wb, me: r.a === ME || r.b === ME })),
  };
}

// ---- b-p6: club hub and team sheet
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]);

/** The next rival's name and style tag (null tag when untagged): for the hub chip sheet. */
export function rivalVM(s) {
  const opp = s.fixture ? club(s, s.fixture.opp) : null;
  return { name: opp ? opp.name : '', tag: opp ? tagInfo(opp) : null };
}

/** The team sheet: the squad (six in batting order, bench after) and the bowling plan the hub would use right now. */
export function teamVM(s) {
  const lp = livePlan(s), t = { ...s, plan: lp };
  const sq = squadVM(t), pl = planVM(t);
  const mineC = mine(s);
  return { opp: s.fixture ? clubName(s, s.fixture.opp) : '', oppTag: s.fixture ? tagInfo(club(s, s.fixture.opp)) : null, players: sq.players, count: sq.count, plan: { ...pl, edited: lp.edited }, six: sixIds(s), squadSize: mineC.squad.length };
}

/** The hub as a club screen: everything hubVM has, plus the six, the promotion checklist, the next unlock and one Start match. */
/** The next hidden-grade player in the six and the drills left until the grade shows, or null. @param {any[]} six */
function unlockOf(six) {
  const hidden = six.filter((p) => !gradeOf(p)).sort((a, b) => (b.drillsHere | 0) - (a.drillsHere | 0))[0];
  return hidden ? { name: hidden.name, left: Math.max(1, DRILLS.revealAfter - (hidden.drillsHere | 0)) } : null;
}
/** The Week sheet's data (same sources decorate() and the hub use). */
export function weekSheetVM(s) {
  return { notice: s && s.notice ? noticeOf(s) : null, freePick: freePickVM(s), trial: trialVM(s), activities: activitiesVM(s), unlock: s && s.season ? unlockOf(sixIds(s).map((id) => player(s, id))) : null };
}
export function clubVM(s) {
  const base = hubVM(s), se = s.season, fx = s.fixture;
  const lp = livePlan(s), t = { ...s, plan: lp };
  const pv = planVM(t);
  const six = sixIds(s).map((id) => player(s, id));
  const place = placeOf(se.table, ME);
  const left = Math.max(0, SEASON.leagueMatches - (se.phase === 'league' ? se.round - 1 : SEASON.leagueMatches));
  const top = RUN.promoteTop, last = (se.league || 1) >= 5;
  const rows = [
    { key: 'rank', title: 'Top ' + top + ' at the final', sub: left ? left + ' week' + (left > 1 ? 's' : '') + ' left' : 'Last week', state: 'todo', tag: se.results.some((r) => r.a === ME || r.b === ME) ? ordinal(place) + ' now' : 'Not started' },
    { key: 'stadium', title: 'Stadium ' + ((se.league || 1) + 1), sub: 'Not built yet', state: 'later', tag: 'Later' },
    { key: 'fans', title: 'Fans', sub: 'Comes with the stadium', state: 'later', tag: 'Later' },
  ];
  const unlock = unlockOf(six);
  const oppPlace = fx ? placeOf(se.table, fx.opp) : 0;
  const ko = fx && fx.kind !== 'league';
  const word = pv.valid ? (lp.edited ? 'Saved' : 'Suggested') : 'Fix it';
  return {
    ...base, club: { name: mine(s).name, week: base.round, league: se.league || 1, weeksLeft: left }, lastLeague: last,
    six: six.map((p) => ({ id: p.id, name: p.name, grade: gradeOf(p) || '?', pips: pipsOf(p), bat: shownBat(p), bowl: shownBowl(p) })),
    promo: { title: 'Go up to League ' + ((se.league || 1) + 1), total: rows.length, done: rows.filter((r) => r.state === 'ok').length, rows },
    unlock, plan: { word, ok: pv.valid, reason: pv.reason },
    cta: fx
      ? { label: 'Start match', act: 'StartMatch', disabled: !pv.valid, reason: pv.valid ? '' : 'Fix the overs first. ' + pv.reason,
        sub: 'v ' + base.next.oppName + ' · ' + (ko ? base.next.kindWord : 'Home') + (oppPlace ? ' · ' + ordinal(oppPlace) : '') }
      : { label: 'Pick your six', act: 'OpenSquad' },
  };
}

// ---- p7first
/** First-match strip (3 lines + Skip): League 1 season 1 match 1, first over, until skipped. */
export function firstStripOn(s) {
  return !!(s.season && s.season.n === 1 && s.season.round === 1 && s.stage === 'bowl' && s.inn1 && s.inn1.over === 1 && !(s.seen && s.seen.firstStrip));
}

// ---------------------------------------------------------------- Book (P6: 3x3 grid per phase + one card). Who-wins words only: the points number never leaves core/pairing.js.
const PH_OVERS = ['1-3', '4-7', '8-10'];
const BAT_WORD = { Opener: 'Openers', Middle: 'Middle order', Lower: 'Lower order' }; // card band, titles, fills line
const BAT_SHORT = { Opener: 'Openers', Middle: 'Middle', Lower: 'Lower' }; // grid cell, row heads
// Win size 1-6 (F8-B: combo adds in). Singular verb for a bowler type, plural for a batter group.
const WIN_ONE = ['', 'wins a bit', 'wins', 'wins big', 'wins huge', 'crushes', 'crushes it'];
const WIN_MANY = ['', 'win a bit', 'win', 'win big', 'win huge', 'crush', 'crush it'];
export const BOOK_RULE = 'Watch a pairing 18 balls. It goes in.';
/** Who-wins band text for a found cell, e.g. "Fast wins a bit", "Middle order win". */
export function bandText(bat, bowl, w) { return w.side === 'bowler' ? bowl + ' ' + WIN_ONE[w.size] : BAT_WORD[bat] + ' ' + WIN_MANY[w.size]; }
/**
 * One Book cell as every view shows it (sheet grid + card, found panel, notebook, mini grid). book may be null (then balls = 18 for a found cell).
 * Found: side, size, band, cellWord, combo, seen, why, use. Unfound: toGo, lines. Both: title, overs, aria.
 * @param {number} i @param {{balls:number[],found:number[]}|null} book @param {boolean} [forceFound]
 */
export function bookCell(i, book, forceFound) {
  const c = cellOf(i), f = forceFound || !book || !!book.found[i];
  const balls = book ? Math.min(SEEN_BALLS, book.balls[i]) : SEEN_BALLS;
  const base = { i, bat: c.bat, bowl: c.bowl, ph: c.ph, overs: PH_OVERS[c.ph], oversLabel: 'Overs ' + PH_OVERS[c.ph], title: BAT_WORD[c.bat] + ' v ' + c.bowl,
    batWord: BAT_WORD[c.bat], batShort: BAT_SHORT[c.bat], found: f, balls, of: SEEN_BALLS, name: cellName(i) };
  if (!f) {
    const k = SEEN_BALLS - balls;
    const toGo = k === 1 ? '1 ball to go.' : k + ' balls to go.';
    const fills = 'Fills when ' + BAT_WORD[c.bat] + ' face ' + c.bowl + ' in overs ' + PH_OVERS[c.ph] + ', any season match, bat or bowl.';
    return { ...base, band: 'Not found yet', toGo, fills, lines: [toGo, fills],
      aria: BAT_WORD[c.bat] + ' v ' + c.bowl + ', overs ' + PH_OVERS[c.ph] + ': not found, ' + balls + ' of ' + SEEN_BALLS + ' balls.' };
  }
  const w = winOf(i), cb = comboOf(i), band = bandText(c.bat, c.bowl, w);
  const seen = !book || book.balls[i] >= SEEN_BALLS;
  const lowBat = BAT_WORD[c.bat].toLowerCase();
  return { ...base, side: w.side, size: w.size, band, cellWord: w.side === 'bowler' ? c.bowl : BAT_SHORT[c.bat],
    combo: cb ? cb.name : null, comboLine: cb ? 'A bonus on top.' : null, seen,
    why: seen ? 'Why: you saw 18 balls of it.' : "Why: Coach's notebook, season end.",
    use: w.side === 'bowler' ? 'Use: the bowler pick shows it. Your plan leans to ' + c.bowl + ' at their ' + lowBat + '.'
      : 'Use: the bowler pick shows it. Your plan keeps ' + c.bowl + ' off their ' + lowBat + '.',
    aria: BAT_WORD[c.bat] + ' v ' + c.bowl + ', overs ' + PH_OVERS[c.ph] + ': ' + band + (cb ? ', combo ' + cb.name : '') + '.' };
}
/** Cells found at the end of the last over (the just-found panel). [] when none. Reads s.book for seen/gift. */
export function foundVM(s) {
  const book = s && isBook(s.book) ? s.book : null;
  return s && s.last && Array.isArray(s.last.found) ? s.last.found.map((i) => bookCell(i, book, true)) : [];
}
/** Goal card for a cell (nearest unfound). */
export function goalOf(cell) {
  return { tag: 'Your first goal', line1: 'Watch ' + cell.batWord + ' face ' + cell.bowl + ' in overs ' + cell.overs + '.',
    line2: cell.balls + ' of 18 balls. ' + (SEEN_BALLS - cell.balls) + ' to go. Just play. Every ball counts, for either team.' };
}
/** The Book: 27 cells (index = cell number; phase = i % 3), counts, nearest unfound cell, goal card when nothing is found. */
export function bookVM(s) {
  const book = isBook(s && s.book) ? s.book : newBook();
  const cells = Array.from({ length: CELLS }, (_, i) => bookCell(i, book));
  const found = book.found.reduce((a, b) => a + (b ? 1 : 0), 0);
  const comboFound = cells.filter((c) => c.found && c.combo).length;
  const nearest = nearestCell(book);
  const firstFound = cells.findIndex((c) => c.found);
  return {
    found, total: CELLS, comboFound, comboTotal: COMBOS, rule: BOOK_RULE, cells,
    nearest, firstFound, empty: found === 0, goal: found === 0 && nearest >= 0 ? goalOf(cells[nearest]) : null,
    phases: PH_OVERS.map((o, k) => ({ ph: k, overs: o, label: 'Overs ' + o })),
    rows: BATS.map((bat) => ({ bat, word: BAT_SHORT[bat] })), cols: BOWLS.map((bowl) => ({ bowl, word: bowl })),
    /** Cell number at row r (batter), col c (bowler), phase ph. */
    at: (r, c, ph) => r * 9 + c * 3 + ph,
  };
}
/** Bowler-pick Book line (F1 A, presentation only): striker's cell first, then the non-striker's; one line at most; null when none fits. */
function bowlBookLine(book, crease, bowl, ph) {
  if (!book) return null;
  const order = crease.slice().sort((a, b) => (b.onStrike ? 1 : 0) - (a.onStrike ? 1 : 0));
  for (const bat of order) {
    if (!(bat.bat in BAT_WORD)) continue;
    const i = cellIndex(bat.bat, bowl, ph);
    if (!book.found[i]) continue;
    const w = winOf(i), band = bandText(bat.bat, bowl, w), other = w.side === 'bowler' ? BAT_WORD[bat.bat] : bowl;
    return { i, side: w.side, size: w.size, bat: bat.bat, text: 'Book: ' + band + ' v ' + other, aria: 'Book: ' + band + ' versus ' + other };
  }
  return null;
}
export const BOOK_PICK_NOTE = 'Book lines come from what you found. They can differ from the grid. Your call.';

// ---------------------------------------------------------------- r9 match day (flag matchday; every key below is absent with the flag off)
/** Match coach (SPEC 2026-11-15): id of this week's match coach (training tab tag), null with the flag off or none idle. */
function matchCoachIdOf(s) { try { if (!FLAGS.matchday || !s.training) return null; const m = matchCoachOf(s); return m ? m.coach.id : null; } catch (e) { return null; } }
/** The Match coach row for the Match day screen: { none, line, name, letter, text, change, options:[{id,name,letter,text,picked}] }. null with the flag off. */
export function matchCoachVM(s) {
  if (!FLAGS.matchday || !s.training) return null;
  const m = matchCoachOf(s);
  if (!m) return { none: true, line: 'No match coach this week', name: '', letter: '', text: '', change: false, options: [] };
  const opt = (c) => ({ id: c.id, name: c.name, letter: letterOfStep(c.step), strong: c.strong.slice(), text: matchCoachText(c.name, matchCoachOf({ ...s, training: { ...s.training, matchCoachId: c.id } }).boost), picked: c.id === m.coach.id });
  return { none: false, line: m.coach.name, name: m.coach.name, letter: letterOfStep(m.coach.step), text: matchCoachText(m.coach.name, m.boost), change: m.idle.length > 1, options: m.idle.map(opt) };
}
const HYPE_WORD = { low: 'Quiet crowd', med: 'Good crowd', high: 'Big crowd', nuts: 'Wild crowd' }; // r9 fix M6: the same words on the Match day screen, its odds table and the Plan chip
const pct = (x) => Math.round(x * 100);
const hypePerfOf = (md) => (md.hypePerf != null ? md.hypePerf : MD.HYPE_PERF[md.hype]); // wheel meta writes the real number
const noBoostText = () => (FLAGS.wheelMeta ? 'No boost. +1 Spoke' : 'No boost today'); // QA3 NEW-3, SPEC 7: never "Rival won the toss"
const pepPctOf = (md) => Math.round((Number.isFinite(md.pepBoost) ? md.pepBoost : MD.PEP_BOOST) * 1000) / 10; // QA3 NEW-2: the landed slice, one decimal
const tossBoostOf = (md) => (md.tossBoost != null ? md.tossBoost : md.toss === 'won' ? MD.TOSS_BOOST : 0);
/** The rolled match day for the fixture on screen (the live match keeps it on s.match.md). Pep follows the slot in the current six. */
function mdOf(s) {
  if (!FLAGS.matchday) return null;
  // r9 QA2 B1: s.match.md outlives its match. Before the match starts (hub, squad, plan, matchday...) read this fixture's roll; the live match roll only on bowl/break/chase/done.
  const live = s.stage === 'bowl' || s.stage === 'chase' || s.stage === 'break' || s.stage === 'done';
  const md = live ? ((s.match && s.match.md) || (s.fixture && s.fixture.md) || null) : ((s.fixture && s.fixture.md) || null);
  if (!md) return null;
  const ids = s.stage === 'bowl' || s.stage === 'chase' || s.stage === 'break' || s.stage === 'done' ? null : sixIds(s);
  return ids ? { ...md, pepId: resolvePep(md, ids) } : md;
}
const nameOfId = (s, id) => { const p = id != null ? player(s, id) : null; return p ? p.name : ''; };
/** Chip row for Plan and the match header: hype, toss, pep. [{key, text, aria}] */
export function chipsVM(s) {
  const md = mdOf(s);
  if (!md) return [];
  const chips = [{ key: 'hype', text: `${HYPE_WORD[md.hype]} +${pct(hypePerfOf(md))}%` }];
  chips.push({ key: 'toss', text: tossBoostOf(md) > 0 ? `${md.toss === 'won' ? 'Won the toss' : 'Good sport'} +${Math.round(tossBoostOf(md) * 1000) / 10}%` : noBoostText() });
  const nm = nameOfId(s, md.pepId) || (s.me && s.me.players && md.pepSlot ? '' : '');
  if (md.pepId != null && nm) chips.push({ key: 'pep', text: `Pep talk: ${nm} +${pepPctOf(md)}%` });
  const live = s.stage === 'bowl' || s.stage === 'chase' || s.stage === 'break' || s.stage === 'done'; // the coach in play is the one stored with the match; before it starts, today's pick
  const mc = live ? md.mc : (() => { const m = matchCoachOf(s); return m && (m.boost.bat || m.boost.bowl) ? { name: m.coach.name, bat: m.boost.bat, bowl: m.boost.bowl } : null; })();
  if (mc) chips.push({ key: 'coach', text: matchCoachText(mc.name, mc) });
  return chips.map((c) => ({ ...c, aria: c.text }));
}
/** Extra VM keys for plan / bowl / chase: chips, and the roar for the over about to be played (overIdx 0..19, -1 = none). */
function mdExtras(s, overIdx) {
  const md = mdOf(s);
  if (!md) return {};
  const out = { chips: chipsVM(s) };
  if (FLAGS.roar && overIdx >= 0 && (s.stage === 'bowl' || s.stage === 'chase')) {
    const on = roarAt(md, overIdx), text = `Crowd roar +${pct(MD.ROAR_BOOST)}%`;
    out.roar = on ? { on: true, text, aria: text } : null;
  }
  return out;
}
/** The Match day screen. null unless the flag is on and a fixture is waiting. */
/** Wheel meta: a spokeGain on every dial / reel result (the Spokes that spin dropped; 0 until spun or for a kept roll). @param {any} s @param {any} wm */
function withSpokes(s, wm) {
  if (!wm) return wm;
  for (const w of ['hype', 'toss', 'pep']) if (wm[w]) wm[w].spokeGain = wm[w].pending && !(s.fixture.md.wm && s.fixture.md.wm[w] && s.fixture.md.wm[w].kept) ? spokeGainOf(s, w) : 0;
  return wm;
}
export function matchdayVM(s) {
  const md = mdOf(s);
  if (!md || !s.season || !s.fixture) return null;
  const fx = s.fixture, opp = club(s, fx.opp);
  const six = sixIds(s).map((id, i) => { const pl = player(s, id); return { slot: i + 1, id, name: nameOfId(s, id), pep: id === md.pepId, bat: pl ? shownBat(pl) : null, bowl: pl ? shownBowl(pl) : null }; }); // M 2026-11-15: bat + bowl ratings on the six
  const team = teamBoost(md, null), pepB = md.pepId != null ? teamBoost(md, md.pepId) : team;
  const pepName = nameOfId(s, md.pepId);
  const odds = md.odds.map((o, i) => ({ level: MD.HYPE_LEVELS[i], word: HYPE_WORD[MD.HYPE_LEVELS[i]], pct: Math.round(o) }));
  const forced = !!(FLAGS.matchday && (s.mdSeen || 0) < MD.MATCHDAY_FIRST_N_SHOWN);
  return {
    oppName: opp ? opp.name : 'Rival', kindWord: KIND_WORD[fx.kind], key: `${s.season.n || 1}|${fx.kind}|${fx.round}|${opp ? opp.id : ''}`, // the reveal memory key: a repeated opponent in a later season is a new match day
    hype: { level: md.hype, idx: md.hypeIdx, word: HYPE_WORD[md.hype], perfPct: pct(hypePerfOf(md)), fanMult: md.hypeFanMult },
    odds,
    roar: { on: !!FLAGS.roar, chancePct: Math.round(md.roarChance * 100), overs: md.roar.filter(Boolean).length },
    toss: { won: tossBoostOf(md) > 0, boostPct: Math.round(tossBoostOf(md) * 1000) / 10, line: tossBoostOf(md) > 0 ? (md.toss === 'won' ? `You won the toss +${Math.round(tossBoostOf(md) * 1000) / 10}% for the team` : `Good sport +${Math.round(tossBoostOf(md) * 1000) / 10}% for the team`) : noBoostText() + '.', noBoost: tossBoostOf(md) <= 0, noBoostLine: noBoostText() + '.' },
    pep: md.pepId != null ? { slot: md.pepSlot, id: md.pepId, name: pepName, boostPct: pepPctOf(md) } : null,
    six, coach: matchCoachVM(s),
    boost: { teamPct: pct(team), pepPct: pct(pepB), line: pct(team) === 0 && pct(pepB) === 0 ? '' : pepName ? `Team +${pct(team)}%, ${pepName} +${pct(pepB)}%` : `Team +${pct(team)}%` },
    wm: withSpokes(s, mdSpinVM(s)), look: FLAGS.wheelMeta ? craftLook(s) : null, // wheel meta: dial / reveal props + stored results (null with the flag off)
    auto: !!s.autoMatchday, forced, next: fx.mdThen === 'start' ? 'Start match' : 'Next: Plan', back: 'Back to squad', // from the hub Go starts the match; from Squad it opens Plan (m1: the label says what the button does)
  };
}

// ---------------------------------------------------------------- r9 fan activities, trial player, free facility pick
/** r9 QA2 m6: a coach find carries only an id; name it from the waiting trial, the signed coaches or the trial ledger. */
function findNamed(s, f) {
  if (!f || typeof f !== 'object' || f.type !== 'coach' || f.name) return f || null;
  const tr = s.trial && s.trial.coach && s.trial.coach.id === f.id ? s.trial.coach : null;
  const c = tr || (s.coaches || []).find((x) => x && x.id === f.id) || ((s.econ && s.econ.ledger) || []).find((x) => x && x.k === 'trial' && x.id === f.id);
  return c && c.name ? { ...f, name: c.name } : f;
}
/** This week's fan activity card + sheet. null unless the flag is on and the club has an economy. */
export function activitiesVM(s) {
  if (!FLAGS.activities || !s.econ || !s.season) return null;
  const o = activityOptions(s), last = s.econ.act && s.econ.act.hist && s.econ.act.hist[0];
  const picked = o.why === 'done' && last ? { id: last.id, name: last.id === 'rest' ? 'Rest week' : (ACT.TABLE.find((r) => r.id === last.id) || { name: last.id }).name, fans: last.fans, coins: last.coins, find: findNamed(s, last.find) } : null;
  return {
    available: o.open, why: o.why, round: o.key, picked, coins: s.econ.coins, purse: s.econ.coins,
    options: o.rows.map((r) => ({ id: r.id, name: r.name, blurb: r.blurb, cost: r.coins, fans: r.fans, tiltPct: pct(r.tilt), findPct: r.findPct, repeat: r.repeat,
      note: r.repeat ? 'Same as last week: half Fans, no find' : '', ok: r.ok, why: r.why, warn: r.warn, reel: r.repeat || r.id === 'rest' ? null : spokesOn(findSpinVM(s, r.id), s, 'find') })),
    look: FLAGS.wheelMeta ? craftLook(s) : null,
    rest: { id: 'rest', label: 'Rest week', free: true, ok: o.open },
    pity: { weeks: o.dry, of: ACT.ACT_PITY_WEEKS, next: o.pity },
    trial: trialVM(s),
  };
}
/** The Trial card (Sign / Decline). null when no find is waiting (or the flag is off). */
export function trialVM(s) {
  if (!FLAGS.activities || !s.econ) return null;
  const t = trialOf(s);
  if (!t) return null;
  const can = canSignTrial(s), x = t.player || t.coach;
  const player = t.kind === 'player' ? { id: x.id, name: x.name, bat: x.bat, bowl: x.bowl, role: x.bat, type: x.bowl, batShown: shownBat(x), bowlShown: shownBowl(x), ability: shownAbility(x), grade: gradeChip(x), ...ratesOf(x) } : null;
  const coach = t.kind === 'coach' ? { id: x.id, name: x.name, step: x.step, strong: Array.isArray(x.strong) ? x.strong.slice() : [] } : null;
  const full = t.kind === 'player' && squadFull(s);
  // Who can be let go to make room: the existing SellPlayer gate decides (bench only in season, never below the minimum squad).
  const release = full ? mine(s).squad.filter((p) => canSell(s, p.id).ok).map((p) => ({ id: p.id, name: p.name, role: p.bat, type: p.bowl, shown: shownAbility(p), batShown: shownBat(p), bowlShown: shownBowl(p) })) /* QA3 m1: same letters as the trial player */ : [];
  return { kind: t.kind, player, coach, wage: t.wage, squadFull: full, release, squadSize: mine(s).squad.length, squadMax: squadMax(s), released: t.kind === 'player' && t.released ? String(t.released) : '',
    canSign: can.ok, why: can.ok ? '' : can.why, sign: 'Sign', decline: 'Decline' };
}
/** The one free facility. pending = show the screen / Home card. null with the flag off. */
export function freePickVM(s) {
  if (!FLAGS.freePick || !s.econ || !s.econ.freePick) return null;
  const options = freePickOptions(s).map((o) => ({ id: o.what, name: o.name, effect: o.effect, recommended: o.recommended, note: o.note, owned: o.owned, ok: o.ok, price: o.price }));
  return { pending: freePickPending(s), done: !!s.econ.freePick.done, pick: s.econ.freePick.pick || null, options };
}

// ---- wheel meta (Spokes, Workshop, tier-up, tokens, craft look). All plain data for the views; nothing here changes state.
const BRANCHES = [['control', 'Control'], ['fortune', 'Fortune'], ['specialist', 'Specialist'], ['craft', 'Craft']];
const materialOf = (tier) => WM.MATERIALS[Math.max(0, Math.min(WM.MATERIALS.length, tier) - 1)];
const NODE_STATE = { ok: 'buy', max: 'max', spokes: 'short', locked: 'locked', needs: 'locked', off: 'locked' };
const nodeNote = (c, rank, max) => c.ok ? (c.cost >= WM.CONFIRM_AT ? 'Buy? This stays for the run.' : '') : c.reason === 'spokes' ? 'Need ' + c.cost + ' Spokes, you have ' + c.have + '.' : c.reason === 'max' ? (max > 1 ? 'All ' + max + ' ranks bought.' : 'Bought.') : 'Opens later.';

/** The Workshop: hidden until tier 1 and the flag. states: owned (bought; a later rank may still open later), max (all ranks bought), buy, short (need more Spokes), locked (opens later). */
export function workshopVM(s) {
  const m = metaOf(s), tier = tierNow(s), visible = !!(FLAGS.wheelMeta && tier >= 1);
  const branches = BRANCHES.map(([id, name]) => ({ id, name, nodes: NODES.filter((n) => n.branch === id).map((n) => {
    const rank = rankOf(s, n.id), max = n.max_rank, c = canBuy(s, n.id), cost = rank >= max ? 0 : (n.cost[rank] != null ? n.cost[rank] : c.cost);
    const next = NODE_STATE[c.reason] || (c.ok ? 'buy' : 'locked'), state = rank >= max ? (max > 1 ? 'max' : 'owned') : rank > 0 && next === 'locked' ? 'owned' : next; // owned with ranks to come: the next rank opens later
    return { id: n.id, name: n.name, tier: n.tier, rank, max, cost, state, words: n.words, note: nodeNote(c, rank, max), confirm: state === 'buy' && cost >= WM.CONFIRM_AT };
  }) }));
  return { visible, spokes: m.spokes | 0, tier, material: materialOf(tier), branches, swap: swapVM(s) };
}

/** The tier-up card, or null when none waits: {tier, material, title, line, unlocks:[node names]}. */
export function tierUpVM(s) {
  if (!FLAGS.wheelMeta) return null;
  const q = nextTierUp(s); const tier = q && typeof q === 'object' ? q.tier : q;
  if (!tier) return null;
  const last = tier >= WM.TIERS.length;
  return { tier, material: materialOf(tier), title: 'Tier ' + tier, line: 'Every spin now drops 1 more Spoke.' + (last ? ' The Crystal Wheel look is yours.' : ''), unlocks: NODES.filter((n) => n.tier === tier && n.branch !== 'craft').map((n) => n.name), crystal: last };
}

/** Token buttons for the result that waits: {options:[{kind,label}], counts:{respin,nudge,two,wild,lift}, spotLeft}. wheel = 'spot' | 'course'; slot 2 = the Twin wheel. Empty when the flag is off or no result waits. */
export function tokenVM(s, wheel, slot = 1) {
  const m = metaOf(s), T = s && s.training || {};
  if (['hype', 'toss', 'pep', 'scout', 'finals'].includes(wheel)) return { options: FLAGS.wheelMeta ? wmTokens(s, wheel) : [], counts: { ...m.tokens }, spotLeft: Math.max(0, WM.SPOT_TOKEN_CAP - (m.spotTokensUsed | 0)) }; // wa1 wire: the waiting match-day / scout / finals result
  const pend = !FLAGS.wheelMeta ? null : wheel === 'course' ? T.coursePending : slot === 2 ? T.pending2 : T.pending;
  const live = pend && (wheel === 'course' || pend.week === T.week);
  return { options: live ? tokenOptions(s, wheel, pend).map((o) => ({ kind: o.kind, label: o.label, count: (m.tokens || {})[/Wild\)$/.test(o.label) ? 'wild' : o.kind] | 0, ...(wheel === 'spot' ? { left: Math.max(0, WM.SPOT_TOKEN_CAP - (m.spotTokensUsed | 0)) } : {}) })) : [], counts: { ...m.tokens }, spotLeft: Math.max(0, WM.SPOT_TOKEN_CAP - (m.spotTokensUsed | 0)) };
}

/** Wheel look from the Craft ranks (they carry across runs). Each is a rank 0..max; material comes from the tier. {rim, hub, ptr, trail, pal, spoke, burst, stand, tick, name, crystal, material} */
export function craftLook(s) {
  const r = (id) => rankOf(s, id);
  return { rim: r('k_rim'), hub: r('k_hub'), ptr: r('k_ptr'), tick: r('k_tick'), trail: r('k_trail'), pal: r('k_pal'), spoke: r('k_spoke'), burst: r('k_burst'), stand: r('k_stand'), name: r('k_name') > 0, crystal: r('k_crystal') > 0, material: FLAGS.wheelMeta ? materialOf(tierNow(s)) : 'wood' };
}

/** Stadium Fans gate line (report p13 s2). Reads the same figures as the build check (s.econ.fans, ECON.STADIUM_FANS[level to build]); progress only, no number changes.
 *  @returns {{text:string, pct:number, ready:boolean, hidden:boolean, next:number|null, fans:number, gate:number, left:number}} hidden at Stadium 5 or with no economy. */
export function fansGateVM(s) {
  const e = s && s.econ;
  const st = e ? Number(e.stadium) | 0 : 5;
  if (!e || st >= 5) return { text: '', pct: 100, ready: false, hidden: true, next: null, fans: 0, gate: 0, left: 0 };
  const L = st + 1, gate = ECON_FANS_GATE[L], fans = Math.max(0, Math.floor(Number(e.fans) || 0));
  const ready = fans >= gate, c = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { text: ready ? `Fans ready: build stadium L${L}` : `Fans ${c(fans)} / ${c(gate)} for stadium L${L}`, pct: ready ? 100 : Math.floor(fans * 100 / gate), ready, hidden: false, next: L, fans, gate, left: Math.max(0, gate - fans) };
}

// ---- wheel match mode (2026-11-15): the wheel screen VM lives in wheelmatch-store.js
export { wheelMatchVM, bowlerChips as wheelBowlerChips, NEXT_MATCH_TEXT } from './wheelmatch-store.js';
/** Settings row for the match mode: value from Settings, greyed mid-match with "Applies next match". @param {any} s */
export function matchModeVM(s) {
  const busy = !!(s && ['bowl', 'break', 'chase', 'done'].includes(s.stage));
  return { value: s && s.matchMode === 'wheel' ? 'wheel' : 'classic', running: s && s.stage && busy ? (s.mode === 'wheel' ? 'wheel' : 'classic') : null, disabled: busy, note: busy ? 'Applies next match' : '' };
}

/* T2 start */
// Spotlight / Course wheel fields the views read when present: spinKey, wobKey, stored (reopen shows the result, never re-spins), kindFloor.
import { spinKeyOf as t2SpinKeyOf, storedStop as t2StoredStop } from '../core/wheel-stops.js';
import { wobbleKey as t2WobbleKey } from '../core/wheel-wobble.js';
const t2Wheel = (s, wheelId, ctx, kf) => {
  const spinKey = t2SpinKeyOf(s, wheelId, ctx);
  return { spinKey, wobKey: spinKey ? t2WobbleKey(s, wheelId, 0, 0) : '', stored: spinKey ? t2StoredStop(s, wheelId, spinKey) : null, kindFloor: kf ? 1 : 0 };
};
/** trainingVM plus the wheel fields on spotlight and twin. */
export function trainingVMT2(s) {
  const vm = trainingVM(s), eff = effective(s), kf = eff && eff.spot && eff.spot.kindFloor;
  return { ...vm,
    spotlight: { ...vm.spotlight, ...t2Wheel(s, 'spot', { playerId: vm.spotlight.id || '', slot: 1 }, kf) },
    twin: { ...vm.twin, ...t2Wheel(s, 'spot', { playerId: vm.twin.id || '', slot: 2 }, kf) } };
}
/** coachesVM plus the wheel fields on each coach.course (k = 2 when the course spends a Master Licence). */
export function coachesVMT2(s) {
  const vm = coachesVM(s), eff = effective(s), kf = eff && eff.course && eff.course.kindFloor;
  return { ...vm, coaches: vm.coaches.map((c) => ({ ...c, course: { ...c.course, ...t2Wheel(s, 'course', { coachId: c.id, k: c.course.licence ? 2 : 1 }, kf) } })) };
}
/* T2 end */

/**
 * Captain's Over view model (CONTRACT-GO s3). null unless a wheel match is in stage bowl or chase.
 * {available, active, side, over, bowler, taps:[{g, ball}], win:{p,g}|null, offset, calibrated, needCal, wheelAvg}
 * available = the pick screen may offer it (unused this innings, not mid-over). win = window of the NEXT tap (striker / bowler letter).
 * @param {any} s
 */
export function goldenVM(s) {
  if (!isWheelMatch(s) || (s.stage !== 'bowl' && s.stage !== 'chase')) return null;
  const bat = s.stage === 'chase', side = bat ? 'bat' : 'bowl', inn = bat ? s.inn2 : s.inn1;
  const slot = goldSlot(s), cal = s.goldCal || null;
  const active = !!(slot && !slot.done), used = !!slot;
  let taps = [], win = null, bowler = slot ? slot.bowler : bat ? rivalBowler(s) : suggestedBowler(s), wheelAvg = null;
  if (active) {
    const nx = goldenNext(s, slot);
    taps = slot.taps.map((t, i) => ({ g: t.g, e: t.e, ball: nx.balls[i] ? nx.balls[i].o : null }));
    win = nx.raw == null ? null : windowFor(nx.raw);
  }
  try { if (bowler >= 0) wheelAvg = modelOf(s, side, bowler).expect.xr; } catch (e) { wheelAvg = null; }
  return { available: !inn.done && !used, active, side, over: inn.over, bowler, taps, win, offset: cal ? cal.offset : 0, calibrated: !!cal, needCal: !cal, wheelAvg };
}
