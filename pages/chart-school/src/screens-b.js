/* screens-b.js (Maker SCR-B): reading, marked, call, outcome. Plain browser script. */
(function () {
  window.ACT = window.ACT || {};
  window.UI = window.UI || { key: null, pick: null, timer: null };
  var UI = window.UI;

  var QUESTION = {
    R1: ["Signal: what do the last 3 columns show?", "Look for a double or triple top or bottom break."],
    R2: ["Support: which box is the low of the last completed O column?", "Set the box, or tap a row on the chart."],
    R2b: ["Resistance: which box is the high of the last completed X column?", "Set the box, or tap a row on the chart."],
    R3: ["Trend: which line is active and where is the close?", "Follow the 45 degree line: support rises, resistance falls."],
    R4: ["Vertical count: set the price objective.", "Use the buy signal column. Set the objective box, or tap a row on the chart."],
    R5: ["RSI(14): which band is it in?", "Read the RSI pane."],
    R6: ["MACD(12,26,9): what is the histogram doing?", "Sign, and direction against last week."],
    R7: ["Divergence: do price and RSI disagree?", "Compare the latest swing in price with RSI at the same points."],
    S1: ["Sector signal: what do the last 3 columns of the sector chart show?", "Read the lower chart. Look for a double or triple top or bottom break."],
    S2: ["Sector trend: which line is active on the sector chart?", "Read the lower chart. Support rises, resistance falls."]
  };
  var STEPPER = { R2: 1, R2b: 1, R4: 1 };
  function isStep(type) {
    if (typeof CSE !== "undefined" && CSE.KINDS && CSE.KINDS[type]) return CSE.KINDS[type] === "step";
    return !!STEPPER[type];
  }
  function isSec(type) { return type === "S1" || type === "S2"; }
  function fmtPct(r) { return retTxt(r, 1); } /* store: signed, 1 decimal */
  function retWord(r) {
    var v = Math.round(r * 1000) / 10;
    return v > 0 ? "Gain" : (v < 0 ? "Loss" : "Flat");
  }
  function retCls(r) {
    var v = Math.round(r * 1000) / 10;
    return v > 0 ? "pos" : (v < 0 ? "neg" : "flat");
  }

  function toBars(a) {
    return (a || []).map(function (b) {
      return Array.isArray(b) ? { h: b[0], l: b[1], c: b[2] } : { h: b.h, l: b.l, c: b.c };
    });
  }
  function ctx() {
    var sh = curSheet(), bars = toBars(sh.bars);
    var close = bars[bars.length - 1].c;
    var o = { sh: sh, bars: bars, close: close, closeBox: CSE.boxOf(close), eng: CSE.pnf(bars), reads: CSE.readAll(bars), sec: null };
    if (sh.sec && Array.isArray(sh.sec.bars) && sh.sec.bars.length) {
      var sb = toBars(sh.sec.bars);
      o.sec = { name: sh.sec.name || "", bars: sb, fwd: toBars(sh.sec.fwd), eng: CSE.pnf(sb), reads: (typeof CSE.readSector === "function" ? (CSE.readSector(sb) || {}) : {}) };
    }
    return o;
  }
  function sync() {
    var key = S.cur.sheetIdx + ":" + S.cur.i;
    if (UI.key !== key) { UI.key = key; UI.pick = null; }
  }
  function keepScroll(fn) { var y = window.scrollY || 0; fn(); try { window.scrollTo(0, y); } catch (e) {} }
  function safe(host, fn) {
    try { fn(); } catch (e) { if (host) host.innerHTML = '<div class="dim" style="padding:12px">Chart unavailable.</div>'; }
  }
  function clearTimer() { if (UI.timer) { clearTimeout(UI.timer); UI.timer = null; } }

  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="var(--x)" fill-opacity=".2" stroke="var(--x)" stroke-width="1.5"/><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="var(--x)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_NO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="var(--o)" fill-opacity=".2" stroke="var(--o)" stroke-width="1.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="var(--o)" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var ICON_SKIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="var(--dim)" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var TICK = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--text)" stroke-width="2"/><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="var(--text)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function chipsRow() {
    return '<div class="cs"><span>Box 2%</span><span>3-box reversal</span><span>Weekly</span><span>High/Low</span></div>';
  }
  function fmtHist(h) { var v = h * 100; return (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2); }

  /* panes: returns HTML; draw() afterwards */
  function paneHtml(show, closes) {
    var out = "";
    if (show.rsi) {
      var r = CSE.rsi(closes);
      out += '<div class="card pane"><div class="ph"><span class="t">RSI <i>14</i></span><span class="v num">' +
        esc(String(Math.round(r[r.length - 1]))) + '</span></div><div id="rsi"></div><div class="tax"><span>26 wks</span><span>now</span></div></div>';
    }
    if (show.macd) {
      var m = CSE.macd(closes), h = m.hist[m.hist.length - 1];
      out += '<div class="card pane"><div class="ph"><span class="t">MACD <i>12,26,9</i></span><span class="v num">' +
        esc(fmtHist(h)) + '</span></div><div id="macd"></div><div class="leg">Solid line MACD, dashed line signal, bars histogram</div><div class="tax"><span>26 wks</span><span>now</span></div></div>';
    }
    return out;
  }
  function paneShow(type) {
    return { rsi: !!(T.showRsi || type === "R5" || type === "R7"), macd: !!(T.showMacd || type === "R6") };
  }
  function drawPanes(show, closes, opt) {
    opt = opt || {};
    if (show.rsi) { var a = $("rsi"); safe(a, function () { drawRsi(a, closes, { newFrom: opt.newFrom == null ? null : opt.newFrom, mark: opt.rsiMark || null }); }); }
    if (show.macd) { var b = $("macd"); safe(b, function () { drawMacd(b, closes, { newFrom: opt.newFrom == null ? null : opt.newFrom }); }); }
  }
  function drawChart(c, o) {
    var host = $("pf");
    safe(host, function () {
      var op = {
        bars: o.bars || c.bars, eng: o.eng || c.eng, newFrom: o.newFrom == null ? null : o.newFrom,
        cols: T.chartCols || 24, showColNums: !!T.showColNums, overlays: o.overlays || [],
        pick: o.pick == null ? null : o.pick, onRow: o.onRow || null, height: o.height || 300,
        cell: 15, minCell: o.minCell || 8, fitHeight: !!o.fitHeight, maxPlotH: o.maxPlotH || null, keepCol: o.keepCol == null ? null : o.keepCol,
        growMax: o.growMax || Math.round(Math.max(560, (window.innerHeight || 800) * 1.15)) /* fix1: grid fills the width; cells grow, chart at most ~1 screen tall */
      };
      if (o.compact) op.compact = true;
      drawPnf(host, op);
    });
  }
  function drawSector(c, o) {
    var host = $("pfs");
    if (!host || !c.sec) return;
    o = o || {};
    var sh = o.height || T.sectorHeight || 180;
    safe(host, function () {
      drawPnf(host, {
        bars: o.bars || c.sec.bars, eng: o.eng || c.sec.eng, newFrom: o.newFrom == null ? null : o.newFrom,
        cols: T.chartCols || 24, showColNums: false, overlays: o.overlays || [],
        height: sh, compact: true, title: "Sector · " + c.sec.name,
        cell: 11, minCell: o.minCell || 6, fitHeight: !!o.fitHeight, maxPlotH: o.maxPlotH || Math.max(66, sh - 46),
        growMax: o.growMax || Math.round((window.innerHeight || 800) * 0.8) /* fix1: fills the width like the stock chart */
      });
    });
  }
  function showSector(c, type) { return !!(c.sec && (T.showSector || isSec(type))); }
  function secPane(c, type) {
    return showSector(c, type) ? '<div class="card pf secp"><div class="pfwrap" id="pfs"></div></div>' : "";
  }
  function trendOv(eng) { try { return { k: "trend", segs: CSE.trend(eng).segs }; } catch (e) { return null; } }
  function subLine(c) { return "Week " + c.bars.length + ", box 2%, last " + esc(CSE.disp(c.close)); }

  /* ---------- reading ---------- */
  window.renderReading = function () {
    sync();
    clearTimer();
    var c = ctx(), rd = curRead(), type = rd.type, n = S.cur.reads.length;
    var stepper = isStep(type);
    if (stepper && UI.pick == null) UI.pick = c.closeBox;
    var q = QUESTION[type] || [CSE.NAMES[type], ""];
    var show = paneShow(type);
    var closes = c.bars.map(function (b) { return b.c; });

    var h = header(esc(S.cur.code) + " · Reading " + (S.cur.i + 1) + " of " + n, subLine(c), { gear: true });

    var qhtml = '<div class="card q"><h2>' + esc(q[0]) + '</h2><p>' + esc(q[1]) + '</p>';
    if (stepper) {
      var lab = type === "R4" ? "Price objective" : (type === "R2" ? "Support box" : "Resistance box");
      qhtml += '<div class="cap2">' + esc(lab) + '</div><div class="stp" style="margin-bottom:10px">' +
        '<button class="btn" id="stepDown" data-act="step-down" aria-label="Lower one box">&minus;</button>' +
        '<span class="qty num" id="stepVal">' + esc(CSE.disp(CSE.priceOf(UI.pick))) + '<small>your pick</small></span>' +
        '<button class="btn" id="stepUp" data-act="step-up" aria-label="Higher one box">+</button></div>';
    } else {
      var opts = (CSE.OPTIONS && CSE.OPTIONS[type]) || [];
      var grid = opts.length === 4;
      qhtml += '<div class="optgrid' + (grid ? " two" : "") + '">';
      opts.forEach(function (o) {
        var on = UI.pick === o;
        qhtml += '<button class="btn opt' + (on ? " on" : "") + '" data-opt="' + esc(o) + '" aria-pressed="' + on + '"><span>' + esc(o) + '</span></button>';
      });
      qhtml += '</div>';
    }
    qhtml += '<button class="btn out wide" data-act="rule">Review rule</button></div>';

    $("main").innerHTML = h + '<div class="stack"><div class="card pf">' + chipsRow() + '<div id="pf"></div></div>' +
      secPane(c, type) + paneHtml(show, closes) + qhtml + '</div>';

    var ov = [{ k: "close", box: c.closeBox }];
    if (stepper) ov.push({ k: "row", box: UI.pick, label: "your pick", style: "pick" });
    if (type !== "R3") { var t1 = trendOv(c.eng); if (t1) ov.push(t1); }
    drawChart(c, {
      overlays: ov, pick: stepper ? UI.pick : null, keepCol: (type === "R4" && c.reads.R4 && c.reads.R4.col != null) ? c.reads.R4.col : null,
      onRow: stepper ? function (box) { UI.pick = box; keepScroll(render); } : null
    });
    if (showSector(c, type)) {
      var sov = [];
      if (type !== "S2") { var t2 = trendOv(c.sec.eng); if (t2) sov.push(t2); }
      drawSector(c, { overlays: sov, maxPlotH: isSec(type) ? 220 : null }); /* sector reading: the sector chart is the subject */
    }
    drawPanes(show, closes, {});
    bar([
      { act: "skip", label: "Skip", kind: "out" },
      { act: "submit", label: "Submit reading", kind: "primary", disabled: UI.pick == null }
    ]);
  };

  function stepBy(d) {
    var c = ctx(), lo = 1e9, hi = -1e9;
    c.eng.cols.forEach(function (k) { if (k.lo < lo) lo = k.lo; if (k.hi > hi) hi = k.hi; });
    var cur = UI.pick == null ? c.closeBox : UI.pick;
    UI.pick = Math.max(lo - 10, Math.min(hi + 60, cur + d));
    keepScroll(render);
  }
  ACT["step-down"] = function () { stepBy(-1); };
  ACT["step-up"] = function () { stepBy(1); };

  ACT.opt = function (a) {
    var v = typeof a === "string" ? a : (a && a.dataset ? a.dataset.opt : null);
    if (v == null) return;
    if (S.screen === "call") { if (typeof setCall === "function") setCall(v); }
    else UI.pick = v;
    keepScroll(render);
  };
  ACT.submit = function () {
    if (UI.pick == null) return;
    submitReading(UI.pick);
    go("marked");
  };
  ACT.skip = function () {
    var i0 = S.cur.i, sc0 = S.screen;
    skipReading();
    // admin default: if the store did not move on by itself, move to the next reading
    if (S.cur && S.cur.i === i0 && S.screen === sc0) nextReading();
    UI.key = null;
    render();
  };
  ACT.next = function () {
    nextReading();
    UI.key = null;
    render();
  };

  /* ---------- marked ---------- */
  window.renderMarked = function () {
    sync();
    clearTimer();
    var c = ctx(), rd = curRead(), type = rd.type, n = S.cur.reads.length;
    var R = c.reads, SR = c.sec ? c.sec.reads : {}, ans = R[type];
    var show = paneShow(type);
    var closes = c.bars.map(function (b) { return b.c; });
    var nCols = c.eng.cols.length;

    var pillTxt = rd.skipped ? "Skipped" : (rd.ok ? "Right" : "Marked");
    var pillClr = rd.ok ? "var(--x)" : "var(--o)";
    var pill = '<span class="chip" style="border-color:' + pillClr + ';color:' + pillClr + '">' +
      (rd.ok ? '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.5L4 8L8.5 2" fill="none" stroke="' + pillClr + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="' + pillClr + '" stroke-width="2" stroke-linecap="round"/></svg>') +
      esc(pillTxt) + '</span>';
    var h = header(esc(S.cur.code) + " · Reading " + (S.cur.i + 1) + " of " + n, subLine(c), { pill: pill });

    var ov = [{ k: "close", box: c.closeBox }];
    var given = rd.given;
    if (type === "R1") {
      if (R.R1 && R.R1.col != null && R.R1.answer !== "No signal") ov.push({ k: "sig", col: R.R1.col, label: /sell/.test(R.R1.answer) ? "Sell" : "Buy" });
    } else if ((type === "R2" || type === "R2b") && ans) {
      ov.push({ k: "row", box: ans.answer, label: "engine " + CSE.disp(CSE.priceOf(ans.answer)), style: "engine" });
      if (typeof given === "number") ov.push({ k: "row", box: given, label: "your row", style: "pick" });
    } else if (type === "R3" && ans) {
      var t3 = trendOv(c.eng); if (t3) ov.push(t3);
    } else if (type === "R4" && ans) {
      ov.push({ k: "col", col: ans.col, label: ans.boxes + " boxes" });
      ov.push({ k: "line", box: ans.answer, label: "engine objective " + CSE.disp(CSE.priceOf(ans.answer)), style: "engine" });
      if (typeof given === "number") ov.push({ k: "line", box: given, label: "your objective", style: "pick" });
    }
    var sov = [];
    if (c.sec) {
      if (type === "S1" && SR.S1 && SR.S1.col != null && SR.S1.answer !== "No signal") {
        sov.push({ k: "sig", col: SR.S1.col, label: /sell/.test(SR.S1.answer) ? "Sell" : "Buy" });
      }
      if (isSec(type)) { var t4 = trendOv(c.sec.eng); if (t4) sov.push(t4); }
    }

    var chip = "";
    if (type === "R1" && R.R1 && R.R1.answer !== "No signal") {
      var sell = /sell/.test(R.R1.answer), fresh = R.R1.col === nCols - 1;
      chip = '<div class="chips"><span class="chip fresh ' + (sell ? "sell" : "buy") + '">' + esc(R.R1.answer + (fresh ? ", this week" : "")) + '</span></div>';
    }

    var sentence = "";
    try { sentence = CSE.explain(type, R, given, SR); } catch (e) { sentence = ""; }
    if (rd.skipped) sentence = "Skipped. " + sentence;
    var ci = sentence.indexOf(":"), head = "", rest = sentence;
    if (ci > 0 && ci < 40) { head = sentence.slice(0, ci + 1); rest = sentence.slice(ci + 1); }
    var msg = '<div class="card msg">' + (rd.ok ? ICON_OK : (rd.skipped ? ICON_SKIP : ICON_NO)) +
      '<p>' + (head ? "<b>" + esc(head) + "</b>" : "") + esc(rest) + '</p></div>';

    var more = S.cur.i < n - 1;
    $("main").innerHTML = h + '<div class="stack">' +
      '<div class="card" style="padding:4px 4px 6px"><div class="dots">' + marks(S.cur.reads) + '</div></div>' +
      '<div class="card pf">' + chipsRow() + chip + '<div class="pfwrap" id="pf"></div></div>' +
      secPane(c, type) + paneHtml(show, closes) + msg + '</div>';

    drawChart(c, { overlays: ov, pick: null });
    if (showSector(c, type)) drawSector(c, { overlays: sov, maxPlotH: isSec(type) ? 220 : null });
    drawPanes(show, closes, { rsiMark: (type === "R7" && R.R7 && R.R7.ref != null) ? { t: R.R7.ref } : null });
    bar([
      { act: "rule", label: "Review rule", kind: "out" },
      { act: "next", label: more ? "Next reading" : "To your call", kind: "primary" }
    ]);
  };

  /* ---------- call ---------- */
  function curH() {
    var h = S.cur && typeof S.cur.h === "number" ? S.cur.h : (T.horizonDefault || 6);
    return Math.max(3, Math.min(10, Math.round(h)));
  }
  function tradeLine() {
    var tr = (S.run && S.run.trades) ? S.run.trades.length : 0;
    var max = (T && T.runTrades) || 10;
    return "Trade " + Math.min(tr + 1, max) + " of " + max;
  }
  function weeksText(h) { return h + " weeks"; }
  function chartLine() {
    var n = (S.run && S.run.charts) || 0, max = (T && T.runCharts) || 20;
    return "chart " + Math.min(n + 1, max) + " of " + max + " in this run";
  }
  var TRI_UP = '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5l5 9H1z" fill="var(--x)"/></svg>';
  var TRI_DN = '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.5l5-9H1z" fill="var(--o)"/></svg>';
  window.TRI_UP = TRI_UP; window.TRI_DN = TRI_DN;
  function keyHtml() {
    return '<span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="var(--x)" stroke-width="1.8" stroke-linecap="round"/></svg><span>up</span>' +
      '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" stroke="var(--o)" stroke-width="1.8" fill="none"/></svg><span>down</span></span>';
  }
  window.renderCall = function () {
    sync();
    clearTimer();
    var c = ctx(), h = curH(), pick = S.cur.call || null;
    var nR = (S.cur.reads || []).length;
    var hd = header("Your call", S.cur.code + " · " + nR + " reading" + (nR === 1 ? "" : "s") + " marked · last " + CSE.disp(c.close), { gear: true });
    var seg = '<div class="seg" role="group" aria-label="Your call">';
    ["Buy", "Don't buy"].forEach(function (o) {
      var on = pick === o;
      seg += '<button class="' + (on ? "on" : "") + '" data-opt="' + esc(o) + '" aria-pressed="' + on + '">' + esc(o) + '</button>';
    });
    seg += '</div>';
    var rr = 0; try { rr = runReturn(); } catch (e) { rr = 0; }
    var rv = Math.round(rr * 1000), nT = (S.run && S.run.trades) ? S.run.trades.length : 0;
    var rrHtml = '<b class="num ' + (rv > 0 ? "up" : (rv < 0 ? "down" : "")) + '">' + (rv > 0 ? TRI_UP : (rv < 0 ? TRI_DN : "")) + esc(fmtPct(rr)) + '</b>';
    var ticks = "";
    for (var t = 3; t <= 10; t++) ticks += '<span' + (t === h ? ' class="on"' : '') + '>' + t + '</span>';
    var callCard = '<div class="card callc" id="callc">' +
      '<div class="st"><span><b class="num">' + esc(tradeLine()) + '</b><small class="num">' + esc(chartLine()) + '</small></span>' +
      '<span class="rr">' + rrHtml + '<small>' + (nT ? "run return so far" : "run return, no trades yet") + '</small></span></div>' + seg +
      '<div class="hzh"><span class="cap">Horizon</span><span class="v num"><b id="hLabel" aria-live="polite">' + esc(weeksText(h)) + '</b><small id="hx">closes at week +' + h + '</small></span></div>' +
      '<div class="sl"><button class="btn" data-act="h-down" aria-label="One week shorter">&minus;</button>' +
      '<input type="range" id="horizon" min="3" max="10" step="1" value="' + h + '" aria-label="Time horizon in weeks">' +
      '<button class="btn" data-act="h-up" aria-label="One week longer">+</button><div class="tk num" id="tk" aria-hidden="true">' + ticks + '</div></div></div>';
    var stockCard = '<div class="card pf"><div class="cs tg"><span class="tags"><span>' + esc(S.cur.code) + '</span><span>Box 2%</span><span>3-box</span><span>Weekly</span></span>' + keyHtml() + '</div><div id="pf"></div></div>';
    var sec = showSector(c, "call"), secCard = secPane(c, "call");
    /* v2 mockup: stock, sector, call card on one screen. Short screens (475x638): call card above the sector chart. */
    var tall = (window.innerHeight || 800) >= 760;
    $("main").innerHTML = hd + '<div class="stack callstack">' + stockCard + (tall ? secCard + callCard : callCard + secCard) + "</div>";
    bar([
      { act: "back-reading", label: "Review charts", kind: "out" },
      { act: "confirm-call", label: "Confirm call", kind: "primary", disabled: !pick }
    ]);

    /* height budget: everything from the stock chart to the call card fits above the bottom bar */
    var bEl = $("bar"), pf = $("pf"), cc = $("callc");
    var barTop = bEl && bEl.offsetHeight ? window.innerHeight - bEl.offsetHeight : window.innerHeight - 76;
    var pfTop = pf ? pf.getBoundingClientRect().top + (window.scrollY || 0) : 200;
    var callH = cc ? cc.offsetHeight : 220, GAP = 8, SVGPAD = 6 + 24, SECPAD = 6 + 20 + 20 + 2;
    var room = barTop - pfTop - 8 - 2; /* 8 slack, 2 card border */
    var ov = [{ k: "close", box: c.closeBox }];
    var t1 = trendOv(c.eng); if (t1) ov.push(t1);
    var secCap = Math.max(66, (T.sectorHeight || 180) - 46);
    var sov = [];
    if (sec) { var t2 = trendOv(c.sec.eng); if (t2) sov.push(t2); }
    function gapped(id) { /* fix1: a chart that cannot fill the card width inside its height budget */
      var sv = $(id) && $(id).querySelector("svg[data-gap]");
      return !!(sv && +sv.dataset.gap > 2 * +sv.dataset.cell);
    }
    if (tall) {
      var secMin = sec ? 110 + SECPAD + GAP : 0;
      drawChart(c, { overlays: ov, minCell: 7, fitHeight: true, maxPlotH: Math.max(150, Math.min(270, room - SVGPAD - GAP - callH - secMin)) });
    } else {
      drawChart(c, { overlays: ov, minCell: 7, fitHeight: true, maxPlotH: Math.max(120, Math.min(270, room - SVGPAD - GAP - callH)) });
    }
    var callFirst = gapped("pf");
    if (sec && !callFirst) {
      var secPlot = secCap;
      if (tall) {
        var pfCard = pf.parentNode, used = pfCard ? pfCard.getBoundingClientRect().bottom + (window.scrollY || 0) : pfTop + 260;
        secPlot = Math.max(66, Math.min(secCap, barTop - 8 - used - GAP - callH - GAP - SECPAD));
      }
      drawSector(c, { overlays: sov, maxPlotH: secPlot, minCell: 5, fitHeight: tall });
      if (tall && gapped("pfs")) callFirst = true;
    }
    if (callFirst) {
      /* fix1: the charts cannot fill the width in the room left beside the call controls: controls first (on screen),
         then both charts at full width below (they scroll), never a half-empty chart */
      var stk = document.querySelector(".callstack"), pfc = pf.parentNode, sc2 = $("pfs") ? $("pfs").parentNode : null;
      stk.insertBefore(cc, stk.firstChild);
      stk.appendChild(pfc);
      if (sc2) stk.appendChild(sc2);
      drawChart(c, { overlays: ov, minCell: 7 });
      if (sec) drawSector(c, { overlays: sov, minCell: 5 });
    }
    var inp = $("horizon");
    if (inp) {
      inp.addEventListener("input", function () {
        var v = parseInt(inp.value, 10);
        if (typeof setHorizon === "function") setHorizon(v);
        paintH();
      });
    }
    paintH();
  };
  function paintH() {
    var h = curH(), l = $("hLabel"), i = $("horizon"), x = $("hx"), tk = $("tk");
    if (l) l.textContent = weeksText(h);
    if (x) x.textContent = "closes at week +" + h;
    if (i && String(i.value) !== String(h)) i.value = h;
    if (i) { /* track fill ends at the thumb centre (thumb 36px) */
      var w = i.clientWidth || 1, px = 18 + (h - 3) / 7 * (w - 36);
      i.style.setProperty("--p", (px / w * 100).toFixed(2) + "%");
    }
    if (tk) [].forEach.call(tk.children, function (sp) { sp.className = (+sp.textContent === h) ? "on" : ""; });
  }
  function bumpH(d) {
    if (typeof setHorizon === "function") setHorizon(curH() + d);
    paintH();
  }
  ACT["h-down"] = function () { bumpH(-1); };
  ACT["h-up"] = function () { bumpH(1); };
  ACT["back-reading"] = function () {
    if (S.cur && S.cur.reads) S.cur.i = S.cur.reads.length - 1;
    UI.key = null;
    go("marked");
  };
  ACT["confirm-call"] = function () {
    if (!S.cur || !S.cur.call) return;
    if (typeof confirmCall === "function") confirmCall();
    UI.key = null;
  };

  /* ---------- outcome ---------- */
  window.renderOutcome = function () {
    sync();
    clearTimer();
    var c = ctx(), h = curH();
    var k = Math.max(0, Math.min(h, S.cur.k != null ? S.cur.k : (S.cur.step || 0)));
    var fwd = c.sh.fwd ? toBars(c.sh.fwd).slice(0, k) : [];
    var all = c.bars.concat(fwd), eng = CSE.pnf(all);
    var closes = all.map(function (b) { return b.c; });
    var buy = S.cur.call === "Buy";
    var ret = 0;
    if (k > 0) {
      if (c.sh.fwdRet && typeof c.sh.fwdRet[k - 1] === "number") ret = c.sh.fwdRet[k - 1];
      else if (fwd[k - 1]) ret = fwd[k - 1].c / c.close - 1;
    }
    var hd = header(esc(S.cur.code) + " · Outcome", buy ? "Buy, " + weeksText(h) : "Don't buy, " + weeksText(h), {});

    var txt = "Week +" + k + " of " + h + " · " + (buy ? "return so far " : "price moved ") + fmtPct(ret) + (buy ? "" : " (no trade)");
    var line = '<div class="card retc ' + retCls(ret) + '"><div class="retl num">' + esc(txt) + '</div>' +
      '<div class="retw"><span class="rb">' + esc(buy ? retWord(ret) : (ret > 0 ? "Rose" : (ret < 0 ? "Fell" : "Flat"))) + '</span>' +
      (k >= h ? '<span> · final, week +' + h + '</span>' : '') + '</div></div>';

    var ov = [{ k: "entry", box: c.closeBox, label: "entry" }];
    if (k > 0) ov.push({ k: "exit", col: eng.cols.length - 1, label: k >= h ? "exit" : "week +" + k });
    var key = k > 0 ? '<span class="key"><svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" fill="var(--x)" fill-opacity=".22" stroke="var(--x)"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="var(--x)" stroke-width="1.6" stroke-linecap="round"/></svg>New in ' + k + ' week' + (k === 1 ? "" : "s") + '</span>' : '<span>Chart at your call</span>';

    var sec = "";
    var sk = c.sec ? c.sec.fwd.slice(0, k) : [], sall = c.sec ? c.sec.bars.concat(sk) : [];
    if (c.sec && T.showSector) sec = '<div class="card pf secp"><div class="pfwrap" id="pfs"></div></div>';

    $("main").innerHTML = hd + '<div class="stack">' + line +
      '<div class="card pf"><div class="cs">' + key + '<span class="num">Box 2% · 3-box reversal</span></div><div class="pfwrap" id="pf"></div></div>' +
      sec + '</div>';

    drawChart(c, { bars: all, eng: eng, newFrom: k > 0 ? c.bars.length : null, overlays: ov, height: 260 });
    if (sec) {
      var seng = CSE.pnf(sall);
      drawSector(c, { bars: sall, eng: seng, newFrom: k > 0 ? c.sec.bars.length : null, overlays: [] });
    }
    var done = k >= h;
    bar([
      { act: "copy-report", label: "Copy report", kind: "out" },
      done ? { act: "finish", label: "Chart summary", kind: "primary" } : { act: "advance", label: "Advance week", kind: "primary" }
    ]);
  };
  ACT.advance = function () { clearTimer(); advanceWeek(); render(); };
})();
