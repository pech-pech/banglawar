// T1 wave 4 QA shots: match wheel + one training wheel (Spotlight), pulse build. 344x882, deviceScaleFactor 1, Chromium (preinstalled, no installs).
// Run:  node pages/cricket-sixes/tools/qa-shots-t1.mjs
// Env:  QA_OUT=dir (default the t1/qa folder), QA_SEED=x. Never edits game source; no network except localhost (others aborted).
// Match wheel: pick, ready, spinning (1.5 s), glow window (3.15 preglow, 3.5, 3.8 s after SPIN), over-2 Auto-rest-disabled shot, STOP at 3.5 s, result (0.6 s and 3.0 s after STOP).
// Training wheel (Spotlight): ready, spinning, glow (3.5 s), result. Timings are the page clock from the SPIN click's event.timeStamp; shots take ~100 ms so the
// glow shots are taken 0.05 s early. out/audit.json lists per shot: buttons under 56 px, horizontal scroll, banned words, console errors.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = (process.env.QA_OUT || '/mnt/project-files/games-design/cricket-sixes/2026-11-16-combined-handoff/t1/qa/').replace(/\/?$/, '/');
const SEED = process.env.QA_SEED || 'qa-t1';
const VIEW = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
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
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const log = (...a) => console.log(...a);
const MADE = []; const MISSED = []; const AUDIT = {}; const ERRS = []; const BLOCKED = [];
const BAN = /(skip|quick[\s_-]?spin|spin[\s_-]?all|auto[\s_-]?stop|auto[\s_-]?over|coast|reduced|show[\s_-]?result)/i;

function auditInPage(banSrc) {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const out = { small: [], banned: [], buttons: [], hScroll: document.documentElement.scrollWidth > innerWidth + 1 };
  const ban = new RegExp(banSrc, 'i');
  for (const e of document.querySelectorAll('button, [role="button"], a[href], input, summary')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); const t = (e.innerText || e.getAttribute('aria-label') || e.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 30);
    out.buttons.push(`${t} ${Math.round(r.width)}x${Math.round(r.height)}`); if (r.height < 55.5 || r.width < 55.5) out.small.push(`${t} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const e of document.querySelectorAll('#app *')) {
    const bits = [[...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').trim(), ...[...e.attributes].filter((a) => ['class', 'id', 'title', 'aria-label'].includes(a.name) || a.name.startsWith('data-')).map((a) => a.value)];
    for (const b of bits) if (b && ban.test(b)) out.banned.push((e.tagName.toLowerCase() + ': ' + b).slice(0, 80));
  }
  out.banned = [...new Set(out.banned)].slice(0, 10);
  return out;
}

async function newPage(tag) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); BLOCKED.push(u); return route.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  await page.addInitScript(() => { window.__clk = []; document.addEventListener('click', (e) => window.__clk.push(e.timeStamp), true); });
  page.on('pageerror', (e) => ERRS.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|net::ERR_FAILED/.test(m.text())) ERRS.push(`[${tag}] console: ${m.text()}`); });
  const P = {
    ctx, page,
    settle: (ms = 250) => page.waitForTimeout(ms),
    S: (fn, arg) => page.evaluate(fn, arg),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    async shot(name) { const a = await page.evaluate(auditInPage, BAN.source).catch((e) => ({ err: e.message })); await page.screenshot({ path: OUT + name + '.png' }); AUDIT[name] = a; MADE.push(name); log('  shot', name); },
    async clickText(re) { return page.evaluate((src) => { const re = new RegExp(src[0], src[1]); for (const e of document.querySelectorAll('button, [role="button"]')) { const r = e.getBoundingClientRect(); if (r.width > 0 && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !e.closest('[hidden]') && re.test((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))) { e.click(); return true; } } return false; }, [re.source, re.flags]); },
  };
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await P.settle(800);
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await P.settle(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await P.settle(400); } }
  return P;
}
/** Store-command driver (as tools/wheelmatch-shots.mjs): run stages until pred(state). Wheel overs go through WheelOver {auto:true}. */
function drive(P, stopFn, guardN = 900) {
  return P.page.evaluate(([src, guardN]) => {
    const stop = new Function('s', 'return (' + src + ')(s)'); const S = window.__store; let g = 0;
    while (!stop(S.get()) && g++ < guardN) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p || {}), was = JSON.stringify([s.stage, s.season && s.season.week, s.innings && s.innings.length]); const wheel = s.mode === 'wheel';
      if (s.matchMode !== 'wheel' && !['bowl', 'break', 'chase', 'done'].includes(s.stage)) d('SetMatchMode', { mode: 'wheel' });
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'matchday': d('MatchdayGo'); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'wheel' }); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': if (wheel) d('WheelOver', { auto: true }); else d('BowlOver'); break;
        case 'break': d('StartChase'); break;
        case 'chase': if (wheel) d('WheelOver', { auto: true }); else d('BowlOver', { intent: 'R' }); break;
        case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'train': d('EndWeek'); break;
        case 'end': d('NewSeason'); break; case 'runend': d('NewRun', {}); break;
        default: return 'stuck:' + s.stage;
      }
      if (JSON.stringify([S.get().stage, S.get().season && S.get().season.week, S.get().inn2 && S.get().inn2.balls]) === was && ['hub', 'squad', 'plan', 'train', 'week', 'done', 'matchday'].includes(S.get().stage)) { d('DismissNotice'); d('PassScout'); d('DismissTierUp'); d('PickActivity', { id: 'rest' }); }
    }
    return S.get().stage;
  }, [stopFn.toString(), guardN]);
}
/** Page clock: t0 = the SPIN click's own event.timeStamp (performance.now() clock, read back from the page); waits poll performance.now() in the page. */
const spinTs = (P) => P.page.evaluate(() => window.__clk[window.__clk.length - 1]);
const pageWait = (P, ts, secs) => P.page.waitForFunction(([t, s]) => performance.now() >= t + s * 1000, [ts, secs], { polling: 'raf', timeout: 0 });
const wait = async (t0, secs) => { const w = secs * 1000 - (Date.now() - t0); if (w > 0) await new Promise((r) => setTimeout(r, w)); }; // wall time: only for gaps after STOP

// ---------------------------------------------------------------- match wheel
async function matchWheel() {
  log('match wheel');
  const P = await newPage('match');
  const st = await drive(P, (s) => s.stage === 'bowl'); if (st !== 'bowl') { MISSED.push('match: stage ' + st); await P.ctx.close(); return; }
  await P.page.reload(); await P.settle(1000);
  await P.shot('m0-bowl-pick');
  const pickRow = await P.page.$('.wm-brow[data-bowler]:not([aria-disabled="true"])'); if (pickRow && !(await P.page.$('.wm-brow[aria-checked="true"]'))) await pickRow.click();
  if (!(await P.clickText(/^BOWL OVER\b/i))) { MISSED.push('match: no BOWL OVER'); await P.ctx.close(); return; }
  await P.settle(500); await P.shot('m1-wheel-ready');
  if (!(await P.clickText(/^SPIN\b/i))) { MISSED.push('match: no SPIN'); await P.ctx.close(); return; }
  const t0 = await spinTs(P);
  for (const [name, at] of [['m2-spinning-1_5s', 1.5], ['m3-preglow-3_15s', 3.15], ['m3-glow-3_5s', 3.45], ['m3-glow-3_8s', 3.75]]) { await pageWait(P, t0, at); await P.shot(name); }
  await pageWait(P, t0, 3.5 + 0.35); // glow shots cost time; STOP is a tap, any time past 3.5 s is fine for the result shots
  const stopAt = Date.now(); const ok = await P.clickText(/^STOP/i); if (!ok) MISSED.push('match: STOP not tappable at 3.9 s');
  await P.settle(600); await P.shot('m4-result-0_6s'); await wait(stopAt, 3.5); await P.shot('m5-result-3s');
  await P.ctx.close();
}

// ---------------------------------------------------------------- match wheel, over 2+: "Auto rest of innings" disabled while the wheel spins
async function matchAutoDisabled() {
  log('match wheel over 2+ (Auto rest disabled while spinning)');
  const P = await newPage('match-auto');
  const st = await drive(P, (s) => s.stage === 'bowl'); if (st !== 'bowl') { MISSED.push('auto: stage ' + st); await P.ctx.close(); return; }
  await P.S(() => window.__store.dispatch('WheelOver', { auto: true })); // over 1 played; the next bowl screen is over 2
  await P.page.reload(); await P.settle(1000);
  const pickRow = await P.page.$('.wm-brow[data-bowler]:not([aria-disabled="true"])'); if (pickRow && !(await P.page.$('.wm-brow[aria-checked="true"]'))) await pickRow.click();
  const idle = await P.page.$('[data-wm="auto-rest"]'); if (!idle) MISSED.push('auto: no "Auto rest of innings" button on the over-2 pick screen');
  if (!(await P.clickText(/^BOWL OVER\b/i))) { MISSED.push('auto: no BOWL OVER'); await P.ctx.close(); return; }
  await P.settle(500);
  if (!(await P.clickText(/^SPIN\b/i))) { MISSED.push('auto: no SPIN'); await P.ctx.close(); return; }
  const t0 = await spinTs(P); await pageWait(P, t0, 1.5);
  const a = await P.page.evaluate(() => { const b = document.querySelector('[data-wm="auto-rest"]'); return b ? { disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', text: b.innerText.trim() } : null; });
  await P.shot('m6-auto-rest-disabled-spinning');
  if (!a) MISSED.push('auto: Auto rest button not visible while spinning'); else if (!a.disabled) MISSED.push('auto: Auto rest button is NOT disabled while spinning');
  else log('  auto rest disabled while spinning: ok');
  await P.ctx.close();
}

// ---------------------------------------------------------------- training wheel (Spotlight)
async function trainingWheel() {
  log('training wheel (Spotlight)');
  const P = await newPage('train');
  const st = await drive(P, (s) => s.stage === 'train', 1500); if (st !== 'train') { MISSED.push('train: stage ' + st); await P.ctx.close(); return; }
  const pid = await P.S(() => { const s = window.__store.get(); const sq = s.clubs[0].squad; const p = sq.find((x) => x.id) || sq[0]; window.__store.dispatch('SetTrainPlan', { spotlightId: p.id }); return p.id; });
  await P.page.reload(); await P.settle(1000);
  for (let k = 0; k < 4 && (await P.page.$('.c-sheet, .sheet-fixed, .tr-tip')); k++) { const sk = await P.page.$('.tr-tip [data-tip="skip"]'); if (sk) await sk.click(); else await P.page.keyboard.press('Escape'); await P.settle(250); }
  await P.shot('t0-training');
  const run = await P.page.$('[data-lo="runnets"]:not([disabled])'); if (!run) { MISSED.push('train: no runnets button (spotlight ' + pid + ')'); await P.ctx.close(); return; }
  await run.click(); await P.settle(900);
  if (!(await P.page.$('.wh-ov'))) { MISSED.push('train: no wheel overlay after Run nets'); await P.shot('t-nowheel'); await P.ctx.close(); return; }
  await P.shot('t1-wheel-ready');
  const spinTap = () => P.page.evaluate(() => { const b = document.querySelector('.wh-ov [data-go]') || [...document.querySelectorAll('.wh-ov button')].find((x) => /^SPIN/i.test(x.innerText)); if (b && !b.disabled) { b.click(); return true; } return false; });
  if (!(await spinTap())) { MISSED.push('train: SPIN not tappable'); await P.ctx.close(); return; }
  const t0 = await spinTs(P);
  await pageWait(P, t0, 1.5); await P.shot('t2-spinning-1_5s');
  await pageWait(P, t0, 3.45); await P.shot('t3-glow-3_5s');
  await pageWait(P, t0, 3.9); const stopped = await spinTap(); if (!stopped) MISSED.push('train: STOP not tappable at 3.9 s');
  const sAt = Date.now(); await P.settle(700); await P.shot('t4-result-0_7s'); await wait(sAt, 3.5); await P.shot('t5-result-3s');
  await P.ctx.close();
}

try { await matchWheel(); } catch (e) { MISSED.push('match wheel threw: ' + (e.message || e)); }
try { await matchAutoDisabled(); } catch (e) { MISSED.push('auto-rest shot threw: ' + (e.message || e)); }
try { await trainingWheel(); } catch (e) { MISSED.push('training wheel threw: ' + (e.message || e)); }
const bad = Object.entries(AUDIT).filter(([, a]) => a && ((a.small || []).length || (a.banned || []).length || a.hScroll)).map(([k, a]) => `${k}: small[${(a.small || []).join('; ')}] banned[${(a.banned || []).join('; ')}] hScroll=${a.hScroll}`);
writeFileSync(OUT + 'audit.json', JSON.stringify({ viewport: VIEW, dpr: 1, made: MADE, missed: MISSED, networkBlocked: BLOCKED, errors: ERRS, flagged: bad, audit: AUDIT }, null, 1));
log(`made ${MADE.length} shots, missed ${MISSED.length}, flagged ${bad.length}, errors ${ERRS.length}, blocked requests ${BLOCKED.length}; out ${OUT}`);
MISSED.forEach((m) => log('  MISSED', m)); bad.forEach((b) => log('  FLAG', b.slice(0, 220)));
await browser.close(); server.close();
