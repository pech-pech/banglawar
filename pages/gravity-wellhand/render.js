(function () {
  var WH = window.WH = window.WH || {};
  var BG = '#070b14', GOLD = '#ffd86b', TEAL = '#5ef0d0', ORANGE = '#ff8a3d';
  var TWO_PI = Math.PI * 2;

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  WH.createFx = function () {
    var fx = { list: [], banner: 0, bannerWave: 0 };
    fx.add = function (ev) {
      if (!ev || !ev.k) return;
      var x = num(ev.x, 0), y = num(ev.y, 0);
      if (ev.k === 'capture') fx.list.push({ t: 0, d: 0.5, x: x, y: y, c: GOLD, r0: 20, r1: 52 });
      else if (ev.k === 'blast') fx.list.push({ t: 0, d: 0.7, x: x, y: y, c: '#ff4d4d', r0: 20, r1: 90 });
      else if (ev.k === 'clash') fx.list.push({ t: 0, d: 0.5, x: x, y: y, c: ORANGE, r0: 10, r1: 48 });
      else if (ev.k === 'merge') fx.list.push({ t: 0, d: 0.5, x: x, y: y, c: TEAL, r0: 12, r1: 44 });
      else if (ev.k === 'wave') { fx.banner = 1.5; fx.bannerWave = num(ev.wave, 0) || num(ev.kind, 0); }
      if (fx.list.length > 60) fx.list.splice(0, fx.list.length - 60);
    };
    fx.update = function (dt) {
      dt = num(dt, 0);
      for (var i = fx.list.length - 1; i >= 0; i--) {
        fx.list[i].t += dt;
        if (fx.list[i].t >= fx.list[i].d) fx.list.splice(i, 1);
      }
      if (fx.banner > 0) fx.banner = Math.max(0, fx.banner - dt);
    };
    fx.clear = function () { fx.list.length = 0; fx.banner = 0; };
    return fx;
  };

  WH.layout = function (winW, winH, simW, simH) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    winW = Math.max(1, winW); winH = Math.max(1, winH);
    simW = Math.max(1, simW || winW); simH = Math.max(1, simH || winH);
    var scale = Math.min(winW / simW, winH / simH);
    return {
      cssW: winW, cssH: winH, dpr: dpr, scale: scale,
      ox: (winW - simW * scale) / 2, oy: (winH - simH * scale) / 2,
      simW: simW, simH: simH
    };
  };

  WH.viewToSim = function (view, cx, cy) {
    return { x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale };
  };

  function arc(ctx, x, y, r, a0, a1) { ctx.beginPath(); ctx.arc(x, y, r, a0, a1); }

  function drawBody(ctx, b, time) {
    var x = num(b.x, 0), y = num(b.y, 0), r = num(b.r, b.good ? 12 : 14);
    var tr = b.trail;
    if (tr && tr.length > 1) {
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (var i = 1; i < tr.length; i++) {
        var p = tr[i - 1], q = tr[i];
        if (!p || !q) continue;
        ctx.globalAlpha = 0.28 * i / tr.length;
        ctx.strokeStyle = b.good ? TEAL : ORANGE;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (b.good) {
      var rr = b.merged ? Math.max(r, 16) : r;
      ctx.fillStyle = TEAL;
      arc(ctx, x, y, rr, 0, TWO_PI); ctx.fill();
      if (b.merged) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; arc(ctx, x, y, rr + 3, 0, TWO_PI); ctx.stroke(); }
    } else {
      var ang = Math.atan2(num(b.vy, 0), num(b.vx, 1));
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 1.15, 0); ctx.lineTo(-r * 0.8, r * 0.95); ctx.lineTo(-r * 0.8, -r * 0.95); ctx.closePath();
      ctx.stroke(); ctx.restore();
    }
  }

  WH.draw = function (ctx, sim, view, fx, opts) {
    opts = opts || {};
    if (!ctx || !view) return;
    var dpr = view.dpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.cssW * dpr, view.cssH * dpr);
    if (!sim) return;
    var W = num(sim.W, 360), H = num(sim.H, 640);
    var DEF = WH.DEF || {};
    var P = sim.P || DEF;
    var R = num(P.R, 150), Smax = num(P.Smax, 3.1e7), blastR = num(P.blastR, 140);
    var topbar = num(sim.topbar, H < 700 ? 56 : 64);
    var time = num(sim.time, 0);
    var k = view.scale * dpr;
    ctx.setTransform(k, 0, 0, k, view.ox * dpr, view.oy * dpr);

    // field edge when letterboxed
    if (view.ox > 1 || view.oy > 1) {
      ctx.strokeStyle = 'rgba(120,150,200,0.25)'; ctx.lineWidth = 1 / view.scale;
      ctx.strokeRect(0, 0, W, H);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    // top bar bg
    ctx.fillStyle = '#0d1424'; ctx.fillRect(0, 0, W, topbar);
    ctx.fillStyle = 'rgba(120,150,200,0.18)'; ctx.fillRect(0, topbar, W, 1);

    // collectors
    var cols = sim.cols || [];
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i]; if (!c) continue;
      var cr = num(c.r, 30);
      for (var j = 0; j < 3; j++) {
        var a = -Math.PI / 2 + j * TWO_PI / 3 + time * 0.3;
        arc(ctx, c.x, c.y, cr, a + 0.2, a + TWO_PI / 3 - 0.2); ctx.stroke();
      }
    }

    // core
    var core = sim.core;
    if (core) {
      var integ = clamp(num(sim.integrity, 5), 0, 5);
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,90,90,0.18)'; ctx.lineWidth = 1.5;
      arc(ctx, core.x, core.y, blastR, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
      var cr2 = num(core.r, 36);
      ctx.strokeStyle = '#8fb4ff'; ctx.lineWidth = 3;
      arc(ctx, core.x, core.y, cr2, 0, TWO_PI); ctx.stroke();
      for (var p = 0; p < 5; p++) {
        var pa = -Math.PI / 2 + p * TWO_PI / 5;
        ctx.fillStyle = p < integ ? '#8fe8ff' : 'rgba(120,150,200,0.25)';
        arc(ctx, core.x + Math.cos(pa) * (cr2 - 12), core.y + Math.sin(pa) * (cr2 - 12), 4.5, 0, TWO_PI); ctx.fill();
      }
    }

    // bodies
    var bodies = sim.bodies || [];
    for (var n = 0; n < bodies.length; n++) if (bodies[n]) drawBody(ctx, bodies[n], time);

    // well
    var well = sim.well, ptr = sim.ptr;
    var stall = num(sim.stall, 0);
    var heat = clamp(num(sim.heat, 0), 0, 100);
    var wellShown = well && (well.open || stall > 0 || num(sim.lockLeft, 0) > 0);
    if (ptr && ptr.down && well) {
      ctx.strokeStyle = 'rgba(160,190,255,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(ptr.x, ptr.y); ctx.lineTo(num(well.x, ptr.x), num(well.y, ptr.y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,220,255,0.35)'; arc(ctx, ptr.x, ptr.y, 16, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.7)'; ctx.lineWidth = 2; arc(ctx, ptr.x, ptr.y, 16, 0, TWO_PI); ctx.stroke();
    }
    if (wellShown) {
      var wx = num(well.x, 0), wy = num(well.y, 0);
      var frac = clamp(num(well.S, 0) / Smax, 0, 1);
      if (well.open) {
        var rad = R * (0.35 + 0.65 * frac);
        var g = ctx.createRadialGradient(wx, wy, 0, wx, wy, rad);
        g.addColorStop(0, 'rgba(120,170,255,' + (0.30 + 0.25 * frac) + ')');
        g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.fillStyle = g; arc(ctx, wx, wy, rad, 0, TWO_PI); ctx.fill();
        var pulse = 1 + 0.08 * Math.sin(time * 10);
        ctx.strokeStyle = 'rgba(190,215,255,0.85)'; ctx.lineWidth = 1.5;
        arc(ctx, wx, wy, 22 * pulse, 0, TWO_PI); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(160,170,190,0.4)'; ctx.lineWidth = 1.5;
        arc(ctx, wx, wy, 22, 0, TWO_PI); ctx.stroke();
      }
      // heat arc
      if (heat > 0.5) {
        var hr = Math.round(94 + 161 * heat / 100), hg = Math.round(240 - 170 * heat / 100), hb = Math.round(208 - 160 * heat / 100);
        ctx.strokeStyle = 'rgb(' + hr + ',' + hg + ',' + hb + ')'; ctx.lineWidth = 4;
        arc(ctx, wx, wy, 29, -Math.PI / 2, -Math.PI / 2 + TWO_PI * heat / 100); ctx.stroke();
      }
      if (stall > 0) {
        ctx.fillStyle = '#ff6a6a'; ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(stall.toFixed(1), wx, wy);
      }
    }

    // fx
    var fl = (fx && fx.list) || [];
    for (var f = 0; f < fl.length; f++) {
      var e = fl[f], u = clamp(e.t / e.d, 0, 1);
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.c; ctx.lineWidth = 3 * (1 - u) + 1;
      arc(ctx, e.x, e.y, e.r0 + (e.r1 - e.r0) * u, 0, TWO_PI); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // HUD (keep 72px each side clear)
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8f0ff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(String(Math.round(num(sim.score, 0))), 76, topbar * 0.36);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9fb3d9';
    ctx.fillText('Wave ' + num(sim.wave, 1) + (sim.pattern ? ' · ' + sim.pattern : ''), 76, topbar * 0.72);
    var mult = num(sim.mult, 1);
    if (mult > 1) {
      ctx.textAlign = 'right'; ctx.fillStyle = GOLD; ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('x' + mult, W - 76, topbar * 0.5);
    }

    // wave banner
    if (fx && fx.banner > 0) {
      ctx.globalAlpha = clamp(fx.banner / 0.5, 0, 1);
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText('Wave ' + (fx.bannerWave || num(sim.wave, 1)), W / 2, H * 0.40);
      ctx.globalAlpha = 1;
    }
    if (opts.paused) {
      ctx.fillStyle = 'rgba(7,11,20,0.45)'; ctx.fillRect(0, topbar, W, H - topbar);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
})();
