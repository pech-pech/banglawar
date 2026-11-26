// Windward Line smoothness + hash-guard e2e. Run from the game dir: node tests/smooth.e2e.cjs
// Needs: playwright. Prints one PASS/FAIL line per check; exit 1 on any FAIL. A missing hook is a FAIL line, not a crash.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const GAME = path.resolve(__dirname, '..');
const ROOT = path.dirname(GAME);          // pages/ dir
const REL = path.basename(GAME);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json', '.svg': 'image/svg+xml' };
let fails = 0;
const line = (ok, name, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const guard = async (name, fn) => { try { await fn(); } catch (e) { line(false, name, 'error: ' + String(e && e.message || e).split('\n')[0]); } };

// Node reference: frozen sim files, same bot plan as testhook (imported, not copied). stage 2 seed 7.
function nodeRef(untilTick) {
  const code = `
    const u = (f) => import(process.env.G + '/js/' + f);
    globalThis.window = {}; globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    const sim = await u('sim.js'), con = await u('contract.js'), th = await u('testhook.js');
    const t = th.installTestHook({});
    const mk = () => { const s = sim.createState(2, con.defaultCfg, 7); t.botPlan(s); sim.startRun(s); return s; };
    const a = sim.createState(2, con.defaultCfg, 7); t.botPlan(a); sim.startRun(a); sim.runToEnd(a, 20000);
    const out = { end: sim.hashState(a) };
    const n = Number(process.env.T);
    if (n > 0) { const s = mk(); while (s.tick < n && s.phase === 'run') sim.step(s); out.tick = s.tick; out.at = sim.hashState(s); }
    console.log(JSON.stringify(out));`;
  return JSON.parse(execFileSync('node', ['--input-type=module', '-e', code], { env: { ...process.env, G: pathToFileURL(GAME).href.replace('file://', 'file://'), T: String(untilTick || 0) } }).toString().trim().split('\n').pop());
}

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

async function open(browser, port, opts) {
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, serviceWorkers: 'block', ...(opts || {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message)); page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error', m.text()); });
  await page.goto(`http://localhost:${port}/${REL}/index.html?stage=2&seed=7`);
  await page.waitForFunction(() => !!(window.__test && window.__test.ready), null, { timeout: 15000 }).catch(async (e) => { console.log("  load debug:", await page.evaluate(() => typeof window.__test + " " + typeof window.WL).catch(() => "?")); throw e; });
  await page.evaluate(() => window.__test.ready);
  return { ctx, page };
}

// Start a fresh stage 2 seed 7 run with the bot plan at speed sp (calm optional). Returns after start.
// ahead > 0: step the sim that many ticks right after start (integrator: later-fire case; 1x only reaches ~tick 28 in 6 s).
const startLive = (page, sp, calm, ahead) => page.evaluate(async ({ sp, calm, ahead }) => {
  const WL = window.WL;
  if (calm != null && WL.setCalm) WL.setCalm(calm);
  WL.newState(2, 7); window.__test.botPlan(WL.state);
  WL.api.start(); WL.api.setSpeed(sp);
  if (ahead > 0) { const sim = await import('./js/sim.js'); for (let i = 0; i < ahead && WL.state.phase === 'run'; i++) sim.step(WL.state); }
}, { sp, calm, ahead: ahead || 0 });

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await open(browser, port);

    // 1a. hash of a full run: in-page == node
    await guard('hash: in-page runToEnd == node', async () => {
      const ref = nodeRef(0);
      const h = await page.evaluate(async () => {
        const sim = await import('./js/sim.js'), con = await import('./js/contract.js');
        const s = sim.createState(2, con.defaultCfg, 7); window.__test.botPlan(s); sim.startRun(s); sim.runToEnd(s, 20000);
        return sim.hashState(s);
      });
      line(h === ref.end, 'hash: in-page runToEnd == node', `page=${h} node=${ref.end}`);
    });

    // 1b. live frame-loop run to ~80 ticks at 4x == headless step loop to the same tick (motion on, then calm)
    for (const calm of [false, true]) {
      const name = `hash: live 4x frame loop (${calm ? 'calm' : 'motion'}) == headless same tick`;
      await guard(name, async () => {
        if (!(await page.evaluate(() => !!window.WL && typeof window.WL.setCalm === 'function'))) { line(false, name, 'missing hook WL.setCalm'); return; }
        await startLive(page, 4, calm);
        const live = await page.evaluate(() => new Promise((res) => {
          const WL = window.WL, t0 = performance.now();
          const poll = () => {
            const s = WL.state;
            if (s.tick >= 80 || s.phase !== 'run' || performance.now() - t0 > 30000) {
              WL.api.pause(true); // freeze; read tick and hash together in one task
              res({ tick: s.tick, hash: window.__test.hash(), phase: s.phase });
            } else requestAnimationFrame(poll);
          };
          poll();
        }));
        const ref = nodeRef(live.tick);
        line(live.tick >= 80 && live.hash === ref.at, name, `tick=${live.tick} live=${live.hash} node=${ref.at}`);
      });
    }

    // 2. smoothness at 1x and 4x, 6 s each
    for (const [sp, ahead] of [[1, 0], [1, 150], [4, 0]]) {
      const name = `smooth: ${sp}x 6s` + (ahead ? ` from tick ${ahead}` : '');
      await guard(name, async () => {
        if (!(await page.evaluate(() => !!window.WL && typeof window.WL.perf === 'function'))) { line(false, name, 'missing hook WL.perf'); return; }
        await startLive(page, sp, false, ahead);
        await page.waitForTimeout(1000); // first second excluded from snap check
        await page.evaluate(() => window.WL.perf(true));
        await page.waitForTimeout(6000);
        const r = await page.evaluate(() => {
          const WL = window.WL, p = WL.perf(false), rd = WL.rend || {};
          return { p, S: (rd.f && rd.f.S) || Math.max((rd.w || 475) / 96, (rd.h || 638) / 128) /* integrator: real px per cell (CELL_PX*view.scale) */, phase: WL.state.phase, tick: WL.state.tick };
        });
        const p = r.p;
        console.log(`  histogram ${name} frames=${p.frames} <=17:${p.le17} <=25:${p.le25} <=34:${p.le34} >34:${p.gt34} p95=${p.p95} max=${p.max}`);
        const budget = (6 * r.S / 60) * 1.6 * sp; // S = real px per cell from the render frame ctx
        line(p.maxJumpPx <= budget, `${name} maxJumpPx <= budget`, `${p.maxJumpPx} <= ${budget.toFixed(2)}`);
        line(p.fireMaxDelta <= 0.25, `${name} fireMaxDelta <= 0.25`, String(p.fireMaxDelta));
        line(p.snaps === 0, `${name} snaps === 0 after 1st second`, String(p.snaps));
        line(p.p95 <= 34, `${name} p95 frame <= 34 ms`, String(p.p95));
        line(p.frames > 60, `${name} frames measured`, `${p.frames} (run phase=${r.phase} tick=${r.tick})`);
      });
    }
    await ctx.close();

    // 3. calm: reduced motion
    await guard('calm: reducedMotion', async () => {
      const c = await open(browser, port, { reducedMotion: 'reduce' });
      const cls = await c.page.evaluate(() => document.documentElement.classList.contains('calm'));
      line(cls, 'calm: html has class calm under reduced motion');
      await c.page.evaluate(() => window.__test.goto('result-win'));
      const res = await c.page.evaluate(() => {
        const WL = window.WL, want = WL.state && WL.state.result ? WL.state.result.pct : null;
        const el = document.getElementById('result') || document.querySelector('.overlay:not([hidden])');
        return { want, text: el ? el.textContent : '', open: !!el && !el.hidden };
      });
      const shown = res.want != null && new RegExp('\\b' + res.want + '\\s*%').test(res.text);
      line(res.open && shown, 'calm: result sheet shows final pct at once', `want=${res.want} open=${res.open}`);
      await c.ctx.close();
    });
  } finally {
    await browser.close(); srv.close();
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL harness error: ' + e.message); srv.close(); process.exit(1); });
