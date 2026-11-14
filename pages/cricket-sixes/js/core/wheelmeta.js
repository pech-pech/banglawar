// @ts-check
// Wheel meta (Spokes, tiers, the Workshop tree and its effects). Pure and seeded: functions take the state and return a NEW state
// (structuredClone; the input is never mutated); every function is a no-op / neutral when FLAGS.wheelMeta is false.
// Effect maths is ported from team-numbers/sim/wheel_meta_sim_v2.py (effective, build, one_spin, spin_full, run_once). No DOM, no Math.random.
//
// effective(s) -> { spot, course, hype, toss, pep, find, scout, finals, tokens, tier }. Every wheel object has the SAME base keys:
//   w0Mult    speed multiplier on W0 (Slow Spin; spot, course only, else 1)        jMult   wobble multiplier on J (Steady Axle; spot, course only, else 1)
//   guide     Aim Guide owned (tap SD x GUIDE_SD_FACTOR; draw the landing tick)     goldAdd width added to the gold slice (Widener + the wheel's own node)
//   extraGold number of extra gold slices (0|1; never on toss)                      floor   value added to the lowest slices (value units, spot/course/hype/toss, else 0)
//   booster   {chance, value, count, unit}: chance a random non-gold slice shines; value = Booster value x unit (what a landing on it adds)
//   zone      Aim Zone seconds (spot, course only, else 0): the lane marks glow while the gold slice is within this many seconds of the pointer (a cue, no odds change)
//   chime     Gold Chime owned (spot, course only, else false): the pointer flashes gold, and onTick gets {chime:true}, each time a gold slice passes under it
// Extra keys by wheel (for Agent E, applying to dial/reel wheels):
//   spot:   streak (1 = Hot Streak: gold right after gold pays +1)
//   course: bestOfTwo (1 = Second Opinion)
//   hype:   rareAdd (Big Voice: width added to the Nuts slice), lowToMedium (1 = Home Crowd: Low slices pay at least Medium = 4)
//   toss:   rareAdd (Coin Weight: width added to EACH won slice), consolation (Good Sport: the good-sport slice also gives +2.5 %; 0 = off)
//   pep:    rareAdd (Pep Voice: Double pep width), neighbourMult (1 or 1.5: Pep Rally multiplies the pep result)
//   find:   rareAdd (Sharp Eyes: width added to EACH find slice), cheer (1 = Second Cheer: a cheer slice gives one more free spin)
//   scout:  scoutFloor (1 = Scout's Eye: a quiet slice pays at least 1 step); goldAdd already includes Top Name (+0.10)
//   finals: neighbourMult (1 or 1.5: Prize Pair on Coins, TP and Fans; Medals never); goldAdd includes Trophy Polish (+0.10)
// wa1 (2026-11-14-wheel-all-spins): Control (w0Mult, jMult, guide, zone, chime) is filled on EVERY wheel; feelOnly = true on toss, pep, scout,
//   finals (views may look slower / draw a tick, landing stays random). hype.dial = {V, Jmult, sdMult} (02 s5). Tokens work on all 8 wheels with
//   cap rule F (2 a season per wheel, Course uncapped; 1 a match day across hype, toss, pep). API: build/wa1/API-TOKENS.md.
import { WM, NODES, WHEEL_IDS } from '../data/wheelmeta.js';
import { FLAGS } from '../data/flags.js';
import { ECON } from '../data/economy.js';
import { courseWheel, wheelSlices, wheelWidths, spinResult } from './training.js';
import { dialResult, revealResult } from './dialreel.js';
import { MD } from '../data/matchday.js';

const clone = (/** @type {any} */ x) => structuredClone(x);
const BY = Object.fromEntries(NODES.map((n) => [n.id, n]));
const BASE = { W0: 24, J: 0.6, SD: 0.11 };
const SKILL = ['spot', 'course'];
const TOKEN_OF = /** @type {Record<string,string>} */ ({ respin_tokens_per_season: 'respin', nudge_tokens_per_season: 'nudge', pick_two_tokens_per_season: 'two', wild_tokens_per_season: 'wild', lift_tokens_per_season: 'lift' });
const KINDS = ['respin', 'two', 'nudge', 'lift'];
const LABEL = /** @type {Record<string,string>} */ ({ respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge', lift: 'Lucky Lift' });
const freshMeta = () => ({ tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {}, tokUsed: {}, matchTokUsed: { key: '', n: 0 } });
const seasonOf = (/** @type {any} */ s) => (s && s.season && s.season.n) || 1;

// ---- reads
/** @param {any} s */
export const metaOf = (s) => (s && s.wheelMeta) || freshMeta();
/** @param {any} s */
export const craftOf = (s) => (s && s.wheelCraft) || { owned: {} };
/** Owned rank of a node; Craft ranks live in wheelCraft (carried across runs). @param {any} s @param {string} id */
export function rankOf(s, id) {
  const n = BY[id]; if (!n) return 0;
  return ((n.branch === 'craft' ? craftOf(s).owned : metaOf(s).owned)[id]) | 0;
}
/** Tier 0..7 for a tally (number of TIERS reached). @param {number} tally */
export const tierOf = (tally) => WM.TIERS.filter((t) => tally >= t).length;
/** @param {any} s */
export const tierNow = (s) => tierOf(metaOf(s).tally);

// ---- spokes
/**
 * One spin (or count spins) of a wheel: tally += count; Spokes += count x (base + tier reached before each spin) (+1 on a good-sport slice);
 * tiers crossed are queued for the tier-up card.
 * @param {any} s @param {string} wheelId @param {{count?:number, sportSlice?:boolean}} [opts]
 */
export function recordSpin(s, wheelId, opts = {}) {
  if (!FLAGS.wheelMeta || !(wheelId in WM.SPOKE_BASE)) return s;
  const n = clone(s); const m = (n.wheelMeta ||= freshMeta());
  const count = Math.max(0, Math.floor(opts.count ?? 1));
  for (let i = 0; i < count; i++) {
    const t0 = tierOf(m.tally); m.spokes += /** @type {any} */ (WM.SPOKE_BASE)[wheelId] + WM.SPOKE_PER_TIER * t0; m.tally += 1;
    const t1 = tierOf(m.tally); for (let t = t0 + 1; t <= t1; t++) m.tierUpQueue.push(t);
  }
  if (opts.sportSlice) m.spokes += 1;
  return n;
}
/** First tier-up card waiting (a tier number 1..7) or null. @param {any} s */
export const nextTierUp = (s) => { const q = metaOf(s).tierUpQueue || []; return q.length ? q[0] : null; };
/** @param {any} s */
export function dismissTierUp(s) {
  const q = metaOf(s).tierUpQueue || []; if (!q.length) return s;
  const n = clone(s); const m = n.wheelMeta; const t = m.tierUpQueue.shift(); m.tierSeen = Math.max(m.tierSeen || 0, t); return n;
}

// ---- buying
/**
 * @param {any} s @param {string} id
 * @returns {{ok:boolean, reason:''|'locked'|'spokes'|'max'|'needs'|'off', cost:number, need:any, have:any}}
 * locked: need = tier the rank opens at, have = tier now. needs: need = id of the required node. spokes: need = cost, have = Spokes.
 */
export function canBuy(s, id) {
  const n = BY[id]; if (!FLAGS.wheelMeta) return { ok: false, reason: 'off', cost: 0, need: 0, have: 0 };
  if (!n) return { ok: false, reason: 'locked', cost: 0, need: 0, have: 0 };
  const r = rankOf(s, id), m = metaOf(s), tier = tierNow(s);
  if (r >= n.max_rank) return { ok: false, reason: 'max', cost: 0, need: 0, have: r };
  const cost = n.cost[r], opens = n.tier + r;
  if (tier < opens) return { ok: false, reason: 'locked', cost, need: opens, have: tier };
  const miss = n.requires.find((q) => rankOf(s, q) < 1);
  if (miss) return { ok: false, reason: 'needs', cost, need: miss, have: 0 };
  if (m.spokes < cost) return { ok: false, reason: 'spokes', cost, need: cost, have: m.spokes };
  return { ok: true, reason: '', cost, need: cost, have: m.spokes };
}
/** Buy the next rank (Spokes -= cost, spent += cost). Craft ranks go to wheelCraft; token nodes add a token now. Not buyable = same state. @param {any} s @param {string} id */
export function buyNode(s, id) {
  const c = canBuy(s, id); if (!c.ok) return s;
  const n = BY[id], r = rankOf(s, id), x = clone(s); const m = (x.wheelMeta ||= freshMeta());
  m.spokes -= c.cost; m.spent += c.cost;
  if (n.branch === 'craft') { x.wheelCraft ||= { owned: {} }; x.wheelCraft.owned[id] = r + 1; } else m.owned[id] = r + 1;
  const kind = TOKEN_OF[n.effect.type]; if (kind) m.tokens[kind] = (m.tokens[kind] || 0) + 1;
  return x;
}

// ---- effects (port of sim effective + build)
/** @param {string} w */
const neutralWheel = (w) => ({
  w0Mult: 1, jMult: 1, guide: false, zone: 0, chime: false, feelOnly: WM.FEEL_ONLY.includes(w), goldAdd: 0, extraGold: 0, floor: 0, booster: { chance: 0, value: 0, count: 0, unit: /** @type {any} */ (WM.UNIT)[w] },
  ...(w === 'spot' ? { streak: 0 } : {}), ...(w === 'course' ? { bestOfTwo: 0 } : {}),
  ...(w === 'hype' ? { rareAdd: 0, lowToMedium: 0, dial: { V: 16, Jmult: 1, sdMult: 1 } } : {}), ...(w === 'toss' ? { rareAdd: 0, consolation: 0 } : {}),
  ...(w === 'pep' ? { rareAdd: 0, neighbourMult: 1 } : {}), ...(w === 'find' ? { rareAdd: 0, cheer: 0 } : {}),
  ...(w === 'scout' ? { scoutFloor: 0 } : {}), ...(w === 'finals' ? { neighbourMult: 1 } : {}),
});
const neutral = () => ({ ...Object.fromEntries(WHEEL_IDS.map((w) => [w, neutralWheel(w)])), tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tier: 0 });
/** Per-wheel modifiers from the owned ranks (field list in the file header). Neutral when the flag is off or nothing is owned. @param {any} s @returns {any} */
export function effective(s) {
  const out = /** @type {any} */ (neutral());
  if (!FLAGS.wheelMeta) return out;
  const own = metaOf(s).owned || {}; out.tier = tierNow(s);
  let w0 = 0, wob = 0, guide = false, jw = 0, bch = 0, bval = 1, extra = 0, floor = 0;
  /** @type {Record<string,number>} */ const jwBy = {}, rwBy = {}, zoneBy = {}; /** @type {Record<string,boolean>} */ const cueBy = {}; const tokens = out.tokens;
  for (const id of Object.keys(own)) {
    const r = own[id] | 0, n = BY[id]; if (!r || !n || n.branch === 'craft') continue;
    const { type, per_rank: p, scope } = n.effect, all = scope.length >= WHEEL_IDS.length;
    if (type === 'w0_mult') w0 += p * r;
    else if (type === 'wobble_mult') wob += p * r;
    else if (type === 'preview_mark') guide = true;
    else if (type === 'window_add_s') { for (const w of scope) zoneBy[w] = (zoneBy[w] || 0) + p * r; }
    else if (type === 'aim_cue') { for (const w of scope) cueBy[w] = true; }
    else if (type === 'jackpot_width_add') { if (all) jw += p * r; else for (const w of scope) jwBy[w] = (jwBy[w] || 0) + p * r; }
    else if (type === 'rare_width_add') for (const w of scope) rwBy[w] = (rwBy[w] || 0) + p * r;
    else if (type === 'booster_chance') bch += p * r;
    else if (type === 'booster_value') bval += p * r;
    else if (type === 'extra_slice') extra += r;
    else if (type === 'floor_value') { if (scope[0] === 'hype') out.hype.lowToMedium = 1; else if (scope[0] === 'scout') out.scout.scoutFloor = 1; else floor += r; }
    else if (type === 'streak_value') out.spot.streak = 1;
    else if (type === 'best_of_two') out.course.bestOfTwo = 1;
    else if (type === 'consolation') out.toss.consolation = 1;
    else if (type === 'neighbour_half') out[scope[0]].neighbourMult = 1.5;
    else if (type === 'cheer_respin') out.find.cheer = 1;
    else if (TOKEN_OF[type]) tokens[TOKEN_OF[type]] += r;
  }
  for (const w of WHEEL_IDS) {
    const X = out[w];
    X.goldAdd = jw + (jwBy[w] || 0); X.extraGold = w === 'toss' ? 0 : extra;
    X.booster = { chance: Math.min(1, bch), value: bval * /** @type {any} */ (WM.UNIT)[w], count: bval, unit: /** @type {any} */ (WM.UNIT)[w] };
    if ('rareAdd' in X) X.rareAdd = rwBy[w] || 0;
    X.w0Mult = Math.max(0.3, 1 + w0); X.jMult = Math.max(0, 1 + wob); X.guide = guide; X.zone = zoneBy[w] || 0; X.chime = !!cueBy[w]; // Control on every wheel (wa1)
    if (w === 'hype') X.dial = { V: 16 * X.w0Mult, Jmult: X.jMult, sdMult: guide ? WM.GUIDE_SD_FACTOR : 1 };
    if (['spot', 'course', 'hype', 'toss'].includes(w)) X.floor = floor * /** @type {any} */ (WM.UNIT)[w];
  }
  return out;
}

/**
 * A wheel with the tree applied: gold slice wider (Widener + own node), Extra Gold slice inserted (0.75 width, after the first non-gold slice
 * from position 3 that pays 2+), Kind Floor (value-1 slices pay more; spot and course), and phys {W0, J, SD} for training.js.
 * `golds` lists every gold index (spinResult / carefulTapTime read it). Flag off: the input wheel itself (no phys key).
 * @param {{slices:number[], jackpotIndex?:number, widths?:number[], C?:number}} wheel @param {string} wheelId @param {any} s
 */
export function metaWheel(wheel, wheelId, s) {
  if (!FLAGS.wheelMeta) return wheel;
  const X = effective(s)[wheelId] || neutralWheel(wheelId), ji = wheel.jackpotIndex || 0, ws = wheelWidths(wheel);
  let L = wheel.slices.map((v, i) => ({ v, w: ws[i], gold: i === ji }));
  L[ji].w += X.goldAdd;
  const g0 = L[ji];
  for (let e = 0; e < X.extraGold; e++) {
    const cand = L.map((q, i) => (!q.gold && i >= 3 && q.v >= 2 ? i : -1)).filter((i) => i >= 0);
    const pos = cand.length ? cand[e % cand.length] + 1 + e : Math.round(L.length * (e + 1) / (X.extraGold + 1)) + e;
    L.splice(pos, 0, { v: g0.v, w: g0.w * WM.EXTRA_W, gold: true });
  }
  if (X.floor && SKILL.includes(wheelId)) L = L.map((q) => (q.v === 1 && !q.gold ? { ...q, v: q.v + X.floor } : q));
  const widths = L.map((q) => q.w), C = widths.reduce((a, b) => a + b, 0), golds = L.map((q, i) => (q.gold ? i : -1)).filter((i) => i >= 0);
  return { ...wheel, slices: L.map((q) => q.v), jackpotIndex: L.findIndex((q) => q.gold), widths, C, golds,
    phys: { W0: BASE.W0 * X.w0Mult, J: BASE.J * X.jMult, SD: BASE.SD * (X.guide ? WM.GUIDE_SD_FACTOR : 1) } };
}

// ---- results: booster, Hot Streak, Second Opinion
const defaultWheel = (/** @type {any} */ s, /** @type {string} */ wheelId) => metaWheel(wheelId === 'course' ? courseWheel() : wheelSlices('normal'), wheelId, s);
/** Booster and Hot Streak on one spin result (the sim's one_spin tail). */
function decorate(/** @type {any} */ wheel, /** @type {any} */ X, /** @type {string} */ wheelId, /** @type {number} */ streak0, /** @type {any} */ r, /** @type {any} */ rng) {
  let gain = r.gain, boosted = false; const golds = wheel.golds || [wheel.jackpotIndex || 0];
  if (X.booster.chance && rng.random() < X.booster.chance) {
    const c = wheel.slices.map((_v, i) => i).filter((i) => !golds.includes(i)), b = c[Math.floor(rng.random() * c.length)];
    if (b === r.index) { gain += X.booster.value; boosted = true; }
  }
  const gold = golds.includes(r.index);
  if (gold && wheelId === 'spot' && X.streak) gain += Math.min(streak0, WM.STREAK_MAX);
  return { ...r, gain, jackpot: gold, boosted, streak0 };
}
/**
 * After a spin result: booster roll, Hot Streak (+1 gold after gold, Spotlight), Second Opinion (Course: free second spin, keep better), streak count.
 * Only spot and course are touched (the dial and reel wheels use effective()). Uses the given rng only.
 * @param {any} s @param {string} wheelId @param {any} result a spinResult @param {{random:()=>number}} rng
 * @param {{wheel?:any, careful?:boolean|{t:number}}} [opts] wheel = the meta wheel spun (default: Normal Spotlight / Course); careful = how the free second spin is tapped (default true: synthetic careful tap)
 * @returns {{s:any, result:any}}
 */
export function afterResult(s, wheelId, result, rng, opts = {}) {
  if (!FLAGS.wheelMeta || !SKILL.includes(wheelId)) return { s, result };
  const wheel = opts.wheel || defaultWheel(s, wheelId), X = effective(s)[wheelId], m = metaOf(s), streak0 = wheelId === 'spot' ? m.streak | 0 : 0;
  let r = decorate(wheel, X, wheelId, streak0, result, rng);
  if (wheelId === 'course' && X.bestOfTwo) {
    const r2 = decorate(wheel, X, wheelId, streak0, spinResult(rng, wheel, opts.careful === undefined ? true : opts.careful), rng);
    if (r2.gain > r.gain) r = r2;
  }
  const n = clone(s); const nm = (n.wheelMeta ||= freshMeta());
  if (wheelId === 'spot') nm.streak = r.jackpot ? streak0 + 1 : 0;
  return { s: n, result: r };
}

// ---- tokens (wa1: all 8 wheels, cap rule F; API in build/wa1/API-TOKENS.md)
export const TOKEN_WHEELS = WHEEL_IDS.slice();
/** Refill tokens from the owned ranks at season start (once a season). Per-wheel counters reset. @param {any} s */
export function seasonTokens(s) {
  if (!FLAGS.wheelMeta) return s;
  const n = seasonOf(s), m0 = metaOf(s); if (m0.tokSeason === n) return s;
  const x = clone(s), m = (x.wheelMeta ||= freshMeta()), e = effective(x).tokens;
  m.tokens = { respin: e.respin, nudge: e.nudge, two: e.two, wild: e.wild, lift: e.lift }; m.spotTokensUsed = 0; m.tokUsed = {}; m.tokSeason = n;
  return x;
}
/** The result the stores keep is {week?, careful, wheel, result:{index,gain,jackpot,..}, tokUsed?, used?, lifted?}; the token rules read one flat {index, gain, jackpot, wheel, ..}. A flat object passes through. @param {any} p */
export const flatPending = (p) => (p && p.result && typeof p.result === 'object' ? { ...p, ...p.result, ...(p.wheel ? { wheel: p.wheel } : {}) } : p);
/** Match-day key for the 1-a-match cap: `season|kind|round|salt`. @param {any} s */
export const matchKeyOf = (s) => (s && s.fixture ? `${seasonOf(s)}|${s.fixture.kind}|${s.fixture.round}|${s.salt}` : '');
/** Tokens used this season on a wheel (old saves: spotTokensUsed counts for spot). */
const usedOn = (/** @type {any} */ m, /** @type {string} */ w) => { const u = ((m.tokUsed || {})[w]) | 0; return w === 'spot' ? Math.max(u, m.spotTokensUsed | 0) : u; };
const matchUsed = (/** @type {any} */ m, /** @type {string} */ key) => (m.matchTokUsed && m.matchTokUsed.key === key ? m.matchTokUsed.n | 0 : 0);
const keyOf = (/** @type {any} */ s, /** @type {any} */ ctx) => (ctx && typeof ctx.matchKey === 'string' && ctx.matchKey ? ctx.matchKey : matchKeyOf(s));
/** Uses left: {pool (tokens in the shared pool), wheelLeft (this season on this wheel; null = uncapped), matchLeft (this match day; null off hype/toss/pep)}. @param {any} s @param {string} wheelId @param {{matchKey?:string}} [ctx] */
export function tokenLeft(s, wheelId, ctx = {}) {
  const m = metaOf(s), t = m.tokens || {}, cap = /** @type {any} */ (WM.TOKEN_CAP_WHEEL_SEASON)[wheelId];
  const pool = ['respin', 'nudge', 'two', 'wild', 'lift'].reduce((a, k) => a + (t[k] | 0), 0);
  return { pool, wheelLeft: cap == null ? null : Math.max(0, cap - usedOn(m, wheelId)), matchLeft: WM.MATCH_WHEELS.includes(wheelId) ? Math.max(0, WM.TOKEN_CAP_MATCH - matchUsed(m, keyOf(s, ctx))) : null };
}
/** Gold slice indexes of the spun wheel (no token on these, never nudged onto). */
function goldsOf(/** @type {string} */ w, /** @type {any} */ wheel) {
  if (!wheel) return [];
  if (w === 'spot' || w === 'course') return wheel.golds || [wheel.jackpotIndex || 0];
  if (w === 'find') return Array.isArray(wheel.golds) ? wheel.golds : [];
  return (wheel.slices || []).map((/** @type {any} */ c, /** @type {number} */ i) => (c.gold ? i : -1)).filter((/** @type {number} */ i) => i >= 0);
}
const isFindCell = (/** @type {any} */ wheel, /** @type {number} */ j) => (wheel.cells ? !!(wheel.cells[j] && wheel.cells[j].find) : Array.isArray(wheel.finds) ? wheel.finds.includes(j) : false);
const fxValue = (/** @type {string} */ w, /** @type {any} */ fx, /** @type {any} */ p) => {
  fx = fx || {};
  if (w === 'toss') return +fx.tossb || 0;
  if (w === 'pep') return fx.pep != null ? +fx.pep : p && p.slots ? p.slots.length : 0;
  if (w === 'scout') return +fx.steps || 0;
  return (+fx.coins || 0) + (+fx.tp || 0) + (+fx.fans || 0) + WM.FINALS_MEDAL_EQ * (+fx.medal || 0); // finals: Coin-eq
};
/** The value the token rules compare: spot/course gain, hype pts, toss boost %, pep players, scout steps, finals Coin-eq, find 1|0. @param {string} wheelId @param {any} pending */
export function tokenValue(wheelId, pending) {
  const p = flatPending(pending); if (!p) return 0;
  if (wheelId === 'spot' || wheelId === 'course') return +p.gain || 0;
  if (wheelId === 'hype') return +p.pts || 0;
  if (wheelId === 'find') return p.find ? 1 : 0;
  return fxValue(wheelId, p.fx, p);
}
/** Slice fx as revealResult would pay it (Prize Pair x1.5 on Finals Coins/TP/Fans). */
function sliceFx(/** @type {string} */ w, /** @type {any} */ wheel, /** @type {number} */ j) {
  const fx = { ...wheel.slices[j].fx };
  if (w === 'finals' && wheel.mods && wheel.mods.nb) for (const k of ['coins', 'tp', 'fans']) if (fx[k]) fx[k] = Math.floor(fx[k] * 1.5 + 0.5);
  if (w === 'pep') fx.pep = wheel.slices[j].id === 'double' || (fx.pep | 0) >= 2 ? 2 : 1;
  return fx;
}
const sliceValue = (/** @type {string} */ w, /** @type {any} */ wheel, /** @type {number} */ j) =>
  w === 'spot' || w === 'course' ? wheel.slices[j] : w === 'hype' ? wheel.slices[j].pts : w === 'find' ? (isFindCell(wheel, j) ? 1 : 0) : fxValue(w, sliceFx(w, wheel, j), null);
/** Neighbour slice (one over, never onto gold) that pays more than now, or -1. The Hype half-dial does not wrap; every other wheel does. */
function nudgeTo(/** @type {string} */ w, /** @type {any} */ wheel, /** @type {any} */ p) {
  const L = wheel.slices.length, golds = goldsOf(w, wheel), v = tokenValue(w, p);
  const nb = w === 'hype' ? [p.index - 1, p.index + 1].filter((j) => j >= 0 && j < L) : [(p.index - 1 + L) % L, (p.index + 1) % L];
  const c = nb.filter((j) => !golds.includes(j)).sort((a, b) => sliceValue(w, wheel, b) - sliceValue(w, wheel, a));
  return c.length && sliceValue(w, wheel, c[0]) > v ? c[0] : -1;
}
/** The spun wheel has the shape this wheel's rules read (dial / reveal slices are objects; find has cells or finds). */
const shapeOk = (/** @type {string} */ w, /** @type {any} */ wheel) => (w === 'find' ? !!(wheel.slices && (wheel.cells || Array.isArray(wheel.finds)))
  : !!(wheel.slices && wheel.slices.length && typeof wheel.slices[0] === 'object' && (w !== 'hype' || wheel.kind === 'dial') && (w === 'hype' || wheel.kind === w)));
/** Which store a kind would draw from: its own tokens first, then Wild; null if it cannot be used now. */
function tokenSource(/** @type {any} */ s, /** @type {string} */ wheelId, /** @type {string} */ kind, /** @type {any} */ p0, /** @type {any} */ ctx) {
  const p = flatPending(p0);
  if (!FLAGS.wheelMeta || !p || !TOKEN_WHEELS.includes(wheelId) || !KINDS.includes(kind)) return null;
  const m = metaOf(s), t = m.tokens || {}, cap = /** @type {any} */ (WM.TOKEN_CAP_WHEEL_SEASON)[wheelId];
  if (cap != null && usedOn(m, wheelId) >= cap) return null;
  if (WM.MATCH_WHEELS.includes(wheelId) && matchUsed(m, keyOf(s, ctx)) >= WM.TOKEN_CAP_MATCH) return null;
  const src = (t[kind] | 0) > 0 ? kind : (t.wild | 0) > 0 ? 'wild' : null; if (!src) return null;
  const wheel = p.wheel || (SKILL.includes(wheelId) ? defaultWheel(s, wheelId) : null); if (!wheel) return null;
  if (!SKILL.includes(wheelId) && !shapeOk(wheelId, wheel)) return null; // a pending from another wheel kind: no offer
  if (wheelId === 'find' ? !!p.find : goldsOf(wheelId, wheel).includes(p.index)) return null; // gold (or a find) is never improved
  const v = tokenValue(wheelId, p);
  if (kind === 'lift') {
    if (p.lifted || wheelId === 'find') return null;
    if (!SKILL.includes(wheelId)) { const [, capv] = /** @type {any} */ (WM.LIFT_BY)[wheelId]; if (liftBase(wheelId, p) >= capv) return null; }
    return src;
  }
  if (!SKILL.includes(wheelId) && wheelId !== 'find' && v >= /** @type {any} */ (WM.TOKEN_BELOW)[wheelId]) return null;
  if (kind === 'nudge' && nudgeTo(wheelId, wheel, p) < 0) return null;
  return src;
}
/** The field Lucky Lift adds to (sim LIFT_KEY): hype pts, toss boost, pep players, scout steps, finals Coins (not Coin-eq). */
const liftBase = (/** @type {string} */ w, /** @type {any} */ p) => (w === 'hype' ? +p.pts || 0 : w === 'finals' ? +(p.fx && p.fx.coins) || 0 : tokenValue(w, p));
/** Buttons to show after the stop: [{kind:'respin'|'two'|'nudge'|'lift', label, src}]. Empty with the flag off, no tokens, a cap reached, or on gold. @param {any} s @param {string} wheelId @param {any} pending the result (+ .wheel) @param {{matchKey?:string}} [ctx] */
export function tokenOptions(s, wheelId, pending, ctx = {}) {
  return KINDS.map((kind) => { const src = tokenSource(s, wheelId, kind, pending, ctx); return src ? { kind, label: LABEL[kind] + (src === 'wild' ? ' (Wild)' : ''), src } : null; }).filter((x) => !!x);
}
/** One re-spin of the same wheel (core), as a flat pending part. */
function respinOf(/** @type {any} */ s, /** @type {string} */ w, /** @type {any} */ wheel, /** @type {any} */ p, /** @type {any} */ rng, /** @type {any} */ stop) {
  const st = stop === undefined ? true : stop;
  if (w === 'spot' || w === 'course') return decorate(wheel, effective(s)[w], w, p.streak0 | 0, spinResult(rng, wheel, st), rng);
  if (w === 'hype') return dialResult(rng, wheel, st);
  if (w === 'find') { const r = spinResult(rng, wheel, st), f = isFindCell(wheel, r.index); return { ...r, find: f, type: f && wheel.cells && wheel.cells[r.index] ? wheel.cells[r.index].type : null }; }
  return revealResult(rng, wheel);
}
/** Nudge result on wheel slice j (flat pending part). */
function nudged(/** @type {string} */ w, /** @type {any} */ wheel, /** @type {number} */ j) {
  if (w === 'spot' || w === 'course') return { index: j, gain: wheel.slices[j], jackpot: false, boosted: false };
  if (w === 'find') return { index: j, find: true, type: wheel.cells && wheel.cells[j] ? wheel.cells[j].type : null, boosted: false };
  const c = wheel.slices[j];
  if (w === 'hype') { const li = MD.HYPE_LEVELS.indexOf(c.level); return { index: j, level: c.level, levelIdx: li, pts: c.pts, perf: c.pts / 100, fanMult: MD.HYPE_FAN_MULT[li], boosted: false }; }
  const fx = sliceFx(w, wheel, j);
  return { index: j, id: c.id, label: c.label, fx, boosted: false, ...(w === 'pep' ? { slot: c.slot || null, slots: c.slot ? [c.slot] : [] } : {}) };
}
/** Lucky Lift on a dial / reveal result: bonus from WM.LIFT_BY, only adds, never above the cap. */
function lifted(/** @type {string} */ w, /** @type {any} */ p, /** @type {any} */ rng) {
  const [ch, capv] = /** @type {any} */ (WM.LIFT_BY)[w], b = ch[Math.floor(rng.random() * ch.length)];
  if (w === 'hype') { const pts = Math.max(p.pts, Math.min(p.pts + b, capv)); return { pts, perf: pts / 100 }; }
  const fx = { ...(p.fx || {}) };
  if (w === 'toss') fx.tossb = Math.max(+fx.tossb || 0, Math.min((+fx.tossb || 0) + b, capv));
  else if (w === 'scout') fx.steps = Math.max(+fx.steps || 0, Math.min((+fx.steps || 0) + b, capv));
  else if (w === 'finals') fx.coins = Math.max(+fx.coins || 0, Math.min((+fx.coins || 0) + b, capv)); // never a Medal
  else if (w === 'pep') { // b > 0: one more player with chance b (one draw), never past the cap
    const slots = (p.slots || []).slice(), hit = rng.random() < b;
    if (hit && slots.length < capv && slots.length) { let n = (slots[slots.length - 1] % 6) + 1; while (slots.includes(n)) n = (n % 6) + 1; slots.push(n); }
    fx.pep = slots.length; return { fx, slots };
  }
  return { fx };
}
/**
 * Use one token on a result (any of the 8 wheels). respin / two: spin again and keep the better (never worse); nudge: one slice over, never onto gold;
 * lift: a bonus that only adds, never above gold. Wild stands in when the kind has none. Caps: 2 a season per wheel (Course none), 1 a match day on hype/toss/pep.
 * Not allowed = the same {s, pending}. stop = how an aimable re-spin is tapped (default a careful synthetic tap). ctx = {matchKey?, spin?(rng, stop)}.
 * @param {any} s @param {string} wheelId @param {string} kind @param {any} pending the result, with .wheel (the wheel spun) @param {{random:()=>number}} rng
 * @param {boolean|{t:number,phi?:number,e?:number}} [stop] @param {{matchKey?:string, spin?:(rng:any, stop:any)=>any}} [ctx]
 * @returns {{s:any, pending:any}}
 */
export function useToken(s, wheelId, kind, pending, rng, stop, ctx = {}) {
  const src = tokenSource(s, wheelId, kind, pending, ctx); if (!src) return { s, pending };
  pending = flatPending(pending);
  const wheel = pending.wheel || defaultWheel(s, wheelId), streak0 = pending.streak0 | 0;
  let p = { ...pending, wheel, used: [...(pending.used || []), kind] };
  if (kind === 'respin' || kind === 'two') {
    const r2 = ctx && typeof ctx.spin === 'function' ? flatPending(ctx.spin(rng, stop)) : respinOf(s, wheelId, wheel, p, rng, stop);
    if (r2 && tokenValue(wheelId, r2) > tokenValue(wheelId, p)) p = { ...p, ...r2, wheel, used: p.used };
  } else if (kind === 'nudge') {
    p = { ...p, ...nudged(wheelId, wheel, nudgeTo(wheelId, wheel, p)) };
  } else if (SKILL.includes(wheelId)) {
    const cap = wheel.slices[wheel.jackpotIndex || 0], b = wheelId === 'spot' ? WM.LIFT[Math.floor(rng.random() * WM.LIFT.length)] : WM.LIFT_COURSE[Math.floor(rng.random() * WM.LIFT_COURSE.length)];
    p = { ...p, gain: Math.max(p.gain, Math.min(p.gain + b, cap)), lifted: true };
  } else p = { ...p, ...lifted(wheelId, p, rng), lifted: true };
  const n = clone(s), m = n.wheelMeta; m.tokens[src] -= 1;
  m.tokUsed = { ...(m.tokUsed || {}) }; m.tokUsed[wheelId] = usedOn(m, wheelId) + 1;
  if (wheelId === 'spot') { m.spotTokensUsed = (m.spotTokensUsed | 0) + 1; m.streak = p.jackpot ? streak0 + 1 : 0; }
  if (WM.MATCH_WHEELS.includes(wheelId)) { const key = keyOf(s, ctx); m.matchTokUsed = { key, n: matchUsed(m, key) + 1 }; }
  return { s: n, pending: p };
}

// ---- swap
/** Every power node (Control, Fortune, Specialist) at max rank. @param {any} s */
export const powerDone = (s) => NODES.every((n) => n.branch === 'craft' || rankOf(s, n.id) >= n.max_rank);
/** 2 Spokes = 1 Coin into econ.coins (ledger row {k:'swap'}); only once the power tree is done and there is an economy. @param {any} s */
export function swapSpokes(s) {
  if (!FLAGS.wheelMeta || !powerDone(s) || !s.econ) return s;
  const coins = Math.floor(metaOf(s).spokes / WM.SWAP_RATE); if (coins < 1) return s;
  const n = clone(s), m = n.wheelMeta, e = n.econ, spokes = coins * WM.SWAP_RATE;
  m.spokes -= spokes; e.coins = (e.coins || 0) + coins; m.swapDone[seasonOf(s)] = (m.swapDone[seasonOf(s)] || 0) + coins;
  (e.ledger ||= []).push({ k: 'swap', spokes, coins }); if (e.ledger.length > ECON.LEDGER_MAX) e.ledger.splice(0, e.ledger.length - ECON.LEDGER_MAX);
  return n;
}

// ---- report
/** Plain lines for the Copy report. @param {any} s */
export function metaReport(s) {
  const m = metaOf(s), tier = tierNow(s), own = Object.entries(m.owned || {}).filter(([, r]) => r).map(([id, r]) => `${id}${r}`).join(' ') || 'none';
  const craft = Object.entries(craftOf(s).owned || {}).filter(([, r]) => r).map(([id, r]) => `${id}${r}`).join(' ') || 'none';
  const E = effective(s), t = m.tokens || {};
  return [`Wheel upgrades: ${FLAGS.wheelMeta ? 'on' : 'off'}, tier ${tier} (${WM.MATERIALS[Math.max(0, tier - 1)]}), tally ${m.tally}, Spokes ${m.spokes} (spent ${m.spent})`,
    `Tree: ${own}`, `Craft: ${craft}`, `Tokens: spin again ${t.respin | 0}, nudge ${t.nudge | 0}, pick two ${t.two | 0}, wild ${t.wild | 0}, lift ${t.lift | 0}; Spotlight used ${m.spotTokensUsed | 0} of ${WM.SPOT_TOKEN_CAP}`,
    `Spotlight: speed x${E.spot.w0Mult.toFixed(2)}, wobble x${E.spot.jMult.toFixed(2)}, gold +${E.spot.goldAdd.toFixed(2)}, extra gold ${E.spot.extraGold}, booster ${E.spot.booster.chance.toFixed(1)} x ${E.spot.booster.value}, guide ${E.spot.guide ? 'on' : 'off'}`,
    `Course: gold +${E.course.goldAdd.toFixed(2)}, second opinion ${E.course.bestOfTwo}`,
    `Hype dial: speed ${E.hype.dial.V.toFixed(1)}, wobble x${E.hype.dial.Jmult.toFixed(2)}, tap error x${E.hype.dial.sdMult.toFixed(3)}; Control feel only on toss, pep, scout, finals`,
    `Tokens used this season: ${WHEEL_IDS.map((w) => { const c = /** @type {any} */ (WM.TOKEN_CAP_WHEEL_SEASON)[w]; return `${w} ${usedOn(m, w)}${c == null ? '' : '/' + c}`; }).join(', ')}; match day ${m.matchTokUsed && m.matchTokUsed.key === matchKeyOf(s) ? m.matchTokUsed.n | 0 : 0}/${WM.TOKEN_CAP_MATCH}`,
    `Full-tree value vs no tree (design, avg careful): ${WHEEL_IDS.map((w) => `${w} x${/** @type {any} */ (WM.FULL_RATIO)[w].toFixed(2)}`).join(', ')}`].map((x) => String(x));
}
