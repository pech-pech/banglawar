import test from 'node:test';
import assert from 'node:assert/strict';
import { ballGlyph, ballWord, overTotals, totalLine } from '../js/ui/over-panel.js';

test('glyphs and words', () => {
  assert.equal(ballGlyph(0), '0'); assert.equal(ballGlyph('W'), 'W'); assert.equal(ballGlyph(6), '6');
  assert.equal(ballWord(4), 'FOUR'); assert.equal(ballWord(6), 'SIX'); assert.equal(ballWord('W'), 'OUT');
});
test('totals and line, incl. early end', () => {
  const b = [{ o: 6 }, { o: 'W' }, { o: 4 }, { o: 1 }, { o: 0 }, { o: 1 }];
  assert.deepEqual(overTotals(b), { runs: 12, wk: 1 });
  assert.equal(totalLine(b, { runs: 33, wk: 2 }), 'This over: 12 runs, 1 wicket. Score 33 runs, 2 wickets down');
  assert.equal(totalLine([{ o: 1 }], { runs: 1, wk: 0 }), 'This over: 1 run, 0 wickets. Score 1 run, 0 wickets down');
});
