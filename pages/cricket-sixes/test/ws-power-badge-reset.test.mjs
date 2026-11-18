// Wheel settings T3 (BUILD-TICKET 2026-11-18): Dev power test overrides (item Dev 5/6), Guards G1 (recorded stop reopens), G2 (DEV badge), G3 (Reset all).
// Black box: only public APIs (ctrlOf, effective, metaWheel, matchPhys, devClamp / devChanged, store commands SetDev / DevReset, recordStop / storedStop, syncDevBadge).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { DEV_DEFAULTS, DEV_RANGE } from '../js/data/wheelmatch.js';
import { ctrlOf, devClamp, devChanged, matchPhys } from '../js/core/wheelmatch.js';
import { effective, metaWheel, metaOf } from '../js/core/wheelmeta.js';
import { wheelSlices } from '../js/core/training.js';
import { recordStop, storedStop } from '../js/core/wheel-stops.js';
import { devLine } from '../js/report/wmatch.js';
import { DEV_KEYS, POW_KEYS } from '../js/ui/wheelmatch-settings.js';
import { syncDevBadge, devBadgeWanted, BADGE_SEL } from '../js/ui/dev-badge.js';

const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const POW = ['powGuide', 'powZone', 'powChime', 'powSlow', 'powSteady'];
const NODE = { powGuide: 'c_guide', powZone: 'c_zone', powChime: 'c_chime', powSlow: 'c_slow', powSteady: 'c_steady' };
const game = (seed = 'ws-t3') => C(null, 'NewGame', { seed });
const withMeta = (s, owned, spokes = 0) => ({ ...s, wheelMeta: { ...metaOf(s), owned: { ...owned }, spokes } });
const noDev = (s) => { const { dev, ...rest } = s; return rest; };
const devOn = (s, patch = {}) => C(s, 'SetDev', { patch: { on: true, ...patch } });
const clone = (o) => JSON.parse(JSON.stringify(o));
const WORKSHOP = [
  [{}, 0], [{ c_slow: 1 }, 5], [{ c_slow: 3, c_steady: 2 }, 40], [{ c_guide: 1, c_zone: 1, c_chime: 1 }, 130],
  [{ c_slow: 2, c_steady: 1, c_guide: 1, c_zone: 1, c_chime: 1, f_wide: 2 }, 999], [{ c_steady: 2, c_chime: 1 }, 12],
];
const snap = (s) => ({ ctrl: ctrlOf(s), eff: effective(s), phys: matchPhys(s), wheel: metaWheel(wheelSlices('normal'), 'spot', s), hype: metaWheel(wheelSlices('normal'), 'hype', s) });

test('power keys: defaults -1 (Auto), in DEV_RANGE, out of DEV_KEYS, POW_KEYS exported and complete', () => {
  assert.deepEqual([...POW_KEYS].sort(), [...POW].sort());
  for (const k of POW) { assert.equal(DEV_DEFAULTS[k], -1, k); assert.ok(k in DEV_RANGE, k); assert.ok(!DEV_KEYS.includes(k), k); }
  assert.deepEqual(DEV_RANGE.powSlow.slice(0, 2), [-1, 3]); assert.deepEqual(DEV_RANGE.powSteady.slice(0, 2), [-1, 2]);
  for (const k of ['powGuide', 'powZone', 'powChime']) assert.deepEqual(DEV_RANGE[k].slice(0, 2), [-1, 1]);
});

test('parity: Dev off (even with power values stored) and Dev on with all Auto = no-dev output, every Workshop sample, flag on and off', () => {
  for (const flag of [true, false]) withFlags({ wheelMeta: flag }, () => {
    for (const [owned, spokes] of WORKSHOP) {
      const base = withMeta(noDev(game()), owned, spokes), want = snap(base);
      const off = withMeta(game(), owned, spokes), offTweaked = { ...off, dev: { ...devClamp({ powGuide: 1, powZone: 1, powChime: 1, powSlow: 3, powSteady: 2 }), on: false } };
      const auto = devOn(off);
      for (const [name, st] of [['off', off], ['off+stored powers', offTweaked], ['on+auto', auto]]) assert.deepEqual(snap(st), want, `flag ${flag} ${JSON.stringify(owned)} ${name}`);
      if (flag) { // ctrlOf mirrors the owned ranks
        assert.equal(ctrlOf(auto).slowRank, owned.c_slow | 0); assert.equal(ctrlOf(auto).steadyRank, owned.c_steady | 0);
        assert.equal(ctrlOf(auto).guide, !!owned.c_guide); assert.equal(ctrlOf(auto).zone, !!owned.c_zone); assert.equal(ctrlOf(auto).chime, !!owned.c_chime);
      } else assert.deepEqual(ctrlOf(auto), { slowRank: 0, steadyRank: 0, guide: false, zone: false, chime: false });
    }
  });
});

test('overrides apply only while Dev is on (ctrlOf and effective)', () => withFlags({ wheelMeta: true }, () => {
  const s0 = withMeta(game(), { c_slow: 1, c_steady: 1, c_guide: 1, c_zone: 1, c_chime: 1 }, 50);
  const patch = { powGuide: 0, powZone: 0, powChime: 0, powSlow: 3, powSteady: 0 };
  const offS = C(s0, 'SetDev', { patch }); assert.equal(offS.dev.on, false);
  assert.deepEqual(snap(offS), snap(noDev(s0)), 'Dev off ignores every override');
  const on = C(offS, 'SetDev', { patch: { on: true } });
  assert.deepEqual(ctrlOf(on), { slowRank: 3, steadyRank: 0, guide: false, zone: false, chime: false });
  const e = effective(on).spot; assert.equal(e.guide, false); assert.equal(e.zone, 0); assert.equal(e.chime, false);
  assert.ok(Math.abs(e.w0Mult - 0.55) < 1e-9); assert.equal(e.jMult, 1);
  const back = C(on, 'SetDev', { patch: { on: false } });
  assert.deepEqual(snap(back), snap(noDev(s0)), 'toggle Dev off restores Workshop behaviour');
}));

test('each override works: Guide / Zone / Chime On and Off, Slow 0-3, Steady 0-2 (nothing owned, then everything owned)', () => withFlags({ wheelMeta: true }, () => {
  for (const owned of [{}, { c_slow: 3, c_steady: 2, c_guide: 1, c_zone: 1, c_chime: 1 }]) {
    const base = withMeta(game(), owned, 7);
    for (const v of [0, 1]) {
      const g = devOn(base, { powGuide: v }), z = devOn(base, { powZone: v }), c = devOn(base, { powChime: v });
      assert.equal(ctrlOf(g).guide, v === 1); assert.equal(effective(g).spot.guide, v === 1); assert.equal(matchPhys(g).SD, v ? 0.080 : 0.110);
      assert.equal(ctrlOf(z).zone, v === 1); assert.equal(effective(z).spot.zone > 0, v === 1); assert.equal(effective(z).finals.zone > 0, v === 1);
      assert.equal(ctrlOf(c).chime, v === 1); assert.equal(effective(c).spot.chime, v === 1); assert.equal(effective(c).hype.chime, v === 1);
    }
    for (let r = 0; r <= 3; r++) {
      const s = devOn(base, { powSlow: r });
      assert.equal(ctrlOf(s).slowRank, r);
      assert.ok(Math.abs(effective(s).spot.w0Mult - (1 - 0.15 * r)) < 1e-9, 'w0Mult rank ' + r);
      assert.ok(Math.abs(matchPhys(s).W0 - 36 * (1 - 0.15 * r)) < 1e-9, 'match W0 rank ' + r);
      assert.ok(Math.abs(metaWheel(wheelSlices('normal'), 'spot', s).phys.W0 - 36 * (1 - 0.15 * r)) < 1e-9, 'metaWheel W0 rank ' + r);
    }
    for (let r = 0; r <= 2; r++) {
      const s = devOn(base, { powSteady: r });
      assert.equal(ctrlOf(s).steadyRank, r);
      assert.ok(Math.abs(effective(s).spot.jMult - Math.pow(0.85, r)) < 1e-9, 'jMult rank ' + r);
      assert.ok(Math.abs(matchPhys(s).J - 1.2 * Math.pow(0.85, r)) < 1e-9, 'match J rank ' + r);
    }
  }
}));

test('overrides never mutate the save, Workshop ranks, Spokes (SetDev, DevReset, reads)', () => withFlags({ wheelMeta: true }, () => {
  const s0 = withMeta(game(), { c_slow: 2, c_steady: 1, c_guide: 1, f_wide: 1 }, 123);
  const before = clone({ ...s0, dev: undefined });
  let s = devOn(s0, { powGuide: 0, powZone: 1, powChime: 1, powSlow: 3, powSteady: 2 });
  effective(s); ctrlOf(s); matchPhys(s); metaWheel(wheelSlices('normal'), 'spot', s);
  assert.deepEqual(clone({ ...s, dev: undefined }), before);
  assert.equal(s.wheelMeta.spokes, 123); assert.deepEqual(s.wheelMeta.owned, { c_slow: 2, c_steady: 1, c_guide: 1, f_wide: 1 });
  s = C(s, 'DevReset', { all: true });
  assert.deepEqual(clone({ ...s, dev: undefined }), before);
}));

test('bad power values clamp', () => withFlags({ wheelMeta: true }, () => {
  const c = (patch) => devClamp({ on: true, ...patch });
  assert.equal(c({ powSlow: 9 }).powSlow, 3); assert.equal(c({ powSlow: -5 }).powSlow, -1); assert.equal(c({ powSlow: 1.6 }).powSlow, 2);
  assert.equal(c({ powSteady: 7 }).powSteady, 2); assert.equal(c({ powSteady: -2 }).powSteady, -1);
  for (const k of ['powGuide', 'powZone', 'powChime']) { assert.equal(c({ [k]: 5 })[k], 1); assert.equal(c({ [k]: -9 })[k], -1); }
  for (const bad of [NaN, Infinity, 'x', null, undefined, {}, '2']) for (const k of POW) assert.equal(c({ [k]: bad })[k], -1, k + ' ' + String(bad));
  assert.deepEqual(POW.map((k) => devClamp(null)[k]), [-1, -1, -1, -1, -1]);
  const s = devOn(withMeta(game(), { c_slow: 1 }), { powSlow: 99, powSteady: -40, powGuide: 7 });
  assert.equal(s.dev.powSlow, 3); assert.equal(s.dev.powSteady, -1); assert.equal(s.dev.powGuide, 1);
  assert.equal(ctrlOf(s).slowRank, 3);
}));

test('report stamps power overrides (dev: line) only while Dev on and only when changed', () => {
  const s = devOn(game(), { powSlow: 2, powGuide: 1 });
  const ch = devChanged(s); assert.equal(ch.powSlow, 2); assert.equal(ch.powGuide, 1); assert.deepEqual(Object.keys(ch).sort(), ['powGuide', 'powSlow']);
  const line = devLine(ch); assert.match(line, /powSlow=2/); assert.match(line, /powGuide=1/);
  assert.deepEqual(devChanged(devOn(game())), {}); assert.equal(devLine(devChanged(devOn(game()))), null);
  assert.deepEqual(devChanged(C(s, 'SetDev', { patch: { on: false } })), {});
  assert.deepEqual(devChanged(C(s, 'DevReset', { all: true })), {});
});

// ---- G1: recorded stop reopens on its stored sliceId after Dev changes
test('G1 a recorded stop keeps its stored slice after Dev cycle length, tick lead and power overrides change', () => withFlags({ wheelMeta: true }, () => {
  const rec = { stopT: 4100, cycle: 1, tInCycle: 3.5, sliceId: 3, value: 1.5, auto: false, respin: 0 };
  let s = withMeta(game(), { c_slow: 1 }, 10);
  const n = clone(s); recordStop(n, 'spot', '218|p1', rec, { median: 1 }); recordStop(n, 'hype', 'H1', { ...rec, sliceId: 5, tInCycle: 2.0, value: 4 });
  s = { ...n, dev: s.dev };
  const stored = clone([storedStop(s, 'spot', '218|p1'), storedStop(s, 'hype', 'H1')]);
  assert.equal(stored[0].stops[stored[0].kept].sliceId, 3); assert.equal(stored[1].stops[0].sliceId, 5);
  const steps = [{ on: true }, { matchCycle: 3 }, { matchCycle: 10 }, { matchLeadMin: 30, matchLeadMax: 180 }, { matchLeadMin: 120 }, { powSlow: 3, powSteady: 2, powGuide: 1, powZone: 1, powChime: 1 }, { powSlow: 0, powGuide: 0 }, { matchW0: 90, matchD: 4, matchJ: 3 }];
  for (const p of steps) {
    s = C(s, 'SetDev', { patch: p });
    assert.deepEqual([storedStop(s, 'spot', '218|p1'), storedStop(s, 'hype', 'H1')], stored, 'stored stops unchanged after ' + JSON.stringify(p));
    assert.equal(storedStop(s, 'spot', '218|p1').stops[0].sliceId, 3);
  }
  s = C(s, 'DevReset', { all: true });
  assert.deepEqual([storedStop(s, 'spot', '218|p1'), storedStop(s, 'hype', 'H1')], stored);
}));

// ---- G2: DEV badge (tiny fake document: body children with class lists; querySelector over comma-separated class selectors)
function fakeDoc(screenClasses = []) {
  const mk = (cls = '') => ({ cls: new Set(cls.split(' ').filter(Boolean)), attrs: {}, textContent: '', _gone: false,
    set className(v) { this.cls = new Set(String(v).split(' ').filter(Boolean)); }, get className() { return [...this.cls].join(' '); },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, remove() { this._gone = true; doc.body.kids = doc.body.kids.filter((x) => x !== this); } });
  const doc = { body: { kids: screenClasses.map((c) => mk(c)), appendChild(e) { this.kids.push(e); return e; } }, createElement: () => mk(),
    querySelector(sel) { const wants = sel.split(',').map((x) => x.trim().replace(/^\./, '').split('.')); return this.body.kids.find((k) => wants.some((w) => w.every((c) => k.cls.has(c)))) || null; } };
  doc.mk = mk; return doc;
}
test('G2 DEV badge: shown in words on wheel screens only while Dev on; absent from DOM otherwise', () => {
  const off = game(), on = devOn(game());
  assert.equal(devBadgeWanted(off, true), false); assert.equal(devBadgeWanted(on, false), false); assert.equal(devBadgeWanted(on, true), true);
  assert.equal(devBadgeWanted(null, true), false); assert.equal(devBadgeWanted(C(on, 'SetDev', { patch: { on: false } }), true), false);
  for (const screen of ['wh-ov', 'wm', 'wm go']) { // big wheel / dial / reel, match wheel, Golden Over
    const d = fakeDoc([screen]);
    syncDevBadge(off, d); assert.equal(d.querySelector('.dev-badge'), null, screen + ' off: no badge');
    syncDevBadge(on, d); const b = d.querySelector('.dev-badge'); assert.ok(b, screen + ' on: badge');
    assert.equal(b.textContent, 'DEV'); assert.ok(b.getAttribute('aria-label') || /dev/i.test(b.textContent));
    syncDevBadge(on, d); assert.equal(d.body.kids.filter((k) => k.cls.has('dev-badge')).length, 1, 'idempotent');
    syncDevBadge(off, d); assert.equal(d.querySelector('.dev-badge'), null, screen + ': removed when Dev goes off');
  }
  const hub = fakeDoc(['hub']); syncDevBadge(on, hub); assert.equal(hub.querySelector('.dev-badge'), null, 'no wheel screen, no badge');
  const closing = fakeDoc(['wm']); syncDevBadge(on, closing); closing.body.kids = closing.body.kids.filter((k) => !k.cls.has('wm')); syncDevBadge(on, closing);
  assert.equal(closing.querySelector('.dev-badge'), null, 'removed when the wheel screen closes');
  assert.ok(typeof BADGE_SEL === 'string' && BADGE_SEL.length > 0);
});

// ---- G3: Reset all covers every DEV_RANGE key
const offDefault = (k) => { const [lo, hi] = DEV_RANGE[k]; return DEV_DEFAULTS[k] !== lo ? lo : hi; };
test('G3 every DEV_RANGE key is covered by the UI key lists (DEV_KEYS + POW_KEYS) exactly once', () => {
  const all = Object.keys(DEV_RANGE);
  assert.deepEqual([...DEV_KEYS, ...POW_KEYS].sort(), [...all].sort());
  assert.equal(new Set([...DEV_KEYS, ...POW_KEYS]).size, all.length);
  for (const k of ['matchLeadMin', 'matchLeadMax', 'matchCycle', 'tickW', 'tickL', ...POW]) assert.ok(all.includes(k), 'DEV_RANGE has ' + k);
  for (const k of all) assert.ok(k in DEV_DEFAULTS, k + ' has a default');
});
test('G3 set EVERY DEV_RANGE key off-default, then DevReset all returns every key to DEFAULT (and keeps Dev on)', () => {
  const all = Object.keys(DEV_RANGE), patch = { on: true };
  for (const k of all) patch[k] = offDefault(k);
  let s = C(game(), 'SetDev', { patch });
  const ch = devChanged(s);
  for (const k of all) { assert.notEqual(s.dev[k], DEV_DEFAULTS[k], k + ' really off default'); assert.ok(k in ch, k + ' stamped in report'); }
  assert.equal(s.dev.on, true);
  const r = C(s, 'DevReset', { all: true });
  for (const k of all) assert.equal(r.dev[k], DEV_DEFAULTS[k], k + ' back to default');
  assert.equal(r.dev.on, true, 'Reset all keeps Dev on');
  assert.deepEqual(devChanged(r), {});
  // single-key reset path still resets just that key
  const one = C(s, 'DevReset', { key: 'matchCycle' }); assert.equal(one.dev.matchCycle, DEV_DEFAULTS.matchCycle); assert.equal(one.dev.tickW, s.dev.tickW);
  // plain reset (no payload) = matchW0 only
  const plain = C(s, 'DevReset', {}); assert.equal(plain.dev.matchW0, DEV_DEFAULTS.matchW0); assert.equal(plain.dev.powSlow, s.dev.powSlow);
});
test('G3 Reset all also undoes power overrides in effect (behaviour back to Workshop)', () => withFlags({ wheelMeta: true }, () => {
  const base = withMeta(game(), { c_slow: 1, c_guide: 1 }, 20);
  const s = devOn(base, { powSlow: 3, powGuide: 0, powSteady: 2, matchCycle: 9, matchLeadMin: 30 });
  const r = C(s, 'DevReset', { all: true });
  assert.deepEqual(snap(r), snap(noDev(base)));
}));
