import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callHtml } from '../js/ui/over-panel.js';

const src = readFileSync(new URL('../js/ui/over-panel.js', import.meta.url), 'utf8');

test('callHtml markup', () => {
  const h = callHtml({ text: 'Attack: Protect would have saved runs', say: 'You chose Attack. Protect would have saved runs.' });
  assert.match(h, /^<p class="op-call" role="status" aria-live="polite" aria-label="You chose Attack\. Protect would have saved runs\.">/);
  assert.match(h, /<b>Attack<\/b>: Protect would have saved runs<\/p>$/);
  assert.equal(callHtml(null), '');
});
test('callHtml escapes', () => {
  const h = callHtml({ text: '<i>X</i>: a "b" & c', say: 'say "q" <x>' });
  assert.ok(!h.includes('<i>'));
  assert.match(h, /<b>&lt;i&gt;X&lt;\/i&gt;<\/b>: a &quot;b&quot; &amp; c/);
  assert.match(h, /aria-label="say &quot;q&quot; &lt;x&gt;"/);
});
test('hint sits before found card and Next in .op-foot, only when callHint set', () => {
  const m = /foot\.innerHTML = (.*?);\n/s.exec(src)[1];
  assert.ok(m.startsWith('callHtml(callHint)'));
  assert.ok(m.indexOf('callHtml(callHint)') < m.indexOf('foundHtml') && m.indexOf('foundHtml') < m.indexOf('op-next'));
  assert.equal(callHtml(undefined), '');
});
