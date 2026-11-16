// T8 helper A: shared ring wheel renderer: boost chip text, tier key, short names ("Maxi.."), fixed AIM, legend contrast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boostText, tierKeyRows, shortNameForms, uniquePrefixLens, splitNameValue, aimMarker, legendShape } from '../js/ui/wheel-look.js';

const view = readFileSync(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/wheel-shared.css', import.meta.url), 'utf8');

test('boost chip: value then x with a plus for a multiplier, as before for other units', () => {
  assert.equal(boostText('Hot Streak', 'x', 0.667), 'Hot Streak +0.667x');
  assert.equal(boostText('Booster', 'x', 1.5), 'Booster +1.5x');
  assert.equal(boostText('Booster', '+', 1), 'Booster +1');
  assert.equal(boostText('Hot Streak', undefined, undefined), 'Hot Streak +1');
  assert.doesNotMatch(boostText('Hot Streak', 'x', 0.667), /x0\./);
  assert.match(view, /boostText\('Hot Streak'/); assert.match(view, /boostText\('Booster'/);
});

test('tier key: shape + word per tier used, host shape rows win', () => {
  const ring = [{ tier: 'top' }, { tier: 'mid' }, { tier: 'low' }, { tier: 'top', gold: true }];
  const k = tierKeyRows(ring);
  assert.deepEqual(k.map((r) => r.text), ['high', 'middle', 'lowest', 'gold']);
  for (const r of k) assert.ok(legendShape(r.ch), 'every key row draws a shape: ' + r.ch);
  assert.deepEqual(tierKeyRows([{ tier: 'mid' }]).map((r) => r.text), ['middle']);
  assert.deepEqual(tierKeyRows(ring, [{ ch: 'tri', text: 'triangle = above centre' }]), []);
  assert.match(view, /tierKeyRows\(RING, o\.legend\)/);
});

test('short names: upright "Maxi.." forms, 3+ letters, unique among slices, never a single initial', () => {
  assert.deepEqual(splitNameValue('Maximilian +5%'), { name: 'Maximilian', val: '+5%' });
  const f = shortNameForms('Maximilian +5%');
  assert.equal(f[0], 'Maximilia.. +5%'); assert.ok(f.includes('Maxi.. +5%')); assert.ok(f.includes('Maxi..'));
  assert.ok(f.every((x) => /\.\./.test(x) && Array.from(x.split('..')[0]).length >= 3), 'always 3+ letters then ..');
  const names = ['Maximilian', 'Maxwell', 'Zed'], lens = uniquePrefixLens(names);
  assert.deepEqual(lens, [4, 4, 3], 'Maxi / Maxw / Zed');
  assert.equal(new Set(names.map((n, i) => n.slice(0, lens[i]).toLowerCase())).size, 3, 'short forms differ');
  assert.deepEqual(shortNameForms('Ab'), [], 'a name of 3 letters or fewer has no short form');
  assert.match(view, /shortNameForms\(own, minLen\[i\], tailLen\[i\]\)/); assert.match(view, /fMax: 14, fMin: 14/);
});

test('AIM: one word fixed at the top pointer, 14 px, upright (no rotate), not riding the rim', () => {
  assert.equal(aimMarker().fontPx, 14);
  assert.match(css, /\.wh-ov \.wh-aimw \{[^}]*left: 50%[^}]*font-size: 14px/);
  assert.doesNotMatch(view, /aimW\.style\.transform|aimT\./);
  assert.equal((view.match(/class="wh-aimw"/g) || []).length, 1, 'one AIM element');
});

test('wheel stays one size and place: ring stage anchored to the top; seam never under the pointer at rest', () => {
  assert.match(css, /\.wh-ov\.is-ring \.wh-stage \{ justify-content: flex-start; \}/);
  assert.match(view, /off < w0 \* 0\.15 \|\| off > w0 \* 0\.85\) pos = phi =/);
});

/** WCAG contrast of two #rrggbb colours. */
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('legend text: 14 px, >= 4.5:1 on its own ink plaque (skin independent)', () => {
  const m = /\.wh-ov \.wk-legend\.wh-lgd \{ background: var\(--outline, (#[0-9a-f]{6})\); color: (#[0-9a-f]{6});[^}]*font-size: 14px/i.exec(css);
  assert.ok(m, 'plaque rule found');
  assert.ok(ratio(m[1], m[2]) >= 4.5, 'contrast ' + ratio(m[1], m[2]).toFixed(2));
});

test('short + wide (475x638): legend beside the wheel, 76 px message box, no stacked legend row', () => {
  assert.match(css, /max-height: 700px\) \{ \.wh-ov\.is-ring \.wh-msg \{ height: 76px; min-height: 76px; \} \}/);
  assert.match(css, /@media \(max-height: 700px\) and \(min-width: 440px\) \{[^@]*grid-template-columns: minmax\(0, 1fr\) auto;[^@]*\.wk-legend\.wh-lgd \{ grid-column: 2; grid-row: 3;[^@]*flex-direction: column/);
});
