/* result-view: match end. render(el, vm, dispatch). Reads resultVM only. */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ico(name, size) { var i = window.SPR && window.SPR.iconImg ? window.SPR.iconImg(name, size || 24) : null; return i ? i.outerHTML : ''; }

function newSeed() {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return ('00000000' + a[0].toString(16)).slice(-8);
}

function score(label, inn) {
  inn = inn || {};
  return '<div class="row" style="min-height:56px;display:flex;align-items:center;gap:8px;min-width:0">' +
    '<span class="muted" style="flex:1;min-width:0">' + esc(label) + '</span>' +
    '<b style="font-size:24px;white-space:nowrap">' + esc(inn.runs) + '/' + esc(inn.wk) + '</b>' +
    '<span class="muted" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">' + ico('overs') + esc(inn.overs) + '</span></div>';
}

export function render(el, vm, dispatch) {
  var word = { won: 'Won', lost: 'Lost', tied: 'Tied' }[vm.result] || String(vm.result || '');
  el.innerHTML =
    '<div class="screen" style="display:flex;flex-direction:column;min-height:100%;max-width:100%;overflow-x:hidden">' +
    '<div class="strip">Match result</div>' +
    '<div style="flex:1;min-width:0;padding:12px;display:flex;flex-direction:column;gap:12px">' +
    '<div class="card" role="status"><div style="font-size:32px;line-height:36px;font-weight:700">' + esc(word) + '</div>' +
    '<div>' + esc(vm.line) + '</div></div>' +
    '<div class="card"><div class="strip">Scores</div>' + score('Innings 1', vm.inn1) + score('Innings 2', vm.inn2) + '</div>' +
    '</div>' +
    '<div style="position:sticky;bottom:0;padding:12px"><button type="button" class="cta" data-act="again" style="width:100%;min-height:56px">Play again</button></div>' +
    '</div>';
  el.querySelector('[data-act="again"]').addEventListener('click', function () { dispatch('NewMatch', { seed: newSeed() }); });
}
