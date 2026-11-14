import test from 'node:test'; import assert from 'node:assert/strict';
import { hypeDial, hypeDialFor, dialLanding, dialResult, findReel, reelLanding, reelResult, pityFind, revealWheel, revealResult, revealPlan, revealProgress, pepSteps,
  neutralMods, modsFor, modsFromSim, simFromRanks, sweepAt, newAim, clampStop, tri } from '../js/core/dialreel.js';
import { hypeOdds } from '../js/core/matchday.js';
import { ACT } from '../js/data/activities.js';
import { makeRng } from '../js/core/rng.js';

const ODDS = { 0: hypeOdds(0, []), 0.12: hypeOdds(4000, []), 0.2: hypeOdds(4000, [0.15]) };
const KEYS = ['low', 'med', 'high', 'nuts'], PTS = { low: 2, med: 4, high: 6, nuts: 10 };
const runDial = (odds, stop, N, seed, mods) => { const dial = hypeDial(odds, mods), rng = makeRng(seed), c = { low: 0, med: 0, high: 0, nuts: 0 }; let m = 0; for (let i = 0; i < N; i++) { const r = dialResult(rng, dial, stop); c[r.level]++; m += r.pts; } return { c, mean: m / N }; };
const act = (id) => ACT.TABLE.find((a) => a.id === id);
const runReel = (a, stop, N, seed, mods) => { const reel = findReel(a, mods), rng = makeRng(seed), c = {}; let f = 0; for (let i = 0; i < N; i++) { const r = reelResult(rng, reel, stop); if (r.find) { f++; c[r.type] = (c[r.type] || 0) + 1; } } return { find: f / N, c, n: f }; };

test('dial: slices are the odds, order med/low/nuts/high, fills the 10-unit arc, J = 1.2 x nuts', () => {
  for (const t of [0, 0.12, 0.2]) {
    const { odds } = ODDS[t], d = hypeDial(odds);
    assert.deepEqual(d.slices.map((s) => s.kind), ['med', 'low', 'nuts', 'high']);
    assert.ok(Math.abs(d.slices.at(-1).b - 10) < 1e-9);
    d.slices.forEach((s) => assert.ok(Math.abs(s.w - odds[KEYS.indexOf(s.kind)] / 10) < 1e-9));
    assert.ok(Math.abs(d.J - 1.2 * d.slices[2].w) < 1e-9);
  }
  const d0 = hypeDial(ODDS[0].odds); assert.ok(Math.abs(d0.slices[2].w - 1) < 1e-9 && Math.abs(d0.J - 1.2) < 1e-9);
});
test('dial: random tapper lands within 0.5 point of the odds (tilt 0, 0.12, 0.2)', () => {
  for (const t of [0, 0.12, 0.2]) {
    const { odds } = ODDS[t], r = runDial(odds, false, 100000, 'dial-r' + t);
    KEYS.forEach((k, i) => assert.ok(Math.abs(r.c[k] / 1000 - odds[i]) < 0.5, `t${t} ${k} ${r.c[k] / 1000} vs ${odds[i]}`));
  }
});
test('dial: average careful Hype 5.30 +-0.15 at tilt 0; Med almost never; nuts about 21%', () => {
  const r = runDial(ODDS[0].odds, true, 40000, 'dial-c');
  assert.ok(Math.abs(r.mean - 5.3) < 0.15, 'mean ' + r.mean);
  assert.ok(r.c.med / 40000 < 0.04, 'med ' + r.c.med / 40000); assert.ok(Math.abs(r.c.nuts / 400 - 21.3) < 2, 'nuts ' + r.c.nuts / 400);
  const r2 = runDial(ODDS[0.2].odds, true, 40000, 'dial-c2'); assert.ok(r2.mean > r.mean, 'careful lift holds at tilt 0.2');
});
test('dial: STOP maths: landing = phi + V t + V G/3 + e folded; clamp 0.8..3.0; frame helper ends on the landing', () => {
  const d = hypeDial(ODDS[0].odds), stop = { t: 1.7, phi: 3.3, e: 0.4 };
  const L = dialLanding(d, stop); assert.ok(Math.abs(L.q - (3.3 + 16 * 1.7 + 16 * 0.5 / 3 + 0.4)) < 1e-9);
  assert.ok(Math.abs(L.x - tri(L.q, 10)) < 1e-9);
  assert.equal(clampStop(0.1), 0.8); assert.equal(clampStop(9), 3);
  assert.equal(dialLanding(d, { t: 0.1, phi: 0, e: 0 }).t, 0.8);
  assert.equal(dialLanding(d, { t: 1, phi: 0, e: 99 }).e, d.J);
  const end = sweepAt(d, stop.phi, stop.t + 0.5, stop); assert.ok(end.done && Math.abs(end.q - L.q) < 1e-9 && Math.abs(end.x - L.x) < 1e-9);
  const mid = sweepAt(d, stop.phi, stop.t + 0.25, stop); assert.ok(!mid.done && mid.glide === 0.5);
  assert.ok(Math.abs(sweepAt(d, 2, 0.5).q - (2 + 8)) < 1e-9);
});
test('dial and reel: determinism, fixed draw counts, stop objects keep the rng in step', () => {
  const d = hypeDial(ODDS[0].odds), a = makeRng('x'), b = makeRng('x');
  for (let i = 0; i < 50; i++) assert.deepEqual(dialResult(a, d, true), dialResult(b, d, true));
  const r1 = makeRng('y'), r2 = makeRng('y'); dialResult(r1, d, false); dialResult(r2, d, { t: 2 }); assert.equal(r1.random(), r2.random());
  const reel = findReel(act('sixhit')), q1 = makeRng('z'), q2 = makeRng('z'); reelResult(q1, reel, true); reelResult(q2, reel, { t: 2, phi: 1, e: 0 }); assert.equal(q1.random(), q2.random());
  const w = revealWheel('scout'), s1 = makeRng('s'), s2 = makeRng('s'); revealResult(s1, w); revealResult(s2, w); assert.equal(s1.random(), s2.random());
  const aim = newAim(makeRng('aim'), d); assert.ok(aim.phi >= 0 && aim.phi < 20 && Math.abs(aim.e) <= d.J);
});
test('reel: layout N F N F N F N F, find total = Find%, order Coach/Coins/Player, largest share halved', () => {
  const r = findReel(act('sixhit'));
  assert.equal(r.cells.length, 8); assert.deepEqual(r.cells.map((c) => c.find), [false, true, false, true, false, true, false, true]);
  assert.deepEqual(r.cells.filter((c) => c.find).map((c) => c.type), ['coach', 'coins', 'player', 'player']);
  const fw = r.cells.filter((c) => c.find).map((c) => c.w); assert.ok(Math.abs(fw.reduce((x, y) => x + y) - 0.22 * 12) < 1e-9);
  assert.ok(Math.abs(r.cells.at(-1).b - 12) < 1e-9);
  const st = findReel(act('street')); assert.equal(st.cells.filter((c) => c.find).length, 4); assert.ok(Math.abs(Math.min(...st.cells.filter((c) => c.find).map((c) => c.w)) - 0.19) < 0.01);
  for (const a of ACT.TABLE) assert.equal(findReel(a).cells.filter((c) => c.find).length, 4, a.id);
});
test('reel: random tapper = Find % in every activity (+-0.8 point)', () => {
  for (const a of ACT.TABLE) { const r = runReel(a, false, 30000, 'rr' + a.id); assert.ok(Math.abs(r.find * 100 - a.find) < 0.8, `${a.id} ${r.find * 100} vs ${a.find}`); }
});
test('reel: average careful Six-Hit 28.4 +-1, Street 10.6 +-1; type mix stays the spec mix', () => {
  const six = runReel(act('sixhit'), true, 40000, 'rc6'), st = runReel(act('street'), true, 40000, 'rc1');
  assert.ok(Math.abs(six.find * 100 - 28.4) < 1, 'six ' + six.find * 100); assert.ok(Math.abs(st.find * 100 - 10.6) < 1, 'street ' + st.find * 100);
  const share = (k) => six.c[k] / six.n * 100; assert.ok(Math.abs(share('player') - 40) < 4 && Math.abs(share('coach') - 20) < 4 && Math.abs(share('coins') - 40) < 4, JSON.stringify(six.c));
});
test('reel: landing formula, cell under the line, pity find only finds, offset folds into 0..C', () => {
  const r = findReel(act('banner')), L = reelLanding(r, { t: 2, phi: 5, e: -0.3 });
  assert.ok(Math.abs(L.q - (5 + 14 + 7 * 0.5 / 3 - 0.3)) < 1e-9); assert.ok(L.x >= 0 && L.x < 12); assert.ok(r.cells[L.index].a <= L.x && L.x < r.cells[L.index].b);
  const rng = makeRng('pity'); for (let i = 0; i < 200; i++) assert.ok(['coins', 'player', 'coach'].includes(pityFind(rng, r).type));
  const s = sweepAt(r, 5, 2.5, { t: 2, e: -0.3 }); assert.ok(s.done && Math.abs(s.x - L.x) < 1e-9);
});
test('tree effects: Big Voice/Widener widen nuts, Home Crowd Low pays Medium, Kind Floor +1, Extra Gold adds a second nuts', () => {
  const base = hypeDial(ODDS[0].odds);
  const full = hypeDial(ODDS[0].odds, modsFromSim(simFromRanks({ sp_hyp_n: 2, f_wide: 3 }), 'hype'));
  assert.ok(full.slices[2].w > base.slices[2].w * 1.15);
  const hc = hypeDial(ODDS[0].odds, modsFromSim(simFromRanks({ sp_hyp_r: 1 }), 'hype')); assert.equal(hc.slices[1].pts, 4); assert.equal(hc.slices[1].level, 'med');
  const kf = hypeDial(ODDS[0].odds, modsFromSim(simFromRanks({ f_floor: 1 }), 'hype')); assert.equal(kf.slices[1].pts, 3); assert.equal(kf.slices[1].level, 'low');
  const ex = hypeDial(ODDS[0].odds, modsFromSim(simFromRanks({ f_extra: 1 }), 'hype')); assert.equal(ex.slices.length, 5); assert.equal(ex.slices.filter((s) => s.kind === 'nuts').length, 2);
  assert.ok(Math.abs(ex.slices.at(-1).b - 10) < 1e-9);
  const m = modsFromSim(simFromRanks({ f_boost: 3, f_bigb: 2 }), 'hype'); assert.ok(m.bch > 0.59 && m.bval === 3);
  const rm = runDial(ODDS[0].odds, false, 20000, 'tree', modsFromSim(simFromRanks({ sp_hyp_n: 2, f_wide: 3, sp_hyp_r: 1, f_floor: 1, f_boost: 3, f_bigb: 2, f_extra: 1 }), 'hype'));
  assert.ok(rm.mean > 4.3 + 0.8, 'full tree random hype ' + rm.mean); // sim: 3.89 -> 5.18 on the old wheel
  const fr = findReel(act('sixhit'), modsFromSim(simFromRanks({ sp_fnd_n: 2, f_extra: 1, f_wide: 3 }), 'find'));
  assert.ok(fr.cells.filter((c) => c.find).reduce((x, c) => x + c.w, 0) / 12 > 0.22 + 0.05);
  assert.ok(runReel(act('sixhit'), false, 20000, 'trf', modsFromSim(simFromRanks({ sp_fnd_n: 2, f_extra: 1, sp_fnd_r: 1 }), 'find')).find > 0.40);
  assert.deepEqual(modsFor(null, 'hype'), neutralMods()); assert.equal(modsFor(simFromRanks({ f_extra: 1 }), 'toss').extra, 0);
});
test('reveal wheels: slices from uses.json, tree applied, honest by width', () => {
  assert.equal(revealWheel('toss').slices.length, 6); assert.equal(revealWheel('pep').slices.length, 7); assert.equal(revealWheel('scout').slices.length, 10); assert.equal(revealWheel('finals').slices.length, 9);
  assert.ok(Math.abs(revealWheel('finals').total - 8.75) < 1e-9);
  const tally = (kind, mods, N, seed) => { const w = revealWheel(kind, mods), rng = makeRng(seed), c = {}; for (let i = 0; i < N; i++) { const r = revealResult(rng, w); c[r.id] = (c[r.id] || 0) + 1; } return { c, w }; };
  const t = tally('toss', neutralMods(), 30000, 't'); assert.ok(Math.abs(t.c.won / 300 - 50) < 1.5);
  const t2 = tally('toss', modsFromSim(simFromRanks({ sp_tos_n: 2 }), 'toss'), 30000, 't2'); assert.ok(Math.abs(t2.c.won / 300 - 54.5) < 1.5, 'coin weight ' + t2.c.won / 300);
  const f = tally('finals', neutralMods(), 30000, 'f'); assert.ok(Math.abs(f.c.medal / 300 - 100 * 0.35 / 8.75) < 0.5);
  const fp = revealWheel('finals', modsFromSim(simFromRanks({ sp_fin_r: 1, f_extra: 1 }), 'finals')); assert.equal(fp.slices.length, 10);
  assert.ok(fp.slices.some((s) => s.id === 'coins40' && !s.fx.medal));
  const rng = makeRng('pp'); for (let i = 0; i < 300; i++) { const r = revealResult(rng, fp); assert.ok(!(r.fx.medal && r.fx.coins), 'medal never boosted'); if (r.id === 'coins30') assert.equal(r.fx.coins, 45); if (r.id === 'tp15') assert.equal(r.fx.tp, 23); }
  assert.equal(revealWheel('scout', modsFromSim(simFromRanks({ sp_sct_r: 1 }), 'scout')).slices.find((s) => s.id === 'extra').fx.steps, 1);
  assert.equal(revealWheel('scout').slices.find((s) => s.id === 'extra').fx.steps, 0);
  const pw = revealWheel('pep', modsFromSim(simFromRanks({ sp_pep_r: 1 }), 'pep')); const pr = makeRng('pep'); let pn = 0; for (let i = 0; i < 20000; i++) pn += revealResult(pr, pw).fx.pep;
  assert.ok(Math.abs(pn / 20000 - 1.5) < 0.12, 'pep rally mean ' + pn / 20000 + ' (1.06 x 1.5 about 1.6)');
});
test('revealPlan: 2.5 s Toss/Pep, 3 s Scout/Finals; progress ramps 0..1 and never goes backwards', () => {
  assert.equal(revealPlan('toss', 0).seconds, 2.5); assert.equal(revealPlan('pep', 2).seconds, 2.5); assert.equal(revealPlan('scout', 3).seconds, 3); assert.equal(revealPlan('finals', 1).seconds, 3);
  assert.equal(revealPlan('toss', 0).widget, 'reel'); assert.equal(revealPlan('finals', 0).widget, 'dial'); assert.equal(revealPlan('toss', 0).turns, 3); assert.equal(revealPlan('toss', 1).turns, 3.5);
  for (const k of ['toss', 'pep', 'scout', 'finals']) { const p = revealPlan(k, 0); assert.ok(Math.abs(p.up + p.cruise + p.ease - p.seconds) < 1e-9); assert.equal(revealProgress(p, 0), 0); assert.equal(revealProgress(p, p.seconds), 1); let prev = 0; for (let i = 1; i <= 100; i++) { const v = revealProgress(p, p.seconds * i / 100); assert.ok(v >= prev - 1e-12); prev = v; } }
  const st = pepSteps(2, 2.5); assert.equal(st.length, 8); assert.equal(st.at(-1).light, 2); assert.ok(Math.abs(st.at(-1).end - 2.5) < 1e-9); assert.ok(st[0].end - st[0].at < st.at(-1).end - st.at(-1).at);
  assert.equal(pepSteps(0).length, 6); assert.equal(pepSteps(5).at(-1).light, 5);
  assert.throws(() => revealPlan('nope'));
});
test('adapter: modsFor(effective(s)) equals the sim-style mods for the same owned ranks', async () => {
  const { FLAGS } = await import('../js/data/flags.js'), { effective } = await import('../js/core/wheelmeta.js'), was = FLAGS.wheelMeta; FLAGS.wheelMeta = true;
  try {
    const own = { sp_hyp_n: 2, sp_hyp_r: 1, sp_tos_n: 2, sp_tos_r: 1, sp_pep_n: 2, sp_pep_r: 1, sp_fnd_n: 2, sp_fnd_r: 1, sp_sct_n: 1, sp_sct_r: 1, sp_fin_n: 1, sp_fin_r: 1, f_wide: 3, f_boost: 3, f_bigb: 2, f_extra: 1, f_floor: 1 };
    const eff = effective({ wheelMeta: { owned: own, tally: 0 } }), E = simFromRanks(own);
    for (const w of ['hype', 'toss', 'pep', 'find', 'scout', 'finals']) {
      const a = modsFor(eff, w), b = modsFromSim(E, w);
      for (const k of Object.keys(b)) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${w}.${k} ${a[k]} vs ${b[k]}`);
    }
  } finally { FLAGS.wheelMeta = was; }
});
