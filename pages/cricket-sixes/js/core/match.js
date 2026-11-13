// @ts-check
// Port of 2026-11-12/sim/match_sim.py ball() plus innings rules. Pure and seeded.
import { T, MATCH, BAT_HOME, BOWL_HOME, CLAMPS } from '../data/match.js';
import { FLAGS } from '../data/flags.js';
import { leagueOf } from '../data/leagues.js';
import { pairPoints } from './pairing.js';
import { MD } from '../data/matchday.js';
import { roarAt, scaleRatings } from './matchday.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const phaseOf = (over) => over <= 3 ? 0 : over <= 7 ? 1 : 2;
export const PHASE_NAMES = ['Early', 'Middle', 'Late'];

/** FIELD_CENTRE for a match state: the season's league rival strength (L1 30 ... L5 62), 50 for a step-0 match. Set once per match, same for both sides. */
export const centreOf = (s) => (s && s.season ? leagueOf(s.season.league || 1).ratingMean : T.FIELD_CENTRE);
const zOf = (b, centre) => [clamp((b.bp - centre) / 8, -2, 2), clamp((centre - b.bs) / 8, -2, 2)];

/** Field terms for one ball (combo_sim.ball). zh/zw use the batter's RAW bp/bs read against `centre` (FIELD_CENTRE, default 50). lost = wickets lost 0-4, over = 1-10. */
export function fieldTerms(b, field, over, lost, centre = T.FIELD_CENTRE) {
  const G = T.G5, [zh, zw] = zOf(b, centre);
  if (field === 'A') {
    const mb = Math.max(0, 1 + G.KB * zh);
    return { w: G.W_A * Math.max(0, 1 + G.KW * zw + G.WK * lost), four: T.S4_FIELD.A * mb, six: T.S6_FIELD.A * mb };
  }
  if (field === 'P') {
    const mb = Math.max(0, 1 + G.KB * zh + G.LATE * (over >= 8 ? 1 : 0));
    return { w: T.W_FIELD.P, four: T.S4_FIELD.P * mb, six: T.S6_FIELD.P * mb };
  }
  return { w: 0, four: 0, six: 0 };
}
/** Rival's field call and the on-screen hint share this: Attack if KW*zw + WK*lost - KB*zh - LATE*(over>=8) > P_C, else Protect. zh/zw read against `centre`. */
export function hybridField(b, over, lost, centre = T.FIELD_CENTRE) {
  const G = T.G5, [zh, zw] = zOf(b, centre);
  return G.KW * zw + G.WK * lost - G.KB * zh - G.LATE * (over >= 8 ? 1 : 0) > G.P_C ? 'A' : 'P';
}

/**
 * Effective ratings and probabilities for one ball, with the parts used for the why line.
 * Signature: (b, w, ph, intent, field, fx?, over?, lost?, centre?). `fx` keeps its place (core-training hook). over = 1-10 (default: first
 * over of phase ph), lost = wickets lost by the batting side 0-4 (default 0), centre = FIELD_CENTRE (default 50, the league's rival strength in a season).
 * Also accepted: (b, w, ph, intent, field, over, lost, fx?, centre?).
 * A last argument `pair` (rating points of the hidden pairing cell, default 0) goes into the same slot as the visible grid: m = MATCHUP*step + pair.
 * With pair 0 every number is exactly as before (the 500 frozen vectors).
 * A last argument `faced` (balls this batter has faced this innings, before this ball) feeds the hidden "settled" rule: with FLAGS.settled,
 * wicket *= 1 - SETTLED_K x min(faced, 25)/25, after the clamp, inside pr (so luck and the why line read the same pr). Flag off: nothing changes.
 */
export function ballProbs(b, w, ph, intent, field, ...args) {
  let fx, over, lost;
  let centre, pair, faced;
  if (typeof args[0] === 'number') [over, lost, fx, centre, pair, faced] = args; else [fx, over, lost, centre, pair, faced] = args;
  centre ??= T.FIELD_CENTRE; pair = pair || 0;
  over ??= [1, 4, 8][ph]; lost = Math.min(lost ?? 0, 4);
  const step = MATCH[`${b.bat}|${w.bowl}`];
  let m = T.MATCHUP * step;
  let dW = 0, d6 = 0, d4 = 0, d1 = 0;
  if (fx) {
    // Skill-tree hook (training). Absent fx leaves every number below exactly as before.
    const bf = fx.of(b)?.bat, wf = fx.of(w)?.bowl;
    if (m < 0 && bf?.bad) m = Math.min(0, m + bf.bad);
    else if (m > 0 && wf?.great) m = Math.max(0, m - wf.great);
    const add = (e) => { if (e.k === 'wicket') dW += e.v; else if (e.k === 'six') d6 += e.v; else if (e.k === 'four') d4 += e.v; else d1 += e.v; };
    const ok = (e, opp) => (e.ph == null || e.ph === ph) && (e.vs == null || e.vs === opp) && (e.intent == null || e.intent === intent) && (e.field == null || e.field === field);
    for (const e of bf?.eff || []) if (ok(e, w.bowl)) add(e);
    for (const e of wf?.eff || []) if (ok(e, b.bat)) add(e);
    if (fx.burst && wf?.burst) dW += wf.burst;
  }
  m += pair; // hidden pairing (P4): after the skill-tree changes to the visible grid, then the same slot
  let bp = b.bp + m, bs = b.bs + m, spd = w.spd - m, bsk = w.bsk - m;
  const batHome = BAT_HOME[b.bat] === ph, bowlHome = BOWL_HOME[w.bowl] === ph;
  if (batHome) { bp += T.PHASE_BONUS; bs += T.PHASE_BONUS; }
  if (bowlHome) { if (w.bowl === 'Fast') spd += T.PHASE_BONUS; else bsk += T.PHASE_BONUS; }
  const C = CLAMPS;
  const ft = fieldTerms(b, field, over, lost, centre);
  const xa = intent === 'A' ? T.PH_WA[ph] : 0; // Attack only, by phase index
  let wicket = clamp(T.W_BASE + T.W_K * (spd - bs) + T.W_INT[intent] + xa + ft.w + dW, C.wicket[0], C.wicket[1]);
  let settled;
  if (FLAGS.settled) { settled = Math.min(Math.max(faced || 0, 0), MD.SETTLED_MAX_BALLS) / MD.SETTLED_MAX_BALLS; wicket *= 1 - MD.SETTLED_K * settled; }
  const six = clamp(T.S6_BASE + T.PW_K * (bp - bsk) + T.S6_INT[intent] + ft.six + d6, C.six[0], C.six[1]);
  const four = clamp(T.S4_BASE + T.PW_K * (bp - bsk) + T.S4_INT[intent] + ft.four + d4, C.four[0], C.four[1]);
  const singleRaw = clamp(T.P1_BASE + T.P1_K * (bs - bsk) + T.P1_INT[intent] + d1, C.single[0], C.single[1]);
  const two = T.P2_BASE;
  const rest = Math.max(0, 1 - wicket - six - four - two);
  const single = Math.min(singleRaw, rest);
  const out = { p: { wicket, six, four, two, single }, dot: rest - single, singleRaw, eff: { bp, bs, spd, bsk }, ft, step, pair, batHome, bowlHome };
  if (settled !== undefined) out.settled = settled;
  return out;
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
/** `pairing` true = the hidden pairing layer is on (season matches; a step-0 match leaves it off so its numbers are unchanged). */
/** `opts` (optional, r9): { ours: 'bat'|'bowl' (which side is ours), md: rollMatchday result, innIdx: 0|1 (0 = we bowl first, 1 = our chase) }.
 *  With FLAGS.roar and a roar over, our side's ratings are scaled x(1+ROAR_BOOST) for this over only (on copies). Rival never roars. */
export function playOver(rng, inn, bat, bowl, bi, intent, field, fx, centre = T.FIELD_CENTRE, pairing = false, opts = undefined) {
  const ph = phaseOf(inn.over); const w = bowl[bi]; const balls = [];
  let ballFx = fx;
  if (fx && fx.of(w)?.bowl?.burst) {
    // Burst rule (tuning burst_rule_text): once per innings, his first over in his home phase, or from over 8 if still unused. No button.
    const used = inn.burstOver ?? 0;
    if (used === inn.over || (used === 0 && (BOWL_HOME[w.bowl] === ph || inn.over >= 8))) { inn.burstOver = inn.over; ballFx = { of: fx.of, burst: true }; }
  }
  w.overs += 1; inn.last = bi;
  const roarOn = !!(FLAGS.roar && opts && opts.md && opts.ours && roarAt(opts.md, (opts.innIdx ?? (opts.ours === 'bowl' ? 0 : 1)) * 10 + inn.over - 1));
  if (roarOn) (inn.roarOvers ||= []).push(inn.over);
  for (let k = 0; k < 6 && !inn.done; k++) {
    const si = inn.crease[inn.strike]; const b = bat[si];
    const faced = b.inn.b;
    const bq = roarOn && opts.ours === 'bat' ? scaleRatings(b, MD.ROAR_BOOST) : b;
    const wq = roarOn && opts.ours === 'bowl' ? scaleRatings(w, MD.ROAR_BOOST) : w;
    const pr = ballProbs(bq, wq, ph, intent, field, ballFx, inn.over, inn.wk, centre, pairing ? pairPoints(b.bat, w.bowl, ph) : 0, faced);
    let o = outcomeFromX(pr.p, pr.singleRaw, rng.random());
    inn.balls += 1; b.inn.b += 1;
    const rec = { n: `${inn.over}.${k + 1}`, o, batter: si, bowler: bi, pr, intent, field, ph };
    if (pr.settled !== undefined) rec.faced = faced;
    if (o === 'W') {
      if (pr.settled !== undefined) (inn.wkLog ||= []).push({ side: opts && opts.ours ? (opts.ours === 'bat' ? 'me' : 'rival') : null, batterId: b.id ?? si, balls: faced, settled: pr.settled });
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
  const ov = { bowler: bi, intent, field, balls };
  if (roarOn) ov.roar = true;
  inn.overs.push(ov);
  return balls;
}
