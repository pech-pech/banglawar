'use strict';
const assert = require('assert');
const { CHUNKS, PAD_CELLS, isPadClean, LEGEND } = require('./chunks.js');

process.env.PADRULE = 'on'; // zone unit tests below exercise the old keep-out; default-off is checked explicitly
const count = (rows, ch) => rows.join('').split(ch).length - 1;
const ids = new Set();
let n = 0;
const t = (fn) => { fn(); n++; };

for (const c of CHUNKS) {
  assert(!ids.has(c.id), 'dup id ' + c.id); ids.add(c.id);
  t(() => {
    assert([1, 2, 3].includes(c.tier), c.id + ' tier');
    assert(['entry', 'mid', 'exit'].includes(c.kind), c.id + ' kind');
    assert.strictEqual(c.h, c.rows.length, c.id + ' h');
    assert(c.h === 5 || (c.kind === 'mid' && c.h === 10), c.id + ' height');
    for (const r of c.rows) {
      assert.strictEqual(r.length, 13, c.id + ' width: ' + r);
      for (const ch of r) assert(LEGEND.includes(ch), c.id + ' bad char ' + ch);
    }
    assert(c.openTop.length > 0, c.id + ' no top opening');
    if (c.kind !== 'exit') assert(c.openBottom.length > 0, c.id + ' no bottom opening');
    assert(typeof c.note === 'string' && c.note.length, c.id + ' note');
  });
  t(() => {
    assert.strictEqual(count(c.rows, 'S'), c.kind === 'entry' ? 1 : 0, c.id + ' S');
    assert.strictEqual(count(c.rows, 'E'), c.kind === 'exit' ? 1 : 0, c.id + ' E');
    if (c.kind === 'entry') assert(c.rows.slice(0, 2).join('').includes('S'), c.id + ' S not at top');
    if (c.kind === 'exit') assert(c.rows.slice(-4).join('').includes('E'), c.id + ' E not near bottom');
  });
}

const B = '.'.repeat(13);
const flipRows = (rows) => rows.map((r) => r.split('').reverse().join('').replace(/[<>]/g, (x) => (x === '<' ? '>' : '<')));
t(() => {
  // Zone from padzone.js: rows 13-19 except col 7, plus the Retry ring (cols 10-12, rows 0-1).
  const z = new Set(PAD_CELLS().map(([c, r]) => c + ',' + r));
  for (let r = 13; r < 20; r++) for (let c = 0; c < 13; c++) assert.strictEqual(z.has(c + ',' + r), c !== 7, `cell ${c},${r}`);
  for (const k of ['10,0', '12,1']) assert(z.has(k), k);
  assert(!z.has('9,0') && !z.has('7,12'));
  const bad = Array(17).fill(B).concat(['E............', B, '#############']);
  assert(!isPadClean(bad));
  const bad2 = Array(17).fill(B).concat([B, '.........^...', '#############']);
  assert(!isPadClean(bad2));
  const bad3 = ['...........S.'].concat(Array(19).fill(B)); // start under the Retry ring
  assert(!isPadClean(bad3));
  const bad4 = Array(10).fill(B).concat(['...XX........', '...XX........'], Array(8).fill(B)); // crusher sweeps into the zone
  assert(!isPadClean(bad4));
  assert(isPadClean(Array(15).fill(B).concat(['.....#.......', B, '.......E.....', B, '#############'].slice(0, 5))));
});

// Default (PADRULE unset/off): nothing is a pad break, any chunk placement is legal, crushers may be last, exits may mirror.
t(() => {
  delete process.env.PADRULE;
  assert(isPadClean(Array(17).fill(B).concat(['E............', B, '#############'])));
  assert(isPadClean(Array(17).fill(B).concat([B, '.........^...', '#############'])));
  assert(isPadClean(['...........S.'].concat(Array(19).fill(B))));
  for (const c of CHUNKS) {
    assert(!c.notLast, c.id + ' notLast');
    assert(!c.noMirror, c.id + ' noMirror');
    if (c.kind === 'entry') { const col = c.rows.map((r) => r.indexOf('S')).find((x) => x >= 0); assert(col >= 3 && col <= 9, c.id + ' S col ' + col); }
  }
  assert(CHUNKS.some((c) => c.kind === 'exit' && !c.rows.join('').includes('E') === false && c.rows.join('').indexOf('E') % 13 !== 7), 'an exit with E off col 7');
  assert(CHUNKS.some((c) => c.id === 'm8-crusher-pair') && CHUNKS.some((c) => c.id === 'x3-spike-guard'));
  process.env.PADRULE = 'on';
});

const K = (k) => CHUNKS.filter((c) => c.kind === k);
t(() => {
  assert(K('entry').length >= 6 && K('entry').length <= 8);
  assert(K('mid').length >= 10 && K('mid').length <= 14);
  assert(K('exit').length >= 6 && K('exit').length <= 8);
  assert(K('mid').some((c) => c.h === 10));
  for (const k of ['entry', 'mid', 'exit']) for (const tr of [1, 2, 3]) assert(K(k).some((c) => c.tier === tr), k + ' tier ' + tr);
});

// Stacking: every pair that can touch shares an open column on the seam.
const mids = K('mid');
const link = (a, b) => a.openBottom.some((x) => b.openTop.includes(x));
t(() => {
  for (const e of K('entry')) for (const m of mids) assert(link(e, m), e.id + ' -> ' + m.id);
  for (const a of mids) for (const b of mids) assert(link(a, b), a.id + ' -> ' + b.id);
  for (const m of mids) for (const x of K('exit')) assert(link(m, x), m.id + ' -> ' + x.id);
});

// Every combination is exactly 20 rows.
t(() => {
  const m5 = mids.filter((m) => m.h === 5), m10 = mids.filter((m) => m.h === 10);
  for (const e of K('entry')) for (const x of K('exit')) {
    for (const m of m10) assert.strictEqual(e.h + m.h + x.h, 20);
    for (const a of m5) for (const b of m5) assert.strictEqual(e.h + a.h + b.h + x.h, 20);
  }
});

console.log('chunks.test.js: PASS (' + n + ' checks, ' + CHUNKS.length + ' chunks)');
