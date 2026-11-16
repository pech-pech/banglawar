// Warm Crowd (SPEC 6, 11): Hype "Big Voice" node becomes "Warm Crowd": a HIGH +6 landing pays +7. Widths never change.
// Pure module, no imports. HYPE_TOKEN_CAP will live in js/data/wheels/hype.js (not built yet): defined locally as 1 here; swap to an import then.
export const WARM_CROWD_VALUE = 7;
export const HYPE_HIGH_VALUE = 6;
export const HYPE_TOKEN_CAP = 1; // [D] Hype tokens max 1 a season (tokUsed.hype)

/**
 * applyOrder (doc only): build the Hype ring in this order.
 *   1. Home Crowd / Kind Floor first: they lift LOW (+2) to +4 (lowToMedium / floor).
 *   2. applyWarmCrowd second: only value-6 (HIGH) rows change, so step 1 never collides with it.
 * Widths are never touched by either step (Warm Crowd has no width effect; the old Big Voice rareAdd is retired on Hype).
 */
export const applyOrder = ['homeCrowd/kindFloor (LOW -> +4)', 'warmCrowd (HIGH +6 -> +7)'];

/**
 * True when the Hype tree mods carry Warm Crowd. `mods` is modsFor(effective(s), 'hype') output (js/core/wheels/common.js).
 * Reads `mods.warmCrowd`; while the node is still the old Big Voice (rare_width_add on hype -> mods.rareAdd) a positive rareAdd also counts.
 * @param {any} mods
 */
export function warmCrowdOwned(mods) {
  return !!mods && (!!mods.warmCrowd || +mods.rareAdd > 0);
}

/**
 * New ring with HIGH rows (value 6) at value 7 and label "+7". Everything else (widths, other rows) copied unchanged; input not mutated.
 * @param {ReadonlyArray<any>} ring @param {boolean} owned
 */
export function applyWarmCrowd(ring, owned) {
  return ring.map((row) => {
    if (!owned || !row || row.value !== HYPE_HIGH_VALUE) return { ...row };
    const label = typeof row.label === 'string' && row.label.includes('+6') ? row.label.replace('+6', '+7') : '+7';
    return { ...row, value: WARM_CROWD_VALUE, label };
  });
}

/** Hype token allowed this season? @param {number} usedThisSeason */
export function hypeTokenAllowed(usedThisSeason) {
  return (+usedThisSeason || 0) < HYPE_TOKEN_CAP;
}
