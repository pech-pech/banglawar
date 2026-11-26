// Terrain layer (Look A): baked land/water (base), burnt ground (cross-faded), roads/breaks/bridges (over).
// Draw order: base, burnt, over (roads sit above scorch).
import { TYPE, MAP_W, MAP_H } from '../contract.js';
import {
  N, hsh, ss, blur, axis, mixc, mkCanvas, clamp,
  MEADOW, FOREST, FOREST_RIM, ROCKC, WATERC, SHALLOW, SAND,
  ROADC, ROADEDGE, CLEARC, CLEAREDGE, BRIDGEC, BRIDGEEDGE, CHAR,
} from './util.js';

const BR = 4, OR = 6, XR = 3, FADE_MS = 0.5 * 1000;
const FOREST_DARK = [48, 116, 68], FOREST_LIGHT = [88, 160, 94];

export function initTerrain(r) {
  r.terrain = {
    base: mkCanvas(MAP_W * BR, MAP_H * BR), over: mkCanvas(MAP_W * OR, MAP_H * OR),
    burnt: [mkCanvas(MAP_W * XR, MAP_H * XR), mkCanvas(MAP_W * XR, MAP_H * XR)],
    cur: 0,            // index of the newest burnt canvas
    fadeStart: -1e9,   // f.now when the cross-fade began
    hasOld: false,     // old canvas still visible under the fade
    key: null, grid: null, planLen: -1,
    nb: -1, nbCur: 0,  // burnt count drawn / newest
    burntTick: -1, burntPhase: '',
  };
}

function bakeTerrain(T, state) {
  const t = state.grid.type;
  const fW = new Float32Array(N), fR = new Float32Array(N), fWa = new Float32Array(N), fRo = new Float32Array(N), fCl = new Float32Array(N), fBr = new Float32Array(N), Hc = new Float32Array(N), Hb = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = t[i]; Hc[i] = hsh(i + 77); Hb[i] = hsh(i * 3 + 991);
    if (v === TYPE.WOODS) fW[i] = 1; else if (v === TYPE.ROCK) fR[i] = 1;
    if (v === TYPE.WATER || v === TYPE.BRIDGE) fWa[i] = 1;
    if (v === TYPE.ROAD) fRo[i] = 1; else if (v === TYPE.CLEAR) fCl[i] = 1;
    if (v === TYPE.BRIDGE) fBr[i] = 1;
  }
  const W2 = blur(blur(fW)), R2 = blur(blur(fR)), Wa = blur(fWa), Ro = blur(fRo), Cl = blur(fCl), Br = blur(fBr), Rb = blur(Ro);
  const Hs = blur(Hc), Hk = blur(blur(Hb)); // Hk: soft canopy blotches (B5), no pixel speckle

  { // base: land + water
    const R = BR, BW = MAP_W * R, BH = MAP_H * R, ctx = T.base.getContext('2d'), img = ctx.createImageData(BW, BH), d = img.data;
    const ax = axis(BW, R, MAP_W), ay = axis(BH, R, MAP_H);
    const c = [0, 0, 0], wc = [0, 0, 0];
    for (let Y = 0; Y < BH; Y++) {
      const ra = ay.i0[Y] * MAP_W, rb = ay.i1[Y] * MAP_W, fy = ay.f[Y];
      for (let X = 0; X < BW; X++) {
        const a = ra + ax.i0[X], b = ra + ax.i1[X], cc = rb + ax.i0[X], dd = rb + ax.i1[X], fx = ax.f[X];
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const ww = W2[a] * w00 + W2[b] * w10 + W2[cc] * w01 + W2[dd] * w11;
        const rw = R2[a] * w00 + R2[b] * w10 + R2[cc] * w01 + R2[dd] * w11;
        const wa = Wa[a] * w00 + Wa[b] * w10 + Wa[cc] * w01 + Wa[dd] * w11;
        const tone = ((Hs[a] * w00 + Hs[b] * w10 + Hs[cc] * w01 + Hs[dd] * w11) - 0.5) * 0.5;
        c[0] = MEADOW[0]; c[1] = MEADOW[1]; c[2] = MEADOW[2];
        const gl = 1 + tone * 0.35; c[0] *= gl; c[1] *= gl; c[2] *= gl;
        const aR = ss(0.42, 0.58, rw); if (aR > 0) mixc(c, ROCKC, aR);
        const aW = ss(0.4, 0.56, ww);
        if (aW > 0) {
          mixc(c, FOREST, aW);
          const rim = ss(0.34, 0.44, ww) * (1 - ss(0.5, 0.64, ww)); if (rim > 0) mixc(c, FOREST_RIM, rim * 0.7);
          if (aW > 0.7) { // B5: soft low-contrast canopy blotches (cell-scale, blurred) instead of 2 px stipple
            const n = Hk[a] * w00 + Hk[b] * w10 + Hk[cc] * w01 + Hk[dd] * w11 - 0.5;
            if (n < 0) mixc(c, FOREST_DARK, 0.3 * ss(0, 0.08, -n)); else mixc(c, FOREST_LIGHT, 0.26 * ss(0, 0.08, n));
          }
        }
        const bank = ss(0.18, 0.3, wa) * (1 - ss(0.34, 0.44, wa)); if (bank > 0) mixc(c, SAND, bank * 0.95);
        const aWa = ss(0.36, 0.46, wa);
        if (aWa > 0) { wc[0] = WATERC[0]; wc[1] = WATERC[1]; wc[2] = WATERC[2]; mixc(wc, SHALLOW, (1 - ss(0.5, 0.78, wa)) * 0.9); mixc(c, wc, aWa); }
        const o = (Y * BW + X) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  { // overlay: firebreak, road, bridge
    const R = OR, BW = MAP_W * R, BH = MAP_H * R, ctx = T.over.getContext('2d'), img = ctx.createImageData(BW, BH), d = img.data;
    const ax = axis(BW, R, MAP_W), ay = axis(BH, R, MAP_H);
    const any = new Uint8Array(N); for (let i = 0; i < N; i++) any[i] = (Cl[i] > 0 || Ro[i] > 0 || Br[i] > 0 || Rb[i] > 0) ? 1 : 0;
    let cr = 0, cg = 0, cb = 0, ca = 0;
    const over = (col, al) => { if (al <= 0.002) return; const oa = al + ca * (1 - al); cr = (col[0] * al + cr * ca * (1 - al)) / oa; cg = (col[1] * al + cg * ca * (1 - al)) / oa; cb = (col[2] * al + cb * ca * (1 - al)) / oa; ca = oa; };
    for (let Y = 0; Y < BH; Y++) {
      const ra = ay.i0[Y] * MAP_W, rb = ay.i1[Y] * MAP_W, fy = ay.f[Y];
      for (let X = 0; X < BW; X++) {
        const a = ra + ax.i0[X], b = ra + ax.i1[X], cc = rb + ax.i0[X], dd = rb + ax.i1[X];
        if (!any[a] && !any[b] && !any[cc] && !any[dd]) continue;
        const fx = ax.f[X], w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        cr = cg = cb = ca = 0;
        const cl = Cl[a] * w00 + Cl[b] * w10 + Cl[cc] * w01 + Cl[dd] * w11;
        const ro = Ro[a] * w00 + Ro[b] * w10 + Ro[cc] * w01 + Ro[dd] * w11;
        const br = Br[a] * w00 + Br[b] * w10 + Br[cc] * w01 + Br[dd] * w11;
        if (cl > 0.25) { over(CLEAREDGE, ss(0.26, 0.31, cl)); over(CLEARC, ss(0.36, 0.41, cl)); }
        if (ro > 0.25) { over(ROADEDGE, ss(0.26, 0.31, ro)); over(ROADC, ss(0.36, 0.41, ro)); }
        if (br > 0.15) {
          const bq = Math.min(1, br * 1.7);
          over(BRIDGEEDGE, ss(0.26, 0.31, bq)); over(BRIDGEC, ss(0.36, 0.41, bq));
          if (bq > 0.5 && (Y % 9) === 0) over(BRIDGEEDGE, 0.22);
        }
        if (ca > 0) { const o = (Y * BW + X) * 4; d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = Math.round(ca * 255); }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}

// burnt ground into canvas cv: charcoal, soft edge, faint ember specks
function bakeBurnt(cv, state) {
  const burnt = state.grid.burnt, F = new Float32Array(N);
  for (let i = 0; i < N; i++) F[i] = burnt[i] ? 1 : 0;
  const B = blur(F), R = XR, BW = MAP_W * R, BH = MAP_H * R, ctx = cv.getContext('2d'), img = ctx.createImageData(BW, BH), d = img.data;
  const ax = axis(BW, R, MAP_W), ay = axis(BH, R, MAP_H);
  for (let Y = 0; Y < BH; Y++) {
    const ra = ay.i0[Y] * MAP_W, rb = ay.i1[Y] * MAP_W, fy = ay.f[Y];
    for (let X = 0; X < BW; X++) {
      const a = ra + ax.i0[X], b = ra + ax.i1[X], cc = rb + ax.i0[X], dd = rb + ax.i1[X], fx = ax.f[X];
      const v = B[a] * (1 - fx) * (1 - fy) + B[b] * fx * (1 - fy) + B[cc] * (1 - fx) * fy + B[dd] * fx * fy;
      if (v < 0.1) continue;
      const al = ss(0.12, 0.5, v), o = (Y * BW + X) * 4, h = hsh(X * 92821 + Y * 689287);
      let rr_ = CHAR[0], gg = CHAR[1], bb = CHAR[2];
      const edge = 1 - ss(0.3, 0.6, v); rr_ += edge * 22; gg += edge * 12;
      let aa = al * 0.93;
      if (h < 0.0035 && v > 0.7) { rr_ = 255; gg = 120; bb = 40; aa = 0.7; }
      d[o] = rr_; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = Math.round(aa * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// identity key, only evaluated on tick change / reset / plan length change (never a per-frame scan)
function terrainKey(state) {
  const t = state.grid.type; let nc = 0;
  for (let i = 0; i < t.length; i++) if (t[i] === TYPE.CLEAR) nc++;
  return (state.plan ? state.plan.length : 0) + '|' + nc + '|' + (state._terrainVer || 0);
}

export function drawTerrain(f) {
  const r = f.r, T = r.terrain, ctx = f.ctx, state = f.state, g = f.g;
  const planLen = state.plan ? state.plan.length : 0;
  const stale = f.tickChanged || f.reset || planLen !== T.planLen || T.grid !== g;
  if (stale) {
    const key = terrainKey(state);
    if (T.key !== key || T.grid !== g) { bakeTerrain(T, state); T.key = key; T.grid = g; T.nb = -1; T.nbCur = -1; T.hasOld = false; }
    T.planLen = planLen;
    let nb = 0; const burnt = g.burnt; for (let i = 0; i < N; i++) nb += burnt[i];
    if (nb !== T.nbCur && (state.phase !== 'run' || nb === 0 || f.tick < T.burntTick || f.tick - T.burntTick >= 3 || T.burntPhase !== state.phase || f.reset)) {
      const hadBurnt = T.nb > 0 && T.nbCur > 0;
      const snap = f.reset || f.calm || !hadBurnt || nb === 0;
      const nxt = 1 - T.cur;
      bakeBurnt(T.burnt[nxt], state);
      T.cur = nxt; T.nbCur = nb; T.burntTick = f.tick; T.burntPhase = state.phase;
      if (snap) { T.hasOld = false; T.nb = nb; } else { T.hasOld = true; T.fadeStart = f.now; T.nb = nb; }
    }
  }
  const S = f.S, MW = f.MW, MH = f.MH;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(T.base, -f.ox, -f.oy, MW, MH);
  if (T.nb > 0) {
    if (T.hasOld) {
      const k = clamp((f.now - T.fadeStart) / FADE_MS, 0, 1);
      if (k >= 1) T.hasOld = false;
      else { // old stays opaque underneath, new fades in on top (burnt only grows, so no dip)
        ctx.drawImage(T.burnt[1 - T.cur], -f.ox, -f.oy, MW, MH);
        ctx.globalAlpha = k * k * (3 - 2 * k);
        ctx.drawImage(T.burnt[T.cur], -f.ox, -f.oy, MW, MH);
        ctx.globalAlpha = 1;
      }
    }
    if (!T.hasOld) ctx.drawImage(T.burnt[T.cur], -f.ox, -f.oy, MW, MH);
  }
  ctx.drawImage(T.over, -f.ox, -f.oy, MW, MH);
}
