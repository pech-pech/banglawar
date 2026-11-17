// Wheel teach-and-show cues (FIX-LIST Flag 1 option A): ready hint, slow-window STOP cue, "tick was on X, best near slice was Y". Pure helpers only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sliceIdxAt, bestNear, tickNoteText, stopCue } from '../js/ui/wheelmatch-view.js';

const C = 100;
const segs = [
  { id: 'a', label: '2', stars: 0, tone: 'bad', value: -2, start: 0, width: 25 },
  { id: 'b', label: '4', stars: 0, tone: 'so', value: 1, start: 25, width: 25 },
  { id: 'c', label: '6', stars: 1, tone: 'good', value: 5, start: 50, width: 25 },
  { id: 'd', label: '1', stars: 0, tone: 'bad', value: -4, start: 75, width: 25 },
];
test('sliceIdxAt wraps the position', () => {
  assert.equal(sliceIdxAt(segs, 30, C), 1); assert.equal(sliceIdxAt(segs, 130, C), 1); assert.equal(sliceIdxAt(segs, -1, C), 3);
  assert.equal(sliceIdxAt([], 5, C), -1);
});
test('bestNear picks the best of tick +-1 (circular); a tie keeps the tick slice', () => {
  assert.deepEqual(bestNear(segs, 1), { tick: 1, best: 2 });
  assert.deepEqual(bestNear(segs, 3), { tick: 3, best: 2 });
  assert.deepEqual(bestNear(segs, 0), { tick: 0, best: 1 });
  assert.deepEqual(bestNear(segs, 2), { tick: 2, best: 2 });
  const tie = [{ value: 1 }, { value: 1 }, { value: 1 }]; assert.deepEqual(bestNear(tie, 1), { tick: 1, best: 1 });
  assert.equal(bestNear([], 0), null); assert.equal(bestNear(segs, 9), null);
});
test('tickNoteText wording', () => {
  assert.equal(tickNoteText(segs, 30, 'e', C), 'Early: tick was on ● 4, best near slice was ▲ 6 ✱.');
  assert.equal(tickNoteText(segs, 60, 'c', C), 'Good timing: tick was on ▲ 6 ✱, the best near slice.');
  assert.equal(tickNoteText(segs, 60, '', C), 'Tick was on ▲ 6 ✱, the best near slice.');
  assert.equal(tickNoteText([], 60, 'l', C), '');
});
test('tickNoteText is deterministic (no randomness)', () => {
  const r = Math.random; Math.random = () => { throw new Error('random'); };
  try { assert.equal(tickNoteText(segs, 30, 'l', C), tickNoteText(segs, 30, 'l', C)); } finally { Math.random = r; }
});
test('stopCue: slow window label and aria', () => {
  assert.equal(stopCue(true).sub, 'SLOW: tap now'); assert.equal(stopCue(true).label, 'STOP!');
  assert.match(stopCue(false).sub, /wait for the glow/); assert.equal(stopCue(false).aria, 'Stop the wheel');
});
test('ready hint teaches the glow; cue CSS adds no animation and keeps 14 px text', () => {
  const v = readFileSync(new URL('../js/ui/wheelmatch-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/wheelmatch.css', import.meta.url), 'utf8');
  assert.match(v, /wait for the glow/);
  assert.doesNotMatch(css, /prefers-reduced-motion|is-glow[^}]*animation/);
  assert.match(css, /\.wm-tickline \{[^}]*font-size: 14px/);
});
