/* screens-a.js (SCR-A): desk, runend, summary, journal, rule card. Plain script, globals only. */
(function () {

  // Wilson band values may arrive as 0..1 or 0..100 (admin default: accept both).
  function pc(v) { v = +v || 0; if (v <= 1) v *= 100; return Math.max(0, Math.min(100, v)); }
  function pr(v) { return Math.round(pc(v)); }

  function boxPrice(b) { return CSE.disp(CSE.priceOf(b)); }

  function nameOf(type) { return (CSE.NAMES && CSE.NAMES[type]) || type; }

  function recRow(r) {
    var n = r.n || 0, k = r.k || 0;
    var lo = pc(r.lo), hi = pc(r.hi), pt = n ? (k / n) * 100 : 0;
    var rt = n
      ? '<b>' + k + '/' + n + '</b> <span class="dim">' + Math.round(pt) + '%</span>'
      : '<b>0/0</b> <span class="dim">none yet</span>';
    var band = n
      ? '<span class="band" style="left:' + lo.toFixed(1) + '%;width:' + Math.max(1, hi - lo).toFixed(1) + '%"></span>' +
        '<span class="pt" style="left:' + pt.toFixed(1) + '%"></span>'
      : '';
    var aria = esc(nameOf(r.key)) + ': ' + k + ' right of ' + n +
      (n ? ', band ' + Math.round(lo) + ' to ' + Math.round(hi) + ' percent' : ', no readings yet') +
      (r.few ? ', too few to tell' : '');
    return '<div class="ar' + (r.few ? ' few' : '') + '">' +
      '<div class="t1"><span class="nm">' + esc(r.name || nameOf(r.key)) + '</span><span class="rt num">' + rt + '</span></div>' +
      '<div class="bd" role="img" aria-label="' + aria + '">' + band + '</div>' +
      '<div class="t2 num"><span>' + (n ? Math.round(lo) + '% to ' + Math.round(hi) + '%' : '&nbsp;') + '</span>' +
      (r.few ? '<span class="tf"><span aria-hidden="true">&#9675;</span> too few to tell</span>' : '') + '</div></div>';
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function fmtRet(v) {
    v = num(v); if (v === null) return '';
    return retTxt(v, 1); /* store: signed, 1 decimal, never -0.0% */
  }
  function retCls(v) { v = num(v); return v === null ? '' : v >= 0 ? 'good' : 'bad'; }
  function runOf() { return (typeof S !== 'undefined' && S && S.run) || { charts: 0, trades: [], skipped: 0, done: false }; }
  function runTrades() { return (typeof T !== 'undefined' && T && T.runTrades) || 10; }
  function runCharts() { return (typeof T !== 'undefined' && T && T.runCharts) || 20; }
  function curRun() { try { return typeof runReturn === 'function' ? (num(runReturn()) || 0) : 0; } catch (e) { return 0; } }
  function bestOf() { return (typeof S !== 'undefined' && S && S.best && num(S.best.ret) !== null) ? S.best : null; }
  function bestLine() {
    var b = bestOf();
    var n = b ? (Array.isArray(b.trades) ? b.trades.length : (+b.trades || 0)) : 0; /* S.best.trades is an int (old shapes tolerated) */
    return b ? 'Best run ' + fmtRet(b.ret) + ' (' + n + ' trade' + (n === 1 ? '' : 's') + ')' : 'Best run: none yet';
  }
  function callText(e) {
    if (!e) return '';
    if (e.call === 'Buy') return 'Buy, ' + (e.h || '?') + ' weeks';
    if (e.call === "Don't buy") return "Don't buy";
    return 'No call';
  }
  function retText(e) { return e && e.call === 'Buy' && num(e.ret) !== null ? fmtRet(e.ret) : 'No trade'; }

  window.renderDesk = function () {
    var rows = '';
    try { rows = record().map(recRow).join(''); } catch (e) {}
    var run = runOf(), nT = (run.trades || []).length, nC = run.charts || 0;
    var open = !!(S.cur && !S.cur.fin);
    var done = !!run.done;
    var started = !done && (open || nC > 0 || nT > 0);
    var tx = done ? 1 : Math.min(nT + 1, runTrades()), cy = done ? 1 : Math.min(nC + 1, runCharts());
    var rr = done ? 0 : curRun();
    var base = '';
    if (T.showBaseNote) {
      var up = Math.round(((META && META.base && META.base.up10) || 0.62) * 100);
      base = '<section class="card base" aria-label="Base rate">' +
        '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--dim)" stroke-width="1.5"/><path d="M11 10v6" stroke="var(--dim)" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="6.8" r="1.1" fill="var(--dim)"/></svg>' +
        '<p>These stocks mostly rose. A price that is higher after 10 weeks happens about <b class="num">' + up + '%</b> of the time with no chart at all.</p></section>';
    }
    $('main').innerHTML = header('Trading desk', 'Your run and your record', { root: true, gear: true }) +
      '<section class="card next" aria-label="Current run"><div class="cap">' + (started ? 'Current run' : 'New run') + '</div>' +
      '<div class="big"><span class="code num">' + (nT && !done ? fmtRet(rr) : '+0.0%') + '</span>' +
      '<span class="meta num">Trade ' + tx + ' of ' + runTrades() + '<br>Chart ' + cy + ' of ' + runCharts() + '<br>' + esc(bestLine()) + '</span></div>' +
      '<div class="list">Read each chart, make your call, pick a horizon of 3 to 10 weeks. The run ends at your ' + runTrades() + 'th Buy.</div></section>' +
      '<section class="card" aria-label="Accuracy record" style="font-size:.92em"><div class="ch"><span class="cap">Accuracy record</span><span class="cap faint">lifetime, right / total</span></div>' + rows + '</section>' +
      base +
      '<p class="dim" style="font-size:12px;margin:4px 2px 8px">This desk trains chart reading. It makes no profit promise.</p>';
    bar([
      { act: 'journal', label: 'Journal', kind: 'out' },
      { act: 'open-sheet', label: started ? 'Continue run' : 'Start run', kind: 'primary' }
    ]);
  };

  function ansText(type, v) {
    if (v === null || v === undefined) return '';
    if (type === 'R2' || type === 'R2b' || type === 'R4') return boxPrice(+v);
    return String(v);
  }

  function lastEntry() { return S.journal && S.journal.length ? S.journal[S.journal.length - 1] : null; }

  window.renderSummary = function () {
    var e = lastEntry();
    var reads = (e && e.reads) || [];
    var det = (S.cur && S.cur.reads) || [];
    var right = 0;
    reads.forEach(function (r) { if (r.ok === true) right++; });
    var rows = reads.map(function (r, i) {
      var d = det[i] && det[i].type === r.type ? det[i] : null;
      var mark = r.skipped ? 'skipped' : (r.ok ? 'Right' : 'Marked');
      var yours = r.skipped ? 'skipped' : (d && d.given !== null && d.given !== undefined ? ansText(r.type, d.given) : '');
      var eng = d ? ansText(r.type, d.answer) : '';
      return '<div class="mk ' + (r.ok ? 'good' : 'bad') + '"><span class="n">' + esc(nameOf(r.type)) + '</span>' +
        '<span class="r">' + (yours || eng ? '<span>You: ' + esc(yours || '-') + '</span>' + (eng ? '<span>Engine reading: ' + esc(eng) + '</span>' : '') : mark) + '</span></div>';
    }).join('');
    var run = runOf();
    $('main').innerHTML = header((e ? e.code + ' · ' : '') + 'Chart summary', 'Readings, your call and the outcome', {}) +
      '<section class="card"><div class="sh"><b>Readings ' + right + ' right of ' + reads.length + '</b><span class="dim num">this chart</span></div>' +
      marks(reads) + rows + '</section>' +
      '<section class="card po num"><div class="sh"><b>' + esc(callText(e)) + '</b><b class="' + (e && e.call === 'Buy' ? retCls(e.ret) : '') + '">' + esc(retText(e)) + '</b></div>' +
      (e && e.call !== 'Buy' && num(e.moved) !== null ? '<div class="dim">Price moved ' + esc(fmtRet(e.moved)) + ' over ' + esc(e.h || '?') + ' weeks (no trade).</div>' : '') + '</section>' +
      '<p class="dim num" style="margin:6px 2px">Trade ' + Math.min((run.trades || []).length + 1, runTrades()) + ' of ' + runTrades() + ' next &middot; run return ' + esc(fmtRet(curRun()) || '+0.0%') + '</p>';
    bar([{ act: 'desk', label: 'Desk', kind: 'out' }, { act: 'open-sheet', label: 'Next chart', kind: 'primary' }]);
  };

  var UP = '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5l5 9H1z" fill="var(--x)"/></svg>';
  var DN = '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.5l5-9H1z" fill="var(--o)"/></svg>';
  function sgn(v) { v = Math.round((num(v) || 0) * 1000); return v > 0 ? 1 : v < 0 ? -1 : 0; }
  /* run return after each trade: step line, one dot per trade, end pill. No zero line (return only, no baseline). */
  function drawEq(host, tr) {
    if (!host || !tr.length) return;
    var NS = 'http://www.w3.org/2000/svg';
    function el(p, t, a, x) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (x != null) e.textContent = x; p.appendChild(e); return e; }
    var cum = [0], eq = 1;
    tr.forEach(function (t) { eq *= 1 + (num(t.ret) || 0); cum.push((eq - 1) * 100); });
    var W = Math.max(200, host.clientWidth || 300), H = 64, tot = cum[cum.length - 1], txt = fmtRet(tot / 100) || '+0.0%';
    var pwid = Math.round(txt.length * 6.2 + 8), pw = W - pwid - 6, pt = 9, pb = 16, n = tr.length;
    var hi = Math.max.apply(null, cum), lo = Math.min.apply(null, cum);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    function y(v) { return pt + (hi - v) / (hi - lo) * (H - pt - pb); }
    function x(i) { return 6 + i * (pw - 12) / Math.max(1, n); }
    var s = el(host, 'svg', { 'class': 'eq', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Run return after each trade, ending ' + txt });
    var d = 'M' + x(0).toFixed(1) + ' ' + y(0).toFixed(1);
    for (var i = 1; i <= n; i++) d += 'H' + x(i).toFixed(1) + 'V' + y(cum[i]).toFixed(1);
    el(s, 'path', { d: d, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
    for (var j = 1; j <= n; j++) el(s, 'circle', { cx: x(j).toFixed(1), cy: y(cum[j]).toFixed(1), r: 2.6, fill: (num(tr[j - 1].ret) || 0) >= 0 ? 'var(--x)' : 'var(--o)' });
    var yt = Math.max(9, Math.min(H - pb - 8, y(tot)));
    el(s, 'rect', { x: W - 2 - pwid, y: (yt - 8.5).toFixed(1), width: pwid, height: 17, rx: 4, fill: 'var(--text)' });
    el(s, 'text', { x: (W - 2 - pwid / 2).toFixed(1), y: (yt + 0.5).toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11, 'font-weight': 700, fill: 'var(--bg)' }, txt);
    el(s, 'text', { x: x(Math.min(1, n)).toFixed(1), y: H - 3, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--dim)' }, 'trade 1');
    if (n > 2) el(s, 'text', { x: x(n).toFixed(1), y: H - 3, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--dim)' }, 'trade ' + n);
  }

  window.renderRunEnd = function () {
    var run = runOf(), tr = run.trades || [], total = curRun();
    var best = bestOf(), sg = sgn(total);
    var isBest = best && num(best.ret) !== null && Math.abs(best.ret - total) < 1e-9 && tr.length > 0;
    var nb = best ? (+best.trades || 0) : 0;
    var mx = 0;
    tr.forEach(function (t) { mx = Math.max(mx, Math.abs(num(t.ret) || 0)); });
    var list = tr.length ? '<div class="th"><span>#</span><span>Code</span><span>Horizon</span><span></span><span>Return</span></div>' + tr.map(function (t, i) {
      var r = num(t.ret) || 0, g = sgn(r), w = mx ? (Math.abs(r) / mx * 48).toFixed(1) : 0;
      return '<div class="tr num"><span class="i">' + (i + 1) + '</span><span class="c">' + esc(t.code || '---') + '</span>' +
        '<span class="h">' + esc(t.h || '?') + ' weeks</span><span class="mb" aria-hidden="true"><span class="' + (r >= 0 ? 'p' : 'm') + '" style="width:' + w + '%"></span></span>' +
        '<b class="ret ' + (g > 0 ? 'up' : g < 0 ? 'down' : '') + '">' + (g > 0 ? UP : g < 0 ? DN : '') + esc(fmtRet(r) || '--') + '</b></div>';
    }).join('') : '<p class="dim" style="margin:0">No trades in this run.</p>';
    var bestRow = '<div class="brow"><span class="dim">' + (isBest ? 'New best run' : 'Best run') + '</span><span class="num">' +
      (best ? '<b>' + esc(fmtRet(best.ret)) + '</b> <span class="dim">&middot; ' + nb + ' trade' + (nb === 1 ? '' : 's') + '</span>' : '<span class="dim">none yet</span>') + '</span></div>';
    $('main').innerHTML = header('Run complete', tr.length + ' trade' + (tr.length === 1 ? '' : 's') + ' · ' + (run.charts || 0) + ' charts seen', {}) +
      '<div class="stack"><section class="card hero" aria-label="Run result"><div class="cap">Total return</div>' +
      '<div class="big"><span class="n num ' + (sg > 0 ? 'up' : sg < 0 ? 'down' : '') + '">' + esc(fmtRet(total) || '+0.0%') + '</span>' +
      '<span class="w"><b class="' + (sg > 0 ? 'up' : sg < 0 ? 'down' : 'dim') + '">' + (sg > 0 ? UP : sg < 0 ? DN : '') + (sg > 0 ? 'gain' : sg < 0 ? 'loss' : 'flat') + '</b>' +
      '<span class="dim num">' + tr.length + ' trade' + (tr.length === 1 ? '' : 's') + '</span></span></div>' +
      '<div id="eq"></div>' + bestRow + '</section>' +
      '<section class="card tl" aria-label="Trades in this run">' + list + '</section></div>';
    drawEq($('eq'), tr);
    bar([{ act: 'journal', label: 'Journal', kind: 'out' }, { act: 'new-run', label: 'New run', kind: 'primary' }]);
  };

  window.renderJournal = function () {
    var list = (S.journal || []).slice().reverse();
    var body = list.length ? list.map(function (e) {
      var right = 0;
      (e.reads || []).forEach(function (r) { if (r.ok === true) right++; });
      return '<section class="card"><div class="sh"><b>' + esc(e.code) + '</b><span class="dim num">' + right + ' right of ' + (e.reads || []).length + '</span></div>' +
        marks(e.reads || []) +
        '<div class="num" style="margin:6px 0 2px"><b>' + esc(callText(e)) + '</b> &middot; <span class="' + (e.call === 'Buy' ? retCls(e.ret) : '') + '">' + esc(retText(e)) + '</span></div></section>';
    }).join('') : '<section class="card"><p style="margin:0">No charts in the journal yet. Finish a chart and it is listed here.</p></section>';
    $('main').innerHTML = header('Journal', 'Newest chart first', {}) + body;
    bar([
      { act: 'copy-report', label: 'Copy report', kind: 'out' },
      { act: 'desk', label: 'Desk', kind: 'primary' }
    ]);
  };

  window.openRule = function (type) {
    var R = (CSE.RULES && CSE.RULES[type]) || { title: nameOf(type), lines: [] };
    $('modalBody').innerHTML = '<div class="cap">Review rule</div><h2 style="margin:4px 0 10px;font-size:18px">' + esc(R.title) + '</h2>' +
      R.lines.map(function (l) { return '<p style="margin:0 0 8px">' + esc(l) + '</p>'; }).join('') +
      '<div style="margin-top:12px"><button class="btn primary" style="width:100%;height:56px" data-act="close-modal">Close</button></div>';
    $('modal').classList.add('on');
  };

  window.ACT = window.ACT || {};
  ACT['open-sheet'] = function () {
    // A finished run starts a fresh one (admin default).
    if (S.run && S.run.done && typeof newRun === 'function') newRun((S.run.seed | 0) + 1);
    openSheet();
  };
  ACT['new-run'] = function () {
    if (typeof newRun === 'function') newRun(((S.run && S.run.seed) | 0) + 1 || T.seed);
    go('desk');
  };
  ACT.journal = function () { go('journal'); };
  ACT.desk = function () { go('desk'); };
  ACT['copy-report'] = function () { copyReport(); };
  ACT.finish = function () { finishSheet(); };
  ACT['close-modal'] = function () { closeModal(); };
  ACT.rule = function () {
    var r = curRead && curRead();
    if (r) openRule(r.type);
  };
})();
