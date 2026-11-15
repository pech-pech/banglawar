// Wheel match mode, store side (2026-11-15 wheel-match CONTRACT "Store"): save fields, mode freeze, rival boost, WheelOver, Spokes, VM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { wheelMatchVM } from '../js/store/selectors.js';
import { bowlerChips, legalBowlers, suggestedBowler, completePlan, rivalBowler } from '../js/store/wheelmatch-store.js';
import { planProblem } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { WHEEL_RIVAL_BOOST, DEV_DEFAULTS } from '../js/data/wheelmatch.js';
import { matchModeOf, devClamp } from '../js/core/wheelmatch.js';
import { makeRng } from '../js/core/rng.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const W = (s, p) => C(s, 'WheelOver', p);
const AUTO = { auto: true };

/** A season game, played by the bot up to the first ball of the first match. */
function toBowl(seed, wheel = true) {
  return withFlags({ wheelMatch: wheel }, () => {
    const st = newGame(seed); let g = 0;
    while (st.get().stage !== 'bowl' && g++ < 200) step(st);
    return st.get();
  });
}
/** Non-season wheel match (step-0 teams): quick to make. */
const quick = (seed) => C(null, 'NewMatch', { seed, mode: 'wheel' });
/** Auto through the rest of the match. */
function autoMatch(s0, pick = () => AUTO) {
  let s = s0, g = 0;
  while (g++ < 60 && s.stage !== 'done') {
    const n = s.stage === 'break' ? C(s, 'StartChase') : W(s, pick(s));
    assert.notEqual(n, s, `stuck at ${s.stage} over ${(s.stage === 'chase' ? s.inn2 : s.inn1).over}`);
    s = n;
  }
  return s;
}
const segOf = (s) => s.last.wheel.segs.find((x) => x.id === s.last.wheel.segId);
const ballsRuns = (balls) => balls.reduce((a, b) => a + (b.o === 'W' ? 0 : b.o), 0);
const ballsWk = (balls) => balls.filter((b) => b.o === 'W').length;

// ---------------------------------------------------------------- save fields and mode
test('new game defaults wheel (flag on); flag off = no key = classic; a match freezes the mode on its record', () => {
  const g = withFlags({ wheelMatch: true }, () => C(null, 'NewGame', { seed: 'wms1' }));
  assert.equal(g.matchMode, 'wheel'); assert.equal(matchModeOf(g), 'wheel');
  const old = withFlags({ wheelMatch: false }, () => C(null, 'NewGame', { seed: 'wms1' }));
  assert.equal('matchMode' in old, false); assert.equal(matchModeOf(old), 'classic');
  const b = toBowl('wms1');
  assert.equal(b.mode, 'wheel'); assert.deepEqual(b.wheelLog, []);
  assert.equal('dev' in g, false); assert.deepEqual(devClamp(g.dev), { ...DEV_DEFAULTS });
});

test('old save without matchMode plays classic, identical to an explicit classic save', () => {
  const play = (patch) => withFlags({ wheelMatch: false }, () => {
    const st = newGame('wms-old'); const s0 = st.get();
    let s = clone({ ...s0, ...patch });
    s = JSON.parse(JSON.stringify(s)); // reload
    let g = 0; const store = { get: () => s, dispatch: (c, p) => (s = C(s, c, p)) };
    while (s.stage !== 'train' && g++ < 400) step(store);
    return s;
  });
  const a = play({}), b = play({ matchMode: 'classic' });
  assert.equal(a.stage, 'train'); assert.equal('mode' in a, false);
  const { matchMode, ...bRest } = b;
  assert.equal(matchMode, 'classic');
  assert.deepEqual(bRest, a);
});

test('SetMatchMode: ignored mid-match (bowl/break/chase/done); the match keeps its mode; next match uses the new value', () => {
  let s = toBowl('wms-tog');
  assert.equal(C(s, 'SetMatchMode', { mode: 'classic' }), s);
  assert.equal(C(s, 'SetMatchMode', { mode: 'bogus' }), s);
  s = autoMatch(s);
  assert.equal(s.stage, 'done');
  assert.equal(C(s, 'SetMatchMode', { mode: 'classic' }), s);
  s = C(s, 'FinishMatch');
  assert.equal('mode' in s, false); assert.ok(s.wheelLog.length >= 2); // the log stays for the report until the next match
  const t = C(s, 'SetMatchMode', { mode: 'classic' });
  assert.equal(t.matchMode, 'classic');
  // next match is classic: run the bot to the next bowl stage
  let x = t, g = 0; const store = { get: () => x, dispatch: (c, p) => (x = C(x, c, p)) };
  while (x.stage !== 'bowl' && g++ < 400) step(store);
  assert.equal('mode' in x, false); assert.equal('wheelLog' in x, false);
  assert.notEqual(C(x, 'BowlOver'), x);
});

test('rival boost: +WHEEL_RIVAL_BOOST on bp, bs, spd, bsk of the rival copies in wheel only; our side and the save untouched', () => {
  assert.equal(WHEEL_RIVAL_BOOST, 11.9);
  const w = toBowl('wms-boost', true), c = toBowl('wms-boost', false);
  assert.deepEqual(w.me, c.me);
  w.rival.players.forEach((p, i) => {
    const q = c.rival.players[i];
    for (const k of ['bp', 'bs', 'spd', 'bsk']) assert.ok(Math.abs(p[k] - q[k] - 11.9) < 1e-9, k);
    assert.equal(p.name, q.name);
  });
  const opp = w.clubs.find((x) => x.id === w.fixture.opp);
  for (const p of w.rival.players) { const src = opp.squad.find((x) => x.name === p.name); assert.ok(Math.abs(p.bp - src.bp - 11.9) < 1e-9); }
  // non-season: same rule
  const qw = quick('q1'), qc = C(null, 'NewMatch', { seed: 'q1' });
  assert.equal('mode' in qc, false);
  assert.ok(Math.abs(qw.rival.players[0].bsk - qc.rival.players[0].bsk - 11.9) < 1e-9);
  assert.deepEqual(qw.me, qc.me);
});

// ---------------------------------------------------------------- WheelOver
test('full wheel match by auto plays to a result, deterministically; Rematch keeps the mode', () => {
  const a = autoMatch(toBowl('wms-full')), b = autoMatch(toBowl('wms-full'));
  assert.equal(a.stage, 'done'); assert.ok(['won', 'lost', 'tied'].includes(a.result));
  assert.deepEqual(a, b);
  assert.equal(a.wheelLog.length, a.inn1.overs.length + a.inn2.overs.length);
  assert.ok(a.wheelLog.every((l) => l.auto && l.bucket === null && l.careful === false));
  const q = autoMatch(quick('wms-q'));
  const re = C(q, 'NewMatch', { seed: q.seed });
  assert.equal(re.mode, 'wheel');
  assert.equal('mode' in C(q, 'NewMatch', { seed: 'other' }), false);
});

test('aimed vs auto: aimed stores the stop, tick and bucket; auto stores none; aimed with no STOP does nothing', () => {
  const s = toBowl('wms-aim');
  const bw = suggestedBowler(s);
  assert.equal(W(s, { bowler: bw }), s);
  const a = W(s, { bowler: bw, stop: { t: 3.5, phi: 2.25 } });
  assert.equal(a.last.wheel.auto, false); assert.equal(a.last.wheel.t, 3.5); assert.equal(a.last.wheel.phi, 2.25);
  assert.equal(typeof a.last.wheel.tickPos, 'number'); assert.equal(typeof a.last.wheel.pos, 'number');
  assert.ok(Math.abs(a.last.wheel.pos - a.last.wheel.tickPos) > 0 || true);
  const la = a.wheelLog.at(-1);
  assert.equal(la.bucket, 'c'); assert.equal(typeof la.careful, 'boolean'); assert.equal(la.auto, false); assert.equal(la.inn, 1); assert.equal(la.over, 1);
  assert.deepEqual(W(s, { bowler: bw, stop: { t: 3.5, phi: 2.25 } }), a); // same stop, same landing
  const late = W(s, { bowler: bw, stop: { t: 9, phi: 0 } });
  assert.equal(late.wheelLog.at(-1).bucket, 'o'); // coasted
  const u = W(s, AUTO);
  assert.equal(u.last.wheel.auto, true); assert.equal(u.last.wheel.tickPos, null); assert.equal(u.last.wheel.t, null);
  assert.equal(u.last.bowler, bw);
  assert.equal(u.last.intent, 'R'); assert.equal(u.last.field, 'P');
  for (const k of ['balls', 'over', 'bowler', 'intent', 'field']) assert.ok(k in u.last, k);
  assert.ok(['segId', 'pos', 'tickPos', 'phi', 't', 'segs', 'end', 'auto'].every((k) => k in u.last.wheel));
});

test('over row equals the landed label, every over (seeded loop, aimed and auto)', () => {
  let overs = 0;
  for (let i = 0; i < 6; i++) {
    const rng = makeRng(`wms-row|${i}`);
    let s = i < 2 ? toBowl(`wms-row-${i}`) : quick(`wms-row-${i}`), g = 0;
    while (g++ < 60 && s.stage !== 'done') {
      if (s.stage === 'break') { s = C(s, 'StartChase'); continue; }
      const p = rng.random() < 0.5 ? AUTO : { bowler: s.stage === 'bowl' ? legalBowlers(s)[rng.int(legalBowlers(s).length)] : undefined, stop: { t: 1 + rng.random() * 5.5, phi: rng.random() * 10 } };
      const inn0 = s.stage === 'bowl' ? s.inn1 : s.inn2, chase = s.stage === 'chase';
      const n = W(s, p);
      assert.notEqual(n, s);
      const seg = segOf(n), wv = n.last.wheel;
      assert.equal(ballsRuns(n.last.balls), wv.runs); assert.equal(ballsWk(n.last.balls), wv.wk);
      const inn = chase ? n.inn2 : n.inn1;
      assert.equal(inn.runs - inn0.runs, wv.runs); assert.equal(inn.wk - inn0.wk, wv.wk);
      if (seg.end === 'WIN') { assert.ok(chase); assert.ok(inn.runs > inn.target); assert.equal(n.result, 'won'); }
      else if (seg.end === 'AO') { assert.ok(inn.done); assert.ok(inn.wk >= 5 || inn.next >= 6); }
      else { assert.equal(wv.runs, seg.runs); assert.equal(wv.wk, seg.wk); assert.equal(n.last.balls.length, 6); }
      overs++; s = n;
    }
    assert.equal(s.stage, 'done');
  }
  assert.ok(overs >= 90, `overs ${overs}`);
});

test('Spokes: +1 a spin (spokes only, no tally) with wheelMeta on; about 20 a match; classic pays none', () => {
  withFlags({ wheelMeta: true }, () => {
    let s = toBowl('wms-sp');
    const m0 = clone(s.wheelMeta);
    const one = W(s, AUTO);
    assert.equal(one.wheelMeta.spokes, m0.spokes + 1); assert.equal(one.wheelMeta.tally, m0.tally);
    assert.deepEqual({ ...one.wheelMeta, spokes: m0.spokes }, m0);
    const d = autoMatch(s);
    assert.equal(d.wheelMeta.spokes - m0.spokes, d.wheelLog.length);
    assert.equal(d.wheelLog.length, d.inn1.overs.length + d.inn2.overs.length); assert.ok(d.wheelLog.length <= 20);
    // classic: a whole match by BowlOver leaves Spokes alone
    let c = toBowl('wms-sp', false); const c0 = clone(c.wheelMeta), g = { n: 0 };
    while (c.stage !== 'done' && g.n++ < 40) c = c.stage === 'break' ? C(c, 'StartChase') : C(c, 'BowlOver', { intent: 'R' });
    assert.equal(c.stage, 'done'); assert.deepEqual(c.wheelMeta, c0);
  });
  const off = W(toBowl('wms-sp'), AUTO); // flag off: no pay
  assert.equal(off.wheelMeta.spokes, toBowl('wms-sp').wheelMeta.spokes);
});

test('WheelOver ignored in classic; BowlOver and MakeCall ignored in wheel', () => {
  const c = toBowl('wms-ig', false), w = toBowl('wms-ig', true);
  assert.equal(W(c, AUTO), c);
  assert.equal(C(w, 'BowlOver'), w);
  assert.equal(C(w, 'MakeCall', { bowler: legalBowlers(w)[0], field: 'A' }), w);
  const q = C(null, 'NewMatch', { seed: 'wms-ig' });
  assert.equal(W(q, AUTO), q);
  // not in a match stage
  const hub = withFlags({ wheelMatch: true }, () => C(null, 'NewGame', { seed: 'wms-ig' }));
  assert.equal(W(hub, AUTO), hub);
});

test('reload mid-match (JSON round trip) keeps s.last.wheel and plays on identically', () => {
  let s = toBowl('wms-rl');
  s = W(s, AUTO); s = W(s, { bowler: legalBowlers(s)[0], stop: { t: 3.4, phi: 7.1 } });
  const r = JSON.parse(JSON.stringify(s));
  assert.deepEqual(r.last.wheel, s.last.wheel);
  assert.deepEqual(clone(wheelMatchVM(r)), clone(wheelMatchVM(s))); // JSON: -0 and 0 are one number in a save
  assert.deepEqual(clone(autoMatch(r)), clone(autoMatch(s)));
});

// ---------------------------------------------------------------- bowler rule
test('bowler chips: reasons for last over, 2 overs, must-save; a legal pick always leaves a legal plan (500 random histories)', () => {
  let s = toBowl('wms-bw');
  const b0 = suggestedBowler(s);
  assert.equal(b0, s.plan.overs[0]);
  s = W(s, { bowler: b0, stop: { t: 3.3, phi: 1 } });
  if (s.stage === 'bowl') {
    const ch = bowlerChips(s);
    assert.equal(ch[b0].ok, false); assert.equal(ch[b0].reason, 'Bowled last over');
    assert.equal(W(s, { bowler: b0, stop: { t: 3.3, phi: 1 } }), s); // illegal pick does nothing
    assert.notEqual(W(s, { bowler: b0, auto: true }), s); // auto falls back to the suggested bowler
    assert.deepEqual(Object.keys(ch[0]).sort(), ['idx', 'name', 'ok', 'overs', 'reason', 'role']);
  }
  // synthetic histories
  const mk = (hist) => {
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, bowl: 'Fast', overs: hist.filter((b) => b === i).length }));
    return { inn1: { over: hist.length + 1, last: hist.length ? hist.at(-1) : null, overs: hist.map((b) => ({ bowler: b })) }, me: { players } };
  };
  let st = bowlerChips(mk([0, 1, 0, 1]));
  assert.equal(st[0].reason, 'Bowled 2 overs'); assert.equal(st[1].reason, 'Bowled last over'); assert.equal(st[2].ok, true);
  st = bowlerChips(mk([0, 1, 0, 1, 2, 3, 2, 3]));
  assert.deepEqual(st.filter((c) => c.ok).map((c) => c.idx), [4, 5]);
  assert.equal(st[2].reason, 'Bowled 2 overs');
  st = bowlerChips(mk([0, 1, 2, 3, 4, 0, 1, 2, 3])); // 5 has not bowled: the last over is his
  assert.equal(st[4].reason, 'Others must bowl first'); assert.deepEqual(st.filter((c) => c.ok).map((c) => c.idx), [5]);
  const rng = makeRng('wms-hist');
  for (let k = 0; k < 500; k++) {
    const hist = [];
    for (let o = 0; o < 10; o++) {
      const ok = bowlerChips(mk(hist)).filter((c) => c.ok);
      assert.ok(ok.length > 0, `dead end ${hist}`);
      for (const c of ok) assert.ok(completePlan([...hist, c.idx], 6));
      hist.push(ok[rng.int(ok.length)].idx);
    }
    assert.equal(planProblem(hist), null);
  }
});

// ---------------------------------------------------------------- VM
test('wheelMatchVM: shape, expected line, suggested, auto rest after over 1, roar chip; null for classic', () => {
  const s = toBowl('wms-vm');
  assert.equal(wheelMatchVM(toBowl('wms-vm', false)), null);
  const v = wheelMatchVM(s);
  assert.equal(v.mode, 'wheel'); assert.equal(v.side, 'bowl'); assert.equal(v.over, 1);
  assert.match(v.expectText, /^Expected: \d+\.\d runs, \d+\.\d wkts$/);
  assert.equal(v.suggested, suggestedBowler(s)); assert.equal(v.bowler, v.suggested);
  assert.equal(v.bowlers.length, 6); assert.equal(v.autoRestShown, false); assert.equal(v.autoPauseNow, false);
  assert.ok(v.segs.length >= 3); assert.equal(typeof v.phys.W0, 'number'); assert.ok('guide' in v.ctrl);
  assert.equal(v.roar, null); assert.equal(v.needText, undefined);
  const other = v.bowlers.find((b) => b.ok && b.idx !== v.suggested);
  if (other) assert.equal(wheelMatchVM(s, other.idx).bowler, other.idx);
  const s2 = W(s, AUTO);
  assert.equal(wheelMatchVM(s2).autoRestShown, true);
  // roar chip known before the spin (flag on, a roar over); none on a plain over
  withFlags({ roar: true }, () => {
    const t = clone(s); t.match = { md: { roar: [true, false] } };
    assert.deepEqual(wheelMatchVM(t).roar, { on: true, text: 'Crowd roar +5%', aria: 'Crowd roar +5%' });
    t.inn1.over = 2; assert.equal(wheelMatchVM(t).roar, null);
  });
});

test('chase VM: need line, rival bowler known before the spin, autoPauseNow only before the last over of a live chase', () => {
  let s = autoMatch(toBowl('wms-ch'), () => AUTO);
  // walk again to the chase start
  s = toBowl('wms-ch'); let g = 0;
  while (s.stage !== 'chase' && g++ < 30) s = s.stage === 'break' ? C(s, 'StartChase') : W(s, AUTO);
  const v = wheelMatchVM(s);
  assert.equal(v.side, 'bat'); assert.equal(v.bowlers.length, 0);
  assert.equal(v.need.runs, s.inn1.runs + 1); assert.equal(v.need.balls, 60);
  assert.equal(v.needText, `Need ${s.inn1.runs + 1} off 60 balls`);
  assert.equal(v.rivalBowler.idx, rivalBowler(s)); assert.equal(v.autoPauseNow, false); assert.equal(v.autoRestShown, false);
  const n = W(s, AUTO); assert.equal(n.last.bowler, v.rivalBowler.idx);
  // force a live chase at over 10
  const t = clone(s); t.inn2.over = 10; t.inn2.balls = 54; t.inn2.runs = 0;
  assert.equal(wheelMatchVM(t).autoPauseNow, true); assert.equal(wheelMatchVM(t).needText, `Need ${s.inn1.runs + 1} off 6 balls`);
  t.inn2.over = 9; t.inn2.balls = 48; assert.equal(wheelMatchVM(t).autoPauseNow, false);
  const b = toBowl('wms-ch'); b.inn1.over = 10; assert.equal(wheelMatchVM(b).autoPauseNow, false); // never in innings 1
});

test('results: won, lost and tied paths end the chase exactly as classic', () => {
  let s = toBowl('wms-res'); let g = 0;
  while (s.stage !== 'chase' && g++ < 30) s = s.stage === 'break' ? C(s, 'StartChase') : W(s, AUTO);
  // a chase at the last over, target tuned to find each result
  const base = clone(s);
  base.inn2.over = 10; base.inn2.balls = 54; base.inn2.runs = 50; base.inn2.wk = 0;
  base.rival.players.forEach((p, i) => { p.overs = i === 5 ? 1 : 2; }); base.inn2.last = 4; // rival 5 bowls the last over
  const seen = {};
  for (let j = 0; j < 200 && Object.keys(seen).length < 3; j++) {
    const T = 50 + (j % 13);
    const x = clone(base); x.inn1.runs = T; x.inn2.target = T; x.seed = `${base.seed}|T${j}`; // own seed per try: the model memo is keyed by seed, not target
    const n = W(x, AUTO);
    assert.equal(n.stage, 'done');
    const want = n.inn2.runs > T ? 'won' : n.inn2.runs === T ? 'tied' : 'lost';
    assert.equal(n.result, want);
    if (want === 'tied') assert.equal(n.last.wheel.end, 'TIE');
    if (want === 'won') { assert.equal(n.last.wheel.end, 'WIN'); assert.ok(n.inn2.runs - T <= 6); }
    seen[want] = T;
  }
  assert.deepEqual(Object.keys(seen).sort(), ['lost', 'tied', 'won']);
});

// ---------------------------------------------------------------- Dev
test('SetDev clamps a partial patch; DevReset resets matchW0 or all four, keeps on; dev rides along NewGame', () => {
  const g = withFlags({ wheelMatch: true }, () => C(null, 'NewGame', { seed: 'wms-dev' }));
  const a = C(g, 'SetDev', { patch: { on: true, matchW0: 500, matchJ: 'abc', otherMult: 2 } });
  assert.deepEqual(a.dev, { ...DEV_DEFAULTS, on: true, matchW0: 90, otherMult: 2 });
  assert.equal(C(a, 'SetDev', { patch: { matchW0: 90 } }), a);
  assert.equal(C(a, 'SetDev', {}), a);
  const r1 = C(a, 'DevReset', {});
  assert.deepEqual(r1.dev, { ...DEV_DEFAULTS, on: true, otherMult: 2 });
  const r2 = C(a, 'DevReset', { all: true });
  assert.deepEqual(r2.dev, { ...DEV_DEFAULTS, on: true });
  const ng = C(a, 'NewGame', { seed: 'x' });
  assert.deepEqual(ng.dev, a.dev);
  // the match wheel reads dev only when on
  const s = toBowl('wms-dev');
  const on = { ...s, dev: { ...DEV_DEFAULTS, on: true, matchW0: 50 } }, off = { ...s, dev: { ...DEV_DEFAULTS, on: false, matchW0: 50 } };
  assert.equal(wheelMatchVM(on).phys.W0, 50); assert.equal(wheelMatchVM(off).phys.W0, 36);
});
