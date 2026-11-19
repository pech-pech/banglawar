/* Wellhand tests.js (maker C): bots + self tests. Adds to global WH. */
(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var WH = root.WH = root.WH || {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ---------- bots ----------
  function nearestCollector(sim, x, y) {
    var best = sim.cols[0], bd = 1e9;
    for (var i = 0; i < sim.cols.length; i++) {
      var d = dist(x, y, sim.cols[i].x, sim.cols[i].y);
      if (d < bd) { bd = d; best = sim.cols[i]; }
    }
    return best;
  }

  // returns pointer target {px,py} or null
  function aim(mode, sim) {
    var core = sim.core, i, b, d, wx, wy, dx, dy, len;
    if (mode === 'skilled') {
      var bad = null, bd = 250;
      for (i = 0; i < sim.bodies.length; i++) {
        b = sim.bodies[i];
        if (b.good) continue;
        d = dist(b.x, b.y, core.x, core.y);
        if (d < bd) { bd = d; bad = b; }
      }
      if (bad) {
        dx = bad.x - core.x; dy = bad.y - core.y; len = Math.sqrt(dx * dx + dy * dy) || 1;
        wx = bad.x + dx / len * 60; wy = bad.y + dy / len * 60;
        return toPtr(sim, wx, wy);
      }
    }
    var tgt = null, td = 1e9;
    for (i = 0; i < sim.bodies.length; i++) {
      b = sim.bodies[i];
      if (!b.good) continue;
      d = dist(b.x, b.y, core.x, core.y);
      if (d < td) { td = d; tgt = b; }
    }
    if (!tgt) return null;
    var c = nearestCollector(sim, tgt.x, tgt.y);
    dx = c.x - tgt.x; dy = c.y - tgt.y; len = Math.sqrt(dx * dx + dy * dy) || 1;
    return toPtr(sim, tgt.x + dx / len * 60, tgt.y + dy / len * 60);
  }

  function toPtr(sim, wx, wy) {
    wx = clamp(wx, 0, sim.W);
    wy = clamp(wy, sim.topbar + 24, sim.H);
    return { px: wx, py: clamp(wy + sim.offset, 0, sim.H) };
  }

  var TAP_PERIOD = 72, TAP_HOLD = 12; // 0.6 s, 0.1 s at 120 Hz

  WH.botEvents = function (mode, sim) {
    if (mode === 'idle') return [];
    var st = sim._bot || (sim._bot = { down: false, pressStep: 0, dx: 0, dy: 0 });
    var ev = [], a;
    if (mode === 'naive') {
      a = aim(mode, sim);
      if (!a) return ev;
      ev.push([st.down ? 'm' : 'd', a.px, a.py]);
      st.down = true;
      return ev;
    }
    // tap / skilled
    if (st.down) {
      if (sim.n - st.pressStep >= TAP_HOLD) { ev.push(['u', st.dx, st.dy]); st.down = false; }
      return ev;
    }
    if (sim.n % TAP_PERIOD === 0) {
      a = aim(mode, sim);
      if (a) {
        ev.push(['d', a.px, a.py]);
        st.down = true; st.pressStep = sim.n; st.dx = a.px; st.dy = a.py;
      }
    }
    return ev;
  };
  WH.bots = { idle: 'idle', naive: 'naive', tap: 'tap', skilled: 'skilled' };

  WH.runBot = function (mode, seed, W, H, maxSteps, P) {
    var sim = WH.createSim(seed, W, H, P), log = [];
    while (!sim.over && sim.n < maxSteps) {
      var evs = WH.botEvents(mode, sim);
      for (var i = 0; i < evs.length; i++) log.push([sim.n, evs[i][0], evs[i][1], evs[i][2]]);
      sim.step(evs);
      sim.ev.length = 0;
    }
    return { report: sim.report(), log: log };
  };

  // ---------- tests ----------
  function mk(seed, W, H, P) {
    var p = { noSpawn: true };
    if (P) for (var k in P) p[k] = P[k];
    return WH.createSim(seed, W, H, p);
  }
  function run(sim, n, evs) { // first step carries evs
    for (var i = 0; i < n; i++) { sim.step(i === 0 ? evs : undefined); }
  }
  function hasEv(sim, kind) {
    for (var i = 0; i < sim.ev.length; i++) if (sim.ev[i].k === kind) return true;
    return false;
  }

  var SIZES = [[344, 882], [475, 638]];
  var botSummary = {};

  var tests = [
    ['T1 determinism', function () {
      var out = [];
      for (var i = 0; i < SIZES.length; i++) {
        var W = SIZES[i][0], H = SIZES[i][1];
        var r = WH.runBot('skilled', 'det' + i, W, H, 3000);
        var s2 = WH.replay('det' + i, W, H, undefined, r.log, r.report.steps);
        var h2 = s2.report().hash;
        out.push(W + 'x' + H + ' ' + r.report.hash + '/' + h2 + ' log=' + r.log.length);
        if (h2 !== r.report.hash) return { ok: false, detail: 'mismatch ' + out.join('; ') };
      }
      return { ok: true, detail: out.join('; ') };
    }],
    ['T2 full hold stalls 3.5-4.2 s', function () {
      var sim = mk('t2', 344, 882), t = -1;
      sim.step([['d', sim.W / 2, sim.H * 0.8]]);
      for (var i = 0; i < 120 * 8 && t < 0; i++) {
        if (hasEv(sim, 'stall') || sim.stall > 0) t = sim.time;
        else sim.step();
        sim.ev.length = 0;
      }
      return { ok: t >= 3.5 && t <= 4.2, detail: 'stall at ' + t.toFixed(3) + ' s' };
    }],
    ['T3 bad body into core', function () {
      var sim = mk('t3', 344, 882), c = sim.core, i0 = sim.integrity;
      sim.addBody({ x: c.x, y: c.y - 130, vx: 0, vy: 100, good: false });
      for (var i = 0; i < 600 && sim.integrity === i0; i++) sim.step();
      return { ok: i0 === 5 && sim.integrity === 4, detail: i0 + ' -> ' + sim.integrity };
    }],
    ['T4 overlap blast near core, clash far', function () {
      var sim = mk('t4a', 344, 882), c = sim.core;
      sim.addBody({ x: c.x + 100, y: c.y, vx: 0, vy: 0, good: false });
      sim.addBody({ x: c.x + 100, y: c.y + 10, vx: 0, vy: 0, good: false });
      run(sim, 5);
      var a = sim.integrity;
      var s2 = mk('t4b', 344, 882);
      s2.addBody({ x: c.x - 100, y: c.y, vx: 0, vy: 0, good: true });
      s2.addBody({ x: c.x - 100, y: c.y - 10, vx: 0, vy: 0, good: false });
      run(s2, 5);
      var b = s2.integrity;
      var s3 = mk('t4c', 344, 882), fx = s3.W / 2, fy = s3.H * 0.82, sc = s3.score;
      s3.addBody({ x: fx, y: fy, vx: 0, vy: 0, good: false });
      s3.addBody({ x: fx + 10, y: fy, vx: 0, vy: 0, good: false });
      run(s3, 5);
      var ok = a === 4 && b === 4 && s3.score - sc === 25 && s3.integrity === 5 && s3.bodies.length === 0;
      return { ok: ok, detail: 'blast ints ' + a + ',' + b + '; far clash dScore=' + (s3.score - sc) + ' integ=' + s3.integrity };
    }],
    ['T5 geometry', function () {
      var minD = 1e9, minY = 1e9, minOff = 1e9, bad = '';
      for (var s = 0; s < SIZES.length; s++) {
        var W = SIZES[s][0], H = SIZES[s][1];
        for (var f = 0; f <= 10; f++) {
          var py = H * 0.65 + (H * 0.35) * f / 10 - (f === 10 ? 1 : 0);
          var sim = mk('t5', W, H);
          minOff = Math.min(minOff, sim.offset);
          sim.step([['d', W * 0.5, py]]);
          if (!sim.well.open) { bad = 'well not open at ' + W + 'x' + H + ' y=' + py; continue; }
          minD = Math.min(minD, dist(sim.well.x, sim.well.y, W * 0.5, py));
          minY = Math.min(minY, sim.well.y - (sim.topbar + 24));
        }
      }
      var ok = !bad && minOff >= 80 && minD >= 56 && minY >= -1e-6;
      return { ok: ok, detail: bad + ' offset>=' + minOff.toFixed(1) + ' minThumbDist=' + minD.toFixed(1) + ' minWellY-slack=' + minY.toFixed(1) };
    }],
    ['T6 merge only with strong well', function () {
      var W = 344, H = 882, px = W * 0.1, py = H * 0.9, bx = W * 0.7, by = H * 0.75;
      function trial(holdSteps) {
        var sim = mk('t6', W, H);
        if (holdSteps > 0) { sim.step([['d', px, py]]); run(sim, holdSteps - 1); }
        sim.addBody({ x: bx, y: by, vx: 0, vy: 0, good: true });
        sim.addBody({ x: bx + 10, y: by, vx: 0, vy: 0, good: true });
        run(sim, 3);
        return sim.bodies.length;
      }
      var none = trial(0), weak = trial(12), strong = trial(144);
      return { ok: none === 2 && weak === 2 && strong === 1, detail: 'bodies after: no well ' + none + ', weak ' + weak + ', strong ' + strong };
    }],
    ['T7 tap heat stays low', function () {
      var sim = mk('t7', 344, 882), maxH = 0, opens = 0, wasOpen = false, x = sim.W / 2, y = sim.H * 0.8;
      for (var k = 0; k < 12; k++) {
        var base = k * 48;
        for (var i = 0; i < 48; i++) {
          var evs;
          if (i === 0) evs = [['d', x, y]]; else if (i === 11) evs = [['u', x, y]]; else evs = undefined;
          sim.step(evs);
          if (sim.well.open && !wasOpen) opens++;
          wasOpen = sim.well.open;
          if (sim.heat > maxH) maxH = sim.heat;
        }
      }
      return { ok: maxH < 60 && opens >= 12, detail: 'maxHeat=' + maxH.toFixed(1) + ' opens=' + opens };
    }],
    ['T8 bot ladder 15 seeds', function () {
      var modes = ['idle', 'naive', 'tap', 'skilled'], i, m;
      for (m = 0; m < modes.length; m++) {
        var waves = [], scores = [];
        for (i = 1; i <= 15; i++) {
          var r = WH.runBot(modes[m], 'bot' + i, 344, 882, 40000).report;
          waves.push(r.wave); scores.push(r.score);
        }
        botSummary[modes[m]] = { medianWave: median(waves), medianScore: median(scores), n: waves.length };
      }
      var b = botSummary;
      var ok = b.idle.medianWave <= b.naive.medianWave && b.naive.medianWave <= b.skilled.medianWave;
      var strict = b.idle.medianWave < b.naive.medianWave && b.naive.medianWave < b.skilled.medianWave;
      var d = modes.map(function (k) { return k + ' w' + b[k].medianWave + ' s' + b[k].medianScore; }).join(', ');
      return { ok: ok, detail: d + (strict ? ' (strict ladder)' : ' (ties present)') };
    }],
    ['T9 skilled bot 475x638 15 seeds', function () {
      var waves = [], scores = [], cap = 0, esc = 0, lost = 0, i;
      for (i = 1; i <= 15; i++) {
        var r = WH.runBot('skilled', 'bot' + i, 475, 638, 40000).report;
        waves.push(r.wave); scores.push(r.score);
        cap += r.stats.captures; esc += r.stats.escapes; lost += r.stats.lost;
      }
      var tot = (cap + esc + lost) || 1;
      var capShare = cap / tot, escShare = esc / tot;
      botSummary.skilled475 = { medianWave: median(waves), medianScore: median(scores), n: waves.length,
        captured: cap, escaped: esc, lost: lost, capturedShare: capShare, escapedShare: escShare };
      return { ok: true, detail: 'median wave ' + median(waves) + ' score ' + median(scores) + '; good bodies captured ' + cap +
        ' (' + (capShare * 100).toFixed(1) + '%) escaped ' + esc + ' (' + (escShare * 100).toFixed(1) + '%) lost-in-core ' + lost };
    }]
  ];

  WH.runTests = function () {
    var results = [], pass = true;
    for (var i = 0; i < tests.length; i++) {
      var r;
      try { r = tests[i][1](); } catch (e) { r = { ok: false, detail: 'threw ' + (e && e.message || e) }; }
      results.push({ name: tests[i][0], ok: !!r.ok, detail: r.detail });
      if (!r.ok) pass = false;
    }
    var out = { pass: pass, results: results, bots: botSummary };
    if (typeof console !== 'undefined') {
      results.forEach(function (x) { console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + ' - ' + x.detail); });
      console.log('WH tests ' + (pass ? 'PASS' : 'FAIL'));
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WH;
})();
