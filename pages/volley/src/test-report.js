// Headless checks for parts/report.js (F1 test report, TEST-REPORT-SPEC s7) with the real sim and meta. Run: node src/test-report.js
// Loads the parts in game order (as bot.js does) plus ui.js and report.js; no DOM is needed (report.js skips its DOM work in Node).
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'meta', 'widen', 'sim', 'ai-p0', 'ai-p1', 'boss', 'ui', 'report'].forEach(function(f){
  var p = path.join(__dirname, 'parts', f + '.js'); if (fs.existsSync(p)) require(p); });
var V = globalThis.V, M = V.Meta, R = V.Report, fails = 0, n = 0;
function ok(name, c, got){ n++; if (!c) { fails++; console.log('FAIL', name, got === undefined ? '' : String(typeof got === 'string' ? got : JSON.stringify(got)).slice(0, 600)); } }
function mock(){ var d = {}; return { d:d, getItem:function(k){ return k in d ? d[k] : null; }, setItem:function(k, v){ d[k] = String(v); }, removeItem:function(k){ delete d[k]; } }; }
function bytes(s){ return Buffer.byteLength(s, 'utf8'); }
function dataOf(full){ var a = full.indexOf('=== DATA BLOCK (JSON) ===\n'), b = full.indexOf('\n=== END DATA BLOCK ==='); return JSON.parse(full.slice(a + 26, b)); }

ok('report.js loaded, UI overridden', !!R && typeof V.UI.report === 'function' && typeof V.UI.reportSummary === 'function' && /^VOLLEY REPORT /.test(V.UI.report()));
// Layout as B's V.Layout publishes it (CONTRACT shared interfaces); 704x783 -> C15, tile 46.9 (FULLSCREEN-LAYOUT s1 table)
V.Layout = { W:704, H:783, Wu:704, playH:719, insets:{ t:0, r:0, b:0, l:0 }, t0:47.93, cols:function(){ return 15; }, tile:46.93, roomW:15 * 46.93, roomH:15 * 46.93, widthClass:'w-wide', short:false };
// Input log stub (input.js needs a DOM): [ms, kind, x, y]
var IN = [], inT = 0; V.Input = { log:function(){ return IN.slice(); }, counts:{ downs:0 } };
function touch(){ inT += 10; IN.push([inT, 'd', 1, 2]); if (IN.length > 200) IN.shift(); }

var st = mock(); M.setStorage(st); M.load({ storage:st, fresh:true }); R._reset();

// ---------- a bot that ends runs: idle in combat, card 0, supply 0, steps onto the door when clear ----------
function play(S, opts){
  opts = opts || {};
  V.Report.runStart(S);
  for (var i = 0; i < 20 * 3600 && S.phase !== 'results'; i++) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); V.Report.tick(S, 16.7, 'menu'); continue; }
    if (S.phase === 'supply') { (V.Sim.pickSupply || V.Sim.pick)(S, 0); V.Report.tick(S, 16.7, 'menu'); continue; }
    var inp = { mx:0, my:0 };
    if (S.phase === 'clear' && S.room.door.open) { var d = S.room.door, h = S.hero, dx = d.x + 0.5 - h.x, dy = d.y + 0.5 - h.y, l = Math.hypot(dx, dy) || 1;
      if (l > 1.2) { h.x = d.x + 0.5; h.y = d.y + 1.4; } inp = { mx:dx / l, my:dy / l }; }
    V.Sim.step(S, inp);
    if (opts.onStep) opts.onStep(S, i);
    if (i % 300 === 0) touch();
    V.Report.tick(S, opts.gapAt === i ? 72 : 16.7, 'play');
    if (opts.stopAt && i >= opts.stopAt) return S;
  }
  if (S.phase === 'results') V.Report.runEnd(S, S.result);
  return S;
}
// A strong hero wins (metaStats override, so the sim does not award: award by hand as the sim would)
// (cols 15 as on the owner's 704x783 screen; the sim reads opts.cols at room entry)
function winRun(seed, opts){ var S = V.Sim.create(seed, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 });
  var o = opts || {}, on = o.onStep;
  o.onStep = function(S2, i){ if (on) on(S2, i); if (S2.result && !S2.result.awarded) M.award(S2.result); };   // same moment as the sim's own award (inside endRun)
  return play(S, o); }
function deathRun(seed, opts){ return play(V.Sim.create(seed, V.TUNE), opts); }   // fresh Meta, idle: dies; the sim awards

// menu frames before the first run (Home): must not enter frameMs.play
for (var f = 0; f < 120; f++) V.Report.tick(null, 33.3, 'menu');
V.Report.tick(null, 90, 'menu');

var S1 = deathRun(11, { gapAt: 400 });
ok('run 1 ended in death', S1.phase === 'results' && S1.result && !S1.result.win, S1.result);
M.state.credits += 300; M.buy('rifle');   // a purchase between runs 1 and 2
var S2 = winRun(21);
ok('run 2 won', S2.result && S2.result.win, S2.result && { stage:S2.result.stage, t:S2.result.t });
// run 3: abandoned part way (restart from pause): the next runStart closes it
var S3 = V.Sim.create(31, V.TUNE); play(S3, { stopAt: 600 });
var S4 = winRun(41);
var S5 = winRun(51);
var S6 = winRun(61);
var full = V.UI.report(), sum = V.UI.reportSummary(), parts = R.parts();
var data = dataOf(full), lines = sum.split('\n');
console.log('---- summary ----\n' + sum + '\n---- sizes: summary ' + bytes(parts.summary) + ' B, summary + data block ' + (bytes(parts.summary) + 1 + bytes(parts.data)) + ' B, full with input log ' + bytes(full) + ' B');

// ---------- fields exist ----------
var s = data.session, d = data.device, sv = data.save, e = data.economy, p = data.perf;
['reportAt', 'reportAtUtc', 'sessionStart', 'runsInReport', 'midRun', 'clean', 'reasons', 'warnings'].forEach(function(k){ ok('session.' + k, k in s); });
['window', 'viewport', 'dpr', 'displayMode', 'orientation', 'roomColumns', 'tilePx', 'frameFillPct', 'renderer'].forEach(function(k){ ok('device.' + k, k in d); });
['saveVersion', 'saveValidation', 'resets', 'storageBlocked', 'readOnly'].forEach(function(k){ ok('save.' + k, k in sv); });
['build', 'buildsInSession', 'tuneChanged', 'bandsVersion', 'settings'].forEach(function(k){ ok('build.' + k, k in data.build); });
ok('economy fields', 'credits' in e && 'freshSave' in e && Array.isArray(e.purchaseLog));
ok('perf: play and menu split, gaps tagged with stage', p.frameMs.play.n > 0 && p.frameMs.menu.n > 0 && p.gaps.length >= 1 && p.gaps[0].stage >= 1 && p.gaps[0].ms === 72, p);
ok('menu frames never in play: play max is the 72 ms gap, menu max 90', p.frameMs.play.max === 72 && p.frameMs.menu.max === 90 && p.frameMs.play.p50 === 16.7, p.frameMs);
ok('layout from V.Layout: 704x783 c15 tile 46.9 fill 100', d.viewport === '704x783' && d.tilePx === 46.9 && d.frameFillPct === 100, d);
ok('6 runs played, last 5 in the report, run 1 cut', data.runs.length === 5 && s.runsInReport.join() === '2,3,4,5,6' && s.runsCut.join() === '1', s);
var RUNF = ['runNo', 'runBuild', 'startedAt', 'endedAt', 'endReason', 'result', 'stageReached', 'runSeconds', 'hpMax', 'lowestHp', 'creditsEarned', 'creditsBefore', 'creditsAfter', 'tuneChanged', 'picks', 'bandCompare', 'cols'];
data.runs.forEach(function(r){ RUNF.forEach(function(k){ ok('run ' + r.runNo + ' .' + k, k in r, Object.keys(r)); }); });
var rLast = data.runs[data.runs.length - 1];
ok('latest run keeps damageBySource and roomTimes', 'damageBySource' in rLast && Array.isArray(rLast.roomTimes) && rLast.roomTimes.length >= 9, rLast.roomTimes);
var r3 = data.runs.filter(function(r){ return r.runNo === 3; })[0];
ok('abandoned run: endReason abandon, 0 credits, seconds from sim time', r3 && r3.endReason === 'abandon' && r3.creditsEarned === 0 && r3.runSeconds > 5 && r3.runSeconds < 11, r3);
var r2 = data.runs.filter(function(r){ return r.runNo === 2; })[0];
ok('win: endReason clear, runSeconds = sim seconds, 334 credits ok, lowestHp <= hpMax', r2.endReason === 'clear' && r2.runSeconds === Math.round(S2.result.t * 10) / 10 && r2.creditsEarned === 334 && /^ok/.test(r2.bandCompare.creditsEarned) && r2.lowestHp <= r2.hpMax, r2);
ok('ISO times with offset', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(r2.startedAt) && /T/.test(r2.endedAt), r2.startedAt);
ok('picks carry a level and stage', r2.picks.length > 0 && r2.picks.every(function(x){ return /^SK-\d+:\d+@\d+$/.test(x); }), r2.picks);
ok('runs at 15 columns get the band star', r2.cols === 15 && /\*$/.test(r2.bandCompare.creditsEarned), r2.bandCompare);
ok('purchase log: run 1, Rifle L2, price, before, after', e.purchaseLog.length === 1 && e.purchaseLog[0].run === 1 && e.purchaseLog[0].item === 'Rifle L2' && e.purchaseLog[0].price === 250 && e.purchaseLog[0].after === e.purchaseLog[0].before - 250, e.purchaseLog);
ok('summary row 2 shows the purchase', /^2\*?\s+WIN .*Rifle L2 \(250\)$/m.test(sum), sum);
ok('meta run log holds the F1 fields', (function(){ var m = M.state.runs[M.state.runs.length - 1]; return m.runNo === 6 && m.endReason === 'clear' && m.runBuild === V.UI.BUILD && m.hpMax > 0 && 'lowestHp' in m && m.cols >= 9; })(), M.state.runs[M.state.runs.length - 1]);
ok('save still validates with the new fields', !!M.validate(JSON.parse(st.d[M.KEY])));
ok('freshSave yes (run 1 began from a zero save)', e.freshSave === 'yes', e.freshSave);

// ---------- size ----------
var sz = bytes(parts.summary) + 1 + bytes(parts.data);
ok('summary within 1.5 KB', bytes(parts.summary) <= 1536, bytes(parts.summary));
ok('summary + 5 runs within 8 KB', sz <= 8192, sz);
ok('nothing trimmed at 5 runs', data.trimmed.length === 0, data.trimmed);
ok('summary at most 25 lines', lines.length <= 25, lines.length);
ok('data block has no input log; it sits in its own block after it', !/inputLog|"log"/.test(parts.data) && full.indexOf('=== INPUT LOG') > full.indexOf('=== END DATA BLOCK ===') && /=== END INPUT LOG ===$/.test(full));
ok('input log covers the last run only', (function(){ var m = /INPUT LOG \(last run only, run 6, (\d+) events/.exec(full); return m && +m[1] > 0 && +m[1] < 40; })(), full.slice(full.indexOf('=== INPUT LOG'), full.indexOf('=== INPUT LOG') + 120));

// ---------- line 1 ----------
var L1 = /^VOLLEY REPORT (\S+) \| CLEAN: (YES|NO) \((.*)\) \| (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \| (\d+x\d+) c(\d+) tile ([\d.]+) \| (.+)$/;
var m1 = L1.exec(lines[0]);
ok('line 1 format', !!m1, lines[0]);
ok('line 1: build, CLEAN YES with 5 runs, viewport, columns, tile', m1 && m1[1] === V.UI.BUILD && m1[2] === 'YES' && /^5 runs, 1 warning$/.test(m1[3]) && m1[5] === '704x783' && m1[6] === '15' && m1[7] === '46.9', m1);
ok('flags line lists every flag', /tuning OK \| builds OK \(1\) \| save OK \| not mid-run OK \| debug power OK/.test(sum) && /frame gaps WARN \(1 over 50 ms\) \| viewport OK .* \| save anomaly OK/.test(sum), sum);

// ---------- clean flips when a tuning value changes mid-session ----------
R.markReported();
ok('after a full copy, the next session has no runs: CLEAN NO (no finished runs)', /CLEAN: NO \(no finished runs; 0 runs/.test(V.UI.reportSummary().split('\n')[0]), V.UI.reportSummary().split('\n')[0]);
winRun(71, { onStep:function(S, i){ if (i === 200) V.TUNE.FIRE_INTERVAL = 0.1; if (i === 400) V.TUNE.FIRE_INTERVAL = V.TUNE_DEFAULTS.FIRE_INTERVAL; } });
var l1b = V.UI.reportSummary().split('\n')[0];
ok('slider moved and moved back mid-run: CLEAN NO naming the value', /CLEAN: NO \(tuning changed: FIRE_INTERVAL 0\.1; 1 run/.test(l1b), l1b);
ok('the run carries tuneChanged', dataOf(V.UI.report()).runs.slice(-1)[0].tuneChanged.FIRE_INTERVAL === 0.1);
ok('meta run log carries tuneChanged too', M.state.runs[M.state.runs.length - 1].tuneChanged.FIRE_INTERVAL === 0.1);
R.markReported(); winRun(81);
ok('a clean session after the copy reads YES again', /CLEAN: YES \(1 run/.test(V.UI.reportSummary().split('\n')[0]), V.UI.reportSummary().split('\n')[0]);
V.TUNE.HAPTICS = false; ok('haptics setting is not tuning', /CLEAN: YES/.test(V.UI.reportSummary())); V.TUNE.HAPTICS = true;
M.state.power = 0.5; ok('debug power voids', /CLEAN: NO \(debug power 0\.5/.test(V.UI.reportSummary())); M.state.power = 0;

// ---------- mid-run ----------
var Sm = V.Sim.create(91, V.TUNE); play(Sm, { stopAt: 300 });
var midSum = V.UI.reportSummary(), midData = dataOf(V.UI.report());
ok('mid-run copy: midRun set with run and stage', midData.session.midRun.yes === true && midData.session.midRun.runNo === R.current().runNo && midData.session.midRun.stage >= 1, midData.session.midRun);
ok('mid-run copy: CLEAN NO (run in progress), IN PROGRESS row, flag WARN', /CLEAN: NO \(run in progress/.test(midSum) && /IN PROGRESS stage \d+ \(not counted\)/.test(midSum) && /not mid-run WARN/.test(midSum), midSum);
ok('mid-run copy: the run in progress is not in runs[]', midData.runs.every(function(r){ return r.runNo !== R.current().runNo; }) && midData.runInProgress.runNo === R.current().runNo);
// the safety net: a new S that starts playing without runStart closes the old one as abandon
var Sn = V.Sim.create(92, V.TUNE); for (var k = 0; k < 30; k++) { V.Sim.step(Sn, {}); V.Report.tick(Sn, 16.7, 'play'); }
ok('tick safety net: new S opens a run, the old one closes as abandon', R.current().S === Sn && R.session().runs.filter(function(c){ return c.endReason === 'abandon'; }).length === 2);
V.Sim.api.hurtHero(Sn, 999999, 'E-01', Sn.hero.x, Sn.hero.y); V.Report.tick(Sn, 16.7, 'play');   // a death, then one frame, no runEnd call
ok("tick safety net: a result closes the run without runEnd", Sn.phase === "results" && R.current() === null, { phase: Sn.phase, cur: !!R.current(), same: R.current() && R.current().S === Sn, stage: Sn.stage, t: Sn.t });

// ---------- save health ----------
var bad = mock(); bad.d[M.KEY] = '{broken'; M.load({ storage:bad });
var sh = dataOf(V.UI.report()).save;
ok('corrupt save: validation and reset listed, CLEAN NO', sh.saveValidation === 'reset at load: corrupt' && sh.resets.length === 1 && sh.resets[0].reason === 'corrupt' && /CLEAN: NO \(.*save reset at load: corrupt/.test(V.UI.reportSummary()) && /save anomaly WARN \(corrupt/.test(V.UI.reportSummary()), sh);
var blk = { getItem:function(){ throw new Error('x'); }, setItem:function(){ throw new Error('x'); } }; M.load({ storage:blk });
ok('blocked storage: storageBlocked yes, CLEAN NO', dataOf(V.UI.report()).save.storageBlocked === true && /save storage blocked/.test(V.UI.reportSummary()));

// ---------- fallbacks and robustness ----------
delete V.Layout; var fb = dataOf(V.UI.report());
ok('no V.Layout: report still builds with fallbacks', fb.device.roomColumns >= 9 && 'frameFillPct' in fb.device);
var thrown = null; try { R.tick({ stats:null, hero:null }, 16, 'play'); R.tick(undefined, NaN, 'x'); R.runEnd(null, null); R.runStart(null); R.purchase(null, 'x'); } catch (x) { thrown = x; }
ok('hooks never throw on junk', thrown === null, thrown && thrown.message);

// ---------- 10-run stress: still within the budget (the trim order exists for longer runs) ----------
R._reset(); M.load({ storage:mock(), fresh:true });
for (var q = 0; q < 10; q++) winRun(200 + q);
var big = R.parts(), bsz = bytes(big.summary) + 1 + bytes(big.data);
ok('10 runs: report keeps 5 and stays within 8 KB', dataOf(R.full()).runs.length === 5 && bsz <= 8192, bsz);
console.log('size after 10 wins: summary ' + bytes(big.summary) + ' B, summary + data ' + bsz + ' B, full ' + bytes(R.full()) + ' B');

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
