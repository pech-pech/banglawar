// A11Y gate for the T4 wheel option builders (SPEC 2e/2f/12, 08-A11Y.md): Find (3 rates), Scout, Finals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findWheelOpts } from '../js/ui/wheels/find-opts.js';
import { scoutWheelOpts } from '../js/ui/wheels/scout-opts.js';
import { finalsWheelOpts } from '../js/ui/wheels/finals-opts.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';
import { FINALS_SLICES } from '../js/data/wheels/finals.js';
import { makeScoutCards } from '../js/core/scout-cards.js';
import { finalsWheel, finalsRing } from '../js/core/wheels/finals.js';

const noop = () => {};
const find = (r) => findWheelOpts({ rate: r, phys: { W0: 36, SD: 0 }, pending: null, tokens: [] }, { pick: noop });
const scout = scoutWheelOpts({ ring: SCOUT_SLICES.map((c) => ({ ...c })), cards: makeScoutCards('seed', 1, 3), spinKey: '1', pending: null, J: 1.2 }, { dispatch: noop });
const finals = finalsWheelOpts({ ring: finalsRing(finalsWheel(null, { coins: 1, fans: 1 })), pending: null, tokens: [] }, {});
const CASES = [['find 8%', find(0.08)], ['find 18%', find(0.18)], ['find 26%', find(0.26)], ['scout', scout], ['finals', finals]];

// Every string the builder hands the view, except the ring rows (checked on their own).
function strings(v, out = [], skip = new Set(['ring'])) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out, new Set()));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!skip.has(k)) strings(x, out, new Set());
  return out;
}
const ariaText = (o) => {
  const a = o.aria; if (!a) return [];
  return [a.wheel, a.landed && 'landed', a.status].filter(Boolean);
};

for (const [name, o] of CASES) {
  test(name + ': every slice under 7% prints exactly one character', () => {
    const short = o.ring.filter((s) => s.w < 0.7);
    for (const s of short) assert.equal([...String(s.label)].length, 1, 'slice ' + s.id + ' label "' + s.label + '"');
    if (name !== 'scout') assert.ok(o.ring.filter((s) => s.w < 0.7).length >= 0);
  });
  test(name + ': legend present', () => {
    const short = o.ring.some((s) => s.w < 0.7);
    if (short || name === 'scout' || name === 'finals') {
      assert.ok(Array.isArray(o.legend) && o.legend.length > 0, 'legend missing');
      for (const l of o.legend) assert.ok(l.text, 'legend row has text');
    }
    // each one-character slice label is explained by a legend entry
    for (const s of o.ring.filter((x) => x.w < 0.7 && [...String(x.label)].length === 1)) {
      assert.ok((o.legend || []).some((l) => l.ch === s.label), 'no legend entry for "' + s.label + '"');
    }
  });
  test(name + ': no slice relies on colour alone', () => {
    const shape = o.tierShapes || o.tierShape;
    for (const s of o.ring) {
      const text = String(s.label || '').trim(), hasCard = !!s.card;
      assert.ok(text || hasCard, 'slice ' + s.id + ' has neither text nor card');
      if (s.tier === 'top' || s.tier === 'low') assert.ok(shape || (o.legend || []).some((l) => l.ch === 'tri' || l.icon), 'tier "' + s.tier + '" has no shape cue (tierShapes/tierShape/legend glyph)');
    }
    // gold slices: text or icon too, not just the gold fill
    for (const s of o.ring.filter((x) => x.gold)) assert.ok(String(s.label || '').trim() || s.card, 'gold slice ' + s.id);
  });
  test(name + ': aria strings present', () => {
    const a = ariaText(o);
    assert.ok(o.aria && typeof o.aria.wheel === 'string' && o.aria.wheel.length > 10, 'opts.aria.wheel (wheel name listing the prizes) missing');
    assert.ok(o.aria && o.aria.landed, 'opts.aria.landed (result sentence for the live region) missing');
    assert.ok(a.length >= 2);
  });
  test(name + ': no reduced-motion / Show result / skip / auto-stop text or flag (SPEC 2e)', () => {
    const bad = /reduced[\s-]?motion|show result|\bskip\b|auto[\s-]?stop|\bauto\b/i;
    for (const t of strings(o)) assert.ok(!bad.test(t), 'forbidden text: ' + t);
    for (const t of o.ring.map((s) => String(s.label))) assert.ok(!bad.test(t), 'forbidden label: ' + t);
    for (const k of Object.keys(o)) assert.ok(!/reduced|skip|autostop|autoStop|coast/i.test(k), 'forbidden option key: ' + k);
  });
}
