import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridField } from '../js/core/match.js';
import { pickField } from '../js/core/ai.js';
import { GLOSSARY } from '../js/data/glossary.js';

test('hybridField: Attack shaky batters, Protect big hitters, more so late', () => {
  assert.equal(hybridField({ bp: 40, bs: 40 }, 1, 0), 'A');
  assert.equal(hybridField({ bp: 70, bs: 60 }, 1, 0), 'P');
  assert.equal(hybridField({ bp: 50, bs: 50 }, 1, 0), 'P');   // 0 > 0.1 false
  assert.equal(hybridField({ bp: 50, bs: 46 }, 1, 0), 'A');   // 1.5*0.5=0.75 > 0.1
});
test('hybridField: wickets down push to Attack, last overs push to Protect', () => {
  const b = { bp: 50, bs: 50 };
  assert.equal(hybridField(b, 1, 0), 'P');
  assert.equal(hybridField(b, 1, 4), 'A');      // 0.4 > 0.1
  assert.equal(hybridField({ bp: 50, bs: 47 }, 8, 0), 'A'); // 0.5625-0.3 > 0.1
  assert.equal(hybridField({ bp: 50, bs: 49 }, 8, 0), 'P'); // 0.19-0.3 < 0.1
});
test('pickField smart uses over/wk and keeps N after the target', () => {
  const bs = [{ bp: 50, bs: 50 }, { bp: 50, bs: 50 }];
  assert.equal(pickField({ strike: 0, runs: 0, over: 1, wk: 4 }, bs, null, true), 'A');
  assert.equal(pickField({ strike: 0, runs: 0, over: 9, wk: 0 }, bs, null, true), 'P');
  assert.equal(pickField({ strike: 0, runs: 9, target: 5, over: 9, wk: 0 }, bs, null, true), 'N');
});
test('hint wording is in the help text', () => {
  const txt = JSON.stringify(GLOSSARY);
  assert.ok(txt.includes('Attack shaky batters and when wickets are down; Protect big hitters, most of all in the last 3 overs.'));
  assert.ok(txt.includes('Early overs: Attack is risky. Last 3 overs: Attack is cheap.'));
});
