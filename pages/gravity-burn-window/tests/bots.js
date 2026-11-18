// Bot panel for Burn Window. Plain node: node tests/bots.js
'use strict';
const S = require('../src/sim.js'), G = require('../src/gen.js');
const MAXS = 35, SEEDS = [1, 2, 3, 4, 5, 6], SECT = [0, 1, 2, 3, 4, 5, 6, 7];
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const f = (x, d) => Number.isFinite(x) ? x.toFixed(d == null ? 2 : d) : '-';
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const run = (sec, sched, fuel) => S.runSchedule(sec, sched, { maxSeconds: MAXS, fuel });

const secs = []; let threw = 0;
for (const seed of SEEDS) for (const idx of SECT) {
  try { const s = G.generateSector(seed, idx); s._seed = seed; secs.push(s); } catch (e) { threw++; }
}
const bots = {
  idle: { n: 0, d: 0, fu: [], par: [] }, naive: { n: 0, d: 0, fu: [], par: [] },
  human: { n: 0, d: 0, fu: [], par: [] }, humanAtt: { n: 0, d: 0, fu: [], par: [] },
  skilled: { n: 0, d: 0, fu: [], par: [] }, beginner: { n: 0, d: 0, fu: [], par: [] }
};
function rec(b, ok, fuel, par) { b.n++; if (ok) { b.d++; b.fu.push(fuel); b.par.push(par); } }
const HUMAN_SETS = 10; // each sector: 10 independent 3-attempt sessions
const BEG_TRIES = 40;
const perSector = [];
for (const sec of secs) {
  const par = sec.par.fuel, rng = S.mulberry32(S.hashSeed(sec._seed, sec.index, 4242));
  let r = run(sec, [], undefined); rec(bots.idle, r.result === 'docked', r.fuelUsed, par);
  r = run(sec, [[0, 7]], undefined); rec(bots.naive, r.result === 'docked', r.fuelUsed, par);
  r = run(sec, sec.par.sched, undefined); rec(bots.skilled, r.result === 'docked', r.fuelUsed, par);
  for (let k = 0; k < HUMAN_SETS; k++) {
    let got = false, fu = 0;
    for (let a = 0; a < 3; a++) {
      const sc = sec.par.sched.map(b => [Math.max(0, b[0] + (rng() * 2 - 1) * 0.12), Math.max(S.C.TICK_STEPS * S.C.DT, b[1] * (1 + (rng() * 2 - 1) * 0.25))]);
      sc.sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < sc.length; i++) if (sc[i][0] < sc[i - 1][0] + sc[i - 1][1]) sc[i][0] = sc[i - 1][0] + sc[i - 1][1] + 0.02;
      r = run(sec, sc, undefined); rec(bots.humanAtt, r.result === 'docked', r.fuelUsed, par);
      if (r.result === 'docked' && !got) { got = true; fu = r.fuelUsed; }
    }
    rec(bots.human, got, fu, par);
  }
  const med = median(sec.dockFuels || []);
  for (let k = 0; k < BEG_TRIES; k++) {
    r = run(sec, G.randSched(rng, 14), med); rec(bots.beginner, r.result === 'docked', r.fuelUsed, par);
  }
  perSector.push({ seed: sec._seed, idx: sec.index, type: sec.type, par, med, n: (sec.dockFuels || []).length });
}
const out = [];
out.push('Burn Window bot panel. seeds 1..6 x sectors 0..7; generated ' + secs.length + ' sectors, generator threw on ' + threw + '.');
out.push('bot'.padEnd(10) + 'runs'.padStart(6) + 'dock%'.padStart(9) + 'meanFuel'.padStart(10) + 'ratio/par'.padStart(11));
const names = { idle: 'idle', naive: 'naive', human: 'human(3x)', humanAtt: 'human/att', skilled: 'skilled', beginner: 'beginner' };
for (const k of Object.keys(bots)) {
  const b = bots[k], ratio = mean(b.fu.map((v, i) => v / b.par[i]));
  out.push(names[k].padEnd(10) + String(b.n).padStart(6) + pct(b.d, b.n).padStart(9) + f(mean(b.fu)).padStart(10) + f(ratio).padStart(11));
}
const rate = k => bots[k].d / bots[k].n;
out.push('');
out.push('L-TD-7 idle never docks: ' + (bots.idle.d === 0 ? 'PASS' : 'FAIL') + ' (' + bots.idle.d + ' docked)');
out.push('L-TD-7 naive docks < 20%: ' + (rate('naive') < 0.2 ? 'PASS' : 'FAIL') + ' (' + pct(bots.naive.d, bots.naive.n) + ')');
out.push('L-TD-7 skilled docks 100%: ' + (rate('skilled') === 1 ? 'PASS' : 'FAIL') + ' (' + pct(bots.skilled.d, bots.skilled.n) + ')');
out.push('');
out.push('QUESTION: beginner median dock fuel / par fuel (expert under half of beginner fuel => ratio > 2)');
out.push('seed idx type       par   medBeg  ratio  nDock');
const rats = [];
for (const p of perSector) { const q = p.med / p.par; rats.push(q); out.push(String(p.seed).padEnd(5) + String(p.idx).padEnd(4) + p.type.padEnd(10) + f(p.par, 1).padStart(6) + f(p.med, 1).padStart(8) + f(q).padStart(7) + String(p.n).padStart(7)); }
const ok = perSector.filter(p => Number.isFinite(p.med)), rats2 = ok.map(p => p.med / p.par), sumMed = ok.reduce((a, p) => a + p.med, 0), sumPar = ok.reduce((a, p) => a + p.par, 0);
out.push('overall: mean ratio ' + f(mean(rats2)) + ', median ratio ' + f(median(rats2)) + ', sum(med)/sum(par) ' + f(sumMed / sumPar) + ', sectors with ratio>2: ' + rats2.filter(q => q > 2).length + '/' + rats2.length + ' (sectors with dockFuels)');
out.push('expert uses under half of beginner fuel (overall): ' + (sumMed / sumPar > 2 ? 'YES' : 'NO'));
console.log(out.join('\n'));
