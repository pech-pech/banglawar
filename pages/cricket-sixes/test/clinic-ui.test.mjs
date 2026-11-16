import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boostParts, boostTotalText, boostChipsHtml, boostTotalHtml, normBoost } from '../js/ui/boost-chip.js';
import { lineHtml, lineText } from '../js/ui/nets-scene.js';
import { clinicPickHtml, pickRows } from '../js/ui/clinic-pick-sheet.js';
import * as tv from '../js/ui/training-view.js';
import * as cs from '../js/ui/coaches-sheet.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('boost chips: per spin, total, extra run, bad input', () => {
  assert.deepEqual(boostParts({ pcts: [10, 5], extraRun: true }), ['Clinic +10%', 'Clinic +5%', 'Extra run']);
  assert.equal(boostTotalText({ pcts: [10, 5] }), 'Clinic +15%');
  assert.equal(boostTotalText({ pct: 15 }), 'Clinic +15%');
  assert.equal(boostTotalText(null), ''); assert.equal(boostChipsHtml(undefined), ''); assert.equal(boostTotalHtml({ pcts: [] }), '');
  assert.deepEqual(normBoost({ pcts: ['x', -3, 20] }).pcts, [20]);
  assert.match(boostChipsHtml({ pcts: [5], extraRun: true }), /cn-chip--gold/);
  assert.ok(!/perk|bond/i.test(boostChipsHtml({ pcts: [5] })));
});

test('nets lineHtml shows the boost total; no boost = unchanged', () => {
  const l = { id: 'a', name: 'Rafi', stat: 'bp', fromRaw: 20, toRaw: 24, word: 'Good' };
  assert.ok(!/cn-chip/.test(lineHtml(l)));
  const b = { ...l, boost: { pcts: [10, 5] } };
  assert.match(lineHtml(b), /Clinic \+15%/); assert.match(lineText(b), /Clinic \+15%/);
});

test('pick sheet: grey rows with reason, Later, aria, 56 px css', () => {
  const squad = [{ id: 'p1', name: 'Rafi', batPower: 20, batSkill: 20, bowlSpeed: 20, bowlSkill: 20 }, { id: 'p2', name: 'Tariq', batPower: 30, batSkill: 30, bowlSpeed: 30, bowlSkill: 30 }];
  const s = { training: { focus: 'bat' }, clubs: [{ id: 'c0', squad }] };
  const rows = pickRows(s, { pickable: () => [{ playerId: 'p1', ok: true }, { playerId: 'p2', ok: false, why: 'At the cap' }] });
  assert.equal(rows.length, 2); assert.equal(rows[1].why, 'At the cap'); assert.equal(rows[0].why, '');
  const h = clinicPickHtml({ coachName: 'Lee', rows });
  assert.equal((h.match(/data-cn="pick"/g) || []).length, 2);
  assert.equal((h.match(/aria-disabled="true"/g) || []).length, 1);
  assert.match(h, /At the cap/); assert.match(h, /data-cn="later"[^>]*>Later/); assert.match(h, /aria-describedby="cn-why-1"/);
  assert.match(clinicPickHtml({ rows: [] }), /No player can gain/);
  assert.match(read('css/clinic.css'), /\.cn-row \{[^}]*min-height: 56px/); assert.match(read('css/clinic.css'), /\.cn-later \{[^}]*min-height: 56px/); assert.match(read('css/clinic.css'), /\.cn-btn \{[^}]*min-height: 56px/);
});

test('slotClinicBtn states', () => {
  for (const m of [tv, cs]) {
    assert.equal(m.slotClinicBtn({}, {}), ''); assert.equal(m.slotClinicBtn(null, null), '');
    assert.equal(m.slotClinicBtn(null, { id: 'k1', name: 'Lee' }), '', 'no clinic data, not away');
    const rd = m.slotClinicBtn(null, { id: 'k1', name: 'Lee', clinic: { state: 'ready' } });
    assert.match(rd, /cn-btn-ready/); assert.match(rd, /Spin ready/); assert.ok(!/aria-disabled/.test(rd)); assert.ok(!/class="ct-slot/.test(rd));
    const used = m.slotClinicBtn(null, { id: 'k1', name: 'Lee', clinic: { state: 'used', prize: 'Clinic +10%', playerName: 'Rafi' } });
    assert.match(used, /aria-disabled="true"/); assert.match(used, /Clinic \+10% Rafi/);
    assert.match(m.slotClinicBtn(null, { id: 'k1', name: 'Lee', clinic: { state: 'nets' } }), /Nets done/);
    assert.match(m.slotClinicBtn(null, { id: 'k1', name: 'Lee', away: 1 }), /On course/);
  }
});

test('click slot: ready opens clinicpick, grey does not, other clicks pass', () => {
  for (const m of [tv, cs]) {
    const mk = (attrs) => ({ target: { closest: (q) => (q === '[data-cn="spin"]' && attrs ? { getAttribute: (k) => attrs[k] ?? null } : null) } });
    const calls = []; const ctx = { where: 'training', open: (...a) => calls.push(a), close: () => calls.push(['close']) };
    assert.equal(m.slotClick(mk(null), ctx), false);
    assert.equal(m.slotClick(mk({ 'data-id': 'k1' }), ctx), true);
    assert.deepEqual(calls, [['close'], ['clinicpick', { coachId: 'k1' }]]);
    calls.length = 0;
    assert.equal(m.slotClick(mk({ 'data-id': 'k1', 'aria-disabled': 'true' }), ctx), true); assert.equal(calls.length, 0);
  }
});

test('squad-view source carries boost chips', () => { assert.match(read('js/ui/squad-view.js'), /boostChipsHtml/); });

import { lineHtml as __lh, lineText as __lt } from '../js/ui/nets-scene.js';
test('nets line shows the core line.clinic chip and extra run', () => {
  const l = { id: 'p', name: 'Rafi', stat: 'bp', fromRaw: 10, toRaw: 12, word: 'Good', clinic: { pcts: [10, 5], pct: 15, extra: 1, extraRun: { gain: 1 } } };
  assert.match(__lh(l), /Clinic \+15%/); assert.match(__lt(l), /Extra run/);
  assert.doesNotMatch(__lt({ ...l, clinic: { pcts: [5], pct: 5, extra: 0, extraRun: { skipped: true } } }), /Extra run/);
});
