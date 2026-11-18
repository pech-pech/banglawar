// @ts-check
// Wheel match mode engine (2026-11-15-wheel-match SPEC s2, s3, s5, s9; build CONTRACT). Pure and seeded: no DOM, no clock, no Math.random.
// One spin = one over. The wheel is built from N_SAMP sampled overs of the REAL engine (playOver) from the live state; a segment is a
// folded (runs, wkts) outcome with width = probability. Landing a segment picks one sampled over with exactly that outcome; the store
// replays that sample on the live state with the same rng string, so the 6-ball row and the next state match the label exactly.
import { WHEEL_MATCH as WMX, DEV_DEFAULTS, DEV_RANGE, DEV_ORDER, WHEEL_TONE, WHEEL_RIVAL_BOOST } from '../data/wheelmatch.js';
import { FLAGS } from '../data/flags.js';
import { DEV_POWERS } from '../data/wheelmatch.js'; // Dev power test (own line: parallel edits)
import { makeRng } from './rng.js';
import { playOver, centreOf } from './match.js';
import { makeFx } from './skills.js';
import { rankOf } from './wheelmeta.js';
import { stopExtra } from './training.js';
import { cycleOf } from './wheel-pulse.js';
import { landSplit } from './landtick.js';
import { wobbleKey, wheelWobble } from './wheel-wobble.js';

const clamp = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(hi, x));
const modC = (/** @type {number} */ x) => ((x % WMX.CIRC) + WMX.CIRC) % WMX.CIRC;

// ---- mode + dev knobs
/** Settings value; missing = classic. @param {any} s */
export const matchModeOf = (s) => (s && s.matchMode === 'wheel' ? 'wheel' : 'classic');

/** One dev number: non-number / NaN -> default; else clamped to DEV_RANGE and snapped to its step. @param {string} key @param {any} v */
function devNum(key, v) {
  const d = /** @type {any} */ (DEV_DEFAULTS)[key], r = /** @type {any} */ (DEV_RANGE)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return d;
  const [lo, hi, step] = r, x = clamp(v, lo, hi);
  return Number(clamp(lo + Math.round((x - lo) / step) * step, lo, hi).toFixed(6));
}
/** Clamp a saved s.dev to DEV_RANGE (missing / bad values -> defaults). Every DEV_RANGE key, in DEV_RANGE order (a new key needs no edit here);
 * DEV_ORDER pairs: hi is raised to lo when a saved pair is out of order. @param {any} dev */
export function devClamp(dev) {
  const d = dev && typeof dev === 'object' ? dev : {};
  /** @type {any} */ const out = { on: d.on === true };
  for (const k of Object.keys(DEV_RANGE)) out[k] = devNum(k, d[k]);
  for (const [lo, hi] of DEV_ORDER) if (out[hi] < out[lo]) out[hi] = devNum(hi, out[lo]);
  return out;
}
/** DEV_DEFAULTS[key] unless s.dev.on, else the clamped saved value. @param {any} s @param {string} key */
export function devVal(s, key) {
  const dev = s && s.dev;
  if (!dev || dev.on !== true) return /** @type {any} */ (DEV_DEFAULTS)[key];
  return /** @type {any} */ (devClamp(dev))[key];
}
/** Keys changed from the defaults while dev is on (report `dev:` line); {} when off. @param {any} s */
export function devChanged(s) {
  /** @type {Record<string, number>} */ const out = {};
  if (!s || !s.dev || s.dev.on !== true) return out;
  const c = /** @type {any} */ (devClamp(s.dev));
  for (const k of Object.keys(DEV_RANGE)) if (c[k] !== /** @type {any} */ (DEV_DEFAULTS)[k]) out[k] = c[k];
  return out;
}

// ---- control + physics
/** Control ranks from the wheel meta tree; all 0/false when FLAGS.wheelMeta is off. @param {any} s */
export function ctrlOf(s) {
  const r = (/** @type {string} */ id) => powRankOf(s, id);
  return { slowRank: r('c_slow'), steadyRank: r('c_steady'), guide: r('c_guide') > 0, zone: r('c_zone') > 0, chime: r('c_chime') > 0 };
}
/** Dev power test (M 2026-11-18 Dev 5/6): {nodeId: forced rank} for every power row not on Auto (-1); {} unless Dev is on. Workshop ranks and
 * the save are never touched; applies even with FLAGS.wheelMeta off (try any Control power without buying). @param {any} s */
export function devPowers(s) {
  /** @type {Record<string, number>} */ const out = {};
  if (!s || !s.dev || s.dev.on !== true) return out;
  const c = /** @type {any} */ (devClamp(s.dev));
  for (const [k, id] of Object.entries(DEV_POWERS)) if (c[k] >= 0) out[id] = c[k];
  return out;
}
/** Control rank as the wheels feel it: the Dev power override when set, else the Workshop rank (0 when FLAGS.wheelMeta is off).
 * @param {any} s @param {string} id */
export function powRankOf(s, id) {
  const d = devPowers(s);
  return id in d ? d[id] : FLAGS.wheelMeta ? rankOf(s, id) : 0;
}
/** Match wheel physics: dev knobs x Control (Slow: 1 - 0.15/rank on W0; Steady: 0.85^rank on J; Aim Guide: tap sd 0.080). @param {any} s */
export function matchPhys(s) {
  const c = ctrlOf(s);
  const slow = 1 - WMX.SLOW_PER_RANK * clamp(c.slowRank, 0, 3), steady = Math.pow(0.85, clamp(c.steadyRank, 0, 2));
  const lo = devVal(s, 'matchLeadMin'), hi = devVal(s, 'matchLeadMax'), per = devVal(s, 'matchCycle');
  const glideDeg = lo === WMX.GLIDE_DEG[0] && hi === WMX.GLIDE_DEG[1] ? WMX.GLIDE_DEG : Object.freeze([lo, Math.max(lo, hi)]); // Dev lead sliders (item 4)
  const P = { W0: devVal(s, 'matchW0') * slow, TAU: WMX.TAU, D: devVal(s, 'matchD'), J: devVal(s, 'matchJ') * steady, SD: c.guide ? WMX.SD_GUIDE_AVG : WMX.SD_AVG, glideDeg };
  return per === WMX.PULSE_PERIOD ? P : { ...P, ...pulseWindow(per) }; // default: no pulse keys at all (wheel-pulse reads WHEEL_ENGINE), so today's wheel exactly
}
/** Pulse keys for a cycle of `per` seconds (Dev matchCycle, item 5): the slow point (PULSE_FROM 3.8 of 6) and the STOP glow (GLOW 3.2-3.8 of 6,
 * GLOW_BEAT 0.2 of 6) scale with the cycle. per = 6 gives the engine values exactly (k = 1). Pure. @param {number} per seconds */
export function pulseWindow(per) {
  const k = per / WMX.PULSE_PERIOD;
  return { PULSE_PERIOD: per, PULSE_FROM: WMX.PULSE_FROM * k, GLOW: Object.freeze([WMX.GLOW[0] * k, WMX.GLOW[1] * k]), GLOW_BEAT: WMX.GLOW_BEAT * k };
}
/** Rim position (0..CIRC) under the pointer at wheel time t (seconds since SPIN, pulse arc, never clamped above) with start offset phi.
 * @param {any} phys @param {number} t @param {number} phi */
export function rimAt(phys, t, phi) { return modC(phi + landSplit(phys, t).arc); }
/** STOP time (>= 0, no coast, no clamp above), pulse split (arc turned + glide w(t) x D/3) and wobble (+-J). @param {any} phys @param {{t:number,e?:number}} stop */
function stopParts(phys, stop) {
  const sp = landSplit(phys, stop.t);
  const e = clamp(Number.isFinite(stop.e) ? /** @type {number} */ (stop.e) : 0, -phys.J, phys.J);
  return { t: sp.t, e, arc: sp.arc, dist: sp.dist };
}
/**
 * Rim position (0..CIRC) under the pointer `s` seconds into the glide after a STOP (training.js stopExtra easing over phys.D).
 * glidePos(phys, stop, phys.D) === landingPos(phys, stop). @param {any} phys @param {{t:number,phi:number,e?:number}} stop @param {number} s
 */
export function glidePos(phys, stop, s) {
  const p = stopParts(phys, stop);
  return modC(stop.phi + p.arc + stopExtra(p.dist, p.e, s, phys));
}
/** Where the wheel lands (0..CIRC) = phi + tickAt(t) + wobble, mod CIRC (pulse, no coast). Predicted tick = landingPos with e 0; the UI calls
 * this every frame. @param {any} phys @param {{t:number,phi:number,e?:number}} stop */
export function landingPos(phys, stop) { return glidePos(phys, stop, phys.D); }
/** Auto: an unaimed stop, uniform on the rim (= a pick by width). @param {{random:()=>number}} rng */
export const unaimedPos = (rng) => rng.random() * WMX.CIRC;
/** Timing bucket by the time in the pulse cycle: 'e' early (before the GLOW), 'c' careful (GLOW 3.2-3.8 s of any cycle), 'l' late (after it).
 * No 'o' / coasted (retired with COAST); a non-finite t has no bucket (''). The second argument is ignored (old call shape kept).
 * P = matchPhys (optional): a Dev cycle length (P.PULSE_PERIOD, P.GLOW) scales the window; without those keys it is today's 6 s / 3.2-3.8 s.
 * @param {number} t @param {boolean} [_coasted] @param {any} [P] */
export function stopBucket(t, _coasted, P) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return '';
  const u = cycleOf(t, P && P.PULSE_PERIOD ? P : undefined).tInCycle, G = P && P.GLOW ? P.GLOW : [WMX.GLOW_LO, WMX.GLOW_HI];
  return u < G[0] ? 'e' : u <= G[1] ? 'c' : 'l';
}
/** Keyed match wobble (wheels SPEC 2a, CONTRACT-A sec 3): wheelWobble(wobbleKey(s, 'match', ball, respin), J) with spinIndex = the match ball
 * number (store matchBallOf(innIdx, over) = innings x 10 + over, 1..20; Accepted 07:45). J = matchPhys(s).J (dev matchJ x Steady 0.85^rank).
 * Own stream (wheel-wobble.js); never the ball rng. @param {any} s @param {number} ball @param {number} [respin] @param {number} [J] */
export function matchWobble(s, ball, respin = 0, J = matchPhys(s).J) {
  return wheelWobble(wobbleKey(s, 'match', ball, respin), J);
}

// ---- sampled overs
// ---- rival strength (SPEC s6, REVIEW F1/F2/F6)
/** Wheel match: rival rating boost (the save keeps raw rival players; the boost is applied on the engine's copies only). 0 for classic. @param {any} s */
export const rivalBoostOf = (s) => (s && s.mode === 'wheel' ? WHEEL_RIVAL_BOOST : 0);
const RATING_MAX = 99;
/** A rival player as the engine plays him: +boost on bp, bs, spd, bsk, capped at 99 (sim make_team clamp). Same object when boost is 0. @param {any} p @param {number} b */
export const boostedRival = (p, b) => (b ? { ...p, bp: Math.min(RATING_MAX, p.bp + b), bs: Math.min(RATING_MAX, p.bs + b), spd: Math.min(RATING_MAX, p.spd + b), bsk: Math.min(RATING_MAX, p.bsk + b) } : p);
/** Default playOver extras for a side, as commands.js bowlOver: fx in a season, league centre (+ rival boost in wheel mode, so the rival sits at the centre as in the sim), pairing in a season, roar opts. @param {any} s @param {'bowl'|'bat'} side */
export function matchOpts(s, side) {
  const md = s && s.match && s.match.md;
  return { fx: s && s.season ? makeFx(s.coaches) : undefined, centre: centreOf(s) + rivalBoostOf(s), pairing: !!(s && s.season),
    roar: FLAGS.roar && md ? { ours: side, md, innIdx: side === 'bowl' ? 0 : 1 } : undefined };
}
/** @param {any} s @param {'bowl'|'bat'} side @param {any} [opts] */
function fullOpts(s, side, opts) {
  const o = opts || {}, d = matchOpts(s, side);
  return { fx: 'fx' in o ? o.fx : d.fx, centre: 'centre' in o && o.centre != null ? o.centre : d.centre, pairing: 'pairing' in o ? !!o.pairing : d.pairing, roar: 'roar' in o ? o.roar : d.roar };
}
/** Innings and teams for a side: 'bowl' = inn1 (rival bats, we bowl), 'bat' = inn2 (we bat). @param {any} s @param {'bowl'|'bat'} side */
function sideParts(s, side) {
  const b = rivalBoostOf(s);
  return side === 'bowl' ? { inn: s.inn1, bat: s.rival.players, bowl: s.me.players, batB: b, bowlB: 0 } : { inn: s.inn2, bat: s.me.players, bowl: s.rival.players, batB: 0, bowlB: b };
}
/** The rng string of sample k (the store replays the landed sample with the same string). @param {any} s @param {'bowl'|'bat'} side @param {number} over @param {number} k */
export const sampleSeed = (s, side, over, k) => `${s.seed}|wm|${side}|${over}|${k}`;
/** How an over ended: 'WIN' (chase passed the target), 'AO' (5th wicket, or a dismissed batter left at the crease: no one to come in), else ''. @param {any} inn @param {any[]} bat */
const endOf = (inn, bat) => (inn.target != null && inn.runs > inn.target ? 'WIN' : inn.wk >= 5 || inn.crease.some((/** @type {number} */ i) => bat[i] && bat[i].inn.out) ? 'AO' : '');
const keyOf = (/** @type {number} */ runs, /** @type {number} */ wk, /** @type {string} */ end) => (end ? `${end}:${runs}w${wk}` : `${runs}w${wk}`);

/** One sampled over. `key` is made on demand (most samples never need it: perf). */
class Sample {
  /** @param {number} k @param {number} runs @param {number} wk @param {''|'WIN'|'AO'} end */
  constructor(k, runs, wk, end) { this.k = k; this.runs = runs; this.wk = wk; this.end = end; }
  get key() { return keyOf(this.runs, this.wk, this.end); }
  toJSON() { return { k: this.k, runs: this.runs, wk: this.wk, end: this.end, key: this.key }; }
}
/** fx that reads the originals' (memoised) skill effects through copies. @param {any} fx @param {WeakMap<object, object>} orig */
const fxVia = (fx, orig) => (fx ? { of: (/** @type {any} */ q) => fx.of(orig.get(q) || q) } : undefined);

/**
 * Sample the coming over n times with the real playOver on light copies of the live innings and players (copied once per build; per sample
 * only the fields playOver writes are reset: innings counters/crease/logs, every batter's .inn, the bowler's .overs/.figs). Neutral calls:
 * field 'P', intent 'R'. Wheel mode: rival copies carry the rating boost. opts {fx, centre, pairing, roar, n}; missing parts as matchOpts.
 * The live state is never touched.
 * @param {any} s @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {any} [opts]
 * @returns {{k:number, runs:number, wk:number, end:''|'WIN'|'AO', key:string}[]}
 */
export function sampleOvers(s, side, bowlerIdx, opts) {
  const o = fullOpts(s, side, opts), n = (opts && opts.n) || WMX.N_SAMP;
  const { inn, bat, bowl, batB, bowlB } = sideParts(s, side), over = inn.over;
  /** @type {WeakMap<object, object>} */ const orig = new WeakMap();
  const fx = fxVia(o.fx, orig);
  const w0 = bowl[bowlerIdx];
  const bat2 = bat.map((/** @type {any} */ p) => { const c = { ...boostedRival(p, batB) }; orig.set(c, p); return c; });
  const bowl2 = bowl.slice(), wc = { ...boostedRival(w0, bowlB) }; orig.set(wc, w0); bowl2[bowlerIdx] = wc;
  const nb = bat.length, out = new Array(n);
  for (let k = 0; k < n; k++) {
    const i2 = { ...inn, crease: inn.crease.slice(), overs: [] };
    if (inn.roarOvers) i2.roarOvers = inn.roarOvers.slice();
    if (inn.wkLog) i2.wkLog = inn.wkLog.slice();
    for (let j = 0; j < nb; j++) bat2[j].inn = { ...bat[j].inn };
    wc.overs = w0.overs; wc.figs = { ...w0.figs };
    playOver(makeRng(sampleSeed(s, side, over, k)), i2, bat2, bowl2, bowlerIdx, 'R', 'P', fx, o.centre, o.pairing, o.roar);
    out[k] = new Sample(k, i2.runs - inn.runs, i2.wk - inn.wk, /** @type {''|'WIN'|'AO'} */ (endOf(i2, bat2)));
  }
  return out;
}
/**
 * Replay sample k on the LIVE (already cloned by the store) state: same rng string, real innings and players, neutral calls.
 * Mutates n like playOver does and returns the balls. Pass the same opts the model was built with (or none: matchOpts(n, side)).
 * Wheel mode: the rival plays as boosted copies that share .inn / .figs with the real players; .overs is written back.
 * @param {any} n @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {number} k @param {any} [opts]
 */
export function replayOver(n, side, bowlerIdx, k, opts) {
  const o = fullOpts(n, side, opts), { inn, bat, bowl, batB, bowlB } = sideParts(n, side);
  if (!batB && !bowlB) return playOver(makeRng(sampleSeed(n, side, inn.over, k)), inn, bat, bowl, bowlerIdx, 'R', 'P', o.fx, o.centre, o.pairing, o.roar);
  /** @type {WeakMap<object, object>} */ const orig = new WeakMap();
  const cp = (/** @type {any[]} */ team, /** @type {number} */ b) => team.map((p) => { const c = boostedRival(p, b); if (c !== p) orig.set(c, p); return c; });
  const bat2 = cp(bat, batB), bowl2 = cp(bowl, bowlB);
  const balls = playOver(makeRng(sampleSeed(n, side, inn.over, k)), inn, bat2, bowl2, bowlerIdx, 'R', 'P', fxVia(o.fx, orig), o.centre, o.pairing, o.roar);
  bowl2.forEach((c, i) => { if (c !== bowl[i]) bowl[i].overs = c.overs; }); // .inn and .figs are shared objects; .overs is a number
  return balls;
}
/** Mean runs and wickets of the samples (Expected line). @param {{runs:number,wk:number}[]} samples */
export function expectOf(samples) {
  let r = 0, w = 0; for (const x of samples) { r += x.runs; w += x.wk; }
  const n = samples.length || 1; return { xr: r / n, xw: w / n };
}

// ---- segments
/** Wicket value in runs for the rim order and tones: bowl 7; bat clamp(14 - 1.2 x required rate, 3, 10). @param {any} ctx */
export function wkValue(ctx) {
  if (!ctx || ctx.side !== 'bat') return WMX.WK_VAL_BOWL;
  const rr = reqRate(ctx);
  return clamp(WMX.WK_VAL_BAT_A - WMX.WK_VAL_BAT_B * rr, WMX.WK_VAL_LO, WMX.WK_VAL_HI);
}
/** Runs needed per over (6 balls); no need given = 6 (as sim wheel_match_sim). @param {any} ctx */
function reqRate(ctx) {
  if (!ctx || !Number.isFinite(ctx.needRuns) || !Number.isFinite(ctx.ballsLeft)) return 6;
  return Math.max(0, ctx.needRuns) * 6 / Math.max(1, ctx.ballsLeft);
}
/**
 * Fold sampled outcomes into at most kMax labels (01a v3 / sim segments.py fold, SPEC s2 steps 1-4). cnt: Map key -> {runs, wk, c}.
 * Returns [{runs, wk, c, members}].
 * @param {Map<string,{runs:number,wk:number,c:number}>} cnt @param {number} N @param {number} kMax
 */
export function foldOutcomes(cnt, N, kMax) {
  const all = [...cnt.values()];
  if (!all.length || kMax < 1) return [];
  const ranked = all.slice().sort((a, b) => b.c - a.c || a.wk - b.wk || a.runs - b.runs);
  /** @type {typeof all} */ const keep = [];
  const add = (/** @type {any} */ x) => { if (x && !keep.includes(x) && keep.length < kMax) keep.push(x); };
  // 1. reserve: every wicket class with mass >= RESERVE_MIN keeps the outcome nearest its mean runs; the 0-wkt class also its 85th pct runs
  const byW = new Map();
  for (const x of all) byW.set(x.wk, (byW.get(x.wk) || 0) + x.c);
  for (const wk of [...byW.keys()].sort((a, b) => a - b)) {
    const c = byW.get(wk); if (c / N < WMX.RESERVE_MIN) continue;
    const ks = ranked.filter((x) => x.wk === wk), mu = ks.reduce((a, x) => a + x.runs * x.c, 0) / c;
    add(ks.slice().sort((a, b) => Math.abs(a.runs - mu) - Math.abs(b.runs - mu) || b.c - a.c || a.runs - b.runs)[0]);
    if (wk === 0) {
      let acc = 0;
      for (const x of ks.slice().sort((a, b) => a.runs - b.runs)) { acc += x.c; if (acc >= WMX.HIGH_TAIL_Q * c) { add(x); break; } }
    }
  }
  // 2. fill to kMax with the most likely outcomes left
  for (const x of ranked) { if (keep.length >= kMax) break; add(x); }
  // 3. fold every other outcome: nearest kept label with the same wkts (nearest runs, tie lower), else nearest wkts, then runs
  const segs = keep.map((x) => ({ runs: x.runs, wk: x.wk, c: x.c, members: [x] }));
  const nearest = (/** @type {{runs:number,wk:number}} */ x, /** @type {typeof segs} */ pool) => pool.slice().sort((a, b) =>
    Math.abs(a.wk - x.wk) - Math.abs(b.wk - x.wk) || Math.abs(a.runs - x.runs) - Math.abs(b.runs - x.runs) || a.runs - b.runs || a.wk - b.wk)[0];
  for (const x of all) { if (keep.includes(x)) continue; const t = nearest(x, segs); t.c += x.c; t.members.push(x); }
  // 4. any segment under MIN_P merges on (same rule), smallest first
  for (;;) {
    if (segs.length < 2) break;
    let lo = null; for (const g of segs) if (g.c / N < WMX.MIN_P && (!lo || g.c < lo.c || (g.c === lo.c && (g.wk < lo.wk || (g.wk === lo.wk && g.runs < lo.runs))))) lo = g;
    if (!lo) break;
    const t = nearest(lo, segs.filter((g) => g !== lo)); t.c += lo.c; t.members.push(...lo.members); segs.splice(segs.indexOf(lo), 1);
  }
  return segs.map((g) => ({ runs: g.runs, wk: g.wk, c: g.c, members: g.members.map((m) => keyOf(m.runs, m.wk, '')) }));
}
/** Most common (runs, wk) of a list of samples (tie: lower runs, then fewer wkts). @param {{runs:number,wk:number}[]} xs */
function modeOf(xs) {
  const m = new Map(); for (const x of xs) { const k = `${x.runs}|${x.wk}`; m.set(k, (m.get(k) || 0) + 1); }
  let best = null, bc = -1;
  for (const [k, c] of m) { const [r, w] = k.split('|').map(Number); if (c > bc || (c === bc && best && (r < best.runs || (r === best.runs && w < best.wk)))) { best = { runs: r, wk: w }; bc = c; } }
  return best || { runs: 0, wk: 0 };
}
/**
 * Segments for one over: folded normal labels, each capped at SLICE_MAX_P width (wider ones split into equal pieces), in zigzag rim order (best for us, worst, 2nd best, 2nd worst, ...), plus one WIN seg
 * (chase passes target) first and one ALL OUT seg last. WIN/AO value = top/bottom of the value order for us (AO is good for us when we bowl).
 * ctx {side, needRuns?, ballsLeft?}.
 * @param {{k:number,runs:number,wk:number,end:string,key:string}[]} samples @param {{side:'bowl'|'bat',needRuns?:number,ballsLeft?:number}} ctx
 */
export function buildSegments(samples, ctx) {
  const N = samples.length, side = ctx && ctx.side === 'bat' ? 'bat' : 'bowl';
  if (!N) return [];
  const cnt = new Map(), ends = { WIN: /** @type {any[]} */ ([]), AO: /** @type {any[]} */ ([]) };
  for (const x of samples) {
    if (x.end === 'WIN' || x.end === 'AO') { ends[x.end].push(x); continue; }
    const k = keyOf(x.runs, x.wk, ''); const g = cnt.get(k); if (g) g.c++; else cnt.set(k, { runs: x.runs, wk: x.wk, c: 1 });
  }
  const nEnd = (ends.WIN.length ? 1 : 0) + (ends.AO.length ? 1 : 0);
  const folded = foldOutcomes(cnt, N, WMX.K_SEG - nEnd);
  const wv = wkValue({ ...ctx, side }), par = side === 'bat' ? reqRate(ctx) : WHEEL_TONE.BOWL_PAR;
  /** @type {any[]} */ const segs = folded.map((g) => {
    const v = g.runs - wv * g.wk, value = side === 'bat' ? v : -v;
    const good = side === 'bat' ? v >= par + WHEEL_TONE.BAND : v <= par - WHEEL_TONE.BAND;
    const bad = side === 'bat' ? v <= par - WHEEL_TONE.BAND : v >= par + WHEEL_TONE.BAND;
    return { id: `${g.runs}w${g.wk}`, runs: g.runs, wk: g.wk, end: '', p: g.c / N, label: String(g.runs), stars: g.wk, tone: good ? 'good' : bad ? 'bad' : 'so', value, members: g.members };
  });
  const vals = segs.map((g) => g.value), hiV = vals.length ? Math.max(...vals) : 0, loV = vals.length ? Math.min(...vals) : 0;
  for (const end of /** @type {('WIN'|'AO')[]} */ (['WIN', 'AO'])) {
    const xs = ends[end]; if (!xs.length) continue;
    const m = modeOf(xs), goodForUs = end === 'WIN' || side === 'bowl';
    segs.push({ id: end, runs: m.runs, wk: m.wk, end, p: xs.length / N, label: end === 'WIN' ? 'WIN' : 'ALL OUT', stars: m.wk, tone: goodForUs ? 'good' : 'bad',
      value: goodForUs ? hiV + 1 : loV - 1, members: [...new Set(xs.map((x) => x.key))].sort() });
  }
  // slice width cap (SLICE_MAX_P): a segment with p > cap splits into n = ceil(p / cap) equal pieces (same label, outcome, members;
  // id `${id}#i`). Odds and Expected are unchanged; only the aim value of a fat slice drops (numbers thread fix, v3 fold + cap).
  /** @type {any[]} */ const pieces = [];
  for (const g of segs) {
    const n = Math.max(1, Math.ceil(g.p / WMX.SLICE_MAX_P - 1e-9));
    if (n === 1) { pieces.push({ ...g, piece: 0 }); continue; }
    for (let i = 0; i < n; i++) pieces.push({ ...g, id: `${g.id}#${i + 1}`, p: g.p / n, piece: i, split: true });
  }
  // zigzag rim order by value for us (ties: fewer wickets, then fewer runs, then piece), best, worst, 2nd best, 2nd worst ...:
  // equal-value pieces end up separated by the worst slices. An unsplit WIN seg sits first (top end) and an unsplit ALL OUT seg last
  // (bottom end), either side (SPEC s2). A SPLIT WIN / ALL OUT seg joins the zigzag by its value (top / bottom), as wheel_match_sim
  // orders every seg, so its pieces are spread too (a split WIN still starts the rim: it is the top value).
  const fixed = (/** @type {any} */ g) => g.end && !g.split;
  const sorted = pieces.filter((g) => !fixed(g)).sort((a, b) => b.value - a.value || a.wk - b.wk || a.runs - b.runs || a.piece - b.piece);
  const order = []; for (let a = 0, b = sorted.length - 1; a <= b; ) { order.push(sorted[a++]); if (a <= b) order.push(sorted[b--]); }
  const win = pieces.find((g) => g.end === 'WIN' && fixed(g)), ao = pieces.find((g) => g.end === 'AO' && fixed(g));
  if (win) order.unshift(win);
  if (ao) order.push(ao);
  let x = 0;
  for (const g of order) { g.width = g.p * WMX.CIRC; g.start = x; x += g.width; }
  return order.map((g) => ({ id: g.id, runs: g.runs, wk: g.wk, end: g.end, p: g.p, width: g.width, start: g.start, label: g.label, stars: g.stars, tone: g.tone, value: g.value, members: g.members }));
}
/** Index of the segment covering rim position pos (mod CIRC). @param {{start:number,width:number}[]} segs @param {number} pos */
export function segAt(segs, pos) {
  const u = modC(pos);
  for (let i = 0; i < segs.length; i++) if (u < segs[i].start + segs[i].width) return i;
  return segs.length - 1;
}
/** Does a sample show this segment's label outcome? WIN/AO: any sample with that end. @param {any} x @param {any} seg */
const matches = (x, seg) => (seg.end === 'WIN' ? x.end === 'WIN' && x.wk === seg.wk : seg.end ? x.end === seg.end : !x.end && x.runs === seg.runs && x.wk === seg.wk);
/** One sample whose outcome is the segment's label (uniform among them; one rng draw). Panel always matches the label: WIN picks only WIN samples with the seg's wickets (its stars, REVIEW F9). @param {{random:()=>number}} rng @param {any[]} samples @param {any} seg */
export function pickSample(rng, samples, seg) {
  const xs = samples.filter((x) => matches(x, seg));
  const r = rng.random();
  return xs.length ? xs[Math.min(xs.length - 1, Math.floor(r * xs.length))] : samples[0];
}
/** Careful: the segment's value for us is at or above the median segment value. @param {{value:number}[]} segs @param {number} idx */
export function isCareful(segs, idx) {
  if (!segs[idx]) return false;
  const v = segs.map((g) => g.value).sort((a, b) => a - b), m = v.length >> 1;
  const med = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return segs[idx].value >= med;
}

// ---- the over model (memoised)
const MEMO = new Map(), MEMO_MAX = 8;
/** Everything playOver reads that can differ between two states with the same seed/over/score (REVIEW F3). @param {any} s @param {'bowl'|'bat'} side @param {number} bi */
function stateKey(s, side, bi) {
  const { inn, bat, bowl } = sideParts(s, side), w = bowl[bi] || {};
  const cr = inn.crease.map((/** @type {number} */ i) => `${i}:${bat[i] ? bat[i].inn.b : ''}`).join(',');
  return `${inn.strike}|${cr}|${inn.next}|${inn.last}|${inn.burstOver ?? ''}|${w.overs}|${inn.target ?? ''}|${rivalBoostOf(s)}|${centreOf(s)}`;
}
/**
 * Samples, segments and the Expected line for the coming over. Memoised (LRU, max 8) by seed|side|over|bowler|runs|wk|balls|n + stateKey.
 * opts.fresh = true skips the memo (store: rebuild after a replay mismatch). need {runs, balls} in a chase: runs to win and balls left.
 * @param {any} s @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {any} [opts]
 */
export function wheelOverModel(s, side, bowlerIdx, opts) {
  const inn = sideParts(s, side).inn, n = (opts && opts.n) || WMX.N_SAMP, fresh = !!(opts && opts.fresh);
  const key = `${s.seed}|${side}|${inn.over}|${bowlerIdx}|${inn.runs}|${inn.wk}|${inn.balls}|${n}|${stateKey(s, side, bowlerIdx)}`;
  const hit = fresh ? null : MEMO.get(key);
  if (hit) { MEMO.delete(key); MEMO.set(key, hit); return hit; } // LRU
  const samples = sampleOvers(s, side, bowlerIdx, opts);
  const need = side === 'bat' && inn.target != null ? { runs: inn.target + 1 - inn.runs, balls: 60 - inn.balls } : undefined;
  const segs = buildSegments(samples, need ? { side, needRuns: need.runs, ballsLeft: need.balls } : { side });
  /** @type {any} */ const model = { samples, segs, expect: expectOf(samples) };
  if (need) model.need = need;
  MEMO.set(key, model); if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return model;
}
