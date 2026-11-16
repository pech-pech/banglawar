// @ts-check
// Match day in the store: the shared spin of Hype dial, Toss and Pep (S0 Z1, owner T3). Every roll is seeded `<season seed>|wm|<wheel>|<key>`.
import { FLAGS } from '../../data/flags.js';
import { effective, recordSpin, otherMultOf } from '../../core/wheelmeta.js';
import { recordStop, storedStop, statsOf, spinKeyOf as stopKeyOf } from '../../core/wheel-stops.js';
import { matchDayIdOf } from '../../core/spin-keys.js';
import { wobbleKey } from '../../core/wheel-wobble.js';
import { dialResult, hypeRing, hypeAtStop } from '../../core/wheels/hype.js';
import { hypeOdds } from '../../core/matchday.js';
import { tossRing, tossAtStop } from '../../core/wheels/toss.js';
import { pepRing, pepAtStop } from '../../core/wheels/pep.js';
import { revealWheel, revealResult } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';
import { clone, on, fixtureKey, rngFor, wmTokensOf, ctlOf, actLedgerFor, otherSpeed } from './common.js';
import { hypeDialOf } from './hype.js';
import { pepSlotsOf } from './pep.js';

const HYPE_LABEL = { low: 'Quiet', med: 'Good', high: 'Big', nuts: 'Wild' };
const COIN_FACES = [{ label: 'Won toss', w: 1 }, { label: 'Good sport', w: 1 }];

/** Is this wheel of the match day already spun? @param {any} s @param {'hype'|'toss'|'pep'} which */
export const mdSpun = (s, which) => !!(s && s.fixture && s.fixture.md && s.fixture.md.wm && s.fixture.md.wm[which]);

/** Command guard: the match-day screen is open with a rolled day and this wheel is not spun yet. @param {any} s @param {string} which */
export const canMdSpin = (s, which) => on() && FLAGS.matchday && !!s.season && !!s.fixture && s.stage === 'matchday' && !!s.fixture.md && !mdSpun(s, /** @type {any} */ (which));

/**
 * Resolve one match-day wheel and write it to fixture.md (+ recordSpin). stop: see stopOf. No stage guard (settleMd uses it too).
 * md fields written: hype/hypeIdx/hypeFanMult/hypePerf, toss/tossBoost, pepSlot/pepSlots, wm.<which> = the shown result.
 * @param {any} s @param {'hype'|'toss'|'pep'} which @param {boolean|{t:number,phi?:number,e?:number}} stop @param {any[]} [six] @param {boolean} [auto] settleMd stops
 */
export function mdSpin(s, which, stop, six, auto) {
  const n = clone(s), m = n.fixture.md; m.wm = { ...(m.wm || {}) };
  const rng = rngFor(n, which, fixtureKey(n)), eff = effective(n);
  let opts = {};
  const st = stop && typeof stop === 'object' && typeof /** @type {any} */ (stop).sliceId === 'number' ? /** @type {any} */ (stop) : null;
  if (st) { // T3 stop-resolved path: the result is decided at the landed ring slice
    const ring = mdRingOf(n, which);
    if (which === 'hype') { const mods = hypeModsOf(n); mdWrite(n, 'hype', { ...hypeAtStop(rng, ring, st, mods), ring, wheel: hypeDialOf(n) }); }
    else if (which === 'toss') { const mods = modsFor(eff, 'toss'), r = tossAtStop(rng, ring, st, mods); mdWrite(n, 'toss', { ...r, ring, wheel: revealWheel('toss', mods) }); opts = { sportSlice: r.id === 'sport' }; }
    else {
      const mods = modsFor(eff, 'pep'), off = pepOffsetOf(n), key = stopKeyOf(n, 'pep');
      n.wheels = { ...(n.wheels || {}), pepRingOffset: { ...((n.wheels && n.wheels.pepRingOffset) || {}), [key]: off } };
      mdWrite(n, 'pep', { ...pepAtStop(rng, ring, st, mods), ring, wheel: revealWheel('pep', mods) }, six);
    }
    recordStop(n, which, stopKeyOf(n, which), { stopT: st.stopT, cycle: st.cycle, tInCycle: st.tInCycle, sliceId: st.sliceId, value: ring[st.sliceId] && ring[st.sliceId].value, auto: !!auto, respin: st.respin | 0 });
    return recordSpin(n, which, opts);
  }
  if (which === 'hype') { const w = hypeDialOf(n); mdWrite(n, 'hype', { ...dialResult(rng, w, /** @type {any} */ (stop)), wheel: w }); }
  else if (which === 'toss') { const w = revealWheel('toss', modsFor(eff, 'toss')), r = revealResult(rng, w); mdWrite(n, 'toss', { ...r, wheel: w }); opts = { sportSlice: r.id === 'sport' }; }
  else { const w = revealWheel('pep', modsFor(eff, 'pep')); mdWrite(n, 'pep', { ...revealResult(rng, w), wheel: w }, six); }
  return recordSpin(n, which, opts);
}

/** The one place the match-day / spin key comes from (T1 spin-keys). @param {any} s */
const spinKeyOf = (s) => matchDayIdOf(s);
const hypeModsOf = (/** @type {any} */ s) => otherSpeed(modsFor(effective(s), 'hype'), s);
/** Pep ring offset 0..5: stored in wheels.pepRingOffset[key], else an int hash of the match key mod 6 (deterministic, so the vm agrees before it is stored). @param {any} s */
export function pepOffsetOf(s) {
  const key = spinKeyOf(s), v = s && s.wheels && s.wheels.pepRingOffset ? s.wheels.pepRingOffset[key] : undefined;
  if (Number.isFinite(v)) return /** @type {number} */ (v);
  let h = 0; for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return h % 6;
}
/** The ring rows of a match-day wheel (same mods the old path used). @param {any} s @param {'hype'|'toss'|'pep'} which */
export function mdRingOf(s, which) {
  const eff = effective(s);
  if (which === 'hype') return hypeRing(hypeModsOf(s), hypeOdds(s.econ ? s.econ.fans : 0, actLedgerFor(s)).t);
  if (which === 'toss') return tossRing(modsFor(eff, 'toss'));
  return pepRing(modsFor(eff, 'pep'), pepOffsetOf(s));
}
/** The pending index the wheel steers to: on the stop path (r.ring present) the ring slice id the wheel landed on, else the old coin-face / slot-1 index. @param {any} r @param {number} old */
const ringIdx = (r, old) => (Array.isArray(r.ring) && Number.isInteger(r.index) && r.index >= 0 && r.index < r.ring.length ? r.index : old);
/** Write one match-day result into n.fixture.md (mutates n, a clone): the match fields + md.wm.<which> = the shown result, with .src = the whole result and its wheel (wa1: a token reads it). @param {any} n @param {'hype'|'toss'|'pep'} which @param {any} r @param {any[]} [six] */
export function mdWrite(n, which, r, six) {
  const m = n.fixture.md, tok = { ...(r.used ? { used: r.used.slice() } : {}), ...(r.lifted ? { lifted: true } : {}), src: clone(r) };
  if (which === 'hype') {
    m.hype = r.level; m.hypeIdx = r.levelIdx; m.hypeFanMult = r.fanMult; m.hypePerf = r.perf;
    m.wm.hype = { index: r.index, level: r.level, pts: r.pts, boosted: r.boosted, ...tok };
  } else if (which === 'toss') {
    const tb = +(r.fx && r.fx.tossb) || 0;
    m.toss = r.id === 'won' ? 'won' : 'lost'; m.tossBoost = tb / 100;
    m.wm.toss = { index: ringIdx(r, r.id === 'won' ? 0 : 1), id: r.id, boostPct: tb, ...tok };
  } else {
    const sl = pepSlotsOf(r); r = { ...r, slots: sl };
    m.pepSlots = sl.slice(); m.pepSlot = sl[0];
    if (Number.isFinite(r.boostPct)) m.pepBoost = r.boostPct / 100; else delete m.pepBoost; // stop path: the landed slice's boost (fraction); old path: MD.PEP_BOOST
    const ids = six || (n.clubs && n.clubs[0] ? n.clubs[0].six : []);
    m.pepIds = r.slots.map((/** @type {number} */ x) => (ids[x - 1] != null ? ids[x - 1] : null)).filter((/** @type {any} */ x) => x != null); m.pepId = m.pepIds.length ? m.pepIds[0] : null;
    m.wm.pep = { index: ringIdx(r, r.slots[0] - 1), slots: r.slots.slice(), id: r.id, ...tok, src: { ...tok.src, slots: r.slots.slice() } };
  }
}

/** The upgrades switch went On while this match day was open: rolls the player already saw (Off-mode cards) are kept as the stored result, never re-spun. No Spokes (nothing was spun). @param {any} s @param {string[]} which */
export function mdKeep(s, which) {
  if (!on() || !FLAGS.matchday || !s || !s.season || !s.fixture || s.stage !== 'matchday' || !s.fixture.md) return s;
  const list = (which || []).filter((w) => (w === 'hype' || w === 'toss' || w === 'pep') && !mdSpun(s, /** @type {any} */ (w)));
  if (!list.length) return s;
  const n = clone(s), m = n.fixture.md; m.wm = { ...(m.wm || {}) };
  for (const w of list) {
    if (w === 'hype') { const d = hypeDialOf(n), i = Math.max(0, d.slices.findIndex((/** @type {any} */ c) => c.level === m.hype)); m.wm.hype = { index: i, level: m.hype, pts: d.slices[i] ? d.slices[i].pts : 0, boosted: false, kept: true }; }
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
  for (const w of /** @type {const} */ (['hype', 'toss', 'pep'])) if (!mdSpun(t, w)) t = mdSpin(t, w, false, t.clubs[0].six, true);
  return t;
}

export { ctlOf } from './common.js'; // S0: shared by T3 and T4, lives in common.js
/** The three spin widgets for the match-day screen. null with the flag off or no md. pending = the stored result (or null). @param {any} s */
export function mdSpinVM(s) {
  if (!on() || !FLAGS.matchday || !s.fixture || !s.fixture.md || !s.season) return null;
  const md = s.fixture.md, wm = md.wm || {};
  const d = wm.hype && wm.hype.src && wm.hype.src.wheel ? wm.hype.src.wheel : hypeDialOf(s); // the dial that was spun (a token re-spins that one)
  const slices = d.slices.map((/** @type {any} */ c) => ({ label: HYPE_LABEL[/** @type {'low'} */ (c.level)], sub: '+' + c.pts + '%', w: c.w, gold: !!c.gold }));
  const hp = wm.hype ? { index: wm.hype.index, jackpot: wm.hype.level === 'nuts', level: wm.hype.level, pts: wm.hype.pts, lifted: !!wm.hype.lifted } : null;
  const sixN = [0, 1, 2, 3, 4, 5].map((i) => ({ label: String(i + 1), w: 1 }));
  const pepRingV = mdRingOf(s, 'pep'), sixIds = (s.clubs && s.clubs[0] && s.clubs[0].six) || [];
  const stp = (w) => ({ stored: storedStop(s, w, spinKeyOf(s)), wobKey: wobbleKey(s, w, statsOf(s, w).n, 0) });
  return {
    hype: { ...stp('hype'), ring: mdRingOf(s, 'hype'), wheelId: 'hype', spinKey: spinKeyOf(s), slices, pending: hp, ...ctlOf(s, 'hype'), ...(d.V ? { V: d.V } : {}), ...(d.J != null ? { J: d.J } : {}), tokens: wmTokensOf(s, 'hype'), spun: !!wm.hype },
    toss: { ...stp('toss'), ring: mdRingOf(s, 'toss'), wheelId: 'toss', spinKey: spinKeyOf(s), slices: COIN_FACES.map((c) => ({ ...c })), pending: wm.toss ? { index: wm.toss.index, boostPct: wm.toss.boostPct, sport: wm.toss.id === 'sport', lifted: !!wm.toss.lifted } : null, ...ctlOf(s, 'toss'), tokens: wmTokensOf(s, 'toss'), spun: !!wm.toss },
    pep: { ...stp('pep'), ring: pepRingV, wheelId: 'pep', spinKey: spinKeyOf(s), boostPct: wm.pep && wm.pep.src && Number.isFinite(wm.pep.src.boostPct) ? wm.pep.src.boostPct : null, names: pepRingV.map((/** @type {any} */ r) => ({ slot: r.slot, id: sixIds[r.slot - 1] != null ? sixIds[r.slot - 1] : null })), slices: sixN, pending: wm.pep ? { index: wm.pep.index, slots: wm.pep.slots.slice(), boostPct: wm.pep.src && Number.isFinite(wm.pep.src.boostPct) ? wm.pep.src.boostPct : null, lifted: !!wm.pep.lifted } : null, ...ctlOf(s, 'pep'), tokens: wmTokensOf(s, 'pep'), spun: !!wm.pep },
  };
}
