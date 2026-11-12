'use strict';
// Volley v2 bake tool (GEN-SPEC step 3). Usage, from pages/volley:
//   node src/tools/bake/bake.js           bake Ch1 stages 11-50, write parts/data-stages-gen.js, bake-meta.json, bake.hash
//   node src/tools/bake/bake.js --check   re-bake in memory; compare with the files on disk and with bake.hash (exit 1 on any drift)
// Deterministic: seed = hash32("volley-room", genVersion, chapter, stage); one small PRNG per purpose; no Math.random, no clock.
// A failed check re-rolls with salt+1, up to 8 tries a room; all 8 failing exits non-zero.
var fs = require('fs'), path = require('path');
var HS = require('./hash.js');
var SRC = path.join(__dirname, '..', '..');
var GENV = 1, CHAPTER = 1, MAX_TRIES = 8, MAX_TRIES2 = 16;   // stages 21-50 get 16 tries (bigger rooms need more slots)
globalThis.V = globalThis.V || {};
require(path.join(SRC, 'parts/data-stages.js'));
require(path.join(SRC, 'parts/data-enemies.js'));
require(path.join(SRC, 'parts/widen.js'));
var V = globalThis.V, CK = require('./check.js').mk(V);
// Step 7: the new machine and boss parts register their rows (V.Data.enemies[...]) and AIs. Load the ones that exist (each guarded); a type whose row
// is still missing gets a PROVISIONAL row here (bake process only, never written out) so the net can classify it. The bake output does not read any row
// number except through the net (flat / long-static / dash length), and check.js applies the E-08 pocket, sniper-corner and E-06 split rules itself.
var NEW_PARTS = ['ai-p0', 'ai-p1', 'boss-kit', 'boss', 'ai-e06', 'ai-e07', 'ai-e08', 'boss-b02', 'boss-b03', 'boss-b04'], LOADED = [], PROVISIONAL = [];
NEW_PARTS.forEach(function (f) {
  var p = path.join(SRC, 'parts', f + '.js'); if (!fs.existsSync(p)) return;
  try { require(p); LOADED.push(f); } catch (e) { console.error('bake: parts/' + f + '.js failed to load under node: ' + e.message); }
});
var PROV_ROWS = {   // shape only (flags the net reads); numbers are the CURVE / contract ones where known
  'E-06': { hp: 500, contact: 40, dmg: 50, speed: 1.4, r: 0.45, size: 'medium', ai: {} },
  'E-06h': { hp: 200, contact: 30, dmg: 50, speed: 2, r: 0.3, size: 'small', ai: {} },
  'E-07': { hp: 550, contact: 40, dmg: 50, speed: 0, r: 0.45, size: 'medium', ai: { ringN: 8 } },
  'E-08': { hp: 450, contact: 40, dmg: 110, speed: 0, r: 0.45, size: 'medium', static: true, ai: { shotSpeed: 14, range: 16 } },
  'B-02': { hp: 9000, r: 1, size: 'large', boss: true, ai: {} }, 'B-03': { hp: 7200, r: 1, size: 'large', boss: true, ai: {} },
  'B-03V': { hp: 7200, r: 1, size: 'large', boss: true, ai: {} }, 'B-04': { hp: 14000, r: 1.1, size: 'large', boss: true, ai: {} } };
Object.keys(PROV_ROWS).forEach(function (k) { if (!V.Data.enemies[k]) { V.Data.enemies[k] = PROV_ROWS[k]; PROVISIONAL.push(k); } });

// Agent D's static net (src/test-gen-net.js) is the bake's main check. That file is a script with no exports, so load its text up to the
// fixture phase (the net function, thresholds and helpers) and call runNet on each candidate room. Missing file = bake exits non-zero.
var NET_PATCHED = [];
var NET = (function () {
  var f = path.join(SRC, 'test-gen-net.js');
  if (!fs.existsSync(f)) { console.error('src/test-gen-net.js not found: the bake needs the static net as its check'); process.exit(1); }
  var txt = fs.readFileSync(f, 'utf8'), cut = txt.indexOf("var good = loadDir('good')");
  if (cut < 0) { console.error('src/test-gen-net.js: cannot find the fixture phase marker'); process.exit(1); }
  // Step 7: until K3 extends the net's tables for E-06 to E-08 (C3-REPORT-S7 "Needs from K3"), the bake extends them in memory only (same values as the patch).
  NET_PATCHED = [];
  if (!/'E-08'\s*:/.test(txt.slice(txt.indexOf('var INTRO'), txt.indexOf('var INTRO') + 200))) {
    txt = txt.replace(/var INTRO = \{[^}]*\};/, "var INTRO = { 'E-01': 1, 'E-02': 3, 'E-03': 4, 'E-04': 6, 'E-05': 7, 'E-06': 11, 'E-06h': 11, 'E-08': 13, 'E-07': 16 };"); NET_PATCHED.push('INTRO');
  }
  if (!/'E-08'/.test(txt.slice(txt.indexOf('var TYPE_CAP'), txt.indexOf('var TYPE_CAP') + 120))) {
    txt = txt.replace(/var TYPE_CAP = \{[^}]*\};/, "var TYPE_CAP = { 'E-02': 4, 'E-04': 2, 'E-05': 2, 'E-08': 1 };"); NET_PATCHED.push('TYPE_CAP');
  }
  if (/var SNIPER_IDS = \[\];/.test(txt)) { txt = txt.replace(/var SNIPER_IDS = \[\];/, "var SNIPER_IDS = ['E-08'];"); NET_PATCHED.push('SNIPER_IDS'); }
  cut = txt.indexOf("var good = loadDir('good')");
  return new Function('require', '__dirname', 'process', txt.slice(0, cut) + '\nreturn { runNet: runNet, group: group, line: line, WIDTHS: WIDTHS };')(require, SRC, process);
})();
function netFails(kind, stage, room, spawns) {
  var res = NET.runNet({ kind: kind, stage: stage, room: room, spawns: spawns }, NET.WIDTHS);
  return NET.group(res.fails).map(function (g) { return 'NET ' + NET.line(g); });
}

var WEIGHT10 = { 'E-01': 7, 'E-02': 10, 'E-03': 10, 'E-04': 13, 'E-05': 13, 'E-06': 10, 'E-07': 13, 'E-08': 15 };   // threat weights x10 (CURVE section 2)
// Step 7 pool: a machine joins at its intro stage (CURVE 5: E-06 s11, E-08 s13, E-07 s16). E-09 (s21) is not in code: stage 21 keeps its substitution note.
var POOL_FROM = { 'E-01': 1, 'E-02': 3, 'E-03': 4, 'E-04': 6, 'E-05': 7, 'E-06': 11, 'E-08': 13, 'E-07': 16 };
var POOL = Object.keys(POOL_FROM).sort();
function poolAt(stage) { return POOL.filter(function (t) { return POOL_FROM[t] <= stage; }); }
// CURVE type caps: E-02 4, E-04 2, E-05 2; E-08 1 (CURVE: 1 before stage 33, 2 after, but GEN-SPEC ruling 21 "1 sniper per 6 machines, stricter wins" keeps it at 1 for every Ch1 room of 11 or fewer).
// E-03 2, E-06 2, E-07 2 are mine [G] (E-06 splits into 2 bodies; E-07 rings stack).
var CAP = { 'E-02': 4, 'E-03': 2, 'E-04': 2, 'E-05': 2, 'E-06': 2, 'E-07': 2, 'E-08': 1 };
var ORDER = ['E-08', 'E-03', 'E-06', 'E-04', 'E-07', 'E-02', 'E-01', 'E-05'];   // slot-hungry anchors first (shield, split room), chargers last
var BODY_MAX = 7;   // [G] per wave: machines + one extra body per E-06 (its two halves) at most 7 (6 alive per wave + 1 half)
var PACK_TOL = 1;   // x10 ME
var INTRO_ME = 0.8; // CURVE intro rule: the intro room's ME is at most 0.8 x the stage budget
// CURVE intro rule: "it must appear again within 2 stages" (15 is SD): stage -> type that must be in the room
var MUST = { 12: 'E-06', 14: 'E-08', 17: 'E-07' };
// CURVE section 3, Ch1 rows 11-50: role, n (band n-1..n+1), ME target (x10), hazard level BAKED, elite slots, curveHaz = hazard level CURVE asks for.
// Hazard policy (GEN-SPEC 3.2: spikes only in spike templates T05, T10 (Spk only) and T11 (Bld/Prs); C9 forbids a spike room after a spike room and more than 10 uses):
// R63: the Spk beat rooms (18, 28, 38, 48) are baked with spikes, plus the Bld/Prs rooms in HAZ_BP. CURVE marks H1/H2 in 12 Bld/Prs rooms (22-24, 27, 32-34, 37, 42-44, 47) but
// C9 allows no spike room after a spike room, and 27, 37, 47 sit right before a Spk room (28, 38, 48), so the first and third room of each 22-24, 32-34, 42-44 run take spikes
// and 23, 33, 43, 27, 37, 47 stay H0. The meta records curveHaz and bakedHaz.
var PLAN = {
  11: { kind: 'combat', role: 'Rec', n: 5, me10: 50, haz: 0, intro: 'E-06', introN: [2, 2] },
  12: { kind: 'combat', role: 'Bld', n: 5, me10: 50, haz: 0 },
  13: { kind: 'combat', role: 'Bld', n: 6, me10: 60, haz: 0, intro: 'E-08', introN: [1, 1] },
  14: { kind: 'combat', role: 'Prs', n: 7, me10: 70, haz: 0 },
  15: { kind: 'supply' },
  16: { kind: 'combat', role: 'Rec', n: 5, me10: 50, haz: 0, intro: 'E-07', introN: [1, 2] },
  17: { kind: 'combat', role: 'Bld', n: 6, me10: 60, haz: 0 },
  18: { kind: 'combat', role: 'Spk', n: 8, me10: 80, haz: 1 },
  19: { kind: 'cache' },
  20: { kind: 'boss', arena: 'BA2', boss: 'B-03' }
};
// [stage, n, me10, curveHaz, elites, intro]
[[21, 5, 50, 0, 0, 'E-09 (not in code: baked with E-01 to E-08)'], [22, 7, 75, 1, 1], [23, 8, 80, 1, 0], [24, 9, 90, 1, 0], [26, 6, 60, 0, 0], [27, 7, 75, 1, 1], [28, 10, 100, 2, 0],
 [31, 6, 60, 0, 0], [32, 9, 90, 1, 0], [33, 10, 105, 1, 1], [34, 11, 110, 2, 0], [36, 7, 70, 0, 0], [37, 8, 85, 1, 1], [38, 11, 110, 2, 0],
 [41, 7, 70, 0, 0], [42, 10, 100, 1, 0], [43, 10, 110, 1, 2], [44, 11, 110, 2, 0], [46, 8, 80, 0, 0], [47, 10, 100, 1, 0], [48, 11, 120, 1, 2]].forEach(function (r) {
  var role = ['Rec', 'Bld', 'Bld', 'Prs', '', 'Rec', 'Bld', 'Spk'][(r[0] - 1) % 10];
  PLAN[r[0]] = { kind: 'combat', role: role, n: r[1], me10: r[2], haz: role === 'Spk' ? 1 : 0, curveHaz: r[3], elites: r[4], subst: r[5] };
});
var HAZ_BP = { 22: 1, 24: 1, 32: 1, 42: 1, 44: 1 };
Object.keys(HAZ_BP).forEach(function (s) { PLAN[s].haz = 1; });
[25, 35, 45].forEach(function (s) { PLAN[s] = { kind: 'supply' }; });
[29, 39, 49].forEach(function (s) { PLAN[s] = { kind: 'cache' }; });
// Step 7 bosses (CURVE 4b): 20 B-03 Ram Core (BA2), 30 B-02 Hopper (BA3), 40 B-03V Ram Core variant (BA4), 50 B-04 Siege Walker (BA5). Arenas kept.
PLAN[30] = { kind: 'boss', arena: 'BA3', boss: 'B-02' }; PLAN[40] = { kind: 'boss', arena: 'BA4', boss: 'B-03V' }; PLAN[50] = { kind: 'boss', arena: 'BA5', boss: 'B-04' };
var BOSS_NAME = { 'B-01': 'B-01 Volley Tower', 'B-02': 'B-02 Hopper', 'B-03': 'B-03 Ram Core', 'B-03V': 'B-03V Ram Core (stage 40 variant)', 'B-04': 'B-04 Siege Walker' };
Object.keys(MUST).forEach(function (s) { PLAN[s].must = MUST[s]; });
var EXCLUDE = { T01: 1 };   // QA D3: the cover-less Open Yard is not used for stages 11-20 (stages 1-9 keep R01)
var MAX_E01 = { 14: 3 };    // QA D4: stage 14 holds at most 3 chasers
var ELITE_FROM = 22;   // Ch1 R40: no elite before stage 22
var ELITE_OK = { 'E-02': 1, 'E-03': 1, 'E-04': 1, 'E-05': 1, 'E-07': 1, 'E-08': 1 };   // sim.js ELITE_TYPES + step 7 E-07, E-08 (never E-01, E-06, E-06h)

// ---------- templates ----------
function loadTemplates() {
  var dir = path.join(SRC, 'templates'), out = [];
  fs.readdirSync(dir).filter(function (f) { return /^T\d\d\.json$/.test(f); }).sort().forEach(function (f) {
    var t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (t.id + '.json' !== f) throw new Error(f + ': id mismatch');
    if (t.grid.length !== 10 || t.grid.some(function (r) { return r.length !== 9 || r !== r.split('').reverse().join('') || /[^.#=|^]/.test(r); })) throw new Error(t.id + ': grid must be 10 mirrored rows of 9 from . # = | ^');
    if (t.slots.length < 6 || t.slots.length > 12) throw new Error(t.id + ': 6 to 12 slots');
    var cells = 0, haz = 0; t.grid.forEach(function (r) { r.split('').forEach(function (c) { if (c === '#' || c === '=' || c === '|') cells++; else if (c === '^') haz++; }); });
    if (Math.abs(cells * 100 / 90 - t.cover_pct) > 0.06 || Math.abs(haz * 100 / 90 - t.haz_pct) > 0.06) throw new Error(t.id + ': stated cover_pct/haz_pct differ from the grid');
    if (t.shifts.length > 3 || t.swaps.length > 2) throw new Error(t.id + ': up to 3 shifts, 2 swaps');
    // template rule (widening trap): no slot on column 1 (7) beside cover or spikes on column 0 (8) in the same row
    t.slots.forEach(function (s) { if ((s.x === 1 && /[#=|^]/.test(t.grid[s.y - 1][0])) || (s.x === 7 && /[#=|^]/.test(t.grid[s.y - 1][8]))) throw new Error(t.id + ': slot ' + s.x + ',' + s.y + ' beside side cover (widen.js:97 rule)'); });
    out.push(t);
  });
  return out;
}
function expand(t, shift, swapIdx) {
  var rows = t.grid.map(function (r) {
    var h = r.slice(0, 5).split(''), n = h.map(function (_, c) { var src = c - shift; return src >= 0 && src <= 4 ? h[src] : '.'; });
    var full = n.join('') + n.slice(0, 4).reverse().join('');
    return full.replace(/[=|]/g, '#');
  });
  var slots = [];
  t.slots.forEach(function (s, i) {
    var x = s.x < 4 ? s.x + shift : (s.x > 4 ? s.x - shift : s.x);
    if (x < 0 || x > 8 || (s.x < 4 && x > 4) || (s.x > 4 && x < 4)) return;
    slots.push({ x: x, y: s.y, kind: s.kind, i: i });
  });
  if (swapIdx > 0) {
    var sw = t.swaps[swapIdx - 1], a = null, b = null;
    slots.forEach(function (s) { if (s.i === sw.a) a = s; if (s.i === sw.b) b = s; });
    if (a && b) { var k = a.kind; a.kind = b.kind; b.kind = k; }
  }
  var seen = {}, uniq = [];
  slots.sort(function (p, q) { return p.y - q.y || p.x - q.x; }).forEach(function (s) { var k = s.x + ',' + s.y; if (!seen[k]) { seen[k] = 1; uniq.push(s); } });
  return { rows: rows, slots: uniq };
}
function coverLabel(rows) {   // 'block' when the biggest connected cover piece has 6+ cells, else 'pillar'
  var seen = {}, best = 0;
  rows.forEach(function (r, y) { r.split('').forEach(function (c, x) {
    if (c !== '#' || seen[x + ',' + y]) return;
    var q = [[x, y]], n = 0; seen[x + ',' + y] = 1;
    while (q.length) { var p = q.pop(); n++; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = p[0] + d[0], ny = p[1] + d[1]; if (ny >= 0 && ny < rows.length && nx >= 0 && nx < 9 && rows[ny][nx] === '#' && !seen[nx + ',' + ny]) { seen[nx + ',' + ny] = 1; q.push([nx, ny]); } }); }
    if (n > best) best = n;
  }); });
  return best >= 6 ? 'block' : 'pillar';
}

// ---------- pack: counts per type, sorted candidates, pack PRNG picks ----------
// lim: { 'E-03': shield slots for it, 'E-08': ..., shield: shield slots usable by either, 'E-05': lanes, 'E-06': split slots }
function packCandidates(n, me10, lim, role, maxA, stage, P) {
  var pool = poolAt(stage), types = ORDER.filter(function (t) { return pool.indexOf(t) >= 0 && t !== 'E-01'; }), c = [];
  function hi(t) {
    var m = CAP[t] == null ? 99 : CAP[t];
    if (lim[t] != null) m = Math.min(m, lim[t]);
    if (role === 'Rec' && (t === 'E-04' || t === 'E-05' || t === 'E-07' || t === 'E-08')) m = Math.min(m, 1);   // a Recovery room is the rest beat: one of each heavy at most
    if (P.intro === t) m = Math.min(m, P.introN[1]);
    return m;
  }
  function lo(t) { return P.intro === t ? P.introN[0] : (P.must === t ? 1 : 0); }
  var mix = {};
  (function rec(i, left) {
    if (i === types.length) {
      var a = left; if (a < 1 || a > (maxA || 99)) return;   // at least one E-01
      mix['E-01'] = a;
      var nt = 0, me = 0, sh = (mix['E-03'] || 0) + (mix['E-08'] || 0);
      if (sh > lim.shield) return;
      Object.keys(mix).forEach(function (t) { if (mix[t]) { nt++; me += mix[t] * WEIGHT10[t]; } });
      if (nt < 3) return;
      if (n < 7 && n + (mix['E-06'] || 0) > BODY_MAX) return;   // one wave: the halves count
      var o = {}; POOL.forEach(function (t) { if (pool.indexOf(t) >= 0) o[t] = mix[t] || 0; });
      c.push({ mix: o, me10: me, cost: Math.abs(me - me10) });
      return;
    }
    var t = types[i];
    for (var k = lo(t); k <= Math.min(hi(t), left); k++) { mix[t] = k; rec(i + 1, left - k); }
    mix[t] = 0;
  })(0, n);
  if (!c.length) return c;
  // step 7: keep mixes within 0.1 ME of the target (was 0.3 with the 5-machine pool; the 8-machine pool has exact mixes for every row); else the closest ones
  var minCost = Math.min.apply(null, c.map(function (x) { return x.cost; })); c = c.filter(function (x) { return x.cost <= Math.max(PACK_TOL, minCost); });
  c.sort(function (p, q) { var a = JSON.stringify(p.mix), b = JSON.stringify(q.mix); return p.cost - q.cost || (a < b ? -1 : a > b ? 1 : 0); });
  return c;
}
function timesFor(n) {
  if (TIMES[n]) return TIMES[n];
  var w1 = Math.ceil(n / 2), t = [], i; for (i = 0; i < w1; i++) t.push(Math.floor(i / 2) * 2);
  for (i = 0; i < n - w1; i++) t.push(6 + Math.floor(i / 2) * 1.5);
  return t;
}
var TIMES = { 5: [0, 0, 2.5, 2.5, 5], 6: [0, 0, 2.5, 2.5, 5, 5], 7: [0, 0, 2, 2, 4.5, 4.5, 7], 8: [0, 0, 2, 2, 6, 6, 8, 8] };

function genCombat(stage, salt, tpls, uses) {
  var P = PLAN[stage], seed = HS.roomSeed(GENV, CHAPTER, stage);
  var rT = HS.stream(seed, salt, 'template'), rS = HS.stream(seed, salt, 'shift'), rW = HS.stream(seed, salt, 'swap'),
      rP = HS.stream(seed, salt, 'pack'), rN = HS.stream(seed, salt, 'spawn'), rE = HS.stream(seed, salt, 'elite');
  var cand = tpls.filter(function (t) { return !EXCLUDE[t.id] && t.unlock <= stage && t.roles.indexOf(P.role) >= 0 && (stage < 21 || t.slots.length >= Math.min(P.n + 2, 12)) && (P.haz > 0 ? t.haz_pct > 0 : t.haz_pct === 0); });
  if (!cand.length) return { why: ['no template'] };
  if (uses && salt < 4) {   // salts 0-3 prefer the least-used eligible templates so the pilot exercises all five; salts 4-7 take any
    var lo = Math.min.apply(null, cand.map(function (q) { return uses[q.id] || 0; }));
    cand = cand.filter(function (q) { return (uses[q.id] || 0) === lo; });
  }
  var t = cand[rT.int(cand.length)], shift = t.shifts[rS.int(t.shifts.length)], swap = rW.int(1 + t.swaps.length);
  var X = expand(t, shift, swap), rows = X.rows;
  // usable slots on the 9-col template: floor, not under 5 tiles from start, rows 1-10; also clear at every width after the real widen
  var def0 = { name: t.name, cover: coverLabel(rows), grid: ['####D####'].concat(rows, ['.........', '.........', '.........', '....S....']) };
  var slots = X.slots.filter(function (s) {
    if (def0.grid[s.y][s.x] === '#' || def0.grid[s.y][s.x] === '^') return false;
    return [9, 11, 13, 15].every(function (W) {
      var w = V.Widen.spawns([{ x: s.x + 0.5, y: s.y + 0.5 }], W, def0)[0], g = V.Widen.room(def0, W).grid, tx = Math.floor(w.x);
      return g[s.y][tx] !== '#' && g[s.y][tx] !== '^' && Math.hypot(w.x - W / 2, w.y - 14.5) >= 5;
    });
  });
  // pre-screen each (type, slot) with the net on a one-spawn room: only the slot-level checks count (room-level and count checks do not)
  var probes = {};
  function probeOk(ty, s) {
    var k = ty + '@' + s.x + ',' + s.y;
    if (probes[k] === undefined) {
      var res = NET.runNet({ kind: 'combat', stage: stage, room: def0, spawns: [{ type: ty, x: s.x + 0.5, y: s.y + 0.5, t: 0 }] }, NET.WIDTHS);
      var mine = CK.checkCombat(def0, [{ type: ty, x: s.x + 0.5, y: s.y + 0.5, t: 0 }], { n: 1, haz: P.haz, elite: false }).fails;
      probes[k] = !res.fails.some(function (f) { return /^(C1|C3|C4|C5|X1|X3|X4)$/.test(f.check); }) && !mine.some(function (f) { return /^(C1|C3|C4|C5|X1|X3|X4|SPLIT)@/.test(f); });
    }
    return probes[k];
  }
  var pool = poolAt(stage);
  function slotOk(ty, s) {   // slot kind per type (step 7: E-08 takes a shield-pocket slot like E-03; E-06 needs split room, which probeOk's SPLIT check reads; E-07 any floor slot)
    if (ty === 'E-03' || ty === 'E-08') return s.kind === 'shield';
    if (ty === 'E-05') return s.kind === 'lane' && Math.abs(s.x - 4) >= 2;
    if (ty === 'E-04' || ty === 'E-06') return s.kind !== 'shield';
    return true;
  }
  var lim = { shield: slots.filter(function (s) { return s.kind === 'shield' && (probeOk('E-03', s) || (pool.indexOf('E-08') >= 0 && probeOk('E-08', s))); }).length };
  ['E-03', 'E-05', 'E-06', 'E-08'].forEach(function (ty) { if (pool.indexOf(ty) >= 0) lim[ty] = slots.filter(function (s) { return slotOk(ty, s) && probeOk(ty, s); }).length; });
  var nEff = (stage > 20 && salt >= 8) ? P.n - 1 : P.n;   // late salts (8+) may take the low end of the CURVE band when the template has too few usable slots
  // pack target: the CURVE ME minus the elite add-on (each elite adds half its weight, about 0.5 ME, CURVE 2); intro rooms at most 0.8 x budget (CURVE intro rule)
  var tgt = (P.intro ? Math.round(P.me10 * INTRO_ME) : P.me10) - 5 * (P.elites || 0);
  var pk = packCandidates(nEff, tgt, lim, P.role, MAX_E01[stage], stage, P);
  if (!pk.length) return { why: ['no pack for ' + t.id] };
  var mix, used, list, pre, pi, failWhy = null, p0 = rP.int(pk.length), attempts = stage > 20 ? Math.min(pk.length, 12) : 1;   // stages 21+: if a pack does not fit the slots, try the next pack
  for (var at = 0; at < attempts; at++) {
  mix = pk[(p0 + at) % pk.length]; failWhy = null;
  // place: types in ORDER, each takes a random eligible slot (sorted by y,x); 1.5 apart
  used = []; list = []; pre = [];
  ORDER.forEach(function (ty) { for (var i = 0; i < (mix.mix[ty] || 0); i++) pre.push(ty); });
  for (pi = 0; pi < pre.length; pi++) {
    var ty = pre[pi];
    var el = slots.filter(function (s) {
      if (!slotOk(ty, s) || !probeOk(ty, s)) return false;
      if (used.some(function (u) { return u.x === s.x && u.y === s.y; })) return false;
      if (used.some(function (u) { return Math.hypot(u.x - s.x, u.y - s.y) < 1.5; })) return false;
      return true;
    });
    if (!el.length) { failWhy = { why: ['no slot for ' + ty], t: t, shift: shift, swap: swap }; break; }
    var s = el[rN.int(el.length)]; used.push(s); list.push({ type: ty, x: s.x, y: s.y });
  }
  if (!failWhy) break;
  }
  if (failWhy) return failWhy;
  // times: first spawn group at 0, later groups spaced; a 0.5 s jitter from the spawn PRNG on non-first spawns
  var waveSplit = nEff >= 7 ? (nEff <= 8 ? 4 : Math.ceil(nEff / 2)) : 0;
  if (waveSplit) {   // step 7: with two E-06 in a two-wave room, the second one opens wave 2 (each wave holds at most one splitter, BODY_MAX)
    var e6 = []; list.forEach(function (e, i) { if (e.type === 'E-06') e6.push(i); });
    if (e6.length === 2 && e6[1] < waveSplit) { var mv = list.splice(e6[1], 1)[0]; list.splice(waveSplit, 0, mv); }
  }
  var tt = timesFor(nEff), spawns = list.map(function (e, i) {
    var jit = i < 2 ? 0 : (rN.int(2) ? 0.5 : 0), o = { type: e.type, x: e.x + 0.5, y: e.y + 0.5, t: tt[i] + (i >= 2 && i !== waveSplit && i !== waveSplit + 1 ? jit : 0) };
    if (waveSplit && i >= waveSplit) o.wave = 2;
    return o;
  });
  if (stage >= ELITE_FROM) {   // elite stream: P.elites spawns of an ELITE_OK type get elite:true (replaces a normal slot, never E-01)
    for (var ei = 0; ei < (P.elites || 0); ei++) {
      var ec = spawns.filter(function (s) { return ELITE_OK[s.type] && !s.elite; });
      if (!ec.length) return { why: ['no elite-able machine'], t: t, shift: shift, swap: swap };
      ec[rE.int(ec.length)].elite = true;
    }
  }
  // grid with 'e' on the used slots (decoration, same as the built rooms)
  var g = def0.grid.map(function (r) { return r.split(''); });
  spawns.forEach(function (s) { g[Math.floor(s.y)][Math.floor(s.x)] = 'e'; });
  var room = { name: t.name, cover: def0.cover, grid: g.map(function (r) { return r.join(''); }), spawns: spawns.map(function (s) { return { type: s.type, x: s.x, y: s.y }; }) };
  var me = 0; spawns.forEach(function (s) { me += WEIGHT10[s.type] + (s.elite ? WEIGHT10[s.type] / 2 : 0); });
  return { t: t, shift: shift, swap: swap, room: room, spawns: spawns, mix: mix.mix, me10: me };
}

function validateCombat(stage, g, prev) {
  var P = PLAN[stage], why = [];
  if (g.why) return g.why;
  var spawns = g.spawns, counts = {}, tot = spawns.length;
  spawns.forEach(function (s) { counts[s.type] = (counts[s.type] || 0) + 1; });
  // C6
  if (tot < P.n - 1 || tot > P.n + 1) why.push('C6 count ' + tot + ' outside band');
  if (tot > 12) why.push('C6 over 12');
  var w1 = spawns.filter(function (s) { return !s.wave || s.wave === 1; }).length; if (w1 > 6) why.push('C6 wave 1 over 6 alive');
  if (spawns.length - w1 > 6) why.push('C6 wave 2 over 6 alive');
  Object.keys(counts).forEach(function (k) {
    if (poolAt(stage).indexOf(k) < 0) why.push('C6 ' + k + ' not in the pool at stage ' + stage);
    if (CAP[k] && counts[k] > CAP[k]) why.push('C6 cap ' + k);
  });
  if (stage < ELITE_FROM && spawns.some(function (s) { return s.elite; })) why.push('C6 elite before 22');
  if (P.intro && spawns.some(function (s) { return s.elite; })) why.push('INTRO elite in an intro room');
  if (P.intro && ((counts[P.intro] || 0) < P.introN[0] || (counts[P.intro] || 0) > P.introN[1])) why.push('INTRO ' + P.intro + ' x' + (counts[P.intro] || 0) + ' outside ' + P.introN.join('-'));
  if (P.must && !counts[P.must]) why.push('INTRO ' + P.must + ' must appear again within 2 stages of its intro');
  spawns.forEach(function (s) { if (s.elite && !ELITE_OK[s.type]) why.push('C6 elite ' + s.type + ' not elite-able'); });
  [1, 2].forEach(function (w) { var ws = spawns.filter(function (s) { return (s.wave || 1) === w; }), b = ws.length + ws.filter(function (s) { return s.type === 'E-06'; }).length; if (b > BODY_MAX) why.push('BODY wave ' + w + ' holds ' + b + ' bodies with E-06 halves (max ' + BODY_MAX + ')'); });
  var chk = CK.checkCombat(g.room, spawns, { n: P.n, haz: P.haz, elite: !!P.elites });
  chk.fails.forEach(function (f) { if (why.length < 6) why.push(f); });
  // C9 adjacency (template twice in a row, equal rooms) and spike after spike
  if (prev) {
    if (prev.templateId === g.t.id) why.push('C9 same template as the previous combat room');
    if (prev.templateId === g.t.id && prev.shift === g.shift && prev.swap === g.swap && JSON.stringify(prev.mix) === JSON.stringify(g.mix)) why.push('C9 equal to the previous room');
    if (prev.haz && P.haz) why.push('C9 spike room after a spike room');
  }
  netFails('combat', stage, g.room, spawns).forEach(function (f) { if (why.length < 8) why.push(f); });
  g.info = chk.info;
  return why;
}

// ---------- boss arena (hand-shaped data, new cover layout; checked by check.js and by the corner-shooter bot run) ----------
var BA2 = { name: 'Boss Arena II', cover: 'pillar', grid: [
  '####D####',
  '.........',
  '.........',
  '....B....',
  '.........',
  '.........',
  '#.......#',
  '#.......#',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [{ type: 'B-01', x: 4.5, y: 3.5 }] };

// BA3 (stage 30): an L of three 1x1 posts each side. Step 7 (B2 review): moved from the top corners ((1,1) (2,1) (1,3)), which left a hop-safe pocket
// at (0,1)-(0,2) that no B-02 landing ring reaches at 9 columns, to the side walls at (0,4) (1,4) (0,5): no pocket at any width (check.js HOPSAFE)
var BA3 = { name: 'Boss Arena III', cover: 'pillar', grid: [
  '####D####',
  '.........',
  '.........',
  '....B....',
  '##.....##',
  '#.......#',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [{ type: 'B-01', x: 4.5, y: 3.5 }] };
// BA4 (stage 40): a diagonal of three 1x1 posts each side. Step 7: moved up from (2,4) (1,5) (0,6) to (2,1) (1,2) (0,3) so B-03V has roll lanes (LANE 26-44 -> 89-96 percent)
var BA4 = { name: 'Boss Arena IV', cover: 'pillar', grid: [
  '####D####',
  '..#...#..',
  '.#.....#.',
  '#...B...#',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [{ type: 'B-01', x: 4.5, y: 3.5 }] };
// BA5 (stage 50): single posts at (1,1), (0,5) and (0,10) each side
var BA5 = { name: 'Boss Arena V', cover: 'pillar', grid: [
  '####D####',
  '.#.....#.',
  '.........',
  '....B....',
  '.........',
  '#.......#',
  '.........',
  '.........',
  '.........',
  '.........',
  '#.......#',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [{ type: 'B-01', x: 4.5, y: 3.5 }] };
var ARENAS = { BA2: BA2, BA3: BA3, BA4: BA4, BA5: BA5 };
// Step 7: BA2's two 1x2 posts moved from columns 1 and 7 to the side walls (columns 0 and 8) so B-03 has roll lanes (LANE 40-56 -> 57-83 percent).
var ARENA_NOTE = { BA2: 'cover layout BA2: two 1x2 posts on the side walls, columns 0 and 8, rows 6-7; open roll lanes from the boss to most of the floor',
  BA3: 'cover layout BA3: an L of three 1x1 posts on each side wall, columns 0-1 at row 4 and column 0 at row 5, mirrored', BA4: 'cover layout BA4: a diagonal of three 1x1 posts in each top corner at (2,1), (1,2), (0,3), mirrored',
  BA5: 'cover layout BA5: 1x1 posts at (1,1), (0,5) and (0,10), mirrored' };

// ---------- the bake ----------
function bake() {
  var D = V.Data, tpls = loadTemplates(), log = [];
  // T01-T03 must equal the built room shapes (grid rows 1-10, 'e' -> '.')
  [['T01', 'R01'], ['T02', 'R02'], ['T03', 'R03']].forEach(function (p) {
    var t = tpls.filter(function (x) { return x.id === p[0]; })[0];
    var b = D.rooms[p[1]].grid.slice(1, 11).map(function (r) { return r.replace(/e/g, '.'); });
    if (JSON.stringify(b) !== JSON.stringify(t.grid)) throw new Error(p[0] + ' differs from built ' + p[1]);
  });
  var rooms = {}, rows = [], meta = [], prev = null, uses = {};
  var built = D.stages.ch1.slice(0, 10).map(function (s) { return JSON.parse(JSON.stringify(s)); });
  Object.keys(PLAN).forEach(function (k) {
    var stage = +k, P = PLAN[stage], row, id = 'c1s' + stage + 'v0', m = { chapter: CHAPTER, stage: stage, genVersion: GENV };
    if (P.kind === 'supply') {
      row = JSON.parse(JSON.stringify(D.stages.ch1[4])); row.stage = stage;
      m.templateId = 'SD'; m.room = 'SD'; m.shift = 0; m.swap = 0; m.salt = 0; m.machines = {}; m.ME = 0;
    } else if (P.kind === 'cache') {
      row = JSON.parse(JSON.stringify(D.stages.ch1[8])); row.stage = stage;
      m.templateId = 'CA1'; m.room = 'CA1'; m.shift = 0; m.swap = 0; m.salt = 0; m.machines = { 'E-01': 2 }; m.ME = 1.4;
    } else if (P.kind === 'boss') {
      var A0 = ARENAS[P.arena], BT = P.boss || 'B-01', AR = { name: A0.name, cover: A0.cover, grid: A0.grid.slice(), spawns: [{ type: BT, x: 4.5, y: 3.5 }] };
      var br = (V.Data.enemies[BT] && V.Data.enemies[BT].r) || 1, bc = CK.checkBoss(AR, AR.spawns, BT, br);
      var bn = netFails('boss', stage, AR, AR.spawns);
      if (bc.fails.length || bn.length) throw new Error('boss arena ' + P.arena + ' with ' + BT + ' fails: ' + bc.fails.concat(bn).join('; '));
      rooms[id] = AR;
      row = { stage: stage, kind: 'boss', room: id, note: 'Boss ' + BOSS_NAME[BT] + ' (' + ARENA_NOTE[P.arena] + ')', spawns: [{ type: BT, x: 4.5, y: 3.5, t: 0 }] };
      m.templateId = P.arena; m.room = id; m.shift = 0; m.swap = 0; m.salt = 0; m.machines = {}; m.machines[BT] = 1; m.ME = 0; m.boss = BT; m.bossR = br; m.arenaInfo = bc.info;
    } else {
      var salt, g, why = [], won = null;
      for (salt = 0; salt < (stage > 20 ? MAX_TRIES2 : MAX_TRIES); salt++) {
        g = genCombat(stage, salt, tpls, uses); why = validateCombat(stage, g, prev);
        log.push('stage ' + stage + ' salt ' + salt + (why.length ? ' FAIL ' + why.join(' | ') : ' ok ' + g.t.id));
        if (!why.length) { won = salt; break; }
      }
      if (won === null) { console.error(log.join('\n')); console.error('BAKE FAILED: stage ' + stage + ' failed all ' + (stage > 20 ? MAX_TRIES2 : MAX_TRIES) + ' rolls'); process.exit(1); }
      rooms[id] = g.room;
      var mixTxt = POOL.slice().filter(function (q) { return g.mix[q]; }).map(function (q) { return g.mix[q] + 'x' + q; }).join(' ');
      row = { stage: stage, kind: 'combat', room: id, note: 'Baked ' + g.t.id + ' ' + g.t.name + ' (' + P.role + ', ' + g.spawns.length + ' machines: ' + mixTxt + ')' + (P.haz ? ', H1 spikes' : '') + (P.elites ? ', ' + P.elites + ' elite' : '') + (P.intro ? '; intro ' + P.intro : '') + (P.subst ? '; CURVE intro ' + P.subst : ''), spawns: g.spawns };
      m.templateId = g.t.id; m.room = id; m.shift = g.shift; m.swap = g.swap; m.salt = won; m.machines = JSON.parse(JSON.stringify(g.mix)); m.ME = g.me10 / 10;
      Object.keys(m.machines).forEach(function (q) { if (!m.machines[q]) delete m.machines[q]; });
      m.role = P.role; m.widths = g.info; m.meTarget = P.me10 / 10; m.curveHaz = P.curveHaz || P.haz; m.bakedHaz = P.haz; m.elites = P.elites || 0;
      if (P.intro) { m.intro = P.intro; m.meCap = Math.round(P.me10 * INTRO_ME) / 10; }
      if (P.must) m.mustAppear = P.must;
      if (P.subst) m.substitution = P.subst;
      if (Math.abs(g.me10 / 10 - (m.meCap || P.me10 / 10)) > 0.35) m.meNote = 'closest mix the pool and slots allow';
      uses[g.t.id] = (uses[g.t.id] || 0) + 1;
      prev = { templateId: g.t.id, shift: g.shift, swap: g.swap, mix: g.mix, haz: P.haz };
    }
    m.hash = HS.sha256(HS.canon({ room: rooms[id] || m.room, row: row }));
    rows.push(row); meta.push(m);
  });
  var data = { genVersion: GENV, rooms: rooms, stages: rows };
  var hash = HS.sha256(HS.canon(data));
  return { data: data, meta: meta, hash: hash, log: log, built: built };
}

function num(v) { return String(v); }
function emitPart(b) {
  var L = [];
  L.push("(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};");
  L.push('// GENERATED by src/tools/bake/bake.js (genVersion ' + GENV + '). Do not edit by hand: re-run the bake. Chapter 1 stages 11-50, baked offline (GEN-SPEC steps 3 and 6).');
  L.push("// Appends rows 11-50 to V.Data.stages.ch1 and the rooms c1s{stage}v0 to V.Data.rooms (same object as V.ROOMS). Stages 15, 25, 35, 45 reuse room SD; 19, 29, 39, 49 reuse CA1.");
  L.push("// Spawn: {type,x,y,t} as built, plus optional wave (absent = 1) and elite:true. Hash of the data below: src/bake.hash. Meta (template, shift, swap, salt, mix, ME): src/bake-meta.json.");
  L.push("if (!(V.Data && V.Data.stages) && typeof require === 'function' && typeof module !== 'undefined') require('./data-stages.js');");
  L.push('var D = V.Data;');
  L.push('var ROOMS = {');
  var ids = Object.keys(b.data.rooms);
  ids.forEach(function (id, i) {
    var r = b.data.rooms[id];
    L.push("  " + id + ": { name:" + JSON.stringify(r.name).replace(/"/g, "'") + ", cover:'" + r.cover + "', grid:[");
    r.grid.forEach(function (row, j) { L.push("    '" + row + "'" + (j < r.grid.length - 1 ? ',' : '],')); });
    L.push('    spawns:[' + r.spawns.map(function (s) { return "{type:'" + s.type + "',x:" + num(s.x) + ',y:' + num(s.y) + '}'; }).join(',') + '] }' + (i < ids.length - 1 ? ',' : ''));
  });
  L.push('};');
  L.push('var ROWS = [');
  b.data.stages.forEach(function (s, i) {
    L.push('  { stage:' + s.stage + ", kind:'" + s.kind + "', room:'" + s.room + "', note:" + JSON.stringify(s.note) + ',');
    L.push('    spawns:[' + s.spawns.map(function (e) { return "{type:'" + e.type + "',x:" + num(e.x) + ',y:' + num(e.y) + ',t:' + num(e.t) + (e.wave ? ',wave:' + e.wave : '') + (e.elite ? ',elite:true' : '') + '}'; }).join(',') + '] }' + (i < b.data.stages.length - 1 ? ',' : ''));
  });
  L.push('];');
  L.push("if (!D.rooms.c1s11v0) {   // idempotent: a second load adds nothing");
  L.push("  for (var k in ROOMS) D.rooms[k] = ROOMS[k];");
  L.push("  ROWS.forEach(function(r){ D.stages.ch1.push(r); });");
  L.push('}');
  L.push("D.bake = { genVersion:" + GENV + ", hash:'" + b.hash + "' };");
  L.push('})();');
  return L.join('\n') + '\n';
}
function emitMeta(b) {
  return JSON.stringify({ genVersion: GENV, chapter: CHAPTER, hash: b.hash, pool: POOL_FROM, rooms: b.meta }, null, 1) + '\n';
}

if (require.main === module) {
  var check = process.argv.indexOf('--check') >= 0, b = bake();
  console.error('bake: parts loaded [' + LOADED.join(',') + ']; provisional rows [' + PROVISIONAL.join(',') + ']; net tables extended in memory [' + NET_PATCHED.join(',') + ']');
  var fPart = path.join(SRC, 'parts/data-stages-gen.js'), fMeta = path.join(SRC, 'bake-meta.json'), fHash = path.join(SRC, 'bake.hash');
  var part = emitPart(b), meta = emitMeta(b);
  if (check) {
    var bad = [];
    if (!fs.existsSync(fPart) || fs.readFileSync(fPart, 'utf8') !== part) bad.push('parts/data-stages-gen.js differs from a fresh bake');
    if (!fs.existsSync(fMeta) || fs.readFileSync(fMeta, 'utf8') !== meta) bad.push('bake-meta.json differs from a fresh bake');
    if (!fs.existsSync(fHash) || fs.readFileSync(fHash, 'utf8').trim() !== b.hash) bad.push('bake.hash differs from a fresh bake');
    // the hash must also match the data as loaded from the part (not just the bake in memory)
    delete globalThis.V.Data.bake;
    require(fPart);
    var D = globalThis.V.Data, loaded = { genVersion: GENV, rooms: {}, stages: D.stages.ch1.slice(10) };
    Object.keys(D.rooms).filter(function (k) { return /^c1s\d+v0$/.test(k); }).forEach(function (k) { loaded.rooms[k] = D.rooms[k]; });
    if (HS.sha256(HS.canon(loaded)) !== b.hash) bad.push('loaded data-stages-gen.js hashes differently from bake.hash');
    if (bad.length) { console.error('BAKE CHECK FAILED\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('BAKE CHECK OK ' + b.hash);
  } else {
    fs.writeFileSync(fPart, part); fs.writeFileSync(fMeta, meta); fs.writeFileSync(fHash, b.hash + '\n');
    console.log(b.log.join('\n')); console.log('baked ' + b.data.stages.length + ' stages, hash ' + b.hash);
  }
}
module.exports = { LOADED: LOADED, PROVISIONAL: PROVISIONAL, NET_PATCHED: function () { return NET_PATCHED; }, POOL_FROM: POOL_FROM, WEIGHT10: WEIGHT10, bake: bake, emitPart: emitPart, BA2: BA2, ARENAS: ARENAS, PLAN: PLAN, genCombat: genCombat, validateCombat: validateCombat, loadTemplates: loadTemplates, CK: CK };
