(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Canvas 2D backend for the scene draw list. No shadowBlur, no per-frame filters (L-TD-9).

var cache = new Map();
function css(c) {
  var r = (c[0] * 255) | 0, g = (c[1] * 255) | 0, b = (c[2] * 255) | 0, a = c[3] == null ? 1 : c[3];
  var ai = Math.round(a * 255), key = ((r << 16) | (g << 8) | b) * 256 + ai, s = cache.get(key);
  if (!s) { s = 'rgba(' + r + ',' + g + ',' + b + ',' + (ai / 255).toFixed(3) + ')'; if (cache.size < 4096) cache.set(key, s); }
  return s;
}

V.Render2D = {
  create: function (canvas) {
    var ctx = canvas.getContext('2d', { alpha: false });
    var st = { w: 0, h: 0, dpr: 1 };
    function resize(w, h, dpr) {
      st.w = w; st.h = h; st.dpr = Math.min(dpr || 1, 2);
      var pw = Math.max(1, Math.round(w * st.dpr)), ph = Math.max(1, Math.round(h * st.dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
    }
    function draw(list) {
      var c = ctx, k = st.dpr;
      c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = '#000'; c.fillRect(0, 0, st.w, st.h);
      c.lineCap = 'butt';
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        switch (p.p) {
          case 'circle':
            c.fillStyle = css(p.c); c.beginPath(); c.arc(p.x, p.y, Math.max(0, p.r), 0, 6.283185307); c.fill(); break;
          case 'ring':
            c.strokeStyle = css(p.c); c.lineWidth = p.lw; c.beginPath();
            if (p.a0 != null) c.arc(p.x, p.y, Math.max(0, p.r), p.a0, p.a1); else c.arc(p.x, p.y, Math.max(0, p.r), 0, 6.283185307);
            c.stroke(); break;
          case 'rect':
            c.fillStyle = css(p.c);
            if (p.rot) {
              var cs = Math.cos(p.rot), sn = Math.sin(p.rot);
              c.setTransform(k * cs, k * sn, -k * sn, k * cs, k * p.x, k * p.y);
              c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
              c.setTransform(k, 0, 0, k, 0, 0);
            } else c.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
            break;
          case 'line':
            c.strokeStyle = css(p.c); c.lineWidth = p.lw; c.beginPath(); c.moveTo(p.x1, p.y1); c.lineTo(p.x2, p.y2); c.stroke(); break;
          case 'ngon':
            c.fillStyle = css(p.c); c.beginPath();
            for (var j = 0; j < p.n; j++) {
              var a = p.rot + (j * 6.283185307) / p.n, x = p.x + Math.cos(a) * p.r, y = p.y + Math.sin(a) * p.r;
              if (j) c.lineTo(x, y); else c.moveTo(x, y);
            }
            c.closePath(); c.fill(); break;
        }
      }
    }
    return { name: 'Canvas 2D', canvas: canvas, resize: resize, draw: draw, destroy: function () {} };
  }
};
})();
