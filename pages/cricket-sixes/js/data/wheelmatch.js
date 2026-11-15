// @ts-check
// Wheel match mode constants (2026-11-15-wheel-match SPEC s2, s3, s5, s15; build CONTRACT). Plain data, no logic.
export const WHEEL_MATCH = Object.freeze({ W0: 36, TAU: 3.0, D: 2.0, J: 1.2, COAST: 6.0, STOP_FROM: 1, K_SEG: 10, MIN_P: 0.025, RESERVE_MIN: 0.03,
  N_SAMP: 2000, CIRC: 10, HIGH_TAIL_Q: 0.85, WK_VAL_BOWL: 7, WK_VAL_BAT_A: 14, WK_VAL_BAT_B: 1.2, WK_VAL_LO: 3, WK_VAL_HI: 10,
  GLOW_LO: 3.2, GLOW_HI: 3.8, GLOW_BEAT: 0.2, GLOW_BEATS: 3,
  SD_AVG: 0.110, SD_GOOD: 0.070, SD_GUIDE_AVG: 0.080, SD_GUIDE_GOOD: 0.050, SLOW_PER_RANK: 0.15, SLOW_FULL: 0.55, STEADY_FULL: 0.7225, STEADY_CAP: 0.7,
  SLICE_MAX_P: 0.12 }); // SLICE_MAX_P: slice width cap (1.2 of CIRC 10 units); wider segments split into equal pieces (numbers thread fix)
export const WHEEL_RIVAL_OFF = -9, CLASSIC_RIVAL_OFF = 1.9; // OFF -9 with the slice cap (numbers thread sweep: JS random 36.5, careful 54.5; was -10)
export const WHEEL_RIVAL_BOOST = 10.9; // = CLASSIC_RIVAL_OFF - WHEEL_RIVAL_OFF; added to every rival rating (bp, bs, spd, bsk) in wheel mode only
export const MATCH_SPOKES_PER_SPIN = 1;
export const AUTO_PACE = Object.freeze({ over: 0.6, event: 0.9 });
export const BALL_SPEED = Object.freeze({ full: 0.4, plain: 0.2, fastFrom: 4 }); // from over 4: dot/1/2 at 0.2 s, 4/6/W at 0.4; last two overs of an innings full
export const DEV_DEFAULTS = Object.freeze({ on: false, matchW0: 36, matchJ: 1.2, matchD: 2.0, otherMult: 1.0 });
export const DEV_RANGE = Object.freeze({ matchW0: [12, 90, 1], matchJ: [0, 3, 0.1], matchD: [0.5, 4, 0.1], otherMult: [0.25, 3, 0.05] });
/** Segment tone band (runs of value for us, either side of par): good >= par + TONE_BAND, bad <= par - TONE_BAND. Bowl par = BOWL_PAR runs an over;
 *  chase par = runs needed per over. Fitted to mockups/QA (bowl: good <=5, bad >=11 at par 8), with the rim-order wicket value (SPEC 12.6 align). */
export const WHEEL_TONE = Object.freeze({ BAND: 2.5, BOWL_PAR: 8 });
