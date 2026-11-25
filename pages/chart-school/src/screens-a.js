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

  window.renderRunEnd = function () {
    var run = runOf(), tr = run.trades || [], total = curRun();
    var best = bestOf();
    var isBest = best && num(best.ret) !== null && Math.abs(best.ret - total) < 1e-9;
    var list = tr.length ? tr.map(function (t, i) {
      return '<div class="mk ' + retCls(t.ret) + '"><span class="n num">' + (i + 1) + '. ' + esc(t.code || '---') + '</span>' +
        '<span class="r num"><span>' + esc(t.h || '?') + ' weeks</span><b>' + esc(fmtRet(t.ret) || '--') + '</b></span></div>';
    }).join('') : '<p class="dim" style="margin:0">No trades in this run.</p>';
    $('main').innerHTML = header('Run complete', tr.length + ' trades over ' + (run.charts || 0) + ' charts', {}) +
      '<section class="card next" aria-label="Run result"><div class="cap">Total return</div>' +
      '<div class="big"><span class="code num ' + retCls(total) + '" style="font-size:44px">' + esc(fmtRet(total) || '+0.0%') + '</span>' +
      '<span class="meta num">' + tr.length + ' trade' + (tr.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="list num">' + esc(isBest ? 'New best run' : bestLine()) + '</div></section>' +
      '<section class="card"><div class="cap">Trades</div>' + list + '</section>';
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
