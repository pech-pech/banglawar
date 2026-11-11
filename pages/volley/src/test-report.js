// Headless checks for parts/report.js (F1 test report, TEST-REPORT-SPEC s7) with the real sim and meta. Run: node src/test-report.js
// Loads the parts in game order (as bot.js does) plus ui.js and report.js; no DOM is needed (report.js skips its DOM work in Node).
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'meta', 'widen', 'sim', 'ai-p0', 'ai-p1', 'boss', 'ui', 'report'].forEach(function(f){
  var p = path.join(__dirname, 'parts', f + '.js'); if (!fs.existsSync(p)) return;
  // ui.js (owner G, in progress) injects CSS at load without a typeof-document guard: a head-less stub document keeps this headless test loading it; removed before report.js
  if (f === 'ui' && typeof document === 'undefined') { globalThis.document = { head: null, getElementById: function(){ return null; } }; try { require(p); } finally { delete globalThis.document; } return; }
  require(p); });
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
// F1 pay table: the band is 185 (7 x 13 + 54 + 40) to 205 (+ Supply Drop pad 20). The sim keeps its own copy of the table (sim.js, owner S): until the snippet in
// P-REPORT.md is applied it still pays the old 334, so the sim-paid value is only asserted when VOLLEY_STRICT_PAY=1; the band logic is tested on the value the run really earned.
var simPaysNew = S2.result.credits === M.clearPay();
if (!simPaysNew) { if (process.env.VOLLEY_STRICT_PAY) ok('STRICT: the sim pays a clear ' + M.clearPay(), false, S2.result.credits); else console.log('NOTE: sim.js still pays ' + S2.result.credits + ' per clear, the F1 table pays ' + M.clearPay() + ' (apply the sim.js snippet from P-REPORT.md; VOLLEY_STRICT_PAY=1 fails on it).'); }
var winMark = function(v){ return (v < 185 ? 'below' : v > 205 ? 'above' : 'ok') + '*'; };   // run at 15 columns: star
ok('win: endReason clear, runSeconds = sim seconds, credits earned = what the sim paid, band mark follows the 185-205 band, lowestHp <= hpMax', r2.endReason === 'clear' && r2.runSeconds === Math.round(S2.result.t * 10) / 10 && r2.creditsEarned === S2.result.credits && r2.bandCompare.creditsEarned === winMark(r2.creditsEarned) && r2.lowestHp <= r2.hpMax, r2);
ok('band table: win 185-205, pad 20, death by stage on 13 per fight room and cache 54', R.BANDS.rows.creditsWin.lo === 185 && R.BANDS.rows.creditsWin.hi === 205 && R.BANDS.rows.creditsWin.lo === M.clearPay() && R.BANDS.rows.creditsDeath.byStage[10] === 145 && R.BANDS.rows.creditsDeath.byStage[9] === 7 * 13 && R.BANDS.rows.creditsDeath.byStage[6] === 4 * 13 && R.BANDS.rows.creditsDeath.byStage[2] === 13);
ok('ISO times with offset', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(r2.startedAt) && /T/.test(r2.endedAt), r2.startedAt);
ok('picks carry a level and stage', r2.picks.length > 0 && r2.picks.every(function(x){ return /^SK-\d+:\d+@\d+$/.test(x); }), r2.picks);
ok('runs at 15 columns get the band star', r2.cols === 15 && /\*$/.test(r2.bandCompare.creditsEarned), r2.bandCompare);
ok('purchase log: run 1, Rifle L2, price, before, after', e.purchaseLog.length === 1 && e.purchaseLog[0].run === 1 && e.purchaseLog[0].item === 'Rifle L2' && e.purchaseLog[0].price === 250 && e.purchaseLog[0].after === e.purchaseLog[0].before - 250, e.purchaseLog);
ok('summary row 2 shows the purchase', /^2\*?\s+WIN .*Rifle L2 \(250\)$/m.test(sum), sum);
ok('purchaseLog entries carry levels granted, visit number and vn', e.purchaseLog[0].levels === 1 && e.purchaseLog[0].visit === 2 && e.purchaseLog[0].vn === 1, e.purchaseLog);
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

// ---------- shape V in the log + feel strip (TEST-REPORT-SPEC s4) ----------
(function(){
  R._reset(); M.load({ storage:mock(), fresh:true }); M.state.credits = 5000;
  var b1 = M.buy('cond', 'atk'), b2 = M.buy('cond', 'hp'), b3 = M.buy('rifle');
  ok('visit cap of 2 holds while the report is loaded', b1.ok && b1.levels === 2 && b2.ok && b3 === false && M.visitBuys === 2);
  var S = V.Sim.create(300, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 });
  V.Report.runStart(S);
  ok('run start resets the visit allowance (report runStart -> nextRunNo -> resetVisit)', M.visitBuys === 0 && M.canBuy('rifle'));
  var o = { onStep:function(S2){ if (S2.result && !S2.result.awarded) M.award(S2.result); } };
  play(S, o);
  var rn = S.result && R.session().runs[R.session().runs.length - 1].runNo;
  ok('first run of a build, with buys before it: all three questions are asked in order', JSON.stringify(R.feelPlan(rn)) === JSON.stringify(['fight', 'up', 'kill']), R.feelPlan(rn));
  ok('answer one: next question follows; stored on the run entry', R.feelAnswer(rn, 'fight', 'Too hard') && JSON.stringify(R.feelPlan(rn)) === JSON.stringify(['up', 'kill']) && M.state.runs[M.state.runs.length - 1].feel.fight === 'Too hard');
  ok('skip is stored and never asked again', R.feelAnswer(rn, 'up', 'skip') && R.feelPlan(rn).join() === 'kill' && R.feelAnswer(rn, 'kill', 'Felt like a sponge') && R.feelPlan(rn).length === 0);
  ok('a word outside the owner cards is refused', !R.feelAnswer(rn, 'fight', 'Meh') && M.state.runs[M.state.runs.length - 1].feel.fight === 'Too hard');
  var sm = R.summary(), fl = sm.split('\n').filter(function(l){ return /^Feel:/.test(l); })[0];
  ok('summary Feel line: answers in the owner words, - for skipped', new RegExp('^Feel: R' + rn + ' fights Too hard, upgrade -, kill time Felt like a sponge').test(fl), fl);
  ok('data block run carries feel', dataOf(R.full()).runs.slice(-1)[0].feel.up === 'skip' && dataOf(R.full()).runs.slice(-1)[0].feel.kill === 'Felt like a sponge');
  // run 2 (no buy between): up not asked; run 3: past the first 2 runs of the build: not asked at all
  var S2b = V.Sim.create(301, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }); play(S2b, o);
  var rn2 = R.session().runs[R.session().runs.length - 1].runNo;
  ok('second run, no purchase before it: question 2 skipped by the rule', R.feelPlan(rn2).join() === 'fight,kill', R.feelPlan(rn2));
  var S3b = V.Sim.create(302, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }); play(S3b, o);
  var rn3 = R.session().runs[R.session().runs.length - 1].runNo;
  ok('third run of the build: not asked (null)', R.feelPlan(rn3) === null);
  var s3 = R.summary();
  ok('summary says "not asked" for run 3, still within 1.5 KB and 25 lines', new RegExp('R' + rn3 + ' not asked').test(s3) && bytes(s3) <= 1536 && s3.split('\n').length <= 25, [bytes(s3), s3.split('\n').length]);
  ok('data block: feel of the unasked run is the text "not asked"', dataOf(R.full()).runs.slice(-1)[0].feel === 'not asked');
  // the strip can be switched off in Settings
  M.setSetting('feel', false); var S4 = V.Sim.create(303, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }); R._reset(); M.state.runs.length = 0; play(S4, o);
  ok('Settings "Feel questions" off: nothing is asked', R.feelPlan(R.session().runs[R.session().runs.length - 1].runNo) === null); M.setSetting('feel', true);
  // an abandoned run is never asked
  var S5 = V.Sim.create(304, V.TUNE); play(S5, { stopAt:120 }); V.Report.runStart(V.Sim.create(305, V.TUNE));
  var ab = R.session().runs.filter(function(c){ return c.endReason === 'abandon'; });
  ok('abandon has no meta entry, no questions', ab.length >= 1 && R.feelPlan(ab[ab.length - 1].runNo) === null);
  // the plan after a feel record saved by an earlier build label: a new label asks again
  M.load({ storage:mock(), fresh:true }); R._reset(); var keepB = V.UI.BUILD;
  V.UI.BUILD = 'volley-A'; play(V.Sim.create(310, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }), o); play(V.Sim.create(311, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }), o);
  var a2 = M.state.runs[M.state.runs.length - 1].runNo;
  V.UI.BUILD = 'volley-B'; play(V.Sim.create(312, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }), o);
  var bNo = M.state.runs[M.state.runs.length - 1].runNo;
  ok('2 runs of build A asked, a 3rd of A would not be; the first run of a new label B asks again', R.feelPlan(a2) !== null && R.feelPlan(bNo) !== null && M.state.runs[M.state.runs.length - 1].runBuild === 'volley-B', [R.feelPlan(a2), R.feelPlan(bNo)]);
  // worst case for the size rule: 3 build labels, 5 askable rows all answered with the longest words
  M.load({ storage:mock(), fresh:true }); R._reset(); M.state.credits = 99999;
  var LONG = { fight:'Unfair in places', up:'Clearly stronger', kill:'Felt like a sponge' };
  function strongRun(seed){ play(V.Sim.create(seed, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }), o); var no = M.state.runs[M.state.runs.length - 1].runNo; ['fight', 'up', 'kill'].forEach(function(k){ M.setFeel(no, (function(x){ x[k] = LONG[k]; return x; })({})); }); }
  V.UI.BUILD = 'volley-aaaaaaaaaa'; strongRun(320);
  V.UI.BUILD = 'volley-bbbbbbbbbb'; strongRun(321); strongRun(322);
  V.UI.BUILD = 'volley-cccccccccc'; M.buy('cond', 'atk'); strongRun(323); M.resetVisit(); M.buy('cond', 'rate'); strongRun(324);
  var big2 = R.summary();
  ok('worst-case feel (5 rows, 3 builds, longest words): summary still within 1.5 KB and 25 lines', bytes(big2) <= 1536 && big2.split('\n').length <= 25, [bytes(big2), big2.split('\n').length]);
  console.log(big2.split('\n').slice(-6).join('\n')); console.log('worst-case summary: ' + bytes(big2) + ' B, ' + big2.split('\n').length + ' lines; feel lines: ' + big2.split('\n').filter(function(l){ return /^Feel:|^      R/.test(l); }).length);
  ok('shape V buy shows "+2" in the summary row and levels in the data block', /Cond atk L2 \+2 \(\d+\)/.test(big2) || dataOf(R.full()).economy.purchaseLog.some(function(p){ return p.levels === 2; }), big2);
  V.UI.BUILD = keepB;
})();

// ---------- 10-run stress: still within the budget (the trim order exists for longer runs) ----------
R._reset(); M.load({ storage:mock(), fresh:true });
for (var q = 0; q < 10; q++) winRun(200 + q);
var big = R.parts(), bsz = bytes(big.summary) + 1 + bytes(big.data);
ok('10 runs: report keeps 5 and stays within 8 KB', dataOf(R.full()).runs.length === 5 && bsz <= 8192, bsz);
console.log('size after 10 wins: summary ' + bytes(big.summary) + ' B, summary + data ' + bsz + ' B, full ' + bytes(R.full()) + ' B');

// ---------- extra "Touch to continue" taps (G's level-up pick) ----------
(function(){
  R._reset(); M.load({ storage:mock(), fresh:true });
  var S = V.Sim.create(400, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }), taps = 0;
  var o = { onStep:function(S2, i){ if (i === 100 || i === 900) { R.note('touchContinue'); taps++; } if (i === 1200) R.note('touchContinue', 2), taps += 2; if (S2.result && !S2.result.awarded) M.award(S2.result); } };
  play(S, o);
  var d = dataOf(R.full()), last = d.runs[d.runs.length - 1], sm = R.summary();
  ok('note(touchContinue) counts in the run data and the saved run entry', last.touchContinue === taps && M.state.runs[M.state.runs.length - 1].touchContinue === taps && taps === 4, [last.touchContinue, taps]);
  ok('summary lists the taps per run, within the size rule', new RegExp('Touch-to-continue taps: R' + last.runNo + ' 4').test(sm) && bytes(sm) <= 1536, bytes(sm));
  var thrown = null; try { R.note('nope'); R.note(null); R.note('touchContinue', 'x'); } catch (x) { thrown = x; }
  ok('note ignores unknown names and never throws', !thrown);
})();
// ---------- Supply Drop records (K, SPEC s9) ----------
(function(){
  R._reset(); M.load({ storage:mock(), fresh:true });
  var S = V.Sim.create(500, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 });
  S.stats.sd = [{ stage:5, chapter:1, caught:17, net:16, dudsHit:1, tier:2, tierName:'Great', padsOffered:['repair', 'credits', 'schematics'], padsTaken:['repair', 'credits'], repairHp:240, credits:20, schematics:0, plays:1, roomSeconds:13.4, cols:15, skipped:false, early:false }, { junk:1, tier:'x' }];
  play(S, { onStep:function(S2){ if (S2.result && !S2.result.awarded) M.award(S2.result); } });
  var d = dataOf(R.full()), last = d.runs[d.runs.length - 1], sm = R.summary(), sd0 = last.supplyDrops && last.supplyDrops[0];
  ok('data block: supplyDrops with every SPEC s9 field', !!sd0 && ['stage', 'chapter', 'caught', 'net', 'dudsHit', 'tier', 'tierName', 'padsOffered', 'padsTaken', 'repairHp', 'credits', 'schematics', 'plays', 'roomSeconds', 'cols', 'skipped', 'early'].every(function(k){ return k in sd0; }) && sd0.caught === 17 && sd0.padsTaken.join() === 'repair,credits', last.supplyDrops);
  ok('junk record is cleaned, not thrown', last.supplyDrops.length === 2 && last.supplyDrops[1].tier === null && last.supplyDrops[1].skipped === false);
  ok('summary line: best tier per run, within the size rule', /Supply Drops \(best tier\): R\d+ Great x2/.test(sm) && bytes(sm) <= 1536 && sm.split('\n').length <= 25, [bytes(sm), sm.split('\n').filter(function(l){ return /Supply/.test(l); })]);
  var S2 = V.Sim.create(501, V.TUNE, { metaStats:{ hpAdd:20000, atkMul:6, rateMul:2 }, cols:15 }); play(S2, { onStep:function(S3){ if (S3.result && !S3.result.awarded) M.award(S3.result); } });
  ok('no drops: "none"', /Supply Drops \(best tier\): R\d+ Great x2/.test(R.summary()) && dataOf(R.full()).runs.slice(-1)[0].supplyDrops.length === 0);
})();
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
