// Static guard: every icon name used by the hub and week sheet must exist in kit/sprites.js ICONS
// (unit tests use a fake SPR, so a missing icon only crashed at render time).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function iconKeys() {
  const s = read('kit/sprites.js');
  const keys = new Set([...s.matchAll(/ICONS\.(\w+)\s*=/g)].map((m) => m[1]));
  const start = s.indexOf('var ICONS = {');
  assert.ok(start > 0, 'ICONS literal found');
  const end = s.indexOf('\n  };', start);
  for (const m of s.slice(start, end).matchAll(/^\s{4}(\w+):\s*\[/gm)) keys.add(m[1]);
  return keys;
}

function usedIcons(src) {
  const out = new Map();
  const add = (n, why) => { if (!out.has(n)) out.set(n, why); };
  for (const m of src.matchAll(/\b(?:icoDeco|ico|SPR\.icon\w*|iconImg|iconURL)\(\s*['"]([\w-]+)['"]/g)) add(m[1], m[0]);
  // plate helper: P('act', 'icon', 'Word', ...)
  for (const m of src.matchAll(/\bP\(\s*['"][^'"]*['"]\s*,\s*['"]([\w-]+)['"]/g)) add(m[1], m[0]);
  // key -> icon maps, and fallbacks such as ICON[x] || 'info'
  const map = src.match(/\bconst ICON\s*=\s*\{([^}]*)\}/);
  if (map) for (const m of map[1].matchAll(/\w+\s*:\s*['"]([\w-]+)['"]/g)) add(m[1], 'ICON map');
  for (const m of src.matchAll(/ICON\[[^\]]*\]\s*\|\|\s*['"]([\w-]+)['"]/g)) add(m[1], m[0]);
  return out;
}

const keys = iconKeys();
test('sprites ICONS parsed', () => assert.ok(keys.size > 10 && keys.has('coin')));

for (const f of ['js/ui/hub-view.js', 'js/ui/week-sheet.js']) {
  test(f + ' only uses icons that exist in ICONS', () => {
    const used = usedIcons(read(f));
    assert.ok(used.size > 0, 'found icon names');
    const missing = [...used].filter(([n]) => !keys.has(n)).map(([n, w]) => n + ' (' + w + ')');
    assert.deepEqual(missing, [], 'missing icons: ' + missing.join(', '));
  });
}
