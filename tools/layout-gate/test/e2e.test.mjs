import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp, pages;
const cases = [
  ['bad', 'bad', false, 1, (r) => r.counts.hard > 0],
  ['good', 'good', false, 0, (r) => r.counts.hard === 0 && r.sizes.length === 7],
  ['canvas', 'canvas', true, 0, (r) => r.counts.hard === 0 && r.counts.soft > 0],
  ['canvas-good', 'canvas-good', true, 0, (r) => r.counts.hard === 0 && r.counts.soft === 0],
];

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-e2e-'));
  pages = path.join(tmp, 'pages');
  for (const [g, f, canvas] of cases) {
    const d = path.join(pages, g);
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(path.join(LG, 'fixtures', f + '.html'), path.join(d, 'index.html'));
    fs.writeFileSync(path.join(d, 'layout-gate.json'), JSON.stringify({ version: 1, entry: 'index.html', minStates: 3, canvas, webgl: false, settleMs: 100, soft: [], waivers: [] }));
  }
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

for (const [g, , , code, check] of cases) {
  test(`e2e ${g}: exit ${code}`, () => {
    const r = spawnSync(process.execPath, [path.join(LG, 'gate.mjs'), '--game', g, '--pages', pages], { encoding: 'utf8' });
    assert.equal(r.status, code, r.stdout + r.stderr);
    const dir = path.join(pages, g, 'qa', 'layout');
    const rep = JSON.parse(fs.readFileSync(path.join(dir, 'layout-report.json'), 'utf8'));
    assert.ok(check(rep), JSON.stringify(rep.counts));
    assert.equal(rep.sizes.length, 7);
    assert.ok(fs.existsSync(path.join(dir, 'sheet-fold-cover-344x882.png')));
    if (g === 'bad') {
      const hs = rep.issues.filter((i) => i.check === 'h-scroll').map((i) => i.size);
      assert.ok(hs.includes('fold-cover-344x882') && hs.includes('s23u-384x824'), 'h-scroll fires on mobile sizes: ' + hs);
    }
  });
}
