// Windward Line - sim.js (M4). Pure: no DOM, no Math.random, no Date.
import {
  TYPE, MODE, PHASE, MAP_W, MAP_H, STAGES, BURNABLE, idx, cx, cy, inMap,
  defaultCfg, cloneCfg, secToTicks, fmtTime, sideName, windVec, pushEvent, initGrid,
} from './contract.js';
import { makeRng } from './rng.js';
import { buildMap } from './map.js';
import { fireStep, igniteAt, wetCell, extinguish } from './fire.js';
import { spawnPeople, buildFlow, peopleStep } from './people.js';

const norm360 = (d) => ((d % 360) + 360) % 360;

export function createState(stage, cfg, seed) {
  cfg = cloneCfg(cfg || defaultCfg);
  const S = STAGES[stage];
  const map = buildMap(stage);
  const v = windVec(S.windDeg);
  const hasShift = S.shiftAtSec > 0 && S.shiftDeg != null;
  const N = MAP_W * MAP_H;
  return {
    stage, seed, cfg, rng: makeRng(seed), phase: PHASE.PLAN, tick: 0, speed: 1, paused: false,
    map, grid: initGrid(map),
    wind: { deg: S.windDeg, level: S.windLevel, vx: v.x, vy: v.y,
      shiftAtTick: hasShift ? secToTicks(cfg, S.shiftAtSec) : null, shiftDeg: hasShift ? S.shiftDeg : null, shifted: false },
    embers: [],
    people: { n: 0, x: new Float32Array(0), y: new Float32Array(0), mode: new Uint8Array(0), hp: new Float32Array(0), freeze: new Int16Array(0), home: new Int16Array(0) },
    plan: [], zones: [], breaks: [], roads: [], crews: [], convs: [],
    callins: { bomber: { left: cfg.bomberUses }, dozer: { left: cfg.dozerUses }, queue: [] },
    money: S.money, spent: 0,
    counts: { people0: S.people, safe: 0, lost: 0, burning: 0, burnt: 0, inZone: 0 },
    events: [], firstBreach: null, spotIndex: 0, nextSpotTick: S.newSpotEvery > 0 ? secToTicks(cfg, S.newSpotEvery) : Infinity, quietTicks: 0,
    inputs: [], result: null,
    _sprayHits: new Uint8Array(N),
  };
}

export function startRun(state) {
  if (state.phase !== PHASE.PLAN) return { ok: false, reason: 'not in plan phase' };
  const { cfg } = state, S = STAGES[state.stage];
  spawnPeople(state);
  state.nextSpotTick = S.newSpotEvery > 0 ? secToTicks(cfg, S.newSpotEvery) : Infinity;
  state.wind.shiftAtTick = (S.shiftAtSec > 0 && S.shiftDeg != null) ? secToTicks(cfg, S.shiftAtSec) : null;
  state.wind.shiftDeg = state.wind.shiftAtTick == null ? null : S.shiftDeg;
  state._sprayHits = new Uint8Array(MAP_W * MAP_H);
  state._accSec = 0;
  // balance-1 (admin default): one shelter holds at most cfg.zoneCapMax people, so one big box cannot hold the town
  for (const z of state.zones) z.cap = Math.min(z.cap, cfg.zoneCapMax);
  for (const c of state.crews) {
    c.tank = cfg.tank; c.lost = false; c._acc = 0;
    // admin default: water refill if any WATER cell within refillWaterDist
    c._water = false;
    const R = Math.ceil(cfg.refillWaterDist);
    for (let y = Math.max(0, Math.floor(c.y) - R); y <= Math.min(MAP_H - 1, Math.floor(c.y) + R) && !c._water; y++)
      for (let x = Math.max(0, Math.floor(c.x) - R); x <= Math.min(MAP_W - 1, Math.floor(c.x) + R); x++)
        if (state.grid.type[idx(x, y)] === TYPE.WATER && Math.hypot(x - c.x, y - c.y) <= cfg.refillWaterDist) { c._water = true; break; }
  }
  state.phase = PHASE.RUN;
  buildFlow(state);
  return { ok: true };
}

// push a strike/spot event only if igniteAt did not already
function ignite(state, x, y, kind) {
  const before = state.events.length;
  igniteAt(state, x, y, kind);
  // integrator, admin default: a strike/spot lights a small plus-shaped cluster so it never fizzles out at once
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inMap(x + dx, y + dy) && BURNABLE[state.grid.type[idx(x + dx, y + dy)]] && !state.grid.burnt[idx(x + dx, y + dy)] && !state.grid.zone[idx(x + dx, y + dy)] && state.grid.burn[idx(x + dx, y + dy)] <= 0) igniteAt(state, x + dx, y + dy, 'spread');
  let seen = false;
  for (let i = before; i < state.events.length; i++) if (state.events[i].kind === kind) seen = true;
  if (!seen) pushEvent(state, kind, x, y, kind === 'strike' ? 'Lightning strike' : 'New spot fire');
}

function lineCells(state, x, y, len, width) {
  const px = -state.wind.vy, py = state.wind.vx, wx = state.wind.vx, wy = state.wind.vy;
  const seen = new Set(), out = [];
  for (let k = 0; k < len; k++) {
    const a = k - (len - 1) / 2;
    for (let w = 0; w < width; w++) {
      const b = w - (width - 1) / 2;
      const X = Math.round(x + px * a + wx * b), Y = Math.round(y + py * a + wy * b);
      if (!inMap(X, Y)) continue;
      const i = idx(X, Y);
      if (!seen.has(i)) { seen.add(i); out.push(i); }
    }
  }
  return out;
}

function resolveCallins(state) {
  const { cfg, grid } = state;
  for (const q of state.callins.queue) {
    if (q.done || q.atTick > state.tick) continue;
    q.done = true;
    if (q.type === 'bomber') {
      for (const i of lineCells(state, q.x, q.y, cfg.bomberLen, cfg.bomberWidth)) {
        if (grid.burn[i] > 0) extinguish(state, i);
        wetCell(state, i, cfg.wetTicks);
      }
      pushEvent(state, 'callin-drop', q.x, q.y, 'Water bomber drop');
    } else if (q.type === 'dozer') {
      for (const i of lineCells(state, q.x, q.y, cfg.dozerLen, 2)) {
        const t = grid.type[i];
        if (!BURNABLE[t]) continue;
        if (t === TYPE.HOUSE) continue; // admin default: dozer never razes buildings
        if (grid.zone[i]) continue;
        if (grid.burn[i] > 0) extinguish(state, i);
        grid.type[i] = TYPE.CLEAR;
      }
      pushEvent(state, 'callin-drop', q.x, q.y, 'Dozer line cut');
    }
  }
}

function buildingBurning(state, id) {
  const b = state.map.buildings.find((o) => o.id === id);
  if (!b) return false;
  for (const i of b.cells) if (state.grid.burn[i] > 0) return true;
  return false;
}

function crewStep(state, refillNow) {
  const { cfg, grid } = state, hits = state._sprayHits;
  for (const c of state.crews) {
    if (c.lost) continue;
    if (buildingBurning(state, c.buildingId)) { c.lost = true; continue; }
    if (refillNow) {
      if (c.hydrant) c.tank = cfg.tank;
      else if (c._water) c.tank = Math.min(cfg.tank, c.tank + cfg.refill * (c.pump ? cfg.pumpRefillMul : 1));
    }
    if (c.tank < 1) continue;
    c._acc = (c._acc || 0) + cfg.sprayPerTick * (c.pump ? cfg.pumpRateMul : 1);
    let n = Math.floor(c._acc);
    c._acc -= n;
    if (n <= 0) continue;
    const R = c.range + 2;
    const x0 = Math.max(0, Math.floor(c.x - R)), x1 = Math.min(MAP_W - 1, Math.ceil(c.x + R));
    const y0 = Math.max(0, Math.floor(c.y - R)), y1 = Math.min(MAP_H - 1, Math.ceil(c.y + R));
    const burning = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (grid.burn[i] > 0) burning.push({ i, x, y, d: Math.hypot(x - c.x, y - c.y) });
    }
    if (!burning.length) continue;
    const inRange = burning.filter((o) => o.d <= c.range).sort((a, b) => a.d - b.d || a.i - b.i);
    for (const o of inRange) {
      if (n <= 0 || c.tank < 1) break;
      wetCell(state, o.i, cfg.wetTicks); c.tank -= 1; n--;
      if (++hits[o.i] >= cfg.sprayOutTicks) { extinguish(state, o.i); hits[o.i] = 0; }
    }
    if (n > 0 && c.tank >= 1) {
      // pre-wet: nearest unwet burnable cell in range within 2 of a burning cell
      const cand = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - c.x, y - c.y); if (d > c.range) continue;
        const i = idx(x, y);
        if (!BURNABLE[grid.type[i]] || grid.burnt[i] || grid.burn[i] > 0 || grid.wet[i] > 0 || (grid.zone[i] && grid.type[i] !== TYPE.HOUSE)) continue;
        let near = false;
        for (const b of burning) if (Math.abs(b.x - x) <= 2 && Math.abs(b.y - y) <= 2) { near = true; break; }
        if (near) cand.push({ i, d });
      }
      cand.sort((a, b) => a.d - b.d || a.i - b.i);
      for (let k = 0; k < cand.length && n > 0 && c.tank >= 1; k++, n--) { wetCell(state, cand[k].i, cfg.wetTicks); c.tank -= 1; }
    }
  }
}

export function step(state) {
  if (state.phase !== PHASE.RUN) return;
  const { cfg, wind, map } = state, S = STAGES[state.stage];
  // 1 wind
  if (wind.shiftAtTick != null && !wind.shifted) {
    const warnAt = Math.max(0, wind.shiftAtTick - secToTicks(cfg, cfg.forecastLeadSec));
    if (state.tick === warnAt && !wind._warned) { wind._warned = true; pushEvent(state, 'wind-shift-warn', MAP_W / 2, MAP_H / 2, 'Wind about to shift'); }
    if (state.tick >= wind.shiftAtTick) {
      wind.deg = norm360(wind.deg + wind.shiftDeg);
      const v = windVec(wind.deg); wind.vx = v.x; wind.vy = v.y; wind.shifted = true;
      pushEvent(state, 'wind-shift', MAP_W / 2, MAP_H / 2, 'Wind shifted');
    }
  }
  // 2 strikes and spots
  for (const s of map.strikes) if (secToTicks(cfg, s.atSec) === state.tick) ignite(state, s.x, s.y, 'strike');
  if (S.newSpotEvery > 0 && state.tick >= state.nextSpotTick) {
    const lim = Math.min(cfg.spotMax, map.spots.length);
    if (state.spotIndex < lim) { const p = map.spots[state.spotIndex++]; ignite(state, p.x, p.y, 'spot'); }
    state.nextSpotTick += secToTicks(cfg, S.newSpotEvery);
  }
  // 3 call-ins
  resolveCallins(state);
  // 4 crews
  const perSec = Math.max(1, secToTicks(cfg, 1));
  crewStep(state, state.tick % perSec === 0);
  // 5 fire, 6 people
  fireStep(state);
  peopleStep(state);
  state.tick++;
  // 7 end
  checkEnd(state);
}

function pendingSchedule(state) {
  const { cfg, map } = state, S = STAGES[state.stage];
  for (const s of map.strikes) if (secToTicks(cfg, s.atSec) >= state.tick) return true;
  if (S.newSpotEvery > 0 && state.spotIndex < Math.min(cfg.spotMax, map.spots.length)) return true;
  return false;
}

export function checkEnd(state) {
  if (state.phase !== PHASE.RUN) return false;
  const { cfg } = state;
  let burning = false;
  const b = state.grid.burn;
  for (let i = 0; i < b.length; i++) if (b[i] > 0) { burning = true; break; }
  // quiet = no fire/ember at all, OR (lead call, admin default) no fire/ember within cfg.quietR cells of any alive
  // person outside a shelter, once nothing more is scheduled. Keeps rounds near 90/120 s while far woods smoulder.
  let quiet = false;
  if (!pendingSchedule(state)) {
    if (!burning && state.embers.length === 0) quiet = true;
    else { const near = threatNearPeople(state); if (near) state._threatSeen = true; else if (state._threatSeen) quiet = true; }
  } else if (burning && !state._threatSeen && threatNearPeople(state)) state._threatSeen = true;
  if (quiet) state.quietTicks++; else state.quietTicks = 0;
  if (state.quietTicks >= secToTicks(cfg, cfg.endQuietSec) || state.tick * cfg.tickSec >= cfg.roundMaxSec) { finishRun(state); return true; }
  return false;
}

const QB = 8, QBW = MAP_W / QB, QBH = MAP_H / QB;
const qMask = new Uint8Array(QBW * QBH);
function threatNearPeople(state) {
  const P = state.people, R = Math.ceil((state.cfg.quietR || 24) / QB);
  qMask.fill(0);
  let any = false;
  for (let k = 0; k < P.n; k++) {
    const m = P.mode[k]; if (m === MODE.SAFE || m === MODE.LOST) continue;
    const bx = (P.x[k] / QB) | 0, by = (P.y[k] / QB) | 0;
    for (let y = Math.max(0, by - R); y <= Math.min(QBH - 1, by + R); y++)
      for (let x = Math.max(0, bx - R); x <= Math.min(QBW - 1, bx + R); x++) qMask[y * QBW + x] = 1;
    any = true;
  }
  if (!any) return false;
  const b = state.grid.burn;
  for (let i = 0; i < b.length; i++) if (b[i] > 0 && qMask[((((i / MAP_W) | 0) / QB) | 0) * QBW + (((i % MAP_W) / QB) | 0)]) return true;
  for (const e of state.embers) { const x = (e.x / QB) | 0, y = (e.y / QB) | 0; if (x >= 0 && y >= 0 && x < QBW && y < QBH && qMask[y * QBW + x]) return true; }
  return false;
}

// Score (lead call, admin default): % of people ALIVE at end (not LOST), like the reference's "% saved".
// Shelters, breaks and refuge matter because they keep people alive. safe/refuge kept as stats.
function score(state) {
  const { people, grid, counts } = state;
  let safe = 0, refuge = 0, lost = 0, alive = 0;
  const t = grid.type;
  const exp = people.exp;
  for (let k = 0; k < people.n; k++) {
    const m = people.mode[k];
    if (m === MODE.LOST || people.hp[k] <= 0) { lost++; continue; }
    if (m === MODE.SAFE) { alive++; safe++; continue; }
    const x = Math.round(people.x[k]), y = Math.round(people.y[k]);
    let ok = false;
    for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inMap(x + dx, y + dy)) continue;
      const tt = t[idx(x + dx, y + dy)];
      if (tt === TYPE.WATER || tt === TYPE.ROCK) { ok = true; break; }
    }
    if (ok) { refuge++; alive++; continue; }
    // balance-1 (admin default): outside a shelter/refuge, only people never within cfg.exposeR of fire count alive
    if (exp && exp[k]) { lost++; continue; }
    alive++;
  }
  const p0 = counts.people0 || 1;
  if (!people.n) alive = p0; // run never started people: nobody lost
  return { safe, refuge, lost, alive, pct: Math.floor(alive / p0 * 100) };
}

export function finishRun(state) {
  if (state.phase === PHASE.RESULT) return state.result;
  const sc = score(state), { cfg } = state;
  state.counts.safe = sc.safe; state.counts.refuge = sc.refuge; state.counts.lost = sc.lost; state.counts.alive = sc.alive;
  state.phase = PHASE.RESULT;
  state._pct = sc.pct;
  const stars = cfg.stars.filter((s) => sc.pct >= s).length;
  state.result = { win: sc.pct >= cfg.winFloor, pct: sc.pct, stars, cause: '', hash: '', sec: state.tick * cfg.tickSec };
  state.result.cause = causeLine(state);
  state.result.hash = hashState(state);
  return state.result;
}

export function causeLine(state) {
  const pct = state.result ? state.result.pct : (state._pct != null ? state._pct : score(state).pct);
  const win = pct >= state.cfg.winFloor;
  const fb = state.firstBreach, sec = (e) => fmtTime(e.tick * state.cfg.tickSec);
  const fl = state.events.find((e) => e.kind === 'first-loss');
  if (win) {
    // balance-1: one line that still reads well when many were lost
    const lost = state.counts.alive != null && state.counts.people0 ? state.counts.people0 - state.counts.alive : 0;
    if (lost <= 0) return 'Passed: ' + pct + '% alive';
    return `Passed: ${pct}% alive (${lost} lost)` + (fl ? `. First loss: ${sideName(fl.x, fl.y)} at ${sec(fl)}` : '');
  }
  if (fl && !(state.zones && state.zones.length)) return `No shelter: fire reached people in the ${sideName(fl.x, fl.y)} at ${sec(fl)}`;
  if (fb) {
    const side = sideName(fb.x, fb.y), t = sec(fb);
    switch (fb.kind) {
      case 'break-breach': {
        const shifted = state.events.some((e) => e.kind === 'wind-shift' && e.tick <= fb.tick);
        return shifted ? `Wind shift hit ${side} break at ${t}` : `Fire broke the ${side} break at ${t}`;
      }
      case 'ember-jump': return `Embers jumped the ${side} break at ${t}`;
      case 'zone-hit': return `Embers reached the ${side} shelter at ${t}`;
      case 'road-cut': return `Road cut ${side} at ${t}`;
      case 'gate-closed': return `Gate closed at the ${side} shelter at ${t}`;
    }
  }
  if (fl) return `Fire reached people in the ${sideName(fl.x, fl.y)} at ${sec(fl)}, no shelter near`;
  return 'Fire burned out, only ' + pct + '% alive';
}

export function hashState(state) {
  let h = 0x811c9dc5;
  const b = (v) => { h ^= v & 255; h = Math.imul(h, 16777619); };
  const w = (v) => { v = v | 0; b(v); b(v >> 8); b(v >> 16); b(v >> 24); };
  w(state.tick);
  const { burn, burnt } = state.grid;
  for (let i = 0; i < burn.length; i++) { b(burn[i]); b(burn[i] >> 8); b(burnt[i]); }
  const p = state.people;
  for (let k = 0; k < p.n; k++) { w((p.x[k] * 4) | 0); w((p.y[k] * 4) | 0); b(p.mode[k]); }
  w(Math.round(state.money));
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function queueCallin(state, type, x, y) {
  if (state.phase !== PHASE.RUN) return { ok: false, reason: 'call-ins only during the run' };
  if (!STAGES[state.stage].tools.includes(type) || !state.callins[type]) return { ok: false, reason: type + ' not available' };
  if (state.callins[type].left <= 0) return { ok: false, reason: 'no ' + type + ' left' };
  if (!inMap(Math.round(x), Math.round(y))) return { ok: false, reason: 'off the map' };
  const cfg = state.cfg, delay = type === 'bomber' ? cfg.bomberDelaySec : cfg.dozerDelaySec;
  state.callins[type].left--;
  state.callins.queue.push({ type, x, y, deg: state.wind.deg, atTick: state.tick + secToTicks(cfg, delay), done: false });
  state.inputs.push({ tick: state.tick, type, x, y });
  return { ok: true };
}

export function runToEnd(state, maxTicks = 20000) {
  for (let n = 0; state.phase === PHASE.RUN && n < maxTicks; n++) step(state);
  if (state.phase === PHASE.RUN) finishRun(state);
  return state;
}
