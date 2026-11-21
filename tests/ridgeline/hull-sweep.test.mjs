// B3 hull sweep smoke: 40 runs x 5 hulls with the mid bot (workers). Full sweep: node tests/ridgeline/hull-sweep.mjs --runs 2000
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSweep, summarise, HULLS } from './hull-sweep.mjs';

test('hull sweep smoke: 40 runs x 5 hulls, mid bot, ratios near Wren, no hung runs', { timeout: 10 * 60 * 1000 }, async () => {
  const rows = await runSweep({ runs: 40, hulls: HULLS, bots: ['mid'] });
  assert.equal(rows.length, 200);
  assert.ok(rows.every((r) => r.cause !== 'cap' && r.cause !== 'unknown'), 'every run ends with a cause');
  const s = summarise(rows, HULLS, ['mid']).mid;
  for (const h of HULLS) {
    const ratio = s[h].median / s.wren.median;
    console.log(`  ${h}: median ${s[h].median.toFixed(0)} m ratio ${ratio.toFixed(3)} night ${(100 * s[h].night).toFixed(0)}% rock ${(100 * s[h].rock).toFixed(0)}%`);
    // 40 runs is noisy: loose band only (the +-5% gate is the 2000-run script)
    assert.ok(ratio > 0.6 && ratio < 1.5, `${h} ratio ${ratio}`);
  }
});
