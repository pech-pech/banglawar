// LW (unfolded Fold inner, landscape): two columns for the match screens; GRID-RULES G0 media query; base rules untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../css/wheelmatch.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../js/ui/wheelmatch-view.js', import.meta.url), 'utf8');
const Q = '@media (min-width: 760px) and (min-height: 500px) and (orientation: landscape)';
const lw = css.slice(css.indexOf(Q));
test('one LW block, last in the file, with the exact G0 query', () => {
  assert.equal(css.split(Q).length, 2);
  assert.ok(css.indexOf('/* LW: landscape inner (GRID-RULES G0) */') < css.indexOf(Q));
  assert.ok(lw.trim().endsWith('}'));
});
test('LW makes two equal columns and keeps the bowler list a plain list', () => {
  assert.match(lw, /\.wm \.wm-cols \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(lw, /\.wm-colA \{ grid-column: 1; grid-row: 1 \/ -1/);
  assert.doesNotMatch(lw.match(/\.wm \.wm-bowlers \{[^}]*\}/)[0], /max-height|overflow/);
  assert.doesNotMatch(lw.match(/\.wm \.wm-bowlers \{[^}]*\}/)[0], /overflow/);
});
test('wrappers are display: contents outside LW, so portrait layouts keep their flow', () => {
  assert.match(css.slice(0, css.indexOf(Q)), /\.wm-cols, \.wm-colA \{ display: contents; \}/);
});
test('wheel size is locked per match and screen, not per over (N8)', () => {
  assert.match(js, /const lk = \(vm && vm\.side\) \+ ':' \+/);
  assert.doesNotMatch(js, /const lk = \(vm && vm\.over\)/);
});
