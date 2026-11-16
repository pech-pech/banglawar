import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSE_SLICES } from '../js/data/wheel-slices-train.js';

const src = readFileSync(new URL('../js/ui/coaches-sheet.js', import.meta.url), 'utf8');
const cs = await import('../js/ui/coaches-sheet.js');
const coach = (o) => ({ id: 'k1', name: 'Mercer', step: 10, letter: 'B', strong: ['bat'], course: { ok: true, why: '' }, ...o });

test('Course ring: +4 gold slice 12%, thin +2 slice, rim sums 10', () => {
  const g = COURSE_SLICES.find((r) => r.value === 4);
  assert.equal(g.gold, true); assert.ok(Math.abs(g.w - 1.2) < 1e-9);
  assert.ok(COURSE_SLICES.some((r) => r.value === 2 && r.w < 0.7));
  assert.ok(Math.abs(COURSE_SLICES.reduce((a, r) => a + r.w, 0) - 10) < 1e-3);
});

test('startCourse opens on the component (ring, wheelId, legend); old hooks kept', () => {
  assert.match(src, /wheelId: 'course'.*ring: courseRing\(cr0\)/);
  assert.match(src, /legend: \[\{ ch: '\+2'/);
  assert.match(src, /onSpin: \(stop\) => dispatch\('CourseSpin', \{ coachId: id, careful: stop, stop \}\)/);
  assert.match(src, /spinKey: cr0\.spinKey/); assert.match(src, /stored: cr0\.stored/);
  assert.doesNotMatch(src, /widths: w\.|slices: w\.|COAST|STOP_FROM|wheelStop/);
  assert.equal(cs.courseRing({}).length, COURSE_SLICES.length);
  assert.equal(cs.courseRing({ kindFloor: 1 }).filter((r) => r.label === '+1.2').length, 7);
  assert.match(src, /The tick shows where it will land\./);
  assert.doesNotMatch(src, /timing: true/);
});

test('slotCourse: empty without coaches, shows +4 slice text and cap / season notes', () => {
  assert.equal(cs.slotCourse({}), '');
  const h = cs.slotCourse({ coaches: [coach({ id: 'k2', name: 'Rao', course: { ok: false, why: 'season' } })] });
  assert.match(h, /gold \+4 slice \(12%\)/); assert.match(h, /Rao: One course a season/);
  assert.equal(cs.courseNote(coach({})), '');
});

test('coach at step 19 or more may start: no cap branch, no cap sheet', () => {
  assert.doesNotMatch(src, /courseCapWords|openSheet\('Course'/);
  assert.equal(cs.courseNote(coach({ step: 19 })), '');
  assert.equal(cs.courseNote(coach({ step: 21 })), '');
});

test('result cut at step 19 shows the paid steps', () => {
  assert.match(src, /cut at ' \+ letterOfStep\(COURSE_CAP_STEP\) \+ ': you gain \+' \+ paid/);
  assert.match(src, /Math\.min\(COURSE_CAP_STEP, from \+ r\.gain\)/);
});
