// Guards for the Pairing Book accessibility fixes (A11Y-p4: icons, found-card live region, focus return, tabs, lists, TP chip, inert).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as sel from '../js/store/selectors.js';
import { ico, icoDeco, tpChip } from '../js/ui/dom.js';
import { foundHtml, foundText } from '../js/ui/over-panel.js';
import { chipHtml, bookHtml } from '../js/ui/book-sheet.js';
import { cellIndex } from '../js/core/pairing.js';
import { newGame } from './_season-bot.mjs';

const src = (f) => readFileSync(new URL('../js/ui/' + f, import.meta.url), 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));
// A fake sprite sheet: iconImg returns an element-like object whose outerHTML names the icon in alt (what the real one does).
function withSprites(fn) {
  const had = globalThis.window;
  globalThis.window = { SPR: { iconImg: (name, size) => { const a = { alt: name, class: 'icon', width: String(size) }; return { setAttribute(k, v) { a[k] = v; }, get outerHTML() { return '<img ' + Object.entries(a).map(([k, v]) => k + '="' + v + '"').join(' ') + '>'; } }; } } };
  try { return fn(); } finally { if (had === undefined) delete globalThis.window; else globalThis.window = had; }
}
const imgs = (html) => [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);

test('icoDeco is alt="" and aria-hidden; ico keeps the alt name', () => withSprites(() => {
  assert.match(icoDeco('medal', 16), /alt=""/); assert.match(icoDeco('medal', 16), /aria-hidden="true"/);
  assert.match(ico('medal', 16), /alt="medal"/); assert.doesNotMatch(ico('medal', 16), /aria-hidden/);
}));

test('no file-name alt text on any Book surface (sheet, found card, notebook, over panel)', () => withSprites(() => {
  const s = clone(newGame('a11y-1').get());
  s.book.found[cellIndex('Middle', 'Fast', 0)] = 1; s.book.found[cellIndex('Opener', 'Spin', 0)] = 1;
  const vm = sel.bookVM(s);
  const surfaces = [bookHtml(vm, 'book'), bookHtml(vm, 'combos'), foundHtml(sel.foundVM({ last: { found: [cellIndex('Opener', 'Spin', 0)] } })), tpChip(450)];
  let n = 0;
  for (const h of surfaces) for (const i of imgs(h)) { n++; assert.match(i, /alt=""/, i); assert.match(i, /aria-hidden="true"/, i); }
  assert.ok(n > 20, 'icons were rendered');
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

test('Pairings / Combos is a real tablist with one selected tab and a labelled tabpanel', () => {
  const vm = sel.bookVM(clone(newGame('a11y-2').get()));
  for (const tab of ['book', 'combos']) {
    const h = bookHtml(vm, tab);
    assert.match(h, /role="tablist"/); assert.equal((h.match(/role="tab"/g) || []).length, 2);
    assert.equal((h.match(/aria-selected="true"/g) || []).length, 1); assert.equal((h.match(/aria-selected="false"/g) || []).length, 1);
    assert.doesNotMatch(h, /aria-pressed/);
    assert.match(h, new RegExp('data-tab="' + tab + '"[^>]*aria-selected="true"[^>]*tabindex="0"'));
    assert.match(h, new RegExp('role="tabpanel" id="bk-panel" class="bk-panel" aria-labelledby="bk-tab-' + tab + '"'));
    assert.equal((h.match(/aria-controls="bk-panel"/g) || []).length, 2);
  }
});

test('Pairings: phase header is exposed (not aria-hidden) and each row is a list of 3 items', () => {
  const h = bookHtml(sel.bookVM(clone(newGame('a11y-3').get())), 'book');
  assert.match(h, /<ul class="bk-ph" aria-label="Phases[^"]*">/); assert.doesNotMatch(h, /class="bk-ph"[^>]*aria-hidden/);
  const rows = h.match(/<div class="bk-row" role="list"/g) || [];
  assert.equal(rows.length, 9); assert.equal((h.match(/role="listitem"/g) || []).length, 27); assert.doesNotMatch(h, /role="img" aria-label="(Opener|Middle|Lower) v/);
  assert.match(chipHtml({ found: false, balls: 1, of: 18, phase: 'Early' }, 'Opener v Fast'), /role="img"/); // standalone chips (found card) stay images
});

test('found card: live region exists with the panel, finish() fills it, the card itself is not a second status', () => {
  const op = src('over-panel.js');
  assert.ok(op.indexOf('op-found-live') < op.indexOf('function finish'), 'region is in the panel template, before finish()');
  assert.match(op, /role="status" aria-live="polite" aria-atomic="true"><\/div><div class="op-foot">/);
  assert.match(op, /foundLive\.textContent = foundText\(found\)/);
  assert.doesNotMatch(foundHtml([{ rank: 5, grade: 'Good', ph: 0, bat: 'Opener', bowl: 'Fast', name: 'X', combo: null }]), /role="status"/);
  const t = foundText([{ ph: 0, bat: 'Opener', bowl: 'Spin', grade: 'Good', combo: { name: 'Cracker' } }]);
  assert.match(t, /Pairing found\. Opener v Spin, early: Good\. Combo: Cracker\./);
});

test('sheet: returnFocus option, page behind is inert, tab trap skips roving tabindex -1', () => {
  const sh = src('sheet.js');
  assert.match(sh, /returnFocus/); assert.match(sh, /app\.inert = true/); assert.match(sh, /app\.inert = wasInert/); assert.match(sh, /button:not\(\[tabindex="-1"\]\)/);
  assert.match(src('book-sheet.js'), /returnFocus: arg && arg\.returnFocus/);
  assert.match(src('app.js'), /onBook: \(\) => openByName\('book', \{ returnFocus: BACK_FOCUS \}\)/);
});
