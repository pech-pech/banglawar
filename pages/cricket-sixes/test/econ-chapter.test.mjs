import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, VERSION } from '../js/core/save-migrate.js';
import { applyCommand as C } from '../js/store/commands.js';
import { RUN } from '../js/data/run.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const sumOf = (k) => RUN.chapters.reduce((a, c) => a + c[k], 0);

/** A current-version save whose run already reached every chapter in the old way: stored Coins/Medals, no paid flags. */
function oldSave(seed, seasons = RUN.chapters.map((c) => c.season), feat = true) {
  const s = clone(C(null, 'NewGame', { seed }));
  s.stage = 'hub';
  s.run.chapters = {};
  for (const c of RUN.chapters) {
    if (!seasons.includes(c.season)) continue;
    s.run.chapters[c.season] = { season: c.season, name: c.name, tp: c.tp, coins: c.coins, medals: feat ? c.medals : 0, featDone: feat, featSeason: c.season };
  }
  return s;
}
const load = (s) => migrate(clone(s), VERSION).state;

test('chapter data totals 1020 Coins and 4 Medals', () => {
  assert.equal(sumOf('coins'), 1020);
  assert.equal(sumOf('medals'), 4);
});

test('old save with all chapters reached: paid once on load, totals exact', () => {
  const s = oldSave('ec1');
  const c0 = s.econ.coins, m0 = s.econ.medals || 0;
  const a = load(s);
  assert.equal(a.econ.coins - c0, 1020);
  assert.equal((a.econ.medals || 0) - m0, 4);
});

test('second load pays nothing', () => {
  const a = load(oldSave('ec2'));
  const b = load(a);
  assert.equal(b.econ.coins, a.econ.coins);
  assert.equal(b.econ.medals, a.econ.medals);
  assert.equal(b.econ.ledger.length, a.econ.ledger.length);
  const c = load(b);
  assert.equal(c.econ.coins, a.econ.coins);
});

test('only reached chapters pay: seasons 3 and 6 give 320 Coins and 2 Medals', () => {
  const s = oldSave('ec3', [3, 6]);
  const c0 = s.econ.coins, m0 = s.econ.medals || 0;
  const a = load(s);
  assert.equal(a.econ.coins - c0, 320);
  assert.equal((a.econ.medals || 0) - m0, 2);
});

test('reached chapter with feat missed pays Coins but no Medals', () => {
  const s = oldSave('ec4', undefined, false);
  const c0 = s.econ.coins, m0 = s.econ.medals || 0;
  const a = load(s);
  assert.equal(a.econ.coins - c0, 1020);
  assert.equal((a.econ.medals || 0) - m0, 0);
});

test('save with no chapters reached pays nothing', () => {
  const s = oldSave('ec5', []);
  const a = load(s);
  assert.equal(a.econ.coins, s.econ.coins);
});
