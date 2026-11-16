// LW (landscape wide, GRID-RULES G0) Train rules: string checks on the CSS, same pattern as hub-lw.test.mjs. Pixel checks are in the QA shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../css/training2.css', import.meta.url), 'utf8');
const LW = '@media (min-width: 760px) and (min-height: 500px) and (orientation: landscape) {';
test('training2.css has one LW block, last of the layout rules, with the lock selectors', () => {
  assert.equal(css.split(LW).length - 1, 1);
  const lw = css.slice(css.indexOf(LW));
  for (const s of ['height: 100dvh', 'overflow: hidden', 'column-gap: 8px', '.t2-screen > .t2-cost { grid-column: 2; grid-row: 3;', '.t2-screen > .tr-list', 'overflow-y: auto', 'min-height: 60px; max-height: 72px', '.t2-screen:has(> .t2-sum)', 'margin: 0 -12px']) assert.ok(lw.includes(s), s);
});
test('tall LW puts Cost under Effort in column A and the whole squad in column B', () => {
  assert.match(css, /@media \(min-width: 760px\) and \(min-height: 690px\) and \(orientation: landscape\) \{[^@]*\.t2-cost \{ grid-column: 1; grid-row: 4; \}[^@]*\.tr-list \{ grid-row: 2 \/ 6; \}/);
});
test('N6: 600-759 portrait (624, 704) widens the coach strip to the full row; 344 / 475 and LW untouched (QA-LW-JOIN-A D1)', () => {
  const m = css.match(/@media \(min-width: 600px\) and \(max-width: 759px\) and \(orientation: portrait\) \{([^@]*)\}\n?$/);
  assert.ok(m);
  assert.ok(m[1].includes('.ct-strip { grid-column: 1 / -1;'));
  assert.ok(m[1].includes('.tr-list { grid-column: 2;'));
});
