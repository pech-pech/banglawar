// Settings "Tick" Normal / Bold (2026-11-18): look only. Normal = today's numbers, Bold differs, per-device pref, report stamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TICK, TICK_BOLD, tickStyle, tickModeOf } from '../js/core/landtick.js';
import { readTick, setTickMode, getTickStyle, setTickDims, resetTickPref, tickRowHtml, TICK_KEY } from '../js/report/tick-pref.js';
import { buildData, reportParts } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';

const mem = (init) => { const m = new Map(init ? [[TICK_KEY, init]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('Normal draws exactly today: 2 px core, 1 px halo, 15 px reach, old reel marks 5x5, old arrow 2/20/7/2.5', () => {
  const n = tickStyle('normal');
  assert.equal(n.px, TICK.PLAIN_PX); assert.equal(n.px, 2); assert.equal(n.halo, 1); assert.equal(n.len, 15);
  assert.deepEqual(n.reel, { len: 5, h: 5 }); assert.deepEqual(n.arrow, { tip: 2, base: 20, hw: 7, line: 2.5, halo: 0 });
  assert.deepEqual(tickStyle(undefined), n); assert.deepEqual(tickStyle('junk'), n);
});
test('Bold is wider, longer, stronger halo at every site; defaults 5 x 22', () => {
  const n = tickStyle('normal'), b = tickStyle('bold');
  assert.equal(b.px, 5); assert.equal(b.len, 22); assert.equal(TICK_BOLD.W, 5); assert.equal(TICK_BOLD.L, 22);
  assert.ok(b.px > n.px && b.len > n.len && b.halo > n.halo && b.reel.len > n.reel.len && b.reel.h > n.reel.h && b.arrow.base > n.arrow.base && b.arrow.hw > n.arrow.hw && b.arrow.line > n.arrow.line && b.arrow.halo > n.arrow.halo);
});
test('Bold size follows Dev tickW / tickL, clamped 2-8 / 8-24; bad numbers fall back to 5 x 22', () => {
  const b = tickStyle('bold', 8, 24); assert.equal(b.px, 8); assert.equal(b.len, 24);
  const c = tickStyle('bold', 99, -3); assert.equal(c.px, 8); assert.equal(c.len, 8);
  const d = tickStyle('bold', 'x', NaN); assert.equal(d.px, 5); assert.equal(d.len, 22);
  assert.equal(tickStyle('normal', 8, 24).px, 2); // Normal ignores Dev sizes
});
test('landing position never reads the tick style: glide logic and PLAIN_PX untouched', () => {
  assert.equal(TICK.PLAIN_PX, 2); assert.ok(Object.isFrozen(TICK));
  const src = readFileSync(new URL('../js/core/landtick.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.split('export function glideCap')[1], /tickStyle|TICK_BOLD/);
});
test('pref: default Normal, saved Bold survives, bad or missing value = Normal, blocked storage safe', () => {
  assert.equal(readTick(mem()), 'normal'); assert.equal(readTick(mem('bold')), 'bold');
  for (const bad of ['BOLD', '1', '{}', 'thick', '']) assert.equal(readTick(mem(bad)), 'normal', bad);
  assert.equal(readTick(null), 'normal');
  assert.equal(readTick({ getItem() { throw new Error('blocked'); } }), 'normal');
  const st = mem(); assert.equal(setTickMode('bold', st), 'bold'); assert.equal(readTick(st), 'bold'); assert.equal(setTickMode('zzz', st), 'normal'); assert.equal(readTick(st), 'normal');
  assert.equal(setTickMode('bold', { setItem() { throw new Error('full'); } }), 'bold'); // save fails: still set for this session
  resetTickPref();
});
test('getTickStyle: Normal by default, Bold with Dev sizes fed in', () => {
  resetTickPref(); setTickMode('normal', mem()); assert.deepEqual(getTickStyle(), tickStyle('normal'));
  setTickMode('bold', mem()); setTickDims(undefined, undefined); assert.equal(getTickStyle().px, 5);
  setTickDims(7, 20); assert.equal(getTickStyle().px, 7); assert.equal(getTickStyle().len, 20); resetTickPref();
});
test('Settings row: words + state, both options, 56 px and 14 px floor in css', () => {
  const h = tickRowHtml('bold'); assert.match(h, /Normal/); assert.match(h, /Bold/); assert.match(h, /data-tick="bold"[^>]*aria-pressed="true"/); assert.match(h, /data-tick="normal"[^>]*aria-pressed="false"/); assert.match(h, /\(on\)/);
  assert.match(tickRowHtml(undefined), /data-tick="normal"[^>]*aria-pressed="true"/);
  const css = readFileSync(new URL('../css/settings.css', import.meta.url), 'utf8'); assert.match(css, /\.st-tick__seg \.c-seg__opt \{ min-height: 56px/); assert.match(css, /tk-opt small \{ font-size: 14px/);
  assert.equal(tickModeOf('bold'), 'bold');
});
test('views draw from the style: wedge unchanged (still r0 = R - 15), four sites wired', () => {
  const rd = (f) => readFileSync(new URL('../js/ui/' + f + '.js', import.meta.url), 'utf8');
  for (const f of ['wheel-view', 'dial-view', 'reel-view', 'wheelmatch-view']) assert.match(rd(f), /getTickStyle\(\)/, f);
  assert.match(rd('wheel-view'), /r0 = R - 15/); assert.match(rd('dial-view'), /r0 = R - 15/);
});
test('report: Tick=Bold stamped in the header and JSON only when Bold', () => {
  const B = 'sixes-wheelmatch', mk = (tickMode) => ({ build: B, now: Date.UTC(2026, 10, 18, 10, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1, tickMode });
  const data = { matches: [], builds: [B], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], seasons: [], sessions: [], errors: { n: 0, last: [] }, marker: null, rid: 0, seq: 1, eseq: 0 };
  const jb = JSON.parse(buildData(data, mk('bold'))), jn = JSON.parse(buildData(data, mk('normal'))), ju = JSON.parse(buildData(data, mk(undefined)));
  assert.equal(jb.tk, 'bold'); assert.ok(!('tk' in jn)); assert.ok(!('tk' in ju));
  assert.ok(reportParts(data, mk('bold')).h.some((l) => /Tick=Bold/.test(l))); assert.ok(!reportParts(data, mk('normal')).h.some((l) => /Tick=/.test(l)));
});
