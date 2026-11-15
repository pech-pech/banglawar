// Guards for the Book (P6) accessibility: decorative icons, phase radio group (no tabs), grid cells labelled in words, live region, focus return, inert page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as sel from '../js/store/selectors.js';
import { ico, icoDeco, tpChip } from '../js/ui/dom.js';
import { bookHtml, cardHtml, gridHtml, goalHtml } from '../js/ui/book-sheet.js';
import { cellIndex, newBook } from '../js/core/pairing.js';
import { newGame } from './_season-bot.mjs';

const src = (f) => readFileSync(new URL('../js/ui/' + f, import.meta.url), 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));
const FORBIDDEN = /\b(Hostile|Tough|Awkward|Easy|Good|Perfect|Strong|Even|Weak)\b/i;
// A fake sprite sheet: iconImg returns an element-like object whose outerHTML names the icon in alt (what the real one does).
function withSprites(fn) {
  const had = globalThis.window;
  globalThis.window = { SPR: { iconImg: (name, size) => { const a = { alt: name, class: 'icon', width: String(size) }; return { setAttribute(k, v) { a[k] = v; }, get outerHTML() { return '<img ' + Object.entries(a).map(([k, v]) => k + '="' + v + '"').join(' ') + '>'; } }; } } };
  try { return fn(); } finally { if (had === undefined) delete globalThis.window; else globalThis.window = had; }
}
const imgs = (html) => [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
function sample() {
  const b = newBook();
  b.found[cellIndex('Middle', 'Fast', 0)] = 1; b.balls[cellIndex('Middle', 'Fast', 0)] = 18; // Rescue Act combo
  b.found[cellIndex('Opener', 'Spin', 0)] = 1; b.balls[cellIndex('Opener', 'Spin', 0)] = 18;
  b.found[cellIndex('Opener', 'Fast', 0)] = 1; b.balls[cellIndex('Opener', 'Fast', 0)] = 9; // gift
  b.balls[cellIndex('Lower', 'Spin', 0)] = 5;
  return sel.bookVM({ book: b });
}

test('icoDeco is alt="" and aria-hidden; ico keeps the alt name', () => withSprites(() => {
  assert.match(icoDeco('medal', 16), /alt=""/); assert.match(icoDeco('medal', 16), /aria-hidden="true"/);
  assert.match(ico('medal', 16), /alt="medal"/); assert.doesNotMatch(ico('medal', 16), /aria-hidden/);
}));

test('no file-name alt text on any Book surface (sheet, cards, mini grid, goal card)', () => withSprites(() => {
  const vm = sample(), empty = sel.bookVM({ book: newBook() });
  const surfaces = [0, 1, 2].map((ph) => bookHtml(vm, { ph, sel: ph })).concat([bookHtml(empty, {}), goalHtml(empty.goal, empty.cells[empty.nearest]),
    ...vm.cells.map(cardHtml), gridHtml(vm, 0, -1, { mini: true, newCells: [cellIndex('Opener', 'Spin', 0)] }), tpChip(450)]);
  let n = 0;
  for (const h of surfaces) for (const i of imgs(h)) { n++; assert.match(i, /alt=""/, i); assert.match(i, /aria-hidden="true"/, i); }
  assert.ok(n > 60, 'icons were rendered');
}));

test('every ui view uses icoDeco, never bare ico() (only dom.js defines ico)', () => {
  for (const f of readdirSync(new URL('../js/ui/', import.meta.url)).filter((x) => x.endsWith('.js') && x !== 'dom.js')) {
    assert.doesNotMatch(src(f), /(?<![\w.$])ico\(/, f + ' calls ico(); use icoDeco() for icons beside words');
  }
});

test('the TP chip names itself with real text, not aria-label on a span', () => {
  assert.doesNotMatch(tpChip(450), /aria-label/); assert.match(tpChip(450), /class="ss-sr"> training points/);
  const hub = src('hub-view.js'); assert.doesNotMatch(hub, /hb-tp"[^>]*aria-label/); assert.match(hub, /ss-sr"> training points/);
});

test('phase toggle is a radio group of 3 (not tabs): one checked, roving tabindex, 56 px, overs words only', () => {
  const vm = sel.bookVM(clone(newGame('a11y-2').get()));
  for (const ph of [0, 1, 2]) {
    const h = bookHtml(vm, { ph, sel: ph });
    assert.doesNotMatch(h, /role="tab(list|panel)?"/); assert.doesNotMatch(h, /aria-selected/); assert.doesNotMatch(h, /aria-pressed/);
    assert.match(h, /<div class="bk-phs" role="radiogroup" aria-label="Overs">/);
    assert.equal((h.match(/role="radio"/g) || []).length, 3);
    assert.equal((h.match(/aria-checked="true"/g) || []).length, 1);
    assert.match(h, new RegExp('data-ph="' + ph + '" aria-checked="true" tabindex="0">Overs ' + ['1-3', '4-7', '8-10'][ph] + '<'));
    assert.equal((h.match(/class="bk-ph" role="radio"[^>]*tabindex="-1"/g) || []).length, 2);
    assert.doesNotMatch(h, /\b(Early|Middle overs|Late|Death)\b/);
  }
  assert.match(readFileSync(new URL('../css/book.css', import.meta.url), 'utf8'), /\.bk-ph \{[^}]*min-height: 56px/);
});

test('grid: 9 labelled cell buttons per phase, one tab stop, selected cell marked in markup not colour; heads are icon + word', () => {
  const vm = sample(), sI = cellIndex('Opener', 'Spin', 0);
  const h = gridHtml(vm, 0, sI);
  const cells = h.match(/<button type="button" class="bk-cell[^>]*>/g) || [];
  assert.equal(cells.length, 9);
  for (const c of cells) assert.match(c, /aria-label="[A-Z][^"]+ v (Fast|Medium|Spin), overs 1-3: [^"]+\."/);
  assert.equal((h.match(/tabindex="0"/g) || []).length, 1);
  assert.match(h, new RegExp('class="bk-cell is-found is-batter is-sel" data-cell="' + sI + '"[^>]*aria-current="true"[^>]*tabindex="0"'));
  for (const w of ['Fast', 'Medium', 'Spin']) assert.match(h, new RegExp('class="bk-colh"[^>]*>[^]*?<span>' + w + '</span>'));
  for (const w of ['Openers', 'Middle', 'Lower']) assert.match(h, new RegExp('class="bk-rowh"[^>]*>[^]*?<span>' + w + '</span>'));
  assert.match(h, /<span class="bk-yb" aria-hidden="true">Your bowler<\/span>/); assert.match(h, /role="group" aria-label="Book, overs 1-3: their batter by your bowler"/); // head is visual; the group label says it
  const mini = gridHtml(vm, 0, -1, { mini: true, newCells: [sI] });
  assert.doesNotMatch(mini, /<button/); assert.doesNotMatch(mini, /tabindex/);
  assert.equal((mini.match(/<div class="bk-cell[^"]*" data-cell="\d+" role="img" aria-label="[^"]+"/g) || []).length, 9);
  assert.match(mini, /class="bk-grid bk-grid--mini"/); assert.match(mini, /is-new" data-cell="\d+" role="img" aria-label="[^"]+ New\."/);
});

test('no forbidden grade words anywhere in the Book markup', () => {
  const vm = sample();
  for (let i = 0; i < 27; i++) assert.doesNotMatch(bookHtml(vm, { sel: i }), FORBIDDEN, 'cell ' + i);
  const e = sel.bookVM({ book: newBook() }); assert.doesNotMatch(bookHtml(e, {}), FORBIDDEN);
});

test('card: one polite live region outside the re-painted root, focus kept on the control used, sheet title "Book"', () => {
  const b = src('book-sheet.js');
  assert.match(b, /openSheet\('Book', '<div class="bk-root"><\/div><div class="ss-sr bk-live" role="status" aria-live="polite" aria-atomic="true"><\/div>'/);
  assert.match(b, /live\.textContent = cardText/);
  assert.match(b, /paint\('\[data-cell="' \+ i \+ '"\]\.bk-cell'\)/); assert.match(b, /paint\('\.bk-ph\[data-ph="' \+ ph \+ '"\]'\)/);
  assert.doesNotMatch(cardHtml(sample().cells[0]), /aria-live|role="status"/);
});

test('sheet: returnFocus option, page behind is inert, tab trap skips roving tabindex -1', () => {
  const sh = src('sheet.js');
  assert.match(sh, /returnFocus/); assert.match(sh, /app\.inert = true/); assert.match(sh, /releaseInert\(app\)/); assert.match(sh, /button:not\(\[tabindex="-1"\]\)/);
  assert.match(src('book-sheet.js'), /returnFocus: arg && arg\.returnFocus/);
  assert.match(src('app.js'), /openByName\('book', \{ returnFocus: BACK_FOCUS/);
});
