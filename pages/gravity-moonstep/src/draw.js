(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonDraw = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Look: Ink and Moonlight. Paper + body textures + tide texture are pre-rendered once (seeded RNG),
  // per-frame work is drawImage + a few strokes. No per-frame stipple.
  var TAU = Math.PI * 2, RUNNER_R = 9, VMAX = 520;
  var INK = '#15171f', INK2 = 'rgba(21,23,31,', VERM = '#8e2a1c', OCHRE = '#8a5a14', TIDE_INK = '#0d0f16';
  var GLOW_K = 2.3;
  var REPEL_RC = 'rgba(150,50,36,';
  var A_INK_85 = INK2 + '0.85)', A_INK_65 = INK2 + '0.65)', A_INK_30 = INK2 + '0.3)';
  var A_REP_85 = REPEL_RC + '0.85)', A_REP_65 = REPEL_RC + '0.65)', A_REP_30 = REPEL_RC + '0.3)';
  var A_PULSE_RED = 'rgba(160,52,36,0.600)', PULSE_N = 40, PULSE = [];
  (function () { for (var i = 0; i <= PULSE_N; i++) PULSE.push('rgba(160,52,36,' + (0.8 * i / PULSE_N).toFixed(3) + ')'); })();

  function makeView(w, h, dpr) {
    var narrow = w / h < 0.55;
    return {
      w: w, h: h, dpr: dpr || 1,
      scale: (narrow ? w / 344 : 1) * 0.6,
      runnerFrac: narrow ? 0.38 : 0.45,
      camY: 0,
      key: narrow ? 'S' : 'W'
    };
  }

  // camY = world y at the top of the screen. Look-ahead pushes runner down <= 8% of height.
  function camera(s, view) {
    var r = s.runner, up = Math.max(0, -r.vy);
    var shift = Math.min(0.08, (up / VMAX) * 0.08);
    return r.y - (view.runnerFrac + shift) * view.h / view.scale;
  }

  // Returns a SHARED [sx, sy] array (contract: w2s(x,y)->[sx,sy]); read it immediately, do not keep it.
  var W2S = [0, 0];
  function worldToScreen(view, x, y) {
    W2S[0] = view.w / 2 + x * view.scale; W2S[1] = (y - view.camY) * view.scale;
    return W2S;
  }

  // ---------- caches ----------
  function mk(w, h) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function wob(g, cx, cy, r, amp, n, ph) {
    g.beginPath();
    for (var k = 0; k <= n; k++) {
      var a = k / n * TAU, rr = r + Math.sin(a * 3 + ph) * amp + Math.sin(a * 7 + ph * 2) * amp * 0.5;
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
  function moonGlow(g, cx, cy, R, r, s) {
    var gl = g.createRadialGradient(cx, cy, r * 0.8, cx, cy, R);
    gl.addColorStop(0, 'rgba(170,196,238,' + (0.55 * s) + ')');
    gl.addColorStop(0.45, 'rgba(190,208,238,' + (0.22 * s) + ')');
    gl.addColorStop(1, 'rgba(200,215,240,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  }

  var cache = { w: -1, h: -1, dpr: -1, scale: -1, gen: 0, paper: null, tide: null, pearl: null };
  var spriteOf = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var KIND_CODE = { still: 0, spin: 1, crumble: 2, repel: 3 };

  function buildPaper(w, h, dpr) {
    var c = mk(w * dpr, h * dpr); if (!c) return null;
    var g = c.getContext('2d'), rnd = rng(7), i;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f0e7d1'; g.fillRect(0, 0, w, h);
    var pg = g.createRadialGradient(w / 2, h * 0.45, 60, w / 2, h * 0.5, h * 0.75);
    pg.addColorStop(0, 'rgba(255,250,232,.55)'); pg.addColorStop(1, 'rgba(176,150,104,.32)');
    g.fillStyle = pg; g.fillRect(0, 0, w, h);
    var n = Math.min(9000, Math.floor(w * h * 0.0175));
    for (i = 0; i < n; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,96,60,' + (rnd() * 0.10).toFixed(3) + ')' : 'rgba(255,255,248,' + (rnd() * 0.22).toFixed(3) + ')';
      g.fillRect(rnd() * w, rnd() * h, rnd() < 0.1 ? 2 : 1, 1);
    }
    g.lineWidth = 0.5;
    var nf = Math.floor(w * h / 4300);
    for (i = 0; i < nf; i++) {
      var fx = rnd() * w, fy = rnd() * h, fa = rnd() * TAU, fl = 4 + rnd() * 10;
      g.strokeStyle = 'rgba(110,86,52,' + (0.05 + rnd() * 0.07).toFixed(3) + ')';
      g.beginPath(); g.moveTo(fx, fy);
      g.quadraticCurveTo(fx + Math.cos(fa) * fl / 2 + 2, fy + Math.sin(fa) * fl / 2 - 2, fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
      g.stroke();
    }
    for (i = 0; i < 6; i++) {
      var cx = rnd() * w, cy = rnd() * h, cr = 60 + rnd() * 70, cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0, 'rgba(120,140,175,.07)'); cg.addColorStop(1, 'rgba(120,140,175,0)');
      g.fillStyle = cg; g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
    }
    var vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.7);
    vg.addColorStop(0, 'rgba(60,40,20,0)'); vg.addColorStop(1, 'rgba(60,40,20,.2)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    return c;
  }

  // tide strip: splatter above the edge (rows 0..PAD) and dry-brush grain below. Edge sits at y = TPAD.
  var TPAD = 28;
  function buildTide(w, dpr, k) {
    var th = 340 * k, c = mk(w * dpr, (th + TPAD * k) * dpr); if (!c) return null;
    var g = c.getContext('2d'), rnd = rng(11), i;
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    var W = w / k, E = TPAD;
    var bl = g.createLinearGradient(0, E - 26, 0, E);
    bl.addColorStop(0, 'rgba(21,23,31,0)'); bl.addColorStop(1, 'rgba(21,23,31,.22)');
    g.fillStyle = bl; g.fillRect(0, E - 26, W, 26);
    for (i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(13,15,22,' + (0.4 + rnd() * 0.5).toFixed(2) + ')';
      g.beginPath(); g.arc(rnd() * W, E - 6 - rnd() * 20, rnd() * 1.6 + 0.3, 0, TAU); g.fill();
    }
    for (i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.6 ? 'rgba(70,84,118,' + (rnd() * 0.25).toFixed(2) + ')' : 'rgba(0,0,0,.3)';
      g.fillRect(rnd() * W, E + 8 + rnd() * 320, 1 + rnd() * 10, 0.6);
    }
    g.lineCap = 'round'; g.strokeStyle = 'rgba(160,186,230,.3)'; g.lineWidth = 1;
    for (i = 0; i < 7; i++) {
      var yy = E + 16 + i * 14, xx = rnd() * W * 0.7;
      g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 20 + rnd() * 40, yy); g.stroke();
    }
    return c;
  }

  function buildPearl(k, dpr) {
    var R = 30, s = k * dpr, c = mk(R * 2 * s, R * 2 * s); if (!c) return null;
    var g = c.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0);
    moonGlow(g, R, R, R, 9, 1.5);
    var rg = g.createRadialGradient(R - 3, R - 3, 1, R, R, 10);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, '#bcd0ee');
    g.beginPath(); g.arc(R, R, RUNNER_R, 0, TAU); g.fillStyle = rg; g.fill();
    g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    return c;
  }

  var TONES = {
    still: [[226, 232, 244], [142, 152, 176], [52, 58, 78]],
    spin: [[232, 230, 222], [158, 152, 150], [66, 58, 62]],
    crumble: [[222, 224, 232], [150, 156, 172], [70, 74, 90]],
    repel: [[238, 214, 200], [176, 120, 104], [84, 36, 34]]
  };

  // Body sprite: glow + ink wash + stipple + hatched craters + double wobbly outline, drawn once.
  function buildBody(b, k, dpr) {
    var r = b.r, P = r * GLOW_K, s = k * dpr, c = mk(P * 2 * s, P * 2 * s); if (!c) return null;
    var g = c.getContext('2d'), rnd = rng((b.id | 0) * 7919 + Math.round(r) * 104729 + 13), i;
    g.setTransform(s, 0, 0, s, 0, 0);
    var cx = P, cy = P, ph = (b.id | 0) * 0.77 + r * 0.07, kind = b.kind || 'still';
    moonGlow(g, cx, cy, P, r, kind === 'repel' ? 0.5 : 1);
    g.save(); wob(g, cx, cy, r, 1.4, 48, ph); g.clip();
    var tone = TONES[kind] || TONES.still;
    var wg = g.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx + r * 0.1, cy + r * 0.1, r * 1.25);
    wg.addColorStop(0, 'rgb(' + tone[0] + ')'); wg.addColorStop(0.55, 'rgb(' + tone[1] + ')'); wg.addColorStop(1, 'rgb(' + tone[2] + ')');
    g.fillStyle = wg; g.fillRect(cx - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8);
    for (i = 0; i < 6; i++) {
      var a = rnd() * TAU, d = rnd() * r * 0.8, br = r * (0.25 + rnd() * 0.3);
      var bg = g.createRadialGradient(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, br);
      bg.addColorStop(0, 'rgba(30,36,60,.18)'); bg.addColorStop(1, 'rgba(30,36,60,0)');
      g.fillStyle = bg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    var n = Math.floor(r * r * 0.55);
    for (i = 0; i < n; i++) {
      var px = cx + (rnd() * 2 - 1) * r, py = cy + (rnd() * 2 - 1) * r, sh = ((px - cx) * 0.6 + (py - cy) * 0.8) / r;
      if (rnd() < 0.5 + sh * 0.45) { g.fillStyle = INK2 + (0.12 + rnd() * 0.35).toFixed(2) + ')'; g.fillRect(px, py, 1, 1); }
    }
    var nc = 3 + Math.floor(rnd() * 2), q;
    for (q = 0; q < nc; q++) {
      var ca = rnd() * TAU, cd = rnd() * r * 0.55, qr = r * (0.14 + rnd() * 0.16);
      var qx = cx + Math.cos(ca) * cd, qy = cy + Math.sin(ca) * cd;
      g.beginPath(); g.ellipse(qx, qy, qr, qr * 0.82, -0.4, 0, TAU); g.fillStyle = 'rgba(40,48,76,.14)'; g.fill();
      g.save(); g.beginPath(); g.ellipse(qx, qy, qr, qr * 0.82, -0.4, 0, TAU); g.clip();
      g.strokeStyle = INK2 + '.55)'; g.lineWidth = 0.7;
      for (var hh = -qr * 2; hh < qr * 2; hh += 2.3) { g.beginPath(); g.moveTo(qx + hh - qr, qy + qr); g.lineTo(qx + hh + qr, qy - qr); g.stroke(); }
      g.restore();
      g.beginPath(); g.ellipse(qx, qy, qr, qr * 0.82, -0.4, 0, TAU); g.lineWidth = 1.1; g.strokeStyle = INK2 + '.8)'; g.stroke();
      g.beginPath(); g.ellipse(qx, qy, qr + 1.4, qr * 0.82 + 1.4, -0.4, Math.PI * 0.9, Math.PI * 1.55);
      g.lineWidth = 1; g.strokeStyle = 'rgba(250,250,255,.7)'; g.stroke();
    }
    g.strokeStyle = INK2 + '.4)'; g.lineWidth = 0.8;
    for (i = 0; i < r * 1.1; i++) {
      var t = -0.2 + i / (r * 1.1) * 1.7, ang = t * Math.PI, ex = cx + Math.cos(ang) * r * 0.98, ey = cy + Math.sin(ang) * r * 0.98;
      if (Math.sin(ang) < 0.1 && Math.cos(ang) < 0.2) continue;
      g.beginPath(); g.moveTo(ex, ey);
      g.lineTo(ex - Math.cos(ang) * (3 + rnd() * r * 0.35) - 2, ey - Math.sin(ang) * (3 + rnd() * r * 0.35) - 1); g.stroke();
    }
    if (kind === 'crumble') {
      g.strokeStyle = INK; g.lineWidth = 2.2; g.lineCap = 'round';
      for (i = 0; i < 5; i++) {
        var sa = rnd() * TAU, x0 = cx + Math.cos(sa) * r * 0.75, y0 = cy + Math.sin(sa) * r * 0.75;
        g.beginPath(); g.moveTo(x0, y0);
        g.lineTo(cx + Math.cos(sa + 0.2) * r * 0.4, cy + Math.sin(sa + 0.2) * r * 0.4);
        g.lineTo(cx + Math.cos(sa - 0.1) * r * 0.1, cy + Math.sin(sa - 0.1) * r * 0.1); g.stroke();
      }
    }
    g.restore();
    g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 2.4; wob(g, cx, cy, r, 1.2, 60, ph); g.stroke();
    g.lineWidth = 0.8; g.strokeStyle = INK2 + '.55)'; wob(g, cx, cy, r + 2.2, 1.6, 60, ph + 2); g.stroke();
    return c;
  }

  function ensure(view) {
    var dpr = view.dpr || 1;
    if (cache.w === view.w && cache.h === view.h && cache.dpr === dpr && cache.scale === view.scale) return;
    cache.w = view.w; cache.h = view.h; cache.dpr = dpr; cache.scale = view.scale; cache.gen++;
    cache.paper = buildPaper(view.w, view.h, dpr);
    cache.tide = buildTide(view.w, dpr, view.scale);
    cache.pearl = buildPearl(view.scale, dpr);
  }
  function bodySprite(b, view, idx) {
    // Per-body entry {k: numeric signature of kind+round(r), g: cache generation, sp}; no string keys, no full flush.
    var kc = KIND_CODE[b.kind || 'still']; if (kc === undefined) kc = 0;
    var sig = kc * 100000 + Math.round(b.r);
    var e = spriteOf ? spriteOf.get(b) : b._spe;
    if (e === undefined || e.k !== sig || e.g !== cache.gen) {
      e = { k: sig, g: cache.gen, sp: buildBody(b, view.scale, view.dpr || 1) };
      if (spriteOf) spriteOf.set(b, e); else b._spe = e;
    }
    return e.sp;
  }

  function frame(ctx, s, view, ui) {
    ui = ui || {};
    var w = view.w, h = view.h, k = view.scale, i, b;
    var reduced = !!ui.reduced, t = ui.t || 0;
    if (typeof view.camY !== 'number' || view.camY !== view.camY) view.camY = camera(s, view);
    var cam = view.camY, cx = w / 2;
    function X(x) { return cx + x * k; }
    function Y(y) { return (y - cam) * k; }

    ensure(view);
    ctx.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    if (cache.paper) ctx.drawImage(cache.paper, 0, 0, w, h);
    else { ctx.fillStyle = '#f0e7d1'; ctx.fillRect(0, 0, w, h); }

    var run = s.runner, rpx = X(run.x), rpy = Y(run.y);

    for (i = 0; i < s.bodies.length; i++) {
      b = s.bodies[i];
      if (b.dead) continue;
      var sx = X(b.x), sy = Y(b.y), R = b.R * k;
      if (sx + R < 0 || sx - R > w || sy + R < 0 || sy - R > h) continue;
      var full = b.r * k, rr = (b.kind === 'crumble' && b.rem != null ? b.rem : b.r) * k;
      var repel = b.kind === 'repel';
      var rc = repel ? REPEL_RC : INK2;

      // influence ring: dotted ink; stronger when near, solid-ish when owner
      var owner = run.mode === 'rim' && run.body === i;
      var near = Math.hypot(rpx - sx, rpy - sy) <= R * 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU);
      ctx.lineCap = 'round';
      if (owner) { ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = rc === INK2 ? A_INK_85 : A_REP_85; }
      else if (near) { ctx.setLineDash([1, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = rc === INK2 ? A_INK_65 : A_REP_65; }
      else { ctx.setLineDash([1, 6]); ctx.lineWidth = 1.3; ctx.strokeStyle = rc === INK2 ? A_INK_30 : A_REP_30; }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';

      // repel pulse rings (static mid-phase when reduced motion)
      if (repel) {
        var ph = reduced ? 0.5 : ((t * 0.8 + (b.id | 0) * 0.37) % 1);
        ctx.beginPath(); ctx.arc(sx, sy, rr + (R - rr) * ph, 0, TAU);
        ctx.strokeStyle = reduced ? A_PULSE_RED : PULSE[Math.min(PULSE_N, Math.round(0.8 * (1 - ph) * PULSE_N / 0.8))];
        ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, rr + 8 * k, 0, TAU);
        ctx.strokeStyle = 'rgba(160,52,36,0.5)'; ctx.lineWidth = 2; ctx.stroke();
      }
      // crumble: dashed original outline when shrunk
      if (b.kind === 'crumble' && rr < full - 1) {
        ctx.beginPath(); ctx.arc(sx, sy, full + 1, 0, TAU);
        ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeStyle = INK2 + '.8)'; ctx.stroke(); ctx.setLineDash([]);
      }

      // body sprite (rotated for spinners so craters turn with the body)
      var sp = bodySprite(b, view, i);
      if (sp && rr > 0.5) {
        var sc = rr / full, half = b.r * GLOW_K * k * sc;
        if (b.kind === 'spin' && b.ang) {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.ang);
          ctx.drawImage(sp, -half, -half, half * 2, half * 2); ctx.restore();
        } else ctx.drawImage(sp, sx - half, sy - half, half * 2, half * 2);
      } else {
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fillStyle = '#8a90a0'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      }
      if (b.kind === 'crumble' && full > 0) {
        var fr = Math.max(0, Math.min(1, rr / full));
        ctx.beginPath(); ctx.arc(sx, sy, full + 7, -Math.PI / 2, -Math.PI / 2 + TAU * fr);
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(142,42,28,' + (0.45 + 0.5 * (1 - fr)).toFixed(2) + ')'; ctx.stroke(); ctx.lineCap = 'butt';
      }
      if (b.kind === 'crumble') {
        ctx.beginPath(); ctx.arc(sx, sy, rr + 1, 0, TAU);
        ctx.lineWidth = 2.4; ctx.setLineDash([7, 4]); ctx.strokeStyle = 'rgba(142,42,28,.9)'; ctx.stroke(); ctx.setLineDash([]);
      }

      if (b.kind === 'spin') {
        var a0 = b.ang || 0, sd = (b.spin < 0 || b.dir < 0) ? -1 : 1, n, a;
        ctx.lineWidth = 3; ctx.strokeStyle = OCHRE; ctx.lineCap = 'round';
        for (n = 0; n < 3; n++) {
          a = a0 + n * TAU / 3;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * (rr - 8 * k), sy + Math.sin(a) * (rr - 8 * k));
          ctx.lineTo(sx + Math.cos(a) * (rr + 5 * k), sy + Math.sin(a) * (rr + 5 * k));
          ctx.stroke();
          var ca = a + sd * 0.24, cr = rr + 13 * k, tx = -Math.sin(ca) * sd, ty2 = Math.cos(ca) * sd;
          var px = sx + Math.cos(ca) * cr, py = sy + Math.sin(ca) * cr;
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(ca) * 4 * k - tx * 4 * k, py - Math.sin(ca) * 4 * k - ty2 * 4 * k);
          ctx.lineTo(px + tx * 4 * k, py + ty2 * 4 * k);
          ctx.lineTo(px + Math.cos(ca) * 4 * k - tx * 4 * k, py + Math.sin(ca) * 4 * k - ty2 * 4 * k);
          ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 3;
        }
        ctx.lineCap = 'butt';
      }
      if (repel) {
        ctx.lineWidth = 3; ctx.strokeStyle = VERM; ctx.lineCap = 'round';
        for (var q = 0; q < 4; q++) {
          var qa = q * TAU / 4 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(qa) * (rr + 3 * k), sy + Math.sin(qa) * (rr + 3 * k));
          ctx.lineTo(sx + Math.cos(qa) * (rr + 11 * k), sy + Math.sin(qa) * (rr + 11 * k));
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    }

    // assist arc: dotted ink, landing marker with blue wash
    if (ui.pred && ui.pred.pts && ui.pred.pts.length) {
      var p = ui.pred.pts;
      ctx.fillStyle = INK2 + '.8)';
      for (i = 0; i < p.length; i++) {
        ctx.beginPath(); ctx.arc(X(p[i].x), Y(p[i].y), 2.1, 0, TAU); ctx.fill();
      }
      var lp = p[p.length - 1], lands = !!(ui.pred.land || ui.pred.lands || ui.pred.hit || (ui.pred.landId != null && ui.pred.landId >= 0));
      ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), 8 * k + 2, 0, TAU);
      if (lands) {
        ctx.fillStyle = 'rgba(200,218,250,.7)'; ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
        var pl = reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 4), lr = (22 + 3 * pl) * k + 4;
        ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), lr + 2.5, 0, TAU);
        ctx.lineWidth = 1.5; ctx.strokeStyle = A_INK_85; ctx.stroke();
        ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), lr, 0, TAU);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(200,206,218,' + (0.8 + 0.2 * pl).toFixed(2) + ')'; ctx.stroke();
        ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), lr - 2.5, 0, TAU);
        ctx.lineWidth = 1.2; ctx.strokeStyle = A_INK_65; ctx.stroke();
      } else {
        ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]); ctx.strokeStyle = INK2 + '.65)'; ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // runner: silver pearl + ink streak
    var dx, dy;
    if (run.mode === 'rim' && s.bodies[run.body]) {
      var th = run.theta, d = run.dir || 1;
      dx = -Math.sin(th) * d; dy = Math.cos(th) * d;
    } else { dx = run.vx; dy = run.vy; }
    var m = Math.sqrt(dx * dx + dy * dy) || 1; dx /= m; dy /= m;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rpx - dx * 8 * k, rpy - dy * 8 * k); ctx.lineTo(rpx - dx * 32 * k, rpy - dy * 32 * k);
    ctx.lineWidth = 5; ctx.strokeStyle = INK2 + '.22)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rpx, rpy); ctx.lineTo(rpx - dx * 24 * k, rpy - dy * 24 * k);
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK2 + '.6)'; ctx.stroke();
    ctx.lineCap = 'butt';
    if (cache.pearl) { var ph2 = 30 * k; ctx.drawImage(cache.pearl, rpx - ph2, rpy - ph2, ph2 * 2, ph2 * 2); }
    else { ctx.beginPath(); ctx.arc(rpx, rpy, RUNNER_R * k, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
    if (ui.charge01 > 0) {
      ctx.beginPath(); ctx.arc(rpx, rpy, (RUNNER_R + 4 + 4 * ui.charge01) * k, 0, TAU);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(138,90,20,' + (0.5 + 0.45 * ui.charge01).toFixed(2) + ')';
      ctx.stroke();
    }

    // tide: black ink with wavy edge, drips, grain texture
    var ty = Y(s.tideY);
    if (ty < h + 30) {
      var wp = reduced ? 0 : t * 0.9;
      if (ty <= -8) {
        ctx.fillStyle = TIDE_INK; ctx.fillRect(0, 0, w, h);
      } else {
        ctx.beginPath(); ctx.moveTo(0, h + 2); ctx.lineTo(0, ty);
        for (var x = 0; x <= w + 4; x += 4) {
          ctx.lineTo(x, ty + Math.sin(x * 0.045 + wp) * 5 + Math.sin(x * 0.13 + 1 - wp * 0.7) * 2.6 + Math.sin(x * 0.31) * 1.2);
        }
        ctx.lineTo(w, h + 2); ctx.closePath();
        ctx.fillStyle = TIDE_INK; ctx.fill();
        ctx.fillStyle = TIDE_INK;
        for (i = 0; i < 9; i++) {
          var dxp = (14 + i * 37 + ((i * 53) % 10)) * k, dl = (6 + ((i * 97) % 16)) * k;
          ctx.fillRect(dxp, ty - 2, 3 * k, dl);
          ctx.beginPath(); ctx.arc(dxp + 1.5 * k, ty - 2 + dl, 2.4 * k, 0, TAU); ctx.fill();
        }
        if (cache.tide) {
          var tw = cache.tide.width / (view.dpr || 1), thh = cache.tide.height / (view.dpr || 1);
          ctx.drawImage(cache.tide, 0, ty - TPAD * k, tw, thh);
        }
        if (ty < h - 340 * k) { ctx.fillStyle = TIDE_INK; ctx.fillRect(0, ty + 330 * k, w, h - ty - 330 * k); }
      }
    }
  }

  return { makeView: makeView, camera: camera, worldToScreen: worldToScreen, frame: frame };
});
