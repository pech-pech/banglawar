// E2E for Burn Window. Run: node tests/e2e.js
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + ROOT + '/index.html?seed=1';
const VPS = [{ w: 475, h: 638, touch: false }, { w: 344, h: 882, touch: true }];
const out = [];
const log = s => { console.log(s); out.push(s); };
let fails = 0;
const rec = (vp, name, ok, note) => { if (!ok) fails++; log(`${ok ? 'PASS' : 'FAIL'} [${vp}] ${name}${note ? ' :: ' + note : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function build() {
  execSync('python3 ' + path.join(ROOT, 'src/build.py'), { stdio: 'inherit' });
  const idx = fs.statSync(path.join(ROOT, 'index.html')).mtimeMs;
  const newer = fs.readdirSync(path.join(ROOT, 'src')).filter(f => fs.statSync(path.join(ROOT, 'src', f)).mtimeMs > idx);
  if (newer.length) { log('FAIL [build] src newer than index.html: ' + newer.join(', ')); process.exit(1); }
  log('PASS [build] index.html up to date');
}

async function open(browser, vp, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: vp.touch ? 2 : 1 }, extra || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL);
  return { ctx, page, errs };
}
const ready = page => page.waitForFunction(() => window.__bw && window.__bw.phase === 'intro', null, { timeout: 60000 });
async function tap(page, vp, x, y, holdMs) {
  if (vp.touch && !holdMs) return page.touchscreen.tap(x, y);
  await page.mouse.move(x, y); await page.mouse.down(); await sleep(holdMs || 40); await page.mouse.up();
}

async function run(browser, vp) {
  const tag = `${vp.w}x${vp.h}`;
  const T = (n, ok, note) => rec(tag, n, ok, note);
  const safe = async (n, fn) => { try { await fn(); } catch (e) { T(n, false, 'exception: ' + String(e.message).split('\n')[0]); } };
  const cx = vp.w / 2, cy = vp.h / 2;

  // 1 console errors in 8s
  await safe('1 no console errors in 8s', async () => {
    const { ctx, page, errs } = await open(browser, vp);
    await ready(page); await sleep(8000);
    T('1 no console errors in 8s', errs.length === 0, errs.slice(0, 3).join(' | '));
    // 2 launch
    await safe('2 tap launches intro->run', async () => {
      const p0 = await page.evaluate(() => __bw.phase);
      await tap(page, vp, cx, cy);
      await sleep(300);
      const p1 = await page.evaluate(() => __bw.phase);
      T('2 tap launches intro->run', p0 === 'intro' && p1 === 'run', `${p0} -> ${p1}`);
    });
    // 3 tap burns ~0.83
    await safe('3 tap burns, fuel drops ~0.83', async () => {
      await sleep(600);
      const a = await page.evaluate(() => ({ f: __bw.state.fuel, u: __bw.state.fuelUsed }));
      await tap(page, vp, cx, cy, 40);
      await sleep(500);
      const b = await page.evaluate(() => ({ f: __bw.state.fuel, u: __bw.state.fuelUsed }));
      const d = a.f - b.f;
      T('3 tap burns, fuel drops ~0.83', d > 0.6 && d < 1.1, `fuel drop ${d.toFixed(3)} (expected ~0.83)`);
    });
    // 9 retry (also forces an attempt log)
    await safe('9 Retry restarts running', async () => {
      await sleep(300);
      const n0 = await page.evaluate(() => __bw.state.n);
      await page.mouse.click(36, 28);
      await sleep(250);
      const s = await page.evaluate(() => ({ p: __bw.phase, n: __bw.state && __bw.state.n }));
      T('9 Retry restarts running', s.p === 'run' && s.n < n0 && s.n < 120, `phase=${s.p} n ${n0} -> ${s.n}`);
    });
    // 5b after retry, report has attempt
    await safe('5b report after retry', async () => {
      const r = await page.evaluate(() => __bw.report());
      const ok = r.determinism.ok === true && r.attempts.length >= 1 && r.inputLog.length > 0;
      T('5b report() after Retry: attempts>=1, inputLog non-empty', ok, `attempts=${r.attempts.length} inputLog=${r.inputLog.length}`);
    });
    // 7 hidden tab
    await safe('7 hidden tab', async () => {
      await page.evaluate(() => __bw.hold(false));
      await sleep(200);
      const n0 = await page.evaluate(() => __bw.state.n);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await sleep(1000);
      const s = await page.evaluate(() => ({ n: __bw.state.n, p: __bw.phase }));
      T('7 hidden tab: sim steps do not advance, no failure', s.n === n0 && s.p !== 'failed', `steps ${n0} -> ${s.n} in 1 s hidden, phase=${s.p} (game loop does not check document.hidden; real hidden tabs stop rAF)`);
      await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    });
    // 6 buttons
    await safe('6 button sizes/overlap', async () => {
      const r = await page.evaluate(() => {
        const nb = [...document.querySelectorAll('[data-bw]')].find(b => b.textContent === 'Next' || b.textContent === 'New run' || b.textContent === 'Finish');
        const prev = nb.style.display; nb.style.display = 'block';
        const rects = [...document.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(); return { t: b.textContent, x: q.x, y: q.y, w: q.width, h: q.height }; });
        nb.style.display = prev;
        return { rects, w: innerWidth, h: innerHeight };
      });
      const sc = Math.max(0.8, Math.min(1.5, Math.min(r.w / 340, (r.h - 56 - 96) / 486)));
      const pf = { x: (r.w - 340 * sc) / 2, y: 56, w: 340 * sc, h: 486 * sc };
      const bad = [];
      for (const b of r.rects) {
        if (b.w < 56 - 0.01 || b.h < 56 - 0.01) bad.push(`${b.t} ${b.w}x${b.h} small`);
        if (b.x < pf.x + pf.w && b.x + b.w > pf.x && b.y < pf.y + pf.h && b.y + b.h > pf.y) bad.push(`${b.t} overlaps playfield`);
      }
      T('6 buttons >=56x56 and clear of playfield', r.rects.length >= 5 && !bad.length, `${r.rects.length} buttons; playfield ${JSON.stringify(pf)}; ${bad.join('; ')}`);
    });
    await ctx.close();
  });

  // 4 par schedule
  await safe('4 par schedule docks', async () => {
    const { ctx, page, errs } = await open(browser, vp);
    await ready(page);
    const info = await page.evaluate(() => new Promise(resolve => {
      const sec = __bw.sector;
      const ev = BW.sim.schedToEvents(sec.par.sched);
      __bw.launch();
      let i = 0; const t0 = performance.now();
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        const s = __bw.state, p = __bw.phase;
        if (p !== 'run' || performance.now() - t0 > 120000) {
          __bw.hold(false);
          return resolve({ phase: p, fuelUsed: s.fuelUsed, par: sec.par.fuel, n: s.n, status: s.status, nEv: ev.length, evDone: i });
        }
        while (i < ev.length && ev[i][0] <= s.n) { __bw.hold(!!ev[i][1], ev[i][2] / 100); i++; }
        ch.port2.postMessage(0);
      };
      ch.port2.postMessage(0);
    }));
    const err = Math.abs(info.fuelUsed - info.par) / info.par;
    T('4 par schedule -> docked, fuelUsed within 15% of par', info.phase === 'docked' && err <= 0.15, JSON.stringify(info) + ` relErr=${(err * 100).toFixed(1)}%`);
    await safe('5 report()', async () => {
      const r = JSON.parse(JSON.stringify(await page.evaluate(() => __bw.report())));
      const ok = r.determinism && r.determinism.ok === true && r.attempts.length >= 1 && r.inputLog.length > 0 && r.inputLog.some(x => x.events.length);
      T('5 report() after dock: determinism.ok, attempts>=1, inputLog non-empty', ok, `det=${JSON.stringify(r.determinism)} attempts=${r.attempts.length} inputLog=${r.inputLog.length}`);
    });
    await ctx.close();
  });

  // 8 reduced motion
  await safe('8 reduced motion', async () => {
    const { ctx, page, errs } = await open(browser, vp, { reducedMotion: 'reduce' });
    await ready(page); await tap(page, vp, cx, cy); await sleep(2500);
    const rm = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    T('8 reduced motion emulation does not throw', rm && errs.length === 0, `matches=${rm} errs=${errs.slice(0, 2).join(' | ')}`);
    await ctx.close();
  });
}

(async () => {
  build();
  const browser = await chromium.launch({ headless: true, args: ['--trace', 'off'].slice(0, 0) });
  for (const vp of VPS) await run(browser, vp);
  await browser.close();
  log(fails ? `RESULT: ${fails} FAIL` : 'RESULT: ALL PASS');
  fs.writeFileSync(path.join(__dirname, 'E2E-RESULTS.txt'), out.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
})();
