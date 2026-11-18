import test from 'node:test';
import assert from 'node:assert/strict';
import { resultVM } from '../js/store/selectors.js';
import { applyCommand as C } from '../js/store/commands.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const NEW = [0, 9, 10, 12, 13, 15];

function doneGame(seed, gym) {
  const store = newGame(seed); let g = 0;
  while (store.get().stage !== 'done' && g++ < 3000) step(store);
  const d = clone(store.get()); d.econ.fac.gym = gym; return d;
}

test('result card preview shows the Gym TP row and a total equal to what FinishMatch pays', () => {
  for (const lv of [0, 1, 3, 5]) {
    const d = doneGame('gym-prev-' + lv, lv), vm = resultVM(clone(d)), after = C(clone(d), 'FinishMatch');
    assert.equal(vm.pay.gym || 0, NEW[lv], 'preview gym row, level ' + lv);
    assert.equal(vm.tpEarned, after.training.tp - d.training.tp, 'preview TP equals the pool gain, level ' + lv);
    assert.equal(vm.pay.total, after.pay.total);
  }
});
