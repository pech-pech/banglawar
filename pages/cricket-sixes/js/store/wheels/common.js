// @ts-check
// Shared store helpers for the per-wheel store files (S0 Z1 split of js/store/wmstore.js). Imports core only.
// Per-wheel store files import this file (and each other), never js/store/wmstore.js (the barrel + tokens), so there are no cycles.
import { FLAGS } from '../../data/flags.js';
import { makeRng } from '../../core/rng.js';
import { otherMultOf, effective } from '../../core/wheelmeta.js';
import { actLedger } from '../../core/activities.js';

export const clone = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));
export const on = () => !!FLAGS.wheelMeta;

/** The player's STOP from a command payload: {stop:{t,phi,e}} (the view), careful:true (synthetic careful tap), else a random tap. @param {any} p */
export function stopOf(p) {
  const o = p && p.stop;
  if (o && typeof o === 'object' && Number.isFinite(o.t)) return { t: o.t, phi: o.phi, e: o.e };
  return !!(p && p.careful);
}
export const fixtureKey = (/** @type {any} */ s) => `${s.fixture.kind}|${s.fixture.round}|${s.salt}`;
export const rngFor = (/** @type {any} */ s, /** @type {string} */ tag, /** @type {string} */ key) => makeRng(`${s.season.seed}|wm|${tag}|${key}`);
export const seasonN = (/** @type {any} */ s) => (s && s.season && s.season.n) || 1;
export const actLedgerFor = (/** @type {any} */ s) => (FLAGS.activities && s.econ && s.econ.act ? actLedger(s) : []);

/** Wheel match Dev otherMult on a mods / Control object's w0Mult (the Hype V and the Find W0 scale with it; Slow stacks). x1 = the same object. @param {any} m @param {any} s */
export const otherSpeed = (m, s) => { const om = otherMultOf(s); return om === 1 ? m : { ...m, w0Mult: (Number.isFinite(+m.w0Mult) && m.w0Mult != null ? +m.w0Mult : 1) * om }; };

// ---------------------------------------------------------------- token buttons hook
// The token functions stay in js/store/wmstore.js (A4.1 / T8 owner). The spin VMs need wmTokens(s, wheel); wmstore.js registers it here at load
// (setWmTokens) so the per-wheel files never import wmstore.js. Everything imports the store through wmstore.js, so the hook is always set first.
/** @type {(s:any, wheel:string) => any[]} */
let tokensHook = () => [];
/** wmstore.js only: register wmTokens. @param {(s:any, wheel:string) => any[]} fn */
export const setWmTokens = (fn) => { tokensHook = fn; };
/** The token buttons for a wheel's waiting result (= wmstore.js wmTokens). @param {any} s @param {string} wheel */
export const wmTokensOf = (s, wheel) => tokensHook(s, wheel);

/** Control feel props for a dial / reel: guide tick, Aim Zone seconds, Gold Chime (feel only on the reveal wheels). @param {any} s @param {string} w */
export function ctlOf(s, w) {
  const x = effective(s)[w] || {};
  const om = otherMultOf(s); // wheel match Dev: the reveal wheels (toss, pep, scout, finals) play faster / slower; x1 adds nothing
  return { guide: !!x.guide, ...(+x.zone > 0 ? { zone: +x.zone } : {}), ...(x.chime ? { chime: true } : {}), ...(om !== 1 && w !== 'hype' ? { speedMult: om } : {}) };
}
