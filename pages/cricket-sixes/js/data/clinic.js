// @ts-check
// Clinic constants (coach-weekly SPEC s6, s9; CONTRACT-B s5, s12 call 2). Data only. Owner: T6.
// Slice widths are fractions of the rim; the wheel screen multiplies by 10 into rim units. Sum 1.00. None above SLICE_MAX_P 0.12.

export const CLINIC_SLICES = Object.freeze({
  S: Object.freeze({ label: 'Small', value: 5, width: 0.11, count: 4, tier: 'bottom' }),
  M: Object.freeze({ label: 'Medium', value: 10, width: 0.12, count: 2, tier: 'middle' }),
  L: Object.freeze({ label: 'Large', value: 20, width: 0.09, count: 3, tier: 'top' }),
  JP: Object.freeze({ label: 'Jackpot', value: 30, width: 0.05, count: 1, tier: 'top', gold: true }), // value 30: lead call 8 (must exceed 10)
});

/** Rim, clockwise, index 0 = ring index 0. */
export const CLINIC_SLICE_ORDER = Object.freeze(['JP', 'S', 'L', 'S', 'L', 'M', 'S', 'L', 'S', 'M']);

/** Boost percent of a weekly nets roll per kind (JP = extra run, no percent). */
export const CLINIC_PCT = Object.freeze({ S: 5, M: 10, L: 20 });

/** Jackpot extra-run odds at Easy (percent), plus the week quality Q shifts them (SPEC s6). */
export const ODDS_EASY = Object.freeze({ okay: 80, good: 18, great: 2 });

export const CLINIC_SPOKES_PER_SPIN = 1;
export const CLINIC_WHEEL_ID = 'clinic';
export const CLINIC_SLICE_MAX_P = 0.12;

/** Ring rows per CONTRACT-A s5: {id, w (rim units), value, label, tier, gold}. */
export function clinicRing() {
  return CLINIC_SLICE_ORDER.map((k, id) => {
    const d = CLINIC_SLICES[/** @type {'S'|'M'|'L'|'JP'} */ (k)];
    return { id, kind: k, w: d.width * 10, value: d.value, label: d.label, tier: d.tier, gold: !!(/** @type {any} */ (d).gold) };
  });
}
