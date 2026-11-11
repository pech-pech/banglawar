(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// P1 SEAMS READY (2026-11-10): V.AI registry (E-01..E-03 in ai-p0.js), V.Sim.api, mod hooks
// (stats/pattern/round/onHit/onKill/tick/onPick), weighted offer from V.MODS (P0 6-card fallback when
// mods.js is absent), stage flow from V.STAGES.ch1 (spawn t), phases play|clear|pick|supply|results,
// S.stageKind/shells/hazards/boss/chest/supply/result/fx.
//
// Mod stats hook: st = {atkAdd, atkMul, rateAdd, rateMul, critAdd, critDmgAdd, hpMaxAdd, dmgTakenMul, moveMul,
//   dodge, volleys}. Additive bonuses go in atkAdd/rateAdd (summed), penalties multiply atkMul/rateMul.
//   Round damage = HERO_ATK x (1+atkAdd) x atkMul x pattern mul; rate = (1+rateAdd) x rateMul.
//   volleys = batches per attack (1 + Multi-volley copies), 0.12 s apart. dodge = chance, capped 0.4.
// Round flags the sim handles: r.pierce (x0.67 per enemy), r.bounceWall (up to 2, x0.5), r.rico (3 jumps, x0.7, 4 tiles).
// Events: fire hit crit kill hurt dodge lock unlock tell door room levelup pick death pickup land supply chest boss bossphase win block.
// Art/VFX fields (LIAISON 2026-11-10, additive, read-only, no rng): fire {vol, weapon}; hit {src, dir, hp, max};
//   kill {size, last}; hurt {hp, max, down}; block {src} (enemy flat round stopped by cover); door {stage, kind}.
// Pure deterministic sim. Fixed step 1/60 s x TIME_SCALE. No DOM, no unseeded randomness, no wall clock.

var STEP = 1 / 60;
var HERO_WALL_R = 0.35, HERO_HURT_R = 0.28;
var LEVEL_COST = [0, 0, 25, 35, 50, 65, 90, 125, 175, 245, 335, 465]; // index = level reached
var LEVEL_CAP = 11;
var SHOT_R = 0.15;
var HERO_GAP = 0.1; // min gap between an enemy body and the Operator hurtbox
var RETARGET_DT = 0.1, LOCK_HYST = 1.0, LOST_LINE_T = 0.25;
var CONTACT_CD = 1.0, MAGNET_SPEED = 14;
var REPAIR_PCT = 0.2, REPAIR_BASE = 0.03, REPAIR_PITY = 0.005, REPAIR_CAP = 0.08, REPAIR_LIFE = 15;
var SUPPLY_REPAIR_PCT = 0.4;
var MULTI_GAP = 0.12;
var RICO_MAX = 3, RICO_MULT = 0.7, RICO_RANGE = 4;
var PIERCE_MULT = 0.67, WALLB_MAX = 2, WALLB_MULT = 0.5;
var HAZARD_DMG = 60, HAZARD_CD = 1.0;
var DODGE_CAP = 0.4;
var CHAPTER_LEN = 10;
V.AI = V.AI || {};

// ---------- P0 fallback mods (used only while parts/mods.js is absent) ----------
var FALLBACK_MODS = [
  { id:'SK-01', key:'front', max:1, pool:['F'], weight:100, name:'Twin Barrel', desc:'+1 forward round. All rounds deal x0.75.',
    hooks:{ stats:function(S, n, st){ st.atkMul *= Math.pow(0.75, n); },
            pattern:function(S, n, list){ list[0].off = -0.15; list.push({ ang:0, off:0.15, mul:1 }); } } },
  { id:'SK-02', key:'multi', max:3, pool:['F'], weight:80, name:'Double Volley', desc:'Fire the volley again 0.12 s later. Damage x0.9, rate x0.85.',
    hooks:{ stats:function(S, n, st){ st.atkMul *= Math.pow(0.9, n); st.rateMul *= Math.pow(0.85, n); st.volleys += n; } } },
  { id:'SK-09', key:'atk', max:0, pool:['F'], weight:100, name:'Power Cell', desc:'Attack +30%.',
    hooks:{ stats:function(S, n, st){ st.atkAdd += 0.3 * n; } } },
  { id:'SK-11', key:'rate', max:0, pool:['F'], weight:100, name:'Fire Control', desc:'Attack speed +25%.',
    hooks:{ stats:function(S, n, st){ st.rateAdd += 0.25 * n; } } },
  { id:'SK-03', key:'diag', max:3, pool:['F'], weight:80, name:'Diagonal Rounds', desc:'+1 pair of rounds at an angle.',
    hooks:{ pattern:function(S, n, list){ var a = [35, 55, 75]; for (var i = 0; i < Math.min(3, n); i++) { list.push({ ang:-a[i] * Math.PI / 180, off:0, mul:1 }); list.push({ ang:a[i] * Math.PI / 180, off:0, mul:1 }); } } } },
  { id:'SK-06', key:'rico', max:1, pool:['F'], weight:70, name:'Arc Ricochet', desc:'Rounds jump to another machine, up to 3 times (x0.7 each).',
    hooks:{ round:function(S, n, r){ r.rico = true; } } }
];
function mods(){ return V.MODS || FALLBACK_MODS; }
if (!V.MODS) V.CARDS = FALLBACK_MODS;

// ---------- fallback stage list (used only while parts/stages.js is absent) ----------
function fallbackStages(){
  var out = [], order = V.ROOM_ORDER || ['R01', 'R02', 'R03'];
  for (var i = 1; i <= CHAPTER_LEN; i++) {
    var room = order[(i - 1) % order.length], R = V.ROOMS[room], sp = [];
    for (var j = 0; j < R.spawns.length; j++) sp.push({ type:R.spawns[j].type, x:R.spawns[j].x, y:R.spawns[j].y, t:0 });
    var kind = 'combat';
    if (i === 5) { kind = 'supply'; sp = []; }
    else if (i === 9) { kind = 'cache'; sp = sp.filter(function(s){ return s.type === 'E-01'; }).slice(0, 2); }
    else if (i === 10 && V.AI['B-01'] && V.ROOMS.BA1) { kind = 'boss'; room = 'BA1'; sp = [{ type:'B-01', x:4.5, y:3.5, t:0 }]; } // template coords (9 columns); loadStage widens
    out.push({ stage:i, kind:kind, room:room, spawns:sp, note:'fallback' });
  }
  return out;
}
// F1 (S): ?debug=1&room=stress test room for the effect scaler (agent V): opts.room === 'stress' loads V.Data.stages.stress (one room,
// 11 machines alive at once, the Chapter 1 peak). In that room machines have STRESS_HP x HP so they stay alive under fire and the Operator takes no damage.
var STRESS_HP = 1000;   // GUESS: large enough that no build kills a machine within a test session
function isStress(S){ return !!(S && S.metaOpts && S.metaOpts.room === 'stress' && V.Data && V.Data.stages && V.Data.stages.stress); }
function listOf(S){ return isStress(S) ? V.Data.stages.stress : stageList(); }
function stageList(){ return (V.STAGES && V.STAGES.ch1 && V.STAGES.ch1.length) ? V.STAGES.ch1 : fallbackStages(); }

function count(S, key){ return S.hero.mods[key] || 0; }
function scaleStage(S){ return S.stage + (S.lap - 1) * CHAPTER_LEN; }
function hpScale(S){ var t = S.tune; return t.ENEMY_HP_GLOBAL * (1 + t.HP_SLOPE * (scaleStage(S) - 1)); }
function enemyDmg(S, base){
  var t = S.tune;
  return Math.max(1, Math.floor(base * t.ENEMY_DMG_MULT * (1 + t.DMG_SLOPE * (scaleStage(S) - 1))));
}
function ev(S, o){ S.events.push(o); return o; }
// F0 #7: machine and boss base rows live in parts/data-enemies.js (V.Data.enemies). Each behaviour's .base is bound to its
// table row at every create (the AI parts load after this one, so binding at load is too early). Node loaders that skip the data part get it here.
if (!(V.Data && V.Data.enemies) && typeof require === 'function' && typeof module !== 'undefined') { try { require('./data-enemies.js'); } catch (e) {} }
function bindData(){ var T = V.Data && V.Data.enemies; if (!T) return; for (var k in T) if (V.AI[k] && V.AI[k].base !== T[k]) V.AI[k].base = T[k]; }
// Stepped rooms (pick 43 / R42): parts/widen.js builds the C-column room. Node loaders that skip it get it here.
if (!V.Widen && typeof require === 'function' && typeof module !== 'undefined') { try { require('./widen.js'); } catch (e) {} }
function base(e){ var A = V.AI[e.type]; return A ? A.base : { hp:100, contact:40, dmg:40, speed:0, r:0.4, size:'medium', xp:8 }; }

// ---------- mod hooks ----------
function eachMod(S, fn){
  var M = mods(), h = S.hero.mods;
  for (var i = 0; i < M.length; i++) { var n = h[M[i].key] || 0; if (n > 0 && M[i].hooks) fn(M[i], n); }
}
function callHook(S, name){
  var a = Array.prototype.slice.call(arguments, 2);
  eachMod(S, function(m, n){ var f = m.hooks[name]; if (f) f.apply(null, [S, n].concat(a)); });
}
function heroStats(S){
  var st = { atkAdd:0, atkMul:1, primaryMul:1, rateAdd:0, rateMul:1, critAdd:0, critDmgAdd:0, hpMaxAdd:0, dmgTakenMul:1, moveMul:1, dodge:0, volleys:1 };
  if (S.meta) { st.hpMaxAdd += S.meta.hpAdd || 0; st.atkMul *= S.meta.atkMul == null ? 1 : S.meta.atkMul; st.rateMul *= S.meta.rateMul == null ? 1 : S.meta.rateMul; st.moveMul *= S.meta.moveMul == null ? 1 : S.meta.moveMul; st.dmgTakenMul *= S.meta.dmgTakenMul == null ? 1 : S.meta.dmgTakenMul; } // META: run-start stats
  callHook(S, 'stats', st);
  if (S.deploy && V.Mods && V.Mods.Deploy) V.Mods.Deploy.applyStats(S, st);   // G: Deploy boost stats
  if (V.MODS) st.volleys = Math.max(st.volleys, 1 + count(S, 'multi')); // SK-02 echo batches (mods.js leaves them to the sim)
  return st;
}
function refreshStats(S){
  var h = S.hero, st = heroStats(S), t = S.tune;
  S.st = st;
  var newMax = Math.max(1, Math.round(t.HERO_HP + st.hpMaxAdd));
  if (newMax !== h.maxHp) {
    var d = newMax - h.maxHp; h.maxHp = newMax;
    if (!V.MODS) h.hp += Math.max(0, d); // fallback: armor heals the gain; mods.js heals in onPick itself
    h.hp = Math.max(1, Math.min(newMax, h.hp));
  }
  h.atk = roundDamage(S, 1);
}

// ---------- geometry ----------
function circleRectPush(cx, cy, r, b){
  var nx = cx < b.x ? b.x : (cx > b.x + b.w ? b.x + b.w : cx);
  var ny = cy < b.y ? b.y : (cy > b.y + b.h ? b.y + b.h : cy);
  var dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) { var d = Math.sqrt(d2), k = (r - d) / d; return [dx * k, dy * k]; }
  var l = cx - b.x + r, rr = b.x + b.w - cx + r, u = cy - b.y + r, dn = b.y + b.h - cy + r;
  var m = Math.min(l, rr, u, dn);
  if (m === l) return [-l, 0]; if (m === rr) return [rr, 0]; if (m === u) return [0, -u]; return [0, dn];
}
function circleRect(cx, cy, r, b){
  var nx = cx < b.x ? b.x : (cx > b.x + b.w ? b.x + b.w : cx);
  var ny = cy < b.y ? b.y : (cy > b.y + b.h ? b.y + b.h : cy);
  var dx = cx - nx, dy = cy - ny; return dx * dx + dy * dy < r * r;
}
function segRect(x1, y1, x2, y2, b, pad){
  var minx = b.x - pad, maxx = b.x + b.w + pad, miny = b.y - pad, maxy = b.y + b.h + pad;
  var dx = x2 - x1, dy = y2 - y1, t0 = 0, t1 = 1, p, q, i, r;
  var P = [-dx, dx, -dy, dy], Q = [x1 - minx, maxx - x1, y1 - miny, maxy - y1];
  for (i = 0; i < 4; i++) {
    p = P[i]; q = Q[i];
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; }
    else { r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}
function blockers(S){
  var a = S.room.solids;
  if (!S.room.door.open) return a.concat([S.room.door]);
  return a;
}
function clearLine(S, x1, y1, x2, y2, pad){
  var a = blockers(S);
  for (var i = 0; i < a.length; i++) if (segRect(x1, y1, x2, y2, a[i], pad || 0)) return false;
  return true;
}
function hitsSolid(S, x, y, r){
  var a = blockers(S);
  for (var i = 0; i < a.length; i++) if (circleRect(x, y, r, a[i])) return a[i];
  return null;
}
function outOfRoom(S, x, y, r){ return x < -r || x > S.room.w + r || y < -r || y > S.room.h + r; }
function collideBody(S, o, r){
  var a = blockers(S), i, p;
  for (var it = 0; it < 2; it++) {
    for (i = 0; i < a.length; i++) { p = circleRectPush(o.x, o.y, r, a[i]); if (p) { o.x += p[0]; o.y += p[1]; } }
  }
  if (o.x < r) o.x = r; if (o.x > S.room.w - r) o.x = S.room.w - r;
  if (o.y < r) o.y = r; if (o.y > S.room.h - r) o.y = S.room.h - r;
}

// ---------- room build ----------
function buildRects(grid, ch, kindFn){
  var rows = grid.length, cols = grid[0].length, runs = [], y, x, s;
  for (y = 0; y < rows; y++) {
    x = 0;
    while (x < cols) {
      if (grid[y][x] === ch) { s = x; while (x < cols && grid[y][x] === ch) x++; runs.push({ x:s, y:y, w:x - s, h:1, kind:kindFn(y) }); }
      else x++;
    }
  }
  var out = [];
  for (var i = 0; i < runs.length; i++) {
    var r = runs[i], merged = false;
    for (var j = 0; j < out.length; j++) {
      var o = out[j];
      if (o.x === r.x && o.w === r.w && o.kind === r.kind && o.y + o.h === r.y) { o.h++; merged = true; break; }
    }
    if (!merged) out.push({ x:r.x, y:r.y, w:r.w, h:r.h, kind:r.kind });
  }
  return out;
}
function findChar(grid, ch){
  for (var y = 0; y < grid.length; y++) { var x = grid[y].indexOf(ch); if (x >= 0) return { x:x, y:y }; }
  return null;
}

function spawnEnemy(S, type, x, y){
  var A = V.AI[type];
  if (!A) { ev(S, { k:'error', x:x, y:y, msg:'no AI for ' + type }); return null; }
  var b = A.base, hp = Math.max(1, Math.round(b.hp * hpScale(S) * (S.stress ? STRESS_HP : 1)));
  var e = { id: ++S._nextId, type:type, x:x, y:y, r:b.r, hp:hp, maxHp:hp, ang:Math.PI / 2, st:'spawn',
    tell01:0, aimAng:Math.PI / 2, flashT:0, size:b.size,
    spawnT:S.tune.SPAWN_T, stT:0, cd:0, contactCd:0, vx:0, vy:0, strafe:1, afterSpawn:'move' };
  if (A.init) A.init(S, e, api);
  S.enemies.push(e);
  if (S.stats.seen) S.stats.seen[type] = true;
  if (e.boss) {
    S.boss = { id:e.id, type:type, name:e.name || type, hp:e.hp, maxHp:e.maxHp, phase:e.phase || 1, attack:e.attack || null, tell01:0 };
    ev(S, { k:'boss', x:e.x, y:e.y, id:e.id, type:type, name:S.boss.name });
  }
  return e;
}

// Column class for the next room (R42: C is read at each room entry only). opts.colsFn() wins over opts.cols; default 9.
function roomCols(S){
  var o = S.metaOpts, c = 9;
  if (o && typeof o.colsFn === 'function') { try { c = o.colsFn(); } catch (e) { c = 9; } }
  else if (o && o.cols != null) c = o.cols;
  return V.Widen ? V.Widen.cols(c) : 9;
}
function loadStage(S, idx){
  var list = listOf(S), def = list[idx];
  S.stress = isStress(S);
  S.stageIdx = idx; S.stage = idx + 1; S.stageDef = def;
  S.stageKind = (def.kind === 'supply' && V.Catch) ? 'collect' : (def.kind || 'combat');   // K: the catch room (parts/catch.js) replaces the supply room; without catch.js the old supply room stays
  var R = V.ROOMS[def.room] || V.ROOMS.R01, C = roomCols(S);
  var WR = V.Widen ? V.Widen.room(R, C) : { grid:R.grid, w:R.grid[0].length, k:0 }, grid = WR.grid;
  S.cols = grid[0].length;
  var mid = Math.floor(S.cols / 2), d = findChar(grid, 'D') || { x:mid, y:0 }, sp = findChar(grid, 'S') || { x:mid, y:grid.length - 1 };
  S.roomId = V.ROOMS[def.room] ? def.room : 'R01';
  S.room = { w:grid[0].length, h:grid.length, name:R.name, cols:S.cols, k:WR.k || 0, grid:grid, fill:WR.fill || [],
    solids:buildRects(grid, '#', function(y){ return y === 0 ? 'wall' : (R.cover || 'pillar'); }),
    door:{ x:d.x, y:d.y, w:1, h:1, open:false } };
  S.hazards = buildRects(grid, '^', function(){ return 'spikes'; });
  S.enemies = []; S.rounds = []; S.shots = []; S.shells = []; S.pickups = [];
  S.boss = null; S.supply = null; S.chest = null; S.cards = null; S.mini = null;   // review fix 1: the catch room state must not outlive stage 5
  var c = findChar(grid, 'C');
  if (S.stageKind === 'cache') S.chest = { x:(c ? c.x : mid) + 0.5, y:(c ? c.y : 4) + 0.5, open:false };
  var h = S.hero;
  h.x = sp.x + 0.5; h.y = sp.y + 0.5; h.ang = -Math.PI / 2;
  h.lockId = null; h.lockClear = false; h.lostT = 0; h.retargetT = 0; h.burstQ = []; h.delayQ = [];
  S.roomT = 0; S.clearT = 0; S.hazardCd = 0;
  var spl = V.Widen && S.cols !== 9 ? V.Widen.spawns(def.spawns || [], S.cols, R) : (def.spawns || []); // template coords -> C columns
  S.spawnQ = spl.map(function(s){ return { type:s.type, x:s.x, y:s.y, t:s.t || 0 }; });
  S.spawnQ.sort(function(a, b){ return a.t - b.t; });
  ev(S, { k:'room', x:h.x, y:h.y, roomId:S.roomId, stage:S.stage, kind:S.stageKind, lap:S.lap });
  if (S.stageKind === 'collect') {   // K: Supply Drop catch room (SPEC, R50-R54). All logic in parts/catch.js; S.mini holds the state; S.rng is not touched (fight stages stay bit-identical)
    S.room.solids = S.room.solids.filter(function(b){ return b.kind === 'wall'; });
    V.Catch.start(S, new V.Rng(((S.seed >>> 0) ^ Math.imul(scaleStage(S) + 1, 2654435761)) >>> 0));
    if (S.mini.taken) { S.supply = null; openDoor(S); }   // Settings "Skip" from the 4th play: default pad granted at once
  } else if (S.stageKind === 'supply') {
    S.phase = 'supply';
    var sd = offer(S, 'SD', 1);
    if (!sd.length) sd = offer(S, 'F', 1);
    S.supply = sd.length ? [{ kind:'mod', index:sd[0] }, { kind:'repair' }] : [{ kind:'repair' }];
    ev(S, { k:'supply', x:h.x, y:h.y });
  } else {
    S.phase = 'play';
    releaseSpawns(S);
  }
}
function releaseSpawns(S){
  while (S.spawnQ.length && S.spawnQ[0].t <= S.roomT + 1e-9) { var s = S.spawnQ.shift(); spawnEnemy(S, s.type, s.x, s.y); }
}

// ---------- create ----------
// opts.metaStats: object = use these meta stats (bot test of a powered hero, no V.Meta needed); null/false = neutral even if V.Meta exists.
// Without opts, stats come from V.Meta.stats() when V.Meta is loaded (the browser game); bot.js never loads meta.js so it stays neutral.
function create(seed, tune, opts){
  bindData();
  tune = tune || V.TUNE;
  seed = (seed >>> 0);
  var S = { seed:seed, frame:0, t:0, tune:tune, phase:'play', stage:1, stageIdx:0, stageKind:'combat', roomId:null, lap:1,
    room:null,
    // hero x/y are placeholders: loadStage puts the Operator on the room's start tile (centre column of row 14)
    hero:{ x:4.5, y:14.5, r:HERO_HURT_R, hp:tune.HERO_HP, maxHp:tune.HERO_HP, atk:tune.HERO_ATK, ang:-Math.PI / 2,
      moving:false, braced:false, brace01:0, fireCd:0, invulnT:0, lockId:null, lockClear:false,
      level:1, xp:0, xpNext:LEVEL_COST[2], mods:{}, braceT:0, lostT:0, retargetT:0, burstQ:[], delayQ:[] },
    enemies:[], rounds:[], shots:[], shells:[], hazards:[], pickups:[], cards:null, events:[], fx:[],
    boss:null, chest:null, supply:null, result:null, spawnQ:[],
    stats:{ kills:0, dmgTaken:0, hitsBy:{ 'E-01':0, 'E-02':0, 'E-03':0 }, roomTimes:[], bracedSteps:0, playSteps:0, shots:0, picks:[],
      roomHp:[], killLog:[], bossTime:null },
    rng:new V.Rng(seed), _nextId:0, pendingLevels:0, freePicks:0, pity:0, roomT:0, clearT:0, hazardCd:0, st:null };
  S.metaOpts = opts || null; S.useMeta = false; S.meta = null;
  if (opts && opts.metaStats) S.meta = opts.metaStats;
  else if (!(opts && opts.metaStats === null) && V.Meta && V.Meta.stats) { S.meta = V.Meta.stats(); S.useMeta = true; }
  S.credits = 0; S.stats.seen = {};
  refreshStats(S);
  if (S.meta) S.hero.hp = S.hero.maxHp; // start at full HP with the Conditioning bonus
  loadStage(S, 0);
  return S;
}

// ---------- hero weapon ----------
function roundDamage(S, mul){
  var st = S.st || heroStats(S);
  return Math.max(1, Math.floor(S.tune.HERO_ATK * (1 + st.atkAdd) * st.atkMul * st.primaryMul * (mul == null ? 1 : mul)));
}
function fireInterval(S){
  var t = S.tune, st = S.st || heroStats(S);
  var vps = (1 / t.FIRE_INTERVAL) * Math.max(0.01, (1 + st.rateAdd) * st.rateMul);
  return Math.max(t.FIRE_FLOOR, 1 / vps);
}
function spawnRound(S, x, y, ang, dmg){
  var t = S.tune, st = S.st, crit = S.rng.next() < Math.min(1, t.CRIT_CHANCE + st.critAdd);
  var r = { x:x, y:y, vx:Math.cos(ang) * t.ROUND_SPEED, vy:Math.sin(ang) * t.ROUND_SPEED, r:t.ROUND_R,
    dmg: crit ? Math.floor(dmg * (t.CRIT_MULT + st.critDmgAdd)) : dmg, crit:crit, bounces:0, wallBounces:0, hit:[] };
  callHook(S, 'round', r);
  S.rounds.push(r);
  S.stats.shots++;
  return r;
}
function fireBatch(S){
  var vol = S.stats.shots || 0; // volley id = rounds fired before this batch (monotonic, deterministic)
  var h = S.hero, a = h.ang, list = [{ ang:0, off:0, mul:1 }];
  callHook(S, 'pattern', list);
  var px = -Math.sin(a), py = Math.cos(a);
  var mx = h.x + Math.cos(a) * 0.3, my = h.y + Math.sin(a) * 0.3;
  for (var i = 0; i < list.length; i++) {
    var p = list[i], off = p.off || 0;
    if (p.delay > 0) { h.delayQ.push({ t:p.delay, ang:p.ang || 0, off:off, mul:p.mul == null ? 1 : p.mul }); continue; }
    spawnRound(S, mx + px * off, my + py * off, a + (p.ang || 0), roundDamage(S, p.mul == null ? 1 : p.mul));
  }
  ev(S, { k:'fire', x:mx, y:my, ang:a, n:list.length, vol:vol, weapon:'rifle' });
}

function findEnemy(S, id){ for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id) return S.enemies[i]; return null; }
function targetable(e){ return e.st !== 'spawn' && e.hp > 0 && !e.hidden; }

function updateLock(S, dt){
  var h = S.hero, t = S.tune;
  var cur = h.lockId != null ? findEnemy(S, h.lockId) : null;
  if (cur && !targetable(cur)) cur = null;
  h.retargetT -= dt;
  if (cur && h.retargetT > 0) return;
  h.retargetT = RETARGET_DT;
  var best = null, bestD = 1e9, near = null, nearD = 1e9, curD = 1e9, curClear = false;
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i]; if (!targetable(e)) continue;
    var d = Math.hypot(e.x - h.x, e.y - h.y);
    var c = clearLine(S, h.x, h.y, e.x, e.y, t.ROUND_R);
    if (d < nearD) { nearD = d; near = e; }
    if (c && d < bestD) { bestD = d; best = e; }
    if (cur && e === cur) { curD = d; curClear = c; }
  }
  var next = cur;
  if (!cur) next = best || near;
  else if (curClear) { h.lostT = 0; if (best && best !== cur && bestD < curD - LOCK_HYST) next = best; }
  else { h.lostT += RETARGET_DT; if (best && h.lostT > LOST_LINE_T) next = best; }
  if (next !== cur) h.lostT = 0;
  var newId = next ? next.id : null;
  if (newId !== h.lockId) {
    if (newId != null) ev(S, { k:'lock', x:next.x, y:next.y, id:newId });
    else if (h.lockId != null) ev(S, { k:'unlock', x:h.x, y:h.y, id:h.lockId });
  }
  h.lockId = newId;
  h.lockClear = next ? (next === cur ? curClear : next === best) : false;
}

// ---------- hero ----------
function stepHero(S, inp, dt){
  var h = S.hero, t = S.tune;
  var mx = inp && +inp.mx || 0, my = inp && +inp.my || 0, len = Math.hypot(mx, my);
  if (h.invulnT > 0) h.invulnT = Math.max(0, h.invulnT - dt);
  if (h.fireCd > 0) h.fireCd = Math.max(0, h.fireCd - dt);
  if (len > 1e-6) {
    mx /= len; my /= len;
    var sp = t.MOVE_SPEED * S.st.moveMul * (S.phase === 'clear' && inp.walk > 1 ? inp.walk : 1);   // pick 45: auto-walk to the door runs faster (inp.walk, set by main.js only)
    h.x += mx * sp * dt; h.y += my * sp * dt;
    collideBody(S, h, HERO_WALL_R);
    h.ang = Math.atan2(my, mx);
    if (!h.moving && h.lockId != null) ev(S, { k:'unlock', x:h.x, y:h.y, id:h.lockId });
    h.moving = true; h.braced = false; h.braceT = 0; h.brace01 = 0;
    h.lockId = null; h.lockClear = false; h.lostT = 0; h.retargetT = 0; h.burstQ.length = 0; h.delayQ.length = 0;
    return;
  }
  h.moving = false;
  h.braceT += dt;
  h.brace01 = t.BRACE_DELAY > 0 ? Math.min(1, h.braceT / t.BRACE_DELAY) : 1;
  h.braced = h.braceT >= t.BRACE_DELAY - 1e-9;
  if (S.phase !== 'play') { if (h.lockId != null) { h.lockId = null; h.lockClear = false; } return; }
  updateLock(S, dt);
  var tg = h.lockId != null ? findEnemy(S, h.lockId) : null;
  if (tg) h.ang = Math.atan2(tg.y - h.y, tg.x - h.x);
  for (var di = 0; di < h.delayQ.length; di++) {
    var q = h.delayQ[di]; q.t -= dt;
    if (q.t <= 0) {
      var a0 = h.ang, qx = h.x + Math.cos(a0) * 0.3, qy = h.y + Math.sin(a0) * 0.3;
      spawnRound(S, qx - Math.sin(a0) * q.off, qy + Math.cos(a0) * q.off, a0 + q.ang, roundDamage(S, q.mul));
      h.delayQ.splice(di, 1); di--;
    }
  }
  for (var i = h.burstQ.length - 1; i >= 0; i--) {
    h.burstQ[i] -= dt;
    if (h.burstQ[i] <= 0) { h.burstQ.splice(i, 1); if (tg) fireBatch(S); }
  }
  if (h.braced && tg && h.lockClear && h.fireCd <= 0) {
    fireBatch(S);
    h.fireCd = fireInterval(S);
    for (var m = 1; m < S.st.volleys; m++) h.burstQ.push(MULTI_GAP * m);
  }
}

// META credits (mirrors V.Meta.TUNING; sim must not depend on V.Meta). D4 3.1 weights x 24.
var ROOM_CREDITS = { combat:13, supply:0, cache:54, boss:40 }, BOSS_BONUS = 0;   // F1 pay table = V.Meta.TUNING.ROOM (model scale, pick 48); keep in step
function roomCredit(kind){ var v = ROOM_CREDITS[kind]; return v == null ? ROOM_CREDITS.combat : v; }
function endRun(S, win){
  var h = S.hero;
  if (S.deploy && V.Mods && V.Mods.Deploy) S.credits = Math.round(S.credits * V.Mods.Deploy.creditMul(S));   // G: Deploy Credits boost
  S.result = { win:win, stage:S.stage, lap:S.lap, t:+S.t.toFixed(2), kills:S.stats.kills, level:h.level,
    picks:S.stats.picks.slice(), dmgTaken:S.stats.dmgTaken, credits:S.credits, seen:Object.keys(S.stats.seen || {}) };
  if (S.useMeta && V.Meta && V.Meta.award) { V.Meta.award(S.result); S.result.bank = V.Meta.state.credits; } // META: bank once
  S.phase = 'results'; S.cards = null; S.supply = null;
  ev(S, { k: win ? 'win' : 'death', x:h.x, y:h.y, stage:S.stage });
}
// opts.hazard: skips dodge
function hurtHero(S, dmg, src, x, y, opts){
  var h = S.hero;
  if (h.invulnT > 0 || S.phase === 'results' || S.stress) return false;
  if (!(opts && opts.hazard)) {
    var dc = Math.min(DODGE_CAP, S.st.dodge || 0);
    if (dc > 0 && S.rng.next() < dc) { ev(S, { k:'dodge', x:h.x, y:h.y, src:src }); S.fx.push({ k:'dodge', x:h.x, y:h.y }); return false; }
  }
  dmg = Math.max(1, Math.floor(dmg * (S.st.dmgTakenMul == null ? 1 : S.st.dmgTakenMul)));
  if (V.Mods && V.Mods.Deploy && S.deployShield > 0) dmg = V.Mods.Deploy.absorb(S, dmg);   // G: D8 opening shield
  h.hp -= dmg; S.stats.dmgTaken += dmg;
  S.stats.hitsBy[src] = (S.stats.hitsBy[src] || 0) + 1;
  h.invulnT = S.tune.INVULN;
  ev(S, { k:'hurt', x:h.x, y:h.y, dmg:dmg, src:src, hp:Math.max(0, h.hp), max:h.maxHp, down:h.hp <= 0 });
  if (h.hp <= 0) { h.hp = 0; endRun(S, false); }
  return true;
}
function healHero(S, v){
  var h = S.hero, before = h.hp; h.hp = Math.min(h.maxHp, h.hp + Math.max(0, Math.floor(v))); return h.hp - before;
}

// ---------- enemy helpers (api) ----------
function steerTo(S, e, tx, ty, speed, dt){
  var dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  dx /= d; dy /= d;
  if (!clearLine(S, e.x, e.y, tx, ty, e.r * 0.8)) { // slide round cover
    var sg = e.strafe || 1, sx = -dy * sg, sy = dx * sg;
    dx = dx * 0.35 + sx * 0.94; dy = dy * 0.35 + sy * 0.94;
  }
  e.x += dx * speed * dt; e.y += dy * speed * dt;
  e.ang = Math.atan2(dy, dx);
}
function enemyShoot(S, e, ang, speed, dmg, opts){
  var sp = speed * S.tune.ENEMY_SHOT_SPEED_MULT, r = (opts && opts.r) || SHOT_R;
  var s = { x:e.x + Math.cos(ang) * e.r, y:e.y + Math.sin(ang) * e.r, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp,
    r:r, dmg:dmg, src:e.type, bounces:(opts && opts.bounces) || 0, life:(opts && opts.life) || 12 };
  S.shots.push(s);
  return s;
}
function lob(S, e, tx, ty, T, r, dmg){
  var s = { x:e.x, y:e.y, sx:e.x, sy:e.y, tx:tx, ty:ty, t:0, T:Math.max(0.05, T), r:r || 1.0, dmg:dmg, src:e.type };
  S.shells.push(s);
  return s;
}
function tellT(S, b){ return b * S.tune.TELL_MULT; }
var api = {
  ev:ev, rng:function(S){ return S.rng; }, enemyDmg:enemyDmg, steerTo:steerTo, enemyShoot:enemyShoot, lob:lob,
  hurtHero:hurtHero, healHero:healHero, clearLine:clearLine, hitsSolid:hitsSolid, collideBody:collideBody,
  hero:function(S){ return S.hero; },
  dist:function(a, b){ return Math.hypot(b.x - a.x, b.y - a.y); },
  angleTo:function(a, b){ return Math.atan2(b.y - a.y, b.x - a.x); },
  tellT:tellT, spawnEnemy:spawnEnemy,
  damageEnemy:function(S, e, dmg, crit, opts){ return damageEnemy(S, e, dmg, !!crit, null, opts); },
  enemies:function(S){ return S.enemies; }, targetable:targetable, roundDamage:roundDamage, outOfRoom:outOfRoom,
  fx:function(S, o){ S.fx.push(o); return o; }
};

function stepEnemy(S, e, dt){
  var h = S.hero, b = base(e), A = V.AI[e.type];
  if (e.flashT > 0) e.flashT = Math.max(0, e.flashT - dt);
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.st === 'spawn') { e.spawnT -= dt; if (e.spawnT <= 0) e.st = e.afterSpawn || 'move'; return; }
  if (e.frozenT > 0) { // freeze (mods): bosses and freeze-immune enemies never freeze
    if (e.boss || (e.immune && e.immune.freeze)) e.frozenT = 0; else e.frozenT = Math.max(0, e.frozenT - dt);
  }
  if (!(e.frozenT > 0) && A && A.step) A.step(S, e, dt, api);
  if (S.phase === 'results') return;
  if (!immovable(e) && !charging(e)) collideBody(S, e, e.r);
  // bodies are kept HERO_GAP apart (separate()), so touching = within the gap; a lunge/charge hits on overlap
  if (!e.noContact && !e.hidden && b.contact > 0 && e.contactCd <= 0 &&
      Math.hypot(h.x - e.x, h.y - e.y) < e.r + HERO_HURT_R + (charging(e) ? 0 : HERO_GAP + 0.02)) {
    if (hurtHero(S, enemyDmg(S, b.contact), e.type, e.x, e.y)) e.contactCd = CONTACT_CD;
  }
}
function immovable(e){ var b = base(e); return !!(b.static || e.static || e.boss || (e.immune && e.immune.knockback) || e.knockback === 0); }
function charging(e){ return e.st === 'act' && ((e.lungeLeft || 0) > 0 || (e.dashLeft || 0) > 0); }
function pairPass(S){
  var a = S.enemies;
  for (var i = 0; i < a.length; i++) for (var j = i + 1; j < a.length; j++) {
    var p = a[i], q = a[j];
    if (p.hidden || q.hidden) continue;
    var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = p.r + q.r + 0.04;
    if (d >= m) continue;
    if (d < 1e-6) { dx = (p.id < q.id ? 1e-6 : -1e-6); dy = 0; d = 1e-6; }
    var pm = immovable(p) ? 0 : 1, qm = immovable(q) ? 0 : 1, sm = pm + qm;
    if (!sm) continue;
    var k = (m - d) / d;
    p.x -= dx * k * pm / sm; p.y -= dy * k * pm / sm; q.x += dx * k * qm / sm; q.y += dy * k * qm / sm;
    if (pm) collideBody(S, p, p.r); if (qm) collideBody(S, q, q.r);
  }
}
function separate(S){
  var a = S.enemies, h = S.hero, it, i, j;
  for (it = 0; it < 3; it++) {
    for (i = 0; i < a.length; i++) for (j = i + 1; j < a.length; j++) {
      var p = a[i], q = a[j];
      if (p.hidden || q.hidden) continue;
      var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = p.r + q.r + 0.04;
      if (d >= m) continue;
      if (d < 1e-6) { dx = (p.id < q.id ? 1e-6 : -1e-6); dy = 0; d = 1e-6; }
      var pm = immovable(p) ? 0 : 1, qm = immovable(q) ? 0 : 1, sm = pm + qm;
      if (!sm) continue;
      var k = (m - d) / d;
      p.x -= dx * k * pm / sm; p.y -= dy * k * pm / sm; q.x += dx * k * qm / sm; q.y += dy * k * qm / sm;
    }
    for (i = 0; i < a.length; i++) {
      var e = a[i];
      if (charging(e) || e.hidden) continue; // a lunge/charge may pass through to hit
      var gx = e.x - h.x, gy = e.y - h.y, gd = Math.hypot(gx, gy), gap = e.r + HERO_HURT_R + HERO_GAP;
      if (gd >= gap) continue;
      if (gd < 1e-6) { gx = 0; gy = (h.y > S.room.h / 2 ? -1e-6 : 1e-6); gd = 1e-6; } // pinned: push toward room centre
      var kk = (gap - gd) / gd;
      if (immovable(e)) { h.x -= gx * kk; h.y -= gy * kk; collideBody(S, h, HERO_WALL_R); } // static body acts as a post
      else {
        e.x += gx * kk; e.y += gy * kk; collideBody(S, e, e.r);
        // enemy pinned by a wall or corner: the Operator gives way instead
        var rx = e.x - h.x, ry = e.y - h.y, rd = Math.hypot(rx, ry);
        if (rd < gap - 1e-3) {
          if (rd < 1e-6) { rx = 0; ry = 1e-6; rd = 1e-6; }
          var k2 = (gap - rd) / rd; h.x -= rx * k2; h.y -= ry * k2; collideBody(S, h, HERO_WALL_R);
        }
      }
    }
    for (i = 0; i < a.length; i++) if (!immovable(a[i])) collideBody(S, a[i], a[i].r);
  }
  // final pass: settle enemy pairs once more, then the Operator yields to anything still inside the gap
  pairPass(S);
  for (i = 0; i < a.length; i++) {
    var f = a[i]; if (charging(f) || f.hidden) continue;
    var fx = f.x - h.x, fy = f.y - h.y, fd = Math.hypot(fx, fy), fg = f.r + HERO_HURT_R + HERO_GAP;
    if (fd >= fg - 1e-3) continue;
    if (fd < 1e-6) { fx = 0; fy = 1e-6; fd = 1e-6; }
    var k3 = (fg - fd) / fd; h.x -= fx * k3; h.y -= fy * k3; collideBody(S, h, HERO_WALL_R);
  }
}

// ---------- damage to enemies ----------
// R45 (b): from 11 columns up, a repair drop that would land in a bottom 3 x 3 corner moves to the centre of the nearest
// floor cell outside both corners (first found wins a tie; no rng). At 9 columns the drop is untouched.
var CORNER = 3;
function inCorner(S, cx, cy){ var w = S.room.w, h = S.room.h; return cy >= h - CORNER && (cx < CORNER || cx >= w - CORNER); }
function dropSpot(S, x, y){
  if (!(S.room.w >= 11) || !inCorner(S, Math.floor(x), Math.floor(y))) return { x:x, y:y };
  var g = S.room.grid, best = null, bd = 1e9;
  for (var cy = 1; cy < S.room.h; cy++) for (var cx = 0; cx < S.room.w; cx++) {
    if (inCorner(S, cx, cy) || (g && g[cy][cx] === '#')) continue;
    var d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
    if (d < bd - 1e-9) { bd = d; best = { x:cx + 0.5, y:cy + 0.5 }; }
  }
  return best || { x:x, y:y };
}
function killEnemy(S, e){
  var b = base(e);
  S.stats.kills++;
  S.stats.killLog.push({ type:e.type, stage:S.stage, t:+(S.roomT).toFixed(3) });
  var others = 0; for (var oi = 0; oi < S.enemies.length; oi++) if (S.enemies[oi] !== e && S.enemies[oi].hp > 0) others++;
  ev(S, { k:'kill', x:e.x, y:e.y, id:e.id, type:e.type, boss:!!e.boss, size:b.size || 'small', last:others === 0 && !(S.spawnQ && S.spawnQ.length) });
  if (b.xp) S.pickups.push({ x:e.x, y:e.y, kind:'xp', v:b.xp, life:1e9 });
  if (!e.boss) {
    var p = Math.min(REPAIR_CAP, REPAIR_BASE + S.pity);
    if (S.rng.next() < p) { var rp = dropSpot(S, e.x + 0.2, e.y); S.pickups.push({ x:rp.x, y:rp.y, kind:'repair', v:0, life:REPAIR_LIFE }); S.pity = 0; }
    else S.pity += b.size === 'small' ? REPAIR_PITY * 0.5 : REPAIR_PITY;
  } else S.stats.bossTime = +S.roomT.toFixed(2);
  var A = V.AI[e.type]; if (A && A.onDeath) A.onDeath(S, e, api);
  callHook(S, 'onKill', e, api);
}
function damageEnemy(S, e, dmg, crit, r, opts){
  if (e.hp <= 0) return false;
  var A = V.AI[e.type];
  if (A && A.onDamage) { var d2 = A.onDamage(S, e, dmg, r, api); if (typeof d2 === 'number') dmg = d2; }
  if (dmg <= 0) return false;
  dmg = Math.max(1, Math.floor(dmg));
  e.hp -= dmg;
  if (opts && opts.dot) ev(S, { k:'dot', x:e.x, y:e.y, id:e.id, dmg:dmg });
  else { e.flashT = 0.1; ev(S, { k:'hit', x:e.x, y:e.y, id:e.id, dmg:dmg, crit:crit,
    src:r ? 'round' : ((opts && opts.src) || 'mod'), dir:r ? Math.atan2(r.vy, r.vx) : null, hp:Math.max(0, e.hp), max:e.maxHp }); }
  if (crit) ev(S, { k:'crit', x:e.x, y:e.y, id:e.id, dmg:dmg });
  if (e.hp <= 0) { e.hp = 0; killEnemy(S, e); return true; }
  return false;
}
function pruneEnemies(S){
  var en = [];
  for (var q = 0; q < S.enemies.length; q++) if (S.enemies[q].hp > 0) en.push(S.enemies[q]);
  S.enemies = en;
}

function bounceOff(r, b){
  // reflect on the axis of least penetration
  var cx = Math.max(b.x, Math.min(r.x, b.x + b.w)), cy = Math.max(b.y, Math.min(r.y, b.y + b.h));
  var dx = r.x - cx, dy = r.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) r.vx = -r.vx; else if (Math.abs(dy) > 0) r.vy = -r.vy; else { r.vx = -r.vx; r.vy = -r.vy; }
  r.x -= r.vx * STEP; r.y -= r.vy * STEP;
}
function wallReflect(S, r){
  var hit = false;
  if (r.x < r.r) { r.x = r.r; r.vx = Math.abs(r.vx); hit = true; }
  if (r.x > S.room.w - r.r) { r.x = S.room.w - r.r; r.vx = -Math.abs(r.vx); hit = true; }
  if (r.y < r.r) { r.y = r.r; r.vy = Math.abs(r.vy); hit = true; }
  if (r.y > S.room.h - r.r) { r.y = S.room.h - r.r; r.vy = -Math.abs(r.vy); hit = true; }
  return hit;
}
function stepRounds(S, dt){
  var a = S.rounds, out = [];
  for (var i = 0; i < a.length; i++) {
    var r = a[i], alive = true;
    r.x += r.vx * dt; r.y += r.vy * dt;
    var sol = hitsSolid(S, r.x, r.y, r.r), oob = outOfRoom(S, r.x, r.y, 0) && !(r.y < 1 && S.room.door.open && r.x > S.room.door.x && r.x < S.room.door.x + 1);
    if (sol || oob) {
      if (r.bounceWall && r.wallBounces < WALLB_MAX) {
        if (sol) bounceOff(r, sol); else wallReflect(S, r);
        r.wallBounces++; r.dmg = Math.max(1, Math.floor(r.dmg * WALLB_MULT));
      } else continue;
    }
    for (var j = 0; j < S.enemies.length; j++) {
      var e = S.enemies[j];
      if (!targetable(e) || r.hit.indexOf(e.id) >= 0) continue;
      if (Math.hypot(e.x - r.x, e.y - r.y) < e.r + r.r) {
        damageEnemy(S, e, r.dmg, r.crit, r);
        r.hit.push(e.id);
        if (V.MODS) { r.keep = false; callHook(S, 'onHit', e, r, api); alive = !!r.keep; break; } // mods.js does pierce/ricochet
        callHook(S, 'onHit', e, r, api);
        alive = false;
        if (r.pierce) { r.dmg = Math.max(1, Math.floor(r.dmg * PIERCE_MULT)); alive = true; continue; }
        if (r.rico && r.bounces < RICO_MAX) {
          var best = null, bd = RICO_RANGE;
          for (var k = 0; k < S.enemies.length; k++) {
            var o = S.enemies[k];
            if (!targetable(o) || r.hit.indexOf(o.id) >= 0) continue;
            var d = Math.hypot(o.x - r.x, o.y - r.y);
            if (d < bd && clearLine(S, r.x, r.y, o.x, o.y, r.r)) { bd = d; best = o; }
          }
          if (best) {
            var ang = Math.atan2(best.y - r.y, best.x - r.x), sp = Math.hypot(r.vx, r.vy);
            r.vx = Math.cos(ang) * sp; r.vy = Math.sin(ang) * sp;
            r.dmg = Math.max(1, Math.floor(r.dmg * RICO_MULT)); r.bounces++;
            alive = true;
          }
        }
        break;
      }
    }
    if (alive) out.push(r);
  }
  S.rounds = out;
  pruneEnemies(S);
}
function stepShots(S, dt){
  var a = S.shots, out = [], h = S.hero;
  for (var i = 0; i < a.length; i++) {
    var s = a[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life != null) { s.life -= dt; if (s.life <= 0) continue; }
    if (hitsSolid(S, s.x, s.y, s.r)) { ev(S, { k:'block', x:s.x, y:s.y, src:s.src }); continue; } // cover stops enemy flat rounds (M)
    if (outOfRoom(S, s.x, s.y, -s.r)) {
      if (s.bounces > 0) { wallReflect(S, s); s.bounces--; } else if (outOfRoom(S, s.x, s.y, s.r)) continue;
    }
    if (S.phase !== 'results' && Math.hypot(h.x - s.x, h.y - s.y) < s.r + HERO_HURT_R) { hurtHero(S, s.dmg, s.src, s.x, s.y); continue; }
    out.push(s);
  }
  S.shots = out;
}
function stepShells(S, dt){
  var a = S.shells, out = [], h = S.hero;
  for (var i = 0; i < a.length; i++) {
    var s = a[i];
    s.t += dt;
    var k = Math.min(1, s.t / s.T);
    s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k;
    if (s.t >= s.T) { // lands over cover
      ev(S, { k:'land', x:s.tx, y:s.ty, r:s.r, src:s.src });
      if (S.phase !== 'results' && Math.hypot(h.x - s.tx, h.y - s.ty) < s.r + HERO_HURT_R) hurtHero(S, s.dmg, s.src, s.tx, s.ty);
      continue;
    }
    out.push(s);
  }
  S.shells = out;
}
function stepHazards(S, dt){
  if (S.hazardCd > 0) S.hazardCd -= dt;
  if (!S.hazards.length || S.hazardCd > 0) return;
  var h = S.hero;
  for (var i = 0; i < S.hazards.length; i++) {
    if (circleRect(h.x, h.y, HERO_HURT_R, S.hazards[i])) {
      if (hurtHero(S, enemyDmg(S, HAZARD_DMG), 'spikes', h.x, h.y, { hazard:true })) S.hazardCd = HAZARD_CD;
      return;
    }
  }
}

// ---------- pickups / xp ----------
function addXp(S, v){
  var h = S.hero;
  if (h.level >= LEVEL_CAP) return;
  h.xp += v;
  while (h.level < LEVEL_CAP && h.xp >= h.xpNext) {
    h.xp -= h.xpNext; h.level++; S.pendingLevels++;
    ev(S, { k:'levelup', x:h.x, y:h.y, level:h.level });
    h.xpNext = h.level < LEVEL_CAP ? LEVEL_COST[h.level + 1] : LEVEL_COST[LEVEL_CAP];
  }
  if (h.level >= LEVEL_CAP) h.xp = 0;
}
function collect(S, p){
  var h = S.hero;
  if (p.kind === 'xp') addXp(S, p.v);
  else p.v = healHero(S, h.maxHp * REPAIR_PCT);
  ev(S, { k:'pickup', x:p.x, y:p.y, kind:p.kind, v:p.v });
}
function stepPickups(S, dt){
  var h = S.hero, out = [], magnet = S.phase !== 'play';
  for (var i = 0; i < S.pickups.length; i++) {
    var p = S.pickups[i];
    var full = p.kind === 'repair' && h.hp >= h.maxHp;
    if (p.kind === 'repair') { p.life -= dt; if (p.life <= 0) continue; }
    var dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy);
    if (magnet && !full && d > 1e-6) { var st = Math.min(d, MAGNET_SPEED * dt); p.x += dx / d * st; p.y += dy / d * st; d -= st; }
    if (!full && d < S.tune.PICKUP_R) { collect(S, p); continue; }
    out.push(p);
  }
  S.pickups = out;
}

// ---------- cards ----------
function inPool(m, pool){ return !m.pool || m.pool.indexOf(pool) >= 0; }
function offer(S, pool, n){
  if (V.MODS && V.Mods && V.Mods.offer) return V.Mods.offer(S, pool, n, S.rng);
  var M = mods(), avail = [], w = [], i, out = [];
  for (i = 0; i < M.length; i++) {
    var m = M[i];
    if (!inPool(m, pool)) continue;
    if (m.max && count(S, m.key) >= m.max) continue;
    var wt = m.weight == null ? 1 : +m.weight; if (!(wt > 0)) continue;
    avail.push(i); w.push(wt);
  }
  n = Math.min(n, avail.length);
  for (var k = 0; k < n; k++) {
    var tot = 0; for (i = 0; i < w.length; i++) tot += w[i];
    var x = S.rng.next() * tot, j = 0;
    while (j < w.length - 1 && x >= w[j]) { x -= w[j]; j++; }
    out.push(avail[j]); avail.splice(j, 1); w.splice(j, 1);
  }
  return out;
}
function applyMod(S, ci){
  var c = mods()[ci];
  S.hero.mods[c.key] = (S.hero.mods[c.key] || 0) + 1;
  S.stats.picks.push(c.id);
  if (c.hooks && c.hooks.onPick) c.hooks.onPick(S, S.hero.mods[c.key], api);
  refreshStats(S);
  ev(S, { k:'pick', x:S.hero.x, y:S.hero.y, id:c.id, key:c.key });
  return c;
}
function deferEvents(S, n0){ S._post = (S._post || []).concat(S.events.splice(n0)); }
function openPick(S){
  var n = Math.max(1, Math.round(S.tune.CARDS_OFFERED) || 3);
  S.cards = offer(S, 'F', n);
  if (!S.cards.length) { S.cards = null; S.pendingLevels = 0; S.freePicks = 0; return false; }
  S._pickFrom = S.phase; S.phase = 'pick'; return true;
}
function reroll(S){ var n0 = S.events.length, r = V.Mods && V.Mods.reroll ? V.Mods.reroll(S) : false; deferEvents(S, n0); return r; }
function pick(S, index){
  var n0 = S.events.length, r = pick0(S, index); deferEvents(S, n0); return r;
}
function pickSupply(S, index){
  var n0 = S.events.length, r = pickSupply0(S, index); deferEvents(S, n0); return r;
}
function pick0(S, index){
  if (S.phase === 'supply') return pickSupply0(S, index);
  if (S.phase !== 'pick' || !S.cards) return false;
  var ci = S.cards[index]; if (ci == null) return false;
  applyMod(S, ci);
  if (S.freePicks > 0) { if (V.Mods && V.Mods.Deploy && V.Mods.Deploy.pickBonus(S) && !V.Mods.capped(S, V.MODS[ci])) applyMod(S, ci); S.freePicks--; }   // G: opening pick of a rare or elite roll enters at level 2
  else S.pendingLevels = Math.max(0, S.pendingLevels - 1);
  S.cards = null; S.phase = S._pickFrom || 'clear'; S._pickFrom = null;
  return true;
}
function pickSupply0(S, index){
  if (S.phase !== 'supply' || !S.supply) return false;
  if (S.mini && S.mini.phase === 'sheet') { V.Catch.take(S, index); S.supply = null; openDoor(S); return true; }   // K: index = array of pad ids (Take), or anything else = the saved defaults
  var c = S.supply[index]; if (!c) return false;
  if (c.kind === 'mod') applyMod(S, c.index);
  else { var v = healHero(S, S.hero.maxHp * SUPPLY_REPAIR_PCT); ev(S, { k:'pickup', x:S.hero.x, y:S.hero.y, kind:'repair', v:v }); }
  S.supply = null;
  openDoor(S);
  return true;
}
function openDoor(S){
  S.phase = 'clear'; S.clearT = 0; S.room.door.open = true;
  ev(S, { k:'door', x:S.room.door.x + 0.5, y:S.room.door.y + 0.5, open:true, stage:S.stage, kind:S.stageKind });
}
function openChest(S){
  var c = S.chest; if (!c || c.open) return;
  c.open = true; S.freePicks++;
  S.pickups.push({ x:c.x - 0.3, y:c.y + 0.4, kind:'repair', v:0, life:REPAIR_LIFE });
  S.pickups.push({ x:c.x + 0.3, y:c.y + 0.4, kind:'repair', v:0, life:REPAIR_LIFE });
  ev(S, { k:'chest', x:c.x, y:c.y });
}

function nextStage(S){
  for (var i = 0; i < S.pickups.length; i++) if (S.pickups[i].kind === 'xp') addXp(S, S.pickups[i].v);
  var n = S.stageIdx + 1, list = listOf(S);
  if (n >= list.length) { S.lap++; n = 0; }
  loadStage(S, n);
}

function syncBoss(S){
  if (!S.boss) return;
  var e = findEnemy(S, S.boss.id), B = S.boss;
  if (!e) { B.hp = 0; B.attack = null; B.tell01 = 0; return; }
  var ph = e.phase || 1;
  B.hp = e.hp; B.maxHp = e.maxHp; B.phase = ph; B.attack = e.attack || null; B.tell01 = e.tell01 || 0; B.name = e.name || B.name;
}

// K: one fixed step of the catch room. The clock is S.mini.t, advanced here by sim steps only (R53); no hero weapon, no enemies.
function stepCollect(S, inp){
  var dt = STEP * (S.tune.TIME_SCALE > 0 ? S.tune.TIME_SCALE : 1);
  S.frame++; S.t += dt; S.roomT += dt;
  if (!S.st) refreshStats(S);
  if (S.mini) V.Catch.step(S, inp, dt);
  return S;
}
// K: the Skip chip (4th play on). Grants the default pad at once and opens the door.
function skipCollect(S){
  if (!S || S.phase !== 'collect' || !S.mini || !V.Catch.skip(S)) return false;
  S.supply = null; openDoor(S); return true;
}
// ---------- step ----------
function step(S, inp){
  S.events.length = 0; S.fx.length = 0;
  if (S._post && S._post.length) { for (var pe = 0; pe < S._post.length; pe++) S.events.push(S._post[pe]); S._post.length = 0; }
  if (S.phase === 'collect') return stepCollect(S, inp);   // K: catch room (fixed step sim time, R53)
  if (S.phase === 'pick' || S.phase === 'supply' || S.phase === 'results') return S;
  var t = S.tune, dt = STEP * (t.TIME_SCALE > 0 ? t.TIME_SCALE : 1);
  S.frame++; S.t += dt; S.roomT += dt;
  if (!S.st) { refreshStats(S); if (V.Mods && V.Mods.Deploy) V.Mods.Deploy.runStart(S); }   // G: Deploy shield + opening picks, once
  if (S.phase === 'play') { S.stats.playSteps++; releaseSpawns(S); }
  stepHero(S, inp, dt);
  if (S.phase === 'play' && S.hero.braced) S.stats.bracedSteps++;
  for (var i = 0; i < S.enemies.length && S.phase !== 'results'; i++) stepEnemy(S, S.enemies[i], dt);
  pruneEnemies(S);
  separate(S);
  stepRounds(S, dt);
  stepShots(S, dt);
  stepShells(S, dt);
  stepHazards(S, dt);
  if (S.phase === 'play') callHook(S, 'tick', dt, api);
  pruneEnemies(S);
  syncBoss(S);
  if (S.phase === 'results') return S;
  if (S.phase === 'play' && S.enemies.length === 0 && S.spawnQ.length === 0) {
    S.stats.roomTimes.push({ stage:S.stage, roomId:S.roomId, s:+S.roomT.toFixed(2), kind:S.stageKind });
    S.stats.roomHp.push({ stage:S.stage, roomId:S.roomId, hp:S.hero.hp });
    S.credits += roomCredit(S.stageKind) + (S.stageKind === 'boss' ? BOSS_BONUS : 0); // META: credits per room cleared
    S.shots.length = 0; S.shells.length = 0;
    if (S.hero.lockId != null) { ev(S, { k:'unlock', x:S.hero.x, y:S.hero.y, id:S.hero.lockId }); S.hero.lockId = null; S.hero.lockClear = false; }
    if (S.stageKind === 'boss' && !t.ENDLESS) { S.phase = 'clear'; S.clearT = 0; S.bossWin = true; if (V.Mods) V.Mods.bankReroll(S); }   // G: pick 21
    else openDoor(S);
  }
  stepPickups(S, dt);
  // G: pick 19, the level-up pause opens mid-stage the moment the bar fills (also in the clear walk, before the door). S: the sim has no boss-intro state (the boss attacks from its first cd), so no intro guard.
  if ((S.phase === 'play' || (S.phase === 'clear' && !S.bossWin)) && (S.pendingLevels + S.freePicks) > 0 && S.hero.hp > 0) openPick(S);
  if (S.phase === 'clear') {
    S.clearT += dt;
    var h = S.hero, d = S.room.door;
    if (S.bossWin) { if (S.clearT >= t.PICK_DELAY) endRun(S, true); return S; }
    if (S.chest && !S.chest.open && (Math.hypot(h.x - S.chest.x, h.y - S.chest.y) < 0.9 || S.clearT >= t.PICK_DELAY)) openChest(S);
    var atDoor = circleRect(h.x, h.y, HERO_WALL_R + 0.02, d);
    var pending = S.pendingLevels + S.freePicks;
    if (pending > 0 && (S.clearT >= t.PICK_DELAY || atDoor)) openPick(S);
    else if (atDoor) nextStage(S);
  }
  return S;
}

function restart(S){ return create(((S.seed + 1) >>> 0), S.tune, S.metaOpts); }

// FNV-1a over the main state, for determinism checks
function hash(S){
  var h = 2166136261 >>> 0;
  function mix(v){ var s = String(v); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 124; h = Math.imul(h, 16777619) >>> 0; }
  mix(S.frame); mix(S.phase); mix(S.stage); mix(S.lap); mix(S.rng.s);
  var H = S.hero; mix(H.x.toFixed(5)); mix(H.y.toFixed(5)); mix(H.hp); mix(H.xp); mix(H.level); mix(H.lockId);
  for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; mix(e.id); mix(e.x.toFixed(5)); mix(e.y.toFixed(5)); mix(e.hp); mix(e.st); }
  mix(S.rounds.length); mix(S.shots.length); mix(S.shells.length); mix(S.pickups.length); mix(S.stats.kills);
  return ('00000000' + h.toString(16)).slice(-8);
}

V.Sim = { reroll:reroll, dropSpot:dropSpot, create:create, step:step, pick:pick, pickSupply:pickSupply, restart:restart, hash:hash, api:api,
  offer:offer, stats:heroStats, stageList:stageList,
  STEP:STEP, LEVEL_COST:LEVEL_COST, roundDamage:roundDamage, fireInterval:fireInterval, clearLine:clearLine,
  FALLBACK_MODS:FALLBACK_MODS };
V.Sim.skipCollect = skipCollect;   // K: catch room Skip chip
// back-compat for bot/tests: base stats by type (live view of the registry)
Object.defineProperty(V.Sim, 'ENEMIES', { get:function(){ var o = {}; for (var k in V.AI) o[k] = V.AI[k].base; return o; } });
})();
