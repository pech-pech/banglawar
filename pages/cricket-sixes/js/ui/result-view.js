/* result-view: match end. render(el, vm, dispatch). Reads resultVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, icoDeco } from './dom.js';
import { helpBtn } from './hub-view.js';
import { winBeat } from './beats.js';

/* QA3 m6: one line per player, his Stars first (★★ Ferrara: 66 runs); screen readers hear "(2 Stars)". */
const starLine = (w) => { const n = Math.max(1, w.n | 0); return '<li><span class="pay-n" aria-hidden="true">' + '★'.repeat(n) + '</span> <b>' + esc(w.name) + '</b>: ' + esc(w.why) + '<span class="ss-sr"> (' + n + (n === 1 ? ' Star' : ' Stars') + ')</span></li>'; };
/* Pay card (SPEC s5): Squad base / Win (hidden on a loss) / Stars / Total. Tap the Stars line to see who earned them. View state only. */
export function payCard(pay) {
  if (!pay) return '';
  const row = (l, v, sub) => '<div class="pay-row"><span>' + esc(l) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><b>' + v + '</b></div>';
  const stars = pay.stars || 0, who = pay.starList || [];
  const starRow = '<button type="button" class="pay-row" data-pay-stars aria-expanded="false" aria-controls="pay-who"><span>' + '<span class="pay-star" aria-hidden="true">★</span> Stars x' + esc(stars) + '<small>Tap to see who</small></span><b>+' + esc(pay.starsTp) + '</b></button>' +
    '<ul class="pay-who" id="pay-who" hidden>' + (who.length ? who.map(starLine).join('') : '<li>No Stars this match.</li>') +
    (pay.starsRaw > stars ? '<li class="pay-cap">' + esc(pay.starsRaw) + ' Stars earned: ' + esc(stars) + ' is the most that pay.</li>' : '') + '</ul>';
  return '<div class="c-card res-card pay" aria-label="Training points earned"><h3>Training points</h3>' +
    (pay.base ? row('Squad base', esc(pay.base)) : '') +
    (pay.win > 0 ? row(pay.winNote === 'a tie' ? 'Tie' : 'Win', '+' + esc(pay.win), pay.winNote && pay.winNote !== 'a tie' ? '(' + pay.winNote + ')' : '') : '') +
    (pay.kind === 'league' || pay.kind == null ? starRow : '') +
    '<div class="pay-row pay-tot" role="status"><span>Total</span><b>' + esc(pay.total) + ' TP</b></div></div>';
}
const ovWords = (o) => { const [a, b] = String(o).split('.'); const n = Number(a) || 0, m = Number(b) || 0; return (n === 1 ? '1 over' : n + ' overs') + (m ? ' and ' + (m === 1 ? '1 ball' : m + ' balls') : ''); };

function score(label, inn, both) {
  inn = inn || {};
  const full = String(inn.overs) === '10' || String(inn.overs) === '10.0'; // QA3 m9: a full 10 overs goes without saying when both sides batted them all
  return '<li class="res-row"><span class="res-who">' + esc(label) + '</span>' +
    '<b class="res-score">' + esc(inn.runs) + ' for ' + esc(inn.wk) + '</b>' + (full && both ? '' : '<span class="res-in">in ' + esc(ovWords(inn.overs)) + '</span>') + '</li>';
}
const fullInn = (inn) => !!inn && (String(inn.overs) === '10' || String(inn.overs) === '10.0');

const fmtN = (n) => String(Math.abs(Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const signed = (n) => (n < 0 ? '-' : '+') + fmtN(n);
/* r9 QA3 M1: Match day money (resultVM.money, the FinishMatch preview): crowd word, then Fans, Gate and Wages tiles with icon + sign + word, then the net line.
   Colour never carries the meaning alone: every value has a sign and the words in / out / new. */
export function moneyCard(m) {
  if (!m) return '';
  const cell = (icon, v, word, aria) => '<li class="rm-cell" aria-label="' + esc(aria) + '">' + icoDeco(icon, 20) + '<b>' + esc(v) + '</b><span>' + esc(word) + '</span></li>';
  const parts = [];
  if (m.winBonus) parts.push('win +' + fmtN(m.winBonus));
  if (m.shop) parts.push('shop +' + fmtN(m.shop));
  if (m.upkeep) parts.push('upkeep -' + fmtN(m.upkeep));
  return '<section class="c-card res-card res-money" aria-label="Match day money">' +
    '<h3><span>Match day money</span>' + (m.crowd ? '<span class="rm-crowd">' + icoDeco('home', 20) + esc(m.crowd.word) + '</span>' : '') + '</h3>' +
    '<ul class="rm-cells">' +
    cell('fan', signed(m.fans), 'Fans new', signed(m.fans) + ' new Fans') +
    cell('coin', signed(m.gate), 'Gate in', 'Gate ' + signed(m.gate) + ' Coins in') +
    cell('team', signed(-m.wages), 'Wages out', 'Wages ' + signed(-m.wages) + ' Coins out') + '</ul>' +
    '<p class="rm-net">' + icoDeco(m.net < 0 ? 'alert' : 'coin', 20) + '<span><b>Net ' + esc(signed(m.net)) + ' Coins</b>' + (parts.length ? ' (' + esc(parts.join(', ')) + ')' : '') + '</span></p>' +
    (m.short ? '<p class="rm-net rm-short" role="status">' + icoDeco('alert', 20) + '<span>Wages short by ' + esc(fmtN(m.short)) + ' Coins: paid from later matches.</span></p>' : '') +
    '</section>';
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
    '<h1 class="res-line">' + esc(vm.line || head) + '</h1>' + kind + (vm.pay ? '' : tp) +
    '<ul class="c-list list-flat res-scores" aria-label="Scores">' + score(vm.oppName || 'Rival', vm.inn1, fullInn(vm.inn1) && fullInn(vm.inn2)) + score('You', vm.inn2, fullInn(vm.inn1) && fullInn(vm.inn2)) + '</ul></div>' + // QA3 m9: the scores sit in the hero, so the money card and the feel question fit above the CTA at 344x780
    payCard(vm.pay) + moneyCard(vm.money) + '<div class="rp-feel-at"></div>' + // the feel question goes just before this anchor (report/feel.js)
    cta + '</div>';
  var sr = el.querySelector('[data-pay-stars]');
  if (sr) sr.addEventListener('click', function () {
    var list = el.querySelector('#pay-who'), open = list.hasAttribute('hidden');
    if (open) list.removeAttribute('hidden'); else list.setAttribute('hidden', '');
    sr.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (vm.result === 'won' && vm.inn2) winBeat(el, vm.money ? { after: '.rp-feel-at' } : undefined); // QA3 M1/m9: with the money card the picture goes under the cards, so money and the feel question stay above the CTA // P10 win beat: picture only, the score shows at once, no result change
}

function newSeed() {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return ('00000000' + a[0].toString(16)).slice(-8);
}
