#!/usr/bin/env node
// Golden Over (Captain's Over) sim (CONTRACT-GO s5). Plays WHOLE wheel matches through the REAL store commands, like tools/wheelmatch-parity.mjs
// (same teams, same careful/full/random wheel tappers, same seeds), and optionally swaps one over per innings for a Captain's Over driven
// through GoldenStart + 6x GoldenTap (err drawn from the tapper model, calibration offset 0).
// Rival offset: the engine reads WHEEL_RIVAL_BOOST (= 1.9 - offset). Each offset runs on a private copy of js/ in os.tmpdir() with that constant
// patched (and, for --prize, the Perfect pick patched to best of 2 + floor). Nothing in the game tree is edited.
// Wheel tappers: random = random STOP, careful = parity 'avg' (sd 0.110 s), full = parity 'full' (full Control: Slow 3, Steady 2, Aim Guide).
// Captain's Over tappers: sd 35 / 60 / 110 ms normal around the cross, or 'rand' uniform +-400 ms.
// Over policies: ov10 (over 10 both innings), ov1 (over 1 both innings), none (baseline, wheel only).
// Usage: node tools/golden-sim.mjs [--n 1000] [--offsets -9,-10,-11] [--who careful,full,random] [--sds 35,60,110,rand] [--pols none,ov10,ov1]
//          [--prize] [--workers 4] [--out FILE.json] [--doc]      (--doc renders docs/GOLDEN-SIM.md from every cell in FILE.json)
// Tool only (not shipped): worker_threads, fs, performance.now.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const PRIZE_TAG = 'prize';

/** A private js/ copy with the rival offset (and optionally the prize pick) patched. Returns its root dir. */
function buildRoot(offset, prize) {
  const dir = join(tmpdir(), `golden-sim-${offset}${prize ? '-' + PRIZE_TAG : ''}`);
  if (existsSync(join(dir, 'ok'))) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(GAME, 'js'), join(dir, 'js'), { recursive: true });
  const wm = join(dir, 'js/data/wheelmatch.js');
  let t = readFileSync(wm, 'utf8');
  const a = t.replace('export const WHEEL_RIVAL_OFF = -9,', `export const WHEEL_RIVAL_OFF = ${offset},`).replace('export const WHEEL_RIVAL_BOOST = 10.9;', `export const WHEEL_RIVAL_BOOST = ${(1.9 - offset).toFixed(1)};`);
  if (a === t && offset !== -9) throw new Error('offset patch did not apply');
  writeFileSync(wm, a);
  if (prize) {
    const gp = join(dir, 'js/core/golden-over.js');
    const g = readFileSync(gp, 'utf8');
    const p = g.replace('for (let i = 1; i < xs.length; i++) if (val(oc(xs[i]), side) > val(oc(xs[bi]), side)) bi = i;', 'for (let i = 1; i < 2; i++) if (val(oc(xs[i]), side) > val(oc(xs[bi]), side)) bi = i;');
    if (p === g) throw new Error('prize patch did not apply');
    writeFileSync(gp, p);
  }
  writeFileSync(join(dir, 'ok'), '1');
  return dir;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const gauss = (rng, sd) => { const u = Math.max(1e-12, rng.random()), v = rng.random(); return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const BAT = ['Opener', 'Opener', 'Middle', 'Middle', 'Lower', 'Lower'];
const WHO = { careful: 'avg', full: 'full', random: 'random' };

async function runCell(c) {
  const R = (p) => import(pathToFileURL(join(c.root, 'js', p)).href);
  const [{ applyCommand }, { FLAGS }, { makeRng }, WM, { landSplit }, { matchPhys }, wst, sel] = await Promise.all([
    R('store/commands.js'), R('data/flags.js'), R('core/rng.js'), R('data/wheelmatch.js'), R('core/landtick.js'), R('core/wheelmatch.js'),
    R('store/wheelmatch-store.js'), c.pol === 'none' ? Promise.resolve({}) : R('store/selectors.js'),
  ]);
  const WMX = WM.WHEEL_MATCH;
  const SD = { avg: WMX.SD_AVG, full: WMX.SD_GUIDE_AVG };
  const T_MID = 3.5, T_MIN = 0.5, MIN_AIM_W = 0.5, T_HI = WMX.PULSE_PERIOD - 1e-6, T_LO = Math.max(T_MIN, WMX.STOP_GUARD_S);
  const landU = (P, t) => { const q = landSplit(P, t); return q.arc + q.dist; };
  const solveT = (P, target) => { let lo = T_LO, hi = T_HI; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (landU(P, m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
  function tapTime(P, cc, phi) {
    const C = WMX.CIRC, k0 = Math.round((landU(P, T_MID) + phi - cc) / C), lo = landU(P, T_LO), hi = landU(P, T_HI);
    let best = null;
    for (const k of [k0 - 1, k0, k0 + 1]) { const tg = cc + k * C - phi; if (tg < lo || tg > hi) continue; const t = solveT(P, tg); if (best == null || Math.abs(t - T_MID) < Math.abs(best - T_MID)) best = t; }
    return best ?? T_MID;
  }
  function chooseStop(who, segs, P, rng) {
    const phi = rng.random() * WMX.CIRC;
    if (who === 'random') return { t: T_LO + (WMX.PULSE_PERIOD - T_LO) * rng.random(), phi };
    let cand = segs.map((g, i) => i).filter((i) => segs[i].width >= MIN_AIM_W); if (!cand.length) cand = segs.map((g, i) => i);
    const tgt = cand.reduce((a, i) => (segs[i].value > segs[a].value ? i : a), cand[0]);
    const t0 = tapTime(P, segs[tgt].start + segs[tgt].width / 2, phi);
    return { t: Math.min(T_HI, Math.max(T_LO, t0 + gauss(rng, SD[who]))), phi };
  }
  const makeTeam = (rng, off, idPre, src) => {
    const bw = rng.shuffle(['Fast', 'Fast', 'Medium', 'Medium', 'Spin', 'Spin']);
    const r = () => clamp(50 + gauss(rng, 8) - 20 + off, 1, 99);
    return BAT.map((bat, i) => ({ ...src[i % src.length], id: `${idPre}${i}`, bat, bowl: bw[i], bp: r(), bs: r(), spd: r(), bsk: r(), nodes: { bat: 0, bowl: 0 } }));
  };
  FLAGS.settled = true; FLAGS.matchday = false; FLAGS.roar = false; FLAGS.activities = false; FLAGS.freePick = false; FLAGS.wheelMatch = true; FLAGS.wheelMeta = c.who === 'full';
  const who = WHO[c.who];
  let base = applyCommand(null, 'NewGame', { seed: c.seed });
  base = { ...base, matchMode: 'wheel' };
  if (who === 'full') base = { ...base, wheelMeta: { ...base.wheelMeta, owned: { ...(base.wheelMeta.owned || {}), c_slow: 3, c_steady: 2, c_guide: 1 } } };
  const goldOver = c.pol === 'ov10' ? 10 : c.pol === 'ov1' ? 1 : 0;
  const out = { win: 0, n: 0, ours: 0, rival: 0, used: 0, runs: 0, wheelAvg: 0, wheelRunsSame: 0, grades: { P: 0, G: 0, M: 0 }, wk: 0, byInn: { 1: { n: 0, runs: 0, avg: 0 }, 2: { n: 0, runs: 0, avg: 0 } } };
  for (let k = c.k0; k < c.k1; k++) {
    const trng = makeRng(`parity|teams|${k}`);
    const mine = base.clubs[0], oppId = base.fixture.opp;
    const ours = makeTeam(trng, 1.9, 'c0p', mine.squad);
    const opp0 = base.clubs.find((x) => x.id === oppId);
    const rival = makeTeam(trng, 0, `${oppId}p`, opp0.squad);
    const clubs = base.clubs.map((x) => (x.id === 'c0' ? { ...x, squad: ours, six: ours.map((p) => p.id) } : x.id === oppId ? { ...x, squad: rival, six: rival.map((p) => p.id) } : x));
    let s = { ...base, clubs, salt: `k${k}`, plan: { ...base.plan, edited: false, key: '' } };
    if (goldOver) s.goldCal = { offset: 0, n: 10 };
    s = applyCommand(s, 'StartMatch');
    if (s.stage !== 'bowl') throw new Error(`StartMatch did not start a match (stage ${s.stage})`);
    const prng = makeRng(`parity|tap|${who}|${k}`);
    const grng = makeRng(`golden|tap|${c.sd}|${k}`);
    for (let guard = 0; guard < 80; guard++) {
      if (s.stage === 'break') { s = applyCommand(s, 'StartChase'); continue; }
      if (s.stage !== 'bowl' && s.stage !== 'chase') break;
      const side = s.stage === 'bowl' ? 'bowl' : 'bat';
      const inn = side === 'bowl' ? s.inn1 : s.inn2;
      const bowler = side === 'bowl' ? wst.suggestedBowler(s) : wst.rivalBowler(s);
      if (goldOver && inn.over === goldOver) { // Captain's Over: lock it, then six taps
        const n0 = applyCommand(s, 'GoldenStart', side === 'bowl' ? { bowler } : {});
        if (n0 === s) throw new Error(`GoldenStart rejected at ${s.stage} over ${inn.over}`);
        const key = side === 'bowl' ? 'inn1' : 'inn2', innNo = side === 'bowl' ? 1 : 2;
        const vm = sel.goldenVM(n0), runs0 = inn.runs, wk0 = inn.wk;
        s = n0;
        for (let t = 0; t < 6; t++) {
          const g = s.golden && s.golden[key];
          if (!g || g.done) break;
          const err = c.sd === 'rand' ? (grng.random() * 2 - 1) * 400 : gauss(grng, +c.sd);
          const n1 = applyCommand(s, 'GoldenTap', { err });
          if (n1 === s) throw new Error('GoldenTap rejected');
          s = n1;
        }
        const g = s.golden[key];
        if (!g.done) throw new Error('golden over not done after 6 taps');
        const inn2 = side === 'bowl' ? s.inn1 : s.inn2;
        const runs = inn2.runs - runs0;
        out.used++; out.runs += runs; out.wk += inn2.wk - wk0; out.wheelAvg += vm.wheelAvg;
        out.byInn[innNo].n++; out.byInn[innNo].runs += runs; out.byInn[innNo].avg += vm.wheelAvg;
        for (const tp of g.taps) out.grades[tp.g]++;
        continue;
      }
      const model = wst.modelOf(s, side, bowler);
      const stop = chooseStop(who, model.segs, matchPhys(s), prng);
      const n = applyCommand(s, 'WheelOver', side === 'bowl' ? { bowler, stop } : { stop });
      if (n === s) throw new Error(`WheelOver ignored at ${s.stage} over ${inn.over}`);
      s = n;
    }
    if (s.stage !== 'done') throw new Error(`match did not finish (stage ${s.stage})`);
    out.win += s.result === 'won' ? 1 : s.result === 'tied' ? 0.5 : 0; out.n++; out.ours += s.inn2.runs; out.rival += s.inn1.runs;
  }
  return out;
}

const sum = (a, b) => {
  const o = {};
  for (const k of Object.keys(a)) o[k] = typeof a[k] === 'number' ? a[k] + b[k] : Object.fromEntries(Object.keys(a[k]).map((q) => [q, typeof a[k][q] === 'number' ? a[k][q] + b[k][q] : Object.fromEntries(Object.keys(a[k][q]).map((z) => [z, a[k][q][z] + b[k][q][z]]))]));
  return o;
};

if (!isMainThread) runCell(workerData).then((r) => parentPort.postMessage(r), (e) => { throw e; });
else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const n = +arg('n', 1000), W = +arg('workers', 4), seed = arg('seed', 'parity');
  const offsets = arg('offsets', '-9,-10,-11').split(',').map(Number), whos = arg('who', 'careful,full,random').split(','), sds = arg('sds', '35,60,110,rand').split(',');
  const pols = arg('pols', 'none,ov10,ov1').split(','), prize = process.argv.includes('--prize');
  const outFile = arg('out', join(tmpdir(), 'golden-sim-results.json'));
  const db = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
  if (process.argv.includes('--doc')) { renderDoc(db); process.exit(0); }
  const cellsKeys = [];
  for (const off of offsets) for (const who of whos) for (const pol of pols) for (const sd of (pol === 'none' ? ['-'] : sds)) cellsKeys.push({ off, who, pol, sd });
  for (const c of cellsKeys) {
    const key = `${prize && c.pol !== 'none' ? 'prize' : 'live'}|${c.off}|${c.who}|${c.pol}|${c.sd}|${n}`;
    if (db[key]) continue;
    const root = buildRoot(c.off, prize && c.pol !== 'none');
    const t0 = performance.now();
    const parts = await Promise.all(Array.from({ length: W }, (_, i) => new Promise((res, rej) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { root, who: c.who, pol: c.pol, sd: c.sd, seed, k0: Math.floor(i * n / W), k1: Math.floor((i + 1) * n / W) } });
      w.on('message', res); w.on('error', rej);
    })));
    const a = parts.reduce(sum);
    const secs = (performance.now() - t0) / 1000;
    db[key] = { ...a, secs: +secs.toFixed(1) };
    writeFileSync(outFile, JSON.stringify(db));
    console.log(`${key}  win ${(100 * a.win / a.n).toFixed(1)}%  used ${a.used}  runs/over ${a.used ? (a.runs / a.used).toFixed(2) : '-'} vs wheel ${a.used ? (a.wheelAvg / a.used).toFixed(2) : '-'}  ${secs.toFixed(0)}s`);
  }
}

function renderDoc(db) {
  const rows = Object.entries(db).map(([k, v]) => { const [mode, off, who, pol, sd, n] = k.split('|'); return { mode, off: +off, who, pol, sd, n: +n, ...v }; });
  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
  const ci = (r) => 1.96 * Math.sqrt((r.win / r.n) * (1 - r.win / r.n) / r.n) * 100;
  const get = (mode, off, who, pol, sd) => rows.find((r) => r.mode === (pol === 'none' ? 'live' : mode) && r.off === off && r.who === who && r.pol === pol && r.sd === sd);
  let md = `# Golden Over sim\n\nReal engine, whole wheel matches through store commands (tools/golden-sim.mjs). Same seeded teams and wheel tappers for every row (common random numbers). Rival offset = WHEEL_RIVAL_OFF (live -9). Calibration offset 0. Tie counts 0.5. Win % +- 95% CI.\n`;
  md += `Wheel setups: careful = parity 'avg' (sd 0.110 s), full = full Control (Slow 3, Steady 2, Aim Guide, sd 0.080 s), random = random STOP.\nCaptain's Over: err ~ N(0, sd ms), rand = uniform +-400 ms. Policy ov10 = over 10 both innings, ov1 = over 1 both innings. "used" = Captain's Overs actually played (a chase can end before over 10).\n`;
  const offs = [...new Set(rows.map((r) => r.off))].sort((a, b) => b - a), whos = ['careful', 'full', 'random'].filter((w) => rows.some((r) => r.who === w));
  for (const mode of ['live', 'prize']) {
    if (!rows.some((r) => r.mode === mode && r.pol !== 'none')) continue;
    md += `\n## ${mode === 'live' ? 'Rule A1 as built (Perfect = best of 3 + floor)' : 'Variant: Perfect = best of 2 + floor'}\n`;
    for (const off of offs) for (const who of whos) {
      const base = get('live', off, who, 'none', '-');
      const set = rows.filter((r) => r.mode === mode && r.off === off && r.who === who && r.pol !== 'none');
      if (!set.length) continue;
      md += `\n### rival offset ${off}, ${who}${base ? ` (baseline no Captain's Over: ${f1(100 * base.win / base.n)}% +-${f1(ci(base))}, n ${base.n}, our runs ${f1(base.ours / base.n)}, rival ${f1(base.rival / base.n)})` : ''}\n\n`;
      md += `| Over policy | Tap sd | n | Win % | +- | vs baseline | Overs used | Runs / C.Over | Wheel avg (same overs) | Wickets / C.Over | P % | G % | M % | secs |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
      for (const pol of ['ov10', 'ov1']) for (const sd of ['35', '60', '110', 'rand']) {
        const r = set.find((x) => x.pol === pol && x.sd === sd); if (!r) continue;
        const gt = r.grades.P + r.grades.G + r.grades.M || 1;
        md += `| ${pol} | ${sd} | ${r.n} | ${f1(100 * r.win / r.n)} | ${f1(ci(r))} | ${base ? (100 * (r.win - base.win) / r.n >= 0 ? '+' : '') + f1(100 * (r.win - base.win) / r.n) : '-'} | ${r.used} | ${r.used ? f2(r.runs / r.used) : '-'} | ${r.used ? f2(r.wheelAvg / r.used) : '-'} | ${r.used ? f2(r.wk / r.used) : '-'} | ${f1(100 * r.grades.P / gt)} | ${f1(100 * r.grades.G / gt)} | ${f1(100 * r.grades.M / gt)} | ${r.secs} |\n`;
      }
    }
  }
  md += `\n## Per innings (runs per Captain's Over vs wheel avg, live rule, offset -9)\n\n| who | policy | sd | inn 1 (bowl) runs / wheel avg | inn 2 (chase) runs / wheel avg |\n|---|---|---|---|---|\n`;
  for (const r of rows.filter((x) => x.mode === 'live' && x.off === -9 && x.pol !== 'none')) {
    const c = (i) => (r.byInn[i].n ? `${f2(r.byInn[i].runs / r.byInn[i].n)} / ${f2(r.byInn[i].avg / r.byInn[i].n)} (n ${r.byInn[i].n})` : '-');
    md += `| ${r.who} | ${r.pol} | ${r.sd} | ${c(1)} | ${c(2)} |\n`;
  }
  const sd35 = get('live', -9, 'careful', 'ov10', '35'), sd35b = get('live', -9, 'careful', 'ov1', '35');
  const pass = (r) => (r ? (100 * r.win / r.n > 60 ? 'yes' : 'no') : 'n/a');
  md += `\n## Gate\n\nPasses 60% (careful, sd 35, offset -9, live rule): ov10 ${pass(sd35)}, ov1 ${pass(sd35b)}.\n`;
  const pz = (m) => { const a = get(m, -9, 'careful', 'ov10', '35'), b = get(m, -9, 'careful', 'ov1', '35'); return a || b ? `ov10 ${a ? pass(a) : 'n/a'}, ov1 ${b ? pass(b) : 'n/a'}` : null; };
  if (rows.some((r) => r.mode === 'prize')) md += `Passes 60% (same, prize variant): ${pz('prize')}.\n`;
  md += `\nNot run (time): rival offset -10, random wheel play, sd 60 and rand cells not in this file, any cell absent from the tables above.\n`;
  writeFileSync(join(GAME, 'docs/GOLDEN-SIM.md'), md);
  console.log('wrote docs/GOLDEN-SIM.md');
}
