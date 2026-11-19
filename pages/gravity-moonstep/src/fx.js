(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonFX = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAU = Math.PI * 2, NP = 160, NT = 24;
  var KIND_COL = ['230,236,255', '255,214,140', '255,140,120', '170,150,120', '150,230,255'];
  var KIND_FILL = KIND_COL.map(function (c) { return 'rgb(' + c + ')'; });
  // kinds: 0 spark, 1 gold/chain, 2 red/over, 3 dust, 4 ring-ish bounce

  function make(opts) {
    var reduced = !!(opts && opts.reduced), seed = 12345;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    // particle pool (struct of arrays)
    var px = new Float32Array(NP), py = new Float32Array(NP), vx = new Float32Array(NP), vy = new Float32Array(NP),
      life = new Float32Array(NP), maxLife = new Float32Array(NP), size = new Float32Array(NP), kind = new Uint8Array(NP);
    var cursor = 0, live = 0;
    // trail ring
    var tx = new Float32Array(NT), ty = new Float32Array(NT), tHead = 0, tCount = 0;
    var shakeT = 0, shakeDur = 0.0001, shakeAmp = 0, pauseT = 0, time = 0;
    var out = { x: 0, y: 0 };

    function emit(x, y, ang, spd, l, sz, k, spread) {
      var i = cursor; cursor = (cursor + 1) % NP;
      var a = ang + (rnd() - 0.5) * spread, s = spd * (0.5 + rnd() * 0.7);
      px[i] = x; py[i] = y; vx[i] = Math.cos(a) * s; vy[i] = Math.sin(a) * s;
      maxLife[i] = life[i] = l * (0.7 + rnd() * 0.6); size[i] = sz; kind[i] = k;
    }
    function burst(n, x, y, ang, spd, l, sz, k, spread) { for (var i = 0; i < n; i++) emit(x, y, ang, spd, l, sz, k, spread); }
    function doShake(amp, dur) { if (reduced) return; if (amp >= shakeAmp * (shakeT / shakeDur)) { shakeAmp = amp; shakeDur = dur; shakeT = dur; } }
    function doPause(s) { if (reduced) return; if (s > pauseT) pauseT = s; }

    var f = {
      reduced: reduced,
      event: function (name, d) {
        d = d || {}; var x = +d.x || 0, y = +d.y || 0;
        switch (name) {
          case 'jump': burst(4 + ((d.charge01 || 0) * 8 | 0), x, y, Math.PI / 2, 60 + 120 * (d.charge01 || 0), 0.4, 2, 3, TAU / 2); break;
          case 'land': {
            var q = Math.min(1, Math.max(0, (+d.vn || 0) / 400));
            burst(5 + (q * 14 | 0), x, y, -Math.PI / 2, 50 + 130 * q, 0.5, 2.2, 3, TAU);
            if (q > 0.55) { doPause(0.04 + 0.05 * q); doShake(2 + 4 * q, 0.2); }
            break;
          }
          case 'chain': {
            var n = Math.max(1, +d.n || 1);
            burst(Math.min(30, 8 + n * 4), x, y, 0, 120 + 20 * Math.min(n, 8), 0.7, 2.4, 1, TAU);
            doPause(0.04 + 0.01 * Math.min(n, 5)); doShake(2 + Math.min(n, 5), 0.25); break;
          }
          case 'bounce': burst(10, x, y, 0, 110, 0.4, 2, 4, TAU); doShake(1.5, 0.12); break;
          case 'crumble': burst(14, x, y, Math.PI / 2, 90, 0.8, 2.6, 3, TAU); doShake(1.5, 0.2); break;
          case 'over': burst(28, x, y, 0, 160, 1.0, 2.8, 2, TAU); doShake(6, 0.45); doPause(0.09); break;
        }
      },
      update: function (dt) {
        if (!(dt > 0)) return;
        time += dt;
        if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
        if (pauseT > 0) pauseT = Math.max(0, pauseT - dt);
        var n = 0, damp = Math.exp(-2.5 * dt);
        for (var i = 0; i < NP; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          if (life[i] <= 0) continue;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt; vx[i] *= damp; vy[i] *= damp;
          if (kind[i] === 3) vy[i] += 120 * dt;
          n++;
        }
        live = n;
      },
      shake: function () {
        if (reduced || shakeT <= 0) { out.x = 0; out.y = 0; return out; }
        var k = shakeAmp * (shakeT / shakeDur);
        out.x = Math.sin(time * 97) * k; out.y = Math.cos(time * 83) * k;
        return out;
      },
      pause: function () { return pauseT; },
      trail: function (x, y) { tx[tHead] = x; ty[tHead] = y; tHead = (tHead + 1) % NT; if (tCount < NT) tCount++; },
      clearTrail: function () { tCount = 0; },
      live: function () { return live; },
      draw: function (ctx, view, w2s) {
        var i, p, px_, py_, k = (view && view.scale) || 1;
        // trail
        for (i = 0; i < tCount; i++) {
          var idx = (tHead - 1 - i + NT * 2) % NT, a = 1 - i / NT;
          p = w2s(tx[idx], ty[idx]);
          if (p[0] !== undefined) { px_ = p[0]; py_ = p[1]; } else { px_ = p.x; py_ = p.y; }
          ctx.globalAlpha = 0.45 * a * a;
          ctx.fillStyle = 'rgb(200,215,255)';
          ctx.beginPath(); ctx.arc(px_, py_, 4.5 * k * a, 0, TAU); ctx.fill();
        }
        for (i = 0; i < NP; i++) {
          if (life[i] <= 0) continue;
          var t = life[i] / maxLife[i];
          p = w2s(px[i], py[i]);
          if (p[0] !== undefined) { px_ = p[0]; py_ = p[1]; } else { px_ = p.x; py_ = p.y; }
          ctx.globalAlpha = Math.min(1, t * 1.5);
          ctx.fillStyle = KIND_FILL[kind[i]];
          ctx.beginPath(); ctx.arc(px_, py_, size[i] * k * (0.4 + 0.6 * t), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // age out trail when not fed (decay one point per draw is frame-bound; game calls trail each airborne frame)
      }
    };
    return f;
  }
  return { make: make };
});
