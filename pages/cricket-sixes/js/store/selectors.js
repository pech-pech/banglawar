// @ts-check
// View models. Pure; views read only these.
import { phaseOf, PHASE_NAMES, matchup, eligibleBowlers } from '../core/match.js';
import { gradeOf, previewCount, shownAbility } from '../core/ability.js';

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
  const call = s.call || { bowler: el.length ? el[0] : -1, field: 'A' };
  return {
    over: inn.over, phase: ph, phaseName: PHASE_NAMES[ph], score: scoreOf(inn),
    crease: crease(inn, bats), bowlers, call, batNames: bats.map((p) => p.name), bowlNames: me.map((p) => p.name),
    canBowl: s.stage === 'bowl' && el.includes(call.bowler), last: s.last,
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
      grade: gradeChip(p),
      previews: aiOrder.slice(0, previewCount(p)).map((bi) => {
        const m = matchup('bat', p, ai[bi], ph);
        return { name: ai[bi].name, bowl: ai[bi].bowl, label: m.label, g: m.g, inPhase: m.inPhase };
      }),
    })),
    aiBowler: lb ? { name: lb.name, bowl: lb.bowl } : null,
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

export function resultVM(s) {
  const a = s.inn1, b = s.inn2;
  let line = 'Tied';
  if (s.result === 'won') { const w = 5 - b.wk; line = `You won by ${w} wicket${w === 1 ? '' : 's'}`; }
  else if (s.result === 'lost') { const r = a.runs - b.runs; line = `You lost by ${r} run${r === 1 ? '' : 's'}`; }
  return { result: s.result, line, inn1: scoreOf(a), inn2: scoreOf(b) };
}
