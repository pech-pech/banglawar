// Kind Floor (Spotlight perk, T2). SPEC section 3 [D], 06-OPEN-ITEMS item 1.
// The seven x1.0 pieces (lowest tier) pay and print x1.2. Never touches gold; never inverts the ladder.
// Pure: no DOM, no store, no RNG.
export const KIND_FLOOR_SPOT = 0.2;          // default, one rung (x1.0 -> x1.2)
export const KIND_FLOOR_SPOT_FALLBACK = 0.1; // fallback if the 1.30 careful band is strict (1.30 / 1.41 / 1.59)

const fmt = (v) => 'x' + String(Math.round(v * 100) / 100);

// slices: SliceRow[] ({id,w,value,label,tier,gold}); owned: bool. Returns a NEW ring; input untouched.
export function applyKindFloor(slices, owned, spot = KIND_FLOOR_SPOT) {
  const ring = slices.map((s) => ({ ...s }));
  if (!owned || !ring.length) return ring;
  const nonGold = ring.filter((s) => !s.gold);
  if (!nonGold.length) return ring;
  const low = Math.min(...nonGold.map((s) => s.value));
  // ceiling: the floor may never pass the next rung above it (equal allowed, never above)
  const above = nonGold.map((s) => s.value).filter((v) => v > low);
  const ceil = above.length ? Math.min(...above) : Infinity;
  const lifted = Math.min(Math.round((low + spot) * 1e6) / 1e6, ceil);
  for (const s of ring) {
    if (s.gold || s.value !== low) continue;
    s.value = lifted;
    s.label = fmt(lifted);
  }
  return ring;
}

// Course: the +1 pieces pay +2 (one rung, the 03-GAPS / 2026-11-14 literal mapping: Kind Floor = +1 unit on the lowest tier;
// gaps_sim TT.FLOOR_UNIT course 1, which the SPEC 11c Course 3.76 / 75% gold is simmed with). Only Spotlight gets the +0.2x fix (SPEC 2i).
export const KIND_FLOOR_COURSE = 1;
const FLOOR_OF = /** @type {Record<string, number>} */ ({ spot: KIND_FLOOR_SPOT, course: KIND_FLOOR_COURSE });

/**
 * The pay rule on one landing (wheelmeta afterResult / token re-spins call it; effective(s)[wheelId].kindFloor is `owned`).
 * value = the landed slice value; wheel = the spun wheel ({slices, golds?, jackpotIndex?}). The lowest non-gold value lifts by the
 * wheel's floor (Spotlight +0.2x, Course +1 step), never above the next rung up, never on a gold landing. Other wheels: unchanged.
 * @param {string} wheelId @param {{slices:number[], golds?:number[], jackpotIndex?:number}} wheel @param {number} index @param {number} value @param {any} owned
 */
export function kindFloorGain(wheelId, wheel, index, value, owned) {
  const add = FLOOR_OF[wheelId];
  if (!owned || !add || !wheel || !Array.isArray(wheel.slices)) return value;
  const golds = wheel.golds || [wheel.jackpotIndex || 0];
  if (golds.includes(index)) return value;
  const ng = wheel.slices.filter((_v, i) => !golds.includes(i)); if (!ng.length) return value;
  const low = Math.min(...ng); if (value !== low) return value;
  const above = ng.filter((v) => v > low), ceil = above.length ? Math.min(...above) : Infinity;
  return Math.min(Math.round((low + add) * 1e6) / 1e6, ceil);
}

// Pay step: value is the landed slice value. Skipped on a gold landing.
// Only the lowest rung (x1.0) lifts, clamped at the next rung up (x1.2) so the ladder never inverts.
// ceil: optional next-rung value (default 1.2, SPEC section 3).
export function kindFloorPay(value, isGold, owned, spot = KIND_FLOOR_SPOT, ceil = 1.2) {
  if (!owned || isGold || value !== 1.0) return value;
  return Math.min(Math.round((1 + spot) * 1e6) / 1e6, ceil);
}
