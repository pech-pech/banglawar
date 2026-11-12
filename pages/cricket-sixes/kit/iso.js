/* ISO: 2:1 dimetric helpers. Tile = 16x8 internal px. All output is integer pixels.
   Grid: +gx goes down-right, +gy goes down-left, gz is height in pixels (up). */
(function () {
  var HW = 8, HH = 4;
  var S = { ox: 0, oy: 0, list: [] };

  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function line(ctx, x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    ctx.fillStyle = c;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /* scanline polygon fill, no antialiasing. pts = [[x,y],...]. dither = checkerboard fill */
  function poly(ctx, pts, c, dither) {
    var n = pts.length, i, y, ymin = 1e9, ymax = -1e9;
    for (i = 0; i < n; i++) { ymin = Math.min(ymin, pts[i][1]); ymax = Math.max(ymax, pts[i][1]); }
    ymin = Math.round(ymin); ymax = Math.round(ymax);
    ctx.fillStyle = c;
    for (y = ymin; y < ymax; y++) {
      var yc = y + 0.5, xs = [];
      for (i = 0; i < n; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (i = 0; i + 1 < xs.length; i += 2) {
        var x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
        if (dither) { for (var x = x0; x < x1; x++) if (((x + y) & 1) === 0) ctx.fillRect(x, y, 1, 1); }
        else if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
      }
    }
  }
  function disc(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (var dy = -r; dy <= r; dy++) {
      var hw = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
      ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
    }
  }
  function toScreen(gx, gy, gz) {
    return { x: Math.round(S.ox + (gx - gy) * HW), y: Math.round(S.oy + (gx + gy) * HH - (gz || 0)) };
  }
  function tile(ctx, gx, gy, colour, opts) {
    opts = opts || {};
    var p = toScreen(gx, gy, opts.z || 0), x = p.x, y = p.y;
    var pts = [[x, y], [x + HW, y + HH], [x, y + 2 * HH], [x - HW, y + HH]];
    poly(ctx, pts, colour);
    if (opts.edge) for (var i = 0; i < 4; i++) { var a = pts[i], b = pts[(i + 1) % 4]; line(ctx, a[0], a[1], b[0], b[1], opts.edge); }
  }
  function tiles(ctx, gx, gy, w, d, colour, opts) {
    for (var j = 0; j < d; j++) for (var i = 0; i < w; i++)
      tile(ctx, gx + i, gy + j, typeof colour === 'function' ? colour(i, j) : colour, opts);
  }
  /* box footprint w x d tiles, height h px, optional base elevation opts.z */
  function block(ctx, gx, gy, w, d, h, o) {
    o = o || {};
    var z = o.z || 0, ol = o.outline === undefined ? window.PAL.outline : o.outline;
    var B0 = toScreen(gx, gy, z), R0 = toScreen(gx + w, gy, z), F0 = toScreen(gx + w, gy + d, z), L0 = toScreen(gx, gy + d, z);
    var B1 = toScreen(gx, gy, z + h), R1 = toScreen(gx + w, gy, z + h), F1 = toScreen(gx + w, gy + d, z + h), L1 = toScreen(gx, gy + d, z + h);
    function P(a) { return [a.x, a.y]; }
    var left = [P(L0), P(F0), P(F1), P(L1)], right = [P(F0), P(R0), P(R1), P(F1)], top = [P(B1), P(R1), P(F1), P(L1)];
    poly(ctx, left, o.left || window.PAL.wall2);
    poly(ctx, right, o.right || window.PAL.wall2);
    poly(ctx, top, o.top || window.PAL.wall1);
    if (ol) {
      [left, right, top].forEach(function (f) { for (var i = 0; i < 4; i++) line(ctx, f[i][0], f[i][1], f[(i + 1) % 4][0], f[(i + 1) % 4][1], ol); });
    }
    return { B1: B1, R1: R1, F1: F1, L1: L1, F0: F0, L0: L0, R0: R0 };
  }
  /* Cricket oval, drawn in screen space as a smooth pixel ellipse (2:1 iso oval).
     ellipseField(ctx, cgx, cgy, rx, ry, opts): centre = toScreen(cgx, cgy); rx, ry in tiles give screen radii
     a = (rx+ry)/2*11.3 px, b = a/2. Optional opts (all optional):
       a, b = stripe colours (default grass1, grass2); band = stripe width px (default 12, 0 = no stripes);
       rope = colour of 1 px boundary (default white, false = none); outline = colour of an extra 1 px ring (default none);
       radiusX, radiusY = screen px radii (override rx, ry); dy = vertical offset px. Returns {cx, cy, a, b}. */
  function ellipseField(ctx, cgx, cgy, rx, ry, o) {
    o = o || {};
    var c = toScreen(cgx, cgy, 0), cx = c.x, cy = c.y + (o.dy || 0);
    var A = o.radiusX || Math.round((rx + ry) / 2 * 11.3), Bv = o.radiusY || Math.round(A / 2);
    var ca = o.a || window.PAL.grass1, cb = o.b || window.PAL.grass2, rope = o.rope === undefined ? window.PAL.white : o.rope;
    var band = o.band === undefined ? 12 : o.band, y;
    function ext(r1, r2, yy) { // row extent for ellipse radii r1,r2 at row yy
      var dy = yy + 0.5; if (Math.abs(dy) >= r2) return null;
      var hw = r1 * Math.sqrt(1 - (dy * dy) / (r2 * r2)); return [Math.round(cx - hw), Math.round(cx + hw)];
    }
    if (o.outline) for (y = -Bv - 1; y <= Bv; y++) { var e0 = ext(A + 1, Bv + 1, y); if (e0) { ctx.fillStyle = o.outline; ctx.fillRect(e0[0], cy + y, e0[1] - e0[0], 1); } }
    var rows = {};
    for (y = -Bv; y < Bv; y++) rows[y] = ext(A, Bv, y);
    for (y = -Bv; y < Bv; y++) {
      var e = rows[y]; if (!e) continue;
      for (var x = e[0]; x < e[1];) {
        var k = band ? Math.floor((x - cx + 4096) / band) : 0, nx = band ? Math.min(e[1], cx - 4096 + (k + 1) * band) : e[1];
        ctx.fillStyle = (k & 1) ? cb : ca; ctx.fillRect(x, cy + y, nx - x, 1); x = nx;
      }
    }
    if (rope) {
      ctx.fillStyle = rope;
      for (y = -Bv; y < Bv; y++) {
        var r = rows[y]; if (!r) continue; var up = rows[y - 1], dn = rows[y + 1];
        for (var xx = r[0]; xx < r[1]; xx++) {
          if (xx === r[0] || xx === r[1] - 1 || !up || xx < up[0] || xx >= up[1] || !dn || xx < dn[0] || xx >= dn[1]) ctx.fillRect(xx, cy + y, 1, 1);
        }
      }
    }
    return { cx: cx, cy: cy, a: A, b: Bv };
  }
  /* depth-sorted draw list: add({gx,gy,w,d,z,draw:function(ctx){...}}) then flush(ctx) */
  function add(item) {
    if (item.depth === undefined) item.depth = (item.gx || 0) + (item.gy || 0) + (item.w || 0) + (item.d || 0);
    S.list.push(item); return item;
  }
  function flush(ctx) {
    var l = S.list; S.list = [];
    l.map(function (it, i) { return [it, i]; })
      .sort(function (p, q) { return (p[0].depth - q[0].depth) || ((p[0].z || 0) - (q[0].z || 0)) || (p[1] - q[1]); })
      .forEach(function (p) { p[0].draw(ctx, p[0]); });
  }
  function setOrigin(x, y) { S.ox = Math.round(x); S.oy = Math.round(y); }
  /* largest whole-number scale that fits a box (min 1) */
  function fitScale(iw, ih, availW, availH) { return Math.max(1, Math.floor(Math.min(availW / iw, availH / ih))); }

  function makeScene(canvas, o) {
    var W = o.internalW, H = o.internalH, sc = o.scale || 1;
    canvas.width = W; canvas.height = H;
    canvas.style.width = (W * sc) + 'px'; canvas.style.height = (H * sc) + 'px';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.imageRendering = 'crisp-edges'; canvas.style.imageRendering = 'pixelated';
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    setOrigin(W / 2, 16);
    return { canvas: canvas, ctx: ctx, W: W, H: H, scale: sc, setOrigin: setOrigin,
      clear: function (c) { if (c) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H); } };
  }

  window.ISO = { TW: 16, TH: 8, makeScene: makeScene, setOrigin: setOrigin, toScreen: toScreen, tile: tile, tiles: tiles,
    block: block, ellipseField: ellipseField, add: add, flush: flush, fitScale: fitScale,
    px: px, line: line, poly: poly, disc: disc };
})();
