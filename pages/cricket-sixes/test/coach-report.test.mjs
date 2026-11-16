import test from 'node:test';
import assert from 'node:assert/strict';
import { reportLines, _clearReportLines } from '../js/report/lines.js';
import { installCoachReport } from '../js/report/coach.js';

const st = { report: { jobs: { nets: 4, match: 3, wins: 2, study: 5, scout: 1, away: 2, xp: { nets: 40, match: 24, study: 60, scout: 8 }, scoutNames: 1, courseCut: 1, stepsXp: 2, stepsCourse: 3 } } };

test('T11.2 lines in order with exact text', () => {
  _clearReportLines(); installCoachReport();
  assert.deepEqual(reportLines('COACHES', st), [
    'Jobs: nets 4, match 3 (wins 2), study 5, scout 1, away 2.',
    'XP gained: nets 40, match 24, study 60, scout 8. Steps from XP 2, from course 3. Course cut by cap yes.',
    'Scout names added from job: 1 (list / extra).',
  ]);
});

test('T11.3 n/a when absent, no throw', () => {
  _clearReportLines(); installCoachReport();
  for (const s of [{}, null, { report: {} }]) {
    const l = reportLines('COACHES', s);
    assert.equal(l.length, 3);
    assert.equal(l[0], 'Jobs: nets n/a, match n/a (wins n/a), study n/a, scout n/a, away n/a.');
    assert.ok(l[1].includes('Course cut by cap n/a.') && l[1].includes('nets n/a'));
  }
  const z = reportLines('COACHES', { report: { jobs: { courseCut: 0 } } });
  assert.ok(z[1].endsWith('Course cut by cap no.'));
});

test('T11.5 ids only, no names; unregister works', () => {
  _clearReportLines(); const off = installCoachReport();
  const s = { ...st, coaches: [{ id: 'c1', name: 'Zed Quill' }], scout: { names: ['Zed Quill'] } };
  const txt = reportLines('COACHES', s).join('\n');
  assert.ok(!txt.includes('Zed') && !/perk|bond/.test(txt));
  off();
  assert.deepEqual(reportLines('COACHES', s), []);
});
