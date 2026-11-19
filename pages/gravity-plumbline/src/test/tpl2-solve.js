// Brute-force solver for tpl2.js templates (t13..t20). Usage: node tpl2-solve.js [onlyId] [maxInputs=5]
// Each template x seeds 1..3 x mirrored/unmirrored must be solvable with <=5 inputs in <=25 s.
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console, Math, JSON, globalThis: null });
ctx.globalThis = ctx;
for (const f of ['core.js', 'rooms.js', 'tpl2.js']) vm.runInContext('(function(){' + fs.readFileSync(path.join(__dirname, '../parts', f), 'utf8') + '\n})()', ctx, { filename: f });
const PL = ctx.PL;
const ONLY = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null;
const MAXIN = +process.argv[3] || 5, STEP = 6, MAXT = 25 * 120, TCAP = +process.env.TCAP || 30000;
const clone = (s) => ({ ...s, crumbleS: s.crumbleS.map((c) => ({ ...c })), rideUsed: s.rideUsed.slice(), pending: s.pending ? { ...s.pending } : null, events: [] });
const opts = [{ k: 'flip', dir: 0 }, { k: 'flip', dir: 1 }, { k: 'flip', dir: 2 }, { k: 'flip', dir: 3 }, { k: 'dive' }];
const q = (v, n) => Math.round(v / n);

// Layered BFS: layer k = unique states right after the k-th input. From each state we roll the sim forward
// (no input) and try every input every STEP ticks; a state seen in an earlier layer is never re-expanded.
function solve(room) {
  const dyn = room.crushers.length > 0;
  const t0 = Date.now();
  const keyOf = (s) => [q(s.x, 4), q(s.y, 4), q(s.vx, 40), q(s.vy, 40), s.g, s.charges, s.grounded ? 1 : 0, s.diveCd > 0 ? 1 : 0, dyn ? (s.t % 288) >> 3 : 0, s.crumbleS.map((c) => c.st + ':' + (c.timer >> 4)).join(',')].join(',');
  const seen = new Set();
  let layer = [{ s: PL.newState(room), log: [] }];
  for (let depth = 1; depth <= MAXIN; depth++) {
    const next = [];
    for (const node of layer) {
      if (Date.now() - t0 > TCAP) return null;
      const s = clone(node.s);
      const t00 = s.t, wlim = depth === 1 ? 300 : 180;
      while (s.t < MAXT && s.t - t00 <= wlim) {
        for (const o of opts) {
          if (o.k === 'flip' && o.dir === s.g) continue;
          if (o.k === 'dive' && (s.diveCd > 0 || (!s.grounded && s.charges <= 0))) continue;
          const c = clone(s);
          PL.step(c, [o]);
          const l2 = node.log.concat([{ tick: s.t, ...o }]);
          if (c.won) return { ticks: c.t, log: l2 };
          if (c.dead) continue;
          const k = keyOf(c);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ s: c, log: l2 });
        }
        for (let i = 0; i < STEP; i++) {
          PL.step(s, []);
          if (s.won) return { ticks: s.t, log: node.log };
          if (s.dead) break;
        }
        if (s.dead) break;
        if (!dyn && s.grounded && !s.vx && !s.vy && !s.crumbleS.some((c) => c.st === 1)) break;
      }
    }
    layer = next;
    if (process.env.V) console.log('  depth', depth, 'frontier', layer.length, Date.now() - t0, 'ms');
  }
  return null;
}

// Fallback for deep crusher rooms: layered search over timings only, for the template's intended input order.
// (full BFS needs minutes at depth 4+ once a crusher phase is in the state key)
const HINTS = { t16: [1, 2, 3, 2] };
function solveHint(room, seq, mirrored) {
  const dyn = room.crushers.length > 0, seen = new Set();
  let layer = [{ s: PL.newState(room), log: [] }];
  for (let i = 0; i < seq.length; i++) {
    const d = mirrored ? (seq[i] === 1 ? 3 : seq[i] === 3 ? 1 : seq[i]) : seq[i], next = [];
    for (const node of layer) {
      const s = clone(node.s), t00 = s.t;
      while (s.t < MAXT && s.t - t00 <= (i === 0 ? 300 : 200)) {
        if (d !== s.g) {
          const c = clone(s);
          PL.step(c, [{ k: 'flip', dir: d }]);
          const l2 = node.log.concat([{ tick: s.t, k: 'flip', dir: d }]);
          if (c.won) return { ticks: c.t, log: l2 };
          if (!c.dead) { const k = [q(c.x, 3), q(c.y, 3), q(c.vx, 25), q(c.vy, 25), c.g, c.charges, dyn ? (c.t % 288) >> 2 : 0].join(','); if (!seen.has(i + k)) { seen.add(i + k); next.push({ s: c, log: l2 }); } }
        }
        for (let j = 0; j < 2; j++) { PL.step(s, []); if (s.won) return { ticks: s.t, log: node.log }; if (s.dead) break; }
        if (s.dead) break;
      }
    }
    layer = next;
  }
  return null;
}

const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const issues = [];
const tpls = PL.TEMPLATES.filter((t) => /^t(1[3-9]|20)$/.test(t.id) && (!ONLY || t.id === ONLY));
console.log('templates:', tpls.map((t) => t.id).join(' '));
for (const t of tpls) {
  for (const seed of [1, 2, 3]) {
    for (const m of [false, true]) {
      let room = t.make(PL.mulberry32(seed));
      if (m) room = PL.mirrorRoom(room);
      const tag = `${t.id} seed${seed}${m ? 'M' : ' '}`;
      const all = [...room.walls, ...room.spikes.map((s) => s.r), ...room.crumbles, ...room.gates.map((g) => g.r), ...room.crushers.map((c) => c.r)];
      for (const a of all) if (a[0] < 0 || a[1] < 0 || a[0] + a[2] > 336 || a[1] + a[3] > 500) issues.push(`${tag}: rect out of box ${a}`);
      const box = [room.start.x - 11, room.start.y - 11, 22, 22];
      if ([...room.walls, ...room.crumbles].some((w) => overlap(box, w))) issues.push(`${tag}: start overlaps solid`);
      const eb = [room.exit.x - 11, room.exit.y - 11, 22, 22];
      if (room.walls.some((w) => overlap(eb, w))) issues.push(`${tag}: exit overlaps wall`);
      const t1 = Date.now();
      let best = solve(room);
      if (!best && HINTS[t.id]) { best = solveHint(room, HINTS[t.id], m); if (best) best.hinted = true; }
      const line = best ? `${tag}: OK ${(best.ticks / 120).toFixed(2)}s n=${best.log.length}${best.hinted ? ' (hint-order search)' : ''} ${best.log.map((l) => `${l.tick}:${l.k === 'dive' ? 'dive' : 'f' + l.dir}`).join(' ')}` : `${tag}: UNSOLVED`;
      console.log(line + ` [${Date.now() - t1}ms]`);
      if (!best) issues.push(`${tag}: unsolved`);
      else if (best.ticks > MAXT) issues.push(`${tag}: too slow`);
    }
  }
}
console.log('ISSUES:\n' + (issues.join('\n') || 'none'));
