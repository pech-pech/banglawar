// node meta.test.js : PL.meta medals, bests, tuned, dailySeed, corrupt storage.
const fs = require('fs'), path = require('path'), assert = require('assert');
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.PL = { C: { DT: 1 / 120 } };
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'parts', 'meta.js'), 'utf8').replace(/^const PL =/m, 'var PL ='));
const M = globalThis.PL.meta;
let fails = 0;
function t(name, fn) { try { M.reset(); fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); } }
const T = (s) => Math.floor(s * 120 + 1e-6);
t('bands n=7', () => {
  assert.equal(M.medalFor(T(75), 12, 7), 'plumb');
  assert.equal(M.medalFor(T(75), 13, 7), 'gold');
  assert.equal(M.medalFor(T(105), 5, 7), 'gold');
  assert.equal(M.medalFor(T(106), 5, 7), 'silver');
  assert.equal(M.medalFor(T(150), 5, 7), 'silver');
  assert.equal(M.medalFor(T(240), 5, 7), 'bronze');
  assert.equal(M.medalFor(T(241), 5, 7), 'none');
  assert.equal(M.flipStar(15, 7), true); assert.equal(M.flipStar(16, 7), false);
});
t('bands n=3 scaled', () => {
  const f = 3 / 7;
  assert.equal(M.medalFor(T(75 * f), 12 * f, 3), 'plumb');
  assert.equal(M.medalFor(T(75 * f + 1), 1, 3), 'gold');
  assert.equal(M.medalFor(T(240 * f), 1, 3), 'bronze');
  assert.equal(M.medalFor(T(240 * f + 1), 1, 3), 'none');
  assert.equal(M.flipStar(6, 3), true); assert.equal(M.flipStar(7, 3), false);
});
t('never downgrade best', () => {
  const key = M.keyFor('daily', 20260101, 7);
  let r = M.recordRun(key, { ticks: T(100), flips: 20, deaths: 0 });
  assert(r.isBest); assert.equal(r.best.medal, 'gold');
  r = M.recordRun(key, { ticks: T(140), flips: 20, deaths: 0 });
  assert(!r.isBest); assert.equal(r.medal, 'silver'); assert.equal(M.getBest(key).medal, 'gold');
  r = M.recordRun(key, { ticks: T(90), flips: 20, deaths: 0 });
  assert(r.isBest); assert.equal(M.getBest(key).ticks, T(90));
  r = M.recordRun(key, { ticks: T(95), flips: 20, deaths: 0 });
  assert(!r.isBest); assert.equal(M.getBest(key).ticks, T(90));
});
t('tuned not saved', () => {
  const key = M.keyFor('seed', 5, 7);
  const r = M.recordRun(key, { ticks: T(60), flips: 3, deaths: 0, tuned: true });
  assert(!r.isBest); assert.equal(r.medal, 'plumb'); assert.equal(M.getBest(key), null);
  assert.deepEqual(M.load(), {});
});
t('dailySeed format', () => {
  const s = M.dailySeed(), d = new Date();
  assert(Number.isInteger(s)); assert.equal(String(s).length, 8);
  assert.equal(s, d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
});
t('corrupt JSON recovers', () => {
  for (const bad of ['{not json', 'null', '[1,2]', '"x"']) {
    store['plumbline.v1'] = bad;
    assert.deepEqual(M.load(), {});
    const r = M.recordRun('daily:1:7', { ticks: T(100), flips: 1, deaths: 0 });
    assert(r.isBest); assert.equal(M.getBest('daily:1:7').medal, 'gold');
    delete store['plumbline.v1'];
  }
});
t('no localStorage ok', () => {
  const ls = globalThis.localStorage; delete globalThis.localStorage;
  try { assert.deepEqual(M.load(), {}); assert.doesNotThrow(() => M.recordRun('a:1:7', { ticks: 1, flips: 0 })); }
  finally { globalThis.localStorage = ls; }
});
process.exit(fails ? 1 : 0);
