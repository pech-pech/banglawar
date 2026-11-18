// Wheel match mode: cross-cutting cases from 04-TEST-PLAN as amended by SPEC s12 (sampled overs; T3/T16 = sample-vs-label).
// Owner: TESTPLAN agent. Engine / store / UI / dev owners keep their own files; this file covers what runs across them.
// Seeded only (seed strings wm1-*), no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStore } from '../js/store/store.js';
import { FLAGS } from '../js/data/flags.js';
import { VERSION, wrap, unwrap } from '../js/core/save-migrate.js';
import { eligibleBowlers } from '../js/core/match.js';
import { makeRng } from '../js/core/rng.js';

let WM = null, WD = null, SEL = null;
try { WM = await import('../js/core/wheelmatch.js'); } catch (e) { WM = null; }
try { WD = await import('../js/data/wheelmatch.js'); } catch (e) { WD = null; }
try { SEL = await import('../js/store/selectors.js'); } catch (e) { SEL = null; }
const VM = SEL && SEL.wheelMatchVM;
const ready = () => !!(WM && WD && WM.wheelOverModel);
const needWheel = (t) => (ready() ? false : (t.skip('js/core/wheelmatch.js not present yet'), true));

const withFlags = (set, fn) => { const was = { ...FLAGS }; Object.assign(FLAGS, set); try { return fn(); } finally { Object.assign(FLAGS, was); } };
const CIRC = () => WD.WHEEL_MATCH.CIRC;
const circDist = (a, b) => { const c = CIRC(), d = (((a - b) % c) + c) % c; return Math.min(d, c - d); };

// ------------------------------------------------------------ T19 classic freeze
// Golden hashes were computed from main (origin/main fcdd5e4, PR 59) with the SAME trace code below, before any wheel code existed.
// The only key stripped is the match record `mode` (the contract adds it to every match, classic included).
const GOLDEN = {
  plain: 'ff620921660544e90342c03374ffe4dcc8321046294b032366e9331b6bd7b53d',
  r9: '1b390244843ca821d5c8a8bd948663fccbb603868aba065400aacdfbe738310d',
  quick: '716ec809d6b12f30ee2b3f75ebb40fc2317004243bf4db421717e7acbaad5862',
};
// S0 (M OK 2026-11-16): also drop the S0 default save keys (wheels, clinic, report, per-coach weekly fields, scout extras) so the classic freeze hash still guards classic play only.
const COACH_NEW = ['xp', 'xpTotal', 'job', 'jobWeek', 'stepUpPending', 'stepsXp', 'stepsCourse'];
const s0strip = (r) => { const { wheels, clinic, report, ...o } = r; if (Array.isArray(o.coaches)) o.coaches = o.coaches.map((c) => { if (!c || typeof c !== 'object') return c; const k = { ...c }; for (const f of COACH_NEW) delete k[f]; return k; }); if (o.scout && typeof o.scout === 'object') { const { bonusNames, extraThisSeason, ...sc } = o.scout; if (Object.keys(sc).length) o.scout = sc; else delete o.scout; } return o; };
const strip = (s) => { if (!s || typeof s !== 'object') return s; const { mode, golden, goldCal, ...r } = s; if (r.v === 8) r.v = 7; return s0strip(r); }; // v8 (Captain's Over, CONTRACT-GO): drop golden/goldCal and normalise v 8 -> 7 so the freeze still guards classic play only
function seasonTrace(seed, flagSet, matches, onState) {
  return withFlags(flagSet, () => {
    const a = createStore(null); a.dispatch('NewGame', { seed });
    const old = { ...a.get() }; delete old.matchMode; delete old.dev; // an old save: no matchMode / dev keys
    const st = createStore(old), h = createHash('sha256'), d = (c, p) => { st.dispatch(c, p); h.update(c + JSON.stringify(strip(st.get()))); if (onState) onState(st.get(), c); };
    let fin = 0, g = 0;
    while (fin < matches && g++ < 4000) {
      const s = st.get();
      switch (s.stage) {
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'matchday': d('MatchdayGo'); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); break;
        case 'bowl': d('BowlOver'); break;
        case 'break': d('StartChase'); break;
        case 'chase': d('BowlOver', { intent: ['D', 'R', 'A'][s.inn2.over % 3] }); break;
        case 'done': d('FinishMatch'); fin++; break;
        case 'train': d('EndWeek'); break;
        case 'week': d('NextWeek'); break;
        default: throw new Error('stuck at ' + s.stage);
      }
    }
    return { hash: h.digest('hex'), fin };
  });
}
function quickTrace(seed, onState) {
  const st = createStore(null), h = createHash('sha256'), d = (c, p) => { st.dispatch(c, p); h.update(c + JSON.stringify(strip(st.get()))); if (onState) onState(st.get(), c); };
  d('NewMatch', { seed });
  let g = 0;
  while (st.get().stage !== 'done' && g++ < 100) {
    const s = st.get();
    if (s.stage === 'bowl') { const el = s.me.players.map((p, i) => i).filter((i) => s.me.players[i].overs < 2 && i !== s.inn1.last); d('MakeCall', { bowler: el[0], field: s.inn1.over % 2 ? 'A' : 'P' }); d('BowlOver', {}); }
    else if (s.stage === 'break') d('StartChase', {});
    else d('BowlOver', { intent: ['D', 'R', 'A'][s.inn2.over % 3] });
  }
  return h.digest('hex');
}
const R9 = { matchday: true, roar: true, settled: true, wheelMeta: true };

test('T19 classic freeze: an old save (no matchMode key) plays 3 season matches bit-identical to main, flags off', () => {
  const modes = new Set();
  const r = seasonTrace('wm1-classic-1', {}, 3, (s) => { if (['bowl', 'chase', 'break'].includes(s.stage)) modes.add(s.mode); });
  assert.equal(r.fin, 3);
  assert.equal(r.hash, GOLDEN.plain, 'classic season trace drifted from main');
  assert.ok(![...modes].includes('wheel'), 'an old save must play classic');
});
test('T19 classic freeze: same with r9 flags + wheel meta on (match day, roar, settled, Spokes)', () => {
  const r = seasonTrace('wm1-classic-2', R9, 3);
  assert.equal(r.fin, 3);
  assert.equal(r.hash, GOLDEN.r9, 'classic season trace (r9 + wheelMeta) drifted from main');
});
test('T19 classic freeze: step-0 NewMatch (MakeCall/BowlOver) identical to main, and its mode is classic', () => {
  const modes = new Set();
  assert.equal(quickTrace('wm1-quick', (s) => modes.add(s.mode)), GOLDEN.quick);
  assert.ok(![...modes].includes('wheel'));
});
test('T20 no VERSION bump: save version stays 8', () => {
  assert.equal(VERSION, 8); // bumped to 8 by Captain's Over (CONTRACT-GO)
});

// ------------------------------------------------------------ helpers for wheel matches
function toMatch(seed, { mode, flags = {} } = {}) {
  return withFlags({ wheelMatch: true, ...flags }, () => {
    const st = createStore(null);
    st.dispatch('NewGame', { seed });
    if (mode) st.dispatch('SetMatchMode', { mode });
    let g = 0;
    while (!['bowl'].includes(st.get().stage) && g++ < 50) {
      const s = st.get();
      if (['hub', 'semi', 'final'].includes(s.stage)) st.dispatch('OpenSquad');
      else if (s.stage === 'squad') st.dispatch('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) });
      else if (s.stage === 'matchday') st.dispatch('MatchdayGo');
      else if (s.stage === 'plan') { st.dispatch('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); st.dispatch('NewMatch'); }
      else if (s.stage === 'freepick') st.dispatch('TakeFreePick', { what: 'x' });
      else throw new Error('stuck at ' + s.stage);
    }
    return st;
  });
}
/** Play one wheel over. pick(s) -> payload. Returns the new state; throws when the command was ignored. */
function wheelStep(st, payload) {
  const before = st.get();
  const after = st.dispatch('WheelOver', payload);
  if (after === before) throw new Error(`WheelOver ignored at ${before.stage} over ${(before.stage === 'bowl' ? before.inn1 : before.inn2).over} payload ${JSON.stringify(payload)}`);
  return after;
}
/** Play the match to 'done'. choose(s) -> WheelOver payload. onOver(prev, next) after each spin. */
function playWheel(st, choose, onOver) {
  let g = 0;
  while (st.get().stage !== 'done' && g++ < 60) {
    const s = st.get();
    if (s.stage === 'break') { st.dispatch('StartChase'); continue; }
    const n = wheelStep(st, choose(s));
    if (onOver) onOver(s, n);
  }
  assert.equal(st.get().stage, 'done', 'match did not finish');
  return st.get();
}
const autoPick = () => ({ auto: true });
const liveInn = (s) => (s.stage === 'bowl' ? s.inn1 : s.inn2);
const wk = (balls) => balls.filter((b) => b.o === 'W').length;
const runsOf = (balls) => balls.reduce((a, b) => a + (b.o === 'W' ? 0 : b.o), 0);
/** Aimed stop {t, phi} that lands (without wobble) at rim pos `target`. */
function aimAt(phys, target, t = 3.5) {
  const base = WM.landingPos(phys, { t, phi: 0, e: 0 });
  let phi = (((target - base) % CIRC()) + CIRC()) % CIRC();
  if (circDist(WM.landingPos(phys, { t, phi, e: 0 }), target) > 1e-6) { // not linear in phi: scan
    let best = 0, bd = 1e9;
    for (let x = 0; x < CIRC(); x += 0.0005) { const d = circDist(WM.landingPos(phys, { t, phi: x, e: 0 }), target); if (d < bd) { bd = d; best = x; } }
    phi = best;
  }
  return { t, phi };
}
const modelOf = (s) => {
  if (VM) { const v = VM(s); return { segs: v.segs, phys: v.phys }; }
  throw new Error('wheelMatchVM missing');
};

// ------------------------------------------------------------ mode
test('T20 save round trip: a v7 save with no matchMode loads classic; a new wheel game keeps wheel', (t) => {
  if (needWheel(t)) return;
  const st = createStore(null);
  withFlags({ wheelMatch: true }, () => st.dispatch('NewGame', { seed: 'wm1-new' })); // main.js turns FLAGS.wheelMatch on; off in tests keeps old suites classic
  assert.equal(st.get().matchMode, 'wheel');
  assert.equal(st.get().v, 8); // bumped to 8 by Captain's Over (CONTRACT-GO)
  const old = { ...st.get() }; delete old.matchMode;
  assert.equal(WM.matchModeOf(old), 'classic');
  const r = unwrap(JSON.stringify(wrap(old)));
  assert.ok(r.ok);
  assert.equal(WM.matchModeOf(r.state), 'classic', 'a v7 save with no matchMode must load as classic');
  const r2 = unwrap(JSON.stringify(wrap(st.get())));
  assert.equal(r2.state.matchMode, 'wheel', 'round trip keeps matchMode');
});

// ------------------------------------------------------------ full wheel matches: calls, bowlers, labels, log, Spokes, VM
function checkBowlRules(players, inn, label) {
  const overs = inn.overs.map((o) => o.bowler);
  overs.forEach((b, i) => { if (i) assert.notEqual(b, overs[i - 1], `${label}: bowler ${b} twice in a row at over ${i + 1}`); });
  const cnt = players.map((_, i) => overs.filter((b) => b === i).length);
  assert.ok(cnt.every((x) => x <= 2), `${label}: someone bowled more than 2 (${cnt})`);
  if (overs.length === 10) assert.ok(cnt.every((x) => x >= 1), `${label}: 10 overs but not all six bowled (${cnt})`);
}

const MATCH_SEEDS = ['wm1-m1', 'wm1-m2', 'wm1-m3', 'wm1-m4'];
let PLAYED = null; // cache: [{seed, final, overs:[{prev, next, payload}]}]
function playedMatches() {
  if (PLAYED) return PLAYED;
  PLAYED = withFlags({ wheelMeta: true }, () => MATCH_SEEDS.map((seed, mi) => {
    const st = toMatch(seed);
    const rng = makeRng(`wm1-pick|${seed}`);
    const overs = [];
    const spokes0 = st.get().wheelMeta.spokes, tally0 = st.get().wheelMeta.tally;
    playWheel(st, (s) => {
      // mix: random legal bowler + aimed stop, auto every 3rd over, a plain no-stop (coast/unaimed) in match 4
      const inn = liveInn(s), auto = inn.over % 3 === 0 || mi === 3 && inn.over % 2 === 0;
      const p = auto ? { auto: true } : { stop: { t: 1 + rng.random() * 5, phi: rng.random() * 10 } };
      if (s.stage === 'bowl' && !auto) { const el = eligibleBowlers(s.me.players, inn.over, inn.last); p.bowler = el[rng.int(el.length)]; }
      overs.push({ prev: s, payload: p });
      return p;
    }, (prev, next) => { overs[overs.length - 1].next = next; });
    return { seed, final: st.get(), overs, spokes0, tally0 };
  }));
  return PLAYED;
}

test('neutral calls: field P and intent R on every wheel over and ball, both innings', (t) => {
  if (needWheel(t)) return;
  for (const m of playedMatches()) {
    for (const inn of [m.final.inn1, m.final.inn2]) for (const o of inn.overs) {
      assert.equal(o.field, 'P'); assert.equal(o.intent, 'R');
      for (const b of o.balls) { assert.equal(b.field, 'P'); assert.equal(b.intent, 'R'); }
    }
    for (const o of m.overs) { assert.equal(o.next.last.field, 'P'); assert.equal(o.next.last.intent, 'R'); }
  }
});

test('T18 bowler rules: ours 1-2 overs, never twice in a row, all six over a full innings; rival the same', (t) => {
  if (needWheel(t)) return;
  for (const m of playedMatches()) {
    checkBowlRules(m.final.me.players, m.final.inn1, `${m.seed} inn1`);
    checkBowlRules(m.final.rival.players, m.final.inn2, `${m.seed} inn2`);
  }
});

test('T18 an illegal bowler is refused (same as last over, or a 3rd over)', (t) => {
  if (needWheel(t)) return;
  const st = toMatch('wm1-illegal');
  wheelStep(st, { bowler: 0, stop: { t: 3.5, phi: 0 } });
  const s = st.get();
  if (s.stage !== 'bowl') return;
  assert.equal(st.dispatch('WheelOver', { bowler: 0, stop: { t: 3.5, phi: 0 } }), s, 'same bowler twice in a row must be refused');
  assert.equal(st.dispatch('WheelOver', { bowler: 9, stop: { t: 3.5, phi: 0 } }), s, 'no such bowler');
  assert.equal(st.dispatch('WheelOver', { stop: { t: 3.5, phi: 0 } }), s, 'aimed bowl over without a bowler is refused (bowler required unless auto)');
});

test('T16 over row = landed label for every spin (runs, wickets, WIN / ALL OUT truncation); log matches', (t) => {
  if (needWheel(t)) return;
  for (const m of playedMatches()) {
    const log = m.final.wheelLog;
    assert.ok(Array.isArray(log), 'wheelLog');
    assert.equal(log.length, m.overs.length, `${m.seed}: one log row per spin`);
    m.overs.forEach((o, i) => {
      const L = o.next.last, w = L.wheel, inn = o.prev.stage === 'bowl' ? o.next.inn1 : o.next.inn2;
      assert.ok(w && Array.isArray(w.segs), 's.last.wheel stored');
      const seg = w.segs.find((x) => x.id === w.segId);
      assert.ok(seg, `segId ${w.segId} among stored segs`);
      assert.equal(WM.segAt(w.segs, w.pos), w.segs.indexOf(seg), 'landed pos lies inside the landed segment');
      const r = runsOf(L.balls), k = wk(L.balls);
      const tag = `${m.seed} over ${i + 1} seg ${seg.id}`;
      if (seg.end === 'WIN') {
        assert.ok(inn.done && inn.runs > inn.target, `${tag}: WIN seg but target not passed`);
        assert.ok(inn.runs - L.balls[L.balls.length - 1].o <= inn.target, `${tag}: balls bowled after the winning ball`);
      } else if (seg.end === 'AO') {
        assert.equal(inn.wk, 5, `${tag}: ALL OUT seg but ${inn.wk} wkts`);
        assert.equal(L.balls[L.balls.length - 1].o, 'W', `${tag}: panel must stop at the 5th wicket`);
      } else {
        assert.equal(r, seg.runs, `${tag}: row runs ${r} != label ${seg.label}`);
        assert.equal(k, seg.wk, `${tag}: row wkts ${k} != stars ${seg.wk}`);
        assert.equal(String(seg.runs), seg.label);
        assert.ok(!(inn.target != null && inn.runs > inn.target), `${tag}: target passed on a non-WIN seg`);
        assert.ok(inn.wk < 5, `${tag}: all out on a non-AO seg`);
      }
      if (w.end === 'TIE') { assert.equal(seg.end, ''); assert.equal(o.next.result, 'tied'); assert.equal(inn.runs, inn.target); }
      else assert.equal(w.end, seg.end, 'stored end = seg end');
      assert.equal(log[i].segId, seg.id); assert.equal(log[i].runs, r); assert.equal(log[i].wk, k);
      assert.equal(log[i].inn, o.prev.stage === 'bowl' ? 1 : 2);
    });
  }
});

test('Spokes: 1 per spin incl. auto, to spokes not tally; early finish pays the spins actually spun', (t) => {
  if (needWheel(t)) return;
  assert.equal(WD.MATCH_SPOKES_PER_SPIN, 1);
  let short = 0;
  for (const m of playedMatches()) {
    const wmf = m.final.wheelMeta, n = m.overs.length;
    assert.equal(wmf.spokes - m.spokes0, n * WD.MATCH_SPOKES_PER_SPIN, `${m.seed}: ${n} spins`);
    assert.equal(wmf.tally, m.tally0, `${m.seed}: tally must not move`);
    if (n < 20) short++;
    m.overs.forEach((o) => assert.equal(o.next.wheelMeta.spokes - o.prev.wheelMeta.spokes, 1));
  }
  // at least the spec property holds per spin; `short` only says whether an early finish was seen in these seeds
  t.diagnostic(`matches finishing early: ${short}/${MATCH_SEEDS.length}`);
});

test('Auto: logged auto, landing = unaimedPos(seed|wma|stage|over), never counted careful', (t) => {
  if (needWheel(t)) return;
  let autos = 0;
  for (const m of playedMatches()) m.overs.forEach((o, i) => {
    const e = m.final.wheelLog[i];
    if (!o.payload.auto) { assert.equal(e.auto, false, 'aimed spin logged auto'); return; }
    autos++;
    assert.equal(e.auto, true);
    assert.ok(!e.careful, `${m.seed} over ${i + 1}: auto spin counted careful`);
    const inn = liveInn(o.prev);
    const pos = WM.unaimedPos(makeRng(`${o.prev.seed}|wma|${o.prev.stage}|${inn.over}`));
    assert.ok(circDist(o.next.last.wheel.pos, pos) < 1e-9, 'auto landing = contract unaimed stream');
    assert.equal(o.next.last.wheel.auto, true);
  });
  assert.ok(autos > 5);
});

test('Auto bowl over picks a legal bowler (the suggested one)', (t) => {
  if (needWheel(t)) return;
  for (const m of playedMatches()) for (const o of m.overs) {
    if (!o.payload.auto || o.prev.stage !== 'bowl') continue;
    const el = eligibleBowlers(o.prev.me.players, o.prev.inn1.over, o.prev.inn1.last);
    assert.ok(el.includes(o.next.last.bowler), `auto bowler ${o.next.last.bowler} not legal (${el})`);
    if (VM) assert.equal(o.next.last.bowler, VM(o.prev).suggested, 'auto uses the VM suggested bowler');
  }
});

test('aimed landing: tick = landingPos(e=0) of the stored stop; landed pos within +-J of the tick', (t) => {
  if (needWheel(t)) return;
  for (const m of playedMatches()) for (const o of m.overs) {
    if (o.payload.auto) continue;
    const w = o.next.last.wheel, phys = WM.matchPhys(o.prev);
    assert.equal(w.auto, false);
    assert.ok(circDist(w.tickPos, WM.landingPos(phys, { t: w.t, phi: w.phi, e: 0 })) < 1e-9, 'tickPos is the honest e=0 landing');
    assert.ok(circDist(w.pos, w.tickPos) <= phys.J + 1e-9, `wobble ${circDist(w.pos, w.tickPos)} > J ${phys.J}`);
  }
});

test('Expected line = mean of the over samples (model, log xr/xw, VM text)', (t) => {
  if (needWheel(t)) return;
  const m = playedMatches()[0];
  for (const [i, o] of m.overs.slice(0, 12).entries()) {
    const bowler = o.next.last.bowler;
    const mod = WM.wheelOverModel(o.prev, o.prev.stage === 'bowl' ? 'bowl' : 'bat', bowler, {});
    const n = mod.samples.length, xr = mod.samples.reduce((a, x) => a + x.runs, 0) / n, xw = mod.samples.reduce((a, x) => a + x.wk, 0) / n;
    assert.equal(n, WD.WHEEL_MATCH.N_SAMP);
    const ex = WM.expectOf(mod.samples);
    assert.ok(Math.abs(ex.xr - xr) < 1e-9 && Math.abs(ex.xw - xw) < 1e-9, 'expectOf = sample mean');
    assert.ok(Math.abs(mod.expect.xr - xr) < 1e-9 && Math.abs(mod.expect.xw - xw) < 1e-9, 'model expect = sample mean');
    assert.ok(Math.abs(m.final.wheelLog[i].xr - xr) < 1e-9 && Math.abs(m.final.wheelLog[i].xw - xw) < 1e-9, `log over ${i + 1}: xr/xw = sample mean of the landed model`);
    if (VM) {
      const v = VM(o.prev);
      const vb = o.prev.stage === 'bowl' ? v.suggested : bowler; // the VM shows the model of the suggested (bowl) / store-chosen rival (chase) bowler
      const vm = WM.wheelOverModel(o.prev, o.prev.stage === 'bowl' ? 'bowl' : 'bat', vb, {});
      assert.equal(v.expectText, `Expected: ${vm.expect.xr.toFixed(1)} runs, ${vm.expect.xw.toFixed(1)} wkts`);
    }
  }
});

test('VM over the match: autoPauseNow only before the last over of a live chase; never innings 1; autoRestShown after over 1; need text', (t) => {
  if (needWheel(t) || !VM) return t.skip('wheelMatchVM missing');
  for (const m of playedMatches()) for (const o of m.overs) {
    const s = o.prev, v = VM(s), inn = liveInn(s);
    assert.equal(v.mode, 'wheel');
    assert.equal(v.side, s.stage === 'bowl' ? 'bowl' : 'bat');
    const want = s.stage === 'chase' && inn.over === 10 && !inn.done;
    assert.equal(!!v.autoPauseNow, want, `${m.seed} ${s.stage} over ${inn.over}: autoPauseNow`);
    assert.equal(!!v.autoRestShown, inn.over > 1, `autoRestShown at over ${inn.over}`);
    if (s.stage === 'chase') {
      const need = s.inn1.runs + 1 - inn.runs, balls = 60 - inn.balls;
      assert.ok(v.needText && v.needText.includes(`Need ${need}`) && v.needText.includes(`${balls}`), `needText '${v.needText}' want Need ${need} off ${balls}`);
    } else assert.ok(!v.needText, 'no need line in innings 1');
    if (s.stage === 'bowl') {
      const el = eligibleBowlers(s.me.players, inn.over, inn.last);
      assert.equal(v.bowlers.length, 6);
      assert.deepEqual(v.bowlers.filter((b) => b.ok).map((b) => b.idx).sort(), el.slice().sort(), 'ok chips = legal bowlers');
      assert.ok(v.bowlers.every((b) => b.ok || (typeof b.reason === 'string' && b.reason.length)), 'disabled chip has a reason');
      assert.ok(el.includes(v.suggested));
    }
  }
  const done = playedMatches()[0].final;
  const vd = VM(done);
  assert.ok(!(vd && vd.autoPauseNow), 'decided chase never pauses');
});

test('T22 persist at STOP: JSON / save round trip keeps s.last.wheel; the over cannot be spun again', (t) => {
  if (needWheel(t)) return;
  const st = toMatch('wm1-persist');
  const el = eligibleBowlers(st.get().me.players, 1, null);
  const s1 = wheelStep(st, { bowler: el[0], stop: { t: 3.5, phi: 1.25 } });
  const rt = JSON.parse(JSON.stringify(s1));
  assert.deepEqual(rt.last.wheel, s1.last.wheel);
  const r = unwrap(JSON.stringify(wrap(s1)));
  assert.ok(r.ok);
  assert.deepEqual(r.state.last.wheel, s1.last.wheel, 'save round trip keeps the landed spin');
  assert.equal(r.state.mode, 'wheel', 'save round trip keeps the match mode');
  assert.deepEqual(r.state.last.balls, s1.last.balls);
  if (VM) assert.deepEqual(VM(r.state).last.wheel, s1.last.wheel, 'VM after reload shows the same landed spin');
  assert.equal(r.state.inn1.over, 2, 'the spun over is settled; the next spin is over 2');
  // Re-dispatching the same stop after reload plays over 2, never re-rolls over 1.
  const st2 = createStore(r.state);
  const el2 = eligibleBowlers(r.state.me.players, 2, r.state.inn1.last);
  const s2 = wheelStep(st2, { bowler: el2[0], stop: { t: 3.5, phi: 1.25 } });
  assert.deepEqual(s2.inn1.overs[0], s1.inn1.overs[0]);
});

// ------------------------------------------------------------ aimed endings (dev J = 0: no wobble, aim is exact)
function devExact(st) { st.dispatch('SetDev', { patch: { on: true, matchJ: 0 } }); }
/** Auto through the match until pred(s) or done. */
function autoUntil(st, pred) {
  let g = 0;
  while (st.get().stage !== 'done' && !pred(st.get()) && g++ < 60) { if (st.get().stage === 'break') st.dispatch('StartChase'); else wheelStep(st, { auto: true }); }
  return st.get();
}
function landOn(st, segPred) {
  const s = st.get();
  const { segs, phys } = modelOf(s);
  assert.equal(phys.J, 0, 'dev matchJ 0 gives J 0');
  const seg = segs.find(segPred);
  if (!seg) return null;
  const stop = aimAt(phys, seg.start + seg.width / 2);
  const p = { stop };
  if (s.stage === 'bowl') p.bowler = VM(s).suggested;
  const n = wheelStep(st, p);
  assert.equal(n.last.wheel.segId, seg.id, 'exact aim (J 0) lands on the aimed seg');
  return { seg, n, prev: s };
}

test('T12 chase WIN mid-over: label WIN, row ends on the winning ball, result won', (t) => {
  if (needWheel(t) || !VM) return t.skip('needs engine + VM');
  let seen = 0;
  for (let k = 0; k < 6 && seen < 2; k++) {
    const st = toMatch(`wm1-win-${k}`); devExact(st);
    autoUntil(st, (s) => s.stage === 'chase' && VM(s).segs.some((x) => x.end === 'WIN'));
    if (st.get().stage !== 'chase') continue;
    const segWin = VM(st.get()).segs.filter((x) => x.end === 'WIN');
    assert.equal(new Set(segWin.map((x) => x.id.split('#')[0])).size, 1, 'ONE WIN label (pieces when wider than the slice cap)');
    assert.ok(segWin.every((x) => x.label === 'WIN'));
    const r = landOn(st, (x) => x.end === 'WIN');
    const inn = r.n.inn2, L = r.n.last.balls;
    assert.ok(inn.runs > inn.target);
    assert.ok(inn.runs - (L[L.length - 1].o === 'W' ? 0 : L[L.length - 1].o) <= inn.target, 'no ball after the winning ball');
    assert.equal(r.n.stage, 'done'); assert.equal(r.n.result, 'won');
    seen++;
  }
  assert.ok(seen >= 1, 'no WIN seg reached in 6 seeds');
});

test('T14 ALL OUT mid-over: one AO seg, label ALL OUT, panel stops at the 5th wicket', (t) => {
  if (needWheel(t) || !VM) return t.skip('needs engine + VM');
  let seen = 0;
  for (let k = 0; k < 8 && seen < 1; k++) {
    const st = toMatch(`wm1-ao-${k}`); devExact(st);
    autoUntil(st, (s) => (s.stage === 'bowl' || s.stage === 'chase') && VM(s).segs.some((x) => x.end === 'AO'));
    if (st.get().stage === 'done') continue;
    const segs = VM(st.get()).segs.filter((x) => x.end === 'AO');
    assert.equal(new Set(segs.map((x) => x.id.split('#')[0])).size, 1, 'ONE ALL OUT label (pieces when wider than the slice cap)');
    assert.ok(segs.every((x) => x.label === 'ALL OUT'));
    const r = landOn(st, (x) => x.end === 'AO');
    const inn = r.prev.stage === 'bowl' ? r.n.inn1 : r.n.inn2, L = r.n.last.balls;
    assert.equal(inn.wk, 5); assert.ok(inn.done);
    assert.equal(L[L.length - 1].o, 'W');
    assert.equal(r.n.stage, r.prev.stage === 'bowl' ? 'break' : 'done');
    seen++;
  }
  assert.ok(seen >= 1, 'no ALL OUT seg reached in 8 seeds');
});

// ------------------------------------------------------------ segment invariants over 200 seeded states
let STATES = null;
function liveStates() {
  if (STATES) return STATES;
  // Cheap states: classic play captures 200 live overs; flipped to wheel for the builder (the builder reads innings + players only).
  STATES = [];
  for (let k = 0; STATES.length < 200 && k < 40; k++) {
    const st = toMatch(`wm1-st-${k}`, { mode: 'classic' });
    let g = 0;
    while (st.get().stage !== 'done' && g++ < 60 && STATES.length < 200) {
      const s = st.get();
      if (s.stage === 'break') { st.dispatch('StartChase'); continue; }
      if ((k + g) % 2 === 0) STATES.push({ ...structuredClone(s), mode: 'wheel' });
      st.dispatch('BowlOver', s.stage === 'chase' ? { intent: 'R' } : {});
    }
  }
  return STATES;
}

test('segment invariants on 200 seeded live states (p sum 1, <= K_SEG labels, slice cap, wicket classes kept, one WIN / AO, labels, rim)', (t) => {
  if (needWheel(t)) return;
  const W = WD.WHEEL_MATCH;
  const states = liveStates();
  assert.equal(states.length, 200);
  for (const [si, s] of states.entries()) {
    const bowl = s.stage === 'bowl', inn = bowl ? s.inn1 : s.inn2;
    const team = bowl ? s.me.players : s.rival.players;
    const bi = eligibleBowlers(team, inn.over, inn.last)[0];
    const samples = WM.sampleOvers(s, bowl ? 'bowl' : 'bat', bi, { n: 400 });
    assert.equal(samples.length, 400);
    const ctx = bowl ? { side: 'bowl' } : { side: 'bat', needRuns: s.inn1.runs + 1 - inn.runs, ballsLeft: 60 - inn.balls };
    const segs = WM.buildSegments(samples, ctx);
    const tag = `state ${si} (${s.stage} over ${inn.over}, ${inn.runs}/${inn.wk})`;
    const sum = segs.reduce((a, x) => a + x.p, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${tag}: p sum ${sum}`);
    const base = (x) => x.id.split('#')[0], whole = (x) => segs.filter((q) => base(q) === base(x)).reduce((a, q) => a + q.p, 0); // a label = all its pieces
    const nLab = new Set(segs.map(base)).size;
    assert.ok(nLab >= 1 && nLab <= W.K_SEG, `${tag}: ${nLab} labels`);
    assert.ok(segs.every((x) => x.p <= W.SLICE_MAX_P + 1e-9), `${tag}: slice wider than SLICE_MAX_P`);
    assert.equal(new Set(segs.map((x) => x.id)).size, segs.length, `${tag}: ids unique`);
    let pos = segs[0].start;
    for (const x of segs) {
      assert.ok(x.p > 0 && Number.isFinite(x.p), `${tag}: seg ${x.id} p ${x.p}`);
      assert.ok(Math.abs(x.width - x.p * W.CIRC) < 1e-9, `${tag}: width = p*CIRC`);
      assert.ok(circDist(x.start, pos) < 1e-9, `${tag}: segs contiguous on the rim`);
      pos += x.width;
      assert.equal(x.stars, x.wk);
      assert.ok(['good', 'so', 'bad'].includes(x.tone));
      if (x.end === 'WIN') assert.equal(x.label, 'WIN');
      else if (x.end === 'AO') assert.equal(x.label, 'ALL OUT');
      else {
        assert.equal(x.label, String(x.runs));
        assert.ok(whole(x) >= W.MIN_P - 1e-12, `${tag}: normal seg ${x.id} under MIN_P (${whole(x)})`);
      }
      assert.equal(WM.segAt(segs, x.start + x.width / 2), segs.indexOf(x));
      assert.equal(WM.segAt(segs, x.start + x.width / 2 + W.CIRC), segs.indexOf(x), 'segAt is mod CIRC');
    }
    const normal = segs.filter((x) => !x.end && !/#[2-9]|#\d\d/.test(x.id)); // one row per label (piece #1 or unsplit)
    assert.equal(new Set(normal.map((x) => `${x.runs}|${x.wk}`)).size, normal.length, `${tag}: (runs,wk) unique`);
    // ends
    const fr = (f) => samples.filter(f).length / samples.length;
    for (const [end, lab] of [['WIN', 'WIN'], ['AO', 'ALL OUT']]) {
      const m = fr((x) => x.end === end), ss = segs.filter((x) => x.end === end);
      if (m > 0) { assert.equal(new Set(ss.map(base)).size, 1, `${tag}: one ${lab} label`); assert.ok(Math.abs(whole(ss[0]) - m) < 1e-9, `${tag}: ${lab} p = sample share`); }
      else assert.equal(ss.length, 0);
    }
    if (bowl) assert.equal(fr((x) => x.end === 'WIN'), 0, `${tag}: rival never gets target logic`);
    const iW = segs.findIndex((x) => x.id === 'WIN'), iA = segs.findIndex((x) => x.id === 'AO'); // unsplit ends; split ones join the zigzag (core test)
    if (iW >= 0) assert.ok(iW === 0 || iW === segs.length - 1, `${tag}: WIN at a rim end`);
    if (iA >= 0) assert.ok(iA === 0 || iA === segs.length - 1, `${tag}: AO at a rim end`);
    if (iW >= 0 && iA >= 0) assert.notEqual(iW, iA);
    // wicket classes with mass >= RESERVE_MIN keep a label of their own
    for (let c = 0; c <= 5; c++) {
      const m = fr((x) => !x.end && x.wk === c);
      if (m >= W.RESERVE_MIN) assert.ok(normal.some((x) => x.wk === c), `${tag}: ${c}-wkt class (${m.toFixed(3)}) lost its label`);
    }
    // folded mass: each normal seg's p = share of its members; wickets kept on average
    const keyOf = new Map(); samples.forEach((x) => keyOf.set(x.key, (keyOf.get(x.key) || 0) + 1));
    for (const x of normal) {
      assert.ok(Array.isArray(x.members) && x.members.length, `${tag}: members`);
      const share = x.members.reduce((a, k) => a + (keyOf.get(k) || 0), 0) / samples.length;
      assert.ok(Math.abs(share - whole(x)) < 1e-9, `${tag}: seg ${x.id} p ${whole(x)} != members share ${share}`);
    }
    const xwS = samples.filter((x) => !x.end).reduce((a, x) => a + x.wk, 0) / samples.length;
    const xwG = normal.reduce((a, x) => a + whole(x) * x.wk, 0);
    assert.ok(Math.abs(xwS - xwG) < 0.06, `${tag}: wicket mass ${xwS.toFixed(3)} folded to ${xwG.toFixed(3)}`);
  }
});

test('T8 unaimed landing picks by width: unaimedPos uniform on [0, CIRC)', (t) => {
  if (needWheel(t)) return;
  const n = 20000, bins = Array(10).fill(0), rng = makeRng('wm1-unaimed');
  for (let i = 0; i < n; i++) { const p = WM.unaimedPos(rng); assert.ok(p >= 0 && p < CIRC()); bins[Math.floor(p / CIRC() * 10)]++; }
  const sd = Math.sqrt(n * 0.1 * 0.9);
  bins.forEach((b) => assert.ok(Math.abs(b - n / 10) < 4 * sd, `bin ${b}`));
});
