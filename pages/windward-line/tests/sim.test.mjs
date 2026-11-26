import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, startRun, step, queueCallin, runToEnd, hashState, causeLine } from '../js/sim.js';
import { buildMap, validateMap } from '../js/map.js';
import { defaultCfg, cloneCfg, breakHold, breakRating, STAGES } from '../js/contract.js';
import { applyPlan, runBot, idlePlan, naivePlan, skilledPlan } from './plans.mjs';

const hashOf = (stage, seed, extra) => {
  const s = createState(stage, defaultCfg, seed);
  applyPlan(s, skilledPlan(s).slice(0, 3)); if (extra) applyPlan(s, extra(s));
  startRun(s); runToEnd(s, 20000); return hashState(s);
};

test('validateMap both stages empty', () => {
  for (const st of [1, 2]) assert.deepEqual(validateMap(buildMap(st)), [], 'stage ' + st);
});

test('run finishes under 20000 ticks', () => {
  for (const st of [1, 2]) {
    const s = createState(st, defaultCfg, 7); startRun(s); runToEnd(s, 20000);
    assert.equal(s.phase, 'result'); assert.ok(s.tick < 20000, 'ticks ' + s.tick);
  }
});

test('same seed + plan -> same hash', () => {
  assert.equal(hashOf(1, 5), hashOf(1, 5));
});

// cost-neutral change: the same 31-cell break moved 6 rows, money equal, so only the fire/people outcome can differ
test('cost-neutral plan change -> different hash and different outcome on some seed 1..5', () => {
  const run = (seed, y) => {
    const s = createState(1, defaultCfg, seed);
    applyPlan(s, skilledPlan(s).slice(0, 3));
    const rej = applyPlan(s, [{ t: 'break', x0: 30, y0: y, x1: 60, y1: y, width: 1 }]);
    assert.equal(rej.length, 0);
    startRun(s); runToEnd(s, 20000);
    return { hash: hashState(s), pct: s.result.pct, burnt: s.counts.burnt, money: Math.round(s.money) };
  };
  let diffHash = 0, diffOutcome = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const a = run(seed, 50), b = run(seed, 56);
    assert.equal(a.money, b.money, 'money must be equal');
    if (a.hash !== b.hash) diffHash++;
    if (a.pct !== b.pct || a.burnt !== b.burnt) diffOutcome++;
  }
  assert.ok(diffHash >= 1, 'hash differs on at least one seed');
  assert.ok(diffOutcome >= 1, 'pct or burnt differs on at least one seed');
});

test('retry: same seed + plan + replayed inputs -> same hash', () => {
  const play = (replay) => {
    const s = createState(1, defaultCfg, 3);
    applyPlan(s, skilledPlan(s));
    if (replay) s.replay = replay.map((r) => ({ ...r }));
    startRun(s);
    for (let n = 0; s.phase === 'run' && n < 20000; n++) {
      if (!replay && (s.tick === 30 || s.tick === 80)) queueCallin(s, 'bomber', 48, 60 + (s.tick > 50 ? 10 : 0));
      step(s);
    }
    return s;
  };
  const a = play(null);
  assert.equal(a.inputs.length, 2, 'two live call-ins recorded');
  const b = play(a.inputs);
  assert.deepEqual(b.inputs, a.inputs, 'replay re-records identical inputs');
  assert.equal(hashState(b), hashState(a));
  const c = play([]); // no inputs = different run
  assert.notEqual(hashState(c), hashState(a));
});

test('idle stage 2 loss rate (tuning target >= 95%)', () => {
  let loss = 0; const N = 200;
  for (let seed = 1; seed <= N; seed++) { const r = runBot('idle', 2, seed); if (!r.result.win) loss++; }
  const rate = loss / N; console.log(`idle stage 2 loss rate: ${(rate * 100).toFixed(1)}% over ${N} seeds`);
  assert.ok(rate >= 0.95, `TUNING TARGET: idle stage 2 should lose >= 95% of seeds, got ${(rate * 100).toFixed(1)}%`);
});

test('skilled stage 1 win rate (tuning target >= 60%)', () => {
  let win = 0; const N = 50, secs = [];
  for (let seed = 1; seed <= N; seed++) { const r = runBot('skilled', 1, seed); if (r.result.win) win++; secs.push(r.result.sec); }
  const rate = win / N;
  console.log(`skilled stage 1 win rate: ${(rate * 100).toFixed(0)}% over ${N}; mean sec ${(secs.reduce((a, b) => a + b, 0) / N).toFixed(1)} (target ~${STAGES[1].targetSec})`);
  assert.ok(rate >= 0.6, `TUNING TARGET: skilled stage 1 should win >= 60%, got ${(rate * 100).toFixed(0)}%`);
});

test('causeLine non-empty for failed run; sec reported', () => {
  let r; for (let seed = 1; seed <= 40; seed++) { r = runBot('idle', 2, seed); if (!r.result.win) break; }
  assert.ok(!r.result.win, 'no failing idle stage 2 run in seeds 1..40');
  const line = causeLine(r.state);
  console.log('cause:', line);
  assert.ok(typeof line === 'string' && line.length > 0);
  assert.ok(r.result.cause && r.result.cause.length > 0);
  for (const st of [1, 2]) {
    const q = runBot('skilled', st, 1);
    console.log(`stage ${st} skilled sec=${q.result.sec} (target ~${STAGES[st].targetSec}) pct=${q.result.pct} rejected=${JSON.stringify(q.rejected)}`);
    assert.ok(q.result.sec > 0);
  }
});

// balance-1 (QA-A/QA-B: proto too easy). Idle must not win stage 1; one big box must usually lose stage 2.
test('idle stage 1 loses seed 1 and >= 90% of seeds 1..100', () => {
  assert.ok(!runBot('idle', 1, 1).result.win, 'idle stage 1 seed 1 must lose');
  let loss = 0; const N = 100;
  for (let seed = 1; seed <= N; seed++) if (!runBot('idle', 1, seed).result.win) loss++;
  console.log(`idle stage 1 loss rate: ${loss}% over ${N} seeds`);
  assert.ok(loss / N >= 0.9, `TUNING TARGET: idle stage 1 should lose >= 90%, got ${loss}%`);
});

test('bigbox stage 2 loses >= 60% of seeds', () => {
  let loss = 0; const N = 100;
  for (let seed = 1; seed <= N; seed++) if (!runBot('bigbox', 2, seed).result.win) loss++;
  console.log(`bigbox stage 2 loss rate: ${loss}% over ${N} seeds`);
  assert.ok(loss / N >= 0.6, `TUNING TARGET: one big shelter should lose stage 2 >= 60%, got ${loss}%`);
});

test('win line reads as one line with losses', () => {
  const r = runBot('skilled', 1, 1);
  console.log('win line:', r.result.cause);
  if (r.result.win) assert.match(r.result.cause, /^Passed: \d+% alive( \(\d+ lost\)(\. First loss: [a-z-]+ at \d+:\d\d)?)?$/);
});

// per-kind causeLine, synthetic event lists (stage 1 state, positions chosen per side)
test('causeLine per kind', () => {
  const mk = (pct, events, zones = [{}]) => {
    const s = createState(1, defaultCfg, 1);
    s.zones = zones; s._pct = pct; s.counts.alive = pct; s.counts.people0 = 100;
    for (const e of events) {
      const ev = { tick: 100, x: 48, y: 20, text: '', ...e }; s.events.push(ev);
      if (!s.firstBreach && ['break-breach', 'ember-jump', 'gate-closed', 'zone-hit', 'road-cut'].includes(ev.kind)) s.firstBreach = ev;
    }
    return causeLine(s);
  };
  const loss = { kind: 'first-loss', tick: 120 };
  assert.match(mk(20, [{ kind: 'wind-shift', tick: 50 }, { kind: 'break-breach' }, loss]), /^Wind shift hit [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'break-breach' }, loss]), /^Fire broke the [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'ember-jump' }, loss]), /^Embers jumped the [a-z-]+ break at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'zone-hit' }, loss]), /^Embers reached the [a-z-]+ shelter at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'road-cut' }, loss]), /^Road cut [a-z-]+ at \d+:\d\d$/);
  assert.match(mk(20, [{ kind: 'gate-closed' }, loss]), /^Gate closed at the [a-z-]+ shelter at \d+:\d\d$/);
  assert.match(mk(20, [loss], []), /^No shelter: fire reached people in the [a-z-]+ at \d+:\d\d$/);
  assert.match(mk(20, [loss]), /^Fire reached people in the [a-z-]+ at \d+:\d\d, no shelter near$/);
  assert.match(mk(64, [loss]), /^Passed: 64% alive \(36 lost\)\. First loss: [a-z-]+ at \d+:\d\d$/);
  assert.equal(mk(100, []), 'Passed: 100% alive');
});

// stage1-clarity fix 3: a 1-wide break holds a weak front (no wind) a bit longer, but still fails in stage 1 wind.
test('1-wide break: holds weak fire with no wind, still breaks in wind 1, base hold is the cause', () => {
  const breaches = (base, level, N = 20) => {
    let n = 0;
    for (let seed = 1; seed <= N; seed++) {
      const cfg = cloneCfg(defaultCfg); cfg.breakHoldBase = base;
      const s = createState(1, cfg, seed); s.wind.level = level;
      const rej = applyPlan(s, [{ t: 'break', x0: 30, y0: 50, x1: 60, y1: 50, width: 1 }]); assert.equal(rej.length, 0);
      startRun(s); runToEnd(s, 20000);
      if (s.events.some((e) => e.kind === 'break-breach')) n++;
    }
    return n;
  };
  const before = breaches(0, 0), after = breaches(defaultCfg.breakHoldBase, 0), wind = breaches(defaultCfg.breakHoldBase, 1);
  console.log(`1-wide breach, no wind: base 0 -> ${before}/20, default -> ${after}/20; wind 1 default -> ${wind}/20`);
  assert.ok(before >= 18, 'old hold: 1-wide breaks with no wind');
  assert.ok(after <= 5, 'new hold: 1-wide holds weak no-wind fire on >= 75% of seeds');
  assert.ok(wind >= 10, 'stage 1 wind still breaks a 1-wide break');
});

// stage1-clarity fix 2: hold rating shown on the break preview and info row
test('breakRating: stage 1 wind 1 -> 1 wide weak, 2 wide slow front, 3 wide holds; no wind -> 1 wide not weak', () => {
  const c = defaultCfg;
  assert.equal(breakRating(c, 1, STAGES[1].windLevel).key, 'weak');
  assert.equal(breakRating(c, 2, STAGES[1].windLevel).key, 'mid');
  assert.equal(breakRating(c, 3, STAGES[1].windLevel).key, 'strong');
  assert.notEqual(breakRating(c, 1, 0).key, 'weak');
  assert.ok(breakHold(c, 2) > breakHold(c, 1) && breakHold(c, 3) > breakHold(c, 2));
  assert.match(breakRating(c, 1, 1).text, /breaks fast/);
});

// ---- stage2-fix (M's Copy report, stage 2 seed 1, hash f9e7cc91 on build cafc680e87) ----
import { shelterReach } from '../js/people.js';
import { fireStep } from '../js/fire.js';
const M_PLAN = [
  { t: 'break', x0: 41, y0: 13, x1: 63, y1: 13, width: 1 }, { t: 'break', x0: 42, y0: 18, x1: 63, y1: 18, width: 1 },
  { t: 'break', x0: 41, y0: 24, x1: 63, y1: 24, width: 2 }, { t: 'break', x0: 40, y0: 82, x1: 63, y1: 82, width: 2 },
  { t: 'break', x0: 41, y0: 54, x1: 63, y1: 54, width: 2 }, { t: 'pump', buildingId: 3 }, { t: 'crew', buildingId: 4 },
  { t: 'crew', buildingId: 3 }, { t: 'crew', buildingId: 2 }, { t: 'zone', x: 21, y: 115, w: 13, h: 5 },
];
const playM = (cfg, zoneFix) => {
  const s = createState(2, cfg || defaultCfg, 1);
  const plan = M_PLAN.map((a) => (zoneFix && a.t === 'zone' ? { ...a, x: 20, y: 112 } : a)); // same size box moved up onto the x=20 road column and y=114 road row
  assert.deepEqual(applyPlan(s, plan), []);
  const ci = { 66: ['bomber', 27, 59], 113: ['bomber', 26, 49], 160: ['dozer', 52, 58] };
  startRun(s);
  while (s.phase === 'run' && s.tick < 20000) { const c = ci[s.tick]; if (c) queueCallin(s, ...c); step(s); }
  return s;
};

test('item 1: M plan seed 1 -> shelter has 0 gates, so 0 of 900 can enter (not a pathing bug)', () => {
  const s = playM();
  assert.equal(s.zones[0].gates.length, 0, 'zone x21..33 y115..119 has no road cell on its edge');
  assert.equal(s.counts.safe, 0); assert.equal(s.counts.inZone, 0);
  assert.match(s.result.cause, /^No one reached the [a-z-]+ shelter: no road touches its edge, so it has no gate$/);
  const f = playM(null, true);
  assert.ok(f.zones[0].gates.length > 0, 'same box over a road gets gates');
  assert.ok(f.counts.safe > 0, 'people reach it when it has a gate: ' + f.counts.safe);
});

test('item 2: no embers before the ember grace (15 s = tick 60); grace 0 spawns them earlier', () => {
  const embersBy = (grace) => {
    const cfg = cloneCfg(defaultCfg); cfg.emberGraceSec = grace;
    const s = createState(2, cfg, 1); startRun(s); let seen = 0;
    for (let n = 0; n < 59; n++) { step(s); seen += s.embers.length; }
    return seen;
  };
  assert.equal(defaultCfg.emberGraceSec, 15);
  assert.equal(embersBy(15), 0, 'no embers before 15 s');
  assert.ok(embersBy(0) > 0, 'embers exist early without grace');
});

test('item 3: a width-2 break holds >= 30 s head-on on seed 1; shadow cuts ember jumps vs shadow off', () => {
  const run = (cfgMut, width, seed) => {
    const cfg = cloneCfg(defaultCfg); if (cfgMut) cfgMut(cfg);
    const s = createState(2, cfg, seed);
    assert.deepEqual(applyPlan(s, [{ t: 'break', x0: 34, y0: 27, x1: 46, y1: 15, width }]), []); // across the first NE run of the fire
    startRun(s);
    let first = Infinity;
    while (s.phase === 'run' && s.tick < 600) { step(s); const e = s.events.find((v) => v.kind === 'break-breach' || v.kind === 'ember-jump'); if (e) { first = e.tick * cfg.tickSec; break; } }
    return first;
  };
  assert.ok(run(null, 2, 1) >= 30, 'width 2 holds >= 30 s on seed 1');
  const off = (c) => { c.breakShadowMul = 1; c.breakShadowMulWide = 1; };
  let on = 0, none = 0;
  for (let seed = 1; seed <= 30; seed++) { if (run(null, 2, seed) < 60) on++; if (run(off, 2, seed) < 60) none++; }
  console.log(`width-2 breach/jump before 60 s over 30 seeds: shadow on ${on}, off ${none}`);
  assert.ok(none >= on + 2, 'shadow on cuts early jumps');
});

test('item 4: stage 2 spread x0.75, stage 1 untouched; idle still loses', () => {
  assert.equal(defaultCfg.spreadMulStage2, 0.75);
  let loss = 0; for (let seed = 1; seed <= 40; seed++) if (!runBot('idle', 2, seed).result.win) loss++;
  assert.equal(loss, 40);
});

test('item 5: cause line picks the decisive cause, not the first event', () => {
  const mk = (events, gates = [1], safe = 0) => {
    const s = createState(2, defaultCfg, 1);
    s.zones = [{ x: 20, y: 100, w: 12, h: 8, gates }];
    s.people = { ...s.people, n: 10 }; s.counts.safe = safe; s.counts.alive = 10; s.counts.people0 = 100; s._pct = 10;
    for (const e of events) s.events.push({ tick: 300, x: 48, y: 20, text: '', ...e });
    return causeLine(s);
  };
  const ej = { kind: 'ember-jump', tick: 20 }, bb = { kind: 'break-breach', tick: 40 }, rc = { kind: 'road-cut', tick: 302 }, zh = { kind: 'zone-hit', tick: 361 }, gc = { kind: 'gate-closed', tick: 350 };
  assert.match(mk([ej, bb, rc]), /^No one reached the [a-z-]+ shelter: road cut at 1:15$/);
  assert.match(mk([ej, rc, zh]), /embers hit it at 1:30$/);
  assert.match(mk([ej, bb, gc]), /gate closed at 1:27$/);
  assert.match(mk([ej, bb]), /fire broke the [a-z-]+ break at 0:10$/);
  assert.match(mk([ej]), /embers jumped the [a-z-]+ break at 0:05$/);
  assert.match(mk([ej], []), /no road touches its edge, so it has no gate$/);
  // someone reached shelter: ordering shelter > road > break > ember
  assert.match(mk([ej, bb, rc, zh], [1], 5), /^Embers reached the [a-z-]+ shelter at 1:30$/);
  assert.match(mk([ej, bb, rc], [1], 5), /^Road cut [a-z-]+ at 1:15$/);
  assert.match(mk([ej, bb], [1], 5), /^Fire broke the [a-z-]+ break at 0:10$/);
  assert.match(mk([ej], [1], 5), /^Embers jumped the [a-z-]+ break at 0:05$/);
});

test('item 6: shelter-reach check warns on a gateless or far shelter, passes a good plan', () => {
  const s = createState(2, defaultCfg, 1); applyPlan(s, M_PLAN);
  const r = shelterReach(s);
  assert.equal(r.gateless, 1); assert.equal(r.share, 0);
  const g = createState(2, defaultCfg, 1); applyPlan(g, skilledPlan(g));
  const rg = shelterReach(g);
  console.log('shelter reach: M plan', r.share, 'skilled', rg.share.toFixed(2));
  assert.ok(rg.share >= defaultCfg.reachWarnShare, 'skilled plan does not trigger the warning: ' + rg.share);
  const n = createState(2, defaultCfg, 1); applyPlan(n, [{ t: 'zone', x: 20, y: 112, w: 13, h: 5 }]);
  const rn = shelterReach(n);
  assert.equal(rn.gateless, 0); assert.ok(rn.share > 0 && rn.share < defaultCfg.reachWarnShare, 'lone corner box reaches under half in 8 s, so warns: ' + rn.share);
  const e = createState(2, defaultCfg, 1); assert.equal(shelterReach(e).zones, 0);
  // check is read-only for the run: same hash with and without calling it
  const a = createState(2, defaultCfg, 4), b = createState(2, defaultCfg, 4);
  applyPlan(a, skilledPlan(a)); applyPlan(b, skilledPlan(b)); shelterReach(b);
  startRun(a); startRun(b); runToEnd(a, 20000); runToEnd(b, 20000);
  assert.equal(hashState(a), hashState(b));
});
