// P11 flow e2e at 344x780 (closed Fold): v4 save -> squad 8 -> one match + pay card -> training week (wheel, nets) -> stadium.
// Run from the app root:  node test/e2e/p11-flow.mjs        Env: E2E_REDUCE=1 (wheel gives an instant result), E2E_SOFT=1 (never exit 1), E2E_SHOTS=dir.
// Each numbered step reports PASS/FAIL on its own; the run continues past a failed step where it can.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/tmp/p11-shots/';
const REDUCE = process.env.E2E_REDUCE === '1';
const VIEW = { width: 344, height: 780 };
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const FIXTURE = (await readFile(join(ROOT, 'test/fixtures/v4-save-10.json'), 'utf8')).trim();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => { // random free port; pages are served under /cricket-sixes/
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* shots are optional */ }

// ---- in-page audit of a scope: tap targets >= 56, text >= 14, horizontal scroll ----
function auditInPage(scopeSel) {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
  const scope = (scopeSel && document.querySelector(scopeSel)) || document;
  const out = { hScroll: document.documentElement.scrollWidth > innerWidth + 1, small: [], tiny: [] };
  for (const e of scope.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect();
    if (r.height < 55.5 || r.width < 55.5) out.small.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const w = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(), e = n.parentElement; if (!t || !e || seen.has(e) || !vis(e) || e.closest('script,style,.sr-only,.ss-sr,[aria-hidden="true"]')) continue; seen.add(e);
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13.5) out.tiny.push(`${t.slice(0, 24)} ${fs}px`);
  }
  out.small = [...new Set(out.small)].slice(0, 8); out.tiny = [...new Set(out.tiny)].slice(0, 8);
  return out;
}

const results = []; // { n, name, ok, why }
const step = (n, name, ok, why) => { results.push({ n, name, ok: !!ok, why: ok ? '' : why || '' }); };
const fails = (n) => results.filter((r) => r.n === n && !r.ok);

// bare number next to a rating label (Coins/Fans/Medals/TP/score/week words are allowed)
const RATING_RE = /\b(power|technique|pace|craft|batting|bowling|ability|potential|rating|grade|skill|speed|overall|level)\b[^\n\d]{0,14}\b\d{1,3}\b/i;
const ALLOW_RE = /coins?|fans?|medals?|\bTP\b|training points|runs?|overs?|wickets?|week|season|match|seats?|stars?|\bx\d|league|stadium|facilit/i;
function ratingDigits(text) { return text.split('\n').map((l) => l.trim()).filter((l) => RATING_RE.test(l) && !ALLOW_RE.test(l)).slice(0, 6); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: REDUCE ? 'reduce' : 'no-preference' });
// seed the v4 save once (a flag stops reloads from overwriting the migrated save)
await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__p11fx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__p11fx', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) errs.push('network outside app: ' + r.url()); });
const settle = (ms = 250) => page.waitForTimeout(ms);
const stage = () => page.evaluate(() => (window.__store ? window.__store.get().stage : null));
const coins = () => page.evaluate(() => { const s = window.__store.get(); return s.econ ? s.econ.coins : null; });
const shot = async (name) => { try { await page.screenshot({ path: `${SHOTS}p11-${REDUCE ? 'rm-' : ''}${name}.png` }); } catch (e) { /* optional */ } };
async function audit(n, key, scopeSel) {
  const a = await page.evaluate(auditInPage, scopeSel || null);
  if (a.hScroll) step(n, `${key}: no horizontal scroll`, false, 'horizontal scroll');
  step(n, `${key}: taps >= 56px`, !a.small.length, a.small.join('; '));
  step(n, `${key}: text >= 14px`, !a.tiny.length, a.tiny.join('; '));
}
const clickCta = async () => { const b = (await page.$('.c-btn--cta:not([disabled])')) || (await page.$('.m0-ctabar button:not([disabled]):not(.hb-edit), .ctabar button:not([disabled])')); if (!b) return false; await b.click(); await settle(); return true; };
const text = (sel) => page.evaluate((q) => { const e = q ? document.querySelector(q) : document.body; return e ? e.innerText : ''; }, sel || null);

try {
  await page.goto(`${ORIGIN}/cricket-sixes/`); await settle(900);

  // ---- (1) v4 fixture loads as a squad of 8 with a .v4bak ----
  const st0 = await stage();
  step(1, 'boots to hub from the v4 save', st0 === 'hub', `stage is ${st0}`);
  const n8 = await page.evaluate(() => { const s = window.__store.get(); return s.clubs[0].squad.length; });
  step(1, 'game shows 8 players', n8 === 8, `${n8} players in the squad`);
  const hubText = await text();
  step(1, '"squad is now 8" line on the hub', /squad is now 8/i.test(hubText), 'line not found');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  step(1, 'a .v4bak key exists', keys.some((k) => /\.v4bak$/.test(k)), `keys: ${keys.join(',')}`);
  const bakV = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /\.v4bak$/.test(x)); try { return k ? JSON.parse(localStorage.getItem(k)).v : null; } catch (e) { return 'bad'; } });
  step(1, '.v4bak holds the untouched v4 save', bakV === 4, `v is ${bakV}`);
  await shot('01-hub');

  // ---- play one match (needed for steps 2 and 4); drive hub -> squad -> plan -> match -> done ----
  const coins0 = await coins();
  let steps = 0, payText = '', coinsDone = null, seenSquad = false;
  while (steps++ < 120) {
    const st = await stage();
    if (st === 'train') break;
    if (st === 'done') { // result screen with the pay card
      await settle(300); payText = await text(); coinsDone = await coins(); await shot('04-result');
      const star = await page.$('[data-pay-stars]'); if (star) { await star.click(); await settle(150); }
      await audit(6, 'result screen'); if (!(await clickCta())) break; continue;
    }
    if (st === 'hub' || st === 'semi' || st === 'final') { if (!(await clickCta())) { step(4, 'hub has an enabled CTA', false, 'none'); break; } }
    else if (st === 'squad') {
      if (!seenSquad) { seenSquad = true; const sq = await text(); const bad = ratingDigits(sq); step(3, 'no rating digits on the squad screen', !bad.length, bad.join(' | ')); await audit(6, 'squad screen'); await shot('03-squad'); }
      for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) break; await b.click(); await settle(80); }
      const c = await page.$('[data-confirm]:not([disabled])'); if (!c) { step(4, 'six can be picked from 8', false, 'Confirm stayed disabled'); break; } await c.click(); await settle();
    } else if (st === 'plan') {
      let go = await page.$('[data-start]:not([disabled])');
      if (!go) { const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; for (let k = 0; k < 10; k++) { await (await page.$(`[data-slot="${k}"]`)).click(); await (await page.$(`[data-bowler="${pat[k]}"]`)).click(); } go = await page.$('[data-start]:not([disabled])'); }
      if (!go) { step(4, 'plan can be started', false, 'Start match disabled'); break; } await go.click(); await settle(400);
    } else if (st === 'bowl' || st === 'break' || st === 'chase') {
      if (!(await clickCta())) { const r = await page.$('.sb-row:not([disabled]):not(.is-disabled)'); if (r) { await r.click(); await settle(100); } if (!(await clickCta())) { step(4, 'match can be tapped through', false, `stuck in ${st}`); break; } }
      await settle(250); await page.keyboard.press('Escape'); await settle(150);
    } else { step(4, 'known stage', false, `unknown stage ${st}`); break; }
  }

  // ---- (4) pay card + Coins ----
  step(4, 'pay card shows "Squad base" and 45', /Squad base/i.test(payText) && /\b45\b/.test(payText), 'Squad base / 45 not in the result screen');
  step(4, 'pay card shows Stars line', /Stars/i.test(payText), 'no Stars line');
  step(4, 'pay card shows Total', /Total/i.test(payText), 'no Total line');
  const coins1 = await coins();
  step(4, 'Coins changed after the match', coins0 != null && coins1 != null && coins1 !== coins0, `Coins ${coins0} -> ${coinsDone} -> ${coins1} (econ missing = ${coins0 == null})`);

  // ---- (2) training week ----
  const stT = await stage();
  step(2, 'reached the training week', stT === 'train', `stage is ${stT}`);
  if (stT === 'train') {
    await settle(400); await shot('02a-train'); await audit(6, 'training screen');
    const tipSkip = await page.$('.tr-tip [data-tip="skip"]'); if (tipSkip) { await tipSkip.click(); await settle(200); }
    const bowl = await page.$('[data-act="SetTrainPlan"][data-arg*="bowl"]'); const push = await page.$('[data-act="SetTrainPlan"][data-arg*="push"]');
    step(2, 'Focus and Effort buttons exist', !!(bowl && push), 'setPlan buttons missing');
    if (bowl) { await bowl.click(); await settle(150); } if (push) { const p2 = await page.$('[data-act="SetTrainPlan"][data-arg*="push"]'); if (p2) await p2.click(); await settle(150); }
    const plan = await page.evaluate(() => { const t = window.__store.get().training || {}; return JSON.stringify({ focus: t.focus, effort: t.effort, plan: t.plan || null, lastPlan: t.lastPlan || null }); });
    step(2, 'plan stored as bowl + push', /bowl/.test(plan) && /push/.test(plan), `plan ${plan}`);
    // spotlight one player
    const sp = await page.$('[data-lo="spotpick"]'); step(2, 'Spotlight row exists', !!sp, 'no [data-lo=spotpick]');
    if (sp) { await sp.click(); await settle(350); await audit(6, 'spotlight sheet', '.c-sheet'); const pick = await page.$('.c-sheet [data-sp]:not([data-sp=""])'); step(2, 'a player can be picked for Spotlight', !!pick, 'no [data-sp] rows'); if (pick) { await pick.click(); await settle(300); } }
    const spId = await page.evaluate(() => { const t = window.__store.get().training || {}; const lp = t.plan || {}; return lp.spotlightId || t.spotlightId || t.spotlight_id || null; });
    step(2, 'Spotlight stored in the plan', !!spId, 'spotlightId is empty');
    // squad rows on the training screen are letters only
    const tText = await text(); const bad3 = ratingDigits(tText); step(3, 'no rating digits on the training screen', !bad3.length, bad3.join(' | '));
    // run nets -> wheel
    const run = await page.$('[data-lo="runnets"]:not([disabled])'); step(2, 'Run nets enabled', !!run, 'disabled or missing');
    if (run) {
      await run.click(); await settle(500);
      const wheel = await page.$('.wh-ov'); step(2, 'wheel opens (layout A overlay)', !!wheel, 'no .wh-ov');
      if (wheel) {
        await audit(6, 'wheel overlay', '.wh-ov'); await shot('02b-wheel');
        const goTxt = () => page.$eval('.wh-ov [data-go]', (b) => b.textContent.trim());
        step(2, 'wheel button starts as SPIN', (await goTxt()) === 'SPIN', `button says ${await goTxt()}`);
        await page.click('.wh-ov [data-go]'); // SPIN
        if (REDUCE) {
          await settle(150); // instant: no STOP needed, result already visible
          const resShown = await page.$eval('.wh-ov [data-res]', (e) => !e.hidden && getComputedStyle(e).display !== 'none');
          step(7, 'reduced motion: one tap gives the result at once', resShown && (await goTxt()) === 'COLLECT', `res visible ${resShown}, button ${await goTxt()}`);
          const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
          step(7, 'reduced motion: no running CSS animations on the wheel', anim === 0, `${anim} running`);
        } else {
          await settle(3000); // wait for the slow zone (about 2.6 s)
          step(2, 'wheel button turns to STOP', (await goTxt()) === 'STOP', `button says ${await goTxt()}`);
          await page.click('.wh-ov [data-go]'); // STOP
          await page.waitForFunction(() => { const r = document.querySelector('.wh-ov [data-res]'); return r && !r.hidden; }, null, { timeout: 4000 }).catch(() => {});
        }
        const resTxt = await text('.wh-ov [data-res]'); const collect = (await goTxt()) === 'COLLECT';
        step(2, 'wheel result box shows a +gain and COLLECT', /\+\d/.test(resTxt) && collect, `res "${resTxt.slice(0, 60)}" button ${await goTxt()}`);
        await shot('02c-wheel-result'); await audit(6, 'wheel result', '.wh-ov');
        if (collect) { await page.click('.wh-ov [data-go]'); await settle(500); }
      }
      // nets scene
      const nets = await page.$('.ns-scene'); step(2, 'nets scene plays after the wheel', !!nets, 'no .ns-scene');
      if (nets) {
        await settle(REDUCE ? 100 : 4200); await shot('02d-nets');
        const lines = await page.$$eval('.ns-scene .t2-line:not(.t2-line--skip)', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
        step(2, 'nets lines exist', lines.length > 0, 'no .t2-line');
        step(2, 'nets lines show letters (A-F/S style)', lines.length > 0 && lines.every((l) => /\b[A-FS][+-]?\b/.test(l)), lines.slice(0, 2).join(' | '));
        const digits = lines.map((l) => l.replace(/Wheel \+\d+/gi, '').replace(/\bWeek \d+\b/g, '')).filter((l) => /\d/.test(l));
        step(2, 'nets lines have no rating digits', !digits.length, digits.slice(0, 2).join(' | '));
        await audit(6, 'nets scene', '.ns-scene');
        const skip = await page.$('.ns-scene .ns-skip'); if (skip) { await skip.click(); await settle(200); await page.click('.ns-scene .ns-skip').catch(() => {}); await settle(300); }
      }
      // End week
      const done = await page.$('[data-act="EndWeek"]'); step(2, 'End week (Done) button after nets', !!done, 'no [data-act=EndWeek]');
      if (done) { await done.click(); await settle(500); }
      const sAfter = await stage(); step(2, 'End week leaves training', sAfter !== 'train', `still ${sAfter}`);
      for (let i = 0; i < 4 && (await stage()) === 'week'; i++) { await clickCta(); }
    }
    // player sheet: letters only
    const rowBtn = await page.$('[data-act="sheet:player"]');
    if (rowBtn) { /* the training screen is gone after End week; the sheet is checked from the hub below */ }
  }

  // ---- (3) player sheet from the hub six / team sheet ----
  if ((await stage()) === 'hub') {
    const six = await page.$('.hb-p[data-act="sheet:team"]'); if (six) { await six.click(); await settle(400); const row = await page.$('.c-sheet [data-act="sheet:player"], .c-sheet .ts-row'); if (row) { await row.click(); await settle(400); } }
    const sheetTxt = await text('.c-sheet'); const bad = ratingDigits(sheetTxt);
    step(3, 'no rating digits in the team/player sheet', !bad.length, bad.join(' | ')); await audit(6, 'player/team sheet', '.c-sheet'); await shot('03b-sheet');
    for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await settle(150); }
  }

  // ---- (5) stadium view with 7 facility slots ----
  let via = 'hub button';
  let opener = await page.$('[data-act*="stadium" i]');
  if (!opener) { const all = await page.$$('button'); for (const b of all) { if (/stadium|ground|club money|coins/i.test((await b.innerText()) + (await b.getAttribute('aria-label') || ''))) { opener = b; break; } } }
  if (opener) { await opener.click(); await settle(500); }
  let slots = await page.$$('.ec-slot');
  if (!slots.length) { // not wired into the hub yet: mount the view directly on the live state (reported as a note)
    via = 'direct mount (no hub entry yet)';
    await page.evaluate(async () => { const m = await import('/cricket-sixes/js/ui/stadium-view.js'); const root = document.createElement('div'); root.id = 'p11-stadium'; document.getElementById('app').appendChild(root); m.renderStadium(root, window.__store.get(), () => {}); }).catch((e) => errs.push('stadium mount: ' + e.message));
    await settle(400); slots = await page.$$('.ec-slot');
  }
  step(5, `stadium shows 7 facility slots (${via})`, slots.length === 7, `${slots.length} .ec-slot found`);
  await shot('05-stadium'); await audit(6, 'stadium view', '.ec-stadium');

  for (const e of errs) step(8, 'no console/page errors, no network', false, e);
  if (!errs.length) step(8, 'no console/page errors, no network', true);
} catch (e) {
  step(0, 'script ran without throwing', false, e.stack || String(e));
} finally { await browser.close(); server.close(); }

const names = { 0: 'harness', 1: 'v4 load', 2: 'training week', 3: 'no rating digits', 4: 'match pay + Coins', 5: 'stadium', 6: 'tap/text sizes', 7: 'reduced motion', 8: 'errors' };
let bad = 0;
console.log(`p11-flow 344x780${REDUCE ? ' (reduced motion)' : ''}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.n} ${names[r.n]}] ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length} checks` : `PASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
