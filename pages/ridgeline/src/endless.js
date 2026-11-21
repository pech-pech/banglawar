// Ridgeline endless world: zones, laps and difficulty as pure functions of distance d (= z). No THREE, no Math.exp/sin.
// Spec: sections/05-endless.md sec 1 and 2.
import { pexp } from './dunes.js';

export const ZONE_NAMES = ['Tallow Shallows', 'Brasswind Reach', 'Ochre Basins', 'Hushpan Drops', 'Candlespine Run'];
export const TYPES = ['roller', 'hopper', 'crestS', 'crestM', 'crestL', 'step', 'kicker', 'double', 'tabletop', 'gap', 'blade', 'bowl'];

const ZONE_W = [
  { roller: 35, hopper: 25, step: 15, crestM: 10, bowl: 15 },
  { roller: 10, hopper: 15, crestM: 25, crestL: 15, double: 20, step: 10, blade: 5 },
  { hopper: 10, crestM: 20, crestL: 10, blade: 30, bowl: 25, roller: 5 },
  { step: 15, double: 15, tabletop: 25, gap: 25, crestL: 10, kicker: 10 },
  { crestM: 14, crestL: 12, double: 12, step: 8, tabletop: 14, blade: 14, bowl: 10, gap: 12, kicker: 4 },
];
const ROCK_X = [0.9, 1.0, 1.05, 0.95, 1.15];
const WIND = [0, 1, 0, 0, 0.5];   // x cfg.windAirX (2.0 -> 0 2.0 0 0 1.0)
const SAND = [0, 0, 0, 1, 0.5];   // x cfg.sandDrag (0.04 -> 0 0 0 0.04 0.02)

function lens(cfg) { return [cfg.zoneLen1, cfg.zoneLen2, cfg.zoneLen3, cfg.zoneLen4, cfg.zoneLen5]; }

export function zoneAt(d, cfg) {
  const L = lens(cfg);
  const lapLen = L[0] + L[1] + L[2] + L[3] + L[4];
  if (!(d > 0)) d = 0;
  const lap = Math.floor(d / lapLen);
  let off = d - lap * lapLen;
  let zone = 0, start = lap * lapLen;
  while (zone < 4 && off >= L[zone]) { off -= L[zone]; start += L[zone]; zone++; }
  return { zone, name: ZONE_NAMES[zone], lap, start, end: start + L[zone], local: off };
}

export function zoneWeights(d, cfg) {
  const z = zoneAt(d, cfg);
  const mixk = Math.min(1, cfg.lapMix * z.lap);
  const out = {};
  for (const t of TYPES) {
    let avg = 0;
    for (let k = 0; k < 5; k++) avg += ZONE_W[k][t] || 0;
    avg /= 5;
    const own = ZONE_W[z.zone][t] || 0;
    out[t] = z.lap >= 1 ? own * (1 - mixk) + avg * mixk : own;
  }
  return out;
}

export const zoneRockX = (d, cfg) => ROCK_X[zoneAt(d, cfg).zone];
export const zoneWind = (d, cfg) => WIND[zoneAt(d, cfg).zone] * cfg.windAirX;
export const zoneSand = (d, cfg) => SAND[zoneAt(d, cfg).zone] * cfg.sandDrag;

const decay = (a, b, tau, d) => b + (a - b) * pexp(-Math.max(0, d) / tau);
export const pitchTarget = (d, cfg) => decay(cfg.pitchStart, cfg.pitchEnd, cfg.pitchDistTau, d);
export const halfWidthAt = (d, cfg) => decay(cfg.hwStart, cfg.hwEnd, cfg.hwTau, d);
export const rockDensityAt = (d, cfg) => decay(cfg.rockStart, cfg.rockEnd, cfg.rockTau, d);

export function baseSpeed(d, cfg) {
  const dd = Math.max(0, d);
  const lap = zoneAt(dd, cfg).lap;
  return cfg.vBase0 + cfg.vBaseGain * (1 - pexp(-dd / cfg.vBaseTau)) + Math.min(cfg.lapSpeedMax, cfg.lapSpeed * lap);
}

export function gateSpacingAt(d, cfg) {
  return Math.min(cfg.gateMax, Math.max(cfg.gateMin, cfg.gateSecs * baseSpeed(d, cfg)));
}
