import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../js/', import.meta.url).pathname;
const BAD = [/Math\.random/, /\bDate\b/, /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bsessionStorage\b/];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []);

for (const dir of ['core', 'data', 'store']) {
  test(`js/${dir} is pure (no Math.random, Date, document, window, localStorage)`, { skip: existsSync(join(root, dir)) ? false : `js/${dir} not present yet` }, () => {
    const files = walk(join(root, dir));
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      for (const re of BAD) assert.equal(re.test(src), false, `${f} uses ${re}`);
    }
  });
}
