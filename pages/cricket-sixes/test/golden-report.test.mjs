// Captain's Over log row + Copy report block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { goldFacts, goldOverRecord, createLog } from '../js/report/log.js';
import { goldLines, buildText, buildData } from '../js/report/report.js';

const balls = [4, 1, 'W', 0, 6, 3].map((o, i) => ({ o, i }));
const before = { stage: 'bowl', seed: 's', golden: { inn1: { over: 7, taps: [], done: false, xr: 7.34 }, inn2: null }, goldCal: { offset: 12, n: 10 } };
const taps = [{ e: 10, g: 'P' }, { e: -20, g: 'P' }, { e: 60, g: 'G' }, { e: 200, g: 'M' }, { e: -5, g: 'P' }, { e: 8, g: 'P' }];
const after = { ...before, last: { over: 7, bowler: 2, balls, golden: true, taps }, golden: before.golden, stage: 'bowl' };

test('facts: grades, runs, wickets, wheel avg, offset, window and the log line', () => {
  const g = goldFacts(before, after, { win: { p: 55, g: 120 } });
  assert.deepEqual(g.gr, ['P', 'P', 'G', 'M', 'P', 'P']);
  assert.equal(g.r, 14); assert.equal(g.w, 1); assert.equal(g.xr, 7.3); assert.equal(g.off, 12);
  assert.equal(g.ln, "Captain's Over inn1 ov7: P P G M P P | runs 14 wk 1 | wheel avg 7.3 | offset +12 ms | win 55/120");
});

test('facts read defensively: nothing known prints dashes, never throws', () => {
  const g = goldFacts({ stage: 'chase' }, { last: { over: 1, balls: [], golden: true } });
  assert.match(g.ln, /^Captain's Over inn2 ov1:  \| runs 0 wk 0 \| wheel avg - \| offset - \| win -$/);
});

test('log: a golden over row is written with go; the plain facts when selectors cannot read the state', () => {
  const rec = goldOverRecord(before, after, { win: [55, 120] });
  assert.equal(rec.go.win[1], 120); assert.equal(rec.f, null); assert.equal(rec.r, 14);
  const store = new Map(), log = createLog({ storage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }, build: 'b1', now: () => 1000 });
  log.matchStart({ seed: 's', stage: 'bowl' });
  log.over(before, after, { win: [55, 120] });
  const m = log.data().matches[0];
  assert.equal(m.ov.length, 1); assert.equal(m.ov[0].go.ln.startsWith("Captain's Over inn1 ov7"), true);
  assert.equal(log.data().errors.n, 0);
});

test('report block: taps, mean |err|, grade counts per over, offset', () => {
  const go = goldFacts(before, after, { win: [55, 120] });
  const L = goldLines([{ id: 3, ov: [{ o: 7, go }, { o: 8 }] }]);
  assert.equal(L[0], "Captain's Over M3: 1 overs, 6 taps, mean |err| 51 ms, P 4 G 1 M 1, offset +12 ms");
  assert.equal(L[1], ' inn1 ov7: P4 G1 M1 runs 14 wk 1');
  assert.deepEqual(goldLines([{ id: 1, ov: [{ o: 1 }] }]), []);
  assert.deepEqual(goldLines(null), []);
});

test('Copy report carries the block and the JSON go list; no golden overs, no block', () => {
  const go = goldFacts(before, after, { win: [55, 120] });
  const m = { id: 1, build: 'b1', b: 'b1', seed: 's', t0: 1, t1: 2, res: 'won', m: { n: 3 }, ab: 0, fin: 1, ov: [{ o: 7, s: 'b', fit: [null, null, null], mu: '?', r: 14, w: 1, go }], scr: {}, gl: {}, th: [], feel: {}, tc: [], fl: [] };
  const data = { v: 1, rid: 0, matches: [m], sessions: [{ id: 1, t0: 1, build: 'b1' }], marker: null, seasons: [], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], errors: { n: 0, last: [] } };
  const env = { build: 'b1', now: 5, vp: 'x' };
  const t = buildText(data, env);
  assert.match(t, /Captain's Over M1: 1 overs, 6 taps/);
  assert.ok(JSON.parse(buildData(data, env)).go);
  const plain = buildText({ ...data, matches: [{ ...m, ov: [{ o: 7, s: 'b', fit: [null, null, null], mu: '?', r: 14, w: 1 }] }] }, env);
  assert.doesNotMatch(plain, /Captain's Over/);
});
