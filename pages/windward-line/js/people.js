// Windward Line - people (M3). Pure sim, no DOM, no Math.random/Date.
// Exports: spawnPeople(state), buildFlow(state), peopleStep(state).
import { TYPE, MODE, MAP_W, MAP_H, STAGES, secToTicks, sideName, pushEvent } from './contract.js';

const N = MAP_W * MAP_H;
const BS = 8, BW = MAP_W / BS, BH = MAP_H / BS, NB = BW * BH;
const SQ2 = 1.4142135;

// Scratch buffers (module level, reused every tick; never part of state).
const bcnt = new Uint16Array(NB), bsx = new Float32Array(NB), bsy = new Float32Array(NB), bnear = new Uint8Array(NB);
const occ = new Uint8Array(N);
const heapK = new Float32Array(N * 9 + 16), heapV = new Int32Array(N * 9 + 16);
let heapN = 0;
const DX = [-1, 0, 1, -1, 1, -1, 0, 1], DY = [-1, -1, -1, 0, 0, 1, 1, 1];

// terrain walk cost (0 = blocked). Admin default numbers from CONTRACT.
const COST = new Float32Array(16);
COST[TYPE.ROAD] = 1; COST[TYPE.BRIDGE] = 1; COST[TYPE.GRASS] = 1.5; COST[TYPE.CLEAR] = 1.5; COST[TYPE.WOODS] = 2; COST[TYPE.HOUSE] = 2;

function hpush(k, v) {
  let i = heapN++;
  while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p; }
  heapK[i] = k; heapV[i] = v;
}
function hpop() { // returns value, key left in popK
  const v = heapV[0]; popK = heapK[0];
  heapN--;
  if (heapN > 0) {
    const k = heapK[heapN], vv = heapV[heapN]; let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= heapN) break;
      if (c + 1 < heapN && heapK[c + 1] < heapK[c]) c++;
      if (heapK[c] >= k) break;
      heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c;
    }
    heapK[i] = k; heapV[i] = vv;
  }
  return v;
}
let popK = 0;

function walkable(g, i) { const t = g.type[i]; return t !== TYPE.WATER && t !== TYPE.ROCK && g.burn[i] === 0; }

export function spawnPeople(state) {
  const { map, cfg, grid } = state;
  const n = STAGES[state.stage].people;
  const rng = state.rng.fork('people');
  const P = {
    n, x: new Float32Array(n), y: new Float32Array(n), mode: new Uint8Array(n), hp: new Float32Array(n),
    freeze: new Int16Array(n), home: new Int16Array(n), tx: new Float32Array(n), ty: new Float32Array(n),
  };
  let homes = map.homes && map.homes.length ? map.homes : [{ x: map.town ? map.town.x + map.town.w / 2 : MAP_W / 2, y: map.town ? map.town.y + map.town.h / 2 : MAP_H * 0.8, r: 8, count: n }];
  let k = 0;
  for (let h = 0; h < homes.length && k < n; h++) {
    const c = Math.min(homes[h].count | 0, n - k);
    for (let j = 0; j < c; j++) placeAt(P, k++, h, homes[h], grid, rng);
  }
  for (let h = 0; k < n; h++) placeAt(P, k++, h % homes.length, homes[h % homes.length], grid, rng); // admin default: remainder spread round-robin
  for (let i = 0; i < n; i++) { P.hp[i] = cfg.hp; P.mode[i] = MODE.CALM; P.freeze[i] = 0; P.tx[i] = P.x[i]; P.ty[i] = P.y[i]; }
  state.people = P;
  state.counts.safe = 0; state.counts.lost = 0; state.counts.inZone = 0;
  for (const z of state.zones || []) z.inside = 0;
  state._prng = state.rng.fork('people-run');
  state._gtok = new Float32Array(N);
  state._gz = new Int16Array(N);
  state._flowTick = -1e9; state._flowDirty = true;
  return P;
}

function placeAt(P, i, h, home, grid, rng) {
  let x = home.x, y = home.y;
  for (let t = 0; t < 24; t++) {
    const a = rng.next() * 6.2831853, r = Math.sqrt(rng.next()) * home.r;
    const px = home.x + Math.cos(a) * r, py = home.y + Math.sin(a) * r;
    if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) continue;
    const ty = grid.type[(py | 0) * MAP_W + (px | 0)];
    x = px; y = py;
    if (ty !== TYPE.WATER && ty !== TYPE.ROCK) break;
  }
  P.x[i] = Math.min(MAP_W - 0.01, Math.max(0, x)); P.y[i] = Math.min(MAP_H - 0.01, Math.max(0, y)); P.home[i] = h;
}

export function buildFlow(state) {
  const g = state.grid, dist = g.dist, type = g.type, burn = g.burn, heat = g.heat, zone = g.zone;
  dist.fill(Infinity);
  if (!state._gtok) state._gtok = new Float32Array(N);
  if (!state._gz) state._gz = new Int16Array(N);
  const gz = state._gz; gz.fill(0);
  heapN = 0;
  const zones = state.zones || [];
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi];
    for (const gi of z.gates) gz[gi] = zi + 1;
    if (z.inside >= z.cap) continue;
    for (const gi of z.gates) {
      if (burn[gi] > 0 || heat[gi] >= 3) continue;
      if (dist[gi] === 0) continue;
      dist[gi] = 0; hpush(0, gi);
    }
  }
  while (heapN > 0) {
    const c = hpop(); const dc = popK;
    if (dc > dist[c]) continue;
    const x = c % MAP_W, y = (c / MAP_W) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (burn[ni] > 0) continue;
      const t = type[ni];
      let cost = COST[t];
      if (cost === 0) continue;
      if ((t === TYPE.ROAD || t === TYPE.BRIDGE) && heat[ni] >= 3) continue;
      if (zone[ni] > 0) cost = 1;
      if (d === 0 || d === 2 || d === 5 || d === 7) cost *= SQ2;
      const nd = dc + cost;
      if (nd < dist[ni]) { dist[ni] = nd; hpush(nd, ni); }
    }
  }
  state._flowTick = state.tick; state._flowDirty = false;
}

function rebuildBlocks(g) {
  bcnt.fill(0); bsx.fill(0); bsy.fill(0); bnear.fill(0);
  const burn = g.burn; let total = 0;
  for (let y = 0; y < MAP_H; y++) {
    const by = (y / BS) | 0, row = y * MAP_W;
    for (let x = 0; x < MAP_W; x++) {
      if (burn[row + x] > 0) { const b = by * BW + ((x / BS) | 0); bcnt[b]++; bsx[b] += x + 0.5; bsy[b] += y + 0.5; total++; }
    }
  }
  if (total) {
    for (let b = 0; b < NB; b++) {
      if (!bcnt[b]) continue;
      const bx = b % BW, by = (b / BW) | 0;
      for (let yy = Math.max(0, by - 1); yy <= Math.min(BH - 1, by + 1); yy++)
        for (let xx = Math.max(0, bx - 1); xx <= Math.min(BW - 1, bx + 1); xx++) bnear[yy * BW + xx] = 1;
    }
  }
  return total;
}

// Is there a burning block within r cells (block-rect distance, conservative)? returns true/false
function fireWithin(px, py, r) {
  const r2 = r * r;
  const b0x = Math.max(0, ((px - r) / BS) | 0), b1x = Math.min(BW - 1, ((px + r) / BS) | 0);
  const b0y = Math.max(0, ((py - r) / BS) | 0), b1y = Math.min(BH - 1, ((py + r) / BS) | 0);
  for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
    if (!bcnt[by * BW + bx]) continue;
    const rx0 = bx * BS, ry0 = by * BS;
    const dx = px < rx0 ? rx0 - px : (px > rx0 + BS ? px - rx0 - BS : 0);
    const dy = py < ry0 ? ry0 - py : (py > ry0 + BS ? py - ry0 - BS : 0);
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

function lose(state, P, i) {
  P.mode[i] = MODE.LOST;
  const first = state.counts.lost === 0;
  state.counts.lost++;
  if (first) pushEvent(state, 'first-loss', P.x[i], P.y[i], 'First loss in the ' + sideName(P.x[i], P.y[i]));
}

export function peopleStep(state) {
  const { cfg, grid: g } = state;
  const P = state.people; if (!P || !P.n) return;
  if (!state._prng) state._prng = state.rng.fork('people-run');
  if (!state._gtok) state._gtok = new Float32Array(N);
  if (!state._gz || state._flowTick === undefined) state._flowDirty = true;
  const rng = state._prng, dt = cfg.tickSec;
  if (state._flowDirty || state._flowTick === undefined || state.tick - state._flowTick >= secToTicks(cfg, cfg.repathSec)) buildFlow(state);

  const totalFire = rebuildBlocks(g);
  occ.fill(0);
  const zones = state.zones || [], gz = state._gz, tok = state._gtok;
  const rate = cfg.gateFlow * dt, tcap = Math.max(rate, 1) + 1;
  for (const z of zones) for (const gi of z.gates) tok[gi] = Math.min(tcap, tok[gi] + rate);

  const burn = g.burn, type = g.type, dist = g.dist;
  const wvx = state.wind ? state.wind.vx : 0, wvy = state.wind ? state.wind.vy : 0;
  const homes = state.map.homes;
  const freezeTicks = Math.max(1, secToTicks(cfg, cfg.freezeSec));
  const wanderStep = (cfg.walkSpd / 3) * dt; // 0.5 cells/s at default
  const awareR = cfg.awareR, roadCap = cfg.roadCap;
  const heatD = cfg.heatDps * dt, smokeD = cfg.smokeDps * dt, smokeLen = cfg.smokeLen;
  const px = P.x, py = P.y, mode = P.mode, hp = P.hp;
  let dirty = false;

  for (let i = 0; i < P.n; i++) {
    const m = mode[i];
    if (m === MODE.SAFE || m === MODE.LOST) continue;
    let x = px[i], y = py[i];
    let cxi = x | 0, cyi = y | 0, c = cyi * MAP_W + cxi;

    // --- lost checks
    if (burn[c] > 0) { lose(state, P, i); continue; }
    if (totalFire && bnear[((cyi / BS) | 0) * BW + ((cxi / BS) | 0)]) {
      let dmg = 0, hot = false;
      for (let yy = Math.max(0, cyi - 1); yy <= Math.min(MAP_H - 1, cyi + 1) && !hot; yy++)
        for (let xx = Math.max(0, cxi - 1); xx <= Math.min(MAP_W - 1, cxi + 1); xx++) if (burn[yy * MAP_W + xx] > 0) { hot = true; break; }
      if (hot) dmg += heatD;
      else {
        for (let k = 2; k <= smokeLen; k++) {
          const sx = Math.round(x - wvx * k), sy = Math.round(y - wvy * k);
          if (sx >= 0 && sy >= 0 && sx < MAP_W && sy < MAP_H && burn[sy * MAP_W + sx] > 0) { dmg += smokeD; break; }
        }
      }
      if (dmg > 0) { hp[i] -= dmg; if (hp[i] <= 0) { lose(state, P, i); continue; } }
    }

    // --- mode transitions
    if (m === MODE.CALM) {
      if (totalFire && fireWithin(x, y, awareR)) {
        mode[i] = MODE.AWARE;
        P.freeze[i] = rng.chance(cfg.freezeShare) ? freezeTicks : 1;
        continue;
      }
      // wander near home
      let tx = P.tx[i], ty = P.ty[i];
      const ddx = tx - x, ddy = ty - y, d = Math.hypot(ddx, ddy);
      if (d < 0.15) {
        if (rng.chance(0.08)) {
          const h = homes && homes.length ? homes[P.home[i]] : null;
          if (h) {
            const a = rng.next() * 6.2831853, r = Math.sqrt(rng.next()) * h.r;
            const nx = h.x + Math.cos(a) * r, ny = h.y + Math.sin(a) * r;
            if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && walkable(g, (ny | 0) * MAP_W + (nx | 0))) { P.tx[i] = nx; P.ty[i] = ny; }
          }
        }
        continue;
      }
      const s = Math.min(wanderStep, d);
      const nx = x + ddx / d * s, ny = y + ddy / d * s;
      if (walkable(g, (ny | 0) * MAP_W + (nx | 0))) { px[i] = nx; py[i] = ny; }
      else { P.tx[i] = x; P.ty[i] = y; }
      continue;
    }
    if (m === MODE.AWARE) {
      if (--P.freeze[i] <= 0) mode[i] = MODE.PANIC;
      continue;
    }

    // --- PANIC: gate admit, descend flow, or flee
    let admitted = tryAdmit(state, P, i, c, gz, tok, rng);
    if (admitted) { if (state._flowDirty) dirty = true; continue; }

    const t0 = type[c];
    const spd = (t0 === TYPE.ROAD || t0 === TYPE.BRIDGE) ? cfg.runRoad : cfg.runOff;
    let rem = spd * dt;
    const ox = (((i * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 0.5;
    const oy = (((i * 40503 + 17) >>> 0) % 1000 / 1000 - 0.5) * 0.5;
    let hops = 0, moved = false;
    while (rem > 1e-4 && hops++ < 4) {
      cxi = x | 0; cyi = y | 0; c = cyi * MAP_W + cxi;
      let best = -1, bd = Infinity;
      for (let d = 0; d < 8; d++) {
        const nx = cxi + DX[d], ny = cyi + DY[d];
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const ni = ny * MAP_W + nx;
        const dv = dist[ni];
        if (dv < bd && burn[ni] === 0) { bd = dv; best = ni; }
      }
      let tx, ty;
      if (best >= 0 && bd < Infinity && (dist[c] === Infinity || bd < dist[c])) {
        tx = (best % MAP_W) + 0.5 + ox; ty = ((best / MAP_W) | 0) + 0.5 + oy;
        if (hops === 1) { // soft capacity: crowded destination slows the dot
          const cap = (type[best] === TYPE.ROAD || type[best] === TYPE.BRIDGE) ? roadCap : roadCap * 2;
          if (occ[best] >= cap) rem *= 0.35;
        }
      } else if (dist[c] === Infinity) {
        const f = fleeDir(x, y);
        if (!f) break;
        let ok = false;
        for (let a = 0; a < 5 && !ok; a++) {
          const ang = [0, 0.785, -0.785, 1.571, -1.571][a], co = Math.cos(ang), si = Math.sin(ang);
          const dx = f.x * co - f.y * si, dy = f.x * si + f.y * co;
          const nx = x + dx * rem, ny = y + dy * rem;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          if (walkable(g, (ny | 0) * MAP_W + (nx | 0))) { x = nx; y = ny; ok = true; moved = true; }
        }
        break;
      } else break; // local minimum (waiting at a gate) - stay
      const ddx = tx - x, ddy = ty - y, d = Math.hypot(ddx, ddy);
      moved = true;
      if (d <= rem) { x = tx; y = ty; rem -= d; if (gz[(y | 0) * MAP_W + (x | 0)]) break; }
      else { x += ddx / d * rem; y += ddy / d * rem; rem = 0; }
    }
    if (moved) {
      x = Math.min(MAP_W - 0.01, Math.max(0, x)); y = Math.min(MAP_H - 0.01, Math.max(0, y));
      px[i] = x; py[i] = y;
      c = (y | 0) * MAP_W + (x | 0);
      if (occ[c] < 255) occ[c]++;
      if (tryAdmit(state, P, i, c, gz, tok, rng)) { if (state._flowDirty) dirty = true; }
    } else if (occ[c] < 255) occ[c]++;
  }

  let inZ = 0;
  for (const z of zones) inZ += z.inside;
  state.counts.inZone = inZ;
  if (dirty || state._flowDirty) buildFlow(state);
}

function tryAdmit(state, P, i, c, gz, tok, rng) {
  const zi = gz[c];
  if (!zi) return false;
  const z = state.zones[zi - 1];
  if (!z || z.inside >= z.cap || tok[c] < 1 || state.grid.burn[c] > 0 || state.grid.heat[c] >= 3) return false;
  tok[c] -= 1;
  z.inside++;
  let nx = z.x + z.w / 2, ny = z.y + z.h / 2;
  const t = state.grid.type;
  for (let k = 0; k < 8; k++) {
    const cx = z.x + rng.int(z.w), cy = z.y + rng.int(z.h);
    if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) continue;
    nx = cx + 0.1 + 0.8 * rng.next(); ny = cy + 0.1 + 0.8 * rng.next();
    const ty = t[cy * MAP_W + cx];
    if (ty !== TYPE.WATER && ty !== TYPE.ROCK) break;
  }
  P.x[i] = Math.min(MAP_W - 0.01, Math.max(0, nx)); P.y[i] = Math.min(MAP_H - 0.01, Math.max(0, ny));
  P.mode[i] = MODE.SAFE;
  state.counts.safe++;
  if (z.inside >= z.cap) state._flowDirty = true; // zone full: re-route the rest to the next nearest
  return true;
}

// unit vector pointing away from the nearest burning block (null if no fire)
function fleeDir(x, y) {
  let bd = Infinity, bx = 0, by = 0;
  for (let b = 0; b < NB; b++) {
    const n = bcnt[b]; if (!n) continue;
    const fx = bsx[b] / n, fy = bsy[b] / n, d = (fx - x) * (fx - x) + (fy - y) * (fy - y);
    if (d < bd) { bd = d; bx = fx; by = fy; }
  }
  if (bd === Infinity) return null;
  const d = Math.sqrt(bd) || 1;
  return { x: (x - bx) / d, y: (y - by) / d };
}
