import test from 'node:test';
import assert from 'node:assert/strict';
import { slotClick as trainClick } from '../js/ui/training-view.js';
import { slotClick as sheetClick } from '../js/ui/coaches-sheet.js';

const ev = (attrs) => ({ target: { closest: (sel) => (sel === '[data-cw="job"]' && attrs ? { getAttribute: (k) => attrs[k] } : null) } });

for (const [name, fn] of [['training', trainClick], ['coaches', sheetClick]]) {
  test(name + ': job chip opens the job sheet', () => {
    const calls = []; let closed = 0;
    const r = fn(ev({ 'data-coach': 'c1' }), { open: (n, a) => calls.push([n, a]), close: () => closed++ });
    assert.equal(r, true);
    assert.deepEqual(calls, [['job', { coachId: 'c1' }]]);
    assert.equal(closed, 1);
  });
  test(name + ': other clicks are not handled', () => {
    const calls = [];
    assert.equal(fn(ev(null), { open: () => calls.push(1) }), false);
    assert.equal(fn({ target: {} }, { open: () => calls.push(1) }), false);
    assert.equal(fn(ev({ 'data-coach': 'c1' }), {}), false);
    assert.equal(calls.length, 0);
  });
}
