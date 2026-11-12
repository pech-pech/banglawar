import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, wrap, unwrap, migrate, fnv1a } from '../js/core/save-migrate.js';
import { createSave, KEY, BAK } from '../js/platform/save.js';
import { createStore } from '../js/store/store.js';

const step0 = () => { const st = createStore(null); st.dispatch('NewMatch', { seed: 'sv-1' }); return st.get(); };
const fakeNewGame = (seed) => ({ v: 3, stage: 'coach', seed: String(seed), salt: '', season: { n: 1, seed: String(seed), round: 1 }, coaches: [], coachPicked: false });
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};
const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } });

test('keys are cs.save.1 and cs.save.1.bak, VERSION is 3', () => {
  assert.equal(KEY, 'cs.save.1'); assert.equal(BAK, 'cs.save.1.bak'); assert.equal(VERSION, 3);
});

test('round trip: wrap then unwrap deep-equals the state', () => {
  const s = { ...fakeNewGame('a'), extra: { x: [1, 2, { y: 'z' }] } };
  const r = unwrap(JSON.stringify(wrap(s)));
  assert.equal(r.ok, true); assert.equal(r.from, VERSION);
  assert.deepEqual(r.state, s);
});

test('VERSION and checksum are in the envelope', () => {
  const w = wrap(fakeNewGame('a'));
  assert.equal(w.v, VERSION);
  assert.equal(w.sum, fnv1a(JSON.stringify(w.data)));
  assert.match(String(w.sum), /^[0-9a-f]{8}$/);
});

test('bad checksum is refused with a reason', () => {
  const w = wrap(fakeNewGame('a')); w.data.seed = 'tampered';
  const r = unwrap(JSON.stringify(w));
  assert.equal(r.ok, false); assert.equal(r.reason, 'checksum');
});

test('garbage text is refused, not thrown', () => {
  for (const t of ['', 'nope', '{', '[]', '{"v":1}', 'null', '{"v":1,"sum":"x","data":5}']) {
    const r = unwrap(t); assert.equal(r.ok, false, t);
  }
});

test('migrate: step-0 state loads to current VERSION with new-game defaults', () => {
  const s0 = step0();
  assert.equal(s0.v, undefined);
  const r = unwrap(JSON.stringify(s0), { newGame: fakeNewGame });
  assert.equal(r.ok, true); assert.equal(r.from, 0);
  assert.equal(r.state.v, VERSION);
  assert.equal(r.state.stage, 'coach');
  assert.ok(r.state.season);
  assert.equal(r.state.salt, '');
});

test('migrate without a newGame hook still stamps the version and keeps step-0 fields', () => {
  const s0 = step0();
  const m = migrate(s0, 0);
  assert.equal(m.ok, true);
  assert.equal(m.state.v, VERSION);
  assert.equal(m.state.salt, '');
  assert.equal(m.state.stage, s0.stage);
});

test('migrate is idempotent and never mutates input', () => {
  const s0 = step0(); const before = JSON.stringify(s0);
  const a = migrate(s0, 0, { newGame: fakeNewGame });
  assert.equal(JSON.stringify(s0), before);
  const b = migrate(a.state, VERSION, { newGame: fakeNewGame });
  assert.deepEqual(b.state, a.state);
  const frozen = Object.freeze(structuredClone(s0));
  assert.equal(migrate(frozen, 0).ok, true);
});

test('newer VERSION is refused and the original text is kept', () => {
  const text = JSON.stringify({ v: VERSION + 1, sum: 'abcd1234', data: { stage: 'hub' } });
  const r = unwrap(text);
  assert.equal(r.ok, false); assert.equal(r.reason, 'newer');
  const st = memStorage({ [KEY]: text });
  const sv = createSave(st);
  const l = sv.load();
  assert.equal(l.state, null); assert.equal(l.reason, 'newer');
  assert.equal(sv.save(fakeNewGame('x')), false, 'must not overwrite a newer save');
  assert.equal(st.getItem(KEY), text);
});

test('save then load through storage; second save moves the first to .bak', () => {
  const st = memStorage(); const sv = createSave(st);
  const a = fakeNewGame('a'), b = { ...fakeNewGame('b'), stage: 'hub' };
  assert.equal(sv.save(a), true);
  assert.equal(sv.save(b), true);
  assert.deepEqual(sv.load().state, b);
  assert.deepEqual(unwrap(st.getItem(BAK)).state, a);
});

test('bad checksum in the main key falls back to .bak', () => {
  const st = memStorage(); const sv = createSave(st);
  const a = fakeNewGame('a'), b = { ...fakeNewGame('b'), stage: 'hub' };
  sv.save(a); sv.save(b);
  const w = JSON.parse(st.getItem(KEY)); w.data.stage = 'tampered'; st.setItem(KEY, JSON.stringify(w));
  const l = sv.load();
  assert.deepEqual(l.state, a); assert.equal(l.source, 'bak');
});

test('both keys bad: no state, no throw', () => {
  const st = memStorage({ [KEY]: 'junk', [BAK]: 'junk' });
  const l = createSave(st).load();
  assert.equal(l.state, null); assert.equal(l.source, 'none');
});

test('step-0 bare state in storage is migrated on load', () => {
  const st = memStorage({ [KEY]: JSON.stringify(step0()) });
  const l = createSave(st).load({ newGame: fakeNewGame });
  assert.equal(l.state.v, VERSION); assert.equal(l.from, 0);
});

test('export text imports to the same state', () => {
  const s = { ...fakeNewGame('e'), stage: 'week' };
  const sv = createSave(memStorage());
  const text = sv.exportText(s);
  assert.equal(typeof text, 'string');
  const r = sv.importText('  ' + text + '\n');
  assert.equal(r.ok, true); assert.deepEqual(r.state, s);
  assert.equal(sv.importText(text.slice(0, -5)).ok, false);
});

test('private mode: storage that throws is caught and the game continues', () => {
  const sv = createSave(throwing());
  assert.equal(sv.save(fakeNewGame('a')), false);
  const l = sv.load();
  assert.equal(l.state, null); assert.equal(l.reason, 'unavailable');
  assert.doesNotThrow(() => sv.clear());
  const none = createSave(null);
  assert.equal(none.save(fakeNewGame('a')), false); assert.equal(none.load().state, null);
});

test('quota error on the main write leaves the old save readable', () => {
  const st = memStorage(); const sv = createSave(st);
  const a = fakeNewGame('a'); sv.save(a);
  const real = st.setItem; st.setItem = (k, v) => { if (k === KEY) throw new Error('quota'); real(k, v); };
  assert.equal(sv.save({ ...a, stage: 'hub' }), false);
  st.setItem = real;
  assert.equal(sv.load().state.stage, a.stage);
});

test('clear removes both keys', () => {
  const st = memStorage(); const sv = createSave(st); sv.save(fakeNewGame('a')); sv.save(fakeNewGame('b'));
  sv.clear(); assert.equal(st.getItem(KEY), null); assert.equal(st.getItem(BAK), null);
});

test('rng is not saved: no rng object, salt re-rolled by Reseed on load (not stored in main.js state shape)', () => {
  const s = step0();
  const text = JSON.stringify(wrap(s));
  assert.equal(/"rng"|"_s"|Math\.random/.test(text), false);
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /Reseed/); assert.match(src, /get\('seed'\)/); assert.match(src, /q \? '' :/);
});

test('only js/platform/save.js (and js/report) touch localStorage; no other game file does', async () => {
  const { readdirSync } = await import('node:fs'); const { join } = await import('node:path');
  const root = new URL('../js/', import.meta.url).pathname;
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []);
  for (const f of walk(root)) {
    if (f.includes('/js/report/') || f.endsWith('/platform/save.js')) continue;
    assert.equal(/localStorage|sessionStorage/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')), false, f);
  }
});
