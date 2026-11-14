// wa1 slice C (train): Nets reads econ.fac.nets (NETS_Q by level) and the coach strip on the Training tab (SPEC 2026-11-14 s2, s4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { NETS_Q, TRAIN2 } from '../js/data/training.js';
import { ECON as E } from '../js/data/economy.js';
import { runNets, effortOdds, netsQuality, netsFacLevel, setPlan, planOf } from '../js/core/training.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { coachStripHtml } from '../js/ui/training-view.js';
import * as coachesSheet from '../js/ui/coaches-sheet.js';
import { game, P, K, makeRng } from './_tr2-fixture.mjs';
import { newGame, step } from './_season-bot.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// The Nets fix is gated on FLAGS.freePick (train2, a bug fix tied to the L0 start); wheelMeta toggled too for the wheel extras.
const withFlag = (on, fn) => { const o = [FLAGS.wheelMeta, FLAGS.freePick]; FLAGS.wheelMeta = FLAGS.freePick = on; try { return fn(); } finally { [FLAGS.wheelMeta, FLAGS.freePick] = o; } };
const withNets = (s, lv) => ({ ...s, econ: { coins: 0, fac: { nets: lv } } });
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };

/** Rolls of many nets runs (low ratings: every player has room for +3). Returns Okay/Good/Great shares in %. */
function measure(lv, coaches = [], runs = 2500) {
  const c = [0, 0, 0];
  for (let i = 0; i < runs; i++) {
    let s = game({ coaches, plan: { focus: 'bat', effort: 'normal' } });
    if (coaches[0]) s = setPlan(s, { coachId: coaches[0].id });
    if (lv != null) s = withNets(s, lv);
    const r = runNets(s, makeRng('wa1-nets-' + lv + '-' + i));
    for (const l of r.lines) c[l.toRaw - l.fromRaw - 1]++;
  }
  const n = c[0] + c[1] + c[2];
  return { okay: (c[0] * 100) / n, good: (c[1] * 100) / n, great: (c[2] * 100) / n, mean: (c[0] + 2 * c[1] + 3 * c[2]) / n };
}

test('NETS_Q table and the FAC_START_NETS note', () => {
  assert.deepEqual(NETS_Q, [3, 6, 8, 10, 12, 14]);
  assert.equal(E.FAC_START_NETS, 0, 'Nets still starts at L0');
  assert.match(read('js/data/economy.js'), /FAC_START_NETS: 0, \/\/ .*econ\.fac\.nets/);
  assert.doesNotMatch(read('js/data/economy.js'), /training reads s\.nets, not econ\.fac\.nets/, 'old comment gone');
});

test('netsQuality: flag on reads econ.fac.nets (no econ = L0); flag off keeps the old s.nets rule', () => {
  withFlag(true, () => {
    const s = game();
    assert.equal(netsFacLevel(s), 0); assert.equal(netsQuality(s), 3, 'no econ -> level 0 -> Q 3');
    [0, 1, 2, 3, 4, 5].forEach((lv) => assert.equal(netsQuality(withNets(s, lv)), NETS_Q[lv]));
    assert.equal(netsQuality(withNets(s, 9)), 14, 'clamped to L5'); assert.equal(netsQuality(withNets(s, -2)), 3, 'clamped to L0');
    assert.equal(netsQuality({ ...withNets(s, 1), nets: 5 }), 6, 's.nets is ignored');
  });
  withFlag(false, () => {
    assert.equal(netsQuality(withNets(game(), 5)), 0, 'flag off: Nets level has no effect (old rule)');
    assert.equal(netsQuality(game({ nets: 3 })), TRAIN2.netsTerm * 2, 'flag off: old netsTerm x (s.nets - 1)');
  });
});

test('Nets level changes the live odds: L0 vs L1 vs L5 (measured from runNets, Normal effort, no coach)', () => {
  withFlag(true, () => {
    const m = [0, 1, 5].map((lv) => measure(lv));
    [0, 1, 5].forEach((lv, i) => {
      const want = effortOdds('normal', NETS_Q[lv]);
      assert.ok(Math.abs(m[i].okay - want.okay) < 1.2, `L${lv} okay ${m[i].okay.toFixed(2)} vs ${want.okay}`);
      assert.ok(Math.abs(m[i].great - want.great) < 1.2, `L${lv} great ${m[i].great.toFixed(2)} vs ${want.great}`);
    });
    assert.ok(m[0].mean < m[1].mean && m[1].mean < m[2].mean, 'mean gain rises with the level: ' + m.map((x) => x.mean.toFixed(3)).join(' < '));
    // eslint-disable-next-line no-console
    console.log('wa1 Nets measured (okay/good/great %, mean): ' + [0, 1, 5].map((lv, i) => `L${lv} ${m[i].okay.toFixed(1)}/${m[i].good.toFixed(1)}/${m[i].great.toFixed(1)} ${m[i].mean.toFixed(3)}`).join('; '));
  });
});

test('Coach Q still adds on top of Nets Q; flag off = old odds exactly', () => {
  withFlag(true, () => {
    const k = K({ step: 4, strong: ['bat'] }); assert.equal(planOf(setPlan(game({ coaches: [k] }), { coachId: 'k1' })).coachId, 'k1');
    const m = measure(1, [k]), want = effortOdds('normal', NETS_Q[1] + TRAIN2.coach.qualityPerStep * 4);
    assert.ok(Math.abs(m.okay - want.okay) < 1.2, `okay ${m.okay.toFixed(2)} vs ${want.okay.toFixed(2)}`);
  });
  withFlag(false, () => {
    const a = runNets(withNets(game(), 5), makeRng('same')), b = runNets(game(), makeRng('same'));
    assert.deepEqual(a.lines, b.lines, 'flag off: the Nets level changes nothing');
    const o = measure(5, [], 1200), want = effortOdds('normal', 0);
    assert.ok(Math.abs(o.okay - want.okay) < 2, 'flag off: base odds');
  });
});

test('trainingVM: strip hunk (3 slots, free, scout open) and Nets level/Q', () => {
  const s = untilTrain('wa1-strip'); // the bot plays with the flags off (no free-pick screen); the VM is read with them on
  assert.equal(s.stage, 'train');
  withFlag(true, () => {
    const vm = sel.trainingVM(s);
    assert.equal(vm.strip.slots, 3);
    assert.equal(vm.strip.free, 3 - vm.coaches.length);
    assert.equal(typeof vm.strip.scoutOpen, 'boolean');
    assert.equal(vm.nets.level, (s.econ && s.econ.fac.nets) | 0);
    assert.equal(vm.nets.q, NETS_Q[vm.nets.level]);
    assert.ok(vm.coaches.every((c) => c.course && 'ok' in c.course), 'coach rows carry the course state for Send on course');
  });
});

test('coach strip HTML: 3 slots, picked highlighted, away greyed "Back next week", empty slot, Send on course, Scout list', () => {
  const coach = (o) => ({ id: 'k1', name: 'Hale', letter: 'D+', strong: ['bat'], away: 0, picked: false, helps: true, course: { ok: true, cost: 60, free: false }, ...o });
  const vm = { coaches: [coach({ picked: true }), coach({ id: 'k2', name: 'Moss', away: 1, course: { ok: false, why: 'away' } })], strip: { slots: 3, free: 1, scoutOpen: true } };
  const h = coachStripHtml(vm);
  assert.equal((h.match(/class="ct-slot/g) || []).length, 3, 'three slots');
  assert.match(h, /ct-slot is-picked[^]*aria-pressed="true"/);
  assert.match(h, /This week/);
  assert.match(h, /ct-slot is-away[^]*aria-disabled="true"[^]*Back next week/);
  assert.match(h, /ct-empty[^]*Empty slot/);
  assert.match(h, /data-ct="course" data-id="k1"[^>]*aria-label="Send Hale on course, 60 Coins/);
  assert.doesNotMatch(h, /data-ct="course" data-id="k2"/, 'no course button on an away coach');
  assert.match(h, /data-ct="scout"[^>]*Scout list: sign a new coach/);
  const h2 = coachStripHtml({ coaches: [coach({ course: { ok: false, why: 'coins', cost: 90 } })], strip: { slots: 3, scoutOpen: false } });
  assert.match(h2, /data-ct="course"[^>]*aria-disabled="true"[^]*Need 90 Coins/); assert.match(h2, /Scout list, done this season/);
  assert.match(coachStripHtml({ coaches: [], strip: { slots: 3 } }), /^(?:(?!ct-pick).)*$/s, 'no coaches: only empty slots');
});

test('tap a coach = SetTrainPlan {coachId}: pick, away refused, picked again = none (same rule as the sheet)', () => {
  const s = game({ coaches: [K(), K({ id: 'k2', name: 'Moss', away: 1 })] });
  const a = setPlan(s, { coachId: 'k1' }); assert.equal(planOf(a).coachId, 'k1');
  assert.equal(setPlan(s, { coachId: 'k2' }), s, 'away coach refused');
  assert.equal(planOf(setPlan(a, { coachId: null })).coachId, null);
  const v = read('js/ui/training-view.js');
  assert.match(v, /dispatch\('SetTrainPlan', \{ coachId: P\.coachId === id \? null : id \}\)/);
  const st = untilTrain('wa1-pick'), c0 = sel.trainingVM(st).coaches.find((c) => !c.away);
  if (c0) assert.equal(sel.trainingVM(C(st, 'SetTrainPlan', { coachId: c0.id })).coaches.find((c) => c.id === c0.id).picked, true);
});

test('old entry points still work and reach the same flows', () => {
  const app = read('js/ui/app.js');
  assert.match(app, /coaches: \{ file: 'coaches-sheet'/, 'sheet:coaches kept');
  assert.match(app, /coach: \['coachpick-view', 'coachPickVM'\]/, 'season scout list screen kept');
  assert.equal(typeof coachesSheet.open, 'function'); assert.equal(typeof coachesSheet.startCourse, 'function'); assert.equal(typeof coachesSheet.openScout, 'function');
  const cs = read('js/ui/coaches-sheet.js');
  assert.match(cs, /if \(arg && arg\.course\) \{ startCourse\(/); assert.match(cs, /if \(arg && arg\.scout\) \{ openScout\(/);
  assert.match(cs, /close\(\); startCourse\(vm, id, dispatch, refresh\)/, 'the sheet button uses the same course flow');
  assert.match(cs, /data-pick=/, 'sheet still picks'); assert.match(cs, /PickWeekCoach/);
  const v = read('js/ui/training-view.js');
  assert.match(v, /open\('coaches', \{ course: id \}\)/); assert.match(v, /open\('coaches', \{ scout: 1 \}\)/); assert.match(v, /open\('coaches'\)/);
  const st = untilTrain('wa1-old'), c0 = sel.trainingVM(st).coaches[0];
  if (c0) assert.equal(planOf(C(st, 'PickWeekCoach', { coachId: c0.away ? null : c0.id })).coachId, c0.away ? null : c0.id, 'PickWeekCoach command kept');
  const cv = sel.coachesVM(st); assert.ok(Array.isArray(cv.coaches) && cv.scout, 'coachesVM kept with scout');
});

test('coach strip CSS: .ct- block, tokens only, taps >= 56px (e2e audit; contract floor 44)', () => {
  const css = read('css/training2.css'), blk = css.slice(css.indexOf('wa1 coach strip'));
  assert.ok(blk.length > 100);
  assert.equal(/#[0-9a-fA-F]{3,6}\b/.test(blk), false);
  for (const c of ['.ct-all, .ct-scout', '.ct-pick', '.ct-course']) assert.match(blk, new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*min-height: 56px'), c);
});
