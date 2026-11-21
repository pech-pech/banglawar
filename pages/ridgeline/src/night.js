// Ridgeline nightfall: one number, gap (m), between sled and the dark front. Pure, deterministic, no DOM/RNG/clock.
// Spec: GAMEPLAY.md sec 2 (3,4), sec 3, sec 6; sections/05-endless.md sec 3 and 5.
import { pexp } from './dunes.js';

export const FIXED_DT = 1 / 120;

export const KEYS = {
  gapStart:        { def: 150, min: 60, max: 300, step: 10, label: 'Start gap (m)', group: 'Nightfall' },
  gapMax:          { def: 240, min: 120, max: 400, step: 10, label: 'Max gap, hard clamp (m)', group: 'Nightfall' },
  gapSoft:         { def: 150, min: 60, max: 300, step: 10, label: 'Soft cap, excess drains (m)', group: 'Nightfall' },
  gapDecay:        { def: 0.05, min: 0, max: 0.3, step: 0.01, label: 'Soft cap drain (1/s)', group: 'Nightfall' },
  frontV0:         { def: 22, min: 15, max: 30, step: 0.5, label: 'Front speed at start (m/s)', group: 'Nightfall' },
  frontEarly:      { def: 6, min: 0, max: 12, step: 0.5, label: 'Front early push (m/s)', group: 'Nightfall' },
  frontEarlyTau:   { def: 1500, min: 500, max: 4000, step: 100, label: 'Front early push length (m)', group: 'Nightfall' },
  frontRise:       { def: 1.7, min: 0.4, max: 3.0, step: 0.1, label: 'Front gain (m/s per km)', group: 'Nightfall' },
  frontCap:        { def: 56, min: 45, max: 62, step: 1, label: 'Front speed cap (m/s)', group: 'Nightfall' },
  frontLap:        { def: 0.6, min: 0, max: 2, step: 0.1, label: 'Front gain per lap (m/s)', group: 'Nightfall' },
  missGap:         { def: 20, min: 0, max: 60, step: 5, label: 'Missed gate gap hit (m)', group: 'Nightfall' },
  stageFar:        { def: 130, min: 80, max: 200, step: 5, label: 'Stage far from (m)', group: 'Nightfall' },
  stageNear:       { def: 60, min: 20, max: 120, step: 5, label: 'Stage heels below (m)', group: 'Nightfall' },
  stageHyst:       { def: 6, min: 0, max: 20, step: 1, label: 'Stage hysteresis (m)', group: 'Nightfall' },
  airCaughtMax:    { def: 1.5, min: 0, max: 4, step: 0.1, label: 'Caught in air: max wait (s)', group: 'Nightfall' },
  recoverFloor:    { def: 15, min: 0, max: 50, step: 5, label: 'Gap floor in recover (m)', group: 'Recover' },
  recoverFloorCool:{ def: 600, min: 0, max: 2000, step: 50, label: 'Floor cooldown between wrecks (m)', group: 'Recover' },
};
// recoverGrace is an existing config key (Tumble group); the floor lingers that long after recover_end.

const pick = (cfg, k) => (cfg && cfg[k] !== undefined ? cfg[k] : KEYS[k] ? KEYS[k].def : undefined);

/** Front speed at sled distance d (m) and lap. Same formula as GAMEPLAY sec 3. */
export function frontSpeed(d, lap, cfg) {
  const g = (k) => pick(cfg, k);
  const dd = Math.max(0, d);
  const base = g('frontV0') + g('frontEarly') * (1 - pexp(-dd / g('frontEarlyTau'))) + g('frontRise') * dd / 1000;
  return Math.min(g('frontCap'), base) + g('frontLap') * (lap || 0);
}

export function stageFor(gap, prev, cfg) {
  const far = pick(cfg, 'stageFar'), near = pick(cfg, 'stageNear'), h = pick(cfg, 'stageHyst');
  if (prev === 'far') return gap < far ? (gap < near ? 'heels' : 'near') : 'far';
  if (prev === 'near') {
    if (gap < near) return 'heels';
    return gap >= far + h ? 'far' : 'near';
  }
  if (prev === 'heels') {
    if (gap >= near + h) return gap >= far + h ? 'far' : 'near';
    return 'heels';
  }
  return gap >= far ? 'far' : gap >= near ? 'near' : 'heels';
}

export function createNight(cfg) {
  const g = (k) => pick(cfg, k);
  let s;
  const fresh = () => ({
    gap: g('gapStart'), vf: frontSpeed(0, 0, cfg), stage: stageFor(g('gapStart'), null, cfg),
    caught: false, caughtDist: null, airT: -1,           // airT >= 0: front arrived while airborne, waiting
    lastWreck: -Infinity, floorOn: false, floorLeft: 0, recovering: false,
    minGap: g('gapStart'), t: 0, hits: 0, hitTotal: 0,
  });
  s = fresh();

  const caughtEv = (dist) => { s.caught = true; s.caughtDist = dist; s.gap = Math.max(0, s.gap); return { type: 'caught', dist }; };

  function step(dt, dist, flags) {
    const ev = [];
    if (s.caught) return ev;
    const f = flags || {};
    s.t += dt;
    s.vf = frontSpeed(dist, f.lap, cfg);
    s.gap += ((f.speed || 0) - s.vf) * dt;
    if (s.gap > g('gapSoft')) s.gap -= (s.gap - g('gapSoft')) * g('gapDecay') * dt;
    if (s.gap > g('gapMax')) s.gap = g('gapMax');
    // wreck floor: clamps gap only, the front keeps moving
    if (s.floorOn) {
      if (s.gap < g('recoverFloor')) s.gap = g('recoverFloor');
      if (!s.recovering) { s.floorLeft -= dt; if (s.floorLeft <= 0) s.floorOn = false; }
    }
    if (s.gap < s.minGap) s.minGap = s.gap;
    const st = stageFor(s.gap, s.stage, cfg);
    if (st !== s.stage) { s.stage = st; ev.push({ type: 'night_stage', stage: st, gap: s.gap }); }
    // caught: gap <= 0 outside the floor; in the air wait for touchdown or airCaughtMax
    if (s.airT >= 0) {
      s.airT += dt;
      if (!f.air || s.airT >= g('airCaughtMax')) ev.push(caughtEv(dist));
    } else if (s.gap <= 0 && !s.floorOn) {
      if (f.air && g('airCaughtMax') > 0) { s.airT = 0; s.gap = 0; }
      else ev.push(caughtEv(dist));
    }
    return ev;
  }

  function hitGap(amount, cause) {
    if (s.caught || !(amount > 0)) return [];
    s.gap -= amount; s.hits++; s.hitTotal += amount;
    if (s.gap < s.minGap) s.minGap = s.gap;
    return [{ type: 'gap_hit', amount, cause: cause || 'miss' }];
  }

  function onWreckStart(dist) {
    s.floorOn = (dist - s.lastWreck) > g('recoverFloorCool');
    s.floorUsed = (s.floorUsed || 0) + (s.floorOn ? 1 : 0);
    s.lastWreck = dist; s.recovering = true; s.floorLeft = 0;
    if (s.floorOn && s.gap < g('recoverFloor')) s.gap = g('recoverFloor');
    return s.floorOn;
  }

  function onWreckEnd() {
    s.recovering = false;
    s.floorLeft = pick(cfg, 'recoverGrace') !== undefined ? pick(cfg, 'recoverGrace') : 1.5;
    if (!s.floorOn) s.floorLeft = 0;
  }

  const reset = () => { s = fresh(); };
  const state = () => ({
    gap: s.gap, vf: s.vf, stage: s.stage, caught: s.caught, caughtDist: s.caughtDist, airWait: s.airT >= 0,
    floorOn: s.floorOn, recovering: s.recovering, lastWreck: s.lastWreck, minGap: s.minGap, hits: s.hits,
    hitTotal: s.hitTotal, floorUsed: s.floorUsed || 0, t: s.t,
  });

  return {
    step, hitGap, onWreckStart, onWreckEnd, reset, state,
    get gap() { return s.gap; }, get vf() { return s.vf; }, get stage() { return s.stage; }, get caught() { return s.caught; },
  };
}
