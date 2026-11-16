// T3 parity (wheels SPEC section 14 tests 1, 2, 3, 7) on the pure Hype / Toss / Pep ring tables. Small n (8000, the smallest ladder n that
// holds +-0.1 on 8 seeds, see tools/t3-parity.mjs --find-n); the full table is `node tools/t3-parity.mjs --n 100000`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RINGS, TARGETS, ARC_PER_CYCLE, simulate, ratios, tickHonesty, meanOf, smallestN } from '../tools/t3-parity.mjs';

const N = 8000, SEED = 't3-test';
const WHEELS = ['hype', 'toss', 'pep'];

test('pulse copy: ARC_PER_CYCLE is 128.327 at W0 36 (SPEC test 5)', () => {
  assert.ok(Math.abs(ARC_PER_CYCLE - 128.327) < 0.01);
});

for (const w of WHEELS) {
  const T = TARGETS[w];
  test(`${w}: exact ring mean and simulated random mean match SPEC (test 1)`, () => {
    assert.ok(Math.abs(meanOf(RINGS[w]) - T.random) < 0.002, `exact ${meanOf(RINGS[w])}`);
    const r = simulate(RINGS[w], 'random', N, SEED);
    assert.ok(Math.abs(r.mean - T.random) <= 0.1, `random ${r.mean.toFixed(4)} vs ${T.random}`);
  });
  test(`${w}: careful mean within +-0.1 and ratio in 1.30-1.41 (test 2)`, () => {
    const r = ratios(w, N, SEED);
    assert.ok(Math.abs(r.careful.mean - T.careful) <= 0.1, `careful ${r.careful.mean.toFixed(3)} vs ${T.careful}`);
    assert.ok(r.ratio >= 1.30 && r.ratio <= 1.41, `ratio ${r.ratio.toFixed(3)}`);
  });
  test(`${w}: tick honesty, J = 0, 10,000 random taps (test 7)`, () => {
    const h = tickHonesty(RINGS[w], 10000, SEED);
    assert.equal(h.bad, 0);
    assert.ok(h.wrapLandings > 0, 'wrap slices (first/last) were exercised');
  });
  test(`${w}: patient tapper gain over careful (test 3, measured, SPEC unit = ratio)`, () => {
    const r = ratios(w, N, SEED);
    // measured at n 100,000: cycle 4 careful -0.002..+0.001; 3.6-3.8 s window -0.31..-0.33; aim 3.7 s -0.025..-0.046 (all under +0.03)
    assert.ok(r.gainC4 <= 0.03, `cycle-4 gain ${r.gainC4.toFixed(3)}`);
    assert.ok(r.gainWindow <= 0.03, `window gain ${r.gainWindow.toFixed(3)}`);
    assert.ok(r.gainNear37 <= 0.03, `near-3.7 gain ${r.gainNear37.toFixed(3)}`);
  });
}

test('smallest ladder n that holds +-0.1 on every wheel (8 seeds) is at most 8000', () => {
  const r = smallestN([8000], 8, 0.1);
  assert.ok(r && r.worst <= 0.1);
});

// Gap, not a pass: T1 reports Toss patient gain +0.08 (Pep higher). This sim does NOT reproduce it under any reading of the SPEC wording
// (see tools/t3-parity.mjs header), so there is nothing to assert about a ring change.
test('T1 Toss patient gain +0.08 reproduced', { skip: 'not reproduced: measured Toss gain is -0.002 (cycle 4), -0.31 (3.6-3.8 s window), -0.03 (aim 3.7 s); T1 tapper definition unknown' }, () => {});

test('60 fps frame lag between the last frame and the tap is NOT tick-honest (reported gap)', () => {
  const h = tickHonesty(RINGS.toss, 10000, SEED, 1 / 60);
  assert.ok(h.bad > 1000, `frame-lag mismatches ${h.bad}/10000 (the exact test 7 reading holds only with the tick evaluated at the tap timeStamp)`);
});
