import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROBE = path.join(ROOT, 'probe.js');

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch { /* fall through to global */ }
  const g = execSync('npm root -g').toString().trim();
  return createRequire(path.join(g, '/'))('playwright');
}
const { chromium } = loadPlaywright();

const SIZES = [
  [344, 882, true], [475, 638, true], [704, 823, true], [882, 704, true],
  [384, 824, true], [1366, 768, false], [1920, 1080, false],
];
const HARD_IDS = ['h-scroll', 'offscreen', 'clipped', 'text-overlap', 'dup-label', 'tap-small', 'tap-covered', 'text-small', 'text-over-mark'];
const SOFT_IDS = ['fill-empty', 'svg-empty-half'];

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function run(fixture, w, h, mobile, state) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile,
    serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  try {
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'fixtures', fixture)).href + '?layoutgate=1');
    await page.waitForFunction(() => window.__test && window.__test.ready === true);
    await page.evaluate((s) => window.__test.goto(s), state);
    await page.addScriptTag({ path: PROBE });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return await page.evaluate(() => ({ issues: window.__pgsLayoutProbe({}), ignored: window.__pgsLayoutProbe.lastIgnored, iw: document.documentElement.clientWidth }));
  } finally { await ctx.close(); }
}

test('bad.html all-bad at 344x882 hits every check id', async () => {
  const { issues, iw } = await run('bad.html', 344, 882, true, 'all-bad');
  assert.equal(iw, 344);
  const ids = new Set(issues.map((i) => i.check));
  for (const id of [...HARD_IDS, ...SOFT_IDS]) assert.ok(ids.has(id), `missing ${id}; got ${[...ids].join(',')}`);
  for (const i of issues) {
    assert.ok(i.detail && i.sel && Array.isArray(i.box) && i.box.length === 4, JSON.stringify(i));
    assert.equal(i.severity, SOFT_IDS.includes(i.check) ? 'SOFT' : 'HARD');
    assert.equal(i.waived, undefined);
  }
  const keys = issues.map((i) => [i.check, i.sel, i.detail, i.box.join()].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'duplicate issues');
});

test('bad.html tap and text states are scoped', async () => {
  const tap = new Set((await run('bad.html', 344, 882, true, 'tap')).issues.map((i) => i.check));
  assert.ok(tap.has('tap-small') && tap.has('tap-covered'));
  assert.ok(!tap.has('h-scroll') && !tap.has('text-small'));
  const text = new Set((await run('bad.html', 344, 882, true, 'text')).issues.map((i) => i.check));
  for (const id of ['clipped', 'text-overlap', 'dup-label', 'text-small', 'text-over-mark', 'fill-empty', 'svg-empty-half']) assert.ok(text.has(id), id);
  assert.ok(!text.has('tap-small') && !text.has('h-scroll'));
});

test('good.html has zero HARD and zero SOFT at 344x882 and 1920x1080', async () => {
  for (const [w, h, m] of [[344, 882, true], [1920, 1080, false]]) {
    for (const st of ['home', 'chart', 'list']) {
      const { issues } = await run('good.html', w, h, m, st);
      const live = issues.filter((i) => !i.waived);
      assert.deepEqual(live, [], `${w}x${h} ${st}`);
    }
  }
});

test('good.html clean at all 7 contract sizes', async () => {
  for (const [w, h, m] of SIZES) {
    for (const st of ['home', 'chart', 'list']) {
      const { issues } = await run('good.html', w, h, m, st);
      assert.deepEqual(issues.filter((i) => !i.waived), [], `${w}x${h} ${st}`);
    }
  }
});

test('data-layout-ok is reported with waived reason; data-layout=ignore is counted and skipped', async () => {
  const { issues, ignored } = await run('good.html', 344, 882, true, 'home');
  const waived = issues.filter((i) => i.waived);
  assert.ok(waived.length >= 1, 'expected a waived issue');
  assert.ok(waived.every((i) => i.waived === 'marquee ribbon clips on purpose'));
  assert.ok(waived.some((i) => i.check === 'clipped'));
  assert.equal(ignored, 1);
  assert.ok(!issues.some((i) => i.check === 'dup-label' || i.check === 'text-overlap'), 'ignored deco must not be probed');
});

test('under-bar: last button stays under a fixed bottom bar at max scroll; scroll restored; no tap-covered noise', async () => {
  const { issues } = await run('bad.html', 344, 882, true, 'bar');
  const ub = issues.filter((i) => i.check === 'under-bar');
  assert.ok(ub.some((i) => /Last action/.test(i.detail)), JSON.stringify(issues));
  assert.ok(ub.every((i) => i.severity === 'HARD'));
  assert.ok(!issues.some((i) => i.check === 'tap-covered' || i.check === 'text-overlap'), 'bar pairs are skipped, not tap-covered');
});

test('under-bar: scrolls then restores scroll position; a padded page is clean', async () => {
  const ctx = await browser.newContext({ viewport: { width: 344, height: 600 }, isMobile: true, hasTouch: true });
  try {
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0"><div style="height:1200px"></div><button style="display:block;width:200px;height:56px;margin-bottom:80px">Last</button><div style="position:fixed;left:0;right:0;bottom:0;height:64px;background:#222"></div></body>');
    await page.addScriptTag({ path: PROBE });
    await page.evaluate(() => window.scrollTo(0, 100));
    const r = await page.evaluate(() => ({ iss: window.__pgsLayoutProbe({}).filter((i) => i.check === 'under-bar'), y: window.scrollY }));
    assert.deepEqual(r.iss, []);
    assert.equal(r.y, 100);
  } finally { await ctx.close(); }
});
