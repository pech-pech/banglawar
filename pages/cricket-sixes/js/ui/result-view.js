/* result-view: match end. render(el, vm, dispatch). Reads resultVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, icoDeco } from './dom.js';
import { helpBtn } from './hub-view.js';
import { winBeat } from './beats.js';

/* Pay card (SPEC s5): Squad base / Win (hidden on a loss) / Stars / Total. Tap the Stars line to see who earned them. View state only. */
export function payCard(pay) {
  if (!pay) return '';
  const row = (l, v, sub) => '<div class="pay-row"><span>' + esc(l) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><b>' + v + '</b></div>';
  const stars = pay.stars || 0, who = pay.starList || [];
  const starRow = '<button type="button" class="pay-row" data-pay-stars aria-expanded="false" aria-controls="pay-who"><span>' + icoDeco('medal', 24) + ' Stars x' + esc(stars) + '<small>Tap to see who</small></span><b>+' + esc(pay.starsTp) + '</b></button>' +
    '<ul class="pay-who" id="pay-who" hidden>' + (who.length ? who.map((w) => '<li><b>' + esc(w.name) + '</b>: ' + esc(w.why) + '</li>').join('') : '<li>No Stars this match.</li>') + '</ul>';
  return '<div class="c-card res-card pay" aria-label="Training points earned"><h3>Training points</h3>' +
    (pay.base ? row('Squad base', esc(pay.base)) : '') +
    (pay.win > 0 ? row(pay.winNote === 'a tie' ? 'Tie' : 'Win', '+' + esc(pay.win), pay.winNote && pay.winNote !== 'a tie' ? '(' + pay.winNote + ')' : '') : '') +
    (pay.kind === 'league' || pay.kind == null ? starRow : '') +
    '<div class="pay-row pay-tot" role="status"><span>Total</span><b>' + esc(pay.total) + ' TP</b></div></div>';
}
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
    '<h1 class="res-line">' + esc(vm.line || head) + '</h1>' + kind + (vm.pay ? '' : tp) + '</div>' + payCard(vm.pay) +
    '<div class="c-card res-card"><h3>Scores</h3><ul class="c-list list-flat">' + score(vm.oppName || 'Rival', vm.inn1) + score('You', vm.inn2) + '</ul></div>' +
    cta + '</div>';
  var sr = el.querySelector('[data-pay-stars]');
  if (sr) sr.addEventListener('click', function () {
    var list = el.querySelector('#pay-who'), open = list.hasAttribute('hidden');
    if (open) list.removeAttribute('hidden'); else list.setAttribute('hidden', '');
    sr.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (vm.result === 'won' && vm.inn2) winBeat(el); // P10 win beat: picture only, the score shows at once, no result change
}

function newSeed() {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return ('00000000' + a[0].toString(16)).slice(-8);
}
