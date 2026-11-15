/* book-sheet: the Book (P6), a bottom sheet. openBook(vm, dispatch, open, arg, refresh). Reads bookVM / bookCell only.
   Top to bottom: rule strip, phase toggle (radio group, Overs 1-3 / 4-7 / 8-10), 3x3 grid (rows = their batter, cols = your bowler),
   the card for the selected cell (goal card on a first, empty Book), footer counts. Who-wins words and size pips, never a points number.
   cardHtml / gridHtml / goalHtml are pure (data in, markup out): the over panel and the Coach's notebook use them too. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';

const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const winIcon = (c) => (c.side === 'bowler' ? TYPE_ICON[c.bowl] : ROLE_ICON[c.bat]);
const sideCls = (c) => (c.found ? (c.side === 'bowler' ? ' is-bowler' : ' is-batter') : ' is-q');
const pct = (c) => (c.balls / c.of * 100).toFixed(1);

/** Size pips 1-6 as small blocks (decorative: the band words carry the size). */
function pips(n) { return '<span class="bk-pips" aria-hidden="true">' + '<i></i>'.repeat(Math.max(0, Math.min(6, n | 0))) + '</span>'; }
/** The gold combo medal badge (decorative). */
const medal = () => '<span class="bk-medal" aria-hidden="true">' + icoDeco('medal', 12) + '</span>';
/** The big 18-step ball bar of an unfound / goal card. */
function bar18(c) {
  let s = '';
  for (let k = 0; k < c.of; k++) s += '<i' + (k < c.balls ? ' class="is-on"' : '') + '></i>';
  return '<div class="bk-bar18" role="img" aria-label="' + c.balls + ' of ' + c.of + ' balls">' + s + '</div>';
}
function titleHtml(c) {
  return '<h3 class="bk-ct"><span class="bk-ic">' + icoDeco(ROLE_ICON[c.bat], 24) + icoDeco(TYPE_ICON[c.bowl], 24) + '</span>' +
    '<span class="bk-ctw">' + esc(c.title) + '</span></h3><p class="bk-cs">' + esc(c.oversLabel) + '</p>';
}

/** The card for one cell (bookCell VM). Found: band, optional combo, Why, Use. Unfound: "Not found yet", balls to go, bar, fills line (no medal, no name). Pure. */
export function cardHtml(c) {
  if (!c) return '';
  if (!c.found) {
    return '<section class="bk-card2 is-q" data-cell="' + c.i + '" aria-label="' + esc(c.aria) + '">' + titleHtml(c) +
      '<div class="bk-band is-q"><span>' + esc(c.band) + '</span></div>' +
      '<p class="bk-togo">' + esc(c.toGo) + '</p>' + bar18(c) +
      '<p class="bk-ln bk-fills">' + icoDeco('info', 24) + '<span>' + esc(c.fills) + '</span></p></section>';
  }
  return '<section class="bk-card2' + sideCls(c) + '" data-cell="' + c.i + '" aria-label="' + esc(c.aria) + '">' + titleHtml(c) +
    '<div class="bk-band' + sideCls(c) + '">' + icoDeco(winIcon(c), 24) + '<span class="bk-bt">' + esc(c.band) + '</span>' + pips(c.size) + '</div>' +
    (c.combo ? '<p class="bk-combo">' + icoDeco('medal', 24) + '<span><b>Combo: ' + esc(c.combo) + '</b> ' + esc(c.comboLine || '') + '</span></p>' : '') +
    '<p class="bk-ln bk-why">' + icoDeco(c.seen === false ? 'coach' : 'done', 24) + '<span>' + esc(c.why) + '</span></p>' +
    '<p class="bk-ln bk-use">' + icoDeco('why', 24) + '<span>' + esc(c.use) + '</span></p></section>';
}

/** Goal card (empty Book): gold tag, two lines, the cell's bar. goal = bookVM.goal, cell = the nearest cell. Pure. */
export function goalHtml(goal, c) {
  if (!goal) return '';
  return '<section class="bk-card2 bk-goal"' + (c ? ' data-cell="' + c.i + '"' : '') + '>' +
    '<p class="bk-gtop"><span class="bk-gtag">' + icoDeco('book', 24) + esc(goal.tag) + '</span>' + (c ? '<span class="bk-gov">' + esc(c.oversLabel) + '</span>' : '') + '</p>' +
    '<p class="bk-g1">' + esc(goal.line1) + '</p>' + (c ? bar18(c) : '') + '<p class="bk-g2">' + esc(goal.line2) + '</p></section>';
}

/** Inner markup of one grid cell. Found: winner word, then a row of pips + medal (combo only; inline, never over the word). Unfound: "n/18" and a small bar. */
function cellInner(c) {
  if (!c.found) return '<span class="bk-qn">' + c.balls + '/' + c.of + '</span><span class="bk-bar" aria-hidden="true"><i style="width:' + pct(c) + '%"></i></span>';
  return '<span class="bk-cw">' + esc(c.cellWord) + '</span><span class="bk-pr">' + pips(c.size) + (c.combo ? medal() : '') + '</span>';
}

/**
 * The 3x3 grid of one phase. vm = bookVM, ph 0-2, selI = selected cell number (-1 none).
 * Full grid: buttons with a roving tabindex (the selected cell is the tab stop). opts.mini: div cells (role=img), no tab stops. opts.newCells: cells outlined as new. Pure.
 * @param {any} vm @param {number} ph @param {number} selI @param {{mini?:boolean, newCells?:number[]}} [opts]
 */
export function gridHtml(vm, ph, selI, opts) {
  const o = opts || {}, mini = !!o.mini, fresh = new Set(o.newCells || []);
  const rows = vm.rows || [], cols = vm.cols || [];
  const at = vm.at || ((r, c, p) => r * 9 + c * 3 + p);
  const ov = (vm.phases && vm.phases[ph] && vm.phases[ph].label) || '';
  let stop = selI;
  if (!mini && (stop < 0 || stop % 3 !== ph)) stop = at(0, 0, ph);
  let h = '<div class="bk-grid' + (mini ? ' bk-grid--mini' : '') + '" role="group" aria-label="' + esc('Book, ' + ov.toLowerCase() + ': their batter by your bowler') + '">' +
    (mini ? '' : '<span class="bk-yb" aria-hidden="true">Your bowler</span>') +
    '<span class="bk-corner" aria-hidden="true">Their batter</span>' +
    cols.map((c) => '<span class="bk-colh" aria-hidden="true">' + icoDeco(TYPE_ICON[c.bowl], 24) + '<span>' + esc(c.word) + '</span></span>').join('');
  rows.forEach((r, ri) => {
    h += '<span class="bk-rowh" aria-hidden="true">' + icoDeco(ROLE_ICON[r.bat], 24) + '<span>' + esc(r.word) + '</span></span>';
    cols.forEach((_, ci) => {
      const i = at(ri, ci, ph), c = vm.cells[i];
      const cls = 'bk-cell' + (c.found ? ' is-found' : '') + sideCls(c) + (i === selI ? ' is-sel' : '') + (fresh.has(i) ? ' is-new' : '');
      const lab = esc(c.aria + (fresh.has(i) ? ' New.' : ''));
      h += mini
        ? '<div class="' + cls + '" data-cell="' + i + '" role="img" aria-label="' + lab + '">' + cellInner(c) + '</div>'
        : '<button type="button" class="' + cls + '" data-cell="' + i + '" aria-label="' + lab + '"' + (i === selI ? ' aria-current="true"' : '') +
          ' tabindex="' + (i === stop ? 0 : -1) + '">' + cellInner(c) + '</button>';
    });
  });
  return h + '</div>';
}

/** Start state when the Book opens: arg.cell (from the found panel / notebook) else the first found cell, else the nearest unfound. */
export function startOf(vm, arg) {
  const n = arg && typeof arg.cell === 'number' && arg.cell >= 0 && arg.cell < vm.cells.length ? arg.cell
    : vm.firstFound >= 0 ? vm.firstFound : vm.nearest >= 0 ? vm.nearest : 0;
  return { ph: n % 3, sel: n };
}

/** The whole sheet body. st = {ph, sel}; sel defaults to the start rule. Goal card only on an empty Book with its nearest cell selected. Pure. */
export function bookHtml(vm, st) {
  const s0 = startOf(vm, null);
  const sel = st && typeof st.sel === 'number' && st.sel >= 0 ? st.sel : s0.sel;
  const ph = st && typeof st.ph === 'number' ? st.ph : sel % 3;
  const rule = '<p class="bk-rule">' + icoDeco('book', 24) + '<span>' + esc(vm.rule) + '</span></p>';
  const tog = '<div class="bk-phs" role="radiogroup" aria-label="Overs">' + vm.phases.map((p) => '<button type="button" class="bk-ph" role="radio" data-ph="' + p.ph + '" aria-checked="' + (p.ph === ph) + '" tabindex="' + (p.ph === ph ? 0 : -1) + '">' + esc(p.label) + '</button>').join('') + '</div>';
  const key = '<div class="bk-key"><p><span><i class="bk-sw is-bowler" aria-hidden="true"></i>Your bowler wins</span><span><i class="bk-sw is-batter" aria-hidden="true"></i>Their batter wins</span></p>' +
    '<p><span>' + pips(1) + 'a bit</span><span>' + pips(2) + 'wins</span><span>' + pips(3) + 'big</span><span>' + medal() + 'more = combo</span></p></div>';
  const c = vm.cells[sel];
  const card = vm.empty && vm.goal && sel === vm.nearest ? goalHtml(vm.goal, c) : cardHtml(c);
  const foot = '<div class="bk-foot"><span class="bk-tag">' + icoDeco('book', 24) + 'Found ' + vm.found + ' of ' + vm.total + '</span><span class="bk-tag">' + icoDeco('medal', 24) + 'Combos ' + vm.comboFound + ' of ' + vm.comboTotal + '</span></div>';
  return rule + tog + '<div class="bk-split"><div class="bk-gw">' + gridHtml(vm, ph, sel) + key + '</div><div class="bk-cardw">' + card + '</div></div>' + foot;
}

/** Plain words of the selected card for the polite live region. */
function cardText(vm, sel) {
  const c = vm.cells[sel];
  if (!c) return '';
  if (vm.empty && vm.goal && sel === vm.nearest) return vm.goal.tag + '. ' + vm.goal.line1 + ' ' + vm.goal.line2;
  return c.found ? c.title + ', ' + c.oversLabel + '. ' + c.band + '.' + (c.combo ? ' Combo: ' + c.combo + '.' : '')
    : c.title + ', ' + c.oversLabel + '. Not found yet. ' + c.toGo;
}

export function openBook(vm, dispatch, open, arg, refresh) {
  let st = startOf(vm, arg);
  const close = openSheet('Book', '<div class="bk-root"></div><div class="ss-sr bk-live" role="status" aria-live="polite" aria-atomic="true"></div>', { returnFocus: arg && arg.returnFocus });
  const sheet = document.querySelector('.c-sheet'); if (sheet) sheet.classList.add('bk-sheet');
  const root = document.querySelector('.bk-root');
  const live = document.querySelector('.bk-live');
  const body = root.closest('.c-sheet__body');
  /** Bottom fade (.bk-more) while the sheet body can still scroll down: a cue that the card goes on below. */
  const more = () => { if (body) body.classList.toggle('bk-more', body.scrollHeight - body.scrollTop - body.clientHeight > 4); };
  if (body) body.addEventListener('scroll', more, { passive: true });
  if (body && typeof ResizeObserver === 'function') new ResizeObserver(more).observe(body); // viewport turns / resizes (observer goes with the sheet)
  let v = vm;
  const paint = (focus) => {
    v = typeof refresh === 'function' ? (refresh() || v) : v;
    root.innerHTML = bookHtml(v, st);
    if (focus) { const f = root.querySelector(focus); if (f) f.focus(); }
    more();
  };
  const say = () => { if (live) live.textContent = cardText(v, st.sel); };
  /** Select a cell (same phase as the cell), keep focus on it, announce the card. */
  const pick = (i) => { st = { ph: i % 3, sel: i }; paint('[data-cell="' + i + '"].bk-cell'); say(); };
  /** Switch phase, keep the same row and column selected, focus stays on the radio. */
  const phase = (ph) => {
    const r = Math.floor(st.sel / 9), c = Math.floor((st.sel % 9) / 3);
    st = { ph, sel: v.at ? v.at(r, c, ph) : r * 9 + c * 3 + ph };
    paint('.bk-ph[data-ph="' + ph + '"]'); say();
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-ph], button.bk-cell');
    if (!t) return;
    if (t.hasAttribute('data-ph')) { const p = +t.getAttribute('data-ph'); if (p !== st.ph) phase(p); else t.focus(); }
    else pick(+t.getAttribute('data-cell'));
  });
  root.addEventListener('keydown', (e) => {
    const radio = e.target.closest && e.target.closest('.bk-ph');
    if (radio && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key)) {
      e.preventDefault();
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (st.ph + (back ? -1 : 1) + 3) % 3;
      if (n !== st.ph) phase(n);
      return;
    }
    const cell = e.target.closest && e.target.closest('button.bk-cell');
    if (cell && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key)) {
      e.preventDefault();
      const i = +cell.getAttribute('data-cell'), r = Math.floor(i / 9), c = Math.floor((i % 9) / 3), ph = i % 3;
      const nr = e.key === 'ArrowUp' ? Math.max(0, r - 1) : e.key === 'ArrowDown' ? Math.min(2, r + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : r;
      const nc = e.key === 'ArrowLeft' ? Math.max(0, c - 1) : e.key === 'ArrowRight' ? Math.min(2, c + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : c;
      const n = v.at ? v.at(nr, nc, ph) : nr * 9 + nc * 3 + ph;
      if (n !== i) pick(n);
    }
  });
  paint();
  return close;
}
