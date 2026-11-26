// Windward Line - js/r/fire.js. Fire layer (look A): eased per-cell intensity -> 2x field -> colour LUT + half-res glow,
// embers (tick-interpolated streaks), strike ring. Cost follows the active (burning / fading) cell list.
import { MAP_W, MAP_H } from '../contract.js';
import { N, TAU, hsh, axis, makeLut, mkCanvas, clamp, lerp, easeOutQuad } from './util.js';

const FIRE_LUT = makeLut([[0, 150, 20, 18, 0], [0.07, 160, 22, 18, 0], [0.14, 176, 28, 20, 170], [0.3, 226, 52, 20, 240], [0.5, 255, 112, 22, 255],
  [0.75, 255, 184, 44, 255], [1.0, 255, 232, 128, 255], [1.3, 255, 252, 226, 255]]);
const GLOW_LUT = makeLut([[0, 255, 96, 24, 0], [0.12, 255, 96, 24, 20], [0.5, 255, 110, 30, 78], [1.0, 255, 140, 40, 120], [1.3, 255, 170, 60, 130]]);

const FR = 2, GW = MAP_W >> 1, GH = MAP_H >> 1, EMAX = 256, RMAX = 8, RING_S = 0.4, RING_CELLS = 6;

export function initFire(r) {
  const fireC = mkCanvas(MAP_W * FR, MAP_H * FR), glowC = mkCanvas(GW, GH);
  const fireImg = fireC.getContext('2d').createImageData(MAP_W * FR, MAP_H * FR);
  const glowImg = glowC.getContext('2d').createImageData(GW, GH);
  r.fire = {
    fi: new Float32Array(N), tgt: new Float32Array(N), act: new Int32Array(N), nAct: 0, inAct: new Uint8Array(N), added: new Int32Array(N), nAdded: 0,
    F: new Float32Array(N), G: new Float32Array(GW * GH), phase: new Float32Array(N), freq: new Float32Array(N),
    fireC, glowC, fctx: fireC.getContext('2d'), gctx: glowC.getContext('2d'), fireImg, fire32: new Uint32Array(fireImg.data.buffer),
    glowImg, glow32: new Uint32Array(glowImg.data.buffer),
    ax: axis(MAP_W * FR, FR, MAP_W), ay: axis(MAP_H * FR, FR, MAP_H),
    // embers: prev/cur positions by array index
    ex0: new Float32Array(EMAX), ey0: new Float32Array(EMAX), ex1: new Float32Array(EMAX), ey1: new Float32Array(EMAX), eAge: new Float32Array(EMAX), nE: 0,
    // strike rings (pool)
    rx: new Float32Array(RMAX), ry: new Float32Array(RMAX), rt: new Float32Array(RMAX), rOn: new Uint8Array(RMAX),
    evN: 0, stateRef: null, started: false, lastTick: -1,
  };
  const q = r.fire;
  for (let i = 0; i < N; i++) { q.phase[i] = hsh(i * 7 + 3) * TAU; q.freq[i] = 2 + hsh(i * 11 + 5); } // 2-3 Hz
}

function addRing(q, x, y, t) {
  let k = -1;
  for (let j = 0; j < RMAX; j++) { if (!q.rOn[j]) { k = j; break; } }
  if (k < 0) { k = 0; for (let j = 1; j < RMAX; j++) if (q.rt[j] < q.rt[k]) k = j; }
  q.rx[k] = x; q.ry[k] = y; q.rt[k] = t; q.rOn[k] = 1;
}

// look-A weight for a burning cell, minus the tick-keyed jitter (static hash instead; flicker is smooth sin at draw)
function weight(bt, i) { return (0.5 + 0.5 * Math.min(1, bt / 12)) * (0.88 + 0.24 * hsh(i * 13)); }

export function drawFire(f) {
  const { r, ctx, state, g, ox, oy, MW, MH } = f, q = r.fire, burn = g.burn, fi = q.fi, tgt = q.tgt, act = q.act, inAct = q.inAct;
  const dbg = r.dbg || (r.dbg = { maxJump: 0, fireMaxDelta: 0, fireCells: 0, snaps: 0 });
  const dt = f.dt, calm = f.calm;

  // ---- reset: state object / phase changed -> snap ----
  const newState = q.stateRef !== state;
  if (f.reset || newState) {
    q.stateRef = state; q.started = false;
    fi.fill(0); inAct.fill(0); q.nAct = 0; q.nE = 0; q.rOn.fill(0);
    q.evN = (state.events && state.events.length) || 0;
    for (let i = 0; i < N; i++) { if (burn[i] > 0) { inAct[i] = 1; act[q.nAct++] = i; fi[i] = weight(burn[i], i); } }
    // keep tgt in sync for snapped cells
    for (let a = 0; a < q.nAct; a++) { const i = act[a]; tgt[i] = fi[i]; }
    q.nAdded = 0;
  } else if (f.tickChanged) {
    q.nAdded = 0;
    for (let i = 0; i < N; i++) { if (burn[i] > 0 && !inAct[i]) { inAct[i] = 1; act[q.nAct++] = i; q.added[q.nAdded++] = i; fi[i] = 0; } }
  } else { q.nAdded = 0; }

  // ---- strike rings ----
  if ((f.tickChanged || f.reset) && f.run) {
    let made = 0;
    const ev = state.events;
    if (ev && ev.length > q.evN && !f.reset) {
      for (let k = q.evN; k < ev.length && made < 3; k++) {
        const e = ev[k], kd = e && e.kind ? String(e.kind) : '';
        if (e && e.x != null && (kd.indexOf('spot') >= 0 || kd.indexOf('strike') >= 0)) { addRing(q, e.x + 0.5, e.y + 0.5, f.time); made++; }
      }
    }
    if (ev) q.evN = ev.length;
    if (!q.started && f.tick <= 2 && q.nAct > 0) { // run start
      q.started = true;
      const need = made ? 0 : 3;
      let got = 0;
      for (let a = 0; a < q.nAct && got < need; a++) {
        const i = act[a], x = i % MAP_W, y = (i / MAP_W) | 0;
        let ok = true;
        for (let j = 0; j < RMAX; j++) if (q.rOn[j] && Math.abs(q.rx[j] - x) < 4 && Math.abs(q.ry[j] - y) < 4) { ok = false; break; }
        if (ok) { addRing(q, x + 0.5, y + 0.5, f.time); got++; }
      }
    } else if (!made && !f.reset && q.nAdded > 0 && !(ev && ev.some && ev.length)) { // fallback: isolated new cell
      for (let a = 0; a < q.nAdded && made < 3; a++) {
        const i = q.added[a], x = i % MAP_W, y = (i / MAP_W) | 0;
        let lone = true;
        for (let yy = Math.max(0, y - 3); yy <= Math.min(MAP_H - 1, y + 3) && lone; yy++) {
          for (let xx = Math.max(0, x - 3); xx <= Math.min(MAP_W - 1, x + 3); xx++) {
            const j = yy * MAP_W + xx; if (j !== i && (burn[j] > 0 || (g.burnt && g.burnt[j]))) { lone = false; break; }
          }
        }
        if (lone) { addRing(q, x + 0.5, y + 0.5, f.time); made++; }
      }
    }
  }

  // ---- ease fi toward target over the active list; build the field from fi ----
  const F = q.F, G = q.G, rise = calm ? 0.15 : 0.35, fall = calm ? 0.15 : 0.8;
  F.fill(0); G.fill(0);
  let minx = MAP_W, maxx = -1, miny = MAP_H, maxy = -1, maxD = 0, nf = 0, keep = 0;
  const T = f.time, flk = calm ? 0 : 0.1;
  for (let a = 0; a < q.nAct; a++) {
    const i = act[a], bt = burn[i], t = bt > 0 ? weight(bt, i) : 0;
    tgt[i] = t;
    let v = fi[i];
    if (!f.reset && !newState) {
      if (v < t) { v = Math.min(t, v + dt * 1.12 / rise); } // rise
      else if (v > t) { v = Math.max(t, v - dt * 1.12 / fall); } // fall
      // ease-out feel on rise: use easeOutQuad on the remaining gap to soften the start
      const d = Math.abs(v - fi[i]); if (d > maxD) maxD = d;
      fi[i] = v;
    }
    if (v <= 0.004 && t === 0) { inAct[i] = 0; fi[i] = 0; continue; }
    act[keep++] = i;
    if (v < 0.02) continue;
    nf++;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    const w = v * (1 + flk * Math.sin(T * TAU * q.freq[i] + q.phase[i]));
    const xa = x > 0 ? x - 1 : x, xb = x < MAP_W - 1 ? x + 1 : x, ya = y > 0 ? y - 1 : y, yb = y < MAP_H - 1 ? y + 1 : y, w4 = w / 16, w2 = w / 8, w1 = w / 4;
    F[ya * MAP_W + xa] += w4; F[ya * MAP_W + x] += w2; F[ya * MAP_W + xb] += w4;
    F[y * MAP_W + xa] += w2; F[i] += w1; F[y * MAP_W + xb] += w2;
    F[yb * MAP_W + xa] += w4; F[yb * MAP_W + x] += w2; F[yb * MAP_W + xb] += w4;
    const gx = x >> 1, gy = y >> 1, ga = gx > 0 ? gx - 1 : gx, gb = gx < GW - 1 ? gx + 1 : gx, gc = gy > 0 ? gy - 1 : gy, gd = gy < GH - 1 ? gy + 1 : gy, p = w / 64;
    G[gc * GW + ga] += p; G[gc * GW + gx] += 2 * p; G[gc * GW + gb] += p;
    G[gy * GW + ga] += 2 * p; G[gy * GW + gx] += 4 * p; G[gy * GW + gb] += 2 * p;
    G[gd * GW + ga] += p; G[gd * GW + gx] += 2 * p; G[gd * GW + gb] += p;
  }
  q.nAct = keep;
  dbg.fireMaxDelta = maxD; dbg.fireCells = nf;

  if (nf > 0) {
    const gl = q.glow32;
    for (let i = 0; i < G.length; i++) { const v = G[i] * 1.4; gl[i] = GLOW_LUT[v >= 1.27 ? 255 : (v * 200) | 0]; }
    q.gctx.putImageData(q.glowImg, 0, 0);
    ctx.globalAlpha = calm ? 0.9 : 0.85 + 0.15 * Math.sin(T * 3.85); ctx.drawImage(q.glowC, -ox, -oy, MW, MH); ctx.globalAlpha = 1;
    const FW = MAP_W * FR, f32 = q.fire32; f32.fill(0);
    const X0 = Math.max(0, (minx - 2) * FR), X1 = Math.min(FW - 1, (maxx + 3) * FR), Y0 = Math.max(0, (miny - 2) * FR), Y1 = Math.min(MAP_H * FR - 1, (maxy + 3) * FR);
    const ax = q.ax, ay = q.ay;
    for (let Y = Y0; Y <= Y1; Y++) {
      const ra = ay.i0[Y] * MAP_W, rb = ay.i1[Y] * MAP_W, fy = ay.f[Y];
      for (let X = X0; X <= X1; X++) {
        const fx = ax.f[X], v = F[ra + ax.i0[X]] * (1 - fx) * (1 - fy) + F[ra + ax.i1[X]] * fx * (1 - fy) + F[rb + ax.i0[X]] * (1 - fx) * fy + F[rb + ax.i1[X]] * fx * fy;
        if (v > 0.07) f32[Y * FW + X] = FIRE_LUT[v >= 1.27 ? 255 : (v * 200) | 0];
      }
    }
    q.fctx.putImageData(q.fireImg, 0, 0);
    ctx.drawImage(q.fireC, -ox, -oy, MW, MH);
  }
  drawStrike(f);
}

export function drawStrike(f) {
  const q = f.r.fire, ctx = f.ctx;
  for (let j = 0; j < RMAX; j++) {
    if (!q.rOn[j]) continue;
    const t = (f.time - q.rt[j]) / RING_S;
    if (t >= 1 || t < 0) { if (t >= 1) q.rOn[j] = 0; continue; }
    const e = easeOutQuad(t);
    ctx.globalAlpha = 0.8 * (1 - t); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = Math.max(2, f.S * 0.35 * (1 - t) + 1);
    ctx.beginPath(); ctx.arc(f.sx(q.rx[j]), f.sy(q.ry[j]), Math.max(1, e * RING_CELLS * f.S), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawEmbers(f) {
  const { r, ctx, state, S } = f, q = r.fire, em = state.embers, n = em ? Math.min(em.length, EMAX) : 0;
  if (f.reset || q.stateRef !== state) q.nE = -1; // force snap
  if (f.tickChanged || q.nE < 0 || n !== q.nE) {
    const snap = q.nE < 0 || n !== q.nE;
    for (let k = 0; k < n; k++) {
      const m = em[k], px = q.ex1[k], py = q.ey1[k];
      const fresh = snap || Math.abs(m.x - px) > 4 || Math.abs(m.y - py) > 4;
      if (fresh) { q.ex0[k] = m.x; q.ey0[k] = m.y; q.eAge[k] = 0; } else { q.ex0[k] = px; q.ey0[k] = py; }
      q.ex1[k] = m.x; q.ey1[k] = m.y;
    }
    q.nE = n;
  }
  if (!n) return;
  const a = clamp(f.alpha, 0, 1), e = Math.max(2, S * 0.32), tl = Math.max(7, S * 1.5), wv = f.wv;
  ctx.lineCap = 'round'; ctx.lineWidth = e * 0.9;
  for (let k = 0; k < n; k++) {
    q.eAge[k] += f.dt; const fade = clamp(q.eAge[k] / 0.2, 0, 1);
    const x = f.sx(lerp(q.ex0[k], q.ex1[k], a)), y = f.sy(lerp(q.ey0[k], q.ey1[k], a));
    if (!f.calm) {
      let dx = q.ex1[k] - q.ex0[k], dy = q.ey1[k] - q.ey0[k]; const L = Math.hypot(dx, dy);
      if (L > 1e-3) { dx /= L; dy /= L; } else { dx = wv.x; dy = wv.y; }
      ctx.globalAlpha = 0.75 * fade; ctx.strokeStyle = 'rgb(255,150,40)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * tl, y - dy * tl); ctx.stroke();
    }
    ctx.globalAlpha = fade; ctx.fillStyle = '#fff1a8';
    ctx.beginPath(); ctx.arc(x, y, e, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
