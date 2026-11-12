/* book-sheet: the Pairing Book (P4), a bottom sheet. open(vm, dispatch, open, arg, refresh). Reads bookVM only.
   3 batter groups x 3 bowler rows x 3 phase chips. Found = grade word (never a number); not found = "?" and n/18 pips.
   Tabs: Pairings / Combos. The Phases card is the key. Words and icons, never colour alone. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';

const BOWLS = ['Fast', 'Medium', 'Spin'];

const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const PH_ICONS = [['roleOpener', 'typeFast'], ['roleMiddle', 'typeSpin'], ['roleLower', 'typeMedium']];
const PH_NOTE = ['New ball: openers and pace.', 'Middle overs: spin and set batters.', 'Last overs: big hitters and slower balls.'];

/** One phase chip. Found: grade word, medal icon if it is a combo. Not found: "?" and n/18 with a bar. asItem: role=listitem (inside a role=list row); default role=img (standalone, e.g. the found card). */
export function chipHtml(c, who, noMedal, asItem) {
  const role = asItem ? 'listitem' : 'img';
  const lab = who + ', ' + c.phase.toLowerCase();
  if (!c.found) {
    return '<span class="bk-c bk-c--q" role="' + role + '" aria-label="' + esc(lab + ': not found, ' + c.balls + ' of ' + c.of + ' balls') + '"><span class="bk-q"><b>?</b><span>' + c.balls + '/' + c.of + '</span></span>' +
      '<span class="bk-bar" aria-hidden="true"><i style="width:' + (c.balls / c.of * 100).toFixed(1) + '%"></i></span></span>';
  }
  return '<span class="bk-c bk-g' + c.rank + '" role="' + role + '" aria-label="' + esc(lab + ': ' + c.grade + (c.combo ? ', combo ' + c.combo : '')) + '"><span class="bk-w">' + (c.combo && !noMedal ? icoDeco('medal', 16) : '') + esc(c.grade) + '</span></span>';
}

export function bookHtml(vm, tab) {
  const head = '<div class="bk-head"><span class="c-tag">' + icoDeco('done', 20) + 'Found ' + vm.found + ' of ' + vm.total + '</span><span class="c-tag">' + icoDeco('medal', 20) + 'Combos ' + vm.comboFound + ' of ' + vm.comboTotal + '</span></div>';
  const use = '<p class="bk-note bk-use">Pick your bowler over by over to use what you\'ve found.</p>';
  const tabBtn = (id, label) => '<button type="button" role="tab" id="bk-tab-' + id + '" class="c-seg__opt' + (tab === id ? ' is-selected' : '') + '" data-tab="' + id + '" aria-selected="' + (tab === id) + '" aria-controls="bk-panel" tabindex="' + (tab === id ? 0 : -1) + '">' + label + '</button>';
  const seg = '<div class="c-seg bk-seg" role="tablist" aria-label="Pairing Book view">' + tabBtn('book', 'Pairings') + tabBtn('combos', 'Combos') + '</div>';
  const panel = (inner) => '<div role="tabpanel" id="bk-panel" class="bk-panel" aria-labelledby="bk-tab-' + tab + '">' + inner + '</div>';
  if (tab === 'combos') {
    const rows = vm.combos.map((c) => c.found
      ? '<div class="bk-cb">' + icoDeco('medal', 24) + '<span><b>' + esc(c.name) + '</b><span class="bk-ln">' + icoDeco(ROLE_ICON[c.bat], 20) + icoDeco(TYPE_ICON[c.bowl], 20) + esc(c.bat + ' v ' + c.bowl + ', ' + c.phase.toLowerCase()) + '</span></span>' +
        '<span class="c-tag bk-side">' + icoDeco(c.helps === 'batter' ? 'batPower' : 'bowlSpeed', 20) + (c.helps === 'batter' ? 'Helps batter' : 'Helps bowler') + '</span></div>'
      : '<div class="bk-cb bk-cb--q">' + icoDeco('lock', 24) + '<span><b>' + esc(c.name) + '</b><span class="bk-ln">Not found yet</span></span><span class="bk-c bk-c--q bk-mini" role="img" aria-label="Who it helps: hidden"><b>?</b></span></div>').join('');
    const keys = vm.phases.map((p, k) => '<div class="bk-key"><b>' + esc(p.name) + '<small>Overs ' + esc(p.overs) + '</small></b><span class="bk-ln">' + PH_ICONS[k].map((n) => icoDeco(n, 20)).join('') + '</span><span>' + PH_NOTE[k] + '</span></div>').join('');
    return head + use + seg + panel('<section class="c-card bk-card" aria-label="Combos"><div class="c-strip">' + icoDeco('medal', 24) + 'Combos<span class="c-strip__right">' + vm.comboFound + ' of ' + vm.comboTotal + '</span></div>' + rows + '</section>' +
      '<section class="c-card bk-card" aria-label="Phases key"><div class="c-strip">Phases</div>' + keys + '</section>');
  }
  const phHead = '<ul class="bk-ph" aria-label="Phases, left to right"><li aria-hidden="true"></li>' + vm.phases.map((p) => '<li>' + esc(p.name) + '<small>Overs ' + esc(p.overs) + '</small></li>').join('') + '</ul>';
  const groups = vm.groups.map((g) => '<div class="bk-grp"><h4>' + icoDeco(ROLE_ICON[g.bat], 24) + esc(g.bat) + '</h4>' +
    g.rows.map((r) => '<div class="bk-row" role="list" aria-label="' + esc(g.bat + ' v ' + r.bowl) + '"><span class="bk-ty" aria-hidden="true">' + icoDeco(TYPE_ICON[r.bowl], 24) + '</span>' + r.chips.map((c) => chipHtml(c, g.bat + ' v ' + r.bowl, false, true)).join('') + '</div>').join('') + '</div>').join('');
  return head + use + seg + panel('<p class="bk-note">Grade is the batter\'s view. Each chip fills as that pairing faces balls.</p>' +
    '<div class="bk-tkey" role="group" aria-label="Bowler types">' + BOWLS.map((b) => '<span class="bk-ln">' + icoDeco(TYPE_ICON[b], 24) + b + '</span>').join('') + '</div>' + '<div class="bk-pane">' + phHead + groups + '</div>');
}

export function openBook(vm, dispatch, open, arg, refresh) {
  let tab = arg && arg.tab === 'combos' ? 'combos' : 'book';
  const close = openSheet('Pairing Book', '<div class="bk-root"></div><div class="ss-sr bk-live" role="status" aria-live="polite" aria-atomic="true"></div>', { returnFocus: arg && arg.returnFocus });
  const sheet = document.querySelector('.c-sheet'); if (sheet) sheet.classList.add('bk-sheet');
  const root = document.querySelector('.bk-root');
  const live = document.querySelector('.bk-live');
  const paint = (focus) => {
    const v = typeof refresh === 'function' ? refresh() : vm;
    root.innerHTML = bookHtml(v, tab);
    if (focus) { const f = root.querySelector(focus); if (f) f.focus(); }
    return v;
  };
  /** Switch tab, keep focus on the tab, say what is now showing (the live region already exists, so the text change is announced). */
  const select = (next) => {
    tab = next;
    const v = paint('[data-tab="' + tab + '"]');
    const body = document.querySelector('.bk-sheet .c-sheet__body'); if (body) body.scrollTop = 0;
    if (live) live.textContent = tab === 'combos' ? 'Showing Combos. ' + v.comboFound + ' of ' + v.comboTotal + ' found.' : 'Showing Pairings. ' + v.found + ' of ' + v.total + ' found.';
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-tab]');
    if (t) select(t.getAttribute('data-tab'));
  });
  root.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[role="tab"]');
    if (!t || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
    e.preventDefault();
    const tabs = ['book', 'combos'], i = tabs.indexOf(t.getAttribute('data-tab'));
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    if (tabs[n] !== tab) select(tabs[n]);
  });
  paint();
  return close;
}
