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

// Agent D's static net (src/test-gen-net.js) is the bake's main check. That file is a script with no exports, so load its text up to the
// fixture phase (the net function, thresholds and helpers) and call runNet on each candidate room. Missing file = bake exits non-zero.
var NET = (function () {
  var f = path.join(SRC, 'test-gen-net.js');
  if (!fs.existsSync(f)) { console.error('src/test-gen-net.js not found: the bake needs the static net as its check'); process.exit(1); }
  var txt = fs.readFileSync(f, 'utf8'), cut = txt.indexOf("var good = loadDir('good')");
  if (cut < 0) { console.error('src/test-gen-net.js: cannot find the fixture phase marker'); process.exit(1); }
  return new Function('require', '__dirname', 'process', txt.slice(0, cut) + '\nreturn { runNet: runNet, group: group, line: line, WIDTHS: WIDTHS };')(require, SRC, process);
})();
function netFails(kind, stage, room, spawns) {
  var res = NET.runNet({ kind: kind, stage: stage, room: room, spawns: spawns }, NET.WIDTHS);
  return NET.group(res.fails).map(function (g) { return 'NET ' + NET.line(g); });
}

var WEIGHT10 = { 'E-01': 7, 'E-02': 10, 'E-03': 10, 'E-04': 13, 'E-05': 13 };   // threat weights x10 (CURVE section 2)
var POOL = ['E-01', 'E-02', 'E-03', 'E-04', 'E-05'];                           // pilot pool: E-06 to E-08 do not exist in code yet
var CAP = { 'E-02': 4, 'E-03': 2, 'E-04': 2, 'E-05': 2 };                      // CURVE type caps (E-03 cap 2 is mine, no sniper in the pool)
var ORDER = ['E-03', 'E-04', 'E-02', 'E-01', 'E-05'];                          // anchors first, chargers last
// CURVE section 3, Ch1 rows 11-50: role, n (band n-1..n+1), ME target (x10), hazard level BAKED, elite slots, curveHaz = hazard level CURVE asks for.
// Hazard policy (GEN-SPEC 3.2: spikes only in spike templates T05, T10 (Spk only) and T11 (Bld/Prs); C9 forbids a spike room after a spike room and more than 10 uses):
// R63: the Spk beat rooms (18, 28, 38, 48) are baked with spikes, plus the Bld/Prs rooms in HAZ_BP. CURVE marks H1/H2 in 12 Bld/Prs rooms (22-24, 27, 32-34, 37, 42-44, 47) but
// C9 allows no spike room after a spike room, and 27, 37, 47 sit right before a Spk room (28, 38, 48), so the first and third room of each 22-24, 32-34, 42-44 run take spikes
// and 23, 33, 43, 27, 37, 47 stay H0. The meta records curveHaz and bakedHaz.
var PLAN = {
  11: { kind: 'combat', role: 'Rec', n: 5, me10: 50, haz: 0, intro: 'E-06 (not in code: baked with E-01 to E-05)' },
  12: { kind: 'combat', role: 'Bld', n: 5, me10: 50, haz: 0 },
  13: { kind: 'combat', role: 'Bld', n: 6, me10: 60, haz: 0, intro: 'E-08 (not in code: baked with E-01 to E-05)' },
  14: { kind: 'combat', role: 'Prs', n: 7, me10: 70, haz: 0 },
  15: { kind: 'supply' },
  16: { kind: 'combat', role: 'Rec', n: 5, me10: 50, haz: 0, intro: 'E-07 (not in code: baked with E-01 to E-05)' },
  17: { kind: 'combat', role: 'Bld', n: 6, me10: 60, haz: 0 },
  18: { kind: 'combat', role: 'Spk', n: 8, me10: 80, haz: 1 },
  19: { kind: 'cache' },
  20: { kind: 'boss', arena: 'BA2' }
};
// [stage, n, me10, curveHaz, elites, intro]
[[21, 5, 50, 0, 0, 'E-09 (not in code: baked with E-01 to E-05)'], [22, 7, 75, 1, 1], [23, 8, 80, 1, 0], [24, 9, 90, 1, 0], [26, 6, 60, 0, 0], [27, 7, 75, 1, 1], [28, 10, 100, 2, 0],
 [31, 6, 60, 0, 0], [32, 9, 90, 1, 0], [33, 10, 105, 1, 1], [34, 11, 110, 2, 0], [36, 7, 70, 0, 0], [37, 8, 85, 1, 1], [38, 11, 110, 2, 0],
 [41, 7, 70, 0, 0], [42, 10, 100, 1, 0], [43, 10, 110, 1, 2], [44, 11, 110, 2, 0], [46, 8, 80, 0, 0], [47, 10, 100, 1, 0], [48, 11, 120, 1, 2]].forEach(function (r) {
  var role = ['Rec', 'Bld', 'Bld', 'Prs', '', 'Rec', 'Bld', 'Spk'][(r[0] - 1) % 10];
  PLAN[r[0]] = { kind: 'combat', role: role, n: r[1], me10: r[2], haz: role === 'Spk' ? 1 : 0, curveHaz: r[3], elites: r[4], intro: r[5] };
});
var HAZ_BP = { 22: 1, 24: 1, 32: 1, 42: 1, 44: 1 };
Object.keys(HAZ_BP).forEach(function (s) { PLAN[s].haz = 1; });
[25, 35, 45].forEach(function (s) { PLAN[s] = { kind: 'supply' }; });
[29, 39, 49].forEach(function (s) { PLAN[s] = { kind: 'cache' }; });
PLAN[30] = { kind: 'boss', arena: 'BA3' }; PLAN[40] = { kind: 'boss', arena: 'BA4' }; PLAN[50] = { kind: 'boss', arena: 'BA5' };
var EXCLUDE = { T01: 1 };   // QA D3: the cover-less Open Yard is not used for stages 11-20 (stages 1-9 keep R01)
var MAX_E01 = { 14: 3 };    // QA D4: stage 14 holds at most 3 chasers
var ELITE_FROM = 22;   // Ch1 R40: no elite before stage 22
var ELITE_OK = { 'E-02': 1, 'E-03': 1, 'E-04': 1, 'E-05': 1 };   // sim/model.js ELITE_OK, limited to the pool

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
function packCandidates(n, me10, shieldN, laneN, role, maxA) {
  var c = [], a, b, d, e, f;
  var m3 = Math.min(CAP['E-03'], shieldN), m5 = Math.min(CAP['E-05'], laneN), m4 = CAP['E-04'];
  if (role === 'Rec') { m4 = 1; m5 = Math.min(m5, 1); }   // a Recovery room is the rest beat: at most one mortar, one charger
  for (b = 0; b <= CAP['E-02']; b++) for (d = 0; d <= m3; d++) for (e = 0; e <= m4; e++) for (f = 0; f <= m5; f++) {
    a = n - b - d - e - f; if (a < 1 || a > (maxA || 99)) continue;                  // at least one E-01
    var types = (a > 0) + (b > 0) + (d > 0) + (e > 0) + (f > 0); if (types < 3) continue;
    var me = a * 7 + b * 10 + d * 10 + e * 13 + f * 13, cost = Math.abs(me - me10);
    c.push({ mix: { 'E-01': a, 'E-02': b, 'E-03': d, 'E-04': e, 'E-05': f }, me10: me, cost: cost });
  }
  // keep mixes within 0.3 ME of the target; the pool (E-01 to E-05) cannot reach the high CURVE ME rows, so then keep the closest ones
  var minCost = Math.min.apply(null, c.map(function (x) { return x.cost; })); c = c.filter(function (x) { return x.cost <= Math.max(3, minCost); });
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
      probes[k] = !res.fails.some(function (f) { return /^(C1|C3|C4|C5|X1|X3|X4)$/.test(f.check); }) && !mine.some(function (f) { return /^(C1|C3|C4|C5|X1|X3|X4)@/.test(f); });
    }
    return probes[k];
  }
  var shieldN = slots.filter(function (s) { return s.kind === 'shield' && probeOk('E-03', s); }).length, laneN = slots.filter(function (s) { return s.kind === 'lane' && Math.abs(s.x - 4) >= 2 && probeOk('E-05', s); }).length;
  var nEff = (stage > 20 && salt >= 8) ? P.n - 1 : P.n;   // late salts (8+) may take the low end of the CURVE band when the template has too few usable slots
  var pk = packCandidates(nEff, P.me10, shieldN, laneN, P.role, MAX_E01[stage]);
  if (!pk.length) return { why: ['no pack for ' + t.id] };
  var mix, used, list, pre, pi, failWhy = null, p0 = rP.int(pk.length), attempts = stage > 20 ? Math.min(pk.length, 12) : 1;   // stages 21+: if a pack does not fit the slots, try the next pack
  for (var at = 0; at < attempts; at++) {
  mix = pk[(p0 + at) % pk.length]; failWhy = null;
  // place: types in ORDER, each takes a random eligible slot (sorted by y,x); 1.5 apart
  used = []; list = []; pre = [];
  ORDER.forEach(function (ty) { for (var i = 0; i < mix.mix[ty]; i++) pre.push(ty); });
  for (pi = 0; pi < pre.length; pi++) {
    var ty = pre[pi];
    var el = slots.filter(function (s) {
      if (!probeOk(ty, s)) return false;
      if (used.some(function (u) { return u.x === s.x && u.y === s.y; })) return false;
      if (used.some(function (u) { return Math.hypot(u.x - s.x, u.y - s.y) < 1.5; })) return false;
      if (ty === 'E-03') return s.kind === 'shield';
      if (ty === 'E-05') return s.kind === 'lane' && Math.abs(s.x - 4) >= 2;
      if (ty === 'E-04') return s.kind !== 'shield';
      return true;
    });
    if (!el.length) { failWhy = { why: ['no slot for ' + ty], t: t, shift: shift, swap: swap }; break; }
    var s = el[rN.int(el.length)]; used.push(s); list.push({ type: ty, x: s.x, y: s.y });
  }
  if (!failWhy) break;
  }
  if (failWhy) return failWhy;
  // times: first spawn group at 0, later groups spaced; a 0.5 s jitter from the spawn PRNG on non-first spawns
  var tt = timesFor(nEff), waveSplit = nEff >= 7 ? (nEff <= 8 ? 4 : Math.ceil(nEff / 2)) : 0, spawns = list.map(function (e, i) {
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
    if (POOL.indexOf(k) < 0) why.push('C6 ' + k + ' not in the pilot pool');
    if (CAP[k] && counts[k] > CAP[k]) why.push('C6 cap ' + k);
  });
  if (stage < ELITE_FROM && spawns.some(function (s) { return s.elite; })) why.push('C6 elite before 22');
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
  '.#.....#.',
  '.#.....#.',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [{ type: 'B-01', x: 4.5, y: 3.5 }] };

// BA3 (stage 30): top corners, an L of three 1x1 posts each side (columns 1-2 at row 1, column 1 at row 3)
var BA3 = { name: 'Boss Arena III', cover: 'pillar', grid: [
  '####D####',
  '.##...##.',
  '.........',
  '.#..B..#.',
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
// BA4 (stage 40): a diagonal of three 1x1 posts each side, (2,4) (1,5) (0,6)
var BA4 = { name: 'Boss Arena IV', cover: 'pillar', grid: [
  '####D####',
  '.........',
  '.........',
  '....B....',
  '..#...#..',
  '.#.....#.',
  '#.......#',
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
var ARENA_NOTE = { BA2: 'cover layout BA2: two 1x2 posts at columns 1 and 7, rows 6-7; the boss is in line from the whole centre and most of the floor',
  BA3: 'cover layout BA3: an L of three 1x1 posts in each top corner, columns 1-2 at row 1 and column 1 at row 3, mirrored', BA4: 'cover layout BA4: a diagonal of three 1x1 posts each side at (2,4), (1,5), (0,6), mirrored',
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
      var AR = ARENAS[P.arena], bc = CK.checkBoss(AR, AR.spawns);
      var bn = netFails('boss', stage, AR, AR.spawns);
      if (bc.fails.length || bn.length) throw new Error('boss arena ' + P.arena + ' fails: ' + bc.fails.concat(bn).join('; '));
      rooms[id] = AR;
      row = { stage: stage, kind: 'boss', room: id, note: 'Boss B-01 Volley Tower reused in a new arena (' + ARENA_NOTE[P.arena] + ')', spawns: [{ type: 'B-01', x: 4.5, y: 3.5, t: 0 }] };
      m.templateId = P.arena; m.room = id; m.shift = 0; m.swap = 0; m.salt = 0; m.machines = { 'B-01': 1 }; m.ME = 0;
    } else {
      var salt, g, why = [], won = null;
      for (salt = 0; salt < (stage > 20 ? MAX_TRIES2 : MAX_TRIES); salt++) {
        g = genCombat(stage, salt, tpls, uses); why = validateCombat(stage, g, prev);
        log.push('stage ' + stage + ' salt ' + salt + (why.length ? ' FAIL ' + why.join(' | ') : ' ok ' + g.t.id));
        if (!why.length) { won = salt; break; }
      }
      if (won === null) { console.error(log.join('\n')); console.error('BAKE FAILED: stage ' + stage + ' failed all ' + (stage > 20 ? MAX_TRIES2 : MAX_TRIES) + ' rolls'); process.exit(1); }
      rooms[id] = g.room;
      var mixTxt = ORDER.slice().sort().filter(function (q) { return g.mix[q]; }).map(function (q) { return g.mix[q] + 'x' + q; }).join(' ');
      row = { stage: stage, kind: 'combat', room: id, note: 'Baked ' + g.t.id + ' ' + g.t.name + ' (' + P.role + ', ' + g.spawns.length + ' machines: ' + mixTxt + ')' + (P.haz ? ', H1 spikes' : '') + (P.elites ? ', ' + P.elites + ' elite' : '') + (P.intro ? '; CURVE intro ' + P.intro : ''), spawns: g.spawns };
      m.templateId = g.t.id; m.room = id; m.shift = g.shift; m.swap = g.swap; m.salt = won; m.machines = JSON.parse(JSON.stringify(g.mix)); m.ME = g.me10 / 10;
      Object.keys(m.machines).forEach(function (q) { if (!m.machines[q]) delete m.machines[q]; });
      m.role = P.role; m.widths = g.info; m.meTarget = P.me10 / 10; m.curveHaz = P.curveHaz || P.haz; m.bakedHaz = P.haz; m.elites = P.elites || 0;
      if (P.intro) m.substitution = P.intro;
      if (g.me10 / 10 < P.me10 / 10 - 0.35) m.meNote = 'pool E-01 to E-05 cannot reach the CURVE ME';
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
  return JSON.stringify({ genVersion: GENV, chapter: CHAPTER, hash: b.hash, rooms: b.meta }, null, 1) + '\n';
}

if (require.main === module) {
  var check = process.argv.indexOf('--check') >= 0, b = bake();
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
module.exports = { bake: bake, emitPart: emitPart, BA2: BA2, ARENAS: ARENAS, PLAN: PLAN, genCombat: genCombat, validateCombat: validateCombat, loadTemplates: loadTemplates, CK: CK };
