// @ts-check
/* wheels/shared: helpers shared by the wheel openers (split from wm-spins.js). */
import { normLook, colourOf, matOf } from '../wheel-look.js';

/** craftLook ranks -> the {rim, hub, needle} colours the dial / reel take. Missing = skin palette. */
export function dialLook(look) {
  const n = normLook(look); if (!n) return undefined;
  const o = {}, rim = colourOf(n.rim) || (n.material ? matOf(n.material).rim : null), hub = colourOf(n.hub), nd = colourOf(n.ptr);
  if (rim) o.rim = rim; if (hub) o.hub = hub; if (nd) o.needle = nd;
  return o;
}
/** Reveal length (s): the base over the wheel match Dev otherMult (vm.speedMult, only present when Dev changes it), so x2 plays twice as fast. Pure. */
export const revealT = (base, v) => base / ((v && +v.speedMult > 0) ? +v.speedMult : 1);
export const stopOf = (s) => (s && Number.isFinite(s.t) ? { stop: { t: s.t, phi: s.phi, e: s.e } } : {});
/** wa1: the token + Control props every dial / reel takes from its VM piece (get() -> {tokens, guide, zone, chime, V, J}). wheel = the UseToken wheel id. */
export function tokProps(get, dispatch, wheel, name) {
  const v = get() || {};
  return { tokens: v.tokens || [], getTokens: () => (get() || {}).tokens || [], onToken: (kind) => dispatch('UseToken', { wheel, kind }), tokName: name, guide: !!v.guide,
    ...(v.zone ? { zone: v.zone } : {}), ...(v.chime ? { chime: true } : {}), ...(v.V ? { V: v.V } : {}), ...(v.J != null ? { J: v.J } : {}) };
}
/** wa1: the value a token compares, per wheel (mirrors core tokenValue on the VM's pending shape) and the short words for the outcome line. */
export const TOKVAL = {
  hype: (p) => +p.pts || 0, toss: (p) => +p.boostPct || 0, pep: (p) => (p.slots || [0]).length, scout: (p) => +p.steps || 0,
  finals: (p) => (p.coins | 0) + (p.tp | 0) + (p.fans | 0) + 60 * (p.medal | 0),
};
