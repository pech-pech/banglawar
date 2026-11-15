// Wheel match segment fold parity: JS buildSegments (js/core/wheelmatch.js) vs the Python reference fixture
// (tools/segxcheck.py -> test/fixtures/wheelmatch-segx.json; SPEC s2 + 01a, reference sim/segments.py fold()).
// CLI: node tools/wheelmatch-segxcheck.mjs [case-name-substring]   prints every case, diffs for mismatches, exit 1 on any.
// Used by test/wheelmatch-segx.test.mjs (compareCase).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIXTURE = fileURLToPath(new URL('../test/fixtures/wheelmatch-segx.json', import.meta.url));
export const P_TOL = 1e-9;

export function loadFixture() { return JSON.parse(readFileSync(FIXTURE, 'utf8')); }

/** Expand a fixture count table [[runs, wk, end, count], ...] into buildSegments samples (contract sample shape). */
export function samplesOf(c) {
  const out = []; let k = 0;
  for (const [runs, wk, end, n] of c.table) {
    const key = end ? `${end}:${runs}w${wk}` : `${runs}w${wk}`;
    for (let i = 0; i < n; i++) out.push({ k: k++, runs, wk, end, key });
  }
  return out;
}

/** Returns a list of human-readable differences (empty = parity). */
export function compareCase(c, buildSegments) {
  const segs = buildSegments(samplesOf(c), c.ctx);
  const want = c.segs, diffs = [];
  const got = (segs || []).map((s) => s.id);
  const exp = want.map((s) => s.id);
  if (got.join(' ') !== exp.join(' ')) diffs.push(`order/ids: got [${got.join(' ')}] want [${exp.join(' ')}]`);
  const byId = new Map((segs || []).map((s) => [s.id, s]));
  for (const w of want) {
    const g = byId.get(w.id);
    if (!g) { diffs.push(`missing seg ${w.id} (label ${w.label}, p ${w.p})`); continue; }
    if (g.label !== w.label) diffs.push(`${w.id}: label got ${JSON.stringify(g.label)} want ${JSON.stringify(w.label)}`);
    if (!(Math.abs(g.p - w.p) <= P_TOL)) diffs.push(`${w.id}: p got ${g.p} want ${w.p}`);
  }
  for (const g of segs || []) if (!want.some((w) => w.id === g.id)) diffs.push(`extra seg ${g.id} (label ${g.label}, p ${g.p})`);
  return diffs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { buildSegments } = await import('../js/core/wheelmatch.js');
  const fx = loadFixture(); const filt = process.argv[2] || '';
  let bad = 0, n = 0;
  for (const c of fx.cases) {
    if (filt && !c.name.includes(filt)) continue;
    n++;
    let d;
    try { d = compareCase(c, buildSegments); } catch (e) { d = [`threw: ${e && e.stack || e}`]; }
    console.log(`${d.length ? 'FAIL' : 'ok  '} ${c.name.padEnd(28)} ${c.segs.map((s) => s.id).join(' ')}`);
    for (const x of d) console.log(`       ${x}`);
    if (d.length) bad++;
  }
  console.log(`${n - bad}/${n} cases match`);
  process.exitCode = bad ? 1 : 0;
}
