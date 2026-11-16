// LW (landscape wide, GRID-RULES G0) Week done rules: string checks on css/training.css. Pixel checks are in the QA shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../css/training.css', import.meta.url), 'utf8');
const LW = '@media (min-width: 760px) and (min-height: 500px) and (orientation: landscape) {';
test('training.css has one LW block, last in the file', () => {
  assert.equal(css.split(LW).length - 1, 1);
  const i = css.indexOf(LW);
  assert.ok(css.indexOf('/* LW: landscape inner (GRID-RULES G0) */') < i);
  assert.equal(css.slice(i).split('@media').length - 1, 1);
});
test('Week done LW: two explicit columns, left list scrolls, notes plate over results', () => {
  const lw = css.slice(css.indexOf(LW));
  for (const s of ['.tr-week {', 'margin: 0 -12px', 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)', '.tr-week > .tr-top { grid-column: 1 / -1; grid-row: 1; padding-right: 14px; }', 'grid-column: 1; grid-row: 2 / 4', '.tr-week > .tr-notes { grid-column: 2; grid-row: 2;', '.tr-week > .tr-card ~ .tr-card { grid-column: 2; grid-row: 3;', ':not(:has(> .tr-notes))', 'overflow-y: auto', 'overflow: hidden']) assert.ok(lw.includes(s), s);
});
test('Week done portrait 600-759 (QA-LW-JOIN-A D2): same 2-column grid, before the LW block', () => {
  const P = '@media (min-width: 600px) and (max-width: 759px) and (orientation: portrait) {';
  assert.equal(css.split(P).length - 1, 1);
  const pb = css.slice(css.indexOf(P), css.indexOf('/* LW: landscape inner'));
  for (const s of ['grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)', '.tr-week > .tr-notes { grid-column: 2;', '.tr-week .tr-results { min-height: 0; overflow-y: auto', 'padding-right: 14px']) assert.ok(pb.includes(s), s);
});
