// QA screenshot capture for Moonstep. Run: node tests/qa-shots.js
// Output: docs/gravity-moonstep/qa/<name>-<w>x<h>.png. Missing screens/hooks are skipped with a log line.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '..', '..', 'docs', 'gravity-moonstep', 'qa');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [[344, 882], [475, 638]];
const TIERS = [['none', 60], ['bronze', 160], ['silver', 450], ['gold', 900], ['moon', 1600]];
let base, count = 0;

async function newPage(browser, w, h, query, seedStore) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([seed]) => {
    try {
      if (seed) localStorage.setItem('moonstep.v1', JSON.stringify(seed));
    } catch (e) {}
  }, [seedStore || null]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror:', e.message));
  await page.goto(base + (query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__moon && window.__moon.state(), null, { timeout: 5000 });
  await sleep(500);
  return { ctx, page };
}
const shot = async (page, name, w, h) => {
  await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) }); count++;
  console.log('shot', `${name}-${w}x${h}.png`);
};
const clickText = async (page, re) => {
  const b = await page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    for (const e of document.querySelectorAll('button,[role=button]')) {
      const r = e.getBoundingClientRect(), t = (e.textContent || e.getAttribute('aria-label') || '').trim();
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && rx.test(t)) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, re.source);
  if (!b) return false;
  await page.mouse.click(b.x, b.y); await sleep(450); return true;
};
const uiOpen = (page, name, data) => page.evaluate(([n, d]) => {
  try { const u = window.__moon.ui(); u.openRoot ? u.closeAll && u.closeAll() : 0; u.open(n, d || {}); return true; } catch (e) { return false; }
}, [name, data]);
const closeAll = page => page.evaluate(() => { try { window.__moon.ui().closeAll(); } catch (e) {} });
const attempt = (name, fn) => fn().catch(e => console.log('SKIP', name, '-', e.message.split('\n')[0]));

// place the runner in air near the first body of a given kind
const nearKind = (page, kind) => page.evaluate(k => {
  const m = window.__moon, s = m.state();
  for (let i = 0; i < 20 && !s.bodies.some(b => b.kind === k); i++) m.step(1);
  const b = s.bodies.find(x => x.kind === k);
  if (!b) return false;
  const r = s.runner; r.mode = 'air'; r.x = b.x + b.r * 2.4; r.y = b.y - b.r * 0.5; r.vx = 0; r.vy = 20;
  s.over = false; return true;
}, kind);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const seen = { howto: true };
  for (const [w, h] of SIZES) {
    // title + how-to (fresh storage so first-run flows show)
    await attempt('title', async () => {
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', { flags: { howto: true } });
      await shot(page, 'title', w, h);
      if (await uiOpen(page, 'howto', {})) { await sleep(400); await shot(page, 'howto', w, h); } else console.log('SKIP howto');
      await ctx.close();
    });
    await attempt('fresh-howto', async () => {
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1');
      await sleep(300); await shot(page, 'title-firstrun', w, h); await ctx.close();
    });

    // gameplay
    await attempt('play', async () => {
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', { flags: { howto: true }, set: { assist: true } });
      await closeAll(page); await sleep(500);
      await shot(page, 'play-idle', w, h);
      // charge with assist arc (hold on the lower area)
      await page.mouse.move(w / 2, h * 0.8); await page.mouse.down(); await sleep(450);
      await shot(page, 'play-charging-assist', w, h);
      await page.mouse.up(); await sleep(250);
      await shot(page, 'play-midair', w, h);
      await sleep(900);
      await shot(page, 'play-midair-late', w, h);
      // pause
      if (await uiOpen(page, 'pause')) { await sleep(400); await shot(page, 'pause', w, h); await closeAll(page); } else console.log('SKIP pause');
      await ctx.close();
    });

    // special bodies
    for (const kind of ['spin', 'crumble', 'repel']) {
      await attempt('body-' + kind, async () => {
        let done = false;
        for (const sd of ['qa1', 'qa2', 'qa3', 'qa4', 'qa5', 'qa6', 'qa7', 'qa8']) {
          const { ctx, page } = await newPage(browser, w, h, '?seed=' + sd, { flags: { howto: true } });
          await closeAll(page);
          const okk = await nearKind(page, kind);
          if (okk) { await sleep(200); await shot(page, 'body-' + kind, w, h); done = true; }
          await ctx.close();
          if (done) break;
        }
        if (!done) console.log('SKIP body-' + kind + ': none found in seeds');
      });
    }

    // settings
    await attempt('settings', async () => {
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', { flags: { howto: true } });
      if (await uiOpen(page, 'settings')) { await sleep(400); await shot(page, 'settings', w, h);
        if (await clickText(page, /reset best/)) await shot(page, 'settings-reset-confirm', w, h);
      } else console.log('SKIP settings');
      await ctx.close();
    });

    // game over per medal tier (results screen forced through ui hook)
    for (const [tier, hh] of TIERS) {
      await attempt('over-' + tier, async () => {
        const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', { flags: { howto: true } });
        const ok = await page.evaluate(([hh, tier]) => {
          try {
            const med = tier === 'none' ? '' : tier[0].toUpperCase() + tier.slice(1);
            window.__moon.ui().closeAll();
            window.__moon.ui().open('results', { h: hh, medal: med, cause: 'tide', newBest: tier !== 'bronze', prev: 40, best: hh, seed: 'qa1', next: null });
            return true;
          } catch (e) { return false; }
        }, [hh, tier]);
        if (ok) { await sleep(700); await shot(page, 'over-' + tier, w, h); } else console.log('SKIP over-' + tier);
        await ctx.close();
      });
    }
    // real natural game over (idle until the tide takes the runner)
    await attempt('over-natural', async () => {
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', { flags: { howto: true } });
      await closeAll(page);
      await page.evaluate(() => { for (let i = 0; i < 5000 && !window.__moon.state().over; i++) window.__moon.step(30); });
      await sleep(900); await shot(page, 'over-natural', w, h); await ctx.close();
    });

    // records + attempts + medals with seeded history
    await attempt('records', async () => {
      const now = Date.now();
      const store = {
        flags: { howto: true },
        best: { qa1: 420, qa2: 160, D20261119: 820, abc: 60, zz9: 1510 },
        cnt: { qa1: 5, qa2: 2, D20261119: 1, abc: 1, zz9: 3 },
        medals: { Bronze: 2, Silver: 1, Gold: 1, Moon: 1 },
        attempts: [['qa1', 420], ['qa2', 160], ['D20261119', 820], ['abc', 60], ['zz9', 1510], ['qa1', 300]].map((a, i) => ({ seed: a[0], height: a[1], jumps: 10 + i, chain: i, cause: 'tide', ts: now - i * 3600e3 }))
      };
      const { ctx, page } = await newPage(browser, w, h, '?seed=qa1', store);
      if (await uiOpen(page, 'records', { tab: 'best' })) {
        await sleep(400); await shot(page, 'records-best', w, h);
        if (await clickText(page, /^attempts$/)) await shot(page, 'records-attempts', w, h); else console.log('SKIP attempts tab click');
        if (await uiOpen(page, 'medals', {})) { await sleep(400); await shot(page, 'medals', w, h); } else console.log('SKIP medals');
        if (await uiOpen(page, 'records', { tab: 'attempts' })) { await sleep(400); await shot(page, 'records-attempts-direct', w, h); }
      } else console.log('SKIP records');
      await ctx.close();
    });
  }
  await browser.close(); server.close();
  console.log(`done: ${count} screenshots in ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
