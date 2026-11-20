// node hero-visible.js : hero must be DRAWN, at the fresh-load size, 1 s after every room start (after a real win + wipe),
// after a shaft complete -> new run, and after respawn. 475x638 Fold cover. Hooks PL.Assets.drawHero to read what was really drawn.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 475, H = 638;
async function open(browser, port) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => fails.push('pageerror ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=7`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen && window.PL && window.PL.Assets, null, { timeout: 8000 });
  await page.evaluate(() => {
    window.__hero = { n: 0, px: 0 };
    const o = PL.Assets.drawHero;
    PL.Assets.drawHero = function (ctx, pose, x, y, h, opt) {
      const m = ctx.getTransform(), det = Math.abs(m.a * m.d - m.b * m.c);
      window.__hero.n++; window.__hero.px = h * Math.sqrt(det);
      return o.apply(this, arguments);
    };
  });
  await page.evaluate(() => PL_TEST.setSeed(1));
  return { page, context };
}
// hero drawn size (device px) over the next ~300 ms; 0 = not drawn
async function heroPx(page) {
  await page.evaluate(() => { window.__hero.n = 0; window.__hero.px = 0; });
  await sleep(300);
  return page.evaluate(() => (window.__hero.n ? window.__hero.px : 0));
}
async function startRun(page) {
  await page.evaluate(() => { PL_TEST.startMode('short', 7); });
  await sleep(1200);
}
async function clearRoomAndAdvance(page) {
  const w = await page.evaluate(() => PL_TEST.winRoom());
  await sleep(400);
  await page.evaluate(() => PL_TEST.advanceWipe());
  await sleep(1300);
  return w;
}
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  // baselines: fresh load, each room, no win
  const base = [];
  const fresh = await open(browser, port);
  await startRun(fresh.page);
  const nRooms = await fresh.page.evaluate(() => PL_TEST.getRunStats().rooms);
  for (let i = 1; i <= nRooms; i++) { await fresh.page.evaluate((i) => PL_TEST.room(i), i); await sleep(1000); base.push(await heroPx(fresh.page)); }
  console.log('fresh hero px per room (device px):', base.map((v) => v.toFixed(1)).join(', '));
  base.forEach((v, i) => ok(v > 5, `fresh room ${i + 1} hero drawn (${v.toFixed(1)}px)`));
  await fresh.context.close();
  // real run: win each room, wipe to next, check 1 s after start
  const run = await open(browser, port);
  await startRun(run.page);
  ok(Math.abs(await heroPx(run.page) - base[0]) <= 2, 'run room 1 hero size == fresh');
  for (let i = 1; i < nRooms; i++) {
    const w = await clearRoomAndAdvance(run.page);
    const idx = await run.page.evaluate(() => PL_TEST.getRunStats().roomsCleared);
    await sleep(0);
    const px = await heroPx(run.page);
    console.log(`after clear ${i}: cleared=${idx} win=${w} hero px ${px.toFixed(1)} (fresh ${base[i].toFixed(1)})`);
    ok(w, `room ${i} cleared by a real win`);
    ok(px > 5, `room ${i + 1} hero drawn 1 s after start`);
    ok(Math.abs(px - base[i]) <= 2, `room ${i + 1} hero size ${px.toFixed(1)} == fresh ${base[i].toFixed(1)} (+-2)`);
    // respawn: kill, wait for respawn, hero back at full size
    await run.page.evaluate(() => PL_TEST.kill('spike'));
    await sleep(2200);
    const pr = await heroPx(run.page);
    ok(pr > 5 && Math.abs(pr - base[i]) <= 2, `room ${i + 1} hero drawn at full size 1 s after respawn (${pr.toFixed(1)})`);
  }
  // last room -> shaft complete -> new run
  await clearRoomAndAdvance(run.page);
  console.log('screen after final clear:', await run.page.evaluate(() => PL_TEST.screen()));
  await startRun(run.page);
  const p0 = await heroPx(run.page);
  ok(p0 > 5 && Math.abs(p0 - base[0]) <= 2, `new run after shaft complete: hero drawn at fresh size (${p0.toFixed(1)} vs ${base[0].toFixed(1)})`);
  await browser.close(); srv.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
