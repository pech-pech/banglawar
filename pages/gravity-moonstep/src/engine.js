/* Moonstep engine: pure simulation, no DOM, no Date, no Math.random.
   UMD: global `Moonstep`, module.exports in Node. Generation lives in gen.js (MoonGen). */
(function (root, factory) {
  var M = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  root.Moonstep = M;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
  'use strict';

  var C = {
    DT: 1 / 120, RUN: 90, RUNNER_R: 9, VMAX: 520, JUMP_MIN: 200, JUMP_RANGE: 180, CHARGE_MAX: 0.45,
    STICK_VN: 380, REST: 0.35, CHAIN_WIN: 0.08, CHAIN_BONUS: 1.10, OWN_EXTRA: 0.35, OWN_HYST: 1.15,
    TIDE0: 22, TIDE_ACC: 0.2, TIDE_MAX: 60, LOST_T: 1.2, G0_BASE: 900, RANGE_K: 5, SPIN_MAX: 0.6,
    CRUMBLE_T: 1.5, LAND_VT_MAX: 240, VT_DECAY: 200, REPEL_G0: 600, TIDE_START: 260
  };
  var VERSION = 1;

  function getGen() {
    if (root.MoonGen) return root.MoonGen;
    if (typeof require === 'function') {
      try { var g = require('./gen.js'); if (g) return g; } catch (e) { /* ignore */ }
    }
    throw new Error('Moonstep: MoonGen not loaded');
  }

  // ---------- seeding ----------
  function hashSeed(str) {
    str = String(str);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- physics helpers ----------
  function contactR(b) { return b.kind === 'crumble' ? b.rem : b.r; }
  function live(b) { return !b.dead && !(b.kind === 'crumble' && b.rem <= 0); }

  // magnitude of pull of body b at distance d (positive, direction handled by caller)
  function pullMag(b, d) {
    var R = b.R;
    if (d > R) return 0;
    var g0 = b.kind === 'repel' ? (b.g0 || C.REPEL_G0) : b.g0;
    var a = d <= b.r ? g0 : g0 * (b.r / d) * (b.r / d);
    var f0 = 0.75 * R;
    if (d > f0) a *= (R - d) / (R - f0);
    return a;
  }

  // Scratch for accel results (allocation-free)
  var ACC = { ax: 0, ay: 0, owner: -1, inRange: false };

  // Gravity: strongest pull owns (100%), others +35%, hysteresis 1.15x, repel 100% push.
  function accel(bodies, x, y, owner) {
    var n = bodies.length, i, b, dx, dy, d, a;
    var bestId = -1, bestA = 0, ownA = -1, inRange = false;
    for (i = 0; i < n; i++) {
      b = bodies[i];
      if (!live(b) || b.kind === 'repel') continue;
      dx = b.x - x; dy = b.y - y;
      if (dx > b.R || dx < -b.R || dy > b.R || dy < -b.R) continue;
      d = Math.sqrt(dx * dx + dy * dy);
      a = pullMag(b, d);
      if (a <= 0) continue;
      inRange = true;
      if (b.id === owner) ownA = a;
      if (a > bestA) { bestA = a; bestId = b.id; }
    }
    var own = owner;
    if (ownA <= 0) own = bestId;
    else if (bestId !== owner && bestA > C.OWN_HYST * ownA) own = bestId;
    var ax = 0, ay = 0;
    for (i = 0; i < n; i++) {
      b = bodies[i];
      if (!live(b)) continue;
      dx = b.x - x; dy = b.y - y;
      if (dx > b.R || dx < -b.R || dy > b.R || dy < -b.R) continue;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) continue;
      a = pullMag(b, d);
      if (a <= 0) continue;
      if (b.kind === 'repel') { ax -= a * dx / d; ay -= a * dy / d; continue; }
      var k = b.id === own ? 1 : C.OWN_EXTRA;
      ax += k * a * dx / d; ay += k * a * dy / d;
    }
    ACC.ax = ax; ACC.ay = ay; ACC.owner = own; ACC.inRange = inRange;
    return ACC;
  }

  function capSpeed(r) {
    var sp = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
    if (sp > C.VMAX) { var k = C.VMAX / sp; r.vx *= k; r.vy *= k; }
  }

  function findBody(s, id) {
    var bs = s.bodies;
    if (id >= 0 && id < bs.length && bs[id].id === id) return bs[id];
    for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i];
    return null;
  }

  // Place runner on rim and set rim velocity.
  function placeOnRim(r, b) {
    var cr = contactR(b), rr = cr + C.RUNNER_R;
    var c = Math.cos(r.theta), sn = Math.sin(r.theta);
    r.x = b.x + rr * c; r.y = b.y + rr * sn;
    var om = (cr > 1e-6 ? r.dir * r.vt / cr : 0) + (b.spin || 0);
    r.vx = -sn * om * rr; r.vy = c * om * rr;
  }

  // Launch velocity for "release now" with chargeSec. Writes into out {vx,vy}.
  function launchVel(r, b, chargeSec, out) {
    var ch = Math.min(Math.max(chargeSec, 0), C.CHARGE_MAX);
    var v = C.JUMP_MIN + (ch / C.CHARGE_MAX) * C.JUMP_RANGE;
    var chain = r.sinceLand <= C.CHAIN_WIN + 1e-9;
    if (chain) v *= C.CHAIN_BONUS;
    var cr = contactR(b), rr = cr + C.RUNNER_R;
    var c = Math.cos(r.theta), sn = Math.sin(r.theta);
    var om = (cr > 1e-6 ? r.dir * r.vt / cr : 0) + (b.spin || 0);
    out.vx = c * v - sn * om * rr;
    out.vy = sn * v + c * om * rr;
    out.chain = chain;
    return out;
  }

  // ---------- run ----------
  function newRun(seedStr, opts) {
    opts = opts || {};
    var s = {
      v: VERSION, seed: String(seedStr), opts: { tideScale: opts.tideScale != null ? +opts.tideScale : 1 },
      tick: 0, t: 0, over: false, cause: null,
      bodies: [],
      runner: { x: 0, y: -(80 + C.RUNNER_R), vx: 0, vy: 0, mode: 'rim', body: 0, theta: -Math.PI / 2, dir: 1,
        vt: C.RUN, charge: 0, charging: false, cancelled: false, sinceLand: 1, bounced: false, lostT: 0 },
      owner: 0, tideY: C.TIDE_START, height: 0, bestY: 0, jumps: 0, chain: 0, bestChain: 0,
      jumpLog: [], log: [], held: false
    };
    var G = getGen();
    G.init(s, s.seed, s.opts);
    if (!s.bodies.length) {
      var r0 = 80;
      s.bodies.push({ id: 0, x: 0, y: 0, r: r0, g0: C.G0_BASE * Math.sqrt(r0 / 60), R: C.RANGE_K * r0,
        kind: 'still', spin: 0, ang: 0, rem: r0, dead: false, left: false });
    }
    var b0 = findBody(s, 0) || s.bodies[0];
    s.runner.body = b0.id; s.owner = b0.id;
    placeOnRim(s.runner, b0);
    s.bestY = Math.min(0, s.runner.y);
    s.height = Math.max(0, -s.bestY) / 10;
    G.ensure(s);
    return s;
  }

  var LV = { vx: 0, vy: 0, chain: false };

  function doJump(s, b) {
    var r = s.runner;
    var aimed = predictCore(s, r.charge, 900, false).landId;
    launchVel(r, b, r.charge, LV);
    s.jumpLog.push({ tick: s.tick, charge: Math.round(Math.min(r.charge, C.CHARGE_MAX) * 1000) / 1000,
      aimed: aimed, landed: -1, chain: LV.chain });
    if (LV.chain) { s.chain++; if (s.chain > s.bestChain) s.bestChain = s.chain; } else s.chain = 0;
    s.jumps++;
    r.vx = LV.vx; r.vy = LV.vy; capSpeed(r);
    r.mode = 'air'; r.charge = 0; r.charging = false; r.bounced = false;
    s.owner = b.id;
    if (b.kind === 'crumble') b.left = true;
  }

  function land(s, b) {
    var r = s.runner;
    var dx = r.x - b.x, dy = r.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / d, ny = dy / d;
    var cr = contactR(b), rr = cr + C.RUNNER_R;
    // tangential speed relative to rim surface
    var tx = -ny, ty = nx;
    var vtan = r.vx * tx + r.vy * ty - (b.spin || 0) * rr;
    r.mode = 'rim'; r.body = b.id; r.theta = Math.atan2(ny, nx);
    if (vtan > 1e-3) r.dir = 1; else if (vtan < -1e-3) r.dir = -1;
    r.vt = Math.min(Math.abs(vtan), C.LAND_VT_MAX);
    r.sinceLand = 0; r.bounced = false; r.lostT = 0;
    s.owner = b.id;
    if (b.kind === 'crumble') b.left = false;
    placeOnRim(r, b);
    var jl = s.jumpLog.length ? s.jumpLog[s.jumpLog.length - 1] : null;
    if (jl && jl.landed === -1) jl.landed = b.id;
    getGen().ensure(s);
  }

  function endRun(s, cause) { s.over = true; s.cause = cause; }

  function tick(s, inp) {
    if (s.over) return s;
    inp = inp || {};
    var r = s.runner, DT = C.DT, i, b;
    var down = !!inp.down;

    // ---- input edges + log ----
    if (down && !s.held) { s.log.push([s.tick, 1]); r.cancelled = false; }
    var release = !down && s.held;
    if (release) s.log.push([s.tick, 0]);
    s.held = down;
    if (inp.reverse) { s.log.push([s.tick, 2]); r.dir = -r.dir; }
    if (inp.cancel && r.charging) { s.log.push([s.tick, 3]); r.charging = false; r.charge = 0; r.cancelled = true; }

    // ---- body animation + crumble ----
    for (i = 0; i < s.bodies.length; i++) {
      b = s.bodies[i];
      if (b.dead) continue;
      if (b.spin) b.ang += b.spin * DT;
      if (b.kind === 'crumble' && b.left && !(r.mode === 'rim' && r.body === b.id)) {
        b.rem -= (b.r / C.CRUMBLE_T) * DT;
        if (b.rem <= 0) { b.rem = 0; b.dead = true; }
      }
    }

    if (r.mode === 'rim') {
      b = findBody(s, r.body);
      if (!b || !live(b)) {
        r.mode = 'air'; r.charging = false; r.charge = 0;
      } else {
        if (release && r.charging) {
          doJump(s, b);
        } else {
          if (down && !r.cancelled) {
            r.charging = true;
            r.charge = Math.min(r.charge + DT, C.CHARGE_MAX);
          }
          if (r.vt > C.RUN) r.vt = Math.max(C.RUN, r.vt - C.VT_DECAY * DT);
          else if (r.vt < C.RUN) r.vt = Math.min(C.RUN, r.vt + C.VT_DECAY * DT);
          var cr = contactR(b);
          r.theta += ((cr > 1e-6 ? r.dir * r.vt / cr : 0) + (b.spin || 0)) * DT;
          if (r.theta > Math.PI) r.theta -= 2 * Math.PI; else if (r.theta < -Math.PI) r.theta += 2 * Math.PI;
          placeOnRim(r, b);
          s.owner = b.id;
          r.sinceLand += DT;
          r.lostT = 0;
        }
      }
    }

    if (r.mode === 'air') {
      r.charging = false; r.charge = 0;
      r.sinceLand += DT;
      var A = accel(s.bodies, r.x, r.y, s.owner);
      s.owner = A.owner;
      r.vx += A.ax * DT; r.vy += A.ay * DT;
      capSpeed(r);
      r.x += r.vx * DT; r.y += r.vy * DT;
      // lost
      if (A.inRange) r.lostT = 0; else r.lostT += DT;
      // collisions
      for (i = 0; i < s.bodies.length; i++) {
        b = s.bodies[i];
        if (!live(b)) continue;
        var dx = r.x - b.x, dy = r.y - b.y;
        var lim = contactR(b) + C.RUNNER_R;
        if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > lim || d < 1e-6) continue;
        var nx = dx / d, ny = dy / d, vn = r.vx * nx + r.vy * ny; // vn<0 approaching
        if (b.kind === 'repel') {
          r.x = b.x + nx * lim; r.y = b.y + ny * lim;
          if (vn < 0) { r.vx -= (1 + C.REST) * vn * nx; r.vy -= (1 + C.REST) * vn * ny; }
          continue;
        }
        if (vn >= 0) continue;
        if (-vn <= C.STICK_VN || r.bounced) { land(s, b); break; }
        r.x = b.x + nx * lim; r.y = b.y + ny * lim;
        r.vx -= (1 + C.REST) * vn * nx; r.vy -= (1 + C.REST) * vn * ny;
        r.bounced = true;
      }
    }

    // ---- tide ----
    s.t = (s.tick + 1) * DT;
    var rate = Math.min(C.TIDE0 + C.TIDE_ACC * s.t, C.TIDE_MAX) * s.opts.tideScale;
    s.tideY -= rate * DT;

    // ---- height ----
    if (r.y < s.bestY) { s.bestY = r.y; s.height = Math.max(0, -s.bestY) / 10; }

    s.tick++;
    getGen().ensure(s);

    if (r.y + C.RUNNER_R >= s.tideY) endRun(s, 'tide');
    else if (r.mode === 'air' && r.lostT >= C.LOST_T) endRun(s, 'lost');
    return s;
  }

  // ---------- prediction ----------
  var PR = { x: 0, y: 0, vx: 0, vy: 0 };
  function predictCore(s, chargeSec, maxSteps, wantPts, reuse) {
    var r = s.runner, bodies = s.bodies, DT = C.DT, i, b;
    var pts = wantPts ? (reuse ? PTS : []) : null;
    var np = 0;
    if (reuse && wantPts) PTS.length = 0;
    PR.x = r.x; PR.y = r.y;
    var owner = s.owner, bounced = false;
    if (r.mode === 'rim') {
      b = findBody(s, r.body);
      if (b) { launchVel(r, b, chargeSec, LV); PR.vx = LV.vx; PR.vy = LV.vy; owner = b.id; }
      else { PR.vx = r.vx; PR.vy = r.vy; }
    } else { PR.vx = r.vx; PR.vy = r.vy; bounced = r.bounced; }
    var sp = Math.sqrt(PR.vx * PR.vx + PR.vy * PR.vy);
    if (sp > C.VMAX) { PR.vx *= C.VMAX / sp; PR.vy *= C.VMAX / sp; }
    var landId = -1, step = 0;
    for (step = 1; step <= maxSteps; step++) {
      var A = accel(bodies, PR.x, PR.y, owner);
      owner = A.owner;
      PR.vx += A.ax * DT; PR.vy += A.ay * DT;
      sp = PR.vx * PR.vx + PR.vy * PR.vy;
      if (sp > C.VMAX * C.VMAX) { sp = C.VMAX / Math.sqrt(sp); PR.vx *= sp; PR.vy *= sp; }
      PR.x += PR.vx * DT; PR.y += PR.vy * DT;
      var hit = false;
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (!live(b)) continue;
        var dx = PR.x - b.x, dy = PR.y - b.y, lim = contactR(b) + C.RUNNER_R;
        if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > lim || d < 1e-6) continue;
        var nx = dx / d, ny = dy / d, vn = PR.vx * nx + PR.vy * ny;
        if (b.kind === 'repel') {
          PR.x = b.x + nx * lim; PR.y = b.y + ny * lim;
          if (vn < 0) { PR.vx -= (1 + C.REST) * vn * nx; PR.vy -= (1 + C.REST) * vn * ny; }
          continue;
        }
        if (vn >= 0) continue;
        if (-vn <= C.STICK_VN || bounced) { landId = b.id; hit = true; break; }
        PR.x = b.x + nx * lim; PR.y = b.y + ny * lim;
        PR.vx -= (1 + C.REST) * vn * nx; PR.vy -= (1 + C.REST) * vn * ny;
        bounced = true;
      }
      if (wantPts && (step % 4 === 0 || hit)) {
        if (reuse) {
          var po = STORE[np]; if (!po) po = STORE[np] = { x: 0, y: 0 };
          po.x = PR.x; po.y = PR.y; np++; pts.push(po);
        } else pts.push({ x: PR.x, y: PR.y });
      }
      if (hit) break;
    }
    if (reuse) { RES.pts = pts; RES.landId = landId; RES.steps = Math.min(step, maxSteps); return RES; }
    return { pts: pts || [], landId: landId, steps: Math.min(step, maxSteps) };
  }

  var PTS = [], STORE = [], RES = { pts: PTS, landId: -1, steps: 0 };
  // reuse=true: returns a shared result/pts (valid until next reuse call); no per-call allocation.
  function predict(s, chargeSec, maxSteps, reuse) {
    return predictCore(s, chargeSec || 0, maxSteps == null ? 60 : maxSteps, true, !!reuse);
  }

  // Reachability probe used by gen: runner on prevBody (treated still, spin 0) at thetaDeg, release with charge.
  function probe(prevBody, candBody, thetaDeg, charge, maxSteps) {
    var pb = { id: prevBody.id, x: prevBody.x, y: prevBody.y, r: prevBody.r, g0: prevBody.g0, R: prevBody.R,
      kind: 'still', spin: 0, ang: 0, rem: prevBody.r, dead: false, left: false };
    var cb = { id: candBody.id, x: candBody.x, y: candBody.y, r: candBody.r, g0: candBody.g0, R: candBody.R,
      kind: candBody.kind === 'crumble' ? 'still' : candBody.kind, spin: 0, ang: 0, rem: candBody.r, dead: false, left: false };
    var th = thetaDeg * Math.PI / 180;
    var rr = pb.r + C.RUNNER_R;
    var tmp = {
      bodies: [pb, cb], owner: pb.id,
      runner: { x: pb.x + rr * Math.cos(th), y: pb.y + rr * Math.sin(th), vx: 0, vy: 0, mode: 'rim', body: pb.id,
        theta: th, dir: 1, vt: C.RUN, sinceLand: 1, bounced: false }
    };
    var res = predictCore(tmp, charge, maxSteps == null ? 600 : maxSteps, false);
    res.hit = res.landId === cb.id;
    return res;
  }

  // ---------- report / hash / replay ----------
  function hash(s) {
    var r = s.runner;
    return Math.round(s.height * 100) + '|' + s.jumps + '|' + s.tick + '|' + Math.round(r.x) + ',' + Math.round(r.y);
  }
  function logString(log) {
    var out = [];
    for (var i = 0; i < log.length; i++) out.push(log[i][0] + ':' + log[i][1]);
    return out.join(',');
  }
  function parseLog(log) {
    if (Array.isArray(log)) return log.map(function (e) { return Array.isArray(e) ? [e[0] | 0, e[1] | 0] : String(e).split(':').map(Number); });
    if (!log) return [];
    return String(log).split(',').filter(Boolean).map(function (p) { var a = p.split(':'); return [+a[0] | 0, +a[1] | 0]; });
  }
  function report(s, extra) {
    var hit = 0, tot = 0;
    for (var i = 0; i < s.jumpLog.length; i++) {
      var j = s.jumpLog[i];
      if (j.landed === -1) continue;
      tot++; if (j.aimed === j.landed) hit++;
    }
    return { v: VERSION, seed: s.seed, height: Math.floor(s.height), jumps: s.jumps, bestChain: s.bestChain,
      cause: s.cause, ticks: s.tick, seconds: Math.round(s.tick * C.DT * 100) / 100,
      aimedHit: hit, aimedTotal: tot, hash: hash(s), inputLog: logString(s.log), extra: extra == null ? null : extra };
  }
  function replay(seedStr, log, opts, maxTicks) {
    if (maxTicks == null) maxTicks = 240 * 120;
    var ev = parseLog(log).sort(function (a, b) { return a[0] - b[0]; });
    var s = newRun(seedStr, opts), k = 0, held = false;
    var inp = { down: false, reverse: false, cancel: false };
    while (!s.over && s.tick < maxTicks) {
      inp.reverse = false; inp.cancel = false;
      while (k < ev.length && ev[k][0] === s.tick) {
        var c = ev[k][1];
        if (c === 1) held = true; else if (c === 0) held = false;
        else if (c === 2) inp.reverse = true; else if (c === 3) inp.cancel = true;
        k++;
      }
      while (k < ev.length && ev[k][0] < s.tick) k++;
      inp.down = held;
      tick(s, inp);
    }
    return s;
  }

  function medal(h) {
    return h >= 1500 ? 'Moon' : h >= 800 ? 'Gold' : h >= 400 ? 'Silver' : h >= 150 ? 'Bronze' : '';
  }
  function dailySeed(ymd) { return 'D' + String(ymd); }

  return {
    C: C, VERSION: VERSION, hashSeed: hashSeed, rng: rng, newRun: newRun, tick: tick, predict: predict, probe: probe,
    report: report, hash: hash, replay: replay, medal: medal, dailySeed: dailySeed,
    pullMag: pullMag, logString: logString
  };
});
