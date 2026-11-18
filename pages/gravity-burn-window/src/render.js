// Burn Window renderer. UMD: BW.render = {draw(ctx,V,G), layout(w,h)}. Pure drawing, ctx only, no DOM.
// Self-test (node-free): BW.render.layout(475,638) -> {scale:1.0,...}; draw(ctx,V,G) with a stub ctx must not throw.
// G fields used: sector{bodies,gate,index}, st{x,y,hx,hy,vx,vy,fuel,active,throttle,status}, t, pred{pts,closest,end},
//   ghostLine[{x,y}]|null, ghost{x,y,hx,hy}|null, phase, warp, throttle, fuelMax, parFuel, msg, reduced,
//   sectorIndex, sectorCount. Optional: G.look==='plain' selects the plain-shape look.
(function (root) {
  'use strict';
  var BW = root.BW = root.BW || {};
  var W = 340, H = 486, TOP = 56, REST = 96;
  var BG = '#0a1214', BRASS = '#c9a24a', TEAL = '#3fb8a8', INK = '#e8e2cf', DIM = '#7d8a86', RED = '#d9694f';
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var stars = null;

  function layout(w, h) {
    var s = Math.min(w / W, (h - TOP - REST) / H);
    s = Math.max(0.8, Math.min(1.5, s));
    return { w: w, h: h, dpr: 1, scale: s, ox: (w - W * s) / 2, oy: TOP };
  }
  function getStars() {
    if (stars) return stars;
    var rnd = (BW.sim && BW.sim.mulberry32) ? BW.sim.mulberry32(42) : function () { return Math.random(); };
    stars = [];
    for (var i = 0; i < 90; i++) stars.push({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.2, a: 0.15 + rnd() * 0.35 });
    return stars;
  }
  function bx(b, t) { return BW.sim.bodyX(b, t); }
  function by(b, t) { return BW.sim.bodyY(b, t); }
  function font(ctx, px, weight) { ctx.font = (weight || '600') + ' ' + Math.max(12, px) + 'px ' + FONT; }

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283185307); }

  function craft(ctx, x, y, hx, hy, size, fill, stroke) {
    var a = Math.atan2(hy, hx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.8, size * 0.65); ctx.lineTo(-size * 0.45, 0); ctx.lineTo(-size * 0.8, -size * 0.65); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
  }

  function textCenter(ctx, str, x, y, px, color, weight) {
    font(ctx, px, weight); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
  }

  // Compact translucent strip placed in the upper or lower free band, whichever is farther from the craft/crash point and gate.
  function panel(ctx, V, lines, accent, avoid) {
    var cx = V.w / 2, pw = Math.min(V.w - 32, 300), lh = 22, ph = 14 + lines.length * lh;
    var top = V.oy + 30, bot = V.oy + H * V.scale - 8 - ph, top2 = top, y = bot;
    function clr(y0) { var m = 1e9; for (var i = 0; i < (avoid || []).length; i++) { var a = avoid[i][0], pd = avoid[i][1], d = (a < y0 ? y0 - a : (a > y0 + ph ? a - y0 - ph : 0)) - pd; if (d < m) m = d; } return m; }
    if (avoid && avoid.length) y = clr(top2) > clr(bot) ? top2 : bot;
    ctx.fillStyle = 'rgba(8,16,18,0.7)'; ctx.fillRect(cx - pw / 2, y, pw, ph);
    ctx.lineWidth = 2; ctx.strokeStyle = accent; ctx.strokeRect(cx - pw / 2, y, pw, ph);
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      textCenter(ctx, L.s, cx, y + 7 + lh / 2 + i * lh, L.px || 16, L.c || INK, L.w);
    }
  }

  function draw(ctx, V, G) {
    var plain = G.look === 'plain', sc = V.scale, ox = V.ox, oy = V.oy;
    var sec = G.sector, st = G.st, t = G.t || 0, reduced = !!G.reduced;
    var bodies = (sec && sec.bodies) || [];
    var lw = Math.max(2, 2 * sc);
    function X(x) { return ox + x * sc; }
    function Y(y) { return oy + y * sc; }

    ctx.save();
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.textAlign = 'left';
    ctx.fillStyle = plain ? '#000' : BG; ctx.fillRect(0, 0, V.w, V.h);

    if (!plain) {
      var ss = getStars();
      for (var i = 0; i < ss.length; i++) {
        ctx.globalAlpha = ss[i].a; ctx.fillStyle = INK;
        ctx.fillRect(Math.round(ss[i].x * V.w), Math.round(ss[i].y * V.h), ss[i].r + 0.6, ss[i].r + 0.6);
      }
      ctx.globalAlpha = 1;
      // chart-table playfield frame and faint grid
      ctx.fillStyle = 'rgba(63,184,168,0.04)'; ctx.fillRect(ox, oy, W * sc, H * sc);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(201,162,74,0.35)'; ctx.strokeRect(ox, oy, W * sc, H * sc);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(201,162,74,0.07)'; ctx.beginPath();
      for (var gx = 34; gx < W; gx += 34) { ctx.moveTo(X(gx), oy); ctx.lineTo(X(gx), oy + H * sc); }
      for (var gy = 48.6; gy < H; gy += 48.6) { ctx.moveTo(ox, Y(gy)); ctx.lineTo(ox + W * sc, Y(gy)); }
      ctx.stroke();
      // rest zone pad
      var py = oy + H * sc + Math.max(36, (V.h - oy - H * sc) / 2) - 30;
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(63,184,168,0.12)'; circle(ctx, V.w / 2, py + 30, Math.min(34, Math.max(20, (V.h - oy - H * sc) / 2 - 4))); ctx.stroke();
    }

    // orbit rings (rail bodies)
    if (!plain) {
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(201,162,74,0.16)';
      for (i = 0; i < bodies.length; i++) {
        var o = bodies[i];
        if (o.R > 0) { circle(ctx, X(o.cx), Y(o.cy), o.R * sc); ctx.stroke(); }
      }
    }

    // gate
    if (sec && sec.gate) {
      var gr = Math.max(6, 22 * sc);
      ctx.lineWidth = 2; ctx.strokeStyle = plain ? '#fff' : TEAL;
      circle(ctx, X(sec.gate.x), Y(sec.gate.y), gr); ctx.stroke();
      if (!plain) {
        ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(63,184,168,0.5)';
        circle(ctx, X(sec.gate.x), Y(sec.gate.y), gr + 6); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // bodies
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i], px = X(bx(b, t)), pyy = Y(by(b, t)), r = Math.max(6, b.r * sc);
      if (b.dark) {
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(125,138,134,0.45)'; ctx.setLineDash([3, 5]);
        circle(ctx, px, pyy, r); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      if (plain) { ctx.fillStyle = '#6a7a80'; circle(ctx, px, pyy, r); ctx.fill(); continue; }
      var gl = ctx.createRadialGradient(px, pyy, r * 0.8, px, pyy, r * 2.2);
      gl.addColorStop(0, 'rgba(201,162,74,0.22)'); gl.addColorStop(1, 'rgba(201,162,74,0)');
      ctx.fillStyle = gl; circle(ctx, px, pyy, r * 2.2); ctx.fill();
      var fl = ctx.createRadialGradient(px - r * 0.35, pyy - r * 0.35, r * 0.1, px, pyy, r);
      fl.addColorStop(0, '#e6c978'); fl.addColorStop(1, '#8a6c2a');
      ctx.fillStyle = fl; circle(ctx, px, pyy, r); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,18,20,0.6)'; circle(ctx, px, pyy, r); ctx.stroke();
    }

    // ghost line (dashed)
    if (G.ghostLine && G.ghostLine.length > 1) {
      ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeStyle = plain ? '#aaa' : 'rgba(201,162,74,0.55)';
      ctx.beginPath(); ctx.moveTo(X(G.ghostLine[0].x), Y(G.ghostLine[0].y));
      for (i = 1; i < G.ghostLine.length; i++) ctx.lineTo(X(G.ghostLine[i].x), Y(G.ghostLine[i].y));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // predicted path: dots every 6th point fading, closest-approach tick
    var pred = G.pred, run = G.phase === 'run' || G.phase === 'intro';
    if (pred && pred.pts && run) {
      var n = pred.pts.length;
      for (i = 0; i < n; i += 6) {
        var p = pred.pts[i], f = 1 - i / Math.max(1, n);
        ctx.globalAlpha = 0.35 + 0.65 * f; ctx.fillStyle = plain ? '#ff9a3c' : TEAL;
        circle(ctx, X(p.x), Y(p.y), 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (pred.closest && pred.pts[pred.closest.i]) {
        var cp = pred.pts[pred.closest.i], pi = Math.max(1, pred.closest.i), q = pred.pts[pi - 1];
        var dx = cp.x - q.x, dy = cp.y - q.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, tl = 7;
        ctx.lineWidth = 2; ctx.strokeStyle = pred.end === 'crashed' ? RED : BRASS;
        ctx.beginPath(); ctx.moveTo(X(cp.x) - nx * tl, Y(cp.y) - ny * tl); ctx.lineTo(X(cp.x) + nx * tl, Y(cp.y) + ny * tl); ctx.stroke();
      }
    }

    // ghost craft
    if (G.ghost) craft(ctx, X(G.ghost.x), Y(G.ghost.y), G.ghost.hx, G.ghost.hy, Math.max(11, 11 * sc), 'rgba(232,226,207,0.28)', 'rgba(232,226,207,0.4)');

    // craft + flame
    if (st && st.status !== 'crashed') {
      var cx = X(st.x), cy = Y(st.y), size = Math.max(11, 11 * sc), hx = st.hx || 1, hy = st.hy || 0;
      if (st.active) {
        var th = st.throttle == null ? 1 : st.throttle;
        var fk = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 90);
        var fx = cx - hx * size * 0.6, fy = cy - hy * size * 0.6, len = size * (1.2 + 2 * th) * fk;
        if (!plain) {
          var gg = ctx.createRadialGradient(fx, fy, 1, fx, fy, len * 1.4);
          gg.addColorStop(0, 'rgba(255,190,110,0.6)'); gg.addColorStop(0.5, 'rgba(255,140,60,0.2)'); gg.addColorStop(1, 'rgba(255,140,60,0)');
          ctx.fillStyle = gg; circle(ctx, fx, fy, len * 1.4); ctx.fill();
        }
        ctx.lineWidth = Math.max(3, size * 0.5); ctx.lineCap = 'round'; ctx.strokeStyle = plain ? '#ff9a3c' : '#ffc27a';
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - hx * len, fy - hy * len); ctx.stroke(); ctx.lineCap = 'butt';
      }
      craft(ctx, cx, cy, hx, hy, size, plain ? '#fff' : INK, plain ? null : BG);
    } else if (st) {
      ctx.lineWidth = 2; ctx.strokeStyle = RED; var kx = X(st.x), ky = Y(st.y);
      ctx.beginPath(); ctx.moveTo(kx - 9, ky - 9); ctx.lineTo(kx + 9, ky + 9); ctx.moveTo(kx + 9, ky - 9); ctx.lineTo(kx - 9, ky + 9); ctx.stroke();
    }

    // HUD: sector label (top-left of playfield), fuel bar + speed (below playfield)
    var si = (G.sectorIndex != null ? G.sectorIndex : (sec && sec.index) || 0) + 1, sn = G.sectorCount || 8;
    font(ctx, 13, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = plain ? '#fff' : BRASS;
    ctx.fillText('SECTOR ' + si + '/' + sn, ox + 8, oy + 8);
    if (G.warp === 3) { ctx.textAlign = 'right'; ctx.fillStyle = TEAL; ctx.fillText('WARP x3', ox + W * sc - 8, oy + 8); }

    var showBar = G.phase !== 'docked' && G.phase !== 'end';
    var barW = Math.min(V.w - 32, 240), barX = 16, barY = oy + H * sc + 14, barH = 14;
    var fmax = G.fuelMax || 60, fuel = st ? Math.max(0, st.fuel) : 0, frac = Math.max(0, Math.min(1, fuel / fmax));
    if (showBar) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = plain ? '#ff9a3c' : (frac < 0.2 ? RED : BRASS); ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.lineWidth = 2; ctx.strokeStyle = plain ? '#888' : 'rgba(201,162,74,0.6)'; ctx.strokeRect(barX, barY, barW, barH);
    if (G.parFuel != null) {
      var pm = barX + barW * Math.max(0, Math.min(1, (fmax - G.parFuel) / fmax));
      ctx.lineWidth = 2; ctx.strokeStyle = plain ? '#fff' : TEAL;
      ctx.beginPath(); ctx.moveTo(pm, barY - 4); ctx.lineTo(pm, barY + barH + 4); ctx.stroke();
    }
    font(ctx, 12, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
    ctx.fillText('FUEL ' + fuel.toFixed(1) + (G.parFuel != null ? '  |  PAR ' + G.parFuel.toFixed(1) : ''), barX, barY + barH + 6);
    if (st) {
      var spd = Math.hypot(st.vx, st.vy), ok = spd < 90;
      ctx.textAlign = 'right'; font(ctx, 18, '700'); ctx.fillStyle = ok ? TEAL : BRASS;
      ctx.fillText(Math.round(spd) + ' px/s', V.w - 16, barY - 2);
      font(ctx, 12, '600'); ctx.fillStyle = DIM; ctx.fillText('dock < 90', V.w - 16, barY + 20);
    }
    }
    if (st && st.active && G.phase === 'run') {
      var tx = ox + W * sc - 14, ty = oy + 36, th2 = 60 * sc, tv = Math.max(0, Math.min(1, G.throttle == null ? 1 : G.throttle));
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(tx, ty, 6, th2);
      ctx.fillStyle = plain ? '#ff9a3c' : '#ffc27a'; ctx.fillRect(tx, ty + th2 * (1 - tv), 6, th2 * tv);
    }

    // phase overlays
    var ph = G.phase, av = [];
    if (st && ph !== 'end') av.push([Y(st.y), 34]);
    if (sec && sec.gate) av.push([Y(sec.gate.y), 52]);
    if (G.ghostLine) for (i = 0; i < G.ghostLine.length; i += 8) av.push([Y(G.ghostLine[i].y), 6]);
    if (ph === 'intro') {
      panel(ctx, V, [{ s: 'SECTOR ' + si + '/' + sn + ' - tap to launch', px: 17, c: BRASS, w: '700' }, { s: 'hold = burn, release = coast', px: 13, c: DIM }], BRASS);
    } else if (ph === 'docked') {
      panel(ctx, V, [{ s: 'DOCKED', px: 22, c: TEAL, w: '700' }, { s: 'fuel used ' + (st ? st.fuelUsed.toFixed(1) : '') + (G.parFuel != null ? ' / par ' + G.parFuel.toFixed(1) : ''), px: 14 }], TEAL, av);
    } else if (ph === 'failed') {
      panel(ctx, V, [{ s: 'LOST CONTACT', px: 20, c: RED, w: '700' }, { s: G.msg || 'mission failed', px: 14 }, { s: 'tap to retry', px: 13, c: DIM }], RED, av);
    } else if (ph === 'end') {
      panel(ctx, V, [{ s: 'RUN COMPLETE', px: 22, c: BRASS, w: '700' }, { s: G.msg || (sn + ' sectors flown'), px: 14 }], BRASS, av);
    }
    ctx.restore();
  }

  BW.render = { draw: draw, layout: layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = BW.render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
