// Ridgeline B1 bot run statistics. Not a test: plays full runs headless with the real sled and Rapier physics,
// then prints a table of per-bot means and totals.
// Usage: node tests/ridgeline/ridestats.mjs
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { cfg, resetCfg, DEFAULTS } from '../../pages/ridgeline/src/config.js';
import { createSled, stepSled, FIXED_DT } from '../../pages/ridgeline/src/sled.js';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const SEEDS = 20;
const MAX_SIM_S = 600; // game-time cap per run; a run that reaches it is reported as timeout
const LOOK_AHEAD = 12;
const GRADES = ['clean', 'rough', 'slam', 'wreck'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// float: finger down always. dive: down only while on the ground (released in the air).
const BOTS = {
  float: () => true,
  dive: (s) => s.mode !== 'air',
};

const R = await loadRapier();

function playRun(seedStr, bot) {
  resetCfg();
  const seed = hashSeed(seedStr);
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  phys.update(0);
  const s = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0));

  const run = {
    result: 'timeout', time: 0, launches: 0, flights: [], steps: 0, airSteps: 0,
    grades: { clean: 0, rough: 0, slam: 0, wreck: 0 }, recovered: 0, maxSpeed: 0,
  };
  const maxSteps = Math.round(MAX_SIM_S / FIXED_DT);
  try {
    for (let i = 0; i < maxSteps; i++) {
      phys.update(s.z);
      const target = course.safeX(s.z + LOOK_AHEAD);
      const steer = clamp((target - s.x) * 0.4, -1, 1);
      const down = bot(s);
      const events = stepSled(s, course, { steer, fire: false, down }, cfg);
      run.steps++;
      if (s.mode === 'air') run.airSteps++;
      if (s.speed > run.maxSpeed) run.maxSpeed = s.speed;
      for (const ev of events) {
        if (ev.type === 'launch') run.launches++;
        else if (ev.type === 'land' && !ev.hop) {
          run.grades[ev.grade]++;
          run.flights.push(ev.flight);
        } else if (ev.type === 'recover_end') run.recovered++;
      }
      if (s.finished) { run.result = 'finish'; break; }
      if (s.crashed) { run.result = 'crash'; break; }
    }
  } finally {
    phys.dispose();
  }
  run.time = s.t;
  return run;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

function summarise(runs) {
  const finished = runs.filter((r) => r.result === 'finish');
  const withFlights = runs.filter((r) => r.flights.length > 0);
  const totalSteps = sum(runs.map((r) => r.steps));
  const flightAll = runs.flatMap((r) => r.flights);
  return {
    n: runs.length,
    finish: finished.length,
    crash: runs.filter((r) => r.result === 'crash').length,
    timeout: runs.filter((r) => r.result === 'timeout').length,
    meanTime: mean(finished.map((r) => r.time)),
    launches: mean(runs.map((r) => r.launches)),
    launchesTot: sum(runs.map((r) => r.launches)),
    flight: mean(withFlights.map((r) => mean(r.flights))),
    flightPooled: mean(flightAll),
    airPct: totalSteps ? (100 * sum(runs.map((r) => r.airSteps))) / totalSteps : NaN,
    grades: Object.fromEntries(GRADES.map((g) => [g, mean(runs.map((r) => r.grades[g]))])),
    gradesTot: Object.fromEntries(GRADES.map((g) => [g, sum(runs.map((r) => r.grades[g]))])),
    recovered: mean(runs.map((r) => r.recovered)),
    recoveredTot: sum(runs.map((r) => r.recovered)),
    maxSpeed: mean(runs.map((r) => r.maxSpeed)),
    maxSpeedPeak: Math.max(...runs.map((r) => r.maxSpeed)),
    steps: totalSteps,
  };
}

const results = {};
const t0 = Date.now();
for (const [name, bot] of Object.entries(BOTS)) {
  const runs = [];
  for (let i = 0; i < SEEDS; i++) runs.push(playRun(`rs-${i}`, bot));
  results[name] = { runs, sum: summarise(runs) };
}
const wall = ((Date.now() - t0) / 1000).toFixed(1);

const names = Object.keys(BOTS);
const col = 12;
const pad = (s, w = col) => String(s).padStart(w);
const row = (label, cells) => `${label.padEnd(30)}${cells.map((c) => pad(c)).join('')}`;
const line = (w) => '-'.repeat(w);

console.log(`Ridgeline B1 ridestats: ${SEEDS} seeds (rs-0..rs-${SEEDS - 1}) x ${names.length} bots, runLength=${DEFAULTS.runLength}, step=1/120 s`);
console.log(`Wall time ${wall} s. Means are per run unless marked pooled. Flight excludes hops.`);
console.log('');
console.log(row('mean per run', names));
console.log(line(30 + col * names.length));
const per = (f) => names.map((n) => f(results[n].sum));
console.log(row('finish / crash / timeout', names.map((n) => { const s = results[n].sum; return `${s.finish}/${s.crash}/${s.timeout}`; })));
console.log(row('time to finish (s, finished)', per((s) => fmt(s.meanTime, 1))));
console.log(row('launches', per((s) => fmt(s.launches, 1))));
console.log(row('mean flight (s)', per((s) => fmt(s.flight, 2))));
console.log(row('mean flight (s, pooled)', per((s) => fmt(s.flightPooled, 2))));
console.log(row('air share (% steps, pooled)', per((s) => fmt(s.airPct, 1))));
for (const g of GRADES) console.log(row(`land ${g}`, per((s) => fmt(s.grades[g], 1))));
console.log(row('wrecks recovered', per((s) => fmt(s.recovered, 2))));
console.log(row('max speed (m/s, mean)', per((s) => fmt(s.maxSpeed, 1))));
console.log(row('max speed (m/s, peak)', per((s) => fmt(s.maxSpeedPeak, 1))));
console.log('');
console.log(row('totals (all 20 runs)', names));
console.log(line(30 + col * names.length));
console.log(row('launches', per((s) => s.launchesTot)));
for (const g of GRADES) console.log(row(`land ${g}`, per((s) => s.gradesTot[g])));
console.log(row('wrecks recovered', per((s) => s.recoveredTot)));
console.log(row('steps simulated', per((s) => s.steps)));
