import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate, SIZES } from '../gate.mjs';
import { gameHash } from '../hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LG = path.resolve(HERE, '..');
let tmp, pages, probeDir;

const hook = (body) => `<script>
window.__test = { ready: true, seed(){}, states(){ return ['a','b','c']; },
  goto(n){ document.getElementById('s').textContent = n; } };
</script>`;
const page = (inner) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:16px sans-serif">${inner}<p id="s">x</p>${hook()}</body>`;
const marker = { version: 1, entry: 'index.html', minStates: 3, canvas: false, webgl: false, settleMs: 50, soft: [], waivers: [] };
function game(name, html, m = marker) {
  const d = path.join(pages, name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);
  if (m) fs.writeFileSync(path.join(d, 'layout-gate.json'), JSON.stringify(m));
  return d;
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-'));
  pages = path.join(tmp, 'pages');
  fs.mkdirSync(pages);
  if (fs.existsSync(path.join(LG, 'probe.js'))) probeDir = LG;
  else {
    probeDir = path.join(tmp, 'probe');
    fs.mkdirSync(probeDir);
    fs.writeFileSync(path.join(probeDir, 'probe.js'), `window.__pgsLayoutProbe = () => document.documentElement.scrollWidth > innerWidth + 1 ? [{check:'h-scroll',severity:'HARD',detail:'scrollWidth '+document.documentElement.scrollWidth,sel:'html',box:[0,0,0,0]}] : [];`);
  }
  game('bad', page('<div style="white-space:nowrap;width:2400px">overflowing text that is far wider than any phone viewport can hold</div>'));
  game('good', page('<h1 style="margin:8px">Hello</h1><button style="width:120px;height:56px">Go</button>'));
  game('nohook', '<!doctype html><body><p>no hook</p></body>');
  game('waived', page('<div style="white-space:nowrap;width:2400px">wide</div>'), { ...marker, waivers: [{ check: 'h-scroll', state: '*', size: '*', match: '', reason: 'test waiver' }] });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const opts = (game, extra = {}) => ({ game, pages, probeDir, out: path.join(tmp, 'out-' + game), ...extra });

test('SIZES exported with 7 entries', () => assert.equal(SIZES.length, 7));

test('bad game fails with h-scroll, report shape ok', async () => {
  const t = Date.now();
  const r = await runGate(opts('bad'));
  console.log('7-size 3-state run ms:', Date.now() - t);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.counts.hard > 0);
  assert.ok(r.issues.some((i) => i.check === 'h-scroll' && i.severity === 'HARD'));
  assert.equal(r.sizes.length, 7);
  assert.deepEqual(r.states, ['a', 'b', 'c']);
  assert.match(r.summary, /^Layout gate: FAIL, 7 sizes x 3 states, \d+ fail, \d+ soft, \d+ waived$/);
  assert.match(r.gameHash, /^sha256:[0-9a-f]{64}$/);
  const f = JSON.parse(fs.readFileSync(path.join(tmp, 'out-bad', 'layout-report.json'), 'utf8'));
  assert.equal(f.gate, 'pgs-layout-gate');
  for (const s of SIZES) assert.ok(fs.statSync(path.join(tmp, 'out-bad', `sheet-${s.id}.png`)).size > 500);
  assert.ok(r.notChecked.includes('canvas-probe.js') || fs.existsSync(path.join(LG, 'canvas-probe.js')));
});

test('good game passes', async () => {
  const r = await runGate(opts('good', { sizes: 'fold-cover-344x882,desk-1366x768', sheets: false }));
  assert.equal(r.counts.hard, 0, JSON.stringify(r.issues));
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.sizes.length, 2);
});

test('missing __test is a contract HARD', async () => {
  const r = await runGate(opts('nohook', { sizes: 'fold-cover-344x882', sheets: false }));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.issues.some((i) => i.check === 'contract' && i.severity === 'HARD'));
});

test('marker waiver turns HARD into waived', async () => {
  const r = await runGate(opts('waived', { sizes: 'fold-cover-344x882', sheets: false }));
  assert.equal(r.verdict, 'PASS');
  assert.ok(r.counts.waived > 0);
  assert.equal(r.waivers[0].reason, 'test waiver');
});

test('CLI exit codes', async () => {
  const { spawnSync } = await import('node:child_process');
  const g = path.join(LG, 'gate.mjs');
  const base = ['--pages', pages, '--probe-dir', probeDir, '--sizes', 'fold-cover-344x882', '--no-sheets'];
  const bad = spawnSync('node', [g, '--game', 'bad', ...base, '--out', path.join(tmp, 'cli1')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^Layout gate: FAIL, 1 sizes x 3 states/);
  const good = spawnSync('node', [g, '--game', 'good', ...base, '--out', path.join(tmp, 'cli2')], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  const usage = spawnSync('node', [g, ...base], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
});

test('gameHash ignores qa/, sw.js, dotfiles; changes with content', () => {
  const d = path.join(tmp, 'hashgame');
  fs.mkdirSync(path.join(d, 'qa'), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), 'one');
  const h1 = gameHash(d);
  assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  fs.writeFileSync(path.join(d, 'qa', 'r.json'), 'x');
  fs.writeFileSync(path.join(d, 'sw.js'), 'x');
  fs.writeFileSync(path.join(d, '.DS_Store'), 'x');
  assert.equal(gameHash(d), h1);
  fs.writeFileSync(path.join(d, 'index.html'), 'two');
  assert.notEqual(gameHash(d), h1);
  fs.writeFileSync(path.join(d, 'extra.js'), 'x');
  const h3 = gameHash(d);
  fs.writeFileSync(path.join(d, 'extra.js'), 'y');
  assert.notEqual(gameHash(d), h3);
});
