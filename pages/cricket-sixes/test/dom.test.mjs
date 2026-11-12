import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, gradeChip, btn } from '../js/ui/dom.js';

test('esc escapes markup and null', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(5), '5');
});
test('gradeChip hidden grade shows ? and n/1', () => {
  const h = gradeChip(null, 0);
  assert.match(h, /\?/); assert.match(h, /0\/1/); assert.match(h, /Grade shows after 1 drill/);
  assert.equal((h.match(/m0-pip is-on/g) || []).length, 0);
});
test('gradeChip known grade', () => {
  const h = gradeChip('A', 5);
  assert.match(h, /aria-label="Grade A"/);
});
test('btn escapes and encodes arg', () => {
  assert.match(btn('<x>', 'pick', { arg: { id: 1 } }), /data-arg="\{&quot;id&quot;:1\}"[^>]*>&lt;x&gt;/);
});
