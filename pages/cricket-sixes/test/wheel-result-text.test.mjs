// Source guard: the ring result card must not template a bare boolean/undefined (T4 QA4 "false" bug); e2e checks the rendered text in test/e2e/t4-wheels.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ringResultHtml: ring wheels build no change row from a boolean expression', async () => {
  const src = await readFile(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
  assert.match(src, /const chg = RING \? ''/);
  assert.doesNotMatch(src, /\+\s*(false|undefined|null)\s*\+/);
});
