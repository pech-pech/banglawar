// QA3 NEW-2/3/4/8 through the REAL store + selectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import { matchdayVM, chipsVM } from '../js/store/selectors.js';
import { mdRingOf } from '../js/store/wheels/md.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { matchdayHtml, liveLine } from '../js/ui/matchday-view.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const open = (seed) => { const s = newGame(seed).get(); return C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'OpenMatchday'); };

test('NEW-2: match day pep % is the landed slice (2.5, 5, 7.5, 10)', () => withFlags(ON, () => {
  const s = open('qa3-pep'), ring = mdRingOf(s, 'pep');
  for (const v of [2.5, 5, 7.5, 10]) {
    const i = ring.findIndex((r) => r.value === v); if (i < 0) continue;
    const o = C(s, 'PepSpin', { stop: { sliceId: i } }), vm = matchdayVM(o);
    assert.equal(vm.pep.boostPct, v);
    assert.ok(chipsVM(o).find((c) => c.key === 'pep').text.endsWith(`+${v}%`));
    assert.match(liveLine(vm, 'pep'), new RegExp('plus ' + String(v).replace('.', '\\.') + ' percent'));
  }
}));

test('NEW-3 + NEW-4: No boost says +1 Spoke, never Rival; the row shows what the store adds', () => withFlags(ON, () => {
  const s = open('qa3-toss'), ring = mdRingOf(s, 'toss'), no = ring.findIndex((r) => r.value === 0), yes = ring.findIndex((r) => r.value > 0);
  const before = metaOf(s).spokes, o = C(s, 'TossSpin', { stop: { sliceId: no } }), vm = matchdayVM(o);
  assert.equal(chipsVM(o).find((c) => c.key === 'toss').text, 'No boost. +1 Spoke');
  assert.equal(vm.toss.line, 'No boost. +1 Spoke.');
  const h = matchdayHtml(vm, { hype: false, toss: true, pep: false });
  assert.match(h, /No boost\. \+1 Spoke\./); assert.doesNotMatch(h + liveLine(vm, 'toss'), /Rival|Nothing changes/);
  assert.equal(vm.wm.toss.spokeGain, metaOf(o).spokes - before);
  const w = matchdayVM(C(s, 'TossSpin', { stop: { sliceId: yes } }));
  assert.equal(w.wm.toss.spokeGain, metaOf(C(s, 'TossSpin', { stop: { sliceId: yes } })).spokes - before);
  assert.equal(vm.wm.toss.spokeGain, w.wm.toss.spokeGain + 1);
}));

test('NEW-8: no "Team +0%" before Hype / Toss', () => withFlags(ON, () => {
  const s = open('qa3-team'), ring = mdRingOf(s, 'pep'), o = C(s, 'PepSpin', { stop: { sliceId: ring.findIndex((r) => r.value === 7.5) } }), vm = matchdayVM(o);
  const h = matchdayHtml(vm, { hype: false, toss: false, pep: true });
  assert.doesNotMatch(h, /Team \+0%/);
  assert.match(h, /md-total[^>]*>[^<]*\+7\.5%/);
}));
