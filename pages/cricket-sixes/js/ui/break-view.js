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
    return '<div class="row" style="min-height:56px;display:flex;align-items:center;gap:8px;min-width:0">' +
      '<b class="name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</b>' +
      '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">' + ico('runs') + esc(num(p, ['r', 'runs'])) + '<span class="muted">(' + esc(num(p, ['b', 'balls'])) + ')</span></span></div>';
  }).join('');
  var bowlRows = bowl.map(function (p) {
    return '<div class="row" style="min-height:56px;display:flex;align-items:center;gap:8px;min-width:0">' +
      ico(typeIcon(p.bowl || p.type)) +
      '<b class="name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</b>' +
      '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">' + ico('wicket') + esc(num(p, ['w', 'wk', 'wickets'])) + '-' + esc(num(p, ['r', 'runs'])) + '</span></div>';
  }).join('');
  el.innerHTML =
    '<div class="screen" style="display:flex;flex-direction:column;min-height:100%;max-width:100%;overflow-x:hidden">' +
    '<div class="strip">Innings break</div>' +
    '<div style="flex:1;min-width:0;padding:12px;display:flex;flex-direction:column;gap:12px">' +
    '<div class="card"><div class="muted">Rival innings</div>' +
    '<div style="font-size:32px;line-height:36px;font-weight:700">' + esc(vm.runs) + '/' + esc(vm.wk) + '</div>' +
    '<div class="muted" style="display:flex;align-items:center;gap:6px">' + ico('overs') + esc(vm.overs) + ' overs</div></div>' +
    '<div class="card"><div style="font-size:24px;font-weight:700">Target ' + esc(vm.target) + '</div></div>' +
    '<div class="two-col" style="min-width:0">' +
    '<div class="card" style="min-width:0"><div class="strip">Top batters</div>' + (batRows || '<div class="muted">No batters</div>') + '</div>' +
    '<div class="card" style="min-width:0"><div class="strip">Top bowlers</div>' + (bowlRows || '<div class="muted">No bowlers</div>') + '</div>' +
    '</div></div>' +
    '<div style="position:sticky;bottom:0;padding:12px"><button type="button" class="cta" data-act="start" style="width:100%;min-height:56px">Start chase</button></div>' +
    '</div>';
  el.querySelector('[data-act="start"]').addEventListener('click', function () { dispatch('StartChase', {}); });
}
