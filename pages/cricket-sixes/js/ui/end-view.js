/* end-view: season over. render(el, vm, dispatch). Reads endVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, tpChip, ico } from './dom.js';
import { tableHtml, finalsHtml, nameOf, ordinal } from './table-sheet.js';
import { helpBtn } from './hub-view.js';

export function render(el, vm, dispatch) {
  const rows = vm.rows || [];
  const place = Number(vm.myPlace) || 0;
  const champ = nameOf(vm.champion);
  const me = rows.find((r) => r.me);
  const iWon = !!(me && champ != null && champ === me.name);
  const head = iWon ? 'You are the champions!' : champ ? 'Champions: ' + champ : 'Season over';
  el.innerHTML =
    '<div class="screen ss ss-end">' +
    '<div class="c-strip strip"><span>Season over</span>' + helpBtn('season') + '</div>' +
    '<div class="c-card c-card--hl ss-hero" role="status">' + ico(iWon ? 'league' : 'medal', 32) +
    '<h1 class="ss-head' + (iWon ? ' is-champ' : '') + '">' + esc(head) + '</h1>' +
    '<p class="ss-place">You finished <b>' + esc(place ? ordinal(place) : '-') + '</b> of ' + esc(rows.length || 10) + '</p>' +
    '<div class="ss-won-row">' + tpChip(vm.tpWon) + '<span>won this season</span></div></div>' +
    (vm.finals ? '<div class="c-card ss-fin"><h3>Finals</h3>' + finalsHtml(vm.finals) + '</div>' : '') +
    '<div class="ss-final-table">' + tableHtml(rows, { cut: false }) + '</div>' +
    '<p class="ss-note">Top 2 go up once the stadium is built.</p>' +
    ctaBar(btn('Start next season', 'NewSeason', { kind: 'cta' })) +
    '</div>';
}
