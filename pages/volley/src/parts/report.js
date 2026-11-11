(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.Report: F1 test report (TEST-REPORT-SPEC section 7 must-haves). Owner C. Load after ui.js (before the tabs, home and main).
// Hooks (CONTRACT "Report hooks"; every call is wrapped in try/catch so the report can never break a frame, L-PV-23):
//   V.Report.tick(S, dtMs, mode)   mode 'play' | 'menu'; main.js calls it every visible frame. Splits frame times, tags gaps
//                                  over 50 ms with the stage, samples lowest HP, picks (with level) and damage by source per stage.
//                                  Safety net: it also opens a run on the first play frame of a fresh S and closes one when S.result
//                                  appears, so a missed runStart/runEnd call costs nothing. Both calls are idempotent.
//   V.Report.runStart(S)           opens a run record (an open record on another S is closed first as 'abandon').
//   V.Report.runEnd(S, result)     closes it: 'clear' (win), 'death' (loss) or 'abandon' (no result).
//   V.Report.runFields(result)     meta.js award() asks for the per-run fields it stores in the save (runNo, runBuild, ...).
//   V.Report.purchase(item, price) meta.js buy() calls it after a successful buy.
//   V.Report.summary() / full() / data()   the texts; V.UI.reportSummary() and V.UI.report() return the same.
//   V.Report.markReported()        what "Copy full report" does after copying: the next session starts now.
// Overrides V.UI.report (full: summary + JSON data block + last run's input log) and adds V.UI.reportSummary.
// DOM (browser only, injected here so no other owner's file changes): "Copy summary" next to the drawer's "Copy report";
// Copy summary / Copy full report on the results screen and at the end of the Intel tab; an 11 px stamp line
// (build | local time | run N) on the results screen and above the Home tab bar. No share sheet, no feel strip (owner defaults).
// Privacy: nothing leaves the device; no name, account or device ID.

// ---------- bands (bands.json in spec section 6; kept here as data until the build thread ships the file) ----------
// Slice = chapter 1, 10 stages, measured at 9 columns. Two-sided rows (L-MM-7): lo..hi. A run at other columns gets a '*' mark.
var BANDS = {
  version: 'slice-v1',
  seeds: 200,
  cols: 9,
  source: 'TEST-REPORT-SPEC s6 [F]: bot p10/median/p90, 200 seeds, slice; credits ECONOMY-BASELINE.md',
  rows: {
    winSeconds:   { lo: 108, hi: 130, med: 117, src: 'bot p10-p90, 200 seeds [F]' },
    clearPct:     { lo: 90.5, hi: 90.5, src: 'bot, 200 seeds [F]; printed beside the session wins, never marked under n=10 [G]' },
    creditsWin:   { lo: 334, hi: 334, src: 'ECONOMY-BASELINE: 7 combat x 24 + cache 95 + boss 24 + 47 [F]' },
    // Credits on a death by stage reached: 24 per cleared combat room, cache 95 [F rule]; 3/6/7/8 are the [F] values, the rest [A] from the rule.
    creditsDeath: { byStage: { 1: 0, 2: 24, 3: 48, 4: 72, 5: 96, 6: 96, 7: 120, 8: 144, 9: 168, 10: 263 }, src: 'stages 3,6,7,8 [F]; others [A] from 24/combat room + cache 95' },
    killsWin:     { ref: 28, src: 'bot, slice [F] (single value: printed as ref, no mark)' },
    picksRun:     { ref: 3.85, src: 'bot, slice [F] (single value: printed as ref, no mark)' },
    peakMachines: { ref: 4, design: 11, src: 'bot [F] (not measured in F1-0)' },
    dmgTaken:     null,   // no band yet (spec s6, recheck request 5)
    lowestHp:     null
  }
};
function mark(v, lo, hi){ if (v == null || lo == null) return 'no band'; return v < lo ? 'below' : (v > hi ? 'above' : 'ok'); }

// ---------- small helpers ----------
var EXCLUDE_TUNE = { SOUND: 1, HAPTICS: 1 };   // device settings mirrored into V.TUNE (audio.js, meta.js settings), not balance knobs
var RUNS_KEEP = 5, SESSION_RUNS_MAX = 30, GAPS_MAX = 10, PICKS_MAX = 40, RING = 3600, SIZE_TARGET = 8192, SUMMARY_MAX = 1536;   // RING: about 1 min of frames per mode [G]
function now(){ try { return Date.now(); } catch (e) { return 0; } }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hms(d){ return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
function hm(ms){ return ms ? hms(new Date(ms)).slice(0, 5) : '-'; }
function localStamp(ms){ var d = new Date(ms); return ymd(d) + ' ' + hms(d); }
function isoLocal(ms){   // ISO 8601 local time with the offset, e.g. 2026-11-12T14:32:07+01:00
  if (!ms) return null;
  var d = new Date(ms), o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-'; o = Math.abs(o);
  return ymd(d) + 'T' + hms(d) + s + pad(Math.floor(o / 60)) + ':' + pad(o % 60);
}
function r1(x){ return Math.round(x * 10) / 10; }
function build(){ return (V.UI && V.UI.BUILD) || 'unknown'; }
function tuneDiff(){
  var o = {};
  try { var D = V.TUNE_DEFAULTS, T = V.TUNE; for (var k in D) if (!EXCLUDE_TUNE[k] && T[k] !== D[k]) o[k] = T[k]; } catch (e) {}
  try { if (V.Scene && V.Scene.stress) o.STRESS_SHAPES = V.Scene.stress | 0; } catch (e) {}
  return o;
}
function merge(a, b){ for (var k in b) a[k] = b[k]; return a; }
function metaState(){ return V.Meta && V.Meta.state; }
function credits(){ var m = metaState(); return m ? m.credits : null; }
function power(){ try { return V.Meta ? (+V.Meta.state.power || 0) : 0; } catch (e) { return 0; } }
function freshSave(){ var m = metaState(); return !!m && m.credits === 0 && m.rifle.lvl === 1 && m.buys === 0 && (!m.runs || !m.runs.length); }
function inputLast(){ try { var l = V.Input && V.Input.log ? V.Input.log() : []; return l.length ? l[l.length - 1][0] : -1; } catch (e) { return -1; } }

// ---------- frame stats: a ring per mode (play / menu) ----------
function ring(){ return { a: new Float64Array(RING), n: 0, i: 0, max: 0, count: 0 }; }
function push(r, v){ r.a[r.i] = v; r.i = (r.i + 1) % RING; if (r.n < RING) r.n++; if (v > r.max) r.max = v; r.count++; }
function pct(r, p){ if (!r.n) return 0; var b = Array.prototype.slice.call(r.a, 0, r.n).sort(function(x, y){ return x - y; }); return r1(b[Math.min(b.length - 1, Math.floor(p * b.length))]); }

// ---------- session state ----------
var sess, cur = null, lastS = null, memRunNo = 0;
function newSession(t){
  var keep = sess ? sess : null;
  sess = { start: t, loadAt: keep ? keep.loadAt : t, reportedUpTo: keep ? keep.reportedUpTo : 0, runs: keep ? keep.runs : [], purchases: keep ? keep.purchases : [],
    firstFresh: keep ? keep.firstFresh : null, play: ring(), menu: ring(), gaps: [], gapsPlay: 0, gapsMenu: 0, lastMode: '', errors: keep ? keep.errors : 0, ticks: 0 };
}
newSession(now());
var R = V.Report = { BANDS: BANDS };
function err(e){ sess.errors++; if (sess.errors < 4) { try { console.warn('volley report:', e); } catch (_) {} } }

function nextRunNo(){
  try { if (V.Meta && V.Meta.nextRunNo) return V.Meta.nextRunNo(); } catch (e) {}
  var m = metaState(), last = 0;
  if (m && m.runs) m.runs.forEach(function(r){ if (r.runNo > last) last = r.runNo; });
  memRunNo = Math.max(memRunNo, last) + 1; return memRunNo;
}
function layoutNow(){
  var L = V.Layout, o = { cols: 9, tile: null, fill: null, clamped: false, viewport: null, src: 'none' };
  try {
    if (L && L.W) {
      o.src = 'V.Layout'; o.viewport = Math.round(L.W) + 'x' + Math.round(L.H);
      o.cols = L.C || (typeof L.cols === 'function' ? L.cols() : L.cols) || 9;   // C = the room on screen now; cols() = the next room entry
      o.tile = L.tile != null ? r1(L.tile) : null;
      var rw = L.roomW != null ? L.roomW : (o.tile ? o.cols * L.tile : null), wu = L.Wu || L.W;
      o.fill = rw != null && wu ? Math.round(100 * Math.min(1, rw / wu)) : null;
      o.clamped = 'clamped' in L ? !!L.clamped : !!(L.t0 && wu && wu / L.t0 > 16);
    } else if (G.__pv && G.__pv.frame) {   // f0-3 fallback: scaled 882-unit frame, 9 columns
      var f = G.__pv.frame, v = G.__pv.view || {};
      o.src = 'frame'; o.viewport = Math.round(f.vw) + 'x' + Math.round(f.vh);
      o.tile = v.s ? r1(v.s * (f.scale || 1)) : null;
      o.fill = f.vw ? Math.round(100 * Math.min(1, f.w / f.vw)) : null;
    } else if (G.innerWidth) { o.src = 'window'; o.viewport = (G.innerWidth | 0) + 'x' + (G.innerHeight | 0); }
  } catch (e) { err(e); }
  return o;
}
function hpOf(S){ var h = S && S.hero; return h ? Math.max(0, Math.round(h.hp)) : null; }

// ---------- run records ----------
function openRun(S){
  var t = now(), lay = layoutNow();
  cur = { S: S, runNo: nextRunNo(), runBuild: build(), startMs: t, endMs: 0, endReason: '', result: 'in progress', stageReached: S.stage || 1,
    runSeconds: 0, hpMax: S.hero ? S.hero.maxHp : null, lowestHp: hpOf(S), dmgTaken: 0, kills: 0, level: 1,
    creditsEarned: 0, creditsBefore: credits(), creditsAfter: null, tuneChanged: tuneDiff(), power: power(), fresh: freshSave(),
    cols: S.cols || (S.room && S.room.w) || lay.cols || 9, tilePx: lay.tile, seed: S.seed,
    picks: [], picksSeen: 0, dmgBy: {}, dmg0: 0, hits0: {}, roomTimes: [], lastT: S.t || 0, inT0: inputLast(), inT1: null };
  sess.runs.push(cur);
  if (sess.firstFresh == null) sess.firstFresh = cur.fresh;
  if (sess.runs.length > SESSION_RUNS_MAX) sess.runs.splice(0, sess.runs.length - SESSION_RUNS_MAX);
  return cur;
}
function sample(S){   // per frame while a run is open; cheap diffs only
  var c = cur, st = S.stats || {}, h = S.hero;
  if (h) { var hp = Math.max(0, Math.round(h.hp)); if (c.lowestHp == null || hp < c.lowestHp) c.lowestHp = hp; if (h.maxHp > (c.hpMax || 0)) c.hpMax = h.maxHp; c.level = h.level || c.level; }
  if (S.stage > c.stageReached) c.stageReached = S.stage;
  var cols = S.cols || (S.room && S.room.w); if (cols) c.cols = cols;
  c.lastT = S.t || c.lastT;
  var pk = st.picks;
  if (pk && pk.length > c.picksSeen) {
    for (var i = c.picksSeen; i < pk.length && c.picks.length < PICKS_MAX; i++) {
      var id = pk[i], lv = 0; for (var j = 0; j <= i; j++) if (pk[j] === id) lv++;
      c.picks.push({ id: id, lv: lv, heroLv: h ? h.level : null, stage: S.stage });
    }
    c.picksSeen = pk.length;
  }
  var d = st.dmgTaken || 0;
  if (d > c.dmg0) {   // damage by source per stage: the hitsBy counter that moved this frame gets the damage ('mixed' if several did)
    var by = st.hitsBy || {}, moved = [];
    for (var k in by) if ((by[k] || 0) > (c.hits0[k] || 0)) moved.push(k);
    var src = moved.length === 1 ? moved[0] : (moved.length ? 'mixed' : 'other');
    var key = String(S.stage), row = c.dmgBy[key] || (c.dmgBy[key] = {});
    row[src] = (row[src] || 0) + (d - c.dmg0);
    c.dmg0 = d; for (var k2 in by) c.hits0[k2] = by[k2];
  }
}
function closeRun(S, result, reason){
  var c = cur; if (!c) return null;
  if (S && S === c.S) sample(S);
  var st = (S && S.stats) || {};
  c.endMs = now();
  c.endReason = reason || (result ? (result.win ? 'clear' : 'death') : 'abandon');
  c.result = result ? (result.win ? 'win' : 'loss') : 'abandon';
  if (result) {
    c.stageReached = result.stage != null ? result.stage : c.stageReached;
    c.runSeconds = r1(+result.t || (S && S.t) || 0);
    c.kills = result.kills | 0; c.dmgTaken = Math.round(result.dmgTaken || 0); c.level = result.level || c.level;
    c.creditsEarned = result.credits | 0;
    if (c.endReason === 'death') c.lowestHp = 0;
  } else {
    c.runSeconds = r1(c.lastT || 0); c.kills = st.kills | 0; c.dmgTaken = Math.round(st.dmgTaken || 0); c.creditsEarned = 0;
  }
  merge(c.tuneChanged, tuneDiff());
  if (power() > c.power) c.power = power();
  c.creditsAfter = credits();
  c.roomTimes = (st.roomTimes || []).map(function(r){ return [r.stage, r.s]; });
  c.braced = st.playSteps ? Math.round(100 * (st.bracedSteps || 0) / st.playSteps) : null;
  c.inT1 = inputLast();
  c.S = null;   // never keep the sim alive
  cur = null;
  return c;
}

R.runStart = function(S){
  try {
    if (!S) return;
    if (cur && cur.S === S && !S.result && (S.t || 0) + 0.5 >= cur.lastT) return;   // same run (deploy calls this after restart too)
    if (cur) closeRun(cur.S, null, 'abandon');
    openRun(S); lastS = S;
  } catch (e) { err(e); }
};
R.runEnd = function(S, result){
  try {
    if (!cur) return;
    if (S && cur.S !== S) return;   // a stale call for an older run
    closeRun(S || cur.S, result || (S && S.result) || null);
    paintStamps();
  } catch (e) { err(e); }
};
// meta.js award() stores these with the run log entry. Called inside the sim's endRun, before runEnd(): read the open run.
R.runFields = function(result){
  try {
    var c = cur; if (!c) return null;
    if (c.S && c.S.stats) sample(c.S);
    var t = merge({}, c.tuneChanged); merge(t, tuneDiff());
    return { runNo: c.runNo, runBuild: c.runBuild, startedAt: c.startMs, endReason: result ? (result.win ? 'clear' : 'death') : 'abandon',
      hpMax: c.hpMax, lowestHp: result && !result.win ? 0 : c.lowestHp, tuneChanged: t, picks: c.picks.map(function(p){ return p.id + ':' + p.lv; }), cols: c.cols };
  } catch (e) { err(e); return null; }
};
R.purchase = function(item, price){
  try {
    var after = credits();
    sess.purchases.push({ t: now(), run: lastRunNo(), item: String(item), price: price | 0, before: after != null ? after + (price | 0) : null, after: after });
    if (sess.purchases.length > 40) sess.purchases.shift();
  } catch (e) { err(e); }
};
function lastRunNo(){ var m = metaState(); if (m && m.runSeq) return m.runSeq; var l = sess.runs[sess.runs.length - 1]; return l ? l.runNo : 0; }

R.tick = function(S, dtMs, mode){
  try {
    mode = mode === 'play' ? 'play' : 'menu';
    sess.ticks++;
    if (mode !== sess.lastMode) sess.lastMode = mode;            // first frame after a switch carries the switch itself: not counted
    else if (dtMs > 0 && dtMs < 6e4) {
      push(mode === 'play' ? sess.play : sess.menu, dtMs);
      if (dtMs > 50) {
        if (mode === 'play') { sess.gapsPlay++; if (sess.gaps.length < GAPS_MAX) sess.gaps.push({ ms: Math.round(dtMs), stage: S ? S.stage : null, run: cur ? cur.runNo : null }); }
        else sess.gapsMenu++;
      }
    }
    if (!S) return;
    lastS = S;
    // safety net for missed hooks: a fresh S playing opens a run; a result closes it
    if (cur && cur.S !== S && !S.result && mode === 'play') { closeRun(cur.S, null, 'abandon'); }
    if (!cur && mode === 'play' && !S.result && (S.phase === 'play' || S.phase === 'clear')) {
      var l = sess.runs[sess.runs.length - 1];
      if (!l || l.S !== S) openRun(S);
    }
    if (cur && cur.S === S) {
      if (S.result) { closeRun(S, S.result); paintStamps(); return; }
      if (mode === 'play') sample(S);
      if (sess.ticks % 60 === 0) merge(cur.tuneChanged, tuneDiff());
    }
  } catch (e) { err(e); }
};

// ---------- save health ----------
function saveHealth(){
  var M = V.Meta, o = { saveVersion: null, saveKey: null, saveValidation: 'no meta', resets: [], storageBlocked: null, readOnly: false, freshSave: null };
  if (!M) return o;
  o.saveVersion = M.VERSION; o.saveKey = M.KEY; o.storageBlocked = M.storageOk === false; o.readOnly = !!M.readOnly;
  o.saveValidation = o.storageBlocked ? 'storage blocked' : (M.readOnly ? 'newer save: read-only' : (M.resetSignal ? 'reset at load: ' + M.resetSignal : 'ok'));
  var rs = (M.state && M.state.resets) || [];
  o.resets = rs.map(function(r){ return { at: isoLocal(r.t), reason: r.reason }; });
  return o;
}

// ---------- the report model ----------
function runView(c, earlier){
  var p = c.picks || [];
  var isNew = !earlier && c.runNo > sess.reportedUpTo;
  return { runNo: c.runNo, runBuild: c.runBuild, mark: earlier ? 'earlier' : (isNew ? 'new' : 'reported'), isNew: isNew, earlier: !!earlier, startedAt: isoLocal(c.startMs), endedAt: isoLocal(c.endMs),
    startMs: c.startMs, endMs: c.endMs, endReason: c.endReason || '', result: c.result, stageReached: c.stageReached, runSeconds: c.runSeconds, hpMax: c.hpMax, lowestHp: c.lowestHp,
    dmgTaken: c.dmgTaken, kills: c.kills, level: c.level, creditsEarned: c.creditsEarned, creditsBefore: c.creditsBefore, creditsAfter: c.creditsAfter,
    tuneChanged: c.tuneChanged || {}, power: c.power || 0, freshSave: c.fresh, cols: c.cols, tilePx: c.tilePx, seed: c.seed,
    bracedUptimePct: c.braced != null ? c.braced : null, picks: p.map(function(x){ return x.id + ':' + x.lv + (x.stage ? '@' + x.stage : ''); }), damageBySource: c.dmgBy || null, roomTimes: c.roomTimes || null };
}
function fromMeta(r){   // a run saved by an earlier page load (meta run log with the F1 fields)
  return { runNo: r.runNo, runBuild: r.runBuild || '?', startMs: r.startedAt || 0, endMs: r.t, endReason: r.endReason || (r.win ? 'clear' : 'death'),
    result: r.win ? 'win' : 'loss', stageReached: r.stage, runSeconds: r.dur, hpMax: r.hpMax != null ? r.hpMax : null, lowestHp: r.lowestHp != null ? r.lowestHp : null,
    dmgTaken: null, kills: r.kills, level: null, creditsEarned: r.credits, creditsBefore: null, creditsAfter: null, tuneChanged: r.tuneChanged || {}, power: 0,
    fresh: null, cols: r.cols || 9, tilePx: null, seed: null, picks: (r.picks || []).map(function(s){ var a = String(s).split(':'); return { id: a[0], lv: +a[1] || 1 }; }), dmgBy: null, roomTimes: null };
}
function bandCompare(r){
  var B = BANDS.rows, star = r.cols && r.cols !== BANDS.cols ? '*' : '', o = {};
  if (r.result === 'win') {
    o.runSeconds = mark(r.runSeconds, B.winSeconds.lo, B.winSeconds.hi) + star;
    o.creditsEarned = mark(r.creditsEarned, B.creditsWin.lo, B.creditsWin.hi) + star;
    o.kills = 'ref ' + B.killsWin.ref;
  } else if (r.result === 'loss') {
    var cd = B.creditsDeath.byStage[r.stageReached];
    o.runSeconds = 'no band'; o.creditsEarned = cd == null ? 'no band' : mark(r.creditsEarned, cd, cd) + star; o.kills = 'no band';
  } else { o.runSeconds = 'no band'; o.creditsEarned = 'no band'; o.kills = 'no band'; }
  return o;   // picks (ref 3.85), lowestHp and dmgTaken have no band: see the bands table
}
function model(){
  var t = now(), M = V.Meta, lay = layoutNow();
  // rows: the last 5 runs (owner default, spec card 3); runs saved by earlier page loads fill in when this load has fewer.
  // Only runs new since the last full copy (or build load) count in the verdict; the others are context.
  var done = sess.runs.filter(function(c){ return c !== cur; });
  var mine = {}; done.forEach(function(c){ mine[c.runNo] = 1; });
  var first = done.length ? done[0].runNo : (cur ? cur.runNo : Infinity), olds = [];
  var m = metaState();
  if (m && m.runs) m.runs.forEach(function(r){ if (r.runNo && !mine[r.runNo] && r.runNo < first) olds.push(fromMeta(r)); });
  var rows = olds.map(function(c){ return runView(c, true); }).concat(done.map(function(c){ return runView(c, false); }));
  var cut = Math.max(0, rows.length - RUNS_KEEP), cutNos = rows.slice(0, cut).map(function(r){ return r.runNo; });
  rows = rows.slice(cut);
  rows.forEach(function(r){ r.bandCompare = bandCompare(r); });
  var counted = rows.filter(function(r){ return r.isNew; });   // the verdict covers the session: runs since build load or the last full copy
  // verdict (spec section 1 clean rule + debug power, which also changes balance)
  var reasons = [], warns = [], tune = {}, builds = {};
  counted.forEach(function(r){ merge(tune, r.tuneChanged); builds[r.runBuild] = 1; });
  if (cur) { merge(tune, cur.tuneChanged); merge(tune, tuneDiff()); }
  var tk = Object.keys(tune), bl = Object.keys(builds), sh = saveHealth(), pw = Math.max(power(), counted.reduce(function(a, r){ return Math.max(a, r.power || 0); }, 0));
  if (tk.length) reasons.push('tuning changed: ' + tk.map(function(k){ return k + ' ' + tune[k]; }).join(', '));
  if (bl.length > 1) reasons.push(bl.length + ' builds');
  if (pw > 0) reasons.push('debug power ' + pw);
  if (sh.saveValidation !== 'ok') reasons.push('save ' + sh.saveValidation);
  if (cur) reasons.push('run in progress');
  if (!counted.length) reasons.push('no finished runs');
  var gapsN = sess.gapsPlay;
  if (gapsN) warns.push('frame gaps: ' + gapsN + ' over 50 ms');
  var fillOk = lay.fill == null || lay.fill >= 100;
  if (!fillOk) warns.push('viewport: room fills ' + lay.fill + '% of width' + (lay.clamped ? ' (beyond 15-column clamp)' : ''));
  var resetsHere = (sh.resets || []).length && M && M.resetSignal;
  var clean = !reasons.length;
  var dm = 'browser';
  try { if (G.matchMedia) { if (G.matchMedia('(display-mode: fullscreen)').matches) dm = 'fullscreen'; else if (G.matchMedia('(display-mode: standalone)').matches) dm = 'standalone'; else if (G.matchMedia('(display-mode: minimal-ui)').matches) dm = 'minimal-ui'; } } catch (e) {}
  var ori = 'unknown';
  try { ori = G.innerWidth ? (G.innerWidth > G.innerHeight ? 'landscape' : 'portrait') : ((G.screen && G.screen.orientation && G.screen.orientation.type) ? G.screen.orientation.type.split('-')[0] : 'unknown'); } catch (e) {}   // the window's shape (what the layout uses)
  var met = null; try { met = G.__pv && G.__pv.metrics ? G.__pv.metrics() : null; } catch (e) {}
  var wins = counted.filter(function(r){ return r.result === 'win'; }).length, fin = counted.filter(function(r){ return r.result !== 'abandon'; }).length;
  return {
    t: t, rows: rows, cutNos: cutNos, counted: counted, clean: clean, reasons: reasons, warns: warns, tune: tune, builds: bl, power: pw, save: sh, lay: lay, gapsN: gapsN,
    resetsHere: !!resetsHere, wins: wins, fin: fin,
    session: { reportAt: isoLocal(t), reportAtUtc: new Date(t).toISOString(), sessionStart: isoLocal(sess.start), buildLoadedAt: isoLocal(sess.loadAt),
      runsInReport: rows.map(function(r){ return r.runNo; }), runsCut: cutNos, newSinceLastCopy: rows.filter(function(r){ return r.isNew; }).map(function(r){ return r.runNo; }),
      midRun: cur ? { yes: true, runNo: cur.runNo, stage: lastS && lastS.stage } : { yes: false }, clean: clean ? 'yes' : 'no', reasons: reasons, warnings: warns, reportErrors: sess.errors },
    device: { window: (G.innerWidth | 0) + 'x' + (G.innerHeight | 0), viewport: lay.viewport, dpr: G.devicePixelRatio || 1, displayMode: dm, orientation: ori,
      roomColumns: (cur && cur.cols) || (counted.length ? counted[counted.length - 1].cols : lay.cols), tilePx: lay.tile, frameFillPct: lay.fill, layoutSource: lay.src,
      renderer: met ? met.renderer : 'unknown', ua: (G.navigator && navigator.userAgent) || '' },
    buildInfo: { build: build(), buildsInSession: bl, tuneChanged: tune, bandsVersion: BANDS.version, settings: V.TUNE || null },
    economy: { credits: credits(), rifleLevel: m && m.rifle ? m.rifle.lvl : null, cond: m ? m.cond : null, runCount: m && m.runs ? m.runs.length : null, best: m ? m.best : null,
      power: power(), freshSave: (function(){ var f = sess.firstFresh != null ? sess.firstFresh : freshSave(); return f ? 'yes' : 'no'; })(),   // run 1 of this page load began from a zero save
      purchaseLog: purchaseLog(rows) },
    perf: { frameMs: { play: { p50: pct(sess.play, 0.5), p95: pct(sess.play, 0.95), max: r1(sess.play.max), n: sess.play.count },
      menu: { p50: pct(sess.menu, 0.5), p95: pct(sess.menu, 0.95), max: r1(sess.menu.max), n: sess.menu.count } },
      gapsOver50ms: gapsN, gapsMenu: sess.gapsMenu, gaps: sess.gaps.slice() },
    audio: V.Audio ? { state: V.Audio.state, muted: !!V.Audio.muted, played: V.Audio.played, dropped: V.Audio.dropped } : null
  };
}
function purchaseLog(rows){
  var m = metaState(), from = rows.length ? rows[0].runNo - 1 : 0, src = (m && m.purchases) ? m.purchases : sess.purchases;
  return src.filter(function(p){ return p.run >= from; }).map(function(p){ return { run: p.run, at: isoLocal(p.t), item: p.item + (p.lvl ? ' L' + p.lvl : ''), price: p.price, before: p.before, after: p.after }; });
}

// ---------- texts ----------
function rpad(s, n){ s = String(s); while (s.length < n - 1) s += ' '; return s + ' '; }   // always at least one space
function line1(md){
  var lay = md.lay, n = md.counted.length, w = md.warns.length;
  return 'VOLLEY REPORT ' + build() + ' | CLEAN: ' + (md.clean ? 'YES' : 'NO') + ' (' + (md.clean ? '' : md.reasons.join('; ') + '; ') + n + ' run' + (n === 1 ? '' : 's') + ', ' + w + ' warning' + (w === 1 ? '' : 's') + ')' +
    ' | ' + localStamp(md.t) + ' | ' + (lay.viewport || '?') + ' c' + md.device.roomColumns + ' tile ' + (lay.tile != null ? lay.tile : '?') + ' | ' + md.device.renderer;
}
function summaryText(md){
  var L = [], s = md.session, d = md.device, B = BANDS.rows, eco = md.economy;
  L.push(line1(md));
  L.push('Taken ' + localStamp(md.t) + ' local (' + s.reportAtUtc.slice(11, 19) + 'Z) | session since ' + hms(new Date(sess.start)) + ' | window ' + d.window + ' dpr ' + r1(d.dpr) + ' ' + d.displayMode + ' ' + d.orientation + ' | room fills ' + (d.frameFillPct != null ? d.frameFillPct + '%' : '?') + ' of width');
  L.push('Credits now ' + (eco.credits != null ? eco.credits : '?') + ' at ' + hms(new Date(md.t)) + ' | fresh save: ' + eco.freshSave + ' | save v' + md.save.saveVersion + ' ' + md.save.saveValidation + ' | bands: ' + BANDS.version + ' (bot, ' + BANDS.seeds + ' seeds, c' + BANDS.cols + '; * = other columns)');
  L.push('');
  L.push('Run  Result  Stage  Time (bot ' + B.winSeconds.lo + '-' + B.winSeconds.hi + ' s)  Low HP     Credits (bot)    Bought before run');
  var pl = eco.purchaseLog;
  md.rows.forEach(function(r){
    var bc = r.bandCompare, bought = pl.filter(function(p){ return p.run === r.runNo - 1; }).map(function(p){ return p.item + ' (' + p.price + ')'; }).join(', ') || 'none';
    var cb = r.result === 'win' ? B.creditsWin.lo : B.creditsDeath.byStage[r.stageReached];
    L.push(rpad(r.runNo + (r.isNew ? '*' : (r.earlier ? 'e' : '')), 5) + rpad(r.result === 'abandon' ? 'ABAND' : r.result.toUpperCase(), 8) + rpad(r.stageReached + '/10', 7) +
      rpad(Math.round(r.runSeconds || 0) + ' s (' + bc.runSeconds + ')', 22) + rpad((r.lowestHp != null ? r.lowestHp : '?') + '/' + (r.hpMax != null ? r.hpMax : '?'), 11) +
      rpad(r.creditsEarned + ' (' + (cb != null && r.result !== 'abandon' ? cb + ' ' : '') + bc.creditsEarned + ')', 17) + bought);
  });
  if (cur) L.push(rpad(cur.runNo, 5) + 'IN PROGRESS stage ' + ((lastS && lastS.stage) || cur.stageReached) + ' (not counted)');
  if (!md.rows.length && !cur) L.push('(no runs yet)');
  L.push('Marks: * = new this session (in the verdict), e = earlier page load, unmarked = already reported. Clear ' + md.wins + '/' + md.fin + (md.fin < 10 ? ' (n = ' + md.fin + ', too few)' : '') + ' vs bot ' + B.clearPct.lo + '%');
  var fp = md.perf.frameMs.play, fm = md.perf.frameMs.menu, gt = md.perf.gaps.map(function(g){ return g.stage; }).join(', ');
  L.push('Frame, play only: p50 ' + fp.p50 + ' ms, p95 ' + fp.p95 + ' ms, max ' + fp.max + ' ms (' + fp.n + ' frames); ' + md.gapsN + ' gaps over 50 ms' + (gt ? ' (stage ' + gt + ')' : '') + ' | menu p50 ' + fm.p50 + ', p95 ' + fm.p95);
  var tk = Object.keys(md.tune);
  L.push('Flags: tuning ' + (tk.length ? 'NO (' + tk.join(', ') + ')' : 'OK') + ' | builds ' + (md.builds.length > 1 ? 'NO (' + md.builds.join(', ') + ')' : 'OK (' + md.builds.length + ')') +
    ' | save ' + (md.save.saveValidation === 'ok' ? 'OK' : 'NO (' + md.save.saveValidation + ')') + ' | not mid-run ' + (cur ? 'WARN (run ' + cur.runNo + ')' : 'OK') + ' | debug power ' + (md.power > 0 ? 'NO (' + md.power + ')' : 'OK'));
  var rs = md.save.resets, lastReset = rs.length ? rs[rs.length - 1] : null;
  L.push('       frame gaps ' + (md.gapsN ? 'WARN (' + md.gapsN + ' over 50 ms)' : 'OK') + ' | viewport ' + (md.lay.fill == null || md.lay.fill >= 100 ? 'OK' : 'WARN') + ' (room fills ' + (md.lay.fill != null ? md.lay.fill + '%' : '?') + ' of width)' +
    ' | save anomaly ' + (md.resetsHere ? 'WARN (' + (lastReset ? lastReset.reason + ' ' + lastReset.at : '') + ')' : 'OK') + (sess.errors ? ' | report errors ' + sess.errors : ''));
  L.push('Feel: not asked (feel strip is a later F1 build)');
  L.push('Run stamps: ' + (md.rows.map(function(r){ return 'R' + r.runNo + ' ' + hm(r.startMs) + '-' + hm(r.endMs || 0); }).join(' | ') || 'none'));
  return L.join('\n');
}
// JSON with one top-level key per line and one run per line: valid JSON, still readable in a chat paste.
function blockJson(o){
  var keys = Object.keys(o), out = [];
  keys.forEach(function(k){
    var v = o[k], s;
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') s = '[\n' + v.map(function(x){ return JSON.stringify(x); }).join(',\n') + '\n]';
    else s = JSON.stringify(v);
    out.push(JSON.stringify(k) + ':' + s);
  });
  return '{\n' + out.join(',\n') + '\n}';
}
function dataBlock(md, summaryLen){
  var runs = md.rows.map(function(r){ var x = merge({}, r); delete x.startMs; delete x.endMs; delete x.isNew; delete x.earlier; return x; });
  var trimmed = [];
  var blk = { session: md.session, device: md.device, build: md.buildInfo, save: md.save, economy: md.economy, perf: md.perf, audio: md.audio,
    bands: compactBands(), trimmed: trimmed,
    legend: 'picks id:level@stage; roomTimes [stage, s]; damageBySource {stage: {source: damage}}; times ISO local; mark new = in the verdict', runs: runs };
  if (cur) blk.runInProgress = { runNo: cur.runNo, stage: lastS && lastS.stage, runSeconds: r1(cur.lastT || 0), lowestHp: cur.lowestHp, hpMax: cur.hpMax, tuneChanged: cur.tuneChanged };
  function size(){ return summaryLen + 1 + utf8len(blockJson(blk)); }
  // spec section 3 drop order
  if (size() > SIZE_TARGET) { runs.forEach(function(r, i){ if (i < runs.length - 1) { delete r.damageBySource; delete r.roomTimes; } }); trimmed.push('damageBySource and roomTimes of older runs'); }
  if (size() > SIZE_TARGET) { blk.build = merge({}, blk.build); delete blk.build.settings; trimmed.push('settings (tuneChanged stays)'); }
  if (size() > SIZE_TARGET) { blk.bands = { version: BANDS.version }; trimmed.push('band table (version stays)'); }
  while (size() > SIZE_TARGET && runs.length > 3) { trimmed.push('run ' + runs[0].runNo); runs.shift(); }
  return blockJson(blk);
}
function compactBands(){
  var B = BANDS.rows;
  return { version: BANDS.version, seeds: BANDS.seeds, cols: BANDS.cols, source: BANDS.source, winSeconds: [B.winSeconds.lo, B.winSeconds.hi, B.winSeconds.med], clearPct: B.clearPct.lo,
    creditsWin: B.creditsWin.lo, creditsDeathByStage: B.creditsDeath.byStage, creditsDeathNote: B.creditsDeath.src, killsWinRef: B.killsWin.ref, picksRunRef: B.picksRun.ref,
    peakMachines: [B.peakMachines.ref, B.peakMachines.design], noBand: ['dmgTaken', 'lowestHp'] };
}
function utf8len(s){ var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 0x80 ? 1 : (c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3)); } return n; }
R.utf8len = utf8len;
function inputLog(md){
  var I = V.Input; if (!I || !I.log) return '=== INPUT LOG: none (no input module) ===';
  var last = md.rows.length ? md.rows[md.rows.length - 1] : null, run = cur || (last && !last.earlier ? sess.runs.filter(function(c){ return c.runNo === last.runNo; })[0] : null);
  var all = I.log(), t0 = run ? run.inT0 : -1, t1 = run && run.inT1 != null ? run.inT1 : Infinity;
  var ev = all.filter(function(e){ return e[0] > t0 && e[0] <= t1; });
  var head = '=== INPUT LOG (last run only' + (run ? ', run ' + run.runNo : '') + ', ' + ev.length + ' events; the input module keeps the last 200; fields ms,kind,x,y) ===';
  return head + '\n' + (ev.map(function(e){ return e.join(','); }).join(' ') || '(empty)') + '\ncounts ' + JSON.stringify(I.counts || {}) + '\n=== END INPUT LOG ===';
}
R.model = model;
R.summary = function(){ try { return summaryText(model()); } catch (e) { err(e); return 'VOLLEY REPORT ' + build() + ' | CLEAN: NO (report error: ' + (e && e.message) + ')'; } };
R.parts = function(){
  var md = model(), sm = summaryText(md), sl = utf8len(sm), db = dataBlock(md, sl);
  var head = sm + '\nFull data block follows (' + r1((sl + utf8len(db)) / 1024) + ' KB with the summary, last ' + md.rows.length + ' runs, no input logs).';
  return { summary: sm, data: db, input: inputLog(md), headed: head, model: md };
};
R.full = function(){
  try { var p = R.parts(); return p.headed + '\n=== DATA BLOCK (JSON) ===\n' + p.data + '\n=== END DATA BLOCK ===\n' + p.input; }
  catch (e) { err(e); return 'VOLLEY REPORT ' + build() + ' | CLEAN: NO (report error: ' + (e && e.message) + ')'; }
};
R.data = function(){ return R.parts().data; };
R.markReported = function(){
  var t = now(), done = sess.runs.filter(function(c){ return c !== cur; }), last = done.length ? done[done.length - 1].runNo : sess.reportedUpTo;
  sess.reportedUpTo = Math.max(sess.reportedUpTo, last);
  newSession(t);
  paintStamps();
};
R.session = function(){ return sess; };
R.current = function(){ return cur; };
R._reset = function(){ cur = null; lastS = null; memRunNo = 0; sess = null; newSession(now()); };   // tests only

if (V.UI) {
  V.UI.report = function(){ return R.full(); };
  V.UI.reportSummary = function(){ return R.summary(); };
}

// ---------- DOM: copy buttons and the screenshot stamp (browser only) ----------
var D = typeof document !== 'undefined' ? document : null;
function $(id){ return D && D.getElementById(id); }
function copyText(text, okMsg){
  var done = function(ok){ var m = ok ? okMsg : 'Copy blocked: text is in window.__pv.lastCopy'; try { if (V.UI && V.UI.toast) V.UI.toast(m, 1600); } catch (e) {} var dm = $('drMsg'); if (dm) dm.textContent = m; };
  if (V.UI) V.UI.lastCopy = text;
  var fallback = function(){
    var ta = $('copyArea'), r = false;
    if (ta) { ta.value = text; ta.style.left = '0'; ta.focus(); ta.select(); try { r = D.execCommand('copy'); } catch (e) {} ta.style.left = '-9999px'; }
    done(r);
  };
  try { if (G.navigator && navigator.clipboard && G.isSecureContext) { navigator.clipboard.writeText(text).then(function(){ done(true); }, fallback); return; } } catch (e) {}
  fallback();
}
function copySummary(){ copyText(R.summary(), 'Summary copied'); }
function copyFull(){ copyText(R.full(), 'Full report copied'); R.markReported(); }
R.copySummary = copySummary; R.copyFull = copyFull;
var CSS = '.rp-btns{display:flex;gap:8px;width:100%;max-width:312px}' +
  '#ovDead .rp-btns .btn{flex:1;min-height:56px;font-size:12px;letter-spacing:.06em;border-width:1.5px}' +
  '.rp-stamp{font:500 11px/14px ui-monospace,Menlo,Consolas,monospace;color:rgba(232,226,210,.78);letter-spacing:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;user-select:none;margin:0}' +
  // above the tab bar AND the raised centre Deploy icon (home.css: top -18px); #hmBody gives up the same 34 px so nothing is covered
  '#rpStampHome{position:absolute;left:0;right:0;bottom:calc(var(--pv-ui-tabbar-h,64px) + 18px);height:16px;line-height:16px;z-index:2}' +
  '#home #hmBody{margin-bottom:calc(var(--pv-ui-tabbar-h,64px) + 34px)}' +
  '.rp-intel{display:flex;flex-direction:column;gap:6px;padding:6px 0 2px}' +
  '.rp-intel .rp-h{font:700 12px/1.2 var(--pv-ui-font-stencil,inherit);text-transform:uppercase;letter-spacing:.12em;color:var(--pv-ui-text-2,#aaa)}' +
  '.rp-intel .rp-btns{max-width:none}.rp-intel .rp-btns button{flex:1;min-height:44px}';
function stampText(){ var d = new Date(now()), n = lastShownRunNo(); return build() + ' | ' + hms(d) + ' | ' + (n ? 'run ' + n : 'no run yet'); }
function lastShownRunNo(){ if (cur) return cur.runNo; var l = sess.runs[sess.runs.length - 1]; if (l) return l.runNo; var m = metaState(); return m && m.runSeq ? m.runSeq : 0; }
function paintStamps(){
  if (!D) return;
  try { homeStamp(); var t = stampText(), ids = ['rpStampRes', 'rpStampHome']; for (var i = 0; i < ids.length; i++) { var e = $(ids[i]); if (e && e.textContent !== t) e.textContent = t; } } catch (e) { err(e); }
}
R.stampText = stampText;
// Home footer stamp: its own 16 px strip above the tab bar (#hmBody gives up the same 16 px, so nothing is covered).
// home.js rebuilds #home at init, so the strip is (re)attached here, from paintStamps (every second).
function homeStamp(){ var h = $('home'); if (h && !$('rpStampHome')) { var e = D.createElement('p'); e.className = 'rp-stamp'; e.id = 'rpStampHome'; h.appendChild(e); } }
function btnRow(cls){
  var row = D.createElement('div'); row.className = 'rp-btns';
  var a = D.createElement('button'); a.type = 'button'; a.className = cls; a.textContent = 'Copy summary'; a.setAttribute('data-rp', 'summary');
  var b = D.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = 'Copy full report'; b.setAttribute('data-rp', 'full');
  a.addEventListener('click', function(e){ e.stopPropagation(); copySummary(); });
  b.addEventListener('click', function(e){ e.stopPropagation(); copyFull(); });
  row.appendChild(a); row.appendChild(b); return row;
}
function intelRow(){
  var w = D.createElement('div'); w.className = 'rp-intel'; w.id = 'rpIntel';
  var h = D.createElement('div'); h.className = 'rp-h'; h.textContent = 'Test report';
  w.appendChild(h); w.appendChild(btnRow('pv-btn pv-btn--ghost')); return w;   // the stamp for Intel is the Home footer line
}
function attachIntel(){   // the Intel tab rebuilds its .body on every render: keep our row as its last child
  var pane = $('pane-intel'); if (!pane || pane._rp) return !!pane;
  pane._rp = true;
  var fix = function(){ var b = pane.querySelector('.tb-in .body') || pane.querySelector('.body'); if (!b) return; var r = $('rpIntel'); if (!r || r.parentNode !== b || b.lastChild !== r) { b.appendChild(r || intelRow()); paintStamps(); } };
  if (G.MutationObserver) new G.MutationObserver(function(){ fix(); }).observe(pane, { childList: true, subtree: true });
  fix(); return true;
}
function domInit(){
  try {
    if (!D || !D.body || $('rp-css')) return;
    var st = D.createElement('style'); st.id = 'rp-css'; st.textContent = CSS; D.head.appendChild(st);
    // drawer: "Copy summary" beside "Copy report" (ui.js's own handler copies V.UI.report(), which is now the full report)
    var cr = $('drCopyR');
    if (cr) {
      var cs = D.createElement('button'); cs.className = 'btn ghost'; cs.id = 'drCopySum'; cs.style.flex = '1'; cs.textContent = 'Copy summary';
      cs.addEventListener('click', copySummary); cr.parentNode.insertBefore(cs, cr);
      cr.addEventListener('click', function(){ setTimeout(R.markReported, 0); });   // after ui.js has built and copied the text
    }
    // results screen: copy row + stamp after the Home button
    var ov = $('ovDead');
    if (ov) {
      var row = btnRow('btn ghost'); row.id = 'rpResBtns'; ov.appendChild(row);
      var sp = D.createElement('p'); sp.className = 'rp-stamp'; sp.id = 'rpStampRes'; ov.appendChild(sp);
    }
    // Home footer stamp: its own 16 px strip above the tab bar (#hmBody gives up the same 16 px, so nothing is covered)
    var home = $('home');
    if (home && G.MutationObserver) new G.MutationObserver(function(){ if (!$('rpStampHome')) paintStamps(); }).observe(home, { childList: true });
    if (!attachIntel() && G.MutationObserver && home) { var mo = new G.MutationObserver(function(){ if (attachIntel()) mo.disconnect(); }); mo.observe(home, { childList: true, subtree: true }); }
    paintStamps();
    setInterval(paintStamps, 1000);
  } catch (e) { err(e); }
}
if (D) { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', domInit); else domInit(); }
})();
