// Windward Line - shared contract (lead owns this file; makers import, never edit).
// Pure ES module, no DOM. Every number is "admin default" and appears in TWEAK_SPEC.
// Names stay neutral where possible (people, threat=fire, barrier=firebreak, zone=shelter).

export const GAME = 'windward-line';
export const TITLE = 'Windward Line'; // admin default, not M's pick

// Cell fuel/terrain types (Uint8 in grid.type)
export const TYPE = { GRASS: 1, WOODS: 2, HOUSE: 3, ROAD: 4, WATER: 5, ROCK: 6, CLEAR: 7, BRIDGE: 8 };
export const BURNABLE = { 1: true, 2: true, 3: true }; // GRASS WOODS HOUSE only
// People modes (Uint8 in people.mode)
export const MODE = { CALM: 0, AWARE: 1, PANIC: 2, SAFE: 3, LOST: 4 };
export const PHASE = { PLAN: 'plan', RUN: 'run', RESULT: 'result' };
export const MAP_W = 96, MAP_H = 128, CELL_PX = 8;

export const idx = (x, y) => y * MAP_W + x;
export const cx = (i) => i % MAP_W;
export const cy = (i) => (i / MAP_W) | 0;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

// Stage table = PROTO SPEC v2 (CONCEPT-SHEET.md). All admin default.
export const STAGES = {
  1: { money: 1200, people: 400, strikes: 1, newSpotEvery: 0, shiftAtSec: 0, windDeg: 0, windLevel: 1, targetSec: 90, tools: ['zone', 'break', 'road', 'crew', 'pump', 'bomber'] },
  2: { money: 1800, people: 900, strikes: 2, newSpotEvery: 45, shiftAtSec: 60, windDeg: 0, windLevel: 2, shiftDeg: 90, targetSec: 120, tools: ['zone', 'break', 'road', 'crew', 'pump', 'bomber', 'dozer'] },
};
// windDeg: direction fire TRAVELS TO, 0 = south (+y, toward town at bottom of map), 90 = west(-x)... see windVec.
// Stage 1 wind travels AWAY from town: windDeg 180 (north). Stage 2 starts 0? No: stage 2 starts 200 (mostly north-ish
// so plan looks safe), then shifts +90 toward the town flank. Map maker places strikes to match. Final values below win:
// Lead calls 2026-11-25 (integration, admin default):
// 1. Score = % of people ALIVE at end (not LOST), like the reference's "% saved"; shelters/breaks/refuge keep people alive.
// 2. Stage 1 must threaten the town gently: wind level 1 travelling TOWARD the town (0 = south), front reaches the
//    town edge at about 45-55 s; idle loses, a basic shelter + break plan wins. ("Wind away from town" was a generated
//    default, not M's words.)
// 3. Stage 2: level 2, announced shift at 60 s toward the west flank via the neck; idle loses >= 95%; round ~120 s
//    (round also ends once no fire is within quietR cells of unsheltered people for endQuietSec; roundMaxSec 150).
STAGES[1].windDeg = 0; // toward town (town is south)
STAGES[2].windDeg = 225; STAGES[2].shiftDeg = -180; // shift at 60 s turns wind toward the town (45 = south-west-ish)

// windVec(deg): unit vector of travel. deg 0 = +y (south / down screen), 90 = -x (west / left), 180 = -y (north / up), 270 = +x (east).
export function windVec(deg) { const r = deg * Math.PI / 180; return { x: -Math.sin(r), y: Math.cos(r) }; }

export const defaultCfg = Object.freeze({
  tickSec: 0.25,            // sim seconds per tick at 1x
  roundMaxSec: 150,         // hard timer
  quietR: 24,               // round ends when no fire/ember is this close to unsheltered people (after first threat)
  endQuietSec: 12,          // no fire/ember for this long = round ends (balance-1: was 8; rounds ~89 s / ~115 s)
  winFloor: 25,             // % safe needed (both stages)
  stars: [50, 70, 90],      // extra medals as stars
  // fire
  burnTicks: { 1: 8, 2: 24, 3: 32 },          // GRASS WOODS HOUSE
  ignite:    { 1: 0.12, 2: 0.07, 3: 0.08 },   // per burning neighbour per tick, before wind
  heatW:     { 1: 0.5, 2: 1.0, 3: 1.5 },
  windK: 0.7, windFloor: 0.25, windCap: 3.0,  // factor = clamp(1 + windK*W*cos, floor, cap)
  emberRate: 0.006,         // per burning cell per tick, x(1+W), woods x1 house x1.5 grass x0.3. balance-1: was 0.004 (fire died at the river/top road, idle won)
  emberFlightBase: 4, emberFlightPerW: 5, emberConeDeg: 20, emberSpeed: 2, // cells per tick
  emberLand: { 1: 0.5, 2: 0.3, 3: 0.4 },
  wetFactor: 0.1, wetTicks: 80,
  // firebreak (barrier)
  breakCost: 5, breakWidth: 2, breakHoldPerW: 10, breakHeatR: 2,
  // stage1-clarity (admin default): flat hold on top of per-width, so a 1-wide break holds a weak front with no wind (measured:
  // base 6 -> 1-wide holds 26/30 seeds at wind 0, still breaks at wind 1). breakTypicalHeat = heat a woods front puts on a break cell at wind 0 (preview only).
  breakHoldBase: 6, breakTypicalHeat: 12,
  // shelter zone
  // balance-1 (admin default): was cost 8, cap 0.5/cell, no max. Perimeter pricing made capacity grow with money squared,
  // so one big box beat every split plan; now one box holds at most zoneCapMax and a 23x18 box costs 1560.
  zoneCostPerCell: 20, zoneCapPerCell: 1.0, zoneCapMax: 130, zoneMinSide: 4, gateFlow: 5, // gateFlow people per second per gate
  // road
  roadCost: 3,
  // people
  awareR: 16, freezeShare: 0.2, freezeSec: 2, walkSpd: 1.5, runRoad: 3.0, runOff: 2.0, roadCap: 6,
  exposeR: 6,               // balance-1, admin default: unsheltered people ever this close (cells) to fire count lost at end
  heatDps: 2, smokeDps: 0.5, hp: 10, repathSec: 2, smokeLen: 4,
  // hose crew
  crewBase: 30, crewPerCell: 10, crewRangeBase: 3, tank: 60, refill: 4, refillWaterDist: 6, sprayPerTick: 2, sprayOutTicks: 2,
  // pump house conversion (1 per round)
  pumpCost: 100, pumpRadius: 15, pumpRangeMul: 1.25, pumpRateMul: 1.3, pumpRefillMul: 1.5, convMax: 1,
  // call-ins
  bomberUses: 2, bomberDelaySec: 6, bomberLen: 12, bomberWidth: 2,
  dozerUses: 1, dozerDelaySec: 10, dozerLen: 8,
  // lightning
  spotMax: 2,
  forecastLeadSec: 20,      // wind shift shown this early in the forecast strip / tell
});

// Tweak menu rows: [key, label, min, max, step]. Nested keys use dot path e.g. 'ignite.2'.
export const TWEAK_SPEC = [
  ['tickSec', 'Tick seconds', 0.1, 1, 0.05], ['winFloor', 'Win floor %', 5, 80, 1], ['roundMaxSec', 'Round timer s', 60, 600, 10],
  ['burnTicks.1', 'Grass burn ticks', 2, 40, 1], ['burnTicks.2', 'Woods burn ticks', 4, 80, 1], ['burnTicks.3', 'House burn ticks', 4, 80, 1],
  ['ignite.1', 'Grass ignite', 0.02, 0.8, 0.01], ['ignite.2', 'Woods ignite', 0.02, 0.8, 0.01], ['ignite.3', 'House ignite', 0.02, 0.8, 0.01],
  ['windK', 'Wind strength k', 0, 1.5, 0.05], ['emberRate', 'Ember rate', 0, 0.05, 0.001], ['emberFlightPerW', 'Ember flight per W', 0, 12, 1],
  ['breakHoldPerW', 'Break hold per width', 1, 20, 1], ['breakHoldBase', 'Break hold base', 0, 20, 1], ['breakWidth', 'Break width', 1, 5, 1], ['breakCost', 'Break cost/cell', 1, 20, 1],
  ['zoneCostPerCell', 'Shelter cost/edge cell', 1, 40, 1], ['zoneCapPerCell', 'Shelter capacity/cell', 0.1, 2, 0.1], ['zoneCapMax', 'Shelter max people', 20, 1000, 10],
  ['exposeR', 'Caught-in-open radius', 1, 12, 1], ['gateFlow', 'Gate flow /s', 1, 20, 1],
  ['roadCost', 'Road cost/cell', 0, 20, 1], ['awareR', 'Aware radius', 4, 40, 1], ['runRoad', 'Run speed road', 0.5, 6, 0.1], ['runOff', 'Run speed off-road', 0.5, 6, 0.1],
  ['heatDps', 'Heat damage /s', 0, 10, 0.5], ['crewBase', 'Crew base cost', 0, 100, 5], ['tank', 'Crew tank', 10, 200, 5],
  ['pumpCost', 'Pump house cost', 0, 400, 10], ['bomberUses', 'Bomber uses', 0, 6, 1], ['bomberDelaySec', 'Bomber delay s', 0, 30, 1], ['bomberLen', 'Bomber line cells', 4, 30, 1],
  ['dozerUses', 'Dozer uses', 0, 4, 1], ['dozerDelaySec', 'Dozer delay s', 0, 30, 1], ['dozerLen', 'Dozer line cells', 2, 20, 1],
  ['spotMax', 'Max new spot fires', 0, 10, 1],
];

// firebreak hold strength vs heat: width cells -> hold number; rating vs a typical woods front in the current wind.
export function breakHold(cfg, width) { return cfg.breakHoldPerW * width + (cfg.breakHoldBase || 0); }
export function breakRating(cfg, width, windLevel) {
  const wf = Math.min(cfg.windCap, Math.max(cfg.windFloor, 1 + cfg.windK * (windLevel || 0))); // fire pushed straight at the break
  const ratio = breakHold(cfg, width) / (cfg.breakTypicalHeat * wf);
  return ratio < 1 ? { key: 'weak', ratio, text: 'breaks fast in this wind' } : ratio < 1.5 ? { key: 'mid', ratio, text: 'holds a slow front' } : { key: 'strong', ratio, text: 'holds' };
}

export function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
export function cloneCfg(c) { return JSON.parse(JSON.stringify(c || defaultCfg)); }
export function cfgDiffers(c) { return TWEAK_SPEC.some(([k]) => getPath(c, k) !== getPath(defaultCfg, k)); }
export const secToTicks = (cfg, s) => Math.round(s / cfg.tickSec);
export const fmtTime = (sec) => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

// Compass name of a cell relative to map centre, for cause lines ("west break").
export function sideName(x, y) {
  const dx = x - MAP_W / 2, dy = y - MAP_H / 2; const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = east, 90 = south
  const n = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return n[((Math.round(a / 45) % 8) + 8) % 8];
}

// Event log. kinds: 'strike','spot','wind-shift-warn','wind-shift','break-breach','ember-jump','gate-closed','road-cut','first-loss','callin-drop','zone-hit'
export function pushEvent(state, kind, x, y, text) {
  const ev = { tick: state.tick, kind, x, y, text };
  state.events.push(ev);
  if (!state.firstBreach && (kind === 'break-breach' || kind === 'ember-jump' || kind === 'gate-closed' || kind === 'zone-hit' || kind === 'road-cut')) state.firstBreach = ev;
  return ev;
}

// Fresh grid layers from a map (also used by plan.rebuild to re-apply the plan).
export function initGrid(map) {
  const N = MAP_W * MAP_H;
  return {
    type: Uint8Array.from(map.type), // mutable copy
    burn: new Int16Array(N),         // ticks left burning (>0 = burning)
    burnt: new Uint8Array(N),        // 1 = burnt out
    wet: new Int16Array(N),          // ticks left wet
    brk: new Uint8Array(N),          // firebreak id+1 at cell (0 none)
    zone: new Uint8Array(N),         // shelter zone id+1 at cell (0 none)
    heat: new Float32Array(N),       // scratch
    dist: new Float32Array(N),       // people flow field (distance to nearest open gate), Infinity = unreachable
  };
}
