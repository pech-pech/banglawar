// B3.4 coach job chip: markup, a11y label, 56px taps, empty for missing coach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chipHtml } from '../js/ui/coach-job-chip.js';

const css = readFileSync(new URL('../css/cw-chip.css', import.meta.url), 'utf8');
const WORDS = { nets: 'Nets', match: 'Match', study: 'Study', scout: 'Scout', away: 'On course' };

test('T6.1 each job renders a button with class, data attrs, word and aria-label', () => {
  for (const [job, word] of Object.entries(WORDS)) {
    const h = chipHtml({ id: 'c1', job, locked: false, why: '' });
    assert.ok(h.startsWith('<button'));
    assert.ok(h.includes('cw-chip cw-chip-' + job));
    assert.ok(h.includes('data-cw="job"') && h.includes('data-coach="c1"'));
    assert.ok(new RegExp('aria-label="[^"]*' + word).test(h));
    assert.ok(h.includes('>' + word + '</span>'));
  }
});

test('T6.5 css keeps 56px taps, 14px text, no foreign prefixes', () => {
  assert.ok(css.includes('min-height: 56px') && css.includes('min-width: 56px'));
  assert.ok(/font:\s*700 14px/.test(css));
  assert.equal(/ct-slot|\.cl-|\.cn-/.test(css), false);
  assert.ok(/aria-label/.test(chipHtml({ id: 'a', job: 'away', locked: true, why: 'on a course' })));
  assert.ok(chipHtml({ id: 'a', job: 'nets', locked: true, why: 'x' }).includes('cw-locked'));
});

test('T6.6 missing coach or unknown job gives empty string', () => {
  assert.equal(chipHtml(null), '');
  assert.equal(chipHtml(undefined), '');
  assert.equal(chipHtml({ id: 'a', job: 'bogus' }), '');
});
