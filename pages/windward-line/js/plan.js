// Windward Line - plan.js (M5). Pure: no DOM, no rng, no Date. Imports only ./contract.js.
import { TYPE, MAP_W, MAP_H, STAGES, idx, inMap, initGrid } from './contract.js';

const TOOLS = { zone: 1, break: 1, road: 1, crew: 1, pump: 1 };
const fail = (reason) => ({ ok: false, reason });

// ---------- geometry helpers ----------
function line(x0, y0, x1, y1) { // Bresenham, integer cells
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let n = 0; n < 4096; n++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}
function bcenter(b) { return { x: b.x + ((b.w - 1) >> 1), y: b.y + ((b.h - 1) >> 1) }; }
function findBuilding(state, id) { return state.map.buildings.find((b) => b.id === id) || null; }

export function buildingAt(state, x, y) {
  const cxl = Math.floor(x), cyl = Math.floor(y);
  let best = null, bd = Infinity;
  for (const b of state.map.buildings) {
    if (cxl >= b.x && cxl < b.x + b.w && cyl >= b.y && cyl < b.y + b.h) return b;
    const c = bcenter(b);
    const d = Math.hypot(c.x - cxl, c.y - cyl);
    if (d <= 3 && d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------- evaluate one action against the CURRENT state.grid/lists ----------
// returns {ok, reason, act (normalised), cost, cells?}
function prep(state, a) {
  const cfg = state.cfg, g = state.grid;
  if (!a || !TOOLS[a.t]) return fail('Unknown tool');
  if (a.t === 'zone') {
    let x = Math.round(a.x), y = Math.round(a.y), w = Math.round(a.w), h = Math.round(a.h);
    if (![x, y, w, h].every(Number.isFinite)) return fail('Bad shelter');
    if (w < 0) { x = x + w + 1; w = -w; }
    if (h < 0) { y = y + h + 1; h = -h; }
    const x1 = Math.min(MAP_W - 1, x + w - 1), y1 = Math.min(MAP_H - 1, y + h - 1);
    x = Math.max(0, x); y = Math.max(0, y);
    w = x1 - x + 1; h = y1 - y + 1;
    if (w < cfg.zoneMinSide || h < cfg.zoneMinSide) return fail('Too small');
    if (state.zones.length >= 250) return fail('Too many shelters');
    let bad = 0;
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) {
      const t = g.type[idx(xx, yy)]; if (t === TYPE.WATER || t === TYPE.ROCK) bad++;
    }
    if (bad > w * h * 0.5) return fail('Too much water or rock');
    const per = (w <= 2 || h <= 2) ? w * h : 2 * w + 2 * h - 4;
    return { ok: true, act: { t: 'zone', x, y, w, h }, cost: per * cfg.zoneCostPerCell };
  }
  if (a.t === 'break') {
    const width = Math.max(1, Math.min(5, Math.round(a.width || cfg.breakWidth)));
    const x0 = Math.round(a.x0), y0 = Math.round(a.y0), x1 = Math.round(a.x1), y1 = Math.round(a.y1);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return fail('Bad line');
    const xMajor = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    const lo = -(width >> 1);
    const seen = new Set(), cells = [];
    for (const [px, py] of line(x0, y0, x1, y1)) {
      for (let o = lo; o < lo + width; o++) {
        const xx = xMajor ? px : px + o, yy = xMajor ? py + o : py;
        if (!inMap(xx, yy)) continue;
        const i = idx(xx, yy);
        if (seen.has(i)) continue; seen.add(i);
        const t = g.type[i];
        // admin default: HOUSE also skipped so a break never erases a building
        if (t === TYPE.WATER || t === TYPE.ROCK || t === TYPE.ROAD || t === TYPE.BRIDGE || t === TYPE.HOUSE) continue;
        cells.push(i);
      }
    }
    if (!cells.length) return fail('Nothing to clear there');
    return { ok: true, act: { t: 'break', x0, y0, x1, y1, width }, cost: cells.length * cfg.breakCost, cells, width };
  }
  if (a.t === 'road') {
    const x0 = Math.round(a.x0), y0 = Math.round(a.y0), x1 = Math.round(a.x1), y1 = Math.round(a.y1);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return fail('Bad line');
    const cells = [], seen = new Set();
    for (const [px, py] of line(x0, y0, x1, y1)) {
      if (!inMap(px, py)) continue;
      const i = idx(px, py);
      if (seen.has(i)) continue; seen.add(i);
      const t = g.type[i];
      if (t === TYPE.ROAD || t === TYPE.BRIDGE || t === TYPE.ROCK || t === TYPE.HOUSE) continue; // not new / blocked
      cells.push(i);
    }
    if (!cells.length) return fail('Nothing new to build');
    return { ok: true, act: { t: 'road', x0, y0, x1, y1 }, cost: cells.length * cfg.roadCost, cells };
  }
  // crew / pump need a building
  const b = findBuilding(state, a.buildingId);
  if (!b) return fail('Needs a building');
  if (a.t === 'crew') {
    if (state.crews.some((c) => c.buildingId === b.id)) return fail('Already has a crew');
    return { ok: true, act: { t: 'crew', buildingId: b.id }, cost: cfg.crewBase + cfg.crewPerCell * b.cells.length, b };
  }
  // pump
  if (state.convs.length >= cfg.convMax) return fail('Only one pump house');
  if (state.convs.some((c) => c.buildingId === b.id)) return fail('Already a pump house');
  return { ok: true, act: { t: 'pump', buildingId: b.id }, cost: cfg.pumpCost, b };
}

function commit(state, p) {
  const g = state.grid, a = p.act;
  if (a.t === 'zone') {
    const id = state.zones.length;
    for (let yy = a.y; yy < a.y + a.h; yy++) for (let xx = a.x; xx < a.x + a.w; xx++) {
      const i = idx(xx, yy);
      g.zone[i] = id + 1;
      const t = g.type[i];
      if (t === TYPE.GRASS || t === TYPE.WOODS) g.type[i] = TYPE.CLEAR; // HOUSE stays HOUSE
    }
    state.zones.push({ id, x: a.x, y: a.y, w: a.w, h: a.h, gates: [], cap: Math.floor(a.w * a.h * state.cfg.zoneCapPerCell), inside: 0 });
  } else if (a.t === 'break') {
    const id = state.breaks.length;
    for (const i of p.cells) { g.type[i] = TYPE.CLEAR; g.brk[i] = id + 1; }
    state.breaks.push({ id, cells: p.cells, width: p.width, breached: false, jumped: false });
  } else if (a.t === 'road') {
    const id = state.roads.length;
    for (const i of p.cells) g.type[i] = g.type[i] === TYPE.WATER ? TYPE.BRIDGE : TYPE.ROAD;
    state.roads.push({ id, cells: p.cells });
  } else if (a.t === 'crew') {
    const c = bcenter(p.b);
    state.crews.push({ id: state.crews.length, buildingId: p.b.id, x: c.x, y: c.y, range: 0, tank: state.cfg.tank, hydrant: false, lost: false, pump: false });
  } else if (a.t === 'pump') {
    const c = bcenter(p.b);
    state.convs.push({ buildingId: p.b.id, kind: 'pump', x: c.x, y: c.y, radius: state.cfg.pumpRadius });
  }
}

// ---------- rebuild ----------
export function rebuild(state) {
  state.grid = initGrid(state.map);
  state.zones = []; state.breaks = []; state.roads = []; state.crews = []; state.convs = [];
  const cfg = state.cfg;
  let spent = 0;
  const kept = [];
  for (const a of state.plan) {
    const p = prep(state, a);
    if (!p.ok) continue; // cannot happen for plans built by applyAction; dropped defensively
    commit(state, p);
    kept.push(p.act);
    spent += p.cost;
  }
  if (kept.length !== state.plan.length) state.plan = kept;
  const g = state.grid;
  // gates for all zones (after all roads are in)
  for (const z of state.zones) {
    z.gates = [];
    for (let yy = z.y; yy < z.y + z.h; yy++) for (let xx = z.x; xx < z.x + z.w; xx++) {
      if (xx !== z.x && xx !== z.x + z.w - 1 && yy !== z.y && yy !== z.y + z.h - 1) continue;
      const t = g.type[idx(xx, yy)];
      if (t === TYPE.ROAD || t === TYPE.BRIDGE) z.gates.push(idx(xx, yy));
    }
  }
  // crews: range, hydrant
  for (const c of state.crews) {
    const b = findBuilding(state, c.buildingId);
    const cells = b ? b.cells.length : 1;
    c.pump = state.convs.some((v) => Math.hypot(v.x - c.x, v.y - c.y) <= v.radius);
    c.range = (cfg.crewRangeBase + Math.sqrt(cells)) * (c.pump ? cfg.pumpRangeMul : 1);
    c.hydrant = g.zone[idx(c.x, c.y)] > 0;
  }
  state.spent = spent;
  state.money = STAGES[state.stage].money - spent;
  return { ok: true, reason: 'Rebuilt' };
}

// ---------- public actions ----------
export function costOf(state, action) {
  const p = prep(state, action);
  return p.ok ? p.cost : 0;
}

export function applyAction(state, action) {
  if (state.phase !== 'plan') return fail('Plan is locked');
  if (!action || !TOOLS[action.t]) return fail('Unknown tool');
  if (!STAGES[state.stage].tools.includes(action.t)) return fail('Tool not unlocked');
  const p = prep(state, action);
  if (!p.ok) return p;
  if (p.cost > state.money) return fail('Not enough money');
  state.plan.push(p.act);
  rebuild(state);
  return { ok: true, reason: 'Done', cost: p.cost };
}

export function undo(state) {
  if (state.phase !== 'plan') return fail('Plan is locked');
  if (!state.plan.length) return fail('Nothing to undo');
  state.plan.pop();
  rebuild(state);
  return { ok: true, reason: 'Undone' };
}

export function refundAll(state) {
  if (state.phase !== 'plan') return fail('Plan is locked');
  state.plan = [];
  rebuild(state);
  return { ok: true, reason: 'Cleared' };
}

export function removeAt(state, x, y) {
  if (state.phase !== 'plan') return fail('Plan is locked');
  const fx = Math.floor(x), fy = Math.floor(y);
  if (!inMap(fx, fy)) return fail('Nothing there');
  const ci = idx(fx, fy);
  // map each plan action to its built object (one object per action, in order)
  const k = { zone: 0, break: 0, road: 0, crew: 0, pump: 0 };
  const hit = new Array(state.plan.length).fill(false);
  state.plan.forEach((a, n) => {
    const j = k[a.t]++;
    if (a.t === 'zone') hit[n] = fx >= a.x && fx < a.x + a.w && fy >= a.y && fy < a.y + a.h;
    else if (a.t === 'break') hit[n] = state.breaks[j].cells.includes(ci);
    else if (a.t === 'road') hit[n] = state.roads[j].cells.includes(ci);
    else { const b = findBuilding(state, a.buildingId); hit[n] = !!b && fx >= b.x && fx < b.x + b.w && fy >= b.y && fy < b.y + b.h; }
  });
  for (let n = state.plan.length - 1; n >= 0; n--) {
    if (hit[n]) {
      const t = state.plan[n].t;
      state.plan.splice(n, 1);
      rebuild(state);
      return { ok: true, reason: 'Removed ' + t };
    }
  }
  return fail('Nothing there');
}

export function planSummary(state) {
  let cap = 0;
  for (const z of state.zones) cap += z.cap;
  return { zones: state.zones.length, breaks: state.breaks.length, roads: state.roads.length, crews: state.crews.length, pumps: state.convs.length, cap, money: state.money };
}
