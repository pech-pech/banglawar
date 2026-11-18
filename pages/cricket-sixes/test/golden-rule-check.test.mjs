// Black-box rule check for the Golden Over, written from CONTRACT-GO s2-3 and the proto (pickOf/floor/val). Independent of ENGINE's own tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const need = ['js/data/golden-over.js', 'js/core/golden-over.js', 'js/store/spins/golden.js'];
const missing = need.filter((f) => !existsSync(new URL('../' + f, import.meta.url)));
if (missing.length) {
  test('golden rule check', { skip: 'SKIPPED: missing ' + missing.join(', ') }, () => {});
} else {
  const { windowFor, gradeOf, pickX, previewBalls } = await import('../js/core/golden-over.js');
  const { outcomeFromX } = await import('../js/core/match.js');
  const { STEPS } = await import('../js/core/letters.js');
  const { applyCommand: C } = await import('../js/store/commands.js');
  const rawOf = (st) => STEPS[st - 1].rawFrom;
  const mult = (st) => 0.75 + (st - 1) / 20 * 0.625;
  const PR = { p: { wicket: 0.1, six: 0.1, four: 0.1, two: 0.1, single: 0.3 }, singleRaw: 0.3 };
  const oc = (x) => outcomeFromX(PR.p, PR.singleRaw, x);
  const val = (side) => (side === 'bat' ? (b) => (b === 'W' ? -6 : b) : (b) => (b === 'W' ? 6 : -b));
  const countRng = (seed) => { let a = seed >>> 0, n = 0; const f = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; return { random: () => { n++; return f(); }, get n() { return n; }, f }; };

  test('window per step, Mid default, whole ms', () => {
    assert.deepEqual(windowFor(rawOf(1)), { p: 41, g: 90 }); // 55*.75=41.25, 120*.75=90
    assert.deepEqual(windowFor(rawOf(21)), { p: 76, g: 165 }); // 75.6, 165
    for (let st = 1; st <= 21; st++) {
      const w = windowFor(rawOf(st));
      assert.ok(Math.abs(w.p - 55 * mult(st)) <= 0.5 && Math.abs(w.g - 120 * mult(st)) <= 0.5, 'step ' + st);
    }
    assert.deepEqual(windowFor(rawOf(11), 'Wide'), { p: Math.round(80 * 1.0625), g: Math.round(170 * 1.0625) });
  });
  test('grade boundaries exact; no tap = M', () => {
    const w = { p: 58, g: 128 };
    for (const [e, g] of [[0, 'P'], [58, 'P'], [-58, 'P'], [58.01, 'G'], [-128, 'G'], [128.01, 'M'], [-500, 'M']]) assert.equal(gradeOf(e, w), g, String(e));
    assert.equal(gradeOf(null, w), 'M'); assert.equal(gradeOf(undefined, w), 'M');
  });
  test('pickX: fixed 3 draws; G first draw; M never better than G; Perfect floors', () => {
    for (const side of ['bat', 'bowl']) {
      const v = val(side);
      for (let i = 1; i <= 400; i++) {
        const xs = (() => { const r = countRng(i * 7919); return [r.f(), r.f(), r.f()]; })();
        const res = {};
        for (const g of ['P', 'G', 'M']) {
          const r = countRng(i * 7919); const x = pickX(g, side)(PR, r);
          assert.equal(r.n, 3, g + ' draws'); res[g] = oc(x);
        }
        assert.equal(res.G, oc(xs[0]));
        assert.ok(v(res.M) <= v(res.G), 'M<=G');
        assert.equal(v(res.M), Math.min(v(oc(xs[0])), v(oc(xs[1]))));
        if (side === 'bat') assert.ok(res.P !== 0 && res.P !== 'W', 'bat P ' + res.P); else assert.ok(res.P !== 4 && res.P !== 6, 'bowl P ' + res.P);
        const best = Math.max(...xs.map((x) => v(oc(x))));
        assert.ok(v(res.P) >= Math.min(best, side === 'bat' ? 1 : -2) , 'P>=floor');
        assert.ok(v(res.P) >= v(res.G) || (side === 'bat' ? res.G === 0 || res.G === 'W' : res.G === 4 || res.G === 6) || v(res.P) >= best, 'P not worse than G');
      }
    }
  });
  test('over: ball i identical whatever later grades; no-tap equals M; frozen vectors elsewhere', () => {
    const s = C(null, 'NewMatch', { seed: 'rc1', mode: 'wheel' });
    const ctx = { bowler: 0 };
    const sig = (b) => JSON.stringify([b.o, b.batter, b.bowler, b.n]);
    const base = previewBalls(s, ['P', 'G', 'M', 'P', 'G', 'P'], ctx);
    for (const alt of [['P', 'G', 'M', 'M', 'M', 'M'], ['P', 'G', 'M', 'P', 'P', 'P'], ['P', 'G', 'M'], ['P', 'G', 'M', 'P']]) {
      const b = previewBalls(s, alt, ctx);
      const bg = ['P', 'G', 'M', 'P', 'G', 'P']; for (let i = 0; i < Math.min(alt.length, b.length) && alt[i] === bg[i]; i++) assert.equal(sig(b[i]), sig(base[i]), 'ball ' + i + ' for ' + alt.join(''));
    }
    for (let i = 0; i < 6; i++) { const g1 = Array(6).fill('G'), g2 = g1.slice(); g2[i] = 'M'; const a = previewBalls(s, g1, ctx), b = previewBalls(s, g2, ctx); for (let k = 0; k < i; k++) assert.equal(sig(a[k]), sig(b[k])); }
    // no-tap goes through the store as 'M'
    const st = C(s, 'GoldenStart', {});
    const t = C(st, 'GoldenTap', { err: null, miss: true });
    assert.equal(t.golden.inn1.taps[0].g, 'M');
  });
}
