// @ts-check
// Port of 2026-11-12/sim/match_sim.py ball() plus innings rules. Pure and seeded.
import { T, MATCH, BAT_HOME, BOWL_HOME, CLAMPS } from '../data/match.js';
import { FLAGS } from '../data/flags.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const phaseOf = (over) => over <= 3 ? 0 : over <= 7 ? 1 : 2;
export const PHASE_NAMES = ['Early', 'Middle', 'Late'];

/** Effective ratings and probabilities for one ball, with the parts used for the why line. */
export function ballProbs(b, w, ph, intent, field) {
  const step = MATCH[`${b.bat}|${w.bowl}`];
  const m = T.MATCHUP * step;
  let bp = b.bp + m, bs = b.bs + m, spd = w.spd - m, bsk = w.bsk - m;
  const batHome = BAT_HOME[b.bat] === ph, bowlHome = BOWL_HOME[w.bowl] === ph;
  if (batHome) { bp += T.PHASE_BONUS; bs += T.PHASE_BONUS; }
  if (bowlHome) { if (w.bowl === 'Fast') spd += T.PHASE_BONUS; else bsk += T.PHASE_BONUS; }
  const C = CLAMPS;
  const wicket = clamp(T.W_BASE + T.W_K * (spd - bs) + T.W_INT[intent] + T.W_FIELD[field], C.wicket[0], C.wicket[1]);
  const six = clamp(T.S6_BASE + T.PW_K * (bp - bsk) + T.S6_INT[intent] + T.S6_FIELD[field], C.six[0], C.six[1]);
  const four = clamp(T.S4_BASE + T.PW_K * (bp - bsk) + T.S4_INT[intent] + T.S4_FIELD[field], C.four[0], C.four[1]);
  const singleRaw = clamp(T.P1_BASE + T.P1_K * (bs - bsk) + T.P1_INT[intent], C.single[0], C.single[1]);
  const two = T.P2_BASE;
  const rest = Math.max(0, 1 - wicket - six - four - two);
  const single = Math.min(singleRaw, rest);
  return { p: { wicket, six, four, two, single }, dot: rest - single, singleRaw, eff: { bp, bs, spd, bsk }, step, batHome, bowlHome };
}
/** Same roll order as match_sim.ball: wicket, 6, 4, 2, single, else dot. */
export function outcomeFromX(p, singleRaw, x) {
  if (x < p.wicket) return 'W'; x -= p.wicket;
  if (x < p.six) return 6; x -= p.six;
  if (x < p.four) return 4; x -= p.four;
  if (x < p.two) return 2; x -= p.two;
  return x < singleRaw ? 1 : 0;
}
/** Matchup grade seen from one side: +1 Great, 0 Even, -1 Bad, plus in-phase flag. side = 'bowl' or 'bat'. */
export function matchup(side, batter, bowler, ph) {
  const step = MATCH[`${batter.bat}|${bowler.bowl}`];
  const g = side === 'bowl' ? -step : step;
  const inPhase = side === 'bowl' ? BOWL_HOME[bowler.bowl] === ph : BAT_HOME[batter.bat] === ph;
  return { g, label: g > 0 ? 'Great' : g < 0 ? 'Bad' : 'Even', inPhase };
}
/** Bowlers who may bowl this over: max 2 overs, never two in a row, forced if unbowled players need overs. (match_sim pick_bowler lines) */
export function eligibleBowlers(team, over, last) {
  const left = 10 - over + 1;
  const need = team.filter((p) => p.overs === 0).length;
  let el = team.map((p, i) => i).filter((i) => team[i].overs < 2 && i !== last);
  if (need >= left) { const f = el.filter((i) => team[i].overs === 0); if (f.length) el = f; }
  return el;
}
export function newInnings(bat, bowl, target) {
  bowl.forEach((p) => (p.overs = 0, p.figs = { r: 0, w: 0 }));
  bat.forEach((p) => (p.inn = { r: 0, b: 0, out: false }));
  return { runs: 0, wk: 0, balls: 0, over: 1, crease: [0, 1], strike: 0, next: 2, last: null, target, done: false, pads: FLAGS.luckyPad ? T.PAD_USES : 0, overs: [] };
}
/** Bowl one over. Returns the six (or fewer) balls with their parts for why lines. */
export function playOver(rng, inn, bat, bowl, bi, intent, field) {
  const ph = phaseOf(inn.over); const w = bowl[bi]; const balls = [];
  w.overs += 1; inn.last = bi;
  for (let k = 0; k < 6 && !inn.done; k++) {
    const si = inn.crease[inn.strike]; const b = bat[si];
    const pr = ballProbs(b, w, ph, intent, field);
    let o = outcomeFromX(pr.p, pr.singleRaw, rng.random());
    inn.balls += 1; b.inn.b += 1;
    const rec = { n: `${inn.over}.${k + 1}`, o, batter: si, bowler: bi, pr, intent, field, ph };
    if (o === 'W') {
      inn.wk += 1; w.figs.w += 1; b.inn.out = true;
      if (inn.wk >= 5 || inn.next >= bat.length) inn.done = true; else inn.crease[inn.strike] = inn.next++;
    } else {
      inn.runs += o; b.inn.r += o; w.figs.r += o;
      if (o % 2 === 1) inn.strike ^= 1;
    }
    balls.push(rec);
    if (inn.target != null && inn.runs > inn.target) inn.done = true;
  }
  inn.strike ^= 1; inn.over += 1;
  if (inn.over > 10) inn.done = true;
  inn.overs.push({ bowler: bi, intent, field, balls });
  return balls;
}
