import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/ui/over-panel.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/over-panel.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/ui/app.js', import.meta.url), 'utf8');
test('golden reaches the panel and is read defensively', () => {
  assert.match(src, /golden = false/);
  assert.match(src, /is-golden/);
  assert.match(src, /Captain's Over/);
  assert.match(app, /golden: s\.last\.golden === true/);
});
test('gold ring css: #D2B357, box-shadow only (no layout shift), covers sixes', () => {
  assert.match(css, /\.op-circles\.is-golden[^{]*\{[^}]*#D2B357/);
  assert.match(css, /\.op-slot\.k-s \.op-circle \{[^}]*inset[^}]*#D2B357/);
  assert.doesNotMatch(css.split('Captain\'s Over')[1] || '', /\b(width|height|padding|border-width)\s*:/);
});
