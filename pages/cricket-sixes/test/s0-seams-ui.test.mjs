import test from 'node:test';
import assert from 'node:assert/strict';
import { addReportLines, reportLines, _clearReportLines } from '../js/report/lines.js';

test('report line registry: empty, add, remove, throw, unknown', () => {
  _clearReportLines();
  for (const s of ['WHEELS', 'COACHES', 'CLINIC']) assert.deepEqual(reportLines(s, {}), []);
  assert.deepEqual(reportLines('NOPE', {}), []);
  const off = addReportLines('COACHES', (s) => ['a ' + s.x, 'b']);
  addReportLines('COACHES', () => { throw new Error('boom'); });
  addReportLines('COACHES', () => 'c');
  assert.deepEqual(reportLines('COACHES', { x: 1 }), ['a 1', 'b', 'c']);
  assert.deepEqual(reportLines('WHEELS', {}), []);
  off();
  assert.deepEqual(reportLines('COACHES', {}), ['c']);
  assert.doesNotThrow(() => addReportLines('NOPE', () => ['x']));
  assert.deepEqual(reportLines('NOPE', {}), []);
  _clearReportLines();
  assert.deepEqual(reportLines('COACHES', {}), []);
});

test('UI slots return empty string', async () => {
  const tv = await import('../js/ui/training-view.js'), cs = await import('../js/ui/coaches-sheet.js');
  assert.equal(tv.slotSpotlight({}), '');
  for (const f of ['slotJobChip', 'slotXpBar', 'slotClinicBtn']) { assert.equal(tv[f]({}, {}), ''); assert.equal(cs[f]({}, {}), ''); }
  assert.equal(cs.slotCourse({}), '');
});
