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

  function layout(w, h, inset) {
    var top = TOP + (inset > 0 ? inset : 0);
    var s = Math.min(w / W, (h - top - REST) / H);
    s = Math.max(0.8, Math.min(1.5, s));
    return { w: w, h: h, dpr: 1, scale: s, ox: (w - W * s) / 2, oy: top };
  }
  function getStars() {
    if (stars) return stars;
    var rnd = (BW.sim && BW.sim.mulberry32) ? BW.sim.mulberry32(42) : function () { return Math.random(); };
    stars = [];
    for (var i = 0; i < 110; i++) stars.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.1, a: 0.15 + rnd() * 0.4, b: rnd() < 0.2 });
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

  // ---- gradient caches (built once per ctx; drawn under translate so they are position independent) ----
  var cache = { ctx: null, g: {} };
  function cg(ctx, key, make) {
    if (cache.ctx !== ctx) { cache.ctx = ctx; cache.g = {}; }
    if (key.charAt(0) === 'v' && cache.vk !== key) { if (cache.vk) delete cache.g[cache.vk]; cache.vk = key; }
    var v = cache.g[key];
    if (!v) { v = cache.g[key] = make(); }
    return v;
  }
  var FLAME = ['rgb(255,60,50)', 'rgb(255,95,50)', 'rgb(255,130,50)', 'rgb(255,165,50)', 'rgb(255,200,50)'];
  var PAL = [['#9a7a30', '#ecd187', 'rgba(201,162,74,0.22)'], ['#7f6a38', '#d9c07a', 'rgba(201,162,74,0.2)'],
    ['#6d7f7a', '#c6d3ce', 'rgba(63,184,168,0.16)'], ['#8a5a3c', '#e0a67e', 'rgba(217,105,79,0.16)'],
    ['#5f7a8a', '#b9d2e0', 'rgba(120,180,220,0.15)'], ['#7a7040', '#d8cf8a', 'rgba(201,190,74,0.18)']];
  function planet(ctx, x, y, r, pal) {
    var key = Math.round(r * 2) + '|' + pal;
    var P = PAL[pal];
    var g = cg(ctx, 'p' + key, function () {
      var o = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.4);
      o.addColorStop(0, P[2]); o.addColorStop(1, 'rgba(0,0,0,0)');
      var f = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.08, 0, 0, r * 1.05);
      f.addColorStop(0, P[1]); f.addColorStop(0.6, P[0]); f.addColorStop(1, '#1d1608');
      return { o: o, f: f };
    });
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = g.o; circle(ctx, 0, 0, r * 2.4); ctx.fill();
    ctx.fillStyle = g.f; circle(ctx, 0, 0, r); ctx.fill();
    if (r > 8 && ctx.ellipse) {
      ctx.save(); circle(ctx, 0, 0, r); ctx.clip();
      ctx.strokeStyle = 'rgba(10,18,20,0.18)'; ctx.lineWidth = Math.max(1, r * 0.07);
      for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(0, i * r * 0.3, r * 1.1, r * 0.12, -0.25, 0, 6.28); ctx.stroke(); }
      ctx.restore();
    }
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,226,207,0.35)'; circle(ctx, 0, 0, r); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, V, G) {
    var plain = G.look === 'plain', sc = V.scale, ox = V.ox, oy = V.oy;
    var sec = G.sector, st = G.st, t = G.t || 0, reduced = !!G.reduced, fx = G.fx || null;
    var bodies = (sec && sec.bodies) || [];
    var secI = (sec && sec.index) || 0;
    var i, restY = 0, restR = 0;
    function X(x) { return ox + x * sc; }
    function Y(y) { return oy + y * sc; }
    var pw = W * sc, ph = H * sc;

    ctx.save();
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.textAlign = 'left';
    ctx.fillStyle = plain ? '#000' : BG; ctx.fillRect(0, 0, V.w, V.h);

    if (!plain) {
      // vignette (cached per canvas size)
      var vg = cg(ctx, 'vg' + V.w + 'x' + V.h, function () {
        var g = ctx.createRadialGradient(V.w / 2, V.h / 2, Math.min(V.w, V.h) * 0.3, V.w / 2, V.h / 2, Math.max(V.w, V.h) * 0.8);
        g.addColorStop(0, 'rgba(63,184,168,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); return g;
      });
      ctx.fillStyle = vg; ctx.fillRect(0, 0, V.w, V.h);
      var ss = getStars();
      for (i = 0; i < ss.length; i++) {
        ctx.globalAlpha = ss[i].a; ctx.fillStyle = ss[i].b ? BRASS : INK;
        ctx.fillRect(Math.round(ss[i].x * V.w), Math.round(ss[i].y * V.h), ss[i].r + 0.6, ss[i].r + 0.6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(63,184,168,0.04)'; ctx.fillRect(ox, oy, pw, ph);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(201,162,74,0.08)'; ctx.beginPath();
      var gx, gy;
      for (gx = 34; gx < W; gx += 34) { ctx.moveTo(X(gx), oy); ctx.lineTo(X(gx), oy + ph); }
      for (gy = 48.6; gy < H; gy += 48.6) { ctx.moveTo(ox, Y(gy)); ctx.lineTo(ox + pw, Y(gy)); }
      ctx.stroke();
      // instrument-panel extension: faint grid + bezel into the side margins and rest zone
      var gs = 34 * sc, gv = 48.6 * sc, bot = V.h;
      ctx.strokeStyle = 'rgba(201,162,74,0.045)'; ctx.beginPath();
      for (gx = ox - gs; gx > -gs; gx -= gs) { ctx.moveTo(gx, oy); ctx.lineTo(gx, bot); }
      for (gx = ox + pw + gs; gx < V.w + gs; gx += gs) { ctx.moveTo(gx, oy); ctx.lineTo(gx, bot); }
      for (gx = ox + gs; gx < ox + pw; gx += gs) { ctx.moveTo(gx, oy + ph); ctx.lineTo(gx, bot); }
      for (gy = oy + gv; gy < bot; gy += gv) {
        if (gy < oy + ph) { ctx.moveTo(0, gy); ctx.lineTo(ox, gy); ctx.moveTo(ox + pw, gy); ctx.lineTo(V.w, gy); }
        else { ctx.moveTo(0, gy); ctx.lineTo(V.w, gy); }
      }
      ctx.stroke();
      if (ox > 4) {
        ctx.strokeStyle = 'rgba(201,162,74,0.22)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(ox - 5.5, oy); ctx.lineTo(ox - 5.5, oy + ph); ctx.moveTo(ox + pw + 5.5, oy); ctx.lineTo(ox + pw + 5.5, oy + ph);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(201,162,74,0.22)'; ctx.beginPath();
      for (gx = 34; gx < W; gx += 34) for (gy = 48.6; gy < H; gy += 48.6) {
        ctx.moveTo(X(gx) - 3, Y(gy)); ctx.lineTo(X(gx) + 3, Y(gy)); ctx.moveTo(X(gx), Y(gy) - 3); ctx.lineTo(X(gx), Y(gy) + 3);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(201,162,74,0.5)'; ctx.beginPath();
      var k, L;
      for (k = 0; k <= W; k += 10) { L = k % 50 === 0 ? 7 : 3.5; ctx.moveTo(X(k), oy); ctx.lineTo(X(k), oy + L); ctx.moveTo(X(k), oy + ph); ctx.lineTo(X(k), oy + ph - L); }
      for (k = 0; k <= H; k += 10) { L = k % 50 === 0 ? 7 : 3.5; ctx.moveTo(ox, Y(k)); ctx.lineTo(ox + L, Y(k)); ctx.moveTo(ox + pw, Y(k)); ctx.lineTo(ox + pw - L, Y(k)); }
      ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.strokeRect(ox, oy, pw, ph);
      // rest pad (thumb hold zone)
      var free = V.h - oy - ph, rr = free > 160 ? Math.min(60, free / 2 - 40) : Math.min(28, free / 2 - 18);
      if (rr > 6) {
        var ry = oy + ph + free / 2 + (free > 160 ? 0 : 6);
        var hph = G.phase ? String(G.phase) : '', hideHold = /^ui_|^(docked|failed|end)$/.test(hph) ||
          (st && G.fuelMax && st.fuel > 0 && st.fuel / G.fuelMax < 0.25);
        if (!hideHold) {
          ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(63,184,168,0.2)'; circle(ctx, V.w / 2, ry, rr); ctx.stroke();
          ctx.setLineDash([2, 4]); circle(ctx, V.w / 2, ry, rr * 0.6); ctx.stroke(); ctx.setLineDash([]);
          font(ctx, 12, '700'); ctx.fillStyle = 'rgba(63,184,168,0.45)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('HOLD', V.w / 2, ry);
        }
        restY = ry; restR = rr;
      }
      // orbit rings
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(201,162,74,0.28)';
      for (i = 0; i < bodies.length; i++) {
        var o = bodies[i];
        if (o.R > 0) { circle(ctx, X(o.cx), Y(o.cy), o.R * sc); ctx.stroke(); }
      }
    }

    // gate
    if (sec && sec.gate) {
      var gcx = X(sec.gate.x), gcy = Y(sec.gate.y), gr = Math.max(6, 22 * sc);
      ctx.lineWidth = plain ? 2 : 1.5; ctx.strokeStyle = plain ? '#fff' : TEAL;
      circle(ctx, gcx, gcy, gr); ctx.stroke();
      if (!plain) {
        ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(63,184,168,0.5)';
        circle(ctx, gcx, gcy, gr + 6); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(63,184,168,0.7)'; ctx.beginPath();
        for (i = 0; i < 4; i++) { var an = i * 1.5707963 + 0.7853982; ctx.moveTo(gcx + Math.cos(an) * (gr - 4), gcy + Math.sin(an) * (gr - 4)); ctx.lineTo(gcx + Math.cos(an) * (gr + 3), gcy + Math.sin(an) * (gr + 3)); }
        ctx.stroke();
        font(ctx, 12, '700'); ctx.fillStyle = 'rgba(63,184,168,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var lx = Math.max(ox + 22, Math.min(ox + pw - 22, gcx));
        var near = sec.gate.y > H - 30 || sec.gate.x < 30 || sec.gate.x > W - 30;
        ctx.fillText('GATE', lx, near || gcy + gr + 22 > oy + ph - 4 ? gcy - gr - 16 : gcy + gr + 15);
      }
    }

    // bodies
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i], px = X(bx(b, t)), pyy = Y(by(b, t)), r = Math.max(6, b.r * sc);
      if (b.dark) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(125,138,134,0.45)'; ctx.setLineDash([3, 5]);
        circle(ctx, px, pyy, r); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      if (plain) { ctx.fillStyle = '#6a7a80'; circle(ctx, px, pyy, r); ctx.fill(); continue; }
      planet(ctx, px, pyy, r, (i + secI * 3) % PAL.length);
    }

    // ghost line (dashed)
    if (G.ghostLine && G.ghostLine.length > 1) {
      ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeStyle = plain ? '#aaa' : 'rgba(201,162,74,0.55)';
      ctx.beginPath(); ctx.moveTo(X(G.ghostLine[0].x), Y(G.ghostLine[0].y));
      for (i = 1; i < G.ghostLine.length; i++) ctx.lineTo(X(G.ghostLine[i].x), Y(G.ghostLine[i].y));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // predicted path
    var pred = G.pred, run = G.phase === 'run' || G.phase === 'intro';
    if (pred && pred.pts && run) {
      var n = pred.pts.length;
      for (i = 0; i < n; i += 6) {
        var p = pred.pts[i], f = 1 - i / Math.max(1, n);
        ctx.globalAlpha = 0.25 + 0.75 * f; ctx.fillStyle = plain ? '#ff9a3c' : TEAL;
        circle(ctx, X(p.x), Y(p.y), plain ? 2 : 1.8); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (pred.closest && pred.pts[pred.closest.i]) {
        var cp = pred.pts[pred.closest.i], pi = Math.max(1, pred.closest.i), q = pred.pts[pi - 1];
        var dx = cp.x - q.x, dy = cp.y - q.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, tl = 7;
        ctx.lineWidth = 2; ctx.strokeStyle = pred.end === 'crashed' ? RED : BRASS;
        ctx.beginPath(); ctx.moveTo(X(cp.x) - nx * tl, Y(cp.y) - ny * tl); ctx.lineTo(X(cp.x) + nx * tl, Y(cp.y) + ny * tl); ctx.stroke();
      }
    }

    // craft trail (fx)
    if (fx && fx.trail && fx.trail.length > 1) {
      var tr = fx.trail;
      ctx.lineWidth = Math.max(1.5, 2 * sc); ctx.lineCap = 'round';
      for (i = 1; i < tr.length; i++) {
        var ta = Math.max(0, Math.min(1, tr[i].a == null ? 1 : tr[i].a));
        if (ta <= 0.02) continue;
        ctx.globalAlpha = ta * 0.55; ctx.strokeStyle = plain ? '#ccc' : INK;
        ctx.beginPath(); ctx.moveTo(X(tr[i - 1].x), Y(tr[i - 1].y)); ctx.lineTo(X(tr[i].x), Y(tr[i].y)); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }

    // ghost craft
    if (G.ghost) craft(ctx, X(G.ghost.x), Y(G.ghost.y), G.ghost.hx, G.ghost.hy, Math.max(11, 11 * sc), 'rgba(232,226,207,0.28)', 'rgba(232,226,207,0.4)');

    // craft + engine glow + flame
    var pulse = fx && fx.burnPulse && !reduced ? Math.max(0, Math.min(1, fx.burnPulse)) : 0;
    if (st && st.status !== 'crashed') {
      var cx = X(st.x), cy = Y(st.y), size = Math.max(11, 11 * sc), hx = st.hx || 1, hy = st.hy || 0;
      var ang = Math.atan2(hy, hx), active = !!st.active;
      var th = st.throttle == null ? 1 : st.throttle;
      if (!plain) {
        var gs = size * (active ? 3.2 + pulse * 1.2 : 2.2);
        var eg = cg(ctx, 'eg', function () {
          var g = ctx.createRadialGradient(0, 0, 1, 0, 0, 100);
          g.addColorStop(0, 'rgba(255,200,130,0.6)'); g.addColorStop(0.45, 'rgba(255,140,60,0.2)'); g.addColorStop(1, 'rgba(255,140,60,0)'); return g;
        });
        ctx.save(); ctx.translate(cx - hx * size * 0.6, cy - hy * size * 0.6); ctx.scale(gs / 100, gs / 100);
        ctx.globalAlpha = active ? 1 : 0.22; ctx.fillStyle = eg; circle(ctx, 0, 0, 100); ctx.fill(); ctx.restore();
        ctx.globalAlpha = 1;
      }
      if (active) {
        var fk = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 90);
        var len = size * (1.2 + 2 * th) * fk * (1 + pulse * 0.25);
        ctx.save(); ctx.translate(cx - hx * size * 0.6, cy - hy * size * 0.6); ctx.rotate(ang + Math.PI);
        if (plain) {
          ctx.lineWidth = Math.max(3, size * 0.5); ctx.lineCap = 'round'; ctx.strokeStyle = '#ff9a3c';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        } else {
          ctx.fillStyle = '#ffc27a';
          ctx.beginPath(); ctx.moveTo(0, -size * 0.34); ctx.quadraticCurveTo(len * 0.6, -size * 0.2, len, 0); ctx.quadraticCurveTo(len * 0.6, size * 0.2, 0, size * 0.34); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff3d6';
          ctx.beginPath(); ctx.moveTo(0, -size * 0.17); ctx.quadraticCurveTo(len * 0.35, -size * 0.1, len * 0.55, 0); ctx.quadraticCurveTo(len * 0.35, size * 0.1, 0, size * 0.17); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      craft(ctx, cx, cy, hx, hy, size, plain ? '#fff' : INK, plain ? null : BG);
    } else if (st) {
      ctx.lineWidth = 2; ctx.strokeStyle = RED; var kx = X(st.x), ky = Y(st.y);
      ctx.beginPath(); ctx.moveTo(kx - 9, ky - 9); ctx.lineTo(kx + 9, ky + 9); ctx.moveTo(kx + 9, ky - 9); ctx.lineTo(kx - 9, ky + 9); ctx.stroke();
    }

    // particles (fx)
    if (fx && fx.parts && !reduced) {
      var ps = fx.parts;
      for (i = 0; i < ps.length; i++) {
        var pt = ps[i], k2 = pt.max > 0 ? Math.max(0, Math.min(1, pt.life / pt.max)) : 0;
        if (k2 <= 0) continue;
        var sz = Math.max(1, (pt.size || 2) * sc), qx = X(pt.x), qy = Y(pt.y), kind = pt.kind;
        if (kind === 'flame') {
          var gi = Math.round(k2 * 4);
          ctx.globalAlpha = 0.25 + 0.7 * k2; ctx.fillStyle = FLAME[gi];
          circle(ctx, qx, qy, sz * (0.4 + 0.6 * k2)); ctx.fill();
        } else if (kind === 'spark') {
          ctx.globalAlpha = k2; ctx.fillStyle = BRASS; ctx.fillRect(qx - sz * 0.5, qy - sz * 0.5, sz, sz);
        } else if (kind === 'dock') {
          ctx.globalAlpha = k2; ctx.lineWidth = 1.5; ctx.strokeStyle = TEAL;
          circle(ctx, qx, qy, sz * (1.2 - 0.6 * k2) + 1); ctx.stroke();
        } else if (kind === 'crash') {
          ctx.globalAlpha = k2; ctx.fillStyle = (i & 1) ? '#ffffff' : '#ff9a3c';
          ctx.fillRect(qx - sz * 0.5, qy - sz * 0.5, sz, sz * 0.7);
        } else {
          ctx.globalAlpha = 0.35 * k2; ctx.fillStyle = DIM; circle(ctx, qx, qy, sz * 0.8); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // HUD
    var si = (G.sectorIndex != null ? G.sectorIndex : secI) + 1, sn = G.sectorCount || 8;
    font(ctx, 13, '700'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = plain ? '#fff' : BRASS;
    if (plain) ctx.fillText('SECTOR ' + si + '/' + sn, ox + 10, oy + 10);
    if (G.warp === 3) { ctx.textAlign = 'right'; ctx.fillStyle = TEAL; ctx.fillText('WARP x3', ox + pw - 10, oy + 10); }

    var bph = G.phase ? String(G.phase).replace(/^ui_/, '') : G.phase;
    var showBar = bph !== 'docked' && bph !== 'end' && bph !== 'failed' || bph === 'failed' && G.phase === 'failed';
    var barW = Math.min(V.w - 32, V.w < 400 ? 224 : 240), barX = 16, barY = oy + ph + 14, barH = 12;
    var fmax = G.fuelMax || 60, fuel = st ? Math.max(0, st.fuel) : 0, frac = Math.max(0, Math.min(1, fuel / fmax));
    if (showBar) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(barX, barY, barW, barH);
      if (plain) ctx.fillStyle = '#ff9a3c';
      else if (frac < 0.1) { ctx.fillStyle = RED; if (!reduced) { ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 9); } }
      else if (frac < 0.25) ctx.fillStyle = '#e0a040';
      else ctx.fillStyle = cg(ctx, 'fb' + barX + '|' + barW, function () {
        var g = ctx.createLinearGradient(barX, 0, barX + barW, 0); g.addColorStop(0, '#8a6c2a'); g.addColorStop(1, BRASS); return g;
      });
      ctx.fillRect(barX, barY, barW * frac, barH); ctx.globalAlpha = 1;
      if (!plain && frac < 0.25 && fuel > 0) {
        font(ctx, 12, '700'); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = frac < 0.1 ? RED : '#e0a040';
        ctx.fillText('LOW FUEL', barX + barW, barY + barH + 6);
      }
      if (!plain) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
        for (i = 1; i < 10; i++) { ctx.moveTo(barX + barW * i / 10, barY + barH - 3); ctx.lineTo(barX + barW * i / 10, barY + barH); }
        ctx.stroke();
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = plain ? '#888' : 'rgba(201,162,74,0.6)'; ctx.strokeRect(barX, barY, barW, barH);
      if (G.parFuel != null) {
        var pm = barX + barW * Math.max(0, Math.min(1, (fmax - G.parFuel) / fmax));
        ctx.lineWidth = 2; ctx.strokeStyle = plain ? '#fff' : TEAL;
        ctx.beginPath(); ctx.moveTo(pm, barY - 4); ctx.lineTo(pm, barY + barH + 4); ctx.stroke();
      }
      font(ctx, 12, '600'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      ctx.fillText('FUEL ' + fuel.toFixed(1) + (G.parFuel != null ? '  |  PAR ' + G.parFuel.toFixed(1) : ''), barX, barY + barH + 6);
      if (st) {
        var spd = Math.hypot(st.vx, st.vy), ok = spd < 90;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top'; font(ctx, 18, '700'); ctx.fillStyle = ok ? TEAL : BRASS;
        ctx.fillText(Math.round(spd) + ' px/s', V.w - 16, barY - 4);
        font(ctx, 12, '600'); ctx.fillStyle = DIM; ctx.fillText('DOCK < 90', V.w - 16, barY + 20);
      }
    }
    if (st && st.active && G.phase === 'run') {
      var tv = Math.max(0, Math.min(1, G.throttle == null ? 1 : G.throttle));
      var th2 = restR > 0 ? Math.min(60 * sc, restR * 1.6) : 60 * sc, tx = restR > 0 ? V.w / 2 + restR + 28 : ox + pw + 8, ty = restR > 0 ? restY - th2 / 2 + 6 : oy + 36;
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(tx, ty, 6, th2);
      ctx.fillStyle = plain ? '#ff9a3c' : '#ffc27a'; ctx.fillRect(tx, ty + th2 * (1 - tv), 6, th2 * tv);
      font(ctx, 12, '700'); ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('THRUST', tx + 3, ty - 3);
    }

    // CLOSE PASS tag (1 s, set by game.js). Reduced motion: static text, full alpha, fixed position; otherwise fades and drifts up. No flash/shake.
    var cpass = G.closePass;
    if (cpass && cpass.k > 0 && G.phase === 'run') {
      var cpx = Math.max(ox + 44, Math.min(ox + pw - 44, X(cpass.x))), cpy = Y(cpass.y) - 26 - (reduced ? 0 : (1 - cpass.k) * 12);
      cpy = Math.max(oy + 14, Math.min(oy + ph - 14, cpy));
      ctx.globalAlpha = reduced ? 1 : Math.min(1, cpass.k * 2.5);
      font(ctx, 13, '700'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(8,16,18,0.7)'; ctx.fillRect(cpx - 43, cpy - 10, 86, 20);
      ctx.fillStyle = plain ? '#fff' : BRASS; ctx.fillText('CLOSE PASS', cpx, cpy);
      ctx.globalAlpha = 1;
    }

    // flash overlay
    if (fx && fx.flash > 0 && !reduced) {
      ctx.globalAlpha = Math.min(1, fx.flash) * 0.3; ctx.fillStyle = (bph === 'failed') ? '#ffffff' : TEAL;
      ctx.fillRect(0, 0, V.w, V.h); ctx.globalAlpha = 1;
    }

    // phase overlays
    var phs = G.phase, av = [];
    if (st && phs !== 'end') av.push([Y(st.y), 34]);
    if (sec && sec.gate) av.push([Y(sec.gate.y), 52]);
    if (G.ghostLine) for (i = 0; i < G.ghostLine.length; i += 8) av.push([Y(G.ghostLine[i].y), 6]);
    if (phs === 'intro') {
      panel(ctx, V, [{ s: 'SECTOR ' + si + '/' + sn + ' - tap to launch', px: 17, c: BRASS, w: '700' }, { s: 'hold = burn, release = coast', px: 13, c: DIM }], BRASS);
    } else if (phs === 'docked') {
      panel(ctx, V, [{ s: 'DOCKED', px: 22, c: TEAL, w: '700' }, { s: 'fuel used ' + (st ? st.fuelUsed.toFixed(1) : '') + (G.parFuel != null ? ' / par ' + G.parFuel.toFixed(1) : ''), px: 14 }], TEAL, av);
    } else if (phs === 'failed') {
      panel(ctx, V, [{ s: 'LOST CONTACT', px: 20, c: RED, w: '700' }, { s: G.msg || 'mission failed', px: 14 }, { s: 'tap to retry', px: 13, c: DIM }], RED, av);
    } else if (phs === 'end') {
      panel(ctx, V, [{ s: 'RUN COMPLETE', px: 22, c: BRASS, w: '700' }, { s: G.msg || (sn + ' sectors flown'), px: 14 }], BRASS, av);
    }
    ctx.restore();
  }

  BW.render = { draw: draw, layout: layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = BW.render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
