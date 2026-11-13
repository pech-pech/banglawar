// r9 code review fixes (store/core): H2 stale s.match, M1 facility rules from the save, M2 activity tilt after an early roll,
// M3 pay gap from unboosted ratings, L4 unique trial coach ids, L6 new run opens on the free pick, L7 free-pick selection kept, L8 freepick notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { ECON as E } from '../js/data/economy.js';
import { applyCommand as C, mdFor } from '../js/store/commands.js';
import * as X from '../js/core/economy.js';
import * as A from '../js/core/activities.js';
import { sixGap, matchPay } from '../js/core/season.js';
import { applyCarry, carryOf } from '../js/core/run.js';
import { migrate } from '../js/core/save-migrate.js';
import { mdOf } from '../js/report/metrics.js';
import { makeRng } from '../js/core/rng.js';
import { render as renderFp } from '../js/ui/freepick-view.js';
import { newGame, step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const until = (st, pred, max = 4000) => { let g = 0; while (g++ < max && !pred(st.get()) && step(st)) { if (st.get().stage === 'matchday') st.dispatch('MatchdayGo'); } return st.get(); };

// ---- H2
test('H2: s.match is set for a match-day match and cleared at FinishMatch; never stale on the next match', () => withFlags({ matchday: true }, () => {
  const st = newGame('fx3-h2');
  const live = until(st, (s) => s.stage === 'bowl');
  assert.ok(live.match && live.match.md, 'match-day match carries its roll');
  until(st, (s) => s.stage === 'done');
  st.dispatch('FinishMatch');
  assert.equal(st.get().match, undefined, 'cleared with the match');
  // features off for the next match: no roll, and nothing stale for the report
  st.dispatch('SetFeatures', { on: false });
  FLAGS.matchday = false;
  const nxt = until(st, (s) => s.stage === 'bowl');
  assert.equal(nxt.match, undefined, 'features-off match has no s.match');
  assert.equal(mdOf(nxt), null, 'report metrics mdOf finds no stale roll');
}));

test('H2: a stale s.match on an old state is dropped by NewMatch without a roll', () => {
  const st = newGame('fx3-h2b');
  const plan = until(st, (s) => s.stage === 'plan');
  const n = C({ ...plan, match: { md: { hype: 'nuts' } } }, 'NewMatch');
  assert.equal(n.stage, 'bowl'); assert.equal(n.match, undefined);
});

// ---- M1
test('M1: features off on a free-pick save: L1 facilities keep their price and the free pick stays one', () => {
  let s = withFlags({ freePick: true }, () => newGame('fx3-m1').get());
  assert.ok(s.econ.freePick && !s.econ.freePick.done);
  s = { ...s, econ: { ...s.econ, coins: 5000 } };
  // features off: the live flag is off
  for (const k of ['stands', 'nets', 'academy']) {
    const o = X.buildOptions(s).find((x) => x.what === k);
    assert.equal(o.coins, E.FAC_L1_COST[k], `${k} L1 price from the save's own rules`);
    assert.ok(o.coins > 0);
    assert.equal(X.facCost(k, 1, s.econ), E.FAC_L1_COST[k]);
  }
  const c0 = s.econ.coins;
  for (const k of ['stands', 'nets', 'academy']) s = C(s, 'StartBuild', { what: k });
  assert.equal(s.econ.coins, c0 - E.FAC_L1_COST.stands - E.FAC_L1_COST.nets - E.FAC_L1_COST.academy, 'paid for all three');
  // the shop opens at Stadium 1 under the free-pick rules, flag or not
  assert.notEqual(X.buildOptions(s).find((x) => x.what === 'shop').why, 'Needs Stadium 2');
  // features back on: one free pick, then it is done
  withFlags({ freePick: true }, () => {
    const t = C(s, 'TakeFreePick', { what: 'gym' });
    assert.equal(t.econ.fac.gym, 1); assert.equal(t.econ.coins, s.econ.coins);
    assert.equal(C(t, 'TakeFreePick', { what: 'shop' }), t, 'only one free pick');
  });
});

test('M1: a legacy economy (no freePick) keeps the old rules with the flag on or off', () => {
  const e = X.newEconomy({ legacy: true });
  assert.equal(e.freePick, undefined);
  for (const on of [false, true]) withFlags({ freePick: on }, () => {
    assert.equal(X.facCost('gym', 1, e), E.FAC_COST.gym[1]);
    const s = { season: { league: 1, n: 1 }, clubs: [{ squad: [], six: [] }], econ: { ...e, coins: 5000 } };
    assert.equal(X.buildOptions(s).find((x) => x.what === 'shop').why, `Needs Stadium ${E.FAC_OPEN.shop}`);
  });
});

// ---- M2
test('M2: TeamSix (or OpenMatchday) before the fan activity: the activity tilt still reaches this match roll', () => withFlags({ matchday: true, activities: true }, () => {
  const st = newGame('fx3-m2');
  let s = st.get();
  s = { ...s, econ: { ...s.econ, coins: 5000 } };
  const ids = s.clubs[0].squad.slice(0, 6).map((p) => p.id);
  const early = C(s, 'TeamSix', { ids });
  assert.equal(early.stage, 'hub');
  assert.ok(early.fixture.md, 'TeamSix rolled early');
  const after = C(early, 'PickActivity', { id: 'banner' });
  assert.notEqual(after, early);
  assert.equal(after.fixture.md, undefined, 'early roll dropped: rolled again with the tilt');
  // same as picking the activity first
  const first = C(C(s, 'PickActivity', { id: 'banner' }), 'TeamSix', { ids });
  assert.deepEqual(mdFor(after, ids), mdFor(first, ids));
  assert.deepEqual(first.fixture.md, mdFor(first, ids));
  // OpenMatchday first, back out, then the activity: same
  const opened = C(s, 'OpenMatchday');
  assert.equal(opened.stage, 'matchday'); assert.ok(opened.fixture.md);
  const hubAgain = { ...opened, stage: 'hub' };
  const t = C(hubAgain, 'PickActivity', { id: 'banner' });
  assert.equal(t.fixture.md, undefined);
}));

test('M2: once the Match day screen is done (mdDone) the roll the player saw is kept', () => withFlags({ matchday: true, activities: true }, () => {
  let s = newGame('fx3-m2b').get();
  s = { ...s, econ: { ...s.econ, coins: 5000 } };
  const opened = C(s, 'OpenMatchday');
  const done = { ...opened, stage: 'hub', fixture: { ...opened.fixture, mdDone: true } };
  const t = C(done, 'PickActivity', { id: 'banner' });
  assert.deepEqual(t.fixture.md, done.fixture.md);
}));

// ---- M3
test('M3: match-day boosts do not change the pay gap (sixGap reads unboosted ratings)', () => withFlags({ matchday: true }, () => {
  const st = newGame('fx3-m3');
  const live = until(st, (s) => s.stage === 'bowl');
  const boosted = live.me.players.some((p) => { const q = live.clubs[0].squad.find((x) => x.id === p.id); return q && q.bp !== p.bp; });
  const s = boosted ? live : { ...live, me: { ...live.me, players: live.me.players.map((p) => ({ ...p, bp: p.bp * 1.15, bs: p.bs * 1.15, spd: p.spd * 1.15, bsk: p.bsk * 1.15 })) } };
  const plain = { ...s, me: { ...s.me, players: s.me.players.map((p) => ({ ...p, ...['bp', 'bs', 'spd', 'bsk'].reduce((o, k) => ({ ...o, [k]: s.clubs[0].squad.find((x) => x.id === p.id)[k] }), {}) })) } };
  assert.equal(sixGap(s), sixGap(plain));
  assert.equal(matchPay(s, { outcome: 'won', kind: 'league' }).total, matchPay(plain, { outcome: 'won', kind: 'league' }).total);
}));

// ---- L4
test('L4: trial coach ids carry the run number; signTrial refuses a duplicate id', () => withFlags({ activities: true }, () => {
  const seq = (...xs) => { const base = makeRng('seq'); let i = 0; return { ...base, random: () => (i < xs.length ? xs[i++] : base.random()), pick: (a) => a[0], int: (n) => base.int(n) }; };
  const P = (id, r) => ({ id, name: id, bat: 'Middle', bowl: 'Medium', bp: r, bs: r, spd: r, bsk: r, potential: 117, drillsHere: 0, nodes: { bat: 0, bowl: 0 } });
  const squad = Array.from({ length: 8 }, (_, i) => P('p' + i, 40 + i));
  const mk = (runNo, coaches) => ({ seed: 'e1', run: { no: runNo }, season: { league: 1, n: 1, round: 5, phase: 'league' }, coaches, clubs: [{ id: 'c0', squad, six: squad.slice(0, 6).map((p) => p.id) }], econ: { ...X.newEconomy(), coins: 5000 } });
  const k0 = { id: 'k0', name: 'Okafor', step: 4, strong: ['bat'], away: 0, courseSeason: null };
  const t1 = A.pickActivity(mk(1, [k0]), 'signing', seq(0.0, 0.9, 0.5));
  const t2 = A.pickActivity(mk(2, [k0]), 'signing', seq(0.0, 0.9, 0.5));
  assert.equal(t1.trial.kind, 'coach'); assert.equal(t2.trial.kind, 'coach');
  assert.notEqual(t1.trial.coach.id, t2.trial.coach.id, 'same season and round in another run: another id');
  // a carried coach with the same id is already on the staff
  const dup = { ...t1, coaches: [k0, { ...t1.trial.coach, name: 'Carried' }] };
  assert.equal(A.signTrial(dup), dup, 'duplicate id refused');
  assert.equal(A.canSignTrial(dup).ok, false);
  assert.equal(A.signTrial(t1).coaches.length, 2, 'a fresh id still signs');
}));

// ---- L6
test('L6: a new run opens on the free pick when one is waiting (flag on), else on Home', () => {
  withFlags({ freePick: true }, () => {
    const fresh = newGame('fx3-l6').get();
    assert.equal(fresh.stage, 'freepick');
    const n = applyCarry(fresh, carryOf(fresh));
    assert.equal(n.stage, 'freepick');
  });
  const fresh = newGame('fx3-l6b').get();
  assert.equal(fresh.stage, 'hub');
  assert.equal(applyCarry(fresh, carryOf(fresh)).stage, 'hub');
});

// ---- L7
function fakeNode() {
  const n = { innerHTML: '', handlers: {}, kids: [], addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }, contains: () => true,
    querySelector: () => null, appendChild(c) { this.kids.push(c); return c; } };
  return n;
}
test('L7: the free-pick selection survives a store re-render; the report gear survives a local tap', () => {
  const old = globalThis.document;
  globalThis.document = { createElement: () => fakeNode() };
  try {
    const vm = { options: [{ id: 'gym', owned: false }, { id: 'stands', owned: false }] };
    const el = fakeNode();
    renderFp(el, vm, () => {});
    const host = el.kids[0];
    const tgt = { disabled: false, hasAttribute: (a) => a === 'data-cl-pick', getAttribute: () => 'gym' };
    host.handlers.click.forEach((f) => f({ target: { closest: () => tgt } }));
    assert.equal(el.__clFpPick, 'gym', 'pick kept on the stage element');
    el.kids = [];
    renderFp(el, vm, () => {}); // store re-render
    assert.equal(el.kids[0].__clPick, 'gym');
    assert.match(el.kids[0].innerHTML, /Take .* free/);
    // gear bar: moved back into the new .screen after a local re-render
    const bar = { cls: 'st-bar' }; let moved = null;
    const h2 = el.kids[0];
    h2.querySelector = (q) => (q === '.screen > .st-bar' ? bar : q === '.screen' ? { firstChild: null, insertBefore: (b) => { moved = b; } } : null);
    h2.handlers.click.forEach((f) => f({ target: { closest: () => ({ ...tgt, getAttribute: () => 'stands' }) } }));
    assert.equal(moved, bar, 'gear bar node kept');
    assert.equal(el.__clFpPick, 'stands');
    // Take clears it
    const calls = [];
    const el2 = fakeNode(); el2.__clFpPick = 'gym';
    renderFp(el2, vm, (n, a) => calls.push([n, a]));
    el2.kids[0].handlers.click.forEach((f) => f({ target: { closest: () => ({ disabled: false, hasAttribute: () => false }) } }));
    assert.deepEqual(calls, [['TakeFreePick', { what: 'gym' }]]);
    assert.equal(el2.__clFpPick, null);
  } finally { globalThis.document = old; }
});

// ---- L8
test('L8: no undismissable freepick notice: not set by migration, stripped on load and on the pick', () => withFlags({ freePick: true }, () => {
  const v5 = { v: 5, stage: 'hub', season: { n: 1, league: 1, results: [] }, econ: { ...X.newEconomy({ legacy: true }), backfilled: true } };
  assert.equal(migrate(v5, 5).state.notice, undefined);
  const saved = migrate(v5, 5).state;
  assert.equal(migrate({ ...saved, notice: 'freepick' }, 6).state.notice, undefined, 'old v6 save: key dropped');
  assert.equal(migrate({ ...saved, notice: 'squad8+freepick' }, 6).state.notice, 'squad8', 'other keys kept');
  const g = newGame('fx3-l8').get();
  const t = C({ ...g, notice: 'freepick' }, 'TakeFreePick', { what: 'gym' });
  assert.equal(t.notice, undefined); assert.equal(t.stage, 'hub');
}));
