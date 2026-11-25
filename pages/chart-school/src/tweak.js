"use strict";
/* Chart School tweak menu. Plain browser script. Uses store.js globals, $ and (optionally) esc from ui-kit. */
var TWEAK_LABELS = {
  showRsi: "RSI pane", showMacd: "MACD pane", showColNums: "Column numbers", chartCols: "Columns shown",
  readingOrder: "Reading order", evidenceAuto: "Auto-advance weeks", showBaseNote: "Base-rate note",
  horizonDefault: "Default horizon (weeks, 3 to 10)", runTrades: "Trades per run", runCharts: "Charts per run (cap)",
  showSector: "Sector chart", sectorHeight: "Sector chart height (px)", textSize: "Text size",
  highContrast: "High contrast", seed: "Seed"
};
var TWEAK_BOOL = ["showRsi", "showMacd", "showColNums", "evidenceAuto", "showBaseNote", "showSector", "highContrast"];
/* Built-in presets (overrides on top of DEFAULTS; seed is never overwritten by a preset: admin default). */
var BUILTIN_PRESETS = [
  { name: "Plain", set: {} },
  { name: "Large chart", set: { chartCols: 16, textSize: 1.15 } },
  { name: "Minimal", set: { showMacd: 0, showBaseNote: 0, showSector: 0 } }
];
function twEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
function userPresets() {
  var o = lsJson(PRESET_KEY), out = {};
  if (o && typeof o === "object" && !Array.isArray(o)) for (var n in o) if (o[n] && typeof o[n] === "object") out[n] = o[n];
  return out;
}
function putPresets(P) { lsSet(PRESET_KEY, JSON.stringify(P)); }
function twRefresh() {
  saveTweaks();
  if (typeof render === "function") { try { render(); } catch (e) { } }
  var m = $("modal"), b = $("modalBody"), top = b ? b.scrollTop : 0;
  openTweaks(); if (b) b.scrollTop = top;
}
function twSet(k, v) {
  var o = Object.assign({}, T); o[k] = v;
  T = cleanTweaks(o); twRefresh();
}
function twNum(k) { var el = $("tw_" + k); twSet(k, el ? el.value : DEFAULTS[k]); }
function twApplySet(set) { var seed = T.seed; T = cleanTweaks(Object.assign({}, DEFAULTS, set, { seed: seed })); twRefresh(); }
function twBuiltin(i) { twApplySet(BUILTIN_PRESETS[i].set); }
function twLoadUser(i) { var P = userPresets(), n = Object.keys(P)[i]; if (n) twApplySet(P[n]); }
function twDelUser(i) { var P = userPresets(), n = Object.keys(P)[i]; if (n) { delete P[n]; putPresets(P); openTweaks(); } }
function twSavePreset() {
  var n; try { n = prompt("Preset name"); } catch (e) { n = null; }
  n = n && String(n).trim().slice(0, 40); if (!n) return;
  var P = userPresets(); P[n] = Object.assign({}, T); putPresets(P); openTweaks();
}
function twCopy(label, text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(function () { prompt(label, text); }); return; }
  } catch (e) { }
  try { prompt(label, text); } catch (e) { }
}
function twCopyPreset() { var t = "CSCHOOL-PRESET:" + btoa(JSON.stringify(T)); twCopy("Preset code", t); }
function twLoadCode() {
  var el = $("tw_code"), v = el ? String(el.value).trim() : "";
  if (v.indexOf("CSCHOOL-PRESET:") !== 0) { var s = $("tw_msg"); if (s) s.textContent = "Not a preset code."; return; }
  try { twApplySet(JSON.parse(atob(v.slice(15)))); } catch (e) { var m = $("tw_msg"); if (m) m.textContent = "Preset code could not be read."; }
}
function twNewSession() {
  newRun(T.seed); twClose(); go("desk");
}
function twResetJournal() {
  var ok = true; try { ok = confirm("Reset journal and accuracy record? This cannot be undone."); } catch (e) { }
  if (!ok) return;
  S.journal = []; S.rec = freshRec(); newRun(S.seed); twClose(); go("desk");
}
function twClose() { var m = $("modal"); if (m) m.classList.remove("on"); }

function openTweaks() {
  var P = userPresets(), names = Object.keys(P), rows = "";
  Object.keys(DEFAULTS).forEach(function (k) {
    var lab = twEsc(TWEAK_LABELS[k] || k), ch = T[k] !== DEFAULTS[k], ctl;
    if (TWEAK_BOOL.indexOf(k) >= 0) {
      ctl = '<div class="seg"><button class="btn' + (T[k] ? "" : " primary") + '" onclick="twSet(\'' + k + '\',0)" aria-pressed="' + (!T[k]) + '">Off</button>' +
        '<button class="btn' + (T[k] ? " primary" : "") + '" onclick="twSet(\'' + k + '\',1)" aria-pressed="' + (!!T[k]) + '">On</button></div>';
    } else if (k === "readingOrder") {
      ctl = '<div class="seg"><button class="btn' + (T[k] === "fixed" ? " primary" : "") + '" onclick="twSet(\'' + k + '\',\'fixed\')">Fixed</button>' +
        '<button class="btn' + (T[k] === "shuffled" ? " primary" : "") + '" onclick="twSet(\'' + k + '\',\'shuffled\')">Shuffled</button></div>';
    } else {
      var rg = { horizonDefault: [3, 10], runTrades: [1, 50], runCharts: [1, 100], sectorHeight: [80, 300], chartCols: [8, 40] }[k];
      ctl = '<input id="tw_' + k + '" type="number" inputmode="decimal"' + (rg ? ' min="' + rg[0] + '" max="' + rg[1] + '"' : '') + ' step="' + (k === "textSize" ? "0.05" : "1") + '" value="' + twEsc(T[k]) + '" onchange="twNum(\'' + k + '\')" style="width:100%;min-height:48px">';
    }
    rows += '<div class="card" style="margin:6px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + lab + '</b><span class="dim">' +
      (ch ? "changed · default " + twEsc(DEFAULTS[k]) : "default") + '</span></div>' + ctl + '</div>';
  });
  var built = BUILTIN_PRESETS.map(function (p, i) { return '<button class="btn" onclick="twBuiltin(' + i + ')">' + twEsc(p.name) + '</button>'; }).join("");
  var user = names.map(function (n, i) {
    return '<div class="row"><span style="flex:2;align-self:center">' + twEsc(n) + '</span><button class="btn" onclick="twLoadUser(' + i + ')">Load</button><button class="btn" onclick="twDelUser(' + i + ')">Delete</button></div>';
  }).join("");
  $("modalBody").innerHTML =
    '<div class="card"><b>Settings</b><div class="dim" style="margin-top:4px">Build ' + twEsc(buildId()) + ' · seed ' + twEsc(T.seed) +
    (tweaked() ? ' · <b>DEV</b> (settings differ from defaults)' : '') + '<br>Changes apply live.</div></div>' + rows +
    '<div class="card"><b>Seed</b><div class="dim">A new seed or a new run reshuffles the chart order. Your record, journal and best run are kept.</div>' +
    '<div class="row"><button class="btn primary" onclick="twNewSession()">New run with this seed</button></div></div>' +
    '<div class="card"><b>Presets</b><div class="row seg">' + built + '</div>' + user +
    '<div class="row"><button class="btn" onclick="twSavePreset()">Save preset</button><button class="btn" onclick="twCopyPreset()">Copy preset code</button><button class="btn" onclick="copyReport()">Copy report</button></div>' +
    '<div class="row"><input id="tw_code" type="text" placeholder="CSCHOOL-PRESET:..." style="flex:2;min-height:48px"><button class="btn" onclick="twLoadCode()">Load code</button></div>' +
    '<div id="tw_msg" class="dim"></div></div>' +
    '<div class="card"><b>Journal</b><div class="row"><button class="btn" onclick="twResetJournal()">Reset journal</button></div></div>' +
    '<div class="row"><button class="btn primary" onclick="twClose()">Close</button></div>';
  $("modal").classList.add("on");
}
