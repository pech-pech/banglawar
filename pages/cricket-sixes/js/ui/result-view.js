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
  return '<li class="c-row row"><span class="c-row__body"><b class="c-row__title">' + esc(label) + '</b></span>' +
    '<span class="c-row__end"><b>' + esc(inn.runs) + '/' + esc(inn.wk) + '</b>' + ico('overs') + '<span class="c-row__sub">' + esc(inn.overs) + '</span></span></li>';
}

export function render(el, vm, dispatch) {
  var word = { won: 'Won', lost: 'Lost', tied: 'Tied' }[vm.result] || String(vm.result || '');
  var tag = vm.result === 'won' ? 'c-tag c-tag--go' : vm.result === 'lost' ? 'c-tag c-tag--warn' : 'c-tag';
  el.innerHTML =
    '<div class="screen">' +
    '<div class="c-strip strip"><span>Match result</span></div>' +
    '<div class="c-card c-card--hl" role="status"><span class="' + tag + '">' + ({ won: 'Victory', lost: 'Defeat' }[vm.result] || 'Level') + '</span>' +
    '<h1>' + esc(word) + '</h1><div>' + esc(vm.line) + '</div></div>' +
    '<div class="c-card"><div class="c-strip strip">Scores</div><ul class="c-list" style="list-style:none;margin:0;padding:0">' + score('Innings 1', vm.inn1) + score('Innings 2', vm.inn2) + '</ul></div>' +
    '<div class="cta"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="again">Play again</button></div>' +
    '</div>';
  el.querySelector('[data-act="again"]').addEventListener('click', function () { dispatch('NewMatch', { seed: newSeed() }); });
}
