#!/usr/bin/env node
// Determinism check: for a spread of runs, (1) record the run twice in two fresh pages (two separate browser launches) and compare the JSON
// byte-for-byte, (2) compare against the stored trace on disk, (3) replay from the stored input string only and compare chk/samples/events.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { recordOne, readTrace } = require('./record.js');
(async () => {
  const picks = [ // spread over vehicles, weathers (L1 clear, L2 rain, L3 snow, L4 slime, L5 dirty), passes and failures, skin, load mode, daily
    { vehicle: 'mixer', level: 0, policy: 't0.55-brake' }, { vehicle: 'mixer', level: 1, policy: 'duty0.5' }, { vehicle: 'mixer', level: 2, policy: 't0.8-pitch' },
    { vehicle: 'mixer', level: 3, policy: 't1-none' }, { vehicle: 'mixer', level: 4, policy: 'duty0.85' }, { vehicle: 'digger', level: 5, policy: 't0.8-none' },
    { vehicle: 'dump', level: 2, policy: 't0.8-pitch' }, { vehicle: 'dozer', level: 7, policy: 'duty0.85' }, { vehicle: 'crane', level: 1, policy: 't0.8-none' },
    { vehicle: 'roller', level: 6, policy: 't0.8-pitch' }, { vehicle: 'mixer', level: 6, policy: 't0.8-none', skin: 3 }, { vehicle: 'mixer', level: 4, policy: 't1-pitch', mode: 'load' },
    { vehicle: 'digger', level: 0, policy: 'duty0.7', mode: 'daily', dailyKey: '2026-11-02' } ];
  const nameOf = o => `${o.vehicle}_L${o.level + 1}_${o.policy}${o.mode && o.mode !== 'classic' ? '_' + o.mode : ''}${o.skin ? '_skin' + (o.skin + 1) : ''}`;
  let ok = 0, bad = 0; const rows = [];
  const b1 = await chromium.launch(), b2 = await chromium.launch();
  for (const o of picks) {
    const A = await recordOne(b1, o), B = await recordOne(b2, o);
    const sa = JSON.stringify(A), sb = JSON.stringify(B);
    const disk = readTrace(path.join(__dirname, 'traces', nameOf(o) + '.json.gz'));
    const sdisk = JSON.stringify(disk);
    const R = await recordOne(b1, { vehicle: o.vehicle, level: o.level, mode: A.meta.mode, skin: A.meta.skin, seed: A.meta.seed, dailyKey: A.meta.dailyKey, inputs: A.input });
    const replayOk = R.chk === A.chk && JSON.stringify(R.samples) === JSON.stringify(A.samples) && JSON.stringify(R.events) === JSON.stringify(A.events);
    const r = { run: nameOf(o), ticks: A.outcome.steps, twoRunsIdentical: sa === sb, matchesStoredTrace: sa === sdisk, replayIdentical: replayOk, bytes: sa.length };
    rows.push(r); (r.twoRunsIdentical && r.matchesStoredTrace && r.replayIdentical) ? ok++ : bad++;
    console.log(JSON.stringify(r));
  }
  await b1.close(); await b2.close();
  console.log(`DETERMINISM: ${ok}/${picks.length} runs bit-identical (twice in JS, vs stored trace, and input-only replay); ${bad} mismatches`);
  fs.writeFileSync(path.join(__dirname, 'determinism-result.json'), JSON.stringify({ when: new Date().toISOString(), ok, bad, rows }, null, 1));
  process.exitCode = bad ? 1 : 0;
})();
