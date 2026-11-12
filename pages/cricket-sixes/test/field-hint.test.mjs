import test from 'node:test';
import assert from 'node:assert/strict';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { applyCommand } from '../js/store/commands.js';
import { centreOf } from '../js/core/match.js';
import { newGame, step } from './_season-bot.mjs';

function atBowl(seed) {
  const store = newGame(seed);
  for (let i = 0; i < 40 && store.get().stage !== 'bowl'; i++) step(store);
  assert.equal(store.get().stage, 'bowl');
  return store.get();
}
const inLeague = (s, league) => ({ ...s, season: { ...s.season, league } });

const pairOf = (s) => s.inn1.crease.map((i) => s.rival.players[i]);
const setPair = (s, bp0, bs0, bp1, bs1) => { const [x, y] = pairOf(s); x.bp = bp0; x.bs = bs0; y.bp = bp1; y.bs = bs1; };

test('12b field chip: League 1 shows it for a weak pair, League 2 does not, and it never auto-selects', () => {
  const s = atBowl('hint-1'), c = centreOf(s);
  setPair(s, c - 10, c - 10, c - 10, c - 10);
  const l1 = bowlVM(inLeague(s, 1)), l2 = bowlVM(inLeague(s, 2));
  assert.ok(l1.fieldHint && /Weak bat/.test(l1.fieldHint.why));
  assert.equal(l1.fieldHint.pick, 'A');
  assert.equal(l2.fieldHint, null);
  assert.equal(l1.call.field, 'P', 'the call starts neutral: Protect, the chip is not applied');
});

test('12b field chip: pair rule picks A below 2*centre; P only as a chip for a big hitting pair; else no chip', () => {
  const s = inLeague(atBowl('hint-2'), 1), c = centreOf(s);
  setPair(s, c + 30, c + 30, c - 30, c - 30); // pair mean exactly the centre: Protect, not a big hitter -> not worth 1 win point, no chip
  assert.equal(bowlVM(s).fieldHint, null);
  setPair(s, c + 29, c + 29, c - 30, c - 30); assert.equal(bowlVM(s).fieldHint.pick, 'A');
  setPair(s, c + 10, c + 10, c + 10, c + 10); assert.equal(bowlVM(s).fieldHint.pick, 'P'); // mean bp - centre = 10 >= 8
  setPair(s, c + 7, c + 7, c + 7, c + 7); assert.equal(bowlVM(s).fieldHint, null); // 7 < 8
  setPair(s, c - 10, c - 10, c - 10, c - 10); assert.equal(bowlVM(s).fieldHint.pick, 'A');
});

test('12b default call: bowling starts Protect every over, with and without a season plan, and after a bowled over', () => {
  const s = atBowl('dcall-1');
  assert.equal(s.call.field, 'P');
  const plain = applyCommand(null, 'NewMatch', { seed: 'dcall-2' });
  assert.equal(plain.call.field, 'P');
  let t = applyCommand(plain, 'MakeCall', { bowler: plain.call.bowler, field: 'A' });
  assert.equal(t.call.field, 'A');
  t = applyCommand(t, 'BowlOver', {});
  assert.equal(t.call.field, 'P', 'an Attack call is not carried into the next over');
});

test('12b default call: the #38 plan bowler is kept, a field the player set in the plan is honoured', () => {
  const s = atBowl('dcall-3');
  assert.deepEqual(s.plan.fields, ['P', 'P', 'P']);
  assert.equal(s.call.bowler, s.plan.overs[0]);
  const t = applyCommand(s, 'BowlOver', {});
  if (t.stage === 'bowl') assert.equal(t.call.bowler, t.plan.overs[1] ?? t.call.bowler);
});

test('12b intent chip on the chase screen: League 1 only, Attack in the last 3 overs, none before', () => {
  const store = newGame('hint-4');
  for (let i = 0; i < 80 && store.get().stage !== 'chase'; i++) step(store);
  const s = store.get(); assert.equal(s.stage, 'chase');
  const v1 = chaseVM(inLeague(s, 1)), v2 = chaseVM(inLeague(s, 2));
  assert.equal(v1.intentHint, null, 'Steady is the default, no chip early');
  assert.equal(v2.intentHint, null);
  for (const over of [8, 9, 10]) {
    const h = chaseVM(inLeague({ ...s, inn2: { ...s.inn2, over } }, 1)).intentHint;
    assert.equal(h.pick, 'A'); assert.match(h.why, /Last 3 overs: Attack/);
    assert.equal(chaseVM(inLeague({ ...s, inn2: { ...s.inn2, over } }, 2)).intentHint, null);
  }
  assert.equal(chaseVM(inLeague({ ...s, inn2: { ...s.inn2, over: 7 } }, 1)).intentHint, null);
});

test('12b chase: a BowlOver with no intent plays Steady (R), never the last call', () => {
  const store = newGame('hint-5');
  for (let i = 0; i < 80 && store.get().stage !== 'chase'; i++) step(store);
  const s = store.get();
  const a = applyCommand(s, 'BowlOver', {}), b = applyCommand(s, 'BowlOver', { intent: 'R' });
  assert.deepEqual(a.last, b.last);
  assert.equal(a.last.intent, 'R');
});

test('P5: hidden-grade bowler has exactly 1 preview', () => {
  const s = atBowl('hint-3');
  const hid = bowlVM(s).bowlers.filter((x) => x.grade === '?');
  assert.ok(hid.every((x) => x.previews.length === 1));
});
