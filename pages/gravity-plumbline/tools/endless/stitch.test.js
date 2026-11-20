'use strict';
// Run with: node tools/endless/stitch.test.js
const assert = require('assert');
const { stitchRoom } = require('./stitch.js');

const ALL = [...Array(13).keys()];
const BLANK = '.'.repeat(13);
const mk = (id, tier, kind, rows) => ({ id, tier, kind, h: rows.length, rows, openTop: ALL, openBottom: ALL });

// Fake chunks: entries/exits are 5 rows, mids sum to 10 rows per pick.
const e1 = mk('e1', 1, 'entry', [BLANK, BLANK, BLANK, BLANK, BLANK]);
const e2 = mk('e2', 2, 'entry', [BLANK, BLANK, BLANK, BLANK, BLANK]);
const m1 = mk('m1', 1, 'mid', [BLANK, '............<', '>............', BLANK, BLANK]);
const m2 = mk('m2', 1, 'mid', [BLANK, BLANK, BLANK, BLANK, BLANK]);
const m3 = mk('m3', 1, 'mid', [BLANK, BLANK, BLANK]);
const m4 = mk('m4', 2, 'mid', [BLANK, BLANK]);
const x1 = mk('x1', 1, 'exit', [BLANK, BLANK, BLANK, BLANK, BLANK]);
const x2 = mk('x2', 3, 'exit', [BLANK, BLANK, BLANK, BLANK, BLANK]);
// Exit with walls at bottom-left and bottom-right: dirty pad whether or not mirrored.
const xDirty = mk('xd', 1, 'exit', [BLANK, BLANK, BLANK, BLANK, '#...........#']);

const GOOD = [e1, e2, m1, m2, m3, m4, x1, x2];
// Fake pad check: bottom-left 4 cols of the last 3 rows must be wall-free.
const fakePadClean = (rows) => rows.slice(17, 20).every((r) => r.slice(0, 4).indexOf('#') === -1);

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const DEPTH = 3;
const opts = { chunks: GOOD, isPadClean: fakePadClean };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('same seed and depth give the same rows', () => {
  for (const seed of SEEDS) {
    const a = stitchRoom(seed, DEPTH, opts);
    const b = stitchRoom(seed, DEPTH, opts);
    assert.deepStrictEqual(b, a, `seed ${seed}`);
  }
});

test('different seeds vary the output', () => {
  const ids = new Set(SEEDS.map((s) => stitchRoom(s, DEPTH, opts)).filter(Boolean).map((r) => r.chunkIds.join(',')));
  assert.ok(ids.size > 1, 'expected more than one chunk layout across seeds');
});

test('output is 20 rows of 13 chars', () => {
  let n = 0;
  for (const seed of SEEDS) {
    const r = stitchRoom(seed, DEPTH, opts);
    assert.ok(r, `seed ${seed} returned null`);
    n++;
    assert.strictEqual(r.rows.length, 20);
    for (const row of r.rows) assert.strictEqual(row.length, 13);
    assert.ok(r.chunkIds.length >= 3);
    assert.ok([1].includes(r.tierPicked), 'depth 3 uses tier 1 only');
  }
  assert.ok(n > 0);
});

test('mirrored rows are reversed with < and > swapped', () => {
  const byId = Object.fromEntries(GOOD.map((c) => [c.id, c]));
  const seen = { true: 0, false: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const r = stitchRoom(seed, DEPTH, opts);
    assert.ok(r, `seed ${seed} returned null`);
    seen[r.mirrored]++;
    let expected = [];
    for (const id of r.chunkIds) expected = expected.concat(byId[id].rows);
    if (r.mirrored) {
      const sw = { '<': '>', '>': '<' };
      expected = expected.map((row) => row.split('').reverse().map((ch) => sw[ch] || ch).join(''));
    }
    assert.deepStrictEqual(r.rows, expected, `seed ${seed} mirrored=${r.mirrored}`);
  }
  assert.ok(seen.true > 0 && seen.false > 0, 'expected both mirrored and unmirrored rooms');
});

test('pad-dirty result returns null', () => {
  const dirtyOnly = { chunks: [e1, m1, m2, m3, m4, xDirty], isPadClean: fakePadClean };
  for (const seed of SEEDS) {
    assert.strictEqual(stitchRoom(seed, DEPTH, dirtyOnly), null, `seed ${seed}`);
  }
  // Control: same chunks with a clean exit do produce a room.
  const clean = { chunks: [e1, m1, m2, m3, m4, x1], isPadClean: fakePadClean };
  assert.ok(stitchRoom(1, DEPTH, clean), 'clean control should produce a room');
});

test('noMirror chunks keep their orientation when the room mirrors', () => {
  const xn = Object.assign(mk('xn', 1, 'exit', [BLANK, BLANK, BLANK, '.......E.....', '#######......']), { noMirror: true });
  const o = { chunks: [e1, m1, m2, m3, m4, xn], isPadClean: () => true };
  let mir = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = stitchRoom(seed, DEPTH, o);
    assert.ok(r, 'seed ' + seed);
    assert.strictEqual(r.rows[18], '.......E.....', 'exit row unmirrored, seed ' + seed);
    if (r.mirrored) mir++;
  }
  assert.ok(mir > 0);
});

test('pad break re-rolls the stitch itself', () => {
  let calls = 0;
  const o = { chunks: GOOD, isPadClean: () => ++calls % 3 === 0 };
  const r = stitchRoom(1, DEPTH, o);
  assert.ok(r && r.stitchRerolls === 2, 'rerolls ' + (r && r.stitchRerolls));
});

test('PADRULE off (default) does not reject on the real pad check; on does', () => {
  const real = require('./chunks.js');
  delete process.env.PADRULE;
  for (let s = 1; s <= 20; s++) assert.ok(stitchRoom(s, 20), 'off, seed ' + s);
  process.env.PADRULE = 'on';
  const xSp = mk('xs', 1, 'exit', [BLANK, BLANK, BLANK, '.^^^^^^^^^^^.', '#############']);
  const dirty = { chunks: [e1, m1, m2, m3, m4, xSp], isPadClean: real.isPadClean };
  assert.strictEqual(stitchRoom(1, DEPTH, dirty), null);
  delete process.env.PADRULE;
  assert.ok(stitchRoom(1, DEPTH, dirty), 'off accepts the same chunks');
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('ok   ' + t.name);
  } catch (err) {
    failed++;
    console.log('FAIL ' + t.name + '\n     ' + (err && err.message));
  }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
