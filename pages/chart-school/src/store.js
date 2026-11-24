"use strict";
/* Chart School store. Plain browser script (no modules). Uses CSE (engine.js), render() and BUILD (main.js) at runtime only. */
var STATE_KEY = "cschool.state", TWEAK_KEY = "cschool.tweaks", PRESET_KEY = "cschool.presets", STATE_V = 1;
var SCREENS = ["desk", "reading", "marked", "order", "evidence", "summary", "journal"];
var RTYPES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]; /* record keys (R2 pools R2 + R2b) */
var DEFAULTS = {
  showRsi: 1, showMacd: 1, showColNums: 0, chartCols: 24, readingOrder: "fixed", evidenceAuto: 0,
  showBaseNote: 1, paperOrder: 1, sheetsPerSession: 2, textSize: 1.0, highContrast: 0, seed: 48213
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
  ["showRsi", "showMacd", "showColNums", "evidenceAuto", "showBaseNote", "paperOrder", "highContrast"].forEach(function (b) { out[b] = out[b] ? 1 : 0; });
  out.chartCols = Math.max(8, Math.min(40, Math.round(out.chartCols)));
  out.sheetsPerSession = Math.max(1, Math.min(50, Math.round(out.sheetsPerSession)));
  out.textSize = Math.max(0.8, Math.min(1.5, Math.round(out.textSize * 100) / 100));
  out.seed = Math.max(1, Math.min(2147483646, Math.round(out.seed)));
  return out;
}
var T = cleanTweaks(lsJson(TWEAK_KEY));
function saveTweaks() { lsSet(TWEAK_KEY, JSON.stringify(T)); }
function tweaked() { for (var k in DEFAULTS) if (T[k] !== DEFAULTS[k]) return true; return false; }

/* ---------- state ---------- */
function freshRec() { var r = {}; RTYPES.forEach(function (t) { r[t] = { k: 0, n: 0 }; }); return r; }
function freshState(seed) {
  return { seed: seed, screen: "desk", sess: { done: 0 }, order: [], pos: 0, cur: null, journal: [], rec: freshRec() };
}
function isInt(x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x; }
function validState(o) {
  if (!o || typeof o !== "object" || !isInt(o.seed) || SCREENS.indexOf(o.screen) < 0) return false;
  if (!o.sess || !isInt(o.sess.done) || !Array.isArray(o.order) || !isInt(o.pos) || !Array.isArray(o.journal)) return false;
  if (!o.order.every(isInt)) return false;
  if (!o.rec || typeof o.rec !== "object") return false;
  for (var i = 0; i < RTYPES.length; i++) { var r = o.rec[RTYPES[i]]; if (!r || !isInt(r.k) || !isInt(r.n) || r.k > r.n || r.k < 0) return false; }
  if (o.cur !== null) {
    var c = o.cur;
    if (!c || typeof c !== "object" || !isInt(c.sheetIdx) || typeof c.code !== "string" || !Array.isArray(c.reads) || !c.reads.length || !isInt(c.i) || c.i < 0 || c.i >= c.reads.length || !isInt(c.step) || c.step < 0 || c.step > 10) return false;
    for (var j = 0; j < c.reads.length; j++) if (!c.reads[j] || typeof c.reads[j].type !== "string") return false;
  }
  return true;
}
var S = (function () {
  var o = lsJson(STATE_KEY);
  if (o && o.v <= STATE_V && validState(o.S)) { RESTORED = true; return o.S; }
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
  if (!okOrder) { var keep = { rec: S.rec, journal: S.journal }; newSession(S.seed); S.rec = keep.rec; S.journal = keep.journal; return; }
  if (S.cur && (S.cur.sheetIdx >= n || S.cur.reads.some(function (r) { return ["R1", "R2", "R2b", "R3", "R4", "R5", "R6", "R7"].indexOf(r.type) < 0; }))) { S.cur = null; S.screen = "desk"; }
  if (!S.cur && S.screen !== "desk" && S.screen !== "journal") S.screen = "desk";
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

function newSession(seed) {
  seed = isInt(seed) ? seed : T.seed;
  var rec = S && S.rec ? S.rec : freshRec(), jr = S && S.journal ? S.journal : [];
  var n = sheetsOk() ? SHEETS.length : 0, idx = [];
  for (var i = 0; i < n; i++) idx.push(i);
  S = { seed: seed, screen: "desk", sess: { done: 0 }, order: shuffled(idx, rng(seed)), pos: 0, cur: null, journal: jr, rec: rec };
  save();
  return S;
}

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
function isBuy(a) { return a === "Double top buy" || a === "Triple top buy"; }
function curSheet() { return S.cur && sheetsOk() ? SHEETS[S.cur.sheetIdx] || null : null; }
function curRead() { return S.cur ? S.cur.reads[S.cur.i] || null : null; }

function openSheet() {
  if (!sheetsOk()) return null;
  if (S.cur && !S.cur.fin) { go(["reading", "marked", "order", "evidence"].indexOf(S.screen) >= 0 ? S.screen : "reading"); return S.cur; } /* continue the open sheet */
  if (!S.order.length) newSession(S.seed);
  var idx = S.order[S.pos % S.order.length]; S.pos++;
  var sh = SHEETS[idx], ans = sh.ans || {}, types = ["R1", sh.r2key === "R2b" ? "R2b" : "R2", "R3"];
  if (isBuy(ans.R1)) types.push("R4");
  types.push("R5", "R6", "R7");
  if (T.readingOrder === "shuffled") types = shuffled(types, rng((S.seed | 0) * 31 + idx * 977 + 5));
  S.cur = {
    sheetIdx: idx, code: codeFor(S.seed, idx), i: 0, order: null, step: 0, fin: false,
    reads: types.map(function (t) { return { type: t, answer: ans[t], given: null, ok: null, skipped: false }; })
  };
  go("reading");
  return S.cur;
}

function recKey(t) { return t === "R2b" ? "R2" : t; }
function submitReading(given) {
  var r = curRead();
  if (!r || r.given !== null || r.skipped) return null;
  var ok = (r.type === "R2" || r.type === "R2b" || r.type === "R4") ? Number(given) === Number(r.answer) : given === r.answer;
  r.given = given; r.ok = ok;
  var rc = S.rec[recKey(r.type)]; rc.n++; if (ok) rc.k++;
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
  else go(T.paperOrder ? "order" : "evidence");
}
function setOrder(kind) {
  if (!S.cur) return;
  S.cur.order = (kind === "Buy" || kind === "Hold" || kind === "Sell") ? kind : null;
  save();
}
function advanceWeek() {
  var c = S.cur; if (!c) return 0;
  var f = (curSheet() || {}).fwd || [];
  if (c.step < Math.min(10, f.length || 10)) c.step++;
  save();
  if (typeof render === "function") render();
  return c.step;
}
function finishSheet() {
  var c = S.cur; if (!c || c.fin) return;
  var res = orderResult();
  S.journal.push({
    code: c.code, sheetIdx: c.sheetIdx,
    reads: c.reads.map(function (r) { return { type: r.type, ok: r.ok, skipped: !!r.skipped }; }),
    order: c.order, orderPct: res.pct, evidence: evidenceLine()
  });
  c.fin = true; S.sess.done++;
  go("summary");
}
function sessionDone() { return S.sess.done >= T.sheetsPerSession; }

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

/* ---------- evidence + order ---------- */
function pctTxt(x, d) { return (x >= 0 ? "+" : "") + x.toFixed(d == null ? 1 : d) + "%"; }
function nTxt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function evidenceLine() {
  var sh = curSheet(); if (!sh) return "";
  var a = sh.ans && sh.ans.R1, up = META.base ? Math.round(META.base.up10 * 100) : null;
  var baseTxt = up == null ? "" : " · base " + up + "% up";
  var st = META.sigStats && META.sigStats[a];
  if (!st || !st.n) return (a || "No signal") + ": no history to compare" + baseTxt;
  var f = st.follow > 1 ? st.follow : st.follow * 100;
  return a + ": followed through " + Math.round(f) + "% of " + nTxt(st.n) + " seen" + baseTxt;
}
function orderResult() {
  var c = S.cur, sh = curSheet();
  if (!c || !sh) return { pct: 0, text: "No paper order" };
  var f = sh.fwd || [], b = sh.bars, w0 = b[b.length - 1][2];
  var last = c.step > 0 && f[c.step - 1] ? f[c.step - 1][2] : w0;
  var mv = (last / w0 - 1) * 100;
  if (c.order === "Buy") return { pct: mv, text: "Buy: " + pctTxt(mv) + " from the week W close" };
  if (c.order === "Hold" || c.order === "Sell") return { pct: 0, text: c.order + ": stayed out, price moved " + pctTxt(mv) };
  return { pct: 0, text: "No paper order" };
}

/* ---------- report ---------- */
function buildId() { try { return BUILD; } catch (e) { return META.build || "cs-proto-2"; } }
function reportText() {
  return JSON.stringify({
    build: buildId(), seed: S.seed, tweaks: T, tweaked: tweaked(),
    record: record().map(function (r) { return { key: r.key, name: r.name, k: r.k, n: r.n, lo: +r.lo.toFixed(3), hi: +r.hi.toFixed(3) }; }),
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
