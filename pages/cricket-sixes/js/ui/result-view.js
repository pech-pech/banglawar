/* result-view: match end. render(el, vm, dispatch). Reads resultVM only. */
import { openSheet } from './sheet.js';
const ovWords = (o) => { const [a, b] = String(o).split('.'); const n = Number(a) || 0, m = Number(b) || 0; return (n === 1 ? '1 over' : n + ' overs') + (m ? ' and ' + (m === 1 ? '1 ball' : m + ' balls') : ''); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ico(name, size) { var i = window.SPR && window.SPR.iconImg ? window.SPR.iconImg(name, size || 24) : null; return i ? i.outerHTML : ''; }

function newSeed() {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return ('00000000' + a[0].toString(16)).slice(-8);
}

function score(label, inn) {
  inn = inn || {};
  return '<li class="c-row row row-compact"><span class="c-row__body"><b class="c-row__title">' + esc(label) + '</b></span>' +
    '<span class="c-row__end"><b>' + esc(inn.runs) + ' for ' + esc(inn.wk) + '</b><span class="c-row__sub">in ' + esc(ovWords(inn.overs)) + '</span></span></li>';
}

function helpButton(el) {
  var b = el.querySelector('[data-act="help"]');
  if (!b) return;
  b.addEventListener('click', function () {
    import('./glossary-sheet.js').then(function (m) {
      if (m.openGlossary) m.openGlossary('wickets'); else throw new Error('no openGlossary');
    }).catch(function () {
      openSheet('Cricket words', '<p>You win by wickets when you pass the target with batters still in. You lose by runs when you finish short.</p>');
    });
  });
}

export function render(el, vm, dispatch) {
  var tag = vm.result === 'won' ? 'c-tag c-tag--go' : vm.result === 'lost' ? 'c-tag c-tag--warn' : 'c-tag';
  var head = { won: 'You won', lost: 'You lost', tied: 'Tie' }[vm.result] || String(vm.result || '');
  el.innerHTML =
    '<div class="screen">' +
    '<div class="c-strip strip"><span>Match over</span><button type="button" class="c-icon-btn help-btn" data-act="help" aria-label="Cricket words (glossary)">?</button></div>' +
    '<div class="c-card c-card--hl tight" role="status"><span class="' + tag + '">' + ({ won: 'Victory', lost: 'Defeat' }[vm.result] || 'Level') + '</span>' +
    '<h1 class="big-need">' + esc(vm.line || head) + '</h1></div>' +
    '<div class="c-card tight"><h3>Scores (runs for wickets lost)</h3><ul class="c-list list-flat">' + score('Rival innings', vm.inn1) + score('Your innings', vm.inn2) + '</ul></div>' +
    '<div class="cta"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="again">Play again</button></div>' +
    '</div>';
  el.querySelector('[data-act="again"]').addEventListener('click', function () { dispatch('NewMatch', { seed: newSeed() }); });
  helpButton(el);
}
