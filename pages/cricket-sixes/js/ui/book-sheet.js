/* book-sheet: the Pairing Book (P4), a bottom sheet. open(vm, dispatch, open, arg, refresh). Reads bookVM only.
   3 batter groups x 3 bowler rows x 3 phase chips. Found = grade word (never a number); not found = "?" and n/18 pips.
   Tabs: Pairings / Combos. The Phases card is the key. Words and icons, never colour alone. */
import { esc, ico } from './dom.js';
import { openSheet } from './sheet.js';

const BOWLS = ['Fast', 'Medium', 'Spin'];

const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const PH_ICONS = [['roleOpener', 'typeFast'], ['roleMiddle', 'typeSpin'], ['roleLower', 'typeMedium']];
const PH_NOTE = ['New ball: openers and pace.', 'Middle overs: spin and set batters.', 'Last overs: big hitters and slower balls.'];

/** One phase chip. Found: grade word, medal icon if it is a combo. Not found: "?" and n/18 with a bar. */
export function chipHtml(c, who, noMedal) {
  const lab = who + ', ' + c.phase.toLowerCase();
  if (!c.found) {
    return '<span class="bk-c bk-c--q" role="img" aria-label="' + esc(lab + ': not found, ' + c.balls + ' of ' + c.of + ' balls') + '"><span class="bk-q"><b>?</b><span>' + c.balls + '/' + c.of + '</span></span>' +
      '<span class="bk-bar" aria-hidden="true"><i style="width:' + (c.balls / c.of * 100).toFixed(1) + '%"></i></span></span>';
  }
  return '<span class="bk-c bk-g' + c.rank + '" role="img" aria-label="' + esc(lab + ': ' + c.grade + (c.combo ? ', combo ' + c.combo : '')) + '"><span class="bk-w">' + (c.combo && !noMedal ? ico('medal', 16) : '') + esc(c.grade) + '</span></span>';
}

export function bookHtml(vm, tab) {
  const head = '<div class="bk-head"><span class="c-tag">' + ico('done', 20) + 'Found ' + vm.found + ' of ' + vm.total + '</span><span class="c-tag">' + ico('medal', 20) + 'Combos ' + vm.comboFound + ' of ' + vm.comboTotal + '</span></div>';
  const use = '<p class="bk-note bk-use">Pick your bowler over by over to use what you\'ve found.</p>';
  const seg = '<div class="c-seg bk-seg" role="group" aria-label="Show">' +
    '<button type="button" class="c-seg__opt' + (tab === 'book' ? ' is-selected' : '') + '" data-tab="book" aria-pressed="' + (tab === 'book') + '">Pairings</button>' +
    '<button type="button" class="c-seg__opt' + (tab === 'combos' ? ' is-selected' : '') + '" data-tab="combos" aria-pressed="' + (tab === 'combos') + '">Combos</button></div>';
  if (tab === 'combos') {
    const rows = vm.combos.map((c) => c.found
      ? '<div class="bk-cb bk-cb--f">' + ico('medal', 24) + '<b>' + esc(c.name) + '</b>' +
        '<span class="c-tag bk-side">' + ico(c.helps === 'batter' ? 'batPower' : 'bowlSpeed', 20) + (c.helps === 'batter' ? 'Helps batter' : 'Helps bowler') + '</span><span class="bk-ln bk-where">' + ico(ROLE_ICON[c.bat], 20) + ico(TYPE_ICON[c.bowl], 20) + esc(c.bat + ' v ' + c.bowl + ', ' + c.phase.toLowerCase()) + '</span></div>'
      : '<div class="bk-cb bk-cb--q">' + ico('lock', 24) + '<span><b>' + esc(c.name) + '</b><span class="bk-ln">Not found yet</span></span><span class="bk-c bk-c--q bk-mini" role="img" aria-label="Who it helps: hidden"><b>?</b></span></div>').join('');
    const keys = vm.phases.map((p, k) => '<div class="bk-key"><b>' + esc(p.name) + '<small>Overs ' + esc(p.overs) + '</small></b><span class="bk-ln">' + PH_ICONS[k].map((n) => ico(n, 20)).join('') + '</span><span>' + PH_NOTE[k] + '</span></div>').join('');
    return head + use + seg + '<section class="c-card bk-card" aria-label="Combos"><div class="c-strip">' + ico('medal', 24) + 'Named pairings<span class="c-strip__right">' + vm.comboFound + ' of ' + vm.comboTotal + '</span></div>' + rows + '</section>' +
      '<section class="c-card bk-card" aria-label="Phases key"><div class="c-strip">Phases</div>' + keys + '</section>';
  }
  const phHead = '<div class="bk-ph" aria-hidden="true"><span></span>' + vm.phases.map((p) => '<span>' + esc(p.name) + '<small>Overs ' + esc(p.overs) + '</small></span>').join('') + '</div>';
  const groups = vm.groups.map((g) => '<div class="bk-grp"><h4>' + ico(ROLE_ICON[g.bat], 24) + esc(g.bat) + '</h4>' +
    g.rows.map((r) => '<div class="bk-row"><span class="bk-ty" role="img" aria-label="' + esc(r.bowl) + '">' + ico(TYPE_ICON[r.bowl], 24) + '</span>' + r.chips.map((c) => chipHtml(c, g.bat + ' v ' + r.bowl)).join('') + '</div>').join('') + '</div>').join('');
  return head + use + seg + '<p class="bk-note">Grade is the batter\'s view. Each chip fills as that pairing faces balls.</p>' +
    '<div class="bk-tkey" role="group" aria-label="Bowler types">' + BOWLS.map((b) => '<span class="bk-ln">' + ico(TYPE_ICON[b], 24) + b + '</span>').join('') + '</div>' + '<section class="bk-pane" aria-label="Pairings">' + phHead + groups + '</section>';
}

export function openBook(vm, dispatch, open, arg, refresh) {
  let tab = arg && arg.tab === 'combos' ? 'combos' : 'book';
  const close = openSheet('Pairing Book', '<div class="bk-root"></div>');
  const sheet = document.querySelector('.c-sheet'); if (sheet) sheet.classList.add('bk-sheet');
  const root = document.querySelector('.bk-root');
  const paint = (focus) => {
    root.innerHTML = bookHtml(typeof refresh === 'function' ? refresh() : vm, tab);
    if (focus) { const f = root.querySelector(focus); if (f) f.focus(); }
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-tab]');
    if (!t) return;
    tab = t.getAttribute('data-tab'); paint('[data-tab="' + tab + '"]');
    const body = document.querySelector('.bk-sheet .c-sheet__body'); if (body) body.scrollTop = 0;
  });
  paint();
  return close;
}
