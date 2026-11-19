'use strict';
// Plain-node tests for Burn Window stars + closest-approach storage. Run: node tests/stars.test.js
const path = require('path');
const assert = require('assert');
const R = require(path.join(__dirname, '..', 'src', 'report.js'));

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('PASS ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ' | ' + (e && e.message || e)); }
}

function mockStore(init) {
  const m = Object.assign({}, init || {});
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _m: m
  };
}
function withLS(ls, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  globalThis.localStorage = ls;
  try { fn(); } finally { if (had) globalThis.localStorage = prev; else delete globalThis.localStorage; }
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('starsFor tier edges', () => {
  assert.strictEqual(R.starsFor(10, 10), 3);
  assert.strictEqual(R.starsFor(75, 100), 3);       // exactly 0.75
  assert.strictEqual(R.starsFor(74.9, 100), 2);     // just under gold
  assert.strictEqual(R.starsFor(55, 100), 2);       // exactly 0.55
  assert.strictEqual(R.starsFor(54.9, 100), 1);     // just under silver
  assert.strictEqual(R.starsFor(10, 100), 1);
  assert.strictEqual(R.starsFor(10, 5), 3);         // better than par
});

test('starsFor fuel 0 and bad par', () => {
  assert.strictEqual(R.starsFor(10, 0), 3);
  assert.strictEqual(R.starsFor(0, 10), 1);
  assert.strictEqual(R.starsFor(-5, 10), 1);
  assert.strictEqual(R.starsFor(NaN, 10), 1);
  assert.strictEqual(R.starsFor(10, NaN), 1);
  assert.strictEqual(R.starsFor(10, -1), 1);
  assert.strictEqual(R.starsFor(undefined, undefined), 1);
});

test('saveStars never downgrades', () => {
  withLS(mockStore(), () => {
    assert.strictEqual(R.loadStars(1, 0), 0);
    assert.strictEqual(R.saveStars(1, 0, 2), true);
    assert.strictEqual(R.saveStars(1, 0, 1), false);
    assert.strictEqual(R.saveStars(1, 0, 2), false);
    assert.strictEqual(R.loadStars(1, 0), 2);
    assert.strictEqual(R.saveStars(1, 0, 3), true);
    assert.strictEqual(R.saveStars(1, 0, 0), false);
    assert.strictEqual(R.saveStars(1, 0, 4), false);
    assert.strictEqual(R.saveStars(1, 0, 'x'), false);
    assert.strictEqual(R.loadStars(1, 0), 3);
    assert.strictEqual(R.loadStars(1, 1), 0); // other sector untouched
    assert.strictEqual(R.loadStars(2, 0), 0); // other seed untouched
  });
});

test('saveStars uses contract key', () => {
  const ls = mockStore();
  withLS(ls, () => { R.saveStars('abc', 3, 2); });
  assert.strictEqual(ls._m['bw:stars2:abc:3'], '2');
});

test('saveClosest keeps minimum', () => {
  const ls = mockStore();
  withLS(ls, () => {
    assert.strictEqual(R.loadClosest(1, 0), null);
    assert.strictEqual(R.saveClosest(1, 0, 38), true);
    assert.strictEqual(R.saveClosest(1, 0, 50), false);
    assert.strictEqual(R.saveClosest(1, 0, 38), false);
    assert.strictEqual(R.loadClosest(1, 0), 38);
    assert.strictEqual(R.saveClosest(1, 0, 22.04), true);
    assert.strictEqual(R.loadClosest(1, 0), 22);
    assert.strictEqual(R.saveClosest(1, 0, 0), true);
    assert.strictEqual(R.loadClosest(1, 0), 0);
    assert.strictEqual(R.saveClosest(1, 0, -3), false);
    assert.strictEqual(R.saveClosest(1, 0, NaN), false);
    assert.strictEqual(R.saveClosest(1, 0, Infinity), false);
  });
  assert.strictEqual(ls._m['bw:miss2:1:0'], '0');
});

test('corrupt stored values give safe defaults', () => {
  withLS(mockStore({
    'bw:stars2:1:0': 'garbage', 'bw:miss2:1:0': 'garbage',
    'bw:stars2:1:1': '9', 'bw:miss2:1:1': '-4',
    'bw:stars2:1:2': '', 'bw:miss2:1:2': ''
  }), () => {
    assert.strictEqual(R.loadStars(1, 0), 0);
    assert.strictEqual(R.loadClosest(1, 0), null);
    assert.strictEqual(R.loadStars(1, 1), 0);
    assert.strictEqual(R.loadClosest(1, 1), null);
    assert.strictEqual(R.loadStars(1, 2), 0);
    assert.strictEqual(R.loadClosest(1, 2), null);
    // corrupt value is overwritten by a valid save
    assert.strictEqual(R.saveStars(1, 0, 1), true);
    assert.strictEqual(R.saveClosest(1, 0, 30), true);
    assert.strictEqual(R.loadStars(1, 0), 1);
    assert.strictEqual(R.loadClosest(1, 0), 30);
  });
});

test('missing localStorage returns safe defaults', () => {
  assert.strictEqual(typeof globalThis.localStorage, 'undefined');
  assert.strictEqual(R.loadStars(1, 0), 0);
  assert.strictEqual(R.loadClosest(1, 0), null);
  assert.strictEqual(R.saveStars(1, 0, 3), false);
  assert.strictEqual(R.saveClosest(1, 0, 10), false);
});

test('throwing localStorage returns safe defaults', () => {
  withLS(throwing, () => {
    assert.strictEqual(R.loadStars(1, 0), 0);
    assert.strictEqual(R.loadClosest(1, 0), null);
    assert.strictEqual(R.saveStars(1, 0, 3), false);
    assert.strictEqual(R.saveClosest(1, 0, 10), false);
  });
});

if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('all stars tests passed');
