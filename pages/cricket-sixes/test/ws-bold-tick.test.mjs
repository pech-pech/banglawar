// Wheel settings item 1 spec tests (T2, black box from BUILD-TICKET): Settings Tick Normal/Bold + Dev tickW/tickL. Look only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TICK, tickStyle, tickKind, glideCap, landSplit } from '../js/core/landtick.js';
import { getTickStyle, setTickMode, setTickDims, resetTickPref, readTick, tickRowHtml, TICK_KEY } from '../js/ui/tick-pref.js';
import { applyCommand as C } from '../js/store/commands.js';
import { DEV_DEFAULTS, DEV_RANGE } from '../js/data/wheelmatch.js';
import { devVal, matchPhys, landingPos, rimAt } from '../js/core/wheelmatch.js';
import { buildData, reportParts } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mem = (init) => { const m = new Map(init === undefined ? [] : [[TICK_KEY, init]]); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const dev = (s, patch) => C(s, 'SetDev', { patch });

test('Settings row: Tick Normal/Bold, words + state, default Normal, 56 px tap class + 14 px floor', () => {
  const h = tickRowHtml('normal');
  assert.match(h, /Tick/); assert.match(h, /Normal/); assert.match(h, /Bold/);
  assert.match(h, /data-tick="normal"[^>]*aria-pressed="true"/); assert.match(h, /data-tick="bold"[^>]*aria-pressed="false"/); assert.match(h, /\(on\)/);
  assert.match(tickRowHtml(undefined), /data-tick="normal"[^>]*aria-pressed="true"/);
  const cls = h.match(/class="([^"]*c-seg__opt[^"]*)"/); assert.ok(cls);
  const css = rd('css/settings.css');
  assert.match(css, /\.st-tick__seg \.c-seg__opt\s*\{[^}]*min-height:\s*56px/);
  assert.match(css, /tk-opt small\s*\{[^}]*font-size:\s*14px/);
  assert.match(rd('js/report/settings.js'), /mountTickRow\(/);
});
test('per device: own localStorage key, bad or missing stored value = Normal, never in the save', () => {
  assert.equal(readTick(mem()), 'normal'); assert.equal(readTick(mem('bold')), 'bold');
  for (const bad of ['Bold', 'BOLD', 'true', '1', '{}', 'null', 'undefined', '']) assert.equal(readTick(mem(bad)), 'normal', bad);
  assert.equal(readTick({ getItem() { throw new Error('x'); } }), 'normal');
  const st = mem(); setTickMode('bold', st); assert.equal(st.m.get(TICK_KEY), 'bold'); resetTickPref();
  const s = C(null, 'NewGame', { seed: 'wsb-1' });
  assert.ok(!JSON.stringify(s).includes(TICK_KEY)); assert.ok(!/"tick(Mode)?"/.test(JSON.stringify(s)));
});
test('old save without any tick data loads and plays: Normal, no throw', () => {
  const s = C(null, 'NewGame', { seed: 'wsb-2' }); const old = { ...s }; delete old.dev;
  assert.doesNotThrow(() => matchPhys(old));
  for (const k of ['tickW', 'tickL']) assert.equal(devVal(old, k), DEV_DEFAULTS[k]);
  resetTickPref(); setTickMode(undefined, mem()); assert.deepEqual(getTickStyle(), tickStyle('normal'));
});
test('Normal draw parameters equal today: 2 px core, 1 px halo, 15 px reach, reel 5x5, gold arrow 2/20/7/2.5 no halo', () => {
  assert.equal(TICK.PLAIN_PX, 2);
  const n = tickStyle('normal');
  assert.equal(n.px, 2); assert.equal(n.halo, 1); assert.equal(n.len, 15);
  assert.deepEqual(n.reel, { len: 5, h: 5 }); assert.deepEqual(n.arrow, { tip: 2, base: 20, hw: 7, line: 2.5, halo: 0 });
  for (const bad of [undefined, null, 'x', 'Bold', 0]) assert.deepEqual(tickStyle(bad), n);
  assert.deepEqual(tickStyle('normal', 8, 24), n); // Dev sizes never touch Normal
  resetTickPref(); setTickMode('normal', mem()); setTickDims(8, 24); assert.deepEqual(getTickStyle(), n); resetTickPref();
});
test('four draw sites read the style; Normal wheel/dial geometry = old code (r0 = R - 15, 2 px, 1 px halo)', () => {
  for (const f of ['wheel-view', 'dial-view', 'reel-view', 'wheelmatch-view']) assert.match(rd('js/ui/' + f + '.js'), /getTickStyle\(\)/, f);
  assert.equal(tickStyle('normal').len, 15); // wheel + dial plain tick started at R - 15 before the setting
  assert.doesNotMatch(rd('js/ui/wheel-view.js') + rd('js/ui/dial-view.js'), /TICK\.PLAIN_PX \/ 2 \+ 1/);
  assert.match(rd('js/ui/reel-view.js'), /fillRect\(0, gy - 3, 6, 7\)/); // reel gold wedge marks untouched
});
test('Bold strictly thicker, longer, stronger halo at every site; defaults 5 x 22', () => {
  const n = tickStyle('normal'), b = tickStyle('bold');
  assert.equal(b.px, 5); assert.equal(b.len, 22);
  assert.ok(b.px > n.px && b.len > n.len && b.halo > n.halo);
  assert.ok(b.reel.len > n.reel.len && b.reel.h > n.reel.h);
  assert.ok(b.arrow.base > n.arrow.base && b.arrow.hw > n.arrow.hw && b.arrow.line > n.arrow.line && b.arrow.halo > n.arrow.halo);
  for (const w of [2, 3, 5, 8]) for (const l of [8, 16, 24]) { const x = tickStyle('bold', w, l); assert.ok(x.px >= n.px && x.halo > n.halo, w + 'x' + l); }
});
test('Dev sliders: tickW 2-8 / tickL 8-24 default 5 / 22, size Bold only, Dev must be on', () => {
  assert.deepEqual(DEV_RANGE.tickW.slice(0, 2), [2, 8]); assert.deepEqual(DEV_RANGE.tickL.slice(0, 2), [8, 24]);
  assert.equal(DEV_DEFAULTS.tickW, 5); assert.equal(DEV_DEFAULTS.tickL, 22);
  const g = C(null, 'NewGame', { seed: 'wsb-3' });
  const off = dev(g, { tickW: 8, tickL: 24 }); // Dev still off
  assert.equal(devVal(off, 'tickW'), 5); assert.equal(devVal(off, 'tickL'), 22);
  const on = dev(g, { on: true, tickW: 8, tickL: 24 });
  assert.equal(devVal(on, 'tickW'), 8); assert.equal(devVal(on, 'tickL'), 24);
  assert.equal(devVal(dev(g, { on: true, tickW: 99, tickL: 1 }), 'tickW'), 8); assert.equal(devVal(dev(g, { on: true, tickW: 99, tickL: 1 }), 'tickL'), 8);
  const bd = (s) => tickStyle('bold', devVal(s, 'tickW'), devVal(s, 'tickL'));
  assert.equal(bd(off).px, 5); assert.equal(bd(on).px, 8); assert.equal(bd(on).len, 24); assert.ok(bd(on).px > bd(g).px);
  assert.deepEqual(tickStyle('normal', devVal(on, 'tickW'), devVal(on, 'tickL')), tickStyle('normal')); // Normal ignores sliders
  const sm = bd(dev(g, { on: true, tickW: 2, tickL: 8 })); assert.equal(sm.px, 2); assert.equal(sm.len, 8);
  assert.match(rd('js/main.js'), /setTickDims\(devVal\(s, 'tickW'\), devVal\(s, 'tickL'\)\)/);
});
test('Reset all covers tickW / tickL', () => {
  const g = dev(C(null, 'NewGame', { seed: 'wsb-4' }), { on: true, tickW: 8, tickL: 24 });
  const r = C(g, 'DevReset', { all: true });
  assert.equal(devVal(r, 'tickW'), 5); assert.equal(devVal(r, 'tickL'), 22); assert.equal(r.dev.tickW, 5); assert.equal(r.dev.tickL, 22);
});
test('look only: landing position, tickKind, glideCap identical Normal vs Bold; Aim Guide wedge unchanged', () => {
  const g = dev(C(null, 'NewGame', { seed: 'wsb-5' }), { on: true });
  const snap = () => { const P = matchPhys(g), out = [];
    for (const t of [0.3, 1, 2.5, 3.9, 5.5, 8]) for (const e of [-0.4, 0, 0.7]) out.push(landingPos(P, { t, phi: 1.25, e }), rimAt(P, t, 1.25), landSplit(P, t).dist, glideCap(P, 20 + t));
    for (const c of [{}, { guide: true }, { reduced: true }, { reveal: true }, { reveal: true, guide: true }]) out.push(tickKind(c));
    return JSON.stringify(out); };
  resetTickPref(); setTickMode('normal', mem()); const a = snap();
  setTickMode('bold', mem()); setTickDims(8, 24); const b = snap(); resetTickPref();
  assert.equal(a, b);
  assert.equal(tickKind({ guide: true }), 'wedge'); assert.equal(tickKind({ guide: false }), 'plain');
  assert.match(rd('js/ui/wheel-view.js'), /r0 = R - 15/); assert.match(rd('js/ui/dial-view.js'), /r0 = R - 15/);
  assert.equal(TICK.WEDGE_TIP_PX, 0.8);
  const core = rd('js/core/landtick.js'); assert.doesNotMatch(core.split('export function landSplit')[1] || '', /tickStyle|TICK_BOLD/);
});
test('report stamps Tick=Bold only when Bold', () => {
  const B = 'sixes-wheelmatch', mk = (tickMode) => ({ build: B, now: Date.UTC(2026, 10, 18, 10, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1, tickMode });
  const data = { matches: [], builds: [B], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], seasons: [], sessions: [], errors: { n: 0, last: [] }, marker: null, rid: 0, seq: 1, eseq: 0 };
  assert.ok(reportParts(data, mk('bold')).h.some((l) => /Tick=Bold/.test(l)));
  assert.ok(!reportParts(data, mk('normal')).h.some((l) => /Tick=/.test(l))); assert.ok(!reportParts(data, mk(undefined)).h.some((l) => /Tick=/.test(l)));
  assert.ok(JSON.stringify(JSON.parse(buildData(data, mk('bold')))).includes('bold')); assert.ok(!JSON.stringify(JSON.parse(buildData(data, mk('normal')))).includes('bold'));
});
