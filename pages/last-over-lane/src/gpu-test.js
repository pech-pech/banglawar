#!/usr/bin/env node
// Headless WebGPU + Canvas 2D check for Last Over Lane.
// Usage: node src/gpu-test.js path/to/built.html [outDir]
// Needs playwright (require('playwright') must resolve). Exit code 1 on console errors or a failed run.
const path = require('path');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { console.error('playwright not resolvable'); process.exit(2); }

const file = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(file)) { console.error('usage: node gpu-test.js built.html [outDir]'); process.exit(2); }
const OUT = path.resolve(process.argv[3] || '/tmp/claude-0/-home-user/2e330b13-5991-5ecc-91d4-ae43e9d8b835/scratchpad/gputest');
fs.mkdirSync(OUT, { recursive: true });
// Flags proven in this sandbox (see FLAGS.txt): real SwiftShader adapter. Page must be file:// (secure context).
const GPU_ARGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan']; // NO --use-angle=swiftshader: it makes page.screenshot hang/take 5 s
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(label, query, { throttle = 0, gapSamples = 0 } = {}) {
  const res = { label, errors: [], warnings: [] };
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const ctxB = await browser.newContext({ viewport: { width: 384, height: 880 }, deviceScaleFactor: 1 });
  const page = await ctxB.newPage();
  page.on('console', m => { if (m.type() === 'error') res.errors.push('console: ' + m.text()); else if (m.type() === 'warning') res.warnings.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => res.errors.push('pageerror: ' + e.message));
  await page.goto('file://' + file + query);
  await page.waitForFunction(() => window.__lol && window.__lol.G, null, { timeout: 15000 });
  await sleep(2500); // let gpu.init resolve (non-blocking in the shell)

  res.renderer = await page.evaluate(() => window.__lol.renderer);
  // The readout is painted on a canvas (no DOM text). Try DOM first, else report n/a.
  res.readoutWord = await page.evaluate(() => {
    const m = (document.body.innerText || '').match(/\b(WebGPU|Canvas 2D)\b/); return m ? m[1] : 'n/a (canvas-drawn)';
  });
  if (res.renderer === 'WebGPU') {
    const rb = await page.evaluate(() => window.__lol.gpuReadback().then(r => r && { w: r.w, h: r.h, nonBg: r.nonBg, samples: r.samples }).catch(e => ({ err: String(e && e.message || e) })));
    res.readback = rb;
    res.webgpuOutput = rb && rb.nonBg > 0 ? `seen (nonBg ${rb.nonBg})` : `NOT seen (${rb ? (rb.err || 'nonBg ' + rb.nonBg) : 'null readback'})`;
  } else {
    const hasGpu = await page.evaluate(() => !!navigator.gpu);
    res.webgpuOutput = 'NOT seen (renderer is ' + res.renderer + (hasGpu ? '' : '; no navigator.gpu') + (query ? '; forced by ' + query : '') + ')';
  }

  if (throttle) await (await ctxB.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });

  // Start a match: click the button whose text includes 'Play'.
  await page.locator('#ovStart button', { hasText: 'Play' }).first().click({ timeout: 5000 });
  await page.waitForFunction(() => { const c = window.__lol.cur; return c && c.tRel; }, null, { timeout: 5000 });

  // In-page auto-tapper: for each new ball tap 'straight' at tArr (+corr so the offset is 0). The tap timestamp is
  // deterministic so a slow headless frame cannot turn a Perfect into a Good; fires on the first frame at/after tArr - 4 ms.
  await page.evaluate(() => {
    window.__t = { seen: [], tapped: new Set() };
    (function tick() {
      const L = window.__lol, c = L.cur;
      if (c && c.tRel && !c.done && !c.tap && !window.__t.tapped.has(c) && performance.now() >= c.tArr - 4) {
        window.__t.tapped.add(c);
        L.onTap('straight', c.tArr + (L.corr || 0));
        window.__t.seen.push({ d: c.d });
      }
      requestAnimationFrame(tick);
    })();
  });

  const shots = [];
  const snap = async name => { const p = path.join(OUT, `${label}-${name}.png`); try { await page.screenshot({ path: p, timeout: 10000 }); } catch (e) { res.warnings.push('screenshot ' + name + ' failed'); console.log('snapfail', name, Date.now() - t0); return; } if (process.env.DBG) console.log('snap', name, Date.now()-t0); shots.push(p); };
  let perfectShot = false, midDone = false, balls = 0;
  const t0 = Date.now();
  while (balls < 3 && Date.now() - t0 < 40000) {
    const st = await page.evaluate(() => {
      const c = window.__lol.cur, n = performance.now();
      return c ? { tRel: c.tRel, tArr: c.tArr, now: n, done: c.done, grade: c.res && c.res.grade, n: window.__t.seen.length } : null;
    });
    if (st) {
      if (!midDone && st.now > st.tRel + 150 && st.now < st.tArr - 100) { await snap('midflight'); midDone = true; }
      if (st.done && st.grade === 'perfect' && !perfectShot) { await snap('perfect'); perfectShot = true; }
      balls = st.n;
    }
    await sleep(30);
  }
  await sleep(150);
  res.balls = await page.evaluate(() => window.__t.seen.length);
  res.grades = await page.evaluate(() => (window.__lol.match ? window.__lol.match.log.map(l => l.grade) : []));
  if (!perfectShot) await snap('after-tap'); // fallback shot so there is always an image
  res.shots = shots.map(s => path.basename(s));

  // Canvas 2D perf (L-TD-9): count rAF gaps over 50 ms.
  if (gapSamples) {
    res.gaps = await page.evaluate(n => new Promise(resolve => {
      const g = []; let last = 0;
      requestAnimationFrame(function f(t) {
        if (last) g.push(t - last); last = t;
        if (g.length < n) return requestAnimationFrame(f);
        const s = [...g].sort((a, b) => a - b);
        resolve({ n: g.length, over50: g.filter(x => x > 50).length, p50: +s[Math.floor(n * .5)].toFixed(1), p95: +s[Math.floor(n * .95)].toFixed(1), max: +s[n - 1].toFixed(1) });
      });
    }), gapSamples);
    res.cpuThrottle = throttle;
  }
  await browser.close();
  return res;
}

(async () => {
  const out = { file, runs: [] };
  let fail = false;
  for (const [label, q, opt] of [['gpu', '', {}], ['gpu0', '?gpu=0', { throttle: 4, gapSamples: 300 }]]) {
    try { out.runs.push(await run(label, q, opt)); }
    catch (e) { out.runs.push({ label, fatal: e.message.split('\n')[0] }); fail = true; }
  }
  for (const r of out.runs) {
    if (r.fatal) { console.log(`[${r.label}] FATAL ${r.fatal}`); continue; }
    console.log(`[${r.label}] renderer=${r.renderer} readoutWord=${r.readoutWord} consoleErrors=${r.errors.length} balls=${r.balls} grades=${r.grades.join(',')}`);
    console.log(`[${r.label}] WebGPU output: ${r.webgpuOutput}`);
    if (r.gaps) console.log(`[${r.label}] Canvas 2D perf (CPU x${r.cpuThrottle}): rAF gaps over 50 ms: ${r.gaps.over50}/${r.gaps.n} (p50 ${r.gaps.p50} p95 ${r.gaps.p95} max ${r.gaps.max})`);
    r.errors.forEach(e => console.log(`[${r.label}] ERROR ${e}`));
    if (r.errors.length) fail = true;
  }
  console.log(JSON.stringify(out.runs.map(r => ({ label: r.label, renderer: r.renderer, errors: r.errors ? r.errors.length : null, webgpuOutput: r.webgpuOutput, balls: r.balls, grades: r.grades, over50: r.gaps && r.gaps.over50, shots: r.shots, fatal: r.fatal }))));
  process.exit(fail ? 1 : 0);
})();
