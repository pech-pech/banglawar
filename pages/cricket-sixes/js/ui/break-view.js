/* break-view: innings break. render(el, vm, dispatch). Reads breakVM only. */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ico(name, size) { var i = window.SPR && window.SPR.iconImg ? window.SPR.iconImg(name, size || 24) : null; return i ? i.outerHTML : ''; }
function num(a, keys) { for (var i = 0; i < keys.length; i++) if (a[keys[i]] != null) return a[keys[i]]; return 0; }
function typeIcon(t) {
  t = String(t || '').toLowerCase();
  return t.indexOf('fast') >= 0 || t === 'f' ? 'typeFast' : t.indexOf('spin') >= 0 || t === 's' ? 'typeSpin' : 'typeMedium';
}

export function render(el, vm, dispatch) {
  var top = vm.top || {}, bat = top.bat || [], bowl = top.bowl || [];
  var batRows = bat.map(function (p) {
    return '<li class="c-row row"><span class="c-row__body"><b class="c-row__title name">' + esc(p.name) + '</b></span>' +
      '<span class="c-row__end">' + ico('runs') + '<b>' + esc(num(p, ['r', 'runs'])) + '</b><span class="c-row__sub">(' + esc(num(p, ['b', 'balls'])) + ')</span></span></li>';
  }).join('');
  var bowlRows = bowl.map(function (p) {
    return '<li class="c-row row">' + ico(typeIcon(p.bowl || p.type)) +
      '<span class="c-row__body"><b class="c-row__title name">' + esc(p.name) + '</b></span>' +
      '<span class="c-row__end">' + ico('wicket') + '<b>' + esc(num(p, ['w', 'wk', 'wickets'])) + '-' + esc(num(p, ['r', 'runs'])) + '</b></span></li>';
  }).join('');
  el.innerHTML =
    '<div class="screen">' +
    '<div class="c-strip strip"><span>Innings break</span><span class="c-strip__right"><span class="c-tag">Rival innings done</span></span></div>' +
    '<div class="c-card"><h2>Rival innings</h2>' +
    '<h1>' + esc(vm.runs) + '/' + esc(vm.wk) + '</h1>' +
    '<div class="c-row__sub" style="display:flex;align-items:center;gap:6px">' + ico('overs') + esc(vm.overs) + ' overs</div></div>' +
    '<div class="c-card c-card--hl"><h2>Target ' + esc(vm.target) + '</h2><div class="c-row__sub">Beat it to win</div></div>' +
    '<div class="c-card"><div class="c-strip strip">Top batters</div><ul class="c-list" style="list-style:none;margin:0;padding:0">' + (batRows || '<li class="c-row__sub">No batters</li>') + '</ul></div>' +
    '<div class="c-card"><div class="c-strip strip">Top bowlers</div><ul class="c-list" style="list-style:none;margin:0;padding:0">' + (bowlRows || '<li class="c-row__sub">No bowlers</li>') + '</ul></div>' +
    '<div class="cta"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="start">Start chase</button></div>' +
    '</div>';
  el.querySelector('[data-act="start"]').addEventListener('click', function () { dispatch('StartChase', {}); });
}
