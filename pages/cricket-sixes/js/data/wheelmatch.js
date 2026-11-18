// @ts-check
// Wheel match mode constants (2026-11-15-wheel-match SPEC s2, s3, s5, s15; build CONTRACT). Plain data, no logic.
import { WHEEL_ENGINE } from './wheel-engine.js';
// Wheels SPEC 2a / port line 1, CONTRACT-A sec 8 + Lead call 8: WHEEL_MATCH = { ...MATCH_ONLY, ...WHEEL_ENGINE } (one build, then dropped).
// Shared keys (W0, TAU, D, J, CIRC, SLICE_MAX_P, GLOW, PULSE_*, STOP_GUARD_S) are read from WHEEL_ENGINE. COAST and STOP_FROM are gone (pulse, no coast).
const MATCH_ONLY = Object.freeze({ K_SEG: 10, MIN_P: 0.025, RESERVE_MIN: 0.03,
  N_SAMP: 2000, HIGH_TAIL_Q: 0.85, WK_VAL_BOWL: 7, WK_VAL_BAT_A: 14, WK_VAL_BAT_B: 1.2, WK_VAL_LO: 3, WK_VAL_HI: 10,
  GLOW_LO: WHEEL_ENGINE.GLOW[0], GLOW_HI: WHEEL_ENGINE.GLOW[1], GLOW_BEAT: 0.2, GLOW_BEATS: 3,
  SD_AVG: 0.110, SD_GOOD: 0.070, SD_GUIDE_AVG: 0.080, SD_GUIDE_GOOD: 0.050, SLOW_PER_RANK: 0.15, SLOW_FULL: 0.55, STEADY_FULL: 0.7225, STEADY_CAP: 0.7,
  GLIDE_DEG: Object.freeze([60, 120]) }); // M 2026-11-17: the landing tick sits 60..120 degrees ahead of the pointer
// SLICE_MAX_P (engine 0.12): slice width cap (1.2 of CIRC 10 units); wider segments split into equal pieces (numbers thread fix)
export const WHEEL_MATCH = Object.freeze({ ...MATCH_ONLY, ...WHEEL_ENGINE });
export const WHEEL_RIVAL_OFF = -9, CLASSIC_RIVAL_OFF = 1.9; // OFF -9 with the slice cap (numbers thread sweep: JS random 36.5, careful 54.5; was -10)
export const WHEEL_RIVAL_BOOST = 10.9; // = CLASSIC_RIVAL_OFF - WHEEL_RIVAL_OFF; added to every rival rating (bp, bs, spd, bsk) in wheel mode only
export const MATCH_SPOKES_PER_SPIN = 1;
export const AUTO_PACE = Object.freeze({ over: 0.3, event: 0.45 }); // M 2026-11-18 (wheel settings item 2): was 0.6 / 0.9, faster for all, no switch
export const BALL_SPEED = Object.freeze({ full: 0.4, plain: 0.2, fastFrom: 1 }); // from over 1: dot/1/2 at 0.2 s, 4/6/W at 0.4; last two overs of an innings full (M 2026-11-18 item 3: was from over 4)
// Dev keys (per device, never exported). Add a key: DEV_DEFAULTS + DEV_RANGE [lo, hi, step] here; devClamp clamps every DEV_RANGE key by itself
// (core/wheelmatch.js); DEV_ROWS / DEV_LABEL in ui/wheelmatch-settings.js; devReset (store) resets every DEV_RANGE key on Reset all; the report
// `dev:` line stamps any changed key by itself (devChanged loops DEV_RANGE). One key per line so parallel edits do not collide.
export const DEV_DEFAULTS = Object.freeze({ on: false, matchW0: 36, matchJ: 1.2, matchD: 2.0, otherMult: 1.0,
  matchLeadMin: 60, // tick lead min, degrees ahead of the pointer (= GLIDE_DEG[0]); M 2026-11-18 item 4
  matchLeadMax: 120, // tick lead max, degrees (= GLIDE_DEG[1]); kept >= matchLeadMin
  matchCycle: 6.0, // pulse cycle length, seconds (= WHEEL_ENGINE.PULSE_PERIOD); slow point and STOP glow scale with it; item 5
  tickW: 5, // landing tick width, px (= the Bold tick); read only when Dev is on AND Tick = Bold (maker B draws it)
  tickL: 22, // landing tick length, px (= the Bold tick; lead 2026-11-18: 22, was 16, Normal already reaches 15)
  powGuide: -1, // power test (M 2026-11-18 Dev 5/6): -1 Auto = Workshop rank, no override; 0 Off; 1 On. Overrides ctrlOf / wheelmeta Control while Dev is on
  powZone: -1, // Aim Zone: -1 Auto, 0 Off, 1 On
  powChime: -1, // Gold Chime: -1 Auto, 0 Off, 1 On
  powSlow: -1, // Slow Spin rank: -1 Auto, else 0..3
  powSteady: -1, // Steady Axle rank: -1 Auto, else 0..2
});
export const DEV_RANGE = Object.freeze({ matchW0: [12, 90, 1], matchJ: [0, 3, 0.1], matchD: [0.5, 4, 0.1], otherMult: [0.25, 3, 0.05],
  matchLeadMin: [30, 120, 5],
  matchLeadMax: [60, 180, 5],
  matchCycle: [3, 10, 0.1],
  tickW: [2, 8, 1],
  tickL: [8, 24, 1],
  powGuide: [-1, 1, 1],
  powZone: [-1, 1, 1],
  powChime: [-1, 1, 1],
  powSlow: [-1, 3, 1],
  powSteady: [-1, 2, 1],
});
/** Dev power test keys -> Workshop node id (Control branch). -1 = Auto (no override). Read by devPowers (core/wheelmatch.js). */
export const DEV_POWERS = Object.freeze({ powGuide: 'c_guide', powZone: 'c_zone', powChime: 'c_chime', powSlow: 'c_slow', powSteady: 'c_steady' });
/** Dev key pairs kept in order (lo <= hi). A saved pair out of order: hi is raised to lo (devClamp); the sliders push the partner instead. */
export const DEV_ORDER = Object.freeze([Object.freeze(['matchLeadMin', 'matchLeadMax'])]);
/** Segment tone band (runs of value for us, either side of par): good >= par + TONE_BAND, bad <= par - TONE_BAND. Bowl par = BOWL_PAR runs an over;
 *  chase par = runs needed per over. Fitted to mockups/QA (bowl: good <=5, bad >=11 at par 8), with the rim-order wicket value (SPEC 12.6 align). */
export const WHEEL_TONE = Object.freeze({ BAND: 2.5, BOWL_PAR: 8 });
