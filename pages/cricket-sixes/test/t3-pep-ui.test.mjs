import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PEP_SLICES, PEP_SLOT_OF } from '../js/data/wheels/pep.js';

const src = readFileSync(new URL('../js/ui/wheels/pep.js', import.meta.url), 'utf8');
const NAMES = ['Asif', 'Bashir', 'Chowdhury Rahman', 'Dev', 'Emon', 'Farid'];

test('Pep UI source: openWheel options, no dial, no stopOf', () => {
  assert.match(src, /import \{ openWheel \} from '\.\.\/wheel-view\.js'/);
  assert.ok(!/dial-view/.test(src) && !/stopOf|reduced|skip/i.test(src));
  assert.match(src, /export const pepSlices/);
  for (const s of ["wheelId: 'pep'", 'get().ring', 'spinKey: get().spinKey', 'J: 1.2', "'Pep talk'", 'Who gets the pep talk?', 'The tick shows where it will land.', "tokProps(get, dispatch, 'pep'", "dispatch('PepSpin', { stop:", 'pepName']) assert.ok(src.includes(s), s);
});

test('Pep describe and ring labels', async () => {
  let m; try { m = await import('../js/ui/wheels/pep.js'); } catch { m = null; }
  if (!m) return;
  const ring = PEP_SLICES.map((r, i) => ({ ...r, slot: PEP_SLOT_OF(i, 0) }));
  const sl = m.pepSlices(ring, NAMES);
  assert.equal(sl.length, 12);
  assert.equal(sl[0].label, 'Asif'); assert.equal(sl[6].label, 'Asif'); assert.equal(sl[2].label, 'Rahman');
  const g = m.describePep({ slot: 2, boostPct: 10 }, NAMES);
  assert.equal(g.chip, '+10%'); assert.equal(g.gold, true); assert.equal(g.big, 'Bashir got the pep talk');
  const n = m.describePep({ slot: 4, boostPct: 2.5 }, NAMES);
  assert.equal(n.chip, '+2.5%'); assert.equal(n.gold, false);
});
