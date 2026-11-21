import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, TIERS, settingsFor, TIER_SETTINGS, tierFromIndex } from '../../pages/ridgeline/src/vis/quality.js';

const run = (q, fps, secs) => { let stepped = null; const dt = 1 / fps; for (let t = 0; t < secs; t += dt) { const r = q.update(dt); if (r) stepped = r; } return stepped; };

test('stays max at 60 fps', () => { const q = createQuality(); assert.equal(run(q, 60, 10), null); assert.equal(q.tier, 'max'); });
test('no step before 3 s under 40 fps', () => { const q = createQuality(); run(q, 30, 2); assert.equal(q.tier, 'max'); });
test('steps down once after 3 s, then again after 3 more, floors at lean', () => {
  const q = createQuality();
  run(q, 25, 4); assert.equal(q.tier, 'showcase');
  run(q, 25, 4); assert.equal(q.tier, 'lean');
  run(q, 25, 10); assert.equal(q.tier, 'lean');
  assert.equal(q.steps, 2); assert.equal(q.log.length, 2);
});
test('never steps up in a run', () => { const q = createQuality(); run(q, 25, 4); run(q, 120, 30); assert.equal(q.tier, 'showcase'); });
test('recovery inside window resets timer', () => { const q = createQuality(); run(q, 25, 2); run(q, 90, 2); run(q, 25, 2); assert.equal(q.tier, 'max'); });
test('stall frames ignored', () => { const q = createQuality(); for (let i = 0; i < 20; i++) q.update(2); assert.equal(q.tier, 'max'); });
test('reset on new run restores start tier', () => { const q = createQuality(); run(q, 25, 4); q.resetRun(); assert.equal(q.tier, 'max'); assert.equal(q.steps, 0); run(q, 60, 1); assert.equal(q.tier, 'max'); });
test('onTier callback fires', () => { const seen = []; const q = createQuality({ onTier: (t) => seen.push(t) }); run(q, 25, 4); assert.deepEqual(seen, ['showcase']); });
test('probeLine format', () => {
  const q = createQuality(); run(q, 58, 3);
  assert.match(q.probeLine({ postMs: 2.94, stampMs: 0.4, gpuMs: 11.2 }), /^Vis: tier max, fps 58, post 2\.9 ms, stamp 0\.4 ms, gpu 11\.2 ms, steps 0$/);
  assert.match(q.probeLine({}), /post n\/a ms, stamp n\/a ms, gpu n\/a ms, steps 0$/);
});
test('tier -> settings table', () => {
  assert.deepEqual(TIERS, ['max', 'showcase', 'lean']);
  assert.equal(settingsFor('max').post, true); assert.equal(settingsFor('max').bloom, true);
  assert.equal(settingsFor('showcase').post, true); assert.equal(settingsFor('showcase').bloom, false);
  assert.equal(settingsFor('lean').post, false); assert.equal(settingsFor('lean').trackMap, 256);
  assert.equal(settingsFor('bogus'), TIER_SETTINGS.lean);
  assert.equal(tierFromIndex(1), 'showcase'); assert.equal(tierFromIndex(9), 'lean');
});
