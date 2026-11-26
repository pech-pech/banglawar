// People dots with tick interpolation (motion #1). Draw-only.
import { MODE, MAP_W, MAP_H } from '../contract.js';

const TAU = Math.PI * 2;
const COL = { lost: '#b3261e', white: '#ffffff', safe: '#3fe0ff', hurt: '#ff4fa3' };
const HURT = 5;
const ORDER = [MODE.LOST, MODE.CALM, MODE.AWARE, MODE.SAFE, MODE.PANIC, HURT];
const FILL = { [MODE.LOST]: COL.lost, [MODE.CALM]: COL.white, [MODE.AWARE]: COL.white, [MODE.SAFE]: COL.safe, [MODE.PANIC]: COL.white, [HURT]: COL.hurt };

export function initPeople(r) {
  r.people = { cap: 0, px: null, py: null, cx: null, cy: null, dx: null, dy: null, n: 0, have: false };
  if (!r.dbg) r.dbg = { maxJump: 0, fireMaxDelta: 0, fireCells: 0, snaps: 0 };
}

function grow(s, n) {
  if (s.cap >= n) return;
  const cap = Math.max(n, 64);
  s.px = new Float32Array(cap); s.py = new Float32Array(cap);
  s.cx = new Float32Array(cap); s.cy = new Float32Array(cap);
  s.dx = new Float32Array(cap); s.dy = new Float32Array(cap);
  s.cap = cap; s.have = false;
}

export function drawPeople(f) {
  const r = f.r, ctx = f.ctx, P = f.state.people, dbg = r.dbg;
  if (!r.people) initPeople(r);
  const s = r.people;
  if (!P || !(P.n > 0)) { s.have = false; dbg.maxJump = 0; return; }
  const n = P.n;
  grow(s, n);
  const reset = f.reset || !s.have || s.n !== n;
  const S = f.S, ox = f.ox, oy = f.oy;

  if (reset) {
    for (let i = 0; i < n; i++) { s.px[i] = s.cx[i] = P.x[i]; s.py[i] = s.cy[i] = P.y[i]; }
  } else if (f.tickChanged) {
    for (let i = 0; i < n; i++) { s.px[i] = s.cx[i]; s.py[i] = s.cy[i]; s.cx[i] = P.x[i]; s.cy[i] = P.y[i]; }
  } else {
    // same tick: keep cur in sync (positions may be edited between ticks, e.g. test hook)
    for (let i = 0; i < n; i++) { s.cx[i] = P.x[i]; s.cy[i] = P.y[i]; }
  }
  const t = f.run ? Math.min(1, Math.max(0, f.alpha)) : 1;

  const base = Math.max(2.5, S * 0.4), pr = base + 0.8;
  const resPhase = f.state.phase === 'result', ex = P.exp;
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const lo = 0.3, hiX = MAP_W - 0.3, hiY = MAP_H - 0.3;
  let maxJump = 0, snaps = 0;

  for (let i = 0; i < n; i++) {
    let m = P.mode[i];
    const rad = m === MODE.PANIC ? pr : base;
    if (ex && ex[i] && m !== MODE.SAFE) m = resPhase ? MODE.LOST : HURT;
    const ax = s.px[i], ay = s.py[i], bx = s.cx[i], by = s.cy[i];
    let x, y;
    if (reset || t >= 1) { x = bx; y = by; }
    else {
      const ddx = bx - ax, ddy = by - ay;
      if (ddx * ddx + ddy * ddy > 9) { x = bx; y = by; snaps++; }
      else { x = ax + ddx * t; y = ay + ddy * t; }
    }
    if (x < lo) x = lo; else if (x > hiX) x = hiX;
    if (y < lo) y = lo; else if (y > hiY) y = hiY;
    if (!reset) {
      const jx = x - s.dx[i], jy = y - s.dy[i], j = Math.sqrt(jx * jx + jy * jy) * S;
      if (j > maxJump) maxJump = j;
    }
    s.dx[i] = x; s.dy[i] = y;
    const px = x * S - ox, py = y * S - oy, pth = paths[m];
    pth.moveTo(px + rad, py); pth.arc(px, py, rad, 0, TAU);
  }
  s.n = n; s.have = true;
  dbg.maxJump = reset ? 0 : maxJump;
  if (snaps && f.tickChanged) dbg.snaps += snaps; // count once per tick change

  const pa = ctx.globalAlpha;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  for (let k = 0; k < ORDER.length; k++) {
    const m = ORDER[k];
    ctx.fillStyle = FILL[m];
    ctx.fill(paths[m]);
    ctx.strokeStyle = m === HURT ? 'rgba(255,255,255,0.95)' : 'rgba(12,20,32,0.28)';
    ctx.stroke(paths[m]);
  }
  ctx.globalAlpha = pa;
}
