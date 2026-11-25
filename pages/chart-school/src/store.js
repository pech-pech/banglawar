"use strict";
/* Chart School store (v2). Plain browser script (no modules). Uses CSE (engine.js), render() and BUILD (main.js) at runtime only. */
var STATE_KEY = "cschool.state", TWEAK_KEY = "cschool.tweaks", PRESET_KEY = "cschool.presets", STATE_V = 2;
var SCREENS = ["desk", "reading", "marked", "call", "outcome", "summary", "runend", "journal"];
var RTYPES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "S1", "S2"]; /* record keys (R2 pools R2 + R2b) */
var ALLTYPES = ["R1", "R2", "R2b", "R3", "R4", "R5", "R6", "R7", "S1", "S2"];
var STEP_TYPES = ["R2", "R2b", "R4"];
var CALLS = ["Buy", "Don't buy"];
var DEFAULTS = {
  showRsi: 1, showMacd: 1, showColNums: 0, chartCols: 24, readingOrder: "fixed", evidenceAuto: 0,
  showBaseNote: 1, horizonDefault: 6, runTrades: 10, runCharts: 20, showSector: 1, sectorHeight: 150,
  textSize: 1.0, highContrast: 0, seed: 48213
};
var SHEETS = [], META = {}, RESTORED = false;

/* ---------- safe storage ---------- */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsJson(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/* ---------- seeded rng (mulberry32) ---------- */
function rng(seed) {
  var a = (seed | 0) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, r) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------- tweaks: sanitise (also used by tweak.js) ---------- */
function cleanTweaks(o) {
  var out = {}, k, v;
  o = (o && typeof o === "object") ? o : {};
  for (k in DEFAULTS) {
    v = o[k];
    if (typeof DEFAULTS[k] === "string") { out[k] = (v === "fixed" || v === "shuffled") ? v : DEFAULTS[k]; continue; }
    v = (typeof v === "string" && v.trim() !== "") ? Number(v) : v;
    if (typeof v !== "number" || !isFinite(v)) v = DEFAULTS[k];
    out[k] = v;
  }
  ["showRsi", "showMacd", "showColNums", "evidenceAuto", "showBaseNote", "showSector", "highContrast"].forEach(function (b) { out[b] = out[b] ? 1 : 0; });
  out.chartCols = Math.max(8, Math.min(40, Math.round(out.chartCols)));
  out.horizonDefault = Math.max(3, Math.min(10, Math.round(out.horizonDefault)));
  out.runTrades = Math.max(1, Math.min(50, Math.round(out.runTrades)));
  out.runCharts = Math.max(1, Math.min(100, Math.round(out.runCharts)));
  out.sectorHeight = Math.max(80, Math.min(300, Math.round(out.sectorHeight)));
  out.textSize = Math.max(0.8, Math.min(1.5, Math.round(out.textSize * 100) / 100));
  out.seed = Math.max(1, Math.min(2147483646, Math.round(out.seed)));
  return out;
}
var T = cleanTweaks(lsJson(TWEAK_KEY));
function saveTweaks() { lsSet(TWEAK_KEY, JSON.stringify(T)); }
function tweaked() { for (var k in DEFAULTS) if (T[k] !== DEFAULTS[k]) return true; return false; }

/* ---------- state ---------- */
function freshRec() { var r = {}; RTYPES.forEach(function (t) { r[t] = { k: 0, n: 0 }; }); return r; }
function freshRun(id, seed) { return { id: id, seed: seed, charts: 0, trades: [], skipped: 0, done: false }; }
function freshState(seed) {
  return { seed: seed, screen: "desk", order: [], pos: 0, cur: null, journal: [], rec: freshRec(), run: freshRun(1, seed), best: null, prevTypes: [] };
}
function isInt(x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x; }
function isNum(x) { return typeof x === "number" && isFinite(x); }
function clampH(h) { h = Math.round(Number(h)); if (!isFinite(h)) h = T.horizonDefault; return Math.max(3, Math.min(10, h)); }
function validRec(rec) {
  if (!rec || typeof rec !== "object") return false;
  for (var i = 0; i < RTYPES.length; i++) { var r = rec[RTYPES[i]]; if (!r || !isInt(r.k) || !isInt(r.n) || r.k > r.n || r.k < 0) return false; }
  return true;
}
function validTrade(t) { return t && typeof t === "object" && isInt(t.sheetIdx) && isInt(t.h) && isNum(t.ret); }
function validState(o) {
  if (!o || typeof o !== "object" || !isInt(o.seed) || SCREENS.indexOf(o.screen) < 0) return false;
  if (!Array.isArray(o.order) || !isInt(o.pos) || !Array.isArray(o.journal) || !Array.isArray(o.prevTypes)) return false;
  if (!o.order.every(isInt) || !validRec(o.rec)) return false;
  var u = o.run;
  if (!u || typeof u !== "object" || !isInt(u.id) || !isInt(u.seed) || !isInt(u.charts) || u.charts < 0 || !isInt(u.skipped) || typeof u.done !== "boolean" || !Array.isArray(u.trades) || !u.trades.every(validTrade)) return false;
  if (o.best !== null && !(o.best && typeof o.best === "object" && isNum(o.best.ret) && isInt(o.best.trades))) return false;
  if (o.cur !== null) {
    var c = o.cur;
    if (!c || typeof c !== "object" || !isInt(c.sheetIdx) || typeof c.code !== "string" || !Array.isArray(c.reads) || !c.reads.length || !isInt(c.i) || c.i < 0 || c.i >= c.reads.length) return false;
    for (var j = 0; j < c.reads.length; j++) if (!c.reads[j] || typeof c.reads[j].type !== "string") return false;
    if (c.call !== null && CALLS.indexOf(c.call) < 0) return false;
    if (!isInt(c.h) || c.h < 3 || c.h > 10 || !isInt(c.k) || c.k < 0 || c.k > 10) return false;
  }
  return true;
}
/* v1 (or older) saved state: start a new run, keep rec + journal. Never throws. */
function migrateState(o) {
  var s = freshState(T.seed);
  try {
    var old = o && o.S;
    if (old && old.rec && typeof old.rec === "object") RTYPES.forEach(function (t) { var r = old.rec[t]; if (r && isInt(r.k) && isInt(r.n) && r.k >= 0 && r.k <= r.n) s.rec[t] = { k: r.k, n: r.n }; });
    if (old && Array.isArray(old.journal)) s.journal = old.journal.filter(function (e) { return e && typeof e === "object"; }).slice(-500);
  } catch (e) { }
  return s;
}
var S = (function () {
  var o = lsJson(STATE_KEY);
  if (o && o.v === STATE_V && validState(o.S)) { RESTORED = true; return o.S; }
  if (o && isInt(o.v) && o.v < STATE_V) return migrateState(o);
  return freshState(T.seed);
})();

function save() {
  try {
    var ex = lsJson(STATE_KEY);
    if (ex && ex.v > STATE_V) return; /* never downgrade a newer save */
    if (S.journal.length > 500) S.journal = S.journal.slice(-500);
    lsSet(STATE_KEY, JSON.stringify({ v: STATE_V, S: S }));
  } catch (e) { }
}
function go(screen) {
  S.screen = screen; save();
  if (typeof render === "function") render();
}

/* ---------- sheets ---------- */
function sheetsOk() { return Array.isArray(SHEETS) && SHEETS.length > 0; }
function fixAfterLoad() {
  var n = SHEETS.length;
  var okOrder = S.order.length === n && S.order.every(function (x) { return x >= 0 && x < n; });
  if (!okOrder) { var idx = []; for (var i = 0; i < n; i++) idx.push(i); S.order = shuffled(idx, rng(S.run.seed)); S.pos = 0; S.cur = null; S.screen = "desk"; save(); return; }
  if (S.cur && (S.cur.sheetIdx >= n || S.cur.reads.some(function (r) { return ALLTYPES.indexOf(r.type) < 0; }))) { S.cur = null; S.screen = "desk"; }
  if (!S.cur && S.screen !== "desk" && S.screen !== "journal" && !(S.screen === "runend" && S.run.done)) S.screen = "desk";
}
function loadSheets() {
  return fetch("data/sheets.json").then(function (r) {
    if (!r.ok) throw new Error("sheets " + r.status);
    return r.json();
  }).then(function (j) {
    if (!j || !Array.isArray(j.sheets) || !j.sheets.length) throw new Error("no sheets");
    SHEETS = j.sheets;
    META = {}; for (var k in j) if (k !== "sheets") META[k] = j[k];
    fixAfterLoad();
    return SHEETS;
  });
}

/* New run: reshuffles sheet order; keeps rec, journal, best. seed optional (default: tweak seed + run id, admin default). */
function newRun(seed) {
  var id = (S && S.run && isInt(S.run.id) ? S.run.id : 0) + 1;
  seed = isInt(seed) ? seed : ((T.seed + id * 7919) % 2147483646) + 1;
  var n = sheetsOk() ? SHEETS.length : 0, idx = [];
  for (var i = 0; i < n; i++) idx.push(i);
  S = { seed: seed, screen: "desk", order: shuffled(idx, rng(seed)), pos: 0, cur: null, journal: S && S.journal ? S.journal : [],
    rec: S && S.rec ? S.rec : freshRec(), run: freshRun(id, seed), best: S && S.best ? S.best : null, prevTypes: [] };
  save();
  return S;
}
function newSession(seed) { return newRun(seed); } /* v1 name, kept so old callers do not break */

/* ---------- masked 3-letter codes (admin default: blocklist of well-known 3-letter Nasdaq/NYSE codes) ---------- */
var CODE_BLOCK = ("AMD ADP ADI AEP AMT ANF ARM ATO AXP BAC BKR CME CSX DIS DOW EXC FOX GEN HAL IBM MAR MCD MSI NKE PEP PFE QQQ SPY UPS VTI WBA WMT XEL XOM CAT CVX ABT AIG AMC ALL CCL DAL DVN FCX FIS HON HPQ JNJ JPM LLY LOW LUV MMM MRK NOC NVO OXY RTX SLB SNY TGT TMO TSM UAL UNH USB WFC YUM CRM CMG CTA DHR DUK EOG ETN GLW HCA ICE ILMN INTC KLA LIN MET MDT MDB NEE NOW PAY PNC PSX ROK SHW SPG SYK TJX TFC TRV VLO VRT WDC WEC WMB ZTS TTD TEAM ADSK ABNB").split(" ");
function codeFor(seed, sheetIdx) {
  var r = rng(((seed | 0) * 7919 + sheetIdx * 104729 + 17) | 0), L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", c;
  for (var g = 0; g < 50; g++) {
    c = L[Math.floor(r() * 26)] + L[Math.floor(r() * 26)] + L[Math.floor(r() * 26)];
    if (CODE_BLOCK.indexOf(c) < 0) return c;
  }
  return "QXZ";
}

/* ---------- sheet flow ---------- */
function curSheet() { return S.cur && sheetsOk() ? SHEETS[S.cur.sheetIdx] || null : null; }
function curRead() { return S.cur ? S.cur.reads[S.cur.i] || null : null; }
function isStep(t) { return STEP_TYPES.indexOf(t) >= 0; }
function isSectorType(t) { return t === "S1" || t === "S2"; }

function openSheet() {
  if (!sheetsOk()) return null;
  if (S.cur && !S.cur.fin) { go(["reading", "marked", "call", "outcome"].indexOf(S.screen) >= 0 ? S.screen : "reading"); return S.cur; } /* continue the open chart */
  if (S.run.done || !S.order.length) newRun(S.run.done ? undefined : S.seed);
  var idx = S.order[S.pos % S.order.length]; S.pos++;
  var sh = SHEETS[idx], ans = sh.ans || {};
  var types = CSE.pickReads(sh, rng(S.run.seed + S.run.charts), S.prevTypes);
  if (T.readingOrder === "shuffled") { /* stock reads shuffled, sector read stays last */
    var st = types.filter(function (t) { return !isSectorType(t); }), sc = types.filter(isSectorType);
    types = shuffled(st, rng((S.seed | 0) * 31 + idx * 977 + 5)).concat(sc);
  }
  S.prevTypes = types.slice();
  S.cur = {
    sheetIdx: idx, code: codeFor(S.seed, idx), i: 0, fin: false, call: null, h: T.horizonDefault, k: 0, confirmed: false,
    reads: types.map(function (t) { return { type: t, answer: ans[t], given: null, ok: null, skipped: false }; })
  };
  go("reading");
  return S.cur;
}

function recKey(t) { return t === "R2b" ? "R2" : t; }
function submitReading(given) {
  var r = curRead();
  if (!r || r.given !== null || r.skipped) return null;
  var ok = isStep(r.type) ? Number(given) === Number(r.answer) : given === r.answer;
  r.given = given; r.ok = ok;
  var rc = S.rec[recKey(r.type)]; if (!rc) rc = S.rec[recKey(r.type)] = { k: 0, n: 0 };
  rc.n++; if (ok) rc.k++;
  save();
  return ok;
}
function skipReading() {
  var r = curRead();
  if (!r || r.given !== null || r.skipped) return;
  r.skipped = true; r.ok = null; /* counts in neither k nor n */
  nextReading();
}
function nextReading() {
  var c = S.cur, r = curRead();
  if (!c || !r || (r.given === null && !r.skipped)) return; /* guard: only advance past an answered or skipped reading */
  if (c.i + 1 < c.reads.length) { c.i++; go("reading"); }
  else go("call");
}

/* ---------- the call ---------- */
function setCall(kind) {
  if (!S.cur || S.cur.confirmed) return;
  S.cur.call = CALLS.indexOf(kind) >= 0 ? kind : null;
  save();
}
function setHorizon(h) {
  if (!S.cur || S.cur.confirmed) return S.cur ? S.cur.h : 0;
  S.cur.h = clampH(h);
  save();
  return S.cur.h;
}
/* return at week +k (fraction) for the open chart; k 0 = 0 */
function retAt(k) {
  var sh = curSheet(); if (!sh || !(k > 0)) return 0;
  var fr = sh.fwdRet;
  if (Array.isArray(fr) && isNum(fr[k - 1])) return fr[k - 1];
  var f = sh.fwd || [], b = sh.bars || [];
  if (f[k - 1] && b.length) return f[k - 1][2] / b[b.length - 1][2] - 1;
  return 0;
}
function confirmCall() {
  var c = S.cur, sh = curSheet();
  if (!c || !sh || c.confirmed || CALLS.indexOf(c.call) < 0) return false;
  c.confirmed = true; c.k = 0;
  if (c.call === "Buy") S.run.trades.push({ code: c.code, sheetIdx: c.sheetIdx, h: c.h, ret: retAt(c.h) });
  else S.run.skipped++;
  go("outcome");
  return true;
}
function advanceWeek() {
  var c = S.cur; if (!c) return 0;
  var f = (curSheet() || {}).fwd || [];
  if (c.k < Math.min(c.h, f.length || 10)) c.k++;
  save();
  if (typeof render === "function") render();
  return c.k;
}
/* return so far at the shown week (fraction): Buy = trade return so far; Don't buy = price move (no trade) */
function curRet() { return S.cur ? retAt(S.cur.k) : 0; }
function runReturn(trades) {
  var t = Array.isArray(trades) ? trades : S.run.trades, p = 1;
  for (var i = 0; i < t.length; i++) p *= 1 + t[i].ret;
  return p - 1;
}
function runInfo() {
  return { id: S.run.id, trade: Math.min(S.run.trades.length + (S.run.done ? 0 : 1), T.runTrades), trades: S.run.trades.length, runTrades: T.runTrades,
    chart: Math.min(S.run.charts + (S.cur && !S.cur.fin ? 1 : 0), T.runCharts), charts: S.run.charts, runCharts: T.runCharts,
    skipped: S.run.skipped, ret: runReturn(), best: S.best, done: S.run.done };
}
function finishSheet() {
  var c = S.cur; if (!c || c.fin) return;
  var buy = c.call === "Buy", ms = c.confirmed ? retAt(c.h) : null;
  S.journal.push({
    code: c.code, sheetIdx: c.sheetIdx, run: S.run.id,
    types: c.reads.map(function (r) { return r.type; }),
    reads: c.reads.map(function (r) { return { type: r.type, ok: r.ok, skipped: !!r.skipped }; }),
    call: c.call, h: c.h, ret: buy && c.confirmed ? ms : null, moved: ms
  });
  c.fin = true; S.run.charts++;
  if (S.run.trades.length >= T.runTrades || S.run.charts >= T.runCharts) {
    S.run.done = true;
    var r = runReturn();
    if (!S.best || r > S.best.ret) S.best = { ret: r, trades: S.run.trades.length };
    go("runend");
  } else go("summary");
}

/* ---------- accuracy record ---------- */
function wilson(k, n) {
  if (!n) return { lo: 0, hi: 1 };
  var z = 1.96, p = k / n, z2 = z * z, d = 1 + z2 / n;
  var ctr = (p + z2 / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d;
  return { lo: Math.max(0, ctr - h), hi: Math.min(1, ctr + h) };
}
function record() {
  var N = (typeof CSE !== "undefined" && CSE.NAMES) || {};
  return RTYPES.map(function (key) {
    var rc = S.rec[key] || { k: 0, n: 0 }, w = wilson(rc.k, rc.n);
    var name = key === "R2" ? (N.R2b || "Support / resistance") : (N[key] || key);
    return { key: key, name: name, k: rc.k, n: rc.n, lo: w.lo, hi: w.hi, few: rc.n < 30 };
  });
}

/* ---------- text helpers ---------- */
function pctTxt(x, d) { d = d == null ? 1 : d; var m = Math.pow(10, d), r = Math.round(x * m) / m; if (r === 0 || !isFinite(r)) r = 0; return (r >= 0 ? "+" : "") + r.toFixed(d) + "%"; } /* no "-0.0%" */
function retTxt(f, d) { return pctTxt(f * 100, d); } /* fraction -> "+4.2%" / "-3.1%" */
function nTxt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

/* ---------- report ---------- */
function buildId() { try { return BUILD; } catch (e) { return META.build || "cs-v2-1"; } }
function reportText() {
  return JSON.stringify({
    build: buildId(), seed: S.seed, tweaks: T, tweaked: tweaked(),
    record: record().map(function (r) { return { key: r.key, name: r.name, k: r.k, n: r.n, lo: +r.lo.toFixed(3), hi: +r.hi.toFixed(3) }; }),
    run: { id: S.run.id, seed: S.run.seed, charts: S.run.charts, skipped: S.run.skipped, done: S.run.done, ret: +runReturn().toFixed(5),
      trades: S.run.trades.map(function (t) { return { code: t.code, h: t.h, ret: +t.ret.toFixed(5) }; }) },
    best: S.best, call: S.cur ? { call: S.cur.call, h: S.cur.h, k: S.cur.k, types: S.cur.reads.map(function (r) { return r.type; }) } : null,
    journal: S.journal.slice(-10)
  });
}
function copyReport() {
  var t = reportText();
  var done = function (m) { S.lastMsg = m; if (typeof render === "function") render(); };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { done("Report copied"); }, function () { prompt("Copy report", t); }); return; }
  } catch (e) { }
  try { prompt("Copy report", t); } catch (e) { }
}
