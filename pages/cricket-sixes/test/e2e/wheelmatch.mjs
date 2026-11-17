// Wheel match mode e2e (2026-11-15 build) at Fold cover 475x638, in a real browser.
// Run from the app root:  node test/e2e/wheelmatch.mjs
// Env: E2E_SOFT=1 (never exit 1), E2E_SHOTS=dir (default: the build shots folder), E2E_SEED=x, E2E_TRACE=1 (log stages), E2E_ONLY=A,B,C (groups).
// Groups:
//  A  full wheel match by taps: new game defaults to wheel; bowl screen (bowler chips, one BOWL OVER, no Attack/Protect/Why/grade, Expected line);
//     hand-spun over (SPIN, STOP at 3.5 s) -> 6-ball row whose runs = landed label; STOP glow "STOP!" only 3.2-3.8 s (2nd over, STOP late at 4.4 s);
//     reload just after STOP keeps the same landed result (no re-spin); Auto rest of innings runs to the break (no ball row, Stop auto pinned 56 px);
//     Settings at the break: Match mode toggle greyed "Applies next match"; chase: BAT OVER + Need line; Stop auto halts; auto pauses before the
//     last over of a live chase ("Need N off 6"); match reaches the result; Spokes rose by the spins count.
//  B  Settings after the match: Dev toggle shows the slider, slider moves s.dev.matchW0, Reset puts it back; switch to Classic -> next match is
//     classic ball-by-ball (s.mode classic, BowlOver gives balls and no s.last.wheel).
//  C  reduced motion (emulated 'reduce'): the button reads "Show result", one tap lands at once, result text in a live region.
// Every screen: no horizontal scroll. Whole run: no console/page errors, no network outside the app.
// Seeded runs only (?seed=...). No network. Screenshots at deviceScaleFactor 1.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = (process.env.E2E_SHOTS || '/mnt/project-files/games-design/cricket-sixes/2026-11-15-wheel-match-build/shots/').replace(/\/?$/, '/');
const SEED = process.env.E2E_SEED || 'wm-e2e';
const ONLY = (process.env.E2E_ONLY || 'A,B,C').split(',');
const VP = { width: 475, height: 694 }; // Fold cover; the shrink guard (wheel width equal ready/spin/result, no drop over overs) needs the 694 height
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => { // pages are served under /cricket-sixes/
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* shots are optional */ }

const results = []; // { g, name, ok, why, note }
const step = (g, name, ok, why) => { results.push({ g, name, ok: !!ok, why: ok ? '' : why || '' }); if (process.env.E2E_TRACE) console.error(`${ok ? 'pass' : 'FAIL'} ${g} ${name}${ok ? '' : ' -- ' + why}`); return !!ok; };
const note = (g, name, info) => { results.push({ g, name, ok: true, note: true, why: info || '' }); };
const allErrs = [];
const browser = await chromium.launch();
const MATCH = ['bowl', 'break', 'chase', 'done'];

// ---------------------------------------------------------------- harness
async function open(tag, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', (e) => allErrs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) allErrs.push(`[${tag}] console: ${m.text()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) allErrs.push(`[${tag}] network outside app: ${u}`); });
  const H = {
    ctx, page, tag,
    settle: (ms = 250) => page.waitForTimeout(ms),
    get: () => page.evaluate(() => window.__store.get()),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    S: (fn, arg) => page.evaluate(fn, arg),
    body: () => page.evaluate(() => document.body.innerText),
    shot: async (name) => { try { await page.screenshot({ path: `${SHOTS}e2e-${name}.png` }); } catch (e) { /* optional */ } },
    async closeSheets() { for (let i = 0; i < 5 && (await page.$('.c-sheet, .sheet-fixed')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } },
    async boot(seed) {
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(seed)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600);
      const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await page.waitForTimeout(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await page.waitForTimeout(400); } }
    },
    async reload() { await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(500); },
    /** Real taps through hub > squad > match day > plan (and done > week/train > hub) until a stage in stops. Never taps on bowl/chase. */
    async play(stops) {
      const want = [].concat(stops); const cta = async () => { const b = await page.$('.c-btn--cta:not([disabled])') || await page.$('.m0-ctabar button:not([disabled]), .ctabar button:not([disabled])'); if (!b) return false; await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); return true; };
      let prev = '', same = 0;
      for (let i = 0; i < 220; i++) {
        const st = await H.stage(); if (want.includes(st)) return st;
        same = st === prev ? same + 1 : 0; prev = st;
        if (same === 3) { // stuck: say what is on screen, tap a dismiss button if one is there
          await H.shot('stuck-' + st);
          if (process.env.E2E_TRACE) console.error('stuck on ' + st + ': ' + (await buttons(page)).map((b) => b.text + (b.dis ? '(dis)' : '')).join(' | ').slice(0, 600));
          await clickBtn(page, /^(Got it|OK|Close|Not now|Later|Continue)\b/i); await page.waitForTimeout(300);
        }
        if (same >= 4 && (st === 'train' || st === 'week')) { // the training week is not under test: end it through the store (as tfc.mjs advance does)
          await H.closeSheets(); await page.evaluate((x) => window.__store.dispatch(x === 'train' ? 'EndWeek' : 'NextWeek'), st); await page.waitForTimeout(400); same = 0; continue;
        }
        if (process.env.E2E_TRACE) console.log('play', i, st);
        await H.closeSheets();
        if (st === 'hub' || st === 'semi' || st === 'final') { if (!(await cta())) return 'stuck:hub'; }
        else if (st === 'squad') { for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) break; await b.click(); await page.waitForTimeout(60); } const c = await page.$('[data-confirm]:not([disabled])'); if (c) await c.click(); await page.waitForTimeout(300); }
        else if (st === 'matchday') { const g = await page.$('[data-act="MatchdayGo"]:not([disabled])'); if (g) await g.click(); await page.waitForTimeout(300); }
        else if (st === 'plan') {
          let go = await page.$('[data-start]:not([disabled])');
          if (!go) { const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; for (let k = 0; k < 10; k++) { const sl = await page.$(`[data-slot="${k}"]`), bw = await page.$(`[data-bowler="${pat[k]}"]`); if (sl && bw) { await sl.click(); await bw.click(); } } go = await page.$('[data-start]:not([disabled])'); }
          if (go) await go.click(); await page.waitForTimeout(400);
        } else if (st === 'break' || st === 'done' || st === 'week' || st === 'train' || st === 'coach' || st === 'end' || st === 'freepick') {
          const skipB = await page.$('[data-strip-skip]'); if (skipB) { await skipB.click().catch(() => {}); await page.waitForTimeout(200); }
          if (!(await cta())) return 'stuck:' + st;
        } else return 'stuck:' + st;
      }
      return 'timeout';
    },
  };
  return H;
}

const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1);
async function noHScroll(H, g, where) { step(g, `no horizontal scroll: ${where}`, !(await hScroll(H.page)), `scrollWidth ${await H.S(() => document.documentElement.scrollWidth)} > ${VP.width}`); }

/** Visible buttons as {text, dis, h, w, i}. */
const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')].map((e, i) => {
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const vis = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]');
  return vis ? { text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true', h: r.height, w: r.width, i } : null;
}).filter(Boolean));
async function findBtn(page, re) { return (await buttons(page)).filter((b) => re.test(b.text)); }
/** Click the first visible enabled button whose text matches re. */
async function clickBtn(page, re) {
  const ok = await page.evaluate((src) => {
    const re = new RegExp(src[0], src[1]);
    for (const e of document.querySelectorAll('button, [role="button"]')) {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none') || e.closest('[hidden]') || e.disabled || e.getAttribute('aria-disabled') === 'true') continue;
      if (re.test((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))) { e.click(); return true; }
    }
    return false;
  }, [re.source, re.flags]);
  return ok;
}
const waitFor = async (page, fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch (e) { return false; } };
const innOf = (s) => (s.stage === 'bowl' || (s.stage === 'break') ? s.inn1 : s.inn2);
const logLen = (s) => (s.wheelLog ? s.wheelLog.length : 0);
const spokesOf = (s) => (s.wheelMeta ? s.wheelMeta.spokes | 0 : 0);
const runsOf = (balls) => (balls || []).reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0);
const wkOf = (balls) => (balls || []).filter((b) => b.o === 'W').length;

/** Install the in-page recorder: t0 at the SPIN (or BOWL/BAT OVER) tap, every frame where a visible button reads "STOP!". */
async function armGlow(page) {
  await page.evaluate(() => {
    const G = window.__wmGlow = { t0: null, on: [], frames: 0, stopT: null, last: 0, lag: [], lagSum: 0, maxGap: 0 };
    if (!window.__wmGlowHook) {
      window.__wmGlowHook = true;
      document.addEventListener('click', (e) => {
        const g = window.__wmGlow; if (!g) return;
        const b = e.target.closest && e.target.closest('button, [role="button"]'); if (!b) return;
        const t = (b.innerText || '').trim().toUpperCase();
        if (/^SPIN/.test(t) || (/^(BOWL|BAT) OVER/.test(t) && g.t0 == null)) g.t0 = performance.now();
        else if (/^STOP/.test(t) && g.t0 != null && g.stopT == null) g.stopT = (performance.now() - g.t0) / 1000;
      }, true);
    }
    const loop = () => {
      const g = window.__wmGlow; if (!g || g.done) return;
      if (g.t0 != null) {
        g.frames++;
        const now = performance.now(); if (g.last) { const gap = now - g.last; g.maxGap = Math.max(g.maxGap, gap); g.lagSum += Math.max(0, gap - 50) / 1000; } g.last = now; // the view clamps dt at 50 ms: its clock lags wall time by the excess
        const t = (now - g.t0) / 1000;
        const lit = [...document.querySelectorAll('button, [role="button"]')].some((b) => /STOP!/.test(b.innerText || '') && b.getBoundingClientRect().width > 0);
        if (lit) { g.on.push(t); g.lag.push(g.lagSum); }
        if (t > 8) { g.done = true; return; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
/** Start the over (BOWL OVER / BAT OVER, then SPIN if the wheel asks for it). Returns the start text seen. */
const wheelW = (page) => page.evaluate(() => { const w = document.querySelector('.wm-wrap'); return w ? Math.round(w.getBoundingClientRect().width) : 0; });
async function startSpin(H) {
  const page = H.page;
  await armGlow(page);
  const go = await clickBtn(page, /^(BOWL OVER|BAT OVER)\b/i);
  if (!go) return { ok: false, why: 'no enabled BOWL OVER / BAT OVER button: ' + (await buttons(page)).map((b) => b.text).join(' | ') };
  await page.waitForTimeout(250);
  const ready = await page.evaluate(() => document.body.innerText);
  const wReady = await wheelW(page);
  const spin = await findBtn(page, /^SPIN\b/i);
  if (spin.length) await clickBtn(page, /^SPIN\b/i);
  const stopSeen = await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => /^STOP/i.test((b.innerText || '').trim()) && !b.disabled), null, 3000);
  const wSpin = await wheelW(page);
  return { ok: stopSeen, why: stopSeen ? '' : 'no STOP button after SPIN: ' + (await buttons(page)).map((b) => b.text).join(' | '), spinBtn: spin.length > 0, ready, wReady, wSpin };
}
/** Tap STOP exactly at secs after t0 (in-page timer). */
async function stopAt(page, secs) {
  return page.evaluate((s) => new Promise((ok) => {
    const g = window.__wmGlow; const wait = Math.max(0, g.t0 + s * 1000 - performance.now());
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /^STOP/i.test((e.innerText || '').trim()) && !e.disabled);
      if (b) b.click(); ok(!!b);
    }, wait);
  }), secs);
}
/** After an over landed: tap the result's NEXT (the first tap only fills the balls) until the pick screen (BOWL OVER / BAT OVER) or a
 *  non-wheel screen. app.js holds the next stage's screen until NEXT, so the store stage alone is not enough. */
async function finishOver(H) {
  const page = H.page; const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const nx = await page.$('[data-wm-next]');
    if (nx) { await nx.click().catch(() => {}); await page.waitForTimeout(250); continue; }
    const btns = await buttons(page);
    if (btns.some((b) => /^(BOWL OVER|BAT OVER)\b/i.test(b.text) && !b.dis)) return H.stage();
    if (!(await page.$('.wm'))) { const st = await H.stage(); if (st !== 'bowl' && st !== 'chase') return st; }
    await page.waitForTimeout(200);
  }
  return 'timeout';
}
/** Bowler rows on the wheel bowl screen (.wm-brow, js/ui/wheelmatch-view.js). */
const bowlerChips = (H) => H.S(() => [...document.querySelectorAll('.wm-brow')].map((e) => ({ text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), dis: e.getAttribute('aria-disabled') === 'true', sel: e.getAttribute('aria-checked') === 'true', h: e.getBoundingClientRect().height })));
/** The suggested bowler is pre-picked; tap the first open row only if none is picked. */
async function pickBowler(H) {
  const chips = await bowlerChips(H); if (chips.some((c) => c.sel)) return true;
  const b = await H.page.$('.wm-brow[data-bowler]:not([aria-disabled="true"])'); if (b) await b.click(); return !!b;
}
/** Hand-spin one over: SPIN, STOP at secs. Returns facts. */
async function handOver(H, secs, { reloadAfterStop = false } = {}) {
  const page = H.page; const before = await H.get(); const stageWas = before.stage;
  if (stageWas === 'bowl') await pickBowler(H);
  const sp = await startSpin(H); if (!sp.ok) return { ok: false, why: sp.why };
  const stopped = await stopAt(page, secs);
  const landed = await waitFor(page, (n) => { const s = window.__store.get(); return (s.wheelLog ? s.wheelLog.length : 0) > n && s.last && s.last.wheel; }, logLen(before), 3000);
  const after = await H.get();
  let reloaded = null;
  if (reloadAfterStop) {
    const keep = { len: logLen(after), seg: after.last && after.last.wheel && after.last.wheel.segId, inn: JSON.stringify([after.inn1 && after.inn1.runs, after.inn1 && after.inn1.wk, after.inn2 && after.inn2.runs]), stage: after.stage };
    await H.reload(); await H.settle(2500);
    const r = await H.get();
    reloaded = { keep, got: { len: logLen(r), seg: r.last && r.last.wheel && r.last.wheel.segId, inn: JSON.stringify([r.inn1 && r.inn1.runs, r.inn1 && r.inn1.wk, r.inn2 && r.inn2.runs]), stage: r.stage }, body: await H.body(), spinning: !!(await page.$('[data-wm="stop"]')) };
  }
  const panelUp = await waitFor(page, () => !!document.querySelector('.wm-res:not([hidden]) .op-circles'), null, 4500); const wRes = panelUp && !reloadAfterStop ? await wheelW(page) : 0;
  (H.widths = H.widths || []).push({ side: stageWas, ready: sp.wReady, spin: sp.wSpin, res: wRes });
  const glow = await page.evaluate(() => { const g = window.__wmGlow || {}; return { on: g.on || [], lag: g.lag || [], frames: g.frames, stopT: g.stopT, maxGap: g.maxGap }; });
  return { ready: sp.ready, ok: stopped && landed, why: !stopped ? 'STOP button gone at tap time' : !landed ? 'no wheelLog entry / s.last.wheel after STOP' : '', before, after, glow, reloaded, stageWas, spinBtn: sp.spinBtn };
}
function landedFacts(f) {
  const w = f.after.last.wheel; const seg = (w.segs || []).find((x) => x.id === w.segId) || null;
  const balls = f.after.last.balls || []; const inn0 = f.stageWas === 'bowl' ? f.before.inn1 : f.before.inn2; const inn1 = f.stageWas === 'bowl' ? f.after.inn1 : f.after.inn2;
  return { w, seg, balls, runs: runsOf(balls), wk: wkOf(balls), dRuns: inn1.runs - inn0.runs, entry: f.after.wheelLog[f.after.wheelLog.length - 1] };
}
async function waitAutoStop(H, ms = 45000) {
  return waitFor(H.page, () => { const s = window.__store.get(); if (s.stage !== 'bowl' && s.stage !== 'chase') return true; return ![...document.querySelectorAll('button')].some((b) => /Stop auto/i.test(b.innerText || '') && b.getBoundingClientRect().width > 0); }, null, ms);
}
/** Watch for a ball row (over panel) while auto runs. */
async function armPanelWatch(page) { await page.evaluate(() => { window.__wmPanel = 0; const mo = new MutationObserver(() => { if (document.querySelector('.op-card, .wm-res:not([hidden]) .op-circles')) window.__wmPanel++; }); mo.observe(document.body, { childList: true, subtree: true }); window.__wmPanelMo = mo; }); }
async function readPanelWatch(page) { return page.evaluate(() => { if (window.__wmPanelMo) window.__wmPanelMo.disconnect(); return window.__wmPanel | 0; }); }
async function openSettings(H) {
  const g = await H.page.$('.st-gear'); if (!g) return false;
  await g.click(); await H.settle(600); return !!(await H.page.$('.st-body'));
}
/** The Match mode row facts inside the open Settings sheet (js/ui/wheelmatch-settings.js: .wms-mode, [data-wm-mode]). */
const modeRow = (page) => page.evaluate(() => {
  const root = document.querySelector('.st-body'); if (!root) return null;
  const row = root.querySelector('.wms-mode');
  if (!row) return { found: false, text: root.innerText.slice(0, 300) };
  const ctl = [...row.querySelectorAll('[data-wm-mode]')];
  const seg = row.querySelector('.wms-seg') || row;
  return { found: true, text: row.innerText.replace(/\s+/g, ' ').trim(), dis: ctl.length > 0 && ctl.every((c) => c.disabled || c.getAttribute('aria-disabled') === 'true'), opacity: parseFloat(getComputedStyle(seg).opacity), ctls: ctl.map((c) => ({ m: c.getAttribute('data-wm-mode'), dis: c.disabled, pressed: c.getAttribute('aria-pressed') })) };
});
/** Tap Classic in the Match mode row (a disabled button cannot be tapped: dispatch a click anyway to prove nothing changes). */
const chooseClassic = (page) => page.evaluate(() => {
  const c = document.querySelector('.st-body [data-wm-mode="classic"]'); if (!c) return 'no classic control';
  c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'clicked classic';
});

/** Fallback so the rest of the run still tests the wheel: SetMatchMode wheel before the first match (and say so). */
async function forceWheel(H, g) {
  await H.S(() => window.__store.dispatch('SetMatchMode', { mode: 'wheel' }));
  note(g, 'fallback', 'new game was not wheel; SetMatchMode wheel dispatched so the remaining checks run -> matchMode ' + (await H.get()).matchMode);
}

// ---------------------------------------------------------------- A: full wheel match
async function groupA() {
  const H = await open('A'); const page = H.page; const g = 'A';
  await H.boot(SEED + '-a');
  const s0 = await H.get();
  step(g, 'new game: s.matchMode is "wheel"', s0.matchMode === 'wheel', 'matchMode=' + s0.matchMode);
  if (s0.matchMode !== 'wheel') await forceWheel(H, g);
  const st = await H.play(['bowl']);
  if (!step(g, 'reached the first match bowl stage by taps', st === 'bowl', 'play -> ' + st)) { await H.shot('A-stuck'); return H; }
  await H.settle(600);
  let s = await H.get();
  step(g, 'match record mode is wheel', s.mode === 'wheel', 'mode=' + s.mode);
  const spokes0 = spokesOf(s), log0 = logLen(s);
  await H.shot('bowl-idle');
  // bowl screen content
  const chips = await bowlerChips(H);
  step(g, 'bowl screen: 6 bowler chips', chips.length === 6, `${chips.length} chips: ${chips.map((c) => c.text).join(' | ')}`);
  step(g, 'bowler chips >= 44 px tall', chips.length && chips.every((c) => c.h >= 43.5), chips.map((c) => Math.round(c.h)).join(','));
  const bo = await findBtn(page, /^BOWL OVER\b/i);
  step(g, 'bowl screen: exactly one BOWL OVER button', bo.length === 1, `${bo.length} found`);
  step(g, 'BOWL OVER >= 44 px', bo.length && bo[0].h >= 43.5 && bo[0].w >= 43.5, bo.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(','));
  let body = await H.body();
  const bad = (body.match(/\b(Attack|Protect|Why\??|grade|Potential)\b/gi) || []);
  step(g, 'bowl screen: no Attack / Protect / Why / grade text', !bad.length, 'found: ' + [...new Set(bad)].join(', '));
  step(g, 'bowl screen: no Auto rest of innings before over 1', !(await findBtn(page, /Auto rest/i)).length, 'shown at over 1');
  step(g, 'bowl screen: no Auto over button (removed, SPEC 2h)', !(await findBtn(page, /Auto over/i)).length && !/Auto over/i.test(await H.body()), (await buttons(page)).map((b) => b.text).join(' | '));
  step(g, 'no Settings gear on the bowl screen', !(await page.$('.st-gear')), 'gear shown');
  await noHScroll(H, g, 'bowl screen');

  // over 1: hand spin, STOP at 3.5 s
  let f = await handOver(H, 3.5);
  if (step(g, 'over 1: SPIN then STOP lands (wheelLog + s.last.wheel)', f.ok, f.why)) {
    step(g, 'wheel screen (after BOWL OVER): Expected line "Expected: x runs, y wkts"', /Expected:\s*[\d.]+\s*runs?,\s*[\d.]+\s*wkts?/i.test(f.ready), f.ready.replace(/\s+/g, ' ').slice(0, 200));
    step(g, 'wheel screen: SPIN step after BOWL OVER', f.spinBtn, 'no SPIN button');
    await H.shot('over1-landed');
    const L = landedFacts(f);
    step(g, 'over 1: not auto, stop t ~3.5 s', !L.w.auto && Math.abs(L.w.t - 3.5) < 0.25, `auto=${L.w.auto} t=${L.w.t}`);
    step(g, 'over 1: landed segment found in s.last.wheel.segs', !!L.seg, 'segId ' + L.w.segId);
    if (L.seg) {
      const isNum = /^\d+$/.test(String(L.seg.label));
      step(g, 'over 1: 6-ball row (or fewer only on WIN / ALL OUT)', L.balls.length === 6 || !!L.seg.end, `${L.balls.length} balls, end=${L.seg.end}`);
      step(g, 'over 1: ball runs total = landed label', isNum ? L.runs === Number(L.seg.label) : L.runs === L.seg.runs, `balls ${L.runs} vs label ${L.seg.label} (seg.runs ${L.seg.runs})`);
      step(g, 'over 1: wickets in the row = label stars', L.wk === (L.seg.wk | 0), `balls ${L.wk}W vs seg.wk ${L.seg.wk}`);
      step(g, 'over 1: innings score rose by the label', L.dRuns === L.runs, `score +${L.dRuns}, balls ${L.runs}`);
      step(g, 'over 1: wheelLog entry matches (segId, not auto)', L.entry && L.entry.segId === L.w.segId && !L.entry.auto, JSON.stringify(L.entry));
    }
    const panelSeen = await waitFor(page, () => !!document.querySelector('.wm-res:not([hidden]) .op-circles'), null, 4500);
    step(g, 'over 1: ball row shows after the glide', panelSeen, 'no .op-card/.op-circles/[data-ball-row]');
    if (panelSeen) {
      await H.settle(2800); await H.shot('over1-ballrow');
      const filled = await page.evaluate(() => document.querySelectorAll('.wm-res .op-slot.is-filled').length);
      const Lb = landedFacts(f);
      step(g, 'over 1: ball row fills one circle per ball', filled === Lb.balls.length, `${filled} filled vs ${Lb.balls.length} balls`);
      const chipTxt = await page.evaluate(() => (document.querySelector('.wm-res .wm-chip') || {}).textContent || '');
      step(g, 'over 1: "Landed on" chip shows the label', Lb.seg && chipTxt.replace(/^[^0-9A-Z]+/, '').startsWith(String(Lb.seg.label)), `chip "${chipTxt}" label ${Lb.seg && Lb.seg.label}`);
    }
    const g1 = f.glow;
    step(g, 'over 1: "STOP!" glow seen before the 3.5 s tap, not before 3.2 s', g1.on.length > 0 && Math.min(...g1.on) >= 3.15, `glow frames at ${g1.on.slice(0, 3).map((x) => x.toFixed(2))}..; ${g1.frames} frames`);
  }
  let st2 = await finishOver(H);
  step(g, 'over 1: ball row closes, next over ready', st2 === 'bowl', 'after panel: ' + st2);

  // over 2: STOP late at 4.4 s -> the whole glow window is visible
  if (st2 === 'bowl') {
    f = await handOver(H, 4.4);
    if (step(g, 'over 2: SPIN then late STOP lands', f.ok, f.why)) {
      const on = f.glow.on, lg = f.glow.lag; const lo = on.length ? on[0] : NaN, hi = on.length ? on[on.length - 1] : NaN;
      const loC = lo - (lg[0] || 0), hiC = hi - (lg[lg.length - 1] || 0); // on the view's own (frame-clamped) clock
      step(g, 'STOP glow "STOP!" only between 3.2 and 3.8 s after SPIN (view clock), one shot', on.length > 0 && loC >= 3.15 && loC <= 3.3 && hiC <= 3.85 && hiC >= 3.6 && hi - lo <= 0.75, `wall ${lo.toFixed(2)}..${hi.toFixed(2)} s, view clock ${loC.toFixed(2)}..${hiC.toFixed(2)} s (${on.length} frames, max frame gap ${Math.round(f.glow.maxGap)} ms)`);
      if (hi - (lg[lg.length - 1] || 0) !== hi) note(g, 'glow vs wall clock', `frames over 50 ms made the view clock lag wall time by ${(lg[lg.length - 1] || 0).toFixed(2)} s: glow seen at wall ${lo.toFixed(2)}..${hi.toFixed(2)} s`);
      const L = landedFacts(f);
      step(g, 'over 2: logged bucket late', !L.entry || L.entry.bucket === 'l', 'bucket ' + (L.entry && L.entry.bucket));
      if (L.seg) step(g, 'over 2: ball runs total = landed label', L.runs === L.seg.runs, `balls ${L.runs} vs ${L.seg.label}`);
    }
    st2 = await finishOver(H);
  }
  body = await H.body();
  const autoRest = await findBtn(page, /Auto rest/i);
  step(g, 'Auto rest of innings shows after over 1', autoRest.length === 1, (await buttons(page)).map((b) => b.text).join(' | '));

  // over 3: STOP then reload at once (during the glide)
  if (st2 === 'bowl') {
    f = await handOver(H, 3.4, { reloadAfterStop: true });
    if (step(g, 'over 3: lands before reload', f.ok, f.why)) {
      const r = f.reloaded;
      step(g, 'reload mid-match: same stage, same wheelLog length, same landed segId, same score', r.keep.len === r.got.len && r.keep.seg === r.got.seg && r.keep.inn === r.got.inn && r.keep.stage === r.got.stage, JSON.stringify(r));
      const s3 = await H.get();
      step(g, 'reload: no re-spin 2.5 s later (wheelLog unchanged)', logLen(s3) === r.keep.len, `${logLen(s3)} vs ${r.keep.len}`);
      const seg = (f.after.last.wheel.segs || []).find((x) => x.id === r.keep.seg);
      step(g, 'reload: the screen shows the over 3 result ("Landed on" + label), not a spinning wheel', !!seg && /Landed on/i.test(r.body) && r.body.includes(String(seg.label)) && !r.spinning, r.body.replace(/\s+/g, ' ').slice(0, 200));
      await H.shot('reload-after-stop');
    }
    st2 = await finishOver(H);
  }

  // Auto rest of innings -> break
  if ((await H.stage()) === 'bowl') {
    await armPanelWatch(page);
    const okA = await clickBtn(page, /Auto rest/i);
    step(g, 'tap Auto rest of innings', okA, 'button missing');
    await H.settle(300);
    const stopA = await findBtn(page, /Stop auto/i);
    step(g, 'Stop auto pinned while auto runs, >= 56 px tall', stopA.length === 1 && stopA[0].h >= 55.5, stopA.map((b) => Math.round(b.h)).join(',') || 'none');
    await H.shot('auto-running');
    const done = await waitFor(page, () => window.__store.get().stage !== 'bowl', null, 40000);
    step(g, 'Auto rest of innings runs to the break', done && (await H.stage()) === 'break', 'stage ' + (await H.stage()));
    step(g, 'auto overs show no ball row', (await readPanelWatch(page)) === 0, 'panel nodes appeared during auto');
    const sB = await H.get();
    step(g, 'auto overs logged auto in wheelLog', (sB.wheelLog || []).slice(3).every((e) => e.auto), JSON.stringify((sB.wheelLog || []).slice(3).map((e) => e.auto)));
  }
  if ((await H.stage()) === 'break') {
    const left = await waitFor(page, () => !document.querySelector('.wm'), null, 6000);
    step(g, 'wheel screen gives way to the break screen after the last auto over', left, 'wheel view still shown 6 s after stage break');
    await H.settle(400); await H.shot('break');
    await noHScroll(H, g, 'break');
    if (await openSettings(H)) {
      const row = await modeRow(page);
      step(g, 'Settings at the break: Match mode row present', row && row.found, JSON.stringify(row));
      if (row && row.found) {
        step(g, 'Settings mid-match: toggle greyed (disabled)', row.dis || row.opacity < 0.75, JSON.stringify(row));
        step(g, 'Settings mid-match: text "Applies next match"', /Applies next match/i.test(row.text), row.text);
        const r2 = await chooseClassic(page); await H.settle(200);
        step(g, 'Settings mid-match: tapping Classic changes nothing', (await H.get()).matchMode === 'wheel' && (await H.get()).mode === 'wheel', r2 + '; matchMode ' + (await H.get()).matchMode);
      }
      await H.shot('settings-midmatch');
      await H.closeSheets();
    } else step(g, 'Settings gear on the break screen', false, 'no .st-gear / sheet');
    const cta = await page.$('.c-btn--cta:not([disabled])'); if (cta) await cta.click(); await H.settle(700);
  }
  // chase
  if (step(g, 'chase stage reached', (await H.stage()) === 'chase', 'stage ' + (await H.stage()))) {
    body = await H.body();
    step(g, 'chase: one BAT OVER button', (await findBtn(page, /^BAT OVER\b/i)).length === 1, (await buttons(page)).map((b) => b.text).join(' | '));
    step(g, 'chase: Need line "Need N off M balls"', /Need \d+ off \d+ balls?/i.test(body), body.replace(/\s+/g, ' ').slice(0, 200));
    step(g, 'chase: Expected line', /Expected:\s*[\d.]+\s*runs?,\s*[\d.]+\s*wkts?/i.test(body), '');
    step(g, 'chase: no Attack / Protect / Why', !/\b(Attack|Protect|Why\??)\b/.test(body), '');
    await H.shot('chase-idle'); await noHScroll(H, g, 'chase');
    // one hand-spun bat over
    f = await handOver(H, 3.5);
    if (step(g, 'chase over 1: BAT OVER, SPIN, STOP lands', f.ok, f.why)) { const L = landedFacts(f); if (L.seg) step(g, 'chase over 1: runs = label', L.runs === L.seg.runs, `${L.runs} vs ${L.seg.label}`); }
    let cs = await finishOver(H);
    if (cs === 'chase') {
      // Stop auto halts
      await clickBtn(page, /Auto rest/i); await H.settle(700);
      const stopped = await clickBtn(page, /Stop auto/i);
      await H.settle(1500); const n1 = logLen(await H.get()); await H.settle(2000); const n2 = logLen(await H.get());
      step(g, 'Stop auto halts the auto run', stopped && n1 === n2, `stop tapped=${stopped}, log ${n1} -> ${n2}`);
      await finishOver(H);
      if ((await H.stage()) === 'chase') {
        await clickBtn(page, /Auto rest/i);
        await waitAutoStop(H);
        await H.settle(500);
        const sc = await H.get();
        if (sc.stage === 'chase') {
          body = await H.body();
          step(g, 'auto pauses before the last over of a live chase', sc.inn2.over === 10 && !sc.inn2.done, `inn2.over ${sc.inn2.over}`);
          step(g, 'pause shows "Need N off 6"', /Need \d+ off 6\b/.test(body), body.replace(/\s+/g, ' ').slice(0, 200));
          await H.shot('chase-last-over-pause');
          f = await handOver(H, 3.5);
          step(g, 'last over hand-spun', f.ok, f.why);
          await finishOver(H);
        } else note(g, 'auto pause before last over', `chase decided before over 10 (stage ${sc.stage}, inn2 over ${sc.inn2 && sc.inn2.over}, result ${sc.result}); pause not exercised`);
      }
    }
    for (let i = 0; i < 12 && (await H.stage()) === 'chase'; i++) { const hf = await handOver(H, 3.5); if (!hf.ok) break; await finishOver(H); } // no per-over Auto: hand-spin the rest
  }
  { // SHRINK guard (475x694): one wheel width across ready, spin and result, and no drop across the hand-spun overs, bowl side and bat side
    for (const side of ['bowl', 'chase']) {
      const ws = (H.widths || []).filter((x) => x.side === side && x.res);
      if (!ws.length) { note(g, `shrink guard ${side}`, 'no hand-spun overs with a result sample'); continue; }
      step(g, `${side}: wheel width equal across ready, spin and result in every hand-spun over`, ws.every((x) => x.ready === x.spin && x.spin === x.res), JSON.stringify(ws));
      const all = (H.widths || []).filter((x) => x.side === side).map((x) => x.ready);
      step(g, `${side}: wheel width never drops (more than 6 px of text wrap) from over to over (${all.join(', ')})`, all.every((x, i) => i === 0 || x >= all[i - 1] - 6), all.join(', '));
    }
  }
  const sd = await H.get();
  step(g, 'match reaches the result screen', sd.stage === 'done', 'stage ' + sd.stage);
  if (sd.stage === 'done') {
    await H.settle(800); await H.shot('result'); await noHScroll(H, g, 'result');
    const spun = logLen(sd) - log0;
    const meta = await H.S(async () => { try { return (await import('/cricket-sixes/js/data/flags.js')).FLAGS.wheelMeta; } catch (e) { return null; } });
    if (meta) step(g, 'Spokes rose by the spins count', spokesOf(sd) - spokes0 === spun * 1, `spokes +${spokesOf(sd) - spokes0}, spins ${spun}`);
    else note(g, 'Spokes', 'FLAGS.wheelMeta off: no Spokes paid');
    const ovs = (sd.inn1.overs || []).length + (sd.inn2.overs || []).length;
    step(g, 'one wheelLog entry per over bowled', spun === ovs, `log ${spun}, overs ${ovs}`);
  }
  return H;
}

// ---------------------------------------------------------------- B: Settings after the match, Dev, Classic next match
async function groupB(H) {
  const g = 'B'; const page = H.page;
  if (!H || (await H.stage()) !== 'done') { step(g, 'group B needs group A at the result', false, 'stage ' + (H && (await H.stage()))); return; }
  const st = await H.play(['hub', 'week', 'train', 'matchday', 'squad', 'plan']);
  await H.settle(400);
  if (!step(g, 'left the match (FinishMatch)', !MATCH.includes(st) && !/stuck|timeout/.test(st), 'stage ' + st)) return;
  if (!(await page.$('.st-gear'))) { const s2 = await H.play(['hub']); if (s2 !== 'hub') note(g, 'gear', 'went to ' + s2); }
  if (!step(g, 'Settings opens after the match', await openSettings(H), 'no gear / sheet on ' + (await H.stage()))) return;
  let row = await modeRow(page);
  step(g, 'after match: Match mode row enabled, no "Applies next match"', row && row.found && !row.dis && !/Applies next match/i.test(row.text), JSON.stringify(row));
  // Dev toggle + slider + Reset
  const dv = await page.$('.st-body [data-wm-dev]');
  step(g, 'Settings: Dev switch present, off by default', !!dv && (await dv.getAttribute('aria-checked')) === 'false', 'dev switch ' + (dv ? await dv.getAttribute('aria-checked') : 'missing'));
  const slHidden = await page.evaluate(() => { const r = document.querySelector('.st-body [data-wm-key="matchW0"]'); return !r || !r.getBoundingClientRect().width; });
  step(g, 'Dev off: slider hidden', slHidden, 'slider visible with Dev off');
  if (dv) { await dv.scrollIntoViewIfNeeded().catch(() => {}); await dv.click(); await H.settle(400); }
  const sl = await page.$('.st-body [data-wm-key="matchW0"]');
  const slVis = sl ? await sl.isVisible() : false;
  step(g, 'Dev on: slider shows, s.dev.on true', slVis && (await H.get()).dev && (await H.get()).dev.on === true, `slider=${slVis} dev=${JSON.stringify((await H.get()).dev)}`);
  if (sl) await sl.scrollIntoViewIfNeeded().catch(() => {});
  await H.shot('settings-dev');
  if (slVis) {
    const box = await sl.boundingBox(); // a real drag: press on the thumb end, move right, let go (change fires on release)
    await page.mouse.move(box.x + 22, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    await H.settle(300);
    const d1 = (await H.get()).dev;
    const readout = await page.evaluate(() => (document.querySelector('.st-body [data-wm-val="matchW0"]') || {}).textContent);
    step(g, 'Dev slider changes s.dev.matchW0 (and the readout)', d1 && d1.matchW0 !== 36 && readout && !/^36 /.test(readout), JSON.stringify(d1) + ' readout ' + readout);
    await H.shot('settings-dev-tweaked');
    const rb = await page.$('.st-body [data-wm-reset="one"]'); if (rb) { await rb.scrollIntoViewIfNeeded().catch(() => {}); await rb.click(); } await H.settle(300);
    const d2 = (await H.get()).dev;
    const readout2 = await page.evaluate(() => (document.querySelector('.st-body [data-wm-val="matchW0"]') || {}).textContent);
    step(g, 'Dev Reset puts matchW0 back to 36 (readout too), Dev stays on', !!rb && d2 && d2.matchW0 === 36 && d2.on === true && /^36 /.test(readout2 || ''), `reset=${!!rb} ${JSON.stringify(d2)} readout ${readout2}`);
  }
  const dv2 = await page.$('.st-body [data-wm-dev]'); if (dv2) { await dv2.click(); await H.settle(300); } // Dev off again: next match on default physics
  const cb = await page.$('.st-body [data-wm-mode="classic"]'); if (cb) { await cb.scrollIntoViewIfNeeded().catch(() => {}); await cb.click(); } await H.settle(300);
  const r = cb ? 'tapped Classic' : 'no Classic option';
  step(g, 'switch Match mode to Classic after the match', (await H.get()).matchMode === 'classic', r + '; matchMode ' + (await H.get()).matchMode);
  await noHScroll(H, g, 'settings');
  await H.closeSheets();
  const st2 = await H.play(['bowl']);
  if (!step(g, 'next match reached', st2 === 'bowl', 'play -> ' + st2)) return;
  await H.settle(600);
  const s = await H.get();
  step(g, 'next match is classic (s.mode)', s.mode !== 'wheel', 'mode ' + s.mode);
  const cl = await page.evaluate(() => ({ wm: !!document.querySelector('.wm'), txt: document.body.innerText }));
  step(g, 'classic bowl screen: no wheel view, Attack / Protect shown', !cl.wm && /\bAttack\b/.test(cl.txt) && /\bProtect\b/.test(cl.txt), `wheel view ${cl.wm}; ${cl.txt.replace(/\s+/g, ' ').slice(0, 160)}`);
  await H.shot('classic-next-match');
  await page.evaluate(() => window.__store.dispatch('BowlOver', { bowler: 0 }));
  await H.settle(300);
  const s2 = await H.get();
  step(g, 'classic BowlOver plays ball-by-ball (balls, no s.last.wheel)', s2.last && s2.last.balls && s2.last.balls.length > 0 && !s2.last.wheel, JSON.stringify(s2.last && { n: s2.last.balls && s2.last.balls.length, wheel: !!s2.last.wheel }));
}

// ---------------------------------------------------------------- C: reduced motion
async function groupC() {
  const H = await open('C', { reduced: true }); const page = H.page; const g = 'C';
  await H.boot(SEED + '-c');
  if ((await H.get()).matchMode !== 'wheel') await forceWheel(H, g);
  const st = await H.play(['bowl']);
  if (!step(g, 'reduced motion: reached bowl', st === 'bowl', 'play -> ' + st)) return H;
  await H.settle(500);
  step(g, 'reduced motion: match is wheel', (await H.get()).mode === 'wheel', 'mode ' + (await H.get()).mode);
  await pickBowler(H);
  const btns = await buttons(page);
  step(g, 'reduced motion: no "Show result" path (removed, SPEC 2e)', !btns.some((b) => /Show result/i.test(b.text)), btns.map((b) => b.text).join(' | '));
  await H.shot('reduced-idle');
  const f = await handOver(H, 3.5);
  step(g, 'reduced motion: wheel still spins by SPIN then STOP and lands', f.ok, f.why);
  const s = await H.get();
  step(g, 'reduced motion: no reduced flag in the wheel record', !!(s.last && s.last.wheel) && !('reduced' in s.last.wheel), JSON.stringify(s.last && s.last.wheel && Object.keys(s.last.wheel)));
  await H.shot('reduced-result');
  await noHScroll(H, g, 'reduced result');
  return H;
}

// ---------------------------------------------------------------- run
const opened = [];
try {
  let A = null;
  if (ONLY.includes('A') || ONLY.includes('B')) { A = await groupA(); opened.push(A); }
  if (ONLY.includes('B') && A) await groupB(A);
  if (ONLY.includes('C')) opened.push(await groupC());
} catch (e) { step('X', 'script ran without throwing', false, e.stack || String(e)); }
finally { for (const H of opened) await H.ctx.close().catch(() => {}); await browser.close(); server.close(); }

for (const e of allErrs) step('E', 'no console/page errors, no network', false, e);
if (!allErrs.length) step('E', 'no console/page errors, no network', true);
const names = { A: 'wheel match', B: 'settings + classic', C: 'reduced motion', E: 'errors', X: 'harness' };
let bad = 0;
console.log(`wheelmatch e2e seed ${SEED}; viewport ${VP.width}x${VP.height}; shots ${SHOTS}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.note ? 'NOTE' : r.ok ? 'PASS' : 'FAIL'} [${r.g} ${names[r.g]}] ${r.name}${r.note ? ': ' + r.why : r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length} checks` : `PASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
