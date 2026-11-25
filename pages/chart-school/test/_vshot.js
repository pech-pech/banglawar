// temp visual helper (scratch) - deleted after use
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve');
const OUT = process.argv[2];
const SHEETS = +(process.argv[3] || 1);
(async () => {
  const srv = await start(0);
  const base = 'http://127.0.0.1:' + srv.port + '/chart-school/';
  const browser = await chromium.launch();
  for (const sz of [{ w: 344, h: 882 }, { w: 475, h: 638 }]) {
    const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + 'index.html');
    await page.waitForFunction(() => document.body.dataset.screen === 'desk');
    for (let k = 0; k < SHEETS; k++) {
      await page.click('[data-act="open-sheet"]');
      if (process.argv[4]) await page.evaluate((ix) => { S.cur.sheetIdx = ix; S.cur.code = SHEETS[ix].code || S.cur.code; render(); }, +process.argv[4]);
      for (let i = 0; i < 3; i++) { await page.click('[data-act="skip"]'); }
      if (k < SHEETS - 1) { await page.click('[data-opt="Buy"]'); await page.click('[data-act="confirm-call"]');
        while (!(await page.locator('[data-act="finish"]').count())) await page.click('[data-act="advance"]');
        await page.click('[data-act="finish"]'); if (await page.evaluate(()=>S.screen)==='summary') await page.click('[data-act="open-sheet"]').catch(()=>{}); 
        if (await page.evaluate(()=>S.screen)==='reading') { for (let i = 0; i < 3; i++) await page.click('[data-act="skip"]'); k++; if (k>=SHEETS-1) break; }
      }
    }
    await page.waitForTimeout(100);
    const tag = sz.w + 'x' + sz.h;
    const info = await page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
      return { scr: S.screen, bar: r('#bar'), seg: r('.seg'), sl: r('.sl'), pf: [...document.querySelectorAll('svg[data-cell]')].map(s => s.dataset.cell + 'x' + s.dataset.rows + ' h' + s.getAttribute('height')), sh: document.documentElement.scrollHeight };
    });
    console.log(tag, JSON.stringify(info), errs.join('|'));
    await page.screenshot({ path: path.join(OUT, tag + '-call' + (process.argv[4]||'') + '.png') });
    await ctx.close();
  }
  await browser.close(); await srv.close();
})();
