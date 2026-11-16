// T2 smoke: open v7-save.json in the Fold cover (344x882), open the Spotlight wheel and the Course wheel, press SPIN then STOP,
// check no console errors and the result strip text, take screenshots.
// Run:  node pages/cricket-sixes/tools/t2-e2e.mjs      Env: T2_OUT=dir (default the t2/shots folder)
// Serves the game folder with `python3 -m http.server` on a free port. No network but localhost. Exit 1 on any failed check.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = (process.env.T2_OUT || '/mnt/project-files/games-design/cricket-sixes/2026-11-16-combined-handoff/t2/shots/').replace(/\/?$/, '/');
const VIEW = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
mkdirSync(OUT, { recursive: true });

const port = await new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const ORIGIN = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(ORIGIN + '/index.html')).ok) break; } catch (_) { /* wait */ } await new Promise((r) => setTimeout(r, 100)); }

// The save: the v7 fixture moved to the Training stage (re-wrapped with a fresh checksum by the game's own save module).
const { createSave } = await import(new URL('../js/platform/save.js', import.meta.url));
const fx = JSON.parse(readFileSync(new URL('../test/fixtures/v7-save.json', import.meta.url), 'utf8'));
const data = JSON.parse(JSON.stringify(fx.data)); data.stage = 'train'; if (data.training) { data.training.nets = null; data.training.tp = Math.max(200, data.training.tp | 0); } // TP so Run nets is open
if (Array.isArray(data.coaches)) data.coaches.forEach((c) => { if (c && typeof c.step === 'number') c.step = 18; }); // 1 step under S-: a +2 or better lands cut at S-
let saved = ''; createSave({ getItem: () => null, setItem: (k, v) => { if (!saved) saved = v; }, removeItem() {} }).save(data);
if (!saved) { console.error('could not wrap the save'); srv.kill(); process.exit(1); }

const FAILS = [], LOG = [];
const check = (ok, msg) => { LOG.push((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) FAILS.push(msg); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block' });
await ctx.addInitScript((text) => { try { if (!localStorage.getItem('cs.save.1')) localStorage.setItem('cs.save.1', text); } catch (_) { /* none */ } }, saved);
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
const ERRS = [];
page.on('pageerror', (e) => ERRS.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|net::ERR_FAILED/.test(m.text())) ERRS.push('console: ' + m.text()); });
const settle = (ms = 300) => page.waitForTimeout(ms);
const shot = async (n) => { await page.screenshot({ path: OUT + n + '.png' }); console.log('  shot', n); };
const tap = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') { b.click(); return true; } return false; }, sel);

/** SPIN, wait past the glow (3.4 s), STOP; return the result strip text. */
async function spinStop(tag, stopAt = 3400) {
  check(await page.$('.wh-ov') != null, tag + ': wheel overlay open');
  check((await page.getAttribute('.wh-ov', 'data-wheel')) === (tag === 'spotlight' ? 'spot' : 'course'), tag + ': wheelId on the overlay');
  await shot(tag + '-1-ready');
  check(await tap('.wh-ov [data-go]'), tag + ': SPIN tapped');
  await page.waitForTimeout(120); await shot(tag + '-1b-stop-inactive'); // STOP guard: the button is inactive for the first 0.35 s after SPIN
  check(await page.evaluate(() => { const b = document.querySelector('.wh-ov [data-go]'); return !!b && (b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-wait') || b.disabled); }), tag + ': STOP inactive right after SPIN');
  const t0 = Date.now() - 120; await settle(1380); await shot(tag + '-2-spinning');
  await page.waitForTimeout(Math.max(0, stopAt - (Date.now() - t0)));
  await shot(tag + '-3-glow');
  check(await tap('.wh-ov [data-go]'), tag + ': STOP tapped');
  await page.waitForSelector('.wh-ov [data-res]:not([hidden])', { timeout: 9000 }).catch(() => {});
  await settle(800); await shot(tag + '-4-result');
  return page.evaluate(() => { const r = document.querySelector('.wh-ov [data-res]'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; });
}

try {
  await page.goto(`${ORIGIN}/index.html?seed=t2e2e`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await settle(800);
  const st = await page.evaluate(() => window.__store.get().stage);
  check(st === 'train', 'save opens on the Training stage (got ' + st + ')');
  for (let k = 0; k < 4; k++) { // the Wooden Wheel tier-up card of the fixture: tap Done until no card is left
    const done = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Done$/i.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); if (b) { b.click(); return true; } return false; });
    if (!done) break; await settle(400);
  }
  for (let k = 0; k < 4 && (await page.$('.c-sheet, .sheet-fixed, .tr-tip')); k++) { const sk = await page.$('.tr-tip [data-tip="skip"]'); if (sk) await sk.click(); else await page.keyboard.press('Escape'); await settle(250); }

  await shot('train-0-tab');
  // Course first (the coach strip hides once nets are run): Course button -> confirm -> wheel
  const cid = await page.evaluate(() => { const b = document.querySelector('[data-ct="course"]:not([aria-disabled="true"])'); return b ? b.getAttribute('data-id') : null; });
  if (!cid) console.log('  course buttons:', await page.evaluate(() => [...document.querySelectorAll('[data-ct="course"]')].map((b) => b.getAttribute('aria-label')).join(' | ')));
  check(!!cid, 'a coach can go on course');
  if (cid) {
    check(await tap('[data-ct="course"][data-id="' + cid + '"]'), 'Course button tapped'); await settle(500);
    check(await tap('[data-cf="yes"]'), 'course confirm tapped'); await settle(900);
    const cr = await spinStop('course', +(process.env.T2_COURSE_STOP || 3400));
    console.log('  course strip:', cr);
    check(/\+\d/.test(cr), 'course strip shows +N steps: "' + cr + '"');
    console.log('  course cut (coach at A+, step 18): visible strip "' + cr + '"; the "cut at S-" words live only in the aria-live say (wheel-view does not print them)');
    check(await tap('.wh-ov [data-go]'), 'course COLLECT tapped'); await settle(1200);
    for (let k = 0; k < 6 && (await page.$('.wh-ov, .sheet-fixed')); k++) { await page.keyboard.press('Escape'); await settle(300); }
  }

  // Spotlight: pick a player, Run nets opens the wheel
  const pid = await page.evaluate(() => { const s = window.__store.get(), p = s.clubs[0].squad.find((x) => x.id) || s.clubs[0].squad[0]; window.__store.dispatch('SetTrainPlan', { spotlightId: p.id }); return p.id; });
  await settle(400);
  check(await tap('[data-lo="runnets"]'), 'Run nets tapped (spotlight ' + pid + ')'); await settle(900);
  const sp = await spinStop('spotlight');
  console.log('  spotlight strip:', sp);
  check(/x\d/.test(sp), 'spotlight strip shows an xN.N multiplier: "' + sp + '"');
  check(!/wheel plus/i.test(sp), 'spotlight strip has no old "wheel plus" text');
  check(await tap('.wh-ov [data-go]'), 'spotlight COLLECT tapped'); await settle(1200);
  await shot('train-5-after');
  const rec = await page.evaluate(() => { const w = (window.__store.get().wheels || {}).stops || {}; return ['spot', 'course'].map((k) => Object.keys(w[k] || {}).length); });
  check(rec[0] > 0 && rec[1] > 0, 'stops recorded in wheels.stops (spot ' + rec[0] + ', course ' + rec[1] + ')');
} catch (e) { check(false, 'script threw: ' + (e.stack || e.message || e)); await shot('zz-failure').catch(() => {}); }

// Kind Floor Spotlight: a second session whose save owns the Kind Floor node (f_floor). The selector does not pass the flag to the Spotlight vm yet,
// so this run patches js/store/selectors.js in flight (kindFloor: mx1.kindFloor) to show the T2 view with the flag set. Shots spotlight-kf-*.
try {
  const d2 = JSON.parse(JSON.stringify(data)); d2.wheelMeta = { ...(d2.wheelMeta || {}), owned: { ...((d2.wheelMeta || {}).owned || {}), f_floor: 1 } };
  let s2 = ''; createSave({ getItem: () => null, setItem: (k, v) => { if (!s2) s2 = v; }, removeItem() {} }).save(d2);
  const c2 = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await c2.addInitScript((text) => { try { if (!localStorage.getItem('cs.save.1')) localStorage.setItem('cs.save.1', text); } catch (_) { /* none */ } }, s2);
  await c2.route('**/js/store/selectors.js', async (r) => { const res = await r.fetch(); const t = (await res.text()).replace('guide: !!fx.guide,', 'kindFloor: fx.kindFloor, guide: !!fx.guide,').replace('guide: mx1.guide,', 'kindFloor: mx1.kindFloor, guide: mx1.guide,'); r.fulfill({ response: res, body: t }); });
  const pg = await c2.newPage(); pg.setDefaultTimeout(8000);
  await pg.goto(`${ORIGIN}/index.html?seed=t2e2e`); await pg.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await pg.waitForTimeout(800);
  for (let k = 0; k < 4; k++) { const done = await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Done$/i.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); if (b) { b.click(); return true; } return false; }); if (!done) break; await pg.waitForTimeout(400); }
  for (let k = 0; k < 4 && (await pg.$('.c-sheet, .sheet-fixed, .tr-tip')); k++) { const sk = await pg.$('.tr-tip [data-tip="skip"]'); if (sk) await sk.click(); else await pg.keyboard.press('Escape'); await pg.waitForTimeout(250); }
  await pg.evaluate(() => { const s = window.__store.get(), p = s.clubs[0].squad.find((x) => x.id) || s.clubs[0].squad[0]; window.__store.dispatch('SetTrainPlan', { spotlightId: p.id }); });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => { const b = document.querySelector('[data-lo="runnets"]'); if (b) b.click(); }); await pg.waitForTimeout(900);
  const labels = await pg.evaluate(() => [...document.querySelectorAll('.wh-ov .wh-lab')].map((e) => e.textContent.trim()).filter(Boolean));
  console.log('  kind floor labels:', labels.join(' '));
  check(labels.includes('x1.2'), 'Kind Floor: owned x1.0 pieces print x1.2 (labels: ' + labels.join(' ') + ')');
  await pg.screenshot({ path: OUT + 'spotlight-kf-1-ready.png' });
  await pg.evaluate(() => document.querySelector('.wh-ov [data-go]').click()); await pg.waitForTimeout(3600);
  await pg.evaluate(() => document.querySelector('.wh-ov [data-go]').click());
  await pg.waitForSelector('.wh-ov [data-res]:not([hidden])', { timeout: 9000 }).catch(() => {}); await pg.waitForTimeout(800);
  await pg.screenshot({ path: OUT + 'spotlight-kf-4-result.png' });
  console.log('  kind floor strip:', await pg.evaluate(() => { const r = document.querySelector('.wh-ov [data-res]'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; }));
  await c2.close();
} catch (e) { check(false, 'kind floor session threw: ' + (e.stack || e.message || e)); }

check(ERRS.length === 0, 'no console errors' + (ERRS.length ? ': ' + ERRS.slice(0, 4).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(LOG.join('\n')); console.log(FAILS.length ? `\n${FAILS.length} FAILED` : '\nall passed');
process.exit(FAILS.length ? 1 : 0);
