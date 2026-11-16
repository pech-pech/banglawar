import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepUpSeenSpin } from '../js/store/spins/coach-stepup.js';
import { shouldShowStepUp } from '../js/ui/stepup-sheet.js';

const mk = () => ({ coaches: [{ id: 'a', name: 'Rao', step: 3, stepUpPending: 2 }, { id: 'b', name: 'Sen', step: 2, stepUpPending: 0 }] });

test('StepUpSeen consumes one, immutably', () => {
  const s = mk(), n = stepUpSeenSpin(s, { coachId: 'a' });
  assert.equal(n.coaches[0].stepUpPending, 1);
  assert.equal(s.coaches[0].stepUpPending, 2);
  assert.notEqual(n, s);
});
test('StepUpSeen never goes below 0 and ignores unknown coach', () => {
  const s = mk();
  assert.equal(stepUpSeenSpin(s, { coachId: 'b' }), s);
  assert.equal(stepUpSeenSpin(s, { coachId: 'zz' }), s);
  assert.equal(stepUpSeenSpin(s, null), s);
});
test('shouldShowStepUp respects ui flags', () => {
  const s = mk();
  assert.equal(shouldShowStepUp(s, {}), true);
  assert.equal(shouldShowStepUp(s, { wheelOpen: true }), false);
  assert.equal(shouldShowStepUp(s, { matchLive: true }), false);
  assert.equal(shouldShowStepUp(s, { netsScene: true }), false);
  assert.equal(shouldShowStepUp({ coaches: [] }, {}), false);
});
test('wired in fences', () => {
  assert.match(readFileSync(new URL('../js/install.js', import.meta.url), 'utf8'), /coach-stepup\.js[\s\S]*INSTALL:T5 end/);
  assert.match(readFileSync(new URL('../js/ui/app.js', import.meta.url), 'utf8'), /stepup: \{ file: 'stepup-sheet'[\s\S]*SHEETS:T5 end/);
});

import { installStepUpWatcher } from '../js/ui/stepup-sheet.js';
const pend = (extra = {}) => ({ coaches: [{ id: 'c1', name: 'A', step: 3, stepUpPending: 1 }], ...extra });
const fakeEnv = (over = false) => {
  const subs = []; const opened = [];
  return { subs, opened, env: { store: { subscribe: (f) => { subs.push(f); return () => {}; } }, openByName: (n) => opened.push(n), overlayOpen: () => over } };
};
test('watcher opens stepup when pending and idle', () => {
  const f = fakeEnv(); installStepUpWatcher(f.env); f.subs[0](pend({ stage: 'hub' }));
  assert.deepEqual(f.opened, ['stepup']);
});
test('watcher waits for overlay, live match, none pending', () => {
  const a = fakeEnv(true); installStepUpWatcher(a.env); a.subs[0](pend({ stage: 'hub' }));
  const b = fakeEnv(); installStepUpWatcher(b.env); b.subs[0](pend({ stage: 'bowl' }));
  const c = fakeEnv(); installStepUpWatcher(c.env); c.subs[0]({ stage: 'hub', coaches: [] });
  assert.deepEqual([a.opened, b.opened, c.opened], [[], [], []]);
});

test('makeOpenByName clicks a hidden data-act sheet button inside the app root', async () => {
  const { makeOpenByName } = await import('../js/ui/stepup-sheet.js');
  const seen = [];
  const mkEl = () => { const a = {}; return { setAttribute: (k, v) => { a[k] = v; }, getAttribute: (k) => a[k], click() { seen.push(a['data-act']); }, parentNode: null }; };
  const root = { appendChild(e) { e.parentNode = { removeChild() { seen.push('removed'); } }; } };
  const open = makeOpenByName(root, { createElement: mkEl });
  assert.equal(open('stepup'), true);
  assert.deepEqual(seen, ['sheet:stepup', 'removed']);
});
