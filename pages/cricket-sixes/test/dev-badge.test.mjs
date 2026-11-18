// G2 DEV badge: words (14 px floor), a11y text, DOM-absent when Dev is off, out of every layout (fixed), so the wheel size is the same on / off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { devBadgeWanted, syncDevBadge, mountDevBadge, BADGE_TEXT, BADGE_LABEL } from '../js/ui/dev-badge.js';
import { wheelCap } from '../js/ui/wheel-view.js';
import { applyCommand as C } from '../js/store/commands.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/** Tiny fake document: a list of present selectors-as-classes plus the badge node. */
function fakeDoc(classes) {
  const body = { kids: [], appendChild(n) { this.kids.push(n); n.remove = () => { this.kids = this.kids.filter((k) => k !== n); }; } };
  return { body, classes, createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    querySelector: (sel) => (sel === '.dev-badge' ? body.kids[0] || null : classes.some((c) => sel.split(',').map((x) => x.trim()).includes('.' + c)) ? {} : null) };
}
const on = { dev: { on: true } }, off = { dev: { on: false } };

test('wanted only when Dev is on AND a wheel screen is up', () => {
  assert.equal(devBadgeWanted(on, true), true);
  assert.equal(devBadgeWanted(on, false), false);
  assert.equal(devBadgeWanted(off, true), false);
  assert.equal(devBadgeWanted({}, true), false); assert.equal(devBadgeWanted(null, true), false);
  assert.equal(devBadgeWanted({ dev: { on: 'yes' } }, true), false, 'same strict test as devVal');
});

test('syncDevBadge: added once with role + a11y text, removed (DOM absent, not hidden) when Dev goes off', () => {
  for (const cls of ['wh-ov', 'wm']) { // big wheel / dial / reel, match wheel / Golden Over
    const d = fakeDoc([cls]);
    syncDevBadge(off, d); assert.equal(d.body.kids.length, 0);
    syncDevBadge(on, d); syncDevBadge(on, d); assert.equal(d.body.kids.length, 1, 'idempotent');
    const b = d.body.kids[0];
    assert.equal(b.className, cls === 'wh-ov' ? 'dev-badge' : 'dev-badge is-match', 'match screens use the strip under the header'); assert.equal(b.textContent, 'DEV'); assert.equal(BADGE_TEXT, 'DEV');
    assert.equal(b.attrs.role, 'status'); assert.equal(b.attrs['aria-label'], BADGE_LABEL); assert.match(BADGE_LABEL, /dev/i);
    assert.ok(!('hidden' in b.attrs), 'never merely hidden');
    syncDevBadge(off, d); assert.equal(d.body.kids.length, 0, 'removed');
  }
  const none = fakeDoc([]); syncDevBadge(on, none); assert.equal(none.body.kids.length, 0, 'no wheel screen: no badge');
});

test('css: match-screen badge sits under the 56 px header, left, clear of the header text (top-right) and the close button', () => {
  const css = read('css/wheel-shared.css'), m = css.match(/\.dev-badge\.is-match \{([^}]*)\}/);
  assert.ok(m); assert.match(m[1], /right:\s*auto/); assert.match(m[1], /top:\s*calc\((5[6-9]|6\d)px/); assert.match(m[1], /left:/);
});

test('mountDevBadge follows store changes', () => {
  const d = fakeDoc(['wm']); let s = off; const subs = [];
  mountDevBadge({ get: () => s, subscribe: (f) => subs.push(f) }, d);
  assert.equal(d.body.kids.length, 0);
  s = on; subs.forEach((f) => f(s)); assert.equal(d.body.kids.length, 1);
  s = off; subs.forEach((f) => f(s)); assert.equal(d.body.kids.length, 0);
});

test('real SetDev state drives it', () => {
  const g = C(null, 'NewGame', { seed: 'badge' });
  assert.equal(devBadgeWanted(g, true), false);
  assert.equal(devBadgeWanted(C(g, 'SetDev', { patch: { on: true } }), true), true);
});

test('css: one rule, fixed (out of flow), words >= 14 px, taps pass through, nothing else sizes by it', () => {
  const css = read('css/wheel-shared.css'), m = css.match(/\.dev-badge \{([^}]*)\}/);
  assert.ok(m, 'rule present'); assert.equal((css.match(/\.dev-badge \{/g) || []).length, 1);
  assert.match(m[1], /position:\s*fixed/); assert.match(m[1], /pointer-events:\s*none/);
  const px = +m[1].match(/font:\s*\d+\s+(\d+)px/)[1]; assert.ok(px >= 14, 'font ' + px);
  assert.doesNotMatch(m[1], /display:\s*none/);
  for (const f of ['js/ui/wheel-view.js', 'js/ui/dial-view.js', 'js/ui/reel-view.js', 'js/ui/wheelmatch-view.js', 'js/ui/golden-over-view.js']) assert.doesNotMatch(read(f), /dev-badge/, f + ' does not touch the badge (no layout input)');
  assert.match(read('js/main.js'), /mountDevBadge\(store\)/);
});

test('layout math: wheel size inputs never include the badge (Fold cover 344x882 and 475x638)', () => {
  // wheelCap reads only the overlay's width / height; the badge is position:fixed on <body>, so it is in neither. Same inputs on or off = same cap.
  for (const [w, h] of [[344, 882], [475, 638]]) {
    const wide = w >= 560, capOff = wheelCap(w, h, wide), capOn = wheelCap(w, h, wide);
    assert.equal(capOn, capOff); assert.equal(capOn, 340);
  }
});
