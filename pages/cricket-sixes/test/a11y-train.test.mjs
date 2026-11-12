// Static guards for the training-screen accessibility fixes (A11Y-rows.md). Behaviour (focus trap, Escape, focus return, scroll-padding)
// is checked live at 344x780 in the e2e run; these keep the markup and CSS rules from drifting back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const view = read('js/ui/training-view.js'), train = read('css/training.css'), app = read('app.css');

test('tips dialog is modal, traps Tab, closes on Escape and returns focus (sheet.js pattern)', () => {
  assert.match(view, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(view, /e\.key === 'Escape'/);
  assert.match(view, /e\.key === 'Tab'/);
  assert.match(view, /addEventListener\('keydown', onKey, true\)/);
  assert.match(view, /back\.focus\(\)/);
});

test('app-wide scroll-padding-bottom keeps focus clear of the fixed bars (largest bar 146px)', () => {
  const m = app.match(/html\s*\{\s*scroll-padding-bottom:\s*calc\((\d+)px/);
  assert.ok(m, 'html scroll-padding-bottom missing in app.css');
  assert.ok(Number(m[1]) >= 146);
});

test('rows are bare <li> holding a real button (list semantics), no li role=button', () => {
  assert.equal(/<li[^>]*role="button"/.test(view), false);
  assert.match(view, /<li class="c-row m0-row c-row--tap tr-row[^]*?<button type="button" class="tr-rowbtn"/);
});

test('row label: state before ratings, Auto and drilled rating named, no hard-coded "of 1 drill"', () => {
  assert.match(view, /auto drill at End week/);
  assert.match(view, /'drilled, ' \+ \(r\.gainRating/);
  assert.ok(view.indexOf("'. Ratings: '") > view.indexOf("'not drilled yet'"));
  assert.equal(/of 1 drill/.test(view), false);
  assert.match(view, /DRILLS\.revealAfter/);
});

test('Auto-train toggle: static name (state only from aria-pressed), hint via aria-describedby', () => {
  assert.match(view, /aria-pressed="' \+ on \+ '" aria-label="Auto-train bench" aria-describedby="tr-auto-hint"/);
});

test('grade reveal: one non-repeating pulse that ends gold, nothing flashes', () => {
  assert.equal(/tr-flash/.test(train), false);
  const k = train.match(/@keyframes tr-pulse\s*\{([^}]*\{[^}]*\}[^}]*)\}/);
  assert.ok(k, 'tr-pulse keyframes missing');
  assert.match(k[1], /from\s*\{\s*background:\s*var\(--white\)/);
  assert.match(k[1], /to\s*\{\s*background:\s*var\(--gold\)/);
  assert.match(train, /animation:\s*tr-pulse [^;]* 1 both/);
  assert.match(train, /@media \(prefers-reduced-motion: no-preference\)[^]*tr-pulse/);
});
