// Playwright e2e for Moonstep. Run: node tests/e2e.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
const fails = []; let passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('PASS', m); } else { fails.push(m); console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w, h, query, errs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  await page.goto(base + (query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__moon && window.__moon.state(), null, { timeout: 5000 });
  return { ctx, page };
}
const st = page => page.evaluate(() => { const s = window.__moon.state(); return { tick: s.tick, over: s.over, cause: s.cause, height: s.height, jumps: s.jumps, mode: s.runner.mode, x: s.runner.x, y: s.runner.y, tideY: s.tideY }; });
const btns = page => page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { t: (b.textContent || b.getAttribute('aria-label') || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }; }).filter(b => b.vis));
const findBtn = async (page, re) => (await btns(page)).find(b => re.test(b.t));
const clickBtn = async (page, re) => { const b = await findBtn(page, re); if (!b) return false; await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2); return true; };

let base;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  for (const [w, h] of [[475, 638], [344, 882]]) {
    const tag = `${w}x${h}`, errs = [];
    const { ctx, page } = await open(browser, w, h, '', errs);
    try {
      // thumb zone vs runner position
      const view = await page.evaluate(([w, h]) => MoonDraw.makeView(w, h), [w, h]);
      ok(view.key === (w / h < 0.55 ? 'S' : 'W'), `${tag} view key ${view.key}`);
      const runnerY = view.runnerFrac * h;
      ok(runnerY < h * 0.58 - view.scale * 9, `${tag} runner y ${runnerY.toFixed(0)} above thumb zone top ${(h * 0.58).toFixed(0)}`);
      // buttons
      const bs = await btns(page);
      const pause = bs.find(b => /pause|⏸|II/i.test(b.t)), copy = bs.find(b => /copy|report/i.test(b.t));
      ok(pause && pause.w >= 55.5 && pause.h >= 55.5, `${tag} Pause >=56x56 (${pause && pause.w}x${pause && pause.h})`);
      ok(copy && copy.w >= 55.5 && copy.h >= 55.5, `${tag} Copy >=56x56 (${copy && copy.w}x${copy && copy.h})`);
      ok(pause && pause.y + pause.h <= h * 0.58 && copy && copy.y + copy.h <= h * 0.58, `${tag} buttons outside thumb zone`);
      // hold & release
      const cx = w / 2, cy = h * 0.8;
      const before = await st(page);
      await page.mouse.move(cx, cy); await page.mouse.down(); await sleep(300);
      const mid = await page.evaluate(() => window.__moon.state().runner.charging);
      await page.mouse.up(); await sleep(250);
      const air = await st(page);
      ok(mid === true, `${tag} charging while held`);
      ok(air.jumps === before.jumps + 1, `${tag} jump counted (${before.jumps}->${air.jumps})`);
      ok(air.mode === 'air' || air.y !== before.y, `${tag} runner jumped (mode ${air.mode})`);
      let maxH = air.height;
      for (let i = 0; i < 10; i++) { await sleep(200); maxH = Math.max(maxH, (await st(page)).height); }
      ok(maxH !== before.height || Math.abs(air.y - before.y) > 5, `${tag} height/position changed (h ${before.height}->${maxH})`);
      const waitRim = async () => { for (let i=0;i<40;i++){ const m = await page.evaluate(() => { const s=window.__moon.state(); return s.over?'over':s.runner.mode; }); if (m==='rim') return true; if (m==='over') return false; await sleep(150);} return false; };
      await waitRim();
      // flick
      const f0 = await page.evaluate(() => window.__moon.state().log.length);
      await page.mouse.move(cx - 30, cy); await page.mouse.down();
      await page.mouse.move(cx + 40, cy, { steps: 4 }); await sleep(30); await page.mouse.up();
      const log = await page.evaluate(() => window.__moon.state().log.map(e => e[1]));
      ok(log.slice(f0).includes(2), `${tag} flick -> reverse event (log ${JSON.stringify(log.slice(f0))})`);
      const o2 = await open(browser, w, h, '', errs); const p2 = o2.page; await sleep(300);
      // drag-cancel
      await p2.mouse.move(cx, cy - 40); await p2.mouse.down(); await sleep(150);
      await p2.mouse.move(cx, cy + 30, { steps: 6 }); await sleep(50);
      await p2.mouse.up(); await sleep(100);
      const log2 = await p2.evaluate(() => window.__moon.state().log.map(e => e[1]));
      ok(log2.includes(3), `${tag} drag-down -> cancel event`);
      await o2.ctx.close();
      await page.screenshot({ path: path.join(SHOTS, `play-${tag}.png`) });
    } catch (e) { ok(false, `${tag} exception: ${e.message}`); }
    ok(errs.length === 0, `${tag} no console/page errors ${errs.join(' | ')}`);
    await ctx.close();
  }

  // 475x638 deeper flows
  {
    const errs = [], { ctx, page } = await open(browser, 475, 638, '', errs);
    try {
      // Copy report
      await page.evaluate(() => navigator.clipboard.writeText('x')).catch(() => {});
      ok(await clickBtn(page, /copy/i), 'copy button clicked'); await sleep(400);
      let clip = ''; try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) {}
      const ta = await page.evaluate(() => { const t = document.querySelector('textarea'); return t && t.offsetParent !== null ? t.value : ''; });
      const txt = clip.includes('"seed"') ? clip : ta;
      let parsed = null; try { parsed = JSON.parse(txt); } catch (e) {}
      ok(!!parsed && /canvas2d/.test(txt) && /NOT seen/.test(txt), `Copy report JSON via ${clip.includes('"seed"') ? 'clipboard' : 'textarea'} (has seed/canvas2d/WebGPU)`);
      await page.keyboard.press('Escape'); await sleep(100);
      if (ta) { await clickBtn(page, /close|ok|done/i); }
      // Pause
      const t0 = (await st(page)).tick;
      ok(await clickBtn(page, /pause|⏸|^II$/i), 'pause clicked'); await sleep(400);
      const t1 = (await st(page)).tick; await sleep(400); const t2 = (await st(page)).tick;
      ok(t2 === t1, `paused ticks frozen (${t1}->${t2})`);
      const pb = (await btns(page)).filter(b => b.y > 0);
      const small = pb.filter(b => b.w < 55.5 || b.h < 55.5);
      ok(pb.length > 0 && small.length === 0, `pause overlay buttons >=56x56 (${pb.length} buttons; small: ${small.map(b => b.t + ' ' + b.w + 'x' + b.h).join(', ')})`);
      await page.screenshot({ path: path.join(SHOTS, 'pause-475x638.png') });
      const resumed = await clickBtn(page, /resume/i); await sleep(400);
      const t3 = (await st(page)).tick; await sleep(300);
      ok(resumed && (await st(page)).tick > t3, 'resume works');
      // idle until game over
      let s; const t = Date.now();
      while (Date.now() - t < 90000) { s = await st(page); if (s.over) break; await sleep(500); }
      ok(s && s.over && s.cause, `game over reached (cause ${s && s.cause}) after ${((Date.now() - t) / 1000).toFixed(0)}s`);
      await sleep(900);
      const gb = await btns(page);
      ok(gb.some(b => /retry/i.test(b.t)) && gb.some(b => /verify/i.test(b.t)), `game over overlay buttons: ${gb.map(b => b.t).join('|')}`);
      ok(gb.filter(b => /retry|new|copy|verify/i.test(b.t)).every(b => b.w >= 55.5 && b.h >= 55.5), 'game over buttons >=56x56');
      await page.screenshot({ path: path.join(SHOTS, 'gameover-475x638.png') });
      await clickBtn(page, /verify/i); await sleep(500);
      const body = await page.evaluate(() => document.body.innerText);
      ok(/\bOK\b/.test(body) && !/FAIL/.test(body), 'Verify replay shows OK');
    } catch (e) { ok(false, 'deep flow exception: ' + e.message); }
    ok(errs.length === 0, 'no errors in deep flow ' + errs.join(' | '));
    // service worker on reload
    try {
      await page.reload({ waitUntil: 'load' }); await sleep(800);
      const sw = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; const r = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 5000))]); return r ? 'ok' : 'none'; });
      ok(sw === 'ok', 'service worker registered (' + sw + ')');
    } catch (e) { ok(false, 'sw: ' + e.message); }
    await ctx.close();
  }

  // seed determinism
  {
    const layouts = [];
    for (let i = 0; i < 2; i++) {
      const errs = [], { ctx, page } = await open(browser, 475, 638, '?seed=ABC', errs);
      layouts.push(await page.evaluate(() => JSON.stringify(window.__moon.state().bodies.slice(0, 8).map(b => [b.id, b.x, b.y, b.r, b.kind, b.spin]))));
      ok(errs.length === 0, `seed run ${i} no errors ${errs.join('|')}`);
      await ctx.close();
    }
    ok(layouts[0] === layouts[1] && layouts[0].length > 10, '?seed=ABC same first body layout twice');
  }
  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${fails.length} failed`); fails.forEach(f => console.log(' - ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
