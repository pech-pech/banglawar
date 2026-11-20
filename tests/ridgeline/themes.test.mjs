import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const themesPath = path.resolve(here, '../../pages/ridgeline/src/themes.js');
const { DEFAULT_THEME, THEME_ORDER, THEMES } = await import(pathToFileURL(themesPath).href);

const REQUIRED = ['snow', 'candy', 'jurassic', 'blocky', 'cloud', 'ink'];
const COLOR_KEYS = ['sky', 'groundLow', 'groundHigh', 'bank', 'rock', 'treeTrunk', 'treeLeaf',
  'gate', 'gateNext', 'sled', 'sledGlow', 'boostFlare', 'sun', 'hemiSky', 'hemiGround'];
const TREE = ['cone', 'lollipop', 'fern', 'cube', 'puff', 'brush', 'crystal', 'cactus'];
const ROCK = ['boulder', 'gumdrop', 'bone', 'cube', 'cloud', 'blot', 'crystal'];
const PART = ['snow', 'sprinkles', 'spores', 'none', 'mist', 'ink', 'embers', 'sand'];
const isColor = (n) => Number.isInteger(n) && n >= 0 && n <= 0xFFFFFF;

const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (n) => { const [r, g, b] = rgb(n); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hue = (n) => {
  const [r, g, b] = rgb(n).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return null;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueDiff = (a, b) => {
  const ha = hue(a), hb = hue(b);
  if (ha === null || hb === null) return 0;
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d);
};

const ids = Array.isArray(THEME_ORDER) ? THEME_ORDER : [];
const get = (id) => THEMES[id];

test('DEFAULT_THEME and THEME_ORDER basics', () => {
  assert.ok(THEMES && typeof THEMES === 'object');
  assert.ok(THEMES[DEFAULT_THEME], 'DEFAULT_THEME exists in THEMES');
  assert.ok(Array.isArray(THEME_ORDER));
  assert.ok(ids.length >= 8, 'at least 8 themes, got ' + ids.length);
  for (const r of REQUIRED) assert.ok(ids.includes(r), 'THEME_ORDER includes ' + r);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});

test('no unknown ids in THEME_ORDER; every THEMES key is ordered', () => {
  for (const id of ids) assert.ok(THEMES[id], 'unknown id in THEME_ORDER: ' + id);
  for (const id of Object.keys(THEMES)) assert.ok(ids.includes(id), 'THEMES id missing from THEME_ORDER: ' + id);
});

test('names unique and original', () => {
  const names = ids.map((i) => get(i).name);
  assert.equal(new Set(names.map((n) => String(n).toLowerCase())).size, names.length, 'names unique');
  for (const n of names) {
    assert.ok(!/minecraft/i.test(n) && !/jurassic park/i.test(n), 'forbidden name: ' + n);
  }
});

for (const id of ids) {
  test('schema complete: ' + id, () => {
    const t = get(id);
    assert.ok(t, 'theme exists');
    assert.equal(typeof t.name, 'string');
    assert.ok(t.name.length > 0);
    for (const k of COLOR_KEYS) assert.ok(isColor(t[k]), `${k} must be int 0..0xFFFFFF, got ${t[k]}`);
    assert.ok(typeof t.fogDensity === 'number' && t.fogDensity >= 0.5 && t.fogDensity <= 2, 'fogDensity ' + t.fogDensity);
    assert.ok(typeof t.sunIntensity === 'number' && t.sunIntensity > 0, 'sunIntensity');
    assert.ok(typeof t.hemiIntensity === 'number' && t.hemiIntensity > 0, 'hemiIntensity');
    assert.ok(TREE.includes(t.treeShape), 'treeShape ' + t.treeShape);
    assert.ok(ROCK.includes(t.rockShape), 'rockShape ' + t.rockShape);
    assert.ok(typeof t.terrainStep === 'number' && t.terrainStep >= 0, 'terrainStep');
    assert.equal(typeof t.flatShading, 'boolean');
    assert.equal(typeof t.outline, 'boolean');
    assert.ok(PART.includes(t.particles), 'particles ' + t.particles);
    assert.match(String(t.uiAccent), /^#[0-9a-fA-F]{6}$/);
  });
}

const rows = [];
const fmt = (x) => x.toFixed(2);
for (const id of ids) {
  const t = get(id);
  if (!t || !isColor(t.rock)) continue;
  rows.push({
    id,
    rockLow: contrast(t.rock, t.groundLow),
    rockHigh: contrast(t.rock, t.groundHigh),
    gateCr: contrast(t.gate, t.groundHigh),
    gateHue: hueDiff(t.gate, t.groundHigh),
    sledCr: contrast(t.sled, t.groundHigh),
    sledHue: hueDiff(t.sled, t.groundHigh),
  });
}

test('readability', async (tt) => {
  for (const id of ids) {
    await tt.test('readability: ' + id, () => {
      const t = get(id);
      const r = rows.find((x) => x.id === id);
      assert.ok(r, 'measured');
      assert.ok(r.rockLow >= 2.0, `rock vs groundLow ${fmt(r.rockLow)} < 2.0`);
      assert.ok(r.rockHigh >= 2.0, `rock vs groundHigh ${fmt(r.rockHigh)} < 2.0`);
      assert.ok(r.gateCr >= 1.6 || r.gateHue >= 60, `gate vs groundHigh contrast ${fmt(r.gateCr)}, hue diff ${r.gateHue.toFixed(0)}`);
      assert.notEqual(t.gateNext, t.gate, 'gateNext must differ from gate');
      assert.ok(r.sledCr >= 1.8 || r.sledHue >= 60, `sled vs groundHigh contrast ${fmt(r.sledCr)}, hue diff ${r.sledHue.toFixed(0)}`);
      assert.notEqual(t.sky, t.groundHigh, 'sky must differ from groundHigh');
    });
  }
});

test('write contrast table', () => {
  const head = ['theme', 'rock/low', 'rock/high', 'gate/high', 'gateHue', 'sled/high', 'sledHue'];
  const lines = [head.join('\t')];
  for (const r of rows) {
    lines.push([r.id, fmt(r.rockLow), fmt(r.rockHigh), fmt(r.gateCr), r.gateHue.toFixed(0), fmt(r.sledCr), r.sledHue.toFixed(0)].join('\t'));
  }
  const text = lines.join('\n') + '\n';
  console.log(text);
  const outDir = path.join(here, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'theme-contrast.txt'), text);
});
