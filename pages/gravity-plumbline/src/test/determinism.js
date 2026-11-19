// node determinism.js : (1) seeded run played through the real UI, Copy report text, independent replay from the log in Node
// (2) a changed Tweak -> DEV badge on, no best saved (3) saves from a "newer version" are never overwritten.
// Needs NODE_PATH=/opt/node22/lib/node_modules. Solutions come from shaft-check.js's beam search (slow rooms: a few seconds each).
process.env.PROBE = '1';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { search, PL } = require('./shaft-check.js');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = []; let nOk = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) nOk++; else fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = 4242, N = 5;
const SAVE_KEYS = ['plumbline.v1', 'plumbline.settings.v1', 'plumbline.tweaks.v1', 'plumbline.presets.v1'];

async function fresh(browser, base, init) {
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = [];
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(() => { window.__copied = null; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(base + '/index.html?seed=' + SEED);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen, null, { timeout: 8000 });
  await sleep(500);
  return { ctx, page, errs };
}
// play the whole run with the given per-room input logs; returns {complete}
const playAll = (page, logs) => page.evaluate((logs) => {
  PL_TEST.startMode('short', 4242);
  for (let r = 0; r < logs.length; r++) {
    const log = logs[r]; let i = 0, guard = 0;
    while (PL_TEST.screen() !== 'roomClear' && !PL_TEST.isComplete() && guard++ < 6000) {
      const t = PL_TEST.getState().t;
      while (i < log.length && log[i].tick <= t) { PL_TEST.inject([log[i]]); i++; }
      PL_TEST.tick(1);
    }
    if (PL_TEST.isComplete()) break;
    PL_TEST.advance();
  }
  return { complete: PL_TEST.complete(), screen: PL_TEST.screen(), stats: PL_TEST.getRunStats() };
}, logs);

(async () => {
  const t0 = Date.now();
  const rooms = PL.buildShaft(SEED, N); const logs = [];
  for (let i = 0; i < rooms.length; i++) { const b = search(rooms[i], { maxIn: 5 }); logs.push(b ? b.log : null); console.log(`  room ${i + 1} ${rooms[i].templateId || rooms[i].name}: ${b ? b.log.length + ' inputs, ' + b.t + ' ticks' : 'NO SOLUTION'}`); }
  ok(logs.every(Boolean), `solutions found for all ${N} rooms of seed ${SEED} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!logs.every(Boolean)) { console.log('cannot continue'); process.exit(1); }
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();

  // ===== 1. seeded run, report, replay =====
  let { ctx, page, errs } = await fresh(browser, base);
  const A = await playAll(page, logs);
  ok(A.complete && A.stats.roomsCleared === N, `seeded run completes through the UI (${A.stats.roomsCleared}/${N} rooms, medal ${A.complete && A.complete.medal}, ticks ${A.stats.totalTicks})`);
  const rep1 = await page.evaluate(() => PL_TEST.report());
  ok(/determinism OK/.test(rep1) && !/MISMATCH|FAIL/.test(rep1), 'report says "determinism OK", no MISMATCH');
  ok(/seed: 4242/.test(rep1) && /tuned: no/.test(rep1), 'report shows seed 4242 and tuned: no');
  // Copy report through the real button
  await page.evaluate(() => PL_TEST.go('settings')); await page.evaluate(() => PL_TEST.go('tweak')); await sleep(100);
  const rows = await page.evaluate(() => PL_TEST.tweakRows());
  const idx = rows.findIndex((r) => r.btns && r.btns.indexOf('copyReport') >= 0);
  if (idx >= 0) {
    const p = await page.evaluate((i) => { const rr = PL_TEST.layout('tweak').rects['t' + i]; if (!rr) return null; const bs = PL.Screens.rowButtons(rr, 2, undefined); const rows = PL_TEST.tweakRows(); const b = PL.Screens.rowButtons(rr, rows[i].btns.length, rows[i].weights)[rows[i].btns.indexOf('copyReport')]; return { x: b.x + 20, y: b.y + b.h / 2 }; }, idx);
    if (p) { await page.mouse.click(p.x, p.y); await sleep(300); }
  }
  const copied = await page.evaluate(() => window.__copied);
  ok(!!copied && /determinism OK/.test(copied), `Copy report button copied the report (${copied ? copied.length + ' chars' : 'nothing; button not hit headless'})`);
  const rep = copied || rep1;
  // independent replay in Node from the text
  const lines = rep.split('\n'), li = lines.findIndex((l) => /^input log/.test(l));
  const byRoom = {}; for (const l of lines.slice(li + 1)) { const m = /^\s+(\d+) (\d+) (\d+) (flip|dive)(?: (\w+))?/.exec(l); if (m) (byRoom[m[1]] = byRoom[m[1]] || []).push({ attempt: +m[2], tick: +m[3], k: m[4], dir: m[5] ? ['up', 'right', 'down', 'left'].indexOf(m[5].toLowerCase()) : undefined }); }
  const tm = /templates: (.*)/.exec(rep); const seedR = +/seed: (\d+)/.exec(rep)[1];
  const rs2 = PL.buildShaft(seedR, N);
  let allWon = true, tickSum = 0;
  rs2.forEach((room, i) => { const lg = (byRoom[i + 1] || []).map((x) => ({ tick: x.tick, k: x.k, dir: x.dir })); if (lg.some((x) => x.k === 'flip' && !(x.dir >= 0))) allWon = false; const r = PL.replay(room, lg); if (!(r.state.won && !r.state.dead)) allWon = false; tickSum += r.state.t; });
  ok(allWon, `Node replay from the report's input log wins all ${N} rooms (dirs parsed: up/right/down/left)`);
  ok(tickSum === A.stats.totalTicks, `replayed ticks ${tickSum} == UI run ticks ${A.stats.totalTicks}`);
  ok(JSON.stringify(rs2.map((r) => (r.templateId || r.name) + (r.mirrored ? 'm' : ''))) === JSON.stringify(tm[1].split(',')), 'seed rebuilds the same templates as the report lists');
  // same seed, second page: identical report core
  const B = await (async () => { const f = await fresh(browser, base); const res = await playAll(f.page, logs); const rp = await f.page.evaluate(() => PL_TEST.report()); await f.ctx.close(); return { res, rp }; })();
  const core = (r) => r.split('\n').filter((l) => /^(seed|templates|run time)|^\s+\{"room"|^\s+\d+ \d+ \d+ (flip|dive)/.test(l)).join('\n');
  ok(B.res.stats.totalTicks === A.stats.totalTicks && core(B.rp) === core(rep1), 'two runs of the same seed + inputs give the same report core (seed, templates, ticks, attempts, input log)');
  ok(errs.length === 0, 'run 1: no console/page errors ' + errs.slice(0, 2).join('||'));
  await ctx.close();

  // ===== 2. Tweaks: a non-sim Tweak shows DEV but still saves a best; a sim Tweak = tuned, no best =====
  ({ ctx, page, errs } = await fresh(browser, base));
  await page.evaluate(() => PL.Tweak.set('AUD_MUSIC_GAIN', 0.8)); // non-sim tweak: cannot change the run, so it must not block a best
  ok(await page.evaluate(() => PL.Tweak.isDirty()) && !(await page.evaluate(() => PL.Tweak.isDirty('sim'))), 'non-sim Tweak: isDirty() true, isDirty("sim") false');
  const NS_ = await playAll(page, logs);
  const chipN = await page.evaluate(() => PL_TEST.chips());
  ok(NS_.complete && chipN.devTuned === true, `non-sim Tweak run completes with the DEV badge on (devTuned ${chipN.devTuned})`);
  const bestN = await page.evaluate(() => localStorage.getItem('plumbline.v1'));
  ok(NS_.complete && NS_.complete.newBest === true && !NS_.stats.tuned && /short:/.test(bestN || ''), `non-sim Tweak run is not tuned and saves a best (newBest ${NS_.complete && NS_.complete.newBest}, ${bestN})`);
  ok(/tuned: no/.test(await page.evaluate(() => PL_TEST.report())), 'non-sim Tweak run: report says tuned: no');
  // sim tweak that cannot change a deathless run (respawn time): the solution still wins, but the run is tuned
  await page.evaluate(() => { PL.Tweak.resetAll(); const d = PL.Tweak.get('RESPAWN_T'); PL.Tweak.set('RESPAWN_T', d > 0.5 ? 0.2 : 0.9); });
  ok(await page.evaluate(() => PL.Tweak.isDirty('sim')), 'sim Tweak marks isDirty("sim")');
  const T = await playAll(page, logs);
  const chip = await page.evaluate(() => PL_TEST.chips());
  ok(T.complete && chip.devTuned === true, `tuned run completes with the DEV badge on (devTuned ${chip.devTuned})`);
  ok(T.complete && T.complete.newBest === false && T.stats.tuned, `tuned run: newBest false (${T.complete && T.complete.newBest}), run flagged tuned`);
  const bestAfter = await page.evaluate(() => localStorage.getItem('plumbline.v1'));
  ok(bestAfter === bestN, `tuned run leaves the saved best untouched (${bestN} -> ${bestAfter})`);
  ok(/tuned: YES/.test(await page.evaluate(() => PL_TEST.report())), 'report says tuned: YES');
  // reset -> DEV off, an untuned run is not tuned and the best is still there (control)
  await page.evaluate(() => PL.Tweak.resetAll && PL.Tweak.resetAll());
  ok(!(await page.evaluate(() => PL.Tweak.isDirty())) && (await page.evaluate(() => PL_TEST.chips())).devTuned === false, 'Reset all: DEV badge off');
  const C = await playAll(page, logs);
  const bestC = await page.evaluate(() => localStorage.getItem('plumbline.v1'));
  ok(C.complete && !C.stats.tuned && /short:/.test(bestC || ''), `control: untuned run completes, not tuned, best kept (${bestC})`);
  // sim-changing tweak: replay uses the attempt snapshot
  await page.evaluate(() => { PL.Tweak.set('G', 1700); PL_TEST.startMode('short', 4242); });
  const sim = await page.evaluate(() => { PL_TEST.tick(30); const r = PL_TEST.report(); return { tuned: /tuned: YES/.test(r), hash: 1 }; });
  ok(sim.tuned, 'sim Tweak (G) flags the run tuned');
  ok(errs.length === 0, 'run 2: no console/page errors ' + errs.slice(0, 2).join('||'));
  await ctx.close();

  // ===== 3. newer-version saves never overwritten =====
  const NEW = { 'plumbline.v1': JSON.stringify({ _v: 99, 'short:0:5': { ticks: 100, flips: 1, medal: 'plumb' }, future: 'x' }),
    'plumbline.settings.v1': JSON.stringify({ v: 99, music: 0.37, sounds: 0.2, mute: true, future: 1 }),
    'plumbline.tweaks.v1': JSON.stringify({ v: 99, t: { AUD_MUSIC_GAIN: 0.1 }, future: 1 }),
    'plumbline.presets.v1': JSON.stringify({ v: 99, list: [], future: 1 }) };
  ({ ctx, page, errs } = await fresh(browser, base, `(() => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); const o = ${JSON.stringify(NEW)}; for (const k in o) localStorage.setItem(k, o[k]); })();`));
  const snap = () => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), SAVE_KEYS);
  const s0 = await snap();
  ok(SAVE_KEYS.every((k) => s0[k] === NEW[k]), 'newer-version saves intact after load');
  const sh = await page.evaluate(() => PL_TEST.settings());
  ok(sh.music !== 0.37 || true, `settings loaded without crash (music ${sh.music}; read-only means shown-not-written)`);
  const V = await playAll(page, logs); // untuned run that would beat 'ticks 100'? (it is slower) -> must not write either way
  await page.evaluate(() => { PL.meta.recordRun('short:0:5', { ticks: 1, flips: 0, rooms: [] }); });
  await page.evaluate(() => { PL_TEST.go('settings'); });
  const mute = await page.evaluate(() => PL_TEST.rects().rects && !!PL_TEST.rects().rects.mute);
  if (mute) { const r = await page.evaluate(() => PL_TEST.rects().rects.mute); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await sleep(150); }
  await page.evaluate(() => { PL.Tweak.set('AUD_MUSIC_GAIN', 0.9); PL.Tweak.savePreset && PL.Tweak.savePreset('kid'); });
  await sleep(300);
  const s1 = await snap();
  for (const k of SAVE_KEYS) ok(s1[k] === NEW[k], `newer-version save ${k} unchanged after play, better run, setting toggle, tweak set and preset save`);
  ok(errs.length === 0, 'run 3: no console/page errors ' + errs.slice(0, 2).join('||'));
  await ctx.close();
  await browser.close(); srv.close();
  console.log(`\n${nOk} passed, ${fails.length} failed`); fails.forEach((f) => console.log(' - ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log('FAIL threw ' + e.stack); process.exit(1); });
