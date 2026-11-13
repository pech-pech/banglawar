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
// Extra keys by wheel (for Agent E, applying to dial/reel wheels):
//   spot:   streak (1 = Hot Streak: gold right after gold pays +1)
//   course: bestOfTwo (1 = Second Opinion)
//   hype:   rareAdd (Big Voice: width added to the Nuts slice), lowToMedium (1 = Home Crowd: Low slices pay at least Medium = 4)
//   toss:   rareAdd (Coin Weight: width added to EACH won slice), consolation (Good Sport: the good-sport slice also gives +2.5 %; 0 = off)
//   pep:    rareAdd (Pep Voice: Double pep width), neighbourMult (1 or 1.5: Pep Rally multiplies the pep result)
//   find:   rareAdd (Sharp Eyes: width added to EACH find slice), cheer (1 = Second Cheer: a cheer slice gives one more free spin)
//   scout:  scoutFloor (1 = Scout's Eye: a quiet slice pays at least 1 step); goldAdd already includes Top Name (+0.10)
//   finals: neighbourMult (1 or 1.5: Prize Pair on Coins, TP and Fans; Medals never); goldAdd includes Trophy Polish (+0.10)
// Tokens (Q1 = A): respin, nudge, two, wild, lift only work on Spotlight (cap 2 a season, any kind) and Course (no cap).
import { WM, NODES, WHEEL_IDS } from '../data/wheelmeta.js';
import { FLAGS } from '../data/flags.js';
import { ECON } from '../data/economy.js';
import { courseWheel, wheelSlices, wheelWidths, spinResult } from './training.js';

const clone = (/** @type {any} */ x) => structuredClone(x);
const BY = Object.fromEntries(NODES.map((n) => [n.id, n]));
const BASE = { W0: 24, J: 0.6, SD: 0.11 };
const SKILL = ['spot', 'course'];
const TOKEN_OF = /** @type {Record<string,string>} */ ({ respin_tokens_per_season: 'respin', nudge_tokens_per_season: 'nudge', pick_two_tokens_per_season: 'two', wild_tokens_per_season: 'wild', lift_tokens_per_season: 'lift' });
const KINDS = ['respin', 'two', 'nudge', 'lift'];
const LABEL = /** @type {Record<string,string>} */ ({ respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge', lift: 'Lucky Lift' });
const freshMeta = () => ({ tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {} });
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
  w0Mult: 1, jMult: 1, guide: false, goldAdd: 0, extraGold: 0, floor: 0, booster: { chance: 0, value: 0, count: 0, unit: /** @type {any} */ (WM.UNIT)[w] },
  ...(w === 'spot' ? { streak: 0 } : {}), ...(w === 'course' ? { bestOfTwo: 0 } : {}),
  ...(w === 'hype' ? { rareAdd: 0, lowToMedium: 0 } : {}), ...(w === 'toss' ? { rareAdd: 0, consolation: 0 } : {}),
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
  /** @type {Record<string,number>} */ const jwBy = {}, rwBy = {}; const tokens = out.tokens;
  for (const id of Object.keys(own)) {
    const r = own[id] | 0, n = BY[id]; if (!r || !n || n.branch === 'craft') continue;
    const { type, per_rank: p, scope } = n.effect, all = scope.length >= WHEEL_IDS.length;
    if (type === 'w0_mult') w0 += p * r;
    else if (type === 'wobble_mult') wob += p * r;
    else if (type === 'preview_mark') guide = true;
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
    if (w === 'spot' || w === 'course') { X.w0Mult = Math.max(0.3, 1 + w0); X.jMult = Math.max(0, 1 + wob); X.guide = guide; }
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

// ---- tokens
/** Refill tokens from the owned ranks at season start (once a season; Spotlight uses 0). @param {any} s */
export function seasonTokens(s) {
  if (!FLAGS.wheelMeta) return s;
  const n = seasonOf(s), m0 = metaOf(s); if (m0.tokSeason === n) return s;
  const x = clone(s), m = (x.wheelMeta ||= freshMeta()), e = effective(x).tokens;
  m.tokens = { respin: e.respin, nudge: e.nudge, two: e.two, wild: e.wild, lift: e.lift }; m.spotTokensUsed = 0; m.tokSeason = n;
  return x;
}
/** Which store a kind would draw from: its own tokens first, then Wild; null if it cannot be used now. */
function tokenSource(/** @type {any} */ s, /** @type {string} */ wheelId, /** @type {string} */ kind, /** @type {any} */ p) {
  if (!FLAGS.wheelMeta || !p || !SKILL.includes(wheelId) || !KINDS.includes(kind)) return null;
  const m = metaOf(s), t = m.tokens || {};
  if (wheelId === 'spot' && (m.spotTokensUsed | 0) >= WM.SPOT_TOKEN_CAP) return null;
  const src = (t[kind] | 0) > 0 ? kind : (t.wild | 0) > 0 ? 'wild' : null; if (!src) return null;
  const wheel = p.wheel || defaultWheel(s, wheelId), golds = wheel.golds || [wheel.jackpotIndex || 0];
  if (golds.includes(p.index)) return null;                       // gold is never improved: every tool is for a non-gold stop
  if (kind === 'lift' && p.lifted) return null;
  if (kind === 'nudge') { const best = nudgeTo(wheel, p); if (best < 0) return null; }
  return src;
}
/** Neighbour slice (one over, never onto gold) that pays more than now, or -1. */
function nudgeTo(/** @type {any} */ wheel, /** @type {any} */ p) {
  const L = wheel.slices.length, golds = wheel.golds || [wheel.jackpotIndex || 0];
  const c = [(p.index - 1 + L) % L, (p.index + 1) % L].filter((j) => !golds.includes(j)).sort((a, b) => wheel.slices[b] - wheel.slices[a]);
  return c.length && wheel.slices[c[0]] > p.gain ? c[0] : -1;
}
/** Buttons to show after the stop: [{kind:'respin'|'two'|'nudge'|'lift', label}]. Empty off Spotlight/Course, with no tokens, at the Spotlight cap, or on gold. @param {any} s @param {string} wheelId @param {any} pending the result (+ wheel) */
export function tokenOptions(s, wheelId, pending) {
  return KINDS.map((kind) => { const src = tokenSource(s, wheelId, kind, pending); return src ? { kind, label: LABEL[kind] + (src === 'wild' ? ' (Wild)' : '') } : null; }).filter((x) => !!x);
}
/**
 * Use one token on a result. respin / two: spin again and keep the better (never worse); nudge: one slice over, never onto gold;
 * lift: a bonus that only adds, never above gold. Wild stands in when the kind has none. Spotlight stops at 2 tokens a season.
 * Not allowed = the same {s, pending}. stop = how the new spin is tapped (spinResult stop; default a careful synthetic tap).
 * @param {any} s @param {string} wheelId @param {string} kind @param {any} pending the result, with .wheel (the meta wheel spun) @param {{random:()=>number}} rng @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 * @returns {{s:any, pending:any}}
 */
export function useToken(s, wheelId, kind, pending, rng, stop) {
  const src = tokenSource(s, wheelId, kind, pending); if (!src) return { s, pending };
  const wheel = pending.wheel || defaultWheel(s, wheelId), X = effective(s)[wheelId], streak0 = pending.streak0 | 0;
  let p = { ...pending, wheel, used: [...(pending.used || []), kind] };
  if (kind === 'respin' || kind === 'two') {
    const r2 = decorate(wheel, X, wheelId, streak0, spinResult(rng, wheel, stop === undefined ? true : stop), rng);
    if (r2.gain > p.gain) p = { ...p, ...r2, wheel, used: p.used };
  } else if (kind === 'nudge') {
    const j = nudgeTo(wheel, p); p = { ...p, index: j, gain: wheel.slices[j], jackpot: false, boosted: false };
  } else {
    const cap = wheel.slices[wheel.jackpotIndex || 0], b = wheelId === 'spot' ? WM.LIFT[Math.floor(rng.random() * WM.LIFT.length)] : WM.LIFT_COURSE[Math.floor(rng.random() * WM.LIFT_COURSE.length)];
    p = { ...p, gain: Math.max(p.gain, Math.min(p.gain + b, cap)), lifted: true };
  }
  const n = clone(s), m = n.wheelMeta; m.tokens[src] -= 1; if (wheelId === 'spot') { m.spotTokensUsed = (m.spotTokensUsed | 0) + 1; m.streak = p.jackpot ? streak0 + 1 : 0; }
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
    `Course: gold +${E.course.goldAdd.toFixed(2)}, second opinion ${E.course.bestOfTwo}`].map((x) => String(x));
}
