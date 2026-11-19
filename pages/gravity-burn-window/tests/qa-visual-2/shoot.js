const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  async function mk(seed) {
    const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto('file://' + ROOT + '/index.html?seed=' + (seed||1));
    await page.waitForFunction(() => window.__bw && __bw.phase === 'intro', null, { timeout: 15000 });
    return { ctx, page };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(__dirname, n + '.png') });
  let { ctx, page } = await mk();
  await shot(page, '1-intro');
  await page.evaluate(() => { __bw.launch(); __bw.hold(true, 1); }); await sleep(500);
  await shot(page, '2-running');
  await page.evaluate(() => __bw.hold(false)); await ctx.close();
  // docked
  ({ ctx, page } = await mk());
  await page.evaluate(() => new Promise(resolve => {
    const sec = __bw.sector, ev = BW.sim.schedToEvents(sec.par.sched); __bw.launch(); let i = 0;
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { const s = __bw.state; if (__bw.phase !== 'run') { __bw.hold(false); return resolve(); }
      while (i < ev.length && ev[i][0] <= s.n) { __bw.hold(!!ev[i][1], ev[i][2] / 100); i++; } ch.port2.postMessage(0); };
    ch.port2.postMessage(0); }));
  await sleep(400); await shot(page, '3-docked'); await ctx.close();
  // failed: crash / lost
  for (const [name, th] of [['4-failed-hold', 1]]) {
    ({ ctx, page } = await mk());
    await page.evaluate(() => { __bw.launch(); __bw.hold(true, 1); });
    await page.waitForFunction(() => __bw.phase !== 'run', null, { timeout: 60000 }); await sleep(300);
    console.log(name, await page.evaluate(() => __bw.state.status)); await shot(page, name); await ctx.close();
  }
  // coast: no burn
  ({ ctx, page } = await mk());
  await page.evaluate(() => { __bw.launch(); });
  await page.waitForFunction(() => __bw.phase !== 'run', null, { timeout: 90000 }); await sleep(300);
  console.log('coast', await page.evaluate(() => __bw.state.status)); await shot(page, '5-failed-coast'); await ctx.close();
  ({ ctx, page } = await mk());
  await page.evaluate(() => __bw.finish()); await sleep(1200); await shot(page, '6-end');
  console.log(await page.evaluate(() => __bw.phase));
  await page.evaluate(() => __bw.skipTo(3)); await sleep(500); console.log('skip', await page.evaluate(() => __bw.phase + __bw.sector.index));
  await browser.close();
})();
