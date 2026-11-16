import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoutWheelOpts, cutName, scoutLanded, SCOUT_PARTS } from '../js/ui/wheels/scout-opts.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';
import { makeScoutCards } from '../js/core/scout-cards.js';

const cards = makeScoutCards('seed', 1, 3);
const vm = { ring: SCOUT_SLICES.map((c) => ({ ...c })), cards, spinKey: '1', stored: null, pending: null, J: 1.2 };
const calls = [];
const o = scoutWheelOpts(vm, { dispatch: (t, p) => calls.push([t, p]), onCollect() {}, wobKey: 'k' });

test('ring: 10 cards, 10 units, one gold +2, tiers kept', () => {
  assert.equal(o.ring.length, 10);
  assert.ok(Math.abs(o.ring.reduce((a, r) => a + r.w, 0) - 10) < 0.001);
  assert.equal(o.ring.filter((r) => r.gold).length, 1);
  assert.equal(o.ring[0].value, 2);
  o.ring.forEach((r, i) => { assert.equal(r.id, i); assert.equal(r.card.grade, cards[i].grade); assert.ok(r.card.icon); assert.ok(r.label.includes(cards[i].grade)); });
});
test('surname cut to 6 letters + stop, radial budget keeps parts apart', () => {
  assert.equal(cutName('Okoye'), 'Okoye'); assert.equal(cutName('Abdulrahman'), 'Abdulr.');
  const p = SCOUT_PARTS; assert.ok(p.tier < p.icon && p.icon < p.chip && p.fontMin >= 14);
  assert.ok(o.ring.every((r) => r.card.name.length <= 7));
});
test('kept strings and shape', () => {
  assert.match(o.cardHtml, /What do the scouts bring\?/);
  assert.equal(o.tokText({ steps: 2, extra: 0 }), '+2 steps');
  assert.match(readFileSync(new URL('../js/ui/wheels/scout-opts.js', import.meta.url), 'utf8'), /tokText: \(p\) => scoutWords\(p\)\.short/);
  assert.equal(o.wheelId, 'scout'); assert.equal(o.wobKey, 'k'); assert.equal(o.hub.text, ''); assert.equal(o.hub.ariaHidden, true);
  assert.equal(o.legend.length, 3); assert.ok(o.legend.every((l) => l.ch && l.text));
  o.onSpin({ sliceId: 1 }); assert.deepEqual(calls[0], ['ScoutSpin', { stop: { sliceId: 1 } }]);
});
test('aria: wheel name by tier, landed sentence', () => {
  assert.equal(o.aria.wheel, 'Scout wheel, 10 candidate cards: 1 gold card, centre plus 2 steps, 4 cards centre plus 1 step, 5 cards centre');
  const c = cards[2];
  assert.match(o.aria.landed({ sliceId: 2 }), /^Landed: .+\. Centre plus 1 step\. New card goes first on your list\.$/);
  assert.match(scoutLanded({ grade: 'B+', surname: 'Cruz', focus: 'bal' }, 1), /^Landed: B\+ Cruz, all-rounder\. Centre plus 1 step\./);
  assert.ok(c);
});
test('stored stop passes through, pure (no mutation of vm)', () => {
  const st = { sliceId: 3, value: 1, card: cards[3], tokUsed: 0 };
  const o2 = scoutWheelOpts({ ...vm, stored: st }, { dispatch() {} });
  assert.equal(o2.stored.sliceId, 3); assert.notEqual(o2.stored, st);
  assert.equal(vm.ring[0].gold, true); assert.equal(vm.ring[0].label, 'Centre +2');
});

test('wheel-view: Scout name fit tries shorter cuts down to 3 letters + "." (never one letter); one-char labels sit at the rim with a cream halo', async () => {
  const { readFileSync } = await import('node:fs');
  const w = readFileSync(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
  assert.match(w, /for \(let n = Math\.min\(cs\.length - 1, 5\); n >= 3; n--\)/);
  assert.match(w, /F\.one = true/); assert.match(w, /ONE_HALO/);
});
