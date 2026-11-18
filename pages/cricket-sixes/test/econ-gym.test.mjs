import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ECON as E } from '../js/data/economy.js';
import { gymTp, newEconomy } from '../js/core/economy.js';
import { applyCommand as C } from '../js/store/commands.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const OLD = [0, 17, 20, 23, 26, 29];
const NEW = [0, 9, 10, 12, 13, 15]; // half of OLD, halves rounded up
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('GYM_TP is half the old values, level 0 pays nothing', () => {
  assert.equal(E.GYM_TP.length, OLD.length);
  assert.equal(E.GYM_TP[0], 0);
  OLD.forEach((o, i) => assert.ok(Math.abs(E.GYM_TP[i] - o / 2) <= 0.5, `level ${i}: ${E.GYM_TP[i]} vs half of ${o}`));
  assert.deepEqual(E.GYM_TP, NEW);
});

test('gymTp reads the new table per Gym level', () => {
  for (let lv = 0; lv < NEW.length; lv++) {
    const s = { econ: { ...newEconomy(), fac: { ...newEconomy().fac, gym: lv } } };
    assert.equal(gymTp(s), NEW[lv], `gym L${lv}`);
  }
});

function doneGame(seed, gym) {
  const store = newGame(seed); let g = 0;
  while (store.get().stage !== 'done' && g++ < 3000) step(store);
  const d = clone(store.get()); d.econ.fac.gym = gym; return d;
}

test('match pay includes the Gym line and the TP ledger gets a gym entry', () => {
  for (const lv of [1, 3, 5]) {
    const d = doneGame('gym-' + lv, lv), base = C(clone(d), 'FinishMatch');
    const noGym = (() => { const z = clone(d); z.econ.fac.gym = 0; return C(z, 'FinishMatch'); })();
    assert.equal(base.pay.gym, NEW[lv]);
    assert.equal(base.pay.total - noGym.pay.total, NEW[lv], 'total carries exactly the gym line');
    assert.equal(base.training.tp - d.training.tp, base.pay.total);
    const gl = base.econ.ledger.filter((x) => x.k === 'gym');
    assert.equal(gl.length, 1); assert.equal(gl.at(-1).tp, NEW[lv]);
    assert.ok(base.econ.ledger.some((x) => x.k === 'match'), 'match line still there');
  }
});

test('Gym level 0 adds no gym ledger line and no TP', () => {
  const d = doneGame('gym-0', 0), f = C(clone(d), 'FinishMatch');
  assert.ok(!f.pay.gym);
  assert.equal(f.econ.ledger.filter((x) => x.k === 'gym').length, 0);
});

test('UI text shows the new values and not the old ones', () => {
  const stadium = src('../js/ui/stadium-view.js');
  for (const v of NEW.slice(1)) assert.ok(stadium.includes(`+${v} TP`), `stadium shows +${v} TP`);
  for (const v of OLD.slice(1)) assert.ok(!new RegExp(`\\+${v} TP`).test(stadium), `stadium no longer shows +${v} TP`);
  assert.ok(/pay\.gym/.test(src('../js/ui/result-view.js')), 'result card shows the Gym line');
});
