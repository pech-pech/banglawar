// Z2: WheelOver, the match wheel spin + STOP (owner T1). Old commands.js wheelOver().
// ctx: the wheelmatch-store.js calls (that module imports commands.js, so no direct import here: no ESM cycle) and the commands.js match helpers.
import { makeRng } from '../../core/rng.js';
import { FLAGS } from '../../data/flags.js';
import { emptyWheelMeta } from '../../core/save-migrate.js';
import { MATCH_SPOKES_PER_SPIN } from '../../data/wheelmatch.js';
import { matchPhys, ctrlOf, landingPos, unaimedPos, segAt, pickSample, stopBucket, isCareful, replayOver } from '../../core/wheelmatch.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * WheelOver {bowler?, stop?:{t, phi}, auto?}: one spin = one over. Bowl: our bowler picked live (legal only; auto = the suggested one).
 * Chase: the rival's bowler is deterministic (rivalBowler). Calls are neutral (field P, intent R). The landing picks one sampled over and the
 * real over is replayed with that sample's rng, so the 6-ball row is exactly the label. Innings end, break, result: as bowlOver.
 */
export function wheelOver(s, p, ctx) {
  const { isWheelMatch, legalBowlers, suggestedBowler, rivalBowler, modelOf, markRoar, countBook, summarise, defaultCall, NEUTRAL_INTENT, NEUTRAL_FIELD } = ctx;
  if (!isWheelMatch(s) || (s.stage !== 'bowl' && s.stage !== 'chase')) return s;
  const bowlSide = s.stage === 'bowl', side = bowlSide ? 'bowl' : 'bat', innIdx = bowlSide ? 0 : 1;
  const auto = !!(p && p.auto);
  const stop = !auto && p && p.stop && isNum(p.stop.t) && isNum(p.stop.phi) ? p.stop : null;
  if (!auto && !stop) return s; // an aimed spin needs its STOP
  let bowler;
  if (bowlSide) {
    const legal = legalBowlers(s);
    bowler = p && Number.isInteger(p.bowler) ? p.bowler : auto ? suggestedBowler(s) : -1;
    if (!legal.includes(bowler)) { if (!auto) return s; bowler = suggestedBowler(s); }
    if (bowler < 0) return s;
  } else bowler = rivalBowler(s);
  const inn0 = bowlSide ? s.inn1 : s.inn2, over = inn0.over;
  const phys = matchPhys(s), ctrl = ctrlOf(s);
  let pos, tickPos = null, t = null, phi = null, bucket = null;
  if (stop) {
    t = Math.max(phys.STOP_FROM, Math.min(stop.t, phys.COAST)); phi = stop.phi; // same clamp as the landing (core stopParts)
    const jr = makeRng(`${s.seed}|wmj|${s.stage}|${over}`);
    const e = (jr.random() * 2 - 1) * phys.J;
    pos = landingPos(phys, { t, phi, e });
    tickPos = landingPos(phys, { t, phi, e: 0 });
    bucket = stopBucket(t, stop.t >= phys.COAST);
  } else pos = unaimedPos(makeRng(`${s.seed}|wma|${s.stage}|${over}`));
  // Land, pick the sample, replay it on a clone. The replay must give the sample's runs/wkts; on a mismatch (stale memo) rebuild uncached once.
  let model, seg, sample, n, inn, balls, runs0, wk0;
  for (const fresh of [false, true]) {
    model = modelOf(s, side, bowler, fresh);
    seg = model.segs[segAt(model.segs, pos)];
    sample = pickSample(makeRng(`${s.seed}|wmp|${s.stage}|${over}`), model.samples, seg);
    n = structuredClone(s);
    inn = bowlSide ? n.inn1 : n.inn2; runs0 = inn.runs; wk0 = inn.wk;
    balls = replayOver(n, side, bowler, sample.k); // the landed sample's rng on the real state: same fx, centre, pairing, roar, boost as the model; field P, intent R
    if (inn.runs - runs0 === sample.runs && inn.wk - wk0 === sample.wk) break;
  }
  const careful = stop ? isCareful(model.segs, segAt(model.segs, tickPos)) : false;
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
