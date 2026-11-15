import test from 'node:test';
import assert from 'node:assert/strict';
import { ballGlyph, ballWord, overTotals, totalLine } from '../js/ui/over-panel.js';

test('glyphs and words', () => {
  assert.equal(ballGlyph(0), '0'); assert.equal(ballGlyph('W'), 'W'); assert.equal(ballGlyph(6), '6');
  assert.equal(ballWord(4), 'FOUR'); assert.equal(ballWord(6), 'SIX'); assert.equal(ballWord('W'), 'OUT');
});
test('totals and line, incl. early end', () => {
  const b = [{ o: 6 }, { o: 'W' }, { o: 4 }, { o: 1 }, { o: 0 }, { o: 1 }];
  assert.deepEqual(overTotals(b), { runs: 12, wk: 1 });
  assert.equal(totalLine(b, { runs: 33, wk: 2 }), 'This over: 12 runs, 1 wicket. Score 33 runs, 2 wickets down');
  assert.equal(totalLine([{ o: 1 }], { runs: 1, wk: 0 }), 'This over: 1 run, 0 wickets. Score 1 run, 0 wickets down');
});

// P6 2.4 / 3.6: "New in your Book!" block (cards from book-sheet.cardHtml, mini grid from gridHtml).
import * as sel from '../js/store/selectors.js';
import { cellIndex, newBook } from '../js/core/pairing.js';
import { foundHtml, foundText, findText } from '../js/ui/over-panel.js';
import { notebookHtml } from '../js/ui/end-view.js';

const BANNED = /\b(Hostile|Tough|Awkward|Easy|Good|Perfect|Strong|Even|Weak)\b/;
function stateWith(cells, gift) {
  const book = newBook();
  for (const i of cells) { book.found[i] = 1; book.balls[i] = gift ? 0 : 18; }
  return { book, last: { found: cells } };
}
test('found block: heading, one card, mini grid with the new cell outlined', () => {
  const i = cellIndex('Opener', 'Spin', 0), s = stateWith([i]);
  const h = foundHtml(sel.foundVM(s), sel.bookVM(s));
  assert.match(h, /class="bk-found"/);
  assert.match(h, /New in your Book!/);
  assert.equal((h.match(/class="bk-card2/g) || []).length, 1);
  assert.doesNotMatch(h, /bk-more/);
  assert.match(h, /bk-grid--mini/);
  assert.match(h, new RegExp('class="[^"]*is-new[^"]*"[^>]*data-cell="' + i + '"|data-cell="' + i + '"[^>]*class="[^"]*is-new'));
  assert.doesNotMatch(h, BANNED);
  assert.doesNotMatch(h, /<button/); // the mini grid is not a control
});
test('found block: 3 finds -> 2 cards and "and 1 more in the Book"; 4 -> 2 more', () => {
  const three = [cellIndex('Opener', 'Fast', 1), cellIndex('Middle', 'Fast', 1), cellIndex('Lower', 'Spin', 1)];
  const s = stateWith(three), h = foundHtml(sel.foundVM(s), sel.bookVM(s));
  assert.equal((h.match(/class="bk-card2/g) || []).length, 2);
  assert.match(h, /<p class="bk-more">and 1 more in the Book<\/p>/);
  assert.equal((h.match(/is-new/g) || []).length, 3);
  const s4 = stateWith([...three, cellIndex('Lower', 'Fast', 1)]);
  assert.match(foundHtml(sel.foundVM(s4)), /and 2 more in the Book/);
  assert.equal(foundHtml([]), '');
});
test('aria text (PLAN 3.6): seen and gift', () => {
  const i = cellIndex('Opener', 'Spin', 0);
  const f = sel.foundVM(stateWith([i]))[0];
  assert.equal(foundText([f]), 'New in your Book. ' + f.title + ', overs 1-3: ' + f.band + '.' + (f.combo ? ' Combo: ' + f.combo + '.' : '') + ' Seen for 18 balls.');
  const g = sel.bookCell(i, stateWith([i], true).book);
  assert.match(findText(g), /Coach's notebook\.$/);
  assert.doesNotMatch(foundText([f]), BANNED);
});
test('notebook card: same card, mini grid, "See Book" with the cell', () => {
  const i = cellIndex('Middle', 'Medium', 1), s = stateWith([i], true);
  const h = notebookHtml(sel.bookCell(i, s.book), sel.bookVM(s));
  assert.match(h, /Coach's notebook/);
  assert.match(h, /class="bk-card2/);
  assert.match(h, /bk-grid--mini/);
  assert.match(h, new RegExp('data-act="sheet:book" data-arg=\'\\{"cell":' + i + '\\}\''));
  assert.match(h, />See Book</);
  assert.doesNotMatch(h, /Pairing Book|Grade is/);
  assert.doesNotMatch(h, BANNED);
  assert.equal(notebookHtml(null), '');
});
test('QA D6: mini grid has the heading "Your Book, overs a-b" with the count, and the key line (panel and notebook)', () => {
  const i = cellIndex('Middle', 'Medium', 1), s = stateWith([i]);
  const key = /<p class="bk-lg">Word = who wins\. Pips = how big\. Outlined = new\.<\/p>/;
  const h = foundHtml(sel.foundVM(s), sel.bookVM(s));
  assert.match(h, /class="bk-mgw"/);
  assert.match(h, /<span class="bk-mh__t">Your Book, overs 4-7<\/span><span class="bk-mh__n">1 of 27<\/span>/);
  assert.match(h, key);
  assert.doesNotMatch(foundHtml(sel.foundVM(s)), /bk-mgw/); // no book -> no mini grid box
  const g = stateWith([i], true), n = notebookHtml(sel.bookCell(i, g.book), sel.bookVM(g));
  assert.match(n, /Your Book, overs 4-7/);
  assert.match(n, key);
  assert.doesNotMatch(h + n, BANNED);
});
test('QA D2: ball lines carry op-ball so the found panel can hide them; the total line does not', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../js/ui/over-panel.js', import.meta.url), 'utf8');
  assert.match(src, /'op-line op-ball k-'/);
  assert.match(src, /'op-line op-total'/);
  const css = (await import('node:fs')).readFileSync(new URL('../css/book.css', import.meta.url), 'utf8');
  const b = css.slice(css.indexOf('/* B: found panel */'));
  assert.match(b, /\.op-card\.found-shown \.op-ball[^{]*\{[^}]*display: none/);
  assert.doesNotMatch(b, /\.bk-found[^{]*\{[^}]*overflow-y: auto/);
});
