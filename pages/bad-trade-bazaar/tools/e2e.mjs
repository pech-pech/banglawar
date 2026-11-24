// Bad Trade Bazaar e2e (CONTRACT-lessons-1 section 7). Run: node pages/bad-trade-bazaar/tools/e2e.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); // pages/
const SHOTS = '/tmp/btb-e2e';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
// huge tick so only __btb.tick(n) drives time
const URL = `http://127.0.0.1:${PORT}/bad-trade-bazaar/?tick=3600000`;

const results = [];
let failed = false;
let curSize = '';
async function step(name, fn) {
  const n = curSize + ' ' + name;
  try { await fn(); results.push([n, true, '']); console.log('PASS ' + n); }
  catch (e) { failed = true; const m = String(e && e.message || e).split('\n')[0]; results.push([n, false, m]); console.log('FAIL ' + n + ' :: ' + m); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

async function tap(page, sel) {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded().catch(() => {});
  const b = await l.boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.mouse.up();
}
async function hold(page, sel, ms) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
const scr = (page) => page.evaluate(() => document.body.dataset.screen);
const waitScr = (page, name) => page.waitForFunction((n) => document.body.dataset.screen === n, name, { timeout: 4000 });
const st = (page) => page.evaluate(() => { const s = window.__btb.getState(); return s && { t: s.t, lots: s.lots.length, cash: s.cash, over: s.over, trades: s.trades, drops: s.drops.length }; });
const txt = async (page, sel) => ((await page.textContent(sel)) || '').trim();
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);

async function screenCheck(page, label) {
  const r = await page.evaluate(() => ({
    act: document.querySelectorAll('.screen.active').length,
    sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth,
    small: (() => { const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS'].includes(el.tagName)) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        let hid = false; for (let a = el; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) { hid = true; break; } }
        if (hid) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 11.95) out.push(`${el.tagName}#${el.id} "${n.nodeValue.trim().slice(0, 18)}" ${fs}px`);
      } return out; })(),
    btns: (() => { const out = [];
      for (const b of document.querySelectorAll('button,[role=button]')) {
        const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue;
        let hid = false; for (let a = b; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden') { hid = true; break; } }
        if (hid) continue;
        const big = /^(buy|sell)-\d$/.test(b.id); const min = big ? 55.5 : 43.5;
        if (r.height < min) out.push(`#${b.id}.${String(b.className).slice(0, 20)} h=${r.height.toFixed(1)} need ${big ? 56 : 44}`);
      } return out; })(),
  }));
  ok(r.act === 1, `${label}: ${r.act} .screen.active (want 1)`);
  ok(r.sw <= r.iw && r.bw <= r.iw, `${label}: horizontal scroll sw=${r.sw} bw=${r.bw} iw=${r.iw}`);
  ok(!r.small.length, `${label}: text < 12px: ${r.small.slice(0, 3).join(' | ')}`);
  ok(!r.btns.length, `${label}: small buttons: ${r.btns.slice(0, 3).join(' | ')}`);
}
const soft = (page, label) => step('layout: ' + label, () => screenCheck(page, label));
async function inView(page, sel, label) {
  const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height, ih: innerHeight }; }, sel);
  ok(r && r.h > 0, `${label}: ${sel} missing/hidden`);
  ok(r.top >= -0.5 && r.bottom <= r.ih + 0.5, `${label}: ${sel} outside viewport (${r.top.toFixed(0)}..${r.bottom.toFixed(0)} of ${r.ih})`);
}

const browser = await chromium.launch();

async function runSize(w, h) {
  curSize = `${w}x${h}`;
  const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${w}x${h}-${name}.png` });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  let settled = true;
  const gate = async (name, fn) => { await step(name, async () => { if (!settled) throw new Error('skipped: earlier step broke the flow'); try { await fn(); } catch (e) { settled = false; throw e; } }); };

  await gate('start screen', async () => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#btn-play', { timeout: 4000 });
    ok((await scr(page)) === 'start', 'body[data-screen]=start');
    ok((await txt(page, '#build-id')).includes('btb-lessons-1'), 'build id: ' + await txt(page, '#build-id'));
    ok(await page.evaluate(() => !!(window.__btb && __btb.getState && __btb.getProfile && __btb.getConfig && __btb.setConfig && __btb.tick && __btb.go && __btb.setCash && __btb.report)), '__btb hooks');
    ok(await visible(page, '#btn-settings-start'), '#btn-settings-start');
    await shot(page, 'start'); await soft(page, 'start');
  });
  await gate('play -> morning (3 slot groups, open stall)', async () => {
    await tap(page, '#btn-play'); await waitScr(page, 'morning');
    for (let s = 0; s < 3; s++) ok((await page.locator(`#screen-morning .pick[data-slot="${s}"]`).count()) >= 1, `no .pick for slot ${s}`);
    ok(await visible(page, '#btn-open-stall'), '#btn-open-stall');
    ok(/\$\d+\.\d\d/.test(await txt(page, '#morning-cash')), 'morning-cash: ' + await txt(page, '#morning-cash'));
    await page.waitForTimeout(150); await shot(page, 'morning'); await soft(page, 'morning');
  });
  await gate('open stall -> run screen HUD + rows', async () => {
    await tap(page, '#btn-open-stall'); await waitScr(page, 'run');
    ok(/Day\s*\d/.test(await txt(page, '#hud-day')), 'hud-day');
    ok((await txt(page, '#hud-timer')).length > 0 && (await txt(page, '#hud-cash')).includes('$'), 'hud timer/cash');
    ok(/Lots\s*3\/3/.test(await txt(page, '#hud-lots')), 'hud-lots: ' + await txt(page, '#hud-lots'));
    for (let i = 0; i < 3; i++) for (const p of ['row', 'spark', 'lots', 'buy', 'sell']) ok(await page.locator(`#${p}-${i}`).count(), `#${p}-${i} missing`);
    for (let i = 0; i < 3; i++) ok(await page.locator(`#strip-power-${i}`).count(), `#strip-power-${i} missing`);
    for (let i = 0; i < 2; i++) ok(await page.locator(`#strip-lesson-${i}`).count(), `#strip-lesson-${i} missing`);
    ok(/^BUY\s*\$\d/i.test(await txt(page, '#buy-0')), 'buy face: ' + await txt(page, '#buy-0'));
    await shot(page, 'run'); await soft(page, 'run');
  });
  await gate('buy row 0 x3 stacks 3 lots', async () => {
    for (let k = 0; k < 3; k++) { await tap(page, '#buy-0'); await page.waitForTimeout(380); }
    const s = await st(page);
    ok(s.lots === 3, `lots after 3 buys: ${s.lots}`);
    ok(/Lots\s*0\/3/.test(await txt(page, '#hud-lots')), 'hud-lots: ' + await txt(page, '#hud-lots'));
    ok((await txt(page, '#lots-0')).length > 0, '#lots-0 empty');
    await shot(page, 'run-lots'); await soft(page, 'run with lots');
  });
  await gate('sell tap sells best lot', async () => {
    await tap(page, '#sell-0'); await page.waitForTimeout(150);
    ok((await st(page)).lots === 2, 'lots after tap-sell: ' + (await st(page)).lots);
  });
  await gate('sell long-press sells worst lot', async () => {
    await hold(page, '#sell-0', 650); await page.waitForTimeout(200);
    ok((await st(page)).lots === 1, 'lots after long-press: ' + (await st(page)).lots);
  });
  await gate('buy row 1', async () => {
    await tap(page, '#buy-1'); await page.waitForTimeout(380);
    ok((await st(page)).lots === 2, 'lots after buy-1: ' + (await st(page)).lots);
  });
  await gate('tick(200) -> end screen, score in view', async () => {
    await page.evaluate(() => window.__btb.tick(200)); await waitScr(page, 'end');
    ok(/\$\d/.test(await txt(page, '#end-cash')), 'end-cash: ' + await txt(page, '#end-cash'));
    ok(/[+\-−]\$\d+\.\d\d/.test(await txt(page, '#end-profit')), 'end-profit: ' + await txt(page, '#end-profit'));
    await page.waitForTimeout(700);
    await inView(page, '#end-cash', 'end'); await inView(page, '#end-profit', 'end');
    for (const s of ['#end-scars', '#end-proto', '#btn-shop', '#btn-copy-report']) ok(await page.locator(s).count(), s + ' missing');
    ok(await page.locator('#btn-next-day, #btn-new-stall').count(), 'no next-day / new-stall button');
    await shot(page, 'end'); await soft(page, 'end');
  });
  await gate('copy report -> toast + clipboard', async () => {
    await tap(page, '#btn-copy-report'); await page.waitForTimeout(300);
    ok(/Report copied/i.test(await txt(page, '#toast')), 'toast: ' + await txt(page, '#toast'));
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(clip.includes('btb-lessons-1'), 'clipboard lacks btb-lessons-1: ' + clip.slice(0, 40));
  });
  await gate('setCash(200) -> shop: buy cheapest perk', async () => {
    await page.evaluate(() => window.__btb.setCash(200)); await page.waitForTimeout(200);
    await tap(page, '#btn-shop'); await waitScr(page, 'shop');
    ok((await page.locator('#screen-shop .perk').count()) === 9, '.perk count ' + await page.locator('#screen-shop .perk').count());
    ok(/\$200\.00/.test(await txt(page, '#shop-cash')), 'shop-cash: ' + await txt(page, '#shop-cash'));
    await shot(page, 'shop'); await soft(page, 'shop');
    const key = await page.evaluate(() => {
      let best = null;
      for (const b of document.querySelectorAll('#screen-shop .perk-buy:not([disabled])')) {
        const p = b.closest('.perk'); const m = (p.textContent.match(/\$(\d+\.\d\d)/g) || []).map(x => +x.slice(1));
        const price = m.length ? m[m.length - 1] : 1e9;
        if (!best || price < best.price) best = { price, key: p.dataset.key };
      } return best && best.key; });
    ok(key, 'no enabled .perk-buy');
    await tap(page, `#screen-shop .perk[data-key="${key}"] .perk-buy`); await page.waitForTimeout(250);
    ok(/Bought/i.test(await txt(page, '#toast')), 'toast: ' + await txt(page, '#toast'));
    ok((await page.locator(`#screen-shop .perk[data-key="${key}"] .perk-slot`).count()) === 1, 'no .perk-slot after buy');
  });
  await gate('shop done -> morning has slotted perk chip', async () => {
    await tap(page, '#btn-shop-done'); await waitScr(page, 'morning');
    ok((await page.locator('#screen-morning .perk-chip[aria-pressed="true"]').count()) >= 1, 'no .perk-chip aria-pressed=true');
    await shot(page, 'morning-perk'); await soft(page, 'morning+perk');
  });
  await gate('settings: change value -> dev badge, save preset', async () => {
    await page.evaluate(() => window.__btb.go('start'));
    await tap(page, '#btn-settings-start');
    await page.waitForFunction(() => { const s = document.querySelector('#settings'); return s && s.offsetHeight > 0; }, null, { timeout: 3000 });
    const done = await page.evaluate(() => {
      const body = document.querySelector('#settings-body') || document.querySelector('#settings');
      const inputs = [...body.querySelectorAll('input[type=number],input:not([type])')];
      let inp = inputs.find(i => /saleCut/i.test((i.id || '') + (i.getAttribute('aria-label') || '') + (i.closest('label,div,li')?.textContent || '').slice(0, 40))) || inputs[0];
      if (!inp) return false;
      inp.scrollIntoView(); inp.focus(); inp.value = String(+((+inp.value || 0) + 0.005).toFixed(4)); // admin default: nudge first/saleCut number slightly
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur(); return true; });
    ok(done, 'no number input in settings');
    await page.waitForTimeout(250);
    const sp = await page.evaluate(() => { const b = [...document.querySelectorAll('#settings button')].find(x => /save preset/i.test(x.textContent)); return !!b; });
    ok(sp, 'no Save preset button');
    await page.evaluate(() => [...document.querySelectorAll('#settings button')].find(x => /save preset/i.test(x.textContent)).click());
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/${w}x${h}-settings.png` });
    const closed = await page.evaluate(() => { const c = document.querySelector('#btn-settings-close') || [...document.querySelectorAll('#settings button')].find(x => /close|done/i.test(x.textContent)); if (c) c.click(); return !!c; });
    ok(closed, 'no settings close button');
    await page.waitForFunction(() => { const s = document.querySelector('#settings'); return !s || s.offsetHeight === 0 || getComputedStyle(s).display === 'none'; }, null, { timeout: 3000 });
    ok(await page.evaluate(() => JSON.stringify(window.__btb.getConfig()) !== undefined), 'config');
    // dev badge lives on the run HUD
    await page.evaluate(() => window.__btb.go('morning')); await page.waitForTimeout(100);
    await tap(page, '#btn-open-stall'); await waitScr(page, 'run');
    ok(await visible(page, '#dev-badge'), '#dev-badge not visible on run HUD');
  });
  await gate('bust: setCash(3) -> new stall button -> $100.00', async () => {
    // reset config so the changed setting cannot disturb the bust path
    await page.evaluate(() => { const p = window.__btb.getProfile(); p.perks = []; window.__btb.go('morning'); window.__btb.setCash(3); });
    await page.waitForTimeout(200);
    ok(/\$3\.00/.test(await txt(page, '#morning-cash')), 'morning-cash: ' + await txt(page, '#morning-cash'));
    await tap(page, '#btn-open-stall'); await waitScr(page, 'run');
    await page.evaluate(() => window.__btb.tick(200)); await waitScr(page, 'end');
    await page.waitForTimeout(700);
    ok(await visible(page, '#btn-new-stall'), '#btn-new-stall not visible');
    await shot(page, 'end-bust'); await soft(page, 'end bust');
    await tap(page, '#btn-new-stall'); await waitScr(page, 'morning');
    ok(/\$100\.00/.test(await txt(page, '#morning-cash')), 'morning-cash after new stall: ' + await txt(page, '#morning-cash'));
    await soft(page, 'morning after new stall');
  });
  await step('no console errors / page errors', async () => { ok(!errors.length, errors.slice(0, 3).join(' | ')); });
  await ctx.close();
}

try {
  await runSize(344, 882);
  await runSize(475, 638);
} catch (e) {
  failed = true; console.log('FATAL ' + e.message);
} finally {
  await browser.close().catch(() => {});
  server.close();
}

console.log('\nSUMMARY');
for (const [n, p, m] of results) console.log((p ? 'PASS ' : 'FAIL ') + n + (p ? '' : ' :: ' + m));
console.log(`screenshots: ${SHOTS}/`);
process.exit(failed || results.some(r => !r[1]) ? 1 : 0);
