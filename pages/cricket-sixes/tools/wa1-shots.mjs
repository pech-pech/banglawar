// wa1 visual-QA screenshot harness (agent "vqa"). Fold cover 475x638, deviceScaleFactor 1, Chromium.
// Run from anywhere:  node pages/cricket-sixes/tools/wa1-shots.mjs      Env: WA1_SHOTS=dir (default build/wa1/shots), WA1_ONLY=train,find,hype,... (subset)
// 1. GEN: one fresh game (?seed=wa1qa) is patched the way a long player would look (full power tree, all Craft, tokens, 3 coaches, one away, coins)
//    and saved at 4 points: hub, matchday, train, semi result. 2. Each scene starts a fresh context and injects one of those saves into localStorage
//    (addInitScript, as test/e2e/p11-flow.mjs does), then reaches the screen by real taps and captures it. audit.json lists small taps / clipped text per shot.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOTS = (process.env.WA1_SHOTS || '/mnt/project-files/games-design/cricket-sixes/build/wa1/shots/').replace(/\/?$/, '/');
const ONLY = (process.env.WA1_ONLY || 'find,hype,toss,pep,scout,finals').split(',').filter(Boolean);
const VIEW = { width: 475, height: 638 };
const SEED = 'wa1qa';
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
const AUDIT = {}; const MADE = []; const MISSED = [];

// ---- in-page audit: taps < 44, text cut by its box, text outside the viewport, scope = top overlay / sheet / app
function auditInPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 48);
  const ovs = [...document.querySelectorAll('.wh-ov, .wk-ov, .c-sheet')].filter(vis); const scope = ovs[ovs.length - 1] || document.getElementById('app') || document.body;
  const out = { scope: scope.className || scope.id, small: [], clipped: [], offscreen: [], tiny: [] };
  for (const e of scope.querySelectorAll('button, a[href], [role="button"], input, select')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.small.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const e of scope.querySelectorAll('*')) {
    if (!vis(e) || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if ((cs.overflow.includes('hidden') || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)) out.clipped.push(`${label(e)} ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
    if (r.right > innerWidth + 1 || r.left < -1) out.offscreen.push(`${label(e)} x ${Math.round(r.left)}..${Math.round(r.right)}`);
    const fs = parseFloat(cs.fontSize); if (fs < 12.5) out.tiny.push(`${label(e).slice(0, 24)} ${fs}px`);
  }
  for (const k of ['small', 'clipped', 'offscreen', 'tiny']) out[k] = [...new Set(out[k])].slice(0, 14);
  return out;
}

async function newPage(saveText, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (saveText) await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__wa1fx')) { localStorage.clear(); localStorage.setItem('cs.save.1', fx); localStorage.setItem('__wa1fx', '1'); } } catch (e) { /* blocked */ } }, saveText);
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
      await page.screenshot({ path: SHOTS + 'wa1-' + name + '.png' }); AUDIT[name] = a; MADE.push(name); log('  shot', name);
    },
    async done() { if (errs.length) AUDIT['_errors_' + Date.now()] = errs.slice(0, 10); await ctx.close(); },
  };
  await page.goto(URL0); await P.settle(900);
  return P;
}

// ---- in-page command driver (as w1 qa-scripts/h.mjs): drive stages until pred(state) is true
async function drive(P, stopFn, guardN = 900) {
  return P.page.evaluate(([src, guardN]) => {
    const stop = new Function('s', 'return (' + src + ')(s)');
    const S = window.__store; let g = 0, trail = [];
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
      if (trail.length < 400) trail.push(S.get().stage);
      if (JSON.stringify([S.get().stage, S.get().season && S.get().season.week]) === was && ['hub', 'squad', 'plan', 'train', 'week', 'done', 'matchday'].includes(S.get().stage)) {
        // no progress: try the general fallbacks once
        d('DismissNotice'); d('PassScout'); d('DismissTierUp'); d('PickActivity', { id: 'rest' });
      }
    }
    return S.get().stage;
  }, [stopFn.toString(), guardN]);
}

// ---- the long-player patch (full power tree, all Craft, tokens, coaches, coins)
function patchState(s, NODES) {
  const m = s.wheelMeta || {};
  m.tally = 600; m.spokes = 40; m.spent = 9999; m.tierSeen = 7; m.tierUpQueue = []; m.tokUsed = {}; m.matchTokUsed = { key: '', n: 0 }; m.spotTokensUsed = 0;
  m.owned = {}; const craft = {};
  for (const n of NODES) { if (n.branch === 'craft') craft[n.id] = n.max_rank; else m.owned[n.id] = n.max_rank; }
  m.tokens = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }; m.tokSeason = (s.season && s.season.n) || 1;
  s.wheelMeta = m; s.wheelCraft = { ...(s.wheelCraft || {}), owned: craft };
  if (s.econ) s.econ.coins = Math.max(s.econ.coins | 0, 6000);
  return s;
}
async function patchAndReload(P, extra) {
  await P.page.evaluate(async (extra) => {
    const { NODES } = await import('/cricket-sixes/js/data/wheelmeta.js');
    const s = structuredClone(window.__store.get());
    const m = s.wheelMeta || {};
    m.tally = 600; m.spokes = 40; m.spent = 9999; m.tierSeen = 7; m.tierUpQueue = []; m.tokUsed = {}; m.matchTokUsed = { key: '', n: 0 }; m.spotTokensUsed = 0;
    m.owned = {}; const craft = {};
    for (const n of NODES) { if (n.branch === 'craft') craft[n.id] = n.max_rank; else m.owned[n.id] = n.max_rank; }
    m.tokens = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }; m.tokSeason = (s.season && s.season.n) || 1;
    s.wheelMeta = m; s.wheelCraft = { ...(s.wheelCraft || {}), owned: craft };
    if (s.econ) s.econ.coins = Math.max(s.econ.coins | 0, 6000);
    if (extra && extra.coaches) { // 3 slots: picked (bat), away (bowl, back next week), and one empty
      const cs = (s.coaches || []).filter((c) => !c.candidate);
      const base = cs[0] || { id: 'c1', name: 'Coach' };
      s.coaches = [{ ...base, step: 7, strong: ['bat', 'bal'], away: 0, courseSeason: null }, { id: 'cqa2', name: 'Bilal Rana', step: 5, strong: ['bowl'], away: 1, courseSeason: (s.season && s.season.n) || 1 }];
      if (extra.coaches === 3) s.coaches.push({ id: 'cqa3', name: 'Tom Ashworth-Lee', step: 3, strong: ['bowl', 'bat'], away: 0, courseSeason: null });
    }
    window.__save.save(s);
  }, extra || null);
  await P.page.reload(); await P.settle(900);
}
const saveText = (P) => P.page.evaluate(() => localStorage.getItem('cs.save.1'));
const withSalt = (txt, salt) => { const o = JSON.parse(txt); const st = o.state || o.s || o; if (st && 'salt' in st) st.salt = salt; return JSON.stringify(o); };
/** Find with no find help (so a no-find + its token offer can show): drop Widener, Extra Gold, the Find specialist nodes, Control; keep tokens. */
const lessFind = (txt, salt) => { const o = JSON.parse(withSalt(txt, salt)); const st = o.state || o.s || o; const ow = st.wheelMeta.owned; for (const k of ['f_wide', 'f_extra', 'f_boost', 'f_bigb', 'sp_fnd_n', 'sp_fnd_r']) delete ow[k]; return JSON.stringify(o); };

// ---- GEN
log('GEN saves');
const SAVES = {};
{
  const P = await newPage(null);
  const pick = await P.page.$('[data-cl-pick]'); if (pick) { await pick.click(); await P.settle(200); const t = await P.page.$('[data-cl-act="TakeFreePick"]'); if (t) { await t.click(); await P.settle(400); } }
  await drive(P, (s) => s.stage === 'hub'); await patchAndReload(P, { coaches: 2 });
  SAVES.hub = await saveText(P); log('  hub', await P.stage());
  await drive(P, (s) => s.stage === 'matchday'); await P.settle(200); SAVES.md = await saveText(P); log('  matchday', await P.stage());
  await drive(P, (s) => s.stage === 'train'); await patchAndReload(P, { coaches: 2 }); SAVES.train = await saveText(P); log('  train', await P.stage(), JSON.stringify(await P.S(() => (window.__store.get().coaches || []).map((c) => [c.name, c.away]))));
  // hub of week 2 (activities open again, Find with the full tree)
  await drive(P, (s) => s.stage === 'hub'); await patchAndReload(P, null); SAVES.hub2 = await saveText(P); log('  hub2', await P.stage());
  // the semi result: play the season through by command
  const st = await drive(P, (s) => s.stage === 'done' && s.fixture && (s.fixture.kind === 'semi' || s.fixture.kind === 'final'), 6000);
  log('  semi?', st, JSON.stringify(await P.S(() => { const s = window.__store.get(); return { k: s.fixture && s.fixture.kind, season: s.season && s.season.n }; })));
  if (st === 'done') { await patchAndReload(P, null); SAVES.semi = await saveText(P); }
  await P.done();
}
writeFileSync(SHOTS + 'saves.json', JSON.stringify(Object.fromEntries(Object.entries(SAVES).map(([k, v]) => [k, v ? v.length : 0]))));
const want = (n) => !ONLY.length || ONLY.includes(n);

// ---- helpers for wheels
const goTxt = (P) => P.page.$eval('.wh-ov [data-go]', (b) => b.textContent.trim()).catch(() => '');
async function waitGo(P, re, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await goTxt(P))) return true; await P.settle(100); } return false; }
async function waitRes(P, ms = 9000) { return P.page.waitForFunction(() => { const r = document.querySelector('.wh-ov [data-res]'); return r && !r.hidden; }, null, { timeout: ms }).then(() => true).catch(() => false); }
const tokBtns = (P) => P.page.$$eval('.wh-ov .wh-tk', (b) => b.map((x) => x.textContent.trim())).catch(() => []);

// ---- SCENES
async function sceneTrain() {
  for (const variant of [2, 3]) {
    const P = await newPage(SAVES.train);
    if (variant === 3) { await patchAndReload(P, { coaches: 3 }); }
    const tip = await P.page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await P.settle(200); }
    await P.shot(`train-strip-${variant}coaches`);
    if (variant === 2) {
      const pick = await P.page.$('.ct-slot:not(.is-away) [data-ct="pick"]');
      if (pick) { await pick.click(); await P.settle(300); await P.shot('train-strip-picked'); }
      await P.page.evaluate(() => window.scrollTo(0, 99999)); await P.settle(200); await P.shot('train-scrolled-bottom');
      await P.page.evaluate(() => window.scrollTo(0, 0));
      const away = await P.page.$('.ct-slot.is-away'); if (away) { await away.screenshot({ path: SHOTS + 'wa1-crop-away-coach.png' }); MADE.push('crop-away-coach'); }
      const sc = await P.page.$('[data-ct="scout"]'); if (sc) { await sc.click(); await P.settle(500); await P.shot('train-scout-list'); }
    }
    await P.done();
  }
}

async function sceneFind() {
  const src = SAVES.hub2 || SAVES.hub;
  for (let attempt = 0; attempt < 6; attempt++) {
    const P = await newPage(attempt ? lessFind(src, 'qa' + attempt) : src);
    const card = await P.page.$('[data-act="sheet:activities"]');
    if (!card) { log('  find: no activities card on hub', await P.stage()); MISSED.push('find: no activities card'); await P.done(); return; }
    await card.click(); await P.settle(500);
    if (!attempt) await P.shot('find-0sheet');
    const opt = await P.page.$('.c-sheet [data-cl-pick]:not([data-cl-pick="rest"])');
    if (!opt) { MISSED.push('find: no option'); await P.done(); return; }
    await opt.click(); await P.settle(300);
    const yes = await P.page.$('.c-sheet [data-cl-act="PickActivity"]:not([disabled])');
    if (!yes) { MISSED.push('find: Yes disabled'); if (!attempt) await P.shot('find-0confirm-disabled'); await P.done(); return; }
    await yes.click(); await P.settle(500);
    if (!(await P.page.$('.wh-ov'))) { MISSED.push('find: no big wheel overlay (old tap?)'); await P.shot('find-nowheel'); await P.done(); return; }
    if (!attempt) await P.shot('find-1idle');
    await P.page.click('.wh-ov [data-go]'); await P.settle(700);
    if (!attempt) await P.shot('find-2spin');
    await waitGo(P, /STOP/i, 6000); await P.settle(attempt * 233);
    if (!attempt) await P.shot('find-3stop-ready');
    await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(900);
    if (!attempt) await P.shot('find-4landing');
    await waitRes(P); await P.settle(400);
    const tk = await tokBtns(P), res = await P.page.$eval('.wh-ov [data-res]', (e) => e.innerText).catch(() => '');
    log('  find attempt', attempt, JSON.stringify(res), tk);
    await P.shot('find-5result' + (tk.length ? '-tokens' : '') + (attempt ? '-a' + attempt : ''));
    if (tk.length) {
      await P.page.click('.wh-ov .wh-tk'); await P.settle(500); await P.shot('find-6token-replay'); await waitRes(P); await P.settle(2600); await P.shot('find-7token-outcome');
      await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600); await P.shot('find-8after-collect');
      await P.done(); return;
    }
    await P.done();
  }
}

async function sceneHype() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const P = await newPage(SAVES.md);
    if ((await P.stage()) !== 'matchday') { MISSED.push('hype: not matchday ' + (await P.stage())); await P.done(); return; }
    if (!attempt) await P.shot('md-0screen');
    await P.page.click('[data-md="hype"]'); await P.settle(500);
    if (!attempt) await P.shot('hype-1idle');
    await P.page.click('.wh-ov [data-go]'); await P.settle(400);
    await waitGo(P, /STOP/i, 6000); await P.settle(40 + attempt * 137);
    if (!attempt) await P.shot('hype-2aim-guide');
    await P.page.click('.wh-ov [data-go]').catch(() => {}); await waitRes(P); await P.settle(500);
    const tk = await tokBtns(P);
    log('  hype attempt', attempt, tk);
    if (tk.length || attempt === 7) {
      await P.shot('hype-3result' + (tk.length ? '-token-offer' : '-no-offer'));
      if (tk.length) {
        const lift = await P.page.$('.wh-ov .wh-tk');
        await lift.click(); await P.settle(400); await P.shot('hype-4token-replay'); await waitRes(P); await P.settle(1800); await P.shot('hype-5token-outcome');
        await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600); await P.shot('hype-6md-after');
      }
      await P.done(); return;
    }
    await P.done();
  }
}

async function sceneToss() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const P = await newPage(attempt ? withSalt(SAVES.md, 'tq' + attempt) : SAVES.md);
    if ((await P.stage()) !== 'matchday') { MISSED.push('toss: not matchday'); await P.done(); return; }
    await P.page.click('[data-md="toss"]'); await P.settle(500);
    if (!attempt) await P.shot('toss-1idle');
    await P.page.click('.wh-ov [data-go]'); await P.settle(900);
    if (!attempt) await P.shot('toss-2flip');
    await waitRes(P); await P.settle(500);
    const tk = await tokBtns(P); log('  toss attempt', attempt, tk);
    if (tk.length || attempt === 7) {
      await P.shot('toss-3result' + (tk.length ? '-token-offer' : '-no-offer'));
      if (tk.length) {
        await P.page.click('.wh-ov .wh-tk'); await P.settle(500); await P.shot('toss-4token-replay'); await waitRes(P); await P.settle(3000); await P.shot('toss-5token-outcome');
        await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600);
        // the match cap: now Pep shows no token (1 a match day)
        const pep = await P.page.$('[data-md="pep"]'); if (pep) { await pep.click(); await P.settle(500); await P.page.click('.wh-ov [data-go]'); await waitRes(P); await P.settle(600); await P.shot('toss-6pep-after-cap'); }
      }
      await P.done(); return;
    }
    await P.done();
  }
}

async function scenePep() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const P = await newPage(attempt ? withSalt(SAVES.md, 'pq' + attempt) : SAVES.md);
    if ((await P.stage()) !== 'matchday') { MISSED.push('pep: not matchday'); await P.done(); return; }
    await P.page.click('[data-md="pep"]'); await P.settle(500);
    if (!attempt) await P.shot('pep-1idle');
    await P.page.click('.wh-ov [data-go]'); await P.settle(1100);
    if (!attempt) await P.shot('pep-2lights');
    await waitRes(P); await P.settle(500);
    const tk = await tokBtns(P); log('  pep attempt', attempt, tk);
    if (tk.length || attempt === 7) {
      await P.shot('pep-3result' + (tk.length ? '-token-offer' : '-no-offer'));
      if (tk.length) { await P.page.click('.wh-ov .wh-tk'); await P.settle(500); await waitRes(P); await P.settle(3000); await P.shot('pep-4token-outcome'); }
      await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600); await P.shot('pep-5md-after');
      await P.done(); return;
    }
    await P.done();
  }
}

async function sceneScout() {
  const P = await newPage(SAVES.train);
  const tip = await P.page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await P.settle(200); }
  const info = await P.S(async () => { const sel = await import('/cricket-sixes/js/store/selectors.js'); const v = sel.coachPickVM ? sel.coachPickVM(window.__store.get()) : null; return v ? { open: v.open, spin: !!v.spin, spun: v.spin && v.spin.spun, why: v.why } : null; }).catch((e) => ({ err: e.message }));
  log('  scout vm', JSON.stringify(info));
  const sc = await P.page.$('[data-ct="scout"]'); if (sc) { await sc.click(); await P.settle(700); }
  if (!(await P.page.$('.wh-ov'))) { const b = await P.page.$('[data-scoutspin]'); if (b) { await b.click(); await P.settle(600); } }
  if (!(await P.page.$('.wh-ov'))) { MISSED.push('scout: reel did not open ' + JSON.stringify(info)); await P.shot('scout-noreel'); await P.done(); return; }
  await P.shot('scout-1idle');
  await P.page.click('.wh-ov [data-go]'); await P.settle(1200); await P.shot('scout-2spin');
  await waitRes(P); await P.settle(500);
  const tk = await tokBtns(P); log('  scout', tk);
  await P.shot('scout-3result' + (tk.length ? '-token-offer' : ''));
  if (tk.length) { await P.page.click('.wh-ov .wh-tk'); await P.settle(500); await waitRes(P); await P.settle(3300); await P.shot('scout-4token-outcome'); }
  await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600); await P.shot('scout-5list-after');
  await P.done();
}

async function sceneFinals() {
  if (!SAVES.semi) { MISSED.push('finals: no semi result save (season never reached a semi)'); return; }
  for (let attempt = 0; attempt < 6; attempt++) {
    const P = await newPage(attempt ? withSalt(SAVES.semi, 'fq' + attempt) : SAVES.semi);
    if (!attempt) await P.shot('finals-0result-screen');
    const b = await P.page.$('[data-finals-spin]');
    if (!b) { MISSED.push('finals: no [data-finals-spin] on ' + (await P.stage())); await P.done(); return; }
    await b.click(); await P.settle(500);
    if (!attempt) await P.shot('finals-1idle');
    await P.page.click('.wh-ov [data-go]'); await P.settle(1300);
    if (!attempt) await P.shot('finals-2spin');
    await waitRes(P); await P.settle(500);
    const tk = await tokBtns(P); log('  finals attempt', attempt, tk);
    if (tk.length || attempt === 5) {
      await P.shot('finals-3result' + (tk.length ? '-token-offer' : '-no-offer'));
      if (tk.length) { await P.page.click('.wh-ov .wh-tk'); await P.settle(500); await waitRes(P); await P.settle(3300); await P.shot('finals-4token-outcome'); }
      await P.page.click('.wh-ov [data-go]').catch(() => {}); await P.settle(600); await P.shot('finals-5result-after');
      await P.done(); return;
    }
    await P.done();
  }
}

async function sceneWorkshop() {
  const P = await newPage(SAVES.hub);
  const w = await P.page.$('[data-act="sheet:workshop"]');
  if (!w) { MISSED.push('workshop: no hub button'); await P.shot('workshop-nohub'); await P.done(); return; }
  await w.click(); await P.settle(700); await P.shot('workshop-0open');
  const tabs = await P.page.$$('.wk-tab');
  for (let i = 0; i < tabs.length; i++) {
    const t = (await P.page.$$('.wk-tab'))[i]; const name = (await t.innerText()).trim().toLowerCase().replace(/[^a-z]/g, '') || 'tab' + i;
    await t.click(); await P.settle(350); await P.shot('workshop-tab-' + name);
    await P.page.evaluate(() => { const s = document.querySelector('.wk-ov .wk-body, .wk-ov [class*=scroll], .wk-ov'); if (s) s.scrollTop = 99999; }); await P.settle(200); await P.shot('workshop-tab-' + name + '-bottom');
  }
  // node sheets with the wa1 text: Fortune tokens + a Control node + Find specialist
  const ids = ['f_respin', 'f_floor', 'f_lift', 'c_guide', 'c_slow', 'sp_fnd_n'];
  const words = await P.S(async (ids) => { const { NODES } = await import('/cricket-sixes/js/data/wheelmeta.js'); return ids.map((id) => { const n = NODES.find((x) => x.id === id); return n ? id + ': ' + (n.name || '') + ' | ' + (n.words || n.text || '') : id + ': missing'; }); }, ids);
  AUDIT._nodeWords = words;
  for (const id of ids) {
    const row = await P.page.$(`.wk-ov [data-node="${id}"], .wk-ov [data-id="${id}"], .wk-ov [data-arg*="${id}"]`);
    if (!row) { continue; }
    const tab = await P.page.$$('.wk-tab'); // the node may sit on another tab
    await row.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await row.isVisible())) continue;
    await row.click(); await P.settle(400); await P.shot('workshop-node-' + id);
    await P.page.keyboard.press('Escape'); await P.settle(250);
    if (!(await P.page.$('.wk-ov'))) { await (await P.page.$('[data-act="sheet:workshop"]')).click(); await P.settle(500); }
    void tab;
  }
  await P.done();
}

const SCENES = { train: sceneTrain, find: sceneFind, hype: sceneHype, toss: sceneToss, pep: scenePep, scout: sceneScout, finals: sceneFinals, workshop: sceneWorkshop };
for (const [k, f] of Object.entries(SCENES)) {
  if (!want(k)) continue; log('SCENE', k);
  try { await f(); } catch (e) { MISSED.push(k + ': threw ' + e.message.split('\n')[0]); log('  ERR', e.message.split('\n')[0]); }
}
writeFileSync(SHOTS + 'audit.json', JSON.stringify({ when: new Date().toISOString(), made: MADE, missed: MISSED, audit: AUDIT }, null, 1));
log('made', MADE.length, 'shots; missed:', MISSED.length ? '\n  ' + MISSED.join('\n  ') : 'none');
await browser.close(); server.close();
