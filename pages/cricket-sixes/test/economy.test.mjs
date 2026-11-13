import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../js/core/economy.js';

const P = (id, r, extra = {}) => ({ id, name: id, bp: r, bs: r, spd: r, bsk: r, potential: 117, drillsHere: 0, ...extra });
const mk = (n = 8, r = 40, league = 1, over = {}) => {
  const squad = Array.from({ length: n }, (_, i) => P('p' + i, r + i)); // p0..: ratings rise so p(n-1) is best paid
  return { season: { league, n: 1 }, clubs: [{ squad, six: squad.slice(0, 6).map((p) => p.id) }], econ: { ...X.newEconomy(), ...over } };
};
const ec = (s, o) => ({ ...s, econ: { ...s.econ, ...o } });

test('newEconomy', () => {
  const e = X.newEconomy();
  assert.deepEqual(e.fac, { stands: 1, shop: 0, nets: 1, gym: 0, pitch: 0, academy: 1, scout: 0 });
  assert.equal(e.coins, 1300); assert.equal(e.stadium, 1); assert.equal(e.build, null);
});

test('income lines per formula (L1, stadium 1, 0 fans)', () => {
  const s = mk();
  const i = X.matchIncome(s, { win: true });
  assert.equal(i.gate, Math.round(500 * 1.1 * 0.27 * 0 + 500 * 0.55 * 0.27)); // 500 seats? stands L1 = +0%
  assert.equal(i.winBonus, 70); assert.equal(i.shop, 0);
  assert.equal(i.upkeep, 3); assert.equal(i.fans, 40 + 5);
  assert.equal(i.net, i.gate + i.winBonus + i.shop - i.wages - i.upkeep);
  assert.equal(X.matchIncome(s, { win: false }).winBonus, 0);
  assert.equal(X.matchIncome(s, { win: false }).fans, 10 + 5);
});

test('fill caps at 95%', () => {
  const s = ec(mk(), { fans: 1e6 });
  assert.equal(X.matchIncome(s, {}).gate, Math.round(500 * 0.95 * 0.27));
});

test('coin multiplier applies to win, shop, upkeep; not gate, wages', () => {
  const a = mk(8, 40, 1, { fac: { ...X.newEconomy().fac, shop: 2 } }), b = mk(8, 40, 3, { fac: { ...X.newEconomy().fac, shop: 2 } });
  const ia = X.matchIncome(a, { win: true }), ib = X.matchIncome(b, { win: true });
  assert.equal(ib.gate, ia.gate); assert.equal(ib.wages, ia.wages);
  assert.equal(ib.winBonus, Math.round(70 * 2.4)); assert.equal(ib.shop, Math.round(12 * 2.4));
  assert.equal(ib.upkeep, Math.round(2.4 * 5)); assert.equal(ib.fans, Math.round(40 * 1.5) + 5);
});

test('upkeep = mult x (sum levels + 2 x (stadium-1))', () => {
  const s = ec(mk(8, 40, 2), { stadium: 2, fac: { stands: 2, shop: 1, nets: 1, gym: 1, pitch: 0, academy: 1, scout: 0 } });
  assert.equal(X.matchIncome(s, {}).upkeep, Math.round(1.6 * (6 + 2)));
});

test('stands raise seats; WAGE_K 7.0 wages; revealed potential factor', () => {
  const s = ec(mk(), { fac: { ...X.newEconomy().fac, stands: 3 } });
  assert.equal(X.seatsOf(s.econ), 600);
  assert.equal(X.wageOf(P('a', 50)), 11); // 4 + 7
  assert.equal(X.wageOf(P('a', 50, { drillsHere: 1, potential: 185 })), 22);
  assert.equal(X.wageOf(P('a', 50, { drillsHere: 1, potential: 90 })), Math.round(11 * 0.85));
  assert.equal(X.wageOf(P('a', 50, { drillsHere: 1, potential: 117.5 })), 11);
});

test('arrears build, freeze, then clear; two missed paydays sell best-paid outside six, never below 6', () => {
  let s = ec(mk(8, 60), { coins: 0 });
  s = X.applyMatch(s, { win: false });
  assert.ok(s.econ.arrears > 0 && s.econ.missed === 1 && s.econ.coins === 0);
  assert.equal(s.clubs[0].squad.length, 8);
  assert.equal(X.canAfford(s, 1), false);
  assert.equal(X.buildOptions(s).every((o) => !o.ok), true);
  s = X.applyMatch(s, { win: false });
  assert.equal(s.clubs[0].squad.length, 7);
  assert.equal(s.clubs[0].squad.find((p) => p.id === 'p7'), undefined); // best paid, outside six
  assert.equal(s.econ.missed, 0);
  assert.ok(s.econ.coins > 0 || s.econ.arrears >= 0);
  // never below 6
  let t = ec(mk(6, 60), { coins: 0 });
  for (let i = 0; i < 5; i++) t = X.applyMatch(t, {});
  assert.equal(t.clubs[0].squad.length, 6);
  // a paid match clears arrears
  let u = ec(mk(8, 30), { coins: 5000, arrears: 20, missed: 1 });
  u = X.applyMatch(u, { win: true });
  assert.equal(u.econ.arrears, 0); assert.equal(u.econ.missed, 0);
});

test('stadium gates: Fans to START, facility <= stadium level, shop/pitch opens', () => {
  let s = ec(mk(), { coins: 5000, fans: 309 });
  let o = X.buildOptions(s);
  const st = o.find((x) => x.what === 'stadium');
  assert.deepEqual([st.level, st.coins, st.fansGate, st.matches, st.ok], [2, 390, 310, 1, false]);
  assert.match(st.why, /^Needs \d+ Fans, you have \d+$/);
  assert.equal(o.find((x) => x.what === 'nets').ok, false); // L2 nets needs stadium 2
  assert.equal(o.find((x) => x.what === 'gym').ok, true);   // L1 gym ok at stadium 1
  assert.equal(o.find((x) => x.what === 'shop').ok, false); // shop opens at stadium 2
  assert.equal(X.startBuild(s, 'stadium'), s);
  s = ec(s, { fans: 310 });
  s = X.startBuild(s, 'stadium');
  assert.equal(s.econ.coins, 4610); assert.deepEqual(s.econ.build, { what: 'stadium', level: 2, left: 1 });
  assert.equal(X.buildOptions(s).find((x) => x.what === 'stadium').ok, false); // one at a time
  s = X.tickBuild(s);
  assert.equal(s.econ.stadium, 2); assert.equal(s.econ.build, null);
  const nets = X.buildOptions(s).find((x) => x.what === 'nets');
  assert.deepEqual([nets.level, nets.coins, nets.ok], [2, 210, true]);
  assert.equal(X.buildOptions(s).find((x) => x.what === 'shop').ok, true);
  s = X.startBuild(s, 'nets'); assert.equal(X.netsLevel(s), 2); assert.equal(s.econ.coins, 4610 - 210);
});

test('L2 prices are x1.4 (L3-L5 unchanged)', () => {
  const s = ec(mk(), { stadium: 5, coins: 1e5 });
  const price = (what, fac) => X.buildOptions(ec(s, { fac: { ...s.econ.fac, [what]: fac } })).find((o) => o.what === what).coins;
  const l2 = { stands: 365, shop: 320, nets: 210, gym: 265, pitch: 390, academy: 240, scout: 295 };
  for (const [k, v] of Object.entries(l2)) assert.equal(price(k, 1), v, k);
  assert.equal(price('stands', 2), 600); assert.equal(price('scout', 4), 2450);
});

test('gymTp and canPromote', () => {
  assert.equal(X.gymTp(mk()), 0);
  assert.equal(X.gymTp(ec(mk(), { fac: { ...X.newEconomy().fac, gym: 3 } })), 23);
  assert.deepEqual(X.canPromote(mk()), { ok: false, why: 'Build Stadium 2 first' });
  assert.equal(X.canPromote(ec(mk(), { stadium: 2 })).ok, true);
  assert.equal(X.canPromote(ec(mk(8, 40, 3), { stadium: 3 })).ok, false);
  assert.equal(X.canPromote(mk(8, 40, 5)).ok, true);
});

test('finals rewards x league multipliers, Medals, TP lookup', () => {
  const a = X.finalsReward(mk(), 'semi');
  assert.deepEqual([a.econ.coins, a.econ.fans, a.econ.medals], [1400, 20, 1]);
  const b = X.finalsReward(mk(8, 40, 3), 'champ');
  assert.deepEqual([b.econ.coins, b.econ.fans, b.econ.medals], [1300 + 1200, 240, 4]);
  const c = X.finalsReward(mk(), 'runner');
  assert.deepEqual([c.econ.coins, c.econ.fans, c.econ.medals], [1550, 60, 2]);
  assert.deepEqual([X.finalsTp('semi'), X.finalsTp('runner'), X.finalsTp('champ')], [75, 200, 400]);
  assert.equal(X.finalsReward(mk(), 'nope').econ.coins, 1300);
});

test('late sinks: order, gates, reserve rule', () => {
  let s = ec(mk(), { stadium: 4, coins: 1e6, medals: 0 });
  const by = (id) => X.sinkOptions(s).find((o) => o.id === id);
  assert.equal(by('hall_2').ok, false); assert.match(by('hall_2').why, /first/);
  assert.equal(by('floodlights').ok, false);
  assert.equal(X.buySink(s, 'hall_2'), s);
  s = X.buySink(s, 'hall_1'); assert.equal(s.econ.coins, 1e6 - 700);
  assert.equal(by('hall_1').ok, false);
  assert.equal(by('hall_plaque').ok, false); // no retired player
  s.retired = [{ id: 'r1' }]; assert.equal(by('hall_plaque').why, 'Needs more Medals');
  s = ec(s, { medals: 3 }); s = X.buySink(s, 'hall_plaque'); assert.equal(s.econ.medals, 0); assert.equal(by('hall_plaque').ok, false);
  // reserve: coins just short of price + reserve
  const need = X.reserveNeeded(s);
  const tight = ec(s, { coins: 1400 + need - 1 });
  const hall2 = X.sinkOptions(tight).find((o) => o.id === 'hall_2');
  assert.equal(hall2.ok, true, 'reserve only warns'); assert.equal(hall2.warn, 'Leaves less than your safe reserve');
  assert.equal(X.buySink(tight, 'hall_2').econ.coins, tight.econ.coins - 1400, 'buy still goes through');
  assert.equal(X.sinkOptions(ec(s, { coins: 1400 + need })).find((o) => o.id === 'hall_2').warn, '');
  assert.equal(X.sinkOptions(ec(s, { coins: 1399 })).find((o) => o.id === 'hall_2').ok, false, 'coins still needed');
  assert.equal(X.reserveOk(tight, 1400), false);
  assert.equal(X.reserveOk(ec(s, { coins: 1400 + need }), 1400), true);
  // retreat once a season
  s = X.buySink(s, 'coach_retreat'); assert.equal(by('coach_retreat').ok, false);
  s.season = { league: 4, n: 2 }; assert.equal(by('coach_retreat').ok, true);
});

test('Medal shop', () => {
  let s = ec(mk(), { medals: 16 });
  const shop = X.medalShop(s);
  assert.deepEqual(shop.map((m) => m.medals), [1, 2, 3, 4, 6]);
  s = X.buyMedal(s, 'trophy_cabinet'); assert.equal(s.econ.medals, 15);
  assert.equal(X.buyMedal(s, 'trophy_cabinet'), s);
  s = X.buyMedal(s, 'wage_holiday'); assert.equal(s.econ.medals, 11);
  assert.equal(X.matchIncome(s, {}).wages, Math.round(X.matchIncome(mk(), {}).wages / 2));
  assert.equal(X.medalShop(s).find((m) => m.id === 'wage_holiday').ok, false);
  assert.equal(X.buyMedal(ec(mk(), { medals: 1 }), 'master_licence').econ.medals, 1);
});

test('Legacy Project: 8,000 L4 / 13,000 L5, +500 Fans, segments, gating', () => {
  const rich = (league, stadium, extra = {}) => ec(mk(8, 40, league), { stadium, coins: 1e6, sinks: { hall_1: 1, hall_2: 1, hall_3: 1, floodlights: 1, big_screen: 1, roof_crest: 1, ...extra } });
  let s = rich(4, 4);
  const o = X.legacyOffer(s);
  assert.equal(o.price, 8000); assert.equal(o.ok, true); assert.equal(o.fans, 500);
  const all6 = { hall_1: 1, hall_2: 1, hall_3: 1, floodlights: 1, big_screen: 1, roof_crest: 1 };
  assert.equal(X.legacyOffer(ec(mk(8, 40, 4), { stadium: 3, coins: 1e6, sinks: all6 })).ok, true, 'no Stadium 4 gate: only the six sinks');
  assert.equal(X.legacyOffer(ec(mk(8, 40, 4), { stadium: 5, coins: 1e6, sinks: { ...all6, roof_crest: 0 } })).ok, false);
  const poor = X.legacyOffer(ec(mk(8, 40, 4), { coins: 8001, sinks: all6 })); assert.equal(poor.ok, true); assert.equal(poor.warn, 'Leaves less than your safe reserve');
  assert.equal(X.legacyOffer(ec(mk(8, 40, 4), { coins: 7999, sinks: all6 })).ok, false);
  assert.equal(X.legacyOffer(ec(mk(8, 40, 4), { stadium: 4, coins: 1e6 })).ok, false); // halls not bought
  assert.equal(X.legacyOffer(rich(5, 5, { roof_crest: 0 })).ok, false); // finishing not bought
  const l5 = rich(5, 5, { floodlights: 1, big_screen: 1, roof_crest: 1 });
  assert.equal(X.legacyOffer(l5).price, 13000);
  s = X.buyLegacy(s); assert.equal(s.econ.coins, 1e6 - 8000); assert.equal(s.econ.fans, 500); assert.equal(s.econ.legacy, 1);
  assert.notEqual(X.legacyOffer(s).name, o.name);
  assert.equal(X.buyLegacy(ec(s, { coins: 100 })).econ.legacy, 1);
});

test('Fans bars', () => {
  let s = ec(mk(), { fans: 155 });
  let b = X.fansBars(s);
  assert.equal(b.crowd.fill, 0.5); assert.equal(b.crowd.next, 'Stadium 2'); assert.equal(b.showLegend, false);
  s = ec(mk(), { stadium: 3, fans: 2400 * 2 });
  b = X.fansBars(s); assert.equal(b.crowd.fill, 1); assert.equal(b.crowd.next, 'Stadium 4'); assert.equal(b.showLegend, true);
  s = ec(s, { legacy: 13 }); b = X.fansBars(s);
  assert.deepEqual([b.legend.tier, b.legend.segments], [1, 3]);
  assert.equal(X.fansBars(ec(mk(), { stadium: 5, fans: 9999 })).crowd.next, null);
});

test('transfer value examples; hidden = half the fee', () => {
  const v = (pot) => X.transferValue(P('x', 40, { potential: pot, drillsHere: 1 }));
  assert.deepEqual([100, 124, 150, 185].map(v), [534, 795, 1236, 1978]);
  const h = P('h', 40, { drillsHere: 0 });
  assert.equal(X.transferValue(h), Math.round(0.5 * 6 * 160));
});

test('course pay: price, factor, frozen in arrears', () => {
  const s = mk();
  assert.equal(X.courseCoins(s, 1), 30); assert.equal(X.courseCoins(s, 21), 150);
  assert.equal(X.courseCoins(mk(8, 40, 3), 11), Math.round(90 * 1.55));
  assert.equal(X.courseCoins(mk(8, 40, 5), 21), 375);
  assert.equal(X.payCourse(s, 30).econ.coins, 1270);
  assert.equal(X.payCourse(s, 99999), s);
  assert.equal(X.payCourse(ec(s, { arrears: 5 }), 30).econ.coins, 1300);
});

test('pure: inputs not mutated', () => {
  const s = mk(); const before = JSON.stringify(s);
  X.applyMatch(s, { win: true }); X.finalsReward(s, 'champ'); X.startBuild(s, 'gym'); X.payCourse(s, 5);
  assert.equal(JSON.stringify(s), before);
});

test('a tie gives half a win in Fans (finals multiplier as usual; stands not multiplied)', () => {
  const s = mk(8, 40, 1); const w = X.matchIncome(s, { win: true }).fans, l = X.matchIncome(s, { win: false }).fans, t = X.matchIncome(s, { tie: true }).fans;
  assert.equal(t, (w + l) / 2); assert.equal(t - 5, 25); // 5 = Stands 1
  const st = ec(s, { fac: { ...s.econ.fac, stands: 3 } });
  assert.equal(X.matchIncome(st, { tie: true }).fans, 25 + 15);
  const hi = mk(8, 40, 3); const m = (X.matchIncome(hi, { win: true }).fans - 5) / 40;
  assert.equal(X.matchIncome(hi, { tie: true }).fans, Math.round(25 * m) + 5);
});
