import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../js/store/commands.js';
import { whyLine, whyCause, selfCheck } from '../js/ui/why.js';

test('selfCheck passes', () => assert.deepEqual(selfCheck(), []));

test('cause mix over 5,000+ balls', () => {
  const INT = ['D', 'R', 'A'];
  const counts = {}; const samples = {}; let total = 0, nOver = 0;
  for (let seed = 1; total < 6000 && seed < 2000; seed++) {
    let s = applyCommand(null, 'NewMatch', { seed });
    for (let g = 0; g < 40 && s.stage !== 'done'; g++) {
      if (s.stage === 'break') { s = applyCommand(s, 'StartChase'); continue; }
      if (s.stage === 'bowl' && s.call) {
        s = applyCommand(s, 'MakeCall', { bowler: s.call.bowler, field: (seed + g) % 2 ? 'A' : 'P' });
      }
      s = applyCommand(s, 'BowlOver', { intent: INT[(seed + g) % 3] });
      nOver++;
      for (const rec of s.last.balls) {
        const bat = 'Ravi', bowl = 'Okoro';
        const line = whyLine(rec, bat, bowl), cat = whyCause(rec);
        assert.ok(!/^\d/.test(line), line);
        assert.ok(line.length > 5);
        counts[cat] = (counts[cat] || 0) + 1; total++;
        const key = cat + '/' + rec.o;
        if (!samples[key]) samples[key] = line;
      }
    }
  }
  assert.ok(total >= 5000, `balls ${total}`);
  const pct = (k) => (100 * (counts[k] || 0) / total);
  console.log('balls', total, Object.fromEntries(Object.keys(counts).map((k) => [k, pct(k).toFixed(1) + '%'])));
  console.log(samples);
  assert.ok(pct('luck') < 5, 'luck ' + pct('luck'));
  assert.ok(pct('matchup') > 10, 'matchup ' + pct('matchup'));
});

test('2-run balls never use dot wording; dot defending can show', () => {
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, step: 0, batHome: false, bowlHome: false };
  const two = whyLine({ n: '3.1', o: 2, intent: 'R', field: 'P', pr: base }, 'A', 'B');
  assert.ok(!/tight|defend/i.test(two), two);
  assert.equal(whyCause({ n: '1.1', o: 0, intent: 'D', field: 'A', pr: base }), 'intent');
  assert.equal(whyCause({ n: '1.1', o: 'W', intent: 'R', field: 'N', pr: { ...base, p: { wicket: 0.03 } } }), 'odds');
  assert.equal(whyCause({ n: '1.1', o: 6, intent: 'A', field: 'A', pr: { ...base, step: 1, batHome: true } }), 'matchup');
});
