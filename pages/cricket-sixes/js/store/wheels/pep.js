// @ts-check
// Pep reveal in the store (S0 Z1, owner T3).
import { effective } from '../../core/wheelmeta.js';
import { revealWheel } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';

export const pepWheelOf = (/** @type {any} */ s) => revealWheel('pep', modsFor(effective(s), 'pep'));

/** Pep players from a result: its slots, topped up to fx.pep (a token Nudge onto the double slice says 2 players but keeps the old slot list; the next free slot joins). @param {any} r */
export function pepSlotsOf(r) {
  const want = Math.max(1, Math.min(6, +(r.fx && r.fx.pep) || (r.slots || []).length || 1)), sl = (r.slots && r.slots.length ? r.slots : [r.slot || 1]).slice(0, want);
  while (sl.length < want) { let k = (sl[sl.length - 1] % 6) + 1; while (sl.includes(k)) k = (k % 6) + 1; sl.push(k); }
  return sl;
}
