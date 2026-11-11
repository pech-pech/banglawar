(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// B-03 Ram Core (ch1 s20) and B-03V (ch1 s40). Section 03 part 4 + CONTRACT-STEP7 (agent B3).
// A rolling core. Attacks alternate A, B (one shared rotation for the whole group):
//   A roll: lane ribbon tell 0.8 s effective, rolls the lane (stops at cover / wall); gen 0 chains 2 rolls, split bodies 1.
//   B speed roll: ribbon tell 1.0 s effective, fast roll to the wall, then a 1.2 s pause (dazed: the free-shot window).
// Splits (B-03 at 50% and 25% of the summed bar; B-03V at 66% and 33%): every live body splits in two (HP halved, smaller body).
// All bodies are boss bodies (e.boss, immune) sharing one boss bar (summed HP, S.boss); the room clears when all are dead.
// Only one body attacks at a time; after each attack set the whole group is quiet >= 1.0 s (free window).
// Draw data on each body: e.attack ('A'|'B'|null), e.tell01, e.st, e.gen, e.lane {x1,y1,x2,y2,w,kind}, e.kitLanes (BossKit ribbon),
//   e.lines (legacy B-01 floor line = the lane, so the old scene shows something), e.roll01, e.pauseT, e.splitT, e.grp (shared).
// No rng is drawn (deterministic from geometry). Nothing here runs unless a B-03 / B-03V is spawned (stages 1-10 untouched).
V.AI = V.AI || {};
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
var K = V.BossKit || (typeof require === 'function' ? (function(){ try { require('./boss-kit.js'); } catch (err) {} return V.BossKit; })() : null);
var DEG = Math.PI / 180;

// ---- rows (own file, per contract). hp = design base; tells are BASE seconds (x TELL_MULT 0.85 -> 0.8 / 1.0 effective) ----
// HP: section 4 formula base x 0.72 x ch HP x (1 + 0.036 (stage - 1)) with 0.72 x ch HP = 1.0 lands the table targets
//   (7,200 -> 12,125 at s20, 17,309 at s40). The sim's hpScale uses ENEMY_HP_GLOBAL 0.82, so init rescales by 1 / ENEMY_HP_GLOBAL (ai.hpK).
// Damage: table base values (GUESS, no table value given for B-03): roll A 110, speed roll B 130, contact 80 (as B-01); split bodies contact 40 (BAL fix).
// BAL fix (S7): once 2+ bodies are alive nobody drifts toward the hero; only the attacking body moves (its roll).
function row(v){
  return { hp:7200, contact:80, dmg:110, speed:0.7, r:1, size:'large', xp:0, tell:0.941, cd:1.4, boss:true,
    immune:{ instakill:true, freeze:true, knockback:true },
    ai:{ hpK:1.0, intro:2.5, free:1.0, splitAt: v ? [0.66, 0.33] : [0.5, 0.25],
      genR:[1.0, 0.72, 0.52], genSize:['large', 'medium', 'medium'],
      A:{ tell:0.941, speed: v ? 8.5 : 7.0, maxLen:9, rolls:[2, 1, 1], dmg:110, recoil:0.25, cd:1.4 },
      B:{ tell:1.176, speed: v ? 14.5 : 12.0, maxLen:16, dmg:130, pause:1.2, cd:0.6 },
      split:{ t:0.6, gap:0.9 }, keep:3.5, splitContact:40 } };
}
DE['B-03'] = DE['B-03'] || row(false);
DE['B-03V'] = DE['B-03V'] || row(true);

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function rayBody(S, api, x, y, ang, r, max){
  // how far a body of radius r rolls from (x,y) along ang before cover / wall / room edge (E-05 laneLen style)
  var c = Math.cos(ang), s = Math.sin(ang), d = 0, stp = 0.1;
  while (d < max) {
    var n = Math.min(max, d + stp), px = x + c * n, py = y + s * n;
    if (px < r || px > S.room.w - r || py < r || py > S.room.h - r || api.hitsSolidBody(S, px, py, r)) break;
    d = n;
  }
  return d;
}
function stageScale(S){
  var t = S.tune, ss = S.stage || 1;
  if ((S.lap || 1) > 1 && V.Sim && V.Sim.stageList) ss += (S.lap - 1) * V.Sim.stageList(S.chNo, S).length;
  return 1 + (t.HP_SLOPE || 0) * (ss - 1);
}
function bodies(S, grp){
  var out = [], a = S.enemies;
  for (var i = 0; i < a.length; i++) if (a[i].grp === grp && a[i].hp > 0) out.push(a[i]);
  return out;
}
function sumHp(S, grp){ var b = bodies(S, grp), s = 0; for (var i = 0; i < b.length; i++) s += b[i].hp; return s; }
function nextT(grp){ return grp.done < grp.splitAt.length ? Math.round(grp.maxHp * grp.splitAt[grp.done]) : -1; }

var childOf = null;   // set while spawning a split body (init reads it)

function make(type){
  var A = {
    base: DE[type], name: 'Ram Core',

    init: function(S, e, api){
      var b = this.base, P = b.ai, par = childOf;
      e.immune = b.immune; e.knockback = 0; e.name = this.name;
      e.attack = null; e.tell01 = 0; e.lane = null; e.lines = []; e.kitLanes = []; e.kitRings = []; e.roll01 = 0; e.pauseT = 0; e.splitT = 0;
      if (!par) {
        var hp = Math.max(1, Math.round(b.hp * P.hpK * stageScale(S)));
        e.hp = e.maxHp = hp; e.gen = 0; e.boss = true;
        e.bossGroup = 'B03-' + e.id; e.groupMaxHp = hp;   // SIM S7 multi-body bar: same group on every body, fixed max
        e.grp = { type:type, maxHp:hp, splitAt:P.splitAt.slice(), done:0, busy:0, quiet:0, atkIdx:0, pending:false, splits:[], bodiesMax:1 };
        e.afterSpawn = 'intro'; e.introT = Math.max(0, P.intro - S.tune.SPAWN_T);   // attacks start 2.5 s after the room opens; hero keeps control
        e.phase = 1;
        S.boss = { id:e.id, type:type, name:this.name, hp:hp, maxHp:hp, phase:1, attack:null, tell01:0, bodies:1 };
      } else {
        // split body: e.boss is set by the caller AFTER spawnEnemy returns, so the sim does not replace S.boss or toast again
        e.gen = par.gen; e.grp = par.grp; e.bossGroup = par.bossGroup; e.phase = par.phase; e.afterSpawn = 'cool'; e.cd = par.cd;
      }
      this.size(e);
    },
    size: function(e){ var P = this.base.ai, g = Math.min(e.gen, P.genR.length - 1); e.r = P.genR[g]; e.size = P.genSize[g]; e.noContact = e.gen >= 1; },

    // ---- shared boss bar (SIM hook: syncBoss calls V.AI[S.boss.type].syncBar(S, S.boss) when present) ----
    syncBar: function(S, B){
      var e0 = null, grp = null, i, a = S.enemies;
      for (i = 0; i < a.length; i++) if (a[i].id === B.id) { grp = a[i].grp; break; }
      if (!grp) for (i = 0; i < a.length; i++) if (a[i].grp && a[i].grp.type === B.type) { grp = a[i].grp; break; }
      if (!grp) { B.hp = 0; B.attack = null; B.tell01 = 0; B.bodies = 0; return; }
      var bs = bodies(S, grp), s = 0, att = null;
      for (i = 0; i < bs.length; i++) { s += bs[i].hp; if (bs[i].id === grp.busy) att = bs[i]; }
      if (bs.length && !bs.some(function(x){ return x.id === B.id; })) B.id = bs[0].id;   // keep id on a live body
      e0 = att || bs[0];
      B.hp = s; B.maxHp = grp.maxHp; B.phase = grp.done + 1; B.bodies = bs.length;
      B.attack = att ? att.attack : null; B.tell01 = att ? att.tell01 : 0; B.name = this.name;
      B.attackId = att ? att.id : null;
    },

    // clamp damage so the summed bar stops exactly on each split threshold; no damage while a split is pending
    onDamage: function(S, e, dmg, r, api){
      var grp = e.grp; if (!grp) return dmg;
      if (grp.pending) return 0;
      var T = nextT(grp); if (T < 0) return dmg;
      var s = sumHp(S, grp), d = Math.max(1, Math.floor(dmg));
      if (s - d <= T) { grp.pending = true; return Math.max(0, s - T); }
      return dmg;
    },
    onDeath: function(S, e, api){
      var grp = e.grp; if (!grp) return;
      if (grp.busy === e.id) { grp.busy = 0; grp.quiet = Math.max(grp.quiet, this.base.ai.free); }
      var left = bodies(S, grp).filter(function(x){ return x !== e; }).length;
      api.ev(S, { k:'bosspart', x:e.x, y:e.y, id:e.id, type:e.type, left:left, gen:e.gen });
    },

    doSplit: function(S, grp, api){
      var P = this.base.ai, bs = bodies(S, grp), h = api.hero(S), at = grp.splitAt[grp.done];
      grp.done++; grp.pending = false; grp.busy = 0; grp.quiet = Math.max(grp.quiet, P.split.t + P.free);
      var rec = { t:S.t, at:at, sum:sumHp(S, grp), maxHp:grp.maxHp, before:bs.length, after:0 };
      for (var i = 0; i < bs.length; i++) {
        var p = bs[i], hpA = Math.ceil(p.hp / 2), hpB = p.hp - hpA;
        p.gen++; this.size(p); this.stopAttack(p);
        p.hp = p.maxHp = hpA; p.phase = grp.done + 1; p.st = 'split'; p.splitT = P.split.t; p.cd = P.split.t + i * 0.5;
        api.collideBody(S, p, p.r);
        if (hpB > 0) {
          var spot = this.freeSpot(S, api, p, h);
          childOf = p;
          var c = null; try { c = api.spawnEnemy(S, type, spot.x, spot.y); } finally { childOf = null; }
          if (c) {
            c.boss = true; c.hp = c.maxHp = hpB; c.gen = p.gen; this.size(c); c.phase = p.phase;
            c.spawnT = P.split.t; c.cd = p.cd + 0.25; api.collideBody(S, c, c.r);
          }
        }
        api.ev(S, { k:'split', x:p.x, y:p.y, id:p.id, type:type, gen:p.gen });
      }
      rec.after = bodies(S, grp).length; grp.bodiesMax = Math.max(grp.bodiesMax, rec.after);
      rec.sumAfter = sumHp(S, grp); grp.splits.push(rec);
      api.ev(S, { k:'bossphase', x:bs[0].x, y:bs[0].y, id:bs[0].id, phase:grp.done + 1 });
    },
    // pop the new half out sideways (perpendicular to the hero line), on open floor
    freeSpot: function(S, api, p, h){
      var base = Math.atan2(h.y - p.y, h.x - p.x) + Math.PI / 2, gap = this.base.ai.split.gap + p.r, best = null, bl = -1;
      var tries = [0, Math.PI, 0.5, -0.5, Math.PI + 0.5, Math.PI - 0.5, 1.2, -1.2, Math.PI / 2, -Math.PI / 2];
      for (var i = 0; i < tries.length; i++) {
        var a = base + tries[i], L = rayBody(S, api, p.x, p.y, a, p.r, gap);
        if (L >= gap - 1e-6) return { x:p.x + Math.cos(a) * gap, y:p.y + Math.sin(a) * gap };
        if (L > bl) { bl = L; best = { x:p.x + Math.cos(a) * L, y:p.y + Math.sin(a) * L }; }
      }
      return best || { x:p.x, y:p.y };
    },
    // bodies are immovable for the sim's pair pass, so idle bodies push off each other here
    apart: function(S, e, bs){
      for (var i = 0; i < bs.length; i++) { var o = bs[i]; if (o === e) continue;
        var dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = e.r + o.r + 0.05;
        if (d >= m) continue;
        var k = Math.min(0.05, m - d);
        if (d < 1e-6) { dx = e.id < o.id ? -1 : 1; dy = 0; d = 1; }
        e.x += dx / d * k; e.y += dy / d * k; }
    },
    stopAttack: function(e){
      e.attack = null; e.tell01 = 0; e.lane = null; e.lines = []; e.kitLanes = []; e.roll01 = 0; e.rollLeft = 0; e.dashLeft = 0; e.pauseT = 0; e.chain = 0;
    },

    // ---- lane: from the body toward the hero, length to cover / wall; if very short try side angles ----
    planLane: function(S, e, api, kind){
      var P = this.base.ai[kind], h = api.hero(S), a0 = api.angleTo(e, h), best = null;
      var offs = [0, 25, -25, 50, -50, 75, -75, 105, -105, 140, -140, 180];
      for (var i = 0; i < offs.length; i++) {
        var a = a0 + offs[i] * DEG, L = rayBody(S, api, e.x, e.y, a, e.r, P.maxLen);
        if (!best || L > best.L + 1e-9) best = { a:a, L:L };
        if (L >= 2.5) { best = { a:a, L:L }; break; }
      }
      e.aimAng = best.a; e.ang = best.a; e.laneLen = best.L;
      e.lane = { x1:e.x, y1:e.y, x2:e.x + Math.cos(best.a) * best.L, y2:e.y + Math.sin(best.a) * best.L, w:2 * e.r, kind:kind, ang:best.a };
      e.lines = [{ ang:best.a, x1:e.lane.x1, y1:e.lane.y1, x2:e.lane.x2, y2:e.lane.y2 }];
      e.kitLanes = [];
      if (K && K.ribbon) K.ribbon(S, e, api, { x1:e.lane.x1, y1:e.lane.y1, x2:e.lane.x2, y2:e.lane.y2, w:e.lane.w, tell:P.tell, tag:'B-03' + kind });
    },
    startTell: function(S, e, api, kind, first){
      var P = this.base.ai[kind];
      e.attack = kind; e.st = 'tell'; e.tell01 = 0; e.stT = e.tellT = api.tellT(S, P.tell); e.roll01 = 0;
      this.planLane(S, e, api, kind);
      e.tellAt = S.t;
      api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, attack:kind, phase:e.phase, roll:e.chainI || 0, first:!!first,
        x2:e.lane.x2, y2:e.lane.y2, w:e.lane.w });
    },
    startSet: function(S, e, api){
      var grp = e.grp, order = ['A', 'B'], kind = order[grp.atkIdx % 2]; grp.atkIdx++;
      grp.busy = e.id;
      e.chain = kind === 'A' ? this.base.ai.A.rolls[Math.min(e.gen, 2)] : 1; e.chainI = 0;
      this.startTell(S, e, api, kind, true);
    },
    endSet: function(S, e, api){
      var grp = e.grp, P = this.base.ai, kind = e.attack;
      grp.busy = 0; grp.quiet = kind === 'B' ? Math.max(0, P.free - P.B.pause) : P.free;   // B: the 1.2 s pause already is the free window
      e.st = 'cool'; e.cd = (kind === 'B' ? P.B.cd : P.A.cd) + (bodies(S, grp).length - 1) * 0.6;
      this.stopAttack(e);
      api.ev(S, { k:'bossfree', x:e.x, y:e.y, id:e.id, type:e.type, attack:kind });
    },

    roll: function(S, e, dt, api){
      var P = this.base.ai[e.attack], h = api.hero(S);
      var st = Math.min(e.rollLeft, P.speed * dt), wall = false, vx = Math.cos(e.aimAng), vy = Math.sin(e.aimAng);
      var nx = e.x + vx * st, ny = e.y + vy * st, r = e.r;
      if (nx < r || nx > S.room.w - r || ny < r || ny > S.room.h - r || api.hitsSolidBody(S, nx, ny, r)) {
        for (var k = 0; k < 10; k++) { var sx = e.x + vx * st * 0.1, sy = e.y + vy * st * 0.1;
          if (sx < r || sx > S.room.w - r || sy < r || sy > S.room.h - r || api.hitsSolidBody(S, sx, sy, r)) break;
          e.x = sx; e.y = sy; }
        wall = true; e.rollLeft = 0;
      } else { e.x = nx; e.y = ny; e.rollLeft -= st; }
      e.dashLeft = e.rollLeft > 1e-6 && !wall ? e.rollLeft : 0;   // sim charging(): tight contact radius while rolling
      e.roll01 = e.laneLen > 0 ? clamp(1 - e.rollLeft / e.laneLen, 0, 1) : 1;
      e.spin = (e.spin || 0) + st / Math.max(0.2, r);
      if (!e.rollHit && Math.hypot(h.x - e.x, h.y - e.y) < r + h.r) {
        e.rollHit = true;
        api.hurtHero(S, api.enemyDmg(S, P.dmg), e.type, e.x, e.y);
      }
      return wall || e.rollLeft <= 1e-6;
    },

    step: function(S, e, dt, api){
      var A = this, P = A.base.ai, grp = e.grp, h = api.hero(S);
      if (!grp) return;
      if (grp.pending && sumHp(S, grp) <= nextT(grp)) A.doSplit(S, grp, api);
      if (grp.busy && grp.busy !== e.id && !bodies(S, grp).some(function(x){ return x.id === grp.busy; })) grp.busy = 0;
      // the group's quiet clock runs once per frame (ticked by the first live body)
      var bs = bodies(S, grp);
      if (bs.length && bs[0] === e && grp.qFrame !== S.frame) { grp.qFrame = S.frame; if (grp.quiet > 0) grp.quiet = Math.max(0, grp.quiet - dt); }
      if (V.AIU && V.AIU.track) V.AIU.track(S, e, h, dt);
      if (K && K.stepRings) K.stepRings(S, e, dt, api);
      var toH = api.angleTo(e, h), dist = api.dist(e, h);
      if (e.st === 'intro') {
        e.ang = toH; e.introT -= dt;
        if (e.introT <= 0) { e.st = 'cool'; e.cd = 0; }
      } else if (e.st === 'split') {
        e.splitT -= dt; e.ang = toH;
        if (e.splitT <= 0) { e.st = 'cool'; }
      } else if (e.st === 'move' || e.st === 'cool') {
        e.attack = null; e.tell01 = 0; e.ang = toH;
        if (dist > P.keep && bs.length < 2) { api.steerTo(S, e, h.x, h.y, A.base.speed, dt); e.ang = toH; }   // BAL fix: no drift once split
        A.apart(S, e, bs); api.collideBody(S, e, e.r);
        e.cd -= dt;
        if (e.cd <= 0 && !grp.busy && grp.quiet <= 0 && !grp.pending) A.startSet(S, e, api);
      } else if (e.st === 'tell') {
        e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
        if (e.stT <= 0) {
          e.st = 'act'; e.tell01 = 1; e.rollLeft = e.laneLen; e.rollHit = false; e.rollAt = S.t; e.kitLanes = [];
          api.ev(S, { k:'roll', x:e.x, y:e.y, id:e.id, type:e.type, attack:e.attack });
        }
      } else if (e.st === 'act') {
        if (A.roll(S, e, dt, api)) {
          e.dashLeft = 0; e.chainI++;
          api.ev(S, { k:'rollend', x:e.x, y:e.y, id:e.id, type:e.type, attack:e.attack });
          if (e.attack === 'B') { e.st = 'pause'; e.pauseT = P.B.pause; }
          else if (e.chainI < e.chain) { e.st = 'recoil'; e.stT = P.A.recoil; }
          else A.endSet(S, e, api);
        }
      } else if (e.st === 'recoil') {
        e.stT -= dt; e.tell01 = 0;
        if (e.stT <= 0) A.startTell(S, e, api, 'A', false);
      } else if (e.st === 'pause') {
        e.pauseT -= dt; e.tell01 = 0;
        if (e.pauseT <= 0) A.endSet(S, e, api);
      }
      // BAL fix: split bodies (gen >= 1) deal contact P.splitContact (40 base) instead of the row's 80; the sim's own contact check is off for them
      if (e.gen >= 1 && e.hp > 0 && (e.contactCd || 0) <= 0 && e.st !== 'spawn' &&
          Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r + ((e.dashLeft || 0) > 0 ? 0 : 0.12)) {
        if (api.hurtHero(S, api.enemyDmg(S, P.splitContact), e.type, e.x, e.y)) e.contactCd = 1.0;
      }
      if (S.boss && S.boss.type === type) {
        if (grp.busy && bodies(S, grp).some(function(x){ return x.id === grp.busy; })) S.boss.id = grp.busy;   // bar shows the attacker's tell
        A.syncBar(S, S.boss);
      }
    }
  };
  return A;
}
V.AI['B-03'] = make('B-03');
V.AI['B-03V'] = make('B-03V');
})();
