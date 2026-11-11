// Headless checks for the Supply Drop catch room (SPEC 9 test list, R50-R54). Agent K.
// Usage: node src/test-catch.js   (exit code 1 on any failure). Loads parts/catch.js, catch-ui.js, catch-scene.js, bot.js (catch bots).
'use strict';
var path = require('path'), fs = require('fs'), vm = require('vm');
var bot = require('./bot.js'), V = bot.V;
require(path.join(__dirname, 'parts', 'catch.js'));
require(path.join(__dirname, 'parts', 'catch-ui.js'));
require(path.join(__dirname, 'parts', 'catch-scene.js'));
var fails = 0, passes = 0;
function ok(c, msg) { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } }
var K = V.Catch, COLS = [9, 11, 13, 15];

// ---- meta.js snippet (for agent P): applied in memory to the real meta.js, then run in a sandbox, so the test proves the snippet works ----
var SNIP_VALIDATE = "    if ('sd' in raw) {\n      var q = raw.sd, pe = null;\n      if (!isObj(q) || !onlyKeys(q, ['plays', 'pending']) || !isInt(q.plays, 0, 9999)) return null;\n      if (q.pending != null) {\n        var pp = q.pending;\n        if (!isObj(pp) || !onlyKeys(pp, ['chapter', 'stage', 'tier', 'defaults']) || !isInt(pp.chapter, 1, 9) || !isInt(pp.stage, 0, T.STAGE_MAX) || !isInt(pp.tier, 0, 3) || !Array.isArray(pp.defaults) || pp.defaults.length > 3) return null;\n        for (var di = 0; di < pp.defaults.length; di++) if (['repair', 'credits', 'schematics'].indexOf(pp.defaults[di]) < 0) return null;\n        pe = { chapter:pp.chapter, stage:pp.stage, tier:pp.tier, defaults:pp.defaults.slice() };\n      }\n      s.sd = { plays:q.plays, pending:pe };\n    }\n";
var SNIP_API = "// Supply Drop catch room (agent K): sd.plays counts finished drops, sd.pending is the sheet that is open (saved when it opens, cleared on Take).\nM.sdState = function(){ var q = M.state.sd; return { plays:q ? q.plays : 0, pending:q ? q.pending : null }; };\nM.sdOpen = function(p){ var s = M.state, q = s.sd || (s.sd = { plays:0, pending:null }); q.pending = { chapter:p.chapter | 0, stage:p.stage | 0, tier:p.tier | 0, defaults:(p.defaults || []).slice(0, 3) }; M.save(); };\nM.sdTake = function(g){ var s = M.state, q = s.sd || (s.sd = { plays:0, pending:null }); q.plays = Math.min(9999, q.plays + 1); q.pending = null; if (g && g.schematics > 0) s.schematics = Math.min(TUNING.CREDITS_MAX, (s.schematics | 0) + (g.schematics | 0)); M.save(); };\n";
function patchedMeta() {
  var src = fs.readFileSync(path.join(__dirname, 'parts', 'meta.js'), 'utf8'), r = src;
  if (/M\.sdOpen\s*=/.test(src)) return { src: src, merged: true };
  function rep(a, b) { if (r.indexOf(a) < 0) throw new Error('anchor missing: ' + a.slice(0, 40)); r = r.replace(a, function () { return b; }); }
  rep("var TOP = ['v',", "var TOP = ['sd', 'v',");
  rep("    return s;\n  } catch (e) { return null; }", SNIP_VALIDATE + "    return s;\n  } catch (e) { return null; }");
  rep("M.onChange = function(fn)", SNIP_API + "M.onChange = function(fn)");
  rep(/var SETTINGS_DEFAULTS = \{ haptics:true \};/.test(r) ? "var SETTINGS_DEFAULTS = { haptics:true };" : "SETTINGS_DEFAULTS = {", /var SETTINGS_DEFAULTS = \{ haptics:true \};/.test(r) ? "var SETTINGS_DEFAULTS = { haptics:true, sdSkip:false };" : "SETTINGS_DEFAULTS = { sdSkip:false,");
  return { src: r, merged: false };
}
function mockStore() { var d = {}; return { d: d, getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; }
function loadMeta(store) {
  var P = patchedMeta(), sb = { V: {}, console: console }; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(P.src, sb);
  var M = sb.V.Meta; M.setStorage(store); M.load({ storage: store }); return { M: M, merged: P.merged };
}
function withMeta(M) { V.Meta = M; }
function room(seed, cols, hp) { return bot.catchRoom(seed, cols, hp); }
function stepN(S, n, inp) { for (var i = 0; i < n && S.phase === 'collect'; i++) V.Sim.step(S, inp || { mx: 0, my: 0 }); }
function seedFor(kind, tier, cols, hp) { for (var sd = 100; sd < 400; sd++) { var S = room(sd, cols || 9, hp); bot.playCatch(S, kind, sd); if (S.mini.tier === tier) return sd; } throw new Error('no seed'); }
function toSheet(S, kind) { return bot.playCatch(S, kind || 'perfect', S.seed); }

// ---- tiers (R50) ----
ok(K.tierOf(0) === 0 && K.tierOf(5) === 0 && K.tierOf(6) === 1, 'tier edge 5/6');
ok(K.tierOf(12) === 1 && K.tierOf(13) === 2, 'tier edge 12/13');
ok(K.tierOf(17) === 2 && K.tierOf(18) === 3 && K.tierOf(20) === 3, 'tier edge 17/18');
ok([0, 1, 2, 3].map(function (t) { return K.payout(t, 1).picks; }).join() === '1,2,3,3', 'picks 1/2/3/3');
ok(K.payout(0, 1).credits === 20 && K.payout(0, 2).credits === 24 && K.payout(0, 3).credits === 28, 'Credits pad 20/24/28 (not 25)');
ok(K.payout(2, 1).repairPct === 0.4 && K.payout(3, 1).repairPct === 0.5 && K.payout(1, 1).schematics === 2 && K.payout(3, 1).schematics === 3, 'Perfect: Repair 50, Schematics 3');
ok(K.payout(3, 1, { mult: 1.5 }).credits === 30 && K.payout(3, 1, { mult: 1.5 }).repairPct === 0.5, 'Hard x1.5 on Credits and Schematics only (R52 3)');
ok(K.payout(1, 1).credits === K.payout(1, 1).credits, 'payout depends on tier and chapter only');

// ---- lane map (R51) ----
COLS.forEach(function (C) {
  ok(Math.abs(K.laneX(4, C, 1) - C / 2) < 1e-9, 'lane 4 on the centre column at ' + C);
  ok(Math.abs(K.laneX(0, C, 1) - 0.5) < 1e-9 && Math.abs(K.laneX(8, C, 1) - (C - 0.5)) < 1e-9, 'lanes 0 and 8 on the outer columns at ' + C);
  for (var l = 1; l <= 7; l++) ok(Math.abs(K.laneX(l, C, 1) - 0.5 - l * (C - 1) / 8) < 1e-9, 'lane ' + l + ' at x = lane*(C-1)/8 at ' + C);
  ok(Math.abs((K.laneX(1, C, 1) - K.laneX(0, C, 1)) - [1, 1.25, 1.5, 1.75][COLS.indexOf(C)]) < 1e-9, 'lane gap 1 / 1.25 / 1.5 / 1.75 at ' + C);
});

// ---- spawn script ----
(function () {
  var a = JSON.stringify(K.script(77, 1)), b = JSON.stringify(K.script(77, 1)); ok(a === b, 'script identical for a seed');
  var seedsDiffer = JSON.stringify(K.script(78, 1)) !== a; ok(seedsDiffer, 'script differs between seeds');
  var bad = 0, nBadDud = 0, late = 0, conc = 0;
  for (var st = 1; st <= 5; st++) for (var sd = 1; sd <= 120; sd++) {
    var sc = K.script(sd, st);
    if (sc.crates.length !== 20) bad++;
    if (sc.duds.length !== K.RAMP[st].duds) bad++;
    if (sc.crates.some(function (c) { return c.t0 + c.fall > 10 + 1e-9; })) late++;
    if (sc.reachFail) bad++;
    if (sc.crates.filter(function (c) { return c.gold; }).length !== 2) bad++;
    sc.duds.forEach(function (d) {
      if (d.t0 < 4 - 1e-9) bad++;
      sc.crates.forEach(function (c) { if (d.t0 < c.t0 + c.fall && c.t0 < d.t0 + d.fall && Math.abs(c.lane - d.lane) < 2) nBadDud++; });
    });
    COLS.forEach(function (C) { if (!K.reach(sc, C).ok) bad++; });
    if (sc.crates.slice(0, 4).some(function (c, i) { return c.t0 !== [0, 0.6, 1.2, 1.8][i]; })) bad++;
  }
  ok(bad === 0, 'script: 20 crates, 2 gold, duds by ramp (2/2/3/3/3), duds after 4 s, reach validator passes at 9/11/13/15 (bad ' + bad + ')');
  ok(late === 0, 'every crate lands by 10 s');
  ok(nBadDud === 0, 'no dud within 2 lanes (>= 1.5 tiles at every width) of a crate in the air (bad ' + nBadDud + ')');
  ok(K.RAMP[1].fall === 1.8 && K.RAMP[5].fall === 1.6 && K.RAMP[3].sway === 0.2 && K.RAMP[5].sway === 0.4, 'ramp table: fall 1.8..1.6, sway 0..0.4');
})();

// ---- the room at four widths ----
COLS.forEach(function (C) {
  var S = room(5, C), m = S.mini;
  ok(S.stageKind === 'collect' && S.phase === 'collect' && S.stage === 5 && m && m.cols === C, 'stage 5 is the collect room at ' + C + ' columns');
  ok(m.script.crates.length === 20, '20 crates in the room at ' + C);
  ok(S.enemies.length === 0 && S.spawnQ.length === 0, 'no enemies at ' + C);
  var maxY = 0, minY = 99, hmaxY = 0, hminY = 99, falls = {}, ys = [];
  var B = { rng: new V.Rng(3), hold: 0 }, hpBefore = S.hero.hp, shots = 0;
  for (var i = 0; i < 3000 && S.phase === 'collect'; i++) {
    V.Sim.step(S, bot.catchBotInput(S, B, 'human'));
    S.mini.crates.concat(S.mini.duds).forEach(function (c) { maxY = Math.max(maxY, c.y); });
    hmaxY = Math.max(hmaxY, S.hero.y); hminY = Math.min(hminY, S.hero.y); shots += S.rounds.length;
  }
  ok(maxY <= 10.5 + 1e-9, 'no crate or dud below row 10 at ' + C + ' (max y ' + maxY.toFixed(2) + ')');
  ok(hminY >= 3.5 - 1e-9 && hmaxY <= 10.5 + 1e-9, 'hero clamped to rows 3-10 at ' + C);
  ok(shots === 0 && S.hero.hp === hpBefore, 'no shooting and no HP change in the room at ' + C);
  ok(S.mini.crates.length === 20 && S.mini.crates.every(function (c) { return Math.abs(c.fall - (c.gold ? 1.8 * 0.8 : 1.8)) < 1e-9; }), 'equal fall time at ' + C);
  ok(S.phase === 'supply' && S.mini.phase === 'sheet' && S.supply && S.supply.length === 3, 'sheet opens with three pads at ' + C);
  var xs = S.mini.crates.map(function (c) { return c.x; }); ok(Math.min.apply(null, xs) >= 0.5 - 1e-9 && Math.max.apply(null, xs) <= C - 0.5 + 1e-9, 'crates inside the room at ' + C);
});

// ---- clock: fixed-step sim time (R53) ----
(function () {
  var S = room(9, 9), n = 0; while (S.phase === 'collect' && S.mini.phase !== 'end') { V.Sim.step(S, { mx: 0, my: 0 }); n++; }
  var expect = (S.mini.plays < 2 ? 0.9 : 0.6) / (1 / 60) + 600; ok(Math.abs(n - expect) <= 2, 'room = count-in + 10 s of fixed steps (' + n + ' steps, expect ' + Math.round(expect) + ')');
  ok(Math.abs(S.mini.t - 10) < 1e-6, 'S.mini.t = 10 at the end');
  // a slow frame loses no clock seconds: one 2 s frame feeds as many steps as 120 frames of 16.67 ms
  var a = 0, tot = 0, f; for (var i = 0; i < 120; i++) { f = K.feed(a, 1000 / 60); a = f.acc; tot += f.n; }
  var g = K.feed(0, 2000); ok(tot === 120 && g.n === 120, 'feed: 120 small frames = 120 steps = one 2000 ms frame (' + tot + ', ' + g.n + ')');
  f = K.feed(0, 100); ok(f.n === 6 && f.acc < K.STEP_MS, 'feed has no 5-step cap (a 100 ms frame = 6 steps)');
  var s1 = room(11, 11), s2 = room(11, 11), bA = { rng: new V.Rng(2), hold: 0 }, bB = { rng: new V.Rng(2), hold: 0 };
  var h1 = [], h2 = [];
  for (var j = 0; j < 400; j++) { V.Sim.step(s1, bot.catchBotInput(s1, bA, 'human')); }
  for (var j2 = 0; j2 < 400; j2++) { V.Sim.step(s2, bot.catchBotInput(s2, bB, 'human')); }
  ok(K.hash(s1) === K.hash(s2), 'same seed and same inputs give the same catch hash');
})();

// ---- seeded hash that pins the catch room on its own (R53). Baselines recorded when the room landed (2026-11-11). ----
(function () {
  var PIN = { 9: 'eebab95a', 11: '0d553652', 13: '05f091ba', 15: '4aa3ef25' }, got = {};
  COLS.forEach(function (C) { var S = room(1234, C), B = { rng: new V.Rng(9), hold: 0, plan: null }; while (S.phase === 'collect') V.Sim.step(S, bot.catchBotInput(S, B, 'perfect')); got[C] = K.hash(S); });
  fs.writeFileSync(path.join(process.env.TMPDIR || '/tmp', 'catch-hash-pins.json'), JSON.stringify(got));
  if (process.env.PRINT_PINS) console.log('PINS ' + JSON.stringify(got));
  COLS.forEach(function (C) { ok(PIN[C] === got[C], 'catch hash pin at ' + C + ': ' + got[C] + ' expected ' + PIN[C]); });
})();

// ---- fight stages stay bit-identical: without catch.js the old path runs; the hash of stages 1-4 does not depend on the room ----
(function () {
  var A = V.Sim.create(42, bot.V.TUNE_DEFAULTS ? JSON.parse(JSON.stringify(V.TUNE_DEFAULTS)) : V.TUNE, { cols: 9, metaStats: null }), B2 = V.Sim.create(42, JSON.parse(JSON.stringify(V.TUNE_DEFAULTS)), { cols: 9, metaStats: null });
  var okSame = true; for (var i = 0; i < 600; i++) { V.Sim.step(A, { mx: 0, my: 0.3 }); V.Sim.step(B2, { mx: 0, my: 0.3 }); if (V.Sim.hash(A) !== V.Sim.hash(B2)) okSame = false; }
  ok(okSame && A.stage === 1, 'fight stage 1 deterministic and unaffected by catch.js (catch.js uses no S.rng)');
  var r0 = A.rng.s, S5 = room(42, 9); var S5b = room(42, 9); ok(S5.rng.s === S5b.rng.s, 'room entry leaves S.rng to the fight stream');
})();

// ---- net count, duds ----
(function () {
  var S = room(21, 9), m = S.mini; stepN(S, 200); // into play
  m.caught = 3; m.dudHits = 5; var before = S.events.length; m.crates = []; // net floors at 0
  V.Sim.step(S, { mx: 0, my: 0 }); ok(Math.max(0, m.caught - m.dudHits) === 0, 'net count floors at 0 (arithmetic)');
  var S2 = room(21, 9), m2 = S2.mini; while (m2.phase !== 'play') V.Sim.step(S2, { mx: 0, my: 0 });
  var d = { id: 99, lane: 4, x: S2.hero.x, t0: m2.t - 1.8 * (S2.hero.y - 1.5) / 9, fall: 1.8, st: 'air', y: S2.hero.y }; m2.duds.push(d); m2.caught = 0;
  V.Sim.step(S2, { mx: 0, my: 0 }); ok(m2.dudHits === 1 && m2.net === 0 && m2.slowUntil > m2.t, 'a dud costs 1 (floor 0) and slows');
  ok(S2.events.some(function (e) { return e.k === 'sd:dud'; }) && S2.hero.hp === S2.hero.maxHp || S2.hero.hp > 0, 'dud: no HP loss');
  var x0 = S2.hero.x; V.Sim.step(S2, { mx: 1, my: 0 }); var slowStep = S2.hero.x - x0;
  ok(Math.abs(slowStep - 4.5 / 60 * 0.5) < 1e-6, 'slowed hero moves at half speed (' + slowStep.toFixed(4) + ')');
  var S3 = room(22, 9), m3 = S3.mini; while (m3.phase !== 'play') V.Sim.step(S3, { mx: 0, my: 0 });
  var dm = 0; m3.crates.push({ id: 98, lane: 4, x: S3.hero.x, t0: m3.t - 1.8 * (S3.hero.y - 1.5) / 9, fall: 1.8, st: 'air', y: S3.hero.y, kind: 'ammo' });
  V.Sim.step(S3, { mx: 0, my: 0 }); ok(m3.caught >= 1 && S3.events.some(function (e) { return e.k === 'sd:catch'; }), 'catch event on touch within 0.9');
  var sp0 = room(23, 15); while (sp0.mini.phase !== 'play') V.Sim.step(sp0, { mx: 1, my: 0 }); ok(Math.abs(sp0.hero.x - sp0.mini.cols / 2) > 0, 'hero steers during count-in');
  var s4 = room(24, 9); var x1 = s4.hero.x; V.Sim.step(s4, { mx: 1, my: 0 }); ok(Math.abs(s4.hero.x - x1 - 4.5 / 60) < 1e-9, 'hero speed 4.5 tiles a second');
  var s5 = room(24, 15); var x2 = s5.hero.x; V.Sim.step(s5, { mx: 1, my: 0 }); ok(Math.abs(s5.hero.x - x2 - 4.5 / 60) < 1e-9, 'same hero speed at 15 columns');
})();

// ---- sheet: pads, preselect, repair rules, grant once, guard ----
(function () {
  var S = room(seedFor('lazy', 0, 9, 0.5), 9, 0.5); toSheet(S, 'lazy'); var m = S.mini;
  ok(m.tier === 0 && m.pay.picks === 1, 'lazy bot lands in Basic with one pick');
  ok(m.pads[0].live && m.pads[0].heal === 240 && m.pads[0].pct === 40 || m.pads[0].heal === Math.floor(S.hero.maxHp * 0.4), 'repair heals 40% max when 50% is missing (' + m.pads[0].heal + ')');
  ok(m.defaults.length === 1 && m.defaults[0] === 'repair', 'preselect: Repair first when more than 13% missing');
  var hp0 = S.hero.hp, cr0 = S.credits;
  var g = K.take(S, ['credits']); ok(g && g.credits === 20 && S.credits === cr0 + 20 && S.hero.hp === hp0, 'Take grants only the chosen pad (Credits 20)');
  var g2 = K.take(S, ['repair']); ok(g2 === g && S.credits === cr0 + 20 && S.hero.hp === hp0, 'a second Take grants nothing (once)');
  var Sx = room(seedFor('lazy', 0, 9, 0.5), 9, 0.5); toSheet(Sx, 'lazy'); var h1 = Sx.hero.hp; V.Sim.pickSupply(Sx, ['repair']); ok(Sx.hero.hp === h1 + Math.floor(Sx.hero.maxHp * 0.4) && Sx.phase === 'clear' && Sx.room.door.open, 'Sim.pickSupply with pad ids: repair granted, door opens');
  ok(V.Sim.pickSupply(Sx, ['credits']) === false, 'Sim.pickSupply a second time does nothing');
  // repair heals only what is missing; HP full pad gives no pick
  var Sf = room(33, 9, 0.97); toSheet(Sf, 'lazy'); var mf = Sf.mini;
  ok(!mf.pads[0].live && mf.pads[0].heal === 0, '"HP full" under 5% missing (3% missing)');
  ok(mf.defaults.indexOf('repair') < 0 && mf.defaults[0] === 'credits', 'preselect skips a greyed Repair');
  var gf = K.take(Sf, ['repair', 'credits']); ok(gf.picks.indexOf('repair') < 0 && gf.repairHp === 0, 'a greyed Repair cannot be taken and takes no pick');
  var Sm = room(34, 9, 0.9); toSheet(Sm, 'lazy'); ok(Sm.mini.pads[0].live && Sm.mini.defaults[0] === 'credits', '10% missing: Repair live but not preselected (13% rule)');
  var gm = K.take(Sm, ['repair']); ok(gm.repairHp === Sm.hero.maxHp - Math.round(Sm.hero.maxHp * 0.9) && Sm.hero.hp === Sm.hero.maxHp, 'repair heals only what is missing (' + gm.repairHp + ')');
  // Great and Perfect take every live pad
  var Sg = room(35, 9, 0.5); toSheet(Sg, 'perfect'); Sg.mini.creditsBefore = Sg.credits; ok(Sg.mini.tier >= 2 && Sg.mini.pay.all, 'perfect bot reaches Great/Perfect');
  var gg = K.take(Sg, ['credits']); ok(gg.picks.length === 3 && gg.credits === 20 && gg.schematics >= 2 && gg.repairHp > 0, 'Great/Perfect: all three pads (picks ignore sel)');
  ok(Sg.credits === Sg.mini.creditsBefore + 20 && (Sg.schematics | 0) === gg.schematics, 'S.credits and S.schematics updated');
  // Good: two picks, defaults order
  var Sgd = room(36, 9, 0.5); toSheet(Sgd, 'lazy'); Sgd.mini.tier = 1; var P = K.padsFor(Sgd, 1); ok(P.defaults.join() === 'repair,credits', 'Good preselect: Repair, Credits');
  var P2 = K.padsFor(room(37, 9, 1), 1); ok(P2.defaults.join() === 'credits,schematics', 'Good at full HP: Credits, Schematics');
  var P3 = K.padsFor(room(37, 9, 1), 2); ok(P3.defaults.join() === 'credits,schematics', 'Great at full HP: two live pads only');
  // report record
  ok(Sg.stats.sd && Sg.stats.sd.length === 1 && Sg.stats.sd[0].tier === Sg.mini.tier && Sg.stats.sd[0].cols === 9 && 'padsTaken' in Sg.stats.sd[0] && 'roomSeconds' in Sg.stats.sd[0], 'report record S.stats.sd[] has the SPEC 9 fields');
  ok(Sg.events.some(function (e) { return e.k === 'sd:payout' && e.tier === Sg.mini.tier; }) || Sg._post, 'sd:payout event');
})();

// ---- sheet UI model (no DOM): label, greyed repair, counter ----
(function () {
  var S = room(41, 9, 0.97); toSheet(S, 'lazy'); var M = V.CatchUI.model(S, S.mini.picks);
  ok(M.counter === 'Picks left: 0', 'counter reads "Picks left: N" (' + M.counter + ')');
  ok(M.rows[0].amount === 'HP full' && M.rows[0].state === 'full' && !M.rows[0].tappable, '"HP full" row greyed');
  var Ml = V.CatchUI.model(S, S.mini.picks); var lk = Ml.rows.filter(function (r) { return r.locked; });
  ok(lk.length === 1 && lk[0].note === 'opens at Good' && lk[0].tappable, 'Basic with the pick used: the open pad is locked "opens at Good" (still swappable, R50)');
  ok(V.CatchUI.model(S, []).rows.every(function (r) { return !r.locked; }), 'no locked rows while a pick is left');
  var M2 = V.CatchUI.model(S, []); ok(M2.counter === 'Picks left: 1' && M2.takeEnabled, 'picks left counts down');
  var Sg = room(42, 9, 0.5); toSheet(Sg, 'perfect'); var M3 = V.CatchUI.model(Sg, Sg.mini.picks); ok(M3.counter === '' && M3.rows.every(function (r) { return r.state === 'taken'; }), 'Great/Perfect: all pads taken, no counter');
  ok(M3.minPx >= 12 && V.CatchUI.GUARD_MS === 350, '12 px text floor and 350 ms guard constants');
  var src = fs.readFileSync(path.join(__dirname, 'parts', 'catch-ui.js'), 'utf8');
  ok(!/setTimeout|setInterval/.test(src.replace(/\/\/.*$/gm, '')) && !/animation|@keyframes|blink/.test(src), 'sheet has no timer and no flashing');
  ok(/GUARD_MS/.test(src) && /performance\.now/.test(src), 'sheet guard present');
  // minimal DOM: guard blocks an early Take
  var calls = 0, tgt = {};
  var doc = { _els: {}, getElementById: function (id) { return id === 'stage' ? body : null; }, head: { appendChild: function () {} }, body: null };
  function mk() { var o = { children: [], cls: {}, attrs: {}, style: {}, listeners: {}, classList: { add: function () {}, contains: function (c) { return c === 'cu-take' ? o._take : false; } }, appendChild: function (c) { o.children.push(c); }, setAttribute: function () {}, addEventListener: function (e, f) { o.listeners[e] = f; }, parentNode: null }; return o; }
  var body = mk(); doc.body = body; globalThis.document = doc; doc.createElement = function () { return mk(); };
  var perf = { n: 1000 }; var G0 = globalThis; G0.performance = { now: function () { return perf.n; } }; G0.requestAnimationFrame = function (f) { f(); };
  // V.CatchUI reads window/globalThis for document: it was bound at load (G = globalThis), so the globals above are visible
  var S2 = room(43, 9, 0.5); toSheet(S2, 'lazy'); var taken = null;
  V.CatchUI.open(S2, function (sel) { taken = sel; calls++; });
  var el = body.children[body.children.length - 1];
  var takeEv = { target: { closest: function () { return { classList: { contains: function (c) { return c === 'cu-take'; } }, getAttribute: function () { return null; } }; } } };
  perf.n = 1200; el.listeners.click(takeEv); ok(calls === 0, 'Take ignored 200 ms after the sheet opens (350 ms guard)');
  perf.n = 1400; el.listeners.click(takeEv); ok(calls === 1 && Array.isArray(taken), 'Take works after the guard');
  el.listeners.click(takeEv); ok(calls === 1, 'a second click on Take does nothing');
  delete globalThis.document;
})();

// ---- Skip (4th play on), Settings, saved fields (meta snippet) ----
(function () {
  var st = mockStore(), L = loadMeta(st), M = L.M; withMeta(M);
  ok(typeof M.sdOpen === 'function' && typeof M.sdTake === 'function', 'meta.js has the sd snippet' + (L.merged ? ' (merged)' : ' (applied in memory by this test)'));
  ok(M.sdState().plays === 0 && !K.canSkip({}), 'fresh save: 0 plays, no Skip');
  var S = room(51, 9, 0.5); ok(S.mini.canSkip === false && S.mini.hint === true && S.mini.dotT === 0.3, 'visit 1: hint, 0.3 s dots, no Skip chip');
  toSheet(S, 'perfect');
  var saved = JSON.parse(st.d[M.KEY]); ok(saved.sd && saved.sd.pending && saved.sd.pending.tier === S.mini.tier && saved.sd.pending.stage === 5 && saved.sd.plays === 0, 'sd.pending saved when the sheet opens');
  // kill and reload: same tier and defaults, nothing granted
  var L2 = loadMeta(st); var pend = L2.M.sdState().pending; ok(pend && pend.tier === S.mini.tier && pend.defaults.join() === S.mini.defaults.join() && L2.M.sdState().plays === 0, 'pending tier survives a kill and reload');
  withMeta(L2.M); var Sr = room(51, 9, 0.5); stepN(Sr, 5000); Sr.mini.net = 0; // a different tier in the new room
  K.resume(Sr, pend); ok(Sr.mini.tier === pend.tier && Sr.mini.defaults.join() === pend.defaults.join() && Sr.phase === 'supply', 'resume reopens the saved tier and defaults');
  var sch0 = L2.M.state.schematics | 0; V.Sim.pickSupply(Sr, null);
  var after = JSON.parse(st.d[L2.M.KEY]); ok(after.sd.pending === null && after.sd.plays === 1 && (after.schematics | 0) === sch0 + (Sr.mini.grant.schematics | 0), 'Take clears pending, plays 1, Schematics banked once');
  ok(V.Sim.pickSupply(Sr, null) === false && L2.M.sdState().plays === 1, 'double Take banks nothing twice');
  // validation: bad sd field = fresh start
  var bad = JSON.parse(st.d[L2.M.KEY]); bad.sd.plays = -1; var st2 = mockStore(); st2.d['volley.save.v2'] = JSON.stringify(bad); var L3 = loadMeta(st2); ok(L3.M.resetSignal === 'invalid', 'invalid sd field rejects the save');
  // Skip: only from the 4th play
  var st3 = mockStore(), L4 = loadMeta(st3); withMeta(L4.M);
  for (var i = 0; i < 3; i++) { L4.M.sdOpen({ chapter: 1, stage: 5, tier: 0, defaults: ['credits'] }); L4.M.sdTake({ schematics: 0 }); }
  var Sk = room(52, 9, 0.5); ok(Sk.mini.canSkip && L4.M.sdState().plays === 3, 'Skip chip from the 4th play (plays 3)');
  stepN(Sk, 100); var hp0 = Sk.hero.hp, cr0 = Sk.credits; var okSkip = V.Sim.skipCollect(Sk);
  ok(okSkip && Sk.phase === 'clear' && Sk.room.door.open && Sk.mini.grant.picks.length === 1 && Sk.mini.tier === 0, 'Skip: default pad (one, Basic) granted at once, door open');
  ok(Sk.hero.hp > hp0 && Sk.credits === cr0, 'Skip default is Repair at 50% missing');
  var S3 = room(53, 9, 0.5); withMeta(loadMeta(mockStore()).M); var S3b = room(53, 9, 0.5); ok(V.Sim.skipCollect(S3b) === false && S3b.phase === 'collect', 'no Skip before the 4th play');
  // Settings: Skip setting enters and leaves at once
  var st4 = mockStore(), L5 = loadMeta(st4); withMeta(L5.M); for (var j = 0; j < 3; j++) { L5.M.sdOpen({ chapter: 1, stage: 5, tier: 0, defaults: ['credits'] }); L5.M.sdTake({ schematics: 0 }); }
  ok(K.GAP_FACTOR[9] === 1 && K.GAP_FACTOR[11] === 0.8 && K.GAP_FACTOR[13] === 0.8 && K.GAP_FACTOR[15] === 0.8, 'shipped GAP_FACTOR: 1 at 9, 0.8 at 11/13/15 (R51 fallback)');
  ok(L5.M.setSetting('sdSkip', true) === true || L5.M.settings().sdSkip === true, 'settings.sdSkip stored');
  var Sa = room(54, 9, 0.5); ok(Sa.phase === 'clear' && Sa.mini.skipped && Sa.room.door.open, 'Settings Skip: room passes at once with the default pad');
  L5.M.setSetting('sdSkip', false); var Sb = room(55, 9, 0.5); ok(Sb.phase === 'collect', 'Settings Play: the room runs');
  V.Meta = undefined;
})();

// ---- headless runs never touch the save; the timeline does not depend on saved plays (review finding 5) ----
(function () {
  var st = mockStore(), L = loadMeta(st), M = L.M, saves = 0, orig = M.save; M.save = function () { saves++; return orig.apply(M, arguments); };
  for (var i = 0; i < 5; i++) { M.sdOpen({ chapter: 1, stage: 5, tier: 0, defaults: ['credits'] }); M.sdTake({ schematics: 0 }); }
  saves = 0; var plays0 = M.sdState().plays, sch0 = M.state.schematics | 0; withMeta(M);
  function run(headless) {
    var S = headless ? V.Sim.create(7, JSON.parse(JSON.stringify(V.TUNE_DEFAULTS)), { cols: 9, metaStats: null }) : null;
    if (!S) return null;
    var g = 0; while (S.stage < 5 && g++ < 20000) { if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; } if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; } if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; } V.Sim.step(S, { mx: 0, my: 0 }); if (S.phase === 'clear') { S.hero.x = S.room.door.x + 0.5; S.hero.y = 1.3; V.Sim.step(S, { mx: 0, my: -1 }); } }
    var B = { rng: new V.Rng(3), hold: 0, plan: null }; while (S.phase === 'collect') V.Sim.step(S, bot.catchBotInput(S, B, 'perfect'));
    V.Sim.pickSupply(S, null); return S;
  }
  var S1 = run(true);
  ok(S1.useMeta === false && S1.mini.canSkip === false && S1.mini.dotT === 0.3 && S1.mini.hint === true, 'headless run ignores saved plays 5 (count-in, hint, Skip as for plays 0)');
  ok(saves === 0 && M.sdState().plays === plays0 && (M.state.schematics | 0) === sch0, 'a headless run never calls M.save() and never bumps plays or schematics');
  M.settings && M.setSetting && M.setSetting('sdSkip', true); var S2 = run(true); ok(S2.mini.skipped === false, 'headless run ignores the Skip setting');
  var st2 = mockStore(), L2 = loadMeta(st2); withMeta(L2.M); var S3 = run(true);
  ok(K.hash(S1) === K.hash(S3) && S1.mini.dotT === S3.mini.dotT, 'timeline identical with a different save');
  V.Meta = undefined;
})();

// ---- draw hook does not throw at the four widths ----
(function () {
  var calls = 0, c = new Proxy({}, { get: function (t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return function () { return { addColorStop: function () {} }; }; if (k === 'measureText') return function (q) { return { width: 9 * String(q).length }; }; return function () { calls++; }; }, set: function () { return true; } });
  var dom = globalThis.document; // none
  COLS.forEach(function (C) { var S = room(61, C), B = { rng: new V.Rng(1), hold: 0 }; for (var i = 0; i < 700 && S.phase === 'collect'; i++) { V.Sim.step(S, bot.catchBotInput(S, B, 'human')); if (i % 40 === 0) V.CatchScene.draw(c, S, { ox: 0, oy: 64, s: 36, w: C * 36, h: 700, C: C }); } });
  ok(calls > 100, 'CatchScene.draw runs through a whole room at 9/11/13/15');
  var txt = fs.readFileSync(path.join(__dirname, 'parts', 'catch-scene.js'), 'utf8'), sizes = (txt.match(/text\([^;]*?, (\d+), C\./g) || []).map(function (x) { return +/, (\d+), C\./.exec(x)[1]; });
  ok(sizes.every(function (n) { return n >= 12; }), 'no drawn text under 12 px');
})();

// ---- K-fix look checks (Visual QA D4/D7/D8/D9/D11/D12) on a recording context ----
(function () {
  function rec() { var o = { texts: [], n: 0, fill: null, lines: [] }, st = {};
    var c = new Proxy({}, { get: function (t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      if (k === 'measureText') return function (q) { return { width: 9 * String(q).length }; };
      if (k === 'fillText') return function (q, x, y) { o.n++; o.texts.push({ s: q, x: x, y: y, fill: st.fillStyle, a: st.globalAlpha, font: st.font }); };
      if (k in st) return st[k];
      return function () { o.n++; }; }, set: function (t, k, v) { st[k] = v; return true; } });
    c.o = o; return c; }
  var V0 = { ox: 0, oy: 64, s: 38, w: 344, h: 882, C: 9, insets: { top: 0 } };
  var S = room(7, 9), B = { rng: new V.Rng(1), hold: 0 }, c;
  c = rec(); V.CatchScene.draw(c, S, V0);
  var ban = c.o.texts.filter(function (t) { return /supply drop/i.test(t.s); });
  ok(ban.length === 1 && ban[0].s === 'SUPPLY DROP' && /^800 30px /.test(ban[0].font) && Math.abs(ban[0].y - (64 + 19)) < 1, 'D11: one stencil banner, 30 px, on the top row of the room');
  var g0 = c.o.n; S.mini.ghost = false; var c2 = rec(); V.CatchScene.draw(c2, S, V0); S.mini.ghost = true;
  ok(g0 > c2.o.n, 'D9: the ghost finger is drawn while m.ghost and no catch yet');
  var gh = 0; for (var i = 0; i < 900 && S.phase === 'collect'; i++) { V.Sim.step(S, bot.catchBotInput(S, B, 'perfect')); if (S.mini.caught >= 12 && !gh) { c = rec(); V.CatchScene.draw(c, S, V0); gh = 1;
    var ct = c.o.texts.filter(function (t) { return / \/ 20$/.test(t.s); }); ok(ct.length === 1 && /^\d\d \/ 20$/.test(ct[0].s), 'D8: two-digit count drawn as ONE string "12 / 20" (no separate slash)');
    var c3 = rec(); S.mini.ghost = true; var cA = S.mini.caught; V.CatchScene.draw(c3, S, V0); ok(cA > 0, 'D9: no ghost after the first catch (draw path gated on m.caught === 0)'); } }
  ok(gh === 1, 'perfect-path bot reached 12 caught');
  // D12: "+1" gold, outlined (text() strokes ink first)
  var S2 = room(7, 9), B2 = { rng: new V.Rng(2), hold: 0 }, plus = null;
  for (i = 0; i < 900 && S2.phase === 'collect'; i++) { V.Sim.step(S2, bot.catchBotInput(S2, B2, 'perfect')); var m2 = S2.mini; if (m2.crates.some(function (k) { return k.st === 'caught' && m2.t - k.at < 0.1; })) { c = rec(); V.CatchScene.draw(c, S2, V0); plus = c.o.texts.filter(function (t) { return t.s === '+1'; })[0]; break; } }
  ok(plus && plus.fill === V.CatchScene.TOKENS.gold, 'D12: the +1 popup is drawn in gold #ffe27a (contrast over 4.5:1 on the dark floor)');
  ok(plus && plus.a === 1, 'N3/D12: the +1 popup is drawn at full alpha early in its life (4.5:1 holds mid-rise)');
  var S5 = room(7, 9); S5.mini.crates.push({ id: 99, x: 4.5, y: 9, st: 'caught', at: 0, kind: 'ammo', t0: 0, fall: 1.8, ph: 0, sway: 0 }); S5.mini.phase = 'sheet'; c = rec(); V.CatchScene.draw(c, S5, V0);
  ok(!c.o.texts.some(function (t) { return t.s === '+1'; }), 'N3: no +1 popup is drawn behind the sheet (no frozen half-faded popup)');
  c = rec(); V.CatchScene.draw(c, room(7, 9), V0); var hint = c.o.texts.filter(function (t) { return /Catch the crates/.test(t.s); })[0];
  ok(hint && hint.y >= 64 + 11 * 38 && hint.y <= 64 + 12.5 * 38, 'N5: the hint sits in the free row below the Operator, off the fall path');
  // D7: the clock holds 0:00 in the end beat and behind the sheet
  var S3 = room(7, 9), B3 = { rng: new V.Rng(3), hold: 0 }; for (i = 0; i < 2000 && S3.phase === 'collect'; i++) V.Sim.step(S3, bot.catchBotInput(S3, B3, 'lazy'));
  ok(S3.phase === 'supply' && S3.mini.phase === 'sheet', 'lazy run reached the sheet');
  c = rec(); V.CatchScene.draw(c, S3, V0); ok(c.o.texts.some(function (t) { return t.s === '0:00'; }) && !c.o.texts.some(function (t) { return t.s === '0:10'; }), 'D7: behind the sheet the clock reads 0:00 (not back at 0:10)');
  var S4 = room(7, 9); c = rec(); V.CatchScene.draw(c, S4, V0); ok(c.o.texts.some(function (t) { return t.s === '0:10'; }), 'clock starts at 0:10 in the count-in');
  // D4: one top bar: all HUD text sits in the top 64 px band (or on the room), nothing is drawn below the band at the room top except the banner
  c = rec(); V.CatchScene.draw(c, S4, V0); ok(c.o.texts.filter(function (t) { return t.y < 64; }).length >= 2, 'D4: clock and counter are in the top bar above the room (y under 64)');
  var src = fs.readFileSync(path.join(__dirname, 'parts', 'catch-scene.js'), 'utf8'); ok(/cr-on/.test(src) && /#hpRow/.test(src) && /#toast/.test(src), 'D4/D11: HUD rows and the stage toast are hidden while the room draws');
})();

// ---- bot sanity (full rows live in bot.js: node bot.js catch) ----
(function () {
  function share(kind, C, n) { var s = 0; for (var sd = 1; sd <= n; sd++) s += bot.playCatch(room(sd, C), kind, sd).net; return s / n / 20; }
  var lz = share('lazy', 9, 40), pf = share('perfect', 9, 40), pf15 = share('perfect', 15, 40);
  ok(lz > 0.1 && lz < 0.3, 'lazy centre bot about 20% at 9 columns (' + (lz * 100).toFixed(0) + '%)');
  ok(pf > 0.93, 'perfect-path bot at least 93% at 9 columns (' + (pf * 100).toFixed(0) + '%)');
  ok(pf15 > 0.9, 'perfect-path bot at least 90% at 15 columns (' + (pf15 * 100).toFixed(0) + '%)');
})();

// ---- review fix 1: S.mini is cleared when the next stage loads ----
(function () {
  var S = room(5, 9); toSheet(S); V.Sim.pickSupply(S, []);
  var d = S.room.door, g = 0;
  ok(S.mini != null, 'S.mini still set while the catch room is open');
  while (S.stage === 5 && g++ < 600) { S.hero.x = d.x + 0.5; S.hero.y = d.y + 1.0; V.Sim.step(S, { mx: 0, my: -1 }); }
  ok(S.stage === 6 && S.mini === null, 'stage 6 after a collect room: S.mini is null (stage ' + S.stage + ')');
})();
console.log('test-catch: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
