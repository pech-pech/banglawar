/* hub-view: the season home. render(el, vm, dispatch). Reads hubVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, ctaBar, tpChip, ico } from './dom.js';
import { tableHtml, keyHtml } from './table-sheet.js';

const STRENGTH = { Weaker: ['▼', 'Weaker side'], Even: ['●', 'Even match'], Stronger: ['▲', 'Stronger side'] };

export function helpBtn(id, label) {
  return '<button type="button" class="c-icon-btn help-btn" data-act="sheet:glossary"' + (id ? ' data-arg="' + esc(JSON.stringify(id)) + '"' : '') +
    ' aria-label="' + esc(label || 'Cricket words (glossary)') + '">?</button>';
}

function path(phase) {
  const p = String(phase || '').toLowerCase();
  const at = p.indexOf('final') >= 0 && p.indexOf('semi') < 0 ? 2 : p.indexOf('semi') >= 0 ? 1 : 0;
  const st = (i, cls, b, s) => '<div class="ss-st ss-st--' + cls + (i === at ? ' is-now' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '><b>' + b + '</b><span>' + s + '</span></div>';
  return '<div class="ss-path" aria-label="Season path">' + st(0, 'l', '9 matches', '2 points a win') + '<span class="ss-ar" aria-hidden="true">▶</span>' +
    st(1, 's', 'Semi-finals', 'Top 4 play') + '<span class="ss-ar" aria-hidden="true">▶</span>' + st(2, 'f', 'Final', 'Two winners play') + '</div>';
}

export function render(el, vm, dispatch) {
  const season = vm.season && typeof vm.season === 'object' ? vm.season : { n: vm.season, league: 1 };
  const next = vm.next || {};
  const str = STRENGTH[next.oppStrength] || STRENGTH.Even;
  const cta = typeof vm.cta === 'string' ? { label: vm.cta } : (vm.cta || {});
  const label = cta.label || 'Pick your six';
  const rows = vm.table5 || [];
  el.innerHTML =
    '<div class="screen ss ss-hub">' +
    '<div class="c-strip strip"><span class="ss-strip"><b>League ' + esc(season.league || 1) + '</b><small>Season ' + esc(season.n || 1) + ' · ' + esc(vm.phaseWord || 'League') + '</small></span>' + helpBtn('league-table') + '</div>' +
    '<section class="ss-fx" aria-label="Next match">' +
    '<div class="ss-wk">Week<b>' + esc(vm.round) + '</b></div>' +
    '<div class="ss-vs"><b class="name">Next: ' + esc(next.oppName) + '</b><span>' + esc(next.kindWord) + '</span><span class="ss-str">' + str[0] + ' ' + str[1] + '</span></div>' +
    '<div class="ss-hm">' + ico('home', 20) + 'Home</div></section>' +
    '<section class="ss-mini" aria-label="League table around you">' + tableHtml(rows) + keyHtml({ tp: true }) + '</section>' +
    '<div class="ss-row2">' + btn('Table', 'sheet:table') + '<button type="button" class="c-btn ss-save" data-act="sheet:save">' + ico('settings', 20) + 'Save</button>' + tpChip(vm.tp) + '</div>' +
    path(vm.phaseWord) +
    ctaBar(btn(label, cta.act || 'OpenSquad', { kind: 'cta', disabled: cta.disabled, reason: cta.reason })) +
    '</div>';
}
