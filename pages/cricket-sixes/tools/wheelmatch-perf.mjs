// Wheel match perf harness (PERF agent, 2026-11-15 wheel-match build). Measures the over model build (N_SAMP sampled overs) and the spin.
//   node pages/cricket-sixes/tools/wheelmatch-perf.mjs [node|browser|all]      (default all)    Env: WMP_OUT=file.json  WMP_SEED=perf1
// Instrumentation: js/core/wheelmatch.js is rewritten on load (node: module.register loader hook; Chromium: page.route) so every
// sampleOvers (= one model build) and every wheelOverModel call (hit or miss) is counted with its caller. No game file is edited.
// node:    build ms per over (cold), memo hits, builds per over by trigger (screen open, re-render, chip change, WheelOver), memory per build,
//          a season-state build (fx + pairing on), auto whole match wall time (no pacing).
// browser: Chromium 475x638, CDP CPU throttle x1/x4/x6: build ms per over in page, rAF frame deltas while the wheel spins / glides
//          (p50/p95/max, frames > 20 ms), builds per over through the real UI, Auto rest of innings wall time.
import http from 'node:http';
import { createRequire, register } from 'node:module';
import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODE = process.argv[2] || 'all';
const SEED = process.env.WMP_SEED || 'perf1';
const OUT = {};

// ---------------------------------------------------------------- instrumentation (shared by node and the browser)
const WRAP = `
export function sampleOvers(...a) { const P = globalThis.__wmPerf, t0 = performance.now(); const r = __raw_sampleOvers(...a);
  if (P) P.build(performance.now() - t0, a[1], a[2], a[0] && (a[1] === 'bat' ? a[0].inn2 : a[0].inn1).over, new Error().stack); return r; }
export function wheelOverModel(...a) { const P = globalThis.__wmPerf; if (P) P.model(); return __raw_wheelOverModel(...a); }
`;
export function instrument(src) {
  if (!src.includes('export function sampleOvers(') || !src.includes('export function wheelOverModel(')) throw new Error('wheelmatch.js API changed');
  return src.replace('export function sampleOvers(', 'function __raw_sampleOvers(').replace('export function wheelOverModel(', 'function __raw_wheelOverModel(') + WRAP;
}
const PERF_INIT = `(() => { const P = globalThis.__wmPerf = { builds: [], models: 0, tag: '',
  build(ms, side, bowler, over, stack) { const who = (stack.match(/(wheelmatch-view|selectors|wheelmatch-store|commands|app)\\.js:\\d+/g) || []).slice(0, 4).join('<'); P.builds.push({ ms, side, bowler, over, tag: P.tag, who, at: performance.now() }); },
  model() { P.models++; } };
  const raf0 = globalThis.requestAnimationFrame; if (raf0) { P.work = []; globalThis.requestAnimationFrame = (cb) => raf0((t) => { const a = performance.now(); try { cb(t); } finally { if (P.workOn) P.work.push([t, performance.now() - a]); } }); } })();`;

// ---------------------------------------------------------------- stats
const pct = (xs, q) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const r1 = (x) => Math.round(x * 10) / 10;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const stat = (xs) => ({ n: xs.length, min: r1(Math.min(...xs)), mean: r1(sum(xs) / (xs.length || 1)), p50: r1(pct(xs, 0.5)), p95: r1(pct(xs, 0.95)), max: r1(Math.max(...xs)) });

// ---------------------------------------------------------------- node
async function nodeRun() {
  if (!globalThis.gc) { // re-run with --expose-gc for the memory numbers
    const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), 'node-inner'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', env: process.env });
    return JSON.parse(r.stdout.trim().split('\n').pop());
  }
  return nodeInner();
}
async function nodeInner() {
  const hooks = `export async function load(url, ctx, next) { const r = await next(url, ctx);
    if (url.endsWith('/js/core/wheelmatch.js')) { const src = String(r.source); return { format: 'module', shortCircuit: true, source: (${instrument.toString()})(src) }; }
    return r; }`.replace('+ WRAP', '+ ' + JSON.stringify(WRAP));
  register('data:text/javascript,' + encodeURIComponent(hooks));
  (0, eval)(PERF_INIT);
  const P = globalThis.__wmPerf;
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { FLAGS } = await imp('js/data/flags.js');
  const { createStore } = await imp('js/store/store.js');
  const WS = await imp('js/store/wheelmatch-store.js');
  const WM = await imp('js/core/wheelmatch.js');
  const res = { overs: [] };
  const take = () => { const b = P.builds.splice(0); return b; };

  // A. one wheel match from NewMatch, step by step like the UI does
  const store = createStore(null);
  store.dispatch('NewMatch', { seed: SEED, mode: 'wheel' });
  let g = 0;
  while (store.get().stage !== 'done' && g++ < 40) {
    const s = store.get();
    if (s.stage === 'break') { store.dispatch('StartChase', {}); continue; }
    const side = s.stage === 'bowl' ? 'bowl' : 'bat', over = (side === 'bowl' ? s.inn1 : s.inn2).over;
    const row = { side, over };
    let t0 = performance.now(); const vm = WS.wheelMatchVM(s); row.vmOpenMs = r1(performance.now() - t0);
    let b = take(); row.buildsOpen = b.length; row.buildMs = b.length ? r1(b[0].ms) : 0;
    t0 = performance.now(); WS.wheelMatchVM(s); row.vmRerenderMs = r1(performance.now() - t0); row.buildsRerender = take().length;
    if (side === 'bowl') { // chip change: look at every other legal bowler, then back to the suggested one
      const legal = vm.bowlers.filter((c) => c.ok).map((c) => c.idx);
      for (const i of legal) WS.wheelMatchVM(s, i);
      WS.wheelMatchVM(s, vm.suggested);
      b = take(); row.legal = legal.length; row.buildsChips = b.length; row.chipBuildMs = r1(sum(b.map((x) => x.ms)));
    }
    t0 = performance.now();
    store.dispatch('WheelOver', side === 'bowl' ? { bowler: vm.suggested, stop: { t: 3.5, phi: 1.3 } } : { stop: { t: 3.5, phi: 1.3 } });
    row.wheelOverMs = r1(performance.now() - t0); row.buildsWheelOver = take().length;
    // the UI re-renders on the store notify: that VM builds the NEXT over's model right after the dispatch (during the glide)
    const s2 = store.get();
    if (s2.stage === 'bowl' || s2.stage === 'chase') { t0 = performance.now(); WS.wheelMatchVM(s2); row.nextVmMs = r1(performance.now() - t0); const nb = take(); row.buildsNextOnNotify = nb.length; row.nextBuildMs = nb.length ? r1(nb[0].ms) : 0; }
    res.overs.push(row);
  }
  P.builds.length = 0;
  const cold = res.overs.flatMap((o) => [o.buildMs, o.nextBuildMs]).filter((x) => x > 0);
  res.buildMs = stat(cold);
  res.vmRerenderMs = stat(res.overs.map((o) => o.vmRerenderMs));
  res.wheelOverMs = stat(res.overs.map((o) => o.wheelOverMs));
  res.buildsPerOver = { open: sum(res.overs.map((o) => o.buildsOpen)) / res.overs.length, rerender: sum(res.overs.map((o) => o.buildsRerender)) / res.overs.length,
    chipsPerBowlOver: r1(sum(res.overs.filter((o) => o.side === 'bowl').map((o) => o.buildsChips)) / res.overs.filter((o) => o.side === 'bowl').length),
    wheelOver: sum(res.overs.map((o) => o.buildsWheelOver)) / res.overs.length,
    nextOnNotify: sum(res.overs.map((o) => o.buildsNextOnNotify || 0)) / res.overs.length };

  // B. memory: retained per model, and churn of one build
  const s = createStore(null); s.dispatch('NewMatch', { seed: SEED + 'm', mode: 'wheel' });
  const st = s.get(), bw = WS.suggestedBowler(st);
  globalThis.gc(); const h0 = process.memoryUsage().heapUsed;
  const samples = WM.sampleOvers(st, 'bowl', bw, {});
  globalThis.gc(); const h1 = process.memoryUsage().heapUsed;
  const segs = WM.buildSegments(samples, { side: 'bowl' });
  res.memory = { retainedSamplesKB: Math.round((h1 - h0) / 1024), segsJSONKB: r1(JSON.stringify(segs).length / 1024), lastWheelSegs: segs.length,
    memoMaxKB: Math.round(4 * (h1 - h0) / 1024) };
  // churn: heap growth of one build with GC suppressed as far as possible (young gen); a lower bound
  globalThis.gc(); const c0 = process.memoryUsage().heapUsed; const keep = WM.sampleOvers(st, 'bowl', bw, { n: 2000 }); const c1 = process.memoryUsage().heapUsed;
  res.memory.allocPerBuildMBLowerBound = r1((c1 - c0) / 1048576); void keep;
  // split: playOver vs the copy vs fold
  const reps = 5; let tS = 0, tF = 0;
  for (let i = 0; i < reps; i++) { let t = performance.now(); const xs = WM.sampleOvers(st, 'bowl', bw, {}); tS += performance.now() - t; t = performance.now(); WM.buildSegments(xs, { side: 'bowl' }); tF += performance.now() - t; }
  res.split = { sampleMs: r1(tS / reps), foldMs: r1(tF / reps), perSampleUs: r1(1000 * tS / reps / 2000) };
  const tFor = (n) => { const t = performance.now(); WM.sampleOvers(st, 'bowl', bw, { n }); return r1(performance.now() - t); };
  const rep = [], cpu = []; for (let i = 0; i < 20; i++) { const c = process.cpuUsage(), t = performance.now(); WM.sampleOvers(st, 'bowl', bw, {}); rep.push(performance.now() - t); cpu.push(process.cpuUsage(c).user / 1000); }
  res.sameStateCpuMs = stat(cpu.slice(2)); res.loadavg = (await import('node:os')).loadavg().map(r1);
  res.sameStateBuildMs = stat(rep.slice(2));
  res.byN = { 500: tFor(500), 1000: tFor(1000), 2000: tFor(2000) };
  P.builds.length = 0;

  // C. season-state build (fx + pairing + wheel meta): the costlier path
  try {
    FLAGS.wheelMatch = true; FLAGS.wheelMeta = true;
    const ss = createStore(null); ss.dispatch('NewGame', { seed: SEED + 's' });
    let k = 0;
    while (ss.get().stage !== 'bowl' && k++ < 50) {
      const q = ss.get(), d = (c, p) => ss.dispatch(c, p);
      if (['hub', 'semi', 'final'].includes(q.stage)) d('OpenSquad');
      else if (q.stage === 'squad') d('SetSix', { ids: q.clubs[0].squad.slice(0, 6).map((p) => p.id) });
      else if (q.stage === 'plan') { d('SetPlan', { overs: q.plan.overs, fields: q.plan.fields }); d('NewMatch'); }
      else if (q.stage === 'matchday') d('NewMatch');
      else if (q.stage === 'freepick') d('PickFree', { id: 0 });
      else break;
    }
    const q = ss.get();
    if (q.stage === 'bowl' && q.mode === 'wheel') {
      const xs = []; for (let i = 0; i < 5; i++) { const t = performance.now(); WM.sampleOvers(q, 'bowl', WS.suggestedBowler(q)); xs.push(performance.now() - t); }
      res.seasonBuildMs = stat(xs);
    } else res.seasonBuildMs = { skipped: `stage ${q.stage} mode ${q.mode}` };
  } catch (e) { res.seasonBuildMs = { error: String(e.message || e) }; }
  P.builds.length = 0;

  // D. whole match on auto, no pacing: build + replay cost only
  const sa = createStore(null); sa.dispatch('NewMatch', { seed: SEED + 'a', mode: 'wheel' });
  let t0 = performance.now(), ov = 0;
  while (sa.get().stage !== 'done' && ov < 40) { const q = sa.get(); if (q.stage === 'break') sa.dispatch('StartChase', {}); else { WS.wheelMatchVM(q); sa.dispatch('WheelOver', { auto: true }); ov++; } }
  res.autoMatch = { overs: ov, ms: Math.round(performance.now() - t0), builds: P.builds.length };
  return res;
}

// ---------------------------------------------------------------- browser
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };
async function browserRun() {
  const req = createRequire(import.meta.url);
  let pw; try { pw = req('playwright'); } catch (e) { pw = req(req.resolve('playwright', { paths: [execSync('npm root -g', { encoding: 'utf8' }).trim()] })); }
  const server = http.createServer(async (rq, rs) => {
    try {
      let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname); if (!p || p.endsWith('/')) p += 'index.html';
      const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside');
      let body = await readFile(f);
      if (p.endsWith('/js/core/wheelmatch.js')) body = instrument(String(body));
      rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(body);
    } catch (e) { rs.writeHead(404); rs.end('nf'); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const ORIGIN = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch();
  const res = {};
  try {
    for (const rate of (process.env.WMP_RATES || '1,4,6').split(',').map(Number)) res['x' + rate] = await browserAt(browser, ORIGIN, rate);
  } finally { await browser.close(); server.close(); }
  return res;
}

async function browserAt(browser, ORIGIN, rate) {
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(PERF_INIT);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.goto(`${ORIGIN}/index.html?seed=${SEED}`);
  await page.waitForFunction(() => !!window.__store);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const out = { rate };

  // 1. build ms in page (cold, direct engine call; same module instance as the app)
  out.buildMs = await page.evaluate(async (seed) => {
    const st = await import('./js/store/store.js'), WS = await import('./js/store/wheelmatch-store.js'), WM = await import('./js/core/wheelmatch.js');
    const s = st.createStore(null); s.dispatch('NewMatch', { seed: seed + 'b', mode: 'wheel' });
    const xs = [];
    for (let i = 0; i < 3; i++) WM.sampleOvers(s.get(), 'bowl', WS.suggestedBowler(s.get()), {}); // JIT warm-up
    for (let i = 0; i < 18; i++) { const q = s.get(); if (q.stage !== 'bowl') break; const t = performance.now(); WM.sampleOvers(q, 'bowl', WS.suggestedBowler(q), {}); xs.push(performance.now() - t); if (i % 2) s.dispatch('WheelOver', { auto: true }); }
    const t = performance.now(); WM.buildSegments(WM.sampleOvers(s.get(), 'bowl', WS.suggestedBowler(s.get()), {}), { side: 'bowl' }); const full = performance.now() - t;
    const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
    globalThis.__wmPerf.builds.length = 0;
    return { samples: xs, fullBuildMs: full, heapMB: heap / 1048576 };
  }, SEED);
  out.buildMs.stat = { ...stat(out.buildMs.samples), min: r1(Math.min(...out.buildMs.samples)) }; delete out.buildMs.samples; // first one includes JIT warm-up
  out.buildMs.fullBuildMs = r1(out.buildMs.fullBuildMs); out.buildMs.heapMB = r1(out.buildMs.heapMB);

  // 2. a wheel match in the real app: a step-0 wheel match (NewMatch, no season) saved into localStorage, then reload
  await page.evaluate(async (seed) => {
    const st = await import('./js/store/store.js'); const s = st.createStore(null); s.dispatch('NewMatch', { seed, mode: 'wheel' });
    localStorage.setItem('cs.save.1', window.__save.exportText(s.get()));
  }, SEED + 'ui');
  await page.reload(); await page.waitForFunction(() => !!window.__store);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate }).catch(() => {});
  await page.waitForTimeout(500);
  const ok = await page.evaluate(() => window.__store.get().mode === 'wheel' && window.__store.get().stage);
  const ui = await page.evaluate(() => {
    const txt = (document.body.innerText || '').slice(0, 400);
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 30);
    return { canvas: !!document.querySelector('canvas'), txt, btns, builds: globalThis.__wmPerf.builds.map((b) => ({ ms: Math.round(b.ms), who: b.who })) };
  });
  out.ui = { stage: ok, canvas: ui.canvas, buttons: ui.btns, buildsOnOpen: ui.builds };
  await page.evaluate(() => { globalThis.__wmPerf.builds.length = 0; });
  const takeB = () => page.evaluate(() => globalThis.__wmPerf.builds.splice(0).map((b) => ({ ms: Math.round(b.ms), over: b.over, bowler: b.bowler, at: Math.round(b.at), who: b.who })));
  const paint = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const rafOn = () => page.evaluate(() => { globalThis.__wmPerf.work = []; globalThis.__wmPerf.workOn = true; const d = (globalThis.__rafD = []); const ts = (globalThis.__rafT = []); let last = 0; const f = (t) => { if (last) { d.push(t - last); ts.push(t); } last = t; if (!globalThis.__rafStop) requestAnimationFrame(f); }; globalThis.__rafStop = false; requestAnimationFrame(f); });
  const rafOff = () => page.evaluate(() => { globalThis.__rafStop = true; const P = globalThis.__wmPerf; P.workOn = false; return { d: globalThis.__rafD, t: globalThis.__rafT, w: P.work.splice(0) }; });
  const wstat = (w) => { const per = new Map(); for (const [t, ms] of w) per.set(t, (per.get(t) || 0) + ms); const xs = [...per.values()]; return xs.length ? { frames: xs.length, p50: r1(pct(xs, 0.5)), p95: r1(pct(xs, 0.95)), max: r1(Math.max(...xs)) } : null; };
  const fstat = (d) => (d.length ? { ...stat(d), over20: d.filter((x) => x > 20).length, worst3: d.slice().sort((x, y) => y - x).slice(0, 3).map(r1) } : { n: 0 });

  // 3. chip change: tap every enabled bowler chip (pick screen)
  const chips = await page.$$('.wm [data-bowler]:not([disabled])');
  const chipTimes = [];
  for (const c of chips) { const t = Date.now(); await c.click({ timeout: 2000 }).catch(() => {}); await paint(); chipTimes.push(Date.now() - t); }
  out.chips = { enabled: chips.length, tapToPaintMs: chipTimes, builds: await takeB() };

  // 4. one aimed spin per bowler kind: (a) the suggested bowler, (b) another legal chip (its wheel is not the VM's default)
  out.spins = [];
  for (const kind of ['suggested', 'other']) {
    if ((await page.evaluate(() => window.__store.get().stage)) !== 'bowl') break;
    const vmS = await page.evaluate(async () => { const S = await import('./js/store/selectors.js'); const v = S.wheelMatchVM(window.__store.get()); return { sug: v.suggested, ok: v.bowlers.filter((c) => c.ok).map((c) => c.idx) }; });
    const pickIdx = kind === 'suggested' ? vmS.sug : vmS.ok.find((i) => i !== vmS.sug);
    if (pickIdx == null) break;
    await page.click(`.wm [data-bowler="${pickIdx}"]`, { timeout: 3000 }).catch((e) => { out.chipErr = String(e.message).slice(0, 120); });
    await page.click('.wm [data-wm="go"]', { timeout: 3000 }).catch(() => {});
    await paint(); await takeB();
    const spin = { kind, bowler: pickIdx };
    await rafOn();
    await page.click('.wm [data-wm="spin"]', { timeout: 3000 }).catch((e) => { spin.spinErr = String(e.message).slice(0, 80); });
    await page.waitForTimeout(3500);
    const tStop = await page.evaluate(() => performance.now());
    await page.click('.wm [data-wm="stop"]', { timeout: 3000 }).catch((e) => { spin.stopErr = String(e.message).slice(0, 80); });
    await page.waitForTimeout(2700); // glide D 2.0 s + landing beat
    const R = await rafOff();
    const pre = [], post = []; R.t.forEach((t, i) => (t <= tStop ? pre : post).push(R.d[i]));
    spin.spin = fstat(pre.slice(2)); spin.afterStop = fstat(post);
    spin.workSpin = wstat(R.w.filter((x) => x[0] <= tStop)); spin.workAfterStop = wstat(R.w.filter((x) => x[0] > tStop));
    spin.bowledBy = await page.evaluate(() => { const o = window.__store.get().inn1.overs; return o.length ? o[o.length - 1].bowler : null; });
    spin.wheelOverMs = await page.evaluate(() => globalThis.__wmPerf.lastWO || null);
    spin.builds = (await takeB()).map((x) => ({ ...x, afterStopMs: Math.round(x.at - tStop) }));
    // skip the ball row, then Next: its tap-to-paint includes the next over's build (release -> render -> wheelMatchVM)
    await page.click('.wm .wm-x', { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300);
    const nt = Date.now(); await page.click('[data-wm-next]', { timeout: 3000 }).catch((e) => { spin.nextErr = String(e.message).slice(0, 80); }); await paint();
    spin.nextTapToPaintMs = Date.now() - nt; spin.nextBuilds = await takeB();
    out.spins.push(spin);
  }

  // 5. Auto rest of innings (shown from over 2): wall time to the break, frames, builds
  const auto = {};
  const rest = page.locator('.wm [data-wm="auto-rest"]').first();
  auto.found = await rest.count();
  if (auto.found) {
    const o0 = await page.evaluate(() => window.__store.get().inn1.over);
    await takeB(); await rafOn();
    const t0 = Date.now(); await rest.click();
    await page.waitForFunction(() => window.__store.get().stage !== 'bowl', null, { timeout: 90000, polling: 50 }).catch(() => {});
    auto.wallMs = Date.now() - t0; auto.overs = 11 - o0; auto.msPerOver = Math.round(auto.wallMs / auto.overs);
    const R = await rafOff(); auto.frames = fstat(R.d.slice(1)); auto.work = wstat(R.w);
    const b = await takeB(); auto.builds = b.length; auto.buildMs = b.length ? stat(b.map((x) => x.ms)) : null; auto.who = [...new Set(b.map((x) => x.who))];
    auto.stage = await page.evaluate(() => window.__store.get().stage);
  }
  out.auto = auto;
  out.errors = errs.slice(0, 5);
  await ctx.close();
  return out;
}

// ---------------------------------------------------------------- main
if (MODE === 'node-inner') { const r = await nodeInner(); process.stdout.write('\n' + JSON.stringify(r) + '\n'); process.exit(0); }
if (MODE === 'node' || MODE === 'all') OUT.node = await nodeRun();
if (MODE === 'browser' || MODE === 'all') OUT.browser = await browserRun();
const text = JSON.stringify(OUT, null, 1);
if (process.env.WMP_OUT) writeFileSync(process.env.WMP_OUT, text);
console.log(text);
