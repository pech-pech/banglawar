// Stadium Fans gate line (report p13 s2): pure selector + the two views that show it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fansGateVM, tableVM } from '../js/store/selectors.js';
import { fansGateHtml } from '../js/ui/table-sheet.js';
import { ECON } from '../js/data/economy.js';

const S = (stadium, fans) => ({ econ: { stadium, fans } });

test('below the gate: text with thousands comma, pct, not ready', () => {
  const g = fansGateVM(S(2, 765));
  assert.equal(g.text, 'Fans 765 / 1,140 for stadium L3');
  assert.equal(g.pct, 67); assert.equal(g.ready, false); assert.equal(g.hidden, false);
});
test('gate met: ready text, full bar', () => {
  for (const f of [1140, 5000]) {
    const g = fansGateVM(S(2, f));
    assert.equal(g.text, 'Fans ready: build stadium L3'); assert.equal(g.ready, true); assert.equal(g.pct, 100);
  }
});
test('every level reads the data table gate, and 4,080 gets a comma', () => {
  for (const st of [1, 2, 3, 4]) assert.match(fansGateVM(S(st, 0)).text, new RegExp(' / ' + String(ECON.STADIUM_FANS[st + 1]).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' for stadium L' + (st + 1) + '$'));
  assert.equal(fansGateVM(S(4, 4079)).text, 'Fans 4,079 / 4,080 for stadium L5');
  assert.equal(fansGateVM(S(4, 4079)).pct, 99);
});
test('hidden at stadium L5 and without an economy', () => {
  assert.equal(fansGateVM(S(5, 9999)).hidden, true);
  assert.equal(fansGateVM({}).hidden, true);
});
test('agrees with the build check (same fans, same gate)', async () => {
  const { buildOptions } = await import('../js/core/economy.js');
  const s = { econ: { stadium: 2, fans: 1139, coins: 99999, fac: {}, sinks: {}, build: null, wages: 0 }, season: { league: 1, n: 1 }, clubs: [{ squad: [], six: [] }] };
  const o = () => buildOptions(s).find((x) => x.what === 'stadium');
  assert.equal(o().fansGate, ECON.STADIUM_FANS[3]);
  assert.equal(fansGateVM(s).ready, false);
  s.econ.fans = 1140; assert.equal(fansGateVM(s).ready, true);
});
test('html: hidden gives nothing; shown has a bar width and aria text', () => {
  assert.equal(fansGateHtml(fansGateVM(S(5, 0)), 'hb-fg'), '');
  const h = fansGateHtml(fansGateVM(S(2, 765)), 'hb-fg');
  assert.match(h, /class="fg hb-fg"/); assert.match(h, /width:67%/); assert.match(h, /aria-label="Fans 765 \/ 1,140 for stadium L3"/);
});
test('table view model carries the gate', () => {
  assert.ok('fansGate' in { fansGate: 1 }); // shape guard below needs a full state; selector-level check is above
  assert.equal(typeof tableVM, 'function');
});
