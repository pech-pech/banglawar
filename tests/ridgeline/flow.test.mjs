// Flow layer: unit tests on synthetic flat courses, medal edges, and the cautious vs brave bot table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const { hashSeed } = await import(src + '/rng.js');
const { cfg, resetCfg } = await import(src + '/config.js');
const { createCourse } = await import(src + '/terrain.js');
const { FIXED_DT, createSled, stepSled } = await import(src + '/sled.js');
const { medalTimes, medalFor } = await import(src + '/medals.js');

const J = JSON.stringify;
const seeds = Array.from({ length: 20 }, (_, i) => hashSeed('bot-seed-' + i));

// ---- synthetic flat course: no edge, optional rocks and gates ----
function flat({ rocks = [], gates = [], length = 1e6 } = {}) {
  return {
    length,
    centerX: () => 0, halfWidth: () => 1e6, height: () => 0, safeX: () => 0,
    rocksInRange: (a, b) => rocks.filter((r) => r.z >= a && r.z <= b),
    gatesInRange: (a, b) => gates.filter((g) => g.z >= a && g.z <= b),
  };
}
const ROCK = { id: 7, x: 0, z: 100, r: 1 };
const SLED_R = 0.8;
// Place sled so that after one step the edge gap to ROCK is `gap` (dz ~ 0), no steering.
function hold(s, k, gap) {
  s.x = ROCK.x - (ROCK.r + SLED_R + gap); s.vx = 0; s.z = ROCK.z - s.speed * FIXED_DT;
  return stepSled(s, k, { steer: 0, fire: false }, cfg);
}
const types = (ev) => ev.map((e) => e.type + (e.tier ? ':' + e.tier : '') + (e.level !== undefined ? ':' + e.level : ''));

test('graze tier charge multipliers (outer 0.35x, inner 1x, razor 2x of chargeRate)', () => {
  resetCfg();
  const k = flat({ rocks: [ROCK] });
  const got = {};
  for (const [name, gap] of [['outer', 2.5], ['inner', 1.2], ['razor', 0.5], ['none', 3.4]]) {
    const s = createSled(k);
    hold(s, k, gap);
    got[name] = s.boost;
  }
  const base = cfg.chargeRate * FIXED_DT;
  assert.equal(got.none, 0);
  assert.ok(Math.abs(got.outer - base * cfg.grazeOuterMul) < 1e-12, 'outer ' + got.outer);
  assert.ok(Math.abs(got.inner - base * cfg.grazeInnerMul) < 1e-12, 'inner ' + got.inner);
  assert.ok(Math.abs(got.razor - base * cfg.grazeRazorMul) < 1e-12, 'razor ' + got.razor);
  assert.ok(Math.abs(got.razor / got.inner - 2) < 1e-9 && Math.abs(got.outer / got.inner - 0.35) < 1e-9);
});

test('grazeTier state reports the max tier this step', () => {
  resetCfg();
  const k = flat({ rocks: [ROCK] });
  for (const [gap, tier] of [[2.5, 'outer'], [1.2, 'inner'], [0.5, 'razor'], [3.5, '']]) {
    const s = createSled(k); hold(s, k, gap);
    assert.equal(s.grazeTier, tier, 'gap ' + gap);
  }
});

test('one rock never pays more than 2 links', () => {
  resetCfg();
  // direct razor, then keep grazing for a long time
  let k = flat({ rocks: [ROCK] });
  let s = createSled(k);
  const ev = [];
  for (let i = 0; i < 400; i++) ev.push(...hold(s, k, 0.5));
  assert.equal(s.links, 2);
  assert.equal(s.razors, 1);
  assert.equal(s.inners, 0);
  assert.equal(ev.filter((e) => e.type === 'graze').length, 1);
  assert.equal(ev.filter((e) => e.type === 'flowUp').length, 2);
  // inner, razor, inner, razor in a loop: still 2 total
  s = createSled(k);
  for (let i = 0; i < 300; i++) hold(s, k, i % 2 ? 0.5 : 1.2);
  assert.equal(s._graze.get(ROCK.id), 2);
  assert.equal(s.links, 2);
  // inner only pays 1
  s = createSled(k);
  for (let i = 0; i < 300; i++) hold(s, k, 1.2);
  assert.equal(s.links, 1);
  assert.equal(s.inners, 1);
});

test('inner then razor event order: graze inner, flowUp 1, graze razor, flowUp 2', () => {
  resetCfg();
  const k = flat({ rocks: [ROCK] });
  const s = createSled(k);
  const ev = [];
  ev.push(...hold(s, k, 1.2));
  ev.push(...hold(s, k, 1.2));
  ev.push(...hold(s, k, 0.5));
  assert.deepEqual(types(ev), ['graze:inner', 'flowUp:1', 'graze:razor', 'flowUp:2']);
  assert.equal(ev[0].rockId, ROCK.id);
  assert.equal(s.flow, 2);
  assert.equal(s.links, 2);
  // direct razor pays both links in one step
  const s2 = createSled(k);
  assert.deepEqual(types(hold(s2, k, 0.5)), ['graze:razor', 'flowUp:1', 'flowUp:2']);
});

test('window decay drops one level and restarts; last level empties flow', () => {
  resetCfg();
  const k = flat();
  const s = createSled(k);
  s.flow = 3; s.flowWin = cfg.flowWindow1 + (cfg.flowWindow5 - cfg.flowWindow1) * 2 / 4; s.flowT = s.flowWin;
  const w3 = s.flowWin;
  const w2 = cfg.flowWindow1 + (cfg.flowWindow5 - cfg.flowWindow1) * 1 / 4;
  let drops = [], steps = 0;
  while (!drops.length && steps < 2000) { drops.push(...stepSled(s, k, {}, cfg).filter((e) => e.type === 'flowDrop')); steps++; }
  assert.deepEqual(drops, [{ type: 'flowDrop', level: 2 }]);
  assert.ok(Math.abs(steps * FIXED_DT - w3) < 2 * FIXED_DT, `dropped after ${steps * FIXED_DT} s, window ${w3}`);
  assert.equal(s.flow, 2);
  assert.ok(Math.abs(s.flowWin - w2) < 1e-12);
  assert.ok(Math.abs(s.flowT - w2) < 1e-12, 'window restarted');
  // run on to zero
  const all = [];
  for (let i = 0; i < 2000 * 3; i++) all.push(...stepSled(s, k, {}, cfg).filter((e) => e.type === 'flowDrop').map((e) => e.level));
  assert.deepEqual(all, [1, 0]);
  assert.equal(s.flow, 0); assert.equal(s.flowT, 0); assert.equal(s.flowWin, 0);
});

test('flow 5 time accumulates only at flow 5', () => {
  resetCfg();
  const k = flat();
  const s = createSled(k);
  s.flow = 5; s.flowWin = cfg.flowWindow5; s.flowT = s.flowWin;
  for (let i = 0; i < 60; i++) stepSled(s, k, {}, cfg);
  assert.ok(Math.abs(s.flow5T - 60 * FIXED_DT) < 1e-9);
});

const GATE = { id: 0, z: 100, x: 0, width: 7 };
function gateStep(x, flow) {
  resetCfg();
  const k = flat({ gates: [GATE] });
  const s = createSled(k);
  s.x = x; s.vx = 0; s.z = GATE.z - 0.05; s.flow = flow;
  if (flow) { s.flowWin = 2; s.flowT = 2; }
  const ev = stepSled(s, k, {}, cfg);
  return { s, ev };
}

test('gate miss: flow to 0 with exactly one flowDrop (and none when flow already 0)', () => {
  let { s, ev } = gateStep(6, 4);
  assert.equal(s.flow, 0); assert.equal(s.gatesMissed, 1);
  assert.deepEqual(types(ev), ['miss', 'flowDrop:0']);
  for (let i = 0; i < 1000; i++) assert.equal(stepSled(s, flat({ gates: [GATE] }), {}, cfg).filter((e) => e.type === 'flowDrop').length, 0);
  ({ s, ev } = gateStep(6, 0));
  assert.deepEqual(types(ev), ['miss']);
});

test('centred gate: link + gate event centred:true; off-centre pass gives no link', () => {
  let { s, ev } = gateStep(0.5, 0);
  const g = ev.find((e) => e.type === 'gate');
  assert.equal(g.centred, true);
  assert.equal(s.flow, 1); assert.equal(s.centred, 1); assert.equal(s.links, 1);
  assert.deepEqual(types(ev), ['gate', 'flowUp:1']);
  assert.equal(s.boost, 0, 'no charge from a gate');
  // edge of the band: width*gateCentreFrac = 1.1669
  ({ s, ev } = gateStep(1.1, 0)); assert.equal(ev.find((e) => e.type === 'gate').centred, true);
  ({ s, ev } = gateStep(1.3, 0));
  assert.equal(ev.find((e) => e.type === 'gate').centred, false);
  assert.equal(s.flow, 0); assert.equal(s.links, 0); assert.equal(s.gatesPassed, 1);
});

test('boost link only when charge >= flowBoostMin', () => {
  resetCfg();
  const k = flat();
  for (const [charge, link] of [[0.49, false], [0.3, false], [0.5, true], [0.9, true]]) {
    const s = createSled(k); s.boost = charge;
    const ev = stepSled(s, k, { fire: true }, cfg);
    assert.ok(ev.some((e) => e.type === 'boost'), 'boost fired at ' + charge);
    assert.equal(s.boostLinks, link ? 1 : 0, 'charge ' + charge);
    assert.equal(s.flow, link ? 1 : 0);
    assert.equal(ev.some((e) => e.type === 'flowUp'), link);
  }
  // below the fire floor nothing happens
  const s = createSled(k); s.boost = 0.2;
  assert.equal(stepSled(s, k, { fire: true }, cfg).length, 0);
});

test('flowStep raises top speed (flow 5 vs 0, +20% at 0.04)', () => {
  const run = (flow, step) => {
    resetCfg(); cfg.flowStep = step; cfg.flowWindow1 = 1e9; cfg.flowWindow5 = 1e9;
    const k = flat(); const s = createSled(k);
    s.flow = flow; s.flowWin = 1e9; s.flowT = 1e9;
    for (let i = 0; i < 120 * 25; i++) stepSled(s, k, {}, cfg);
    return s.speed;
  };
  const v0 = run(0, 0.04), v5 = run(5, 0.04), v5off = run(5, 0);
  assert.ok(v5 > v0 + 3, `flow 5 ${v5} vs ${v0}`);
  assert.ok(Math.abs(v5 / v0 - 1.2) < 0.01, 'ratio ' + v5 / v0);
  assert.ok(Math.abs(v5off - v0) < 1e-6, 'flowStep 0 -> no bonus');
  resetCfg();
});

function snapshot(s) {
  const o = { ...s, _graze: [...s._graze.entries()], _rocks: s._rocks.length };
  delete o._gate;
  return J(o);
}
test('determinism: same seed + input script -> identical final state and events', () => {
  const script = (i, s) => ({ steer: Math.sin(i / 70) * 0.9, fire: s.boost >= 0.6 });
  const go = () => {
    resetCfg();
    const k = createCourse(hashSeed('flow-det'), cfg);
    const s = createSled(k); const all = [];
    for (let i = 0; i < 9000 && !s.crashed && !s.finished; i++) all.push(...stepSled(s, k, script(i, s), cfg));
    return { fin: snapshot(s), ev: J(all), n: all.length, s };
  };
  const a = go(), b = go();
  assert.equal(a.fin, b.fin);
  assert.equal(a.ev, b.ev);
  assert.ok(a.n > 0 && a.s.z > 100);
});

test('medalFor edges', () => {
  const t = { summit: 95, gold: 100, silver: 108, bronze: 118 };
  const eq = (v, name, next, gap) => {
    const m = medalFor(v, t);
    assert.equal(m.name, name, 'name at ' + v); assert.equal(m.next, next, 'next at ' + v);
    if (gap === null) assert.equal(m.gap, null); else assert.ok(Math.abs(m.gap - gap) < 1e-9, `gap at ${v}: ${m.gap}`);
  };
  eq(80, 'Summit', null, null);
  eq(95, 'Summit', null, null);           // exact tie earns it
  eq(95.01, 'Gold', 'Summit', 0.01);
  eq(100, 'Gold', 'Summit', 5);           // exact tie earns it
  eq(100.01, 'Silver', 'Gold', 0.01);
  eq(108, 'Silver', 'Gold', 8);
  eq(108.5, 'Bronze', 'Silver', 0.5);
  eq(118, 'Bronze', 'Silver', 10);
  eq(118.01, null, 'Bronze', 0.01);       // beyond bronze: no medal, gap to bronze
  eq(130, null, 'Bronze', 12);
});

test('medalTimes: gold = length / pace + gates x gateSec, factors applied', () => {
  resetCfg();
  const k = createCourse(seeds[0], cfg);
  const n = k.gatesInRange(-1, k.length + 1).length;
  let t = medalTimes(k, cfg);
  assert.ok(Math.abs(t.gold - k.length / cfg.medalPace) < 1e-9);
  assert.ok(Math.abs(t.summit - t.gold * cfg.medalSummit) < 1e-9);
  assert.ok(t.summit < t.gold && t.gold < t.silver && t.silver < t.bronze);
  cfg.medalGateSec = 0.5;
  t = medalTimes(k, cfg);
  assert.ok(Math.abs(t.gold - (k.length / cfg.medalPace + n * 0.5)) < 1e-9);
  resetCfg();
});

// ================= Bots: cautious (~2 m gap) vs brave (~0.3 m gap) =================
// Lookahead search like the centre bot in unit.test.mjs (depth 4 x 0.4 s, steer {0,-1,1}) rolling the real sled, but
// the rollout also scores rock gaps (with a desired gap), gate centring, flow links. The sled clone copies the
// _graze Map, otherwise the search would pay links on the real sled.
const cloneSled = (s) => ({ ...s, _graze: new Map(s._graze) });

function gapBot(course, { gap, linkW, gapW, fireAt = 0.55 }) {
  const gates = course.gatesInRange(0, course.length);
  const opts = [0, -1, 1];
  let cur = 0;
  const roll = (s0, c) => {
    const sim = cloneSled(s0); let pen = 0;
    for (let k = 0; k < 48 && !sim.crashed; k++) {
      stepSled(sim, course, { steer: c, fire: false }, cfg);
      if (k % 4 === 3 && !sim.crashed) {
        for (const r of sim._rocks) {
          const dz = r.z - sim.z; if (dz > 14 || dz < -6) continue;
          const g = Math.hypot(r.x - sim.x, dz) - r.r - 0.8;
          if (g < gap) pen += (gap - g) * (gap - g) * gapW;
        }
      }
    }
    return { sim, pen };
  };
  const leaf = (sim) => {
    const g = gates[sim.nextGate];
    let sc = sim.gatesPassed * 60 - sim.gatesMissed * 60 + sim.z * 0.2 + sim.links * linkW;
    if (g) sc -= Math.abs(sim.x - g.x) * 0.5;
    sc -= Math.max(0, Math.abs(sim.x - course.centerX(sim.z)) - course.halfWidth(sim.z) + 2) * 5;
    return sc;
  };
  const search = (s, depth) => {
    let best = -Infinity;
    for (const c of opts) {
      const { sim, pen } = roll(s, c);
      const v = sim.crashed ? -1000 + sim.z : (depth === 1 ? leaf(sim) : search(sim, depth - 1)) - pen;
      if (v > best) best = v;
    }
    return best;
  };
  return (i, s) => {
    if (i % 24 === 0) {
      let best = -Infinity;
      for (const c of opts) {
        const { sim, pen } = roll(s, c);
        const v = sim.crashed ? -1000 + sim.z : search(sim, 3) - pen;
        if (v > best) { best = v; cur = c; }
      }
    }
    return { steer: cur, fire: s.boost >= fireAt };
  };
}
const cautiousBot = (k) => gapBot(k, { gap: 2.0, linkW: 0, gapW: 30 });
const braveBot = (k) => gapBot(k, { gap: 0.3, linkW: 12, gapW: 400 });

function runBot(course, bot) {
  const s = createSled(course);
  let flowSteps = 0, n = 0;
  for (let i = 0; i < 120 * 240 && !s.crashed && !s.finished; i++) {
    stepSled(s, course, bot(i, s), cfg);
    if (s.flow >= 1) flowSteps++;
    n++;
  }
  return { s, flowPct: n ? 100 * flowSteps / n : 0 };
}
const median = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

test('bot table: cautious vs brave on 20 seeds (logged), both finish >= 10/20', () => {
  const res = {};
  for (const [name, make] of [['cautious', cautiousBot], ['brave', braveBot]]) {
    const runs = seeds.map((sd) => { resetCfg(); const k = createCourse(sd, cfg); return { sd, ...runBot(k, make(k)) }; });
    res[name] = runs;
  }
  const stat = (runs) => {
    const f = runs.filter((r) => r.s.finished);
    return {
      fin: f.length, medT: median(f.map((r) => r.s.t)), bestT: Math.min(...f.map((r) => r.s.t)), worstT: Math.max(...f.map((r) => r.s.t)), p90T: [...f.map((r) => r.s.t)].sort((x, y) => x - y)[Math.floor(f.length * 0.9) - 1],
      links: mean(runs.map((r) => r.s.links)), razors: mean(runs.map((r) => r.s.razors)), inners: mean(runs.map((r) => r.s.inners)),
      centred: mean(runs.map((r) => r.s.centred)), boostLinks: mean(runs.map((r) => r.s.boostLinks)),
      peak: mean(runs.map((r) => r.s.flowPeak)), flow5: mean(runs.map((r) => r.s.flow5T)), pct: mean(runs.map((r) => r.flowPct)),
      missed: mean(runs.map((r) => r.s.gatesMissed)),
    };
  };
  const C = stat(res.cautious), B = stat(res.brave);
  const faster = (C.medT - B.medT) / C.medT * 100;
  // matched seeds (finished by both)
  const pair = seeds.map((_, i) => [res.cautious[i], res.brave[i]]).filter(([c, b]) => c.s.finished && b.s.finished);
  const fasterPaired = mean(pair.map(([c, b]) => (c.s.t - b.s.t) / c.s.t * 100));

  // medal fit: gold = median brave, summit edge = best brave, silver/bronze border = median cautious
  resetCfg();
  const L = cfg.runLength;
  const pace = L / B.medT;
  const fSummit = B.bestT / B.medT, fSilver = C.medT / B.medT, fBronze = C.p90T / B.medT;
  const gateN = mean(seeds.map((sd) => createCourse(sd, cfg).gatesInRange(-1, L + 1).length));
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a'), f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a');
  const head = ['bot', 'finish', 'median s', 'best s', 'worst s', 'links', 'razor', 'inner', 'centred', 'boost lk', 'peak', 'flow5 s', '%t flow>=1', 'gates missed'];
  const row = (n, x) => [n, x.fin + '/20', f1(x.medT), f1(x.bestT), f1(x.worstT), f1(x.links), f1(x.razors), f1(x.inners), f1(x.centred), f1(x.boostLinks), f1(x.peak), f1(x.flow5), f1(x.pct), f1(x.missed)];
  const rowsT = [head, row('cautious', C), row('brave', B)];
  const w = head.map((_, i) => Math.max(...rowsT.map((r) => String(r[i]).length)));
  const table = rowsT.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')).join('\n');
  const per = ['seed idx  cautious(end,t,links)        brave(end,t,links,razor)'];
  seeds.forEach((_, i) => {
    const c = res.cautious[i].s, b = res.brave[i].s;
    const e = (s) => (s.finished ? 'fin  ' : s.crashed ? 'crash' : 'tmo  ');
    per.push(`${String(i).padEnd(8)} ${e(c)} ${c.t.toFixed(1).padStart(5)} ${String(c.links).padStart(3)}              ${e(b)} ${b.t.toFixed(1).padStart(5)} ${String(b.links).padStart(3)} ${String(b.razors).padStart(2)}`);
  });
  const txt = [
    `Ridgeline flow bots, default config, 20 seeds (hashSeed('bot-seed-'+i)), course length ${L} m, mean ${gateN.toFixed(1)} gates`,
    '',
    table,
    '',
    `brave vs cautious: median finish ${f1(C.medT)} -> ${f1(B.medT)} s = ${f2(faster)}% faster (target 6-10%); matched-seed mean ${f2(fasterPaired)}% over ${pair.length} seeds`,
    '',
    'Medal fit (gold = median brave, summit edge = best brave, silver/bronze border = median cautious, bronze = cautious p90 finish, the slowest one is an outlier):',
    `  suggested medalPace ${f1(pace)} m/s (gold ${f1(B.medT)} s on ${L} m)   [default 34]`,
    `  suggested medalSummit ${f2(fSummit)}  medalSilver ${f2(fSilver)}  medalBronze ${f2(fBronze)}   [defaults 0.95 / 1.08 / 1.18]`,
    `  medalGateSec: keep 0 (gate count is ~constant across seeds, ${gateN.toFixed(1)}; the pace constant absorbs it)`,
    '',
    ...per,
    '',
  ].join('\n');
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  fs.writeFileSync(path.join(here, 'out/flow-bots.txt'), txt);
  console.log(txt);
  resetCfg();
  assert.ok(C.fin >= 10, `cautious finished ${C.fin}/20`);
  assert.ok(B.fin >= 10, `brave finished ${B.fin}/20`);
});

test('flowGateCap: centred gate lifts 0 -> 1 only; at flow >= cap it pays nothing', () => {
  let { s, ev } = gateStep(0.5, 1);
  assert.equal(s.flow, 1); assert.equal(s.links, 0); assert.equal(s.centred, 1);
  assert.equal(ev.some((e) => e.type === 'flowUp'), false);
  assert.equal(ev.find((e) => e.type === 'gate').centred, true);
  ({ s, ev } = gateStep(0.5, 3));
  assert.equal(s.flow, 3); assert.equal(s.links, 0);
});
