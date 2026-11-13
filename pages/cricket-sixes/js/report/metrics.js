// @ts-check
// Pure per-over and per-match measures for the playtest report. No DOM, no storage, no clock.
// One over record is a plain object (short keys keep the stored log small):
//   o over no. | s 'b' bowl innings, 'c' chase | b bowler index | g grade chip | mu matchup 'G' Good, 'O' OK, 'P' Poor, '?' unknown
//   gb Good chips on the chosen bowler | gm most Good chips on any eligible bowler | f field | i intent | r runs | w wickets
//   bm best matchup sum on any eligible bowler (bowl overs; 'avoidable Poor' = mu 'P' with bm >= 0, overs 1-7) | wp our win % after the over (chase overs, [guess] model)
//   xr expected runs | xw expected wickets | rr asking rate (chase) | fit [bowler, field, intent] 1/0/null vs the skilled bot
//   th think ms | rb 1 if the Crowd roar was on this over (only when the match has it). pw / sk are no longer columns (r9 L2); log.panel writes them only when an over is skipped.
import { bowlVM, chaseVM } from '../store/selectors.js';
import { skilledBowler, skilledField, skilledIntent } from '../core/skilled.js';
import { tableOrder, placeOf, ME } from '../core/season.js';
import { ECON as E } from '../data/economy.js';
import { drillRoom, coachStepInUse, netsPreview } from '../core/training.js';
import { TRAIN2 } from '../data/training.js';
import { buildOptions, sinkOptions } from '../core/economy.js';

export const OVER_COLS = ['o', 's', 'b', 'g', 'mu', 'gb', 'gm', 'bm', 'f', 'i', 'r', 'w', 'xr', 'xw', 'rr', 'wp', 'fit', 'th'];
const r1 = (x) => Math.round(x * 10) / 10;

// ---- r9 L4: win chance per over and the 'decided over' ----
const RUNS_PER_BALL = 9.1 / 6, SD_PER_OVER = 3.6; // [guess] from the sim's 9.1 runs an over; fixes the shape only, the report never prints wp as a promise
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
/** Our win chance (whole %) in a chase: need = runs still needed (0 or less = won), ballsLeft, wkLeft = wickets in hand. [guess] normal model. */
export function winProb(need, ballsLeft, wkLeft) {
  if (need <= 0) return 100;
  if (ballsLeft <= 0 || wkLeft <= 0) return 0;
  const mean = ballsLeft * RUNS_PER_BALL * (0.5 + 0.5 * Math.min(wkLeft, 5) / 5), sd = SD_PER_OVER * Math.sqrt(ballsLeft / 6);
  return Math.round(100 * (1 - 0.5 * (1 + erf((need - mean) / (sd * Math.SQRT2)))));
}
/** Decided over (L4): the first chase over after which the eventual winner's win chance stays above 90% to the end; otherwise the last over. overs = chase rows (with wp), res 'won'|'lost'|'tied'. */
export function decidedOver(overs, res) {
  const rows = (overs || []).filter((o) => o.s === 'c' && o.wp != null);
  if (!rows.length) return null;
  if (res !== 'won' && res !== 'lost') return rows[rows.length - 1].o;
  const wpw = rows.map((o) => (res === 'won' ? o.wp : 100 - o.wp));
  let i = rows.length - 1; if (wpw[i] <= 90) return rows[i].o;
  while (i > 0 && wpw[i - 1] > 90) i--;
  return rows[i].o;
}
/** 1 if this over was an avoidable Poor pick (Poor chip sum while another eligible bowler was not Poor), overs 1-7 only; 0 otherwise; null when unknown (old rows, chase rows, overs 8-10 are forced picks). */
export function avoidablePoor(o) {
  if (!o || o.s !== 'b' || o.bm == null || o.o > 7) return null;
  return o.mu === 'P' && o.bm >= 0 ? 1 : 0;
}

/** Chip word for the bowler's previews: sum of matchup steps (Great +1, Bad -1). */
export function matchupOf(previews) {
  if (!previews || !previews.length) return '?';
  const g = previews.reduce((a, p) => a + p.g, 0);
  return g > 0 ? 'G' : g < 0 ? 'P' : 'O';
}

/** Expected runs and wickets of a set of balls, from the probabilities the engine used. */
export function expected(balls) {
  let xr = 0, xw = 0;
  for (const b of balls || []) {
    const p = b.pr && b.pr.p; if (!p) continue;
    xr += 6 * p.six + 4 * p.four + 2 * p.two + p.single; xw += p.wicket;
  }
  return { xr: r1(xr), xw: r1(xw) };
}

/**
 * Over record for a BowlOver that moved `before` to `after`. Call with the state BEFORE the command so the skilled bot sees the same board.
 * @param {any} before @param {any} after @param {{th?:number}} [t]
 */
export function overRecord(before, after, t = {}) {
  const L = after.last, bowling = before.stage === 'bowl';
  const runs = L.balls.reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0);
  const wk = L.balls.filter((b) => b.o === 'W').length;
  const ex = expected(L.balls);
  const rec = { o: L.over, s: bowling ? 'b' : 'c', b: L.bowler, g: null, mu: '?', gb: 0, gm: 0, f: L.field, i: L.intent, r: runs, w: wk,
    xr: ex.xr, xw: ex.xw, rr: null, fit: [null, null, null], th: t.th == null ? null : Math.round(t.th), bm: null, wp: null };
  if (bowling) {
    const vm = bowlVM(before);
    const me = vm.bowlers.find((x) => x.i === L.bowler);
    const great = (x) => x.previews.filter((p) => p.label === 'Great').length;
    rec.g = me ? me.grade : '?';
    rec.mu = me ? matchupOf(me.previews) : '?';
    rec.gb = me ? great(me) : 0;
    rec.gm = Math.max(0, ...vm.bowlers.filter((x) => x.eligible).map(great));
    const sumG = (x) => x.previews.reduce((a, p) => a + p.g, 0), el = vm.bowlers.filter((x) => x.eligible && x.previews.length);
    rec.bm = el.length ? Math.max(...el.map(sumG)) : null; // best chip sum on offer; null if nobody had a preview
    rec.fit = [skilledBowler(before, vm) === L.bowler ? 1 : 0, skilledField(before) === L.field ? 1 : 0, null];
  } else {
    const vm = chaseVM(before);
    rec.rr = r1(vm.need / Math.max(vm.ballsLeft, 1) * 6); // runs needed per over
    rec.fit = [null, null, skilledIntent(before, vm) === L.intent ? 1 : 0];
    try { // wp: our win chance after this over, from the post-over innings
      const b = after.inn2, a1 = after.inn1;
      if (after.stage === 'done') rec.wp = after.result === 'won' ? 100 : after.result === 'lost' ? 0 : 50;
      else if (b && a1) rec.wp = winProb(a1.runs + 1 - b.runs, Math.max(0, vm.ballsLeft - L.balls.length), 5 - b.wk);
    } catch (e) { rec.wp = null; }
  }
  const roar = roarOn(before, after, L); if (roar) rec.rb = 1;
  return rec;
}

/** The match-day roll on a state (ENGINE: s.match.md; STORE also keeps it on s.fixture.md), or null. */
export const mdOf = (s) => { try { return (s && ((s.match && s.match.md) || (s.fixture && s.fixture.md) || s.md)) || null; } catch (e) { return null; } };
/** 1 when the Crowd roar was on for this over. Tolerates a match without the feature (ENGINE: md.roar[innings*10 + over - 1], or inn.overs[].roar). */
function roarOn(before, after, L) {
  try {
    if (L && L.roar != null) return L.roar ? 1 : 0;
    const md = mdOf(before), i = (before.stage === 'bowl' ? 0 : 10) + (L.over | 0) - 1;
    return md && Array.isArray(md.roar) && md.roar[i] ? 1 : 0;
  } catch (e) { return 0; }
}

/** Result facts when the match is over (stage 'done'). Margin: wickets in hand when won, runs short when lost. */
export function matchResult(s) {
  const a = s.inn1, b = s.inn2;
  const won = s.result === 'won', lost = s.result === 'lost';
  const m = won ? { k: 'wk', n: 5 - b.wk } : lost ? { k: 'run', n: a.runs - b.runs } : { k: 'run', n: 0 };
  const close = s.result === 'tied' || (won && m.n <= 1) || (lost && m.n <= 6);
  const blow = (lost && m.n > 40) || (won && m.n >= 4); // [guess] band: under 20% of matches
  return { res: s.result, us: b.runs, them: a.runs, wkUs: b.wk, wkThem: a.wk, m, close, blow, dec: Math.max(1, b.over - 1) };
}

// ---- r9: per-season, nets, week and buy facts read from the save (all pure, all tolerate a missing part) ----
const RT = ['bp', 'bs', 'spd', 'bsk'];
const mineOf = (s) => (s && s.clubs && s.clubs[0]) || null;
/** Mean of the Six's four ratings (internal points). null when there is no Six. */
export function sixMean(s) {
  const c = mineOf(s); if (!c || !c.six || !c.squad) return null;
  const ps = c.six.map((id) => c.squad.find((p) => p.id === id)).filter(Boolean); if (!ps.length) return null;
  return r1(ps.reduce((a, p) => a + RT.reduce((x, k) => x + p[k], 0) / 4, 0) / ps.length);
}
/** Six players who cannot gain on any rating (at their cap). 0-6. */
export function atCap(s) {
  const c = mineOf(s); if (!c || !c.six || !c.squad) return null;
  return c.six.map((id) => c.squad.find((p) => p.id === id)).filter(Boolean).filter((p) => RT.every((k) => drillRoom(p, k).room <= 0)).length;
}
/** Season facts now (SEASON section S1-S3). Fields the log keeps per season in d.seasons. */
export function seasonSnap(s) {
  const se = s && s.season, e = s && s.econ; if (!se) return null;
  const row = (se.table || []).find((r) => r.id === ME) || {}, pos = se.table ? placeOf(se.table, ME) : null;
  const st = e ? e.stadium : null;
  return { n: se.n, lg: se.league || 1, w: row.w | 0, l: row.l | 0, pos: pos || null, pts: row.pts | 0, top2: pos && pos <= 2 ? 1 : 0, stad: st, fans: e ? e.fans | 0 : null,
    need: st != null && st < 5 ? E.STADIUM_FANS[st + 1] : null, m6now: sixMean(s), cap: atCap(s), pool: s.training ? s.training.tp | 0 : null, leg: e ? e.legacy | 0 : null };
}
/** One nets run (RunNets moved before -> after), or null when it did not run. */
export function netsRecord(before, after) {
  const T0 = before.training, T = after.training, n = T && T.nets; if (!T0 || !n || !n.lines || (T0.nets && T0.nets.week === n.week && T0.netsRuns === T.netsRuns)) return null;
  const plan = T.last_plan || {}, ct = (w) => n.lines.filter((l) => l.word === w).length;
  let q = 0, cs = 0; try { cs = coachStepInUse(before); q = cs > 0 ? 1 : 0; } catch (e) { /* no coach data */ }
  const nl = n.lines.length || 1;
  return { wk: n.week, eff: plan.effort || null, foc: plan.focus || null, co: plan.coachId ? 1 : 0, cs: q ? cs : 0, spot: plan.spotlight_id ? 1 : 0, r: [ct('Okay'), ct('Good'), ct('Great')], cant: n.skipped | 0,
    per: nl ? Math.round((n.cost || 0) / nl) : 0, tp0: T0.tp | 0, tp1: T.tp | 0, gain: n.lines.reduce((a, l) => a + Math.max(0, ((l.toRaw | 0) - (l.fromRaw | 0))), 0), aff: pushAffordable(before) ? 1 : 0 };
}
/** Push affordable now: TP >= Push cost per player x players who can gain (the game's own cost table). */
export function pushAffordable(s) {
  try { const n = netsPreview(s).trainIds.length; return n > 0 && (s.training.tp | 0) >= TRAIN2.efforts.push.cost * n; } catch (e) { return false; }
}
/** Options affordable right now (other than `item`): build options and sinks that are ok. */
export function altCount(s, item) {
  try { return buildOptions(s).filter((o) => o.ok && o.what !== item).length + sinkOptions(s).filter((o) => o.ok && o.id !== item && o.coins > 0).length; } catch (e) { return null; }
}
/** Reserve warning on an option, before the buy. */
export function warnOf(s, item) {
  try { const o = buildOptions(s).concat(sinkOptions(s).map((x) => ({ ...x, what: x.id }))).find((x) => x.what === item); return o && o.warn ? 1 : 0; } catch (e) { return 0; }
}
