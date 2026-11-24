// Playwright e2e for Moonstep. Run: node tests/e2e.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/version.json' && !fs.existsSync(path.join(ROOT, 'version.json'))) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); } // unstamped dev build
  const SH = path.resolve(ROOT, '..', '_shared');
  const f = p.startsWith('/_shared/') ? path.join(SH, p.slice(9)) : path.join(ROOT, p);
  if (!(f.startsWith(ROOT) || f.startsWith(SH)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
const fails = []; let passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('PASS', m); } else { fails.push(m); console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w, h, query, errs, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  if (!o.fresh) await ctx.addInitScript(() => { try { if (!localStorage.getItem('moonstep.v1')) localStorage.setItem('moonstep.v1', JSON.stringify({ flags: { howto: true } })); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  await page.goto(base + (query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__moon && window.__moon.state(), null, { timeout: 5000 });
  if (!o.title) { await clickBtn(page, /^climb$/i); await page.waitForFunction(() => !window.__moon.screen(), null, { timeout: 5000 }); }
  return { ctx, page };
}
const st = page => page.evaluate(() => { const s = window.__moon.state(); return { tick: s.tick, over: s.over, cause: s.cause, height: s.height, jumps: s.jumps, mode: s.runner.mode, x: s.runner.x, y: s.runner.y, tideY: s.tideY }; });
const btns = page => page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { t: (b.textContent || b.getAttribute('aria-label') || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }; }).filter(b => b.vis));
const findBtn = async (page, re) => (await btns(page)).find(b => re.test(b.t));
const clickBtn = async (page, re) => { const b = await findBtn(page, re); if (!b) return false; await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2); return true; };

const fits = async (page, w, h) => (await btns(page)).filter(b => b.x < -0.5 || b.y < -0.5 || b.x + b.w > w + 0.5 || b.y + b.h > h + 0.5);
const scr = page => page.evaluate(() => window.__moon.screen());
const stepOver = page => page.evaluate(() => { for (let i = 0; i < 4000 && !window.__moon.state().over; i++) window.__moon.step(60); return window.__moon.state().over; });
const bodyText = page => page.evaluate(() => document.body.innerText);
const hasText = async (page, re) => re.test(await bodyText(page));
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
      if (ta) { await clickBtn(page, /close|ok|done/i); }
      await page.keyboard.press('Escape'); await sleep(150);
      ok(await scr(page) === 'pause', 'Escape pauses'); await page.keyboard.press('Escape'); await sleep(150);
      ok(await scr(page) === null, 'Escape resumes from pause');
      // Pause
      const t0 = (await st(page)).tick;
      ok(await clickBtn(page, /pause|⏸|^II$/i), 'pause clicked'); await sleep(400);
      const t1 = (await st(page)).tick; await sleep(400); const t2 = (await st(page)).tick;
      ok(t2 === t1, `paused ticks frozen (${t1}->${t2})`);
      const pb = (await btns(page)).filter(b => b.y > 0);
      const small = pb.filter(b => b.w < 55.5 || b.h < 55.5);
      ok(pb.length > 0 && small.length === 0, `pause overlay buttons >=56x56 (${pb.length} buttons; small: ${small.map(b => b.t + ' ' + b.w + 'x' + b.h).join(', ')})`);
      await page.screenshot({ path: path.join(SHOTS, 'pause-475x638.png') });
      // settings from pause: toggles, reduce motion, reset confirm (before any score exists)
      await clickBtn(page, /pause/i); await sleep(200);
      ok(await scr(page) === 'pause', 'pause screen open');
      ok(await clickBtn(page, /^settings$/i), 'pause -> settings'); await sleep(200);
      ok(await scr(page) === 'settings', 'settings screen open');
      const sw0 = await page.evaluate(() => [...document.querySelectorAll('[role=switch]')].map(e => e.offsetParent && e.getAttribute('aria-checked')).filter(Boolean));
      await page.evaluate(() => { const r = [...document.querySelectorAll('[role=switch]')].filter(e => e.offsetParent); r.forEach(e => e.click()); });
      const stg = await page.evaluate(() => JSON.parse(localStorage.getItem('moonstep.v1')).set);
      ok(stg.sound === false && stg.assist === false && stg.reduce === true, `settings toggles persist ${JSON.stringify(stg)} (was ${sw0})`);
      ok(await page.evaluate(() => document.documentElement.classList.contains('u-rm')), 'reduce motion class applied');
      await page.evaluate(() => [...document.querySelectorAll('[role=switch]')].filter(e => e.offsetParent).forEach(e => e.click()));
      await page.evaluate(() => [...document.querySelectorAll('.u-seg button')].filter(e => e.offsetParent)[2].click());
      ok((await page.evaluate(() => JSON.parse(localStorage.getItem('moonstep.v1')).set.tide)) === 1.25, 'tide 1.25 saved');
      await page.evaluate(() => [...document.querySelectorAll('.u-seg button')].filter(e => e.offsetParent)[1].click());
      ok(await clickBtn(page, /reset best/i), 'reset clicked'); await sleep(200);
      ok(await hasText(page, /Wipe the ink/), 'reset confirm shown');
      ok((await fits(page, 475, 638)).length === 0, 'settings+confirm buttons fit viewport');
      await page.screenshot({ path: path.join(SHOTS, 'settings-reset-475x638.png') });
      await clickBtn(page, /keep my scores/i); await sleep(200);
      ok(!(await hasText(page, /Wipe the ink/)), 'keep closes confirm');
      await clickBtn(page, /^done$/i); await sleep(200);
      ok(await scr(page) === 'pause', 'settings back to pause');
      const resumed = await clickBtn(page, /resume/i); await sleep(400);
      const t3 = (await st(page)).tick; await sleep(300);
      ok(resumed && (await st(page)).tick > t3, 'resume works');
      // game over -> results
      const over = await stepOver(page); await sleep(900);
      ok(over, 'game over reached by stepping');
      ok(await scr(page) === 'results', 'results screen after over');
      const info = await page.evaluate(() => { const s = window.__moon.state(); return { h: Math.floor(s.height), cause: s.cause, seed: s.seed || null, medal: Moonstep.medal(Math.floor(s.height)) }; });
      const rb = await btns(page);
      ok(rb.some(b => /retry same seed/i.test(b.t)) && rb.some(b => /new seed/i.test(b.t)) && rb.some(b => /copy report/i.test(b.t)) && rb.some(b => /all results/i.test(b.t)), 'results buttons: ' + rb.map(b => b.t).join('|'));
      ok(rb.every(b => b.w >= 55.5 && b.h >= 55.5), 'results buttons >=56x56');
      ok((await fits(page, 475, 638)).length === 0, 'results buttons fit 475x638');
      const rt = await bodyText(page);
      ok(rt.includes(info.h.toLocaleString('en-US')) && (info.medal ? rt.includes(info.medal) : /No medal/.test(rt)), `results show height ${info.h} and medal "${info.medal}" (from engine)`);
      ok(/NEW BEST/i.test(rt), 'results first run shows new best');
      ok(/Replay:\s*OK/.test(rt), 'results replay OK');
      ok(info.cause === 'tide' ? /Swallowed by the tide/.test(rt) : /Lost in space/.test(rt), 'results cause line');
      await page.screenshot({ path: path.join(SHOTS, 'results-475x638.png') });
      // records: best by seed + attempts + medals (thresholds from engine)
      await clickBtn(page, /all results/i); await sleep(200);
      ok(await scr(page) === 'records', 'records screen');
      ok(await page.evaluate(() => document.querySelectorAll('button.u-li').length) === 1, 'best-by-seed has 1 row');
      ok((await fits(page, 475, 638)).length === 0, 'records buttons fit');
      await page.screenshot({ path: path.join(SHOTS, 'records-475x638.png') });
      await page.evaluate(() => [...document.querySelectorAll('[role=tab]')][1].click()); await sleep(150);
      ok(await page.evaluate(() => document.querySelectorAll('div.u-li').length) === 1, 'attempts list has 1 row');
      await clickBtn(page, /^medals$/i); await sleep(200);
      ok(await scr(page) === 'medals', 'medal sheet');
      const bandsRt = await page.evaluate(() => { const o = []; let p = ''; for (let h = 0; h < 20000; h++) { const m = Moonstep.medal(h); if (m !== p) { if (m) o.push([m, h]); p = m; } } return o; });
      const mt = await bodyText(page);
      ok(bandsRt.length >= 3 && bandsRt.every(([n, v]) => mt.includes(n) && mt.includes(v.toLocaleString('en-US'))), `medal sheet shows engine thresholds ${JSON.stringify(bandsRt)}`);
      await page.screenshot({ path: path.join(SHOTS, 'medals-475x638.png') });
      await clickBtn(page, /^back/i); await sleep(150);
      ok(await scr(page) === 'records', 'medals back to records');
      await clickBtn(page, /^back$/i); await sleep(150);
      ok(await scr(page) === 'results', 'records back to results');
      // verify chip re-verify + copy
      await clickBtn(page, /copy report/i); await sleep(500);
      ok(await scr(page) !== null, 'results still open after copy');
      // retry same seed
      const seedBefore = await page.evaluate(() => new URL(location.href).searchParams.get('seed'));
      await sleep(100); await clickBtn(page, /retry same seed/i); await sleep(300);
      ok(await scr(page) === null && !(await st(page)).over, 'retry same seed returns to play');
      ok((await page.evaluate(() => new URL(location.href).searchParams.get('seed'))) === seedBefore, 'retry keeps seed');
      // quit to menu, title shows best + records
      await clickBtn(page, /pause/i); await sleep(200); await clickBtn(page, /quit to menu/i); await sleep(250);
      ok(await scr(page) === 'title', 'quit to menu -> title');
      ok(await hasText(page, /best\s*[\d,]+\s*m|no climb yet/i), 'title shows best chip');
      await page.evaluate(() => { for (let i = 0; i < 10; i++) window.__moon.step(1); });
      const tt = (await st(page)).tick; await sleep(300);
      ok((await st(page)).tick === tt, 'sim frozen on title');
      ok(await clickBtn(page, /^records/i), 'title -> records'); await sleep(200);
      ok(await page.evaluate(() => document.querySelectorAll('button.u-li').length) === 1, 'records from title lists the seed');
      await page.evaluate(() => document.querySelector('button.u-li').click()); await sleep(300);
      ok(await scr(page) === null, 'tap best-by-seed row starts that seed');
      // reset erases scores but keeps settings
      await clickBtn(page, /pause/i); await sleep(150); await clickBtn(page, /^settings$/i); await sleep(150);
      await clickBtn(page, /reset best/i); await sleep(150); await clickBtn(page, /erase everything/i); await sleep(200);
      const after = await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('moonstep.v1')); return { best: Object.keys(o.best).length, att: o.attempts.length, set: o.set }; });
      ok(after.best === 0 && after.att === 0 && after.set.tide === 1, 'reset erases best+attempts, keeps settings ' + JSON.stringify(after));
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

  // title + first-run how-to, both viewports
  for (const [w, h] of [[344, 882], [475, 638]]) {
    const tag = `${w}x${h}`, errs = [];
    const { ctx, page } = await open(browser, w, h, '?seed=MOON1', errs, { fresh: true, title: true });
    try {
      ok(await scr(page) === 'title', `${tag} title screen on first load`);
      const t0 = (await st(page)).tick; await sleep(300);
      ok((await st(page)).tick === t0, `${tag} sim frozen behind title`);
      const tb = await btns(page);
      ok(['Climb', 'Daily seed', 'Records', 'How to play', 'Settings', 'New random seed'].every(n => tb.some(b => b.t.toLowerCase().includes(n.toLowerCase()))), `${tag} title buttons: ${tb.map(b => b.t).join('|')}`);
      ok(tb.every(b => b.w >= 55.5 && b.h >= 55.5), `${tag} title targets >=56 (${tb.filter(b => b.w < 55.5 || b.h < 55.5).map(b => b.t + b.w + 'x' + b.h)})`);
      ok((await fits(page, w, h)).length === 0, `${tag} title buttons fit viewport`);
      ok(await page.evaluate(() => document.getElementById('u-seed').value) === 'MOON1', `${tag} seed field prefilled from ?seed=`);
      await page.screenshot({ path: path.join(SHOTS, `title-${tag}.png`) });
      // first run: Climb -> how-to -> Got it -> play
      await clickBtn(page, /^climb$/i); await sleep(200);
      ok(await scr(page) === 'howto', `${tag} first Climb shows how-to`);
      ok((await fits(page, w, h)).length === 0, `${tag} how-to buttons fit viewport`);
      await page.screenshot({ path: path.join(SHOTS, `howto-${tag}.png`) });
      await clickBtn(page, /^got it$/i); await sleep(300);
      ok(await scr(page) === null, `${tag} Got it starts play`);
      ok((await page.evaluate(() => JSON.parse(localStorage.getItem('moonstep.v1')).flags.howto)) === true, `${tag} how-to skip flag saved`);
      const t1 = (await st(page)).tick; await sleep(300);
      ok((await st(page)).tick > t1, `${tag} sim runs after Climb`);
      // HUD: runtime medal band in the next line, pause fits
      const hud = await bodyText(page);
      const b1 = await page.evaluate(() => Moonstep.medal(0) === '' ? (() => { for (let h = 1; h < 20000; h++) if (Moonstep.medal(h)) return [Moonstep.medal(h), h]; })() : null);
      ok(b1 && hud.includes(b1[0]) && hud.includes(String(b1[1])), `${tag} HUD next-medal from engine: ${b1}`);
      ok(/Tide (rising|close)/.test(hud) && /chain/.test(hud) && /MOON1/.test(hud), `${tag} HUD tide chip, chain, seed code`);
      await page.screenshot({ path: path.join(SHOTS, `hud-${tag}.png`) });
      await clickBtn(page, /pause/i); await sleep(200);
      ok((await fits(page, w, h)).length === 0, `${tag} pause buttons fit viewport`);
      await page.screenshot({ path: path.join(SHOTS, `pause-${tag}.png`) });
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__moon && window.__moon.state());
      ok(await scr(page) === 'title', `${tag} reload returns to title`);
      await clickBtn(page, /^climb$/i); await sleep(250);
      ok(await scr(page) === null, `${tag} Climb skips how-to after first run`);
      await stepOver(page); await sleep(900);
      ok(await scr(page) === 'results' && (await fits(page, w, h)).length === 0, `${tag} results fit viewport`);
      await page.screenshot({ path: path.join(SHOTS, `results-${tag}.png`) });
    } catch (e) { ok(false, `${tag} title flow exception: ${e.message}`); }
    ok(errs.length === 0, `${tag} no errors in title flow ${errs.join(' | ')}`);
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
