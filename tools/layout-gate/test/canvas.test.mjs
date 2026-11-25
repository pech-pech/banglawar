import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'x.js'))('playwright');
}
const { chromium } = loadPlaywright();

const dir = path.dirname(fileURLToPath(import.meta.url));
const gate = path.resolve(dir, '..');
const hookSrc = readFileSync(path.join(gate, 'canvas-hook.js'), 'utf8');
const probeSrc = readFileSync(path.join(gate, 'canvas-probe.js'), 'utf8');
const url = (f) => pathToFileURL(path.join(gate, 'fixtures', f)).href + '?layoutgate=1';

const SIZES = [[344, 882], [475, 638], [704, 823], [882, 704], [384, 824], [1366, 768], [1920, 1080]];
const KEY = { overlap: 'canvas-text-overlap', dup: 'canvas-dup-label', outside: 'canvas-text-outside', half: 'canvas-empty-half' };

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(file, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(hookSrc);
  await page.goto(url(file), { waitUntil: 'load' });
  await page.addScriptTag({ content: probeSrc });
  return { ctx, page, errors };
}
const run = (page, state) => page.evaluate(async (s) => {
  await window.__test.goto(s);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return window.__pgsCanvasProbe();
}, state);

for (const [w, h] of [[344, 882], [882, 704]]) {
  test(`bad fixture triggers each canvas check at ${w}x${h}`, async () => {
    const { ctx, page, errors } = await open('canvas.html', w, h);
    try {
      const states = await page.evaluate(() => window.__test.states());
      assert.ok(states.length >= 3);
      for (const [state, check] of Object.entries(KEY)) {
        const issues = await run(page, state);
        const ids = issues.map((i) => i.check);
        assert.ok(ids.includes(check), `${state}: expected ${check}, got ${JSON.stringify(issues)}`);
        for (const other of Object.values(KEY).filter((c) => c !== check)) {
          assert.ok(!ids.includes(other), `${state}: unexpected ${other}: ${JSON.stringify(issues)}`);
        }
        for (const i of issues) {
          assert.equal(i.severity, 'SOFT');
          assert.equal(i.sel, 'canvas#game');
          assert.equal(i.box.length, 4);
          assert.ok(i.box.every(Number.isFinite));
          assert.ok(typeof i.detail === 'string' && i.detail.length > 0);
        }
      }
      assert.deepEqual(await run(page, 'ok'), [], 'ok state is clean');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('hook boxes honour DPR scaling and transforms', async () => {
  const { ctx, page } = await open('canvas.html', 344, 882);
  try {
    await page.evaluate(() => window.__test.goto('half'));
    const r = await page.evaluate(() => {
      const e = window.__pgsCanvasText.find((t) => t.text === 'LEFT ONLY');
      const rect = document.getElementById('game').getBoundingClientRect();
      return { e: { ...e }, rect: { left: rect.left, top: rect.top, w: rect.width }, bitmap: document.getElementById('game').width };
    });
    assert.equal(r.bitmap, 344 * 2, 'bitmap is 2x css');
    // drawn at logical x=10 after translate(8,8): css x0 = 18 (+ tiny side bearing), y baseline 38
    assert.ok(Math.abs(r.e.x0 - 18) < 3, `x0 ${r.e.x0}`);
    assert.ok(r.e.x1 > r.e.x0 + 40 && r.e.x1 < 200, `x1 ${r.e.x1}`);
    assert.ok(r.e.y0 > 20 && r.e.y1 < 45, `y ${r.e.y0}..${r.e.y1}`);
    assert.equal(r.e.cv, 0);
    assert.equal(typeof r.e.frame, 'number');
  } finally { await ctx.close(); }
});

test('hook log stays bounded and drops stale text on full clear', async () => {
  const { ctx, page } = await open('canvas.html', 882, 704);
  try {
    const n = await page.evaluate(async () => {
      for (let i = 0; i < 300; i++) { await window.__test.goto(i % 2 ? 'overlap' : 'dup'); if (i % 50 === 0) await new Promise((r) => requestAnimationFrame(r)); }
      return window.__pgsCanvasText.length;
    });
    assert.ok(n <= 4, `log length ${n}`);
    // stale dup text must not leak into the next state
    const issues = await run(page, 'overlap');
    assert.ok(!issues.some((i) => i.check === 'canvas-dup-label'));
    // animation without clearRect keeps only recent frames
    const m = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 100; document.body.appendChild(c);
      const x = c.getContext('2d');
      for (let i = 0; i < 60; i++) { x.fillText('tick' + i, 5 + i, 50); await new Promise((r) => requestAnimationFrame(r)); }
      return window.__pgsCanvasText.filter((t) => t._cv === c).length;
    });
    assert.ok(m <= 3, `rolling window kept ${m}`);
  } finally { await ctx.close(); }
});

for (const [w, h] of SIZES) {
  test(`good fixture has zero issues at ${w}x${h}`, async () => {
    const { ctx, page, errors } = await open('canvas-good.html', w, h);
    try {
      const states = await page.evaluate(() => window.__test.states());
      assert.ok(states.length >= 3);
      for (const s of states) {
        const issues = await run(page, s);
        assert.deepEqual(issues, [], `${s} @${w}x${h}: ${JSON.stringify(issues)}`);
      }
      // text was actually logged
      assert.ok(await page.evaluate(() => window.__pgsCanvasText.length > 0));
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('webgl canvas and tainted canvas report nothing and do not throw', async () => {
  const { ctx, page } = await open('canvas-good.html', 882, 704);
  try {
    const r = await page.evaluate(() => {
      const g = document.createElement('canvas'); g.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px';
      g.width = 300; g.height = 200; document.body.appendChild(g);
      const gl = g.getContext('webgl') || g.getContext('experimental-webgl');
      if (gl) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      const real = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () { throw new DOMException('tainted', 'SecurityError'); };
      let issues, err = null;
      try { issues = window.__pgsCanvasProbe(); } catch (e) { err = String(e); }
      CanvasRenderingContext2D.prototype.getImageData = real;
      return { gl: !!gl, err, issues };
    });
    assert.equal(r.err, null);
    assert.deepEqual(r.issues, []);
  } finally { await ctx.close(); }
});
