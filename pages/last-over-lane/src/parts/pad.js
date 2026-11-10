// Last Over Lane v2 - fan Shot Pad. LOLParts.pad = { draw(ctx, G), hit(x, y, W, H) }.
// Fan seen from the batter: Leg left wedge, Straight middle, Off right, Loft = arc band across the top.
// Draws from G only (G.field.guard, G.cur.tap, G.now). No hidden state; geometry is a pure function of (W, H).
(function () {
  window.LOLParts = window.LOLParts || {};
  var M = 8, GAP = 3;                    // outer margin, half gap between regions (px)
  var cache = {};

  function geom(W, H) {
    var key = W + 'x' + H;
    if (cache[key]) return cache[key];
    var cx = W / 2;
    var D = 1.15 * H, Oy = H + D;                       // column origin: below pad bottom centre
    var Rl = 1.27 * W, Cly = M + Rl;                    // loft arc centre (x = cx)
    var t = Math.max(72, Math.round(0.22 * H));         // loft band thickness
    var Ri = Rl - t - 2 * GAP;                          // columns stop here (visual gap)
    var yb = H - M;                                     // columns' bottom edge
    var a1 = Math.atan2(0.0964 * W, D + M);             // Straight half angle (mid-gap)
    var Ey = Cly - Math.sqrt(Ri * Ri - (cx - M) * (cx - M));
    var a2 = Math.atan2(cx - M, Oy - Ey);               // outer ray reaches the left/right margin
    var ga = GAP / (D + H / 2);                         // half gap as angle
    var g = { W: W, H: H, cx: cx, Oy: Oy, Rl: Rl, Cly: Cly, t: t, Ri: Ri, yb: yb, a1: a1, a2: a2, ga: ga };
    g.outerY = function (x) { var dx = x - cx; return Cly - Math.sqrt(Rl * Rl - dx * dx); };
    g.innerY = function (x) { var dx = x - cx; return Cly - Math.sqrt((Rl - t) * (Rl - t) - dx * dx); };
    g.colTop = function (x) { var dx = x - cx; return Cly - Math.sqrt(Ri * Ri - dx * dx); };
    g.bandMid = function (x) { return (g.outerY(x) + g.innerY(x)) / 2; };
    g.rayX = function (phi, y) { return cx + (Oy - y) * Math.tan(phi); };
    function rayTop(phi) {                              // where a ray meets the column-top arc
      var lo = (Oy - yb) / Math.cos(phi), hi = Oy / Math.cos(phi) + 10;
      for (var i = 0; i < 40; i++) {
        var r = (lo + hi) / 2, px = cx + r * Math.sin(phi), py = Oy - r * Math.cos(phi);
        var d = Math.hypot(px - cx, py - Cly);
        if (d < Ri) lo = r; else hi = r;
      }
      var rr = (lo + hi) / 2; return [cx + rr * Math.sin(phi), Oy - rr * Math.cos(phi)];
    }
    function col(phl, phr) {
      var pts = [[g.rayX(phl, yb), yb]], A = rayTop(phl), B = rayTop(phr);
      pts.push(A);
      var N = 16;
      for (var i = 1; i < N; i++) { var x = A[0] + (B[0] - A[0]) * i / N; pts.push([x, g.colTop(x)]); }
      pts.push(B, [g.rayX(phr, yb), yb]);
      return pts;
    }
    var loft = [], N = 40, x;
    for (var i = 0; i <= N; i++) { x = M + (W - 2 * M) * i / N; loft.push([x, g.outerY(x)]); }
    for (i = N; i >= 0; i--) { x = M + (W - 2 * M) * i / N; loft.push([x, g.innerY(x)]); }
    g.poly = {
      loft: loft,
      leg: col(-a2, -a1 - ga),
      straight: col(-a1 + ga, a1 - ga),
      off: col(a1 + ga, a2)
    };
    cache[key] = g;
    return g;
  }

  function hit(x, y, W, H) {
    var g = geom(W, H);
    if (Math.hypot(x - g.cx, y - g.Cly) >= g.Rl - g.t - GAP) return 'loft';
    var phi = Math.atan2(x - g.cx, g.Oy - y);
    return phi < -g.a1 ? 'leg' : phi > g.a1 ? 'off' : 'straight';
  }

  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function pill(ctx, cx, cy, w, h) {
    var x = cx - w / 2, y = cy - h / 2, r = h / 2;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  }
  function figure(ctx, x, y, s) {                       // fielder (feet at x,y)
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#0d1410'; ctx.fillStyle = '#ff6b5b';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-6.5, -17, 13, 16, 4) : ctx.rect(-6.5, -17, 13, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f3c9a0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -23, 5.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d1410'; ctx.beginPath(); ctx.arc(0, -23, 5.5, Math.PI, 0); ctx.fill();
    ctx.restore();
  }
  function ring(ctx, x, y, s) {                         // open spot: dashed ring
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(123,227,123,.14)'; ctx.strokeStyle = '#7be37b'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(0, -2, 17, 7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function chip(ctx, cx, cy, guarded) {
    var w = guarded ? 90 : 78, h = 24;
    pill(ctx, cx, cy, w, h);
    ctx.font = '800 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var ix = cx - w / 2 + 14;
    if (guarded) {
      ctx.fillStyle = '#ff6b5b'; ctx.fill();
      ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ix - 4, cy - 4); ctx.lineTo(ix + 4, cy + 4); ctx.moveTo(ix + 4, cy - 4); ctx.lineTo(ix - 4, cy + 4); ctx.stroke();
      ctx.fillStyle = '#1a0a08'; ctx.fillText('FIELDER', ix + 10, cy + 0.5);
    } else {
      ctx.fillStyle = '#0d1410'; ctx.fill(); ctx.strokeStyle = '#7be37b'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ix - 4.5, cy); ctx.lineTo(ix - 1.5, cy + 3.5); ctx.lineTo(ix + 4.5, cy - 3.5); ctx.stroke();
      ctx.fillStyle = '#c6f5c6'; ctx.fillText('OPEN', ix + 10, cy + 0.5);
    }
  }

  var NAMES = { leg: 'Leg', straight: 'Straight', off: 'Off', loft: 'Loft' };

  function draw(ctx, G) {
    var cv = ctx.canvas, W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
    var g = geom(W, H);
    var guard = (G.field && G.field.guard) || {};
    var tap = G.cur && G.cur.tap, flash = tap && (G.now - tap.t) < 160 && (G.now - tap.t) >= 0 ? tap.sector : null;
    ctx.save();
    ctx.fillStyle = '#0d1410'; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    var order = ['loft', 'leg', 'straight', 'off'], k, i;
    for (i = 0; i < 4; i++) {
      k = order[i]; var gd = !!guard[k], pts = g.poly[k];
      path(ctx, pts);
      ctx.fillStyle = gd ? '#3a1f1c' : '#17331f'; ctx.fill();
      if (gd) {                                         // hatching: shape cue, not only colour
        ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,107,91,.32)'; ctx.lineWidth = 3.2;
        ctx.beginPath();
        for (var s = -H; s < W + H; s += 9) { ctx.moveTo(s, 0); ctx.lineTo(s - H, H); }
        ctx.stroke(); ctx.restore();
      }
      path(ctx, pts);
      ctx.strokeStyle = gd ? '#ff6b5b' : '#7be37b'; ctx.lineWidth = 2.4; ctx.stroke();
    }
    // contents: label at the top of each region, fielder or dashed ring, chip
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 20px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    for (i = 0; i < 4; i++) {
      k = order[i]; var gd2 = !!guard[k], lx, ly, fx, fy, cxp, cyp;
      if (k === 'loft') {
        lx = g.cx; ly = g.bandMid(lx) + 1;
        fx = g.cx + 0.27 * W; fy = g.bandMid(fx) + 15;   // fielder on the RIGHT, like the field
        cxp = g.cx - 0.27 * W; cyp = g.bandMid(cxp);
      } else {
        var ph = k === 'leg' ? -(g.a1 + g.a2) / 2 : k === 'off' ? (g.a1 + g.a2) / 2 : 0;
        var mx = function (y) {
          var l = k === 'leg' ? -g.a2 : k === 'off' ? g.a1 + g.ga : -g.a1 + g.ga;
          var r = k === 'leg' ? -g.a1 - g.ga : k === 'off' ? g.a2 : g.a1 - g.ga;
          return (g.rayX(l, y) + g.rayX(r, y)) / 2;
        };
        var topY = g.colTop(mx(g.H * 0.4)), ext = g.yb - topY;
        ly = topY + 24; lx = mx(ly);
        fy = topY + 0.52 * ext + 12; fx = mx(fy);
        cyp = topY + 0.80 * ext; cxp = mx(cyp);
      }
      ctx.fillStyle = '#eef3e8'; ctx.fillText(NAMES[k], lx, ly);
      if (gd2) figure(ctx, fx, fy, k === 'loft' ? 1 : 1.15); else ring(ctx, fx, fy - (k === 'loft' ? 8 : 12), k === 'loft' ? 1 : 1.2);
      chip(ctx, cxp, cyp, gd2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 20px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    }
    if (flash) {                                        // pressed flash: gold outline
      path(ctx, g.poly[flash]); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.restore();
  }

  LOLParts.pad = { draw: draw, hit: hit };
})();
