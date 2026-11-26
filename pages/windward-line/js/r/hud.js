// Windward Line - r/hud.js. HUD layer: selected building, plan preview ghost + label (smooth follow), wind arrow, result mark, pause dim.
import { MAP_W, fmtTime } from '../contract.js';
import { TAU, EMBER, rr, labelBox, follow, angLerp, clamp } from './util.js';

const HS = { weak: 'weak', mid: 'slow front', strong: 'holds' };

// admin default: local copy of resultMark (render.js owns the export; importing it would be circular)
function markOf(state) {
  if (!state || state.phase !== 'result') return null;
  const fb = state.firstBreach;
  if (fb && fb.x != null) return { x: fb.x, y: fb.y, tick: fb.tick, label: 'first breach' };
  const fl = (state.events || []).find((e) => e.kind === 'first-loss');
  return fl && fl.x != null ? { x: fl.x, y: fl.y, tick: fl.tick, label: 'first loss' } : null;
}

export function initHud(r) {
  r.hud = {
    pv: false, pt: null, px: 0, py: 0, qx: 0, qy: 0, // preview follow state (px,py = x/y or x0.. follow; qx,qy = x1,y1)
    ang: 0, angInit: false, dim: 0, lastNow: 0,
  };
}

export function drawHud(f) {
  const { ctx, state, S, vw, vh, sx, sy } = f;
  const r = f.r, h = r.hud || (initHud(r), r.hud), ov = f.overlay || {}, cfg = f.cfg;
  const dt = f.dt || 0, calm = !!f.calm;
  ctx.lineJoin = 'round';

  // selected building
  if (ov.selectBuilding != null) {
    const bmap = r.bld || state.buildings || [];
    let b = null;
    for (let i = 0; i < bmap.length; i++) if (bmap[i].id === ov.selectBuilding) { b = bmap[i]; break; }
    if (b) { ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 2.5; rr(ctx, sx(b.x) - 2, sy(b.y) - 2, b.w * S + 4, b.h * S + 4, 6); ctx.stroke(); }
  }

  // plan preview ghost + label 64 px above the end point
  const p = ov.preview;
  if (!p) h.pv = false;
  if (p) {
    const line = p.t === 'break' || p.t === 'road';
    const tx = line ? p.x1 : p.x, ty = line ? p.y1 : p.y;
    if (!h.pv || h.pt !== p.t || calm || f.reset) { h.px = tx; h.py = ty; }
    else { h.px = follow(h.px, tx, dt, 18); h.py = follow(h.py, ty, dt, 18); }
    h.pv = true; h.pt = p.t;
    const dx = h.px - tx, dy = h.py - ty; // lag offset applied to the drawn geometry
    const col = p.ok ? '58,190,90' : '235,70,70', solid = p.ok ? '#2fb454' : '#e84545';
    ctx.fillStyle = 'rgba(' + col + ',0.30)'; ctx.strokeStyle = solid; ctx.lineWidth = 2;
    let ex, ey;
    if (p.t === 'zone') {
      const x = sx(p.x + dx), y = sy(p.y + dy), rad = Math.min(10, S * 1.4);
      rr(ctx, x, y, p.w * S, p.h * S, rad); ctx.fill(); rr(ctx, x + 1, y + 1, p.w * S - 2, p.h * S - 2, rad); ctx.stroke();
      ex = p.x1; ey = p.y1;
    } else if (line) {
      const wc = p.t === 'break' ? (p.width || p.w || cfg.breakWidth || 2) : 1;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(' + col + ',0.5)'; ctx.lineWidth = Math.max(3, wc * S);
      ctx.beginPath(); ctx.moveTo(sx(p.x0 + 0.5), sy(p.y0 + 0.5)); ctx.lineTo(sx(h.px + 0.5), sy(h.py + 0.5)); ctx.stroke();
      ctx.strokeStyle = solid; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.restore();
      ex = h.px + 0.5; ey = h.py + 0.5;
    } else { // crew / pump
      const bw = p.w || 2, bh = p.h || 2, gx = p.x + dx, gy = p.y + dy;
      rr(ctx, sx(gx), sy(gy), bw * S, bh * S, S * 0.25); ctx.fill(); ctx.stroke();
      ex = gx + bw / 2; ey = gy + bh / 2;
      if (p.t === 'pump') { ctx.save(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(sx(ex), sy(ey), (cfg.pumpRadius || 15) * S, 0, TAU); ctx.stroke(); ctx.restore(); }
      if (p.t === 'crew') { ctx.beginPath(); ctx.arc(sx(ex), sy(ey), (cfg.crewRangeBase || 3) * S + Math.sqrt(bw * bh) * S, 0, TAU); ctx.stroke(); }
    }
    if (ex == null) { ex = p.x + (p.w || 0); ey = p.y + (p.h || 0); }
    const txt = (p.cost != null ? '$' + p.cost : '') + (p.ok ? '' : (p.cost != null ? ' ' : '') + 'no') + (p.hold && p.ok ? ' · ' + HS[p.hold.key] : '');
    const lb = labelBox(ctx, txt, sx(ex), sy(ey) - 64, vw, vh);
    ctx.fillStyle = !p.ok ? '#ff9a9a' : (p.hold && p.hold.key === 'weak' ? '#ffd27a' : '#8dff9f'); ctx.fillText(txt, lb.tx, lb.ty);
    ctx.strokeStyle = solid; ctx.lineWidth = 1.5; rr(ctx, lb.x + 0.5, lb.y + 0.5, lb.bw - 1, lb.bh - 1, 8); ctx.stroke();
  }

  // wind arrow, map NE corner
  const w = state.wind;
  if (w) {
    let ax = sx(MAP_W - 8), ay = sy(9);
    ax = Math.max(34, Math.min(vw - 34, ax)); ay = Math.max(50, Math.min(vh - 60, ay));
    const target = Math.atan2(w.vy, w.vx);
    if (!h.angInit || f.reset || calm) { h.ang = target; h.angInit = true; }
    else h.ang = angLerp(h.ang, target, 1 - Math.exp(-dt * 7.5)); // ~0.6 s to settle
    const wx = Math.cos(h.ang), wy = Math.sin(h.ang), L = 18;
    const pending = w.shiftAtTick != null && !w.shifted && (w.shiftAtTick - (f.tick + f.alpha)) * (cfg.tickSec || 0.25) <= 10;
    ctx.fillStyle = 'rgba(27,35,48,0.86)'; ctx.beginPath(); ctx.arc(ax, ay, 27, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (pending && !calm) { // 1 Hz pulse ring
      const ph = (f.now / 1000) % 1;
      ctx.strokeStyle = 'rgba(255,211,77,' + (0.9 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ax, ay, 27 + ph * 9, 0, TAU); ctx.stroke();
    } else if (pending) { ctx.strokeStyle = 'rgba(255,211,77,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ax, ay, 29, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = '#f1f5f9'; ctx.fillStyle = '#f1f5f9'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax - wx * L * 0.7, ay - wy * L * 0.7); ctx.lineTo(ax + wx * L * 0.7, ay + wy * L * 0.7); ctx.stroke();
    const hx = ax + wx * L * 0.7, hy = ay + wy * L * 0.7, nx = -wy, ny = wx;
    ctx.beginPath(); ctx.moveTo(hx + wx * 6, hy + wy * 6); ctx.lineTo(hx + nx * 6, hy + ny * 6); ctx.lineTo(hx - nx * 6, hy - ny * 6); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt';
  }

  // result mark
  const mk = markOf(state);
  if (mk) {
    const mx = sx(mk.x + 0.5), my = sy(mk.y + 0.5), rad = 3 * S;
    ctx.strokeStyle = 'rgba(22,30,42,0.85)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(mx, my, rad, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, rad, 0, TAU); ctx.stroke();
    const txt = mk.label + ' ' + fmtTime(mk.tick * (cfg.tickSec || 0.25));
    const lb = labelBox(ctx, txt, mx, my - rad - 18, vw, vh);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, lb.tx, lb.ty);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; rr(ctx, lb.x + 0.5, lb.y + 0.5, lb.bw - 1, lb.bh - 1, 8); ctx.stroke();
  }

  // pause dim (run only): eased to 0.25 in 150 ms, then PAUSED pill
  const want = f.run && f.paused ? 0.25 : 0;
  if (calm || f.reset) h.dim = want;
  else h.dim = want > h.dim ? Math.min(want, h.dim + dt * (0.25 / 0.15)) : Math.max(want, h.dim - dt * (0.25 / 0.15));
  if (h.dim > 0.003) {
    ctx.fillStyle = 'rgba(10,16,24,' + h.dim.toFixed(3) + ')'; ctx.fillRect(0, 0, vw, vh);
    if (want > 0) {
      const a = clamp(h.dim / 0.25, 0, 1), txt = 'PAUSED';
      ctx.globalAlpha = a;
      const lb = labelBox(ctx, txt, vw / 2, vh / 2, vw, vh);
      ctx.fillStyle = 'rgba(27,35,48,0.9)'; rr(ctx, lb.x, lb.y, lb.bw, lb.bh, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, lb.tx, lb.ty);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; rr(ctx, lb.x + 0.5, lb.y + 0.5, lb.bw - 1, lb.bh - 1, 12); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
