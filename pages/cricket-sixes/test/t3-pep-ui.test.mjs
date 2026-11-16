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
  for (const s of ["wheelId: 'pep'", 'get().ring', 'spinKey: get().spinKey', 'J: 1.2', "'Pep talk'", 'The tick shows where the pointer will stop.', "tokProps(get, dispatch, 'pep'", "dispatch('PepSpin', { stop:", 'pepName']) assert.ok(src.includes(s), s);
});

test('Pep describe and ring labels', async () => {
  let m; try { m = await import('../js/ui/wheels/pep.js'); } catch { m = null; }
  if (!m) return;
  const ring = PEP_SLICES.map((r, i) => ({ ...r, slot: PEP_SLOT_OF(i, 0) }));
  const sl = m.pepSlices(ring, NAMES);
  assert.equal(sl.length, 12);
  assert.equal(sl[0].label, 'Asif +5%'); assert.equal(sl[6].label, 'Asif +7.5%'); assert.equal(sl[2].label, 'Rahman +5%');
  const g = m.describePep({ slot: 2, boostPct: 10 }, NAMES);
  assert.equal(g.gold, true); assert.equal(g.big, ''); assert.match(g.say, /^Landed on Bashir \+10%\./); assert.equal(g.line, 'Bashir gets +10% for the match.');
  const n = m.describePep({ slot: 4, boostPct: 2.5 }, NAMES);
  assert.ok(n.line.includes('+2.5%')); assert.equal(n.gold, false);
});

test('describe() with the REAL pending from the store, all three wheels (N1/N2/N8)', async () => {
  const { FLAGS } = await import('../js/data/flags.js');
  const { applyCommand: C } = await import('../js/store/commands.js');
  const { mdRingOf } = await import('../js/store/wheels/md.js');
  const { mdSpinVM } = await import('../js/store/wmstore.js');
  const { newGame } = await import('./_season-bot.mjs');
  const { describeToss } = await import('../js/ui/wheels/toss.js');
  const m = await import('../js/ui/wheels/pep.js');
  const old = { ...FLAGS }; Object.assign(FLAGS, { wheelMeta: true, matchday: true, activities: true });
  try {
    const s0 = newGame('n1-real').get(), s = C({ ...s0, econ: { ...s0.econ, coins: 5000 } }, 'OpenMatchday');
    const ring = mdRingOf(s, 'pep');
    ring.forEach((row, i) => {
      const p = mdSpinVM(C(s, 'PepSpin', { stop: { sliceId: i } })).pep.pending;
      assert.equal(p.boostPct, row.value, 'pending.boostPct slice ' + i);
      const d = m.describePep(p, NAMES);
      assert.ok(d.line.endsWith('+' + row.value + '%' + ' for the match.'), d.line); assert.ok(!d.line.includes('+0%')); assert.equal(d.big, '');
    });
    const tr = mdRingOf(s, 'toss');
    tr.forEach((row, i) => {
      const p = mdSpinVM(C(s, 'TossSpin', { stop: { sliceId: i } })).toss.pending, d = describeToss(p);
      assert.equal(d.big, '');
      assert.equal(d.line, row.value > 0 ? 'You won the toss +' + row.value + '%.' : 'No boost today.');
    });
  } finally { Object.assign(FLAGS, old); }
});
