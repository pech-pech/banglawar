import test from 'node:test';
import assert from 'node:assert/strict';
import { jobSheetHtml } from '../js/ui/job-sheet.js';
import { readFileSync } from 'node:fs';

const rows = [
  { job: 'study', ok: true, why: '', xp: 12, effect: 'Learn the rival' },
  { job: 'scout', ok: true, why: '', xp: 8, effect: 'Find a name' },
  { job: 'nets', ok: false, why: 'Needs a free slot', xp: 10, effect: 'Drill' },
  { job: 'match', ok: false, why: 'No match this week', xp: 6, effect: 'Sit on the bench' },
];
const vm = { coachName: 'Rao', rows, focusJob: 'study', note2slot: true };

test('T6.2 tappable rows carry data attrs and XP', () => {
  const h = jobSheetHtml(vm);
  assert.match(h, /data-cw="setjob" data-job="study" data-coach="Rao"/);
  assert.match(h, /data-job="scout"/);
  assert.match(h, /\+12 XP/);
  assert.match(h, /\+8 XP/);
});
test('T6.3 greyed rows present with reason, not tappable', () => {
  const h = jobSheetHtml(vm);
  assert.match(h, /Needs a free slot/);
  assert.doesNotMatch(h, /data-job="nets"/);
  assert.doesNotMatch(h, /data-job="match"/);
  assert.match(h, /Nets/);
});
test('T6.8 no match duty note only for 2-slot weeks, one close button', () => {
  assert.match(jobSheetHtml(vm), /No match duty/);
  assert.doesNotMatch(jobSheetHtml({ ...vm, note2slot: false }), /No match duty/);
  assert.equal((jobSheetHtml(vm).match(/data-cw="close"/g) || []).length, 1);
});
test('T6.10 56px targets in css', () => {
  const css = readFileSync(new URL('../css/cw-sheet.css', import.meta.url), 'utf8');
  assert.match(css, /\.cw-row \{[^}]*min-height: 56px/);
  assert.match(css, /\.cw-close \{[^}]*min-height: 56px/);
  assert.doesNotMatch(jobSheetHtml(vm), /perk|bond/);
});
