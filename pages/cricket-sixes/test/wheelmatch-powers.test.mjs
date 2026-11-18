// Dev power test (wheel settings 2026-11-18, Dev 5/6): Aim Guide / Aim Zone / Gold Chime switches and Slow / Steady rank sliders override the
// Control ranks the wheels feel (ctrlOf, wheelmeta effective / controlRanks / metaWheel) ONLY while Dev is on. -1 = Auto = no override.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { DEV_DEFAULTS, DEV_RANGE, DEV_POWERS } from '../js/data/wheelmatch.js';
import { devClamp, devChanged, ctrlOf, matchPhys, devPowers } from '../js/core/wheelmatch.js';
import { effective, controlRanks, metaWheel, rankOf, metaOf } from '../js/core/wheelmeta.js';
import { wheelSlices } from '../js/core/training.js';
import { devLine } from '../js/report/wmatch.js';
import { buildText } from '../js/report/report.js';
import { POW_KEYS, POW_SWITCHES, POW_SLIDERS, powSectionHtml, powSwitchHtml, devFmt, sliderHtml, DEV_KEYS } from '../js/ui/wheelmatch-settings.js';

const withFlag = (on, fn) => { const old = FLAGS.wheelMeta; FLAGS.wheelMeta = on; try { return fn(); } finally { FLAGS.wheelMeta = old; } };
const game = (seed = 'pow-1') => C(null, 'NewGame', { seed });
const dev = (s, patch) => C(s, 'SetDev', { patch });
const owning = (s, owned) => ({ ...s, wheelMeta: { ...metaOf(s), owned: { ...owned } } });
/** ctrlOf exactly as it was before the power test (2026-11-18 base). */
const ctrlToday = (s) => (!FLAGS.wheelMeta ? { slowRank: 0, steadyRank: 0, guide: false, zone: false, chime: false }
  : { slowRank: rankOf(s, 'c_slow'), steadyRank: rankOf(s, 'c_steady'), guide: rankOf(s, 'c_guide') > 0, zone: rankOf(s, 'c_zone') > 0, chime: rankOf(s, 'c_chime') > 0 });
const OWNS = [{}, { c_slow: 2, c_guide: 1 }, { c_slow: 3, c_steady: 2, c_zone: 1, c_chime: 1, c_guide: 1, f_wide: 2 }];
const wheel = () => wheelSlices('normal');

test('pow-1 defaults are Auto (-1) for all five keys; power keys stay out of the plain slider list', () => {
  for (const k of POW_KEYS) { assert.equal(DEV_DEFAULTS[k], -1, k); assert.equal(DEV_RANGE[k][0], -1, k); assert.ok(k in DEV_POWERS, k); assert.ok(!DEV_KEYS.includes(k), k); }
  assert.deepEqual(Object.values(DEV_POWERS).sort(), ['c_chime', 'c_guide', 'c_slow', 'c_steady', 'c_zone']);
  assert.equal(DEV_RANGE.powSlow[1], 3); assert.equal(DEV_RANGE.powSteady[1], 2);
  for (const k of POW_SWITCHES) assert.equal(DEV_RANGE[k][1], 1, k);
});

test('pow-2 parity: Dev off and Dev on untouched give today\'s ctrlOf, matchPhys, effective, controlRanks and metaWheel (flag on and off)', () => {
  for (const flag of [false, true]) withFlag(flag, () => {
    for (const own of OWNS) {
      const off = owning(game(), own), onU = dev(off, { on: true }), offSet = dev(dev(off, { on: true, powGuide: 1, powSlow: 3 }), { on: false });
      for (const s of [off, onU, offSet]) {
        assert.deepEqual(ctrlOf(s), ctrlToday(off), `flag ${flag} ${JSON.stringify(own)}`);
        assert.deepEqual(devPowers(s), {});
        assert.deepEqual(matchPhys(s), matchPhys(off));
        assert.deepEqual(effective(s), effective(off));
        assert.deepEqual(controlRanks(s), controlRanks(off));
        assert.deepEqual(metaWheel(wheel(), 'spot', s), metaWheel(wheel(), 'spot', off));
      }
      assert.deepEqual(devChanged(onU), {});
    }
  });
});

test('pow-3 each override works on ctrlOf (match wheel), even with FLAGS.wheelMeta off and nothing bought', () => {
  for (const flag of [false, true]) withFlag(flag, () => {
    const s0 = dev(game(), { on: true });
    assert.equal(ctrlOf(dev(s0, { powGuide: 1 })).guide, true);
    assert.equal(ctrlOf(dev(s0, { powZone: 1 })).zone, true);
    assert.equal(ctrlOf(dev(s0, { powChime: 1 })).chime, true);
    assert.equal(ctrlOf(dev(s0, { powSlow: 3 })).slowRank, 3);
    assert.equal(ctrlOf(dev(s0, { powSteady: 2 })).steadyRank, 2);
    const p0 = matchPhys(s0), p = matchPhys(dev(s0, { powSlow: 2, powSteady: 1, powGuide: 1 }));
    assert.ok(Math.abs(p.W0 - p0.W0 * 0.7) < 1e-9); assert.ok(Math.abs(p.J - p0.J * 0.85) < 1e-9); assert.notEqual(p.SD, p0.SD);
  });
  // Off forces a bought power off; ranks override down too; Workshop ranks and save untouched
  withFlag(true, () => {
    const full = owning(game(), OWNS[2]), s = dev(full, { on: true, powGuide: 0, powZone: 0, powChime: 0, powSlow: 0, powSteady: 1 });
    assert.deepEqual(ctrlOf(s), { slowRank: 0, steadyRank: 1, guide: false, zone: false, chime: false });
    assert.equal(rankOf(s, 'c_slow'), 3); assert.deepEqual(s.wheelMeta, full.wheelMeta);
    const partial = dev(full, { on: true, powChime: 0 }); // other rows Auto = Workshop rank
    assert.deepEqual(ctrlOf(partial), { ...ctrlToday(full), chime: false });
  });
});

test('pow-4 side wheels (flag on): effective Control fields, controlRanks and metaWheel phys on every wheel follow the override', () => {
  withFlag(true, () => {
    const s0 = dev(game(), { on: true }), s = dev(s0, { powGuide: 1, powZone: 1, powChime: 1, powSlow: 3, powSteady: 2 });
    const E0 = effective(s0), E = effective(s);
    for (const w of Object.keys(E).filter((k) => E[k] && typeof E[k] === 'object' && 'w0Mult' in E[k])) {
      assert.ok(Math.abs(E[w].w0Mult - 0.55) < 1e-9, w); assert.ok(Math.abs(E[w].jMult - 0.7225) < 1e-9, w);
      assert.equal(E[w].guide, true, w); assert.equal(E[w].chime, true, w); assert.ok(E[w].zone > 0, w);
      assert.equal(E0[w].guide, false); assert.equal(E0[w].zone, 0);
      assert.equal(E[w].goldAdd, E0[w].goldAdd, w); // only Control changes
    }
    assert.deepEqual(controlRanks(s), { slow: 3, steady: 2, guide: 1 });
    const p0 = metaWheel(wheel(), 'spot', s0).phys, p = metaWheel(wheel(), 'spot', s).phys;
    assert.ok(Math.abs(p.W0 - p0.W0 * 0.55) < 1e-9); assert.ok(p.SD < p0.SD);
    // Off overrides a bought power on the side wheels too
    const full = owning(game(), OWNS[2]);
    assert.equal(effective(dev(full, { on: true, powGuide: 0 })).spot.guide, false);
    assert.equal(effective(full).spot.guide, true);
  });
});

test('pow-5 clamp: bad / out-of-range power values', () => {
  for (const bad of [NaN, Infinity, '1', null, undefined, {}, true]) for (const k of POW_KEYS) assert.equal(devClamp({ [k]: bad })[k], -1, `${k} ${String(bad)}`);
  assert.equal(devClamp({ powSlow: 9 }).powSlow, 3); assert.equal(devClamp({ powSteady: 5 }).powSteady, 2); assert.equal(devClamp({ powGuide: 4 }).powGuide, 1);
  assert.equal(devClamp({ powZone: -7 }).powZone, -1); assert.equal(devClamp({ powSlow: 1.4 }).powSlow, 1); assert.equal(devClamp({ powChime: 0.6 }).powChime, 1);
  withFlag(false, () => assert.deepEqual(ctrlOf(dev(game(), { on: true, powSlow: 99, powSteady: -5 })), { slowRank: 3, steadyRank: 0, guide: false, zone: false, chime: false }));
});

test('pow-6 report stamps overrides on the dev: line (Auto rows and Dev off stamp nothing); Reset all clears them', () => {
  const s = dev(game(), { on: true, powGuide: 1, powSlow: 2, powChime: 0 });
  assert.deepEqual(devChanged(s), { powGuide: 1, powChime: 0, powSlow: 2 });
  assert.equal(devLine(devChanged(s)), 'dev: powGuide=1 powChime=0 powSlow=2');
  const ENV = { build: 'b', now: Date.UTC(2026, 10, 18), vp: 'v', errors: 0, rid: 1 };
  assert.ok(buildText({ sessions: [], matches: [] }, { ...ENV, dev: devChanged(s) }).split('\n').includes('dev: powGuide=1 powChime=0 powSlow=2'));
  assert.equal(devLine(devChanged(dev(s, { on: false }))), null);
  const all = dev(game(), { on: true, powGuide: 1, powZone: 0, powChime: 1, powSlow: 3, powSteady: 2, matchW0: 50 });
  const r = C(all, 'DevReset', { all: true });
  assert.deepEqual(r.dev, { ...devClamp({}), on: true });
  for (const k of POW_KEYS) assert.equal(r.dev[k], -1, k);
  assert.deepEqual(devChanged(r), {}); assert.equal(devLine(devChanged(r)), null);
});

test('pow-7 Settings rows: switches with words + aria-pressed, 56 px segments, rank sliders with Auto readout', () => {
  const h = powSectionHtml({ on: true, powGuide: 1, powSlow: 2 });
  for (const k of POW_SWITCHES) {
    const row = powSwitchHtml(k, -1);
    for (const w of ['Auto', 'Off', 'On']) assert.match(row, new RegExp(`<b>${w}</b>`));
    assert.match(row, /data-wm-pv="-1" aria-pressed="true"/); assert.match(row, /data-wm-chip="[a-zA-Z]+" hidden/);
    assert.match(h, new RegExp(`data-wm-pow="${k}"`));
  }
  assert.match(h, /data-wm-pow="powGuide" data-wm-pv="1" aria-pressed="true"/);
  assert.match(h, /data-wm-val="powGuide">On</);
  for (const k of POW_SLIDERS) { const [lo, hi, st] = DEV_RANGE[k]; assert.match(h, new RegExp(`data-wm-key="${k}" min="${lo}" max="${hi}" step="${st}"`)); }
  assert.match(sliderHtml('powSlow', 2), /data-wm-val="powSlow">rank 2</);
  assert.equal(devFmt('powSteady', -1), 'Auto'); assert.equal(devFmt('powZone', 0), 'Off'); assert.equal(devFmt('powZone', 1), 'On');
  assert.match(sliderHtml('powSteady', -1), /default Auto/);
});
