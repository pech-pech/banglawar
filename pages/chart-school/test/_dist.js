const { chromium } = require('playwright');
const { start } = require('./serve');
(async () => {
  const srv = await start(0);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 344, height: 882 }, serviceWorkers: 'block' })).newPage();
  await page.goto('http://127.0.0.1:' + srv.port + '/chart-school/index.html');
  await page.waitForFunction(() => document.body.dataset.screen === 'desk');
  const r = await page.evaluate((args) => {
    const host = document.createElement('div'); host.style.width = args.w + 'px'; document.body.appendChild(host);
    const tb = a => a.map(b => Array.isArray(b) ? { h: b[0], l: b[1], c: b[2] } : b);
    const out = { stock: [], sec: [] };
    SHEETS.forEach(sh => {
      const bars = tb(sh.bars), eng = CSE.pnf(bars);
      const s = drawPnf(host, { eng, cols: 24, cell: 15, minCell: 8, maxPlotH: args.ph, overlays: [{ k: 'close', box: CSE.boxOf(bars[bars.length - 1].c) }] });
      out.stock.push([+s.dataset.cell, +s.dataset.rows, s.querySelectorAll('g > path, g > circle').length]);
      if (sh.sec) { const sb = tb(sh.sec.bars), se = CSE.pnf(sb); const s2 = drawPnf(host, { eng: se, cols: 24, compact: true, title: 'x', cell: 11, minCell: 6, maxPlotH: args.sp }); out.sec.push([+s2.dataset.cell, +s2.dataset.rows]); }
    });
    return out;
  }, { w: 326, ph: +process.argv[2] || 230, sp: +process.argv[3] || 110 });
  function q(a, i) { const v = a.map(x => x[i]).sort((x, y) => x - y); return [v[0], v[Math.floor(v.length * .1)], v[Math.floor(v.length * .5)], v[Math.floor(v.length * .9)], v[v.length - 1]].join(' '); }
  console.log('stock cell min/p10/med/p90/max', q(r.stock, 0), ' rows', q(r.stock, 1));
  console.log('sector cell', q(r.sec, 0), ' rows', q(r.sec, 1));
  await browser.close(); await srv.close();
})();
