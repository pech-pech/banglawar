// Windward Line - render.js (M6). Canvas 2D. Imports only contract.js.
// Terrain (grid.type + burnt) cached in an offscreen 96x128 canvas (1 px per cell), scaled with smoothing off.
// Static vector overlays (building outlines, break outlines) cached as Path2D in cell units. Dynamic layers per frame.
import { TYPE, MODE, MAP_W, MAP_H, CELL_PX, windVec, fmtTime } from './contract.js';

// result mark: state.firstBreach {x,y,tick,kind}, else the first 'first-loss' event. Shared with ui.js (See on map).
export function resultMark(state) {
  if (!state || state.phase !== 'result') return null;
  const fb = state.firstBreach;
  if (fb && fb.x != null) return { x: fb.x, y: fb.y, tick: fb.tick, label: 'first breach' };
  const fl = (state.events || []).find((e) => e.kind === 'first-loss');
  return fl && fl.x != null ? { x: fl.x, y: fl.y, tick: fl.tick, label: 'first loss' } : null;
}

const COL = {
  bg: '#0d1117', [TYPE.GRASS]: '#3d4a2a', [TYPE.WOODS]: '#1f3a24', [TYPE.HOUSE]: '#b9a27a', [TYPE.ROAD]: '#5a5f66',
  [TYPE.WATER]: '#1f4e79', [TYPE.ROCK]: '#4a4a4a', [TYPE.CLEAR]: '#6b5a3e', [TYPE.BRIDGE]: '#7a6a50', burnt: '#1a1a1a',
};
const CYAN = '#39d0ff', BROWN = '#a0703a', BLUE = '#4aa3ff', EMBER = '#ffd34d';
const FONT = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif'; // admin default: >= 12 px

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function pack(c) { const [r, g, b] = hex(c); return (255 << 24) | (b << 16) | (g << 8) | r; } // little-endian RGBA
const PACK = {}; for (const k in COL) PACK[k] = pack(COL[k]);

export function initRender(canvas) {
  const off = document.createElement('canvas'); off.width = MAP_W; off.height = MAP_H;
  const octx = off.getContext('2d');
  const img = octx.createImageData(MAP_W, MAP_H);
  return {
    canvas, ctx: canvas.getContext('2d'), dpr: 1, w: 0, h: 0,
    off, octx, img, px32: new Uint32Array(img.data.buffer),
    key: '', grid: null, bldPath: null, brkPath: null, lastMs: 0,
  };
}

export function screenToCell(view, px, py) {
  const s = CELL_PX * view.scale;
  return { x: (px + view.ox) / s, y: (py + view.oy) / s };
}

export function fitView(viewW, viewH) {
  // admin default: fill the free height. Scale = full map width visible; if the map is then shorter than the view,
  // grow to fill the height (crops a little width, pan for the rest). Bottom-anchored when taller so the town (south) is in view; pan up for the rest.
  const scale = Math.max(viewW / (MAP_W * CELL_PX), viewH / (MAP_H * CELL_PX));
  const mw = MAP_W * CELL_PX * scale, mh = MAP_H * CELL_PX * scale;
  return { scale, ox: -(viewW - mw) / 2, oy: mh <= viewH ? -(viewH - mh) / 2 : mh - viewH };
}

function resize(r) {
  const c = r.canvas, dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1); // single dpr owner (main.js does not touch the backing store)
  const w = c.clientWidth || c.width / dpr || 300, h = c.clientHeight || c.height / dpr || 300;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  r.dpr = dpr; r.w = w; r.h = h;
}

function rebuildStatic(r, state, key) {
  const g = state.grid, t = g.type, burnt = g.burnt, px = r.px32;
  for (let i = 0; i < t.length; i++) px[i] = burnt[i] ? PACK.burnt : (PACK[t[i]] || PACK[TYPE.GRASS]);
  r.octx.putImageData(r.img, 0, 0);
  const bp = new Path2D();
  for (const b of (state.map && state.map.buildings) || []) bp.rect(b.x, b.y, b.w, b.h);
  r.bldPath = bp;
  // break outline: cell edges where the neighbour is not the same break
  const bk = g.brk, kp = new Path2D();
  for (let i = 0; i < bk.length; i++) {
    const v = bk[i]; if (!v) continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    if (y === 0 || bk[i - MAP_W] !== v) { kp.moveTo(x, y); kp.lineTo(x + 1, y); }
    if (y === MAP_H - 1 || bk[i + MAP_W] !== v) { kp.moveTo(x, y + 1); kp.lineTo(x + 1, y + 1); }
    if (x === 0 || bk[i - 1] !== v) { kp.moveTo(x, y); kp.lineTo(x, y + 1); }
    if (x === MAP_W - 1 || bk[i + 1] !== v) { kp.moveTo(x + 1, y); kp.lineTo(x + 1, y + 1); }
  }
  r.brkPath = kp; r.key = key; r.grid = g;
}

function terrainKey(r, state) {
  const g = state.grid, t = g.type, b = g.burnt;
  let nb = 0, nc = 0;
  for (let i = 0; i < t.length; i++) { nb += b[i]; if (t[i] === TYPE.CLEAR) nc++; }
  return (state.plan ? state.plan.length : 0) + '|' + nb + '|' + nc + '|' + (state._terrainVer || 0);
}

function lineCells(x0, y0, x1, y1) { return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); }

function labelBox(ctx, text, cx_, cy_, vw, vh) {
  ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width, bw = tw + 14, bh = 22;
  const x = Math.max(4, Math.min(vw - bw - 4, cx_ - bw / 2)), y = Math.max(4, Math.min(vh - bh - 4, cy_ - bh / 2));
  ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fillRect(x, y, bw, bh);
  return { tx: x + bw / 2, ty: y + bh / 2 + 0.5, x, y, bw, bh };
}

function dashLine(ctx, x0, y0, x1, y1, color, lw, dash) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

export function draw(r, state, view, overlay) {
  const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
  resize(r);
  const ctx = r.ctx, dpr = r.dpr, vw = r.w, vh = r.h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
  if (!state || !state.grid) return;
  overlay = overlay || {};
  const g = state.grid, cfg = state.cfg || {};
  const S = CELL_PX * view.scale, ox = view.ox, oy = view.oy; // px per cell
  const sx = (x) => x * S - ox, sy = (y) => y * S - oy;
  const tick = state.tick | 0, run = state.phase === 'run';

  // terrain (cached)
  const key = terrainKey(r, state);
  if (r.key !== key || r.grid !== g) rebuildStatic(r, state, key);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(r.off, 0, 0, MAP_W, MAP_H, -ox, -oy, MAP_W * S, MAP_H * S);

  // cell-unit layers (building + break outlines): transform so 1 unit = 1 cell
  ctx.save();
  ctx.setTransform(dpr * S, 0, 0, dpr * S, -ox * dpr, -oy * dpr);
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 1 / S; ctx.strokeStyle = 'rgba(70,52,28,0.95)'; ctx.stroke(r.bldPath);
  ctx.lineWidth = 1.5 / S; ctx.strokeStyle = BROWN; ctx.stroke(r.brkPath);
  ctx.restore();

  // zones
  for (const z of state.zones || []) {
    const x = sx(z.x), y = sy(z.y), w = (z.w) * S, h = (z.h) * S;
    ctx.fillStyle = 'rgba(57,208,255,0.15)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const gs = Math.max(5, S * 1.1);
    ctx.fillStyle = CYAN;
    for (const gi of z.gates || []) ctx.fillRect(sx(gi % MAP_W + 0.5) - gs / 2, sy(((gi / MAP_W) | 0) + 0.5) - gs / 2, gs, gs);
  }

  // pump rings
  for (const c of state.convs || []) {
    if (c.kind && c.kind !== 'pump') continue;
    ctx.save(); ctx.strokeStyle = 'rgba(74,163,255,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(sx(c.x + 0.5), sy(c.y + 0.5), c.radius * S, 0, 6.2832); ctx.stroke(); ctx.restore();
  }

  // crews
  const bmap = state.map && state.map.buildings;
  for (const c of state.crews || []) {
    const b = bmap && bmap.find((q) => q.id === c.buildingId);
    const bx = b ? b.x : c.x - 1, by = b ? b.y : c.y - 1, bw = b ? b.w : 2, bh = b ? b.h : 2;
    const ccx = sx(bx + bw / 2), ccy = sy(by + bh / 2);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.5; ctx.globalAlpha = run ? 0.28 : 0.6;
    ctx.beginPath(); ctx.arc(ccx, ccy, c.range * S, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = run ? 0.06 : 0.1; ctx.fillStyle = BLUE; ctx.fill(); ctx.globalAlpha = 1;
    const m = Math.max(4, Math.min(bw, bh) * S * 0.7);
    ctx.fillStyle = c.lost ? '#555' : BLUE; ctx.fillRect(ccx - m / 2, ccy - m / 2, m, m);
    ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1; ctx.strokeRect(ccx - m / 2, ccy - m / 2, m, m);
    if (cfg.tank) { // tank bar
      const bwid = Math.max(14, bw * S), f = Math.max(0, Math.min(1, c.tank / cfg.tank));
      const bx0 = ccx - bwid / 2, by0 = sy(by + bh) + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx0, by0, bwid, 4);
      ctx.fillStyle = f > 0.25 ? '#6fe3ff' : '#ff7a1a'; ctx.fillRect(bx0, by0, bwid * f, 4);
    }
  }

  // burning cells (deterministic flicker by tick)
  const burn = g.burn, N = burn.length, d = Math.max(1.5, S * 0.5), off2 = (S - 2 * d) / 3;
  ctx.fillStyle = 'rgba(255,59,26,0.35)'; ctx.beginPath();
  for (let i = 0; i < N; i++) if (burn[i] > 0) ctx.rect(sx(i % MAP_W), sy((i / MAP_W) | 0), S, S);
  ctx.fill();
  const pO = new Path2D(), pR = new Path2D();
  for (let i = 0; i < N; i++) {
    if (burn[i] <= 0) continue;
    const x0 = sx(i % MAP_W) + off2, y0 = sy((i / MAP_W) | 0) + off2, h = i * 31 + tick;
    for (let s = 0; s < 4; s++) {
      const v = (h + s * 7) % 5; if (v === 0) continue;
      (v < 3 ? pO : pR).rect(x0 + (s & 1) * (d + off2), y0 + (s >> 1) * (d + off2), d, d);
    }
  }
  ctx.fillStyle = '#ff7a1a'; ctx.fill(pO); ctx.fillStyle = '#ff3b1a'; ctx.fill(pR);

  // people
  const P = state.people;
  if (P && P.n > 0) {
    const base = Math.max(3, S * 0.7), pr = base + 1.5;
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const resPhase = state.phase === 'result', ex = P.exp;
    for (let i = 0; i < P.n; i++) {
      let m = P.mode[i];
      const sz = m === MODE.PANIC ? pr : base;
      if (ex && ex[i] && m !== MODE.SAFE) m = resPhase ? MODE.LOST : 5; // exposed: grey at result, orange tint while running
      paths[m].rect(P.x[i] * S - ox - sz / 2, P.y[i] * S - oy - sz / 2, sz, sz);
    }
    ctx.fillStyle = '#6a6a6a'; ctx.fill(paths[MODE.LOST]);
    ctx.fillStyle = '#f2f2f2'; ctx.fill(paths[MODE.CALM]); ctx.fill(paths[MODE.AWARE]);
    ctx.fillStyle = '#6fe3ff'; ctx.fill(paths[MODE.SAFE]);
    ctx.fillStyle = '#ffffff'; ctx.fill(paths[MODE.PANIC]);
    ctx.fillStyle = '#ffb27a'; ctx.fill(paths[5]); // exposed to fire but alive (faint orange)
  }

  // embers
  if (state.embers && state.embers.length) {
    ctx.fillStyle = EMBER; ctx.beginPath(); const e = Math.max(2, S * 0.4);
    for (const m of state.embers) ctx.rect(sx(m.x) - e / 2, sy(m.y) - e / 2, e, e);
    ctx.fill();
  }

  // call-in queue
  const wv = state.wind ? { x: state.wind.vx, y: state.wind.vy } : windVec(0);
  const aimLine = (type, ax, ay, vx, vy) => {
    const len = (type === 'dozer' ? cfg.dozerLen : cfg.bomberLen) || 10, px_ = -vy, py_ = vx;
    return [sx(ax - px_ * len / 2), sy(ay - py_ * len / 2), sx(ax + px_ * len / 2), sy(ay + py_ * len / 2)];
  };
  for (const q of (state.callins && state.callins.queue) || []) {
    if (q.done) continue;
    const v = typeof q.deg === 'number' ? windVec(q.deg) : wv, L = aimLine(q.type, q.x, q.y, v.x, v.y);
    dashLine(ctx, L[0], L[1], L[2], L[3], '#ffffff', 2.5, [8, 6]);
    const secs = Math.max(0, Math.ceil((q.atTick - tick) * (cfg.tickSec || 0.25)));
    const lb = labelBox(ctx, secs + ' s', (L[0] + L[2]) / 2, (L[1] + L[3]) / 2 - 18, vw, vh);
    ctx.fillStyle = '#fff'; ctx.fillText(secs + ' s', lb.tx, lb.ty);
  }
  // armed aim preview
  if (overlay.armed && overlay.aim) {
    const L = aimLine(overlay.armed, overlay.aim.x, overlay.aim.y, wv.x, wv.y);
    dashLine(ctx, L[0], L[1], L[2], L[3], overlay.armed === 'dozer' ? '#d9a35a' : '#8fd8ff', 3, [8, 6]);
    ctx.fillStyle = overlay.armed === 'dozer' ? '#d9a35a' : '#8fd8ff';
    ctx.beginPath(); ctx.arc(sx(overlay.aim.x), sy(overlay.aim.y), 4, 0, 6.2832); ctx.fill();
  }

  // selected building
  if (overlay.selectBuilding != null && bmap) {
    const b = bmap.find((q) => q.id === overlay.selectBuilding);
    if (b) { ctx.strokeStyle = EMBER; ctx.lineWidth = 2.5; ctx.strokeRect(sx(b.x) - 2, sy(b.y) - 2, b.w * S + 4, b.h * S + 4); }
  }

  // plan preview ghost + cost label 64 px above the end point
  const p = overlay.preview;
  if (p) {
    const col = p.ok ? '76,217,100' : '255,77,77', solid = p.ok ? '#4cd964' : '#ff4d4d';
    ctx.fillStyle = 'rgba(' + col + ',0.28)'; ctx.strokeStyle = solid; ctx.lineWidth = 2;
    let ex = p.x1, ey = p.y1;
    if (p.t === 'zone') {
      const x = sx(p.x), y = sy(p.y);
      ctx.fillRect(x, y, p.w * S, p.h * S); ctx.strokeRect(x + 1, y + 1, p.w * S - 2, p.h * S - 2);
    } else if (p.t === 'break' || p.t === 'road') {
      const wc = p.t === 'break' ? (p.width || p.w || cfg.breakWidth || 2) : 1;
      ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(' + col + ',0.45)'; ctx.lineWidth = Math.max(3, wc * S);
      ctx.beginPath(); ctx.moveTo(sx(p.x0 + 0.5), sy(p.y0 + 0.5)); ctx.lineTo(sx(p.x1 + 0.5), sy(p.y1 + 0.5)); ctx.stroke();
      ctx.strokeStyle = solid; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.restore();
      ex = p.x1 + 0.5; ey = p.y1 + 0.5;
    } else { // crew / pump: building ghost
      const bw = p.w || 2, bh = p.h || 2, x = sx(p.x), y = sy(p.y);
      ctx.fillRect(x, y, bw * S, bh * S); ctx.strokeRect(x, y, bw * S, bh * S);
      ex = p.x + bw / 2; ey = p.y + bh / 2;
      if (p.t === 'pump') { ctx.save(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(sx(ex), sy(ey), (cfg.pumpRadius || 15) * S, 0, 6.2832); ctx.stroke(); ctx.restore(); }
      if (p.t === 'crew') { ctx.beginPath(); ctx.arc(sx(ex), sy(ey), (cfg.crewRangeBase || 3) * S + Math.sqrt(bw * bh) * S, 0, 6.2832); ctx.stroke(); }
    }
    if (ex == null) { ex = p.x + (p.w || 0); ey = p.y + (p.h || 0); }
    const txt = (p.cost != null ? '$' + p.cost : '') + (p.ok ? '' : (p.cost != null ? ' ' : '') + 'no');
    const lb = labelBox(ctx, txt, sx(ex), sy(ey) - 64, vw, vh);
    ctx.fillStyle = p.ok ? '#8dff9f' : '#ff8a8a'; ctx.fillText(txt, lb.tx, lb.ty);
    ctx.strokeStyle = solid; ctx.lineWidth = 1; ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.bw - 1, lb.bh - 1);
  }

  // wind arrow, map NE corner (world anchored, clamped on screen). admin default position.
  if (state.wind) {
        let ax = sx(MAP_W - 8), ay = sy(9);
    ax = Math.max(34, Math.min(vw - 34, ax)); ay = Math.max(50, Math.min(vh - 60, ay));
    const wx = state.wind.vx, wy = state.wind.vy, L = 18;
    ctx.fillStyle = 'rgba(8,10,14,0.7)'; ctx.beginPath(); ctx.arc(ax, ay, 27, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#e8eef5'; ctx.fillStyle = '#e8eef5'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax - wx * L * 0.7, ay - wy * L * 0.7); ctx.lineTo(ax + wx * L * 0.7, ay + wy * L * 0.7); ctx.stroke();
    const hx = ax + wx * L * 0.7, hy = ay + wy * L * 0.7, nx = -wy, ny = wx;
    ctx.beginPath(); ctx.moveTo(hx + wx * 6, hy + wy * 6); ctx.lineTo(hx + nx * 6, hy + ny * 6); ctx.lineTo(hx - nx * 6, hy - ny * 6); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt'; // no text label: top bar already names the wind
  }
  // result mark: static white ring (3 cells) + label tag, no animation
  const mk = resultMark(state);
  if (mk) {
    const mx = sx(mk.x + 0.5), my = sy(mk.y + 0.5), rr = 3 * S;
    ctx.save();
    ctx.strokeStyle = 'rgba(8,10,14,0.85)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(mx, my, rr, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, rr, 0, 6.2832); ctx.stroke();
    ctx.restore();
    const txt = mk.label + ' ' + fmtTime(mk.tick * (cfg.tickSec || 0.25));
    const lb = labelBox(ctx, txt, mx, my - rr - 18, vw, vh);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, lb.tx, lb.ty);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.bw - 1, lb.bh - 1);
  }

  r.lastMs = (typeof performance !== 'undefined') ? performance.now() - t0 : 0;
}
