import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, THEMES } from '../js/store/commands.js';
import { createStore } from '../js/store/store.js';
import { createSave } from '../js/platform/save.js';
import { VERSION, unwrap, wrap } from '../js/core/save-migrate.js';
import { applyTheme, themeOf } from '../js/ui/theme.js';

const game = () => { const t = createStore(null); t.dispatch('NewGame', { seed: 'th-1' }); return t; };
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const fakeBody = () => { const c = new Set(); return { classList: { toggle: (n, on) => { if (on) c.add(n); else c.delete(n); }, has: (n) => c.has(n) }, c }; };

test('themes: green and scorebook; an absent field means green', () => {
  assert.deepEqual(THEMES, ['green', 'scorebook']);
  const s = game().get();
  assert.equal(s.theme, undefined); assert.equal(themeOf(s), 'green');
});

test('SetTheme stores the choice, ignores unknown names and no-op repeats', () => {
  const t = game(); const s0 = t.get();
  t.dispatch('SetTheme', { theme: 'scorebook' }); assert.equal(t.get().theme, 'scorebook'); assert.equal(themeOf(t.get()), 'scorebook');
  const s1 = t.get(); t.dispatch('SetTheme', { theme: 'scorebook' }); assert.equal(t.get(), s1);
  t.dispatch('SetTheme', { theme: 'neon' }); assert.equal(t.get(), s1);
  assert.equal(applyCommand(s0, 'SetTheme', {}), s0);
  t.dispatch('SetTheme', { theme: 'green' }); assert.equal(themeOf(t.get()), 'green');
});

test('gameplay is untouched: the theme does not change any rule state', () => {
  const a = game(), b = game(); b.dispatch('SetTheme', { theme: 'scorebook' });
  const { theme, ...rest } = b.get();
  assert.equal(theme, 'scorebook'); assert.deepEqual(rest, a.get());
  for (const t of [a, b]) { t.dispatch('Reseed', { salt: 'x' }); t.dispatch('PickCoach', {}); }
  const { theme: _t, ...rb } = b.get(); assert.deepEqual(rb, a.get());
});

test('the theme survives a later command (Reseed)', () => {
  const t = game(); t.dispatch('SetTheme', { theme: 'scorebook' });
  t.dispatch('Reseed', { salt: 'y' }); assert.equal(t.get().theme, 'scorebook');
});

test('save: theme round-trips, version stays 2, an old save without it loads as green', () => {
  assert.equal(VERSION, 2);
  const s = { ...game().get(), theme: 'scorebook' };
  const r = unwrap(JSON.stringify(wrap(s))); assert.equal(r.ok, true); assert.equal(r.state.theme, 'scorebook');
  const store = memStorage(), sv = createSave(store);
  const old = game().get(); assert.equal(sv.save(old), true);
  const l = sv.load(); assert.equal(l.state.theme, undefined); assert.equal(themeOf(l.state), 'green');
  sv.save(s); assert.equal(sv.load().state.theme, 'scorebook');
});

test('applyTheme swaps the skin classes on the body, both ways', () => {
  const b = fakeBody();
  applyTheme('scorebook', b); assert.ok(b.classList.has('skin-scorebook')); assert.ok(!b.classList.has('skin-art')); assert.ok(!b.classList.has('skin-retro-green'));
  applyTheme('green', b); assert.ok(!b.classList.has('skin-scorebook')); assert.ok(b.classList.has('skin-art')); assert.ok(b.classList.has('skin-retro-green'));
});
