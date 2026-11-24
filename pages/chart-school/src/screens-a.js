/* screens-a.js (SCR-A): desk, summary, journal, rule card. Plain script, globals only. */
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

  function nextCode() {
    // Peek the code only if a sheet is open; otherwise the code is assigned on open (admin default).
    return S.cur && !S.cur.fin && S.cur.code ? S.cur.code : null;
  }

  window.renderDesk = function () {
    var rows = record().map(recRow).join('');
    var open = !!(S.cur && !S.cur.fin);
    var total = T.sheetsPerSession || 2;
    var x = Math.min((S.sess && S.sess.done || 0) + 1, total);
    var code = nextCode();
    var dots = '', nRead = 7;
    try {
      var ni = S.order && S.order.length ? S.order[S.pos % S.order.length] : null;
      var nsh = open && curSheet() ? curSheet() : (ni != null && SHEETS ? SHEETS[ni] : null);
      if (nsh && nsh.ans) nRead = 6 + ((nsh.ans.R1 === 'Double top buy' || nsh.ans.R1 === 'Triple top buy') ? 1 : 0);
    } catch (e) {}
    for (var i = 0; i < nRead; i++) dots += '<span class="dot"></span>';
    var base = '';
    if (T.showBaseNote) {
      var up = Math.round(((META && META.base && META.base.up10) || 0.62) * 100);
      base = '<section class="card base" aria-label="Base rate">' +
        '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--dim)" stroke-width="1.5"/><path d="M11 10v6" stroke="var(--dim)" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="6.8" r="1.1" fill="var(--dim)"/></svg>' +
        '<p>These stocks mostly rose. A bullish call is right about <b class="num">' + up + '%</b> of the time with no chart at all.</p></section>';
    }
    $('main').innerHTML = header('Reading desk', 'Your record and the next sheet', { root: true, gear: true }) +
      '<section class="card" aria-label="Accuracy record"><div class="ch"><span class="cap">Accuracy record</span><span class="cap faint">lifetime, right / total</span></div>' + rows + '</section>' +
      '<section class="card next" aria-label="Next sheet"><div class="cap">' + (open ? 'Open sheet' : 'Next sheet') + '</div>' +
      '<div class="big"><span class="code">' + (code ? esc(code) : '&middot;&middot;&middot;') + '</span>' +
      '<span class="meta num">' + nRead + ' readings<br>then 10 weeks<br>Sheet ' + x + ' of ' + total + '</span></div>' +
      '<div class="steps" aria-hidden="true">' + dots + '<span class="wk">then 10 weeks</span></div>' +
      '<div class="list">Signal, support and resistance, trend line, vertical count, RSI, MACD, divergence. All open, no clock.' +
      (T.paperOrder ? ' Paper order is optional.' : '') + '</div></section>' +
      base +
      '<p class="dim" style="font-size:12px;margin:4px 2px 8px">This desk trains chart reading. It makes no profit promise.</p>';
    bar([
      { act: 'journal', label: 'Journal', kind: 'out' },
      { act: 'open-sheet', label: open ? 'Continue sheet' : 'Open sheet', kind: 'primary' }
    ]);
  };

  function ansText(type, v) {
    if (v === null || v === undefined) return '';
    if (type === 'R2' || type === 'R2b' || type === 'R4') return boxPrice(+v);
    return String(v);
  }

  function lastEntry() { return S.journal && S.journal.length ? S.journal[S.journal.length - 1] : null; }

  function orderLine(e) {
    if (!e || !e.order) return 'No paper order placed.';
    var t = 'Paper order: ' + esc(e.order);
    if (typeof e.orderPct === 'number') {
      t += e.order === 'Buy' ? ' &middot; ' + (e.orderPct >= 0 ? '+' : '') + e.orderPct.toFixed(1) + '%' : ' &middot; stayed out';
    }
    return t;
  }

  window.renderSummary = function () {
    var e = lastEntry();
    var reads = (e && e.reads) || [];
    // Detail (your answer / engine reading) only exists on S.cur while still held; admin default: fall back to type + mark.
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
    var done = sessionDone();
    var total = T.sheetsPerSession || 2;
    $('main').innerHTML = header((e ? e.code + ' · ' : '') + 'Sheet summary', 'Readings and the 10 weeks after', {}) +
      '<section class="card"><div class="sh"><b>Readings ' + right + ' right of ' + reads.length + '</b><span class="dim num">this sheet</span></div>' +
      marks(reads) + rows + '</section>' +
      '<section class="card ev num">' + esc(e && e.evidence ? e.evidence : evidenceLine()) + '</section>' +
      '<section class="card po num">' + orderLine(e) + '</section>' +
      (done ? '<p class="dim" style="margin:6px 2px">Session done (' + total + ' sheets).</p>' : '');
    bar(done
      ? [{ act: 'desk', label: 'Back to desk', kind: 'primary' }]
      : [{ act: 'desk', label: 'Desk', kind: 'out' }, { act: 'open-sheet', label: 'Next sheet', kind: 'primary' }]);
  };

  window.renderJournal = function () {
    var list = (S.journal || []).slice().reverse();
    var body = list.length ? list.map(function (e) {
      var right = 0, n = 0;
      (e.reads || []).forEach(function (r) { if (!r.skipped) n++; if (r.ok === true) right++; });
      return '<section class="card"><div class="sh"><b>' + esc(e.code) + '</b><span class="dim num">' + right + ' right of ' + (e.reads || []).length + '</span></div>' +
        marks(e.reads || []) +
        '<div class="num" style="margin:6px 0 2px">' + orderLine(e) + '</div>' +
        '<div class="dim num" style="font-size:12px">' + esc(e.evidence || '') + '</div></section>';
    }).join('') : '<section class="card"><p style="margin:0">No sheets in the journal yet. Finish a sheet and it is listed here.</p></section>';
    $('main').innerHTML = header('Journal', 'Newest sheet first', {}) + body;
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
    /* FM integration fix: a finished sheet (S.cur.fin) must open the next one; openSheet() continues an open sheet itself.
       admin default: after a finished session, opening a sheet starts the next session count. */
    if ((!S.cur || S.cur.fin) && sessionDone()) S.sess.done = 0;
    openSheet();
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
