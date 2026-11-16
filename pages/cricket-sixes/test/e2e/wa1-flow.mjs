// wa1 flow e2e at 475x638 (Fold cover): coach strip on the Training tab, Find big wheel, match-day Hype / Toss / Pep, tokens on the
// match-day wheels with a seeded full-tree save (match cap 1), Nets level reads econ.fac.nets.
// Run from the app root:  node test/e2e/wa1-flow.mjs      Env: E2E_SOFT=1 (never exit 1), E2E_SHOTS=dir (screenshots), E2E_SEED=x.
// Two fresh contexts: A = plain new game (strip, Find, plain match day, Nets), B = the same game with a seeded save that owns the full
// tree + tokens (token offer on Hype or Toss, outcome line, at most 1 token a match day). State is driven by commands to reach a stage,
// then by real taps on the screen under test. Seeded saves are written with save-migrate.wrap() into cs.save.1 and the page reloaded.
// Each numbered step reports PASS/FAIL (NOTE = information, never a fail); the run continues past a failed step where it can.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/tmp/wa1-shots/';
const SEED = process.env.E2E_SEED || 'wa1-e2e';
const VIEW = { width: 475, height: 638 };
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

const results = []; // { n, name, ok, why, note }
const step = (n, name, ok, why) => { results.push({ n, name, ok: !!ok, why: ok ? '' : why || '' }); };
const note = (n, name, info) => { results.push({ n, name, ok: true, note: true, why: info || '' }); };

const browser = await chromium.launch();

/** One fresh context + page with the error hooks and small helpers. */
async function open(tag) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push(`[${tag}] network outside app: ${r.url()}`); });
  const H = {
    ctx, page, errs,
    settle: (ms = 250) => page.waitForTimeout(ms),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    S: (fn, arg) => page.evaluate(fn, arg),
    text: (sel) => page.evaluate((q) => { const e = q ? document.querySelector(q) : document.body; return e ? e.innerText : ''; }, sel || null),
    shot: async (name) => { try { await page.screenshot({ path: `${SHOTS}wa1-${tag}-${name}.png` }); } catch (e) { /* optional */ } },
    async closeSheets() { for (let i = 0; i < 5 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } },
    async boot() {
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600);
      await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.evaluate(() => window.__store.dispatch('SetMatchMode', { mode: 'classic' })); // PR #60: new games start in Wheel match mode; these scripts drive the Classic flow
      const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await page.waitForTimeout(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await page.waitForTimeout(400); } }
    },
    /** Drive stages by command until stopAt (or a stage in the list). Returns the stage reached. */
    advance: (stopAt) => page.evaluate((stops) => {
      const S = window.__store; let g = 0; const want = [].concat(stops);
      while (!want.includes(S.get().stage) && g++ < 800) {
        const s = S.get(), d = (c, p) => S.dispatch(c, p), before = s;
        switch (s.stage) {
          case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
          case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
          case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
          case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (S.get().stage === 'plan') d('StartMatch'); break;
          case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
          case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
          case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
          default: return 'stuck:' + s.stage;
        }
        if (S.get() === before) return 'stuck-no-change:' + s.stage;
      }
      return S.get().stage;
    }, stopAt),
    /** Write a patched copy of the live state as the save (wrap + checksum), then reload. patch runs in the page: (s, mods) => void. */
    async inject(patchSrc) {
      await page.evaluate(async (src) => {
        const m = await import('/cricket-sixes/js/core/save-migrate.js'); const wm = await import('/cricket-sixes/js/data/wheelmeta.js');
        const s = structuredClone(window.__store.get()); (0, eval)('(' + src + ')')(s, { NODES: wm.NODES });
        localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
      }, patchSrc);
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600);
      await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.evaluate(() => window.__store.dispatch('SetMatchMode', { mode: 'classic' })); // PR #60: new games start in Wheel match mode; these scripts drive the Classic flow
    },
    /** Spin overlay (wheel-view / dial-view / reel-view): tap SPIN, tap STOP when it shows, wait for the result. Returns {ok, res, go}. */
    async spinToResult(ovSel = '.wh-ov') {
      const t0 = Date.now(); let clicked = 0;
      while (Date.now() - t0 < 16000) {
        const st = await page.evaluate((q) => {
          const ov = document.querySelector(q); if (!ov) return { gone: true };
          const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
          return { go: go ? go.textContent.trim() : '', dis: !go || go.getAttribute('aria-disabled') === 'true' || go.disabled, res: !!r && !r.hidden && getComputedStyle(r).display !== 'none' };
        }, ovSel);
        if (st.gone) return { ok: false, res: '', go: 'overlay gone' };
        if (st.res && /COLLECT|OK|DONE|NEXT/i.test(st.go)) return { ok: true, res: await H.text(`${ovSel} [data-res]`), go: st.go };
        if (!st.dis && /^(SPIN|STOP|GO|FLIP|TAP)/i.test(st.go)) { await page.click(`${ovSel} [data-go]`); clicked++; await page.waitForTimeout(st.go === 'STOP' ? 600 : 300); continue; }
        await page.waitForTimeout(150);
      }
      return { ok: false, res: await H.text(`${ovSel} [data-res]`), go: await H.text(`${ovSel} [data-go]`) + ` (taps ${clicked})` };
    },
    /** Tap COLLECT until the overlay closes. */
    async collect(ovSel = '.wh-ov') {
      for (let i = 0; i < 6 && (await page.$(ovSel)); i++) { const g = await page.$(`${ovSel} [data-go]:not([aria-disabled="true"])`); if (g) await g.click().catch(() => {}); await page.waitForTimeout(500); }
      return !(await page.$(ovSel));
    },
    tokens: (ovSel = '.wh-ov') => page.$$eval(`${ovSel} [data-tok] .wh-tk`, (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => ({ kind: b.getAttribute('data-kind'), label: b.textContent.trim() }))).catch(() => []),
  };
  return H;
}

/** Touch targets inside a scope: list those under min px (contract: >= 44). */
const smallTaps = (page, scope, min = 44) => page.evaluate(([q, m]) => {
  const root = document.querySelector(q); if (!root) return ['scope missing: ' + q];
  return [...root.querySelectorAll('button, [role="button"], a[href]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < m - 0.5 || r.height < m - 0.5); })
    .map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.className).trim().replace(/\s+/g, ' ').slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
}, [scope, min]);
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

const allErrs = [];
try {
  // ================================================================ A: plain new game
  const A = await open('A'); const p = A.page;
  await A.boot();
  step(0, 'app boots (store present)', !!(await A.stage()), `stage ${await A.stage()}`);
  // money for the course and the activity (a new game may be short); Nets left at its start level
  let st = await A.advance('train');
  step(1, 'reached the Training tab (stage train)', st === 'train', `stage ${st}`);
  await A.inject(`(s) => { s.econ.coins = 5000; }`);
  st = await A.stage(); if (st !== 'train') st = await A.advance('train');
  if (st === 'train') {
    const tip = await p.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await A.settle(200); }
    await A.shot('01-train');
    // ---- (1) coach strip
    const strip = await p.$('.ct-strip');
    step(1, 'coach strip shows on the Training tab', !!strip, 'no .ct-strip');
    const slots = await p.$$eval('.ct-strip .ct-slot', (ls) => ls.map((l) => ({ empty: l.classList.contains('ct-empty'), away: l.classList.contains('is-away'), picked: l.classList.contains('is-picked') }))).catch(() => []);
    step(1, 'strip has exactly 3 slots (coaches + empty)', slots.length === 3, `${slots.length} .ct-slot`);
    step(1, 'at least one coach slot filled', slots.some((x) => !x.empty), JSON.stringify(slots));
    if (strip) {
      const stripTop = await p.$eval('.ct-strip', (e) => e.getBoundingClientRect().top);
      step(1, 'strip sits above the fold (top < 638)', stripTop < VIEW.height, `top ${Math.round(stripTop)}`);
      const sm = await smallTaps(p, '.ct-strip'); step(1, 'strip taps >= 44 px', !sm.length, sm.join('; '));
      step(1, 'no horizontal scroll on Training', !(await hScroll(p)), 'horizontal scroll');
      const gradeOk = await p.$$eval('.ct-strip .ct-slot:not(.ct-empty) .ct-grade', (g) => g.length > 0 && g.every((x) => /^[A-FS][+-]?$/.test(x.textContent.trim()))).catch(() => false);
      step(1, 'coach cards show a letter grade', gradeOk, 'no .ct-grade letter');
    }
    // pick a coach (tap toggles; start from the store value)
    const pickBtn = await p.$('.ct-strip .ct-slot:not(.is-away):not(.ct-empty) [data-ct="pick"]:not([aria-disabled="true"])');
    step(1, 'a pickable coach card exists', !!pickBtn, 'no [data-ct=pick]');
    if (pickBtn) {
      const id = await pickBtn.getAttribute('data-id');
      const before = await A.S(() => { const t = window.__store.get().training || {}; return t.coach_id ?? (t.sel && t.sel.coachId) ?? (t.plan && t.plan.coachId) ?? null; });
      if (before === id) { await pickBtn.click(); await A.settle(300); } // was picked: tap off first
      await (await p.$(`.ct-strip [data-ct="pick"][data-id="${id}"]`)).click(); await A.settle(350);
      const after = await A.S(() => { const t = window.__store.get().training || {}; return t.coach_id ?? (t.sel && t.sel.coachId) ?? (t.plan && t.plan.coachId) ?? null; });
      step(1, 'tap a coach = picked in the store', after === id, `coachId ${before} -> ${after}, wanted ${id}`);
      const hl = await p.$eval(`.ct-strip [data-ct="pick"][data-id="${id}"]`, (b) => b.getAttribute('aria-pressed') === 'true' && b.closest('.ct-slot').classList.contains('is-picked')).catch(() => false);
      step(1, 'picked coach is highlighted (is-picked, aria-pressed)', hl, 'no highlight');
      await A.shot('02-coach-picked');
    }
    // ---- Scout list link
    const scout = await p.$('.ct-strip [data-ct="scout"]');
    step(1, 'Scout list button on the strip', !!scout, 'no [data-ct=scout]');
    if (scout) {
      await scout.click(); await A.settle(600);
      const sheet = await p.$('.c-sheet'), reel = await p.$('.wh-ov, .wh-ov');
      const sheetTxt = sheet ? await A.text('.c-sheet') : '';
      step(1, 'Scout list opens (sheet or scout reel)', !!sheet || !!reel, 'nothing opened');
      if (sheet) step(1, 'Scout sheet says Scout', /scout/i.test(sheetTxt), sheetTxt.slice(0, 80));
      await A.shot('03-scout');
      if (reel) { await A.spinToResult('.wh-ov, .wh-ov'); await A.collect('.wh-ov, .wh-ov'); }
      await A.closeSheets();
    }
    // ---- Send on course link (opens the Course big wheel; coach away 1 week after)
    const course = await p.$('.ct-strip [data-ct="course"]:not([aria-disabled="true"])');
    const courseAny = await p.$('.ct-strip [data-ct="course"]');
    step(1, 'Send on course button on a coach card', !!courseAny, 'no [data-ct=course]');
    if (!course && courseAny) step(1, 'Send on course enabled with 5000 Coins', false, (await courseAny.innerText()).replace(/\s+/g, ' '));
    if (course) {
      const cid = await course.getAttribute('data-id');
      await course.click(); await A.settle(400);
      const cfm = await p.$('.c-sheet [data-cf="yes"]'); // fixtrain: confirm sheet with the price first
      step(1, 'Send on course shows a confirm with the price', !!cfm && /Coins|Free/.test(await p.$eval('.c-sheet', (n) => n.textContent).catch(() => '')), 'no confirm sheet');
      if (cfm) { await cfm.click(); await A.settle(600); }
      const ov = await p.$('.wh-ov');
      step(1, 'Send on course opens the Course big wheel', !!ov, 'no .wh-ov after tap');
      if (ov) {
        await A.shot('04-course-wheel');
        const r = await A.spinToResult('.wh-ov');
        step(1, 'Course wheel resolves (result + COLLECT)', r.ok, `res "${r.res.slice(0, 60)}" go ${r.go}`);
        await A.collect('.wh-ov'); await A.closeSheets(); await A.settle(400);
        const away = await p.$eval(`.ct-strip [data-ct="pick"][data-id="${cid}"]`, (b) => b.closest('.ct-slot').classList.contains('is-away') && /Back next week/i.test(b.textContent)).catch(() => null);
        step(1, 'coach is greyed "Back next week" after the course', away === true, `away card ${away}`);
        await A.shot('05-after-course');
      }
    }
    // ---- (5) Nets level: the Training VM and the nets result read econ.fac.nets
    const nv = await A.S(async () => {
      const sel = await import('/cricket-sixes/js/store/selectors.js'); const s = window.__store.get();
      const at = (k) => { const x = structuredClone(s); x.econ.fac.nets = k; const v = sel.trainingVM(x); return v && v.nets ? v.nets : null; };
      return { now: s.econ && s.econ.fac ? s.econ.fac.nets : null, l0: at(0), l1: at(1), l5: at(5) };
    }).catch((e) => ({ err: String(e) }));
    step(5, 'trainingVM.nets level follows econ.fac.nets (0/1/5)', nv.l0 && nv.l0.level === 0 && nv.l1 && nv.l1.level === 1 && nv.l5 && nv.l5.level === 5, JSON.stringify(nv));
    step(5, 'Nets quality Q = 3 / 6 / 14 at L0 / L1 / L5', nv.l0 && nv.l0.q === 3 && nv.l1.q === 6 && nv.l5.q === 14, JSON.stringify(nv));
    // same seed, same plan: RunNets at L0 vs L5 gives a different (not worse) result
    const run = await A.S(async () => {
      const { createStore } = await import('/cricket-sixes/js/store/store.js'); const s0 = window.__store.get();
      const go = (k) => { const x = structuredClone(s0); x.econ.fac.nets = k; const st = createStore(x); st.dispatch('RunNets', {}); const t = st.get().training || {}; const n = t.nets || t.lastNets || null;
        const lines = (n && n.lines) || []; return { n: lines.length, sum: lines.reduce((a, l) => a + ((l.toRaw ?? 0) - (l.fromRaw ?? 0)), 0), sig: JSON.stringify(lines.map((l) => [l.toRaw, l.roll || l.band || l.q])) }; };
      return { l0: go(0), l5: go(5) };
    }).catch((e) => ({ err: String(e) }));
    step(5, 'RunNets at Nets L5 differs from L0 (same seed)', run.l0 && run.l5 && run.l0.n > 0 && run.l0.sig !== run.l5.sig, JSON.stringify(run).slice(0, 200));
    step(5, 'RunNets at Nets L5 gains >= L0', run.l0 && run.l5 && run.l5.sum >= run.l0.sum, JSON.stringify({ l0: run.l0 && run.l0.sum, l5: run.l5 && run.l5.sum }));
    // visible on screen: inject Nets L3 and look for the level on the Training tab or its help sheet
    await A.inject(`(s) => { s.econ.fac.nets = 3; }`); if ((await A.stage()) !== 'train') await A.advance('train');
    let tTxt = await A.text(); const help = await p.$('[data-act="sheet:traininghelp"]');
    if (help) { await help.click(); await A.settle(400); tTxt += '\n' + (await A.text('.c-sheet')); await A.closeSheets(); }
    const shown = /nets[^\n]{0,24}\b(L|level|lvl)\s*3\b|\b(L|level)\s*3[^\n]{0,12}nets/i.test(tTxt);
    if (shown) step(5, 'Nets level 3 shows on the Training tab / help', true); else note(5, 'Nets level not shown as text on the Training tab or help (VM only)', 'no "Nets ... L3" text');
    await A.shot('06-nets-l3');
  }

  // ---- (2) Find: activities sheet -> big wheel (wheel-view canvas, not the old reel)
  st = await A.advance('hub');
  step(2, 'reached the hub for the fan activity', st === 'hub', `stage ${st}`);
  if (st === 'hub') {
    await A.settle(400);
    const card = await p.$('[data-act="sheet:activities"]');
    step(2, 'fan activity card on the hub', !!card, 'no [data-act=sheet:activities]');
    if (card) {
      await card.click(); await A.settle(500);
      const opt = await p.$('.c-sheet [data-cl-pick]:not([data-cl-pick="rest"]):not([disabled]):not([aria-disabled="true"])');
      step(2, 'an activity option can be picked', !!opt, (await A.text('.c-sheet')).slice(0, 120));
      if (opt) {
        await opt.click(); await A.settle(300);
        const yes = await p.$('.c-sheet [data-cl-act="PickActivity"]:not([disabled])');
        step(2, '"Yes, do it" enabled', !!yes, 'disabled or missing');
        if (yes) {
          await yes.click(); await A.settle(700);
          const kind = await A.S(() => { const ov = document.querySelector('.wh-ov, .wh-ov'); if (!ov) return null; return { dr: ov.classList.contains('dr-ov'), cv: !!ov.querySelector('canvas.wh-cv'), reel: !!ov.querySelector('[class*="rl-"], .dr-reel, .rv-cell') }; });
          step(2, 'Find opens the big wheel (.wh-ov + canvas.wh-cv)', kind && !kind.dr && kind.cv, `overlay ${JSON.stringify(kind)}`);
          step(2, 'Find is not the old reel', kind && !kind.reel && !kind.dr, `overlay ${JSON.stringify(kind)}`);
          if (kind) {
            const goldLabels = await p.$$eval('.wh-ov .wh-lab, .wh-ov [class*="lab"]', (l) => l.length).catch(() => 0);
            note(2, 'Find wheel label elements', String(goldLabels));
            await A.shot('07-find-wheel');
            const sm = await smallTaps(p, '.wh-ov'); step(2, 'Find wheel taps >= 44 px', !sm.length, sm.join('; '));
            const t0 = Date.now(); const r = await A.spinToResult('.wh-ov');
            step(2, 'Find wheel resolves (result + COLLECT)', r.ok, `res "${r.res.slice(0, 60)}" go ${r.go}`);
            step(2, 'Find result says found or nothing', /found|nothing|no find|coins|player|coach/i.test(r.res), r.res.slice(0, 80));
            note(2, 'Find spin-to-result time ms', String(Date.now() - t0));
            const picked = await A.S(() => { const s = window.__store.get(); const h = s.econ && s.econ.act && s.econ.act.hist; return h && h[0] ? h[0].id : null; });
            step(2, 'PickActivity stored after the spin', !!picked && picked !== 'rest', `hist[0] ${picked}`);
            await A.shot('08-find-result');
            await A.collect('.wh-ov');
            const res = await p.$('.c-sheet .cl-result'); step(2, 'activity sheet shows the Done result', !!res, 'no .cl-result');
          }
        }
      }
      await A.closeSheets();
    }
  }

  // ---- (3) match day: Hype dial + Toss + Pep resolve (no tree)
  st = await A.advance('matchday');
  step(3, 'reached the match-day screen', st === 'matchday', `stage ${st}`);
  if (st === 'matchday') {
    await A.settle(500); await A.shot('09-md');
    for (const w of ['hype', 'toss', 'pep']) {
      const b = await p.$(`[data-md="${w}"]`); step(3, `${w}: tap button on match day`, !!b, `no [data-md=${w}]`); if (!b) continue;
      await b.click(); await A.settle(500);
      const ov = await p.$('.wh-ov'); step(3, `${w}: ring wheel overlay opens`, !!ov, 'no .wh-ov'); if (!ov) continue;
      if (w === 'hype') { const cv = await p.$('.wh-ov canvas.wh-cv'); step(3, 'hype: half-dial canvas', !!cv, 'no canvas.wh-cv'); }
      const r = await A.spinToResult('.wh-ov');
      step(3, `${w}: resolves (result + COLLECT)`, r.ok, `res "${r.res.slice(0, 60)}" go ${r.go}`);
      await A.shot(`10-md-${w}`);
      step(3, `${w}: overlay closes on COLLECT`, await A.collect('.wh-ov'), 'overlay still open');
    }
    const md = await A.S(() => { const f = window.__store.get().fixture || {}; const m = f.md || {}; return { hype: m.hype, toss: m.toss, pep: m.pepSlots || m.pepSlot || m.pepId || null }; });
    step(3, 'match day state has hype, toss, pep after the taps', md.hype != null && md.toss != null && md.pep != null, JSON.stringify(md));
    const go = await p.$('[data-act="MatchdayGo"]:not([disabled])'); step(3, 'Match day Go enabled after the 3 reveals', !!go, 'no enabled MatchdayGo');
    step(3, 'no horizontal scroll on match day', !(await hScroll(p)), 'horizontal scroll');
  }
  allErrs.push(...A.errs); await A.ctx.close();

  // ================================================================ B: seeded save, full tree + tokens
  const B = await open('B'); const q = B.page;
  await B.boot();
  st = await B.advance(['squad', 'matchday']);
  // full tree: every node at max rank (craft into wheelCraft), 3 tokens of each kind, no uses yet this season / match day
  await B.inject(`(s, { NODES }) => {
    const m = s.wheelMeta || (s.wheelMeta = {}); m.owned = m.owned || {}; s.wheelCraft = s.wheelCraft || { owned: {} };
    for (const n of NODES) { if (n.branch === 'craft') s.wheelCraft.owned[n.id] = n.max_rank; else m.owned[n.id] = n.max_rank; }
    m.tally = Math.max(m.tally || 0, 5000); m.tokens = { respin: 3, nudge: 3, two: 3, wild: 3, lift: 3 }; m.tokUsed = {}; m.matchTokUsed = { key: '', n: 0 }; m.spotTokensUsed = 0; m.tierUpQueue = [];
    s.econ.coins = Math.max(s.econ.coins || 0, 5000); }`);
  const owned = await B.S(() => { const m = window.__store.get().wheelMeta || {}; return { n: Object.keys(m.owned || {}).length, tok: m.tokens }; });
  step(4, 'seeded save loads with the full tree + tokens', owned.n > 10 && owned.tok && owned.tok.respin === 3, JSON.stringify(owned));
  st = await B.advance('matchday');
  step(4, 'tree save reaches match day', st === 'matchday', `stage ${st}`);
  if (st === 'matchday') {
    await B.settle(500);
    let used = null; const seen = {};
    for (const w of ['hype', 'toss', 'pep']) {
      const b = await q.$(`[data-md="${w}"]`); if (!b) { step(4, `${w}: tap button`, false, 'missing'); continue; }
      await b.click(); await B.settle(500);
      if (!(await q.$('.wh-ov'))) { step(4, `${w}: overlay opens`, false, 'no .wh-ov'); continue; }
      const r = await B.spinToResult('.wh-ov');
      step(4, `${w}: resolves with the full tree`, r.ok, `res "${r.res.slice(0, 60)}" go ${r.go}`);
      const toks = await B.tokens('.wh-ov'); seen[w] = { res: r.res.replace(/\s+/g, ' ').slice(0, 50), toks: toks.map((t) => t.label) };
      const noteTxt = await B.text('.wh-ov .wh-tknote').catch(() => '');
      if (noteTxt) seen[w].note = noteTxt;
      if (!used && toks.length) {
        await B.shot(`11-${w}-offer`);
        const pick = toks.find((t) => t.kind === 'lift') || toks[0];
        const before = await B.S(() => { const m = window.__store.get().wheelMeta; return { mt: m.matchTokUsed, tu: m.tokUsed, tok: m.tokens }; });
        await q.click(`.wh-ov [data-tok] .wh-tk[data-kind="${pick.kind}"]`); await B.settle(400);
        await q.waitForFunction(() => { const o = document.querySelector('.wh-ov [data-out]'); return o && o.textContent.trim(); }, null, { timeout: 8000 }).catch(() => {});
        const out = (await B.text('.wh-ov [data-out]').catch(() => '')).trim();
        step(4, `${w}: using ${pick.label} shows an outcome line`, !!out, 'no [data-out] text');
        const after = await B.S(() => { const m = window.__store.get().wheelMeta; return { mt: m.matchTokUsed, tu: m.tokUsed, tok: m.tokens }; });
        step(4, `${w}: token spent in the store (matchTokUsed.n 1, tokUsed.${w} 1)`, after.mt && after.mt.n === 1 && after.tu && after.tu[w] === 1, JSON.stringify({ before, after }));
        const left = await B.tokens('.wh-ov'); step(4, `${w}: no more token buttons after the 1 match-day use`, left.length === 0, left.map((t) => t.label).join(', '));
        used = { w, kind: pick.kind, out };
        await B.shot(`12-${w}-used`);
        const r2 = await B.text('.wh-ov [data-res]'); step(4, `${w}: result still shown after the token`, !!r2.trim(), 'empty result');
      } else if (used) {
        step(4, `${w}: no token offer after 1 used this match day`, toks.length === 0, toks.map((t) => t.label).join(', '));
      }
      await B.collect('.wh-ov');
    }
    step(4, 'a token offer appeared on Hype, Toss or Pep', !!used, `offers ${JSON.stringify(seen)}`);
    note(4, 'offers seen', JSON.stringify(seen).slice(0, 300));
    // the kept result reaches the match
    const md = await B.S(() => { const f = window.__store.get().fixture || {}; const m = f.md || {}; return { hype: m.hype, hypePerf: m.hypePerf, tossBoost: m.tossBoost, wm: m.wm ? Object.keys(m.wm) : null }; });
    note(4, 'md after tokens', JSON.stringify(md));
    const mt = await B.S(() => window.__store.get().wheelMeta.matchTokUsed);
    step(4, 'at most 1 token this match day (store)', mt && mt.n <= 1, JSON.stringify(mt));
    // still 1 after Go and the next match day starts at 0 uses
    const go = await q.$('[data-act="MatchdayGo"]:not([disabled])'); if (go) { await go.click(); await B.settle(400); }
    st = await B.advance('matchday');
    if (st === 'matchday') {
      await B.settle(400);
      const b = await q.$('[data-md="hype"]'); if (b) { await b.click(); await B.settle(500); const r = await B.spinToResult('.wh-ov'); const toks = await B.tokens('.wh-ov');
        const pts = await B.S(() => { const f = window.__store.get().fixture || {}; return f.md && f.md.wm && f.md.wm.hype ? f.md.wm.hype : null; });
        note(4, 'next match day: hype offer', `${r.ok ? 'resolved' : 'not resolved'}; tokens [${toks.map((t) => t.label).join(', ')}]; ${JSON.stringify(pts)}`);
        await B.collect('.wh-ov'); }
    }
  }
  allErrs.push(...B.errs); await B.ctx.close();
} catch (e) {
  step(0, 'script ran without throwing', false, e.stack || String(e));
} finally { await browser.close(); server.close(); }

for (const e of allErrs) step(6, 'no console/page errors, no network', false, e);
if (!allErrs.length) step(6, 'no console/page errors, no network', true);

const names = { 0: 'harness', 1: 'training coach strip', 2: 'find big wheel', 3: 'match day plain', 4: 'tokens (full tree)', 5: 'nets level', 6: 'errors' };
let bad = 0;
console.log(`wa1-flow ${VIEW.width}x${VIEW.height} seed ${SEED}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.note ? 'NOTE' : r.ok ? 'PASS' : 'FAIL'} [${r.n} ${names[r.n]}] ${r.name}${r.note ? ': ' + r.why : r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length} checks` : `PASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
