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
    return '<li class="c-row row row-compact"><span class="c-row__body"><b class="c-row__title name">' + esc(p.name) + '</b></span>' +
      '<span class="c-row__end">' + ico('runs') + '<b>' + esc(plural(num(p, ['r', 'runs']), 'run')) + '</b><span class="c-row__sub">(' + esc(plural(num(p, ['b', 'balls']), 'ball')) + ')</span></span></li>';
  }).join('');
  var bowlRows = bowl.map(function (p) {
    return '<li class="c-row row row-compact">' + ico(typeIcon(p.bowl || p.type)) +
      '<span class="c-row__body"><b class="c-row__title name">' + esc(p.name) + '</b></span>' +
      '<span class="c-row__end">' + esc(plural(num(p, ['w', 'wk', 'wickets']), 'wicket')) + ' for ' + esc(plural(num(p, ['r', 'runs']), 'run')) + '</span></li>';
  }).join('');
  var need = Number(vm.target);
  el.innerHTML =
    '<div class="screen">' +
    '<div class="c-strip strip"><span>Innings break</span><button type="button" class="c-icon-btn help-btn" data-act="help" aria-label="Cricket words (glossary)">?</button></div>' +
    '<div class="c-card c-card--hl tight"><h2>They scored ' + esc(vm.runs) + ' for ' + esc(plural(vm.wk, 'wicket')) + ' in ' + esc(ovWords(vm.overs)) + '</h2>' +
    '<div class="big-need">You need ' + esc(need) + ' to win</div></div>' +
    '<div class="c-card tight"><h3>Top batters</h3><ul class="c-list list-flat">' + (batRows || '<li class="c-row__sub">No batters</li>') + '</ul></div>' +
    '<div class="c-card tight"><h3>Top bowlers</h3><ul class="c-list list-flat">' + (bowlRows || '<li class="c-row__sub">No bowlers</li>') + '</ul></div>' +
    '<div class="cta"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="start">Start chase</button></div>' +
    '</div>';
  el.querySelector('[data-act="start"]').addEventListener('click', function () { dispatch('StartChase', {}); });
  helpButton(el);
}
