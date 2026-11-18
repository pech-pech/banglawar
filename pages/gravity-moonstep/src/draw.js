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
      var owner = s.runner.mode === 'rim' && s.runner.body === i;
      var near = Math.hypot(X(s.runner.x) - sx, Y(s.runner.y) - sy) <= R * 1.2;
      var rc = b.kind === 'repel' ? '255,140,120' : '180,195,230';
      if (owner) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + rc + ',0.85)'; ctx.stroke(); }
      else if (near) { ctx.strokeStyle = 'rgba(' + rc + ',0.3)'; ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(' + rc + ',0.08)'; ctx.stroke(); }
      ctx.lineWidth = 1;
      if (b.kind === 'repel') {
        var ph = reduced ? 0.5 : ((t * 0.8 + b.id * 0.37) % 1);
        ctx.beginPath(); ctx.arc(sx, sy, rr + (R - rr) * ph, 0, TAU);
        ctx.strokeStyle = 'rgba(255,120,100,' + (reduced ? 0.6 : 0.8 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 2; ctx.stroke();
      }
      if (b.kind === 'crumble' && rr < b.r * k - 1) {
        ctx.beginPath(); ctx.arc(sx, sy, b.r * k, 0, TAU);
        ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(223,229,245,0.3)'; ctx.stroke(); ctx.setLineDash([]);
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
        var a0 = b.ang || 0, sd = (b.spin < 0 || b.dir < 0) ? -1 : 1, n, a;
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffd36b'; ctx.lineCap = 'round';
        for (n = 0; n < 3; n++) {
          a = a0 + n * TAU / 3;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * (rr - 8 * k), sy + Math.sin(a) * (rr - 8 * k));
          ctx.lineTo(sx + Math.cos(a) * (rr + 4 * k), sy + Math.sin(a) * (rr + 4 * k));
          ctx.stroke();
          // chevron pointing along spin direction, just outside the rim
          var ca = a + sd * 0.22, cr = rr + 8 * k, tx = -Math.sin(ca) * sd, ty2 = Math.cos(ca) * sd;
          var px = sx + Math.cos(ca) * cr, py = sy + Math.sin(ca) * cr;
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(ca) * 4 * k - tx * 4 * k, py - Math.sin(ca) * 4 * k - ty2 * 4 * k);
          ctx.lineTo(px + tx * 4 * k, py + ty2 * 4 * k);
          ctx.lineTo(px + Math.cos(ca) * 4 * k - tx * 4 * k, py + Math.sin(ca) * 4 * k - ty2 * 4 * k);
          ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 3;
        }
        ctx.lineCap = 'butt';
      }
      if (b.kind === 'repel') {
        ctx.lineWidth = 3; ctx.strokeStyle = '#ff9a88';
        for (var q = 0; q < 4; q++) {
          var qa = q * TAU / 4 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(qa) * (rr + 2 * k), sy + Math.sin(qa) * (rr + 2 * k));
          ctx.lineTo(sx + Math.cos(qa) * (rr + 9 * k), sy + Math.sin(qa) * (rr + 9 * k));
          ctx.stroke();
        }
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
      var lp = p[p.length - 1], lands = !!(ui.pred.land || ui.pred.lands || ui.pred.hit || (ui.pred.landId != null && ui.pred.landId >= 0));
      ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), 6 * k, 0, TAU);
      ctx.lineWidth = 2;
      if (lands) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); }
      else { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke(); ctx.setLineDash([]); }
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
