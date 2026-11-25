import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, startRun, runToEnd, hashState, causeLine } from '../js/sim.js';
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

test('same seed + plan -> same hash; changed plan -> different hash', () => {
  assert.equal(hashOf(1, 5), hashOf(1, 5));
  const extra = (s) => [{ t: 'break', x0: 20, y0: 80, x1: 30, y1: 80, width: 1 }]; // cheap, money changes the hash
  assert.notEqual(hashOf(1, 5), hashOf(1, 5, extra));
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
