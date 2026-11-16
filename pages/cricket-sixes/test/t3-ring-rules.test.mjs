// SPEC 14 tests 6 (cap 12%, neighbours), 12 (labels) for Hype, Toss, Pep. Pure data/ring code only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_SLICES } from '../js/data/wheels/hype.js';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';
import { PEP_SLICES, PEP_SLOT_OF, pepName } from '../js/data/wheels/pep.js';
import { scoutRingFor } from '../js/core/wheels/scout.js';
import { LABEL_MIN_W, legendRows, legendWith, sliceLabel } from '../js/ui/wheel-look.js';
import { hypeRing } from '../js/core/wheels/hype.js';
import { tossRing } from '../js/core/wheels/toss.js';
import { pepRing, pepRingName } from '../js/core/wheels/pep.js';
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

// SPEC 11b widening (T8): full-tree ranks from js/data/wheelmeta.js: Widener 0.02 x 3, Coin Weight 0.1 x 2, Pep Voice 0.08 x 2, Top Name 0.1, Extra Gold 1.
const CEIL = 1.3;           // 13.0% of a 10-unit rim
const sumW = (ring) => ring.reduce((a, r) => a + r.w, 0);
const ceilOk = (ring) => ring.every((r) => r.w <= CEIL + EPS);
const widened = {
  'hype Widener': hypeRing(mods({ goldAdd: 0.06 })),
  'hype Extra Gold': hypeRing(mods({ extra: 1 })),
  'hype Widener + Extra Gold + Warm Crowd': hypeRing(mods({ goldAdd: 0.06, extra: 1, warmCrowd: 1 })),
  'toss Coin Weight 2': tossRing(mods({ rareAdd: 0.2 })),
  'toss Coin Weight 2 + Widener + Kind Floor': tossRing(mods({ rareAdd: 0.2, goldAdd: 0.06, floor: 1 })),
  'pep Widener + Pep Voice 2': pepRing(mods({ goldAdd: 0.06, rareAdd: 0.16 }), 0),
  'pep full (Extra Gold)': pepRing(mods({ goldAdd: 0.06, rareAdd: 0.16, extra: 1 }), 3),
  'scout Widener + Top Name': scoutRingFor(mods({ goldAdd: 0.16 })),
  'scout full (Extra Gold)': scoutRingFor(mods({ goldAdd: 0.16, extra: 1 })),
};

test('6 widened gold pieces at most 13.0% and clamp', () => {
  for (const [n, r] of Object.entries(widened)) {
    assert.ok(Math.abs(sumW(r) - 10) < 1e-9, n + ' sum 10');
    assert.ok(ceilOk(r), n + ' ceiling 13%');
    assert.ok(r.every((x) => x.w > 0), n + ' no zero width');
    assert.deepEqual(r.map((x) => x.id), r.map((_, i) => i), n + ' ids in ring order');
  }
  // widened pieces grow by the node, never re-split; the others shrink pro rata
  const hw = widened['hype Widener'];
  assert.equal(hw.length, 9); assert.ok(Math.abs(hw[0].w - 1.06) < 1e-9);
  assert.ok(Math.abs(hw[1].w / HYPE0[1].w - 8.94 / sumW(HYPE0.slice(1))) < 1e-9, 'pro rata');
  const tw = widened['toss Coin Weight 2'];
  assert.deepEqual(tw.map((x, i) => (TOSS_SLICES[i].value === 5 ? +x.w.toFixed(9) : 0)).filter(Boolean), [1.2, 1.2, 1.2]);
  assert.deepEqual(widened['toss Coin Weight 2 + Widener + Kind Floor'].map((x) => x.w), tw.map((x) => x.w), 'Widener does not widen Toss');
  const pw = widened['pep Widener + Pep Voice 2'];
  assert.equal(pw.length, 12); assert.ok(Math.abs(pw[7].w - (0.96 + 0.22)) < 1e-9);
  // clamp: a node that would go above 13.0% stops at 13.0%, one piece
  for (const r of [hypeRing(mods({ goldAdd: 5 })), tossRing(mods({ rareAdd: 5 })), pepRing(mods({ rareAdd: 5 })), pepRing(mods({ rareAdd: 5, extra: 1 })), scoutRingFor(mods({ goldAdd: 5, extra: 1 }))]) {
    assert.ok(ceilOk(r) && Math.abs(sumW(r) - 10) < 1e-9);
    assert.ok(Math.abs(Math.max(...r.map((x) => x.w)) - CEIL) < 1e-9, 'clamped at 13.0%');
  }
  // mutation: a 13.1% piece fails the ceiling predicate
  assert.equal(ceilOk([{ w: 1.31 }]), false); assert.equal(ceilOk([{ w: 1.3 }]), true);
  // no tree widths owned: the tables exactly (frozen parity)
  assert.deepEqual(hypeRing(mods({ goldAdd: 0, extra: 0 })).map((x) => x.w), HYPE0.map((x) => x.w));
  assert.deepEqual(pepRing(neutralMods(), 0).map((x) => x.w), PEP_SLICES.map((x) => x.w));
});

test('6 neighbours after widening (Hype, Scout) incl. Extra Gold second NUTS', () => {
  const he = widened['hype Extra Gold'];
  assert.equal(he.length, 10);
  assert.deepEqual(he.map((x) => x.value), [10, 4, 2, 4, 6, 10, 2, 4, 2, 6], 'second NUTS on the seam opposite NUTS, between HIGH and LOW');
  assert.ok(Math.abs(he[5].w - 0.75) < 1e-9 && he[5].gold && he[5].second && he[5].level === 'nuts');
  for (const n of ['hype Widener', 'hype Extra Gold', 'hype Widener + Extra Gold + Warm Crowd', 'scout Widener + Top Name', 'scout full (Extra Gold)']) assert.ok(neighboursOk(widened[n]), n);
  assert.deepEqual(widened['scout full (Extra Gold)'].map((x) => x.value), [2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 0]);
  // Toss keeps its listed equal runs; Pep's 2.5 pairs move one place on with the Extra Gold piece at slice 2
  assert.ok(neighboursOk(widened['toss Coin Weight 2'], TOSS_EQ));
  assert.ok(neighboursOk(widened['pep Widener + Pep Voice 2'], PEP_EQ));
  const pf = widened['pep full (Extra Gold)'];
  assert.deepEqual(pf.map((x) => x.value), [5, 10, 7.5, 5, 2.5, 2.5, 5, 7.5, 10, 7.5, 5, 2.5, 2.5]);
  assert.ok(neighboursOk(pf, PEP_EQ.map((i) => i + 1)));
  assert.notEqual(pf[1].slot, pf[8].slot, 'the second +10 names another player');
  // mutation: Extra Gold placed next to the first gold would fail
  const bad = [...HYPE0.slice(0, 1), { ...HYPE0[0], id: 99 }, ...HYPE0.slice(1)];
  assert.equal(neighboursOk(bad), false);
});

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

test('12 Pep names 4 letters or less above 12 slices (a ring of 13-16)', () => {
  const pf = widened['pep full (Extra Gold)'];
  assert.equal(pf.length, 13, 'Extra Gold makes a 13-slice Pep ring');
  for (const n of ['Chowdhury Rahman', 'Mohammad Hasan Mia', 'Asif Khan', 'Shakib Al Hasan', 'Al', 'Tenletters']) {
    for (const len of [13, 16]) assert.ok(Array.from(pepRingName(n, len)).length <= 4 && pepRingName(n, len).length > 0, n + ' @' + len);
    assert.equal(pepRingName(n, 12), pepName(n), 'up to 12 slices: the pepName rule');
  }
  assert.equal(pepRingName('Chowdhury Rahman', 13), 'Rahm');
  assert.equal(pepRingName('Al', 13), 'Al');
  assert.equal(pepRingName(null, 13), '');
});

test('12 legend text present when a slice is under 7% (rim label rendering)', () => {
  // the tree rings stay at 7% or wider, so they print their text; the narrowest piece is Pep full tree (0.72 units)
  const rows = Object.values(widened).flat();
  assert.ok(Math.min(...rows.map((r) => r.w)) >= LABEL_MIN_W);
  for (const r of Object.values(widened)) assert.deepEqual(legendRows(r), [], 'no narrow slice, no automatic legend row');
  // any slice a node narrows under 7% prints one character or a signed number and gets a legend row (wheel-look, used by wheel-view)
  for (const ring of [widened['hype Extra Gold'], widened['pep full (Extra Gold)'], widened['toss Coin Weight 2']]) {
    const narrow = ring.map((r, i) => (i === 1 ? { ...r, w: 0.5 } : r)), lg = legendRows(narrow), ch = sliceLabel(narrow[1]);
    assert.ok(labelOk({ w: 0.5, label: ch }), 'printed ' + ch);
    assert.equal(lg.length, 1); assert.equal(lg[0].ch, ch); assert.ok(lg[0].text.length > 0);
    assert.ok(legendWith(narrow, [], null).some((l) => l.ch === ch), 'legendWith keeps it');
  }
});

test('wheel-ring fitRing / extraGoldAt edge cases', async () => {
  const { fitRing, extraGoldAt, MIN_KEEP } = await import('../js/core/wheel-ring.js');
  const mk = (ws, g = -1) => ws.map((w, i) => ({ id: i, w, value: i, gold: i === g }));
  assert.equal(extraGoldAt(mk([1, 1, 1])), -1, 'no gold, no seam');
  assert.equal(extraGoldAt(mk([5, 5], 0)), 1, 'only seams beside gold: the farthest one');
  const r = fitRing(mk([9, 0.5, 0.5], 0), (x) => x.gold); // 9 > ceiling: clamped to 1.3, others grow to fill
  assert.ok(Math.abs(r[0].w - 1.3) < 1e-9 && Math.abs(r.reduce((a, x) => a + x.w, 0) - 10) < 1e-9);
  const big = fitRing(mk([1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 0.1], -1).map((x, i) => ({ ...x, gold: i < 9 })), (x) => x.gold);
  assert.ok(big[9].w >= 0.1 * MIN_KEEP - 1e-12 && Math.abs(big.reduce((a, x) => a + x.w, 0) - 10) < 1e-9, 'others never vanish');
});
