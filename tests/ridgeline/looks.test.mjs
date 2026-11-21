import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const swPath = path.resolve(here, '../../pages/ridgeline/sw.js');
const { THEME_ORDER, THEMES } = await import(pathToFileURL(path.join(src, 'themes.js')).href);
const { LOOK_BASE, THEME_LOOKS, lookFor } = await import(pathToFileURL(path.join(src, 'looks.js')).href);

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexToN = (h) => parseInt(h.slice(1), 16);
const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]); };
const toN = (c) => (typeof c === 'string' ? hexToN(c) : c);

test('every theme has a THEME_LOOKS entry and lookFor resolves', () => {
  for (const id of THEME_ORDER) {
    assert.ok(THEME_LOOKS[id] && typeof THEME_LOOKS[id] === 'object', 'THEME_LOOKS missing ' + id);
    const L = lookFor(id);
    assert.ok(L && Array.isArray(L.sky), 'lookFor(' + id + ') has sky');
  }
  assert.ok(LOOK_BASE && Array.isArray(LOOK_BASE.sky));
  assert.ok(lookFor('no-such-theme').sky, 'unknown id falls back to base');
});

test('sky ends at t=1 with valid hex stops', () => {
  for (const id of THEME_ORDER) {
    const sky = lookFor(id).sky;
    assert.ok(sky.length >= 2, id + ' sky has stops');
    assert.equal(sky[sky.length - 1][0], 1, id + ' sky last stop t=1');
    let prev = 0;
    for (const [t, c] of sky) {
      assert.ok(typeof t === 'number' && t >= prev && t <= 1, id + ' sky t monotonic in 0..1');
      prev = t;
      assert.match(c, HEX, id + ' sky colour ' + c);
    }
  }
});

function sceneryColours(L) {
  const out = [];
  for (const [, c] of L.sky || []) out.push(['sky', c]);
  for (const r of L.ranges || []) if (r && r.top) out.push(['range.top', r.top]);
  if (L.poles && L.poles.col) out.push(['poles.col', L.poles.col]);
  if (L.blob && L.blob.col) out.push(['blob.col', L.blob.col]);
  for (const k of ['trail', 'spray', 'suitC', 'wing']) if (L[k]) out.push([k, L[k]]);
  return out;
}

test('scenery colours are 60+ RGB units from rock, gate, gateNext', () => {
  for (const id of THEME_ORDER) {
    const T = THEMES[id];
    const L = lookFor(id);
    for (const [name, c] of sceneryColours(L)) {
      assert.match(c, HEX, id + ' ' + name + ' valid hex: ' + c);
      for (const k of ['rock', 'gate', 'gateNext']) {
        const d = dist(hexToN(c), toN(T[k]));
        assert.ok(d >= 60, id + ' ' + name + ' ' + c + ' too close to theme ' + k + ' (' + d + ')');
      }
    }
  }
});

test('every src module in the main.js import graph is in sw.js FILES', () => {
  const sw = fs.readFileSync(swPath, 'utf8');
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]/g)) {
      const spec = m[1] || m[2];
      const target = path.resolve(path.dirname(file), spec);
      if (target.includes(path.sep + 'vendor' + path.sep)) { seen.add(target); continue; }
      walk(target);
    }
  };
  walk(path.join(src, 'main.js'));
  const base = path.resolve(src, '..');
  for (const f of seen) {
    const rel = './' + path.relative(base, f).split(path.sep).join('/');
    assert.ok(sw.includes("'" + rel + "'"), 'sw.js FILES missing ' + rel);
  }
  for (const f of ['./src/duneatlas.js', './src/dunefx.js']) assert.ok(seen.has(path.join(src, f.slice(6))), f + ' is in the main.js import graph');
  assert.ok(fs.existsSync(path.resolve(src, '../assets/dune-atlas.webp')), 'atlas webp exists on disk');
  assert.match(sw, /VERSION = 'rl-proto-12'/);
  for (const f of ['./src/looks.js', './src/lookparts.js', './src/duneatlas.js', './src/dunefx.js', './assets/dune-atlas.webp']) assert.ok(sw.includes("'" + f + "'"), 'sw.js missing ' + f);
});
