/* ground-props.js: code-drawn iso pixel props for the hub ground (Hub L2).
   kinds: 'board' (league table board + trophy), 'workshop' (stone wheel workshop), 'tent' (striped fan tent).
   Same look as kit/sprites.js buildings: 2:1 iso, left face lit, right face shaded, P.outline outlines, kit palette only.
   drawProp(ctx, kind, x, y, opts): (x, y) = art-px bottom-centre of the footprint. opts { tier 1..5, locked, P }.
   propSize(kind, tier) -> { w, h } art px, upper bound of everything drawn (shadow included).
   Safe to import in node: touches window only inside drawProp, never at load. */

const KINDS = ['board', 'workshop', 'tent'];
const clampTier = (t) => Math.max(1, Math.min(5, (t | 0) || 1));

/* size table (art px). Measured (pixel bbox incl. shadow) against the real draw; keep w <= 50, h <= 48. */
const SIZE = {
  board:    [null, { w: 39, h: 40 }, { w: 39, h: 43 }, { w: 39, h: 44 }, { w: 41, h: 48 }, { w: 41, h: 48 }],
  workshop: [null, { w: 41, h: 39 }, { w: 45, h: 39 }, { w: 45, h: 45 }, { w: 45, h: 45 }, { w: 45, h: 46 }],
  tent:     [null, { w: 45, h: 42 }, { w: 45, h: 42 }, { w: 48, h: 45 }, { w: 48, h: 46 }, { w: 49, h: 46 }],
};
const LOCKED = { w: 45, h: 30 };

export function propSize(kind, tier) {
  if (!KINDS.includes(kind)) return { w: 0, h: 0 };
  const s = SIZE[kind][clampTier(tier)];
  return { w: s.w, h: s.h };
}
export function propSizeLocked() { return { w: LOCKED.w, h: LOCKED.h }; }

/* ---------- tiny pixel toolkit (own copy so the module never needs ISO at import) ---------- */
function toolkit(ctx, P) {
  const OUT = P.outline;
  function mix(a, b, t) {
    const A = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
    return '#' + A.map((v, i) => ('0' + Math.round(v + (B[i] - v) * t).toString(16)).slice(-2)).join('');
  }
  const px = (x, y, c, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w || 1, h || 1); };
  function line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy; ctx.fillStyle = c;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function poly(pts, c, dither) {
    const n = pts.length; let ymin = 1e9, ymax = -1e9;
    pts.forEach((p) => { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
    ymin = Math.round(ymin); ymax = Math.round(ymax); ctx.fillStyle = c;
    for (let y = ymin; y < ymax; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
        if (dither) { for (let x = x0; x < x1; x++) if (((x + y) & 1) === 0) ctx.fillRect(x, y, 1, 1); }
        else if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
      }
    }
  }
  const outl = (p, c) => { for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; line(a[0], a[1], b[0], b[1], c || OUT); } };
  const up = (p, h) => [p[0], p[1] - h];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function shadow(F, a, b, k) { // soft ground shadow under a footprint, 35% like SPR.shadow
    ctx.save(); ctx.globalAlpha = 0.35;
    poly([[F[0] - (k || 3), F[1] + 2], [F[0] - 2 * b - (k || 3), F[1] - b + 2], [F[0] + 2 * a - 2 * b, F[1] - a - b + 1], [F[0] + 2 * a, F[1] - a + 1]], P.shadow);
    ctx.restore();
  }
  /* iso box: F = front-bottom corner; a = extent to the right face, b = extent to the left face, h = height.
     left face lit, right face shaded (same as ISO.block + SPR houses). */
  function box(x, y, a, b, h, cT, cL, cR) {
    const F = [x, y], L = [x - 2 * b, y - b], R = [x + 2 * a, y - a], K = [x + 2 * a - 2 * b, y - a - b];
    const Fu = up(F, h), Lu = up(L, h), Ru = up(R, h), Ku = up(K, h);
    if (h > 0) { poly([F, L, Lu, Fu], cL); poly([F, R, Ru, Fu], cR); }
    poly([Fu, Ru, Ku, Lu], cT);
    outl([Fu, Ru, Ku, Lu]);
    if (h > 0) { line(L[0], L[1], F[0], F[1], OUT); line(F[0], F[1], R[0], R[1], OUT); line(L[0], L[1], Lu[0], Lu[1], OUT); line(R[0], R[1], Ru[0], Ru[1], OUT); line(F[0], F[1], Fu[0], Fu[1], OUT); }
    return { F, L, R, K, Fu, Lu, Ru, Ku, h,
      rf: (u, v) => { const q = lerp(F, R, u); return [q[0], q[1] - v]; },
      lf: (u, v) => { const q = lerp(F, L, u); return [q[0], q[1] - v]; } };
  }
  /* hip roof / tent roof: eave corners at (x, y); t = inset (1 = pyramid); rise px; stripe = alternate colour */
  function roof(x, y, a, b, rise, t, cT, cL, cR, stripe) {
    const F = [x, y], L = [x - 2 * b, y - b], R = [x + 2 * a, y - a], K = [x + 2 * a - 2 * b, y - a - b], C = lerp(F, K, 0.5);
    const rp = (p) => { const q = lerp(p, C, t); return [Math.round(q[0]), Math.round(q[1] - rise)]; };
    const F2 = rp(F), L2 = rp(L), R2 = rp(R), K2 = rp(K);
    if (stripe) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        poly([lerp(F, L, i / n), lerp(F, L, (i + 1) / n), lerp(F2, L2, (i + 1) / n), lerp(F2, L2, i / n)], i % 2 ? stripe : cL);
        poly([lerp(F, R, i / n), lerp(F, R, (i + 1) / n), lerp(F2, R2, (i + 1) / n), lerp(F2, R2, i / n)], i % 2 ? stripe : cR);
      }
    } else { poly([F, L, L2, F2], cL); poly([F, R, R2, F2], cR); }
    if (t < 1) poly([F2, R2, K2, L2], cT);
    outl([F, R, R2, K2, L2, L]); line(F[0], F[1], F2[0], F2[1], OUT);
    if (t < 1) outl([F2, R2, K2, L2]);
    return { F2, top: lerp(F2, K2, 0.5) };
  }
  function grid(g, x, y, map) {
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) { const c = g[j][i]; if (c !== '.' && map[c]) px(x + i, y + j, map[c]); }
  }
  return { OUT, mix, px, line, poly, outl, lerp, up, shadow, box, roof, grid };
}

/* ---------- little shared parts ---------- */
const TROPHY_A = ['.ooooo.', 'ogwgggo', 'oggggGo', '.ogggo.', '..ogo..', '..oGo..', '.ooooo.'];
const TROPHY_B = ['o.ooooo.o', 'oogwgggoo', 'o.oggGo.o', '.oogggoo.', '..oggGo..', '...ogo...', '...oGo...', '..ooooo..', '..oGGGo..', '..ooooo..'];
const TROPHY_C = ['..ooooooo..', 'o.ogwgggGo.o', 'oogggggggGoo', 'o.ogggggGo.o', '.oogggggGoo.', '..oogggGoo..', '...ooggGo...', '....oggo....', '....ogGo....', '...ooggoo...', '..oogggGoo..', '..ooooooo...'];
function trophy(T, cx, by, tier) {
  const g = tier >= 4 ? TROPHY_C : tier >= 2 ? TROPHY_B : TROPHY_A;
  const w = Math.max.apply(null, g.map((r) => r.length));
  const map = { o: T.OUT, g: T.P.gold, G: T.mix(T.P.gold, T.P.outline, 0.35), w: T.P.cream };
  T.grid(g.map((r) => (r + '.........').slice(0, w)), Math.round(cx - w / 2), Math.round(by - g.length), map);
}

const PERSON = ['.ooo.', 'ohhho', 'ossso', 'ottto', 'ottto', 'oppPo', 'op.po', 'oo.oo'];
function person(T, x, y, shirt, o) {
  o = o || {};
  const P = T.P, m = { o: T.OUT, h: o.hair || P.hair1, s: o.skin || P.skin1, t: shirt, p: o.pants || P.cream, P: o.pants || P.cream };
  T.grid(PERSON, Math.round(x) - 2, Math.round(y) - 8, m);
  if (o.wave) { const hx = Math.round(x) + 3; T.px(hx, y - 8, m.s); T.px(hx, y - 7, T.OUT); T.px(Math.round(x) - 3, y - 8, m.s); T.px(Math.round(x) - 3, y - 7, T.OUT); }
}

/* ---------- board: league table on two posts, trophy on top ---------- */
function drawBoard(T, P, cx, by, tier) {
  const a = 15 + (tier >= 4 ? 1 : 0), b = 3, h = 12 + Math.min(3, tier - 1), lift = 8;
  const x = cx - a + b, F = [x, by];
  T.shadow(F, a, b, 3);
  // two posts, lit left / dark right
  const p0 = [x + 4, by - 2], p1 = [x + 2 * a - 4, by - a + 2];
  [p0, p1].forEach((p) => { T.px(p[0] - 1, p[1] - lift, T.OUT, 5, lift + 3); T.px(p[0], p[1] - lift, P.wood, 3, lift + 1); T.px(p[0], p[1] - lift, T.mix(P.wood, P.cream, 0.25), 1, lift + 1); T.px(p[0] + 2, p[1] - lift, T.mix(P.wood, P.outline, 0.35), 1, lift + 1); });
  const bx = T.box(x, by - lift, a, b, h, P.wood, P.wood, T.mix(P.accent, P.outline, 0.45));
  // chalk rows on the board face: top row gold (leader), rest cream
  const rows = tier >= 4 ? 4 : 3, step = Math.max(2, Math.round((h - 4) / rows));
  for (let r = 0; r < rows; r++) {
    const v = h - 3 - r * step;
    for (let u = 0.1; u < 0.92; u += 1 / (2 * a)) {
      const q = bx.rf(u, v), keep = ((Math.round(u * 40) * 7 + r * 5) % 9) !== 0;
      if (keep) T.px(q[0], q[1], r === 0 ? P.gold : P.cream);
    }
  }
  if (tier >= 2) { const q = bx.rf(0.06, h - 3); T.px(q[0], q[1], P.gold); } // rank mark
  // trophy sits on the top edge middle
  const t = bx.rf(0.5, h);
  trophy(T, t[0] - b, t[1] - Math.ceil(b / 2) - 1, tier);
  if (tier >= 5) { // ribbon bunting on the front-left edge
    const l = bx.lf(0.5, h - 2); T.px(l[0], l[1], P.danger); T.px(l[0], l[1] + 1, P.danger);
  }
}

/* ---------- workshop: stone block, wooden hip roof, gold wheel on the right face, chimney ---------- */
function drawWorkshop(T, P, cx, by, tier) {
  const a = 10, b = 8, h = 14 + (tier >= 5 ? 1 : 0), x = cx - a + b, F = [x, by];
  T.shadow(F, a, b, 4);
  const stone = P.stone1, dark = P.stone2, wood2 = P.hair1;
  const bx = T.box(x, by, a, b, h, dark, stone, dark);
  // stone course lines on both faces
  for (let v = 3; v < h; v += 4) {
    const off = ((v / 4) | 0) % 2 ? 0.12 : 0.3;
    for (let u = off; u < 1; u += 0.36) { const q = bx.rf(u, v); T.px(q[0], q[1], P.stone1); T.px(q[0] + 1, q[1], P.stone1); const l = bx.lf(u, v); T.px(l[0], l[1], dark); T.px(l[0] + 1, l[1], dark); }
  }
  // door on the left face
  const dl = bx.lf(0.5, 0); T.px(dl[0] - 3, dl[1] - 10, T.OUT, 6, 10); T.px(dl[0] - 2, dl[1] - 9, wood2, 4, 9); T.px(dl[0] + 1, dl[1] - 5, P.gold);
  if (tier >= 3) { const w = bx.lf(0.82, h - 5); T.px(w[0] - 1, w[1] - 1, T.OUT, 4, 5); T.px(w[0], w[1], P.sky1, 2, 3); T.px(w[0], w[1], P.white); }
  // wooden roof: slab eave + hip
  const e = T.roof(x - 1, by - h, a + 1, b + 1, 7, 0.5, T.mix(P.roof2, P.roof1, 0.3), P.roof2, P.wood);
  // chimney(s) from the roof
  const chim = (u) => {
    const c = bx.rf(u, h + 4), cx2 = c[0], cy = c[1];
    T.box(cx2 - 1, cy - 1, 2, 2, 7, P.stone1, P.stone1, P.stone2);
    return [cx2 - 3, cy - 9];
  };
  const c1 = chim(0.72);
  if (tier >= 3) { // smoke puffs
    [[0, -3, 2], [2, -6, 2], [0, -9, 1]].forEach((s, i) => { T.px(c1[0] + 2 + s[0], c1[1] + s[1], i % 2 ? P.stone1 : P.white, s[2] + 1, s[2]); });
  }
  if (tier >= 4) chim(0.28);
  // gold wheel on the right face
  const R = tier >= 5 ? 6 : 5, w = bx.rf(0.46, R + 2);
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const d = Math.sqrt(i * i + j * j); if (d > R + 0.4) continue;
    const col = d > R - 0.8 ? T.OUT : d > R - 1.9 ? P.gold : d < 1.3 ? T.OUT : (Math.abs(i) < 0.6 || Math.abs(j) < 0.6 || Math.abs(Math.abs(i) - Math.abs(j)) < 0.6) ? P.wood : null;
    if (col) T.px(w[0] + i, w[1] + j, col);
  }
  T.px(w[0], w[1], P.gold);
  // woodpile / crate at the right foot
  if (tier >= 2) T.box(Math.round(x + 2 * a - 1), by - 2, 3, 2, 4, P.roof1, P.roof2, P.wood);
  if (tier >= 4) T.box(Math.round(x + 2 * a - 1), by - 6, 3, 2, 3, P.roof1, P.roof2, P.wood);
  if (tier >= 5) { // hanging gold sign flag on a pole over the door
    const t = bx.lf(0.5, h + 3); T.line(t[0], t[1], t[0], t[1] - 9, T.OUT); T.px(t[0] + 1, t[1] - 9, T.OUT, 5, 4); T.px(t[0] + 1, t[1] - 8, P.gold, 4, 2); T.px(t[0] + 1, t[1] - 8, P.white);
  }
  void e;
}

/* ---------- tent: striped hip tent, bunting, flag, two tiny fans ---------- */
function drawTent(T, P, cx, by, tier) {
  const a = 11, b = 9, h = 6, x = cx - a + b, F = [x, by];
  T.shadow(F, a, b, 3);
  const bx = T.box(x, by, a, b, h, P.cream, P.cream, P.wall2);
  // dark doorway on the left face
  const d = bx.lf(0.5, 0); T.px(d[0] - 2, d[1] - h + 1, T.mix(P.outline, P.kitA2, 0.5), 5, h - 1);
  const r = T.roof(x - 1, by - h, a + 1, b + 1, 15 + (tier >= 4 ? 1 : 0), 1, P.kitA1, P.kitA1, P.kitA2, P.cream);
  const top = r.top;
  // flag on the apex
  T.line(top[0], top[1], top[0], top[1] - 8, T.OUT);
  if (tier >= 2) { T.poly([[top[0] + 1, top[1] - 8], [top[0] + 7, top[1] - 6], [top[0] + 1, top[1] - 4]], P.kitB1); T.px(top[0] + 2, top[1] - 7, P.cream); }
  else T.px(top[0] + 1, top[1] - 8, P.kitB1, 2, 2);
  // bunting from apex to a side pole (needs tier >= 3), longer at 5
  if (tier >= 3) {
    const pole = [Math.round(x + 2 * a + 4), by - a - 2];
    T.line(pole[0], pole[1], pole[0], pole[1] - 16, T.OUT); T.px(pole[0] + 0, pole[1] - 16, P.wood);
    const n = 12, cols = [P.kitB1, P.gold, P.cream];
    for (let i = 0; i <= n; i++) {
      const q = T.lerp([top[0], top[1] - 2], [pole[0], pole[1] - 16], i / n); q[1] += Math.round(Math.sin(i / n * Math.PI) * 3);
      T.px(q[0], q[1], T.OUT);
      if (i % 2) { T.px(q[0], q[1] + 1, cols[i % 3]); T.px(q[0], q[1] + 2, cols[i % 3]); }
    }
    if (tier >= 5) { // second string on the left side
      const pl = [Math.round(x - 2 * b - 4), by - 4];
      T.line(pl[0], pl[1], pl[0], pl[1] - 12, T.OUT);
      for (let i = 0; i <= 10; i++) {
        const q = T.lerp([top[0], top[1] - 1], [pl[0], pl[1] - 12], i / 10); q[1] += Math.round(Math.sin(i / 10 * Math.PI) * 3);
        T.px(q[0], q[1], T.OUT); if (i % 2) { T.px(q[0], q[1] + 1, [P.gold, P.kitB1, P.cream][i % 3]); T.px(q[0], q[1] + 2, [P.gold, P.kitB1, P.cream][i % 3]); }
      }
    }
  }
  // fans at the front-left (tier 1: none; 2: one; 3+: two)
  if (tier >= 2) person(T, x - 2 * b + 1, by + 1, P.kitA1, { wave: 1, pants: P.kitA2 });
  if (tier >= 3) person(T, x - 2 * b + 8, by + 2, P.gold, { wave: 1, hair: P.hair2, pants: P.kitA2 });
  if (tier >= 4) person(T, x + 5, by + 2, P.kitB1, { skin: P.skin3, pants: P.kitA2 });
  void F;
}

/* ---------- locked: fenced empty plot with a small "soon" sign ---------- */
function drawLocked(T, P, cx, by) {
  const a = 12, b = 9, x = cx - a + b, F = [x, by], L = [x - 2 * b, by - b], R = [x + 2 * a, by - a], K = [x + 2 * a - 2 * b, by - a - b];
  T.shadow(F, a, b, 2);
  T.poly([F, R, K, L], P.dirt);
  T.poly([F, R, K, L], P.pitch2, true);
  const ph = 6, rail = T.mix(P.wood, P.cream, 0.2);
  const post = (p) => { p = [Math.round(p[0]), Math.round(p[1])]; T.px(p[0] - 1, p[1] - ph - 1, T.OUT, 3, ph + 2); T.px(p[0], p[1] - ph, P.wood, 1, ph); T.px(p[0], p[1] - ph, rail, 1, 1); };
  const run = (A, B, gap) => { // rails + posts along one fence side; gap = skip the middle rail section (gate)
    for (const dy of [5, 2]) {
      const seg = (p, q) => { T.line(p[0], p[1] - dy + 1, q[0], q[1] - dy + 1, T.OUT); T.line(p[0], p[1] - dy, q[0], q[1] - dy, rail); };
      if (gap) { seg(A, T.lerp(A, B, 0.38)); seg(T.lerp(A, B, 0.62), B); }
      else seg(A, B);
    }
    [1 / 3, 2 / 3].forEach((t) => { if (!(gap && t > 0.3 && t < 0.7)) post(T.lerp(A, B, t)); });
    if (gap) { post(T.lerp(A, B, 0.38)); post(T.lerp(A, B, 0.62)); }
  };
  run(L, K); run(K, R); post(L); post(K); post(R);
  run(L, F, true); run(F, R);
  // "soon" sign: planted just inside the front corner, gold-edged board with three dots
  const sx = Math.round(F[0]) + 1, sy = by - 5;
  T.px(sx - 1, sy - 12, T.OUT, 3, 14); T.px(sx, sy - 12, P.wood, 1, 13);
  T.px(sx - 7, sy - 22, T.OUT, 15, 11); T.px(sx - 6, sy - 21, P.cream, 13, 9); T.px(sx - 6, sy - 21, P.gold, 13, 1);
  [-3, 0, 3].forEach((o) => T.px(sx + o - 1, sy - 16, T.OUT, 2, 2));
  [[-7, -7], [9, -11], [-11, -11], [2, -4]].forEach((t) => T.px(cx + t[0], by + t[1], P.grass2, 1, 2));
}

/* ---------- public ---------- */
export function drawProp(ctx, kind, x, y, opts) {
  opts = opts || {};
  const P = opts.P || (typeof window !== 'undefined' && window.PAL) || null;
  if (!ctx || !P || !KINDS.includes(kind)) return null;
  const tier = clampTier(opts.tier);
  const T = toolkit(ctx, P); T.P = P;
  const cx = Math.round(x), by = Math.round(y);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (opts.locked) drawLocked(T, P, cx, by);
  else if (kind === 'board') drawBoard(T, P, cx, by, tier);
  else if (kind === 'workshop') drawWorkshop(T, P, cx, by, tier);
  else drawTent(T, P, cx, by, tier);
  ctx.restore();
  return opts.locked ? propSizeLocked() : propSize(kind, tier);
}
