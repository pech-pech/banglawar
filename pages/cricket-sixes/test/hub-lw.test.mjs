// LW (landscape wide, GRID-RULES G0) Home rules: string checks on the CSS, same pattern as hub-l2.test.mjs. Pixel checks are in the QA shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const hub = fs.readFileSync(new URL('../css/hub.css', import.meta.url), 'utf8');
const sb = fs.readFileSync(new URL('../css/hub-scorebook.css', import.meta.url), 'utf8');
const LW = '@media (min-width: 760px) and (min-height: 500px) and (orientation: landscape) {';
test('hub.css has one LW block, after the 600 px rules, with the lock selectors', () => {
  assert.equal(hub.split(LW).length - 1, 1);
  const lw = hub.slice(hub.indexOf(LW));
  assert.ok(hub.indexOf(LW) > hub.lastIndexOf('@media (min-width: 600px)'));
  for (const s of ['.hb-banner .hb-ghost { display: inline-block; }', 'white-space: normal', 'grid-auto-rows: minmax(56px, 1fr)', 'padding-bottom: 80px', '.hb-colB > .hb-strip { flex: none; height: auto; }']) assert.ok(lw.includes(s), s);
});
test('Q2: the "your six" line goes only at 620 px tall or less', () => {
  assert.match(hub, /@media \(min-width: 760px\) and \(min-height: 500px\) and \(max-height: 620px\) and \(orientation: landscape\) \{\s*[^}]*\.hb-strip \.hb-th, \.hb-strip \.hb-cap \{ display: none; \}/);
});
test('Q3: header spans full width from 600 px up', () => {
  assert.match(hub, /@media \(min-width: 600px\) \{ \.hb-l2 \{ align-items: stretch; \}[^}]*\.hb-head \{ margin-left: -14px; margin-right: -14px; \}/);
});
test('Scorebook skin re-sets are undone inside LW', () => {
  assert.ok(sb.includes(LW));
  const lw = sb.slice(sb.indexOf(LW));
  assert.ok(lw.includes('.skin-scorebook .hb-colB > .hb-strip { height: auto; }'));
  assert.ok(lw.includes('white-space: normal'));
});
