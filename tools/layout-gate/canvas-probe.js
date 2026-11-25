// PGS layout gate: in-page canvas checks. Plain browser JS, no imports. Added after load via addScriptTag.
// window.__pgsCanvasProbe(opt) -> Issue[] (CONTRACT section 6). All canvas checks are SOFT.
// Needs canvas-hook.js as init script (text log + context kinds). WebGL canvases are skipped silently.
window.__pgsCanvasProbe = function (opt) {
  'use strict';
  var o = { dupPx: 14, tapMin: 48, textMin: 12, fillMin: 0.6, overlapFrac: 0.15 };
  if (opt) for (var k in opt) if (Object.prototype.hasOwnProperty.call(opt, k) && opt[k] != null) o[k] = opt[k];
  var out = [];

  function visible(el) {
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        if (n.getAttribute('aria-hidden') === 'true' || n.getAttribute('data-layout') === 'ignore') return false;
      }
      return true;
    } catch (e) { return false; }
  }
  function waiver(el) {
    try {
      var n = el.closest('[data-layout-ok]');
      return n ? (n.getAttribute('data-layout-ok') || 'data-layout-ok') : undefined;
    } catch (e) { return undefined; }
  }
  function selOf(cv, idx) { return 'canvas' + (cv.id ? '#' + cv.id : '[' + idx + ']'); }
  function push(check, detail, cv, idx, box) {
    var is = { check: check, severity: 'SOFT', detail: detail, sel: selOf(cv, idx),
      box: box.map(function (v) { return Math.round(v * 10) / 10; }) };
    var w = waiver(cv);
    if (w) is.waived = w;
    out.push(is);
  }
  function area(b) { return Math.max(0, b[1] - b[0]) * Math.max(0, b[3] - b[2]); } // [x0,x1,y0,y1]
  function inter(a, b) {
    var w = Math.min(a[1], b[1]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[2], b[2]);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function contains(a, b, t) { return a[0] <= b[0] + t && a[1] >= b[1] - t && a[2] <= b[2] + t && a[3] >= b[3] - t; }
  function short(s) { s = String(s); return '"' + (s.length > 24 ? s.slice(0, 23) + '...' : s) + '"'; }

  var canvases = Array.prototype.slice.call(document.getElementsByTagName('canvas'));
  var kinds = window.__pgsCanvasKinds;

  // ---- text checks (from the hook log) ----
  var log = window.__pgsCanvasText || [];
  var byCv = new Map();
  for (var i = 0; i < log.length; i++) {
    var e = log[i], cv = e._cv || canvases[e.cv];
    if (!cv || !cv.isConnected) continue;
    if (!byCv.has(cv)) byCv.set(cv, []);
    byCv.get(cv).push(e);
  }
  byCv.forEach(function (list, cv) {
    if (!visible(cv)) return;
    var r = cv.getBoundingClientRect(), idx = canvases.indexOf(cv);
    var sx = cv.width ? r.width / cv.width : 1, sy = cv.height ? r.height / cv.height : 1;
    // re-project from bitmap coords with the current rect (handles scroll/resize since draw time)
    var boxes = list.map(function (e) {
      var b = e._b;
      return b ? [r.left + b[0] * sx, r.left + b[1] * sx, r.top + b[2] * sy, r.top + b[3] * sy]
               : [e.x0, e.x1, e.y0, e.y1];
    });
    var seen = {};
    for (var a = 0; a < list.length; a++) {
      var A = boxes[a], ta = list[a];
      if (A[0] < r.left - 1 || A[1] > r.right + 1 || A[2] < r.top - 1 || A[3] > r.bottom + 1) {
        var key = 'o|' + ta.text + '|' + Math.round(A[0]) + '|' + Math.round(A[2]);
        if (!seen[key]) {
          seen[key] = 1;
          push('canvas-text-outside', short(ta.text) + ' extends outside its canvas (' +
            Math.round(A[0] - r.left) + ',' + Math.round(A[2] - r.top) + ' to ' + Math.round(A[1] - r.left) + ',' + Math.round(A[3] - r.top) +
            ' in ' + Math.round(r.width) + 'x' + Math.round(r.height) + ')', cv, idx, [A[0], A[2], A[1] - A[0], A[3] - A[2]]);
        }
      }
      for (var b = a + 1; b < list.length; b++) {
        var B = boxes[b], tb = list[b];
        var ov = inter(A, B);
        if (ov <= 0) continue;
        var small = Math.min(area(A), area(B));
        if (!(small > 0) || ov <= o.overlapFrac * small) continue;
        var dx = Math.abs(A[0] - B[0]), dy = Math.abs(A[2] - B[2]);
        var sameText = ta.text === tb.text && ta.text.trim().length > 1;
        // outline/shadow idiom: same text, different style (or stroke+fill) at a tiny offset is not a duplicate
        var idiom = sameText && ((ta.style !== tb.style) || (ta.kind !== tb.kind)) && dx <= 4 && dy <= 4;
        if (idiom) continue;
        var box = [Math.min(A[0], B[0]), Math.min(A[2], B[2]), Math.max(A[1], B[1]) - Math.min(A[0], B[0]), Math.max(A[3], B[3]) - Math.min(A[2], B[2])];
        if (sameText && dx < o.dupPx && dy < o.dupPx * 1.5) {
          push('canvas-dup-label', short(ta.text) + ' drawn twice within ' + Math.round(dx) + 'px x ' + Math.round(dy) + 'px', cv, idx, box);
        } else if (!contains(A, B, 0.5) && !contains(B, A, 0.5)) {
          push('canvas-text-overlap', short(ta.text) + ' overlaps ' + short(tb.text) + ' by ' + Math.round(100 * ov / small) + '% of the smaller', cv, idx, box);
        }
      }
    }
  });

  // ---- pixel check: left or right half blank (2d canvases only) ----
  canvases.forEach(function (cv, idx) {
    try {
      if (!kinds || kinds.get(cv) !== '2d') return;           // webgl / unknown / never drawn: report nothing
      if (!visible(cv)) return;
      var r = cv.getBoundingClientRect();
      if (r.width < 100 || r.height < 60 || cv.width < 50 || cv.height < 30) return;
      var ctx = cv.getContext('2d');
      if (!ctx) return;
      var w = cv.width, h = cv.height, d;
      try { d = ctx.getImageData(0, 0, w, h).data; } catch (err) { return; } // tainted canvas
      var step = Math.max(1, Math.floor(Math.max(w, h) / 400));
      // dominant colour (4 bits per channel) = background
      var hist = {}, best = -1, bestN = 0, total = 0;
      for (var y = 0; y < h; y += step) for (var x = 0; x < w; x += step) {
        var p = (y * w + x) * 4;
        var q = ((d[p] >> 4) << 12) | ((d[p + 1] >> 4) << 8) | ((d[p + 2] >> 4) << 4) | (d[p + 3] >> 4);
        var c = (hist[q] = (hist[q] || 0) + 1);
        if (c > bestN) { bestN = c; best = q; }
        total++;
      }
      var bg = [((best >> 12) & 15) * 17, ((best >> 8) & 15) * 17, ((best >> 4) & 15) * 17, (best & 15) * 17];
      var diff = [0, 0], n = [0, 0], half = w / 2;
      for (y = 0; y < h; y += step) for (x = 0; x < w; x += step) {
        p = (y * w + x) * 4;
        var hs = x < half ? 0 : 1;
        n[hs]++;
        if (Math.abs(d[p] - bg[0]) + Math.abs(d[p + 1] - bg[1]) + Math.abs(d[p + 2] - bg[2]) + Math.abs(d[p + 3] - bg[3]) > 40) diff[hs]++;
      }
      var fl = diff[0] / (n[0] || 1), fr = diff[1] / (n[1] || 1);
      var side = fl < 0.005 ? 'left' : fr < 0.005 ? 'right' : '';
      if (side) {
        push('canvas-empty-half', side + ' half of the canvas is blank (content ' + (fl * 100).toFixed(1) + '% left, ' + (fr * 100).toFixed(1) + '% right)',
          cv, idx, side === 'left' ? [r.left, r.top, r.width / 2, r.height] : [r.left + r.width / 2, r.top, r.width / 2, r.height]);
      }
    } catch (err) { /* never throw out of the probe */ }
  });

  return out;
};
