// Book P6 sheet (PLAN 11): T1 (UI: no points numbers, no grade words), T2 (Why / Use lines), T3 (unfound card), T8 (pulse only with motion welcome), plus open rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as sel from '../js/store/selectors.js';
import { bookHtml, cardHtml, gridHtml, goalHtml, startOf } from '../js/ui/book-sheet.js';
import { CELLS, cellIndex, comboOf, newBook, winOf } from '../js/core/pairing.js';

const FORBIDDEN = /\b(Hostile|Tough|Awkward|Easy|Good|Perfect|Strong|Even|Weak)\b/i;
const text = (h) => h.replace(/<[^>]*>/g, ' '); // visible words
const attrs = (h) => [...h.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' | ');
/** A points number: a signed number ("+3", "-2"), or any number that is not a ball count, an overs range, a found / combo count or a cell index attribute. */
function pointsLeak(h) {
  const words = text(h) + ' ' + attrs(h);
  if (/(^|[^\w-])[+−-]\s?\d/.test(words)) return 'signed number';
  if (/\bpo?i?n?ts?\b|\bpoints?\b/i.test(words)) return 'points word';
  const rest = words.replace(/\b\d+-\d+\b/g, '').replace(/\b\d+\/18\b/g, '').replace(/\b\d+ (of )?18\b/g, '').replace(/\b\d+ (balls?|of \d+)\b/g, '').replace(/\b18 balls\b/g, '').replace(/\b\d+ to go\b/g, '').replace(/\b(Found|Combos) \d+ of \d+\b/g, '');
  const m = rest.match(/\d+/);
  return m ? 'stray number ' + m[0] + ' in: ' + rest.slice(Math.max(0, m.index - 30), m.index + 30) : null;
}
function bookWith(found, balls) {
  const b = newBook();
  for (const i of found) { b.found[i] = 1; b.balls[i] = 18; }
  for (const [i, n] of Object.entries(balls || {})) b.balls[+i] = n;
  return b;
}

test('T1 (UI): bookHtml and cardHtml for all 27 cells, found and unfound: no points number, no grade words', () => {
  const all = Array.from({ length: CELLS }, (_, i) => i);
  const fullVM = sel.bookVM({ book: bookWith(all) });
  const noneVM = sel.bookVM({ book: bookWith([], Object.fromEntries(all.map((i) => [i, i % 18]))) });
  for (const vm of [fullVM, noneVM]) {
    for (let i = 0; i < CELLS; i++) {
      for (const h of [cardHtml(vm.cells[i]), bookHtml(vm, { sel: i }), gridHtml(vm, i % 3, i, { mini: true, newCells: [i] })]) {
        assert.doesNotMatch(h, FORBIDDEN, 'cell ' + i);
        assert.equal(pointsLeak(h), null, 'cell ' + i);
      }
    }
  }
  const empty = sel.bookVM({ book: newBook() });
  const g = goalHtml(empty.goal, empty.cells[empty.nearest]);
  assert.doesNotMatch(g, FORBIDDEN); assert.equal(pointsLeak(g), null);
  assert.equal(pointsLeak(bookHtml(empty, {})), null);
});

test('T1 (UI): found cells show the who-wins word and 1-6 pips matching winOf; combo cells get a medal', () => {
  const all = Array.from({ length: CELLS }, (_, i) => i);
  const vm = sel.bookVM({ book: bookWith(all) });
  for (let ph = 0; ph < 3; ph++) {
    const h = gridHtml(vm, ph, -1);
    for (const m of h.matchAll(/<button [^>]*data-cell="(\d+)"[^>]*>([^]*?)<\/button>/g)) {
      const i = +m[1], w = winOf(i), inner = m[2];
      assert.match(m[0], new RegExp('is-found is-' + w.side));
      assert.equal((inner.match(/<i><\/i>/g) || []).length, w.size, 'pips of cell ' + i);
      assert.ok(w.size >= 1 && w.size <= 6);
      assert.equal(/class="bk-medal"/.test(inner), !!comboOf(i), 'medal of cell ' + i);
      assert.match(inner, new RegExp('<span class="bk-cw">' + vm.cells[i].cellWord + '</span>'));
    }
  }
  const card = cardHtml(vm.cells[cellIndex('Middle', 'Fast', 0)]); // Rescue Act, size 6
  assert.match(card, /Middle order crush it/); assert.match(card, /Combo: Rescue Act/); assert.match(card, /A bonus on top\./);
});

test('T2: every found card has a Why line (seen v gift by balls) and a Use line (leans to / keeps ... off), never "bowls"', () => {
  for (let i = 0; i < CELLS; i++) {
    for (const balls of [18, 9]) {
      const b = newBook(); b.found[i] = 1; b.balls[i] = balls;
      const c = sel.bookVM({ book: b }).cells[i], h = cardHtml(c);
      assert.match(h, /<p class="bk-ln bk-why">/);
      assert.match(h, balls >= 18 ? /Why: you saw 18 balls of it\./ : /Why: Coach&#39;s notebook, season end\./);
      assert.match(h, /<p class="bk-ln bk-use">[^]*Use: the bowler pick shows it\. Your plan (leans to (Fast|Medium|Spin) at|keeps (Fast|Medium|Spin) off) their (openers|middle order|lower order)\./);
      assert.doesNotMatch(text(h), /\bbowls\b/);
      assert.match(h, new RegExp('<div class="bk-band is-' + c.side + '">'));
    }
  }
});

test('T3: unfound card for balls 0, 1, 17 says 18 / 17 / 1 to go; unfound combo cells show no medal and no name', () => {
  const i = cellIndex('Middle', 'Fast', 0); // Rescue Act combo cell
  assert.ok(comboOf(i));
  for (const [balls, line] of [[0, '18 balls to go.'], [1, '17 balls to go.'], [17, '1 ball to go.']]) {
    const vm = sel.bookVM({ book: bookWith([], { [i]: balls }) });
    const h = cardHtml(vm.cells[i]);
    assert.match(h, new RegExp('<p class="bk-togo">' + line.replace('.', '\\.') + '</p>'));
    assert.match(h, /Not found yet/); assert.match(h, /Fills when Middle order face Fast in overs 1-3, any season match, bat or bowl\./);
    assert.match(h, new RegExp('role="img" aria-label="' + balls + ' of 18 balls"'));
    assert.equal((h.match(/<i class="is-on"><\/i>/g) || []).length, balls);
    const grid = gridHtml(vm, 0, i), sheet = bookHtml(vm, { sel: i });
    for (const x of [h, grid, sheet]) { assert.doesNotMatch(x, /Rescue Act/); assert.doesNotMatch(x, /Why:|Use:/); }
    const cellBtn = grid.match(new RegExp('<button [^>]*data-cell="' + i + '"[^>]*>([^]*?)</button>'))[1];
    assert.doesNotMatch(cellBtn, /bk-medal/); assert.match(cellBtn, new RegExp('<span class="bk-qn">' + balls + '/18</span>'));
    assert.doesNotMatch(h, /bk-medal|Combo/);
  }
});

test('open rules: arg.cell picks that cell and its phase; else first found; else nearest; toggling keeps row and column', () => {
  const vm = sel.bookVM({ book: bookWith([cellIndex('Middle', 'Fast', 1), cellIndex('Lower', 'Spin', 2)]) });
  assert.deepEqual(startOf(vm, { cell: cellIndex('Lower', 'Spin', 2) }), { ph: 2, sel: cellIndex('Lower', 'Spin', 2) });
  assert.deepEqual(startOf(vm, {}), { ph: 1, sel: cellIndex('Middle', 'Fast', 1) });
  const e = sel.bookVM({ book: bookWith([], { [cellIndex('Opener', 'Spin', 2)]: 7 }) });
  assert.deepEqual(startOf(e, null), { ph: 2, sel: cellIndex('Opener', 'Spin', 2) });
  const h = bookHtml(e, startOf(e, null));
  assert.match(h, /class="bk-card2 bk-goal" data-cell="\d+"/); assert.match(h, /Your first goal/); assert.match(h, /Watch Openers face Spin in overs 8-10\./);
  assert.match(h, /Found 0 of 27/); assert.match(h, /Combos 0 of 8/); assert.match(h, /Watch a pairing 18 balls\. It goes in\./);
  assert.doesNotMatch(bookHtml(e, { ph: 0, sel: 0 }), /bk-goal/); // another cell on an empty Book: the plain unfound card
  const src = readFileSync(new URL('../js/ui/book-sheet.js', import.meta.url), 'utf8');
  assert.match(src, /sel: v\.at \? v\.at\(r, c, ph\)/); // phase toggle keeps r / c
  for (const ph of [0, 1, 2]) assert.equal(vm.at(1, 0, ph) % 3, ph);
});

test('T8: the new-cell pulse is only inside prefers-reduced-motion: no-preference; the outline is always on', () => {
  const css = readFileSync(new URL('../css/book.css', import.meta.url), 'utf8').replace(/\/\*[^]*?\*\//g, '');
  const blocks = [...css.matchAll(/@media[^{]*\{/g)];
  const inside = [];
  for (const b of blocks) {
    let d = 0, k = b.index + b[0].length - 1;
    for (; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}' && --d === 0) break; }
    inside.push([b.index, k, b[0]]);
  }
  for (const m of css.matchAll(/animation|@keyframes/g)) {
    const box = inside.find(([a, z]) => m.index > a && m.index < z);
    assert.ok(box && /prefers-reduced-motion:\s*no-preference/.test(box[2]), 'animation outside the motion query at ' + m.index);
  }
  assert.match(css, /\.bk-cell\.is-new \{[^}]*outline: 3px solid/);
  const outside = css.slice(0, inside.find(([, , q]) => /no-preference/.test(q))[0]);
  assert.match(outside, /\.bk-cell\.is-new \{[^}]*outline/);
});

test('size: grid fits 344 px (62 px heads + 3 cells >= 56 px tall), text >= 14 px in book.css', () => {
  const css = readFileSync(new URL('../css/book.css', import.meta.url), 'utf8').replace(/\/\*[^]*?\*\//g, ''); // rules only, not comments
  assert.match(css, /\.bk-grid \{[^}]*grid-template-columns: 62px repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.bk-cell \{[^}]*min-height: 60px/);
  assert.ok((344 - 20 - 62 - 3 * 6) / 3 >= 56, 'cells are at least 56 px wide at 344');
  for (const m of css.matchAll(/font(?:-size)?:[^;]*?\b(\d+)px/g)) assert.ok(+m[1] >= 14, 'font ' + m[0]);
});

test('QA first pass (D3, D5, D10): medal inline after the pips; "Your bowler" head and size key; card title and combo strip without tiny marks', () => {
  const all = Array.from({ length: CELLS }, (_, i) => i);
  const vm = sel.bookVM({ book: bookWith(all) });
  for (const mini of [false, true]) {
    const h = gridHtml(vm, 0, -1, { mini });
    // D3: word first, then one row holding the pips and (combo only) the medal after them
    const ms = [...h.matchAll(/data-cell="(\d+)"[^>]*>(<span class="bk-cw">[^<]+<\/span><span class="bk-pr"><span class="bk-pips" aria-hidden="true">(?:<i><\/i>)+<\/span>(?:<span class="bk-medal" aria-hidden="true">(?:<img[^>]*>)?<\/span>)?<\/span>)<\/(?:button|div)>/g)];
    assert.equal(ms.length, 9, 'mini ' + mini);
    for (const m of ms) assert.equal(/bk-medal/.test(m[2]), !!comboOf(+m[1]), 'medal of cell ' + m[1]);
    // D5: "Your bowler" over the bowler columns in the sheet grid (not the mini grid of the found panel / notebook)
    assert.equal(/<span class="bk-yb" aria-hidden="true">Your bowler<\/span><span class="bk-corner"/.test(h), !mini);
  }
  const css = readFileSync(new URL('../css/book.css', import.meta.url), 'utf8');
  const top = css.slice(0, css.indexOf('/* B: found panel */')).replace(/\/\*[^]*?\*\//g, '');
  assert.doesNotMatch(top, /\.bk-medal \{[^}]*position: absolute/); assert.doesNotMatch(top, /\.bk-cell \.bk-medal/);
  assert.match(top, /\.bk-yb \{[^}]*grid-column: 2 \/ 5/);
  // D5: size key (F8-B) under the colour key
  const b = bookHtml(vm, { sel: 9 });
  assert.match(b, /<div class="bk-key"><p><span><i class="bk-sw is-bowler"[^>]*><\/i>Your bowler wins<\/span><span><i class="bk-sw is-batter"[^>]*><\/i>Their batter wins<\/span><\/p><p>/);
  const key = b.match(/<div class="bk-key">([^]*?)<\/div>/)[1];
  for (const [n, w] of [[1, 'a bit'], [2, 'wins'], [3, 'big']]) assert.match(key, new RegExp('<span><span class="bk-pips" aria-hidden="true">' + '<i></i>'.repeat(n) + '</span>' + w + '</span>'));
  assert.match(key, /<span class="bk-medal" aria-hidden="true">[^]*?<\/span>more = combo<\/span>/);
  // D10: no tiny "v" between the title icons; the combo strip uses the 24 px medal
  const card = cardHtml(vm.cells[cellIndex('Middle', 'Fast', 0)]);
  assert.doesNotMatch(card, /bk-v\b|>v</); assert.doesNotMatch(css, /\.bk-v \{/);
  assert.match(card, /<p class="bk-combo"><span><b>Combo: Rescue Act<\/b>/); // no 12 px medal badge in the strip
  const src = readFileSync(new URL('../js/ui/book-sheet.js', import.meta.url), 'utf8');
  assert.match(src, /'<p class="bk-combo">' \+ icoDeco\('medal', 24\)/); assert.doesNotMatch(src, /icoDeco\('medal', 12\)[^\n]*bk-combo|bk-combo[^\n]*icoDeco\('medal', 12\)/);
});

test('QA first pass (D1, D4, D7, D9): still grid, unclipped selection ring, one-row footer, bottom fade cue', () => {
  const css = readFileSync(new URL('../css/book.css', import.meta.url), 'utf8');
  const top = css.slice(0, css.indexOf('/* B: found panel */')).replace(/\/\*[^]*?\*\//g, '');
  // D1: the card box holds the tallest card (302 px at 344), capped at the room a full-height sheet leaves
  assert.match(top, /\.bk-cardw \{ min-height: 302px; min-height: min\(302px, calc\(94vh - \d+px\)\); min-height: min\(302px, calc\(94dvh - \d+px\)\); \}/);
  // D4: 6 px side room for the 6 px ring (box-shadow 3 + 3)
  assert.match(top, /\.bk-root \{[^}]*padding: 0 6px/); assert.match(top, /\.bk-cell\.is-sel \{ box-shadow: 0 0 0 3px var\(--bk-sel\), 0 0 0 6px/);
  // D7: footer sticks to the sheet bottom; scorebook tags tighter so both sit on one row
  assert.match(top, /\.bk-foot \{[^}]*position: sticky; bottom: 0/); assert.match(top, /\.skin-scorebook \.bk-tag \{ font-size: 15px/);
  // D9: fade above the footer only while the body can scroll on
  assert.match(top, /\.c-sheet__body\.bk-more \.bk-foot::before \{[^}]*linear-gradient/);
  const src = readFileSync(new URL('../js/ui/book-sheet.js', import.meta.url), 'utf8');
  assert.match(src, /classList\.toggle\('bk-more', body\.scrollHeight - body\.scrollTop - body\.clientHeight > 4\)/);
  assert.match(src, /addEventListener\('scroll', more/);
});
