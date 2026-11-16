// wa1 slice B1 (core): Control on every wheel, Hype dial Control, tokens on all 8 wheels with cap rule F.
// Spec: 2026-11-14-wheel-all-spins SPEC s3/s5 + 02-HYPE-AND-REVEAL s1, s5, s6, s7; sim all_spins_sim.py.
import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { WM, NODES } from '../js/data/wheelmeta.js';
import { DR } from '../js/data/dialreel.js';
import { MD } from '../js/data/matchday.js';
import { makeRng } from '../js/core/rng.js';
import { wheelSlices, courseWheel, spinResult } from '../js/core/training.js';
import { metaOf, effective, metaWheel, afterResult, seasonTokens, tokenOptions, useToken, tokenValue, tokenLeft, matchKeyOf, TOKEN_WHEELS, metaReport } from '../js/core/wheelmeta.js';
import { hypeDial, dialResult, dialGuideX, dialLanding, revealWheel, revealResult, modsFor, neutralMods } from '../js/core/dialreel.js';

const fresh = () => ({ v: 7, seed: 'wa1', salt: 's', season: { n: 1 }, fixture: { kind: 'league', round: 1 }, wheelMeta: { tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {} }, wheelCraft: { owned: {} }, econ: { coins: 100, ledger: [] } });
const full = () => { const s = fresh(); for (const n of NODES) { if (n.branch === 'craft') s.wheelCraft.owned[n.id] = n.max_rank; else s.wheelMeta.owned[n.id] = n.max_rank; } s.wheelMeta.tally = 600; return s; };
const own = (ids) => { const s = fresh(); for (const [id, r] of Object.entries(ids)) s.wheelMeta.owned[id] = r; return s; };
const on = (f) => { const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true; try { return f(); } finally { FLAGS.wheelMeta = was; } };
const ODDS0 = [35, 35, 20, 10]; // tilt 0: Low, Med, High, Nuts (02 s5 HYPE_WIDTH)
const dialOf = (s) => hypeDial(ODDS0, modsFor(effective(s), 'hype'));
const withTokens = (s, t) => { s.wheelMeta.tokens = { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0, ...t }; return s; };

test('data: tokens on all 8 wheels, cap rule F, Control and Fortune token scopes widened', () => {
  assert.deepEqual(TOKEN_WHEELS, ['spot', 'course', 'hype', 'toss', 'pep', 'find', 'scout', 'finals']);
  assert.deepEqual(WM.TOKEN_CAP_WHEEL_SEASON, { spot: 2, course: null, hype: 2, toss: 2, pep: 2, find: 2, scout: 2, finals: 2 });
  assert.equal(WM.TOKEN_CAP_MATCH, 1); assert.deepEqual(WM.TOKEN_BELOW, { spot: 3, course: 2, hype: 5, toss: 5, pep: 2, scout: 2, finals: 30 });
  const by = Object.fromEntries(NODES.map((n) => [n.id, n]));
  for (const id of ['c_slow', 'c_steady', 'c_zone', 'c_chime', 'c_guide', 'f_respin', 'f_nudge', 'f_two', 'f_wild', 'f_lift']) assert.equal(by[id].effect.scope.length, 8, id);
  assert.deepEqual(by.f_floor.effect.scope, ['spot', 'course', 'hype', 'toss']);
  assert.ok(!/Spotlight|Course/.test(by.f_respin.words + by.f_two.words)); // node copy owned by core2
});

test('effective: Control on every wheel, feelOnly on toss/pep/scout/finals, Hype dial V/J/sd', () => on(() => {
  const E = effective(full());
  for (const w of TOKEN_WHEELS) {
    const X = E[w]; assert.ok(Math.abs(X.w0Mult - 0.55) < 1e-9, w); assert.ok(Math.abs(X.jMult - 0.7225) < 1e-9, w); // Steady 0.85^2 (CONTRACT-A sec 2; was 0.7 linear)
    assert.equal(X.guide, true); assert.ok(Math.abs(X.zone - 0.2) < 1e-9); assert.equal(X.chime, true);
    assert.equal(X.feelOnly, ['toss', 'pep', 'scout', 'finals'].includes(w), w);
  }
  for (const [r, v] of [[1, 13.6], [2, 11.2], [3, 8.8]]) assert.ok(Math.abs(effective(own({ c_slow: r })).hype.dial.V - v) < 1e-9);
  assert.ok(Math.abs(E.hype.dial.Jmult - 0.7225) < 1e-9); assert.ok(Math.abs(E.hype.dial.sdMult - 0.727) < 1e-9);
  const n = effective(fresh()); assert.equal(n.hype.dial.V, 16); assert.equal(n.find.w0Mult, 1); assert.equal(n.toss.guide, false);
  FLAGS.wheelMeta = false; const off = effective(full()); assert.equal(off.hype.w0Mult, 1); assert.equal(off.hype.dial.V, 16); assert.equal(off.find.zone, 0);
}));

test('hypeDial applies Control: V = 16 x w0Mult, J = 1.2 x Nuts width x jMult, sd x0.727; guide tick = landing without wobble', () => on(() => {
  const base = hypeDial(ODDS0), nm = hypeDial(ODDS0, neutralMods());
  assert.equal(base.V, 16); assert.equal(base.sd, DR.SD_AVG); assert.equal(base.guide, false); assert.deepEqual(base, nm);
  const d = hypeDial(ODDS0, modsFor(effective(own({ c_slow: 3, c_steady: 2, c_guide: 1 })), 'hype'));
  assert.ok(Math.abs(d.V - 8.8) < 1e-9); assert.ok(Math.abs(d.J - base.J * 0.7225) < 1e-9); assert.ok(Math.abs(d.sd - 0.11 * 0.727) < 1e-9); assert.equal(d.guide, true);
  for (const t of [0.9, 1.4, 2.2, 2.9]) { const phi = 3.3; assert.ok(Math.abs(dialGuideX(d, phi, t) - dialLanding(d, { t, phi, e: 0 }).x) < 1e-9); }
}));

function hypeAvg(s, n, seed) {
  const d = dialOf(s), rng = makeRng(seed); let pts = 0, nuts = 0;
  for (let i = 0; i < n; i++) { const r = dialResult(rng, d, true); pts += r.pts; nuts += r.level === 'nuts' || d.slices[r.index].gold ? 1 : 0; }
  return { pts: pts / n, nuts: nuts / n };
}
// WC: Big Voice (Hype width) became Warm Crowd (HIGH +6 pays +7, paid by the Warm Crowd perk, not counted here): full tree 6.98 -> 6.84.
test('PARITY Hype dial, avg careful: none 5.30, full tree 6.84 +-0.1, Nuts about 37% (bug if > 8.0 or Nuts > 50%)', () => on(() => {
  const z = hypeAvg(fresh(), 40000, 'hz'), f = hypeAvg(full(), 40000, 'hf');
  console.log('parity hype none', z.pts.toFixed(3), (z.nuts * 100).toFixed(1) + '%', '| full', f.pts.toFixed(3), (f.nuts * 100).toFixed(1) + '%');
  assert.ok(Math.abs(z.pts - 5.30) <= 0.1, 'none ' + z.pts); assert.ok(Math.abs(f.pts - 6.84) <= 0.1, 'full ' + f.pts);
  assert.ok(f.nuts > 0.35 && f.nuts < 0.45, 'nuts ' + f.nuts); assert.ok(f.pts < 8 && f.nuts < 0.5);
}));

test('caps: 2 a season per wheel (Course none), 1 a match day across hype/toss/pep, season reset, old spotTokensUsed', () => on(() => {
  let s = withTokens(full(), { respin: 9 }); s.wheelMeta.tokSeason = 1;
  const d = dialOf(s), low = { ...dialResult(makeRng('x'), d, { t: 1, phi: 0, e: 0 }), wheel: d };
  const lowP = { wheel: d, ...nonGold(d, 'low') }, ctxA = { matchKey: 'A' }, ctxB = { matchKey: 'B' };
  assert.ok(low); assert.ok(tokenOptions(s, 'hype', lowP, ctxA).some((o) => o.kind === 'respin'));
  let r = useToken(s, 'hype', 'respin', lowP, makeRng('r1'), true, ctxA); assert.notEqual(r.s, s);
  assert.deepEqual(metaOf(r.s).matchTokUsed, { key: 'A', n: 1 }); assert.equal(metaOf(r.s).tokUsed.hype, 1);
  const tw = revealWheel('toss', modsFor(effective(s), 'toss')), sport = { wheel: tw, ...revealOn(tw, 'sport') };
  assert.equal(tokenOptions(r.s, 'toss', sport, ctxA).length, 0, '1 a match day across hype/toss/pep');
  assert.ok(tokenOptions(r.s, 'toss', sport, ctxB).length > 0, 'next match day opens again');
  r = useToken(r.s, 'hype', 'respin', lowP, makeRng('r2'), true, ctxB); assert.equal(metaOf(r.s).tokUsed.hype, 2);
  assert.equal(tokenOptions(r.s, 'hype', lowP, { matchKey: 'C' }).length, 0, 'Hype: 2 a season');
  assert.deepEqual(tokenLeft(r.s, 'hype', { matchKey: 'C' }), { pool: 7, wheelLeft: 0, matchLeft: 1 });
  assert.equal(tokenLeft(r.s, 'course').wheelLeft, null); assert.equal(tokenLeft(r.s, 'scout').matchLeft, null);
  const cw = metaWheel(courseWheel(), 'course', s); let c = r.s;
  for (let i = 0; i < 4; i++) { const q = useToken(c, 'course', 'respin', { index: 1, gain: 1, jackpot: false, wheel: cw }, makeRng('c' + i)); assert.notEqual(q.s, c, 'Course uncapped'); c = q.s; }
  const s2 = seasonTokens({ ...r.s, season: { n: 2 } }); assert.deepEqual(metaOf(s2).tokUsed, {});
  const old = withTokens(full(), { respin: 3 }); old.wheelMeta.spotTokensUsed = 2; const sw = metaWheel(wheelSlices('normal'), 'spot', old);
  assert.equal(tokenOptions(old, 'spot', { index: 2, gain: 1, jackpot: false, wheel: sw }).length, 0, 'old save field still caps Spotlight');
  assert.equal(matchKeyOf(s), '1|league|1|s');
}));
function nonGold(d, level) { const i = d.slices.findIndex((c) => c.kind === level && !c.gold), c = d.slices[i], li = MD.HYPE_LEVELS.indexOf(c.level); return { index: i, level: c.level, levelIdx: li, pts: c.pts, perf: c.pts / 100, fanMult: MD.HYPE_FAN_MULT[li], boosted: false }; }
function revealOn(w, id) { const i = w.slices.findIndex((c) => c.id === id), c = w.slices[i]; return { index: i, id, label: c.label, fx: { ...c.fx }, boosted: false, slot: c.slot || null, slots: c.slot ? [c.slot] : [] }; }

test('guards: no token on gold, Nudge never onto gold/Nuts, Lift never above gold and never a Medal, offer only under TOKEN_BELOW', () => on(() => {
  const s = withTokens(full(), { respin: 2, nudge: 1, two: 1, wild: 1, lift: 1 }), d = dialOf(s), ctx = { matchKey: 'K' };
  const nutsI = d.slices.findIndex((c) => c.gold);
  assert.equal(tokenOptions(s, 'hype', { wheel: d, index: nutsI, level: 'nuts', pts: 10 }, ctx).length, 0, 'no token on Nuts');
  const high = nonGold(d, 'high'); assert.equal(tokenOptions(s, 'hype', { wheel: d, ...high }, ctx).filter((o) => o.kind !== 'lift').length, 0, 'High 6 >= 5: no re-spin');
  for (let i = 0; i < d.slices.length; i++) {
    if (d.slices[i].gold) continue; const c = d.slices[i], p = { wheel: d, index: i, level: c.level, pts: c.pts };
    const q = useToken(s, 'hype', 'nudge', p, makeRng('n' + i), true, ctx); if (q.s !== s) { assert.equal(d.slices[q.pending.index].gold, false); assert.ok(q.pending.pts > c.pts); assert.equal(Math.abs(q.pending.index - i), 1); }
    for (let k = 0; k < 20; k++) { const l = useToken(s, 'hype', 'lift', p, makeRng('l' + i + k), true, ctx); if (l.s !== s) { assert.ok(l.pending.pts >= c.pts && l.pending.pts <= Math.max(6, c.pts)); assert.equal(l.pending.lifted, true); } }
  }
  const fw = revealWheel('finals', modsFor(effective(s), 'finals'));
  for (const sl of fw.slices) { const p = { wheel: fw, ...revealOn(fw, sl.id) }; if (sl.gold) assert.equal(tokenOptions(s, 'finals', p).length, 0, 'no token on Medal / second gold ' + sl.id); }
  const tp = { wheel: fw, ...revealOn(fw, 'tp15') }; tp.fx.tp = 23; // Prize Pair paid
  for (let k = 0; k < 30; k++) { const l = useToken(s, 'finals', 'lift', tp, makeRng('fl' + k)); assert.equal(l.pending.fx.medal || 0, 0); assert.ok(l.pending.fx.coins <= 30); }
  for (let k = 0; k < 30; k++) { const n = useToken(s, 'finals', 'nudge', tp, makeRng('fn' + k)); if (n.s !== s) assert.equal(fw.slices[n.pending.index].gold, false); }
  const tw = revealWheel('toss', modsFor(effective(s), 'toss')), sp = { wheel: tw, ...revealOn(tw, 'sport') };
  const tn = useToken(s, 'toss', 'nudge', sp, makeRng('tn'), undefined, ctx); assert.equal(tn.pending.id, 'won'); assert.equal(tn.pending.fx.tossb, 5, 'Nudge on Toss allowed (sport -> won)');
  assert.equal(tokenOptions(s, 'toss', { wheel: tw, ...revealOn(tw, 'won') }, ctx).length, 0, 'won 5% is not under 5');
  const pw = revealWheel('pep', modsFor(effective(s), 'pep')), pp = { wheel: pw, ...revealOn(pw, 'slot3') }; pp.fx.pep = 1;
  let plus = 0; for (let k = 0; k < 200; k++) { const l = useToken(s, 'pep', 'lift', pp, makeRng('pl' + k), undefined, ctx); assert.ok(l.pending.slots.length <= 2 && l.pending.fx.pep === l.pending.slots.length); plus += l.pending.slots.length - 1; }
  assert.ok(plus > 25 && plus < 75, 'pep lift adds a player about 1 in 4: ' + plus);
  assert.equal(tokenOptions(s, 'pep', { wheel: pw, ...revealOn(pw, 'double') }, ctx).length, 0, 'no token on Double pep');
  const sw = revealWheel('scout', modsFor(effective(s), 'scout')), q1 = { wheel: sw, ...revealOn(sw, 'top1') };
  assert.ok(!tokenOptions(s, 'scout', q1).some((o) => o.kind === 'lift'), 'scout lift cap 1: a 1-step result is not lifted');
  for (let k = 0; k < 20; k++) { const r = useToken(s, 'scout', 'respin', q1, makeRng('sr' + k)); assert.ok(tokenValue('scout', r.pending) >= 1, 'keep the better'); }
}));

test('find: offered only when no find, never Lift; re-spin keeps the better; ctx.spin hook; Nudge onto a find block', () => on(() => {
  const s = withTokens(full(), { respin: 2, nudge: 1, lift: 1 });
  const cells = [0, 1, 0, 1, 0, 1].map((v, i) => ({ find: !!v, type: v ? ['coach', 'coins', 'player'][i >> 1] : null }));
  const fw = { slices: [0, 1, 0, 1, 0, 1], widths: [2.73, 0.6, 2.73, 0.6, 2.73, 0.6], cells, golds: [] };
  assert.equal(tokenOptions(s, 'find', { wheel: fw, index: 1, find: true }).length, 0);
  assert.deepEqual(tokenOptions(s, 'find', { wheel: fw, index: 0, find: false }).map((o) => o.kind), ['respin', 'nudge']);
  const n = useToken(s, 'find', 'nudge', { wheel: fw, index: 2, find: false }, makeRng('fn')); assert.equal(n.pending.find, true); assert.ok([1, 3].includes(n.pending.index));
  let hit = 0; for (let k = 0; k < 200; k++) { const r = useToken(s, 'find', 'respin', { wheel: fw, index: 0, find: false }, makeRng('fr' + k), false); assert.equal(r.pending.find, cells[r.pending.index].find); hit += r.pending.find ? 1 : 0; }
  assert.ok(hit > 10 && hit < 80, 'random re-spin finds about 18%: ' + hit);
  const h = useToken(s, 'find', 'respin', { wheel: fw, index: 0, find: false }, makeRng('h'), true, { spin: () => ({ index: 5, find: true, type: 'player', second: false }) });
  assert.equal(h.pending.index, 5); assert.equal(h.pending.type, 'player'); assert.deepEqual(h.pending.used, ['respin']); assert.equal(metaOf(h.s).tokUsed.find, 1);
}));

test('flag off: no offers, same state; Spotlight and Course offers unchanged (no TOKEN_BELOW gate)', () => {
  const s = withTokens(full(), { respin: 2 }), w = wheelSlices('normal');
  assert.deepEqual(tokenOptions(s, 'spot', { index: 2, gain: 1, jackpot: false, wheel: w }), []);
  const p = { index: 2, gain: 1, jackpot: false, wheel: w }; const r = useToken(s, 'spot', 'respin', p, makeRng('o')); assert.equal(r.s, s); assert.equal(r.pending, p);
  on(() => { const sw = metaWheel(wheelSlices('normal'), 'spot', s), i = sw.slices.findIndex((v, k) => v >= 3 && !sw.golds.includes(k));
    assert.ok(tokenOptions(s, 'spot', { index: i, gain: sw.slices[i], jackpot: false, wheel: sw }).some((o) => o.kind === 'respin'), 'Spotlight offers above 3 as before'); });
});

// ---- season sim (port of all_spins_sim.py season_loop + spin_wheel, rule F, avg careful) through the game code
// SPEC rings (wheels SPEC 3 / 4; T2 ships them): Spotlight slices are x multipliers, Course steps. SPEC rule: no "/ 1.5", ratio = value / own random.
const X1 = 7.4 / 7, P1 = 7.3 / 7;
const SPOT_RING = () => ({ slices: [3, 1, 1, 1.5, 1, 1, 1.2, 1, 1, 1], jackpotIndex: 0, widths: [1.2, X1, X1, 0.8, X1, X1, 0.6, X1, X1, X1] });
const COURSE_RING = () => ({ slices: [4, 1, 3, 1, 2, 1, 2, 1, 1, 1, 1], jackpotIndex: 0, widths: [1.2, P1, 0.8, P1, 0.35, P1, 0.35, P1, P1, P1, P1] });
const SPINS = { spot: 9.95, course: 1.33, hype: 9.95, toss: 9.95, pep: 9.95, scout: 1, finals: 0.6 };
function seasonRun(s0, seasons, seed, tokensOn = true) {
  const rng = makeRng(seed), R = {}; let s = s0;
  for (const w of ['spot', 'course', 'hype', 'toss', 'pep', 'scout', 'finals']) R[w] = { v: 0, n: 0, g: 0, tok: 0 };
  const E0 = effective(s), wheels = { spot: metaWheel(SPOT_RING(), 'spot', s), course: metaWheel(COURSE_RING(), 'course', s), hype: dialOf(s) };
  for (const w of ['toss', 'pep', 'scout', 'finals']) wheels[w] = revealWheel(w, modsFor(E0, w));
  for (let sn = 0; sn < seasons; sn++) {
    s = JSON.parse(JSON.stringify(s)); s.season = { n: sn + 1 }; s = seasonTokens(s); if (!tokensOn) s.wheelMeta.tokens = { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 };
    const cnt = {}, cw = [Math.floor(rng.random() * 10)]; if (rng.random() < 0.33) cw.push(Math.floor(rng.random() * 10));
    for (let wk = 0; wk < 10; wk++) {
      const seq = []; if (rng.random() < 0.995) seq.push('spot', 'hype', 'toss', 'pep');
      for (const c of cw) if (c === wk) seq.push('course'); if (wk === 0) seq.push('scout'); if (wk === 9 && rng.random() < 0.6) seq.push('finals');
      const ctx = { matchKey: `${sn}|${wk}` };
      for (const w of seq) {
        cnt[w] = (cnt[w] || 0) + 1; const wheel = wheels[w];
        let p;
        if (w === 'spot' || w === 'course') { const a = afterResult(s, w, spinResult(rng, wheel, true), rng, { wheel }); s = a.s; p = { ...a.result, wheel }; }
        else if (w === 'hype') p = { ...dialResult(rng, wheel, true), wheel }; else p = { ...revealResult(rng, wheel), wheel };
        const m = () => metaOf(s), tk = () => m().tokens, opt = (k) => tokenOptions(s, w, p, ctx).some((o) => o.kind === k);
        const use = (k) => { const q = useToken(s, w, k, p, rng, true, ctx); if (q.s !== s) R[w].tok++; s = q.s; p = q.pending; };
        const cap = WM.TOKEN_CAP_WHEEL_SEASON[w];
        if (tk().two > 0 && (cap == null || cnt[w] === 1) && opt('two')) use('two');
        if (tokenValue(w, p) < WM.TOKEN_BELOW[w]) { if (tk().respin > 0 || tk().wild > 0) { if (opt('respin')) use('respin'); } else if (opt('nudge')) use('nudge'); }
        const wait = Math.max(1, Math.round(SPINS[w])) - 1;
        if (tk().lift > 0 && (cap == null || cnt[w] - 1 >= wait) && opt('lift')) use('lift');
        const r = R[w]; r.v += tokenValue(w, p); r.n++; r.g += w === 'spot' || w === 'course' ? (p.jackpot ? 1 : 0) : (wheel.slices[p.index] && wheel.slices[p.index].gold ? 1 : 0);
      }
    }
  }
  const out = {}; for (const [w, r] of Object.entries(R)) out[w] = { v: r.v / r.n, g: r.g / r.n, tok: r.tok / seasons }; return out;
}
test('PARITY rule F season (avg careful, SPEC rings): Spotlight under 3.0x (SPEC 11c 2.52x), Course 3.76 (SPEC 11c), Hype 7.31, Toss 4.49, Pep +1-5%, Scout 1.52, Finals 36.95', () => on(() => {
  const F = seasonRun(full(), 1500, 'seasonF'), N = seasonRun(fresh(), 600, 'seasonN', false);
  const line = (o) => Object.entries(o).map(([w, r]) => `${w} ${r.v.toFixed(3)} g${(r.g * 100).toFixed(0)}% t${r.tok.toFixed(2)}`).join(' | ');
  console.log('season F   ', line(F)); console.log('season none', line(N));
  // was spot v / 1.5 = 2.54 +-0.06 and course 3.01 +-0.12 (old points wheel, W0 24 physics). Spotlight is a multiplier now: bug line < 3.0x (SPEC 11c);
  // its 2.52x needs T2's Spotlight perks in x units (Booster / Hot Streak / Lift still pay old points here).
  assert.ok(F.spot.v < 3.0 && F.spot.v > N.spot.v, 'spot ' + F.spot.v);
  assert.ok(Math.abs(F.course.v - 3.76) <= 0.12, 'course ' + F.course.v);
  assert.ok(Math.abs(F.hype.v - 7.31) <= 0.2 && F.hype.v < 8 && F.hype.g < 0.5, 'hype ' + F.hype.v);
  assert.ok(Math.abs(F.toss.v - 4.49) <= 0.25, 'toss ' + F.toss.v); // Pep: the game's w2 Pep reel pays 1.70 at full tree with no tokens (sim 1.908: older port gap, not tokens); token gain must be small (sim +1.5%)
  assert.ok(F.pep.v > 1.70 && F.pep.v < 1.80, 'pep ' + F.pep.v);
  assert.ok(Math.abs(F.scout.v - 1.52) <= 0.12, 'scout ' + F.scout.v); assert.ok(Math.abs(F.finals.v - 36.95) <= 2.5, 'finals ' + F.finals.v);
  for (const w of ['hype', 'toss', 'pep', 'scout', 'finals']) assert.ok(F[w].tok <= (w === 'finals' ? 1 : 2), w + ' cap');
}));

test('metaReport: Control, tokens per wheel this season, match cap, full-tree ratios', () => on(() => {
  const s = withTokens(full(), { respin: 2 }); s.wheelMeta.tokUsed = { hype: 1, spot: 2 }; s.wheelMeta.matchTokUsed = { key: matchKeyOf(s), n: 1 };
  const t = metaReport(s).join('\n');
  assert.match(t, /Hype dial: speed 8\.8/); assert.match(t, /hype 1\/2/); assert.match(t, /course 0[,;]/); assert.match(t, /match day 1\/1/); assert.match(t, /find x2\.06/);
}));
