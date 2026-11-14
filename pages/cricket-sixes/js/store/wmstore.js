// @ts-check
// Wheel meta w2 in the store: Hype dial, Toss and Pep reveals, Find reel, Scout and Finals reveals. Resolution + the plain data the views need.
// All of it is a no-op / null when FLAGS.wheelMeta is false (r9 behaviour). Every roll is seeded `<season seed>|wm|<wheel>|<key>`; never Math.random.
// Results are written to the state the moment the player taps (the view only animates to getPending()), so a reload shows the same result.
// Imports core only (commands.js and selectors.js both import this; it must not import them).
import { FLAGS } from '../data/flags.js';
import { MD } from '../data/matchday.js';
import { ACT } from '../data/activities.js';
import { ECON as E } from '../data/economy.js';
import { makeRng } from '../core/rng.js';
import { effective, recordSpin, tokenOptions, useToken, tokenLeft, matchKeyOf } from '../core/wheelmeta.js';
import { canSign } from '../core/training.js';
import { hypeDialFor, dialResult, findReel, reelResult, pityFind, revealWheel, revealResult, modsFor } from '../core/dialreel.js';
import { activityOptions, actLedger, roundKey } from '../core/activities.js';
import * as WMF from '../core/wheelmeta.js'; // wa1 find: tokens on the Find wheel (tokenOptions / useToken / tokenLeft)
import { findWheel, findWheelResult } from '../core/dialreel.js'; // wa1 find: Find big wheel
import { pickActivity as pickActFind } from '../core/activities.js'; // wa1 find: a token find is paid by re-running the pick

const clone = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));
const on = () => !!FLAGS.wheelMeta;
const HYPE_LABEL = { low: 'Quiet', med: 'Good', high: 'Big', nuts: 'Wild' };
const COIN_FACES = [{ label: 'Won toss', w: 1 }, { label: 'Good sport', w: 1 }];

/** The player's STOP from a command payload: {stop:{t,phi,e}} (the view), careful:true (synthetic careful tap), else a random tap. @param {any} p */
export function stopOf(p) {
  const o = p && p.stop;
  if (o && typeof o === 'object' && Number.isFinite(o.t)) return { t: o.t, phi: o.phi, e: o.e };
  return !!(p && p.careful);
}
const fixtureKey = (/** @type {any} */ s) => `${s.fixture.kind}|${s.fixture.round}|${s.salt}`;
const rngFor = (/** @type {any} */ s, /** @type {string} */ tag, /** @type {string} */ key) => makeRng(`${s.season.seed}|wm|${tag}|${key}`);
const seasonN = (/** @type {any} */ s) => (s.season && s.season.n) || 1;
export const actLedgerFor = (/** @type {any} */ s) => (FLAGS.activities && s.econ && s.econ.act ? actLedger(s) : []);

// ---------------------------------------------------------------- match day: Hype dial, Toss, Pep
/** The Hype dial for this fixture's match day (Fans, activity ledger, tree). @param {any} s */
export function hypeDialOf(s) { return hypeDialFor(s.econ ? s.econ.fans : 0, actLedgerFor(s), modsFor(effective(s), 'hype')); }
export const tossWheelOf = (/** @type {any} */ s) => revealWheel('toss', modsFor(effective(s), 'toss'));
export const pepWheelOf = (/** @type {any} */ s) => revealWheel('pep', modsFor(effective(s), 'pep'));

/** Is this wheel of the match day already spun? @param {any} s @param {'hype'|'toss'|'pep'} which */
export const mdSpun = (s, which) => !!(s && s.fixture && s.fixture.md && s.fixture.md.wm && s.fixture.md.wm[which]);

/** Command guard: the match-day screen is open with a rolled day and this wheel is not spun yet. @param {any} s @param {string} which */
export const canMdSpin = (s, which) => on() && FLAGS.matchday && !!s.season && !!s.fixture && s.stage === 'matchday' && !!s.fixture.md && !mdSpun(s, /** @type {any} */ (which));

/**
 * Resolve one match-day wheel and write it to fixture.md (+ recordSpin). stop: see stopOf. No stage guard (settleMd uses it too).
 * md fields written: hype/hypeIdx/hypeFanMult/hypePerf, toss/tossBoost, pepSlot/pepSlots, wm.<which> = the shown result.
 * @param {any} s @param {'hype'|'toss'|'pep'} which @param {boolean|{t:number,phi?:number,e?:number}} stop @param {any[]} [six]
 */
export function mdSpin(s, which, stop, six) {
  const n = clone(s), m = n.fixture.md; m.wm = { ...(m.wm || {}) };
  const rng = rngFor(n, which, fixtureKey(n)), eff = effective(n);
  let opts = {};
  if (which === 'hype') { const w = hypeDialOf(n); mdWrite(n, 'hype', { ...dialResult(rng, w, stop), wheel: w }); }
  else if (which === 'toss') { const w = revealWheel('toss', modsFor(eff, 'toss')), r = revealResult(rng, w); mdWrite(n, 'toss', { ...r, wheel: w }); opts = { sportSlice: r.id === 'sport' }; }
  else { const w = revealWheel('pep', modsFor(eff, 'pep')); mdWrite(n, 'pep', { ...revealResult(rng, w), wheel: w }, six); }
  return recordSpin(n, which, opts);
}
/** Write one match-day result into n.fixture.md (mutates n, a clone): the match fields + md.wm.<which> = the shown result, with .src = the whole result and its wheel (wa1: a token reads it). @param {any} n @param {'hype'|'toss'|'pep'} which @param {any} r @param {any[]} [six] */
function mdWrite(n, which, r, six) {
  const m = n.fixture.md, tok = { ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) };
  if (which === 'hype') {
    m.hype = r.level; m.hypeIdx = r.levelIdx; m.hypeFanMult = r.fanMult; m.hypePerf = r.perf;
    m.wm.hype = { index: r.index, level: r.level, pts: r.pts, boosted: r.boosted, ...tok };
  } else if (which === 'toss') {
    const tb = +(r.fx && r.fx.tossb) || 0;
    m.toss = r.id === 'won' ? 'won' : 'lost'; m.tossBoost = tb / 100;
    m.wm.toss = { index: r.id === 'won' ? 0 : 1, id: r.id, boostPct: tb, ...tok };
  } else {
    const sl = pepSlotsOf(r); r = { ...r, slots: sl };
    m.pepSlots = sl.slice(); m.pepSlot = sl[0];
    const ids = six || (n.clubs && n.clubs[0] ? n.clubs[0].six : []);
    m.pepIds = r.slots.map((/** @type {number} */ x) => (ids[x - 1] != null ? ids[x - 1] : null)).filter((/** @type {any} */ x) => x != null); m.pepId = m.pepIds.length ? m.pepIds[0] : null;
    m.wm.pep = { index: r.slots[0] - 1, slots: r.slots.slice(), id: r.id, ...tok, src: { ...tok.src, slots: r.slots.slice() } };
  }
}

/** Pep players from a result: its slots, topped up to fx.pep (a token Nudge onto the double slice says 2 players but keeps the old slot list; the next free slot joins). @param {any} r */
export function pepSlotsOf(r) {
  const want = Math.max(1, Math.min(6, +(r.fx && r.fx.pep) || (r.slots || []).length || 1)), sl = (r.slots && r.slots.length ? r.slots : [r.slot || 1]).slice(0, want);
  while (sl.length < want) { let k = (sl[sl.length - 1] % 6) + 1; while (sl.includes(k)) k = (k % 6) + 1; sl.push(k); }
  return sl;
}
// ---------------------------------------------------------------- wa1 tokens on Hype / Toss / Pep / Scout / Finals (core enforces every rule and cap)
/** Separate token stream (never the match ball stream): `seed|wm|tok|<wheel>|<key>|<kind>|<n used on this result>`. */
const tokRng = (/** @type {any} */ s, /** @type {string} */ wheel, /** @type {string} */ key, /** @type {string} */ kind, /** @type {number} */ n) => makeRng(`${s.season.seed}|wm|tok|${wheel}|${key}|${kind}|${n}`);
/** The source result a token works on (with .wheel), or null. @param {any} s @param {string} wheel */
function tokSrc(s, wheel) {
  if (!on() || !s || !s.season) return null;
  if (wheel === 'hype' || wheel === 'toss' || wheel === 'pep') { const w = s.fixture && s.fixture.md && s.fixture.md.wm && s.fixture.md.wm[wheel]; return w && w.src ? w.src : null; }
  if (wheel === 'scout') return s.scoutSpin && s.scoutSpin.n === seasonN(s) && s.scoutSpin.src ? s.scoutSpin.src : null;
  if (wheel === 'finals') return s.fixture && s.finalsSpin && s.finalsSpin.key === finalsKey(s) && s.finalsSpin.src ? s.finalsSpin.src : null;
  return null;
}
const ctxOf = (/** @type {any} */ s, /** @type {string} */ wheel) => (wheel === 'hype' || wheel === 'toss' || wheel === 'pep' ? { matchKey: matchKeyOf(s) } : {});
/** Can a token be used on this wheel's waiting result now? (screen still open, result not collected). @param {any} s @param {string} wheel */
export function canWmToken(s, wheel) {
  if (!tokSrc(s, wheel)) return false;
  if (wheel === 'hype' || wheel === 'toss' || wheel === 'pep') return !!FLAGS.matchday && s.stage === 'matchday' && !!s.fixture && !!s.fixture.md;
  if (wheel === 'scout') return canSign(s).ok;
  if (wheel === 'finals') return s.stage === 'done';
  return false;
}
/** The token buttons for a wheel's waiting result: [{kind,label,count,left,match}] (left = uses left this season on this wheel, match = 1-a-match-day wheel). [] when none. @param {any} s @param {string} wheel */
export function wmTokens(s, wheel) {
  if (!canWmToken(s, wheel)) return [];
  const src = tokSrc(s, wheel), ctx = ctxOf(s, wheel), tl = tokenLeft(s, wheel, ctx), pool = (s.wheelMeta && s.wheelMeta.tokens) || {};
  return tokenOptions(s, wheel, src, ctx).map((o) => ({ kind: o.kind, label: o.label, count: pool[o.src] | 0, ...(tl.wheelLeft != null ? { left: tl.wheelLeft } : {}), ...(tl.matchLeft != null ? { match: true } : {}) }));
}
/**
 * UseToken {wheel:'hype'|'toss'|'pep'|'scout'|'finals', kind, stop?|careful?}: core useToken on the waiting result, then the kept result is written back
 * (match day: md fields the match reads; Scout: s.scoutSpin; Finals: the prize, paying only the difference). Not allowed = the same s.
 * @param {any} s @param {any} p
 */
export function wmUseToken(s, p) {
  const wheel = p && p.wheel, kind = p && p.kind;
  if (typeof kind !== 'string' || !canWmToken(s, wheel)) return s;
  const src = tokSrc(s, wheel), n0 = (src.used || []).length, ctx = ctxOf(s, wheel);
  const key = wheel === 'scout' ? String(seasonN(s)) : wheel === 'finals' ? finalsKey(s) : ctx.matchKey;
  const stop = p.stop || p.careful ? stopOf(p) : undefined; // a re-spin on Hype: the player's STOP if sent, else a careful synthetic tap (core default)
  const r = useToken(s, wheel, kind, src, tokRng(s, wheel, key, kind, n0), stop, ctx);
  if (!r || r.s === s || !r.pending) return s;
  const n = clone(r.s), q = r.pending;
  if (wheel === 'hype' || wheel === 'toss' || wheel === 'pep') { n.fixture.md.wm = { ...(n.fixture.md.wm || {}) }; mdWrite(n, wheel, q, n.clubs && n.clubs[0] ? n.clubs[0].six : []); return n; }
  if (wheel === 'scout') { n.scoutSpin = scoutRow(s, q); return n; }
  const was = n.finalsSpin, row = finalsRow(s, q), d = { coins: row.coins - was.coins, tp: row.tp - was.tp, fans: row.fans - was.fans, medal: row.medal - was.medal };
  if (n.econ) {
    n.econ.coins += d.coins; n.econ.fans += d.fans; n.econ.medals = (n.econ.medals | 0) + d.medal;
    const L = n.econ.ledger || []; for (let i = L.length - 1; i >= 0; i--) if (L[i].k === 'finalsprize') { L[i] = { ...L[i], coins: row.coins, tp: row.tp, fans: row.fans, medals: row.medal }; break; } // the prize row says what was really paid
  }
  if (d.tp && n.training) { n.training.tp += d.tp; if (n.season) n.season.tpWon += d.tp; }
  n.finalsSpin = row;
  return n;
}

/** The upgrades switch went On while this match day was open: rolls the player already saw (Off-mode cards) are kept as the stored result, never re-spun. No Spokes (nothing was spun). @param {any} s @param {string[]} which */
export function mdKeep(s, which) {
  if (!on() || !FLAGS.matchday || !s || !s.season || !s.fixture || s.stage !== 'matchday' || !s.fixture.md) return s;
  const list = (which || []).filter((w) => (w === 'hype' || w === 'toss' || w === 'pep') && !mdSpun(s, /** @type {any} */ (w)));
  if (!list.length) return s;
  const n = clone(s), m = n.fixture.md; m.wm = { ...(m.wm || {}) };
  for (const w of list) {
    if (w === 'hype') { const d = hypeDialOf(n), i = Math.max(0, d.slices.findIndex((c) => c.level === m.hype)); m.wm.hype = { index: i, level: m.hype, pts: d.slices[i] ? d.slices[i].pts : 0, boosted: false, kept: true }; }
    else if (w === 'toss') m.wm.toss = { index: m.toss === 'won' ? 0 : 1, id: m.toss === 'won' ? 'won' : (+m.tossBoost > 0 ? 'sport' : 'lost'), boostPct: Math.round((+m.tossBoost || 0) * 1000) / 10, kept: true };
    else { const sl = m.pepSlots && m.pepSlots.length ? m.pepSlots.slice() : [m.pepSlot | 0 || 1]; m.wm.pep = { index: sl[0] - 1, slots: sl, id: 'kept', kept: true }; }
  }
  return n;
}

/** Match start: any of the three wheels not yet spun gets a random tap (the game never blocks). Makes the md if there is none. @param {any} s @param {(s:any, six:any[])=>any} mdFor */
export function settleMd(s, mdFor) {
  if (!on() || !FLAGS.matchday || !s || !s.season || !s.fixture) return s;
  let t = s;
  if (!t.fixture.md) { const md = mdFor(t, t.clubs[0].six); if (!md) return s; t = { ...t, fixture: { ...t.fixture, md } }; }
  for (const w of /** @type {const} */ (['hype', 'toss', 'pep'])) if (!mdSpun(t, w)) t = mdSpin(t, w, false, t.clubs[0].six);
  return t;
}

/** Control feel props for a dial / reel: guide tick, Aim Zone seconds, Gold Chime (feel only on the reveal wheels). @param {any} s @param {string} w */
export function ctlOf(s, w) {
  const x = effective(s)[w] || {};
  return { guide: !!x.guide, ...(+x.zone > 0 ? { zone: +x.zone } : {}), ...(x.chime ? { chime: true } : {}) };
}
/** The three spin widgets for the match-day screen. null with the flag off or no md. pending = the stored result (or null). @param {any} s */
export function mdSpinVM(s) {
  if (!on() || !FLAGS.matchday || !s.fixture || !s.fixture.md || !s.season) return null;
  const md = s.fixture.md, wm = md.wm || {};
  const d = wm.hype && wm.hype.src && wm.hype.src.wheel ? wm.hype.src.wheel : hypeDialOf(s); // the dial that was spun (a token re-spins that one)
  const slices = d.slices.map((/** @type {any} */ c) => ({ label: HYPE_LABEL[/** @type {'low'} */ (c.level)], sub: '+' + c.pts + '%', w: c.w, gold: !!c.gold }));
  const hp = wm.hype ? { index: wm.hype.index, jackpot: wm.hype.level === 'nuts', level: wm.hype.level, pts: wm.hype.pts, lifted: !!wm.hype.lifted } : null;
  const sixN = [0, 1, 2, 3, 4, 5].map((i) => ({ label: String(i + 1), w: 1 }));
  return {
    hype: { slices, pending: hp, ...ctlOf(s, 'hype'), ...(d.V ? { V: d.V } : {}), ...(d.J != null ? { J: d.J } : {}), tokens: wmTokens(s, 'hype'), spun: !!wm.hype },
    toss: { slices: COIN_FACES.map((c) => ({ ...c })), pending: wm.toss ? { index: wm.toss.index, boostPct: wm.toss.boostPct, sport: wm.toss.id === 'sport', lifted: !!wm.toss.lifted } : null, ...ctlOf(s, 'toss'), tokens: wmTokens(s, 'toss'), spun: !!wm.toss },
    pep: { slices: sixN, pending: wm.pep ? { index: wm.pep.index, slots: wm.pep.slots.slice(), lifted: !!wm.pep.lifted } : null, ...ctlOf(s, 'pep'), tokens: wmTokens(s, 'pep'), spun: !!wm.pep },
  };
}

// ---------------------------------------------------------------- Find big wheel (fan activity; wa1 slice A, agent "find")
const WORD = { coins: 'Coins', player: 'Player', coach: 'Coach', nothing: 'Nothing' };
const rowOf = (/** @type {string} */ id) => ACT.TABLE.find((r) => r.id === id) || null;
/** The Find big wheel for activity `id` with the tree (Widener, Sharp Eyes, Extra Gold, Booster, Second Cheer; Control: Slow, Steady, Guide). @param {any} s @param {string} id */
export const findWheelOf = (/** @type {any} */ s, /** @type {string} */ id) => { const row = rowOf(id); if (!row) return null; const E2 = effective(s); return findWheel(row, modsFor(E2, 'find'), E2.find || {}); };
export const findReelOf = findWheelOf; // old name (wa1: Find is a big wheel now)
const findKey = (/** @type {any} */ s, /** @type {string} */ id) => `${roundKey(s)}|${id}`;
const actRngOf = (/** @type {any} */ s) => makeRng(`${String(s.season.seed).replace(/\|s\d+$/, '')}|act|${roundKey(s)}|${s.salt}`); // the same stream commands.js pickAct uses

/** What the wheel decided for picking activity `id` now: {find, kind, bonus, index, pity, boosted, second, prevAct} or null (flag off, repeat week, rest, refused). @param {any} s @param {string} id @param {any} p */
export function findForce(s, id, p) {
  if (!on() || !s.season || !s.econ) return null;
  const o = activityOptions(s), line = o.rows.find((r) => r.id === id), wheel = findWheelOf(s, id);
  if (!o.open || !line || !line.ok || line.repeat || !wheel) return null;
  const rng = rngFor(s, 'find', findKey(s, id)), prevAct = s.econ.act ? clone(s.econ.act) : null;
  if (o.pity) { const r = pityFind(rng, wheel); return { find: true, kind: r.type, bonus: 0, index: r.index, pity: true, boosted: false, second: false, prevAct }; }
  const r = findWheelResult(rng, wheel, stopOf(p));
  return { find: r.find, kind: r.type, bonus: r.coinsBonus || 0, index: r.index, pity: false, boosted: r.boosted, second: r.second, prevAct };
}
/** findSpin from the state right after a pick (what was really paid: a Player / Coach cell can fall back to Coins; read from the activity history). */
function findSpinOf(/** @type {any} */ n, /** @type {any} */ key, /** @type {string} */ id, /** @type {any} */ force, /** @type {any} */ extra) {
  const h = n.econ && n.econ.act && n.econ.act.hist && n.econ.act.hist[0], real = h && h.id === id && h.find && typeof h.find === 'object' ? h.find : null;
  const bonus = real && real.type === 'coins' ? (force.bonus | 0) : 0;
  return { key, id, index: force.index, type: real ? real.type : 'none', find: !!real, coins: real && real.type === 'coins' ? (real.coins | 0) + bonus : 0, bonus, pity: !!force.pity, boosted: !!force.boosted, second: !!force.second,
    ...(real ? {} : { prevAct: force.prevAct || null }), ...extra };
}
/** After pickActivity: tally + the pending wheel result kept on s.findSpin. @param {any} s @param {string} id @param {any} force */
export function afterFind(s, id, force) {
  const n = clone(recordSpin(s, 'find'));
  n.findSpin = findSpinOf(n, roundKey(s), id, force, {});
  return n;
}
/** The pending Find as core's token API reads it ({wheel, index, find, type}). null when no token can apply (no pick this round, a find, already paid on). @param {any} s */
function findPending(s) {
  const fs = s.findSpin; if (!on() || !fs || !s.econ || fs.key !== roundKey(s) || fs.find || fs.pity) return null;
  const h = s.econ.act && s.econ.act.hist && s.econ.act.hist[0]; if (!h || h.id !== fs.id || h.find || !h.rolled) return null;
  const wheel = findWheelOf(s, fs.id); if (!wheel) return null;
  // wa1 find2: every find cell counts as gold for the token guards (no Nudge onto a find = no sure find from Nothing); the spin itself uses the plain wheel
  return { wheel: { ...wheel, golds: wheel.finds.slice() }, index: fs.index, find: false, type: null, ...(fs.used ? { used: fs.used } : {}) };
}
/** Token offers on the pending Find (empty unless a no-find is waiting this round; core rules: cap 2 a season, no Lift on Find). @param {any} s */
export function findTokens(s) { const p = findPending(s); return p && WMF.tokenOptions ? WMF.tokenOptions(s, 'find', p, {}) || [] : []; }
/**
 * UseToken {wheel:'find', kind, stop?}: a token on this round's no-find. Re-spin / Pick Two re-spin the same wheel (Second Cheer and Booster too),
 * Nudge steps one cell. A new find replaces the pending result before it is paid: the no-find pick is undone (cost, Fans, ledger row, activity record)
 * and the pick runs again with the find forced (same activity stream as PickActivity). Same state when not allowed.
 * @param {any} s @param {any} p
 */
export function useFindToken(s, p) {
  const pend = findPending(s); if (!pend || !p || typeof p.kind !== 'string' || !WMF.useToken) return s;
  const fs = s.findSpin, wheel = findWheelOf(s, fs.id) || pend.wheel, used = fs.tokUsed | 0, stop = p.stop && typeof p.stop === 'object' && Number.isFinite(p.stop.t) ? { t: p.stop.t, phi: p.stop.phi, e: p.stop.e } : p.careful === undefined ? true : !!p.careful;
  const ctx = { spin: (/** @type {any} */ rng, /** @type {any} */ st) => ({ wheel, ...findWheelResult(rng, wheel, st) }) };
  const r = WMF.useToken(s, 'find', p.kind, pend, rngFor(s, 'findtok', `${findKey(s, fs.id)}|${p.kind}|${used}`), stop, ctx);
  if (!r || !r.pending || r.s === s) return s;
  const q = r.pending, cell = wheel.cells[q.index] || null, find = !!(cell && cell.find) || q.find === true, type = q.type || (find && cell ? cell.type : null);
  const extra = { tokUsed: used + 1, ...(q.used ? { used: q.used } : {}) };
  if (!find) { const n = clone(r.s); n.findSpin = { ...fs, index: q.index, second: !!q.second, ...extra }; return n; }
  // undo the no-find pick, then pick again with the find forced
  const n = clone(r.s), e = n.econ, h = e.act.hist[0];
  e.coins += h.coins | 0; e.fans -= h.fans | 0;
  const li = e.ledger.length - 1; if (li >= 0 && e.ledger[li].k === 'act' && e.ledger[li].id === fs.id) e.ledger.pop();
  if (fs.prevAct) e.act = clone(fs.prevAct); else delete e.act;
  const force = { find: true, kind: type, bonus: q.coinsBonus | 0, index: q.index, pity: false, boosted: !!q.boosted, second: !!q.second };
  const t = pickActFind(n, fs.id, actRngOf(n), force);
  if (t === n) return s;
  const out = clone(t); out.findSpin = findSpinOf(out, fs.key, fs.id, force, extra);
  return out;
}
/** Big-wheel props for one activity's Find (before the pick) + the stored result of the pick just made. null with the flag off / a repeat week. @param {any} s @param {string} id */
export function findSpinVM(s, id) {
  if (!on() || !s.season || !s.econ) return null;
  const w = findWheelOf(s, id); if (!w) return null;
  // labels: one word per block (on its widest cell), Nothing gaps unlabelled when small
  const labels = w.cells.map((c) => { if (!c.find) return c.w >= 1.2 ? 'Nothing' : ''; const bc = w.cells.filter((x) => x.block === c.block), top = bc.reduce((a, b) => (b.w > a.w ? b : a), bc[0]); return top === c ? 'Find' : ''; });
  const cells = w.cells.map((c) => ({ label: WORD[c.type], w: c.w, find: c.find, tone: c.find ? c.type : 'none', block: c.block }));
  const fs = s.findSpin && s.findSpin.id === id && s.findSpin.key === roundKey(s) ? s.findSpin : null, E2 = effective(s), X = E2.find || {};
  const left = WMF.tokenLeft ? WMF.tokenLeft(s, 'find', {}) : null;
  return { slices: w.slices.slice(), widths: w.widths.slice(), jackpotIndex: w.jackpotIndex, golds: w.finds.slice(), aims: w.aims.slice(), phys: { ...w.phys }, labels, cells,
    guide: !!X.guide, zone: +X.zone || 0, chime: !!X.chime,
    pending: fs ? { index: fs.index, type: fs.type, find: fs.find, coins: fs.coins | 0, bonus: fs.bonus | 0, pity: fs.pity, second: !!fs.second, jackpot: !!fs.find, used: fs.used || [] } : null,
    tokens: fs ? findTokens(s).map((o) => ({ kind: o.kind, label: o.label })) : [], tokLeft: left && left.wheelLeft != null ? left.wheelLeft : null,
    pityNext: activityOptions(s).pity };
}

// ---------------------------------------------------------------- Scout list
/** Command guard for ScoutSpin: flag, the list is still open, not spun this season. @param {any} s @param {()=>any[]} list */
export const canScoutSpin = (s, list) => on() && !!s.season && !(s.scoutSpin && s.scoutSpin.n === seasonN(s)) && list().length > 0;
/** One Scout spin: stores s.scoutSpin {n,index,id,steps,extra} (scoutList in core/training.js reads it) + recordSpin. @param {any} s */
export function scoutSpin(s) {
  const w = revealWheel('scout', modsFor(effective(s), 'scout')), r = revealResult(rngFor(s, 'scout', String(seasonN(s))), w);
  const n = clone(recordSpin(s, 'scout'));
  n.scoutSpin = scoutRow(s, { ...r, wheel: w });
  return n;
}
/** The stored Scout result (+ .src for a token). @param {any} s @param {any} r */
const scoutRow = (s, r) => ({ n: seasonN(s), index: r.index, id: r.id, steps: +r.fx.steps || 0, extra: +r.fx.extraName || 0, ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) });
/** Scout reveal props. spun = already spun this season. @param {any} s */
export function scoutSpinVM(s) {
  if (!on() || !s.season) return null;
  const w = revealWheel('scout', modsFor(effective(s), 'scout')), sp = s.scoutSpin && s.scoutSpin.n === seasonN(s) ? s.scoutSpin : null;
  const g = sp && sp.src && sp.src.wheel ? sp.src.wheel : w; // the wheel that was spun (a token re-spins that one)
  return { cells: g.slices.map((/** @type {any} */ c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), spun: !!sp, ...ctlOf(s, 'scout'), tokens: wmTokens(s, 'scout'),
    pending: sp ? { index: sp.index, steps: sp.steps, extra: sp.extra, jackpot: sp.id === 'top2', lifted: !!sp.lifted } : null };
}

// ---------------------------------------------------------------- Finals prize
const finalsKey = (/** @type {any} */ s) => `${seasonN(s)}|${s.fixture.kind}|${s.fixture.round}`;
/** Command guard for FinalsSpin: result screen of a semi or final, not spun for this fixture. @param {any} s */
export const canFinalsSpin = (s) => on() && !!s.season && !!s.fixture && s.stage === 'done' && (s.fixture.kind === 'semi' || s.fixture.kind === 'final') && !(s.finalsSpin && s.finalsSpin.key === finalsKey(s));
/** One Finals reel spin: pays Coins / TP / Fans / Medal now (ledger row), keeps s.finalsSpin for a reload, recordSpin. @param {any} s */
export function finalsSpin(s) {
  const w = revealWheel('finals', modsFor(effective(s), 'finals')), r = revealResult(rngFor(s, 'finals', finalsKey(s)), w);
  const n = clone(recordSpin(s, 'finals')), row = finalsRow(s, { ...r, wheel: w });
  const { coins, tp, fans, medal } = row;
  if (n.econ) {
    n.econ.coins += coins; n.econ.fans += fans; n.econ.medals = (n.econ.medals | 0) + medal;
    n.econ.ledger.push({ k: 'finalsprize', kind: n.fixture.kind, coins, tp, fans, medals: medal });
    if (n.econ.ledger.length > E.LEDGER_MAX) n.econ.ledger.splice(0, n.econ.ledger.length - E.LEDGER_MAX);
  }
  if (tp && n.training) { n.training.tp += tp; if (n.season) n.season.tpWon += tp; }
  n.finalsSpin = row;
  return n;
}
/** The stored Finals prize (+ .src for a token). @param {any} s @param {any} r */
function finalsRow(s, r) {
  const fx = r.fx || {};
  return { key: finalsKey(s), index: r.index, id: r.id, label: r.label, coins: fx.coins | 0, tp: fx.tp | 0, fans: fx.fans | 0, medal: fx.medal | 0, ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) };
}
/** Finals reveal props for the result screen. due = a semi/final result is showing and the prize is not spun. null otherwise. @param {any} s */
export function finalsSpinVM(s) {
  if (!on() || !s.season || !s.fixture || s.stage !== 'done' || (s.fixture.kind !== 'semi' && s.fixture.kind !== 'final')) return null;
  const fs = s.finalsSpin && s.finalsSpin.key === finalsKey(s) ? s.finalsSpin : null, w = fs && fs.src && fs.src.wheel ? fs.src.wheel : revealWheel('finals', modsFor(effective(s), 'finals'));
  return { due: !fs, cells: w.slices.map((/** @type {any} */ c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), ...ctlOf(s, 'finals'), tokens: wmTokens(s, 'finals'),
    pending: fs ? { index: fs.index, label: fs.label, coins: fs.coins, tp: fs.tp, fans: fs.fans, medal: fs.medal, jackpot: fs.medal > 0, lifted: !!fs.lifted } : null };
}
