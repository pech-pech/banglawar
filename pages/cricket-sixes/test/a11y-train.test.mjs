// Static guards for the training-screen accessibility fixes (A11Y-rows.md). Behaviour (focus trap, Escape, focus return, scroll-padding)
// is checked live at 344x780 in the e2e run; these keep the markup and CSS rules from drifting back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const view = read('js/ui/training-view.js'), train = read('css/training.css'), app = read('app.css'), wheel = read('js/ui/wheel-view.js'), nets = read('js/ui/nets-scene.js'), t2 = read('css/training2.css');

test('app-wide scroll-padding-bottom keeps focus clear of the fixed bars (largest bar 146px)', () => {
  const m = app.match(/html\s*\{\s*scroll-padding-bottom:\s*calc\((\d+)px/);
  assert.ok(m, 'html scroll-padding-bottom missing in app.css');
  assert.ok(Number(m[1]) >= 146);
});

test('rows are bare <li> holding a real button (list semantics), no li role=button', () => {
  assert.equal(/<li[^>]*role="button"/.test(view), false);
  assert.match(view, /<li class="c-row m0-row c-row--tap tr-row[^]*?<button type="button" class="tr-rowbtn"/);
});

test('Focus and Effort are pressed-state groups with full plain labels; no bare ico( and no digits-only rating', () => {
  assert.match(view, /role="group" aria-label="' \+ esc\(label\)/);
  assert.match(view, /aria-pressed="' \+ \(cur === o\.v\)/);
  assert.match(view, /training points each/);
  for (const f of ['training-view', 'wheel-view', 'nets-scene', 'coaches-sheet', 'coachpick-view', 'week-view']) assert.equal(/[^a-zA-Z]ico\(/.test(read('js/ui/' + f + '.js').replace(/icoDeco\(/g, '')), false, f + ' uses bare ico(');
});

test('wheel: modal dialog, Escape, focus trap, reduced motion = instant result, result read once in a live region', () => {
  assert.match(wheel, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(wheel, /e\.key === 'Escape'/);
  assert.match(wheel, /e\.key === 'Tab'/);
  assert.match(wheel, /prefers-reduced-motion: reduce/);
  assert.match(wheel, /aria-live="polite"/);
  assert.match(wheel, /careful = speed <= SLOW/);
});

test('nets scene: modal, skippable by tap and Escape, reduced motion shows all lines at once, summary read once', () => {
  assert.match(nets, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(nets, /e\.key === 'Escape'/);
  assert.match(nets, /Tap to skip/);
  assert.match(nets, /if \(reduced \|\| !n\) finish\(\)/);
  assert.match(nets, /aria-live="polite"/);
});

test('training2.css: nothing flashes, animations only under no-preference, taps 56px', () => {
  assert.equal(/infinite/.test(t2.replace(/ns-run 1\.2s linear infinite/, '')), false);
  assert.match(t2, /@media \(prefers-reduced-motion: no-preference\)[^]*ns-run/);
  assert.equal(/#[0-9a-fA-F]{3,6}\b/.test(t2), false, 'hex colour in training2.css');
  assert.match(t2, /\.t2-cb \{ min-height: 56px/);
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
