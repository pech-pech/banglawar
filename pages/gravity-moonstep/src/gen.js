(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonGen = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var STEP_DEG = 15, CHARGES = [0, 0.1, 0.2, 0.3, 0.45];
  var XLIM = 150, RIM_GAP = 20, AHEAD = 1200, TRIES = 8;
  // Variety patterns (admin default, balance slice C 2026-11-19):
  //  rest    = one big still body (r 85-95) every REST_EVERY px of climb: a breather before the next stretch.
  //  cluster = 2 small bodies (r 36-52) in a sideways chain; share ramps 0 -> CL_MAX from CL_FROM m to +300 m.
  //  easy    = below EASY_M bodies pull from EASY_RK*r (not RANGE_K*r) so an early mis-hop is recaptured, not 'lost'.
  //  deep    = from DEEP_FROM m, over DEEP_SPAN m: max r 90 -> 72, gaps +50 px, repel share 15% -> 22%, rests sparser.
  //  long    = one far hop (dist 230-300) onto a big still/spin body; share ramps 0 -> LONG_MAX from LONG_FROM m.
  var EASY_M = 150, EASY_RK = 5, DEEP_FROM = 1000, DEEP_SPAN = 2000, REST_EVERY = 1500, CL_FROM = 80, CL_MAX = 0.14, LONG_FROM = 200, LONG_MAX = 0.10;

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
  function rangeK() { var m = M(); return (m && m.C && m.C.RANGE_K) || 4; }
  function mk(id, x, y, r, kind, spin) {
    return { id: id, x: x, y: y, r: r, g0: kind === 'repel' ? 600 : 900 * Math.sqrt(r / 60), R: rangeK() * r, kind: kind,
      spin: spin, ang: 0, rem: r, dead: false, left: false };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var BUDGET = 60000;
  // bud.left = remaining probe steps for this body; returns false when exhausted.
  function reachable(prev, cand, bud, others) {
    var m = M();
    if (!m || !m.probe) return true;
    for (var c = 0; c < CHARGES.length; c++)
      for (var th = 0; th < 360; th += STEP_DEG) {
        if (bud.left <= 0) return false;
        var res = m.probe(prev, cand, th, CHARGES[c], 600, others);
        bud.left -= res && res.steps ? res.steps : 600;
        if (res && res.landId === cand.id) return true;
      }
    return false;
  }

  function init(s, seedStr, opts) {
    var m = M();
    var seed = m && m.hashSeed ? m.hashSeed(seedStr) : hashStr(seedStr);
    var rng = m && m.rng ? m.rng(seed) : mulberry32(seed);
    s.gen = { rng: rng, next: 1, top: 0, restAt: REST_EVERY, cluster: 0, side: 1 };
    s.bodies = [mk(0, 0, 0, 80, 'still', 0)];
    s.bodies[0].R = EASY_RK * 80;
    for (var i = 0; i < 4; i++) addBody(s);
  }

  function addBody(s) {
    var g = s.gen, rng = g.rng, id = g.next, prev = null;
    for (var q = s.bodies.length - 1; q >= 0; q--) if (s.bodies[q].kind !== 'repel') { prev = s.bodies[q]; break; }
    if (!prev) prev = s.bodies[0];
    var last = s.bodies[s.bodies.length - 1];
    var early = id <= 4;
    var m = Math.max(0, -prev.y) / 10;
    var deep = clamp((m - DEEP_FROM) / DEEP_SPAN, 0, 1);
    var r = early ? 70 + rng() * 20 : 36 + rng() * (54 - 18 * deep);
    var kroll = rng(), sroll = rng(), sdir = rng() < 0.5 ? -1 : 1;
    var aroll = rng();
    // early bodies stay within +-40 deg of straight up; body 1 sits up-right, on the side the runner starts running
    // toward, so a new player never waits a full lap with the tide below (v1 often put body 1 level on the far left).
    var ang = (-90 + (id === 1 ? aroll * 40 : (aroll * 2 - 1) * (early ? 40 : 70))) * Math.PI / 180;
    // gentle start: below EASY_M the centre gap is 90..190 (v1: 90..230), widening linearly to full by 2*EASY_M
    var dist0 = 90 + rng() * (100 + 40 * clamp((m - EASY_M) / EASY_M, 0, 1)) + 50 * deep;
    // pattern draws: always 3 per body so the stream never depends on which pattern fired
    var proll = rng(), p2 = rng(), p3 = rng();
    var pRep = Math.min(0.15, 0.15 * m / 800) + 0.07 * deep, pCr = Math.min(0.35, 0.35 * m / 600), pSp = Math.min(0.35, 0.35 * m / 400);
    var kind = 'still', spin = 0, pat = '';
    if (!early) {
      if (kroll < pRep) kind = 'repel';
      else if (kroll < pRep + pCr) kind = 'crumble';
      else if (kroll < pRep + pCr + pSp) kind = 'spin';
      if (kind === 'spin') spin = sdir * (0.1 + sroll * 0.5);
      var pCl = clamp(CL_MAX * (m - CL_FROM) / 300, 0, CL_MAX), pLong = clamp(LONG_MAX * (m - LONG_FROM) / 400, 0, LONG_MAX);
      if (kind !== 'repel') {
        if (-prev.y >= g.restAt) {
          pat = 'rest'; kind = 'still'; spin = 0; r = 85 + p2 * 10;
          ang = (-90 + (p3 * 2 - 1) * 25) * Math.PI / 180; dist0 = 0; // closest legal spot
          while (g.restAt <= -prev.y) g.restAt += REST_EVERY * (1 + deep);
          g.cluster = 0;
        } else if (g.cluster > 0) {
          pat = 'cluster'; g.cluster--;
        } else if (proll < pCl) {
          pat = 'cluster'; g.cluster = 1;
          g.side = prev.x > 50 ? -1 : prev.x < -50 ? 1 : (p3 < 0.5 ? -1 : 1);
        } else if (proll < pCl + pLong) {
          pat = 'long'; r = 72 + p2 * 18; dist0 = 230 + p3 * 70;
          if (kind === 'crumble') kind = 'still';
        }
        if (pat === 'cluster') {
          r = 36 + p2 * 16;
          if (prev.x * g.side > 90) g.side = -g.side;
          ang = (-90 + g.side * (50 + p3 * 20)) * Math.PI / 180; // mostly sideways, a little up
          dist0 = 0; // tight: rim gap + 20..40
        }
      }
    }
    var minD = prev.r + r + RIM_GAP, body = null;
    if (pat === 'cluster') dist0 = minD + 20 + p2 * 20;
    else if (pat === 'rest') dist0 = minD + 30 + p3 * 30;
    var dist = dist0;
    var angUp = -Math.PI / 2;
    function place(d, a) {
      var x = clamp(prev.x + Math.cos(a) * d, -XLIM, XLIM);
      var dy = -Math.abs(Math.sin(a) * d);
      var dx = x - prev.x;
      var need = minD, cur = Math.sqrt(dx * dx + dy * dy);
      if (cur < need) { // push up to keep rim gap
        dy = -Math.sqrt(Math.max(0, need * need - dx * dx));
      }
      var y = prev.y + dy;
      if (last !== prev) { // keep rim gap from a repel body between anchor and here
        var lx = x - last.x, ly = y - last.y, ln = last.r + r + RIM_GAP;
        if (lx * lx + ly * ly < ln * ln) y = last.y - Math.sqrt(Math.max(0, ln * ln - lx * lx));
      }
      var o = mk(id, x, y, r, kind, spin);
      if (m < EASY_M && kind !== 'repel') o.R = EASY_RK * r;
      if (pat) o.pat = pat;
      return o;
    }
    if (kind === 'repel') {
      body = place(Math.max(dist0, minD), ang); // hazard: rim gap only, no reach check
    } else {
      var bud = { left: BUDGET };
      // repel hazards placed since the anchor body take part in the reach check (they can wall off the route)
      var hz = [];
      for (var q2 = s.bodies.length - 1; q2 >= 0 && s.bodies[q2] !== prev; q2--) if (s.bodies[q2].kind === 'repel') hz.push(s.bodies[q2]);
      for (var t = 0; t < TRIES && bud.left > 0; t++) {
        var a = ang + (angUp - ang) * (t / (TRIES - 1)) * 0.6; // vary angle per try (no rng)
        var c = place(Math.max(dist, minD), a);
        if (early || reachable(prev, c, bud, hz)) { body = c; break; }
        dist = Math.max(minD, dist * 0.9);
      }
      if (!body && hz.length) {
        // detour: go round the hazard on the far side (fresh budget, no rng)
        var h0 = hz[0], away = h0.x >= prev.x ? -1 : 1;
        if (prev.x * away > 100) away = -away;
        var bud2 = { left: BUDGET }, d2 = Math.max(minD, dist0 * 0.8);
        for (var t2 = 0; t2 < TRIES && bud2.left > 0 && !body; t2++) {
          var a2 = (-90 + away * (60 - t2 * 6)) * Math.PI / 180;
          var c2 = place(Math.max(d2, minD), a2);
          if (reachable(prev, c2, bud2, hz)) body = c2;
          d2 = Math.max(minD, d2 * 0.9);
        }
      }
      if (!body && hz.length) {
        // still walled off: retire the hazard (dead => never drawn, never collides; it is still >= ~1000 px off-screen)
        var c3 = place(Math.max(dist0 * 0.8, minD), ang);
        if (reachable(prev, c3, { left: BUDGET }, null)) {
          for (var q3 = 0; q3 < hz.length; q3++) { hz[q3].dead = true; hz[q3].retired = true; }
          body = c3;
        }
      }
      if (!body) body = place(Math.max(90, minD), angUp);
    }
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
