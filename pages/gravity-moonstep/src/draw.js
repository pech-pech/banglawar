(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonDraw = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAU = Math.PI * 2, RUNNER_R = 9, VMAX = 520;

  function makeView(w, h, dpr) {
    var narrow = w / h < 0.55;
    return {
      w: w, h: h, dpr: dpr || 1,
      scale: narrow ? w / 344 : 1,
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

  function worldToScreen(view, x, y) {
    return { x: view.w / 2 + x * view.scale, y: (y - view.camY) * view.scale };
  }

  function frame(ctx, s, view, ui) {
    ui = ui || {};
    var w = view.w, h = view.h, k = view.scale, i, b;
    var reduced = !!ui.reduced, t = ui.t || 0;
    if (typeof view.camY !== 'number' || view.camY !== view.camY) view.camY = camera(s, view);
    var cam = view.camY, cx = w / 2;
    function X(x) { return cx + x * k; }
    function Y(y) { return (y - cam) * k; }

    ctx.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, w, h);

    // bodies (on screen only)
    for (i = 0; i < s.bodies.length; i++) {
      b = s.bodies[i];
      if (b.dead) continue;
      var sx = X(b.x), sy = Y(b.y), R = b.R * k;
      if (sx + R < 0 || sx - R > w || sy + R < 0 || sy - R > h) continue;
      var rr = (b.kind === 'crumble' && b.rem != null ? b.rem : b.r) * k;
      // influence ring
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU);
      ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.strokeStyle = b.kind === 'repel' ? 'rgba(255,140,120,0.35)' : 'rgba(180,195,230,0.28)';
      ctx.stroke();
      if (b.kind === 'repel') {
        var ph = reduced ? 0.5 : ((t * 0.8 + b.id * 0.37) % 1);
        ctx.beginPath(); ctx.arc(sx, sy, rr + (R - rr) * ph, 0, TAU);
        ctx.strokeStyle = 'rgba(255,120,100,' + (reduced ? 0.6 : 0.8 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 2; ctx.stroke();
      }
      // body disc
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU);
      ctx.fillStyle = b.kind === 'repel' ? '#5a4a52' : '#7d8493';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = b.kind === 'repel' ? '#ff9a88' : '#dfe5f5';
      if (b.kind === 'crumble') ctx.setLineDash([6, 5]);
      ctx.stroke(); ctx.setLineDash([]);
      if (b.kind === 'spin') {
        var a = b.ang || 0;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * (rr - 7 * k), sy + Math.sin(a) * (rr - 7 * k));
        ctx.lineTo(sx + Math.cos(a) * (rr + 4 * k), sy + Math.sin(a) * (rr + 4 * k));
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffd36b'; ctx.stroke();
      }
    }

    // tide
    var ty = Y(s.tideY);
    if (ty < h) {
      var top = Math.max(0, ty);
      ctx.fillStyle = 'rgba(40,10,40,0.82)';
      ctx.fillRect(0, top, w, h - top);
      if (ty >= -3) {
        ctx.fillStyle = '#ff6fa8';
        ctx.fillRect(0, ty - 1.5, w, 3);
      }
    }

    // assist arc
    if (ui.pred && ui.pred.pts && ui.pred.pts.length) {
      var p = ui.pred.pts;
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (i = 0; i < p.length; i++) {
        ctx.beginPath(); ctx.arc(X(p[i].x), Y(p[i].y), 2, 0, TAU); ctx.fill();
      }
    }

    // runner
    var r = s.runner, rx = X(r.x), ry = Y(r.y), dx, dy;
    if (r.mode === 'rim' && s.bodies[r.body]) {
      var th = r.theta, d = r.dir || 1;
      dx = -Math.sin(th) * d; dy = Math.cos(th) * d;
    } else { dx = r.vx; dy = r.vy; }
    var m = Math.sqrt(dx * dx + dy * dy) || 1; dx /= m; dy /= m;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - dx * 22 * k, ry - dy * 22 * k);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, ry, RUNNER_R * k, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    if (ui.charge01 > 0) {
      ctx.beginPath(); ctx.arc(rx, ry, (RUNNER_R + 4 + 4 * ui.charge01) * k, 0, TAU);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,211,107,' + (0.4 + 0.5 * ui.charge01).toFixed(2) + ')';
      ctx.stroke();
    }
  }

  return { makeView: makeView, camera: camera, worldToScreen: worldToScreen, frame: frame };
});
