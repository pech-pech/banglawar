/* runend-view: Hall of Fame at the end of a run. render(el, vm, dispatch). Reads runEndVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, icoDeco } from './dom.js';
import { letterOfShown } from '../core/letters.js';

const plural = (n, one, many) => n + ' ' + (Number(n) === 1 ? one : many);
const VALUE = {
  titles: (v) => plural(v, 'league title', 'league titles'),
  league: (v) => 'Reached League ' + v,
  best_player: (v) => 'Best player: ability ' + letterOfShown(Number(v)),
  finals: (v) => plural(v, 'final played', 'finals played'),
  sgrads: (v) => plural(v, 'graduate', 'graduates'),
};
function valueWords(r) { return VALUE[r.key] ? VALUE[r.key](r.value) : r.label + ': ' + r.value; }

function rowHtml(r) {
  const pend = !!r.pending;
  return '<li class="rn-row' + (pend ? ' is-pending' : '') + '">' +
    '<span class="rn-row__lab"><b>' + esc(r.label) + '</b>' +
    '<small>' + (pend ? icoDeco('lock', 16) + 'Coming in a later update' : esc(valueWords(r))) + '</small></span>' +
    '<span class="rn-row__pts"><b>' + esc(pend ? 0 : r.points) + ' pts</b><small>of ' + esc(r.maxPoints) + '</small></span></li>';
}

/* Three states, each with an icon and words: feat won, chapter reached but feat missed, not reached. */
function chapterRow(c) {
  const reached = c.reached == null ? !!c.done : !!c.reached;
  const [icon, word, cls] = c.done ? ['done', 'Done, feat won', ' is-done'] : reached ? ['pennant', 'Reached, feat missed', ' is-reached'] : ['lock', 'Not reached', ' is-pending'];
  return '<li class="rn-li' + cls + '">' + icoDeco(icon, 20) + '<span>' + esc(c.name) + '<small>' + word + '</small></span></li>';
}

function legend(c) {
  const m = c.key === 'legend' && /^(.+) at (\d+)% \(ability (\d+)\)$/.exec(c.detail || '');
  return m ? m[1] + ' comes back at ' + m[2] + '% of his best (ability ' + letterOfShown(Number(m[3])) + ')' : (c.detail || '');
}

function carryRow(c) {
  const ok = !!c.available;
  return '<li class="rn-li' + (ok ? ' is-done' : ' is-pending') + '">' + icoDeco(ok ? 'done' : 'lock', 20) +
    '<span>' + esc(c.label) + '<small>' + esc(c.key === 'stadium' && !ok ? 'Not built yet' : legend(c)) + '</small></span></li>';
}

export function render(el, vm, dispatch) {
  const rows = vm.rows || [];
  const ch = vm.chapters || [];
  const carry = vm.carry || [];
  el.innerHTML =
    '<div class="screen ss ss-runend">' +
    '<div class="c-strip strip"><span>Hall of Fame</span></div>' +
    '<div class="c-card c-card--hl rn-hero" role="status">' + icoDeco('medal', 32) +
    '<div><span class="rn-tag">Your run score</span><b class="rn-big">' + esc(vm.score) + '</b><small> of ' + esc(vm.max) + '</small>' +
    '<p class="rn-sub">' + esc(vm.seasons) + ' seasons · Best league ' + esc(vm.bestLeague) + ' · ' + esc(vm.titles) + (Number(vm.titles) === 1 ? ' title' : ' titles') + '</p></div></div>' +
    '<ul class="rn-rows" aria-label="Score">' + rows.map(rowHtml).join('') + '</ul>' +
    (ch.length ? '<h2 class="ss-h">Chapters</h2><ul class="rn-list">' + ch.map(chapterRow).join('') + '</ul>' : '') +
    (carry.length ? '<h2 class="ss-h">Carries to your next run</h2><ul class="rn-list">' + carry.map(carryRow).join('') + '</ul>' : '') +
    ctaBar(btn('Start a new run', vm.cta || 'NewRun', { kind: 'cta' })) +
    '</div>';
}
