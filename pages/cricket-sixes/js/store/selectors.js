// @ts-check
// View models. Pure; views read only these.
import { phaseOf, PHASE_NAMES, matchup, eligibleBowlers, centreOf } from '../core/match.js';
import { gradeOf, previewCount, shownAbility, shownBat, shownBowl, atPeak, isMax, batPart, bowlPart } from '../core/ability.js';
import { SEASON } from '../data/season.js';
import { DRILLS, COACHES, SKILLS } from '../data/training.js';
import { aiPickSix } from '../core/clubs.js';
import { tableOrder, placeOf, ME, tpAward, koWinner } from '../core/season.js';
import { drillOdds, coachLevel, canDrill, drillRoom, drillDef } from '../core/training.js';
import { nodeStatus, treeBoost, treeOf, NODE_COUNT } from '../core/skills.js';
import { planProblem } from './commands.js';
import { RUN } from '../data/run.js';
import { seasonResult, chapterNames, runScore, carryOf } from '../core/run.js';

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
    return { i, name: p.name, bowl: p.bowl, overs: p.overs, eligible, reason, grade: gradeChip(p), previews, ability: shownAbility(p), bowlAb: shownBowl(p) };
  });
  const call = s.call || { bowler: el.length ? el[0] : -1, field: 'A' };
  // P5 field hint: League 1 only. TODO: or the club bought a Coach (no coach-buying code yet).
  // P5b: the PAIR at the crease. Attack if (bp1+bp2)/2 + (bs1+bs2)/2 < 2*centre, else Protect.
  const pair = inn.crease.map((i) => bats[i]).filter(Boolean);
  const showHint = !!(s.season && (s.season.league || 1) === 1) && pair.length > 0;
  const mean = (k) => pair.reduce((a, b) => a + b[k], 0) / (pair.length || 1);
  const pick = mean('bp') + mean('bs') < 2 * centreOf(s) ? 'A' : 'P';
  const fieldHint = showHint ? { pick, why: 'Weak bat? Attack. Big hitter? Protect.' } : null;
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
      grade: gradeChip(p), batAb: shownBat(p),
      previews: aiOrder.slice(0, previewCount(p)).map((bi) => {
        const m = matchup('bat', p, ai[bi], ph);
        return { name: ai[bi].name, bowl: ai[bi].bowl, label: m.label, g: m.g, inPhase: m.inPhase };
      }),
    })),
    aiBowler: lb ? { name: lb.name, bowl: lb.bowl } : null,
    // P5b intent hint: League 1 only. TODO: or the club bought a Coach (no coach-buying code yet).
    intentHint: s.season && (s.season.league || 1) === 1
      ? { pick: inn.over >= 8 ? 'A' : 'R', why: 'Last 3 overs: Attack. Before that: Steady.' } : null,
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
  let tpEarned = null;
  if (fx) {
    let outcome = s.result;
    if (fx.kind !== 'league') {
      const w = koWinner({ a: ME, b: fx.opp, ra: b.runs, rb: a.runs }, placeOf(s.season.table, ME), placeOf(s.season.table, fx.opp));
      outcome = w === ME ? 'won' : 'lost';
    }
    tpEarned = tpAward(fx.kind, outcome);
  }
  return {
    result: s.result, line, inn1: scoreOf(a), inn2: scoreOf(b), inSeason: !!s.season, seed: s.seed,
    oppName: opp ? opp.name : 'Rival', kindLabel: fx ? RESULT_KIND[fx.kind] : 'Friendly', tpEarned,
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
  return tableOrder(s.season.table).map((r, i) => ({ pos: i + 1, name: clubName(s, r.id), p: r.p, w: r.w, l: r.l, t: r.t, pts: r.pts, rd: r.rf - r.ra, me: r.id === ME }));
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
    next = { oppName: opp.name, kindWord: KIND_WORD[fx.kind], oppStrength: d > 2 ? 'Stronger' : d < -2 ? 'Weaker' : 'Even' };
  }
  return {
    season: { n: se.n, league: se.league }, round: se.phase === 'league' ? se.round : se.phase === 'semi' ? SEASON.leagueMatches + 1 : SEASON.leagueMatches + 2,
    phaseWord: PHASE_WORD[se.phase], next, table5: rows.slice(from, from + 5), tp: s.training.tp, cta: 'Pick your six',
    run: s.run ? { season: se.n, of: RUN.seasons, league: se.league || 1, ...chapterNames(s.run) } : undefined,
  };
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
      { key: 'legend', label: 'Legend', detail: carry.legend ? `${carry.legend.name} at ${RUN.carry.legendPct}% (ability ${legendAbility})` : 'No player to carry', available: !!carry.legend },
      { key: 'coach', label: 'Coach', detail: carry.coach ? `${carry.coach.name} at level ${RUN.carry.coachLevel}` : 'No coach to carry', available: !!carry.coach },
      { key: 'stadium', label: 'Stadium', detail: 'Comes with the stadium', available: false },
    ],
    cta: 'NewRun',
  };
}

// ---- coach pick
const TREES_OF_FOCUS = Object.fromEntries(['Power', 'Technique', 'Pace', 'Craft'].map((f) => [f, Object.keys(SKILLS.trees).filter((t) => SKILLS.trees[t].focus === f).map((t) => t.toLowerCase())]));
export function coachPickVM(s) {
  const cands = s.coaches.filter((c) => c.candidate).map((c) => {
    const focus = Object.keys(c.lv).find((f) => c.lv[f] > 0) || 'Power';
    const d = DRILLS.list.find((x) => COACHES.focuses.find((f) => f.focus === focus).rating === x.id);
    const good = (lv) => { const o = drillOdds(s.nets || 1, lv); return Math.round(o.good + o.great); };
    return { id: c.id, name: c.name, focus, drill: d.name, phrase: drillPhrase(d.id), odds3: good(3), odds2: good(2), trees: TREES_OF_FOCUS[focus] };
  });
  return { cands, picked: s.coachPicked ? (s.coaches.find((c) => !c.candidate) || {}).id || null : (s.coachCur || null) };
}

// ---- squad and plan
export function squadVM(s) {
  const six = sixIds(s);
  return {
    title: 'Pick your six', sub: s.fixture ? `Next: ${clubName(s, s.fixture.opp)}. Choose 6 of ${mine(s).squad.length}; first pick bats first.` : undefined,
    players: mine(s).squad.map((p) => ({
      id: p.id, name: p.name, role: p.bat, type: p.bowl, bat: shownBat(p), bowl: shownBowl(p), ability: shownAbility(p),
      grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p), order: six.includes(p.id) ? six.indexOf(p.id) : null,
    })),
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

// ---- training
const staff = (s) => s.coaches.filter((c) => !c.candidate);
function coachLine(s) {
  const c = staff(s)[0];
  if (!c) return 'No coach yet';
  const best = Object.keys(c.lv).sort((a, b) => c.lv[b] - c.lv[a])[0];
  return `Coach ${c.name}: ${best} level ${c.lv[best]}`;
}
const drillGain = (s, id) => { const e = (s.training.weekLog || []).find((x) => x.type === 'Drill' && x.playerId === id); return e || null; };
const rowOrder = (s) => { const six = sixIds(s); return [...six.map((id) => player(s, id)), ...mine(s).squad.filter((p) => !six.includes(p.id))]; };

export function trainingVM(s) {
  const six = sixIds(s);
  const rows = rowOrder(s).map((p) => {
    const g = drillGain(s, p.id);
    const status = g ? (g.gain > 0 ? '+' + g.gain : 'done') : atPeak(p) ? 'peak' : 'drill';
    const row = { id: p.id, name: p.name, bench: !six.includes(p.id), role: p.bat, type: p.bowl, ability: shownAbility(p), max: isMax(p), grade: gradeOf(p) || '?', pips: pipsOf(p), status };
    if (g && g.gain > 0) row.gainRating = RATING_KEY[drillDef(g.drillId).rating];
    return row;
  });
  return { tp: s.training.tp, week: s.training.week, done: Object.keys(s.training.drilled || {}).length, total: rows.length, coachLine: coachLine(s), coachNotice: coachNoticeOf(s), drillCost: DRILLS.costTp, rows };
}

const REASON = { week: 'Already drilled this week', tp: 'Not enough TP', peak: 'At his peak', balance: 'Too far above his lowest rating', max: 'Already at 99', unknown: 'Not available' };
export function playerVM(s, id) {
  const p = player(s, id);
  if (!p) return null;
  const nets = s.nets || 1;
  const six = sixIds(s);
  const drills = DRILLS.list.map((d) => {
    const lv = coachLevel(s.coaches, d.focus), o = drillOdds(nets, lv), chk = canDrill(s, id, d.id), room = drillRoom(p, d.id);
    return { id: d.id, name: d.name, rating: RATING_KEY[d.rating], goodPlus: Math.round(o.good + o.great), coachLine: lv ? `Coach level ${lv}` : 'No coach here',
      room: !chk.ok ? null : room.upTo ? `Only +${room.upTo} fits` : null, locked: !chk.ok, reason: chk.ok ? null : REASON[chk.reason] };
  });
  const open = [];
  for (const side of ['bat', 'bowl']) for (let n = 1; n <= NODE_COUNT; n++) { const st = nodeStatus(s, id, side, n); if (st.status === 'available') { open.push(st.cost); break; } }
  const hidden = gradeOf(p) === null;
  return {
    id, name: p.name, bench: !six.includes(id), role: p.bat, type: p.bowl, grade: gradeOf(p) || '?', pips: pipsOf(p), peak: atPeak(p), max: isMax(p),
    potential: hidden ? null : p.potential, previews: previewCount(p), tp: s.training.tp, drillCost: DRILLS.costTp,
    ability: { bat: shownBat(p), bowl: shownBowl(p), overall: shownAbility(p) },
    ratings: RATINGS.map((k) => ({ key: RATING_KEY[k], val: p[k], limit: Math.min(DRILLS.hardCap, p[k] + Math.max(0, drillRoom(p, k).room)) })),
    limitLine: `Ratings go up to ${DRILLS.hardCap}, and no more than ${DRILLS.balance} above the lowest one.`,
    capLine: null,
    drills, node: { cost: open.length ? Math.min(...open) : null, label: 'Skill trees' },
  };
}

export function drillResultVM(s, id) {
  const r = s.training.last;
  if (!r || (id != null && r.playerId !== id)) return null;
  const p = player(s, r.playerId), rows = rowOrder(s);
  const next = rows.find((x) => !s.training.drilled[x.id]);
  return {
    id: p.id, name: p.name, grade: gradeOf(p) || '?', pips: pipsOf(p), drillName: drillDef(r.drillId).name, word: r.outcome, rating: RATING_KEY[r.rating],
    gain: r.gain, before: r.before, after: r.after, odds: r.odds, cut: r.cut, revealed: !!r.revealed,
    coachLine: r.coachLevel ? `Coach level ${r.coachLevel} helped` : 'No coach for this drill', coachXp: r.coach ? `+${r.coach.xp} XP` : '',
    tp: s.training.tp, left: rows.length - Object.keys(s.training.drilled).length, next: next ? { id: next.id, name: next.name } : null,
  };
}

const WEEK_REASON = 'One new skill a week';
/** Plain name and one plain line for each skill node: [name, line]. Tuning (data/training.js) holds the numbers; players never see them. */
const NODE_INFO = {
  Opener: [['Steady start', 'Fewer wickets in overs 1-3'], ['Safe pairs', 'A bad match-up hurts less'], ['Fast start', 'More 4s and 6s in overs 1-3'], ['Spin basher', 'More 4s against spin'], ['Rock solid', 'A bad match-up hurts even less']],
  Middle: [['Nudge and run', 'More singles in overs 4-7'], ['Calm hands', 'Bad match-ups hurt less'], ['Gap finder', 'More 4s in overs 4-7'], ['Pace smasher', 'More 6s against fast bowlers'], ['Anchor', 'Bad match-ups hurt much less, and fewer wickets in overs 4-7']],
  Lower: [['Tail guard', 'Fewer wickets in overs 8-10'], ['Brave tail', 'Bad match-ups hurt a lot less'], ['Big finish', 'More 6s in overs 8-10'], ['Medium muncher', 'More 4s against medium bowlers'], ['Go for it', 'On Attack, more 4s and 6s']],
  Fast: [['Quick strike', 'More wickets in overs 1-3'], ['Middle breaker', 'Middle-order batters hit fewer great shots'], ['Death stopper', 'Fewer 6s in overs 8-10'], ['Hunter field', 'More wickets with the Attack field'], ['Burst', 'One over each innings with extra wickets']],
  Medium: [['Tight finish', 'Fewer 4s in overs 8-10'], ['Tail tamer', 'Lower-order batters hit fewer great shots'], ['Boundary guard', 'Fewer 6s'], ['Middle trap', 'More wickets in overs 4-7'], ['Safe field', 'Fewer 4s with the Protect field']],
  Spin: [['Slow squeeze', 'Fewer 4s in overs 4-7'], ['Opener puzzle', 'Opening batters hit fewer great shots'], ['Turn and take', 'More wickets in overs 4-7'], ['Six stopper', 'Fewer 6s'], ['Burst', 'One over each innings with extra wickets']],
};
export function treeVM(s, id) {
  const p = player(s, id);
  if (!p) return null;
  const trees = ['bat', 'bowl'].map((side) => {
    const tree = treeOf(p, side), def = SKILLS.trees[tree], boosted = treeBoost(s.coaches, tree) > 1;
    const owned = p.nodes ? p.nodes[side] || 0 : 0;
    return {
      side, title: side === 'bat' ? `${tree} batting` : `${tree} bowling`, key: tree.toLowerCase(), owned, boost: { on: boosted, text: boosted ? 'Coach bonus: effects x1.5' : `Needs a level ${SKILLS.boostMinLevel} ${def.focus} coach for x${SKILLS.boost}` },
      nodes: def.nodes.map((nd, k) => {
        const i = k + 1, st = nodeStatus(s, id, side, i);
        const state = st.status === 'owned' ? 'done' : i === owned + 1 ? 'next' : 'locked';
        const reason = st.status === 'owned' || st.status === 'available' ? null : st.reason === 'order' ? 'Buy the earlier node first.' : st.reason === 'coach' ? `Needs a level ${nd.needsCoachLevel} ${def.focus} coach.` : null;
        const info = NODE_INFO[tree] && NODE_INFO[tree][k];
        const weekLock = st.status === 'locked' && st.reason === 'week';
        return { i, name: info ? info[0] : `Skill ${i}`, text: info ? info[1] : nd.text, cost: nd.cost, state: weekLock ? 'locked' : state, reason: weekLock ? WEEK_REASON : reason, weekLock };
      }),
    };
  });
  return { id, name: p.name, tp: s.training.tp, blocked: s.training.nodeBought && s.training.nodeBought[id] ? WEEK_REASON + '.' : null, trees };
}

export function coachesVM(s) {
  const T = COACHES.xp;
  const coaches = staff(s).map((c) => ({
    id: c.id, name: c.name, here: !(c.away > 0),
    foci: COACHES.focuses.map((f) => {
      const lv = c.lv[f.focus] || 0;
      return { key: f.focus, drill: DRILLS.list.find((d) => d.id === f.rating).name, level: lv, xp: c.xp[f.focus] || 0, from: lv ? T[lv - 1] : 0, to: lv >= T.length ? null : T[lv] };
    }),
    boost: Object.values(c.lv).some((v) => v >= SKILLS.boostMinLevel) ? `Skill trees x${SKILLS.boost} while he is here` : null,
  }));
  return { coaches, note: 'A coach helps the drill that matches his focus. Each level adds to the Good chance.' };
}

// ---- week summary
export function weekVM(s) {
  const W = s.training.weekSummary || { week: s.training.week - 1, gains: [], reveals: [], nodes: [], coachUps: [] };
  const name = (id) => player(s, id).name;
  const gains = rowOrder(s).map((p) => {
    const g = W.gains.find((x) => x.playerId === p.id);
    if (!g) return { id: p.id, name: p.name, rating: null, n: 0, before: shownAbility(p), after: shownAbility(p) };
    const prev = { ...p }; RATINGS.forEach((k, i) => { prev[k] = p[k] - g.by[i]; });
    const at = g.by.findIndex((v) => v > 0);
    return { id: p.id, name: p.name, rating: at >= 0 ? RATING_KEY[RATINGS[at]] : null, n: g.total, before: shownAbility(prev), after: shownAbility(p) };
  });
  const last = s.season.last;
  const results = s.season.results.filter((r) => last && r.kind === last.kind && (last.kind !== 'league' || r.round === last.round));
  return {
    week: W.week, pos: placeOf(s.season.table, ME), tp: s.training.tp, cta: s.season.phase === 'over' ? 'See season results' : 'Next match', gains,
    reveals: W.reveals.map((r) => ({ name: name(r.playerId), grade: r.grade })),
    nodes: W.nodes.map((n) => ({ name: name(n.playerId), node: n.node })),
    coachUps: W.coachUps.map((c) => ({ name: (s.coaches.find((x) => x.id === c.coachId) || {}).name, focus: c.focus, level: c.to })),
    roundResults: results.map((r) => ({ a: clubName(s, r.a), b: clubName(s, r.b), ra: r.ra, wa: r.wa, rb: r.rb, wb: r.wb, me: r.a === ME || r.b === ME })),
  };
}

// ---- p7first
/** Plain phrase for a drill's rating (proposed wording, not checked by NUMBERS). */
const DRILL_PHRASE = { bp: 'big hitting practice', bs: 'batting practice', spd: 'fast bowling practice', bsk: 'bowling accuracy practice' };
export const drillPhrase = (ratingId) => DRILL_PHRASE[ratingId] || 'practice';

/** First-match strip (3 lines + Skip): League 1 season 1 match 1, first over, until skipped. */
export function firstStripOn(s) {
  return !!(s.season && s.season.n === 1 && s.season.round === 1 && s.stage === 'bowl' && s.inn1 && s.inn1.over === 1 && !(s.seen && s.seen.firstStrip));
}

/** Notice at the top of training week 1: who the coach is and what he is best at, with Change. null once a drill is done. */
export function coachNoticeOf(s) {
  const c = (s.coaches || []).find((x) => !x.candidate);
  if (!s.coachPool || !c || !s.coachPicked || ((s.training && s.training.drillCount) || 0) > 0) return null;
  const focus = Object.keys(c.lv).find((f) => c.lv[f] > 0) || 'Power';
  const d = DRILLS.list.find((x) => x.focus === focus);
  return { name: c.name, focus, line: `${c.name} is your coach. He is best at ${drillPhrase(d && d.id)}.`, canChange: true };
}
