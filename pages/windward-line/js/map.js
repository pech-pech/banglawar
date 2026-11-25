// Windward Line - hand-made valley map. Deterministic, no rng.
import { TYPE, STAGES, MAP_W as W, MAP_H as H } from './contract.js';

const G = TYPE.GRASS, WD = TYPE.WOODS, HO = TYPE.HOUSE, RD = TYPE.ROAD, WA = TYPE.WATER, RK = TYPE.ROCK, BR = TYPE.BRIDGE;
const I = (x, y) => y * W + x;
const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

const TOWN = { x: 18, y: 86, w: 62, h: 34 };          // admin default
const ROAD_X = [40, 62];                              // north roads (2 wide: x, x+1)
const RIVER_Y = 72;                                   // river centre line
const riverY = (x) => Math.round(RIVER_Y + 1.6 * Math.sin(x / 9) + 0.8 * Math.sin(x / 4.3));
const NECK_X0 = 8, NECK_W = 6;                        // stage 2 neck x 8..13

function ell(type, t, cx0, cy0, rx, ry, only) {
  for (let y = Math.floor(cy0 - ry); y <= Math.ceil(cy0 + ry); y++)
    for (let x = Math.floor(cx0 - rx); x <= Math.ceil(cx0 + rx); x++) {
      if (!ok(x, y)) continue;
      const dx = (x - cx0) / rx, dy = (y - cy0) / ry;
      if (dx * dx + dy * dy <= 1 && (!only || only === t[I(x, y)])) t[I(x, y)] = type;
    }
}

export function buildMap(stage) {
  stage = stage === 2 ? 2 : 1;
  const t = new Uint8Array(W * H);
  // base: forest north of y 68, grass south, handled per row
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[I(x, y)] = y < 68 ? WD : G;
  // south bank woods between river and town ring (y 75-80) mixed: leave grass; add patches later
  // meadows
  [[20, 12, 9, 5], [70, 18, 11, 6], [48, 34, 8, 4], [14, 48, 7, 5], [76, 50, 9, 5], [52, 60, 10, 4], [30, 26, 5, 3]]
    .forEach(([x, y, rx, ry]) => ell(G, t, x, y, rx, ry, WD));
  // rock outcrops
  [[30, 42, 4, 3], [58, 28, 3, 2], [84, 36, 4, 3], [8, 24, 3, 3], [66, 54, 3, 2], [44, 8, 3, 2], [88, 62, 3, 3]]
    .forEach(([x, y, rx, ry]) => ell(RK, t, x, y, rx, ry, WD));
  // river y ~70-74 (5 thick)
  for (let x = 0; x < W; x++) { const c = riverY(x); for (let y = c - 2; y <= c + 2; y++) t[I(x, y)] = WA; }
  // woods bank strips right on both banks (so a neck touches woods both sides)
  for (let x = 0; x < W; x++) { const c = riverY(x); for (const y of [c - 3, c - 4]) if (t[I(x, y)] === G) t[I(x, y)] = WD; }
  // town ring grass and woods patches near edges
  for (let y = TOWN.y - 6; y < H; y++) for (let x = TOWN.x - 6; x < TOWN.x + TOWN.w + 6; x++) if (ok(x, y) && t[I(x, y)] !== WA) t[I(x, y)] = G;
  [[9, 92, 5, 8], [88, 98, 5, 7], [30, 80, 6, 2], [70, 79, 6, 2], [10, 114, 5, 5], [86, 118, 5, 4], [50, 126, 8, 2]]
    .forEach(([x, y, rx, ry]) => ell(WD, t, x, y, rx, ry, null));
  // west woods strip on south bank linking neck to town flank
  for (let y = 75; y <= 104; y++) for (let x = 5; x <= 12; x++) if (t[I(x, y)] !== WA) t[I(x, y)] = WD;
  // stage 2 neck: woods across river line x 8..13
  const neck = [];
  if (stage === 2) {
    for (let x = NECK_X0; x < NECK_X0 + NECK_W; x++) for (let y = 64; y <= 80; y++) {
      t[I(x, y)] = WD; neck.push(I(x, y));
    }
  }
  // roads: two north roads (2 wide) from town top to y 4; bridges over water
  for (const rx of ROAD_X) for (let y = 4; y <= TOWN.y + TOWN.h - 4; y++) for (let x = rx; x <= rx + 1; x++) t[I(x, y)] = (t[I(x, y)] === WA) ? BR : RD;
  // town road grid
  const hy = [TOWN.y + 2, TOWN.y + 15, TOWN.y + 28];
  const vx = [TOWN.x + 2, 40, 62, TOWN.x + TOWN.w - 3];
  const ex = TOWN.x + TOWN.w - 1;
  for (const y of hy) for (let x = TOWN.x; x <= ex; x++) t[I(x, y)] = RD;
  for (const x of vx) for (let y = hy[0]; y <= hy[2]; y++) { t[I(x, y)] = RD; if (ROAD_X.includes(x)) t[I(x + 1, y)] = RD; }
  // link road from top row up to the north roads is already continuous (roads reach y 4..hy)
  // buildings: slots of 5x5 inside blocks
  const xs = [...vx.map((v) => (ROAD_X.includes(v) ? v + 2 : v + 1))];
  const blocksX = [], blocksY = [];
  const vEdges = vx.slice().sort((a, b) => a - b);
  let prev = TOWN.x;
  for (const v of vEdges) { const wRoad = ROAD_X.includes(v) ? 2 : 1; if (v - 1 >= prev + 4) blocksX.push([prev, v - 1]); prev = v + wRoad; }
  if (ex >= prev + 4) blocksX.push([prev, ex]);
  for (let i = 0; i < hy.length - 1; i++) blocksY.push([hy[i] + 1, hy[i + 1] - 1]);
  const slots = [];
  let rowN = 0;
  for (const [by0, by1] of blocksY) for (let sy = by0; sy + 3 <= by1; sy += 4, rowN++) {
    let colN = 0;
    for (const [bx0, bx1] of blocksX) for (let sx = bx0; sx + 3 <= bx1; sx += 4, colN++) slots.push({ sx, sy, odd: (rowN + colN) & 1 });
  }
  const TARGET = 36;
  let picked = slots.filter((s) => s.odd === 0);
  if (picked.length > TARGET) { const keep = []; const st = picked.length / TARGET; for (let i = 0; i < TARGET; i++) keep.push(picked[Math.floor(i * st)]); picked = keep; }
  // hall = pick nearest to town centre
  const tcx = TOWN.x + TOWN.w / 2, tcy = TOWN.y + TOWN.h / 2;
  let hallI = 0, best = 1e9;
  picked.forEach((s, i) => { const d = (s.sx + 2 - tcx) ** 2 + (s.sy + 2 - tcy) ** 2; if (d < best) { best = d; hallI = i; } });
  const buildings = [];
  picked.forEach((s, i) => {
    let kind = 'house', w = 2, h = 2;
    if (i === hallI) { kind = 'hall'; w = 4; h = 4; } else if (i % 8 === 3) { kind = 'barn'; w = 3; h = 3; }
    const x = s.sx + ((4 - w) >> 1), y = s.sy + ((4 - h) >> 1);
    const cells = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { t[I(xx, yy)] = HO; cells.push(I(xx, yy)); }
    buildings.push({ id: buildings.length, x, y, w, h, kind, cells });
  });
  // homes: largest remainder by cell count
  const people = STAGES[stage].people;
  const totalCells = buildings.reduce((a, b) => a + b.cells.length, 0);
  const raw = buildings.map((b) => people * b.cells.length / totalCells);
  const cnt = raw.map(Math.floor);
  let rem = people - cnt.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rem > 0) { cnt[i]++; rem--; } });
  const homes = buildings.map((b, i) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: 3, count: cnt[i] })).filter((h) => h.count > 0);
  // strikes / spots
  const findWoods = (x, y) => {
    for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = x + dx, yy = y + dy;
      if (ok(xx, yy) && t[I(xx, yy)] === WD && yy < 66) return { x: xx, y: yy };
    }
    return { x, y };
  };
  let strikes, spots = [];
  if (stage === 1) strikes = [{ ...findWoods(48, 10), atSec: 0 }];
  else {
    strikes = [{ ...findWoods(24, 22), atSec: 0 }, { ...findWoods(32, 34), atSec: 0 }];
    spots = [[20, 56], [30, 62], [12, 44], [38, 50], [24, 48], [46, 60]].slice(0, 6).map(([x, y]) => findWoods(x, y));
  }
  return { w: W, h: H, stage, type: t, buildings, homes, strikes, spots, neck, town: { ...TOWN } };
}

export function validateMap(map) {
  const p = [];
  if (!map || map.w !== W || map.h !== H) return ['bad size'];
  if (!map.type || map.type.length !== W * H) return ['bad type array'];
  for (let i = 0; i < map.type.length; i++) if (!map.type[i]) { p.push('empty cell ' + i); break; }
  const total = map.homes.reduce((a, h) => a + h.count, 0);
  if (total !== STAGES[map.stage].people) p.push('people total ' + total + ' != ' + STAGES[map.stage].people);
  if (map.buildings.length < 30 || map.buildings.length > 40) p.push('building count ' + map.buildings.length);
  const seen = new Set();
  for (const b of map.buildings) {
    if (b.cells.length !== b.w * b.h) p.push('building ' + b.id + ' cell count');
    for (const c of b.cells) {
      if (map.type[c] !== TYPE.HOUSE) p.push('building ' + b.id + ' cell not HOUSE');
      if (seen.has(c)) p.push('building overlap ' + b.id);
      seen.add(c);
    }
  }
  let houseCells = 0; for (let i = 0; i < map.type.length; i++) if (map.type[i] === TYPE.HOUSE) houseCells++;
  if (houseCells !== seen.size) p.push('stray HOUSE cells');
  for (const h of map.homes) if (!ok(h.x | 0, h.y | 0) || map.type[I(h.x | 0, h.y | 0)] === TYPE.WATER) p.push('bad home');
  const onWoods = (s, n) => { if (!ok(s.x, s.y) || map.type[I(s.x, s.y)] !== TYPE.WOODS) p.push(n + ' not on WOODS at ' + s.x + ',' + s.y); };
  map.strikes.forEach((s) => onWoods(s, 'strike'));
  map.spots.forEach((s) => onWoods(s, 'spot'));
  if (map.strikes.length !== STAGES[map.stage].strikes) p.push('strike count');
  if (map.stage === 1 && !(map.strikes[0].y < 20 && map.strikes[0].atSec === 0)) p.push('stage1 strike not far north');
  if (map.stage === 2 && (map.spots.length < 4 || map.spots.length > 6 || !map.neck.length)) p.push('stage2 spots/neck');
  // roads connect: flood ROAD/BRIDGE from the first road cell near town; must reach y<=6 on both north roads and every building adjacent road
  let start = -1;
  for (let i = 0; i < map.type.length; i++) if (map.type[i] === TYPE.ROAD) { start = i; if (i > W * (map.town.y)) break; }
  const vis = new Uint8Array(W * H); const q = [I(map.town.x + 2, map.town.y + 2)];
  if (map.type[q[0]] !== TYPE.ROAD) { p.push('town road anchor missing'); return p; }
  vis[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!ok(nx, ny)) continue; const n = I(nx, ny);
      if (!vis[n] && (map.type[n] === TYPE.ROAD || map.type[n] === TYPE.BRIDGE)) { vis[n] = 1; q.push(n); }
    }
  }
  for (const rx of [40, 62]) {
    if (!vis[I(rx, 4)]) p.push('north road ' + rx + ' not connected');
    let br = 0; for (let y = 0; y < H; y++) if (map.type[I(rx, y)] === TYPE.BRIDGE) br++;
    if (!br) p.push('road ' + rx + ' has no bridge');
  }
  for (const b of map.buildings) {
    let adj = false;
    for (let x = b.x - 6; x <= b.x + b.w + 5 && !adj; x++) for (let y = b.y - 6; y <= b.y + b.h + 5; y++) if (ok(x, y) && vis[I(x, y)]) { adj = true; break; }
    if (!adj) { p.push('building ' + b.id + ' more than 6 cells from a connected road'); }
  }
  return p;
}
