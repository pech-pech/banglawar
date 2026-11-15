// Match coach (SPEC 2026-11-15): idle coach lifts our side in the match. Default pick, idle rules, boosts per focus, both modes, save field, report mc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { MATCH_COACH } from '../js/data/matchday.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { matchCoachOf, idleCoaches, setMatchCoach } from '../js/core/training.js';
import { matchCoachBoost, matchCoachText } from '../js/core/matchday.js';
import { createLog } from '../js/report/log.js';
import { buildFull } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { newGame, step } from './_season-bot.mjs';
import { coachesVM } from '../js/store/selectors.js';
import { coachRowHtml } from '../js/ui/matchday-view.js';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const co = (id, step, strong, away = 0) => ({ id, name: id.toUpperCase(), step, strong, away, courseSeason: null });
const toPlan = (seed) => { const st = newGame(seed); let g = 0; while (g++ < 200 && st.get().stage !== 'plan') { if (st.get().stage === 'matchday') st.dispatch('MatchdayGo'); else if (!step(st)) break; } return st.get(); };
const withCoaches = (s, coaches, nets) => ({ ...s, coaches, training: { ...s.training, coach_id: nets || null } });
const ratio = (a, b, k) => a.me.players.map((p, i) => p[k] / b.me.players[i][k]);

test('data: MATCH_COACH numbers', () => { assert.deepEqual(MATCH_COACH, { pct: 0.03, balancedPct: 0.015 }); });

test('boost per focus: Bat, Bowl, Balanced, bat+bowl, bal+bowl (best single contribution per side, never summed)', () => {
  assert.deepEqual(matchCoachBoost(['bat']), { bat: 0.03, bowl: 0 });
  assert.deepEqual(matchCoachBoost(['bowl']), { bat: 0, bowl: 0.03 });
  assert.deepEqual(matchCoachBoost(['bal']), { bat: 0.015, bowl: 0.015 });
  assert.deepEqual(matchCoachBoost(['bat', 'bowl']), { bat: 0.03, bowl: 0.03 });
  assert.deepEqual(matchCoachBoost(['bal', 'bowl']), { bat: 0.015, bowl: 0.03 });
  assert.deepEqual(matchCoachBoost(['bal', 'bat', 'bowl']), { bat: 0.03, bowl: 0.03 });
  assert.deepEqual(matchCoachBoost([]), { bat: 0, bowl: 0 });
});

test('chip words', () => {
  assert.equal(matchCoachText('Lee', { bat: 0, bowl: 0.03 }), 'Coach Lee: bowling +3%');
  assert.equal(matchCoachText('Lee', { bat: 0.03, bowl: 0.03 }), 'Coach Lee: batting and bowling +3%');
  assert.equal(matchCoachText('Lee', { bat: 0.015, bowl: 0.03 }), 'Coach Lee: batting +1.5%, bowling +3%');
});

test('idle rules: nets coach and away coach are excluded; default = highest grade idle', () => {
  const s = toPlan('mc-idle');
  const a = co('a', 8, ['bat']), b = co('b', 12, ['bowl']), c = co('c', 10, ['bat', 'bowl']);
  let t = withCoaches(s, [a, b, c], 'b');
  assert.deepEqual(idleCoaches(t).map((x) => x.id), ['a', 'c'], 'nets coach b is not idle');
  assert.equal(matchCoachOf(t).coach.id, 'c', 'highest grade of the idle');
  t = withCoaches(s, [a, co('b', 12, ['bowl'], 1), c], null);
  assert.deepEqual(idleCoaches(t).map((x) => x.id), ['a', 'c'], 'away on a course is not idle');
  t = withCoaches(s, [co('a', 8, ['bat'], 1)], null);
  assert.equal(matchCoachOf(t), null, 'none idle');
  t = withCoaches(s, [a], 'a');
  assert.equal(matchCoachOf(t), null, 'only coach is on nets');
  t = withCoaches(s, [co('x', 9, ['bat']), co('y', 9, ['bowl'])], null);
  assert.equal(matchCoachOf(t).coach.id, 'x', 'tie: slot order');
});

test('change: SetMatchCoach picks an idle coach; stale or non-idle falls back to default; null resets', () => {
  const s = withCoaches(toPlan('mc-pick'), [co('a', 8, ['bat']), co('b', 12, ['bowl']), co('c', 10, ['bat', 'bowl'])], 'b');
  const p = C(s, 'SetMatchCoach', { coachId: 'a' });
  assert.equal(p.training.matchCoachId, 'a'); assert.equal(matchCoachOf(p).coach.id, 'a'); assert.equal(matchCoachOf(p).chosen, true);
  assert.equal(C(s, 'SetMatchCoach', { coachId: 'b' }), s, 'nets coach refused');
  assert.equal(C(s, 'SetMatchCoach', { coachId: 'zzz' }), s, 'unknown refused');
  const moved = { ...p, training: { ...p.training, coach_id: 'a' } }; // nets now takes a: stored pick is stale
  assert.equal(matchCoachOf(moved).coach.id, 'b', 'default again');
  assert.equal(matchCoachOf(C(p, 'SetMatchCoach', { coachId: null })).chosen, false);
  assert.equal(setMatchCoach({ ...s, training: undefined }, 'a').training, undefined);
});

for (const mode of [{ name: 'Classic', wheelMeta: false }, { name: 'Wheel', wheelMeta: true }]) {
  test(`applied in ${mode.name} mode: multiplicative with match-day boosts, ours only, no RNG shift`, () => withFlags({ matchday: true, wheelMeta: mode.wheelMeta }, () => {
    const s = toPlan('mc-apply-' + mode.name);
    const base = C(withCoaches(s, [], null), 'NewMatch');
    assert.ok(base.match && base.match.md, 'match day on');
    assert.equal(base.match.md.mc, undefined, 'no coach, no mc');
    for (const [strong, eb, ew] of [[['bat'], 0.03, 0], [['bowl'], 0, 0.03], [['bal'], 0.015, 0.015], [['bat', 'bowl'], 0.03, 0.03], [['bal', 'bowl'], 0.015, 0.03]]) {
      const n = C(withCoaches(s, [co('k', 9, strong)], null), 'NewMatch');
      assert.equal(n.seed, base.seed, 'same seed');
      assert.deepEqual(n.match.md.mc && [n.match.md.mc.bat, n.match.md.mc.bowl], [eb, ew]);
      for (const k of ['bp', 'bs']) ratio(n, base, k).forEach((r, i) => assert.ok(Math.abs(r - (1 + eb)) < 1e-9 || base.me.players[i][k] * (1 + eb) >= 99, `${strong} ${k}`));
      for (const k of ['spd', 'bsk']) ratio(n, base, k).forEach((r, i) => assert.ok(Math.abs(r - (1 + ew)) < 1e-9 || base.me.players[i][k] * (1 + ew) >= 99, `${strong} ${k}`));
      assert.deepEqual(n.rival.players, base.rival.players, 'rival untouched');
      assert.deepEqual(n.inn1.lineup || null, base.inn1.lineup || null);
    }
  }));
}

test('multiplicative with Hype/Toss/Pep and no cap: the pepped player gets (1+team)(1+pep)(1+coach)', () => withFlags({ matchday: true }, () => {
  const s = toPlan('mc-mult');
  const base = C(withCoaches(s, [], null), 'NewMatch'), n = C(withCoaches(s, [co('k', 9, ['bat', 'bowl'])], null), 'NewMatch');
  const md = base.match.md, pid = md.pepId;
  assert.ok(pid != null);
  const unb = s.clubs[0].squad.find((p) => p.id === pid), i = s.clubs[0].six.indexOf(pid);
  const hype = 1 + (md.hypePerf != null ? md.hypePerf : { low: 0.02, med: 0.04, high: 0.06, nuts: 0.10 }[md.hype]);
  const f = hype * (md.toss === 'won' ? 1.05 : 1) * 1.05;
  const want = unb.bp * f * 1.03;
  if (want < 99) assert.ok(Math.abs(n.me.players[i].bp - want) < 1e-6, `${n.me.players[i].bp} vs ${want}`);
}));

test('flag off (matchday false): no coach effect, nothing added to the match', () => withFlags({ matchday: false }, () => {
  const s = toPlan('mc-off');
  const a = C(withCoaches(s, [], null), 'NewMatch'), b = C(withCoaches(s, [co('k', 9, ['bat', 'bowl'])], null), 'NewMatch');
  assert.deepEqual(a.me.players, b.me.players); assert.equal(b.match, undefined);
  assert.equal(sel.matchCoachVM(withCoaches(s, [co('k', 9, ['bat'])], null)), null);
}));

test('ball RNG is untouched: same seed plays the same with no coach and flag off', () => {
  const run = () => { const st = newGame('mc-det'); let g = 0; while (g++ < 5000 && step(st)) { /* play */ } return JSON.stringify(st.get().season.results); };
  assert.equal(run(), run());
});

test('match-day VM: row, none idle, chip, strip tag', () => withFlags({ matchday: true }, () => {
  const s = toPlan('mc-vm');
  const two = withCoaches(s, [co('lee', 12, ['bowl']), co('ray', 8, ['bat']), co('net', 14, ['bat', 'bowl'])], 'net');
  const open = C(two, 'OpenMatchday');
  assert.equal(open.stage, 'matchday');
  const vm = sel.matchdayVM(open);
  assert.equal(vm.coach.none, false); assert.equal(vm.coach.name, 'LEE'); assert.equal(vm.coach.text, 'Coach LEE: bowling +3%'); assert.equal(vm.coach.change, true);
  assert.equal(vm.coach.options.length, 2);
  const html = coachRowHtml(vm.coach);
  assert.match(html, /Match coach: LEE/); assert.match(html, /data-md="coach" data-id="ray"/); assert.match(html, /Change/);
  const chips = sel.chipsVM(open);
  assert.ok(chips.some((c) => c.key === 'coach' && c.text === 'Coach LEE: bowling +3%'));
  const sw = C(open, 'SetMatchCoach', { coachId: 'ray' });
  assert.equal(sel.matchdayVM(sw).coach.text, 'Coach RAY: batting +3%');
  const none = C(withCoaches(s, [co('solo', 9, ['bat'])], 'solo'), 'OpenMatchday');
  assert.equal(sel.matchdayVM(none).coach.line, 'No match coach this week');
  assert.match(coachRowHtml(sel.matchdayVM(none).coach), /No match coach this week/);
  // Training strip tag
  const tv = coachesVM(two);
  assert.deepEqual(tv.coaches.filter((c) => c.matchCoach).map((c) => c.id), ['lee']);
  const trainView = sel.trainingVM(two);
  assert.deepEqual(trainView.coaches.filter((c) => c.matchCoach).map((c) => c.id), ['lee']);
}));

test('auto match day uses the default pick', () => withFlags({ matchday: true }, () => {
  const s = withCoaches(toPlan('mc-auto'), [co('a', 8, ['bat']), co('b', 12, ['bowl'])], null);
  const n = C({ ...s, autoMatchday: true, mdSeen: 99 }, 'NewMatch');
  assert.equal(n.match.md.mc.id, 'b');
}));

test('save: per-week matchCoachId lives in training, JSON round trip, cleared at week end, missing = default, no version bump', () => {
  const s = withCoaches(toPlan('mc-save'), [co('a', 8, ['bat']), co('b', 12, ['bowl'])], null);
  const p = C(s, 'SetMatchCoach', { coachId: 'a' });
  const back = JSON.parse(JSON.stringify(p));
  assert.equal(back.training.matchCoachId, 'a'); assert.equal(matchCoachOf(back).coach.id, 'a');
  assert.equal(matchCoachOf(s).coach.id, 'b', 'missing field = default rule');
  assert.equal(back.v, s.v, 'version unchanged');
  assert.equal(s.v, 7);
});

test('report: mc per match record and the COACHES line', () => {
  const log = createLog({ storage: null, build: 'rX' });
  const md = { hype: 'low', hypeIdx: 0, toss: 'won', pepId: null, roar: [] };
  log.matchStart({ seed: 's1', stage: 'bowl', fixture: { kind: 'league', round: 1 }, season: { n: 1, league: 1 }, match: { md: { ...md, mc: { id: 'a', name: 'A', bat: 0.03, bowl: 0.015 } } } });
  log.matchStart({ seed: 's2', stage: 'bowl', fixture: { kind: 'league', round: 2 }, season: { n: 1, league: 1 }, match: { md } });
  const ms = log.data().matches;
  assert.deepEqual(ms[0].mc, [3, 1.5]); assert.equal(ms[1].mc, 0);
  for (const m of ms) Object.assign(m, { res: 'won', us: 50, them: 40, wkUs: 1, wkThem: 5, m: { k: 'wk', n: 3 }, fin: 1 });
  const txt = buildFull(log.data(), { build: 'rX', now: Date.UTC(2026, 10, 15), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS, matchday: true }, rid: 1 });
  assert.match(txt, /Match coach used 1 of 2 matches/);
  assert.match(txt, /"mc":\[3,1\.5\]/);
});
