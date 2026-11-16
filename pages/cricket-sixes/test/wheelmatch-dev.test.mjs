// Wheel match Dev speed (06-DEV-SPEED T-dev-1..3, 8..12, 14 DOM-less): s.dev defaults, clamps, Off ignores, otherMult on every other wheel, resets,
// the report's dev: line, Settings markup (Match mode row, Dev row, Wheel speed section).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { DEV_DEFAULTS, DEV_RANGE } from '../js/data/wheelmatch.js';
import { devVal, devClamp, devChanged, matchPhys, rimAt } from '../js/core/wheelmatch.js';
import { metaWheel, otherMultOf, effective } from '../js/core/wheelmeta.js';
import { wheelSlices, courseWheel, stopLanding } from '../js/core/training.js';
import { findWheelOf, hypeDialOf, ctlOf } from '../js/store/wmstore.js';
import { revealT } from '../js/ui/wm-spins.js';
import { devLine } from '../js/report/wmatch.js';
import { buildText } from '../js/report/report.js';
import { wheelMatchSt } from '../js/report/settings.js';
import { matchModeRowHtml, devRowHtml, devSectionHtml, sliderHtml, devFmt, WMS_CSS, DEV_KEYS } from '../js/ui/wheelmatch-settings.js';

const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const game = (seed = 'dev-1') => C(null, 'NewGame', { seed });
const dev = (s, patch) => C(s, 'SetDev', { patch });
const FIND_ID = 'street';

test('T-dev-1 default off: new save has Dev off, section hidden, every wheel at its base speed (same objects as before)', () => {
  const s = game();
  assert.equal(devClamp(s.dev).on, false);
  for (const k of DEV_KEYS) assert.equal(devVal(s, k), DEV_DEFAULTS[k]);
  assert.equal(matchPhys(s).W0, 36);
  assert.equal(otherMultOf(s), 1);
  assert.match(devSectionHtml(s.dev, false), /data-wm-sec hidden/);
  assert.deepEqual(devChanged(s), {});
  // with Dev off the wheels are the very same objects / numbers as a no-dev build
  const base = wheelSlices('normal'), cw = courseWheel(3);
  withFlags({ wheelMeta: false }, () => { assert.equal(metaWheel(base, 'spot', s), base); assert.equal(metaWheel(cw, 'course', s), cw); });
  withFlags({ wheelMeta: true }, () => {
    assert.equal(metaWheel(base, 'spot', s).phys.W0, 36);
    assert.equal(findWheelOf(s, FIND_ID).phys.W0, 36);
    assert.equal(hypeDialOf(s).V, 16);
    for (const w of ['hype', 'toss', 'pep', 'scout', 'finals']) assert.equal('speedMult' in ctlOf(s, w), false, w);
  });
  assert.equal(revealT(2.5, {}), 2.5); assert.equal(revealT(3, { speedMult: undefined }), 3);
});

test('T-dev-2 an old save with no s.dev: defaults, no error, SetDev still works', () => {
  const s = game(); const old = { ...s }; delete old.dev;
  for (const k of DEV_KEYS) assert.equal(devVal(old, k), DEV_DEFAULTS[k]);
  assert.deepEqual(devClamp(old.dev), { ...DEV_DEFAULTS });
  const n = dev(old, { on: true, matchW0: 50 });
  assert.equal(n.dev.on, true); assert.equal(devVal(n, 'matchW0'), 50);
  assert.doesNotThrow(() => devSectionHtml(undefined, true));
});

test('T-dev-3 slider range: 12, 36, 90 drive W0 (rim = W0*TAU*(1-exp(-t/3))); out of range clamps', () => {
  let s = dev(game(), { on: true });
  for (const w of [12, 36, 90]) {
    s = dev(s, { matchW0: w }); const P = matchPhys(s);
    assert.equal(P.W0, w);
    for (const t of [0.5, 1, 3.5]) { const want = (0.25 + w * 3 * (1 - Math.exp(-t / 3))) % 10; assert.ok(Math.abs(rimAt(P, t, 0.25) - want) < 1e-9); }
  }
  assert.equal(dev(s, { matchW0: 5 }).dev.matchW0, 12);
  assert.equal(dev(s, { matchW0: 200 }).dev.matchW0, 90);
  for (const k of DEV_KEYS) { const [lo, hi] = DEV_RANGE[k]; assert.equal(devClamp({ [k]: lo - 1 })[k], lo); assert.equal(devClamp({ [k]: hi + 1 })[k], hi); }
});

test('T-dev-8 Off ignores saved values; On uses them', () => {
  const s = dev(dev(game(), { on: true, matchW0: 70, otherMult: 2 }), { on: false });
  assert.equal(s.dev.matchW0, 70); // kept in the save
  assert.equal(matchPhys(s).W0, 36); assert.equal(otherMultOf(s), 1);
  withFlags({ wheelMeta: true }, () => assert.equal(findWheelOf(s, FIND_ID).phys.W0, 36));
  const on = dev(s, { on: true });
  assert.equal(matchPhys(on).W0, 70); assert.equal(otherMultOf(on), 2);
});

test('T-dev-9 otherMult x2: Find W0 72, Hype V 32, Spotlight / Course W0 72, reveals twice as fast; Slow stacks (x0.55); match wheel unaffected', () => {
  const s0 = game(), s = dev(s0, { on: true, otherMult: 2 });
  withFlags({ wheelMeta: true }, () => {
    assert.equal(findWheelOf(s, FIND_ID).phys.W0, 72);
    assert.equal(hypeDialOf(s).V, 32);
    assert.equal(metaWheel(wheelSlices('normal'), 'spot', s).phys.W0, 72);
    assert.equal(metaWheel(courseWheel(3), 'course', s).phys.W0, 72);
    for (const w of ['toss', 'pep', 'scout', 'finals']) assert.equal(ctlOf(s, w).speedMult, 2, w);
    // Slow Spin rank 3 (w0Mult 0.55) stacks on top
    const slow = { ...s, wheelMeta: { ...(s.wheelMeta || {}), owned: { ...((s.wheelMeta || {}).owned || {}), c_slow: 3 } } };
    const wm = effective(slow).find.w0Mult; assert.ok(Math.abs(wm - 0.55) < 1e-9);
    assert.ok(Math.abs(findWheelOf(slow, FIND_ID).phys.W0 - 72 * 0.55) < 1e-9);
    assert.ok(Math.abs(hypeDialOf(slow).V - 32 * 0.55) < 1e-9);
    assert.ok(Math.abs(metaWheel(wheelSlices('normal'), 'spot', slow).phys.W0 - 72 * 0.55) < 1e-9);
    // the match wheel reads matchW0 only
    assert.equal(matchPhys(s).W0, matchPhys(s0).W0);
  });
  withFlags({ wheelMeta: false }, () => {
    const w = metaWheel(wheelSlices('normal'), 'spot', s); assert.equal(w.phys.W0, 48); // plain wheel path
    // the landing follows the faster wheel
    const a = stopLanding(wheelSlices('normal'), { t: 2, phi: 0, e: 0 }), b = stopLanding(w, { t: 2, phi: 0, e: 0 });
    assert.ok(Math.abs((b.base - 0) - 2 * (a.base - 0)) < 1e-9);
  });
  assert.equal(revealT(2.5, { speedMult: 2 }), 1.25); assert.equal(revealT(3, { speedMult: 0.5 }), 6);
});

test('T-dev-10 Reset: matchW0 to 36; Reset all: all four; on kept; the tweaked chip goes', () => {
  const s = dev(game(), { on: true, matchW0: 48, matchJ: 2, matchD: 1, otherMult: 1.5 });
  assert.doesNotMatch(sliderHtml('matchW0', s.dev.matchW0), /data-wm-chip="matchW0" hidden/);
  const r1 = C(s, 'DevReset', {});
  assert.equal(r1.dev.matchW0, 36); assert.equal(r1.dev.matchJ, 2); assert.equal(r1.dev.on, true);
  assert.match(sliderHtml('matchW0', r1.dev.matchW0), /data-wm-chip="matchW0" hidden/);
  const r2 = C(s, 'DevReset', { all: true });
  assert.deepEqual(r2.dev, { ...DEV_DEFAULTS, on: true });
  for (const k of DEV_KEYS) assert.match(sliderHtml(k, r2.dev[k]), new RegExp(`data-wm-chip="${k}" hidden`));
});

test('T-dev-11 report dev: line has only the changed keys; defaults or Dev off give none', () => {
  const on = dev(game(), { on: true, matchW0: 48, otherMult: 1.5 });
  assert.equal(devLine(devChanged(on)), 'dev: matchW0=48 otherMult=1.5');
  assert.equal(devLine(devChanged(dev(game(), { on: true }))), null);
  assert.equal(devLine(devChanged(dev(on, { on: false }))), null);
  const ENV = { build: 'b', now: Date.UTC(2026, 10, 15), vp: 'v', errors: 0, rid: 1 };
  const t = buildText({ sessions: [], matches: [] }, { ...ENV, dev: devChanged(on) });
  assert.ok(t.split('\n').includes('dev: matchW0=48 otherMult=1.5'));
  assert.match(t.split('\n')[0], /dev tweaked/);
  assert.ok(!/^dev:/m.test(buildText({ sessions: [], matches: [] }, { ...ENV, dev: {} })));
});

test('T-dev-12 corrupt values load as defaults (or clamp), no crash', () => {
  for (const bad of ['abc', NaN, null, undefined, {}, Infinity]) {
    const d = devClamp({ on: true, matchW0: bad, matchJ: bad, matchD: bad, otherMult: bad });
    for (const k of DEV_KEYS) assert.equal(d[k], DEV_DEFAULTS[k], `${k} ${String(bad)}`);
  }
  assert.equal(devClamp({ matchW0: -5 }).matchW0, 12);
  const s = { ...game(), dev: { on: true, matchW0: 'abc', otherMult: NaN } };
  assert.equal(devVal(s, 'matchW0'), 36); assert.equal(otherMultOf(s), 1);
  assert.doesNotThrow(() => devSectionHtml(s.dev, true));
  assert.doesNotThrow(() => devSectionHtml('junk', true));
});

test('T-dev-14 (DOM-less) Settings rows: Match mode row, Dev switch, Wheel speed section; 44 px thumbs; nothing wider than the Fold cover', () => {
  // Match mode: words + aria-pressed; greyed with "Applies next match" while a match runs
  const idle = matchModeRowHtml('wheel', false), live = matchModeRowHtml('classic', true);
  assert.match(idle, /data-wm-mode="wheel" aria-pressed="true"/); assert.match(idle, /data-wm-mode="classic" aria-pressed="false"/);
  assert.match(idle, /one spin per over/); assert.match(idle, /ball by ball/); assert.doesNotMatch(idle, /disabled/);
  assert.match(live, /Applies next match/); assert.equal((live.match(/aria-disabled="true" disabled/g) || []).length, 2);
  assert.match(matchModeRowHtml(undefined, false), /data-wm-mode="classic" aria-pressed="true"/); // missing = classic
  // Settings input: live on bowl / break / chase / done
  assert.deepEqual(wheelMatchSt({ stage: 'hub', matchMode: 'wheel' }), { mode: 'wheel', live: false, dev: null });
  for (const st of ['bowl', 'break', 'chase', 'done']) assert.equal(wheelMatchSt({ stage: st }).live, true);
  // Dev: plain switch, default off
  assert.match(devRowHtml(false), /role="switch" aria-checked="false"/); assert.match(devRowHtml(false), />Off</); assert.match(devRowHtml(true), />On</);
  // Section: matchW0 slider up front with readout, default note, Reset and Reset all; Advanced fold with J, D, otherMult
  const sec = devSectionHtml({ on: true, matchW0: 36 }, true);
  assert.doesNotMatch(sec, /data-wm-sec hidden/);
  assert.match(sec, /min="12" max="90" step="1" value="36"/);
  assert.match(sec, /data-wm-val="matchW0">36 \/s</); assert.match(sec, /default 36</);
  assert.match(sec, /data-wm-reset="one" aria-label="Reset match wheel speed">Reset</); assert.match(sec, /data-wm-reset="all"[^>]*>Reset all</);
  const adv = sec.slice(sec.indexOf('<details'));
  for (const k of ['matchJ', 'matchD', 'otherMult']) assert.match(adv, new RegExp(`data-wm-key="${k}"`));
  assert.ok(sec.indexOf('data-wm-key="matchW0"') < sec.indexOf('<details'));
  assert.equal(devFmt('otherMult', 1), 'x1.00'); assert.equal(devFmt('matchD', 2), '2.0 s'); assert.equal(devFmt('matchJ', 1.2), '1.2');
  for (const k of DEV_KEYS) { const [lo, hi, st] = DEV_RANGE[k]; assert.match(sec, new RegExp(`data-wm-key="${k}" min="${lo}" max="${hi}" step="${st}"`)); }
  // 56 px touch targets (L-CS-6): thumb 56 x 56 (webkit + moz), input 56 px tall, buttons and the fold summary >= 56 px
  assert.match(WMS_CSS, /-webkit-slider-thumb\{[^}]*width:56px;height:56px/); assert.match(WMS_CSS, /-moz-range-thumb\{[^}]*width:56px;height:56px/);
  assert.match(WMS_CSS, /\.wms-range\{width:100%;height:56px/); assert.match(WMS_CSS, /\.wms-btn\{min-height:56px/); assert.match(WMS_CSS, /summary\{min-height:56px/);
  // Fold cover 475 x 638: no fixed width wider than the sheet's 443 px content box, readouts never clip (nowrap, small min width)
  for (const m of WMS_CSS.matchAll(/(?:^|[;{])(?:min-)?width:(\d+)px/g)) assert.ok(+m[1] <= 443, m[0]);
  assert.match(WMS_CSS, /\.wms-val\{[^}]*white-space:nowrap/); assert.match(WMS_CSS, /\.wms-head\{[^}]*flex-wrap:wrap/);
});
