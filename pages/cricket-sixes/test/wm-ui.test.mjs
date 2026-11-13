// Wheel meta UI: Workshop (workshop-view), tier-up card, look helpers. Rendered from a fake VM with a fake root (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, workshopHtml, nodeRowHtml, nodeSheetHtml } from '../js/ui/workshop-view.js';
import { tierUpHtml } from '../js/ui/tierup-card.js';
import { normLook, colourOf, MATERIALS, wheelSvg } from '../js/ui/wheel-look.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fakeRoot() {
  const r = { innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, contains: () => true, querySelector: () => null };
  r.tap = (sel, attrs) => { const el = { getAttribute: (k) => attrs[k], closest: (q) => (q.indexOf(sel) >= 0 ? el : null) }; r.handlers.click({ target: { closest: (q) => el.closest(q) } }); };
  return r;
}
const node = (o) => ({ id: 'x', name: 'Slow Spin', rank: 0, max: 2, cost: 10, state: 'buy', words: 'The wheel starts slower.', confirm: false, ...o });
const vm = (o) => ({ visible: true, spokes: 12, tier: 2, material: 'brass', swap: { open: false, coins: 0 }, branches: [
  { id: 'control', name: 'Control', nodes: [node({ id: 'c_slow', rank: 1, state: 'owned' }), node({ id: 'c_guide', name: 'Aim Guide', cost: 40, state: 'short', words: 'A tick shows where the wheel would stop.' }), node({ id: 'c_x', name: 'Crawl', state: 'locked', words: 'Even slower.' }), node({ id: 'c_big', name: 'Big', cost: 60, state: 'buy', confirm: true })] },
  { id: 'fortune', name: 'Fortune', nodes: [node({ id: 'f1', name: 'Wide Gold' })] },
  { id: 'specialist', name: 'Specialist', nodes: [] }, { id: 'craft', name: 'Craft', nodes: [node({ id: 'k_rim', name: 'Rim Paint', max: 3 })] },
], ...o });

test('workshop: four branch tabs, wheel front view with materials, Spoke count', () => {
  const r = fakeRoot(); render(r, vm(), () => {});
  for (const t of ['Control', 'Fortune', 'Specialist', 'Craft', 'Wheel Workshop']) assert.ok(r.innerHTML.includes(t), t);
  assert.equal((r.innerHTML.match(/data-wk-branch=/g) || []).length, 4);
  assert.match(r.innerHTML, /aria-label="12 Spokes"/);
  for (const m of ['Wooden', 'Brass', 'Steel', 'Silver', 'Gold', 'Star', 'Crystal']) assert.ok(r.innerHTML.includes(m), m);
  assert.match(r.innerHTML, /<svg class="wk-wheel"/);
  assert.match(r.innerHTML, /wk-bead is-on/, 'owned ranks are filled beads');
});
test('workshop: node words, "Opens later", "Need N Spokes, you have M"; never a spin count or odds', () => {
  const h = workshopHtml(vm());
  assert.match(h, /Opens later/);
  assert.ok(nodeRowHtml(node({ cost: 40, state: 'short' }), 12).includes('Need 40 Spokes, you have 12'));
  assert.ok(h.includes('A tick shows where the wheel would stop.'));
  assert.doesNotMatch(h, /\d+ spins|odds|\d%| chance/i);
  assert.ok(nodeSheetHtml(node({ state: 'short', cost: 40 }), 12, '').includes('Need 40 Spokes, you have 12.'));
  assert.ok(nodeSheetHtml(node({ state: 'locked' }), 12, '').includes('Opens later.'));
});
test('workshop: buy needs a confirm only when the node says so ("Buy? This stays for the run")', () => {
  assert.doesNotMatch(nodeSheetHtml(node({ state: 'buy', cost: 10 }), 30, ''), /This stays/);
  assert.match(nodeSheetHtml(node({ state: 'buy', cost: 60, confirm: true }), 80, 'ask'), /Buy\? This stays for the run\./);
  assert.match(nodeSheetHtml(node({ state: 'buy', cost: 60, confirm: true }), 80, 'ask'), /data-wk-yes/);
  assert.match(nodeSheetHtml(node({ state: 'buy', cost: 10 }), 30, ''), /data-wk-buy/);
});
test('workshop: swap row only when open; tap dispatches SwapSpokes', () => {
  assert.doesNotMatch(workshopHtml(vm()), /Spare Spokes/);
  const calls = [], r = fakeRoot(); render(r, vm({ swap: { open: true, coins: 6 } }), (c, p) => calls.push([c, p]));
  assert.match(r.innerHTML, /Spare Spokes: swap 2 for 1 Coin/);
  r.tap('[data-wk-swap]', {}); assert.deepEqual(calls, [['SwapSpokes', {}]]);
});
test('workshop: a branch tab changes the list (view state only)', () => {
  const r = fakeRoot(); render(r, vm(), () => {}); assert.ok(r.innerHTML.includes('Aim Guide'));
  r.tap('[data-wk-branch]', { 'data-wk-branch': 'fortune' });
  assert.ok(r.innerHTML.includes('Wide Gold')); assert.ok(!r.innerHTML.includes('Aim Guide'));
  r.tap('[data-wk-branch]', { 'data-wk-branch': 'control' });
});
test('tier-up card: material, the Spoke line, both buttons; still before/after (reduced motion css)', () => {
  const h = tierUpHtml({ tier: 2, material: 'brass', from: 'wood' });
  assert.match(h, /Brass Wheel!/); assert.ok(h.includes('Every spin now drops 1 more Spoke')); assert.match(h, /See the tree/); assert.match(h, />Done</);
  assert.match(h, /tu-before/); assert.match(h, /tu-after/);
  assert.match(read('css/training2.css'), /prefers-reduced-motion: no-preference\) \{ \.tu-turn/);
  for (let t = 1; t <= 7; t++) assert.match(tierUpHtml({ tier: t, material: MATERIALS[t - 1] }), /Wheel!/);
});
test('look helpers: ranks map to looks, 0 = none, colours parse, wheel svg draws 4 spokes', () => {
  const l = normLook({ rim: 2, hub: 0, ptr: 1, trail: 2, pal: 1, spoke: 2, burst: 1, stand: 2, name: true, crystal: true, material: 'gold' });
  assert.equal(l.pal, 'cvd'); assert.equal(l.hub, ''); assert.equal(l.name, 'My Wheel'); assert.equal(l.crystal, true);
  assert.equal(normLook(null), null);
  assert.deepEqual(colourOf('#fff'), [255, 255, 255]); assert.equal(colourOf('nope'), null);
  assert.equal((wheelSvg({ mat: 'wood', spokes: 4, size: 100 }).match(/<line /g) || []).length, 4);
});
test('wheel-view keeps the old behaviour without o.look / o.guide / o.tokens and reads phys', () => {
  const src = read('js/ui/wheel-view.js');
  assert.match(src, /o\.guide && state === 'spin'/); assert.match(src, /o\.phys/); assert.match(src, /LK = normLook\(o\.look\)/);
  assert.match(src, /carefulTapTime\(WO, ph, 1 - Math\.random\(\), Math\.random\(\), \.\.\.PX\)/);
});
