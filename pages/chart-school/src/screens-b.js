/* screens-b.js (Maker SCR-B): reading, marked, order, evidence. Plain browser script. */
(function () {
  window.ACT = window.ACT || {};
  window.UI = window.UI || { key: null, pick: null, order: null, timer: null };
  var UI = window.UI;

  var QUESTION = {
    R1: ["Signal: what do the last 3 columns show?", "Look for a double or triple top or bottom break."],
    R2: ["Support: which box is the low of the last completed O column?", "Set the box, or tap a row on the chart."],
    R2b: ["Resistance: which box is the high of the last completed X column?", "Set the box, or tap a row on the chart."],
    R3: ["Trend: which line is active and where is the close?", "Follow the 45 degree line: support rises, resistance falls."],
    R4: ["Vertical count: set the price objective.", "Use the buy signal column. Set the objective box, or tap a row on the chart."],
    R5: ["RSI(14): which band is it in?", "Read the RSI pane."],
    R6: ["MACD(12,26,9): what is the histogram doing?", "Sign, and direction against last week."],
    R7: ["Divergence: do price and RSI disagree?", "Compare the latest swing in price with RSI at the same points."]
  };
  var STEPPER = { R2: 1, R2b: 1, R4: 1 };

  function toBars(a) {
    return (a || []).map(function (b) {
      return Array.isArray(b) ? { h: b[0], l: b[1], c: b[2] } : { h: b.h, l: b.l, c: b.c };
    });
  }
  function ctx() {
    var sh = curSheet(), bars = toBars(sh.bars);
    var close = bars[bars.length - 1].c;
    return { sh: sh, bars: bars, close: close, closeBox: CSE.boxOf(close), eng: CSE.pnf(bars), reads: CSE.readAll(bars) };
  }
  function sync() {
    var key = S.cur.sheetIdx + ":" + S.cur.i;
    if (UI.key !== key) { UI.key = key; UI.pick = null; UI.order = null; }
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
      drawPnf(host, {
        bars: o.bars || c.bars, eng: o.eng || c.eng, newFrom: o.newFrom == null ? null : o.newFrom,
        cols: T.chartCols || 24, showColNums: !!T.showColNums, overlays: o.overlays || [],
        pick: o.pick == null ? null : o.pick, onRow: o.onRow || null
      });
    });
  }

  /* ---------- reading ---------- */
  window.renderReading = function () {
    sync();
    clearTimer();
    var c = ctx(), rd = curRead(), type = rd.type, n = S.cur.reads.length;
    var stepper = !!STEPPER[type];
    if (stepper && UI.pick == null) UI.pick = c.closeBox;
    var q = QUESTION[type] || [CSE.NAMES[type], ""];
    var show = paneShow(type);
    var closes = c.bars.map(function (b) { return b.c; });

    var h = header(esc(S.cur.code) + " · Reading " + (S.cur.i + 1) + " of " + n,
      "Week " + c.bars.length + ", box 2%, last " + esc(CSE.disp(c.close)), { gear: true });

    var qhtml = '<div class="card q"><h2>' + esc(q[0]) + '</h2><p>' + esc(q[1]) + '</p>';
    if (stepper) {
      var lab = type === "R4" ? "Price objective" : (type === "R2" ? "Support box" : "Resistance box");
      qhtml += '<div class="cap2">' + esc(lab) + '</div><div class="stp" style="margin-bottom:10px">' +
        '<button class="btn" id="stepDown" data-act="step-down" aria-label="Lower one box">&minus;</button>' +
        '<span class="qty num" id="stepVal">' + esc(CSE.disp(CSE.priceOf(UI.pick))) + '<small>your pick</small></span>' +
        '<button class="btn" id="stepUp" data-act="step-up" aria-label="Higher one box">+</button></div>';
    } else {
      var opts = CSE.OPTIONS[type] || [];
      var grid = opts.length === 4;
      qhtml += '<div style="display:' + (grid ? "grid;grid-template-columns:1fr 1fr" : "flex;flex-direction:column") + ';gap:8px;margin-bottom:10px">';
      opts.forEach(function (o) {
        var on = UI.pick === o;
        qhtml += '<button class="btn opt' + (on ? " on" : "") + '" data-opt="' + esc(o) + '" aria-pressed="' + on +
          '" style="height:56px;display:flex;align-items:center;justify-content:flex-start;gap:6px;text-align:left;white-space:normal;line-height:1.15' +
          (on ? ";box-shadow:inset 0 0 0 2px var(--text);background:var(--surface2)" : "") + '"><span>' + esc(o) + '</span></button>'; /* FM fix: tick comes from style.css .opt.on::before (was drawn twice) */
      });
      qhtml += '</div>';
    }
    qhtml += '<button class="btn out" data-act="rule" style="width:100%;height:48px;background:transparent">Review rule</button></div>';

    $("main").innerHTML = h + '<div class="stack"><div class="card pf">' + chipsRow() + '<div id="pf"></div></div>' +
      paneHtml(show, closes) + qhtml + '</div>';

    var ov = [{ k: "close", box: c.closeBox }];
    if (stepper) ov.push({ k: "row", box: UI.pick, label: "your pick", style: "pick" });
    if (type !== "R3") { try { ov.push({ k: "trend", segs: CSE.trend(c.eng).segs }); } catch (e) {} }
    drawChart(c, {
      overlays: ov, pick: stepper ? UI.pick : null,
      onRow: stepper ? function (box) { UI.pick = box; keepScroll(render); } : null
    });
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
    if (S.screen === "order") UI.order = v; else UI.pick = v;
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
    var R = c.reads, ans = R[type];
    var show = paneShow(type);
    var closes = c.bars.map(function (b) { return b.c; });
    var nCols = c.eng.cols.length;

    var pillTxt = rd.skipped ? "Skipped" : (rd.ok ? "Right" : "Marked");
    var pillClr = rd.ok ? "var(--x)" : "var(--o)";
    var pill = '<span class="chip" style="border-color:' + pillClr + ';color:' + pillClr + '">' +
      (rd.ok ? '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.5L4 8L8.5 2" fill="none" stroke="' + pillClr + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="' + pillClr + '" stroke-width="2" stroke-linecap="round"/></svg>') +
      esc(pillTxt) + '</span>';
    var h = header(esc(S.cur.code) + " · Reading " + (S.cur.i + 1) + " of " + n,
      "Week " + c.bars.length + ", box 2%, last " + esc(CSE.disp(c.close)), { pill: pill });

    // overlays per type, engine reading
    var ov = [{ k: "close", box: c.closeBox }];
    var given = rd.given;
    if (type === "R1") {
      if (R.R1 && R.R1.col != null && R.R1.answer !== "No signal") ov.push({ k: "sig", col: R.R1.col, label: /sell/.test(R.R1.answer) ? "Sell" : "Buy" });
    } else if ((type === "R2" || type === "R2b") && ans) {
      ov.push({ k: "row", box: ans.answer, label: "engine " + CSE.disp(CSE.priceOf(ans.answer)), style: "engine" });
      if (typeof given === "number") ov.push({ k: "row", box: given, label: "your row", style: "pick" });
    } else if (type === "R3" && ans) {
      ov.push({ k: "trend", segs: CSE.trend(c.eng).segs });
    } else if (type === "R4" && ans) {
      ov.push({ k: "col", col: ans.col, label: ans.boxes + " boxes" });
      ov.push({ k: "line", box: ans.answer, label: "engine objective " + CSE.disp(CSE.priceOf(ans.answer)), style: "engine" });
      if (typeof given === "number") ov.push({ k: "line", box: given, label: "your objective", style: "pick" });
    }

    // signal chip
    var chip = "";
    if (type === "R1" && R.R1 && R.R1.answer !== "No signal") {
      var sell = /sell/.test(R.R1.answer), fresh = R.R1.col === nCols - 1;
      chip = '<div class="chips"><span class="chip fresh ' + (sell ? "sell" : "buy") + '">' + esc(R.R1.answer + (fresh ? ", this week" : "")) + '</span></div>';
    }

    var sentence = "";
    try { sentence = CSE.explain(type, R, given); } catch (e) { sentence = ""; }
    if (rd.skipped) sentence = "Skipped. " + sentence;
    var ci = sentence.indexOf(":"), head = "", rest = sentence;
    if (ci > 0 && ci < 40) { head = sentence.slice(0, ci + 1); rest = sentence.slice(ci + 1); }
    var msg = '<div class="card msg">' + (rd.ok ? ICON_OK : (rd.skipped ? ICON_SKIP : ICON_NO)) +
      '<p>' + (head ? "<b>" + esc(head) + "</b>" : "") + esc(rest) + '</p></div>';

    var more = S.cur.i < n - 1;
    $("main").innerHTML = h + '<div class="stack">' +
      '<div class="card" style="padding:4px 4px 6px"><div class="dots">' + marks(S.cur.reads) + '</div></div>' +
      '<div class="card pf">' + chipsRow() + chip + '<div class="pfwrap" id="pf"></div></div>' +
      paneHtml(show, closes) + msg + '</div>';

    drawChart(c, { overlays: ov, pick: null });
    drawPanes(show, closes, { rsiMark: (type === "R7" && R.R7 && R.R7.ref != null) ? { t: R.R7.ref } : null });
    bar([
      { act: "rule", label: "Review rule", kind: "out" },
      { act: "next", label: more ? "Next reading" : "To the 10 weeks", kind: "primary" }
    ]);
  };

  /* ---------- order ---------- */
  window.renderOrder = function () {
    sync();
    clearTimer();
    var c = ctx(), closes = c.bars.map(function (b) { return b.c; });
    var h = header(esc(S.cur.code) + " · Paper order", "Week " + c.bars.length + ", last " + esc(CSE.disp(c.close)), {});
    var seg = '<div class="seg" role="group" aria-label="Paper order">';
    ["Buy", "Hold", "Sell"].forEach(function (o) {
      var on = UI.order === o;
      seg += '<button class="' + (on ? "on" : "") + '" data-opt="' + o + '" aria-pressed="' + on + '">' + o + '</button>';
    });
    seg += '</div>';
    $("main").innerHTML = h + '<div class="stack"><div class="card pf">' + chipsRow() + '<div id="pf"></div></div>' +
      '<div class="card"><div class="cap" style="margin-bottom:6px">Paper order (optional, never in the accuracy record)</div>' + seg +
      '<p class="dim" style="margin:10px 0 0;font-size:13px">Long only. Sell means stay out.</p></div></div>';
    drawChart(c, { overlays: [{ k: "close", box: c.closeBox }] });
    bar([
      { act: "skip-order", label: "Skip order", kind: "out" },
      { act: "place-order", label: "Place paper order", kind: "primary", disabled: !UI.order }
    ]);
  };
  ACT["skip-order"] = function () { setOrder(null); go("evidence"); };
  ACT["place-order"] = function () { if (!UI.order) return; setOrder(UI.order); go("evidence"); };

  /* ---------- evidence ---------- */
  window.renderEvidence = function () {
    sync();
    clearTimer();
    var c = ctx(), k = S.cur.step || 0, fwd = toBars(c.sh.fwd).slice(0, k);
    var all = c.bars.concat(fwd), eng = CSE.pnf(all);
    var closes = all.map(function (b) { return b.c; });
    var show = { rsi: !!T.showRsi, macd: !!T.showMacd };
    var R = c.reads;

    var h = header(esc(S.cur.code) + " · Week +" + k + " of 10", "Readings done. Stepping one week per tap.", {});

    var line = "";
    if (R.R4) {
      var objP = CSE.priceOf(R.R4.answer), hi = -1e9, reached = false;
      fwd.forEach(function (b) { if (b.h > hi) hi = b.h; if (CSE.boxOf(b.h) >= R.R4.answer) reached = true; });
      line = '<div class="line1 num"><b>Objective ' + esc(CSE.disp(objP)) + ':</b> ' + (reached ? "reached" : "not reached yet") +
        (fwd.length ? ". High so far <b>" + esc(CSE.disp(hi)) + "</b>" : ". No weeks stepped yet") + '</div>';
    }

    var ov = [{ k: "close", box: CSE.boxOf(closes[closes.length - 1]) }];
    if (R.R4) ov.push({ k: "line", box: R.R4.answer, label: "objective", style: "engine" });
    try { ov.push({ k: "trend", segs: CSE.trend(eng).segs }); } catch (e) {}

    var poText;
    if (S.cur.order) {
      var res = orderResult();
      poText = "<b>Paper order:</b> " + esc(S.cur.order) + (res && res.text ? " · " + esc(res.text) : "");
    } else poText = "<b>Paper order:</b> none placed";
    var po = '<div class="card po"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l8 15H2z" fill="none" stroke="var(--x)" stroke-width="1.8" stroke-linejoin="round"/></svg><div class="t num">' + poText + '</div></div>';

    var rds = S.cur.reads, right = rds.filter(function (r) { return r.ok === true; }).length;
    var list = rds.map(function (r) {
      var good = r.ok === true;
      return '<div class="mk ' + (good ? "good" : "bad") + '">' + (r.skipped ? ICON_SKIP : (good ? ICON_OK : ICON_NO)) +
        '<span class="n">' + esc(CSE.NAMES[r.type] || r.type) + '</span><span class="r">' + (r.skipped ? "Skipped" : (good ? "Right" : "Marked wrong")) + '</span></div>';
    }).join("");
    var sum = '<div class="card"><div class="sh"><b>Readings ' + right + ' right of ' + rds.length + '</b><span class="dim num">this sheet</span></div>' +
      '<div class="dots">' + marks(rds) + '</div>' + list + '</div>';
    var ev = '<div class="card ev num">' + esc(evidenceLine()) + '</div>';

    var key = k > 0 ? '<span class="key"><svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" fill="var(--x)" fill-opacity=".22" stroke="var(--x)"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="var(--x)" stroke-width="1.6" stroke-linecap="round"/></svg>New in ' + k + ' week' + (k === 1 ? "" : "s") + '</span>' : '<span>Sheet week</span>';
    $("main").innerHTML = h + '<div class="stack"><div class="card pf"><div class="cs">' + key + '<span class="num">Box 2% · 3-box reversal</span></div>' +
      '<div class="pfwrap" id="pf"></div>' + line + '</div>' + paneHtml(show, closes) + po + sum + ev + '</div>';

    drawChart(c, { bars: all, eng: eng, newFrom: k > 0 ? c.bars.length : null, overlays: ov });
    drawPanes(show, closes, { newFrom: k > 0 ? c.bars.length : null });

    var done = k >= 10;
    bar([
      { act: "copy-report", label: "Copy report", kind: "out" },
      done ? { act: "finish", label: "Sheet summary", kind: "primary" } : { act: "advance", label: "Advance week", kind: "primary" }
    ]);
    if (!done && T.evidenceAuto) {
      UI.timer = setTimeout(function () {
        UI.timer = null;
        if (S.screen === "evidence" && S.cur && (S.cur.step || 0) === k) { advanceWeek(); render(); }
      }, 700);
    }
  };
  ACT.advance = function () { clearTimer(); advanceWeek(); render(); };
})();
