// Z2: WheelOver, the match wheel spin + STOP (owner T1). Old commands.js wheelOver().
// ctx: the wheelmatch-store.js calls (that module imports commands.js, so no direct import here: no ESM cycle) and the commands.js match helpers.
// A2.11m (CONTRACT-A s6/s7, wheels SPEC 2d/13): every landed spin is written to wheels.stops.match[spinKey] by recordStop in this same
// dispatch, before the view starts the glide. Nothing is written before STOP (an aimed spin with no STOP is a no-op: unspun, no token).
// A spin whose key is already stored is never re-rolled: the stored slice is read back and played.
import { makeRng } from '../../core/rng.js';
import { FLAGS } from '../../data/flags.js';
import { emptyWheelMeta } from '../../core/save-migrate.js';
import { MATCH_SPOKES_PER_SPIN } from '../../data/wheelmatch.js';
import { matchPhys, matchWobble, ctrlOf, landingPos, unaimedPos, segAt, pickSample, stopBucket, isCareful, replayOver } from '../../core/wheelmatch.js';
import { recordStop, spinKeyOf, storedStop } from '../../core/wheel-stops.js';
import { cycleOf } from '../../core/wheel-pulse.js';
import { WHEEL_ENGINE } from '../../data/wheel-engine.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const OVERS = 10; // overs an innings (wheelmatch-store OVERS)

/** Match spin number 1..20 (innings 1 overs 1-10, innings 2 overs 11-20): the `ball` of spinKeyOf(s, 'match', {ball}). */
export const matchBallOf = (innIdx, over) => innIdx * OVERS + over;

/** The kept StopRec of a stored entry, or null. */
function keptRec(e) {
  if (!e || !e.stops.length) return null;
  const k = Number.isInteger(e.kept) && e.kept >= 0 && e.kept < e.stops.length ? e.kept : 0;
  const r = e.stops[k];
  return r && typeof r === 'object' ? r : null;
}

/** StopRec timing of a STOP payload: stopT (ms since SPIN), cycle, tInCycle; derived from stop.t (s) when the view did not send them. */
function stopTiming(stop) {
  const stopT = Math.max(0, Math.round(isNum(stop.stopT) ? stop.stopT : stop.t * 1000));
  const c = cycleOf(stopT / 1000);
  const cycle = Number.isInteger(stop.cycle) && stop.cycle >= 1 ? stop.cycle : c.cycle;
  const tInCycle = isNum(stop.tInCycle) && stop.tInCycle >= 0 ? stop.tInCycle : c.tInCycle;
  return { stopT, cycle, tInCycle };
}

/**
 * WheelOver {bowler?, stop?:{t, phi, stopT?, cycle?, tInCycle?}, auto?}: one spin = one over. Bowl: our bowler picked live (legal only; auto = the suggested one).
 * Chase: the rival's bowler is deterministic (rivalBowler). Calls are neutral (field P, intent R). The landing picks one sampled over and the
 * real over is replayed with that sample's rng, so the 6-ball row is exactly the label. Innings end, break, result: as bowlOver.
 */
export function wheelOver(s, p, ctx) {
  const { isWheelMatch, legalBowlers, suggestedBowler, rivalBowler, modelOf, markRoar, countBook, summarise, defaultCall, NEUTRAL_INTENT, NEUTRAL_FIELD } = ctx;
  if (!isWheelMatch(s) || (s.stage !== 'bowl' && s.stage !== 'chase')) return s;
  const bowlSide = s.stage === 'bowl', side = bowlSide ? 'bowl' : 'bat', innIdx = bowlSide ? 0 : 1;
  const inn0 = bowlSide ? s.inn1 : s.inn2, over = inn0.over;
  const spinKey = spinKeyOf(s, 'match', { ball: matchBallOf(innIdx, over) });
  const held = spinKey ? keptRec(storedStop(s, 'match', spinKey)) : null; // already landed: read back, never re-roll
  const auto = held ? !!held.auto : !!(p && p.auto);
  const stop = held || auto ? null : p && p.stop && isNum(p.stop.t) && isNum(p.stop.phi) ? p.stop : null;
  if (!held && !auto && !stop) return s; // an aimed spin needs its STOP (before STOP: nothing stored, ball unspun)
  let bowler;
  if (bowlSide) {
    const legal = legalBowlers(s);
    bowler = p && Number.isInteger(p.bowler) ? p.bowler : auto ? suggestedBowler(s) : -1;
    if (!legal.includes(bowler)) { if (!auto && !held) return s; bowler = suggestedBowler(s); }
    if (bowler < 0) return s;
  } else bowler = rivalBowler(s);
  const phys = matchPhys(s), ctrl = ctrlOf(s);
  let pos = null, tickPos = null, t = null, phi = null, bucket = null;
  if (stop) {
    t = Math.max(WHEEL_ENGINE.STOP_GUARD_S, stop.t); phi = stop.phi; // STOP guard only; no upper clamp (no coast)
    const e = matchWobble(s, matchBallOf(innIdx, over), 0, phys.J); // keyed wobble (CONTRACT-A sec 3): spinIndex = ball no., respin 0
    pos = landingPos(phys, { t, phi, e });
    tickPos = landingPos(phys, { t, phi, e: 0 });
    bucket = stopBucket(t);
  } else if (!held) pos = unaimedPos(makeRng(`${s.seed}|wma|${s.stage}|${over}`));
  else if (!auto) { t = held.stopT / 1000; bucket = stopBucket(t); }
  // Land, pick the sample, replay it on a clone. The replay must give the sample's runs/wkts; on a mismatch (stale memo) rebuild uncached once.
  let model, segIdx, seg, sample, n, inn, balls, runs0, wk0;
  for (const fresh of [false, true]) {
    model = modelOf(s, side, bowler, fresh);
    if (held) { // the stored ring index; its centre stands in for the landing position
      segIdx = Math.max(0, Math.min(model.segs.length - 1, held.sliceId | 0));
      const g = model.segs[segIdx]; pos = g.start + g.width / 2; if (!auto) tickPos = pos;
    } else segIdx = segAt(model.segs, pos);
    seg = model.segs[segIdx];
    sample = pickSample(makeRng(`${s.seed}|wmp|${s.stage}|${over}`), model.samples, seg);
    n = structuredClone(s);
    inn = bowlSide ? n.inn1 : n.inn2; runs0 = inn.runs; wk0 = inn.wk;
    balls = replayOver(n, side, bowler, sample.k); // the landed sample's rng on the real state: same fx, centre, pairing, roar, boost as the model; field P, intent R
    if (inn.runs - runs0 === sample.runs && inn.wk - wk0 === sample.wk) break;
  }
  const careful = auto ? false : isCareful(model.segs, segAt(model.segs, tickPos));
  if (!held && spinKey) { // A2.11m: the STOP record, same dispatch, before the result is drawn
    const tm = stop ? stopTiming(stop) : { stopT: 0, cycle: 1, tInCycle: 0 };
    recordStop(n, 'match', spinKey, { ...tm, sliceId: segIdx, value: seg.value, auto, respin: 0 }, { careful });
  }
  const bats = bowlSide ? n.rival.players : n.me.players, bowls = bowlSide ? n.me.players : n.rival.players;
  const runs = inn.runs - runs0, wk = inn.wk - wk0;
  const end = sample.end || (!bowlSide && inn.done && inn.runs === inn.target ? 'TIE' : '');
  n.last = { balls, over, bowler, intent: NEUTRAL_INTENT, field: NEUTRAL_FIELD };
  markRoar(n, innIdx, over);
  countBook(n, balls, bats, bowls);
  n.last.wheel = { segId: seg.id, label: seg.label, pos, tickPos, phi, t, segs: model.segs, end, auto, runs, wk };
  (n.wheelLog ||= []).push({ inn: innIdx + 1, over, segId: seg.id, label: seg.label, t, auto, bucket, careful, runs, wk, xr: model.expect.xr, xw: model.expect.xw, guide: !!ctrl.guide });
  if (FLAGS.wheelMeta && n.season) { const m = (n.wheelMeta ||= emptyWheelMeta()); m.spokes = (m.spokes | 0) + MATCH_SPOKES_PER_SPIN; } // 1 Spoke a spin, no tally
  if (bowlSide) {
    if (inn.done) { n.stage = 'break'; n.call = null; n.inn1Summary = summarise(n); } else n.call = defaultCall(n);
  } else if (inn.done) {
    n.stage = 'done';
    n.result = inn.runs > n.inn1.runs ? 'won' : inn.runs === n.inn1.runs ? 'tied' : 'lost';
  }
  return n;
}
