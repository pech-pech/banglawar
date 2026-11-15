// SEGX: JS buildSegments fold == Python reference fold (SPEC s2 + 01a). Fixture from tools/segxcheck.py.
// Each case: same outcome table fed as samples; asserts same seg ids/labels, p within 1e-9, same rim order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFixture, compareCase, samplesOf } from '../tools/wheelmatch-segxcheck.mjs';

const ENGINE = fileURLToPath(new URL('../js/core/wheelmatch.js', import.meta.url));
const fx = loadFixture();

test('segx fixture sane', () => {
  assert.ok(fx.cases.length >= 40);
  for (const c of fx.cases) {
    assert.equal(samplesOf(c).length, c.n, c.name);
    assert.ok(Math.abs(c.segs.reduce((a, s) => a + s.p, 0) - 1) < 1e-9, c.name);
    assert.ok(c.segs.length <= fx.meta.consts.K_SEG, c.name);
  }
  assert.equal(fx.meta.ref_agree, fx.meta.ref_compared, 'python spec fold agrees with sim/segments.py fold where comparable');
});

const { buildSegments } = existsSync(ENGINE) ? await import('../js/core/wheelmatch.js') : {};
for (const c of fx.cases) {
  test(`segx ${c.name}`, { skip: buildSegments ? false : 'js/core/wheelmatch.js not built yet' }, () => {
    const d = compareCase(c, buildSegments);
    assert.deepEqual(d, [], `${c.name} ctx ${JSON.stringify(c.ctx)}\n  ${d.join('\n  ')}`);
  });
}
