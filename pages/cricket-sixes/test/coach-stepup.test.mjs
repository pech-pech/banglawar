import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingStepUps, stepUpHtml, canShowStepUp, consumeStepUp } from '../js/ui/stepup-card.js';

const mk = () => ({ coaches: [
  { id: 'c1', name: 'Lee', step: 7, strong: ['bat'], away: 0, stepUpPending: 1 },
  { id: 'c2', name: 'Ray', step: 9, strong: ['bowl'], away: 0, stepUpPending: 0 },
  { id: 'c3', name: 'Sam', step: 12, strong: ['bat'], away: 0, stepUpPending: 2 },
] });

test('T7.4 card shows once, html names coach and letter with 56px OK', () => {
  const q = pendingStepUps({ coaches: [mk().coaches[0]] });
  assert.equal(q.length, 1);
  const h = stepUpHtml(q[0]);
  assert.match(h, /Coach Lee is now /);
  assert.match(h, /data-cw="stepup-ok"/);
  const n = { coaches: [{ ...mk().coaches[0] }] };
  consumeStepUp(n, 'c1');
  assert.equal(pendingStepUps(n).length, 0);
});

test('T7.5 queues behind wheel, match overs, nets scene', () => {
  assert.equal(canShowStepUp({ wheelOpen: true }), false);
  assert.equal(canShowStepUp({ matchLive: true }), false);
  assert.equal(canShowStepUp({ netsScene: true }), false);
  assert.equal(canShowStepUp({ wheelOpen: false, matchLive: false, netsScene: false }), true);
});

test('T7.6 two step-ups queue in order, one card each', () => {
  const q = pendingStepUps(mk());
  assert.deepEqual(q.map((e) => e.coachId), ['c1', 'c3', 'c3']);
  const n = mk();
  consumeStepUp(n, 'c3');
  assert.equal(pendingStepUps(n).length, 2);
  consumeStepUp(n, 'c3'); consumeStepUp(n, 'c3'); consumeStepUp(n, 'c3');
  assert.equal(n.coaches[2].stepUpPending, 0);
});

test('T7.7 reload with card pending shows once (queue is a pure function of state)', () => {
  const s = JSON.parse(JSON.stringify(mk()));
  assert.equal(pendingStepUps(s).length, 3);
  assert.deepEqual(pendingStepUps(s), pendingStepUps(JSON.parse(JSON.stringify(s))));
});

test('T7.9 stepUpPending survives a JSON round trip; bad values read as 0', () => {
  const s = JSON.parse(JSON.stringify(mk()));
  assert.equal(s.coaches[2].stepUpPending, 2);
  s.coaches[0].stepUpPending = -3; s.coaches[1].stepUpPending = 'x';
  assert.equal(pendingStepUps(s).length, 2);
});
