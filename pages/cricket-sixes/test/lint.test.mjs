import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../js/', import.meta.url).pathname;
const BAD = [/Math\.random/, /\bDate\b/, /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\blocation\b/];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []);

for (const dir of ['core', 'data', 'store']) {
  test(`js/${dir} is pure (no Math.random, Date, document, window, localStorage, location)`, { skip: existsSync(join(root, dir)) ? false : `js/${dir} not present yet` }, () => {
    const files = walk(join(root, dir));
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      for (const re of BAD) assert.equal(re.test(src), false, `${f} uses ${re}`);
    }
  });
}

// js/platform may touch storage only: no network, no location, no cookies, no timers or other browser state.
// (Reading window.localStorage is the whole point of the folder; everything else is banned.)
const PLATFORM_BAD = [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/, /\bnavigator\b/,
  /\blocation\b/, /\bdocument\b/, /\bindexedDB\b/, /\bcaches\b/, /\bserviceWorker\b/, /\bcookie\b/,
  /\bMath\.random\b/, /\bDate\b/, /\bimport\s*\(/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bBroadcastChannel\b/,
];
test('js/platform touches only storage (no network, location, document, clock, rng)', { skip: existsSync(join(root, 'platform')) ? false : 'js/platform not present yet' }, () => {
  const files = walk(join(root, 'platform'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const src = strip(readFileSync(f, 'utf8'));
    for (const re of PLATFORM_BAD) assert.equal(re.test(src), false, `${f} uses ${re}`);
    // every `window.` use must be window.localStorage
    for (const m of src.matchAll(/\bwindow\s*\.\s*(\w+)/g)) assert.equal(m[1], 'localStorage', `${f} uses window.${m[1]}`);
    for (const m of src.matchAll(/\b(localStorage|sessionStorage)\b/g)) assert.ok(m[1] === 'localStorage', `${f} uses ${m[1]}`);
  }
});

test('the lint scan itself catches a banned word (self-check)', () => {
  assert.ok(BAD.some((re) => re.test('const u = location.search')));
  assert.ok(PLATFORM_BAD.some((re) => re.test('fetch("x")')));
});
