import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelStats, wheelLine } from '../js/report/wmatch.js';

const ov = (o) => ({ s: 'b', r: 6, w: 0, wx: [6, 0], wa: 0, wb: 'c', wc: 0, wg: 0, ...o });

test('R4 wheel line: sign legend and careful % of aimed overs (auto excluded)', () => {
  const m = { mo: 'W', ov: [ov({ wc: 1 }), ov({ wc: 1 }), ov({ wb: 'e' }), ov({ wb: 'l' }), ov({ wa: 1, wb: null })] };
  const line = wheelLine(wheelStats([m]));
  assert.ok(line.includes('Stops careful 2 (50% of 4 aimed overs) /'), line);
  assert.ok(line.includes('(+ = good for us)'), line);
});

test('R4 wheel line: all auto or empty or old records, no crash, no NaN', () => {
  const l1 = wheelLine(wheelStats([{ mo: 'W', ov: [ov({ wa: 1, wb: null })] }]));
  assert.ok(!l1.includes('aimed overs') && !l1.includes('NaN') && l1.includes('(+ = good for us)'), l1);
  for (const ms of [[], [{ mo: 'C' }], [{ mo: 'W' }], [{ mo: 'W', ov: [null, {}, { wx: [1, 0] }] }]]) {
    const l = wheelLine(wheelStats(ms));
    assert.ok(l.includes('(+ = good for us)') && !l.includes('NaN') && !l.includes('undefined'), l);
  }
});
