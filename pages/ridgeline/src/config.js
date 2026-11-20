// Tunable run/render/physics settings for Ridgeline.
// DEFAULTS is frozen; cfg is the live mutable copy that other modules read.

export const DEFAULTS = Object.freeze({
  baseSpeed: 22,
  maxSpeed: 48,
  accel: 6,
  steerAccel: 60,
  steerDamp: 6,
  maxLateral: 22,
  boostPower: 16,
  boostTime: 1.6,
  chargeRate: 0.45,
  chargeRange: 3.0,
  courseHalfWidth: 14,
  gateSpacing: 55,
  gateWidth: 7,
  rockDensity: 0.5,
  treeDensity: 1.0,
  runLength: 1800,
  slope: 0.28,
  viewDist: 220,
  fogDensity: 0.012,
  camBack: 9,
  camHeight: 4.5,
  pixelRatioCap: 2,
  missPenalty: 2.0,
});

// Slider metadata for the Tweak menu. Each range brackets its default.
export const META = Object.freeze({
  baseSpeed:       { min: 10,   max: 35,   step: 0.5,   label: 'Base speed (m/s)' },
  maxSpeed:        { min: 30,   max: 80,   step: 1,     label: 'Max speed (m/s)' },
  accel:           { min: 1,    max: 15,   step: 0.5,   label: 'Speed ease (1/s)' },
  steerAccel:      { min: 20,   max: 120,  step: 1,     label: 'Steer accel (m/s^2)' },
  steerDamp:       { min: 1,    max: 15,   step: 0.5,   label: 'Steer damping' },
  maxLateral:      { min: 8,    max: 40,   step: 1,     label: 'Max lateral (m)' },
  boostPower:      { min: 4,    max: 35,   step: 1,     label: 'Boost power (m/s)' },
  boostTime:       { min: 0.5,  max: 4,    step: 0.1,   label: 'Boost time (s)' },
  chargeRate:      { min: 0.1,  max: 1.5,  step: 0.05,  label: 'Charge rate (/s)' },
  chargeRange:     { min: 1,    max: 8,    step: 0.25,  label: 'Charge range (m)' },
  courseHalfWidth: { min: 6,    max: 30,   step: 0.5,   label: 'Course half width (m)' },
  gateSpacing:     { min: 25,   max: 120,  step: 1,     label: 'Gate spacing (m)' },
  gateWidth:       { min: 3,    max: 14,   step: 0.5,   label: 'Gate width (m)' },
  rockDensity:     { min: 0,    max: 1,    step: 0.05,  label: 'Rock density' },
  treeDensity:     { min: 0,    max: 2,    step: 0.05,  label: 'Tree density' },
  runLength:       { min: 900,  max: 3000, step: 50,    label: 'Run length (m)' },
  slope:           { min: 0.05, max: 0.6,  step: 0.01,  label: 'Slope' },
  viewDist:        { min: 80,   max: 400,  step: 5,     label: 'View distance (m)' },
  fogDensity:      { min: 0,    max: 0.05, step: 0.001, label: 'Fog density' },
  camBack:         { min: 3,    max: 20,   step: 0.5,   label: 'Camera back (m)' },
  camHeight:       { min: 1,    max: 12,   step: 0.5,   label: 'Camera height (m)' },
  pixelRatioCap:   { min: 1,    max: 3,    step: 0.25,  label: 'Pixel ratio cap' },
  missPenalty:     { min: 0,    max: 6,    step: 0.1,   label: 'Missed gate penalty (s)' },
});

export const cfg = { ...DEFAULTS };

const has = (key) => Object.prototype.hasOwnProperty.call(DEFAULTS, key);

// Set one known key on the live cfg. Unknown keys are ignored.
export function setCfg(key, value) {
  if (!has(key)) return;
  cfg[key] = value;
}

// Restore every key on the live cfg object to its default (same object is kept).
export function resetCfg() {
  for (const key of Object.keys(DEFAULTS)) cfg[key] = DEFAULTS[key];
}

// True when every live value equals its default.
export function isDefault() {
  return Object.keys(DEFAULTS).every((key) => cfg[key] === DEFAULTS[key]);
}

// Map of keys whose live value differs from the default.
export function diffFromDefault() {
  const diff = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (cfg[key] !== DEFAULTS[key]) diff[key] = cfg[key];
  }
  return diff;
}

// Apply a partial settings object (e.g. a saved preset) onto cfg. Unknown keys are ignored.
export function applyPreset(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) setCfg(key, obj[key]);
}
