// Windward Line - js/r/util.js. Shared render helpers (copied from Look A) plus motion math.
import { MAP_W, MAP_H } from '../contract.js';

export const BG = '#1b2330';
export const CYAN = '#2fc4f2', BLUE = '#2f86e0', EMBER = '#ffd34d', INK = 'rgba(14,22,34,0.78)';
export const FONT = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
export const N = MAP_W * MAP_H, TAU = 6.2832;

export const MEADOW = [152, 201, 116], FOREST = [60, 138, 78], FOREST_RIM = [44, 112, 64], ROCKC = [176, 173, 164];
export const WATERC = [58, 158, 222], SHALLOW = [120, 196, 238], SAND = [232, 226, 184];
export const ROADC = [196, 189, 177], ROADEDGE = [142, 134, 122], CLEARC = [240, 225, 178], CLEAREDGE = [208, 184, 130];
export const BRIDGEC = [214, 178, 120], BRIDGEEDGE = [112, 84, 52], CHAR = [50, 45, 43];

export function hsh(n) { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
export function ss(a, b, x) { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); }
export function blur(F) { // 3x3 binomial, edge clamped
  const o = new Float32Array(N);
  for (let y = 0; y < MAP_H; y++) {
    const ya = y > 0 ? y - 1 : 0, yb = y < MAP_H - 1 ? y + 1 : y;
    for (let x = 0; x < MAP_W; x++) {
      const xa = x > 0 ? x - 1 : 0, xb = x < MAP_W - 1 ? x + 1 : x;
      o[y * MAP_W + x] = (F[ya * MAP_W + xa] + F[ya * MAP_W + xb] + F[yb * MAP_W + xa] + F[yb * MAP_W + xb]
        + 2 * (F[ya * MAP_W + x] + F[yb * MAP_W + x] + F[y * MAP_W + xa] + F[y * MAP_W + xb]) + 4 * F[y * MAP_W + x]) / 16;
    }
  }
  return o;
}
export function axis(n, R, L) { // bilinear tables for output size n at R px per cell
  const i0 = new Int32Array(n), i1 = new Int32Array(n), f = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / R - 0.5, a = Math.floor(u);
    f[k] = u - a; i0[k] = a < 0 ? 0 : a > L - 1 ? L - 1 : a; const b = a + 1; i1[k] = b < 0 ? 0 : b > L - 1 ? L - 1 : b;
  }
  return { i0, i1, f };
}
export function mixc(c, t, a) { c[0] += (t[0] - c[0]) * a; c[1] += (t[1] - c[1]) * a; c[2] += (t[2] - c[2]) * a; }
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function makeLut(stops) { // stops: [v, r, g, b, a]
  const L = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 200; let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const A = stops[k], B = stops[k + 1], t = Math.max(0, Math.min(1, (v - A[0]) / (B[0] - A[0])));
    const c = [1, 2, 3, 4].map((j) => A[j] + (B[j] - A[j]) * t);
    L[i] = (Math.round(c[3]) << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]);
  }
  return L;
}
export function labelBox(ctx, text, cx_, cy_, vw, vh) {
  ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width, bw = tw + 16, bh = 24;
  const x = Math.max(4, Math.min(vw - bw - 4, cx_ - bw / 2)), y = Math.max(4, Math.min(vh - bh - 4, cy_ - bh / 2));
  ctx.fillStyle = 'rgba(22,30,42,0.9)'; rr(ctx, x, y, bw, bh, 8); ctx.fill();
  return { tx: x + bw / 2, ty: y + bh / 2 + 0.5, x, y, bw, bh };
}
export function dashLine(ctx, x0, y0, x1, y1, color, lw, dash) {
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(14,22,34,0.5)'; ctx.lineWidth = lw + 3; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

// ---- new helpers ----
export function mkCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeOutQuad(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
export function easeOutCubic(t) { t = clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; }
export function easeInOutCubic(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function easeOutBack(t) { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
export function follow(cur, target, dt, rate) { return cur + (target - cur) * (1 - Math.exp(-dt * rate)); }
export function angLerp(a, b, t) { let d = (b - a) % TAU; if (d > TAU / 2) d -= TAU; else if (d < -TAU / 2) d += TAU; return a + d * t; }
