// tfc visual-QA screenshot harness (2026-11-15 build: landing tick + Fans gate line + match coach). Agent E (visual QA).
// Fold cover 475x638 ONLY, deviceScaleFactor 2, Chromium. Modelled on tools/wa1-shots.mjs + test/e2e/hub-l2.mjs.
// Run:  node pages/cricket-sixes/tools/tfc-shots.mjs
// Env:  TFC_SHOTS=dir (default the build folder shots/), TFC_ONLY=hub,table,md,train,spot,find,hype (subset)
// 1. GEN: one fresh game (?seed=tfcqa) driven by store commands to hub / matchday / train, patched like a long player
//    (full power tree incl. Aim Guide, all Craft, 3 coaches none away, stadium L2 with 765 Fans) and saved.
// 2. Each scene opens a fresh context with one save (or a patched copy: no Aim Guide, fans ready, scorebook) and
//    reaches the screen by real taps. Mid-spin frames are taken at fixed wheel times after SPIN, plus canvas crops.
//    audit.json lists small taps / clipped text / off-screen text / text < 14px per shot. No game source is edited.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOTS = (process.env.TFC_SHOTS || '/mnt/project-files/games-design/cricket-sixes/2026-11-15-tick-fans-coach-build/shots/').replace(/\/?$/, '/');
const ONLY = (process.env.TFC_ONLY || '').split(',').filter(Boolean);
const VIEW = { width: 475, height: 638 };
const DPR = 2;
const SEED = 'tfcqa';
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

// ---- in-page audit (top overlay / sheet / app): taps < 44, clipped text, text outside the viewport, text < 14px
function auditInPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 48);
  const ovs = [...document.querySelectorAll('.wh-ov, .wk-ov, .c-sheet')].filter(vis); const scope = ovs[ovs.length - 1] || document.getElementById('app') || document.body;
  const out = { scope: (scope.className || scope.id || '').toString(), small: [], clipped: [], offscreen: [], below: [], tiny: [] };
  for (const e of scope.querySelectorAll('button, a[href], [role="button"], input, select')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.small.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const e of scope.querySelectorAll('*')) {
    if (!vis(e) || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if ((cs.overflow.includes('hidden') || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)) out.clipped.push(`${label(e)} ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
    if (r.right > innerWidth + 1 || r.left < -1) out.offscreen.push(`${label(e)} x ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (r.top > innerHeight) out.below.push(`${label(e).slice(0, 30)} y ${Math.round(r.top)}`);
    const fs = parseFloat(cs.fontSize); if (fs < 13.95) out.tiny.push(`${label(e).slice(0, 30)} ${fs}px`);
  }
  out.hScroll = document.documentElement.scrollWidth > innerWidth + 1;
  for (const k of ['small', 'clipped', 'offscreen', 'below', 'tiny']) out[k] = [...new Set(out[k])].slice(0, 16);
  return out;
}

async function newPage(saveText, { theme = null } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  if (saveText) await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__tfcfx')) { localStorage.clear(); localStorage.setItem('cs.save.1', fx); localStorage.setItem('__tfcfx', '1'); } } catch (e) { /* blocked */ } }, saveText);
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
      await page.screenshot({ path: SHOTS + 'tfc-' + name + '.png' }); AUDIT[name] = a; MADE.push(name); log('  shot', name);
    },
    async crop(name, sel) { // element crop at DPR 2 (sel = css or a Locator)
      try {
        const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
        if (!(await loc.count())) { MISSED.push('crop ' + name + ': no element'); return false; }
        await loc.screenshot({ path: SHOTS + 'tfc-crop-' + name + '.png' }); MADE.push('crop-' + name); return true;
      } catch (e) { MISSED.push('crop ' + name + ': ' + e.message.split('\n')[0]); return false; }
    },
    async done(tag) { if (errs.length) AUDIT['_errors_' + (tag || Date.now())] = errs.slice(0, 10); await ctx.close(); },
  };
  await page.goto(URL0); await P.settle(900);
  if (theme) { await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), theme); await P.settle(400); }
  return P;
}

// ---- in-page command driver (as wa1-shots): drive stages until pred(state) is true
async function drive(P, stopFn, guardN = 900) {
  return P.page.evaluate(([src, guardN]) => {
    const stop = new Function('s', 'return (' + src + ')(s)');
    const S = window.__store; let g = 0;
    while (!stop(S.get()) && g++ < guardN) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p || {}), was = JSON.stringify([s.stage, s.season && s.season.week]);
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'matchday': d('MatchdayGo'); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
        case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break;
        case 'train': d('EndWeek'); break;
        case 'end': d('NewSeason'); break; case 'runend': d('NewRun', {}); break;
        default: return 'stuck:' + s.stage;
      }
      if (JSON.stringify([S.get().stage, S.get().season && S.get().season.week]) === was && ['hub', 'squad', 'plan', 'train', 'week', 'done', 'matchday'].includes(S.get().stage)) {
        d('DismissNotice'); d('PassScout'); d('DismissTierUp'); d('PickActivity', { id: 'rest' });
      }
    }
    return S.get().stage;
  }, [stopFn.toString(), guardN]);
}

// ---- the long-player patch: full power tree (Aim Guide on), all Craft, coins, 3 coaches none away, stadium L2 / 765 Fans (report p13)
async function patchAndReload(P) {
  await P.page.evaluate(async () => {
    const { NODES } = await import('/cricket-sixes/js/data/wheelmeta.js');
    const s = structuredClone(window.__store.get());
    const m = s.wheelMeta || {};
    m.tally = 600; m.spokes = 40; m.spent = 9999; m.tierSeen = 7; m.tierUpQueue = []; m.tokUsed = {}; m.matchTokUsed = { key: '', n: 0 }; m.spotTokensUsed = 0;
    m.owned = {}; const craft = {};
    for (const n of NODES) { if (n.branch === 'craft') craft[n.id] = n.max_rank; else m.owned[n.id] = n.max_rank; }
    m.tokens = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }; m.tokSeason = (s.season && s.season.n) || 1;
    s.wheelMeta = m; s.wheelCraft = { ...(s.wheelCraft || {}), owned: craft };
    if (s.econ) { s.econ.coins = Math.max(s.econ.coins | 0, 6000); s.econ.stadium = 2; s.econ.fans = 765; }
    const cs = (s.coaches || []).filter((c) => !c.candidate); const base = cs[0] || { id: 'c1', name: 'Coach' };
    s.coaches = [{ ...base, step: 7, strong: ['bat', 'bal'], away: 0, courseSeason: null },
      { id: 'cqa2', name: 'Bilal Rana', step: 5, strong: ['bowl'], away: 0, courseSeason: null },
      { id: 'cqa3', name: 'Tom Ashworth-Lee', step: 3, strong: ['bowl', 'bat'], away: 0, courseSeason: null }];
    if (s.training) { s.training.coach_id = s.coaches[0].id; if (s.training.last_plan) s.training.last_plan.coachId = s.coaches[0].id; }
    if (s.econ && (s.training || s.stage === 'train')) s.tp = Math.max(s.tp | 0, 200);
    window.__save.save(s);
  });
  await P.page.reload(); await P.settle(900);
}
const saveText = (P) => P.page.evaluate(() => localStorage.getItem('cs.save.1'));
const { wrap: reWrap } = await import('../js/core/save-migrate.js');
const patchSave = (txt, fn) => { const o = JSON.parse(txt); const st = o.data; fn(st); return JSON.stringify(reWrap(st)); };
const noGuide = (txt) => patchSave(txt, (st) => { delete st.wheelMeta.owned.c_guide; });
const fansReady = (txt) => patchSave(txt, (st) => { st.econ.fans = 1200; });
const oneCoach = (txt) => patchSave(txt, (st) => { st.coaches = st.coaches.slice(0, 1); });

// ---- GEN
log('GEN saves');
const SAVES = {};
{
  const P = await newPage(null);
  const pick = await P.page.$('[data-cl-pick]'); if (pick) { await pick.click(); await P.settle(200); const t = await P.page.$('[data-cl-act="TakeFreePick"]'); if (t) { await t.click(); await P.settle(400); } }
  await drive(P, (s) => s.stage === 'hub'); await patchAndReload(P); SAVES.hub = await saveText(P); log('  hub', await P.stage());
  await drive(P, (s) => s.stage === 'matchday'); await patchAndReload(P); SAVES.md = await saveText(P); log('  matchday', await P.stage());
  await drive(P, (s) => s.stage === 'train'); await patchAndReload(P); SAVES.train = await saveText(P); log('  train', await P.stage());
  await drive(P, (s) => s.stage === 'hub'); await patchAndReload(P); SAVES.hub2 = await saveText(P); log('  hub2', await P.stage());
  await P.done('gen');
}

// ---- wheel helpers
const goTxt = (P) => P.page.$eval('.wh-ov [data-go]', (b) => b.textContent.trim()).catch(() => '');
const goCls = (P) => P.page.$eval('.wh-ov [data-go]', (b) => b.className).catch(() => '');
/** Tap SPIN, then take full shots at the wheel times `at` (seconds after SPIN) and a canvas crop at each of `burst` times. */
async function spinFrames(P, prefix, at, burst, cvSel = '.wh-ov canvas') {
  await P.page.click('.wh-ov [data-go]'); const t0 = Date.now();
  const all = [...at.map((t) => ({ t, full: true })), ...burst.map((t) => ({ t, full: false }))].sort((a, b) => a.t - b.t);
  const info = [];
  for (const f of all) {
    const wait = f.t * 1000 - (Date.now() - t0); if (wait > 0) await P.settle(wait);
    const real = (Date.now() - t0) / 1000, txt = await goTxt(P), cls = await goCls(P);
    const nm = prefix + '-t' + f.t.toFixed(1).replace('.', '_');
    if (f.full) await P.shot(nm); else await P.crop(nm, cvSel);
    info.push({ nm, want: f.t, real: +real.toFixed(2), go: txt, window: /is-window/.test(cls) });
  }
  NOTES[prefix] = info; return info;
}

// ---- SCENES
async function sceneHub() {
  for (const [tag, src, theme] of [['normal', SAVES.hub, null], ['scorebook', SAVES.hub, 'scorebook'], ['ready', fansReady(SAVES.hub), null], ['ready-scorebook', fansReady(SAVES.hub), 'scorebook']]) {
    const P = await newPage(src, { theme });
    if ((await P.stage()) !== 'hub') { MISSED.push('hub ' + tag + ': stage ' + (await P.stage())); await P.done(); continue; }
    await P.shot('hub-' + tag);
    await P.crop('hub-fans-' + tag, '.hb-fg');
    await P.crop('hub-board-' + tag, '.hb-ground');
    NOTES['hub-' + tag] = await P.S(() => { const e = document.querySelector('.hb-fg'); if (!e) return 'no .hb-fg'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e.querySelector('.fg-tx') || e); return { text: e.innerText, rect: [r.left, r.top, r.width, r.height].map(Math.round), fs: cs.fontSize, color: cs.color, bg: getComputedStyle(e).backgroundColor }; });
    await P.done('hub-' + tag);
  }
}

async function sceneTable() {
  for (const [tag, src, theme] of [['normal', SAVES.hub, null], ['scorebook', SAVES.hub, 'scorebook'], ['ready', fansReady(SAVES.hub), null]]) {
    const P = await newPage(src, { theme });
    const b = await P.page.$('[data-act="sheet:table"]');
    if (!b) { MISSED.push('table: no hub plate'); await P.done(); return; }
    await b.click(); await P.settle(600);
    await P.shot('table-' + tag);
    await P.crop('table-fans-' + tag, '.c-sheet .fg');
    NOTES['table-' + tag] = await P.S(() => { const e = document.querySelector('.c-sheet .fg'); if (!e) return 'no .fg in sheet'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e.querySelector('.fg-tx') || e); return { text: e.innerText, rect: [r.left, r.top, r.width, r.height].map(Math.round), fs: cs.fontSize, color: cs.color, bg: getComputedStyle(e).backgroundColor }; });
    await P.done('table-' + tag);
  }
}

async function sceneMatchday() {
  for (const [tag, src, theme] of [['3coaches', SAVES.md, null], ['3coaches-scorebook', SAVES.md, 'scorebook'], ['nocoach', oneCoach(SAVES.md), null]]) {
    const P = await newPage(src, { theme });
    if ((await P.stage()) !== 'matchday') { MISSED.push('md ' + tag + ': stage ' + (await P.stage())); await P.done(); return; }
    await P.shot('md-' + tag);
    const row = P.page.locator('.md-coach, [data-md="coach"], [data-mc]').first();
    const rowTxt = (await row.count()) ? row : P.page.getByText(/match coach/i).first();
    if (await rowTxt.count()) { await rowTxt.scrollIntoViewIfNeeded().catch(() => {}); await P.crop('md-coach-row-' + tag, rowTxt); } else MISSED.push('md ' + tag + ': no Match coach row');
    const chip = P.page.locator(".md-mc small").first();
    if (await chip.count()) await P.crop('md-coach-chip-' + tag, chip); else if (tag !== 'nocoach') MISSED.push('md ' + tag + ': no coach chip');
    await P.page.evaluate(() => window.scrollTo(0, 99999)); await P.settle(250); await P.shot('md-' + tag + '-bottom');
    NOTES['md-' + tag] = await P.S(() => ({ text: (document.getElementById('app') || document.body).innerText.split('\n').filter((l) => /coach/i.test(l)).slice(0, 8), docH: document.documentElement.scrollHeight }));
    if (tag === '3coaches') { // tap the row to change the coach
      const tap = P.page.locator('[data-md="coach"], .md-coach button, button:has-text("Match coach")').first();
      if (await tap.count()) { await P.page.evaluate(() => window.scrollTo(0, 0)); await tap.click().catch(() => {}); await P.settle(600); await P.shot('md-coach-change'); }
    }
    await P.done('md-' + tag);
  }
}

async function sceneTrain() {
  for (const [tag, src, theme] of [['normal', SAVES.train, null], ['scorebook', SAVES.train, 'scorebook']]) {
    const P = await newPage(src, { theme });
    if ((await P.stage()) !== 'train') { MISSED.push('train: stage ' + (await P.stage())); await P.done(); return; }
    const tip = await P.page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await P.settle(200); }
    await P.shot('train-strip-' + tag);
    await P.crop('train-strip-' + tag, P.page.locator('.ct-slot').first().locator('xpath=..'));
    const tagEl = P.page.locator('.ct-slot').filter({ has: P.page.locator(".ct-tag--mc") }).first();
    if (await tagEl.count()) await P.crop('train-mc-slot-' + tag, tagEl); else MISSED.push('train ' + tag + ': no slot tagged Match coach');
    NOTES['train-' + tag] = await P.S(() => [...document.querySelectorAll('.ct-slot')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    await P.done('train-' + tag);
  }
}

async function openSpot(P) {
  const tip = await P.page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await P.settle(200); }
  const sp = await P.page.$('[data-lo="spotpick"]'); if (!sp) return 'no spotpick';
  await sp.click(); await P.settle(400);
  const row = await P.page.$('.c-sheet [data-sp]:not([data-sp=""])'); if (!row) return 'no player row';
  await row.click(); await P.settle(500);
  const run = await P.page.$('[data-lo="runnets"]:not([disabled])'); if (!run) return 'run nets disabled';
  await run.click(); await P.settle(600);
  return (await P.page.$('.wh-ov')) ? '' : 'no wheel overlay';
}

async function sceneSpot() {
  for (const [tag, src] of [['plain', noGuide(SAVES.train)], ['guide', SAVES.train]]) {
    const P = await newPage(src);
    const why = await openSpot(P); if (why) { MISSED.push('spot ' + tag + ': ' + why); await P.shot('spot-' + tag + '-fail'); await P.done(); return; }
    await P.shot('spot-' + tag + '-0idle');
    // full frames: early (STOP live), mid, inside the glow window, late; canvas crops every 0.25 s to see the tick on many slice colours
    const burst = []; for (let t = 1.25; t < 5.6; t += 0.5) burst.push(+t.toFixed(2));
    await spinFrames(P, 'spot-' + tag, [1.1, 2.4, 3.5, 4.6], burst);
    await P.done('spot-' + tag);
  }
}

async function openFind(P) {
  const card = await P.page.$('[data-act="sheet:activities"]'); if (!card) return 'no activities plate';
  await card.click(); await P.settle(500);
  const opt = await P.page.$('.c-sheet [data-cl-pick]:not([data-cl-pick="rest"])'); if (!opt) return 'no option';
  await opt.click(); await P.settle(300);
  const yes = await P.page.$('.c-sheet [data-cl-act="PickActivity"]:not([disabled])'); if (!yes) return 'Yes disabled';
  await yes.click(); await P.settle(500);
  return (await P.page.$('.wh-ov')) ? '' : 'no reel overlay';
}

async function sceneFind() {
  for (const [tag, src] of [['plain', noGuide(SAVES.hub2 || SAVES.hub)], ['guide', SAVES.hub2 || SAVES.hub]]) {
    const P = await newPage(src);
    const why = await openFind(P); if (why) { MISSED.push('find ' + tag + ': ' + why); await P.shot('find-' + tag + '-fail'); await P.done(); return; }
    await P.shot('find-' + tag + '-0idle');
    await spinFrames(P, 'find-' + tag, [0.9, 1.6, 2.4], [1.0, 1.3, 1.9, 2.2, 2.7]);
    await P.done('find-' + tag);
  }
}

async function sceneHype() {
  for (const [tag, src] of [['plain', noGuide(SAVES.md)], ['guide', SAVES.md]]) {
    const P = await newPage(src);
    if ((await P.stage()) !== 'matchday') { MISSED.push('hype: stage ' + (await P.stage())); await P.done(); return; }
    await P.page.click('[data-md="hype"]'); await P.settle(500);
    if (!(await P.page.$('.wh-ov'))) { MISSED.push('hype ' + tag + ': no dial overlay'); await P.done(); return; }
    await P.shot('hype-' + tag + '-0idle');
    await spinFrames(P, 'hype-' + tag, [0.9, 1.6, 2.4], [1.0, 1.3, 1.9, 2.2, 2.7]);
    await P.done('hype-' + tag);
  }
}

const SCENES = { hub: sceneHub, table: sceneTable, md: sceneMatchday, train: sceneTrain, spot: sceneSpot, find: sceneFind, hype: sceneHype };
for (const [k, f] of Object.entries(SCENES)) {
  if (!want(k)) continue; log('SCENE', k);
  try { await f(); } catch (e) { MISSED.push(k + ': threw ' + e.message.split('\n')[0]); log('  ERR', e.message.split('\n')[0]); }
}
writeFileSync(SHOTS + 'audit.json', JSON.stringify({ when: new Date().toISOString(), view: VIEW, dpr: DPR, made: MADE, missed: MISSED, notes: NOTES, audit: AUDIT }, null, 1));
log('made', MADE.length, 'shots; missed:', MISSED.length ? '\n  ' + MISSED.join('\n  ') : 'none');
await browser.close(); server.close();
