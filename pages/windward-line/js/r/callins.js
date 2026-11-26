// Call-in layer: queue lines + countdown, armed aim, bomber pass + splash (#8), dozer sweep (#9).
// Look A port (aimLine / dashLine / labelBox). Draw-only: reads state, never writes it.
import { windVec } from '../contract.js';
import { TAU, dashLine, labelBox, clamp, easeOutQuad } from './util.js';

const BOMBER_LEAD = 1.2, DOZER_LEAD = 1.5; // seconds before atTick that the glyph flies
const SPLASH_IN = 0.5, SPLASH_OUT = 0.6;
const MAX_FX = 16;

export function initCallins(r) {
  r.callins = { fx: [], seen: new Map(), tmpL: [0, 0, 0, 0] };
}

// line ends in CELL coords, written into out (no allocation)
function lineCells(cfg, type, ax, ay, vx, vy, out) {
  const len = (type === 'dozer' ? cfg.dozerLen : cfg.bomberLen) || 10, px = -vy, py = vx;
  out[0] = ax - px * len / 2; out[1] = ay - py * len / 2;
  out[2] = ax + px * len / 2; out[3] = ay + py * len / 2;
  return out;
}

function plane(ctx, x, y, ang, s) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x + c * s, y + sn * s);                       // nose
  ctx.lineTo(x - c * s * 0.7 - sn * s * 0.9, y - sn * s * 0.7 + c * s * 0.9); // wing
  ctx.lineTo(x - c * s * 0.3, y - sn * s * 0.3);           // waist
  ctx.lineTo(x - c * s * 0.7 + sn * s * 0.9, y - sn * s * 0.7 - c * s * 0.9); // wing
  ctx.closePath();
}

function dozer(ctx, x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#ffc83d'; ctx.fillRect(-s, -s * 0.6, s * 1.6, s * 1.2);
  ctx.fillStyle = '#6b4a1f'; ctx.fillRect(s * 0.6, -s * 0.9, s * 0.4, s * 1.8); // blade
  ctx.restore();
}

export function drawCallins(f) {
  const { ctx, state, r } = f;
  const C = r.callins || (initCallins(r), r.callins);
  const cfg = f.cfg, tickSec = cfg.tickSec || 0.25;
  const queue = (state.callins && state.callins.queue) || [];
  const L = C.tmpL;

  if (f.reset) { C.fx.length = 0; C.seen.clear(); }

  const wx = f.wv ? f.wv.x : 0, wy = f.wv ? f.wv.y : 0;
  const tickF = f.tick + (f.run ? f.alpha : 0);

  for (let n = 0; n < queue.length; n++) {
    const q = queue[n];
    const v = typeof q.deg === 'number' ? windVec(q.deg) : (state.wind ? { x: wx, y: wy } : windVec(0));
    lineCells(cfg, q.type, q.x, q.y, v.x, v.y, L);
    const finished = q.done || f.tick >= q.atTick;
    if (finished) {
      if (!C.seen.has(q)) {
        // items already finished when we first see them (reset / load) get no effect
        const fresh = !f.reset;
        C.seen.set(q, true);
        if (fresh && f.run && C.fx.length < MAX_FX) {
          C.fx.push({ type: q.type, x0: L[0], y0: L[1], x1: L[2], y1: L[3], t0: f.time });
        }
      }
      continue;
    }
    const X0 = f.sx(L[0]), Y0 = f.sy(L[1]), X1 = f.sx(L[2]), Y1 = f.sy(L[3]);
    dashLine(ctx, X0, Y0, X1, Y1, '#ffffff', 2.5, [8, 6]);
    const secsF = (q.atTick - tickF) * tickSec;
    const secs = Math.max(0, Math.ceil((q.atTick - f.tick) * tickSec));
    const lb = labelBox(ctx, secs + ' s', (X0 + X1) / 2, (Y0 + Y1) / 2 - 18, f.vw, f.vh);
    ctx.fillStyle = '#fff'; ctx.fillText(secs + ' s', lb.tx, lb.ty);

    // glyph flying the line in the last seconds (not in calm)
    if (!f.calm && f.run) {
      const lead = q.type === 'dozer' ? DOZER_LEAD : BOMBER_LEAD;
      if (secsF <= lead && secsF >= 0) {
        const p = clamp(1 - secsF / lead, 0, 1), gx = X0 + (X1 - X0) * p, gy = Y0 + (Y1 - Y0) * p;
        const ang = Math.atan2(Y1 - Y0, X1 - X0);
        if (q.type === 'dozer') {
          // dust-brown trail behind the block
          ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(150,105,55,0.55)'; ctx.lineWidth = f.S * 1.6;
          ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(gx, gy); ctx.stroke(); ctx.restore();
          dozer(ctx, gx, gy, ang, 7);
        } else {
          plane(ctx, gx, gy, ang, 8);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = 'rgba(14,22,34,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }
  }

  // finished effects: splash band (bomber) / dust-brown settle (dozer)
  for (let i = C.fx.length - 1; i >= 0; i--) {
    const e = C.fx[i], age = f.time - e.t0;
    if (age >= SPLASH_IN + SPLASH_OUT) { C.fx.splice(i, 1); continue; }
    const bomber = e.type !== 'dozer';
    let a, wcell, grow;
    if (f.calm) { a = 0.45 * (1 - age / (SPLASH_IN + SPLASH_OUT)); grow = 1; }
    else if (age < SPLASH_IN) { grow = easeOutQuad(age / SPLASH_IN); a = 0.55; }
    else { grow = 1; a = 0.55 * (1 - (age - SPLASH_IN) / SPLASH_OUT); }
    wcell = bomber ? (cfg.bomberWidth || 3) : 2;
    const X0 = f.sx(e.x0), Y0 = f.sy(e.y0), X1 = f.sx(e.x1), Y1 = f.sy(e.y1);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = bomber ? 'rgba(170,220,255,' + a.toFixed(3) + ')' : 'rgba(150,105,55,' + a.toFixed(3) + ')';
    ctx.lineWidth = Math.max(2, wcell * f.S * (0.4 + 0.6 * grow));
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
    if (bomber) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 1.3).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, wcell * f.S * 0.35 * grow);
      ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
    }
    ctx.restore();
  }

  // armed aim preview (look A)
  const ov = f.overlay;
  if (ov && ov.armed && ov.aim) {
    lineCells(cfg, ov.armed, ov.aim.x, ov.aim.y, wx, wy, L);
    const col = ov.armed === 'dozer' ? '#b8741f' : '#1b8fe0';
    dashLine(ctx, f.sx(L[0]), f.sy(L[1]), f.sx(L[2]), f.sy(L[3]), col, 3, [8, 6]);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(f.sx(ov.aim.x), f.sy(ov.aim.y), 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}
