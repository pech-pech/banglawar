/* break-view: innings break. render(el, vm, dispatch). Reads breakVM only. */
import { openSheet } from './sheet.js';
const ovWords = (o) => { const [a, b] = String(o).split('.'); const n = Number(a) || 0, m = Number(b) || 0; return (n === 1 ? '1 over' : n + ' overs') + (m ? ' and ' + (m === 1 ? '1 ball' : m + ' balls') : ''); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ico(name, size) { var i = window.SPR && window.SPR.iconImg ? window.SPR.iconImg(name, size || 24) : null; return i ? i.outerHTML : ''; }
function num(a, keys) { for (var i = 0; i < keys.length; i++) if (a[keys[i]] != null) return a[keys[i]]; return 0; }
function plural(n, w) { return n + ' ' + w + (Number(n) === 1 ? '' : 's'); }
function typeIcon(t) {
  t = String(t || '').toLowerCase();
  return t.indexOf('fast') >= 0 || t === 'f' ? 'typeFast' : t.indexOf('spin') >= 0 || t === 's' ? 'typeSpin' : 'typeMedium';
}

/* "?" button + wiring; glossary-sheet.js is written by another role, so import lazily and fall back to a plain sheet. */
function helpButton(el) {
  var b = el.querySelector('[data-act="help"]');
  if (!b) return;
  b.addEventListener('click', function () {
    import('./glossary-sheet.js').then(function (m) {
      if (m.openGlossary) m.openGlossary('innings'); else throw new Error('no openGlossary');
    }).catch(function () {
      openSheet('Cricket words', '<p>An innings is one team batting. Wickets are batters out. A target is the runs you need to win.</p>');
    });
  });
}

export function render(el, vm, dispatch) {
  var top = vm.top || {}, bat = top.bat || [], bowl = top.bowl || [];
  var batRows = bat.map(function (p) {
    return '<li class="c-row brk-row">' + ico('runs', 24) + '<b class="brk-name">' + esc(p.name) + '</b>' +
      '<span class="brk-stat"><b>' + esc(num(p, ['r', 'runs'])) + '</b> <span class="brk-sub">(' + esc(num(p, ['b', 'balls'])) + ')</span></span></li>';
  }).join('');
  var bowlRows = bowl.map(function (p) {
    return '<li class="c-row brk-row">' + ico(typeIcon(p.bowl || p.type), 24) + '<b class="brk-name">' + esc(p.name) + '</b>' +
      '<span class="brk-stat"><b>' + esc(num(p, ['w', 'wk', 'wickets'])) + '</b> for <b>' + esc(num(p, ['r', 'runs'])) + '</b></span></li>';
  }).join('');
  var need = Number(vm.target);
  el.innerHTML =
    '<div class="screen brk">' +
    '<div class="c-strip strip"><span>Innings break</span><button type="button" class="c-icon-btn help-btn" data-act="help" aria-label="Cricket words (glossary)">?</button></div>' +
    '<div class="c-card c-card--hl brk-hero"><div class="brk-label">They scored</div>' +
    '<div class="brk-score">' + esc(vm.runs) + ' for ' + esc(vm.wk) + '</div>' +
    '<div class="brk-in">in ' + esc(ovWords(vm.overs)) + '</div>' +
    '<div class="brk-need">' + esc(need) + ' to win from 60 balls</div></div>' +
    '<div class="c-card brk-card"><div class="brk-head"><h3>Top batters</h3><span>Runs (balls)</span></div><ul class="c-list list-flat">' + (batRows || '<li class="brk-sub">No batters</li>') + '</ul></div>' +
    '<div class="c-card brk-card"><div class="brk-head"><h3>Top bowlers</h3><span>Wickets for runs</span></div><ul class="c-list list-flat">' + (bowlRows || '<li class="brk-sub">No bowlers</li>') + '</ul></div>' +
    '<div class="cta"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="start">Start chase</button></div>' +
    '</div>';
  el.querySelector('[data-act="start"]').addEventListener('click', function () { dispatch('StartChase', {}); });
  helpButton(el);
}
