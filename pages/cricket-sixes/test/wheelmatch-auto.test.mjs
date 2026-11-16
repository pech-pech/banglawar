// A3.1b: "Auto over" is gone; "Auto rest of innings" is disabled (still shown) while a wheel spins; settings tap targets >= 56 px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoRestState, autoRestHtml } from '../js/store/wheelmatch-store.js';
import { WMS_CSS } from '../js/ui/wheelmatch-settings.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('no "Auto over" in the store or settings source', () => {
  for (const p of ['../js/store/wheelmatch-store.js', '../js/ui/wheelmatch-settings.js']) {
    const s = src(p);
    assert.doesNotMatch(s, /auto-over/);
    assert.doesNotMatch(s, /Auto over/);
    assert.doesNotMatch(s, /Skip to the end of the over/);
  }
});

test('Auto rest: hidden before over 2, disabled while spinning, enabled otherwise', () => {
  assert.equal(autoRestHtml({ autoRestShown: false }, false), '');
  assert.equal(autoRestState({ autoRestShown: false }, true).disabled, false);
  const idle = autoRestHtml({ autoRestShown: true }, false);
  assert.match(idle, /data-wm="auto-rest"/);
  assert.match(idle, />Auto rest of innings</);
  assert.doesNotMatch(idle, /disabled/);
  const spin = autoRestHtml({ autoRestShown: true }, true);
  assert.match(spin, /aria-disabled="true" disabled/);
  assert.match(spin, />Auto rest of innings</);
});

test('settings tap targets are >= 56 px', () => {
  assert.match(WMS_CSS, /\.wms-range\{width:100%;height:56px/);
  assert.match(WMS_CSS, /\.wms-btn\{min-height:56px/);
  assert.match(WMS_CSS, /\.wms-adv summary\{min-height:56px/);
  assert.match(WMS_CSS, /slider-thumb\{[^}]*width:56px;height:56px/);
});
