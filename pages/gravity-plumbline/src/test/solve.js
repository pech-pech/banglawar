// Brute-force solver + sanity checks. Usage: node solve.js [maxInputs=3] [stepTicks=6]
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console, Math, globalThis: null });
ctx.globalThis = ctx;
for (const f of ['core.js', 'rooms.js']) vm.runInContext('(function(){' + fs.readFileSync(path.join(__dirname, '../parts', f), 'utf8') + '\n})()', ctx, { filename: f });
const PL = ctx.PL;
const MAXIN = +process.argv[2] || 3, STEP = +process.argv[3] || 6, MAXT = 2400;
const clone = (s) => ({ ...s, crumbleS: s.crumbleS.map((c) => ({ ...c })), pending: s.pending ? { ...s.pending } : null, events: [] });
const opts = [{ k: 'flip', dir: 0 }, { k: 'flip', dir: 1 }, { k: 'flip', dir: 2 }, { k: 'flip', dir: 3 }, { k: 'dive' }];

function solve(room) {
  let best = null, nodes = 0;
  const seen = new Set();
  function dfs(s0, depth, log) {
    // s0: state at tick s0.t, no inputs yet applied this tick. try waiting 0,6,12.. ticks
    let s = clone(s0);
    for (let w = 0; s.t < MAXT; w += STEP) {
      if (best && s.t >= best.ticks) return;
      if (s.dead || s.won) return;
      if (depth < MAXIN) {
        const key = depth + '|' + PL.hash(s);
        if (!seen.has(key)) {
          seen.add(key);
          for (const o of opts) {
            const c = clone(s);
            nodes++;
            PL.step(c, [o]);
            const l2 = log.concat([{ tick: s.t, ...o }]);
            if (c.won) { if (!best || c.t < best.ticks) best = { ticks: c.t, log: l2 }; continue; }
            if (c.dead) continue;
            dfs(c, depth + 1, l2);
          }
        }
      }
      for (let i = 0; i < STEP; i++) {
        PL.step(s, []);
        if (s.won) { if (!best || s.t < best.ticks) best = { ticks: s.t, log }; return; }
        if (s.dead) return;
      }
    }
  }
  dfs(PL.newState(room), 0, []);
  return { best, nodes };
}

const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const out = [], issues = [];
for (let seed = 1; seed <= 5; seed++) {
  const rooms = PL.buildRooms(seed);
  if (JSON.stringify(rooms) !== JSON.stringify(PL.buildRooms(seed))) issues.push(`seed ${seed}: not deterministic`);
  rooms.forEach((r, i) => {
    const tag = `R${i + 1} seed${seed}${r.mirrored ? 'M' : ' '}`;
    const all = [...r.walls, ...r.spikes.map((s) => s.r), ...r.crumbles, ...r.gates.map((g) => g.r), ...r.crushers.map((c) => c.r)];
    for (const a of all) if (a[0] < 0 || a[1] < 0 || a[0] + a[2] > 336 || a[1] + a[3] > 500) issues.push(`${tag}: rect out of box ${a}`);
    const box = [r.start.x - 11, r.start.y - 11, 22, 22];
    const solid = [...r.walls, ...r.crumbles, ...r.gates.map((g) => g.r), ...r.crushers.map((c) => c.r)];
    if (solid.some((w) => overlap(box, w))) issues.push(`${tag}: start overlaps solid`);
    const sb = [box[0] + 3, box[1] + 3, 16, 16];
    if (r.spikes.some((s) => overlap(sb, s.r))) issues.push(`${tag}: spike overlaps start`);
    const eb = [r.exit.x - 11, r.exit.y - 11, 22, 22];
    if (r.walls.some((w) => overlap(eb, w))) issues.push(`${tag}: exit overlaps wall`);
    if (r.spikes.some((s) => overlap(eb, s.r))) issues.push(`${tag}: exit overlaps spike`);
    const t0 = Date.now();
    const { best, nodes } = solve(r);
    const line = best ? `${tag}: SOLVABLE ${(best.ticks / 120).toFixed(2)}s flips=${best.log.length} ${best.log.map((l) => `${l.tick}:${l.k}${l.dir ?? ''}`).join(' ')}` : `${tag}: UNSOLVED (${MAXIN} inputs)`;
    out.push(line + ` [${nodes} nodes ${Date.now() - t0}ms]`);
    console.log(out[out.length - 1]);
    if (i === 0 && (!best || best.ticks / 120 >= 12 || best.log.length > 2)) issues.push(`${tag}: room1 requirement (<12s, 2 flips) failed`);
    if (!best) issues.push(`${tag}: unsolved`);
  });
}
console.log('ISSUES:\n' + (issues.join('\n') || 'none'));
