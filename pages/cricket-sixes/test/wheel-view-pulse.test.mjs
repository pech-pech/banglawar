// A2.1 shared wheel view on the pulse engine (wheels SPEC 2a-2e, 14 tests 4, 5, 7, 8, 13b; 07-TESTS W-T-6/7/8/9/12/14/15/23/27).
// Drives the view's pure pieces (spinClock, spinFrame, pulseStop, storedStop) on a fake ms clock, plus static checks of js/ui/wheel-view.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spinClock, spinFrame, pulseStop, storedStop, sliceIndexAt, ringDir, screenAngle, landedIndex } from '../js/ui/wheel-view.js';
import { timingBucket } from '../js/core/training.js';
import { GLOW_WINDOW, sliceLabel } from '../js/ui/wheel-look.js';
import { WHEEL_ENGINE } from '../js/data/wheel-engine.js';
import { tickAt, pulseW } from '../js/core/wheel-pulse.js';
import { wheelWobble } from '../js/core/wheel-wobble.js';
import { TIMING_WIN } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';

const src = readFileSync(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
const E = WHEEL_ENGINE, P = { W0: E.W0, D: E.D }, SLOW = { W0: E.W0 * 0.55, D: E.D };
const ringOf = (ws) => { const T = ws.reduce((a, b) => a + b, 0), w = ws.map((x) => x * 10 / T), cum = [0]; w.forEach((x, i) => cum.push(cum[i] + x)); return { w, cum, C: cum[cum.length - 1] }; };
const HYPE = ringOf([1, 1.1667, 1.1667, 1.1667, 1, 1.1667, 1.1667, 1.1667, 1]); // SPEC 6 ring (NUTS first; slice 8 wraps to NUTS)
const SPOT = ringOf([1.2, 1.057, 1.057, 0.8, 1.057, 1.057, 0.6, 1.057, 1.057, 1.057]); // SPEC 3 ring
const COURSE = ringOf([1.2, 1.043, 0.8, 1.043, 0.35, 1.043, 0.35, 1.043, 1.043, 1.043, 1.043]); // SPEC 4 ring (two 3.5% +2)

test('constants: guard 0.35 s, glow 3.2-3.8 s from WHEEL_ENGINE; the view glow window equals it', () => {
  assert.equal(E.STOP_GUARD_S, 0.35); assert.deepEqual([...E.GLOW], [3.2, 3.8]);
  assert.equal(GLOW_WINDOW, E.GLOW, 'wheel-look reads WHEEL_ENGINE.GLOW');
  assert.deepEqual([TIMING_WIN.lo, TIMING_WIN.hi], [...E.GLOW], 'the view window check uses the same numbers');
});

test('13b / W-T-14: STOP guard: taps at 0.10 and 0.349 s are ignored, 0.35 and 0.40 s stop', () => {
  for (const [ms, ok] of [[100, false], [349, false], [350, true], [400, true]]) {
    const c = spinClock(); assert.equal(c.start(1000), true);
    const t = c.tap(1000 + ms);
    if (ok) { assert.ok(Math.abs(t - ms / 1000) < 1e-12, 'stop time ' + ms); assert.equal(c.spinning, false); }
    else { assert.equal(t, null, 'ignored at ' + ms); assert.equal(c.spinning, true, 'still spinning'); }
  }
  const c = spinClock(); c.start(0); assert.equal(c.armed(349), false); assert.equal(c.armed(350), true, 'STOP wakes at 0.35 s');
});

test('13b / W-T-15: double tap on SPIN counts once and never becomes a STOP; double tap on STOP counts once', () => {
  const c = spinClock();
  assert.equal(c.start(5000), true); assert.equal(c.start(5080), false, 'second SPIN tap ignored');
  assert.equal(c.tap(5080), null, 'the second SPIN tap is inside the guard, not a STOP at t about 0');
  assert.equal(c.spinning, true);
  const t = c.tap(8500); assert.ok(Math.abs(t - 3.5) < 1e-12); assert.equal(c.tap(8560), null, 'second STOP tap ignored'); assert.equal(c.stopped, true);
  assert.equal(spinClock().tap(1000), null, 'STOP before SPIN does nothing');
});

test('test 4 / W-T-6: no auto-stop: with no STOP tap the wheel still spins at 10, 60 and 300 s; the tick never decreases', () => {
  const c = spinClock(); c.start(0); let last = -Infinity;
  for (let ms = 0; ms <= 300000; ms += 250) {
    assert.equal(c.spinning, true, 'spinning at ' + ms + ' ms');
    const f = spinFrame(P, 0, c.elapsed(ms)); assert.ok(f.tick >= last - 1e-9, 'monotonic at ' + ms); assert.ok(f.speed > 0); last = f.tick;
  }
  for (const s of [10, 60, 300]) { assert.equal(c.spinning, true, s + ' s'); assert.ok(spinFrame(P, 0, s).speed >= pulseW(3.8, P) - 1e-9); }
});

test('W-T-7: hidden tab 20 s: on return the wheel is still spinning and the frame equals the formula (no skip, no pause)', () => {
  const c = spinClock(); c.start(1000);
  const before = spinFrame(P, 2.5, c.elapsed(3000)), after = spinFrame(P, 2.5, c.elapsed(23000)); // no frames for 20 s
  assert.equal(c.spinning, true);
  assert.ok(Math.abs(after.tick - (2.5 + tickAt(22, P))) < 1e-9); assert.ok(after.tick > before.tick);
  assert.equal(after.cycle, 4); assert.ok(Math.abs(after.tInCycle - 4) < 1e-9);
});

test('test 7 / W-T-9: tick honesty: 10,000 random taps per ring with J = 0, the slice under the tick at the tap time is the landed slice (wrap included)', () => {
  const rng = makeRng('a21-tick');
  for (const [nm, R] of [['hype', HYPE], ['spot', SPOT], ['course', COURSE]]) {
    for (let i = 0; i < 10000; i++) {
      const phi = rng.random() * R.C, t = 0.35 + rng.random() * 30, f = spinFrame(P, phi, t), s = pulseStop(P, phi, t, 0, R.cum, R.C).stop;
      assert.equal(s.sliceId, sliceIndexAt(R.cum, R.C, f.tick), nm + ' t=' + t);
    }
    // boundaries and the wrap: land exactly on an edge and just either side of the last-to-first seam
    for (let k = 0; k < R.cum.length - 1; k++) {
      const t = 3.5, edge = R.cum[k], phi = edge - tickAt(t, P);
      assert.equal(pulseStop(P, phi + 1e-7, t, 0, R.cum, R.C).stop.sliceId, k, nm + ' edge ' + k);
      assert.equal(pulseStop(P, phi - 1e-6, t, 0, R.cum, R.C).stop.sliceId, (k - 1 + R.cum.length - 1) % (R.cum.length - 1), nm + ' before edge ' + k);
    }
  }
});

test('W-T-8: STOP reads the tap timeStamp, not the next frame: a tap at 3.500 s with the next frame at 3.540 s lands the 3.500 s tick slice', () => {
  const R = HYPE, phi = 1.234, c = spinClock(); c.start(10000);
  const t = c.tap(13500), s = pulseStop(P, phi, t, 0, R.cum, R.C).stop;
  assert.equal(s.sliceId, sliceIndexAt(R.cum, R.C, spinFrame(P, phi, 3.5).tick));
  assert.equal(s.stopT, 3500); assert.ok(Math.abs(s.t - 3.5) < 1e-12);
  // view wiring: the STOP time comes from the click event timeStamp on the performance.now() clock
  assert.match(src, /ev\.timeStamp/); assert.match(src, /performance\.now\(\)/);
  assert.match(src, /const t = clk\.tap\(ms\); if \(t == null\) return; stop\(t\)/);
});

test('lead rule: landed slice and stopT come from the STOP event.timeStamp -> tickAt, never from the last drawn frame', () => {
  // source: the click handler's ms is the event timeStamp; stop(t) lands from pulseStop(t) and never reads the drawn pos / tick
  assert.match(src, /const stampOf = \(ev\) => \{ const n = nowMs\(\), s = ev && ev\.timeStamp;/);
  assert.match(src, /function onGo\(ev\) \{\s*const ms = stampOf\(ev\);/);
  const st = src.slice(src.indexOf('function stop(t)'), src.indexOf('const stampOf'));
  assert.match(st, /pulseStop\(P, phi, t, e, cum, C, RESPIN\)/);
  assert.doesNotMatch(st, /sliceOf\(pos|curDist|lastF|frame/, 'no frame state in the landing');
  assert.match(src, /stopT: Math\.round\(t \* 1000\)/);
  // numbers: taps between 60 fps frames; the landing follows the tap time exactly, and a frame read would often differ
  const R = HYPE, rng = makeRng('a21-stamp'); let diff = 0; const n = 4000;
  for (let i = 0; i < n; i++) {
    const phi = rng.random() * R.C, c = spinClock(); c.start(0);
    const tapMs = 350 + rng.random() * 20000, frameMs = Math.floor(tapMs / (1000 / 60)) * (1000 / 60), t = c.tap(tapMs), s = pulseStop(P, phi, t, 0, R.cum, R.C).stop;
    assert.equal(s.sliceId, sliceIndexAt(R.cum, R.C, phi + tickAt(tapMs / 1000, P)));
    assert.equal(s.stopT, Math.round(tapMs));
    if (sliceIndexAt(R.cum, R.C, spinFrame(P, phi, frameMs / 1000).tick) !== s.sliceId) diff++;
  }
  assert.ok(diff > 0, 'a frame read would have mismatched some taps (' + diff + '/' + n + ')');
});

test('test 5 / W-T-7: throttle to 10 fps: the stop slice for a tap at 3.5 s is unchanged (frames never feed the landing)', () => {
  const R = SPOT, phi = 3.3, at = (fps) => { const c = spinClock(); c.start(0); for (let ms = 0; ms < 3500; ms += 1000 / fps) spinFrame(P, phi, c.elapsed(ms)); return pulseStop(P, phi, c.tap(3500), 0, R.cum, R.C).stop; };
  assert.deepEqual(at(10), at(60));
  assert.doesNotMatch(src, /clock \+= dt|const dt =/, 'no frame-step integration');
});

test('stop record: {t, phi, e, stopT, cycle, tInCycle, sliceId, respin}; cycle from 1; landing = phi + tickAt(t) + e', () => {
  const R = HYPE, e = wheelWobble('seed|wob|1|3|hype|0|0', E.J), out = pulseStop(P, 0.5, 9.75, e, R.cum, R.C, 1), s = out.stop;
  assert.deepEqual(Object.keys(s), ['t', 'phi', 'e', 'stopT', 'cycle', 'tInCycle', 'sliceId', 'respin']);
  assert.equal(s.cycle, 2); assert.ok(Math.abs(s.tInCycle - 3.75) < 1e-9); assert.equal(s.stopT, 9750); assert.equal(s.respin, 1); assert.ok(Number.isInteger(s.stopT));
  assert.equal(s.sliceId, sliceIndexAt(R.cum, R.C, 0.5 + tickAt(9.75, P) + e));
  assert.ok(Math.abs(out.base + out.dist - tickAt(9.75, P) - 0.5) < 1e-9, 'base + glide = the tick');
  assert.equal(pulseStop(P, 0.5, 0.4, 0, R.cum, R.C).stop.cycle, 1);
});

test('W-T-23: keyed wobble: same key, same landing (reload cannot re-roll); respin 1 differs; |e| <= J after Steady', () => {
  const R = SPOT, k0 = 'abc|wob|1|2|spot|0|0', k1 = 'abc|wob|1|2|spot|0|1', J = E.J * 0.7225;
  const a = pulseStop(P, 2, 3.5, wheelWobble(k0, J), R.cum, R.C).stop, b = pulseStop(P, 2, 3.5, wheelWobble(k0, J), R.cum, R.C).stop;
  assert.deepEqual(a, b); assert.notEqual(wheelWobble(k0, J), wheelWobble(k1, J));
  for (let i = 0; i < 2000; i++) assert.ok(Math.abs(wheelWobble('k' + i, J)) <= J);
  assert.match(src, /wheelWobble\(String\(o\.wobKey\), JE\)/);
});

test('test 8 / W-T-12/13: glow is time only: 3.2-3.8 s of every cycle (1 to 4), same with Slow; any phi', () => {
  for (const PP of [P, SLOW]) for (let cyc = 0; cyc < 4; cyc++) for (const phi of [0, 3.7, 9.99]) {
    const b = cyc * 6;
    const g = (t) => spinFrame(PP, phi, b + t).glow; // 1e-9 = float slack of the cycle subtraction (6k + 3.2 - 6k)
    assert.equal(g(3.19), false); assert.equal(g(3.2 + 1e-9), true); assert.equal(g(3.5), true); assert.equal(g(3.8 - 1e-9), true); assert.equal(g(3.81), false);
  }
  assert.match(src, /go\.classList\.toggle\('is-glow', inW\)/); assert.match(src, /inW \? 'STOP!' : 'STOP'/, 'the button reads "STOP!" in the glow');
});

test('stored: a recorded stop opens on its result; a spent Spin Again / Pick Two waiting for its next stop is unspun', () => {
  const r = (id) => ({ stopT: 3500, cycle: 1, tInCycle: 3.5, sliceId: id, value: 1, auto: false, respin: 0 });
  assert.equal(storedStop(null), null); assert.equal(storedStop({ stops: [], kept: 0, spent: false }), null);
  assert.equal(storedStop({ stops: [r(4)], kept: 0, spent: false }).sliceId, 4);
  assert.equal(storedStop({ stops: [r(4)], kept: 0, spent: true }), null, 'Spin Again pressed, second spin not stopped yet');
  assert.equal(storedStop({ stops: [r(4), r(7)], kept: 1, spent: true }).sliceId, 7);
  assert.equal(storedStop({ stops: [r(4), r(7)], kept: 9, spent: true }).sliceId, 7, 'kept past the end clamps');
  assert.match(src, /const pend = o\.pending \|\| \(stRec \? ringPending\(stRec\.sliceId\) : null\)/);
});

test('view source: onSpin before the result animation; no coast, auto-stop, skip, reduced motion or timing option; guide band', () => {
  const st = src.slice(src.indexOf('function stop(t)'), src.indexOf('const stampOf'));
  assert.ok(st.indexOf('o.onSpin(st)') >= 0 && st.indexOf('o.onSpin(st)') < st.indexOf("state = 'land'"), 'host records at STOP, before the ease-out');
  assert.doesNotMatch(src, /recordStop\(|import[^;]*wheel-stops/, 'the view never records itself');
  assert.doesNotMatch(src, /COAST|STOP_FROM|coasted|autoStop|quickSpin|carefulTapTime|reduced|matchMedia|Show result|o\.timing\b/);
  assert.doesNotMatch(src, /setTimeout\([^)]*stop\(/, 'no timer ever calls stop');
  assert.match(src, /STOP_GUARD_S/); assert.match(src, /tickKind\(\{ guide: !!o\.guide \}\)/);
  assert.match(src, /if \(o\.guide && JE > 0\)/, 'Aim Guide draws the J band');
  for (const k of ['wheelId', 'spinKey', 'ring', 'J', 'wobKey', 'stored', 'legend']) assert.match(src, new RegExp('o\\.' + k + '\\b'), 'option ' + k);
});

// ---- QA fixes (T3 QA D2/D9 + stored-stop timing, T6 live QA 1) ----
test('D9: a ring is drawn clockwise in list order; the next slice reaches the pointer as the wheel turns (old keys keep their look)', () => {
  assert.equal(ringDir(true), -1); assert.equal(ringDir(false), 1);
  const U = 2 * Math.PI / HYPE.C, mid = (i) => (HYPE.cum[i] + HYPE.cum[i + 1]) / 2, cw = (a) => ((a + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); // clockwise from the top
  const pos = mid(0); let prev = -1;
  for (let i = 0; i < 9; i++) { const a = cw(screenAngle(mid(i), pos, U, ringDir(true))); assert.ok(a > prev, 'slice ' + i + ' clockwise of ' + (i - 1)); prev = a; }
  assert.ok(Math.abs(cw(screenAngle(mid(0), pos, U, -1))) < 1e-9, 'the slice at pos is under the pointer');
  const later = pos + 0.3; assert.ok(cw(screenAngle(mid(1), later, U, -1)) < cw(screenAngle(mid(1), pos, U, -1)), 'as pos grows, slice 1 moves toward the pointer');
});

test('T6 live QA 1: a pending without an index shows the stopped slice, never NaN', () => {
  assert.equal(landedIndex({ index: 3 }, { sliceId: 5 }, 9), 3);
  assert.equal(landedIndex({ gain: 4 }, { sliceId: 5 }, 9), 5);
  assert.equal(landedIndex({ index: null }, { sliceId: 2 }, 9), 2);
  assert.equal(landedIndex({ index: 40 }, null, 9), 8, 'clamped');
  assert.equal(landedIndex(null, null, 9), 0);
  assert.match(src, /mid = centreOf\(pi\)/, 'the ease-out steers with the safe index');
});

test('D2 ring result: "Landed on [slice label]", no lone "+", no "(same letter)", no Training words', () => {
  const r = src.slice(src.indexOf('function ringResultHtml'), src.indexOf('function showResult'));
  assert.match(r, /Landed on/); assert.match(r, /chip = short \|\| lab/);
  assert.doesNotMatch(r, /same letter|Breakthrough|Booster|o\.plus/);
  assert.match(src, /if \(RING\) res\.innerHTML = ringResultHtml\(p, d, sg\)/, 'ring wheels take the ring path even without plainResult');
  assert.match(src, /typeof d === 'object' \? d : \{ big: String/, 'a string describe() is accepted');
});

test('stored stop reopens with its Early / Good timing / Late line from timingBucket(stored.tInCycle)', () => {
  assert.match(src, /if \(stRec && Number\.isFinite\(\+stRec\.tInCycle\)[^;]*\) timeB = timingBucket\(\+stRec\.tInCycle\)/);
  assert.match(src, /const TL = TIMING && timeB && \(RING \|\| !o\.plainResult\)/, 'ring wheels always show the timing line');
  assert.equal(typeof timingBucket(3.5), 'string');
});

test('ring look: labels fitted radially, tier marks drawn, no diamond, legend under the stage, one fixed AIM at the top pointer, Tick on readout, one honest line', () => {
  assert.match(src, /radialFit\(/); assert.match(src, /radialTurn\(b\)/);
  assert.match(src, /tierMark\(row\.tier/); assert.match(src, /if \(!RING\) for \(let j = -5/, 'no jackpot diamond on ring wheels');
  assert.match(src, /'<\/div><\/div>' \+ legendHtml \+/, 'legend sits after the stage, not inside it');
  assert.match(src, /Tick on:/); assert.match(src, /wh-aimw/); assert.doesNotMatch(src, /aimT\.style/, 'AIM does not ride the rim');
  assert.match(src, /const MSG_GO = 'Turning\. Tap STOP\.'/); assert.doesNotMatch(src, /Tap early and it goes further|near the top/);
  assert.match(src, /fixCss/, 'one wheel size across states');
});

test('non-ring result (Training / Course / Find / Hype pass slices): same block as the ring, no lone "+", no "(same letter)", short chip, honest hint', () => {
  const a = src.indexOf('function landedRow'), r = src.slice(a, src.indexOf('function showResult'));
  assert.match(r, /Landed on/); assert.doesNotMatch(r, /same letter|o\.plus \|\| '\+'\) \+ esc\(p\.gain\)/);
  assert.match(src, /ringResultHtml\(p, d, sg\) \+ \(p\.boosted \|\| p\.hot/, 'the non-ring path shares the ring block');
  assert.doesNotMatch(src, /\(same letter\)/);
  assert.match(r, /chip = short \|\| lab/, 'chip prints sliceLabel (+2 steps -> +2); the full label is its title and the spoken line');
  assert.equal(sliceLabel({ label: '+2 steps', w: 0.4 }), '+2'); assert.equal(sliceLabel({ label: '+2 steps', w: 1 }), '+2 steps');
  assert.doesNotMatch(src, /The tick shows where it will land/); // ring-wheel hint is just 'Tap SPIN, then tap STOP.' (the tick sentence moved out)
});
test('result box css keeps every line inside the box at 344 px (column, wraps, no overflow)', () => {
  const css = readFileSync(new URL('../css/wheel-shared.css', import.meta.url), 'utf8');
  assert.match(css, /\.wh-ov \.wh-res \{[^}]*flex-direction: column[^}]*max-width: 100%[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.wh-ov \.wh-res > \* \{[^}]*min-width: 0/);
});

test('a11y: focus waits ~150 ms after the live text; the STOP glow window relabels the button to "Stop now" and announces it once', () => {
  assert.match(src, /function focusGo\(el\) \{ setTimeout\([\s\S]*?, 150\)/);
  assert.match(src, /go\.setAttribute\('aria-label', inW \? 'Stop now' : 'Stop the wheel'\)/);
  assert.match(src, /if \(inW\) live\.textContent = 'Stop now\.'/, 'announced once, when the window opens');
});
test('ring layout: stage pad 22 + 22 for the fixed AIM word + 8 under, side room 24 px; tier marks sit inside the Aim lane; STOP glow reads WHEEL_ENGINE.GLOW', () => {
  assert.match(src, /AM = 0;/); assert.match(src, /RING \? 22 \+ 22 \+ 8 : 24 \+ 22/);
  assert.match(src, /mx = cx \+ Math\.cos\(a\) \* \(R - 15\.5 \* kk\)/);
  assert.match(src, /tw0 >= E\.GLOW\[0\] && tw0 <= E\.GLOW\[1\]/); assert.doesNotMatch(src, /TIMING_WIN\.lo/);
});
test('N8 "+1 Spoke" singular; D10 the tick sentence shows once (the card wins)', () => {
  assert.match(src, /Number\(sg\) === 1 \? ' Spoke' : ' Spokes'/);
  assert.match(src, /setMsg\('Tap SPIN, then tap STOP\.'\)/);
});
