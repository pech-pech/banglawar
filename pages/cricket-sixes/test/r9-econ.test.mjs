// r9 ECON: hype Fans mult + split, free pick + L1 gate, v6 migration, fan activities, trial finds, Nets L0, Stadium 2 pace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { ECON as E } from '../js/data/economy.js';
import { ACT } from '../js/data/activities.js';
import * as X from '../js/core/economy.js';
import * as A from '../js/core/activities.js';
import { migrate, VERSION } from '../js/core/save-migrate.js';
import { runNets } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
import { game, me, fixed } from './_tr-fixture.mjs';

/** rng: the given values first, then a seeded stream; normalish / pick / int built on random() like core/rng.js */
const seq = (...xs) => { const base = makeRng('seq'); let i = 0; const random = () => (i < xs.length ? xs[i++] : base.random());
  return { random, int: (n) => Math.floor(random() * n), pick: (a) => a[Math.floor(random() * a.length)], normalish(m, sd) { let s = 0; for (let k = 0; k < 12; k++) s += random(); return m + (s - 6) * sd; } }; };

const P = (id, r) => ({ id, name: id, bat: 'Middle', bowl: 'Medium', bp: r, bs: r, spd: r, bsk: r, potential: 117, drillsHere: 0, nodes: { bat: 0, bowl: 0 } });
const mk = (over = {}, o = {}) => {
  const squad = Array.from({ length: 8 }, (_, i) => P('p' + i, 40 + i));
  return { seed: 'e1', season: { league: o.league || 1, n: 1, round: o.round || 1, phase: 'league' }, coaches: [{ id: 'k0', name: 'Okafor', step: 4, strong: ['bat', 'bowl'], away: 0, courseSeason: null }],
    clubs: [{ id: 'c0', squad: o.squad || squad, six: squad.slice(0, 6).map((p) => p.id) }], econ: { ...X.newEconomy(), ...over } };
};
const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const act = (fn) => withFlags({ activities: true }, fn);
const round = (s, r) => ({ ...s, season: { ...s.season, round: r } });

// ---- all flags off = today
test('flags default off; old start and income unchanged', () => {
  assert.equal(FLAGS.activities, false); assert.equal(FLAGS.freePick, false);
  const e = X.newEconomy();
  assert.deepEqual(e.fac, { stands: 1, shop: 0, nets: 1, gym: 0, pitch: 0, academy: 1, scout: 0 }); assert.equal(e.freePick, undefined);
  const s = mk(), i = X.matchIncome(s, { win: true });
  assert.equal(i.fans, 45); assert.equal(i.split, undefined);
  const b = X.buildOptions(s);
  assert.equal(b.find((o) => o.what === 'shop').why, 'Needs Stadium 2'); assert.equal(b.find((o) => o.what === 'pitch').why, 'Needs Stadium 3');
  assert.equal(b.find((o) => o.what === 'stands').level, 2);
  assert.equal(A.activityOptions(s).open, false); assert.equal(A.pickActivity(s, 'street'), s);
  assert.equal(X.freePickPending(s), false); assert.equal(X.takeFreePick(s, 'stands'), s);
});

// ---- hype Fans mult (port line 7)
test('hype mult on the result part only, after the league mult; split logged', () => {
  const s = mk({}, { league: 3 });
  const w = (h) => X.matchIncome(s, { win: true, hypeIdx: h });
  assert.equal(w(0).fans, Math.round(40 * 1.5) + 5);
  assert.equal(w(1).fans, Math.round(40 * 1.5 * 1.1) + 5);
  assert.equal(w(2).fans, Math.round(40 * 1.5 * 1.25) + 5);
  assert.deepEqual(w(3).split, { result: 90, hypeMult: 1.5, stands: 5 }); assert.equal(w(3).fans, 95);
  assert.equal(X.matchIncome(s, { win: false, hypeIdx: 3 }).fans, Math.round(10 * 1.5 * 1.5) + 5);
  assert.equal(X.matchIncome(s, { tie: true, hypeIdx: 2 }).fans, Math.round(25 * 1.5 * 1.25) + 5);
  assert.equal(X.matchIncome(s, { win: true }).fans, Math.round(40 * 1.5) + 5, 'no hypeIdx = today');
  const o = X.applyMatch(s, { win: true, hypeIdx: 3 });
  assert.equal(o.econ.fans, 95); assert.equal(o.econ.ledger.at(-1).split.hypeMult, 1.5);
});

// ---- free pick
test('free pick: all L0, one free L1, others cost Coins from round 1, no stadium gate on L1', () => withFlags({ freePick: true }, () => {
  let s = mk(); s.econ = X.newEconomy();
  assert.deepEqual(s.econ.fac, { stands: 0, shop: 0, nets: 0, gym: 0, pitch: 0, academy: 0, scout: 0 }); assert.deepEqual(s.econ.freePick, { done: false, pick: null });
  assert.equal(X.freePickPending(s), true);
  const o = X.freePickOptions(s);
  assert.equal(o.length, 7); assert.ok(o.every((x) => x.ok && x.effect));
  assert.equal(o.find((x) => x.what === 'stands').recommended, true);
  assert.match(o.find((x) => x.what === 'academy').note, /sign screen/); assert.match(o.find((x) => x.what === 'scout').note, /sign screen/); assert.match(o.find((x) => x.what === 'pitch').note, /not in matches/);
  const b = X.buildOptions(s);
  for (const k of E.FAC) { const r = b.find((x) => x.what === k); assert.equal(r.level, 1); assert.equal(r.coins, E.FAC_L1_COST[k]); assert.equal(r.ok, true, k); }
  assert.equal(Object.values(E.FAC_L1_COST).reduce((a, c) => a + c, 0), 560);
  const t = X.takeFreePick(s, 'stands');
  assert.equal(t.econ.fac.stands, 1); assert.equal(t.econ.coins, 1300); assert.deepEqual(t.econ.freePick, { done: true, pick: 'stands' });
  assert.equal(X.takeFreePick(t, 'gym'), t, 'only one'); assert.equal(X.freePickPending(t), false);
  assert.equal(X.takeFreePick(s, 'nope'), s);
  assert.equal(X.freePickOptions(t).every((x) => !x.ok), true);
  const g = X.startBuild(t, 'gym'); assert.equal(g.econ.fac.gym, 1); assert.equal(g.econ.coins, 1300 - 70);
  assert.equal(X.buildOptions(t).find((x) => x.what === 'stands').level, 2); assert.equal(X.buildOptions(t).find((x) => x.what === 'stands').why, 'Needs Stadium 2', 'L2 still needs the stadium');
  assert.equal(X.buildOptions(s).find((x) => x.what === 'stadium').ok, false);
}));
test('free pick: Nets L0 is safe for training; FAC_START_NETS 1 is the fallback', () => withFlags({ freePick: true }, () => {
  const mkG = (n) => { const g = game({ players: [{ ...me(game(), 'p1'), id: 'p1' }] }); g.econ = { ...X.newEconomy(), fac: { ...X.newEconomy().fac, nets: n } }; g.training.week = 1; return g; };
  const a = runNets(mkG(0), fixed(0.1), {}), b = runNets(mkG(1), fixed(0.1), {});
  assert.ok(a.state && a.cost > 0, 'runs');
  assert.deepEqual(a.state.clubs[0].squad.map((p) => [p.bp, p.bs, p.spd, p.bsk]), b.state.clubs[0].squad.map((p) => [p.bp, p.bs, p.spd, p.bsk]), 'same result at Nets L0 and L1');
  assert.equal(X.netsLevel(mkG(0)), 0);
  assert.equal(E.FAC_START_NETS, 0, 'no fallback needed');
}));

// ---- migration v6
test('v6 migration: each facility mix; nothing owned is removed; no freepick notice (r9 L8)', () => {
  assert.equal(VERSION, 7);
  const v5 = (fac) => ({ v: 5, stage: 'hub', season: { n: 1, league: 1, results: [] }, econ: { ...X.newEconomy({ legacy: true }), backfilled: true, fac: { ...E.FAC_START, ...fac } } });
  const old = migrate(v5({}), 5).state;
  assert.equal(old.v, 7); assert.deepEqual(old.econ.freePick, { done: false, pick: null }); assert.equal(old.notice, undefined, 'flag off: no card');
  assert.deepEqual(old.econ.fac, { stands: 1, shop: 0, nets: 1, gym: 0, pitch: 0, academy: 1, scout: 0 });
  withFlags({ freePick: true }, () => {
    const n = migrate(v5({}), 5).state;
    assert.equal(n.notice, undefined, 'r9 L8: no undismissable freepick notice'); assert.equal(X.freePickPending(n), true);
    assert.deepEqual(X.freePickOptions(n).filter((x) => x.ok).map((x) => x.what), ['shop', 'gym', 'pitch', 'scout']);
    assert.equal(X.freePickOptions(n).find((x) => x.what === 'stands').owned, true);
    const t = X.takeFreePick(n, 'pitch'); assert.equal(t.econ.fac.pitch, 1); assert.equal(t.econ.coins, n.econ.coins); assert.equal(t.econ.fac.stands, 1);
    const withNotice = migrate({ ...v5({}), notice: 'squad8' }, 5).state; assert.equal(withNotice.notice, 'squad8');
    const all = migrate(v5({ shop: 2, gym: 3, pitch: 1, scout: 5, stands: 4 }), 5).state;
    assert.deepEqual(all.econ.freePick, { done: true, pick: null }); assert.equal(all.notice, undefined); assert.equal(all.econ.fac.scout, 5); assert.equal(all.econ.fac.stands, 4);
    assert.equal(X.freePickPending(all), false);
    const one = migrate(v5({ shop: 1, gym: 1, pitch: 1 }), 5).state; assert.deepEqual(X.freePickOptions(one).filter((x) => x.ok).map((x) => x.what), ['scout']);
    assert.equal(X.buildOptions(n).find((x) => x.what === 'shop').level, 1, 'the Shop/Pitch lock lifts at once'); assert.equal(X.buildOptions(n).find((x) => x.what === 'shop').ok, true);
    assert.equal(migrate(old, 6).state.econ.freePick.done, false, 'second pass changes nothing');
    assert.deepEqual(migrate(n, 6).state, n);
    assert.equal(migrate(v5({}), 5).state.econ.fac.stands, 1, 'a migrated save keeps its old levels (no L0 reset)');
  });
  const older = migrate({ v: 4, stage: 'hub', season: { n: 1, league: 1, results: [] }, clubs: [{ id: 'c0', squad: [], six: [] }] }, 4);
  withFlags({ freePick: true }, () => { const m = migrate({ v: 4, stage: 'hub', season: { n: 1, league: 1, results: [] }, clubs: [{ id: 'c0', squad: [], six: [] }] }, 4); assert.equal(m.state.econ.fac.stands, 1, 'old-save economy never gets the new L0 start'); });
  assert.equal(older.ok, true);
});

// ---- activities
test('activityOptions: closed with the flag off, six rows with cost x Coin mult, Fans x Fans mult', () => {
  assert.equal(A.activityOptions(mk()).open, false);
  act(() => {
    const o = A.activityOptions(mk());
    assert.equal(o.open, true); assert.equal(o.rows.length, 6); assert.deepEqual(o.rows.map((r) => r.coins), [15, 30, 40, 55, 70, 85]);
    assert.deepEqual(o.rows.map((r) => r.fans), [10, 16, 22, 28, 36, 44]);
    const l3 = A.activityOptions(mk({}, { league: 3 })).rows.find((r) => r.id === 'banner');
    assert.equal(l3.coins, Math.round(85 * 2.4)); assert.equal(l3.fans, Math.round(44 * 1.5));
    const l1 = A.activityOptions(mk({ coins: 20 })).rows;
    assert.equal(l1[0].ok, true); assert.equal(l1[5].ok, false); assert.match(l1[5].why, /Needs 85 Coins/);
    assert.equal(A.activityOptions(mk({ arrears: 5 })).rows[0].why, 'Pay the wages first');
    assert.ok(A.activityOptions(mk({ coins: 100 })).rows.find((r) => r.id === 'banner').warn, 'warn only');
    assert.equal(A.activityOptions({ ...mk(), season: { n: 1, round: 9, phase: 'over', league: 1 } }).open, false);
  });
});
test('pickActivity: pays Coins, adds Fans, once a round, rest is free, ledger out-line', () => act(() => {
  const s = mk(), r = fixed(0.99, 0.5, 0.5);
  const a = A.pickActivity(s, 'tea', r);
  assert.equal(a.econ.coins, 1300 - 55); assert.equal(a.econ.fans, 28);
  assert.deepEqual(a.econ.ledger.at(-1), { k: 'act', id: 'tea', coins: 55, fans: 28 });
  assert.equal(A.activityOptions(a).open, false); assert.equal(A.activityOptions(a).picked, 'tea');
  assert.equal(A.pickActivity(a, 'street', r), a, 'once a round');
  assert.equal(s.econ.coins, 1300, 'input untouched');
  const b = round(a, 2); assert.equal(A.activityOptions(b).open, true);
  const rest = A.pickActivity(s, 'rest');
  assert.equal(rest.econ.coins, 1300); assert.equal(rest.econ.fans, 0); assert.equal(A.activityOptions(rest).open, false); assert.deepEqual(A.actLedger(rest), [0, 0, 0]);
  const poor = mk({ coins: 10 }); assert.equal(A.pickActivity(poor, 'banner'), poor); assert.equal(A.pickActivity(s, 'zzz'), s);
  const arrears = mk({ arrears: 1 }); assert.equal(A.pickActivity(arrears, 'street'), arrears);
  const coinsDelta = (a.econ.coins - s.econ.coins); const ledgerNet = a.econ.ledger.filter((x) => x.k === 'act').reduce((t, x) => t - x.coins, 0) + a.econ.ledger.filter((x) => x.k === 'actfind').reduce((t, x) => t + x.coins, 0);
  assert.equal(coinsDelta, ledgerNet, 'in - out = Coins delta');
}));
test('tilt ledger: this, last, round before; rest = 0', () => act(() => {
  let s = mk(); const r = () => fixed(0.99, 0.5, 0.5);
  s = A.pickActivity(s, 'banner', r()); assert.deepEqual(A.actLedger(s), [0.08, 0, 0]);
  s = round(s, 2); s = A.pickActivity(s, 'tea', r()); assert.deepEqual(A.actLedger(s), [0.05, 0.08, 0]);
  s = round(s, 3); s = A.pickActivity(s, 'rest'); assert.deepEqual(A.actLedger(s), [0, 0.05, 0.08]);
  s = round(s, 4); assert.deepEqual(A.actLedger(s), [0, 0, 0.05]);
}));
test('same activity two rounds running: 50% Fans, no find roll; pity after 5 dry picks', () => act(() => {
  let s = mk(); const dry = () => seq(0.99, 0.5, 0.5);
  s = A.pickActivity(s, 'clinic', dry()); s = round(s, 2);
  const o = A.activityOptions(s).rows.find((r) => r.id === 'clinic'); assert.equal(o.repeat, true); assert.equal(o.fans, 8); assert.equal(o.findPct, 0);
  const f0 = s.econ.fans, c0 = s.econ.coins;
  const again = A.pickActivity(s, 'clinic', fixed(0, 0, 0)); // would find, but a repeat never rolls
  assert.equal(again.econ.fans - f0, 8); assert.equal(again.trial, undefined); assert.equal(again.econ.coins, c0 - 30);
  // pity: 5 dry rolled picks (alternate ids), the 6th finds even on a miss draw
  let p = mk({ coins: 5000 }); const ids = ['street', 'clinic'];
  for (let i = 0; i < 5; i++) { p = round(p, i + 1); p = A.pickActivity(p, ids[i % 2], dry()); }
  assert.equal(p.econ.act.dry, 5); assert.equal(A.activityOptions(round(p, 6)).pity, true);
  const q = A.pickActivity(round(p, 6), 'tea', dry()); assert.equal(q.econ.act.dry, 0); assert.ok(q.econ.act.hist[0].find, 'pity find');
}));
test('finds: Coins = cost x U(0.8,1.6); odds table sums to 100; deterministic by seed + round', () => act(() => {
  for (const r of ACT.TABLE) assert.equal(r.mix.coins + r.mix.player + r.mix.coach, 100);
  const s = mk(), c = A.pickActivity(s, 'street', fixed(0.0, 0.0, 0.0)); // find, kind coins, U=0 -> 0.8
  assert.equal(c.econ.act.hist[0].find.type, 'coins'); assert.equal(c.econ.act.hist[0].find.coins, 12); assert.equal(c.econ.coins, 1300 - 15 + 12);
  const hi = A.pickActivity(s, 'street', fixed(0.0, 0.0, 0.9999)); assert.equal(hi.econ.act.hist[0].find.coins, 24);
  assert.equal(A.pickActivity(s, 'banner', fixed(0.26, 0, 0)).econ.act.hist[0].find, null, '26% is not under 26');
  const x = A.pickActivity(s, 'clinic'), y = A.pickActivity(s, 'clinic');
  assert.deepEqual(x, y, 'own stream: same seed and round, same result');
  let found = 0; for (let i = 0; i < 200; i++) { const t = A.pickActivity({ ...s, seed: 'z' + i }, 'banner'); if (t.econ.act.hist[0].find) found++; }
  assert.ok(found > 30 && found < 75, 'about 26% (' + found + '/200)');
}));
test('trial player: wage shown, Sign adds him free, squad max applies, Decline is free', () => act(() => {
  const s = mk({ coins: 5000 });
  const t = A.pickActivity(s, 'clinic', seq(0.0, 0.9, 0.5)); // clinic: coins 40 / player 60 -> 0.9 x 100 = 90 -> player
  assert.equal(t.trial.kind, 'player'); const p = t.trial.player;
  assert.equal(t.trial.wage, X.wageOf(p)); assert.ok(t.trial.wage > 0); assert.ok(p.bp >= 1 && p.bp <= 99 && p.potential >= 20);
  assert.equal(p.drillsHere, 0); assert.ok(['Opener', 'Middle', 'Lower'].includes(p.bat)); assert.ok(['Fast', 'Medium', 'Spin'].includes(p.bowl));
  assert.deepEqual(A.canSignTrial(t), { ok: false, why: 'Squad full: release one first' });
  assert.equal(A.signTrial(t), t, 'full squad: refused, state unchanged');
  const small = { ...t, clubs: [{ ...t.clubs[0], squad: t.clubs[0].squad.slice(0, 7) }] };
  const ok = A.signTrial(small);
  assert.equal(ok.clubs[0].squad.length, 8); assert.equal(ok.clubs[0].squad.at(-1).id, p.id); assert.equal(ok.trial, undefined); assert.equal(ok.econ.coins, small.econ.coins, 'no fee');
  assert.equal(ok.econ.ledger.at(-1).signed, true);
  const no = A.declineTrial(t); assert.equal(no.trial, undefined); assert.equal(no.clubs[0].squad.length, 8); assert.equal(no.econ.ledger.at(-1).signed, false);
  assert.equal(A.declineTrial(no), no); assert.equal(A.signTrial(no), no);
  assert.equal(A.pickActivity(round(t, 2), 'sixhit', seq(0, 0.5, 0.5)).trial, t.trial, 'a waiting trial is kept; a new player find turns into Coins');
  assert.equal(A.pickActivity(round(t, 2), 'sixhit', seq(0, 0.5, 0.5)).econ.act.hist[0].find.type, 'coins');
}));
test('trial coach: needs a free slot, else Coins', () => act(() => {
  const s = mk({ coins: 5000 }), r = () => seq(0.0, 0.9, 0.5); // signing: coins 60 / coach 40 -> 0.9 -> coach
  const t = A.pickActivity(s, 'signing', r());
  assert.equal(t.trial.kind, 'coach'); assert.ok(t.trial.coach.step >= 1 && t.trial.coach.step <= 21);
  const ok = A.signTrial(t); assert.equal(ok.coaches.length, 2); assert.equal(ok.trial, undefined);
  const full = { ...s, coaches: [1, 2, 3].map((i) => ({ id: 'k' + i, name: 'C' + i, step: 4, strong: ['bat'], away: 0, courseSeason: null })) };
  const c = A.pickActivity(full, 'signing', r()); assert.equal(c.trial, undefined); assert.equal(c.econ.act.hist[0].find.type, 'coins');
}));

// ---- Stadium 2 pace (11 e, f): rounds to 310 Fans by profile, 55% wins, mean hype mult, Stands L1
test('Stadium 2 arrives in the spec round counts (+/-1) for each activity profile', () => act(() => {
  const profiles = { A: [], B: ['street', 'clinic'], C: ['signing', 'tea', 'clinic'], D: ['sixhit', 'banner', 'tea'] }, want = { A: 8.9, B: 6.5, C: 5.4, D: 4.4 };
  const roundsTo310 = (prof, seed) => {
    const rng = makeRng('pace' + seed); let s = mk({ fac: { ...E.FAC_START, stands: 1 } });
    for (let r = 1; r <= 40; r++) {
      s = round(s, ((r - 1) % 9) + 1); s = { ...s, season: { ...s.season, n: 1 + Math.floor((r - 1) / 9) } };
      if (prof.length) s = A.pickActivity(s, prof[(r - 1) % prof.length], rng); // no find loop needed: a trial is ignored (kept waiting)
      const u = rng.random() * 100, h = u < 35 ? 0 : u < 70 ? 1 : u < 90 ? 2 : 3, win = rng.random() < 0.55;
      s = X.applyMatch(s, { win, hypeIdx: h }); s = { ...s, trial: undefined };
      if (s.econ.fans >= 310) return r;
    }
    return 40;
  };
  for (const [k, prof] of Object.entries(profiles)) {
    let tot = 0; const N = 300; for (let i = 0; i < N; i++) tot += roundsTo310(prof, k + i);
    const mean = tot / N; assert.ok(Math.abs(mean - want[k]) <= 1, `${k}: ${mean.toFixed(2)} vs ${want[k]}`);
  }
}));
