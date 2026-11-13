import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { DR, reflect, cumOf, sliceAtX, dialLand, dialGlideQ, revealFrac, pepSchedule } from '../js/ui/dial-view.js';
import { RL, reelLand, reelGlideQ, reelRevealDist } from '../js/ui/reel-view.js';
import { makeRng } from '../js/core/rng.js';
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const dialSrc = read('js/ui/dial-view.js'), reelSrc = read('js/ui/reel-view.js'), css = read('css/dialreel.css');
const gauss = (r) => { let s = 0; for (let i = 0; i < 6; i++) s += r.random(); return (s - 3) / Math.sqrt(0.5); };

// Hype at tilt 0 (spec 03 section 3): arc order Med, Low, Nuts, High; widths 3.5 / 3.5 / 1 / 2 (x0.1 of the odds), L = 10
const HW = [3.5, 3.5, 1, 2], HP = [4, 2, 10, 6]; // med +4, low +2, nuts +10, high +6 (performance %)
const Jn = DR.JK * 1;
test('tuning constants match spec 03 section 2', () => {
  assert.equal(DR.V, 16); assert.equal(DR.G, 0.5); assert.equal(DR.STOP_FROM, 0.8); assert.equal(DR.COAST, 3); assert.equal(DR.JK, 1.2);
  assert.equal(RL.C, 12); assert.equal(RL.V, 7); assert.equal(RL.J, 0.8); assert.equal(RL.G, 0.5);
});
test('dial reflect is a triangle over 0..L; slices by cumulative width', () => {
  assert.equal(reflect(0, 10), 0); assert.equal(reflect(10, 10), 10); assert.equal(reflect(15, 10), 5); assert.equal(reflect(20, 10), 0); assert.equal(reflect(-3, 10), 3);
  const c = cumOf(HW); assert.equal(sliceAtX(c, 0), 0); assert.equal(sliceAtX(c, 7.2), 2); assert.equal(sliceAtX(c, 9.9), 3);
});
test('landing = phase + V t + dist + e, STOP clamped to 0.8..3, no snap', () => {
  const a = dialLand(HW, { t: 0.1, phi: 1, e: 0.3 }), b = dialLand(HW, { t: 99, phi: 1, e: 0.3 });
  assert.equal(a.t, 0.8); assert.equal(b.t, 3); assert.ok(Math.abs(a.end - (1 + 16 * 0.8 + 16 * 0.5 / 3 + 0.3)) < 1e-9);
  assert.ok(Math.abs(dialGlideQ(a, 0.5) - a.end) < 1e-9); assert.equal(dialGlideQ(a, 0), a.base);
  const r = reelLand([1, 2, 3, 6], { t: 1, phi: 2, e: -0.2 }); assert.ok(Math.abs(reelGlideQ(r, 0.5) - r.end) < 1e-9); assert.ok(r.x >= 0 && r.x < 12);
});
test('honest dial: a random tapper lands on a slice with probability width / total at any tap time', () => {
  const rng = makeRng('wm|dial-ui'), n = 60000, hit = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) hit[dialLand(HW, { t: 0.8 + rng.random() * 2.2, phi: rng.random() * 20, e: (rng.random() * 2 - 1) * Jn }).index]++;
  HW.forEach((w, i) => assert.ok(Math.abs(hit[i] / n - w / 10) < 0.012, 'slice ' + i + ' ' + hit[i] / n));
  for (const t of [0.8, 2, 3]) { let g = 0; for (let i = 0; i < 30000; i++) if (dialLand(HW, { t, phi: rng.random() * 20, e: 0 }).index === 2) g++; assert.ok(Math.abs(g / 30000 - 0.1) < 0.012, 'nuts at t=' + t); }
});
test('careful dial player (tap near gold at 2 s, sd 110 ms) beats random and never sure of nuts', () => {
  const rng = makeRng('wm|dial-careful'), n = 20000; let perf = 0, nuts = 0;
  for (let i = 0; i < n; i++) {
    const phi = rng.random() * 20; let best = 2, bd = 9;
    for (let t = 0.8; t <= 3; t += 0.01) if (dialLand(HW, { t, phi, e: 0 }).index === 2 && Math.abs(t - 2) < bd) { bd = Math.abs(t - 2); best = t; }
    const r = dialLand(HW, { t: best + gauss(rng) * 0.11, phi, e: (rng.random() * 2 - 1) * Jn }); perf += HP[r.index]; if (r.index === 2) nuts++;
  }
  assert.ok(perf / n > 4.9 && perf / n < 5.7, 'mean ' + perf / n); assert.ok(nuts / n < 0.5 && nuts / n > 0.12, 'nuts ' + nuts / n);
});
// Six-Hit reel: 4 Nothing (equal) + Player .2+.2, Coach .2, Coins .4 of find 22% of C = 12 units
const SH = (() => { const f = 12 * 0.22, nz = (12 - f) / 4, F = [['Coach', 0.2], ['Coins', 0.4], ['Player', 0.2], ['Player', 0.2]]; const w = []; F.forEach((x) => { w.push(nz); w.push(f * x[1]); }); return w; })();
test('honest reel: random find rate = find %; average careful about x1.3', () => {
  const rng = makeRng('wm|reel-ui'), n = 40000, isFind = (i) => i % 2 === 1; let rnd = 0, car = 0;
  for (let i = 0; i < n; i++) {
    rnd += isFind(reelLand(SH, { t: 0.8 + rng.random() * 2.2, phi: rng.random() * 12, e: (rng.random() * 2 - 1) * RL.J }).index) ? 1 : 0;
    const phi = rng.random() * 12; let best = 2, bd = 9; for (let t = 0.8; t <= 3; t += 0.02) if (isFind(reelLand(SH, { t, phi, e: 0 }).index) && Math.abs(t - 2) < bd) { bd = Math.abs(t - 2); best = t; }
    car += isFind(reelLand(SH, { t: best + gauss(rng) * 0.11, phi, e: (rng.random() * 2 - 1) * RL.J }).index) ? 1 : 0;
  }
  assert.ok(Math.abs(rnd / n - 0.22) < 0.012, 'random ' + rnd / n); assert.ok(car / n > 0.25 && car / n < 0.33, 'careful ' + car / n); assert.ok(car / n < 0.5);
});
test('reveal timing: eased, monotone, ends at 1; pep schedule sums to T and ends on the target', () => {
  for (const T of [2.5, 3]) { let p = -1; for (let t = 0; t <= T + 1e-9; t += T / 50) { const f = revealFrac(t, T); assert.ok(f >= p - 1e-12); p = f; } assert.equal(revealFrac(0, T), 0); assert.ok(Math.abs(revealFrac(T, T) - 1) < 1e-9); }
  for (const tg of [0, 3, 5]) { const s = pepSchedule(6, tg, 2.5); assert.equal(s.length, 6 + tg + 1); assert.ok(Math.abs(s[s.length - 1] - 2.5) < 1e-9); for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1]); assert.ok(s[1] - s[0] < s[s.length - 1] - s[s.length - 2]); }
  const A = reelRevealDist(3, 10, 12, 3); assert.ok(A >= 7 * 0.99 * (0.2 / 1.5 * 3 / 2 + 0.6 / 1.5 * 3 + 0.7 / 1.5 * 3 / 3) - 1e-6 || A > 20); assert.ok(Math.abs(((3 + A) % 12) - 10) < 1e-9);
});
test('views: same conventions as wheel-view (dialog, inert app, focus return, Escape rule, live region once, reduced motion)', () => {
  for (const src of [dialSrc, reelSrc]) assert.match(src, /import .*dial-view\.js|export function openDial/);
  assert.match(dialSrc, /setAttribute\('role', 'dialog'\)/); assert.match(dialSrc, /app\.inert = true/); assert.match(dialSrc, /opener\.focus/); assert.match(dialSrc, /e\.key === 'Escape' && !sh\.busy/);
  assert.match(dialSrc, /aria-live="polite"/); assert.match(dialSrc, /prefers-reduced-motion: reduce/); assert.match(dialSrc, /live\.textContent = d\.say/);
  assert.match(dialSrc, /export function openDial/); assert.match(reelSrc, /export function openReel/);
  assert.match(dialSrc, /ev\.timeStamp/); assert.match(reelSrc, /ev\.timeStamp/); // STOP uses the press timestamp, not the frame time
  assert.match(dialSrc, /t < DR\.STOP_FROM\) return/); assert.match(reelSrc, /t < DR\.STOP_FROM\) return/);
  assert.match(dialSrc, /syntheticTap/); assert.match(reelSrc, /syntheticTap/);
});
test('no odds text, no spin count in the widgets; targets >= 44 px; 4 px reel line; gold border on find cells', () => {
  for (const src of [dialSrc, reelSrc]) { const strings = (src.match(/'[^']*'/g) || []).join(' '); assert.doesNotMatch(strings, /\bodds\b|\bspins?\b ?\d|chance/i); }
  assert.match(css, /\.dr-ov \.wh-go \{ min-height: 64px/); assert.match(reelSrc, /fillRect\(0, cy - 2, W, 4\)/); assert.match(reelSrc, /c\.find/); assert.match(reelSrc, /pal\.gold/);
});
