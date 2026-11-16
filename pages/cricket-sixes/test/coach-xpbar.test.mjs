import test from 'node:test';
import assert from 'node:assert/strict';
import { xpBarHtml, coachWeekly } from '../js/ui/coach-xp-bar.js';
import { XP_PER_STEP } from '../js/data/coach-weekly.js';

test('T7.1 fill = xp / cost', () => {
  const w = coachWeekly({ step: 4, xp: 58, job: 'nets' });
  assert.equal(w.xpNeed, XP_PER_STEP[3]);
  const h = xpBarHtml(w);
  assert.equal((h.match(/cw-seg on/g) || []).length, Math.floor((58 / w.xpNeed) * 10));
  assert.equal((xpBarHtml({ xp: 0, xpNeed: 100, max: false }).match(/cw-seg on/g) || []).length, 0);
});
test('T7.2 no digits on bar, digits only in title/aria-label', () => {
  const h = xpBarHtml({ xp: 34, xpNeed: 100, max: false });
  assert.match(h, /aria-label="XP 34 \/ 100"/);
  assert.match(h, /data-cw="xp"/);
  assert.doesNotMatch(h.replace(/(title|aria-label|data-fill)="[^"]*"/g, ''), /\d/);
});
test('T7.3 MAX at S+', () => {
  const w = coachWeekly({ step: 21, xp: 99 });
  assert.deepEqual([w.max, w.xp, w.xpNeed], [true, 0, null]);
  const h = xpBarHtml(w);
  assert.match(h, />MAX</);
  assert.doesNotMatch(h, /XP \d/);
});
