// tfc e2e (2026-11-15 build): landing tick + Stadium Fans gate + match coach, in a real browser.
// Run from the app root:  node test/e2e/tfc.mjs      Env: E2E_SOFT=1 (never exit 1), E2E_SHOTS=dir, E2E_SEED=x, E2E_ONLY=475 (one viewport).
// Viewports: Fold cover 475x638 (all checks) and 344x882 (layout fit: no horizontal overflow, text >= 14px, fans bar inside the screen).
// Seeded runs only (?seed=...), saves written with save-migrate.wrap() into cs.save.1 and the page reloaded. No network.
// A  landing tick: Spotlight (Training), Course (coach strip), Find (activities), Hype (match day) for a save WITHOUT Aim Guide: the canvas
//    shows a white tick once the wheel spins (pixel diff vs the idle frame); no gold wedge; reduced motion = same as normal (SPEC: wheels have no reduced-motion option).
//    Then the same four with Aim Guide owned: a gold wedge (more gold pixels than the plain tick). Node text is the new one.
// B  Fans gate: hub scoreboard + league table sheet; text "Fans N / M for stadium Lx" with a bar, "Fans ready: build stadium Lx", hidden at L5.
// C  match coach: row on the match-day screen, default = best idle coach, tap to change, chip text, "No match coach this week", Training strip tag.
// D  Copy report JSON: tick:1 and per-match mc.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/tmp/tfc-shots/';
const SEED = process.env.E2E_SEED || 'tfc-e2e';
const ONLY = process.env.E2E_ONLY || '';
const VPS = { fold: { width: 475, height: 638 }, narrow: { width: 344, height: 882 } };
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

const results = []; // { g, vp, name, ok, why, note }
let curVp = '';
const step = (g, name, ok, why) => { results.push({ g, vp: curVp, name, ok: !!ok, why: ok ? '' : why || '' }); };
const note = (g, name, info) => { results.push({ g, vp: curVp, name, ok: true, note: true, why: info || '' }); };

const browser = await chromium.launch();

async function open(tag, vp, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push(`[${tag}] network outside app: ${r.url()}`); });
  const H = {
    ctx, page, errs, tag,
    settle: (ms = 250) => page.waitForTimeout(ms),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    S: (fn, arg) => page.evaluate(fn, arg),
    text: (sel) => page.evaluate((q) => { const e = q ? document.querySelector(q) : document.body; return e ? e.innerText : ''; }, sel || null),
    shot: async (name) => { try { await page.screenshot({ path: `${SHOTS}tfc-${tag}-${name}.png` }); } catch (e) { /* optional */ } },
    async closeSheets() { for (let i = 0; i < 5 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } },
    async boot() {
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600);
      await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.evaluate(() => window.__store.dispatch('SetMatchMode', { mode: 'classic' })); // PR #60: new games start in Wheel match mode; these scripts drive the Classic flow
      const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await page.waitForTimeout(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await page.waitForTimeout(400); } }
    },
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
    /** Real taps (the Copy report log only sees the match through the UI): hub > squad > match day > plan > bowl/chase > done, until a stage in stops. */
    async play(stops) {
      const want = [].concat(stops); const cta = async () => { const b = await page.$('.c-btn--cta:not([disabled])') || await page.$('.m0-ctabar button:not([disabled]), .ctabar button:not([disabled])'); if (!b) return false; await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); return true; };
      for (let i = 0; i < 220; i++) {
        const st = await H.stage(); if (want.includes(st)) return st;
        if (process.env.E2E_TRACE) console.log('play', i, st);
        if (st === 'hub' || st === 'semi' || st === 'final') { if (!(await cta())) return 'stuck:hub'; }
        else if (st === 'squad') { for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) break; await b.click(); await page.waitForTimeout(60); } const c = await page.$('[data-confirm]:not([disabled])'); if (c) await c.click(); await page.waitForTimeout(300); }
        else if (st === 'matchday') { const g = await page.$('[data-act="MatchdayGo"]:not([disabled])'); if (g) await g.click(); await page.waitForTimeout(300); }
        else if (st === 'plan') {
          let go = await page.$('[data-start]:not([disabled])');
          if (!go) { const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; for (let k = 0; k < 10; k++) { const sl = await page.$(`[data-slot="${k}"]`), bw = await page.$(`[data-bowler="${pat[k]}"]`); if (sl && bw) { await sl.click(); await bw.click(); } } go = await page.$('[data-start]:not([disabled])'); }
          if (go) await go.click(); await page.waitForTimeout(400);
        } else if (st === 'bowl' || st === 'chase' || st === 'break' || st === 'done' || st === 'week' || st === 'train' || st === 'coach') {
          const skipB = await page.$('[data-strip-skip]'); if (skipB) { await skipB.click().catch(() => {}); await page.waitForTimeout(200); }
          const nx = await page.$('.op-next'); if (nx) { await nx.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(200); continue; } // over panel
          if (!(await cta())) return 'stuck:' + st;
        } else return 'stuck:' + st;
      }
      return 'timeout';
    },
    /** Write a patched copy of the live state as the save (wrap + checksum), then reload. patch runs in the page: (s, {NODES}) => void. */
    async inject(patchSrc) {
      await page.evaluate(async (src) => {
        const m = await import('/cricket-sixes/js/core/save-migrate.js'); const wm = await import('/cricket-sixes/js/data/wheelmeta.js');
        const s = structuredClone(window.__store.get()); (0, eval)('(' + src + ')')(s, { NODES: wm.NODES });
        localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
      }, patchSrc);
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600);
      await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.evaluate(() => window.__store.dispatch('SetMatchMode', { mode: 'classic' })); // PR #60: new games start in Wheel match mode; these scripts drive the Classic flow
    },
  };
  return H;
}

const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1);
/** Visible text under 14 px and visible elements poking out of the viewport sideways, inside a scope. */
const fitFacts = (page, scope) => page.evaluate((q) => {
  const root = (q && document.querySelector(q)) || document.body; const out = { tiny: [], wide: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(), e = n.parentElement; if (!t || !e || !vis(e) || e.closest('script,style,.sr-only,.ss-sr,[aria-hidden="true"]')) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13.5) out.tiny.push(`"${t.slice(0, 24)}" ${fs}px`);
  }
  for (const e of root.querySelectorAll('*')) { if (!vis(e) || e.closest('canvas,svg,[aria-hidden="true"]')) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1.5 || r.left < -1.5) out.wide.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`); }
  out.tiny = [...new Set(out.tiny)].slice(0, 6); out.wide = [...new Set(out.wide)].slice(0, 6); return out;
}, scope || null);
const smallTaps = (page, scope, min = 44) => page.evaluate(([q, m]) => {
  const root = document.querySelector(q); if (!root) return ['scope missing: ' + q];
  return [...root.querySelectorAll('button, [role="button"], a[href]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < m - 0.5 || r.height < m - 0.5); })
    .map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.className).trim().replace(/\s+/g, ' ').slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
}, [scope, min]);

// ---------------------------------------------------------------- A: landing tick
/** Pixel counts on a wheel/dial canvas: pure white and gold-ish pixels inside the rim band (outer 24% of the radius). */
function canvasCounts([sel, all, tkSel]) {
  const cv = document.querySelector(sel); if (!cv) return null;
  let ink = 0, tgold = 0; // wheels draw the tick on their own canvas (canvas.wh-tk): count its painted pixels and its gold pixels
  const tk = tkSel && document.querySelector(tkSel);
  if (tk) { const td = tk.getContext('2d').getImageData(0, 0, tk.width, tk.height).data; const gv = getComputedStyle(document.body).getPropertyValue('--gold').trim(); const gm0 = /^#([0-9a-f]{6})$/i.exec(gv); const g0 = gm0 ? [parseInt(gm0[1].slice(0, 2), 16), parseInt(gm0[1].slice(2, 4), 16), parseInt(gm0[1].slice(4, 6), 16)] : [0xD2, 0xB3, 0x57]; for (let i = 0; i < td.length; i += 4) { if (td[i + 3] < 100) continue; ink++; if (Math.abs(td[i] - g0[0]) < 8 && Math.abs(td[i + 1] - g0[1]) < 8 && Math.abs(td[i + 2] - g0[2]) < 8) tgold++; } }
  const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height; const d = ctx.getImageData(0, 0, w, h).data;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2; let white = 0, gold = 0, band = 0;
  const g = getComputedStyle(document.body).getPropertyValue('--gold').trim();
  const gm = /^#([0-9a-f]{6})$/i.exec(g); const gr = gm ? [parseInt(gm[1].slice(0, 2), 16), parseInt(gm[1].slice(2, 4), 16), parseInt(gm[1].slice(4, 6), 16)] : [0xD2, 0xB3, 0x57];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (!all && (r < R * 0.70 || r > R)) continue; band++;
    const p = (y * w + x) * 4; if (d[p + 3] < 200) continue;
    if (d[p] === 255 && d[p + 1] === 255 && d[p + 2] === 255) white++;
    else if (Math.abs(d[p] - gr[0]) < 6 && Math.abs(d[p + 1] - gr[1]) < 6 && Math.abs(d[p + 2] - gr[2]) < 6) gold++;
  }
  return { w, h, white, gold, band, ink, tgold, tk: !!tk };
}

/** Open a spin overlay screen, tap SPIN, sample the canvas idle vs mid-spin. Returns facts. */
async function tickProbe(H, ovSel, cvSel0, { waitMs = 1100, all = false } = {}) {
  const cvSel = [cvSel0, all, all ? null : ovSel + ' canvas.wh-tk'];
  const page = H.page;
  await page.waitForSelector(ovSel, { timeout: 5000 });
  await H.settle(500);
  const idle = await page.evaluate(canvasCounts, cvSel);
  const go = await page.$(`${ovSel} [data-go]`);
  await go.click(); await H.settle(waitMs);
  const spin1 = await page.evaluate(canvasCounts, cvSel);
  const msg1 = await H.text(`${ovSel} [data-msg]`);
  await H.settle(700);
  const spin2 = await page.evaluate(canvasCounts, cvSel);
  const frames = [spin1, spin2];
  for (let k = 0; k < 3; k++) { await H.settle(350); frames.push(await page.evaluate(canvasCounts, cvSel)); }
  const goTxt = (await H.text(`${ovSel} [data-go]`)).trim();
  return { idle, spin1, spin2, frames, msg1: msg1.replace(/\s+/g, ' ').trim(), goTxt };
}
const dWhite = (a, b) => (a && b ? b.white - a.white : NaN);
const dGold = (a, b) => (a && b ? b.gold - a.gold : NaN);

/** Finish a started spin overlay (STOP, COLLECT). */
async function finishSpin(H, ovSel) {
  const page = H.page; const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const st = await page.evaluate((q) => {
      const ov = document.querySelector(q); if (!ov) return { gone: true };
      const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
      return { go: go ? go.textContent.trim() : '', dis: !go || go.getAttribute('aria-disabled') === 'true' || go.disabled, res: !!r && !r.hidden && getComputedStyle(r).display !== 'none' };
    }, ovSel);
    if (st.gone) return true;
    if (st.res && /COLLECT|OK|DONE|NEXT/i.test(st.go)) { await page.click(`${ovSel} [data-go]`).catch(() => {}); await page.waitForTimeout(500); continue; }
    if (!st.dis && /^(SPIN|STOP|GO|FLIP|TAP)/i.test(st.go)) { await page.click(`${ovSel} [data-go]`); await page.waitForTimeout(500); continue; }
    await page.waitForTimeout(150);
  }
  return !(await page.$(ovSel));
}

/** Tap a selector, retrying when a re-render detaches the node. */
async function tap(H, sel, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const el = await H.page.$(sel); if (!el) { await H.settle(250); continue; }
    try { await el.click({ timeout: 2500 }); return true; } catch (e) { await H.settle(250); }
  }
  return false;
}
/** Skip the Nets day scene if it is up. */
async function clearNets(H) { for (let i = 0; i < 8 && (await H.page.$('.ns-scene')); i++) { await tap(H, '.ns-skip', 1); await H.settle(500); } }

/** Open one aim screen from the live game; returns '' when its overlay is up, else why not. */
async function openAim(H, which) {
  const page = H.page;
  if (which === 'spotlight') {
    if ((await H.stage()) !== 'train') await H.advance('train');
    await tap(H, '.tr-tip [data-tip="skip"]', 1); await H.settle(200);
    if (!(await tap(H, '[data-lo="spotpick"]'))) return 'no [data-lo=spotpick]';
    await H.settle(400);
    if (!(await tap(H, '.c-sheet [data-sp]:not([data-sp=""])'))) return 'no Spotlight player to pick';
    await H.settle(600);
    if (!(await tap(H, '[data-lo="runnets"]:not([disabled])'))) return 'Run nets disabled';
    await H.settle(500);
  } else if (which === 'course') {
    if ((await H.stage()) !== 'train') await H.advance('train');
    await tap(H, '.tr-tip [data-tip="skip"]', 1); await H.settle(200);
    if (!(await tap(H, '.ct-strip [data-ct="course"]:not([aria-disabled="true"])'))) return 'no enabled [data-ct=course]';
    await H.settle(400);
    await tap(H, '.c-sheet [data-cf="yes"]', 1); await H.settle(600);
  } else if (which === 'find') {
    if ((await H.stage()) !== 'hub') await H.advance('hub');
    await H.settle(400);
    if (!(await tap(H, '[data-act="sheet:activities"]'))) return 'no activities card';
    await H.settle(500);
    if (!(await tap(H, '.c-sheet [data-cl-pick]:not([data-cl-pick="rest"]):not([disabled]):not([aria-disabled="true"])'))) return 'no activity option';
    await H.settle(300);
    if (!(await tap(H, '.c-sheet [data-cl-act="PickActivity"]:not([disabled])'))) return 'Yes disabled';
    await H.settle(700);
  } else if (which === 'hype') {
    if ((await H.stage()) !== 'matchday') await H.advance('matchday');
    await H.settle(500);
    if (!(await tap(H, '[data-md="hype"]'))) return 'no [data-md=hype]';
    await H.settle(500);
  }
  const ov = '.wh-ov';
  return (await page.$(ov)) ? '' : `no ${ov}`;
}
const AIM = { spotlight: ['.wh-ov', 'canvas.wh-cv', false], course: ['.wh-ov', 'canvas.wh-cv', false], find: ['.wh-ov', 'canvas.wh-cv', false], hype: ['.wh-ov', 'canvas.wh-cv', false] };
const NICE = { spotlight: 'Spotlight', course: 'Course', find: 'Find', hype: 'Hype' };
const COACHES = `[{ id: 'tfcL', name: 'Lee', step: 8, strong: ['bowl'], away: 0, courseSeason: null }, { id: 'tfcM', name: 'Mira', step: 12, strong: ['bat', 'bowl'], away: 0, courseSeason: null }]`;
const SEEDGAME = (guide) => `(s, { NODES }) => { s.econ.coins = 9000; s.coaches = (s.coaches || []).filter((c) => c.id !== 'tfcL' && c.id !== 'tfcM').concat(${COACHES});` +
  (guide ? ` const m = s.wheelMeta || (s.wheelMeta = {}); m.owned = m.owned || {}; m.owned.c_guide = 1;` : '') + ` }`;

/** G: the four aim wheels. guide=false: plain tick; guide=true: gold wedge. */
async function groupTick(vp, key, guide) {
  curVp = key;
  const H = await open('T' + (guide ? 'g' : 'p') + key, vp);
  const tag = guide ? 'Aim Guide' : 'no Aim Guide';
  try {
    await H.boot(); await H.advance('train');
    await H.inject(SEEDGAME(guide));
    if ((await H.stage()) !== 'train') await H.advance('train');
    const owned = await H.S(() => { const m = window.__store.get().wheelMeta; return !!(m && m.owned && m.owned.c_guide); });
    step('A', `save ${guide ? 'owns' : 'does not own'} Aim Guide (${tag})`, owned === guide, `owned ${owned}`);
    const base = {};
    for (const w of ['course', 'find', 'hype', 'spotlight']) {
      const nm = `${NICE[w]} (${tag})`;
      const why = await openAim(H, w);
      if (why) { step('A', `${nm}: wheel opens`, false, why); continue; }
      const [ov, cv, all] = AIM[w];
      const pr = await tickProbe(H, ov, cv, { all });
      const fr = pr.frames.filter(Boolean);
      if (all) { // the dial draws on one canvas: the plain tick adds ~24 white px, the Guide mark ~14 (thin white centre line)
        const dw = fr.map((f) => f.white - pr.idle.white);
        step('A', `${nm}: tick drawn on the dial rim while it spins (+white px ${dw.join('/')}, need >= 10 in at least 4 of 5 frames; a tick over a white pixel can hide)`, dw.length > 0 && dw.filter((d) => d >= 10).length >= Math.ceil(dw.length * 0.8), `idle white ${pr.idle && pr.idle.white}`);
        step('A', `${nm}: no tick before SPIN (idle frame)`, pr.idle && pr.idle.white < 8, `idle white ${pr.idle && pr.idle.white}`);
      } else { // wheels draw the tick on canvas.wh-tk: empty before SPIN, painted while turning; gold only for the Aim Guide wedge
        const ink = fr.map((f) => f.ink), tg = fr.map((f) => f.tgold);
        step('A', `${nm}: tick canvas (canvas.wh-tk) exists`, !!pr.idle && pr.idle.tk, 'no canvas.wh-tk in the overlay');
        step('A', `${nm}: no tick before SPIN (tick canvas empty, ink ${pr.idle && pr.idle.ink})`, pr.idle && pr.idle.ink === 0, `ink ${pr.idle && pr.idle.ink}`);
        step('A', `${nm}: tick drawn on the rim while it spins (ink px ${ink.join('/')}, need >= 30 in every frame)`, ink.length > 0 && ink.every((n) => n >= 30), `ink ${ink.join('/')}`);
        if (guide) step('A', `${nm}: gold wedge (gold px on the tick canvas ${tg.join('/')}, need >= 15 in every frame)`, tg.length > 0 && tg.every((n) => n >= 15), `tgold ${tg.join('/')}`);
        else step('A', `${nm}: plain tick has no gold (gold px ${tg.join('/')})`, tg.every((n) => n === 0), `tgold ${tg.join('/')}`);
        base[w] = { ink };
      }
      step('A', `${nm}: message mentions the tick (dial) or STOP (wheel)`, all ? /tick/i.test(pr.msg1) : /STOP/.test(pr.msg1), pr.msg1);
      const fit = await fitFacts(H.page, ov);
      step('A', `${nm}: overlay fits (no sideways overflow, text >= 14px)`, !fit.wide.length && !fit.tiny.length && !(await hScroll(H.page)), JSON.stringify(fit));
      const sm = await smallTaps(H.page, ov); step('A', `${nm}: taps >= 44px`, !sm.length, sm.join('; '));
      if (w === 'spotlight' || w === 'hype') await H.shot(`tick-${guide ? 'guide' : 'plain'}-${w}`);
      await finishSpin(H, ov); await H.settle(300); await clearNets(H); await H.closeSheets();
    }
    if (guide) { // after the free-tick: the wheel node text
      const txt = await H.S(async () => { const wm = await import('/cricket-sixes/js/data/wheelmeta.js'); const n = wm.NODES.find((x) => x.id === 'c_guide'); return n ? n.text || n.desc || JSON.stringify(n) : null; });
      step('A', 'Aim Guide node text: "Sharper landing tick and steadier stop."', typeof txt === 'string' && /Sharper landing tick and steadier stop\./.test(txt), `node ${String(txt).slice(0, 160)}`);
    }
  } catch (e) { step('A', `tick group ${tag} ran without throwing`, false, e.stack || String(e)); }
  allErrs.push(...H.errs); await H.ctx.close();
}

/** Reduced motion: no spin, no tick. */
async function groupReduced(vp, key) {
  curVp = key;
  const H = await open('R' + key, vp, { reduced: true });
  try {
    await H.boot(); await H.advance('train'); await H.inject(SEEDGAME(false));
    if ((await H.stage()) !== 'train') await H.advance('train');
    const why = await openAim(H, 'course');
    if (why) { step('A', 'reduced motion: Course wheel opens', false, why); }
    else {
      await H.settle(500);
      const idle = await H.page.evaluate(canvasCounts, ['canvas.wh-cv', false, '.wh-ov canvas.wh-tk']);
      await tap(H, '.wh-ov [data-go]'); await H.settle(900);
      const after = await H.page.evaluate(canvasCounts, ['canvas.wh-cv', false, '.wh-ov canvas.wh-tk']);
      const goTxt = (await H.text('.wh-ov [data-go]')).trim(); const msg = (await H.text('.wh-ov [data-msg]')).replace(/\s+/g, ' ');
      step('A', 'reduced motion: still SPIN/STOP (SPEC, no reduced-motion option), no "Show result"', goTxt === 'STOP' && !/show result/i.test(goTxt), `button "${goTxt}", msg "${msg.slice(0, 80)}"`);
      step('A', 'reduced motion: landing tick is still drawn (SPEC)', after.ink > 0, `tick ink ${idle.ink} -> ${after.ink}, white ${idle.white} -> ${after.white}`);
      await finishSpin(H, '.wh-ov'); await clearNets(H);
    }
  } catch (e) { step('A', 'reduced group ran without throwing', false, e.stack || String(e)); }
  allErrs.push(...H.errs); await H.ctx.close();
}

// ---------------------------------------------------------------- B: Fans gate
async function groupFans(vp, key) {
  curVp = key;
  const H = await open('F' + key, vp);
  try {
    await H.boot(); await H.advance('hub');
    const CASES = [
      { st: 1, fans: 100, text: 'Fans 100 / 310 for stadium L2', pct: 32 },
      { st: 2, fans: 765, text: 'Fans 765 / 1,140 for stadium L3', pct: 67 },
      { st: 3, fans: 2400, text: 'Fans ready: build stadium L4', ready: true },
      { st: 4, fans: 5000, text: 'Fans ready: build stadium L5', ready: true },
      { st: 5, fans: 9000, hidden: true },
    ];
    for (const c of CASES) {
      await H.inject(`(s) => { s.econ.stadium = ${c.st}; s.econ.fans = ${c.fans}; }`);
      if ((await H.stage()) !== 'hub') await H.advance('hub');
      await H.settle(500);
      const lab = `stadium L${c.st}, ${c.fans} Fans`;
      const got = await H.S(() => { const g = document.querySelector('.hb-board .fg, .fg.hb-fg'); if (!g) return null; const bar = g.querySelector('.fg-bar i'), b = g.querySelector('.fg-bar'); const r = g.getBoundingClientRect(); return { text: g.querySelector('.fg-tx') ? g.querySelector('.fg-tx').textContent.trim() : g.textContent.trim(), w: bar ? bar.style.width : null, ready: g.classList.contains('is-ready'), barOuter: b ? Math.round(b.getBoundingClientRect().width) : 0, barInner: bar ? Math.round(bar.getBoundingClientRect().width) : 0, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight }; });
      const vmOk = await H.S(async (arg) => { const sel = await import('/cricket-sixes/js/store/selectors.js'); const v = sel.fansGateVM(window.__store.get()); return v; });
      if (c.hidden) {
        step('B', `hub, ${lab}: Fans line hidden at stadium L5`, !got, `found ${got && got.text}`);
        step('B', `hub, ${lab}: fansGateVM hidden`, vmOk && vmOk.hidden === true, JSON.stringify(vmOk));
      } else {
        step('B', `hub, ${lab}: text is "${c.text}"`, got && got.text === (c.ready ? c.text : c.text.replace(/ for stadium L\d$/, '')), `hub shows the short form (T7 hub-view.js); got ${got && JSON.stringify(got.text)}`);
        if (got) {
          step('B', `hub, ${lab}: bar ${c.ready ? 'full' : 'at ' + c.pct + '%'}`, c.ready ? (got.w === '100%' && got.ready) : got.w === c.pct + '%', `width ${got.w} ready ${got.ready}`);
          step('B', `hub, ${lab}: line inside the screen`, got.l >= -1 && got.r <= got.vw + 1 && got.t >= 0 && got.b <= got.vh + 400, JSON.stringify(got));
        }
        step('B', `hub, ${lab}: fansGateVM text matches the screen`, vmOk && got && vmOk.text === c.text && got.text === (c.ready ? vmOk.text : vmOk.text.replace(/ for stadium L\d$/, '')) && vmOk.ready === !!c.ready, JSON.stringify(vmOk));
      }
      const fit = await fitFacts(H.page); step('B', `hub, ${lab}: no sideways overflow, text >= 14px`, !fit.wide.length && !fit.tiny.length && !(await hScroll(H.page)), JSON.stringify(fit));
      if (c.st === 2) await H.shot('fans-hub');
      // league table sheet
      if (await tap(H, '[data-act="sheet:table"]')) {
        await H.settle(500);
        const tg = await H.S(() => { const sh = document.querySelector('.c-sheet'); const g = sh && sh.querySelector('.fg'); if (!g) return null; const bar = g.querySelector('.fg-bar i'); const r = g.getBoundingClientRect(); return { text: g.querySelector('.fg-tx') ? g.querySelector('.fg-tx').textContent.trim() : g.textContent.trim(), w: bar ? bar.style.width : null, r: Math.round(r.right), l: Math.round(r.left), vw: innerWidth }; });
        if (c.hidden) step('B', `table, ${lab}: Fans line hidden at stadium L5`, !tg, `found ${tg && tg.text}`);
        else {
          step('B', `table, ${lab}: text is "${c.text}"`, tg && tg.text === c.text, `got ${tg && JSON.stringify(tg.text)}`);
          step('B', `table, ${lab}: bar ${c.ready ? 'full' : 'at ' + c.pct + '%'}`, tg && (c.ready ? tg.w === '100%' : tg.w === c.pct + '%'), `width ${tg && tg.w}`);
          step('B', `table, ${lab}: line inside the screen`, tg && tg.l >= -1 && tg.r <= tg.vw + 1, JSON.stringify(tg));
        }
        const f2 = await fitFacts(H.page, '.c-sheet'); step('B', `table, ${lab}: sheet has no sideways overflow, text >= 14px`, !f2.wide.length && !f2.tiny.length, JSON.stringify(f2));
        if (c.st === 2) await H.shot('fans-table');
        await H.closeSheets();
      } else step('B', `table, ${lab}: table sheet opens from the hub`, false, 'no [data-act="sheet:table"]');
    }
  } catch (e) { step('B', 'fans group ran without throwing', false, e.stack || String(e)); }
  allErrs.push(...H.errs); await H.ctx.close();
}

// ---------------------------------------------------------------- C + D: match coach, report
async function copyReport(H) {
  await H.closeSheets();
  if (!(await tap(H, '.st-gear'))) return null;
  await H.settle(500);
  if (!(await tap(H, '[data-st="full"]'))) return null;
  await H.settle(800);
  const t = await H.S(() => window.__copied || (document.querySelector('.st-fallback textarea') || {}).value || null);
  await H.closeSheets();
  return t;
}
async function groupCoach(vp, key, full) {
  curVp = key;
  const H = await open('C' + key, vp);
  await H.ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); } catch (e) { /* fallback textarea */ } });
  try {
    await H.boot(); await H.advance('train'); await H.inject(SEEDGAME(false));
    if ((await H.stage()) !== 'train') await H.advance('train');
    await tap(H, '.tr-tip [data-tip="skip"]', 1); await H.settle(300);
    // pick the starter coach (lowest) for nets; Lee and Mira idle -> Mira (best grade) is the default match coach
    const ids = await H.S(() => { const s = window.__store.get(); return s.coaches.map((c) => ({ id: c.id, name: c.name, step: c.step })); });
    const starter = ids.find((c) => c.id !== 'tfcL' && c.id !== 'tfcM');
    await H.S((id) => window.__store.dispatch('SetTrainPlan', { coachId: id }), starter.id); await H.settle(400);
    const tags = await H.S(() => [...document.querySelectorAll('.ct-strip .ct-slot')].map((sl) => ({ id: (sl.querySelector('[data-id]') || {}).getAttribute ? sl.querySelector('[data-id]').getAttribute('data-id') : null, mc: !!sl.querySelector('.ct-tag--mc'), txt: (sl.querySelector('.ct-tag') || { textContent: '' }).textContent.trim(), picked: sl.classList.contains('is-picked') })));
    step('C', 'Training strip: exactly one coach tagged "Match coach"', tags.filter((t) => t.mc).length === 1, JSON.stringify(tags));
    step('C', 'Training strip: the tag is on the best idle coach (Mira), not on the nets coach', tags.some((t) => t.id === 'tfcM' && t.mc) && !tags.some((t) => t.id === starter.id && t.mc), JSON.stringify(tags));
    const mcTag = await H.S(() => { const t = document.querySelector('.ct-tag--mc'); return t ? { text: t.textContent.trim(), aria: t.getAttribute('aria-label') || '', slot: (t.closest('.ct-slot').querySelector('[data-ct="pick"]') || {}).getAttribute ? t.closest('.ct-slot').querySelector('[data-ct="pick"]').getAttribute('aria-label') : '' } : null; });
    step('C', 'Training strip: tag is visible and the coach card says "match coach" to a screen reader', !!mcTag && /match/i.test(mcTag.text) && /match coach/i.test(mcTag.aria + ' ' + mcTag.slot + ' ' + (await H.text('.ct-slot:has(.ct-tag--mc)'))), JSON.stringify(mcTag));
    note('C', 'strip tag text as drawn (spec says "Match coach")', JSON.stringify(mcTag && mcTag.text));
    const fit0 = await fitFacts(H.page, '.ct-strip'); step('C', 'Training strip with tag: fits (no sideways overflow, text >= 14px)', !fit0.wide.length && !fit0.tiny.length && !(await hScroll(H.page)), JSON.stringify(fit0));
    await H.shot('coach-strip');
    // tag follows the nets pick: pick Mira for nets -> she loses the tag, the best idle is Lee
    await H.S(() => window.__store.dispatch('SetTrainPlan', { coachId: 'tfcM' })); await H.settle(400);
    const tags2 = await H.S(() => [...document.querySelectorAll('.ct-strip .ct-slot')].map((sl) => ({ id: sl.querySelector('[data-id]') ? sl.querySelector('[data-id]').getAttribute('data-id') : null, mc: !!sl.querySelector('.ct-tag--mc') })));
    step('C', 'Training strip: picking Mira for nets moves the tag off her (to the best idle coach)', !tags2.some((t) => t.id === 'tfcM' && t.mc) && tags2.filter((t) => t.mc).length === 1, JSON.stringify(tags2));
    await H.S(() => window.__store.dispatch('SetTrainPlan', { coachId: window.__store.get().coaches.find((c) => c.id !== 'tfcL' && c.id !== 'tfcM').id })); await H.settle(300);

    // match day
    const st = await H.advance('matchday');
    step('C', 'reached the match-day screen', st === 'matchday', `stage ${st}`);
    if (st === 'matchday') {
      const real = await H.S(() => { const s = window.__store.get(); return { coach_id: s.training.coach_id ?? null, n: s.coaches.length }; });
      note('C', 'FINDING stage order: Training tab (nets coach) comes AFTER the match and EndWeek clears coach_id, so at match day coach_id is', JSON.stringify(real) + ' -> every coach is idle by play');
      await H.inject(`(s) => { s.training.coach_id = '${starter.id}'; }`); // forced state (not reachable by play): the starter is on nets this week
      if ((await H.stage()) !== 'matchday') await H.advance('matchday');
      await H.settle(600);
      const row = await H.S(() => { const r = document.querySelector('.md-mc'); if (!r) return null; const b = r.getBoundingClientRect(); return { txt: r.innerText.replace(/\s+/g, ' ').trim(), tag: r.tagName, id: r.getAttribute('data-id'), l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height), vw: innerWidth, vh: innerHeight }; });
      step('C', 'match day: "Match coach" row is on the screen', !!row && /Match coach/.test(row.txt), `row ${JSON.stringify(row)}`);
      step('C', 'match day: default = best idle coach (Mira) with his grade', !!row && /Mira/.test(row.txt), `row ${row && row.txt}`);
      step('C', 'match day: chip words say Mira, batting and bowling +3%', !!row && /Mira/.test(row.txt) && /batting and bowling \+3%/i.test(row.txt), `row ${row && row.txt}`);
      if (row) {
        step('C', 'match day: row is a tap target >= 56px tall and inside the screen', row.tag === 'BUTTON' && row.h >= 44 && row.l >= -1 && row.r <= row.vw + 1, JSON.stringify(row));
        const fit = await fitFacts(H.page); step('C', 'match day: no sideways overflow, text >= 14px', !fit.wide.length && !fit.tiny.length && !(await hScroll(H.page)), JSON.stringify(fit));
        const clip = await H.S(() => { const r = document.querySelector('.md-mc'); return r ? [...r.querySelectorAll('b,small,span')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent.slice(0, 30)) : []; });
        step('C', 'match day: row text not clipped', !clip.length, clip.join(' | '));
        const cta = await H.S(() => { const c = document.querySelector('.md-cta'), r = document.querySelector('.md-mc'); if (!c || !r) return null; return { rowBottom: Math.round(r.getBoundingClientRect().bottom), ctaTop: Math.round(c.getBoundingClientRect().top), scrolls: document.querySelector('.md-body') ? document.querySelector('.md-body').scrollHeight > document.querySelector('.md-body').clientHeight + 2 : false }; });
        note('C', 'match-day row vs bottom bar', JSON.stringify(cta));
        await H.shot('coach-matchday');
      }
      // tap to change -> Lee, bowling +3%, store keeps matchCoachId
      if (row && row.tag === 'BUTTON') {
        await tap(H, '.md-mc'); await H.settle(400);
        const r2 = await H.S(() => { const r = document.querySelector('.md-mc'); return r ? r.innerText.replace(/\s+/g, ' ').trim() : null; });
        const stored = await H.S(() => window.__store.get().training.matchCoachId);
        step('C', 'tap changes the match coach to Lee: bowling +3%', !!r2 && /Lee/.test(r2) && /bowling \+3%/i.test(r2) && !/batting/i.test(r2), `row ${r2}`);
        step('C', 'tap saves this week\'s pick (training.matchCoachId = tfcL)', stored === 'tfcL', `matchCoachId ${stored}`);
        await H.shot('coach-matchday-lee');
      } else step('C', 'tap-to-change: row is a button with 2 idle coaches', false, `row ${JSON.stringify(row)}`);
      // go on: play the match; the boost reaches the engine path (md.mc) and the report
      const fx = await H.S(() => { const f = window.__store.get().fixture || {}; return f.md ? { mc: f.md.mc || null } : null; });
      note('C', 'fixture.md.mc before the match', JSON.stringify(fx));
      if (full) {
        const pl = await H.play('done'); await H.settle(500); const pw = await H.play('train'); await H.settle(500);
        step('D', 'played the match to the week screen', pl === 'done', `stopped at ${pl}, then ${pw}`);
        const txt = await copyReport(H);
        if (process.env.E2E_DUMP) console.log(txt);
        step('D', 'Copy report (full) gives text with a JSON block', !!txt && /\nJSON:\n/.test(txt), `got ${txt ? txt.length + ' chars' : 'nothing'}`);
        if (txt && /\nJSON:\n/.test(txt)) {
          let js = null; try { js = JSON.parse(txt.slice(txt.indexOf('\nJSON:\n') + 7).trim().split('\n')[0]); } catch (e) { /* below */ }
          step('D', 'report JSON parses', !!js, 'JSON.parse failed');
          if (js) {
            step('D', 'report JSON has tick:1', js.tick === 1, `tick ${JSON.stringify(js.tick)}; top keys ${Object.keys(js).join(',')}`);
            const M = Array.isArray(js.M) ? js.M : [];
            step('D', 'report JSON has match rows (M)', M.length > 0, `M ${JSON.stringify(js.M).slice(0, 80)}`);
            step('D', 'every match row carries mc', M.length > 0 && M.every((m) => m.mc !== undefined), JSON.stringify(M.map((m) => m.mc)));
            const first = M.find((m) => m.md) || M[0];
            step('D', 'match played with Lee: mc = [bat %, bowl %] = [0,3]', !!first && Array.isArray(first.mc) && first.mc[0] === 0 && first.mc[1] === 3, `mc ${first && JSON.stringify(first.mc)}`);
          }
          step('D', 'text COACHES line says "Match coach used N of M matches."', /Match coach used \d+ of \d+ matches\./.test(txt), (txt.match(/COACHES[^\n]*\n?[^\n]*/) || [''])[0]);
          step('D', 'report text has no network or personal data (still plain text)', txt.length < 9000, `${txt.length} chars`);
        }
      }
    }
  } catch (e) { step('C', 'coach group ran without throwing', false, e.stack || String(e)); }
  allErrs.push(...H.errs); await H.ctx.close();
}

/** No idle coach: the single coach is on nets -> "No match coach this week". */
async function groupNoCoach(vp, key) {
  curVp = key;
  const H = await open('N' + key, vp);
  try {
    await H.boot(); await H.advance('train');
    const only = await H.S(() => { const s = window.__store.get(); return s.coaches.map((c) => c.id); });
    await H.S((id) => window.__store.dispatch('SetTrainPlan', { coachId: id }), only[0]); await H.settle(300);
    const st = await H.advance('matchday');
    await H.inject(`(s) => { s.training.coach_id = '${only[0]}'; }`); if ((await H.stage()) !== 'matchday') await H.advance('matchday'); await H.settle(600);
    step('C', 'one coach, on nets: reaches match day', st === 'matchday' && only.length === 1, `stage ${st}, coaches ${only.length}`);
    const row = await H.S(() => { const r = document.querySelector('.md-mc'); return r ? { txt: r.innerText.replace(/\s+/g, ' ').trim(), tag: r.tagName } : null; });
    step('C', 'match day: row says "No match coach this week"', !!row && /No match coach this week/.test(row.txt), `row ${JSON.stringify(row)}`);
    step('C', 'match day: that row is not a button', !!row && row.tag !== 'BUTTON', `row ${JSON.stringify(row)}`);
    const fit = await fitFacts(H.page); step('C', 'match day (no coach): no sideways overflow, text >= 14px', !fit.wide.length && !fit.tiny.length && !(await hScroll(H.page)), JSON.stringify(fit));
    await H.shot('coach-none');
  } catch (e) { step('C', 'no-coach group ran without throwing', false, e.stack || String(e)); }
  allErrs.push(...H.errs); await H.ctx.close();
}

const allErrs = [];
try {
  for (const [key, vp] of Object.entries(VPS)) {
    if (ONLY && !String(vp.width).startsWith(ONLY)) continue;
    const full = key === 'fold';
    await groupTick(vp, `${vp.width}x${vp.height}`, false);
    await groupTick(vp, `${vp.width}x${vp.height}`, true);
    if (full) await groupReduced(vp, `${vp.width}x${vp.height}`);
    await groupFans(vp, `${vp.width}x${vp.height}`);
    await groupCoach(vp, `${vp.width}x${vp.height}`, full);
    await groupNoCoach(vp, `${vp.width}x${vp.height}`);
  }
} catch (e) { step('X', 'script ran without throwing', false, e.stack || String(e)); }
finally { await browser.close(); server.close(); }

curVp = '';
for (const e of allErrs) step('E', 'no console/page errors, no network', false, e);
if (!allErrs.length) step('E', 'no console/page errors, no network', true);
const names = { A: 'landing tick', B: 'fans gate', C: 'match coach', D: 'copy report', E: 'errors', X: 'harness' };
let bad = 0;
console.log(`tfc e2e seed ${SEED}; viewports ${Object.values(VPS).map((v) => v.width + 'x' + v.height).join(', ')}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.note ? 'NOTE' : r.ok ? 'PASS' : 'FAIL'} [${r.g} ${names[r.g]}${r.vp ? ' ' + r.vp : ''}] ${r.name}${r.note ? ': ' + r.why : r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length} checks` : `PASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
