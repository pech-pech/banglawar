// Headless checks for parts/meta.js and its sim hooks. Run: node test-meta.js
var path = require('path');
['tune', 'rng', 'rooms', 'stages', 'mods', 'meta', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){
  try { require(path.join(__dirname, 'parts', f + '.js')); } catch (e) { if (['stages','mods','ai-p1','boss'].indexOf(f) < 0) throw e; } });
var V = globalThis.V, M = V.Meta, T = M.TUNING, fails = 0, n = 0;
function ok(name, c, got){ n++; if (!c) { fails++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)); } }
function mock(){ var d = {}; return { d:d, getItem:function(k){ return k in d ? d[k] : null; }, setItem:function(k, v){ d[k] = String(v); }, removeItem:function(k){ delete d[k]; } }; }
function near(a, b){ return Math.abs(a - b) < 1e-9; }

var st = mock(); M.setStorage(st); M.load({ storage:st, fresh:true });
// fresh neutral
var s0 = M.stats();
ok('fresh hpAdd', s0.hpAdd === 0); ok('fresh atkMul', s0.atkMul === 1); ok('fresh rateMul', s0.rateMul === 1); ok('fresh power', s0.power === 0);
ok('fresh totals', M.totals().maxHp === 600 && M.totals().atk === 150 && M.totals().interval === 0.8, M.totals());
// costs
ok('rifle L1 cost 250', M.cost('rifle').credits === 250, M.cost('rifle'));
var rc = []; for (var l = 1; l < 10; l++) { M.state.rifle.lvl = l; rc.push(M.cost('rifle').credits); }
ok('rifle ladder', rc.join() === '250,500,750,1000,1250,1500,1750,2000,2250', rc.join());
M.state.rifle.lvl = 10; ok('rifle max null', M.cost('rifle') === null); ok('rifle cannot buy at max', !M.buy('rifle'));
M.state.rifle.lvl = 1;
ok('cond N1 250', M.cost('cond', 'hp').credits === 250); ok('cond bad id', M.cost('cond', 'zz') === null);
M.state.buys = 15; ok('cond N16 2250 (sample)', M.cost('cond', 'atk').credits === 2250, M.cost('cond','atk'));
M.state.buys = 0;
// insufficient
M.state.credits = 249; ok('insufficient', !M.canBuy('rifle') && !M.buy('rifle') && M.state.credits === 249 && M.state.rifle.lvl === 1);
// buy
M.state.credits = 1000; var fired = 0; var un = M.onChange(function(){ fired++; });
ok('buy rifle', M.buy('rifle') && M.state.rifle.lvl === 2 && M.state.credits === 750 && fired === 1);
ok('buy cond hp', M.buy('cond', 'hp') && M.state.cond.hp === 1 && M.state.buys === 1 && M.state.credits === 500);
ok('ladder N2 = 325 (250 x 1.25, rounded to 25)', M.cost('cond', 'atk').credits === 325, M.cost('cond', 'atk')); // 312.5 rounds to 325
un(); ok('unsubscribe', (function(){ var f = fired; M.buy('cond', 'atk'); return fired === f; })());
// cond max
M.state.cond.hp = 10; ok('cond max null', M.cost('cond', 'hp') === null);
M.state.credits = 1e6; ok('cond hp max buy false', !M.buy('cond', 'hp'));
// rand
M.load({ storage:mock(), fresh:true }); M.state.credits = 1e6; M.state.cond.hp = 10; M.state.cond.atk = 10;
ok('rand only open stat', M.buy('cond', 'rand') && M.lastBuy === 'rate' && M.state.cond.rate === 1);
M.state.cond = { hp:10, atk:10, rate:10 }; ok('rand all maxed null', M.cost('cond', 'rand') === null);
// stats math
M.load({ storage:mock(), fresh:true }); M.state.rifle.lvl = 10; M.state.cond = { hp:5, atk:4, rate:2 }; M.state.buys = 11;
var s = M.stats();
ok('hpAdd', s.hpAdd === 200); ok('atkMul', near(s.atkMul, (1 + 72 / 150) * 1.12), s.atkMul); ok('rateMul', near(s.rateMul, 1.06));
ok('totals', M.totals().maxHp === 800 && M.totals().atk === Math.floor(150 * s.atkMul), M.totals());
// power
M.power = 1; var sp = M.stats(); ok('power 1 = maxed', sp.hpAdd === 400 && near(sp.atkMul, (1 + 72 / 150) * 1.3) && near(sp.rateMul, 1.3), sp);
M.power = 0.5; ok('power .5 between', M.stats().hpAdd === 300); M.power = 7; ok('power clamp', M.power === 1); M.power = 0;
// award
M.load({ storage:mock(), fresh:true });
var res = { win:true, stage:10, t:123.456, kills:30, credits:334, seen:['E-01', 'B-01'] };
var a = M.award(res);
ok('award credits', a.credits === 334 && M.state.credits === 334 && M.state.best === 10);
ok('rifleStat', M.rifleStat(1) === 50 && M.rifleStat(10) === 122);
ok('award log', M.state.runs.length === 1 && M.state.runs[0].win && M.state.runs[0].credits === 334 && M.state.runs[0].dur === 123.5);
ok('award codex', M.state.codex.seen['E-01'] && M.state.codex.seen['B-01']);
ok('award idempotent', M.award(res).credits === 0 && M.state.credits === 334 && M.state.runs.length === 1);
for (var i = 0; i < 25; i++) M.award({ win:false, stage:3, credits:1, kills:1, t:1 });
ok('oldest first: win run dropped, last is newest', M.state.runs[19].credits === 1);
ok('log capped 20, best kept', M.state.runs.length === 20 && M.state.best === 10);
// save/load round trip
var st2 = mock(); M.load({ storage:st2, fresh:true }); M.state.credits = 5000; M.buy('rifle'); M.buy('cond', 'rate'); M.power = 0.25;
M.award({ win:false, stage:4, credits:50, kills:5, t:30, seen:['E-02'] });
var snap = JSON.stringify(M.state);
M.load({ storage:st2 });
ok('roundtrip', JSON.stringify(M.state) === snap, [snap, JSON.stringify(M.state)]);
ok('storage key', 'volley.save.v2' in st2.d);   // F0 #8: key v1 -> v2 (settings moved out of the save)
M.load({ storage:st2, fresh:true }); ok('fresh ignores save', M.state.credits === 0 && M.state.rifle.lvl === 1);
st2.d['volley.save.v2'] = '{not json'; M.load({ storage:st2 }); ok('corrupt -> fresh', M.state.credits === 0);
st2.d['volley.save.v2'] = JSON.stringify({ v:2, credits:-5, rifle:{ lvl:99 }, cond:{ hp:'x', atk:3 } }); M.load({ storage:st2 });
// F0 #8 (08 section 4): any validation failure is a full fresh start, no partial repair (was: clamp field by field)
ok('invalid save -> fresh, no partial repair', M.state.credits === 0 && M.state.rifle.lvl === 1 && M.state.cond.atk === 0 && M.state.buys === 0 && M.resetSignal === 'invalid', M.state);
var bad = { getItem:function(){ throw new Error('x'); }, setItem:function(){ throw new Error('x'); } };
M.setStorage(bad); M.load({ storage:bad }); ok('throwing storage ok', M.state.credits === 0 && M.save() === false);
M.setStorage(null); ok('no storage save false', M.save() === false);
M.reset(); ok('reset', M.state.credits === 0);
// sample
M.sample(); ok('sample', M.state.credits === 12480 && M.state.rifle.lvl === 8 && M.state.buys === 15 && M.cost('cond', 'hp').credits === 2250 && M.state.schematics === 86 && M.state.keys === 1 && M.state.best === 23);

// ---- sim hooks ----
M.load({ storage:mock(), fresh:true });
function runTo(S, steps){ for (var i = 0; i < steps && S.phase !== 'results'; i++) V.Sim.step(S, { mx:0, my:0 }); return S; }
var Sa = V.Sim.create(7, V.TUNE, { metaStats:null });
var Sb = V.Sim.create(7, V.TUNE);   // fresh Meta -> neutral
ok('fresh meta sim neutral', Sb.hero.maxHp === 600 && Sa.hero.maxHp === 600 && Sb.st.atkMul === Sa.st.atkMul && Sb.st.rateMul === 1);
for (var k = 0; k < 600; k++) { V.Sim.step(Sa, {}); V.Sim.step(Sb, {}); }
ok('fresh meta sim same hash', V.Sim.hash(Sa) === V.Sim.hash(Sb));
var Sc = V.Sim.create(7, V.TUNE, { metaStats:{ hpAdd:400, atkMul:2, rateMul:1.3 } });
ok('metaStats override', Sc.hero.maxHp === 1000 && Sc.hero.hp === 1000 && Sc.st.atkMul === 2 && Sc.useMeta === false);
ok('restart keeps opts', V.Sim.restart(Sc).hero.maxHp === 1000);
var Sd = V.Sim.create(7, V.TUNE, { metaStats:null }); Sd.stageKind = 'combat';
ok('credits start 0', Sd.credits === 0);
// real power from a saved state is applied
M.state.rifle.lvl = 10; M.state.cond = { hp:10, atk:0, rate:0 };
var Se = V.Sim.create(7, V.TUNE); ok('Meta stats applied at run start', Se.hero.maxHp === 1000 && Se.useMeta === true, Se.hero.maxHp);
// endRun awards once
Se.credits = 100; Se.hero.hp = 0; Se.stage = 3;
var before = M.state.credits;
(function(){ var S = Se; S.hero.hp = 1; V.Sim.api.hurtHero(S, 99999, 'E-01', S.hero.x, S.hero.y); })();
ok('death -> result with credits', Se.phase === 'results' && Se.result.credits === 100 && M.state.credits === before + 100 && Se.result.bank === M.state.credits, Se.result);
ok('result.seen array', Array.isArray(Se.result.seen));
// TABS-B extras
M.setStorage(mock()); M.load({ storage:mock(), fresh:true }); M.state.credits = 5000;
var ev = 0; M.onChange(function(){ ev++; });
M.setPower(0.4); ok('setPower fires once', ev === 1 && M.power === 0.4); M.save(); ok('save fires', ev === 2);
var id = M.buyRandom('cond'); ok('buyRandom id', ['hp','atk','rate'].indexOf(id) >= 0 && M.state.buys === 1 && ev === 3, id);
ok('maxLevel', M.maxLevel('rifle') === 10 && M.maxLevel('cond', 'hp') === 10);
M.state.credits = 0; ok('buyRandom broke -> null', M.buyRandom('cond') === null);
M.reset(); ok('reset fires + clears', ev === 4 && M.state.credits === 0 && M.state.buys === 0);
M.load({ storage:mock(), fresh:true }); M.state.credits = 99999;
ok('counter fresh', M.boughtCount('cond') === 0 && M.maxTotal('cond') === 30 && M.nextPrice('cond') === 250);
M.buyRandom('cond'); ok('counter after', M.boughtCount('cond') === 1 && M.nextPrice('cond') === 325);
var seenIds = {}; for (var q = 0; q < 29; q++) { var r = M.buyRandom('cond'); seenIds[r] = 1; }
ok('30 random buys max all, then null', M.boughtCount('cond') === 30 && M.state.cond.hp === 10 && M.state.cond.atk === 10 && M.state.cond.rate === 10 && M.nextPrice('cond') === null && M.buyRandom('cond') === null);
// PV-19: a save from a newer version (3, 4; was 2, 3 before F0 #8) is played read-only and never rewritten as v2; unknown fields stay on disk.
[3, 4].forEach(function(ver){
  var ms = mock(), orig = JSON.stringify({ v:ver, credits:5000, rifle:{ lvl:2 }, cond:{ hp:1, atk:0, rate:0 }, futureField:{ a:[1, 2] }, relics:['x'] });
  ms.d['volley.save.v2'] = orig;
  M.load({ storage:ms });
  ok('v' + ver + ' save loads', M.state.credits === 5000 && M.readOnly === true && /newer/i.test(M.note), M.note);
  ok('v' + ver + ' buy works in memory, save() writes nothing', M.buy('rifle') && M.save() === false && ms.d['volley.save.v2'] === orig, ms.d['volley.save.v2']);
  ok('v' + ver + ' award does not touch the stored save', (M.award({ win:false, stage:2, credits:10 }), ms.d['volley.save.v2'] === orig));
  M.load({ storage:ms });
  ok('v' + ver + ' stored version and unknown fields intact after reload', (function(){ var j = JSON.parse(ms.d['volley.save.v2']); return j.v === ver && j.futureField.a[1] === 2 && j.relics[0] === 'x'; })());
  M.reset(); ok('v' + ver + ' explicit reset replaces it', M.readOnly === false && JSON.parse(ms.d['volley.save.v2']).v === 2);
});
// F0 #8: a current save must be complete to validate (was { v:1, credits:7 }), so the test writes a full v2 save
var m1 = mock(), full = { v:2, credits:7, rifle:{ lvl:1 }, cond:{ hp:0, atk:0, rate:0 }, buys:0, power:0, runs:[], best:0, codex:{ seen:{} } };
m1.d['volley.save.v2'] = JSON.stringify(full); M.load({ storage:m1 });
ok('v2 save stays writable', M.readOnly === false && M.state.credits === 7 && (M.state.credits = 9, M.save() === true) && JSON.parse(m1.d['volley.save.v2']).credits === 9);
// PV-20: storage blocked (property access throws): loading the file in a browser-like global must not throw.
(function(){
  var vm = require('vm'), fs = require('fs'), code = fs.readFileSync(path.join(__dirname, 'parts', 'meta.js'), 'utf8'), threw = null, ctx = { console: console };
  ctx.window = ctx; Object.defineProperty(ctx, 'localStorage', { get: function(){ throw new Error('SecurityError: storage blocked'); } });
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx); } catch (e) { threw = e; }
  ok('meta.js loads with blocked localStorage (no throw)', threw === null, threw && threw.message);
  ok('meta.js blocked storage: V.Meta usable, save() false', !threw && !!ctx.V && ctx.V.Meta.state.credits === 0 && ctx.V.Meta.save() === false);
})();
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
