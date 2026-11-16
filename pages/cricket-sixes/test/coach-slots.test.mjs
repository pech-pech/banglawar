import test from 'node:test';
import assert from 'node:assert/strict';
import * as tv from '../js/ui/training-view.js';
import * as cs from '../js/ui/coaches-sheet.js';

for (const [name, m] of [['training-view', tv], ['coaches-sheet', cs]]) {
  test(name + ' T5 slots', () => {
    for (const f of ['slotJobChip', 'slotXpBar']) {
      assert.equal(m[f]({}, {}), '');
      assert.equal(m[f](null, null), '');
    }
    const c = { id: 'c1', step: 3, xp: 20, job: 'nets' };
    assert.match(m.slotJobChip(null, c), /data-cw="job"/);
    assert.match(m.slotXpBar(null, c), /data-cw="xp"/);
    assert.match(m.slotJobChip(null, { id: 'c2' }), /cw-chip-study/);
  });
}
