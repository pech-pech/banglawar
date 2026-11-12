import test from 'node:test';
import assert from 'node:assert/strict';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { centreOf } from '../js/core/match.js';
import { newGame, step } from './_season-bot.mjs';

function atBowl(seed) {
  const store = newGame(seed);
  for (let i = 0; i < 40 && store.get().stage !== 'bowl'; i++) step(store);
  assert.equal(store.get().stage, 'bowl');
  return store.get();
}
const inLeague = (s, league) => ({ ...s, season: { ...s.season, league } });

test('P5 field hint: League 1 shows it, League 2 does not', () => {
  const s = atBowl('hint-1');
  const l1 = bowlVM(inLeague(s, 1)), l2 = bowlVM(inLeague(s, 2));
  assert.ok(l1.fieldHint && /Weak bat/.test(l1.fieldHint.why));
  assert.ok(['A', 'P'].includes(l1.fieldHint.pick));
  assert.equal(l2.fieldHint, null);
  assert.equal(l1.call.field, bowlVM(s).call.field, 'the hint never auto-selects');
});

test('P5b field hint: pick follows the PAIR mean (bp + bs) against twice the centre', () => {
  const s = inLeague(atBowl('hint-2'), 1);
  const c = centreOf(s), [x, y] = s.inn1.crease.map((i) => s.rival.players[i]);
  const keep = [x.bp, x.bs, y.bp, y.bs];
  x.bp = x.bs = c + 30; y.bp = y.bs = c - 30; // pair mean exactly the centre: 2c is not below 2c, so Protect
  assert.equal(bowlVM(s).fieldHint.pick, 'P');
  x.bp = x.bs = c + 29; assert.equal(bowlVM(s).fieldHint.pick, 'A');
  x.bp = x.bs = y.bp = y.bs = c + 10; assert.equal(bowlVM(s).fieldHint.pick, 'P');
  x.bp = x.bs = y.bp = y.bs = c - 10; assert.equal(bowlVM(s).fieldHint.pick, 'A');
  [x.bp, x.bs, y.bp, y.bs] = keep;
});

test('P5b intent hint on the chase screen: League 1 only, Attack from over 8', () => {
  const store = newGame('hint-4');
  for (let i = 0; i < 80 && store.get().stage !== 'chase'; i++) step(store);
  const s = store.get(); assert.equal(s.stage, 'chase');
  const v1 = chaseVM(inLeague(s, 1)), v2 = chaseVM(inLeague(s, 2));
  assert.match(v1.intentHint.why, /Last 3 overs: Attack/); assert.equal(v1.intentHint.pick, 'R');
  assert.equal(v2.intentHint, null);
  assert.equal(chaseVM(inLeague({ ...s, inn2: { ...s.inn2, over: 8 } }, 1)).intentHint.pick, 'A');
});

test('P5: hidden-grade bowler has exactly 1 preview', () => {
  const s = atBowl('hint-3');
  const hid = bowlVM(s).bowlers.filter((x) => x.grade === '?');
  assert.ok(hid.every((x) => x.previews.length === 1));
});
