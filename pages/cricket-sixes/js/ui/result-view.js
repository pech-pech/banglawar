/* result-view: match end. render(el, vm, dispatch). Reads resultVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, icoDeco } from './dom.js';
import { helpBtn } from './hub-view.js';
const ovWords = (o) => { const [a, b] = String(o).split('.'); const n = Number(a) || 0, m = Number(b) || 0; return (n === 1 ? '1 over' : n + ' overs') + (m ? ' and ' + (m === 1 ? '1 ball' : m + ' balls') : ''); };

function score(label, inn) {
  inn = inn || {};
  return '<li class="res-row"><span class="res-who">' + esc(label) + '</span>' +
    '<b class="res-score">' + esc(inn.runs) + ' for ' + esc(inn.wk) + '</b><span class="res-in">in ' + esc(ovWords(inn.overs)) + '</span></li>';
}

export function render(el, vm, dispatch) {
  var tag = vm.result === 'won' ? 'c-tag c-tag--go' : vm.result === 'lost' ? 'c-tag c-tag--warn' : 'c-tag';
  var head = { won: 'You won', lost: 'You lost', tied: 'Tie' }[vm.result] || String(vm.result || '');
  var kind = vm.kindLabel ? '<p class="res-kind">' + esc(vm.kindLabel + (vm.oppName && vm.oppName !== 'Rival' ? ' vs ' + vm.oppName : '')) + '</p>' : '';
  var semiWin = vm.tpEarned === 0 && vm.result === 'won' && /semi/i.test(vm.kindLabel || '');
  var tp = semiWin ? '<p class="res-tp">' + icoDeco('tp', 20) + '<span>TP paid after the final</span></p>' : typeof vm.tpEarned === 'number' ? '<p class="res-tp">' + icoDeco('tp', 20) + '<b>+' + esc(vm.tpEarned) + ' TP</b> <span>training points earned</span></p>' : '';
  // In a season the result counts: go to the training week. Outside a season: play again, or rematch the same seed (4A).
  var cta = vm.inSeason
    ? ctaBar(btn('Training week', 'FinishMatch', { kind: 'cta' }))
    : ctaBar(btn('Play again', 'NewMatch', { kind: 'cta', arg: { seed: newSeed() } }), vm.seed ? btn('Rematch, same seed', 'NewMatch', { arg: { seed: vm.seed } }) : '');
  el.innerHTML =
    '<div class="screen res' + (vm.inSeason || !vm.seed ? '' : ' res--two') + '">' +
    '<div class="c-strip strip"><span>Match over</span>' + helpBtn('wicket') + '</div>' +
    '<div class="c-card c-card--hl res-hero" role="status"><span class="' + tag + '">' + ({ won: 'Victory', lost: 'Defeat' }[vm.result] || 'Level') + '</span>' +
    '<h1 class="res-line">' + esc(vm.line || head) + '</h1>' + kind + tp + '</div>' +
    '<div class="c-card res-card"><h3>Scores</h3><ul class="c-list list-flat">' + score(vm.oppName || 'Rival', vm.inn1) + score('You', vm.inn2) + '</ul></div>' +
    cta + '</div>';
}

function newSeed() {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return ('00000000' + a[0].toString(16)).slice(-8);
}
