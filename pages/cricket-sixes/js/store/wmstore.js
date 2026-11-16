// @ts-check
// Wheel meta w2 in the store: Hype dial, Toss and Pep reveals, Find reel, Scout and Finals reveals. Resolution + the plain data the views need.
// All of it is a no-op / null when FLAGS.wheelMeta is false (r9 behaviour). Every roll is seeded `<season seed>|wm|<wheel>|<key>`; never Math.random.
// Results are written to the state the moment the player taps (the view only animates to getPending()), so a reload shows the same result.
// Imports core only (commands.js and selectors.js both import this; it must not import them).
//
// S0 Z1: RE-EXPORT BARREL + the wa1 token functions (tokSrc, canWmToken, wmTokens, wmUseToken; A4.1 / T8 owner). The wheels live in js/store/wheels/:
// common.js (shared helpers), md.js (match-day spin: Hype / Toss / Pep), hype.js, toss.js, pep.js, find.js, scout.js, finals.js.
// Per-wheel files never import this file; wmTokens reaches their VMs through setWmTokens (wheels/common.js), registered below.
import { FLAGS } from '../data/flags.js';
import { makeRng } from '../core/rng.js';
import { tokenOptions, useToken, tokenLeft, matchKeyOf } from '../core/wheelmeta.js';
import { canSign } from '../core/training.js';
import { clone, on, seasonN, stopOf, setWmTokens } from './wheels/common.js';
import { mdWrite } from './wheels/md.js';
import { scoutRow } from './wheels/scout.js';
import { finalsKey, finalsRow } from './wheels/finals.js';

export { stopOf, actLedgerFor, otherSpeed } from './wheels/common.js';
export { hypeDialOf } from './wheels/hype.js';
export { tossWheelOf } from './wheels/toss.js';
export { pepWheelOf, pepSlotsOf } from './wheels/pep.js';
export { mdSpun, canMdSpin, mdSpin, mdKeep, settleMd, ctlOf, mdSpinVM } from './wheels/md.js';
export { findWheelOf, findReelOf, cheerLeft, findForce, afterFind, findTokens, useFindToken, findSpinVM } from './wheels/find.js';
export { canScoutSpin, scoutSpin, scoutSpinVM } from './wheels/scout.js';
export { canFinalsSpin, finalsSpin, finalsSpinVM } from './wheels/finals.js';

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
  return tokenOptions(s, wheel, src, ctx).map((/** @type {any} */ o) => ({ kind: o.kind, label: o.label, count: pool[o.src] | 0, ...(tl.wheelLeft != null ? { left: tl.wheelLeft } : {}), ...(tl.matchLeft != null ? { match: true } : {}) }));
}
setWmTokens(wmTokens); // the spin VMs in ./wheels/ read the token buttons through this hook
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
