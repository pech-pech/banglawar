/* break-view: innings break. render(el, vm, dispatch). Reads breakVM only. */
import { esc, icoDeco, btn, ctaBar } from './dom.js';
import { helpBtn } from './hub-view.js';
const ovWords = (o) => { const [a, b] = String(o).split('.'); const n = Number(a) || 0, m = Number(b) || 0; return (n === 1 ? '1 over' : n + ' overs') + (m ? ' and ' + (m === 1 ? '1 ball' : m + ' balls') : ''); };
function num(a, keys) { for (var i = 0; i < keys.length; i++) if (a[keys[i]] != null) return a[keys[i]]; return 0; }
function plural(n, w) { return n + ' ' + w + (Number(n) === 1 ? '' : 's'); }
function typeIcon(t) {
  t = String(t || '').toLowerCase();
  return t.indexOf('fast') >= 0 || t === 'f' ? 'typeFast' : t.indexOf('spin') >= 0 || t === 's' ? 'typeSpin' : 'typeMedium';
}

export function render(el, vm, dispatch) {
  var top = vm.top || {}, bat = top.bat || [], bowl = top.bowl || [];
  var batRows = bat.map(function (p) {
    return '<li class="c-row brk-row">' + icoDeco('runs', 24) + '<b class="brk-name">' + esc(p.name) + '</b>' +
      '<span class="brk-stat"><b>' + esc(num(p, ['r', 'runs'])) + '</b> <span class="brk-sub">(' + esc(num(p, ['b', 'balls'])) + ')</span></span></li>';
  }).join('');
  var bowlRows = bowl.map(function (p) {
    return '<li class="c-row brk-row">' + icoDeco(typeIcon(p.bowl || p.type), 24) + '<b class="brk-name">' + esc(p.name) + '</b>' +
      '<span class="brk-stat"><b>' + esc(num(p, ['w', 'wk', 'wickets'])) + '</b> for <b>' + esc(num(p, ['r', 'runs'])) + '</b></span></li>';
  }).join('');
  var need = Number(vm.target);
  el.innerHTML =
    '<div class="screen brk">' +
    '<div class="c-strip strip"><span>Innings break</span>' + helpBtn('innings') + '</div>' +
    '<div class="c-card c-card--hl brk-hero"><div class="brk-label">They scored</div>' +
    '<div class="brk-score">' + esc(vm.runs) + ' for ' + esc(vm.wk) + '</div>' +
    '<div class="brk-in">in ' + esc(ovWords(vm.overs)) + '</div>' +
    '<div class="brk-need">' + esc(need) + ' to win from 60 balls</div></div>' +
    '<div class="c-card brk-card"><div class="brk-head"><h3>Top batters</h3><span>Runs (balls)</span></div><ul class="c-list list-flat">' + (batRows || '<li class="brk-sub">No batters</li>') + '</ul></div>' +
    '<div class="c-card brk-card"><div class="brk-head"><h3>Top bowlers</h3><span>Wickets for runs</span></div><ul class="c-list list-flat">' + (bowlRows || '<li class="brk-sub">No bowlers</li>') + '</ul></div>' +
    ctaBar(btn('Start your chase', 'StartChase', { kind: 'cta' })) +
    '</div>';
}
