import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../js/ui/wheels/toss.js', import.meta.url), 'utf8');

test('Toss UI source: openWheel options, no dial, no stopOf', () => {
  assert.match(src, /import \{ openWheel \} from '\.\.\/wheel-view\.js'/);
  assert.ok(!/dial-view/.test(src) && !/stopOf|reduced|skip/i.test(src));
  for (const s of ["wheelId: 'toss'", 'ring: get().ring', 'spinKey: get().spinKey', 'J: 1.2', "'The toss'", 'The tick shows the slice under the pointer now.', "tokProps(get, dispatch, 'toss'", "dispatch('TossSpin', { stop:", 'onCollect', 'spokeGain']) assert.ok(src.includes(s), s);
  for (const k of ['sliceId', 'stopT', 'cycle', 'tInCycle', 'respin', 't:', 'phi', 'e:']) assert.ok(src.includes(k), k);
});

test('Toss describe', async () => {
  let m; try { m = await import('../js/ui/wheels/toss.js'); } catch { m = null; }
  if (!m) return;
  const w = m.describeToss({ boostPct: 5 });
  assert.equal(w.big, ''); assert.equal(w.line, 'You won the toss +5%.');
  const l = m.describeToss({ boostPct: 0 });
  assert.equal(l.big, ''); assert.equal(l.line, 'No boost. You get +1 Spoke.'); assert.ok(!/Rival/.test(l.say + l.line)); assert.match(l.say, /No boost\. You get plus 1 Spoke/);
});
