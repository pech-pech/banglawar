// Brute-force solver for tpl1.js templates. Usage: node tpl1-solve.js [maxInputs=5] [step=8] [onlyId]
// Every template x {unmirrored, mirrored} x 3 seeds must be solvable with <=5 inputs in <=25 s.
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console, Math, globalThis: null });
ctx.globalThis = ctx;
for (const f of ['core.js', 'rooms.js', 'tpl1.js'])
  vm.runInContext('(function(){' + fs.readFileSync(path.join(__dirname, '../parts', f), 'utf8') + '\n})()', ctx, { filename: f });
const PL = ctx.PL;
const MAXIN = +process.argv[2] || 5, STEP = +process.argv[3] || 8, ONLY = process.argv[4], MAXT = 3000, NODE_CAP = 4e6;

const mr = (r) => [336 - r[0] - r[2], r[1], r[2], r[3]];
function mirror(room) {
  if (PL.mirrorRoom) return PL.mirrorRoom(room);
  const m = JSON.parse(JSON.stringify(room));
  m.start.x = 336 - m.start.x; m.exit.x = 336 - m.exit.x;
  if (m.start.g === 1) m.start.g = 3; else if (m.start.g === 3) m.start.g = 1;
  m.walls = m.walls.map(mr); m.spikes = m.spikes.map((s) => ({ r: mr(s.r) })); m.crumbles = m.crumbles.map(mr);
  m.gates = m.gates.map((g) => ({ r: mr(g.r), dir: g.dir === 1 ? 3 : g.dir === 3 ? 1 : g.dir }));
  m.crushers = m.crushers.map((c) => ({ ...c, r: mr(c.r), phase: -c.phase }));
  m.mirrored = true;
  return m;
}
const clone = (s) => ({ ...s, crumbleS: s.crumbleS.map((c) => ({ ...c })), pending: s.pending ? { ...s.pending } : null, events: [] });
const opts = [{ k: 'flip', dir: 0 }, { k: 'flip', dir: 1 }, { k: 'flip', dir: 2 }, { k: 'flip', dir: 3 }, { k: 'dive' }];

function solve(room, maxIn) {
  const hasCr = room.crushers.length > 0;
  const keyOf = (s) => { const h = PL.hash(s).split(','); h[6] = hasCr ? s.t % 288 : 0; return h.join(','); };
  let best = null, nodes = 0;
  const seen = new Set();
  function dfs(s0, depth, log) {
    const s = clone(s0), still = new Set();
    for (; s.t < MAXT; ) {
      if (best && s.t >= best.ticks) return;
      if (s.dead || s.won) return;
      const k = keyOf(s);
      if (depth < maxIn) {
        const key = depth + '|' + k;
        if (!seen.has(key)) {
          seen.add(key);
          for (const o of opts) {
            if (nodes++ > NODE_CAP) return;
            const c = clone(s);
            PL.step(c, [o]);
            const l2 = log.concat([{ tick: s.t, ...o }]);
            if (c.won) { if (!best || c.t < best.ticks) best = { ticks: c.t, log: l2 }; continue; }
            if (c.dead) continue;
            dfs(c, depth + 1, l2);
          }
        }
      }
      if (!hasCr) { if (still.has(k)) return; still.add(k); }
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
const issues = [];
const ids = PL.TEMPLATES.filter((t) => /^t(0[4-9]|1[0-2])$/.test(t.id) && !t.retired && (!ONLY || t.id === ONLY));
for (const t of ids) {
  let worst = null, fail = 0, total = 0, maxIn = 0;
  for (let seed = 1; seed <= (+process.argv[5] || 3); seed++) {
    for (const mir of [false, true]) {
      let r = t.make(PL.mulberry32(seed));
      if (mir) r = mirror(r);
      const tag = `${t.id} seed${seed}${mir ? 'M' : ' '}`;
      const all = [...r.walls, ...r.spikes.map((s) => s.r), ...r.crumbles, ...r.gates.map((g) => g.r), ...r.crushers.map((c) => c.r)];
      for (const a of all) if (a[0] < 0 || a[1] < 0 || a[0] + a[2] > 336 || a[1] + a[3] > 500) issues.push(`${tag}: rect out of box ${a}`);
      const box = [r.start.x - 11, r.start.y - 11, 22, 22];
      const solid = [...r.walls, ...r.crumbles, ...r.gates.map((g) => g.r)];
      if (solid.some((w) => overlap(box, w))) issues.push(`${tag}: start overlaps solid`);
      const eb = [r.exit.x - 11, r.exit.y - 11, 22, 22];
      if (r.walls.some((w) => overlap(eb, w)) || r.spikes.some((s) => overlap(eb, s.r))) issues.push(`${tag}: exit overlaps wall/spike`);
      // idle must not win
      const idle = PL.newState(r); for (let i = 0; i < MAXT && !idle.won && !idle.dead; i++) PL.step(idle, []);
      if (idle.won) issues.push(`${tag}: idle wins`);
      let res = null, used = 0;
      for (let k = 1; k <= MAXIN && !res; k++) { used = k; res = solve(r, k); if (!res.best) res = null; }
      total++;
      if (!res) { fail++; console.log(`${tag}: UNSOLVED (<=${MAXIN} inputs)`); issues.push(`${tag}: unsolved`); continue; }
      const b = res.best;
      maxIn = Math.max(maxIn, b.log.length);
      if (b.ticks / 120 > 25) issues.push(`${tag}: too slow ${b.ticks / 120}`);
      console.log(`${tag}: ${(b.ticks / 120).toFixed(2)}s inputs=${b.log.length} ${b.log.map((l) => `${l.tick}:${l.k}${l.dir ?? ''}`).join(' ')} [${res.nodes}]`);
    }
  }
  console.log(`== ${t.id}: ${total - fail}/${total} solved, max inputs ${maxIn}`);
}
console.log('ISSUES:\n' + (issues.join('\n') || 'none'));
