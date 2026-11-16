// T4 Finals wheel screenshots + facts at 344x882, dsf 2 (v7 fixture played to the Finals result screen, then the prize spin).
// Usage (from the app root):  node test/e2e/t4-shots-finals.mjs <outDir>      e.g. node test/e2e/t4-shots-finals.mjs /tmp/t4shots-finals
// Writes into <outDir>: finals-ready.png, finals-spinning.png (1.5 s after SPIN), finals-glow.png (3.57 s after SPIN),
//   finals-result.png, finals-result.json, finals-medal-3x.png (3x crop of the Medal "M" slice, taken while ready).
// finals-result.json: {stopSliceId, ringLabel, paid, resultStrip, paidEqualsLabel, minFontPx, texts[], tapTargets[]}. Exit 1 if paid != label.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = (process.argv[2] || '').replace(/\/?$/, '/');
if (OUT === '/') { console.error('usage: node test/e2e/t4-shots-finals.mjs <outDir>'); process.exit(2); }
await mkdir(OUT, { recursive: true });
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEED = process.env.E2E_SEED || 't4-e2e';
const VP = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errs = []; let code = 0;
try {
  const V7 = await readFile(new URL('../fixtures/v7-save.json', import.meta.url), 'utf8');
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
  const wait = (ms) => page.waitForTimeout(Math.max(0, ms));
  const ready = async () => { await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600); };
  const ovState = () => page.evaluate(() => { const ov = document.querySelector('.wh-ov'); if (!ov) return null; const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]'); const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; return { go: go ? go.textContent.trim() : '', res: vis(r) ? r.innerText.trim() : '' }; });
  const tapGo = async (re) => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { const st = await ovState(); if (st && re.test(st.go)) { await page.click('.wh-ov [data-go]'); return true; } await wait(40); } return false; };

  // ---- reach the Finals result screen (as t4-wheels.mjs)
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await ready();
  await page.evaluate(async (txt) => {
    const m = await import('/cricket-sixes/js/core/save-migrate.js'), env = JSON.parse(txt), s = structuredClone(env.data || env);
    s.matchMode = 'classic'; if (s.wheelMeta) s.wheelMeta.tierUpQueue = []; localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
  }, V7);
  await page.reload(); await ready();
  const adv = await page.evaluate(() => {
    const S = window.__store; let g = 0;
    while (S.get().stage !== 'done' && g++ < 800) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p), before = s;
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'coach': d('PassScout'); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'classic' }); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
        case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break; case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
        default: return 'stuck:' + s.stage;
      }
      if (S.get() === before) return 'stuck-no-change:' + S.get().stage;
    }
    return S.get().stage;
  });
  if (adv !== 'done') throw new Error('fixture did not play to the result screen: ' + adv);
  await page.evaluate(async () => {
    const m = await import('/cricket-sixes/js/core/save-migrate.js'), s = structuredClone(window.__store.get());
    s.finalsSpin = null; if (s.wheelMeta) s.wheelMeta.tierUpQueue = []; if (s.wheels && s.wheels.stops) delete s.wheels.stops.finals; if (s.fixture) s.fixture.kind = 'semi';
    localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
  });
  await page.reload(); await ready();
  const b = await page.$('[data-finals-spin]'); if (!b) throw new Error('no [data-finals-spin] on the result screen');
  await b.click({ timeout: 3000 }); await wait(800);
  if (!(await page.$('.wh-ov'))) throw new Error('Finals wheel (.wh-ov) did not open');

  // ---- ready + 3x Medal crop
  await page.screenshot({ path: OUT + 'finals-ready.png' });
  const mr = await page.evaluate(() => { const l = [...document.querySelectorAll('.wh-ov .wh-lab')].find((e) => e.textContent.trim() === 'M'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (mr) {
    const cdp = await ctx.newCDPSession(page), set = (f) => cdp.send('Emulation.setDeviceMetricsOverride', { width: VP.width, height: VP.height, deviceScaleFactor: f, mobile: false });
    await set(3); await wait(400);
    const r = await page.evaluate((c) => { const l = [...document.querySelectorAll('.wh-ov .wh-lab')].find((e) => e.textContent.trim() === 'M').getBoundingClientRect(); return { x: l.x + l.width / 2, y: l.y + l.height / 2 }; }, mr);
    const S = 96, x = Math.max(0, Math.min(VP.width - S, r.x - S / 2)), y = Math.max(0, Math.min(VP.height - S, r.y - S / 2));
    await page.screenshot({ path: OUT + 'finals-medal-3x.png', clip: { x, y, width: S, height: S } });
    await set(2); await cdp.send('Emulation.clearDeviceMetricsOverride'); await page.setViewportSize(VP); await wait(400);
  } else errs.push('no M label found for the Medal crop');

  // ---- spin
  if (!(await tapGo(/^SPIN/i))) throw new Error('SPIN not tappable');
  const t0 = Date.now();
  await wait(1500 - (Date.now() - t0)); await page.screenshot({ path: OUT + 'finals-spinning.png' });
  await wait(3570 - (Date.now() - t0)); await page.screenshot({ path: OUT + 'finals-glow.png' });
  const glowAt = Date.now() - t0;
  if (!(await tapGo(/^STOP/i))) throw new Error('STOP not tappable');
  await wait(3800);
  await page.screenshot({ path: OUT + 'finals-result.png' });

  // ---- facts
  const facts = await page.evaluate(async () => {
    const s = window.__store.get(), ov = document.querySelector('.wh-ov'), key = ov.getAttribute('data-spin-key');
    const { storedStop } = await import('/cricket-sixes/js/core/wheel-stops.js'), { finalsWheelOf } = await import('/cricket-sixes/js/store/wheels/finals.js');
    const stored = storedStop(s, 'finals', key), sl = finalsWheelOf(s).slices;
    const stop = stored && stored.stops ? stored.stops[stored.kept | 0] || stored.stops[0] : stored;
    const res = ov.querySelector('[data-res]'), vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0;
    const texts = [...ov.querySelectorAll('.wh-lab, .wk-legend-row, .wk-legend-ch, [data-res], [data-res] *, [data-go], [data-msg], .t2-strip span')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => ({ sel: e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/)[0], text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 40), fontPx: parseFloat(getComputedStyle(e).fontSize) }));
    const wheelTexts = texts.filter((t) => /wh-lab|wk-legend/.test(t.sel));
    const taps = [...ov.querySelectorAll('button, [role="button"], a[href], [data-go]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { el: (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; });
    const sid = stop ? stop.sliceId : null, label = sid != null && sl[sid] ? sl[sid].label : null, paid = s.finalsSpin ? s.finalsSpin.paid : null, strip = vis(res) ? res.innerText.replace(/\s+/g, ' ').trim() : '';
    return { stopSliceId: sid, ringLabel: label, type: sid != null && sl[sid] ? sl[sid].type : null, paid, resultStrip: strip, texts, wheelTextMinFontPx: wheelTexts.length ? Math.min(...wheelTexts.map((t) => t.fontPx)) : null, minFontPx: texts.length ? Math.min(...texts.map((t) => t.fontPx)) : null, tapTargets: taps, minTapHeightPx: taps.length ? Math.min(...taps.map((t) => t.h)) : null };
  });
  const num = (v) => String(v == null ? '' : v).replace(/[^0-9]/g, '');
  facts.paidEqualsLabel = facts.ringLabel === 'M' ? facts.paid === 0 : num(facts.ringLabel) === num(facts.paid) && num(facts.paid) !== '';
  facts.glowShotAtMs = glowAt; facts.errors = [...new Set(errs)];
  await writeFile(OUT + 'finals-result.json', JSON.stringify(facts, null, 2));
  if (!facts.paidEqualsLabel) code = 1;
  console.log(`stop.sliceId=${facts.stopSliceId} ring label=${facts.ringLabel} paid=${facts.paid} strip="${facts.resultStrip}" paid==label:${facts.paidEqualsLabel}`);
  console.log(`min font wheel/legend=${facts.wheelTextMinFontPx}px all=${facts.minFontPx}px, min tap height=${facts.minTapHeightPx}px, errors=${facts.errors.length}`);
  await ctx.close();
} catch (e) { console.error('ERR', e && e.stack || e); code = 1; }
await browser.close(); server.close();
process.exit(code);
