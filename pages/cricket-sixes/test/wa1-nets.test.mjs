// wa1 slice C (train2): Nets reads econ.fac.nets (NETS_Q by level, SPEC 2026-11-14 s4), gated on FLAGS.freePick (a bug fix, not a wheel
// upgrade), and the old entry points into coaches still reach the same course and scout flows as the Training-tab coach strip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { NETS_Q } from '../js/data/training.js';
import { runNets, effortOdds, meanGain, netsQuality, netsFacLevel } from '../js/core/training.js';
import { game, makeRng } from './_tr2-fixture.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const withFlags = (f, fn) => { const old = {}; for (const k of Object.keys(f)) { old[k] = FLAGS[k]; FLAGS[k] = f[k]; } try { return fn(); } finally { Object.assign(FLAGS, old); } };
const lv = (s, n) => ({ ...s, econ: { coins: 0, fac: { nets: n } } });
const near = (a, b, d = 1e-9) => Math.abs(a - b) < d;

test('Nets odds by level: L0 / L1 / L5 (Normal effort, no coach)', () => withFlags({ freePick: true, wheelMeta: false }, () => {
  const s = game({ plan: { focus: 'bat', effort: 'normal' } });
  const odds = [0, 1, 5].map((n) => effortOdds('normal', netsQuality(lv(s, n))));
  assert.deepEqual(odds[0], { okay: 57, good: 31.5, great: 11.5 });
  assert.deepEqual(odds[1], { okay: 54, good: 33, great: 13 });
  assert.deepEqual(odds[2], { okay: 46, good: 37, great: 17 });
  assert.equal(netsFacLevel(s), 0, 'no econ = level 0'); assert.equal(netsQuality(s), NETS_Q[0]);
}));

test('Nets mean gain per roll over no Nets: L0 +0.045, L1 +0.09, L5 +0.21 (= 0.015 x Q)', () => withFlags({ freePick: true }, () => {
  const base = meanGain(effortOdds('normal', 0)), s = game();
  [[0, 0.045], [1, 0.09], [5, 0.21]].forEach(([n, want]) => {
    const d = meanGain(effortOdds('normal', netsQuality(lv(s, n)))) - base;
    assert.ok(near(d, want, 1e-6), `L${n}: +${d.toFixed(4)} vs +${want}`);
  });
}));

test('the gate is freePick (game on, frozen tests off), not the wheel upgrades switch', () => {
  const s = game({ plan: { focus: 'bat', effort: 'normal' } });
  const run = (n) => runNets(lv(s, n), makeRng('wa1-nets-gate')).lines;
  withFlags({ freePick: true, wheelMeta: false }, () => assert.equal(netsQuality(lv(s, 5)), 14, 'wheel upgrades off: Nets still counts'));
  withFlags({ freePick: false, wheelMeta: true }, () => {
    assert.equal(netsQuality(lv(s, 5)), 0, 'freePick off: old s.nets rule');
    assert.deepEqual(run(5), run(0), 'freePick off: Nets level changes nothing (frozen vectors)');
  });
  assert.equal(FLAGS.freePick, false, 'data/flags.js default stays off for the frozen tests');
  assert.match(read('js/main.js'), /FEATURE_FLAGS = \[[^\]]*'freePick'/, 'main.js turns freePick on in the game');
});

test('old entry points reach the same coach flows as the Training-tab strip', async () => {
  const sheet = await import('../js/ui/coaches-sheet.js'), pick = await import('../js/ui/coachpick-view.js');
  assert.equal(typeof sheet.open, 'function'); assert.equal(typeof sheet.startCourse, 'function'); assert.equal(typeof sheet.openScout, 'function');
  ['scoutBodyHtml', 'scoutDone', 'scoutSpinOpen', 'render'].forEach((k) => assert.equal(typeof pick[k], 'function', 'coachpick-view.' + k));
  const src = read('js/ui/coaches-sheet.js');
  assert.match(src, /arg && arg\.course\) \{ startCourse\(/, 'sheet:coaches {course} -> the course wheel');
  assert.match(src, /arg && arg\.scout\) \{ openScout\(/, 'sheet:coaches {scout} -> the scout list');
  assert.match(src, /close\(\); startCourse\(vm, id, dispatch, refresh\)/, 'the sheet\'s own Send on course uses the same startCourse');
  assert.match(src, /import \{ scoutBodyHtml, scoutDone, scoutSpinOpen \} from '\.\/coachpick-view\.js'/, 'scout sheet = the scout list screen body');
  const app = read('js/ui/app.js');
  assert.match(app, /coaches: \{ file: 'coaches-sheet', vm: \['coachesVM(T2)?'/, 'sheet:coaches still registered (original or the fenced T2 wrapper)');
  assert.match(read('js/store/selectors.js'), /export function coachesVM\(s\)/, 'original coachesVM still exported (T2 wraps it)');
  assert.match(app, /coach: \['coachpick-view', 'coachPickVM'\]/, 'scout list screen route kept');
  const tv = read('js/ui/training-view.js');
  assert.match(tv, /open\('coaches', \{ course: id \}\)/); assert.match(tv, /open\('coaches', \{ scout: 1 \}\)/); assert.match(tv, /open\('coaches'\)/);
  // a stale save on the old pick stage goes to the hub, not a dead screen
  assert.match(read('js/core/save-migrate.js'), /if \(n\.stage === 'coach'\) n\.stage = 'hub'/);
});
