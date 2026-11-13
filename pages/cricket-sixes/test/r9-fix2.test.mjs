// r9 QA2 fixes: B1 stale match-day roll from match 2 on, M1 settled wickets logged, m1 gear survives a reveal tap, m6 coach find named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import * as sel from '../js/store/selectors.js';
import { createStore } from '../js/store/store.js';
import { createLog } from '../js/report/log.js';
import { buildFull } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { doneLine } from '../js/ui/activities-view.js';
import { step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** Store driven through the report log the way hooks.js does; the Match day screen is read, then Go. */
function driven(seed) {
  const log = createLog({ storage: null, now: (() => { let t = 1000; return () => (t += 10); })(), build: 'rX' });
  const store = createStore(null); store.dispatch('NewGame', { seed });
  const run = (cmd, p) => {
    const before = store.get(); store.dispatch(cmd, p); const after = store.get();
    if (cmd === 'NewMatch' || ((cmd === 'StartMatch' || cmd === 'MatchdayGo') && after.stage === 'bowl')) log.matchStart(after);
    else if (cmd === 'FinishMatch') log.finish(before, after);
    else if (cmd === 'BowlOver' && after !== before) log.over(before, after, { th: 900 });
    if (cmd !== 'BowlOver') log.command(cmd, p, before, after);
  };
  return { log, store, proxy: { get: store.get, dispatch: run }, run };
}

test('B1: from match 2 on, the Match day screen and Plan chips show the roll that is then played', () => withFlags({ matchday: true, roar: true }, () => {
  for (const seed of ['r17', 's8', 'b1-a']) {
    const h = driven(seed);
    const seen = [];
    let screen = null, plan = null, g = 0;
    while (g++ < 6000 && seen.length < 3) {
      const s = h.store.get();
      if (s.stage === 'matchday') {
        const vm = sel.matchdayVM(s);
        assert.ok(vm, 'matchday VM');
        screen = { hype: vm.hype.level, toss: vm.toss.won, pep: vm.pep && vm.pep.id };
        h.run('MatchdayGo'); continue;
      }
      if (s.stage === 'plan') {
        const chips = sel.chipsVM(s);
        plan = chips.map((c) => c.text).join('|');
      }
      if (s.stage === 'bowl' && screen) {
        const md = s.match.md;
        const played = { hype: md.hype, toss: md.toss === 'won', pep: md.pepId };
        assert.deepEqual(screen, played, `${seed} match ${seen.length + 1}: screen roll = played roll`);
        assert.equal(plan, sel.chipsVM(s).map((c) => c.text).join('|'), `${seed} match ${seen.length + 1}: Plan chips = match chips`);
        seen.push(played); screen = null; plan = null;
      }
      if (!step(h.proxy)) break;
    }
    assert.ok(seen.length >= 2, seed + ': played at least 2 matches with the Match day screen');
  }
}));

test('B1: a stale s.match.md is never read before the match starts', () => withFlags({ matchday: true }, () => {
  const h = driven('b1-stale'); let g = 0, old = null;
  while (g++ < 4000 && h.store.get().stage !== 'train' && h.store.get().stage !== 'week' && step(h.proxy)) { if (h.store.get().match) old = h.store.get().match; if (h.store.get().stage === 'matchday') h.run('MatchdayGo'); }
  assert.equal(h.store.get().match, undefined, 'r9 H2: the store clears the match roll with its match');
  assert.ok(old && old.md, 'the match had a roll');
  const s = { ...h.store.get(), match: old }; // belt and braces: a stale roll (an old save) is still never read before the match starts
  const fake = { ...s, stage: 'hub', fixture: { ...(s.fixture || { kind: 'league', round: 2, opp: s.clubs[1].id }), md: { ...s.match.md, hype: s.match.md.hype === 'low' ? 'nuts' : 'low' } } };
  assert.equal(sel.chipsVM(fake)[0].text.split(' +')[0], { low: 'Quiet crowd', nuts: 'Wild crowd' }[fake.fixture.md.hype]);
  assert.deepEqual(sel.chipsVM({ ...fake, fixture: { ...fake.fixture, md: undefined } }), [], 'no fixture roll yet: no chips, not the old match ones');
}));

test('M1: with settled on, a real played match logs settled wickets (report JSON st, Match day line)', () => withFlags({ matchday: true, settled: true }, () => {
  const h = driven('r17'); let g = 0, fin = 0;
  while (g++ < 6000 && fin < 2) {
    const s = h.store.get();
    if (s.stage === 'matchday') { h.run('MatchdayGo'); continue; }
    if (s.stage === 'done') fin++;
    if (!step(h.proxy)) break;
  }
  const ms = h.log.data().matches.filter((m) => m.res);
  assert.ok(ms.length >= 2);
  for (const m of ms) assert.ok(Array.isArray(m.settled), 'settled list logged');
  const wk = ms.reduce((a, m) => a + m.settled.length, 0);
  assert.ok(wk > 0, 'the engine logged some wickets');
  const txt = buildFull(h.log.data(), { build: 'rX', now: Date.UTC(2026, 10, 13), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS, matchday: true, settled: true }, rid: 1 });
  assert.match(txt, /"st":\d+/);
  assert.match(txt, new RegExp('Match day: .*, settled wickets ' + wk + '\\.'));
}));

test('M1: settled off, no settled list', () => withFlags({ matchday: true, settled: false }, () => {
  const h = driven('r17'); let g = 0;
  while (g++ < 4000 && h.store.get().stage !== 'done') { if (h.store.get().stage === 'matchday') { h.run('MatchdayGo'); continue; } if (!step(h.proxy)) break; }
  h.run('FinishMatch');
  assert.equal(h.log.data().matches[0].settled, undefined);
}));

test('m1: a reveal tap repaints only the Match day body, so the strip (and its gear) stays', () => {
  const js = read('js/ui/matchday-view.js');
  assert.match(js, /querySelector\('\.md-root > \.md-body'\)/);
  assert.match(js, /oldBody\.replaceWith\(nb\)/);
  assert.match(read('js/report/hooks.js'), /matchday: 1/);
});

test('m6: the hub card names a coach find', () => {
  assert.equal(doneLine({ id: 'x', name: 'Car wash', fans: 10, find: { type: 'coach', id: 'tc1-3', name: 'Mensah' } }), 'Car wash: +10 Fans. Found a trial coach: Mensah.');
  assert.equal(doneLine({ id: 'x', name: 'Car wash', fans: 10, find: { type: 'coach', id: 'tc1-3' } }), 'Car wash: +10 Fans. Found a trial coach.');
  withFlags({ activities: true }, () => { // seed f5 + Banner finds a trial coach (QA2 run)
    const st = createStore(null); st.dispatch('NewGame', { seed: 'f5' }); st.dispatch('PickActivity', { id: 'banner' });
    const vm = sel.activitiesVM(st.get());
    assert.equal(vm.picked.find.type, 'coach');
    assert.equal(vm.picked.find.name, st.get().trial.coach.name);
    assert.match(doneLine(vm.picked), new RegExp('Found a trial coach: ' + st.get().trial.coach.name + '\\.$'));
    st.dispatch('DeclineTrial'); // gone from the trial slot: the name still comes from the ledger
    const after = sel.activitiesVM(st.get());
    assert.equal(st.get().trial, undefined);
    assert.equal(after.picked.find.name, vm.picked.find.name);
  });
});

// ---- r9 code review (REVIEW.md) H1, L1, L2, L3
test('H1: the Match day view adds no second data-act handler on the shared #app; a repeat start mid-match is not logged', () => {
  const js = read('js/ui/matchday-view.js');
  assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /bindActs\(/);
  assert.match(read('js/ui/app.js'), /bindActs\(el, /); // the one app-wide handler still dispatches MatchdayGo / BackToSquad
  assert.match(read('js/report/hooks.js'), /&& !\(before && before\.stage === 'bowl'\)\) log\.matchStart\(after\)/);
});

test('L1: the activity club event reads the newest history row (hist is newest first)', () => {
  const log = createLog({ storage: null, build: 'rX' });
  const before = { season: { n: 1 }, econ: { coins: 200, fans: 10, act: { hist: [{ id: 'street', find: { type: 'coins', coins: 9 } }] } } };
  const after = { season: { n: 1 }, econ: { coins: 115, fans: 40, act: { dry: 0, hist: [{ id: 'banner', find: { type: 'coach', id: 'tc1-2' } }, { id: 'street', find: { type: 'coins', coins: 9 } }] } } };
  log.command('PickActivity', { id: 'banner' }, before, after);
  assert.deepEqual(log.data().club.at(-1).find, { type: 'coach', id: 'tc1-2' });
});

test('L2: the match fan split is read from the ledger key split', () => {
  const log = createLog({ storage: null, build: 'rX' });
  log.matchStart({ seed: 'x', stage: 'bowl' });
  const m = log.data().matches[0]; m.res = 'won';
  const split = { result: 30, hypeMult: 1.25, stands: 4 };
  log.finish({ econ: { coins: 0, fans: 0 } }, { pay: { total: 1 }, econ: { coins: 5, fans: 34, ledger: [{ k: 'match', gate: 1, winBonus: 1, shop: 1, wages: 1, upkeep: 1, net: 1, fans: 34, arrears: 0, split }] } });
  assert.deepEqual(m.eco.fs, split);
});

test('L3: migrated = loaded from a save version older than the current one', () => {
  assert.match(read('js/report/hooks.js'), /f != null && f < SAVE_VERSION/);
  assert.match(read('js/report/hooks.js'), /import \{ VERSION as SAVE_VERSION \} from '\.\.\/core\/save-migrate\.js'/);
});
