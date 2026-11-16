// wa2 timing: the careful STOP window (TIMING_WIN 3.2-3.8 s), timingBucket (one rule for the report and the wheel), the timing line,
// the wheel wiring (STOP .is-window + .wh-tim line, Spotlight/Course only) and the CSS pulse (motion only, finite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIMING_WIN, timingBucket, TIMING_LINE } from '../js/core/training.js';
import { TRAIN2 } from '../js/data/training.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const wheel = read('js/ui/wheel-view.js'), view = read('js/ui/training-view.js'), coaches = read('js/ui/coaches-sheet.js'), find = read('js/ui/wheels/find.js'), t2 = read('css/training2.css'), log = read('js/report/log.js');

test('TIMING_WIN is 3.2-3.8 s, frozen (deprecated shim); COAST and STOP_FROM are legacy-only (kept for the old wheel-view, nothing in the core reads them); Spotlight/Course use W0 36, D 2, J 1.2', () => {
  assert.deepEqual({ ...TIMING_WIN }, { lo: 3.2, hi: 3.8 });
  assert.ok(Object.isFrozen(TIMING_WIN));
  assert.equal(TRAIN2.wheelStop.STOP_FROM, 0.35, 'legacy-only: the old wheel-view reads it');
  assert.ok(TRAIN2.wheelStop.COAST > 1e6, 'legacy-only: effectively no auto-stop');
  assert.deepEqual([TRAIN2.wheelStop.W0, TRAIN2.wheelStop.D, TRAIN2.wheelStop.J], [36, 2, 1.2]);
});

test('timingBucket edges: early / careful / late; no coast: any finite t past the window is late (shim until log.js drops it)', () => {
  const cases = [[0, 'e'], [3.199, 'e'], [3.2, 'c'], [3.5, 'c'], [3.8, 'c'], [3.801, 'l'], [5.99, 'l'], [6, 'l'], [7.5, 'l']];
  for (const [t, b] of cases) assert.equal(timingBucket(t), b, 't=' + t);
});

test('timingBucket: no coasted flag any more; NaN / non-number = none', () => {
  for (const t of [0, 1, 3.2, 3.5, 3.8, 4, 5.99, 6]) assert.equal(timingBucket(t, true), timingBucket(t), 'flag ignored t=' + t);
  for (const t of [NaN, undefined, null, '3.5']) assert.equal(timingBucket(t), 'o', 'bad t=' + String(t));
  assert.equal(timingBucket(3.5, false), 'c');
});

test('TIMING_LINE words exactly, frozen', () => {
  assert.deepEqual({ ...TIMING_LINE }, { e: 'Early', c: 'Good timing', l: 'Late', o: 'Coasted' });
  assert.ok(Object.isFrozen(TIMING_LINE));
});

test('parity with the old report rule over 1..6 step 0.001', () => {
  const old = (t) => (t < 3.2 ? 'e' : t <= 3.8 ? 'c' : 'l'); // the 'o' (coasted) bucket is retired
  let n = 0;
  for (let i = 1000; i <= 6000; i++) { const t = i / 1000; assert.equal(timingBucket(t), old(t), 't=' + t); n++; }
  assert.equal(n, 5001);
});

test('report log uses timingBucket for the spins bk field (old inline rule gone)', () => {
  assert.match(log, /import \{ timingBucket \} from '\.\.\/core\/training\.js'/);
  assert.match(log, /bk: t == null \? null : timingBucket\(t\)/);
  assert.doesNotMatch(log, /t >= 6 \? 'o' : t < 3\.2/);
});

test('wheel-view: timing option wiring (window class during spin, removed on stop, bucket + line after stop)', () => {
  assert.match(wheel, /import \{[^}]*TIMING_WIN, timingBucket, TIMING_LINE[^}]*\} from '\.\.\/core\/training\.js'/);
  // SPEC 2a / CONTRACT-A 4: the glow is always on (o.timing is accepted and ignored); no coast, so no game tap and no "Coasted" bucket
  assert.match(wheel, /const TIMING = true;/, 'glow always on');
  assert.doesNotMatch(wheel, /o\.timing\b/, 'the timing option is never read');
  assert.match(wheel, /tw0 >= TIMING_WIN\.lo && tw0 <= TIMING_WIN\.hi/);
  assert.match(wheel, /go\.classList\.toggle\('is-window', inW\)/);
  assert.match(wheel, /if \(TIMING\) \{ const tw0 = clock - spinEv - \(f\.cycle - 1\) \* PERIOD/, 'window on cycle time, every cycle');
  assert.doesNotMatch(wheel, /COAST|coasted|STOP_FROM/, 'no coast and no game tap');
  assert.match(wheel, /function stop\(t\) \{/);
  assert.match(wheel, /go\.classList\.remove\('is-window'\); if \(TIMING\) timeB = timingBucket\(st\.tInCycle\)/);
  assert.match(wheel, /if \(TIMING && timeB && !o\.plainResult\) res\.insertAdjacentHTML\('beforeend', '<div class="wh-tim" data-timing="' \+ timeB \+ '"><span class="wh-tim--' \+ timeB \+ '">' \+ esc\(TIMING_LINE\[timeB\]\)/);
  assert.match(wheel, /live\.textContent = \(TIMING && timeB && !o\.plainResult \? TIMING_LINE\[timeB\] \+ '\. ' : ''\)/, 'live region starts with the line');
});

test('timing option retired (glow always on): Spotlight, Course and Find do not pass timing', () => {
  assert.doesNotMatch(view, /openWheel\(\{\s*timing: true,/);
  assert.doesNotMatch(coaches, /openWheel\(\{\s*timing: true,/);
  assert.doesNotMatch(find, /timing\s*:/);
});

test('CSS: steady gold outline always; is-window animation only inside no-preference and finite', () => {
  assert.match(t2, /\.wh-ov \.wh-go\.is-window \{ outline: 4px solid var\(--gold\)/);
  const outside = t2.replace(/@media \(prefers-reduced-motion: no-preference\) \{[^{}]*\{[^}]*\}\s*\}/g, '');
  assert.doesNotMatch(outside, /is-window[^{]*\{[^}]*animation/, 'no is-window animation outside no-preference');
  const blocks = t2.match(/@media \(prefers-reduced-motion: no-preference\) \{[^{}]*\{[^}]*\}\s*\}/g) || [];
  const win = blocks.filter((b) => /is-window/.test(b));
  assert.equal(win.length, 1);
  assert.match(win[0], /animation: wh-win /);
  assert.doesNotMatch(win[0], /infinite/);
  const it = win[0].match(/animation: wh-win [^;]*?\s(\d+)\s/);
  assert.ok(it && Number(it[1]) >= 1 && Number(it[1]) <= 3, 'finite small iteration count');
  assert.match(t2, /@keyframes wh-win/);
  assert.match(t2, /\.wh-tim \{/);
});
