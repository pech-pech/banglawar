/* end-view: season over. render(el, vm, dispatch). Reads endVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, tpChip, icoDeco } from './dom.js';
import { tableHtml, finalsHtml, nameOf, ordinal } from './table-sheet.js';
import { helpBtn } from './hub-view.js';
import { chipHtml } from './book-sheet.js';
import { promoBeat } from './beats.js';
import { swapCardHtml, bindSwap } from './swap-offer.js';

let swapNote = null; // {key, text}: "Swapped N Spokes for M Coins." for the season it was done in

const CTA = { NewSeason: 'Start next season', RunEnd: 'See your run' };

/* "Stay" icon: two level bars (no sprite for it yet). */
const STAY = '<svg class="rn-stay" width="32" height="32" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="1" y="3" width="10" height="2.5" fill="currentColor"/><rect x="1" y="7" width="10" height="2.5" fill="currentColor"/></svg>';

/* Result card: icon AND words say promoted or stayed (never colour alone). Last season: the run ends here, so no talk of going up. */
function resultHtml(r, last) {
  if (!r || !r.line) return '';
  const up = !!r.promoted && !last;
  const word = last ? 'Final season' : up ? 'Promoted' : 'Stayed in the league';
  const line = last ? 'Final season. Finished ' + ordinal(Number(r.place) || 0) + '.' : r.line;
  return '<div class="c-card c-card--hl rn-result ' + (up ? 'is-up' : 'is-stay') + '" role="status">' + (last ? icoDeco('medal', 32) : up ? icoDeco('upgrade', 32) : STAY) +
    '<div class="rn-result__body"><span class="rn-tag">' + esc(word) + '</span><p class="rn-line">' + esc(line) + '</p></div></div>';
}

function chapterHtml(c, last) {
  if (!c) return '';
  const f = c.feat;
  return '<div class="c-card rn-chapter">' + icoDeco('pennant', 32) +
    '<div class="rn-chapter__body"><span class="rn-tag">Chapter done</span><b class="rn-name">' + esc(c.name) + '</b>' +
    (c.reward ? '<span class="rn-reward">' + icoDeco('tp', 16) + 'Reward: ' + esc(String(c.reward).replace(/^TP\s*(\d+)/, '$1 TP')) + '</span>' : '') +
    (f ? '<span class="rn-feat' + (f.done ? ' is-done' : '') + '">' + icoDeco(f.done ? 'done' : 'info', 16) + esc((f.done ? 'Feat done: ' : last ? 'Feat missed: ' : 'Feat still open: ') + f.text) + '</span>' : '') +
    '</div></div>';
}

/* "Go up" marker under the last promoted row (vm.promoteTop, default 2). */
function withGoUp(html, top) {
  let n = 0, at = -1;
  const i0 = html.indexOf('<tbody>');
  for (let i = html.indexOf('</tr>', i0); i >= 0 && n < top; i = html.indexOf('</tr>', i + 5)) { n++; at = i + 5; }
  if (at < 0 || n < top) return html;
  return html.slice(0, at) + '<tr class="rn-go"><td colspan="6">' + icoDeco('upgrade', 16) + ' Above this line go up</td></tr>' + html.slice(at);
}

/* Coach's notebook (P4): from season 2 one pairing is found free at season end. Own look (book icon, dashed edge), the grade as the Book's chip, a button to the Book. */
function notebookHtml(n) {
  if (!n) return '';
  const chip = chipHtml({ found: true, rank: n.rank, grade: n.grade, combo: n.combo ? n.combo.name : null, phase: ['Early', 'Middle', 'Late'][n.ph] }, n.bat + ' v ' + n.bowl, true);
  return '<section class="bk-nb" aria-label="Coach\'s notebook">' + icoDeco('book', 32) + '<span class="bk-nb__t">Coach\'s notebook</span>' +
    '<span class="bk-nb__row">' + esc(n.name) + chip + '</span>' +
    '<p class="bk-nb__sub">Found for free. Grade is the batter\'s view.' + (n.combo ? ' Combo: ' + esc(n.combo.name) + '.' : '') + '</p>' +
    '<button type="button" class="c-btn" data-act="sheet:book">' + icoDeco('book', 24) + 'See Pairing Book</button></section>';
}

const swapKey = (vm) => 'r' + vm.runNo + 's' + vm.season;
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
    resultHtml(vm.result, vm.lastSeason) + chapterHtml(vm.chapter, vm.lastSeason) +
    '<div class="c-card c-card--hl ss-hero" role="status">' + icoDeco(iWon ? 'league' : 'medal', 32) +
    '<h1 class="ss-head' + (iWon ? ' is-champ' : '') + '">' + esc(head) + '</h1>' +
    '<p class="ss-place">You finished <b>' + esc(place ? ordinal(place) : '-') + '</b> of ' + esc(rows.length || 10) + '</p>' +
    '<div class="ss-won-row">' + tpChip(vm.tpWon) + '<span>training points won this season</span></div></div>' +
    notebookHtml(vm.notebook) + swapCardHtml(vm.swap, swapNote && swapNote.key === swapKey(vm) ? swapNote.text : '') +
    (vm.finals ? '<div class="c-card ss-fin"><h3>Finals</h3>' + finalsHtml(vm.finals) + '</div>' : '') +
    '<div class="ss-final-table">' + (vm.lastSeason ? tableHtml(rows, { cut: false }) : withGoUp(tableHtml(rows, { cut: false }), Number(vm.promoteTop) || 2)) + '</div>' +
    ctaBar(btn(CTA[vm.cta] || CTA.NewSeason, CTA[vm.cta] ? vm.cta : 'NewSeason', { kind: 'cta' })) +
    '</div>';
  bindSwap(el, vm.swap, dispatch, { auto: true, key: swapKey(vm), onDone: (text) => { swapNote = { key: swapKey(vm), text }; } }); // Spare Spokes: the same confirm as the Workshop, offered once here
  if (vm.result && vm.result.promoted && !vm.lastSeason) promoBeat(el, { after: '.rn-result' }); // P10 promotion beat: transient trophy picture, the card below is the stamp
}
