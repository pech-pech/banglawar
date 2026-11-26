// Windward Line - r/built.js (BUILT layer). Look A buildings, shelter zones + gates, pump rings, crews + tank bars.
// Motion: burnt cross-fade 0.4 s, placement pop 220 ms (zones/crews/pumps), tank bar follows value (rate 10).
import { MAP_W, MAP_H } from '../contract.js';
import { TAU, BLUE, CYAN, rr, clamp, lerp, easeOutBack, follow } from './util.js';

const POP_MS = 220, FADE_S = 0.4;

export function initBuilt(r) {
  r.built = { bf: new Map(), pop: new Map(), tank: new Map(), grid: null };
  return r.built;
}

function drawBuilding(ctx, b, x, y, w, h, S, st) { // st: 0 ok, 1 burnt
  const p = S * 0.1, X = x + p, Y = y + p, Wd = w - 2 * p, Hd = h - 2 * p, rad = Math.max(1.5, S * 0.22);
  if (st === 1) { ctx.fillStyle = 'rgba(34,30,28,0.9)'; rr(ctx, X, Y, Wd, Hd, rad); ctx.fill(); return; }
  ctx.fillStyle = 'rgba(30,50,25,0.30)'; rr(ctx, X + S * 0.14, Y + S * 0.18, Wd, Hd, rad); ctx.fill(); // drop shadow
  const hall = b.kind === 'hall', barn = b.kind === 'barn';
  const base = hall ? '#fff4d6' : barn ? '#f0cf9e' : '#f8eed6', shade = hall ? '#eedcae' : barn ? '#dcae78' : '#ecdcb8';
  ctx.fillStyle = base; rr(ctx, X, Y, Wd, Hd, rad); ctx.fill();
  ctx.save(); rr(ctx, X, Y, Wd, Hd, rad); ctx.clip(); ctx.fillStyle = shade; ctx.fillRect(X, Y + Hd / 2, Wd, Hd / 2 + 1); ctx.restore(); // lower roof plane
  ctx.lineCap = 'round'; ctx.strokeStyle = barn ? '#a8744a' : '#bda57a'; ctx.lineWidth = Math.max(1, S * 0.14);
  ctx.beginPath(); ctx.moveTo(X + rad * 0.9, Y + Hd / 2); ctx.lineTo(X + Wd - rad * 0.9, Y + Hd / 2); // ridge line
  if (hall) { ctx.moveTo(X + Wd / 2, Y + rad * 0.9); ctx.lineTo(X + Wd / 2, Y + Hd - rad * 0.9); }
  ctx.stroke();
  ctx.strokeStyle = hall ? 'rgba(168,124,70,0.95)' : 'rgba(120,92,56,0.6)'; ctx.lineWidth = hall ? 1.6 : 1; rr(ctx, X, Y, Wd, Hd, rad); ctx.stroke();
}

// pop progress 0..1 for a numeric key; returns 1 when settled. Records first sight (no pop on reset / during run).
function popOf(B, f, key) {
  let t0 = B.pop.get(key);
  if (t0 === undefined) { t0 = (f.reset || f.run) ? -1e9 : f.now; B.pop.set(key, t0); }
  const t = (f.now - t0) / POP_MS;
  return t >= 1 ? 1 : t < 0 ? 0 : t;
}

// scale + alpha about (cx,cy); returns true if ctx.save() was used (caller restores)
function popBegin(ctx, f, t, cx, cy) {
  if (t >= 1) return false;
  ctx.save();
  ctx.globalAlpha = clamp(t * 1.6, 0, 1);
  if (!f.calm) { const s = lerp(0.85, 1, easeOutBack(t)); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
  return true;
}

export function drawBuilt(f) {
  const { ctx, state, S, sx, sy, cfg } = f, r = f.r, B = r.built || initBuilt(r);
  const burnt = f.g.burnt;
  if (B.grid !== f.g || f.reset) { B.bf.clear(); B.pop.clear(); B.tank.clear(); B.grid = f.g; }
  const bmap = (state.map && state.map.buildings) || [];
  const dt = f.dt || 0, step = dt / FADE_S;

  // buildings, burnt state cross-fades
  for (let q = 0; q < bmap.length; q++) {
    const b = bmap[q];
    let n = 0, c = 0; const cells = b.cells;
    if (cells) { for (let k = 0; k < cells.length; k++) { c++; if (burnt[cells[k]]) n++; } } else { c = 1; n = burnt[b.y * MAP_W + b.x] ? 1 : 0; }
    const tgt = n * 2 >= c ? 1 : 0, key = b.id != null ? b.id : q;
    let v = B.bf.get(key);
    if (v === undefined || f.reset || f.calm) v = tgt; else v += clamp(tgt - v, -step, step);
    B.bf.set(key, v);
    const x = sx(b.x), y = sy(b.y), w = b.w * S, h = b.h * S;
    if (v < 1) { if (v > 0) ctx.globalAlpha = 1 - v; drawBuilding(ctx, b, x, y, w, h, S, 0); ctx.globalAlpha = 1; }
    if (v > 0) { ctx.globalAlpha = v; drawBuilding(ctx, b, x, y, w, h, S, 1); ctx.globalAlpha = 1; }
  }

  // zones: translucent cyan, clean rounded outline, gates
  const zones = state.zones || [];
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi], x = sx(z.x), y = sy(z.y), w = z.w * S, h = z.h * S, rad = Math.min(10, S * 1.4);
    const sv = popBegin(ctx, f, popOf(B, f, 100000 + z.y * MAP_W + z.x), x + w / 2, y + h / 2);
    ctx.fillStyle = 'rgba(47,196,242,0.22)'; rr(ctx, x, y, w, h, rad); ctx.fill();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.lineJoin = 'round'; rr(ctx, x + 1, y + 1, w - 2, h - 2, rad); ctx.stroke();
    const gs = Math.max(6, S * 1.2), gates = z.gates || [];
    for (let k = 0; k < gates.length; k++) {
      const gi = gates[k], gx = sx(gi % MAP_W + 0.5) - gs / 2, gy = sy(((gi / MAP_W) | 0) + 0.5) - gs / 2;
      ctx.fillStyle = '#eafaff'; rr(ctx, gx, gy, gs, gs, 2.5); ctx.fill(); ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.stroke();
    }
    if (sv) ctx.restore();
  }

  // pump rings
  const convs = state.convs || [];
  for (let i = 0; i < convs.length; i++) {
    const c = convs[i];
    if (c.kind && c.kind !== 'pump') continue;
    const cx = sx(c.x + 0.5), cy = sy(c.y + 0.5);
    const sv = popBegin(ctx, f, popOf(B, f, 200000 + c.y * MAP_W + c.x), cx, cy);
    ctx.save(); ctx.strokeStyle = 'rgba(30,110,210,0.85)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, c.radius * S, 0, TAU); ctx.stroke(); ctx.restore();
    if (sv) ctx.restore();
  }

  // crews + tank bars
  const crews = state.crews || [], run = f.run;
  for (let i = 0; i < crews.length; i++) {
    const c = crews[i];
    let b = null; for (let q = 0; q < bmap.length; q++) if (bmap[q].id === c.buildingId) { b = bmap[q]; break; }
    const bx = b ? b.x : c.x - 1, by = b ? b.y : c.y - 1, bw = b ? b.w : 2, bh = b ? b.h : 2;
    const ccx = sx(bx + bw / 2), ccy = sy(by + bh / 2);
    const ckey = c.buildingId != null ? c.buildingId : c.y * MAP_W + c.x;
    const sv = popBegin(ctx, f, popOf(B, f, 300000 + ckey), ccx, ccy);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.5; const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * (run ? 0.4 : 0.75);
    ctx.beginPath(); ctx.arc(ccx, ccy, c.range * S, 0, TAU); ctx.stroke();
    ctx.globalAlpha = a0 * (run ? 0.08 : 0.13); ctx.fillStyle = BLUE; ctx.fill(); ctx.globalAlpha = a0;
    const m = Math.max(6, Math.min(bw, bh) * S * 0.7);
    ctx.fillStyle = c.lost ? '#6b7480' : BLUE; rr(ctx, ccx - m / 2, ccy - m / 2, m, m, m * 0.3); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    if (cfg.tank) {
      const bwid = Math.max(16, bw * S), tf = clamp(c.tank / cfg.tank, 0, 1);
      let cur = B.tank.get(ckey);
      cur = (cur === undefined || f.reset || f.calm) ? tf : follow(cur, tf, f.dt, 10);
      B.tank.set(ckey, cur);
      const bx0 = ccx - bwid / 2, by0 = sy(by + bh) + 2;
      ctx.fillStyle = 'rgba(14,22,34,0.75)'; rr(ctx, bx0, by0, bwid, 5, 2.5); ctx.fill();
      if (cur > 0.02) { ctx.fillStyle = cur > 0.25 ? '#7be0ff' : '#ff8a2a'; rr(ctx, bx0, by0, Math.max(3, bwid * cur), 5, 2.5); ctx.fill(); }
    }
    if (sv) ctx.restore();
  }
}
