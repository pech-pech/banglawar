import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceIndexAt, screenAngle, ringDir, spinFrame } from '../js/ui/wheel-view.js';
import { spotRing, spotKey, spotLine } from '../js/ui/training-view.js';
import { courseRing, courseKey, courseLine } from '../js/ui/coaches-sheet.js';
import { SPOT_SLICES } from '../js/data/wheel-slices-train.js';

// One lookup: the "Tick on" readout, the drawn tick and the landed slice all use sliceIndexAt(pos + curDist).
// The drawn tick sits at screen angle -DIR*dist*U from the pointer; the slice painted there must be the readout slice.
function checks(ring) {
  const cum = [0]; ring.forEach((r, i) => cum.push(cum[i] + r.w)); const C = cum[ring.length], U = (2 * Math.PI) / C, DIR = ringDir(true);
  for (let k = 0; k < 36; k++) {
    const pos = (k * 7.31) % C, dist = (k * 3.77) % C, readout = sliceIndexAt(cum, C, pos + dist);
    const theta = -DIR * dist * U; // clockwise-from-top angle of the tick
    const u = pos - DIR * theta / U; // wheel coordinate painted under that angle (wheel-view.js line 244)
    assert.equal(sliceIndexAt(cum, C, u), readout, 'drawn slice == readout at step ' + k);
    // screenAngle is where wheel coordinate u is drawn: it must put that slice's coordinate at the tick angle
    assert.ok(Math.abs(Math.cos(screenAngle(u, pos, U, DIR)) - Math.cos(-Math.PI / 2 + theta)) < 1e-9);
    assert.ok(Math.abs(Math.sin(screenAngle(u, pos, U, DIR)) - Math.sin(-Math.PI / 2 + theta)) < 1e-9);
    const f = spinFrame({ W0: 6, D: 1.5 }, pos, 0.4 + k * 0.05);
    assert.equal(sliceIndexAt(cum, C, f.pos + f.dist), sliceIndexAt(cum, C, f.tick), 'readout position == tick position');
  }
}
test('Spotlight ring: readout == drawn tick slice across 36 angles', () => checks(spotRing({})));
test('Course ring: readout == drawn tick slice across 36 angles', () => checks(courseRing({})));
test('Kind Floor key and result lines', () => {
  assert.ok(spotKey(spotRing({ kindFloor: true }), true).some((r) => /Kind Floor/.test(r.text)));
  assert.ok(!spotKey(spotRing({}), false).some((r) => /Kind Floor/.test(r.text)));
  assert.ok(courseKey({ kindFloor: true }).some((r) => /Kind Floor/.test(r.text)));
  const ring = spotRing({ kindFloor: true }), i = ring.findIndex((r, j) => r.label === 'x1.2' && SPOT_SLICES[j].value === 1);
  assert.match(spotLine({ index: i, value: 1.2 }, ring, true), /Training gain x1\.2\. Kind Floor lifted this x1\.0 piece to x1\.2\./);
  assert.equal(spotLine({ index: 0, value: 3, jackpot: true }, spotRing({}), false), 'Training gain x3.0. Gold slice.');
  assert.equal(courseLine({ gain: 4 }, 'S-', 'S-', 1, true, 'S-', false), '+4, cut at S-: you gain +1. Grade S- (same)');
  assert.equal(courseLine({ gain: 1 }, 'E-', 'E', 1, false, 'S-', false), 'Grade E- > E');
});
