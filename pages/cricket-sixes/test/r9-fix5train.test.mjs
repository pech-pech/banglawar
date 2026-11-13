// r9 FIX5-TRAIN: QA3 m5 (Breakthrough only on a whole letter), m7 (names not cut, "Week 1" one line), m8 (match day "?" + Back), m11 (wheel X off while turning).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineHtml, lineText, bigStep } from '../js/ui/nets-scene.js';
import { wholeLetter } from '../js/ui/wheel-view.js';
import { matchdayHtml, FIXTURE_VM } from '../js/ui/matchday-view.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// raw 27 = E, 31 = E+, 34 = D-
const line = (fromRaw, toRaw, extra) => ({ id: 'p1', name: 'Jabari', stat: 'bsk', fromRaw, toRaw, word: 'Good', breakthrough: true, ...extra });

test('m5: Breakthrough only when a whole letter is crossed (E+ to D-), not on a step (E to E+)', () => {
  assert.equal(bigStep(line(27, 31)), false);
  assert.ok(!/Breakthrough/.test(lineHtml(line(27, 31))));
  assert.ok(!/Breakthrough/.test(lineText(line(27, 31))));
  assert.equal(bigStep(line(31, 34)), true);
  assert.match(lineHtml(line(31, 34)), /Breakthrough!/);
  assert.match(lineText(line(31, 34)), /Breakthrough/);
  assert.equal(wholeLetter('E', 'E+'), false); assert.equal(wholeLetter('E+', 'D-'), true); assert.equal(wholeLetter('E-', 'E+'), false);
  // the wheel keeps the tag on a jackpot, and only shows the plain tag on a whole letter
  assert.match(read('js/ui/wheel-view.js'), /d\.breakthrough && wholeLetter\(d\.from, d\.to\)/);
});

test('m7: a long name gets a soft hyphen instead of "Jab..."; the name is not ellipsised; "Week N" stays together', () => {
  const h = lineHtml({ ...line(27, 31), name: 'Chowdhury' });
  assert.match(h, /Chowd&shy;hury/);
  const css = read('css/training2.css'), tail = css.slice(css.indexOf('QA3 r9 fixes'));
  assert.match(tail, /\.t2-nm \{[^}]*text-overflow: clip/); assert.match(tail, /\.tr-nw \{ white-space: nowrap; \}/);
  assert.match(read('js/ui/training-view.js'), /class="tr-nw">Week /); assert.match(read('js/ui/week-view.js'), /class="tr-nw">Week /);
});

test('m8: match day "?" uses the shared help button look; Back to squad stays on one line', () => {
  const h = matchdayHtml(FIXTURE_VM, { hype: false, toss: false, pep: false });
  assert.match(h, /class="c-icon-btn help-btn" data-md="info"/); assert.ok(!/class="q"/.test(h));
  assert.match(read('css/matchday.css'), /\.md-cta \.md-back \{[^}]*white-space: nowrap;[^}]*font-size: 16px/);
});

test('m11: the wheel X is shown off (aria-disabled + is-wait, dashed) while it turns or slows, and back on at the result', () => {
  const js = read('js/ui/wheel-view.js');
  assert.match(js, /function waitLook[^\n]*xLook\(true\)/); assert.match(js, /xLook\(false\); go\.focus\(\)/);
  assert.match(js, /x\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(read('css/training2.css'), /\.wh-ov \.wh-x\.is-wait \{[^}]*border-style: dashed/);
});
