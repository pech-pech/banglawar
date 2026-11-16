// @ts-check
// Shared wheel engine constants (CONTRACT-A sec 2, wheels SPEC 2a/2c/2i). One module for all 8 wheels, the match wheel and the coach Clinic wheel.
// Per-wheel J (Find 1.5) is a field of that wheel's data, not an engine key. ARC_PER_CYCLE is computed (js/core/wheel-pulse.js), never a key.
export const WHEEL_ENGINE = Object.freeze({ W0: 36, TAU: 3.0, D: 2.0, J: 1.2, CIRC: 10, SLICE_MAX_P: 0.12, SLICE_WIDEN_MAX: 0.13,
  PULSE_PERIOD: 6.0, PULSE_FROM: 3.8, GLOW: Object.freeze([3.2, 3.8]), STOP_GUARD_S: 0.35 });
/** wheelId values used by save keys `wheels.stops` / `wheels.stats` (CONTRACT-A sec 6). */
export const WHEEL_STOP_IDS = Object.freeze(['spot', 'course', 'find', 'hype', 'toss', 'pep', 'scout', 'finals', 'match', 'clinic']);
