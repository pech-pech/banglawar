(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonGen = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var STEP_DEG = 15, CHARGES = [0, 0.1, 0.2, 0.3, 0.45];
  var XLIM = 150, RIM_GAP = 20, AHEAD = 1200, TRIES = 8;

  function M() { return root.Moonstep || (typeof Moonstep !== 'undefined' ? Moonstep : null); }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    var h = 2166136261 >>> 0; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mk(id, x, y, r, kind, spin) {
    return { id: id, x: x, y: y, r: r, g0: 900 * Math.sqrt(r / 60), R: 3.2 * r, kind: kind,
      spin: spin, ang: 0, rem: r, dead: false, left: false };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function reachable(prev, cand) {
    var m = M();
    if (!m || !m.probe) return true;
    for (var c = 0; c < CHARGES.length; c++)
      for (var th = 0; th < 360; th += STEP_DEG) {
        var res = m.probe(prev, cand, th, CHARGES[c]);
        if (res && res.landId === cand.id) return true;
      }
    return false;
  }

  function init(s, seedStr, opts) {
    var m = M();
    var seed = m && m.hashSeed ? m.hashSeed(seedStr) : hashStr(seedStr);
    var rng = m && m.rng ? m.rng(seed) : mulberry32(seed);
    s.gen = { rng: rng, next: 1, top: 0 };
    s.bodies = [mk(0, 0, 0, 80, 'still', 0)];
    for (var i = 0; i < 4; i++) addBody(s);
  }

  function addBody(s) {
    var g = s.gen, rng = g.rng, id = g.next, prev = s.bodies[s.bodies.length - 1];
    var early = id <= 4;
    var m = Math.max(0, -prev.y) / 10;
    var r = early ? 70 + rng() * 20 : 36 + rng() * 54;
    var kroll = rng(), sroll = rng(), sdir = rng() < 0.5 ? -1 : 1;
    var ang = (-90 + (rng() * 2 - 1) * 70) * Math.PI / 180;
    var dist0 = 90 + rng() * 140;
    var pRep = Math.min(0.15, 0.15 * m / 800), pCr = Math.min(0.35, 0.35 * m / 600), pSp = Math.min(0.35, 0.35 * m / 400);
    var kind = 'still', spin = 0;
    if (!early) {
      if (kroll < pRep) kind = 'repel';
      else if (kroll < pRep + pCr) kind = 'crumble';
      else if (kroll < pRep + pCr + pSp) kind = 'spin';
      if (kind === 'spin') spin = sdir * (0.1 + sroll * 0.5);
    }
    var minD = prev.r + r + RIM_GAP, body = null, dist = dist0;
    function place(d) {
      var x = clamp(prev.x + Math.cos(ang) * d, -XLIM, XLIM);
      var dy = -Math.abs(Math.sin(ang) * d);
      var dx = x - prev.x;
      var need = minD, cur = Math.sqrt(dx * dx + dy * dy);
      if (cur < need) { // push up to keep rim gap
        dy = -Math.sqrt(Math.max(0, need * need - dx * dx));
      }
      return mk(id, x, prev.y + dy, r, kind, spin);
    }
    for (var t = 0; t < TRIES; t++) {
      var c = place(Math.max(dist, minD));
      if (early || reachable(prev, c)) { body = c; break; }
      dist *= 0.9;
    }
    if (!body) body = place(Math.max(90, minD));
    s.bodies.push(body);
    g.next++;
    if (body.y < g.top) g.top = body.y;
  }

  function ensure(s) {
    if (!s.gen) return;
    var ry = s.runner ? s.runner.y : 0;
    var best = Math.min(ry, -((s.height || 0) * 10));
    var guard = 0;
    while (s.gen.top - 0 > best - AHEAD && guard++ < 200) addBody(s);
  }

  return { init: init, ensure: ensure };
});
