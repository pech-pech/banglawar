import test from 'node:test';
import assert from 'node:assert/strict';
import { createNight, frontSpeed, stageFor, KEYS, FIXED_DT } from '../../pages/ridgeline/src/night.js';

const cfg = {};
for (const k in KEYS) cfg[k] = KEYS[k].def;
cfg.recoverGrace = 1.5;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('gap math: start 150, integrates (speed - vf) dt', () => {
  const n = createNight(cfg);
  assert.equal(n.gap, 150);
  n.step(1, 0, { speed: 30 });   // vf(0)=22 -> +8 but soft cap drains excess over 150
  const exp = 158 - 8 * 0.05 * 1;
  near(n.gap, exp, 1e-9);
  const m = createNight({ ...cfg, gapSoft: 999 });
  m.step(1, 0, { speed: 10 });
  near(m.gap, 150 - 12);
  m.hitGap(20, 'miss');
  near(m.gap, 118);
});

test('hitGap returns gap_hit event', () => {
  const n = createNight(cfg);
  assert.deepEqual(n.hitGap(20, 'miss'), [{ type: 'gap_hit', amount: 20, cause: 'miss' }]);
  assert.equal(n.gap, 130);
  assert.deepEqual(n.hitGap(0, 'x'), []);
});

test('stages with 6 m hysteresis', () => {
  assert.equal(stageFor(150, null, cfg), 'far');
  assert.equal(stageFor(129, 'far', cfg), 'near');
  assert.equal(stageFor(131, 'near', cfg), 'near');   // needs >= 136 to go back
  assert.equal(stageFor(136, 'near', cfg), 'far');
  assert.equal(stageFor(59, 'near', cfg), 'heels');
  assert.equal(stageFor(63, 'heels', cfg), 'heels');  // needs >= 66
  assert.equal(stageFor(66, 'heels', cfg), 'near');
  const n = createNight({ ...cfg, gapSoft: 999 });
  n.hitGap(25, 'x');  // 125 -> near
  const ev = n.step(FIXED_DT, 0, { speed: 22 });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'night_stage'); assert.equal(ev[0].stage, 'near');
  assert.equal(n.stage, 'near');
});

test('soft cap drains excess, hard cap clamps', () => {
  const n = createNight(cfg);
  for (let i = 0; i < 120 * 200; i++) n.step(FIXED_DT, 0, { speed: 22 });  // front at d=0 is 22: no gain
  assert.ok(n.gap <= 150.0001);
  const b = createNight({ ...cfg, gapSoft: 300, gapMax: 240 });
  for (let i = 0; i < 1200; i++) b.step(FIXED_DT, 0, { speed: 60 });
  assert.equal(b.gap, 240);
  // soft cap equilibrium: excess e where 0.05 e = surplus speed 10 -> e = 200? clamps at gapMax 240
  const c = createNight(cfg);
  for (let i = 0; i < 120 * 300; i++) c.step(FIXED_DT, 0, { speed: 24 });  // surplus 2 -> excess 40 -> gap 190
  near(c.gap, 190, 0.5);
});

test('wreck floor 15 m only after cooldown, front keeps moving', () => {
  const n = createNight(cfg);
  n.hitGap(140, 'x');   // gap 10
  assert.equal(n.onWreckStart(1000), true);
  assert.equal(n.gap, 15);
  for (let i = 0; i < 600; i++) n.step(FIXED_DT, 1000, { speed: 0, recovering: true });
  assert.equal(n.gap, 15); assert.ok(!n.caught);
  assert.ok(n.vf > 22);
  n.onWreckEnd();
  for (let i = 0; i < 100; i++) n.step(FIXED_DT, 1000, { speed: 0 });   // still in grace (1.5 s = 180 steps)
  assert.equal(n.gap, 15);
  for (let i = 0; i < 200; i++) n.step(FIXED_DT, 1000, { speed: 0 });
  assert.ok(n.gap < 15);   // floor released
  // second wreck 300 m later: no floor
  const m = createNight(cfg);
  m.onWreckStart(1000); m.onWreckEnd();
  m.hitGap(140, 'x');
  assert.equal(m.onWreckStart(1300), false);
  assert.ok(m.gap <= 10.0001);
  const ev = m.step(FIXED_DT, 1300, { speed: 0, recovering: true }).concat(m.step(1, 1300, { speed: 0, recovering: true }));
  assert.ok(ev.some(e => e.type === 'caught'));
  // after cooldown elapses since the last wreck, floor again
  const q = createNight(cfg);
  q.onWreckStart(1000); q.onWreckEnd();
  assert.equal(q.onWreckStart(1601), true);
  assert.equal(q.onWreckStart(2000), false);   // last wreck was 1601
});

test('caught: gap <= 0 once, with dist; frozen afterwards', () => {
  const n = createNight(cfg);
  n.hitGap(150, 'x');
  const ev = n.step(FIXED_DT, 777, { speed: 20 });
  assert.deepEqual(ev.filter(e => e.type === 'caught'), [{ type: 'caught', dist: 777 }]);
  assert.ok(n.caught);
  assert.deepEqual(n.step(FIXED_DT, 800, { speed: 20 }), []);
  n.reset();
  assert.ok(!n.caught); assert.equal(n.gap, 150);
});

test('caught in air: on touchdown or after 1.5 s', () => {
  const a = createNight(cfg);
  a.hitGap(150, 'x');
  let ev = a.step(FIXED_DT, 500, { speed: 20, air: true });
  assert.ok(!ev.some(e => e.type === 'caught')); assert.ok(a.state().airWait);
  for (let i = 0; i < 60; i++) a.step(FIXED_DT, 500, { speed: 50, air: true });   // speed high, still waiting
  assert.ok(!a.caught);
  ev = a.step(FIXED_DT, 510, { speed: 50, air: false });
  assert.equal(ev[0].type, 'caught'); assert.equal(ev[0].dist, 510);
  const b = createNight(cfg);
  b.hitGap(150, 'x');
  let got = null;
  for (let i = 0; i < 200 && !got; i++) { const e = b.step(FIXED_DT, 500, { speed: 20, air: true }); if (e.length) got = i; }
  assert.ok(got >= 177 && got <= 181, `got ${got}`);   // ~1.5 s = 180 steps
});

test('determinism: same inputs same outputs', () => {
  const run = () => {
    const n = createNight(cfg); const log = [];
    for (let i = 0; i < 20000; i++) {
      const d = i * 0.3;
      const e = n.step(FIXED_DT, d, { speed: 20 + 12 * Math.sin(i / 700) + 10, air: i % 900 > 700, lap: Math.floor(d / 7500) });
      if (i % 1500 === 0) n.hitGap(20, 'miss');
      log.push(n.gap, ...e.map(x => x.type + (x.stage || '')));
    }
    return JSON.stringify(log);
  };
  assert.equal(run(), run());
});

test('front pace table to 30 km', () => {
  const f = (d, lap = 0) => Math.min(56, 22 + 6 * (1 - Math.exp(-d / 1500)) + 1.7 * d / 1000) + 0.6 * lap;
  const rows = [0, 1500, 2500, 5000, 10000, 15000, 20000, 25000, 30000];
  let prev = 0;
  for (const d of rows) {
    const lap = Math.floor(d / 7500);
    near(frontSpeed(d, lap, cfg), f(d, lap), 1e-6);
    assert.ok(frontSpeed(d, 0, cfg) >= prev); prev = frontSpeed(d, 0, cfg);
  }
  near(frontSpeed(0, 0, cfg), 22);
  near(frontSpeed(1500, 0, cfg), 28.3427, 1e-3);
  assert.ok(frontSpeed(2500, 0, cfg) > 30 - 0.5 && frontSpeed(2500, 0, cfg) < 33);
  near(frontSpeed(20000, 0, cfg), 56);          // capped (22+6+34 = 62 -> 56)
  near(frontSpeed(30000, 4, cfg), 56 + 2.4);    // lap term is added after the cap
  near(frontSpeed(12000, 0, cfg), 22 + 6 * (1 - Math.exp(-8)) + 20.4, 1e-6);
});

test('KEYS shape and cfg fallback', () => {
  for (const k in KEYS) { const e = KEYS[k]; assert.ok(e.min <= e.def && e.def <= e.max, k); assert.ok(e.label && e.group && e.step > 0); }
  const n = createNight(undefined);
  assert.equal(n.gap, 150);
  assert.equal(createNight({ gapStart: 200 }).gap, 200);
});
