'use strict';
// Bundle A determinism guard. Run: node tests/determinism-bundle-a.js
// Regenerate baseline (only on purpose): node tests/determinism-bundle-a.js --write
const fs = require('fs'), path = require('path'), cp = require('child_process');
const S = require('../src/sim.js'), G = require('../src/gen.js');
const BASE = path.join(__dirname, 'determinism-baseline.json');
const SEEDS = [1, 2, 3, 4], SECT = [0, 1, 2, 3, 4, 5, 6, 7];
const FIXED = [[0.5, 0.3], [2, 0.8, 0.5]];
function fnv(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }
function rec(r) { // full sim result summary, fixed precision
  const o = { checksum: r.checksum, steps: r.steps, fuelUsed: r.fuelUsed.toFixed(6), fuel: r.state.fuel.toFixed(6), result: r.result };
  o.hash = fnv(JSON.stringify(o)); return o;
}
function compute() {
  const out = {};
  const mk = () => ({ index: 0, bodies: [{ id: 'A', kind: 'large', cx: 170, cy: 243 }, { id: 'B', kind: 'small', cx: 170, cy: 243, R: 80, w: 0.4, p: 1 }].map(S.makeBody), gate: { x: 60, y: 420 }, start: { x: 30, y: 60, vx: 50, vy: 30 }, fuel0: S.C.FUEL0 });
  out['hand:1a'] = rec(S.runSchedule(mk(), FIXED, { maxSeconds: 20 }));
  for (const seed of SEEDS) for (const idx of SECT) {
    const sec = G.generateSector(seed, idx), k = seed + ':' + idx;
    out[k + ':par'] = rec(S.runSchedule(sec, sec.par.sched, { maxSeconds: 35 }));
    out[k + ':fixed'] = rec(S.runSchedule(sec, FIXED, { maxSeconds: 35 }));
    out[k + ':idle'] = rec(S.runSchedule(sec, [], { maxSeconds: 35 }));
  }
  return out;
}
const cur = compute();
if (process.argv.includes('--write')) { fs.writeFileSync(BASE, JSON.stringify(cur, null, 1) + '\n'); console.log('wrote ' + Object.keys(cur).length + ' entries'); process.exit(0); }
let fails = 0;
const check = (n, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? ' | ' + info : '')); };
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
check('baseline 1a checksum 587ba043', base['hand:1a'].checksum === '587ba043' && cur['hand:1a'].checksum === '587ba043', cur['hand:1a'].checksum);
const keys = Object.keys(base);
check('same key set', keys.length === Object.keys(cur).length && keys.every(k => cur[k]), keys.length + ' entries');
const bad = keys.filter(k => !cur[k] || cur[k].hash !== base[k].hash);
check('all hashes match baseline', bad.length === 0, bad.length ? 'mismatch: ' + bad.slice(0, 5).join(', ') : keys.length + ' runs');
let clean = false;
try { cp.execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src/sim.js', 'src/gen.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' }); clean = true; } catch (e) { clean = false; }
check('git diff --quiet HEAD sim.js gen.js', clean);
console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
