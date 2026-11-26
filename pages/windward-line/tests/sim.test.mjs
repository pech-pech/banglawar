import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, startRun, step, queueCallin, runToEnd, hashState, causeLine } from '../js/sim.js';
import { buildMap, validateMap } from '../js/map.js';
import { defaultCfg, STAGES } from '../js/contract.js';
import { applyPlan, runBot, idlePlan, naivePlan, skilledPlan } from './plans.mjs';

const hashOf = (stage, seed, extra) => {
  const s = createState(stage, defaultCfg, seed);
  applyPlan(s, skilledPlan(s).slice(0, 3)); if (extra) applyPlan(s, extra(s));
  startRun(s); runToEnd(s, 20000); return hashState(s);
};

test('validateMap both stages empty', () => {
  for (const st of [1, 2]) assert.deepEqual(validateMap(buildMap(st)), [], 'stage ' + st);
});

test('run finishes under 20000 ticks', () => {
  for (const st of [1, 2]) {
    const s = createState(st, defaultCfg, 7); startRun(s); runToEnd(s, 20000);
    assert.equal(s.phase, 'result'); assert.ok(s.tick < 20000, 'ticks ' + s.tick);
  }
});

test('same seed + plan -> same hash', () => {
  assert.equal(hashOf(1, 5), hashOf(1, 5));
});

// cost-neutral change: the same 31-cell break moved 6 rows, money equal, so only the fire/people outcome can differ
test('cost-neutral plan change -> different hash and different outcome on some seed 1..5', () => {
  const run = (seed, y) => {
    const s = createState(1, defaultCfg, seed);
    applyPlan(s, skilledPlan(s).slice(0, 3));
    const rej = applyPlan(s, [{ t: 'break', x0: 30, y0: y, x1: 60, y1: y, width: 1 }]);
    assert.equal(rej.length, 0);
    startRun(s); runToEnd(s, 20000);
    return { hash: hashState(s), pct: s.result.pct, burnt: s.counts.burnt, money: Math.round(s.money) };
  };
  let diffHash = 0, diffOutcome = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const a = run(seed, 50), b = run(seed, 56);
    assert.equal(a.money, b.money, 'money must be equal');
    if (a.hash !== b.hash) diffHash++;
    if (a.pct !== b.pct || a.burnt !== b.burnt) diffOutcome++;
  }
  assert.ok(diffHash >= 1, 'hash differs on at least one seed');
  assert.ok(diffOutcome >= 1, 'pct or burnt differs on at least one seed');
});

test('retry: same seed + plan + replayed inputs -> same hash', () => {
  const play = (replay) => {
    const s = createState(1, defaultCfg, 3);
    applyPlan(s, skilledPlan(s));
    if (replay) s.replay = replay.map((r) => ({ ...r }));
    startRun(s);
    for (let n = 0; s.phase === 'run' && n < 20000; n++) {
      if (!replay && (s.tick === 30 || s.tick === 80)) queueCallin(s, 'bomber', 48, 60 + (s.tick > 50 ? 10 : 0));
      step(s);
    }
    return s;
  };
  const a = play(null);
  assert.equal(a.inputs.length, 2, 'two live call-ins recorded');
  const b = play(a.inputs);
  assert.deepEqual(b.inputs, a.inputs, 'replay re-records identical inputs');
  assert.equal(hashState(b), hashState(a));
  const c = play([]); // no inputs = different run
  assert.notEqual(hashState(c), hashState(a));
});

test('idle stage 2 loss rate (tuning target >= 95%)', () => {
  let loss = 0; const N = 200;
  for (let seed = 1; seed <= N; seed++) { const r = runBot('idle', 2, seed); if (!r.result.win) loss++; }
  const rate = loss / N; console.log(`idle stage 2 loss rate: ${(rate * 100).toFixed(1)}% over ${N} seeds`);
  assert.ok(rate >= 0.95, `TUNING TARGET: idle stage 2 should lose >= 95% of seeds, got ${(rate * 100).toFixed(1)}%`);
});

test('skilled stage 1 win rate (tuning target >= 60%)', () => {
  let win = 0; const N = 50, secs = [];
  for (let seed = 1; seed <= N; seed++) { const r = runBot('skilled', 1, seed); if (r.result.win) win++; secs.push(r.result.sec); }
  const rate = win / N;
  console.log(`skilled stage 1 win rate: ${(rate * 100).toFixed(0)}% over ${N}; mean sec ${(secs.reduce((a, b) => a + b, 0) / N).toFixed(1)} (target ~${STAGES[1].targetSec})`);
  assert.ok(rate >= 0.6, `TUNING TARGET: skilled stage 1 should win >= 60%, got ${(rate * 100).toFixed(0)}%`);
});

test('causeLine non-empty for failed run; sec reported', () => {
  let r; for (let seed = 1; seed <= 40; seed++) { r = runBot('idle', 2, seed); if (!r.result.win) break; }
  assert.ok(!r.result.win, 'no failing idle stage 2 run in seeds 1..40');
  const line = causeLine(r.state);
  console.log('cause:', line);
  assert.ok(typeof line === 'string' && line.length > 0);
  assert.ok(r.result.cause && r.result.cause.length > 0);
  for (const st of [1, 2]) {
    const q = runBot('skilled', st, 1);
    console.log(`stage ${st} skilled sec=${q.result.sec} (target ~${STAGES[st].targetSec}) pct=${q.result.pct} rejected=${JSON.stringify(q.rejected)}`);
    assert.ok(q.result.sec > 0);
  }
});

// balance-1 (QA-A/QA-B: proto too easy). Idle must not win stage 1; one big box must usually lose stage 2.
test('idle stage 1 loses seed 1 and >= 90% of seeds 1..100', () => {
  assert.ok(!runBot('idle', 1, 1).result.win, 'idle stage 1 seed 1 must lose');
  let loss = 0; const N = 100;
  for (let seed = 1; seed <= N; seed++) if (!runBot('idle', 1, seed).result.win) loss++;
  console.log(`idle stage 1 loss rate: ${loss}% over ${N} seeds`);
  assert.ok(loss / N >= 0.9, `TUNING TARGET: idle stage 1 should lose >= 90%, got ${loss}%`);
});

test('bigbox stage 2 loses >= 60% of seeds', () => {
  let loss = 0; const N = 100;
  for (let seed = 1; seed <= N; seed++) if (!runBot('bigbox', 2, seed).result.win) loss++;
  console.log(`bigbox stage 2 loss rate: ${loss}% over ${N} seeds`);
  assert.ok(loss / N >= 0.6, `TUNING TARGET: one big shelter should lose stage 2 >= 60%, got ${loss}%`);
});

test('win line reads as one line with losses', () => {
  const r = runBot('skilled', 1, 1);
  console.log('win line:', r.result.cause);
  if (r.result.win) assert.match(r.result.cause, /^Passed: \d+% alive( \(\d+ lost\)(\. First loss: [a-z-]+ at \d+:\d\d)?)?$/);
});

// per-kind causeLine, synthetic event lists (stage 1 state, positions chosen per side)
test('causeLine per kind', () => {
  const mk = (pct, events, zones = [{}]) => {
    const s = createState(1, defaultCfg, 1);
    s.zones = zones; s._pct = pct; s.counts.alive = pct; s.counts.people0 = 100;
    for (const e of events) {
      const ev = { tick: 100, x: 48, y: 20, text: '', ...e }; s.events.push(ev);
      if (!s.firstBreach && ['break-breach', 'ember-jump', 'gate-closed', 'zone-hit', 'road-cut'].includes(ev.kind)) s.firstBreach = ev;
    }
    return causeLine(s);
  };
  const loss = { kind: 'first-loss', tick: 120 };
  assert.match(mk(20, [{ kind: 'wind-shift', tick: 50 }, { kind: 'break-breach' }, loss]), /^Wind shift hit [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'break-breach' }, loss]), /^Fire broke the [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'ember-jump' }, loss]), /^Embers jumped the [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'zone-hit' }, loss]), /^Embers reached the [a-z-]+ shelter at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'road-cut' }, loss]), /^Road cut [a-z-]+ at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'gate-closed' }, loss]), /^Gate closed at the [a-z-]+ shelter at \d+:\d\d$/);
  assert.match(mk(20, [loss], []), /^No shelter: fire reached people in the [a-z-]+ at \d+:\d\d$/);
  assert.match(mk(20, [loss]), /^Fire reached people in the [a-z-]+ at \d+:\d\d, no shelter near$/);
  assert.match(mk(64, [loss]), /^Passed: 64% alive \(36 lost\)\. First loss: [a-z-]+ at \d+:\d\d$/);
  assert.equal(mk(100, []), 'Passed: 100% alive');
});
