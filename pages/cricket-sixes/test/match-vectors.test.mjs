import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballProbs, outcomeFromX } from '../js/core/match.js';

const V = JSON.parse(readFileSync(new URL('./ball-vectors.json', import.meta.url), 'utf8')).vectors;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9, `${msg}: got ${a}, want ${b}`);

test('500 ball vectors present', () => assert.equal(V.length, 500));

test('ballProbs + outcomeFromX match every frozen vector', () => {
  for (const v of V) {
    const b = { bat: v.bat.type, bp: v.bat.bp, bs: v.bat.bs };
    const w = { bowl: v.bowl.type, spd: v.bowl.spd, bsk: v.bowl.bsk };
    const r = ballProbs(b, w, v.phase, v.intent, v.field);
    for (const k of ['wicket', 'six', 'four', 'two', 'single']) near(r.p[k], v.p[k], `#${v.id} p.${k}`);
    near(r.singleRaw, v.p_single_raw, `#${v.id} singleRaw`);
    near(r.dot, v.p_dot, `#${v.id} dot`);
    assert.equal(String(outcomeFromX(r.p, r.singleRaw, v.x)), String(v.outcome), `#${v.id} outcome`);
  }
});
