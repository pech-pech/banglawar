// @ts-check
// View models. Pure; views read only these.
import { phaseOf, PHASE_NAMES, matchup, eligibleBowlers, centreOf } from '../core/match.js';
import { gradeOf, previewCount, shownAbility, shownBat, shownBowl, atPeak, isMax, batPart, bowlPart } from '../core/ability.js';
import { SEASON } from '../data/season.js';
import { DRILLS, SKILLS, TRAIN2 } from '../data/training.js';
import { aiPickSix } from '../core/clubs.js';
import { tagInfo } from '../core/tags.js';
import { tableOrder, placeOf, ME, matchPay, gapLetters, koWinner } from '../core/season.js';
import { planOf, netsPreview, coachList, scoutList, canSign, coachQuality, coachStepInUse, courseCost, canCourse, effortOdds, meanGain, wheelSlices, courseWheel, EFFORTS, FOCUSES, MAX_COACHES, sixOf, drillRoom, focusRating } from '../core/training.js';
import { letterOfRaw, letterOfShown, letterOfStep, ticksOfRaw, fillOfRaw, stepOfRaw } from '../core/letters.js';
import { nodeStatus, treeBoost, treeOf, NODE_COUNT } from '../core/skills.js';
import { planProblem, livePlan, squadFull } from './commands.js';
import { RUN, SQUAD } from '../data/run.js';
import { seasonResult, chapterNames, runScore, carryOf } from '../core/run.js';
import { PAIRING } from '../data/pairing.js';
import { BATS, BOWLS, CELLS, COMBOS, SEEN_BALLS, cellIndex, cellOf, cellName, gradeWord, gradeRank, comboOf, isBook, newBook } from '../core/pairing.js';

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
    return { i, name: p.name, bowl: p.bowl, overs: p.overs, eligible, reason, grade: gradeChip(p), previews, ability: shownAbility(p) };
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
    canBowl: s.stage === 'bowl' && el.includes(call.bowler), last: s.last, firstStrip: firstStripOn(s),
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
    last,
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
    oppName: opp ? opp.name : 'Rival', kindLabel: fx ? RESULT_KIND[fx.kind] : 'Friendly', tpEarned, pay,
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
  if (s.notice !== 'squad8') return null;
  const n = (s.releaseLedger || []).length;
  return { key: 'squad8', line: `The squad is now ${SQUAD.size}.${n ? ` ${n} player${n === 1 ? '' : 's'} moved on.` : ''}` };
}

function finalsVM(s) {
  const F = s.season.finals;
  if (!F) return null;
  const m = (x) => (x && x.a ? { a: clubName(s, x.a), b: clubName(s, x.b), winner: clubName(s, x.winner) } : null);
  return { semis: F.semis.map(m), final: m(F.final) };
}

export function tableVM(s) { return { rows: tableRows(s), finals: finalsVM(s) }; }

export function endVM(s) {
  const se = s.season, run = s.run;
  const last = run && run.last && run.last.n === se.n ? run.last : null;
  const res = last || seasonResult(s); // an old save can sit at 'end' before the season is closed
  const lastSeason = se.n >= RUN.seasons;
  return {
    rows: tableRows(s), finals: finalsVM(s), champion: clubName(s, se.champion), myPlace: placeOf(se.table, ME), tpWon: se.tpWon,
    result: { place: res.place, promoted: res.promoted, toLeague: res.toLeague, stayed: res.stayed, line: res.line },
    chapter: last ? last.chapter : null, claimed: last ? last.claimed : [],
    notebook: last && last.notebook != null ? foundCell(last.notebook) : null,
    lastSeason, promoteTop: RUN.promoteTop, cta: lastSeason ? 'RunEnd' : 'NewSeason',
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
    cta: 'NewRun',
  };
}

// ---- coach scouting (one list a season; sign one or pass)
const SIDE_WORD = TRAIN2.focusLabels;
const strongWords = (strong) => (strong || []).map((f) => SIDE_WORD[f]);
export function coachPickVM(s) {
  const open = canSign(s).ok, signed = s.scout && s.scout.n === (s.season && s.season.n) ? s.scout.signed : null;
  const cands = scoutList(s).map((c) => ({ id: c.id, name: c.name, letter: letterOfStep(c.step), step: c.step, strong: c.strong.slice(), strongWords: strongWords(c.strong) }));
  return { cands, open, full: coachList(s).length >= MAX_COACHES, picked: signed, passed: !!(s.scout && s.scout.passed), why: canSign(s).why };
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
      id: p.id, name: p.name, role: p.bat, type: p.bowl, bat: shownBat(p), bowl: shownBowl(p), ability: shownAbility(p), ...letterVM(p),
      grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), order: six.includes(p.id) ? six.indexOf(p.id) : null,
      benchSlot: (slots.find((x) => x.playerId === p.id) || {}).label || null,
    })),
    bench: slots, full: squadFull(s), squadFull: squadFull(s), fullText: squadFull(s) ? SQUAD.fullText : '', size: mine(s).squad.length,
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
  };
}

// ---- training (P11 redo): Focus + Effort + Spotlight, one Run
const rowOrder = (s) => { const six = sixIds(s); return [...six.map((id) => player(s, id)), ...mine(s).squad.filter((p) => !six.includes(p.id))]; };

/** The four raw 1-99 ratings of a row, in the order the row draws them (Batting Power, Batting Skill, Bowling Speed, Bowling Skill). */
export const ratesOf = (p) => ({ batPower: p.bp, batSkill: p.bs, bowlSpeed: p.spd, bowlSkill: p.bsk });

const coachRow = (s, c) => {
  const cc = canCourse(s, c.id), used = s.training.coursePending && s.training.coursePending.coachId === c.id;
  return {
    id: c.id, name: c.name, step: c.step, letter: letterOfStep(c.step), strong: c.strong.slice(), strongWords: strongWords(c.strong),
    here: !(c.away > 0), away: c.away | 0, course: { ok: cc.ok, why: cc.why, cost: courseCost(s, c.id), free: !s.econ, spun: !!used },
  };
};
const wheelVM = (w) => ({ slices: w.slices.slice(), jackpotIndex: w.jackpotIndex, jackpotGain: w.jackpotGain });

export function trainingVM(s) {
  const T = s.training, plan = planOf(s), pre = netsPreview(s), six = sixIds(s);
  const train = new Set(pre.trainIds), short = new Set(pre.shortIds), skip = new Set(pre.skippedIds);
  const rows = rowOrder(s).map((p) => {
    const st = focusRating(p, plan.focus), line = T.nets && T.nets.week === T.week ? T.nets.lines.find((l) => l.id === p.id) : null;
    return {
      id: p.id, name: p.name, bench: !six.includes(p.id), role: p.bat, type: p.bowl, ...letterVM(p), grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), rates: ratesOf(p),
      status: train.has(p.id) ? 'train' : short.has(p.id) ? 'short' : skip.has(p.id) ? 'skip' : 'train', stat: TRAIN2.statNames[st], spotlight: plan.spotlightId === p.id, line,
    };
  });
  const efforts = EFFORTS.map((id) => { const e = TRAIN2.efforts[id]; return { id, label: e.label, cost: e.cost, mean: Math.round(meanGain(effortOdds(id, 0, plan.focus === 'bal')) * 100) / 100, on: plan.effort === id }; });
  const focuses = FOCUSES.map((id) => ({ id, label: TRAIN2.focusLabels[id], on: plan.focus === id }));
  const coaches = coachList(s).map((c) => ({ ...coachRow(s, c), picked: plan.coachId === c.id, helps: c.strong.includes(plan.focus) }));
  const wheel = plan.spotlightId ? wheelVM(wheelSlices(plan.effort, coachStepInUse(s))) : null;
  const done = !!(T.nets && T.nets.week === T.week);
  return {
    tp: T.tp, week: T.week, plan, focuses, efforts, rows, coaches, coachQuality: coachQuality(s), coachLetter: coachStepInUse(s) ? letterOfStep(coachStepInUse(s)) : null,
    preview: { cost: pre.cost, tpLeft: T.tp - pre.cost, trainCount: pre.trainIds.length, shortCount: pre.shortIds.length, skipCount: pre.skippedIds.length, hint: pre.hint },
    spotlight: { id: plan.spotlightId, wheel, pending: T.pending && T.pending.week === T.week ? { careful: T.pending.careful, index: T.pending.result.index, gain: T.pending.result.gain, jackpot: T.pending.result.jackpot } : null },
    done, result: done ? { lines: T.nets.lines, cost: T.nets.cost, skipped: T.nets.skipped } : null, tips: !T.tipsSeen && !(T.drillCount > 0),
    canRun: !done && pre.trainIds.length > 0, notice: noticeOf(s),
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
  const plan = planOf(s), list = coachList(s);
  return {
    coaches: list.map((c) => ({ ...coachRow(s, c), picked: plan.coachId === c.id, helps: c.strong.includes(plan.focus) })),
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
    coachUps: [], pay: s.pay || null,
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
  const hidden = six.filter((p) => !gradeOf(p)).sort((a, b) => (b.drillsHere | 0) - (a.drillsHere | 0))[0];
  const unlock = hidden ? { name: hidden.name, left: Math.max(1, DRILLS.revealAfter - (hidden.drillsHere | 0)) } : null;
  const oppPlace = fx ? placeOf(se.table, fx.opp) : 0;
  const ko = fx && fx.kind !== 'league';
  const word = pv.valid ? (lp.edited ? 'Saved' : 'Suggested') : 'Fix it';
  return {
    ...base, club: { name: mine(s).name, week: base.round, league: se.league || 1, weeksLeft: left }, lastLeague: last,
    six: six.map((p) => ({ id: p.id, name: p.name, grade: gradeOf(p) || '?', pips: pipsOf(p) })),
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

// ---------------------------------------------------------------- Pairing Book (P4). Grade words only: the points number never leaves core/pairing.js.
const COMBO_LIST = PAIRING.combos;
const PH_WORD = ['Early', 'Middle', 'Late'], PH_OVERS = ['1-3', '4-7', '8-10'];
/** One found cell as the views show it. @param {number} i */
function foundCell(i) {
  const c = cellOf(i), cb = comboOf(i);
  return { i, bat: c.bat, bowl: c.bowl, ph: c.ph, name: cellName(i), grade: gradeWord(i), rank: gradeRank(i), combo: cb };
}
/** Cells found at the end of the last over (the "Pairing found" toast). [] when none. */
export function foundVM(s) { return s && s.last && Array.isArray(s.last.found) ? s.last.found.map(foundCell) : []; }

/** The Pairing Book: 3 batter groups x 3 bowler rows x 3 phase chips, and the 8 combos. */
export function bookVM(s) {
  const book = isBook(s.book) ? s.book : newBook();
  const chip = (i) => {
    const f = !!book.found[i], c = cellOf(i), cb = comboOf(i);
    const base = { i, ph: c.ph, phase: PH_WORD[c.ph], found: f, name: cellName(i) };
    return f ? { ...base, grade: gradeWord(i), rank: gradeRank(i), combo: cb ? cb.name : null }
      : { ...base, balls: Math.min(SEEN_BALLS, book.balls[i]), of: SEEN_BALLS };
  };
  const groups = BATS.map((bat) => ({ bat, rows: BOWLS.map((bowl) => ({ bowl, chips: [0, 1, 2].map((ph) => chip(cellIndex(bat, bowl, ph))) })) }));
  const combos = COMBO_LIST.map((x) => { // sheet order: the four that help the batter, then the four that help the bowler
    const i = cellIndex(x[1], x[2], x[3]), f = !!book.found[i];
    return f ? { name: x[0], found: true, bat: x[1], bowl: x[2], phase: PH_WORD[x[3]], helps: x[5] } : { name: x[0], found: false };
  });
  return {
    found: book.found.reduce((a, b) => a + (b ? 1 : 0), 0), total: CELLS,
    comboFound: combos.filter((c) => c.found).length, comboTotal: COMBOS,
    phases: PH_WORD.map((w, k) => ({ name: w, overs: PH_OVERS[k] })), groups, combos,
  };
}
