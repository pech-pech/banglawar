// Wheel match mode visual-QA screenshot harness (2026-11-15 wheel match build). VQA agent.
// Fold cover 475x638 ONLY, deviceScaleFactor 2, Chromium (preinstalled; never installs). Modelled on tools/tfc-shots.mjs.
// Run:  node pages/cricket-sixes/tools/wheelmatch-shots.mjs
// Env:  WM_SHOTS=dir (default the build folder shots/), WM_ONLY=bowl,bat,marks,auto,settings,reduced (subset), WM_TAG=r1 (file prefix qa-<tag>-)
// 1. GEN: a fresh game (?seed=wmqa) driven by store commands to a wheel-mode match (matchMode 'wheel', long-player patch: Aim Guide,
//    Slow Spin, Steady), saved at bowl over 1, bowl over 5, chase over 1, chase over 5 and the last chase over.
// 2. Each scene opens a fresh context with one save, reaches the screen by real taps and shoots at fixed wheel times after SPIN.
//    audit.json: small taps / clipped text / offscreen / text < 14px / low contrast / horizontal scroll per shot. No game source is edited.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOTS = (process.env.WM_SHOTS || '/mnt/project-files/games-design/cricket-sixes/2026-11-15-wheel-match-build/shots/').replace(/\/?$/, '/');
const ONLY = (process.env.WM_ONLY || '').split(',').filter(Boolean);
const TAG = process.env.WM_TAG || 'r1';
const VIEW = { width: 475, height: 638 };
const DPR = 2;
const SEED = 'wmqa';
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const URL0 = `${ORIGIN}/cricket-sixes/?seed=${SEED}`;
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const log = (...a) => console.log(...a);
const AUDIT = {}; const MADE = []; const MISSED = []; const NOTES = {};
const want = (n) => !ONLY.length || ONLY.includes(n);
const PFX = 'qa-' + TAG + '-';

// ---- in-page audit: taps < 44, clipped text, text outside the viewport, text < 14px, contrast < 4.5 (3 for >= 18.66px bold / 24px), h-scroll
function auditInPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 48);
  const ovs = [...document.querySelectorAll('.sheet-fixed, .c-sheet, .wh-ov')].filter(vis); const scope = ovs[ovs.length - 1] || document.getElementById('app') || document.body;
  const out = { scope: (scope.className || scope.id || '').toString().slice(0, 40), small: [], clipped: [], offscreen: [], below: [], tiny: [], contrast: [] };
  const rgb = (s) => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c.length < 4 || c[3] > 0.9) { if (getComputedStyle(x).backgroundImage !== 'none') return null; return c; } } return [255, 255, 255]; };
  for (const e of scope.querySelectorAll('button, a[href], [role="button"], [role="switch"], input, select, summary')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.small.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const e of scope.querySelectorAll('*')) {
    if (!vis(e) || e.closest('.ss-sr') || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if ((cs.overflow.includes('hidden') || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)) out.clipped.push(`${label(e)} ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
    if (r.right > innerWidth + 1 || r.left < -1) out.offscreen.push(`${label(e)} x ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (r.top > innerHeight) out.below.push(`${label(e).slice(0, 30)} y ${Math.round(r.top)}`);
    const fs = parseFloat(cs.fontSize); if (fs < 13.95) out.tiny.push(`${label(e).slice(0, 30)} ${fs}px`);
    const bg = bgOf(e); if (bg && !e.closest('.ss-sr')) {
      const fg = rgb(cs.color), op = parseFloat(cs.opacity) || 1; let a = lum(fg), b = lum(bg); const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      let eff = 1; for (let x = e; x; x = x.parentElement) eff *= parseFloat(getComputedStyle(x).opacity) || 1;
      const big = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
      if (cr < 1.4) out.contrast.push(`${label(e).slice(0, 30)} ${cr.toFixed(2)} (bg on a pseudo-element, check by eye)`); else if (cr < (big ? 3 : 4.5) || eff < 0.75) out.contrast.push(`${label(e).slice(0, 30)} ${cr.toFixed(2)}${eff < 0.75 ? ' opacity ' + eff.toFixed(2) : ''}`);
    }
  }
  out.hScroll = document.documentElement.scrollWidth > innerWidth + 1;
  out.vScroll = document.documentElement.scrollHeight > innerHeight + 1;
  const cta = document.querySelector('.wm-cta .wm-go'); if (cta && vis(cta)) { const r = cta.getBoundingClientRect(); out.cta = [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' ' + cta.innerText.replace(/\s+/g, ' '); }
  const cv = document.querySelector('.wm-cv'); if (cv && vis(cv)) { const r = cv.getBoundingClientRect(); out.canvas = [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' px ' + cv.width + 'x' + cv.height; }
  for (const k of ['small', 'clipped', 'offscreen', 'below', 'tiny', 'contrast']) out[k] = [...new Set(out[k])].slice(0, 16);
  return out;
}

async function newPage(saveText, { theme = null, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (saveText) await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__wmfx')) { localStorage.clear(); localStorage.setItem('cs.save.1', fx); localStorage.setItem('__wmfx', '1'); } } catch (e) { /* blocked */ } }, saveText);
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
  const P = {
    ctx, page, errs,
    settle: (ms = 250) => page.waitForTimeout(ms),
    S: (fn, arg) => page.evaluate(fn, arg),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    async shot(name) {
      const a = await page.evaluate(auditInPage).catch((e) => ({ err: e.message }));
      await page.screenshot({ path: SHOTS + PFX + name + '.png' }); AUDIT[name] = a; MADE.push(name); log('  shot', name);
    },
    async crop(name, sel) {
      try {
        const loc = page.locator(sel).first();
        if (!(await loc.count())) { MISSED.push('crop ' + name + ': no element'); return false; }
        await loc.screenshot({ path: SHOTS + PFX + 'crop-' + name + '.png' }); MADE.push('crop-' + name); return true;
      } catch (e) { MISSED.push('crop ' + name + ': ' + e.message.split('\n')[0]); return false; }
    },
    async done(tag) { if (errs.length) AUDIT['_errors_' + (tag || Date.now())] = errs.slice(0, 10); await ctx.close(); },
  };
  await page.goto(URL0); await P.settle(900);
  if (theme) { await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), theme); await P.settle(400); }
  return P;
}

// ---- in-page command driver: drive stages until pred(state) is true. Wheel match overs go through WheelOver {auto:true}.
async function drive(P, stopFn, guardN = 900) {
  return P.page.evaluate(([src, guardN]) => {
    const stop = new Function('s', 'return (' + src + ')(s)');
    const S = window.__store; let g = 0;
    while (!stop(S.get()) && g++ < guardN) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p || {}), was = JSON.stringify([s.stage, s.season && s.season.week, s.innings && s.innings.length]);
      if (s.matchMode !== 'wheel' && !['bowl', 'break', 'chase', 'done'].includes(s.stage)) d('SetMatchMode', { mode: 'wheel' });
      const wheel = s.mode === 'wheel';
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'matchday': d('MatchdayGo'); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'wheel' }); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': if (wheel) d('WheelOver', { auto: true }); else d('BowlOver'); break;
        case 'break': d('StartChase'); break;
        case 'chase': if (wheel) d('WheelOver', { auto: true }); else d('BowlOver', { intent: 'R' }); break;
        case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break;
        case 'train': d('EndWeek'); break;
        case 'end': d('NewSeason'); break; case 'runend': d('NewRun', {}); break;
        default: return 'stuck:' + s.stage;
      }
      if (JSON.stringify([S.get().stage, S.get().season && S.get().season.week, S.get().inn2 && S.get().inn2.balls]) === was && ['hub', 'squad', 'plan', 'train', 'week', 'done', 'matchday'].includes(S.get().stage)) {
        d('DismissNotice'); d('PassScout'); d('DismissTierUp'); d('PickActivity', { id: 'rest' });
      }
    }
    return S.get().stage;
  }, [stopFn.toString(), guardN]);
}

// ---- long-player patch: full power tree (Aim Guide, Slow Spin, Steady), all Craft. Optional: no Aim Guide.
async function patchAndReload(P, { guide = true } = {}) {
  await P.page.evaluate(async (guide) => {
    const { NODES } = await import('/cricket-sixes/js/data/wheelmeta.js');
    const s = structuredClone(window.__store.get());
    const m = s.wheelMeta || {};
    m.tally = 600; m.spokes = 40; m.spent = 9999; m.tierSeen = 7; m.tierUpQueue = []; m.tokUsed = {}; m.matchTokUsed = { key: '', n: 0 }; m.spotTokensUsed = 0;
    m.owned = {}; const craft = {};
    for (const n of NODES) { if (n.branch === 'craft') craft[n.id] = n.max_rank; else m.owned[n.id] = n.max_rank; }
    if (!guide) delete m.owned.c_guide;
    m.tokens = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }; m.tokSeason = (s.season && s.season.n) || 1;
    s.wheelMeta = m; s.wheelCraft = { ...(s.wheelCraft || {}), owned: craft };
    s.matchMode = 'wheel';
    window.__save.save(s);
  }, guide);
  await P.page.reload(); await P.settle(900);
}
const saveText = (P) => P.page.evaluate(() => localStorage.getItem('cs.save.1'));

// ---- GEN
log('GEN saves');
const SAVES = {};
{
  const P = await newPage(null);
  const pick = await P.page.$('[data-cl-pick]'); if (pick) { await pick.click(); await P.settle(200); const t = await P.page.$('[data-cl-act="TakeFreePick"]'); if (t) { await t.click(); await P.settle(400); } }
  log('  stage', await drive(P, (s) => s.stage === 'plan' || s.stage === 'matchday'));
  await patchAndReload(P);
  log('  stage', await drive(P, (s) => s.stage === 'bowl'));
  NOTES.gen = await P.S(() => { const s = window.__store.get(); return { mode: s.mode, matchMode: s.matchMode, stage: s.stage, keys: Object.keys(s).slice(0, 60), inn: s.innings && s.innings.map((i) => Object.keys(i)) }; });
  log('  gen', JSON.stringify(NOTES.gen).slice(0, 400));
  SAVES.bowl1 = await saveText(P);
  // advance 4 overs with WheelOver auto
  const over = () => P.S(() => (window.__store.get().wheelLog || []).length);
  for (let i = 0; i < 4; i++) await P.S(() => window.__store.dispatch('WheelOver', { auto: true }));
  SAVES.bowl5 = await saveText(P); log('  bowl5', await P.stage(), await over());
  log('  stage', await drive(P, (s) => s.stage === 'chase'));
  SAVES.chase1 = await saveText(P); log('  chase1', await P.stage());
  for (let i = 0; i < 4 && (await P.stage()) === 'chase'; i++) await P.S(() => window.__store.dispatch('WheelOver', { auto: true }));
  if ((await P.stage()) === 'chase') { SAVES.chase5 = await saveText(P); log('  chase5'); }
  for (let i = 0; i < 4 && (await P.stage()) === 'chase'; i++) await P.S(() => window.__store.dispatch('WheelOver', { auto: true }));
  if ((await P.stage()) === 'chase') { SAVES.chase9 = await saveText(P); log('  chase9'); }
  NOTES.genEnd = await P.S(() => { const s = window.__store.get(); return { stage: s.stage, log: (s.wheelLog || []).map((w) => w.inn + ':' + w.over + ':' + w.label + (w.wk ? '*' + w.wk : '')).join(' ') }; });
  await P.done('gen');
}
// a second match to look for an earlier chase end (WIN / ALL OUT / TIE) states: drive more matches, keep last-over chase saves
async function genLate(n) {
  const P = await newPage(SAVES.bowl1); const out = [];
  for (let m = 0; m < n; m++) {
    await drive(P, (s) => s.stage === 'chase' && s.mode === 'wheel' && ((s.inn2 && s.inn2.balls) || 0) >= 54, 2000);
    if ((await P.stage()) !== 'chase') break;
    out.push(await saveText(P));
    await drive(P, (s) => s.stage === 'done', 50); await drive(P, (s) => s.stage === 'bowl', 2000);
  }
  await P.done('genLate'); return out;
}

// ---- wheel helpers
const btn = (P) => P.page.$eval('.wm-cta .wm-go', (b) => ({ text: b.innerText.replace(/\s+/g, ' '), cls: b.className, wm: b.getAttribute('data-wm') })).catch(() => ({}));
async function toReady(P) { const g = await P.page.$('[data-wm="go"]'); if (!g) return false; await g.click(); await P.settle(500); return !!(await P.page.$('[data-wm="spin"]')); }
/** Tap SPIN; shots at wheel times `at` (s after SPIN); tap STOP at stopAt (null = coast); then post-stop shots at `after` (s after STOP). */
async function spinRun(P, prefix, { at = [], stopAt = 3.45, after = [], crops = [] } = {}) {
  await P.page.click('[data-wm="spin"]'); const t0 = Date.now(); const info = [];
  for (const t of at) {
    const wait = t * 1000 - (Date.now() - t0); if (wait > 0) await P.settle(wait);
    const real = (Date.now() - t0) / 1000; const b = await btn(P); const nm = prefix + '-t' + t.toFixed(1).replace('.', '_');
    await P.shot(nm); if (crops.includes(t)) await P.crop(nm, '.wm-cv');
    info.push({ nm, want: t, real: +real.toFixed(2), btn: b.text, glow: /is-glow/.test(b.cls || '') });
  }
  let ts = t0;
  if (stopAt != null) { const wait = stopAt * 1000 - (Date.now() - t0); if (wait > 0) await P.settle(wait); await P.page.click('.wm-cta .wm-go', { force: true }); ts = Date.now(); info.push({ stopTapped: +((ts - t0) / 1000).toFixed(2) }); }
  else ts = t0 + 6000;
  for (const t of after) {
    const wait = t * 1000 - (Date.now() - ts); if (wait > 0) await P.settle(wait);
    const nm = prefix + '-s' + t.toFixed(1).replace('.', '_'); await P.shot(nm); if (crops.includes('s' + t)) await P.crop(nm, '.wm-cv');
    info.push({ nm, after: t, real: +((Date.now() - ts) / 1000).toFixed(2), btn: (await btn(P)).text, mark: await P.page.$eval('.wm-mark', (m) => (m.hidden ? '' : m.textContent)).catch(() => '') });
  }
  NOTES[prefix] = info; return info;
}
const segInfo = (P) => P.S(async () => { const sel = await import('/cricket-sixes/js/store/selectors.js'); const s = window.__store.get(); let vm = null; try { vm = sel.wheelMatchVM(s); } catch (e) { return 'vm error ' + e.message; } return vm ? { over: vm.over, side: vm.side, exp: vm.expectText, need: vm.needText, segs: (vm.segs || []).map((g) => g.label + (g.stars ? '*' + g.stars : '') + ' ' + g.tone + ' ' + (g.p * 100).toFixed(1) + '%'), ctrl: vm.ctrl } : 'no __sel'; });

// ---- SCENES
async function sceneBowl() {
  for (const [tag, src, theme] of [['bowl5', SAVES.bowl5, null], ['bowl5-scorebook', SAVES.bowl5, 'scorebook'], ['bowl1', SAVES.bowl1, null]]) {
    if (!src) { MISSED.push(tag + ': no save'); continue; }
    const P = await newPage(src, { theme });
    if ((await P.stage()) !== 'bowl') { MISSED.push(tag + ': stage ' + (await P.stage())); await P.done(); continue; }
    NOTES['segs-' + tag] = await segInfo(P);
    await P.shot(tag + '-pick');
    if (!(await toReady(P))) { MISSED.push(tag + ': no ready'); await P.shot(tag + '-noready'); await P.done(tag); continue; }
    await P.shot(tag + '-ready'); await P.crop(tag + '-ready', '.wm-cv');
    if (tag === 'bowl5') await spinRun(P, tag + '-spin', { at: [0.5, 1.5, 3.4, 3.6], stopAt: 3.7, after: [1.0, 2.1, 2.6, 3.4, 6.0], crops: [1.5, 3.4, 's2.6'] });
    else if (tag === 'bowl1') await spinRun(P, tag + '-spin', { at: [1.5], stopAt: null, after: [2.5, 6.0] });
    await P.done(tag);
  }
}
async function sceneBat() {
  for (const [tag, src, theme] of [['chase1', SAVES.chase1, null], ['chase5', SAVES.chase5, null], ['chase5-scorebook', SAVES.chase5, 'scorebook']]) {
    if (!src) { MISSED.push(tag + ': no save'); continue; }
    const P = await newPage(src, { theme });
    if ((await P.stage()) !== 'chase') { MISSED.push(tag + ': stage ' + (await P.stage())); await P.done(); continue; }
    NOTES['segs-' + tag] = await segInfo(P);
    await P.shot(tag + '-pick');
    if (!(await toReady(P))) { MISSED.push(tag + ': no ready'); await P.done(tag); continue; }
    await P.shot(tag + '-ready'); await P.crop(tag + '-ready', '.wm-cv');
    if (tag === 'chase5') await spinRun(P, tag + '-spin', { at: [1.5, 3.4], stopAt: 3.5, after: [2.6, 6.0], crops: [3.4] });
    await P.done(tag);
  }
}
async function sceneMarks() {
  const late = [SAVES.chase9, ...(await genLate(4))].filter(Boolean); let got = {};
  for (let i = 0; i < late.length; i++) {
    const P = await newPage(late[i]);
    if ((await P.stage()) !== 'chase') { await P.done(); continue; }
    NOTES['segs-late' + i] = await segInfo(P);
    if (!(await toReady(P))) { await P.done(); continue; }
    await P.shot('late' + i + '-ready'); await P.crop('late' + i + '-ready', '.wm-cv');
    const info = await spinRun(P, 'late' + i + '-spin', { at: [], stopAt: 3.5, after: [2.3, 6.0] });
    const mk = info.map((x) => x.mark).filter(Boolean)[0]; if (mk) got[mk] = 'late' + i;
    // play on with auto to the end of the match: maybe the mark shows on a later over
    await P.done('late' + i);
  }
  NOTES.marks = got;
}
async function sceneAuto() {
  const src = SAVES.bowl5; if (!src) return;
  const P = await newPage(src);
  const b = await P.page.$('[data-wm="auto-rest"]'); NOTES.autoRestShown = !!b;
  await (b || (await P.page.$('[data-wm="auto-over"]'))).click(); const t0 = Date.now();
  for (const t of [0.3, 1.2, 2.4]) { const w = t * 1000 - (Date.now() - t0); if (w > 0) await P.settle(w); await P.shot('auto-t' + t.toFixed(1).replace('.', '_')); }
  const s = await P.page.$('[data-wm="stop-auto"]'); if (s) { await s.click(); await P.settle(150); await P.shot('auto-stopping'); await P.settle(2500); await P.shot('auto-stopped'); }
  await P.done('auto');
}
async function sceneSettings() {
  for (const [tag, src] of [['idle', SAVES.bowl1 && null], ['live', SAVES.bowl5]]) {
    const P = await newPage(src || SAVES.bowl1);
    if (tag === 'idle') { await drive(P, (s) => !['bowl', 'break', 'chase'].includes(s.stage), 400); await P.settle(500); }
    const g = await P.page.$('.st-gear'); if (!g) { MISSED.push('settings ' + tag + ': no gear'); await P.shot('settings-' + tag + '-nogear'); await P.done(); continue; }
    await g.click(); await P.settle(900);
    const row = await P.page.$('.wms-mode'); if (!row) { MISSED.push('settings ' + tag + ': no .wms-mode'); await P.shot('settings-' + tag + '-norow'); await P.done(); continue; }
    await row.scrollIntoViewIfNeeded(); await P.settle(200); await P.shot('settings-' + tag + '-mode');
    const dv = await P.page.$('[data-wm-dev]'); if (dv) {
      await dv.scrollIntoViewIfNeeded(); if ((await dv.getAttribute('aria-checked')) !== 'true') await dv.click(); await P.settle(300);
      const sec = await P.page.$('[data-wm-sec]'); if (sec) { await sec.scrollIntoViewIfNeeded(); await P.settle(200); }
      await P.shot('settings-' + tag + '-dev');
      const adv = await P.page.$('.wms-adv summary'); if (adv) { await adv.click(); await P.settle(200); await adv.scrollIntoViewIfNeeded(); await P.shot('settings-' + tag + '-dev-adv'); }
      NOTES['settings-' + tag] = await P.S(() => [...document.querySelectorAll('.wms-range, [data-wm-reset], [data-wm-dev], .wms-opt')].map((e) => { const r = e.getBoundingClientRect(); return (e.className.split(' ').pop()) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }));
    } else MISSED.push('settings ' + tag + ': no dev switch');
    await P.done('settings-' + tag);
  }
}
async function sceneReduced() {
  for (const [tag, src] of [['bowl5', SAVES.bowl5], ['chase5', SAVES.chase5]]) {
    if (!src) continue;
    const P = await newPage(src, { reduced: true });
    await P.shot('reduced-' + tag + '-pick');
    if (await toReady(P)) { await P.shot('reduced-' + tag + '-ready'); const live0 = await P.page.$eval('.wm-live', (l) => l.textContent).catch(() => '');
      await P.page.click('[data-wm="spin"]'); await P.settle(120); const live1 = await P.page.$eval('.wm-live', (l) => l.textContent).catch(() => '');
      await P.shot('reduced-' + tag + '-result'); NOTES['reduced-' + tag] = { live0, live1, filled: await P.page.$$eval('.op-slot.is-filled', (a) => a.length).catch(() => -1) };
    } else MISSED.push('reduced ' + tag + ': no ready');
    await P.done('reduced-' + tag);
  }
}

if (want('bowl')) await sceneBowl();
if (want('bat')) await sceneBat();
if (want('auto')) await sceneAuto();
if (want('settings')) await sceneSettings();
if (want('reduced')) await sceneReduced();
if (want('marks')) await sceneMarks();

writeFileSync(SHOTS + PFX + 'audit.json', JSON.stringify({ made: MADE, missed: MISSED, notes: NOTES, audit: AUDIT }, null, 1));
log('made', MADE.length, 'missed', MISSED.length); MISSED.forEach((m) => log('  MISSED', m));
await browser.close(); server.close();
