// PGS layout gate: canvas text logger. Plain browser JS, runs as an init script (before page scripts).
// Logs every CanvasRenderingContext2D fillText/strokeText into window.__pgsCanvasText as
//   { text, cv, x0, x1, y0, y1, frame, kind, style }   (x/y in CSS px, viewport coords at draw time)
// cv = index of the canvas in document.getElementsByTagName('canvas') (-1 when detached).
// Non-enumerable extras for the probe: _cv (canvas element), _b ([x0,x1,y0,y1] in canvas bitmap px).
// Bounded: a full-canvas clearRect/fillRect/drawImage, a canvas.width/height set, or ctx.reset()
// drops that canvas's entries; a canvas redrawn in consecutive rAF frames keeps only the last 2 frames;
// identical text+box replaces its entry; hard cap on total entries. Never throws into the page.
(function () {
  'use strict';
  try {
    if (window.__pgsCanvasHookInstalled) return;
    var P = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!P) return;
    window.__pgsCanvasHookInstalled = true;

    var log = (window.__pgsCanvasText = []);
    var kinds = (window.__pgsCanvasKinds = new WeakMap()); // canvas -> '2d' | 'webgl' | 'webgl2' | ...
    var infos = new WeakMap();
    var frame = 0;
    var CAP = 3000, KEEP = 2000;

    function tick() {
      frame++;
      window.__pgsCanvasFrame = frame;
      try { window.requestAnimationFrame(tick); } catch (e) {}
    }
    window.__pgsCanvasFrame = 0;
    try { window.requestAnimationFrame(tick); } catch (e) {}

    function info(cv) {
      var i = infos.get(cv);
      if (!i) { i = { last: -1, prev: -1, rf: -1, rect: null, idx: -1 }; infos.set(cv, i); }
      return i;
    }

    function dropCanvas(cv) {
      try {
        for (var k = log.length - 1; k >= 0; k--) if (log[k]._cv === cv) log.splice(k, 1);
      } catch (e) {}
    }

    function rectOf(cv, inf) {
      if (inf.rf !== frame || !inf.rect) {
        inf.rect = cv.getBoundingClientRect();
        inf.idx = Array.prototype.indexOf.call(document.getElementsByTagName('canvas'), cv);
        inf.rf = frame;
      }
      return inf.rect;
    }

    // ---- text logging ----
    function wrapText(fn, kind) {
      var orig = P[fn];
      if (typeof orig !== 'function') return;
      P[fn] = function (text, x, y, maxWidth) {
        try { record(this, kind, text, +x, +y, maxWidth); } catch (e) {}
        return orig.apply(this, arguments);
      };
      try { Object.defineProperty(P[fn], 'name', { value: fn }); } catch (e) {}
    }

    function record(ctx, kind, text, x, y, maxWidth) {
      var cv = ctx.canvas, s = String(text);
      if (!cv || !cv.getBoundingClientRect || !s.trim() || !isFinite(x) || !isFinite(y)) return;
      var m = ctx.measureText(s), w = m.width;
      var left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
      var asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
      if (!(isFinite(left) && isFinite(right))) {
        var a = ctx.textAlign, rtl = ctx.direction === 'rtl';
        var al = a === 'center' ? w / 2 : (a === 'right' || (a === 'start' && rtl) || (a === 'end' && !rtl)) ? w : 0;
        left = al; right = w - al;
      }
      if (!isFinite(asc) || !isFinite(desc) || asc + desc <= 0) { asc = 10; desc = 2; }
      if (typeof maxWidth === 'number' && maxWidth > 0 && w > maxWidth) {
        var k = maxWidth / w; left *= k; right *= k;
      }
      var bx0 = x - left, bx1 = x + right, by0 = y - asc, by1 = y + desc;
      var t = ctx.getTransform();
      var cs = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]].map(function (p) {
        return [t.a * p[0] + t.c * p[1] + t.e, t.b * p[0] + t.d * p[1] + t.f];
      });
      var xs = cs.map(function (p) { return p[0]; }), ys = cs.map(function (p) { return p[1]; });
      var lx0 = Math.min.apply(null, xs), lx1 = Math.max.apply(null, xs);
      var ly0 = Math.min.apply(null, ys), ly1 = Math.max.apply(null, ys);
      var inf = info(cv), r = rectOf(cv, inf);
      var sx = cv.width ? r.width / cv.width : 1, sy = cv.height ? r.height / cv.height : 1;

      // rolling window: canvas redrawn in consecutive frames and never cleared -> keep last 2 frames
      if (inf.last !== frame) {
        if (inf.last === frame - 1) {
          for (var q = log.length - 1; q >= 0; q--) if (log[q]._cv === cv && log[q].frame < frame - 1) log.splice(q, 1);
        }
        inf.prev = inf.last; inf.last = frame;
      }

      var style = '';
      try { style = String(kind === 'stroke' ? ctx.strokeStyle : ctx.fillStyle); } catch (e) {}
      var e = {
        text: s, cv: inf.idx,
        x0: r.left + lx0 * sx, x1: r.left + lx1 * sx, y0: r.top + ly0 * sy, y1: r.top + ly1 * sy,
        frame: frame, kind: kind, style: style
      };
      Object.defineProperty(e, '_cv', { value: cv, enumerable: false });
      Object.defineProperty(e, '_b', { value: [lx0, lx1, ly0, ly1], enumerable: false });

      // same text at the same box and style replaces the old entry (redraw loops stay bounded)
      for (var j = log.length - 1; j >= 0; j--) {
        var o = log[j];
        if (o._cv === cv && o.text === s && o.kind === kind && o.style === style &&
            Math.abs(o._b[0] - lx0) < 0.5 && Math.abs(o._b[2] - ly0) < 0.5 && o.frame !== frame) { log.splice(j, 1); break; }
      }
      log.push(e);
      if (log.length > CAP) log.splice(0, log.length - KEEP);
    }

    wrapText('fillText', 'fill');
    wrapText('strokeText', 'stroke');

    // ---- clear detection ----
    function covers(ctx, x, y, w, h) {
      var cv = ctx.canvas;
      if (!cv || !cv.width || !cv.height) return false;
      var t = ctx.getTransform();
      var cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(function (p) {
        return [t.a * p[0] + t.c * p[1] + t.e, t.b * p[0] + t.d * p[1] + t.f];
      });
      var xs = cs.map(function (p) { return p[0]; }), ys = cs.map(function (p) { return p[1]; });
      return Math.min.apply(null, xs) <= 1 && Math.min.apply(null, ys) <= 1 &&
             Math.max.apply(null, xs) >= cv.width - 1 && Math.max.apply(null, ys) >= cv.height - 1;
    }
    function wrapClear(fn, needOpaque) {
      var orig = P[fn];
      if (typeof orig !== 'function') return;
      P[fn] = function (x, y, w, h) {
        try {
          if (this.canvas && covers(this, +x, +y, +w, +h) &&
              (!needOpaque || (this.globalAlpha >= 0.9 && this.globalCompositeOperation === 'source-over'))) dropCanvas(this.canvas);
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    }
    wrapClear('clearRect', false);
    wrapClear('fillRect', true);

    var origDraw = P.drawImage;
    if (typeof origDraw === 'function') {
      P.drawImage = function (img) {
        try {
          var a = arguments, cv = this.canvas;
          if (cv && a.length === 3 && covers(this, +a[1], +a[2], img.width || img.videoWidth || img.naturalWidth || 0, img.height || img.videoHeight || img.naturalHeight || 0)) dropCanvas(cv);
          else if (cv && a.length === 5 && covers(this, +a[1], +a[2], +a[3], +a[4])) dropCanvas(cv);
          else if (cv && a.length === 9 && covers(this, +a[5], +a[6], +a[7], +a[8])) dropCanvas(cv);
        } catch (e) {}
        return origDraw.apply(this, arguments);
      };
    }
    if (typeof P.reset === 'function') {
      var origReset = P.reset;
      P.reset = function () { try { dropCanvas(this.canvas); } catch (e) {} return origReset.apply(this, arguments); };
    }

    // canvas.width / height assignment resets the bitmap
    try {
      ['width', 'height'].forEach(function (prop) {
        var d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
        if (!d || !d.set) return;
        Object.defineProperty(HTMLCanvasElement.prototype, prop, {
          configurable: true, enumerable: d.enumerable, get: d.get,
          set: function (v) { try { dropCanvas(this); } catch (e) {} return d.set.call(this, v); }
        });
      });
    } catch (e) {}

    // remember each canvas's context kind so the probe can skip webgl without creating contexts
    try {
      var origGet = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        var c = origGet.apply(this, arguments);
        try { if (c && !kinds.has(this)) kinds.set(this, String(type)); } catch (e) {}
        return c;
      };
    } catch (e) {}
  } catch (e) { /* never throw into the page */ }
})();
