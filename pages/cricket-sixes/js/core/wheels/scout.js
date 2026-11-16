// @ts-check
// Scout reveal kind hooks (S0 Z1, owner T4). Read by the dispatcher in ./reveal.js.
import { DR } from '../../data/dialreel.js';
import { SCOUT_SLICES } from '../../data/wheels/scout.js';

/** @type {{extraKey:string, tweak:(sl:any[], m:any)=>void, boost:(fx:any, v:number, d:number[])=>void}} */
export const REVEAL_KIND = {
  extraKey: 'steps',
  /** Scout's Eye: the low slice becomes Extra name +1 step. */
  tweak(sl, m) { if (m.sfloor) for (const s of sl) if (s.low) { s.fx.steps = Math.max(s.fx.steps || 0, 1); s.label = 'Extra name +1 step'; } },
  /** Booster: + value x Scout unit steps. */
  boost(fx, v) { fx.steps = (fx.steps || 0) + v * DR.UNIT.scout; },
};

// ---- new Scout wheel (SPEC 9, 11a): pure slice-table rules used by the store. T4.

/** A valid slice id (int 0..9) or -1. @param {any} x */
export const scoutSliceId = (x) => (Number.isInteger(x) && x >= 0 && x < SCOUT_SLICES.length ? x : -1);
/** Is this slice gold (no token offered)? @param {number} id */
export const scoutIsGold = (id) => !!(SCOUT_SLICES[id] && SCOUT_SLICES[id].gold);
/** Spin Again / Pick Two keep rule: the higher value, a tie keeps the first. @param {number} first slice id @param {number} second slice id */
export const scoutKeep = (first, second) => (SCOUT_SLICES[second].value > SCOUT_SLICES[first].value ? second : first);
/** Nudge target: a neighbouring slice (ring wraps) that is not gold with a strictly higher value; both qualify = higher value, then the first (equal widths). -1 = not offered. @param {number} id */
export function scoutNudge(id) {
  const n = SCOUT_SLICES.length, cur = SCOUT_SLICES[id]; if (!cur) return -1;
  const c = [(id + n - 1) % n, (id + 1) % n].filter((j) => !SCOUT_SLICES[j].gold && SCOUT_SLICES[j].value > cur.value);
  if (!c.length) return -1;
  return c.length === 2 && SCOUT_SLICES[c[1]].value > SCOUT_SLICES[c[0]].value ? c[1] : c[0];
}
