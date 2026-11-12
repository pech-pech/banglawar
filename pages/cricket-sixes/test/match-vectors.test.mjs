import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballProbs, outcomeFromX } from '../js/core/match.js';

const V = JSON.parse(readFileSync(new URL('./ball-vectors.json', import.meta.url), 'utf8')).vectors;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9, `${msg}: got ${a}, want ${b}`);

test('500 ball vectors present, each with wk_lost and over', () => {
  assert.equal(V.length, 500);
  assert.ok(V.every((v) => Number.isInteger(v.wk_lost) && Number.isInteger(v.over)));
});

test('ballProbs + outcomeFromX match every frozen vector', () => {
  for (const v of V) {
    const b = { bat: v.bat.type, bp: v.bat.bp, bs: v.bat.bs };
    const w = { bowl: v.bowl.type, spd: v.bowl.spd, bsk: v.bowl.bsk };
    const r = ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost);
    for (const k of ['wicket', 'six', 'four', 'two', 'single']) near(r.p[k], v.p[k], `#${v.id} p.${k}`);
    near(r.singleRaw, v.p_single_raw, `#${v.id} singleRaw`);
    near(r.dot, v.p_dot, `#${v.id} dot`);
    assert.equal(String(outcomeFromX(r.p, r.singleRaw, v.x)), String(v.outcome), `#${v.id} outcome`);
  }
});

test('over/lost may also come before fx (alternate argument order) and give the same numbers', () => {
  for (const v of V.slice(0, 50)) {
    const b = { bat: v.bat.type, bp: v.bat.bp, bs: v.bat.bs }, w = { bowl: v.bowl.type, spd: v.bowl.spd, bsk: v.bowl.bsk };
    assert.deepEqual(ballProbs(b, w, v.phase, v.intent, v.field, v.over, v.wk_lost), ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost));
  }
});
