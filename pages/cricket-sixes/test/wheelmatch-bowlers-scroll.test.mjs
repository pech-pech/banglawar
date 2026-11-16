// X8: the wheel-match bowler list is not a nested scroller (it cut the last row under the Last over bar); the .wm screen scrolls instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../css/wheelmatch.css', import.meta.url), 'utf8');
const rule = (sel) => (css.match(new RegExp('^' + sel.replace('.', '\\.') + ' \\{([^}]*)\\}', 'm')) || [])[1] || '';
test('.wm-bowlers has no inner scroll and keeps its rows', () => {
  const r = rule('.wm-bowlers');
  assert.ok(r, 'rule exists');
  assert.ok(!/overflow/.test(r), 'no overflow on the list');
  assert.match(r, /flex: none/);
});
test('.wm screen scrolls and the CTA is sticky at the end of the flow', () => {
  assert.match(rule('.wm'), /overflow-y: auto/);
  assert.match(rule('.wm-cta'), /position: sticky/);
});
