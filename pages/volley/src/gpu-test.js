#!/usr/bin/env node
// Headless WebGPU + Canvas 2D check for Project Volley (L-TD-1, L-TD-9, L-LOL-7, L-LOL-8).
// Usage: node src/gpu-test.js [harness|game|both] [outDir]   (default both; harness = src/render-harness.html)
// Exit 1 on console errors, WebGPU output NOT seen, or a failed fallback check.
const path = require('path');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { console.error('playwright not resolvable'); process.exit(2); }

const SRC = __dirname;
const which = process.argv[2] || 'both';
const OUT = path.resolve(process.argv[3] || path.join(SRC, 'shots'));
fs.mkdirSync(OUT, { recursive: true });
// Flags proven in this sandbox (last-over-lane): real SwiftShader adapter, file:// page (secure context).
const GPU_ARGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'];
const VW = { width: 344, height: 882 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TARGETS = {
  harness: { file: path.join(SRC, 'render-harness.html'), q: '?frames=45', ready: () => window.__h && window.__h.frames > 5,
    renderer: () => window.__h.renderer, why: () => window.__h.R.why, readback: () => window.__h.R.readback({ png: true }) },
  game: { file: path.join(SRC, 'game.html'), q: '?seed=11', ready: () => window.__pv && window.__pv.renderer && window.__pv.renderer !== 'none',
    renderer: () => window.__pv.renderer, why: () => (window.__pv.R && window.__pv.R.why) || window.__pv.rendererWhy || '',
    readback: () => (window.__pv.R ? window.__pv.R.readback({ png: true }) : window.__pv.readback()) }
};

async function run(tname, label, extraQ, { throttle = 0, gapSamples = 0, fallbackChecks = false } = {}) {
  const T = TARGETS[tname];
  const res = { target: tname, label, errors: [], warnings: [] };
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const ctxB = await browser.newContext({ viewport: VW, deviceScaleFactor: 1 });
  const page = await ctxB.newPage();
  page.on('console', m => { if (m.type() === 'error') res.errors.push('console: ' + m.text()); else if (m.type() === 'warning') res.warnings.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => res.errors.push('pageerror: ' + e.message));
  const q = T.q + (extraQ ? '&' + extraQ : '');
  await page.goto('file://' + T.file + q);
  await page.waitForFunction(T.ready, null, { timeout: 20000 });
  await sleep(1500);
  res.renderer = await page.evaluate(T.renderer);
  res.why = await page.evaluate(T.why).catch(() => '');
  if (res.renderer === 'WebGPU') {
    const rb = await page.evaluate(T.readback).catch(e => ({ error: String(e.message || e) }));
    if (rb && rb.png) { const f = path.join(OUT, `${tname}-${label}-readback.png`); fs.writeFileSync(f, Buffer.from(rb.png.split(',')[1], 'base64')); res.gpuShot = f; delete rb.png; }
    res.readback = rb;
    res.webgpuOutput = rb && rb.nonBg > 0 ? `seen (nonBg ${rb.nonBg} of ${rb.w}x${rb.h}, nonBlack ${rb.nonBlack}, instances ${rb.instances})` : `NOT seen (${rb ? (rb.error || 'nonBg ' + rb.nonBg) : 'null'})`;
  } else {
    const hasGpu = await page.evaluate(() => !!navigator.gpu);
    res.webgpuOutput = 'NOT seen (renderer is ' + res.renderer + (hasGpu ? '' : '; no navigator.gpu') + (extraQ ? '; ' + extraQ : '') + ')';
  }
  const shot = path.join(OUT, `${tname}-${label}.png`);
  try { await page.screenshot({ path: shot, timeout: 15000 }); res.shot = shot; } catch (e) { res.warnings.push('screenshot failed: ' + e.message.split('\n')[0]); }

  if (fallbackChecks && res.renderer === 'WebGPU') res.fallback = await page.evaluate(fallbackSuite);

  if (gapSamples) {
    if (throttle) await (await ctxB.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
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

// Runs in the page (harness only: needs window.__h.R).
async function fallbackSuite() {
  const out = {}, R = window.__h.R, D = V.Render.SlowDetector;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const feed = (d, g, n) => { for (let i = 0; i < n; i++) if (d.feed(typeof g === 'function' ? g(i) : g)) return i + 1; return 0; };
  // L-LOL-7 detector cases
  let d = D(); out.steady30 = feed(d, 33.33, 3000) ? 'DROPPED (bad)' : 'stays';
  d = D(); out.jitter60 = feed(d, i => 16.7 + (i % 7 === 0 ? 9 : 0), 3000) ? 'DROPPED (bad)' : 'stays';
  d = D(); feed(d, 16.7, 100); const h1 = d.feed(300); const h2 = feed(d, 16.7, 600); out.hitch300ms = (h1 || h2) ? 'DROPPED (bad)' : 'stays';
  d = D(); const pre = feed(d, 16.7, 18000); const at = feed(d, 60, 2000); out.slow60AtMin5 = pre ? 'DROPPED early (bad)' : at ? `drops after ${at} slow frames (${(at * 0.06).toFixed(1)} s)` : 'NOT dropped (bad)';
  d = D(); feed(d, 16.7, 300); const s30 = feed(d, 33.33, 3000); out.switchTo30Hz = s30 ? 'DROPPED (bad)' : 'stays';
  // pick 15 effect scaler: steady 60 stays at 0; sustained 30 fps walks down one step per cooldown to 5; up only at a stage load, one step, only with headroom
  const E = V.Render.EffectScaler; let sc = E(); for (let i = 0; i < 3000; i++) sc.feed(16.7); out.scalerSteady60 = sc.step === 0 ? 'stays' : 'MOVED (bad)';
  sc = E(); for (let i = 0; i < 700; i++) sc.feed(40); out.scalerDown = sc.step === 5 && sc.log.length === 5 ? 'down to 5 in 5 moves' : 'WRONG (bad) step ' + sc.step;
  sc = E(); for (let i = 0; i < 50; i++) sc.feed(40); const s1 = sc.step; for (let i = 0; i < 300; i++) sc.feed(16.7); out.scalerNoMidFightUp = sc.step === s1 ? 'holds mid-fight' : 'MOVED UP mid-fight (bad)';
  const before = sc.step; sc.load('t1'); out.scalerUpAtLoad = sc.step === before - 1 ? 'one step up at stage load' : 'WRONG (bad) ' + before + '->' + sc.step;
  sc = E(); for (let i = 0; i < 100; i++) sc.feed(40); const s2 = sc.step; for (let i = 0; i < 100; i++) sc.feed(30); sc.load('t2'); out.scalerHoldWhenSlow = sc.step >= s2 ? 'holds when still slow' : 'MOVED UP while slow (bad)';
  out.scalerLog = typeof window.__pv === 'undefined' ? 'n/a (harness)' : 'ok';
  // L-LOL-8 live: fake non-destroyed loss -> Canvas 2D on the same call, then ONE re-init back to WebGPU
  const changes = []; R.onChange((n, why) => changes.push(n + ':' + why));
  R.test.fakeLoss('unknown');
  out.afterFakeLoss = R.name;
  out.c2dVisible = getComputedStyle(document.getElementById('c2d')).display !== 'none';
  for (let i = 0; i < 150 && R.name !== 'WebGPU'; i++) await wait(100); // re-init can take several seconds in this sandbox (the old 4 s wait failed on the unmodified file)
  out.afterReinit = R.name;
  // dev.destroy() -> 'destroyed' loss: stays on Canvas 2D, no second re-init
  R.test.destroyDevice();
  await wait(800);
  out.afterDestroy = R.name;
  await wait(800);
  out.afterDestroyLater = R.name;
  out.changes = changes;
  return out;
}

async function slowDropLive(tname) {
  // separate page: sustained slow frames on the live renderer -> drop to Canvas 2D and device released
  const T = TARGETS[tname], errors = [];
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const page = await (await browser.newContext({ viewport: VW, deviceScaleFactor: 1 })).newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + T.file + T.q + '&gpu=offscreen');
  await page.waitForFunction(T.ready, null, { timeout: 20000 });
  await sleep(800);
  const r = await page.evaluate(async () => {
    const R = window.__h.R; const before = R.name;
    const gaps = []; for (let i = 0; i < 400; i++) gaps.push(16.7); for (let i = 0; i < 200; i++) gaps.push(60);
    const after = R.test.feedGaps(gaps);
    await new Promise(r => setTimeout(r, 500));
    return { before, after, why: R.why, stillCanvas: R.name, c2d: getComputedStyle(document.getElementById('c2d')).display, cgpu: getComputedStyle(document.getElementById('cgpu')).display };
  });
  await browser.close();
  r.errors = errors;
  return r;
}

async function compare(a, b) {
  // mean abs diff per channel between two screenshots, computed in a page (no png lib needed)
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const d = await page.evaluate(async ([A, B]) => {
    const load = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = s; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const px = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const pa = px(ia), pb = px(ib); let sum = 0, big = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const dd = (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])) / 3;
      sum += dd; if (dd > 40) big++;
    }
    return { meanAbs: +(sum / (w * h)).toFixed(2), pixelsOver40: big, total: w * h };
  }, ['data:image/png;base64,' + fs.readFileSync(a).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(b).toString('base64')]);
  await browser.close();
  return d;
}

(async () => {
  const targets = which === 'both' ? ['harness', 'game'] : [which];
  let fail = false; const lines = [];
  for (const t of targets) {
    if (!fs.existsSync(TARGETS[t].file)) { lines.push(`[${t}] SKIP: ${TARGETS[t].file} missing`); continue; }
    const runs = [];
    // 'present': real swapchain. In this sandbox (Chromium headless + SwiftShader, 2026-11-10) presenting to a WebGPU canvas
    // loses the device within one frame for ANY page (the last-over-lane reference fails the same way now), so the
    // pass/fail WebGPU check runs with ?gpu=offscreen: same pipeline, renders to a texture, readback saved as PNG.
    for (const [label, q, opt] of [['present', '', {}], ['webgpu', 'gpu=offscreen', { fallbackChecks: t === 'harness' }], ['canvas2d', 'gpu=0', { throttle: 4, gapSamples: 300 }]]) {
      try { runs.push(await run(t, label, q, opt)); } catch (e) { runs.push({ target: t, label, fatal: e.message.split('\n')[0] }); fail = true; }
    }
    for (const r of runs) {
      if (r.fatal) { lines.push(`[${t}/${r.label}] FATAL ${r.fatal}`); continue; }
      lines.push(`[${t}/${r.label}] renderer=${r.renderer}${r.why ? ' (last switch: ' + r.why + ')' : ''} consoleErrors=${r.errors.length} shot=${r.shot ? path.relative(SRC, r.shot) : 'none'}${r.gpuShot ? ' gpuReadbackShot=' + path.relative(SRC, r.gpuShot) : ''}`);
      if (r.label === 'present') { lines.push(`[${t}/present] swapchain WebGPU output: ${r.webgpuOutput} (informational: sandbox loses the device on present)`); r.errors.forEach(e => lines.push(`[${t}/present] ERROR ${e}`)); if (r.errors.length) fail = true; continue; }
      if (r.label === 'webgpu') { lines.push(`[${t}/${r.label}] WebGPU output: ${r.webgpuOutput}`); if (!/^seen/.test(r.webgpuOutput)) fail = true; }
      if (r.gaps) lines.push(`[${t}/${r.label}] Canvas 2D perf (CPU x${r.cpuThrottle}, ${r.gaps.n} frames): rAF gaps over 50 ms: ${r.gaps.over50} (p50 ${r.gaps.p50} p95 ${r.gaps.p95} max ${r.gaps.max})`);
      if (r.fallback) {
        const f = r.fallback;
        lines.push(`[${t}/fallback] L-LOL-7 detector: steady30=${f.steady30} jitter60=${f.jitter60} hitch300ms=${f.hitch300ms} switchTo30Hz=${f.switchTo30Hz} slow60AtMin5=${f.slow60AtMin5}`);
        lines.push(`[${t}/fallback] L-LOL-8: fakeLoss -> ${f.afterFakeLoss} (2D canvas visible ${f.c2dVisible}) -> reinit ${f.afterReinit}; dev.destroy() -> ${f.afterDestroy}, later ${f.afterDestroyLater}; changes ${f.changes.join(', ')}`);
        lines.push(`[${t}/scaler] steady60=${f.scalerSteady60} sustained-slow=${f.scalerDown} mid-fight=${f.scalerNoMidFightUp} stage-load=${f.scalerUpAtLoad} still-slow=${f.scalerHoldWhenSlow}`);
        if (/bad/.test(JSON.stringify(f)) || f.afterFakeLoss !== 'Canvas 2D' || !f.c2dVisible || f.afterReinit !== 'WebGPU' || f.afterDestroyLater !== 'Canvas 2D') fail = true;
      }
      r.errors.forEach(e => lines.push(`[${t}/${r.label}] ERROR ${e}`));
      r.warnings.slice(0, 5).forEach(e => lines.push(`[${t}/${r.label}] warn ${e}`));
      if (r.errors.length) fail = true;
    }
    const a = runs.find(r => r.label === 'webgpu'), b = runs.find(r => r.label === 'canvas2d');
    if (a && b && a.gpuShot && b.shot && a.renderer === 'WebGPU') {
      const c = await compare(a.gpuShot, b.shot);
      lines.push(`[${t}] diff WebGPU readback vs Canvas 2D screenshot: mean abs ${c.meanAbs}/255, pixels differing > 40: ${c.pixelsOver40} of ${c.total} (${(100 * c.pixelsOver40 / c.total).toFixed(2)}%)${t === 'game' ? ' (live game, frames differ in time)' : ''}`);
    }
    if (t === 'harness') {
      try {
        const s = await slowDropLive(t);
        lines.push(`[${t}/slow-drop] live renderer ${s.before} -> ${s.after} (why ${s.why}); after 0.5 s ${s.stillCanvas}; c2d display '${s.c2d}', cgpu display '${s.cgpu}'; consoleErrors=${s.errors.length}`);
        s.errors.forEach(e => lines.push(`[${t}/slow-drop] ERROR ${e}`));
        if (s.after !== 'Canvas 2D' || s.errors.length) fail = true;
      } catch (e) { lines.push(`[${t}/slow-drop] FATAL ${e.message.split('\n')[0]}`); fail = true; }
    }
  }
  lines.push('RESULT: ' + (fail ? 'FAIL' : 'PASS'));
  console.log(lines.join('\n'));
  process.exit(fail ? 1 : 0);
})();
