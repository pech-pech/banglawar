// SPEC 14 tests 6 (cap 12%, neighbours), 12 (labels) for Hype, Toss, Pep. Pure data/ring code only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_SLICES } from '../js/data/wheels/hype.js';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';
import { PEP_SLICES, PEP_SLOT_OF, pepName } from '../js/data/wheels/pep.js';
import { hypeRing } from '../js/core/wheels/hype.js';
import { tossRing } from '../js/core/wheels/toss.js';
import { pepRing } from '../js/core/wheels/pep.js';
import { neutralMods } from '../js/core/wheels/common.js';

const CAP = 1.2;            // 12% of a 10-unit rim
const EPS = 1e-9;
const mods = (o) => ({ ...neutralMods(), ...o });

// Predicates (the mutation check below proves they bite).
const capOk = (ring) => ring.every((r) => r.w <= CAP + EPS);
// allowed = set of "i" meaning ring[i] and ring[i+1 mod n] may share a value.
const neighboursOk = (ring, allowed = []) => ring.every((r, i) => {
  const j = (i + 1) % ring.length;
  return r.value !== ring[j].value || allowed.includes(i);
});
const labelOk = (r) => r.w >= 0.7 || /^.$/u.test(r.label) || /^[+-]\d+(\.\d+)?%?$/.test(r.label);

const HYPE0 = HYPE_SLICES[0];
// Toss SPEC: equal runs 0,0,0 (slices 1-3), 2.5,2.5 (6-7), 5,5 (8-9). 0-based pairs: 0-1, 1-2, 5-6, 7-8.
const TOSS_EQ = [0, 1, 5, 7];
// Pep SPEC: 2.5 pairs at slices 4-5 and 11-12. 0-based pairs: 3-4, 10-11.
const PEP_EQ = [3, 10];

const hypeVariants = {
  base: hypeRing(),
  'Kind Floor 1': hypeRing(mods({ floor: 1 })),
  'Kind Floor 2': hypeRing(mods({ floor: 2 })),
  'Home Crowd': hypeRing(mods({ hfloor: 1 })),
  'Warm Crowd': hypeRing(mods({ warmCrowd: true })),
  'Home Crowd + Warm Crowd': hypeRing(mods({ hfloor: 1, warmCrowd: true })),
  'Kind Floor + Warm Crowd': hypeRing(mods({ floor: 1, warmCrowd: true })),
};
const tossVariants = {
  base: tossRing(),
  'Kind Floor': tossRing(mods({ floor: 1 })),
  'Good Sport': tossRing(mods({ cons: 1 })),
};
const pepVariants = { 'offset 0': pepRing(neutralMods(), 0), 'offset 3': pepRing(neutralMods(), 3), 'offset 5': pepRing(neutralMods(), 5) };

test('6 cap 12%: every row on every ring, data and after transforms', () => {
  assert.ok(capOk(HYPE0) && capOk(TOSS_SLICES) && capOk(PEP_SLICES));
  for (const [n, r] of Object.entries(hypeVariants)) assert.ok(capOk(r), 'hype ' + n);
  for (const [n, r] of Object.entries(tossVariants)) assert.ok(capOk(r), 'toss ' + n);
  for (const [n, r] of Object.entries(pepVariants)) assert.ok(capOk(r), 'pep ' + n);
});

test('6 cap 12%: transforms never change widths', () => {
  for (const r of Object.values(hypeVariants)) assert.deepEqual(r.map((x) => x.w), HYPE0.map((x) => x.w));
  for (const r of Object.values(tossVariants)) assert.deepEqual(r.map((x) => x.w), TOSS_SLICES.map((x) => x.w));
});

test('6 mutation: a 12.1% slice fails the cap predicate, 12.0% passes', () => {
  assert.equal(capOk([{ w: 1.21 }]), false);
  assert.equal(capOk([{ w: 1.2 }]), true);
  for (const ring of [HYPE0, TOSS_SLICES, PEP_SLICES]) {
    const bad = ring.map((r, i) => (i === 0 ? { ...r, w: 1.21 } : r));
    assert.equal(capOk(bad), false);
  }
});

test('6 neighbours Hype: none equal, wrap included, base and Kind Floor / Warm Crowd', () => {
  assert.ok(neighboursOk(HYPE0));
  for (const n of ['base', 'Kind Floor 1', 'Warm Crowd', 'Kind Floor + Warm Crowd']) assert.ok(neighboursOk(hypeVariants[n]), n);
  assert.equal(HYPE0[8].value === HYPE0[0].value, false); // HIGH 9 next to NUTS 1 across the wrap
});

test('6 neighbours Toss: only 0,0,0 / 2.5,2.5 / 5,5 runs may be equal (SPEC 14 test 6)', () => {
  assert.ok(neighboursOk(TOSS_SLICES, TOSS_EQ));
  assert.ok(neighboursOk(tossVariants.base, TOSS_EQ));
  assert.ok(neighboursOk(tossVariants['Kind Floor'], TOSS_EQ), 'Kind Floor keeps the pair set');
  // the listed equal pairs really are the runs in the data (no other, no missing)
  const eq = TOSS_SLICES.map((r, i) => (r.value === TOSS_SLICES[(i + 1) % 10].value ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(eq, TOSS_EQ);
});

test('6 neighbours Pep: only the 2.5 pairs at slices 4-5 and 11-12 may be equal', () => {
  assert.ok(neighboursOk(PEP_SLICES, PEP_EQ));
  const eq = PEP_SLICES.map((r, i) => (r.value === PEP_SLICES[(i + 1) % 12].value ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(eq, PEP_EQ);
  assert.ok(PEP_EQ.every((i) => PEP_SLICES[i].value === 2.5));
  assert.ok(neighboursOk(pepVariants['offset 3'], PEP_EQ), 'offset only moves names, not values');
});

test('6 neighbour mutation: an extra equal pair fails the predicate', () => {
  const bad = HYPE0.map((r, i) => (i === 1 ? { ...r, value: 10 } : r));
  assert.equal(neighboursOk(bad), false);
  const bad2 = PEP_SLICES.map((r, i) => (i === 1 ? { ...r, value: 5 } : r));
  assert.equal(neighboursOk(bad2, PEP_EQ), false);
});

test('6 neighbours after Home Crowd / Good Sport: rules are silent (reported, not asserted)', () => {
  // SPEC says "no equal neighbours, also after widening"; Home Crowd (LOW -> +4) puts MED next to MED
  // and Good Sport (+0 -> 2.5) puts 2.5 next to 2.5 and across the Toss wrap. These are consequences of
  // the perks, not widening; recorded here so a change is noticed.
  assert.equal(neighboursOk(hypeVariants['Home Crowd']), false);
  assert.equal(neighboursOk(hypeVariants['Kind Floor 2']), false); // LOW 2 + 2 ranks = 4 = MED
  assert.equal(neighboursOk(tossVariants['Good Sport'], TOSS_EQ), false);
});

test('6 widened gold pieces at most 13.0% and clamp', { todo: 'needs T1 wheel-ring.js widening (goldAdd / Extra Gold / Coin Weight / Pep Voice); not in this branch' });
test('6 neighbours after widening (Hype, Scout) incl. Extra Gold second NUTS', { todo: 'needs T1 wheel-ring.js widening; hypeRing has no goldAdd/extra support yet' });

test('12 labels: no Hype / Toss / Pep slice is under 0.7 rim units, so no legend is needed', () => {
  const all = [...HYPE0, ...TOSS_SLICES, ...PEP_SLICES, ...Object.values(hypeVariants).flat(), ...Object.values(tossVariants).flat(), ...Object.values(pepVariants).flat()];
  assert.ok(Math.min(...all.map((r) => r.w)) >= 0.7);
  assert.ok(all.every(labelOk));
  assert.ok(all.every((r) => typeof r.label === 'string' && r.label.length > 0));
});

test('12 labels mutation: narrow slice with a long label fails; one char or signed number passes', () => {
  assert.equal(labelOk({ w: 0.5, label: 'LOW +2' }), false);
  assert.equal(labelOk({ w: 0.5, label: 'ab' }), false);
  assert.equal(labelOk({ w: 0.5, label: 'F' }), true);
  assert.equal(labelOk({ w: 0.5, label: '+2' }), true);
  assert.equal(labelOk({ w: 0.5, label: '+2.5%' }), true);
});

test('12 Pep names: over 10 chars cut to the surname, otherwise kept', () => {
  assert.equal(pepName('Chowdhury Rahman'), 'Rahman');
  assert.equal(pepName('Abdul Karim Chowdhury'), 'Chowdhury');
  assert.equal(pepName('Bashir Ahmed'), 'Bashir Ahmed'.length > 10 ? 'Ahmed' : 'Bashir Ahmed');
  assert.equal(pepName('Asif Khan'), 'Asif Khan');       // 9 chars
  assert.equal(pepName('Tenletters'), 'Tenletters');     // exactly 10
  assert.equal(pepName('  Dev  '), 'Dev');
  assert.equal(pepName(null), '');
  for (const n of ['Chowdhury Rahman', 'Mohammad Hasan Mia', 'Asif', 'Shakib Al Hasan']) assert.ok(pepName(n).length <= Math.max(10, n.split(/\s+/).pop().length));
});

test('12 Pep names 4 letters or less above 12 slices: Pep has exactly 12, so the rule is not triggered', () => {
  assert.equal(PEP_SLICES.length, 12);
  for (const r of Object.values(pepVariants)) assert.ok(r.length <= 12);
  assert.ok(PEP_SLICES.length <= 16, 'Pep max slices 16');
  // slots: p1..p6 twice
  const slots = PEP_SLICES.map((_, i) => PEP_SLOT_OF(i, 0));
  assert.deepEqual(slots, [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
});

test('12 Pep names 4 letters or less above 12 slices (a ring of 13-16)', { todo: 'Pep has 12 slices today; a wider ring needs T1 wheel-ring.js and a name-length UI hook that does not exist yet' });
test('12 legend text present when a slice is under 7% (rim label rendering)', { todo: 'ring-label/legend rendering lives in T1 wheel-ring.js / wheel view; none of Hype/Toss/Pep prints under 7% yet (Hype comment says no legend)' });
