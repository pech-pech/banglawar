import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const { mulberry32, hashSeed, dailySeedString } = await import(src + '/rng.js');
const { cfg, resetCfg } = await import(src + '/config.js');
const { createCourse } = await import(src + '/terrain.js');
const { FIXED_DT, createSled, stepSled } = await import(src + '/sled.js');

const seeds = Array.from({ length: 20 }, (_, i) => hashSeed('bot-seed-' + i));
const mk = (s) => { resetCfg(); return createCourse(s, cfg); };
const J = JSON.stringify;

test('rng repeatable', () => {
  const a = mulberry32(123), b = mulberry32(123), c = mulberry32(124);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  assert.equal(hashSeed('x'), hashSeed('x'));
  assert.notEqual(hashSeed('x'), hashSeed('y'));
  assert.equal(dailySeedString(new Date(Date.UTC(2026, 0, 5, 23, 59))), '2026-01-05');
});

test('course same seed same output, different seeds differ', () => {
  const a = mk(777), b = mk(777), c = mk(778);
  const dump = (k) => J([k.centerX(300), k.halfWidth(300), k.height(3, 300), k.gatesInRange(0, 900), k.rocksInRange(0, 900), k.treesInRange(0, 900)]);
  assert.equal(dump(a), dump(b));
  assert.notEqual(dump(a), dump(c));
  assert.equal(a.length, cfg.runLength);
});

test('gates ordered, first at z>=80', () => {
  for (const s of seeds) {
    const k = mk(s);
    const g = k.gatesInRange(0, k.length);
    assert.ok(g.length > 5, 'gate count');
    assert.ok(g[0].z >= 80, 'first gate z ' + g[0].z);
    g.forEach((q, i) => { assert.equal(q.id, i); if (i) assert.ok(q.z > g[i - 1].z); });
  }
});

test('rocks avoid gate openings and z<90', () => {
  for (const s of seeds) {
    const k = mk(s);
    const g = k.gatesInRange(0, k.length), r = k.rocksInRange(0, k.length);
    assert.ok(r.length > 0);
    for (const rock of r) {
      assert.ok(rock.z >= 90, 'rock before 90: ' + rock.z);
      for (const gate of g) {
        if (Math.abs(rock.z - gate.z) < rock.r + 1 && Math.abs(rock.x - gate.x) < gate.width / 2 + rock.r)
          assert.fail(`seed ${s} rock ${rock.id} (${rock.x.toFixed(1)},${rock.z.toFixed(1)},r${rock.r}) in gate ${gate.id} (${gate.x.toFixed(1)},${gate.z.toFixed(1)},w${gate.width})`);
      }
    }
  }
});

test('range queries stable when split', () => {
  const k = mk(4242);
  for (const [name, f] of [['gatesInRange', 'gatesInRange'], ['rocksInRange', 'rocksInRange'], ['treesInRange', 'treesInRange']]) {
    const whole = k[f](0, 1000);
    const split = [...k[f](0, 437.3), ...k[f](437.3, 1000)];
    const key = (o) => J(o);
    assert.deepEqual(split.map(key).sort(), whole.map(key).sort(), name + ' split mismatch');
  }
});

function runScript(course, script, maxSteps) {
  const s = createSled(course);
  for (let i = 0; i < maxSteps && !s.crashed && !s.finished; i++) stepSled(s, course, script(i, s), cfg);
  return s;
}

test('sled deterministic for fixed input script', () => {
  const script = (i) => ({ steer: Math.sin(i / 90), fire: i % 700 === 699 });
  const a = runScript(mk(99), script, 6000), b = runScript(mk(99), script, 6000);
  assert.equal(J(a), J(b));
  assert.equal(FIXED_DT, 1 / 120);
  assert.ok(a.z > 0);
});

// Lookahead bot: every 24 steps a depth-5 tree search over steer {-1,0,1} held 0.4 s each,
// rolling the real sled forward; leaf score = gates, progress, closeness to next gate.
function centreBot(course) {
  const gates = course.gatesInRange(0, course.length);
  const opts = [0, -1, 1];
  let cur = 0;
  const leaf = (sim) => {
    const g = gates[sim.nextGate];
    let sc = sim.gatesPassed * 60 - sim.gatesMissed * 60 + sim.z * 0.2;
    if (g) sc -= Math.abs(sim.x - g.x) * 0.5;
    sc -= Math.max(0, Math.abs(sim.x - course.centerX(sim.z)) - course.halfWidth(sim.z) + 2) * 5;
    return sc;
  };
  const search = (s, depth) => {
    if (depth === 0) return leaf(s);
    let best = -Infinity;
    for (const c of opts) {
      const sim = { ...s };
      for (let k = 0; k < 48 && !sim.crashed; k++) stepSled(sim, course, { steer: c, fire: false }, cfg);
      const v = sim.crashed ? -1000 + sim.z : search(sim, depth - 1);
      if (v > best) best = v;
    }
    return best;
  };
  return (i, s) => {
    if (i % 24 === 0) {
      let best = -Infinity;
      for (const c of opts) {
        const sim = { ...s };
        for (let k = 0; k < 48 && !sim.crashed; k++) stepSled(sim, course, { steer: c, fire: false }, cfg);
        const v = sim.crashed ? -1000 + sim.z : search(sim, 3);
        if (v > best) { best = v; cur = c; }
      }
    }
    return { steer: cur, fire: s.boost >= 0.9 };
  };
}

const rows = [];
const MAX = 120 * 240;

// ---- Safe lane ----
const mkD = (s, density) => { resetCfg(); if (density != null) cfg.rockDensity = density; return createCourse(s, cfg); };

test('safe lane: clearance >= 2.4 m from every rock, slope <= 0.22, inside course', () => {
  for (const density of [null, 2.0]) {
    for (const s of seeds) {
      const k = mkD(s, density);
      const rocks = k.rocksInRange(0, k.length + 50);
      let prev = k.safeX(0);
      for (let z = 0; z <= k.length; z += 0.5) {
        const x = k.safeX(z);
        if (z > 0) assert.ok(Math.abs(x - prev) / 0.5 <= 0.22 + 1e-9, `seed ${s} slope at z=${z}: ${(Math.abs(x - prev) / 0.5).toFixed(3)}`);
        prev = x;
        assert.ok(Math.abs(x - k.centerX(z)) <= k.halfWidth(z), `seed ${s} lane outside course at z=${z}`);
      }
      for (const r of rocks) {
        let minGap = Infinity;
        for (let zz = r.z - r.r; zz <= r.z + r.r + 1e-9; zz += 0.25) minGap = Math.min(minGap, Math.abs(r.x - k.safeX(zz)) - r.r);
        // also sample the 0.5 m grid points inside the extent
        for (let z = Math.ceil((r.z - r.r) / 0.5) * 0.5; z <= r.z + r.r; z += 0.5) minGap = Math.min(minGap, Math.abs(r.x - k.safeX(z)) - r.r);
        assert.ok(minGap >= 2.4 - 1e-6, `seed ${s} density ${density} rock ${r.id} (${r.x.toFixed(1)},${r.z.toFixed(1)},r${r.r.toFixed(2)}) lane gap ${minGap.toFixed(2)}`);
      }
    }
  }
});

test('every gate within 5 m of safeX', () => {
  for (const s of seeds) {
    const k = mk(s);
    for (const g of k.gatesInRange(0, k.length)) {
      const d = Math.abs(g.x - k.safeX(g.z));
      assert.ok(d <= 5, `seed ${s} gate ${g.id} z=${g.z} is ${d.toFixed(2)} m from lane`);
    }
  }
});

test('no rock before z=90 (default and rockDensity 2.0)', () => {
  for (const density of [null, 2.0]) {
    for (const s of seeds) {
      for (const r of mkD(s, density).rocksInRange(0, 1800)) assert.ok(r.z >= 90, `seed ${s} rock at z=${r.z}`);
    }
  }
});

// Lane bot: steer proportional to safeX(z + lookahead) - x. No rock avoidance, no boost.
function laneBot(course, lookahead = 12, kp = 0.5) {
  return (i, s) => ({ steer: Math.max(-1, Math.min(1, kp * (course.safeX(s.z + lookahead) - s.x))), fire: false });
}
for (const [label, density] of [['lane', null], ['lane@2.0', 2.0]]) {
  test(`lane bot finishes 20/20 seeds (${label})`, () => {
    let fin = 0, tmin = Infinity, tmax = -Infinity, missed = 0;
    const fails = [];
    for (const s of seeds) {
      const k = mkD(s, density);
      const st = runScript(k, laneBot(k), MAX);
      rows.push([label, s, st.finished ? 'finish' : st.crashed ? 'crash' : 'timeout', st.t.toFixed(1), st.gatesPassed, st.gatesMissed, st.z.toFixed(0)]);
      missed += st.gatesMissed;
      if (st.finished) { fin++; tmin = Math.min(tmin, st.t); tmax = Math.max(tmax, st.t); }
      else fails.push(`${s}:${st.crashed ? 'crash' : 'timeout'}@z${st.z.toFixed(0)}`);
    }
    console.log(`${label}: finished ${fin}/20, time ${tmin.toFixed(1)}-${tmax.toFixed(1)} s, gates missed total ${missed}`);
    assert.equal(fin, 20, `lane bot finished ${fin}/20; failures ${fails.join(' ')}`);
  });
}
test('centre-line bot finishes on 20 seeds (logged)', () => {
  let fin = 0;
  for (const s of seeds) {
    const k = mk(s);
    const st = runScript(k, centreBot(k), MAX);
    if (st.finished) fin++;
    rows.push(['centre', s, st.finished ? 'finish' : st.crashed ? 'crash' : 'timeout', st.t.toFixed(1), st.gatesPassed, st.gatesMissed, st.z.toFixed(0)]);
  }
  assert.ok(fin >= 1, `centre bot finished ${fin}/20`);
});

test('idle bot result recorded on 20 seeds', () => {
  for (const s of seeds) {
    const k = mk(s);
    const st = runScript(k, () => ({ steer: 0, fire: false }), MAX);
    rows.push(['idle', s, st.finished ? 'finish' : st.crashed ? 'crash' : 'timeout', st.t.toFixed(1), st.gatesPassed, st.gatesMissed, st.z.toFixed(0)]);
  }
  assert.equal(rows.filter((r) => r[0] === 'idle').length, 20);
});

test.after(() => {
  const head = ['bot', 'seed', 'end', 'time', 'passed', 'missed', 'z'];
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
  const txt = all.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')).join('\n');
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  fs.writeFileSync(path.join(here, 'out/bots.txt'), txt + '\n');
  console.log(txt);
});
