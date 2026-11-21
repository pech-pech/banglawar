// Visual QA poses for Ridgeline B1. Run: node tests/ridgeline/poses.mjs  (writes tests/ridgeline/out/pose-*.png)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages');
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch();
const errors = [];
let failed = false;
const report = {};

// Frame freeze: headless runs ~8 fps, so poses are captured with rAF paused (window.__pause) the moment a condition holds.
const FREEZE = () => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => (window.__pause ? window.requestAnimationFrame(cb) : cb(t))); };

async function fresh(cfgSet, mode) {
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(FREEZE);
  await page.goto(`http://127.0.0.1:${port}/ridgeline/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ridgeline && window.__ridgeline.ready, null, { timeout: 30000 });
  await page.evaluate(async ([c, m]) => {
    const THREE = await import('/ridgeline/vendor/three.module.js');
    const w = window.__ridgeline;
    Object.assign(w.cfg, c); w.start(m || 'daily');
    // per-frame audit hook, runs after every draw
    window.__A = { n: 0, minCentre: 1e9, minCentreMode: '', noseBad: 0, noseN: 0, tumN: 0, tumOut: 0, tumMaxAbsNdc: 0, groundN: 0 };
    const v = w.view, od = v.draw.bind(v), vec = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
    v.draw = (s, t) => {
      od(s, t);
      if (!(s.t > 0)) return;
      const sl = v.sled, A = window.__A; sl.updateMatrixWorld(true); A.n++;
      const gy = w.course.height(s.x, s.z);
      if (s.mode !== 'tumble') { // skid-underside centre = origin - scale*(0.22 - groupY) ; compare via origin height over ground
        const c = sl.position.y - gy; if (c < A.minCentre) { A.minCentre = c; A.minCentreMode = s.mode; }
        if (s.mode === 'ground') A.groundN++;
        if (s.mode === 'air' && Math.abs(s.vy) > 3) { A.noseN++; fwd.set(0, 0, 1).transformDirection(sl.matrixWorld); if (Math.sign(fwd.y) !== Math.sign(s.vy)) A.noseBad++; }
      } else {
        A.tumN++; vec.copy(sl.position).project(v.camera);
        const m = Math.max(Math.abs(vec.x), Math.abs(vec.y)); if (m > A.tumMaxAbsNdc) A.tumMaxAbsNdc = m; if (m > 1 || vec.z > 1) A.tumOut++;
        // mesh orientation follows state.quat
        const q = sl.quaternion, k = s.quat; const dot = Math.abs(q.x * k.x + q.y * k.y + q.z * k.z + q.w * k.w); A.tumQuatMin = Math.min(A.tumQuatMin ?? 1, dot);
      }
    };
  }, [cfgSet || {}, mode]);
  return page;
}
// wait (real timers, 15 ms) until cond(state) holds, then freeze rAF so the frame is stable
async function until(page, cond, ms = 90000, freeze = true) {
  return page.waitForFunction(`(() => { const s = window.__ridgeline.state; const ok = !!(${cond}); if (ok && ${freeze}) window.__pause = true; return ok; })()`, null, { timeout: ms, polling: 15 });
}
const resume = (page) => page.evaluate(() => { window.__pause = false; });
async function shot(page, name) {
  await page.screenshot({ path: path.join(out, `pose-${name}.png`) });
  const info = await page.evaluate(() => { const s = window.__ridgeline.state; return { mode: s.mode, pitch: +s.pitch.toFixed(3), vy: +s.vy.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(1), speed: +s.speed.toFixed(1), diving: s.diving, tAir: +(s.tAir || 0).toFixed(2), crashed: s.crashed }; });
  report[name] = info;
  console.log('pose', name, JSON.stringify(info));
}
const hold = async (page) => { await page.mouse.move(237, 400); await page.mouse.down(); };
const release = async (page) => { await page.mouse.up(); };
const audits = {};
async function audit(page, name) { audits[name] = await page.evaluate(() => window.__A); }
const FLY = { baseSpeed: 45, maxSpeed: 48, rockDensity: 0 };
const rectOf = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); const r = e.getBoundingClientRect(); return { text: e.textContent, on: e.classList.contains('on'), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), fs: getComputedStyle(e).fontSize, op: getComputedStyle(e).opacity }; }, sel);

try {
  // (a) grounded carve: finger down, drag right for lean
  { const p = await fresh({ rockDensity: 0 });
    await hold(p); await p.mouse.move(300, 400, { steps: 4 });
    await until(p, 's.t > 3 && s.mode === "ground"');
    await shot(p, 'a-grounded-carve'); await audit(p, 'a'); await release(p); await p.context().close(); }
  // (b) mid-air float (finger held)
  { const p = await fresh(FLY);
    await hold(p);
    await until(p, 's.mode === "air" && s.tAir > 0.45 && !s.diving');
    await shot(p, 'b-air-float'); await audit(p, 'b'); await release(p); await p.context().close(); }
  // (c) mid-air dive (finger lifted in air: input.down=false)
  { const p = await fresh(FLY);
    await hold(p);
    await until(p, 's.mode === "air" && s.tAir > 0.05', 90000, false);
    await release(p);
    await until(p, 's.mode === "air" && s.diving && s.tAir > 0.4');
    await shot(p, 'c-air-dive'); await audit(p, 'c'); await p.context().close(); }
  // (d) landing word
  { const p = await fresh(FLY);
    await hold(p);
    await until(p, 's.mode === "air" && s.tAir > 0.3', 90000, false);
    await release(p);
    await p.waitForFunction(() => { const w = document.querySelector('.rlh-word.on'); if (w && w.textContent) { window.__pause = true; return true; } return false; }, null, { timeout: 60000, polling: 15 });
    await p.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 180; })); // word anim peaks at 20% of 0.9 s
    await shot(p, 'd-landing-word');
    report.word = await rectOf(p, '.rlh-word'); report.lift = await rectOf(p, '.rlh-lift');
    console.log('word', JSON.stringify(report.word), 'lift', JSON.stringify(report.lift)); await audit(p, 'd'); await p.context().close(); }
  // (e) rock tumble + (g) end screen
  { const p = await fresh({ rockDensity: 3, baseSpeed: 20 });
    await hold(p);
    let n = 0;
    while (n++ < 600) {
      const d = await p.evaluate(() => { const s = window.__ridgeline.state; if (s.mode === 'tumble' || s.crashed) return { done: true }; let best = null; for (const r of (s._rocks || [])) if (r.z > s.z + 1 && (!best || r.z < best.z)) best = r; return { done: false, dx: best ? best.x - s.x : 0 }; });
      if (d.done) break;
      await p.mouse.move(237 + Math.max(-80, Math.min(80, d.dx * 40)), 400);
      await p.waitForTimeout(30);
    }
    await until(p, 's.mode === "tumble" && s._tumT > 0.3', 30000);
    await p.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 180; }));
    await shot(p, 'e-rock-tumble');
    await resume(p);
    await p.getByText('CRASHED').first().waitFor({ state: 'visible', timeout: 60000 });
    await p.waitForTimeout(600);
    await shot(p, 'g-end-screen'); await audit(p, 'eg'); await release(p); await p.context().close(); }
  // (f) wreck recover: force with a low wreck threshold and a hard flight
  { const p = await fresh({ ...FLY, gradeImpactWreck: 2 });
    await until(p, 's.mode === "recover"', 150000);
    await shot(p, 'f-wreck-recover'); await audit(p, 'f'); await p.context().close(); }
} catch (e) { failed = true; console.error('FAIL', e.message); }
// assertions from the 300+ frame audit
let frames = 0;
for (const [k, a] of Object.entries(audits)) {
  frames += a.n;
  console.log('audit', k, JSON.stringify(a));
  if (a.minCentre < 0.69) { failed = true; console.error(`FAIL ${k}: sled origin only ${a.minCentre.toFixed(3)} above course.height (${a.minCentreMode}); skids would sink`); }
  if (a.noseBad > 0) { failed = true; console.error(`FAIL ${k}: nose pitch sign wrong in ${a.noseBad}/${a.noseN} air frames`); }
  if (a.tumOut > 0) { failed = true; console.error(`FAIL ${k}: tumbling sled left the frame in ${a.tumOut}/${a.tumN} frames`); }
  if (a.tumQuatMin != null && a.tumQuatMin < 0.999) { failed = true; console.error(`FAIL ${k}: tumble mesh quat deviates from state.quat (${a.tumQuatMin})`); }
}
console.log('audited frames', frames);
if (report.word && report.word.bottom > 638 - 120) { failed = true; console.error('FAIL landing word within 120 px of bottom'); }
fs.writeFileSync(path.join(out, 'poses.json'), JSON.stringify({ report, audits }, null, 1));
await browser.close(); server.close();
if (errors.length) { failed = true; console.error(errors.join('\n')); }
console.log(failed ? 'POSES FAIL' : 'POSES PASS');
process.exit(failed ? 1 : 0);
