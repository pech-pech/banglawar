#!/usr/bin/env node
// Mixer Mad parity recorder (oracle side). Drives the UNMODIFIED mixer-mad-v7h.html headlessly and writes JSON traces.
//   node record.js --one <vehicle> <level 1-8> <policy> [--mode classic|load|daily] [--skin 0-3] [--out file.json.gz]
//   node record.js --all            (the full trace set + traces/INDEX.json)
//   node record.js --replay <trace.json.gz>   (re-drive a trace from its recorded input string and compare bit-for-bit)
// Format: see RECORDING-FORMAT.md. Nothing is edited on disk: the recorder is injected with addInitScript / page.evaluate.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const HERE = __dirname;
const HTML = path.join(HERE, 'oracle', 'mixer-mad-v7h.html');
const TRACES = path.join(HERE, 'traces');
const SEED = 20261102;
const PRNG_SRC = "function mulberry32(seed){ let t=seed>>>0; return ()=>{ t+=0x6D2B79F5; let r=Math.imul(t^t>>>15,1|t); r^=r+Math.imul(r^r>>>7,61|r); return ((r^r>>>14)>>>0)/4294967296; }; }";

// ---- policies: identical to sweep-tools/sweep.js ----
const POL = []; for (const f of [0.55, 0.8, 1.0]) for (const m of ['none', 'brake', 'pitch']) POL.push({ n: `t${f}-${m}`, f, m });
for (const d of [0.5, 0.7, 0.85]) POL.push({ n: `duty${d}`, duty: d });
const polByName = n => { const p = POL.find(x => x.n === n); if (!p) throw new Error('unknown policy ' + n + ' (have ' + POL.map(x => x.n).join(',') + ')'); return p; };
const VEH = ['mixer', 'digger', 'dump', 'dozer', 'crane', 'roller'];
const SET_A = ['t0.55-brake', 't0.8-none', 't1-none', 't0.8-pitch', 'duty0.5', 'duty0.85']; // mixer x 8 levels x 6
const SET_B = ['t0.8-none', 't0.8-pitch', 'duty0.85'];                                         // 6 vehicles x 8 levels x 3 (subset of A)

// ---- the code that runs inside the page (self contained; serialised by Playwright) ----
function inPage(cfg) {
  const DTv = DT;
  const f64 = new Float64Array(2), u32 = new Uint32Array(f64.buffer);
  function chk() { // FNV-1a/32 over the 48 little-endian 32-bit words of x,y,px,py for points 0..5
    let h = 0x811c9dc5;
    for (let i = 0; i < 6; i++) { const p = P[i];
      for (const v of [p.x, p.y, p.px, p.py]) { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619) >>> 0; h = Math.imul(h ^ u32[1], 16777619) >>> 0; } }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  const rockBits = () => L.rocks ? L.rocks.map(r => r.hit ? 1 : 0).join('') : '';
  const snapProps = (last) => { // sparse delta: only props whose 6 values changed since the previous sample (full list at k=0)
    const out = [];
    props.forEach((b, i) => { const v = [b.x, b.y, b.px, b.py, b.alive ? 1 : 0, b.rot]; const o = last[i];
      if (!o || o.some((q, j) => q !== v[j])) { out.push([i, ...v]); last[i] = v; } });
    return out;
  };
  const snap = (k, lastProps) => { const R = k > 240 ? (v => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v) : (v => v); // k>240: 1e-7 rounding (size); chk keeps the exact bits
    return {
    k, state, chk: chk(),
    pts: P.map(p => [R(p.x), R(p.y), R(p.px), R(p.py), p.c ? 1 : 0, R(p.c ? p.c.nx : 0), R(p.c ? p.c.ny : 0), R(p.c ? p.c.pen : 0), R(p.im)]),
    b: { crashT, finishT, levelT, snow, airT, landT, wheelie: wheelie ? 1 : 0, wheelT, roofHit: roofHit ? 1 : 0, bodyHit: bodyHit ? 1 : 0,
         load, runT: run.t, crashes: run.crashes, propBudget, crashWait, acc, wheelAng: [wheelAng[0], wheelAng[1]],
         cpHit: cp ? (cp.hit ? 1 : 0) : -1, cpLoad: cp ? cp.load : null, rocks: rockBits(), flagX: L.flagX },
    props: snapProps(lastProps).map(r => r.map(R)),
  }; };

  mode = cfg.mode; combo = null; vehicle = cfg.vehicle; combo3.skin = cfg.skin;
  if (cfg.dailyKey) window.__game.dailyKey = cfg.dailyKey;
  let stepCalls = 0; { const o = window.step; window.step = function () { stepCalls++; return o(); }; }
  startLevel(cfg.level);
  const meta = {
    format: 1, game: 'mixer-mad-v7h', vehicle, level: levelIdx, mode, weather: wx(), policy: cfg.policy, seed: cfg.seed, prngSource: cfg.prngSrc,
    skin: combo3.skin, dt: DTv, dtExpr: '1/120', iter: ITER, gravity: G, dailyKey: cfg.dailyKey || null,
    flagX: L.flagX, edgeX: L.edgeX, minY: L.minY, cpX: cp ? cp.x : null, nPoints: P.length, nProps0: props.length, nRocks: L.rocks ? L.rocks.length : 0,
    zones: (L.zones || []).map(z => [z.kind, z.x0, z.x1]), propBudget0: propBudget, geoBody: geo ? geo.s.body : null,
    sampleSchedule: 'sample 0 = initial state; samples after tick k for every k in 1..240, then every k % 12 == 0 (plus the final tick)',
    inputFields: ['gas', 'brake'], inputEncoding: 'one char per tick: bit0 = gas, bit1 = brake', chkDef: 'FNV-1a/32 over lo,hi 32-bit words of x,y,px,py for points 0..5, hex8 per tick, taken after tick',
    cap: cfg.cap, maxCrashes: cfg.maxCrashes,
  };
  const samples = [], events = [], inputs = [], chks = [], lastProps = [];
  samples.push(snap(0, lastProps));
  let t = 0, k = 0, crashes = 0, lastC = run.crashes, pass = false, ft = null;
  let stoppingStep = null, parkedStep = null, runTAtFinish = null, airT_ = 0, maxP = 0, air = 0, lastCpHit = cp ? cp.hit : false;
  const replay = cfg.inputs;
  const maxTicks = replay ? replay.length : Math.ceil(cfg.cap / DTv);
  while (replay ? k < replay.length : t < cfg.cap) {
    let g = false, br = false;
    if (replay) { const c = +replay[k]; g = !!(c & 1); br = !!(c & 2); }
    else {
      const pol = cfg.pol, ph = phys(), pose = truckPose();
      const vx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2 / DT, ang = pose.ang;
      if (state === 'drive') {
        if (pol.duty !== undefined) { g = ((t % 0.6) / 0.6) < pol.duty; }
        else { const tg = ph.maxV * pol.f; g = vx < tg; if (pol.m === 'brake' && vx > tg + 2.5) { g = false; br = true; }
          if (pol.m === 'pitch') { if (ang > 0.55) g = false; if (vx > tg + 2.5 && ang < 0.2) { g = false; br = true; } } }
      }
    }
    input.gas = g; input.brake = br; inputs.push((g ? 1 : 0) | (br ? 2 : 0));
    const s0 = state, c0 = stepCalls; tick(DT); t += DT; k++;
    chks.push(chk());
    { const expect = (s0 === 'crashed' && state === 'crashed') ? 0 : 1; if (stepCalls - c0 !== expect) events.push({ type: 'stepcount', k, n: stepCalls - c0, expect, from: s0, to: state }); }
    if (state !== s0) events.push({ type: 'state', k, from: s0, to: state, simT: k * DTv, runT: run.t, x: truckX() });
    if (state === 'stopping' && stoppingStep === null) { stoppingStep = k; runTAtFinish = run.t; events.push({ type: 'finish', k, simT: k * DTv, runT: run.t, x: truckX() }); }
    if (run.crashes > lastC) { lastC = run.crashes; crashes++; events.push({ type: 'crash', k, x: truckX(), px0: P[0].x, y: P[0].y, reason: crashReason, simT: k * DTv, runCrashes: run.crashes }); }
    if (cp && cp.hit && !lastCpHit) { lastCpHit = true; events.push({ type: 'checkpoint', k, x: truckX(), load: cp.load }); }
    if (cp && !cp.hit) lastCpHit = false;
    if (state === 'drive' || state === 'stopping') { const gr = !!(P[4].c || P[5].c); if (!gr) air += DTv; maxP = Math.max(maxP, Math.abs(truckPose().ang)); }
    const passed = state !== 'drive' && state !== 'stopping' && state !== 'crashed';
    if (k <= 240 || k % 12 === 0 || passed || (!replay && crashes >= cfg.maxCrashes)) { if (samples[samples.length - 1].k !== k) samples.push(snap(k, lastProps)); }
    if (passed) { pass = true; ft = t; parkedStep = k; break; }
    if (!replay && crashes >= cfg.maxCrashes) break;
  }
  if (samples[samples.length - 1].k !== k) samples.push(snap(k, lastProps));
  const outcome = {
    pass, steps: k, endState: state, crashes, runCrashes: run.crashes,
    finishStep: stoppingStep, finishSimT: stoppingStep === null ? null : stoppingStep * DTv, finishRunT: runTAtFinish,
    parkedStep, parkedSimT: pass ? ft : null, sweepFt: ft, airTime: +air.toFixed(3), maxPitch: +maxP.toFixed(3), brakeUsed: run.brake,
    stepCalls, ticks: k,
  };
  return { meta, input: inputs.join(''), chk: chks.join(''), samples, events, outcome };
}

async function openPage(browser, seed) {
  const pg = await browser.newPage();
  await pg.addInitScript(({ seed, src }) => {
    window.requestAnimationFrame = () => 0;                  // no browser frame loop: we call tick(DT) ourselves
    window.__seed = seed; window.__prng = new Function(src + '; return mulberry32;')()(seed);
    Math.random = window.__prng;                              // deterministic replacement (sim path only uses it for cosmetics + combo3.skin)
  }, { seed, src: PRNG_SRC });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file://' + HTML);
  await pg.waitForFunction(() => typeof tick === 'function' && typeof P !== 'undefined' && window.__game);
  return { pg, errs };
}

async function recordOne(browser, o) {
  const { pg, errs } = await openPage(browser, o.seed || SEED);
  try {
    const cfg = { vehicle: o.vehicle, level: o.level, mode: o.mode || 'classic', skin: o.skin || 0, policy: o.policy || null, pol: o.policy ? polByName(o.policy) : null,
      seed: o.seed || SEED, prngSrc: PRNG_SRC, dailyKey: o.dailyKey || null, cap: o.cap || 120, maxCrashes: o.maxCrashes || 8, inputs: o.inputs || null };
    const tr = await pg.evaluate(inPage, cfg);
    tr.meta.pageErrors = errs.slice(0, 5);
    return tr;
  } finally { await pg.close(); }
}

const gz = obj => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
const readTrace = f => JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)) : fs.readFileSync(f)).toString());
const nameOf = o => `${o.vehicle}_L${o.level + 1}_${o.policy}${o.mode && o.mode !== 'classic' ? '_' + o.mode : ''}${o.skin ? '_skin' + (o.skin + 1) : ''}`;

function plan() {
  const jobs = [];
  for (let li = 0; li < 8; li++) for (const p of SET_A) jobs.push({ set: 'A', vehicle: 'mixer', level: li, policy: p });
  for (const v of VEH) for (let li = 0; li < 8; li++) for (const p of SET_B) { if (v === 'mixer') continue; jobs.push({ set: 'B', vehicle: v, level: li, policy: p }); }
  // mixer in set B is already covered by set A (all three B policies are in A)
  for (const s of [1, 2, 3]) for (let li = 0; li < 8; li++) jobs.push({ set: 'C-skin', vehicle: 'mixer', level: li, policy: 't0.8-none', skin: s });
  for (let li = 0; li < 8; li++) jobs.push({ set: 'E-loadmode', vehicle: 'mixer', level: li, policy: 't1-pitch', mode: 'load' });
  for (const p of ['t0.8-none', 'duty0.7']) jobs.push({ set: 'D-daily', vehicle: 'digger', level: 0, policy: p, mode: 'daily', dailyKey: '2026-11-02' });
  return jobs;
}

async function pool(items, n, fn) { let i = 0; const res = new Array(items.length); await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; res[j] = await fn(items[j], j); } })); return res; }

async function main() {
  const a = process.argv.slice(2);
  const flag = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const browser = await chromium.launch();
  try {
    if (a[0] === '--one') {
      const o = { vehicle: a[1], level: +a[2] - 1, policy: a[3], mode: flag('--mode', 'classic'), skin: +flag('--skin', 0), dailyKey: flag('--daily', null) };
      const tr = await recordOne(browser, o);
      const out = flag('--out', path.join(TRACES, nameOf(o) + '.json.gz')); fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, gz(tr)); console.log(out, JSON.stringify(tr.outcome));
    } else if (a[0] === '--replay') {
      const tr = readTrace(a[1]); const m = tr.meta;
      const rp = await recordOne(browser, { vehicle: m.vehicle, level: m.level, mode: m.mode, skin: m.skin, seed: m.seed, dailyKey: m.dailyKey, inputs: tr.input });
      const same = rp.chk === tr.chk && JSON.stringify(rp.samples) === JSON.stringify(tr.samples) && JSON.stringify(rp.events) === JSON.stringify(tr.events);
      console.log(same ? 'REPLAY BIT-IDENTICAL' : 'REPLAY MISMATCH', path.basename(a[1]), 'ticks', rp.outcome.ticks); process.exitCode = same ? 0 : 1;
    } else if (a[0] === '--all') {
      fs.mkdirSync(TRACES, { recursive: true });
      const jobs = plan(); const only = flag('--only', null); const list = only ? jobs.filter(j => j.set === only) : jobs;
      const conc = +flag('--conc', 4); const t0 = Date.now();
      const index = await pool(list, conc, async (j, i) => {
        const tr = await recordOne(browser, j); const file = nameOf(j) + '.json.gz'; const buf = gz(tr); fs.writeFileSync(path.join(TRACES, file), buf);
        if (i % 10 === 0) console.log(`[${i + 1}/${list.length}] ${file} ${tr.outcome.pass ? 'pass' : 'FAIL'} steps=${tr.outcome.steps} ${(buf.length / 1024) | 0}KB  +${((Date.now() - t0) / 1000) | 0}s`);
        return { file, set: j.set, vehicle: j.vehicle, level: j.level + 1, weather: tr.meta.weather, policy: j.policy, mode: tr.meta.mode, skin: tr.meta.skin, dailyKey: tr.meta.dailyKey,
          steps: tr.outcome.steps, samples: tr.samples.length, pass: tr.outcome.pass, crashes: tr.outcome.crashes, finishSimT: tr.outcome.finishSimT, finishRunT: tr.outcome.finishRunT,
          crashX: tr.events.filter(e => e.type === 'crash').map(e => +e.x.toFixed(3)), bytesGz: buf.length, finalChk: tr.chk.slice(-8) };
      });
      index.sort((x, y) => x.file < y.file ? -1 : 1);
      const idx = { format: 1, game: 'mixer-mad-v7h', seed: SEED, dt: '1/120', generated: new Date().toISOString(), policies: POL, count: index.length, totalBytesGz: index.reduce((s, e) => s + e.bytesGz, 0), traces: index };
      const idxFile = only ? 'INDEX.' + only + '.json' : 'INDEX.json'; fs.writeFileSync(path.join(TRACES, idxFile), JSON.stringify(idx, null, 1));
      console.log('wrote', idxFile, index.length, 'traces', (idx.totalBytesGz / 1048576).toFixed(1) + ' MB gz', ((Date.now() - t0) / 1000 | 0) + 's');
    } else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n')); }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { recordOne, openPage, readTrace, POL, SET_A, SET_B, plan, PRNG_SRC, SEED, HTML };
