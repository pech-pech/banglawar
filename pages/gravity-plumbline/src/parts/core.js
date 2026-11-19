const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  const C = (PL.C = { DT: 1 / 120, G: 1500, CAP: 700, DIVE_CAP: 900, DIVE_ADD: 250, DIVE_BOOST_T: 0.3, DIVE_CD: 0.5, CHARGES: 2, HALF: 11, FRIC: 900, DRAG: 0.35, DRAG_AFTER: 0.3, BOUNCE_SIDE: 0.15, BUFFER: 0.08, CRUMBLE_T: 0.35, GATE_V: 120, RESPAWN_T: 0.3, WALL_RIDE_T: 0.25, COYOTE_T: 0.06 });
  const DIRS = (PL.DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]);
  const DT = C.DT, H = C.HALF;
  const CRUMBLE_TICKS = Math.round(C.CRUMBLE_T / DT);
  const DEAD_TICKS = Math.round(C.RESPAWN_T / DT);
  const BUFFER_TICKS = Math.round(C.BUFFER / DT); // 10: pending flip survives age<=10 ticks
  const DIVE_CD_TICKS = Math.round(C.DIVE_CD / DT); // 60
  const DIVE_BOOST_TICKS = Math.round(C.DIVE_BOOST_T / DT); // 36
  const RIDE_TICKS = Math.round(C.WALL_RIDE_T / DT); // 30
  const COYOTE_TICKS = Math.round(C.COYOTE_T / DT); // 7: flip/dive free for 7 ticks after walking off, denied on the 8th
  const EPS = 1e-6;

  PL.newState = function (room) {
    const s = {
      room, t: 0, x: room.start.x, y: room.start.y, vx: 0, vy: 0, g: room.start.g,
      charges: C.CHARGES, grounded: false, airT: 0, diveCd: 0, diveBoost: 0, pending: null,
      crumbleS: (room.crumbles || []).map(() => ({ st: 0, timer: 0 })),
      rideT: 0, rideKey: '', rideUsed: [], coyote: 0,
      dead: 0, won: false, flips: 0, lastLandSpeed: 0, events: [],
    };
    // spawn grounded if the start sits on a surface (no spurious 'land' on tick 1)
    const d = DIRS[s.g];
    s.x += d[0]; s.y += d[1];
    s.grounded = buildSolids(s, 0, 0).some((o) => overlapX(s, o.r) > EPS && overlapY(s, o.r) > EPS);
    s.x -= d[0]; s.y -= d[1];
    return s;
  };

  function crusherRect(c, t) {
    const s = Math.sin(2 * Math.PI * (t * DT) / 2.4 + c.phase) * c.amp;
    return [c.r[0] + c.ax * s, c.r[1] + c.ay * s, c.r[2], c.r[3]];
  }

  // internal solids: {r, cr (crumble index or -1)}
  function buildSolids(s, vx, vy) {
    const room = s.room, out = [];
    for (const r of room.walls) out.push({ r, cr: -1, key: 'w' + out.length });
    (room.crumbles || []).forEach((r, i) => { if (s.crumbleS[i].st !== 2) out.push({ r, cr: i, key: 'c' + i }); });
    (room.gates || []).forEach((g, gi) => {
      if (overlaps(s, g.r)) return; // latch: a gate never turns solid around a bob already inside it
      const dd = DIRS[g.dir];
      if (vx * dd[0] + vy * dd[1] < C.GATE_V) out.push({ r: g.r, cr: -1, gate: true, key: 'g' + gi });
    });
    (room.crushers || []).forEach((c, ci) => out.push({ r: crusherRect(c, s.t), cr: -1, key: 'k' + ci }));
    return out;
  }
  // gate state uses post-gravity velocity, matching PL.step
  PL.solids = function (s) {
    const d = DIRS[s.g];
    return buildSolids(s, s.vx + d[0] * C.G * DT, s.vy + d[1] * C.G * DT).map((o) => o.r);
  };

  function overlapX(s, r) { return Math.min(s.x + H, r[0] + r[2]) - Math.max(s.x - H, r[0]); }
  function overlapY(s, r) { return Math.min(s.y + H, r[1] + r[3]) - Math.max(s.y - H, r[1]); }
  function overlaps(s, r) { return overlapX(s, r) > 0 && overlapY(s, r) > 0; }

  // move one axis (0=x,1=y); returns hit info
  function moveAxis(s, ax, solids, hit) {
    if (ax === 0) s.x += s.vx * DT; else s.y += s.vy * DT;
    for (const o of solids) {
      const r = o.r;
      const ox = overlapX(s, r), oy = overlapY(s, r);
      if (!(ox > EPS && oy > EPS)) continue;
      // resolve on the axis of least penetration only (x pass yields to y when oy<ox, y pass yields when ox<oy)
      if (ax === 0 ? oy < ox : ox < oy) continue;
      const v = ax === 0 ? s.vx : s.vy;
      const c = ax === 0 ? s.x : s.y;
      const lo = ax === 0 ? r[0] : r[1], len = ax === 0 ? r[2] : r[3];
      // push out along the side of minimum penetration (not velocity sign) so moving solids cannot teleport the bob through
      const pPos = (c + H) - lo, pNeg = (lo + len) - (c - H);
      const sign = pPos < pNeg ? 1 : pPos > pNeg ? -1 : (v >= 0 ? 1 : -1);
      const np = sign > 0 ? lo - H : lo + len + H;
      if (ax === 0) s.x = np; else s.y = np;
      const gsign = DIRS[s.g][ax];
      if (gsign === sign) {
        // landing on gravity side
        hit.ground = true;
        hit.speed = Math.max(hit.speed, Math.abs(v));
        if (ax === 0) s.vx = 0; else s.vy = 0;
        if (o.cr >= 0) hit.crumbles.push(o.cr);
      } else if (v !== 0 && Math.sign(v) === sign) {
        if (ax === 0) s.vx = -C.BOUNCE_SIDE * s.vx; else s.vy = -C.BOUNCE_SIDE * s.vy;
      }
    }
  }

  function doFlip(s, dir) {
    s.g = dir; s.flips++; s.events.push('flip'); s.grounded = false; s.coyote = 0;
  }

  function applyInput(s, inp) {
    if (inp.k === 'flip') {
      if (!Number.isInteger(inp.dir) || inp.dir < 0 || inp.dir > 3 || inp.dir === s.g) return;
      if (s.grounded || s.coyote > 0) doFlip(s, inp.dir);
      else if (s.charges > 0) { s.charges--; doFlip(s, inp.dir); }
      else s.pending = { dir: inp.dir, age: 0 }; // age in ticks
    } else if (inp.k === 'dive') {
      if (s.diveCd > 0) return;
      if (!s.grounded && s.coyote <= 0) { if (s.charges <= 0) return; s.charges--; }
      s.coyote = 0;
      const d = DIRS[s.g];
      s.vx += d[0] * C.DIVE_ADD; s.vy += d[1] * C.DIVE_ADD;
      s.diveBoost = DIVE_BOOST_TICKS; s.diveCd = DIVE_CD_TICKS; s.events.push('dive');
    }
  }

  function die(s) { if (!s.dead) { s.dead = DEAD_TICKS; s.events.push('death'); } }

  PL.step = function (s, inputs) {
    s.events.length = 0;
    if (s.won) return;
    if (s.dead > 0) { s.dead--; s.t++; return; }
    if (inputs) for (const i of inputs) applyInput(s, i);

    // timers
    if (s.diveCd > 0) s.diveCd--;
    if (s.diveBoost > 0) s.diveBoost--;
    if (s.coyote > 0) s.coyote--;
    if (s.pending) { s.pending.age++; if (s.pending.age > BUFFER_TICKS) s.pending = null; }

    // forces
    const d = DIRS[s.g];
    s.vx += d[0] * C.G * DT; s.vy += d[1] * C.G * DT;
    if (s.grounded) {
      s.airT = 0;
      if (d[0] === 0) s.vx = fric(s.vx); else s.vy = fric(s.vy);
    } else {
      s.airT += DT;
      if (s.airT > C.DRAG_AFTER) {
        const k = 1 - C.DRAG * DT;
        if (d[0] === 0) s.vx *= k; else s.vy *= k;
      }
    }
    const cap = s.diveBoost > 0 ? C.DIVE_CAP : C.CAP;
    s.vx = Math.max(-cap, Math.min(cap, s.vx));
    s.vy = Math.max(-cap, Math.min(cap, s.vy));

    // move
    const solids = buildSolids(s, s.vx, s.vy);
    const hit = { ground: false, speed: 0, crumbles: [] };
    moveAxis(s, 0, solids, hit);
    moveAxis(s, 1, solids, hit);

    const was = s.grounded;
    s.grounded = hit.ground;
    if (was && !hit.ground) s.coyote = COYOTE_TICKS; // walked off a ledge (flip/dive already cleared grounded earlier)
    if (hit.ground) {
      s.coyote = 0; s.rideT = 0; s.rideKey = '';
      if (!was) {
        s.rideUsed.length = 0;
        s.lastLandSpeed = hit.speed; s.airT = 0; s.events.push('land');
        s.charges = C.CHARGES;
        if (s.pending) { const p = s.pending; s.pending = null; if (p.dir !== s.g) { doFlip(s, p.dir); s.grounded = false; } }
      } else s.charges = C.CHARGES;
    }
    if (!hit.ground) wallRide(s, solids);
    // decrement first, then trigger: a newly triggered crumble keeps the full CRUMBLE_TICKS
    s.crumbleS.forEach((c) => {
      if (c.st === 1 && --c.timer <= 0) { c.st = 2; c.timer = 0; s.events.push('crumble'); }
    });
    if (hit.ground) {
      for (const i of hit.crumbles) if (s.crumbleS[i].st === 0) { s.crumbleS[i].st = 1; s.crumbleS[i].timer = CRUMBLE_TICKS; }
    }

    // crush check against solids at this tick
    const now = buildSolids(s, s.vx, s.vy);
    for (const o of now) {
      if (o.gate) continue; // gates only block entry, never crush
      if (overlaps(s, o.r) && Math.min(overlapX(s, o.r), overlapY(s, o.r)) > 1) { die(s); break; }
    }
    // spikes
    if (!s.dead) {
      const h = H - 3;
      for (const sp of s.room.spikes || []) {
        const r = sp.r;
        if (s.x + h > r[0] && s.x - h < r[0] + r[2] && s.y + h > r[1] && s.y - h < r[1] + r[3]) { die(s); break; }
      }
    }
    if (!s.dead && (s.x < -40 || s.y < -40 || s.x > s.room.w + 40 || s.y > s.room.h + 40)) die(s);
    if (!s.dead) {
      const e = s.room.exit;
      if (Math.hypot(s.x - e.x, s.y - e.y) < 18) { s.won = true; s.events.push('win'); }
    }
    s.t++;
  };

  // continuous contact with a non-gravity-side solid (probe 0.05 px) for RIDE_TICKS refills +1 charge, once per solid per airborne period
  function wallRide(s, solids) {
    let key = '';
    const ox = s.x, oy = s.y;
    for (let k = 0; k < 4 && !key; k++) {
      if (k === s.g) continue;
      s.x = ox + DIRS[k][0] * 0.05; s.y = oy + DIRS[k][1] * 0.05;
      for (const o of solids) {
        if (o.gate) continue;
        const px = overlapX(s, o.r), py = overlapY(s, o.r);
        if (px > EPS && py > EPS && (DIRS[k][0] === 0 ? px : py) > 1) { key = o.key; break; }
      }
    }
    s.x = ox; s.y = oy;
    if (!key) { s.rideT = 0; s.rideKey = ''; return; }
    if (key !== s.rideKey) { s.rideKey = key; s.rideT = 0; }
    s.rideT++;
    if (s.rideT >= RIDE_TICKS && s.rideUsed.indexOf(key) < 0) {
      s.rideUsed.push(key);
      if (s.charges < C.CHARGES) s.charges++;
      s.events.push('ride');
    }
  }

  function fric(v) {
    const a = C.FRIC * DT;
    return Math.abs(v) <= a ? 0 : v - Math.sign(v) * a;
  }

  PL.hash = function (s) {
    const a = [s.x, s.y, s.vx, s.vy, s.g, s.charges, s.t, s.flips, s.dead, s.won ? 1 : 0];
    a.push(s.grounded ? 1 : 0, s.diveCd, s.diveBoost, s.airT, s.pending ? s.pending.dir + ':' + s.pending.age : '-');
    a.push(s.rideT, s.rideKey, s.rideUsed.join('|'), s.coyote);
    for (const c of s.crumbleS) a.push(c.st, c.timer);
    return a.join(',');
  };

  PL.replay = function (room, log) {
    const s = PL.newState(room);
    const end = (log.length ? log[log.length - 1].tick : 0) + 600;
    let i = 0;
    while (s.t < end && !s.won && !s.dead) {
      const inp = [];
      while (i < log.length && log[i].tick <= s.t) { inp.push({ k: log[i].k, dir: log[i].dir }); i++; }
      PL.step(s, inp);
    }
    return { state: s, hash: PL.hash(s) };
  };
})();
