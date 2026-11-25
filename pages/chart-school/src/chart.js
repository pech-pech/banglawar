/* chart.js (Maker CHART): pure inline SVG P&F chart + RSI + MACD panes. Globals: drawPnf, drawRsi, drawMacd.
   Look copied from the locked mockups (reading/marked/evidence). Colours only via CSS vars from pro.css.
   Applied VQA fixes: 9 support line is --accent everywhere, 8 no value pills inside panes (values live in the pane header),
   10 price-axis labels are never covered by pills (a pill replaces the label at its row, pills are spread apart). */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var AX = 48; // right gutter for price axis (same in all three charts so columns line up)

  function el(p, tag, a, txt) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (txt != null) e.textContent = txt;
    if (p) p.appendChild(e);
    return e;
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function priceOf(b) { return (root.CSE && root.CSE.priceOf) ? root.CSE.priceOf(b) : Math.pow(1.02, b); }
  function disp(b) {
    var p = priceOf(b);
    if (root.CSE && root.CSE.disp) return String(root.CSE.disp(p));
    var v = p * 100;
    return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
  }
  function hostW(host) { var w = host.clientWidth || (host.getBoundingClientRect && host.getBoundingClientRect().width) || 344; return Math.max(200, Math.round(w)); }
  function clear(host) { while (host.firstChild) host.removeChild(host.firstChild); }
  function pill(g, W, y, txt, bg, fg, stroke) {
    txt = String(txt);
    var w = Math.round(txt.length * 6.1 + 8);
    el(g, "rect", { x: W - 2 - w, y: f1(y - 8.5), width: w, height: 17, rx: 4, fill: bg, stroke: stroke || "none", "stroke-width": 1 });
    el(g, "text", { x: f1(W - 2 - w / 2), y: f1(y + 0.5), "text-anchor": "middle", "dominant-baseline": "central", "font-size": 11, "font-weight": 700, fill: fg, "font-variant-numeric": "tabular-nums" }, txt);
  }

  /* ---------------------------------------------------------------- P&F */
  function drawPnf(host, opt) {
    opt = opt || {};
    var eng = opt.eng || { cols: [], cells: [] };
    var cols = eng.cols || [];
    var nCols = cols.length;
    var NCAP = Math.max(4, opt.cols || 24); // T.chartCols: max columns shown
    var ovs = opt.overlays || [];
    var W = hostW(host);
    var pw = W - AX;
    var HT = Math.max(100, +opt.height || 300), compact = !!opt.compact, TT = opt.title ? 20 : 0;
    var FS = 11; // axis font (v2 mockups: 11px on both charts)
    var AXH = compact ? 20 : 24; // column axis strip under the plot
    var CELL = +opt.cell || (compact ? 11 : 15), MINC = Math.min(CELL, +opt.minCell || (compact ? 6 : 8));
    var MAXPH = +opt.maxPlotH || (HT - 6 - TT - AXH); // plot height budget (rows x cell)
    var MARG = opt.margin != null ? +opt.margin : 1;   // empty boxes above / below the marks
    clear(host);
    if (!nCols) { var s0 = el(host, "svg", { width: W, height: 40, viewBox: "0 0 " + W + " 40", role: "img", "aria-label": "Empty point and figure chart" }); return s0; }

    // week each box was first filled (for "new" drawing)
    var wk = {};
    (eng.cells || []).forEach(function (q) { wk[q.col + ":" + q.box] = q.week; });

    // v2 sizing: fixed SQUARE cells (15 stock, 11 sector). Show the last columns that fit the width, crop the rows to the
    // box range of those columns (+MARG). If the rows do not fit the height budget: fewer columns first, then smaller cells.
    var needN = 0; // columns an overlay points at must stay in view
    ovs.forEach(function (o) { if ((o.k === "col" || o.k === "sig" || o.k === "exit") && o.col != null && o.col >= 0 && o.col < nCols) needN = Math.max(needN, nCols - o.col); });
    if (opt.keepCol != null && opt.keepCol >= 0 && opt.keepCol < nCols) needN = Math.max(needN, nCols - opt.keepCol);
    var first, lo, hi, top, bot, rows, c, N, j;
    function rangeFor(n) {
      var f = Math.max(0, nCols - n), l = Infinity, h = -Infinity, k;
      for (k = f; k < nCols; k++) { l = Math.min(l, cols[k].lo); h = Math.max(h, cols[k].hi); }
      function inc(b) { if (b == null || isNaN(b)) return; l = Math.min(l, b); h = Math.max(h, b); }
      ovs.forEach(function (o) { if (o.k === "close" || o.k === "entry") inc(o.box); }); // other overlays never widen the range (edge markers instead)
      inc(opt.pick);
      return { first: f, lo: l, hi: h, top: h + MARG, bot: l - MARG, rows: h - l + 1 + 2 * MARG };
    }
    // N = columns shown; c = min(CELL, height budget / rows). Take the most columns that keep c >= GOOD; otherwise the
    // column count with the biggest cells (ties: more columns). Volatile charts trade history for legible boxes.
    var GOOD = +opt.goodCell || Math.round(CELL * 0.8), NMIN = Math.max(1, +opt.minCols || 10);
    var fit = Math.max(1, Math.min(NCAP, Math.floor(pw / CELL + 1e-6))), nHi = Math.max(1, Math.min(fit, nCols));
    var nLo = Math.min(nHi, NMIN);
    if (needN > nHi) { nHi = needN; nLo = needN; }
    nLo = Math.max(nLo, Math.min(needN, nHi));
    var R = null, nn, bestC = -1, cand = [];
    for (nn = nHi; nn >= nLo; nn--) {
      var q = rangeFor(nn), cq = Math.min(CELL, pw / nn, MAXPH / q.rows);
      cand.push({ q: q, c: cq, n: nn });
      if (cq > bestC) bestC = cq;
    }
    var want = bestC >= GOOD ? GOOD : bestC * 0.85; // most columns whose cells are near the best size
    for (nn = 0; nn < cand.length; nn++) if (cand[nn].c >= want - 1e-6) { R = cand[nn].q; c = cand[nn].c; N = cand[nn].n; break; }
    c = Math.floor(c * 2) / 2; // half-pixel steps
    if (c < MINC) c = opt.fitHeight ? Math.max(3, Math.min(MINC, MAXPH / R.rows)) : Math.min(MINC, pw / N); // under MINC: grow taller, or (fitHeight) stay in budget
    // cells came out smaller than CELL: fill spare width with older columns that need no new rows
    var fitC = Math.min(NCAP, Math.floor(pw / c + 1e-6));
    while (R.first > 0 && nCols - R.first < fitC && cols[R.first - 1].lo >= R.lo && cols[R.first - 1].hi <= R.hi) R.first--;
    N = nCols - R.first;
    first = R.first; lo = R.lo; hi = R.hi; top = R.top; bot = R.bot; rows = R.rows;
    var ch = c;
    var nTop = 0, nBot = 0;
    ovs.forEach(function (o) { if (o.k === "row" || o.k === "line") { if (o.box > top) nTop++; else if (o.box < bot) nBot++; } });
    var STRIP = 17;
    var ph = rows * ch, OY = 6 + TT + STRIP * nTop, H = Math.round(OY + ph + AXH + STRIP * nBot + (nBot ? 2 : 0));
    var XO = pw - N * c; // slack on the left so the last column meets the axis
    function ty(b) { return (top - b) * ch; }       // top edge of box b
    function cy(b) { return ty(b) + ch / 2; }
    function cx(j) { return pw - (nCols - j) * c; }  // left edge of column j; the last column always meets the axis

    var s = el(host, "svg", { "data-cell": f1(c), "data-rows": rows, width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Point and figure chart, " + nCols + " columns, box 2 percent, last " + disp(cols[nCols - 1].d === 1 ? cols[nCols - 1].hi : cols[nCols - 1].lo) });
    if (opt.title) el(s, "text", { x: 10, y: 11, "dominant-baseline": "central", "font-size": 12, "font-weight": 600, fill: "var(--dim)" }, opt.title);
    var g = el(s, "g", { transform: "translate(0," + OY + ")" });

    // grid
    var i, r;
    for (i = 0; i <= N; i++) el(g, "line", { x1: f1(XO + i * c + 0.5), y1: 0, x2: f1(XO + i * c + 0.5), y2: f1(ph), stroke: "var(--grid)", "stroke-width": 1 });
    for (r = 0; r <= rows; r++) el(g, "line", { x1: f1(XO), y1: f1(r * ch + 0.5), x2: f1(pw), y2: f1(r * ch + 0.5), stroke: "var(--grid)", "stroke-width": 1 });
    el(g, "line", { x1: f1(pw + 0.5), y1: 0, x2: f1(pw + 0.5), y2: f1(ph), stroke: "var(--line)", "stroke-width": 1 });

    // column axis: tick + number every 5 columns (10 on the compact sector chart), "col" at the left
    var every = compact ? 10 : 5, ly0 = ph + (compact ? 14 : 17), minTickX = Infinity;
    for (j = first; j < nCols; j++) {
      var n1 = j + 1, x = cx(j) + c / 2;
      if (opt.showColNums) {
        el(g, "text", { x: f1(x), y: f1(ph + 15), "text-anchor": "middle", "font-size": c < 12 ? 8 : FS, fill: "var(--dim)", "font-variant-numeric": "tabular-nums" }, n1);
      } else if (n1 % every === 0) {
        el(g, "line", { x1: f1(x + 0.5), y1: f1(ph), x2: f1(x + 0.5), y2: f1(ph + 4), stroke: "var(--dim)", "stroke-width": 1 });
        el(g, "text", { x: f1(x), y: f1(ly0), "text-anchor": "middle", "font-size": FS, fill: "var(--dim)", "font-variant-numeric": "tabular-nums" }, n1);
        minTickX = Math.min(minTickX, x);
      }
    }
    if (!opt.showColNums && minTickX > 34) el(g, "text", { x: 6, y: f1(ly0), "font-size": FS, fill: "var(--dim)" }, "col");

    // trend lines (Dorsey BSL/BRL): line box at column j = box0 +/- (j - col0), through box centres; square cells => true 45 degrees
    ovs.forEach(function (o) {
      if (o.k !== "trend") return;
      (o.segs || []).forEach(function (sg, si, sa) {
        var act = si === sa.length - 1;
        var up = sg.kind === "BSL", pts = [], jj, ja = Math.max(sg.col0, first), jb = Math.min(sg.col1, nCols - 1), jf = null, jl = null;
        for (jj = ja; jj <= jb; jj++) {
          var lb = sg.box0 + (up ? 1 : -1) * (jj - sg.col0);
          if (lb < bot || lb > top) continue;
          if (jf == null) jf = jj;
          jl = jj;
          pts.push(f1(cx(jj) + c / 2) + "," + f1(cy(lb)));
        }
        if (pts.length < 2) return;
        var clr = up ? "var(--accent)" : "var(--o)";
        el(g, "polyline", { points: pts.join(" "), fill: "none", stroke: clr, "stroke-width": act ? 1.5 : 1, "stroke-opacity": act ? 1 : 0.45, "stroke-dasharray": up ? null : "5 3", "stroke-linecap": "round", "stroke-linejoin": "round" });
        if (!act) return;
        // label beside the line (below support, above resistance), kept inside the plot: clear of the price axis and the left edge
        var lbl = up ? "support" : "resistance", hw = lbl.length * 6.2 * 0.7071 / 2 + 2, off = 8;
        var xmin = Math.max(XO, cx(jf) + c / 2) + hw - off, xmax = Math.min(pw, cx(jl) + c / 2) - hw - off;
        var xm = cx(jf + (jl - jf) * 0.5) + c / 2;
        if (xmax >= xmin) xm = Math.max(xmin, Math.min(xmax, xm)); else xm = Math.min(xm, pw - hw - off);
        function lyAt(x0) { var m0 = (x0 - c / 2 - pw) / c + nCols; return cy(sg.box0 + (up ? 1 : -1) * (m0 - sg.col0)) + (up ? off : -off); }
        if (xmax >= xmin && (lyAt(xm) < hw || lyAt(xm) > ph - hw)) { // keep it inside the plot vertically too: slide along the line
          var bx2 = null;
          for (var xs = xmin; xs <= xmax + 0.01; xs += c / 2) { var yv = lyAt(xs); if (yv >= hw && yv <= ph - hw && (bx2 == null || Math.abs(xs - xm) < Math.abs(bx2 - xm))) bx2 = xs; }
          if (bx2 != null) xm = bx2;
        }
        var lx = xm + off, ly = lyAt(xm);
        el(g, "text", { x: f1(lx), y: f1(ly), transform: "rotate(" + (up ? -45 : 45) + " " + f1(lx) + " " + f1(ly) + ")", "text-anchor": "middle", "dominant-baseline": "central", "font-size": 11, "font-weight": 600, fill: clr }, lbl);
      });
    });

    // boxes
    var gl = Math.min(c, ch), ins = Math.max(Math.min(2.5, gl * 0.3), gl * 0.2); // small cells keep a visible glyph (no negative radius)
    for (j = first; j < nCols; j++) {
      var col = cols[j], isX = col.d === 1, clr = isX ? "var(--x)" : "var(--o)";
      for (var b = col.lo; b <= col.hi; b++) {
        var bx = cx(j), by = ty(b);
        var fresh = opt.newFrom != null && wk[j + ":" + b] != null && wk[j + ":" + b] >= opt.newFrom;
        var gx = bx + (c - gl) / 2, gy = by + (ch - gl) / 2;
        if (fresh) el(g, "rect", { x: f1(bx + 1.5), y: f1(by + 1.5), width: f1(Math.max(0.5, c - 2)), height: f1(Math.max(0.5, ch - 2)), fill: clr, "fill-opacity": 0.22, stroke: clr, "stroke-width": 1 });
        if (isX) {
          el(g, "path", { d: "M" + f1(gx + ins + 1) + " " + f1(gy + ins + 1) + "L" + f1(gx + gl - ins) + " " + f1(gy + gl - ins) + "M" + f1(gx + gl - ins) + " " + f1(gy + ins + 1) + "L" + f1(gx + ins + 1) + " " + f1(gy + gl - ins),
            stroke: clr, "stroke-width": fresh ? 2.2 : 1.8, "stroke-linecap": "round", fill: "none" });
        } else {
          el(g, "circle", { cx: f1(bx + c / 2 + 0.5), cy: f1(by + ch / 2 + 0.5), r: f1(Math.max(0.8, (gl - 2 * ins) / 2)), stroke: clr, "stroke-width": fresh ? 2.2 : 1.8, fill: "none" });
        }
      }
    }

    // overlays
    var edgeN = { 1: 0, "-1": 0 }, placed = [];
    function freeY(y0, dir) { var yy = y0, t = 0; while (t++ < 12 && placed.some(function (p) { return Math.abs(p - yy) < 14; })) yy += dir * 14; placed.push(yy); return yy; }
    var pills = []; // {y, txt, bg, fg, stroke}
    var lineYs = [];
    ovs.forEach(function (o) {
      var eng2 = o.style !== "pick";
      if (o.k === "row" || o.k === "line") {
        var off = o.box > top ? 1 : (o.box < bot ? -1 : 0);
        if (off) { // off-chart marker: text strip outside the plot, no line, no axis pill
          var ac = eng2 ? "var(--text)" : "var(--dim)", k2 = edgeN[off]++;
          var sy = off > 0 ? -STRIP * (nTop - k2) + STRIP / 2 : ph + 26 + STRIP * k2 + STRIP / 2 + 1;
          var tt = (o.label || ("objective " + disp(o.box))) + ", off chart " + (off > 0 ? "\u2191" : "\u2193");
          el(g, "text", { x: f1(pw - 2), y: f1(sy), "text-anchor": "end", "dominant-baseline": "central", "font-size": 11, "font-weight": eng2 ? 700 : 400, fill: ac, "font-style": eng2 ? null : "italic" }, tt);
          return;
        }
        var y = cy(o.box);
        if (o.k === "row") {
          el(g, "rect", { x: 0.5, y: f1(ty(o.box) + 0.5), width: f1(pw - 1), height: f1(Math.max(0.5, ch - 1)), rx: 2, fill: eng2 ? "var(--text)" : "none", "fill-opacity": 0.1,
            stroke: eng2 ? "var(--text)" : "var(--dim)", "stroke-width": eng2 ? 1.6 : 1.3, "stroke-dasharray": eng2 ? null : "1.5 3" });
        } else {
          el(g, "line", eng2 ? { x1: 0, y1: f1(y), x2: f1(pw), y2: f1(y), stroke: "var(--text)", "stroke-width": 1.8, "stroke-dasharray": "6 3.5" }
            : { x1: 0, y1: f1(y), x2: f1(pw), y2: f1(y), stroke: "var(--dim)", "stroke-width": 1.5, "stroke-dasharray": "1.5 4", "stroke-linecap": "round" });
        }
        if (o.label) el(g, "text", { x: f1(pw - 5), y: f1(freeY(eng2 ? y - (o.k === "row" ? ch / 2 + 7 : 10) : y + (o.k === "row" ? ch / 2 + 7 : 10), eng2 ? -1 : 1)), "text-anchor": "end", "dominant-baseline": "central",
          "font-size": eng2 ? 12 : 11, "font-weight": eng2 ? 700 : 400, fill: eng2 ? "var(--text)" : "var(--dim)" }, o.label);
        pills.push({ y: y, box: o.box, txt: disp(o.box), bg: eng2 ? "var(--text)" : "var(--bg)", fg: eng2 ? "var(--bg)" : "var(--dim)", stroke: eng2 ? null : "var(--dim)" });
      } else if (o.k === "col") {
        var cc = cols[o.col]; if (!cc || o.col < first) return;
        var rx = cx(o.col), nb = cc.hi - cc.lo + 1;
        el(g, "rect", { x: f1(rx - 1), y: f1(ty(cc.hi) - 1), width: f1(c + 3), height: f1(nb * ch + 3), rx: 3, fill: "none", stroke: "var(--text)", "stroke-width": 2.2 });
        if (o.label) {
          var anchor = rx > pw * 0.5 ? "end" : "start", lxx = anchor === "end" ? rx - 8 : rx + c + 8;
          var cyy = freeY(cy((cc.lo + cc.hi) / 2), 1), tw = String(o.label).length * 5.8 + 8;
          el(g, "rect", { x: f1(anchor === "end" ? lxx - tw + 3 : lxx - 4), y: f1(cyy - 8), width: f1(tw), height: 16, rx: 3, fill: "var(--bg)", "fill-opacity": 0.85 });
          el(g, "text", { x: f1(lxx), y: f1(cyy), "text-anchor": anchor, "dominant-baseline": "central", "font-size": 11, fill: "var(--text)", "font-variant-numeric": "tabular-nums" }, o.label);
        }
      } else if (o.k === "sig") {
        var sc = cols[o.col]; if (!sc || o.col < first) return;
        var buy = sc.sig >= 0 && sc.d === 1 ? true : (sc.sig < 0 ? false : sc.d === 1);
        var tcl = buy ? "var(--x)" : "var(--o)";
        var tx = cx(o.col) + c / 2 + 1, tyy = buy ? ty(sc.hi) - 7 : ty(sc.lo) + ch + 7;
        el(g, "path", { d: buy ? "M" + f1(tx) + " " + f1(tyy - 5) + "L" + f1(tx + 5) + " " + f1(tyy + 4) + "L" + f1(tx - 5) + " " + f1(tyy + 4) + "Z"
          : "M" + f1(tx) + " " + f1(tyy + 5) + "L" + f1(tx + 5) + " " + f1(tyy - 4) + "L" + f1(tx - 5) + " " + f1(tyy - 4) + "Z", fill: tcl });
        if (o.label) el(g, "text", { x: f1(tx - 9), y: f1(tyy + 0.5), "text-anchor": "end", "dominant-baseline": "central", "font-size": 11, "font-weight": 600, fill: tcl }, o.label);
      } else if (o.k === "exit") {
        if (o.col == null || o.col < first || o.col >= nCols) return;
        var ex = cx(o.col);
        el(g, "rect", { x: f1(ex), y: 0, width: f1(c), height: f1(ph), fill: "var(--text)", "fill-opacity": 0.08 });
        el(g, "line", { x1: f1(ex + c / 2), y1: 0, x2: f1(ex + c / 2), y2: f1(ph), stroke: "var(--text)", "stroke-width": 1.6, "stroke-dasharray": "5 3" });
        var el2 = o.label || "Exit", ew = el2.length * 5.8 + 8, ea = ex + c / 2 > pw * 0.5;
        var exx = ea ? ex + c / 2 - 4 : ex + c / 2 + 4;
        el(g, "rect", { x: f1(ea ? exx - ew + 3 : exx - 4), y: 1, width: f1(ew), height: 15, rx: 3, fill: "var(--bg)", "fill-opacity": 0.85 });
        el(g, "text", { x: f1(exx), y: 8.5, "text-anchor": ea ? "end" : "start", "dominant-baseline": "central", "font-size": 11, "font-weight": 700, fill: "var(--text)" }, el2);
      } else if (o.k === "entry") {
        if (o.box == null || o.box < bot || o.box > top) return;
        var ey = cy(o.box);
        el(g, "line", { x1: 0, y1: f1(ey), x2: f1(pw), y2: f1(ey), stroke: "var(--accent)", "stroke-width": 1.5, "stroke-dasharray": "2 3" });
        el(g, "path", { d: "M0 " + f1(ey - 5) + "L7 " + f1(ey) + "L0 " + f1(ey + 5) + "Z", fill: "var(--accent)" });
        var nl = o.label || "Entry", nw = nl.length * 5.8 + 8;
        el(g, "rect", { x: 9, y: f1(ey - 16), width: f1(nw), height: 15, rx: 3, fill: "var(--bg)", "fill-opacity": 0.85 });
        el(g, "text", { x: 13, y: f1(ey - 8.5), "dominant-baseline": "central", "font-size": 11, "font-weight": 700, fill: "var(--accent)" }, nl);
      } else if (o.k === "close") {
        var yc = cy(o.box);
        el(g, "line", { x1: f1(pw), y1: f1(yc), x2: f1(pw + 4), y2: f1(yc), stroke: "var(--text)", "stroke-width": 1 });
        pills.push({ y: yc, box: o.box, txt: disp(o.box), bg: "var(--text)", fg: "var(--bg)", stroke: null, first: true });
      }
    });
    if (opt.pick != null) {
      var yp = cy(opt.pick);
      el(g, "line", { x1: 0, y1: f1(yp), x2: f1(pw), y2: f1(yp), stroke: "var(--dim)", "stroke-width": 1.5, "stroke-dasharray": "5 3" });
      pills.push({ y: yp, box: opt.pick, txt: disp(opt.pick), bg: "var(--bg)", fg: "var(--text)", stroke: "var(--dim)" });
    }

    // price axis: label every 2 boxes (even box numbers); a pill replaces the label at its own row
    pills.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < pills.length; i++) { // spread apart so no two pills overlap
      var prev = i ? pills[i - 1].py : -1e9;
      pills[i].py = Math.max(pills[i].y, prev + 17.5);
    }
    pills.forEach(function (p) { p.hide = p.box; });
    var pillBoxes = {};
    pills.forEach(function (p) { pillBoxes[p.box] = 1; });
    var stride = compact ? 3 : 2; // never let labels crowd: widen the stride on tiny cells
    while (stride * ch < FS + 3) stride++;
    for (var bb = bot; bb <= top; bb++) {
      if (((bb % stride) + stride) % stride !== 0) continue;
      var yy = cy(bb);
      if (pills.some(function (p) { return Math.abs(p.py - yy) < 13; })) continue; // would be covered: pill already states a price nearby
      el(g, "text", { x: pw + 8, y: f1(yy + 1), "dominant-baseline": "central", "font-size": FS, fill: "var(--dim)", "font-variant-numeric": "tabular-nums" }, disp(bb));
    }
    pills.forEach(function (p) {
      if (Math.abs(p.py - p.y) > 1) el(g, "line", { x1: f1(pw), y1: f1(p.y), x2: f1(pw + 5), y2: f1(p.py), stroke: "var(--dim)", "stroke-width": 1 });
      pill(g, W, p.py, p.txt, p.bg, p.fg, p.stroke);
    });

    // row tap targets (invisible, full width), on top so taps always land
    if (typeof opt.onRow === "function") {
      var tg = el(g, "g", { "data-taprows": "1" });
      for (var tb = bot; tb <= top; tb++) {
        (function (box) {
          var rc = el(tg, "rect", { x: 0, y: f1(ty(box)), width: W, height: f1(ch), fill: "transparent", style: "cursor:pointer", "data-box": box });
          rc.addEventListener("click", function (ev) { opt.onRow(box); });
        })(tb);
      }
    }
    return s;
  }

  /* ---------------------------------------------------------------- panes */
  var WIN = 26;
  function paneBase(host, h, label) {
    var W = hostW(host);
    clear(host);
    var s = el(host, "svg", { width: W, height: h, viewBox: "0 0 " + W + " " + h, role: "img", "aria-label": label });
    return { s: s, W: W, pw: W - AX };
  }
  function lastN(arr, n) { var o = []; for (var i = arr.length - n; i < arr.length; i++) o.push(i >= 0 ? arr[i] : null); return o; }

  function shade(s, pw, h, nFrom, off, xFn, step) {
    // opt.newFrom shading: weeks >= newFrom (absolute) -> window slot k = week - off
    var k = nFrom - off;
    if (k > WIN - 1) return;
    var x0 = Math.max(0, xFn(Math.max(0, k)) - step / 2);
    el(s, "rect", { x: f1(x0), y: 0, width: f1(Math.max(0, pw - x0)), height: h, fill: "var(--text)", "fill-opacity": 0.07 });
    el(s, "line", { x1: f1(x0), y1: 0, x2: f1(x0), y2: h, stroke: "var(--dim)", "stroke-width": 1, "stroke-dasharray": "2 3" });
  }

  function markAt(s, x, ysv, h) {
    el(s, "line", { x1: f1(x), y1: 0, x2: f1(x), y2: h, stroke: "var(--warn)", "stroke-width": 1, "stroke-dasharray": "2 2.5" });
    el(s, "circle", { cx: f1(x), cy: f1(ysv), r: 4, fill: "var(--bg)", stroke: "var(--warn)", "stroke-width": 2 });
    el(s, "path", { d: "M" + f1(x) + " 1.5L" + f1(x + 4) + " 7.5L" + f1(x - 4) + " 7.5Z", fill: "var(--warn)" });
  }

  function drawRsi(host, closes, opt) {
    opt = opt || {};
    var h = 52, pad = 6;
    var P = paneBase(host, h, "RSI 14, last 26 weeks");
    var s = P.s, pw = P.pw, W = P.W;
    var full = (root.CSE && root.CSE.rsi) ? root.CSE.rsi(closes) : [];
    var n = closes.length, off = n - WIN;
    var win = lastN(full, WIN);
    function y(v) { return pad + (76 - v) / 52 * (h - 2 * pad); }
    var step = (pw - 24) / (WIN - 1);
    function x(k) { return 12 + k * step; }
    el(s, "rect", { x: 0, y: f1(y(70)), width: f1(pw), height: f1(y(30) - y(70)), fill: "var(--surface2)", "fill-opacity": 0.55 });
    if (opt.newFrom != null) shade(s, pw, h, opt.newFrom, off, x, step);
    [70, 50, 30].forEach(function (v) {
      el(s, "line", { x1: 0, y1: f1(y(v)), x2: f1(pw), y2: f1(y(v)), stroke: "var(--faint)", "stroke-dasharray": v === 50 ? "1.5 4" : "3 3" });
      el(s, "text", { x: pw + 8, y: f1(y(v) + 1), "dominant-baseline": "central", "font-size": 11, fill: "var(--dim)" }, v);
    });
    var pts = [];
    win.forEach(function (v, k) { if (v != null && !isNaN(v)) pts.push(f1(x(k)) + "," + f1(y(Math.max(20, Math.min(80, v))))); });
    if (pts.length > 1) el(s, "polyline", { points: pts.join(" "), fill: "none", stroke: "var(--text)", "stroke-width": 1.6, "stroke-linejoin": "round" });
    if (opt.mark && opt.mark.t != null) {
      var k = opt.mark.t - off, v = win[k];
      if (k >= 0 && k < WIN && v != null && !isNaN(v)) markAt(s, x(k), y(Math.max(20, Math.min(80, v))), h);
    }
    return s;
  }

  function drawMacd(host, closes, opt) {
    opt = opt || {};
    var h = 58, pad = 6;
    var P = paneBase(host, h, "MACD 12 26 9, last 26 weeks");
    var s = P.s, pw = P.pw;
    var m = (root.CSE && root.CSE.macd) ? root.CSE.macd(closes) : { macd: [], signal: [], hist: [] };
    var n = closes.length, off = n - WIN;
    var M = lastN(m.macd, WIN), S = lastN(m.signal, WIN), Hh = lastN(m.hist, WIN);
    var mx = 1e-9;
    [M, S, Hh].forEach(function (a) { a.forEach(function (v) { if (v != null && !isNaN(v)) mx = Math.max(mx, Math.abs(v)); }); });
    mx *= 1.1;
    function y(v) { return pad + (mx - v) / (2 * mx) * (h - 2 * pad); }
    var step = (pw - 24) / (WIN - 1);
    function x(k) { return 12 + k * step; }
    var bw = Math.max(2, step * 0.55);
    if (opt.newFrom != null) shade(s, pw, h, opt.newFrom, off, x, step);
    el(s, "line", { x1: 0, y1: f1(y(0)), x2: f1(pw), y2: f1(y(0)), stroke: "var(--faint)" });
    el(s, "text", { x: pw + 8, y: f1(y(0) + 1), "dominant-baseline": "central", "font-size": 11, fill: "var(--dim)" }, "0");
    Hh.forEach(function (v, k) {
      if (v == null || isNaN(v)) return;
      var y0 = y(0), y1 = y(v);
      el(s, "rect", { x: f1(x(k) - bw / 2), y: f1(Math.min(y0, y1)), width: f1(bw), height: f1(Math.max(1, Math.abs(y1 - y0))), fill: v >= 0 ? "var(--accent)" : "var(--faint)", "fill-opacity": v >= 0 ? 0.7 : 1 });
    });
    function line(a, st) {
      var pts = [];
      a.forEach(function (v, k) { if (v != null && !isNaN(v)) pts.push(f1(x(k)) + "," + f1(y(v))); });
      if (pts.length > 1) el(s, "polyline", Object.assign({ points: pts.join(" "), fill: "none", "stroke-width": 1.6, "stroke-linejoin": "round" }, st));
    }
    line(S, { stroke: "var(--o)", "stroke-dasharray": "4 2.5" });
    line(M, { stroke: "var(--x)" });
    if (opt.mark && opt.mark.t != null) {
      var k = opt.mark.t - off, v = M[k];
      if (k >= 0 && k < WIN && v != null && !isNaN(v)) markAt(s, x(k), y(v), h);
    }
    return s;
  }

  root.drawPnf = drawPnf; root.drawRsi = drawRsi; root.drawMacd = drawMacd;
})(typeof window !== "undefined" ? window : this);
