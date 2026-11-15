// @ts-check
// Wheel match mode engine (2026-11-15-wheel-match SPEC s2, s3, s5, s9; build CONTRACT). Pure and seeded: no DOM, no clock, no Math.random.
// One spin = one over. The wheel is built from N_SAMP sampled overs of the REAL engine (playOver) from the live state; a segment is a
// folded (runs, wkts) outcome with width = probability. Landing a segment picks one sampled over with exactly that outcome; the store
// replays that sample on the live state with the same rng string, so the 6-ball row and the next state match the label exactly.
import { WHEEL_MATCH as WMX, DEV_DEFAULTS, DEV_RANGE, WHEEL_TONE } from '../data/wheelmatch.js';
import { FLAGS } from '../data/flags.js';
import { makeRng } from './rng.js';
import { playOver, centreOf } from './match.js';
import { makeFx } from './skills.js';
import { rankOf } from './wheelmeta.js';
import { stopExtra } from './training.js';

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
/** Clamp a saved s.dev to DEV_RANGE (missing / bad values -> defaults). @param {any} dev */
export function devClamp(dev) {
  const d = dev && typeof dev === 'object' ? dev : {};
  return { on: d.on === true, matchW0: devNum('matchW0', d.matchW0), matchJ: devNum('matchJ', d.matchJ), matchD: devNum('matchD', d.matchD), otherMult: devNum('otherMult', d.otherMult) };
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
  if (!FLAGS.wheelMeta) return { slowRank: 0, steadyRank: 0, guide: false, zone: false, chime: false };
  return { slowRank: rankOf(s, 'c_slow'), steadyRank: rankOf(s, 'c_steady'), guide: rankOf(s, 'c_guide') > 0, zone: rankOf(s, 'c_zone') > 0, chime: rankOf(s, 'c_chime') > 0 };
}
/** Match wheel physics: dev knobs x Control (Slow: 1 - 0.15/rank on W0; Steady: 0.85^rank on J; Aim Guide: tap sd 0.080). @param {any} s */
export function matchPhys(s) {
  const c = ctrlOf(s);
  const slow = 1 - WMX.SLOW_PER_RANK * clamp(c.slowRank, 0, 3), steady = Math.pow(0.85, clamp(c.steadyRank, 0, 2));
  return { W0: devVal(s, 'matchW0') * slow, TAU: WMX.TAU, D: devVal(s, 'matchD'), J: devVal(s, 'matchJ') * steady, SD: c.guide ? WMX.SD_GUIDE_AVG : WMX.SD_AVG, COAST: WMX.COAST, STOP_FROM: WMX.STOP_FROM };
}
/** Arc turned (units, not wrapped) t seconds after SPIN. @param {{W0:number,TAU:number}} phys @param {number} t */
const arcOf = (phys, t) => phys.W0 * phys.TAU * (1 - Math.exp(-Math.max(0, t) / phys.TAU));
/** Rim position (0..CIRC) under the pointer at wheel time t with start offset phi. @param {any} phys @param {number} t @param {number} phi */
export function rimAt(phys, t, phi) { return modC(phi + arcOf(phys, t)); }
/** Clamped STOP time (STOP_FROM..COAST; >= COAST = coasted at COAST) and wobble (+-J). @param {any} phys @param {{t:number,e?:number}} stop */
function stopParts(phys, stop) {
  const t = clamp(Number.isFinite(stop.t) ? stop.t : phys.COAST, phys.STOP_FROM, phys.COAST);
  const e = clamp(Number.isFinite(stop.e) ? /** @type {number} */ (stop.e) : 0, -phys.J, phys.J);
  return { t, e, dist: phys.W0 * Math.exp(-t / phys.TAU) * phys.D / 3 };
}
/**
 * Rim position (0..CIRC) under the pointer `s` seconds into the glide after a STOP (training.js stopExtra easing over phys.D).
 * glidePos(phys, stop, phys.D) === landingPos(phys, stop). @param {any} phys @param {{t:number,phi:number,e?:number}} stop @param {number} s
 */
export function glidePos(phys, stop, s) {
  const p = stopParts(phys, stop);
  return modC(stop.phi + arcOf(phys, p.t) + stopExtra(p.dist, p.e, s, phys));
}
/** Where the wheel lands (0..CIRC). Predicted tick = landingPos with e 0; the UI calls this every frame. @param {any} phys @param {{t:number,phi:number,e?:number}} stop */
export function landingPos(phys, stop) { return glidePos(phys, stop, phys.D); }
/** Auto / skip: an unaimed stop, uniform on the rim (= a pick by width). @param {{random:()=>number}} rng */
export const unaimedPos = (rng) => rng.random() * WMX.CIRC;
/** Timing bucket: 'e' early, 'c' careful (GLOW window), 'l' late, 'o' coasted. @param {number} t @param {boolean} [coasted] */
export function stopBucket(t, coasted) {
  if (coasted || !Number.isFinite(t) || t >= WMX.COAST) return 'o';
  return t < WMX.GLOW_LO ? 'e' : t <= WMX.GLOW_HI ? 'c' : 'l';
}

// ---- sampled overs
/** Default playOver extras for a side, exactly as commands.js bowlOver: fx in a season, league centre, pairing in a season, roar opts. @param {any} s @param {'bowl'|'bat'} side */
export function matchOpts(s, side) {
  const md = s && s.match && s.match.md;
  return { fx: s && s.season ? makeFx(s.coaches) : undefined, centre: centreOf(s), pairing: !!(s && s.season),
    roar: FLAGS.roar && md ? { ours: side, md, innIdx: side === 'bowl' ? 0 : 1 } : undefined };
}
/** @param {any} s @param {'bowl'|'bat'} side @param {any} [opts] */
function fullOpts(s, side, opts) {
  const o = opts || {}, d = matchOpts(s, side);
  return { fx: 'fx' in o ? o.fx : d.fx, centre: 'centre' in o && o.centre != null ? o.centre : d.centre, pairing: 'pairing' in o ? !!o.pairing : d.pairing, roar: 'roar' in o ? o.roar : d.roar };
}
/** Innings and teams for a side: 'bowl' = inn1 (rival bats, we bowl), 'bat' = inn2 (we bat). @param {any} s @param {'bowl'|'bat'} side */
function sideParts(s, side) {
  return side === 'bowl' ? { inn: s.inn1, bat: s.rival.players, bowl: s.me.players } : { inn: s.inn2, bat: s.me.players, bowl: s.rival.players };
}
/** The rng string of sample k (the store replays the landed sample with the same string). @param {any} s @param {'bowl'|'bat'} side @param {number} over @param {number} k */
export const sampleSeed = (s, side, over, k) => `${s.seed}|wm|${side}|${over}|${k}`;
/** How an over ended: 'WIN' (chase passed the target), 'AO' (5th wicket, or a dismissed batter left at the crease: no one to come in), else ''. @param {any} inn @param {any[]} bat */
const endOf = (inn, bat) => (inn.target != null && inn.runs > inn.target ? 'WIN' : inn.wk >= 5 || inn.crease.some((/** @type {number} */ i) => bat[i] && bat[i].inn.out) ? 'AO' : '');
const keyOf = (/** @type {number} */ runs, /** @type {number} */ wk, /** @type {string} */ end) => (end ? `${end}:${runs}w${wk}` : `${runs}w${wk}`);

/**
 * Sample the coming over n times with the real playOver on light copies of the live innings and players (only the fields playOver
 * writes are copied: innings counters/crease/logs, every batter's .inn, the bowler's .overs/.figs). Neutral calls: field 'P', intent 'R'.
 * opts {fx, centre, pairing, roar, n}; missing parts as commands.js (matchOpts). The live state is never touched.
 * @param {any} s @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {any} [opts]
 * @returns {{k:number, runs:number, wk:number, end:''|'WIN'|'AO', key:string}[]}
 */
export function sampleOvers(s, side, bowlerIdx, opts) {
  const o = fullOpts(s, side, opts), n = (opts && opts.n) || WMX.N_SAMP;
  const { inn, bat, bowl } = sideParts(s, side), over = inn.over;
  /** @type {WeakMap<object, object>} */ const orig = new WeakMap();
  const fx = o.fx ? { of: (/** @type {any} */ q) => o.fx.of(orig.get(q) || q) } : undefined; // copies read the originals' (memoised) skill effects
  const w0 = bowl[bowlerIdx];
  const out = [];
  for (let k = 0; k < n; k++) {
    const i2 = { ...inn, crease: inn.crease.slice(), overs: [] };
    if (inn.roarOvers) i2.roarOvers = inn.roarOvers.slice();
    if (inn.wkLog) i2.wkLog = inn.wkLog.slice();
    const bat2 = bat.map((/** @type {any} */ p) => { const c = { ...p, inn: { ...p.inn } }; orig.set(c, p); return c; });
    const bowl2 = bowl.slice(), wc = { ...w0, figs: { ...w0.figs } }; orig.set(wc, w0); bowl2[bowlerIdx] = wc;
    playOver(makeRng(sampleSeed(s, side, over, k)), i2, bat2, bowl2, bowlerIdx, 'R', 'P', fx, o.centre, o.pairing, o.roar);
    const runs = i2.runs - inn.runs, wk = i2.wk - inn.wk;
    const end = /** @type {''|'WIN'|'AO'} */ (endOf(i2, bat2));
    out.push({ k, runs, wk, end, key: keyOf(runs, wk, end) });
  }
  return out;
}
/**
 * Replay sample k on the LIVE (already cloned by the store) state: same rng string, real innings and players, neutral calls.
 * Mutates n like playOver does and returns the balls. Pass the same opts the model was built with (or none: matchOpts(n, side)).
 * @param {any} n @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {number} k @param {any} [opts]
 */
export function replayOver(n, side, bowlerIdx, k, opts) {
  const o = fullOpts(n, side, opts), { inn, bat, bowl } = sideParts(n, side);
  return playOver(makeRng(sampleSeed(n, side, inn.over, k)), inn, bat, bowl, bowlerIdx, 'R', 'P', o.fx, o.centre, o.pairing, o.roar);
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
 * Segments for one over: folded normal labels in zigzag rim order (best for us, worst, 2nd best, 2nd worst, ...), plus one WIN seg
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
  // zigzag rim order: NORMAL segments by value for us (ties: fewer wickets, then fewer runs), best, worst, 2nd best, 2nd worst ...;
  // WIN first (top end), ALL OUT last (bottom end), either side (SPEC s2)
  const sorted = segs.filter((g) => !g.end).sort((a, b) => b.value - a.value || a.wk - b.wk || a.runs - b.runs);
  const order = []; for (let a = 0, b = sorted.length - 1; a <= b; ) { order.push(sorted[a++]); if (a <= b) order.push(sorted[b--]); }
  const win = segs.find((g) => g.end === 'WIN'), ao = segs.find((g) => g.end === 'AO');
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
const matches = (x, seg) => (seg.end ? x.end === seg.end : !x.end && x.runs === seg.runs && x.wk === seg.wk);
/** One sample whose outcome is the segment's label (uniform among them; one rng draw). Panel always matches the label. @param {{random:()=>number}} rng @param {any[]} samples @param {any} seg */
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
const MEMO = new Map(), MEMO_MAX = 4;
/**
 * Samples, segments and the Expected line for the coming over. Memoised by seed|side|over|bowler|runs|wk|balls|n (small Map, max 4).
 * need {runs, balls} in a chase: runs to win and balls left.
 * @param {any} s @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {any} [opts]
 */
export function wheelOverModel(s, side, bowlerIdx, opts) {
  const inn = sideParts(s, side).inn, n = (opts && opts.n) || WMX.N_SAMP;
  const key = `${s.seed}|${side}|${inn.over}|${bowlerIdx}|${inn.runs}|${inn.wk}|${inn.balls}|${n}`;
  const hit = MEMO.get(key); if (hit) return hit;
  const samples = sampleOvers(s, side, bowlerIdx, opts);
  const need = side === 'bat' && inn.target != null ? { runs: inn.target + 1 - inn.runs, balls: 60 - inn.balls } : undefined;
  const segs = buildSegments(samples, need ? { side, needRuns: need.runs, ballsLeft: need.balls } : { side });
  /** @type {any} */ const model = { samples, segs, expect: expectOf(samples) };
  if (need) model.need = need;
  MEMO.set(key, model); if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return model;
}
