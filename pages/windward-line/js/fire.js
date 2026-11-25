// Windward Line - fire.js (variant A, M2a). Pure sim, no DOM, all randomness via state.rng fork 'fire'.
// Burning cells are tracked in a list (state._fire.list) so a tick costs O(burning), not O(map).
import { TYPE, BURNABLE, MAP_W, MAP_H, idx, cx, cy, windVec, pushEvent, sideName } from './contract.js';

const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const DIAG = 0.75; // admin default: diagonal neighbours spread a bit less so fronts look round, not square
const N = MAP_W * MAP_H;

function fz(state) {
  let f = state._fire;
  if (!f || f.grid !== state.grid || state.tick < f.tick) {
    // (re)build: first use, grid replaced by plan.rebuild, or state restarted
    const g = state.grid, list = [];
    let burntN = 0;
    for (let i = 0; i < N; i++) { if (g.burn[i] > 0) list.push(i); if (g.burnt[i]) burntN++; }
    f = state._fire = {
      grid: g, tick: state.tick, list, burntN, stamp: new Int32Array(N), stampId: 0,
      hacc: new Float32Array(N), hTouched: [], roadTouched: [], hotPrev: new Uint8Array(N), hotList: [],
      once: new Set(), centres: {},
    };
  }
  if (!state._fireRng) state._fireRng = (state.rng.fork ? state.rng.fork('fire') : state.rng);
  return f;
}

function wvec(state) {
  const w = state.wind || {};
  if (typeof w.vx === 'number' && typeof w.vy === 'number') return w;
  const v = windVec(w.deg || 0); return { vx: v.x, vy: v.y, level: w.level || 0 };
}

export function windFactor(state, dx, dy) {
  const cfg = state.cfg, w = wvec(state), len = Math.hypot(dx, dy);
  if (!len) return 1;
  const cos = (dx * w.vx + dy * w.vy) / len;
  const f = 1 + cfg.windK * (w.level || 0) * cos;
  return f < cfg.windFloor ? cfg.windFloor : (f > cfg.windCap ? cfg.windCap : f);
}

function ignitable(g, i) {
  return BURNABLE[g.type[i]] && g.burn[i] === 0 && !g.burnt[i] && g.zone[i] === 0;
}

function lightCell(state, f, i) {
  const g = state.grid;
  g.burn[i] = state.cfg.burnTicks[g.type[i]] || 8;
  f.list.push(i);
}

export function igniteAt(state, x, y, kind) {
  const f = fz(state), g = state.grid;
  x |= 0; y |= 0;
  let best = -1;
  for (let r = 0; r <= 2 && best < 0; r++) {
    for (let yy = y - r; yy <= y + r && best < 0; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
      if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
      if (ignitable(g, idx(xx, yy))) { best = idx(xx, yy); break; }
    }
  }
  if (best < 0) return false; // admin default: nothing burnable within 2 cells, strike fizzles
  lightCell(state, f, best);
  state.counts.burning = f.list.length;
  if (kind === 'strike' || kind === 'spot') {
    pushEvent(state, kind, cx(best), cy(best), kind === 'strike' ? 'Fire started in the ' + sideName(cx(best), cy(best)) : 'New spot fire in the ' + sideName(cx(best), cy(best)));
  }
  return true;
}

export function wetCell(state, i, ticks) {
  const g = state.grid;
  if (i < 0 || i >= N) return;
  if (g.wet[i] < ticks) g.wet[i] = ticks;
}

export function extinguish(state, i) {
  const g = state.grid;
  if (i < 0 || i >= N || g.burn[i] <= 0) return;
  g.burn[i] = 0; // stays fuel (not burnt); wet factor applied by caller
  const f = state._fire;
  if (f && f.grid === g) { const k = f.list.indexOf(i); if (k >= 0) f.list.splice(k, 1); state.counts.burning = f.list.length; }
}

function breakCentre(state, f, id) {
  let c = f.centres[id];
  if (c) return c;
  const b = state.breaks[id];
  let sx = 0, sy = 0, n = 0;
  if (b && b.cells) for (const i of b.cells) { sx += cx(i); sy += cy(i); n++; }
  c = f.centres[id] = n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : { x: MAP_W / 2, y: MAP_H / 2 };
  return c;
}

export function fireStep(state) {
  const f = fz(state), cfg = state.cfg, g = state.grid, rng = state._fireRng;
  const w = wvec(state), level = w.level || 0, counts = state.counts;
  f.tick = state.tick;
  const type = g.type, burn = g.burn, burnt = g.burnt, wet = g.wet, brk = g.brk, zone = g.zone, heat = g.heat;

  // wind factor tables for this tick
  const wf8 = new Float32Array(8);
  for (let k = 0; k < 8; k++) wf8[k] = windFactor(state, DX[k], DY[k]) * (DX[k] && DY[k] ? DIAG : 1);
  const R = cfg.breakHeatR | 0, SR = 2 * R + 1;
  const hasBreaks = state.breaks && state.breaks.length > 0;
  let wfR = null;
  if (hasBreaks) {
    wfR = new Float32Array(SR * SR);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) wfR[(dy + R) * SR + dx + R] = windFactor(state, dx, dy);
  }

  // clear last tick's scratch
  for (const i of f.roadTouched) heat[i] = 0;
  f.roadTouched.length = 0;
  for (const i of f.hTouched) f.hacc[i] = 0;
  f.hTouched.length = 0;

  const stampId = ++f.stampId, stamp = f.stamp;
  const fresh = [];
  const list = f.list;
  const emberMul = (t) => (t === TYPE.HOUSE ? 1.5 : t === TYPE.GRASS ? 0.3 : 1);
  const wx = w.vx, wy = w.vy;
  const windAng = Math.atan2(wy, wx);
  const coneRad = cfg.emberConeDeg * Math.PI / 180;
  const flight = cfg.emberFlightBase + cfg.emberFlightPerW * level;

  // pass 1: spread, ember spawn, road heat, break heat accumulation (burning cells in list order)
  for (let li = 0; li < list.length; li++) {
    const i = list[li];
    if (burn[i] <= 0) continue; // extinguished externally
    const x = i % MAP_W, y = (i / MAP_W) | 0, t = type[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const n = ny * MAP_W + nx, nt = type[n];
      if (nt === TYPE.ROAD || nt === TYPE.BRIDGE) {
        if (heat[n] === 0) f.roadTouched.push(n);
        heat[n]++;
        continue;
      }
      if (!BURNABLE[nt] || burn[n] > 0 || burnt[n] || zone[n] !== 0 || stamp[n] === stampId) continue;
      let p = cfg.ignite[nt] * wf8[k];
      if (wet[n] > 0) p *= cfg.wetFactor;
      if (rng.next() < p) { stamp[n] = stampId; fresh.push(n); }
    }
    // embers
    if (level >= 0 && rng.next() < cfg.emberRate * (1 + level) * emberMul(t)) {
      const a = windAng + (rng.next() * 2 - 1) * coneRad;
      state.embers.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * cfg.emberSpeed, vy: Math.sin(a) * cfg.emberSpeed, left: flight, from: { x, y }, crossed: null });
    }
    // firebreak heat
    if (hasBreaks) {
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= MAP_H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= MAP_W) continue;
          const c = yy * MAP_W + xx;
          if (brk[c] === 0) continue;
          // heat flows from burning cell (x,y) toward brk cell c: direction (dx,dy)
          if (f.hacc[c] === 0) f.hTouched.push(c);
          f.hacc[c] += cfg.heatW[t] * (dx || dy ? wfR[(dy + R) * SR + dx + R] : 1);
        }
      }
    }
  }

  // firebreak: heat above hold ignites a burnable cell downwind within width+1
  for (let ti = 0; ti < f.hTouched.length; ti++) {
    const c = f.hTouched[ti], h = f.hacc[c], id = brk[c] - 1;
    const b = state.breaks[id];
    const width = (b && b.width) || cfg.breakWidth;
    const hold = cfg.breakHoldPerW * width;
    if (h <= hold) continue;
    if (rng.next() >= Math.min(1, (h - hold) / hold)) continue;
    const kk = 1 + rng.int(width + 1);
    const tx = Math.round((c % MAP_W) + wx * kk), ty = Math.round(((c / MAP_W) | 0) + wy * kk);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
    const n = ty * MAP_W + tx;
    if (!ignitable(g, n) || stamp[n] === stampId) continue;
    stamp[n] = stampId; fresh.push(n);
    if (b && !b.breached) {
      b.breached = true;
      const bc = breakCentre(state, f, id);
      pushEvent(state, 'break-breach', tx, ty, 'Fire broke the ' + sideName(bc.x, bc.y) + ' break');
    }
  }

  // embers in flight
  const embers = state.embers;
  let keep = 0;
  for (let ei = 0; ei < embers.length; ei++) {
    const e = embers[ei];
    const sp = Math.hypot(e.vx, e.vy) || 1;
    const sub = Math.max(1, Math.ceil(sp / 0.5));
    const step = Math.min(sp, e.left), frac = step / sp;
    for (let s = 1; s <= sub; s++) {
      const px = e.x + e.vx * frac * s / sub, py = e.y + e.vy * frac * s / sub;
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) break;
      const bid = brk[iy * MAP_W + ix];
      if (bid) { if (!e.crossed) e.crossed = []; if (e.crossed.indexOf(bid - 1) < 0) e.crossed.push(bid - 1); }
    }
    e.x += e.vx * frac; e.y += e.vy * frac; e.left -= step;
    const ix = Math.floor(e.x), iy = Math.floor(e.y);
    if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) continue; // flew off map
    if (e.left > 1e-6) { embers[keep++] = e; continue; }
    // landing
    const n = iy * MAP_W + ix;
    if (zone[n] !== 0) {
      const zid = zone[n] - 1, key = 'zone' + zid;
      if (!f.once.has(key)) { f.once.add(key); pushEvent(state, 'zone-hit', ix, iy, 'Embers reached the ' + sideName(ix, iy) + ' shelter'); }
      continue;
    }
    if (!ignitable(g, n) || stamp[n] === stampId) continue;
    let p = cfg.emberLand[type[n]];
    if (wet[n] > 0) p *= cfg.wetFactor;
    if (rng.next() < p) {
      stamp[n] = stampId; fresh.push(n);
      if (e.crossed) for (const id of e.crossed) {
        const b = state.breaks[id];
        if (b && !b.jumped) { b.jumped = true; pushEvent(state, 'ember-jump', ix, iy, 'Embers jumped the ' + sideName(breakCentre(state, f, id).x, breakCentre(state, f, id).y) + ' break'); }
      }
    }
  }
  embers.length = keep;

  // burn countdown (existing burning cells only; fresh ones start next tick)
  let out = 0;
  for (let li = 0; li < list.length; li++) {
    const i = list[li];
    if (burn[i] <= 0) continue;
    if (--burn[i] <= 0) { burn[i] = 0; burnt[i] = 1; f.burntN++; } else list[out++] = i;
  }
  list.length = out;

  // apply new ignitions
  for (let k = 0; k < fresh.length; k++) lightCell(state, f, fresh[k]);

  // hot roads
  const hotNow = [];
  for (const i of f.roadTouched) if (heat[i] >= 3) hotNow.push(i);
  const newly = [];
  for (const i of hotNow) if (!f.hotPrev[i]) newly.push(i);
  for (const i of f.hotList) f.hotPrev[i] = 0;
  for (const i of hotNow) f.hotPrev[i] = 1;
  f.hotList = hotNow;
  for (const i of newly) {
    const x = cx(i), y = cy(i);
    if (state.zones) for (const z of state.zones) {
      const key = 'gate' + z.id;
      if (f.once.has(key) || !z.gates || z.gates.indexOf(i) < 0) continue;
      f.once.add(key);
      pushEvent(state, 'gate-closed', x, y, 'Gate closed at the ' + sideName(z.x + (z.w >> 1), z.y + (z.h >> 1)) + ' shelter');
    }
    if (!f.once.has('road-cut') && state.people && state.people.n > 0) {
      const P = state.people; let c = 0;
      for (let p = 0; p < P.n; p++) {
        if (P.mode[p] !== 2) continue;
        const dx = P.x[p] - x, dy = P.y[p] - y;
        if (dx * dx + dy * dy <= 100 && ++c >= 20) break;
      }
      if (c >= 20) { f.once.add('road-cut'); pushEvent(state, 'road-cut', x, y, 'Road cut ' + sideName(x, y)); }
    }
  }

  // wet decay
  for (let i = 0; i < N; i++) if (wet[i] > 0) wet[i]--;

  counts.burning = list.length;
  counts.burnt = f.burntN;
}
