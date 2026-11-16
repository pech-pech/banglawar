// Wheel match, pulse build (2026-11-16 wave 4): no coast, no skip, no Auto over, no reduced motion. Real browser, 475x638.
// Run from the app root:  node test/e2e/wheelmatch-pulse.mjs
// Env: E2E_FAST=1 (idle wait 6 s instead of 60 s, hidden tab 4 s instead of 20 s: short-circuit, reported as NOTE), E2E_SOFT=1 (never exit 1),
//      E2E_SEED=x, E2E_TRACE=1, E2E_SHOTS=dir (optional), E2E_IDLE_S / E2E_HIDDEN_S (override the waits).
// Checks (SPEC 2d, 2h; tests 4, 4c, 9; W-T-115, 117, 120, 125, 171):
//  A  DOM scan: wheel screens (ready, spinning, glow window) have no skip / quick spin / spin all / auto-stop / "Auto over" / reduced / "Show result"
//     in text, aria-label, id, class, data-*, title; only "Auto rest of innings" and "Stop auto" may say auto.
//  B  no tap for IDLE_S (60 s): wheel still spinning, nothing logged, STOP still there.
//  C  STOP tap at 3.5 s lands (wheelLog + s.last.wheel + ball row total = label).
//  D  reload before STOP: unspun ball (SPIN shown, no STOP), wheelLog / spokes / tokens unchanged, still the same over.
//  E  hidden tab (visibilityState hidden for HIDDEN_S) then visible: still spinning, nothing logged, STOP still lands afterwards.
//  F  "Auto rest of innings" is disabled (or not offered) while a wheel spins; forcing a click does nothing.
//  G  tap targets >= 56 px (SPIN, STOP, BOWL OVER, Auto rest / Stop auto, help, any button on the wheel screens).
//  H  no network except localhost (non-local requests are aborted and counted); no console / page errors.
// Expect FAIL on a build that still has the coast / Auto over code. Each check prints PASS / FAIL on its own.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEED = process.env.E2E_SEED || 'wmp-e2e';
const FAST = process.env.E2E_FAST === '1';
const IDLE_S = +(process.env.E2E_IDLE_S || (FAST ? 6 : 60));
const HIDDEN_S = +(process.env.E2E_HIDDEN_S || (FAST ? 4 : 20));
const SHOTS = process.env.E2E_SHOTS ? process.env.E2E_SHOTS.replace(/\/?$/, '/') : '';
const VP = { width: 475, height: 638 };
const { chromium } = createRequire(import.meta.url)('playwright');
if (SHOTS) try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* optional */ }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => { // pages are served under /cricket-sixes/
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const results = []; const allErrs = []; const blocked = [];
const step = (g, name, ok, why) => { results.push({ g, name, ok: !!ok, why: ok ? '' : why || '' }); if (process.env.E2E_TRACE) console.error(`${ok ? 'pass' : 'FAIL'} ${g} ${name}${ok ? '' : ' -- ' + why}`); return !!ok; };
const note = (g, name, info) => results.push({ g, name, ok: true, note: true, why: info || '' });
const guard = async (g, label, fn) => { try { await fn(); } catch (e) { step(g, `${label}: script ran without throwing`, false, (e && e.stack || String(e)).split('\n').slice(0, 3).join(' | ')); } };

// ---------------------------------------------------------------- harness
async function open(tag) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); blocked.push(`[${tag}] ${u}`); return route.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => allErrs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|net::ERR_FAILED/.test(m.text())) allErrs.push(`[${tag}] console: ${m.text()}`); });
  const H = {
    ctx, page, tag,
    settle: (ms = 250) => page.waitForTimeout(ms),
    get: () => page.evaluate(() => window.__store.get()),
    stage: () => page.evaluate(() => (window.__store ? window.__store.get().stage : null)),
    S: (fn, arg) => page.evaluate(fn, arg),
    body: () => page.evaluate(() => document.body.innerText),
    shot: async (name) => { if (!SHOTS) return; try { await page.screenshot({ path: `${SHOTS}pulse-${name}.png` }); } catch (e) { /* optional */ } },
    async reload() { await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(700); },
    /** New game (wheel is the default), then store commands up to the first wheel bowl screen. Returns the stage reached. */
    async toBowl(seed) {
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(seed)}`); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(700);
      const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await page.waitForTimeout(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await page.waitForTimeout(400); } }
      const st = await page.evaluate(() => {
        const S = window.__store; let g = 0;
        while (S.get().stage !== 'bowl' && g++ < 200) {
          const s = S.get(), d = (c, p) => S.dispatch(c, p || {}), was = JSON.stringify([s.stage, s.season && s.season.week]);
          if (s.matchMode !== 'wheel' && !['bowl', 'break', 'chase', 'done'].includes(s.stage)) d('SetMatchMode', { mode: 'wheel' });
          switch (s.stage) {
            case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
            case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
            case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
            case 'matchday': d('MatchdayGo'); break;
            case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'wheel' }); if (S.get().stage === 'plan') d('StartMatch'); break;
            case 'train': d('EndWeek'); break; case 'week': d('NextWeek'); break;
            default: return 'stuck:' + s.stage;
          }
          if (JSON.stringify([S.get().stage, S.get().season && S.get().season.week]) === was) { d('DismissNotice'); d('PassScout'); d('DismissTierUp'); d('PickActivity', { id: 'rest' }); }
        }
        return S.get().stage;
      });
      await page.waitForTimeout(500);
      if (st === 'bowl') { await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await page.waitForTimeout(600); } // a real screen render of the bowl stage
      return st;
    },
  };
  return H;
}

const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')].map((e) => {
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const vis = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]');
  return vis ? { text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true', h: r.height, w: r.width } : null;
}).filter(Boolean));
const findBtn = async (page, re) => (await buttons(page)).filter((b) => re.test(b.text));
async function clickBtn(page, re) {
  return page.evaluate((src) => {
    const re = new RegExp(src[0], src[1]);
    for (const e of document.querySelectorAll('button, [role="button"]')) {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none') || e.closest('[hidden]') || e.disabled || e.getAttribute('aria-disabled') === 'true') continue;
      if (re.test((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))) { e.click(); return true; }
    }
    return false;
  }, [re.source, re.flags]);
}
const waitFor = async (page, fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch (e) { return false; } };
const logLen = (s) => (s.wheelLog ? s.wheelLog.length : 0);
const spokesOf = (s) => (s.wheelMeta ? s.wheelMeta.spokes | 0 : 0);
const tokensOf = (s) => JSON.stringify((s.wheelMeta && s.wheelMeta.tokens) || {});
const runsOf = (balls) => (balls || []).reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0);
const stopBtnShown = (page) => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /^(STOP|Wait)/i.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0));
const spinShown = (page) => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /^SPIN\b/i.test((b.innerText || '').trim()) && !b.disabled && b.getBoundingClientRect().width > 0));

/** BOWL OVER / BAT OVER, then SPIN. Resolves when a STOP (or its "Wait" guard) button shows. t0 = in-page performance.now at the SPIN tap. */
async function startSpin(H) {
  const page = H.page;
  await page.evaluate(() => { window.__wmT0 = null; if (!window.__wmT0Hook) { window.__wmT0Hook = true; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button, [role="button"]'); if (b && /^SPIN/i.test((b.innerText || '').trim())) window.__wmT0 = performance.now(); }, true); } });
  const pick = await page.$('.wm-brow[data-bowler]:not([aria-disabled="true"])'); if (pick && !(await page.$('.wm-brow[aria-checked="true"]'))) await pick.click();
  const go = await clickBtn(page, /^(BOWL OVER|BAT OVER)\b/i); if (!go) return { ok: false, why: 'no enabled BOWL OVER / BAT OVER: ' + (await buttons(page)).map((b) => b.text).join(' | ') };
  await page.waitForTimeout(300);
  const readyText = await H.body(); const readyBtns = await buttons(page);
  if ((await findBtn(page, /^SPIN\b/i)).length) await clickBtn(page, /^SPIN\b/i);
  const ok = await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => /^(STOP|Wait)/i.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0), null, 3000);
  return { ok, why: ok ? '' : 'no STOP after SPIN: ' + (await buttons(page)).map((b) => b.text).join(' | '), readyText, readyBtns };
}
/** Tap STOP at secs after the SPIN tap (in-page timer). Returns whether an enabled STOP was found. */
const stopAt = (page, secs) => page.evaluate((s) => new Promise((ok) => {
  const wait = Math.max(0, (window.__wmT0 || performance.now()) + s * 1000 - performance.now());
  setTimeout(() => { const b = [...document.querySelectorAll('button')].find((e) => /^STOP/i.test((e.innerText || '').trim()) && !e.disabled); if (b) b.click(); ok(!!b); }, wait);
}), secs);
/** After a landing: tap the result NEXT until the pick screen (the first tap only fills the balls). */
async function finishOver(H) {
  const page = H.page; const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const nx = await page.$('[data-wm-next]'); if (nx) { await nx.click().catch(() => {}); await page.waitForTimeout(250); continue; }
    if ((await buttons(page)).some((b) => /^(BOWL OVER|BAT OVER)\b/i.test(b.text) && !b.dis)) return H.stage();
    if (!(await page.$('.wm'))) { const st = await H.stage(); if (st !== 'bowl' && st !== 'chase') return st; }
    await page.waitForTimeout(200);
  }
  return 'timeout';
}

/** Words that must not exist on a wheel screen. Reads text, aria-label, title, id, class and every data-* of every element. */
const BAN = '(skip|quick[\\s_-]?spin|spin[\\s_-]?all|auto[\\s_-]?stop|autostop|auto[\\s_-]?over|coast|reduced|show[\\s_-]?result)';
const AUTO_OK = /^(auto rest of innings|stop auto)$/i;
async function domScan(page) {
  return page.evaluate(([ban]) => {
    const re = new RegExp(ban, 'i'); const hits = []; const autoSeen = [];
    const root = document.querySelector('#app') || document.body;
    for (const e of root.querySelectorAll('*')) {
      if (e.closest('[hidden]') && !e.hidden) { /* hidden subtree still counts: it is in the DOM */ }
      const attrs = [...e.attributes].map((a) => (a.name === 'class' || a.name === 'id' || a.name === 'title' || a.name === 'aria-label' || a.name.startsWith('data-')) ? a.name + '=' + a.value : '').filter(Boolean);
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').trim();
      for (const t of [own, ...attrs]) if (t && re.test(t)) hits.push((e.tagName.toLowerCase() + ': ' + t).slice(0, 90));
      for (const t of [own, ...attrs]) if (t && /\bauto\b/i.test(t) && !/^(class|data-wm)=/.test(t) && !re.test(t)) autoSeen.push(t.slice(0, 60));
    }
    return { hits: [...new Set(hits)].slice(0, 12), autoSeen: [...new Set(autoSeen)].slice(0, 12) };
  }, [BAN]);
}
const autoTextBad = (a) => a.filter((t) => !AUTO_OK.test(t.replace(/^(aria-label|title|data-[\w-]+)=/, '').trim()) && !/auto rest of innings|stop auto/i.test(t));

// ---------------------------------------------------------------- A, C, F, G: the main flow
async function mainFlow() {
  const H = await open('main'); const page = H.page; const g = 'A';
  const st = await H.toBowl(SEED + '-a');
  if (!step(g, 'new game reaches the first wheel bowl screen', st === 'bowl', 'stage ' + st)) return H;
  const s0 = await H.get();
  step(g, 'match mode is wheel', s0.mode === 'wheel' || s0.matchMode === 'wheel', `mode=${s0.mode} matchMode=${s0.matchMode}`);
  await H.shot('bowl-pick');

  // over 1: ready screen scan, spin, glow-window scan, STOP at 3.5 s
  const sp = await startSpin(H);
  if (!step(g, 'over 1: BOWL OVER, SPIN, STOP shows', sp.ok, sp.why)) return H;
  const before = await H.get();
  let scan = await domScan(page);
  step(g, 'DOM scan, spinning (t ~0.3 s): no skip / quick spin / auto-stop / Auto over / reduced / Show result', !scan.hits.length, scan.hits.join(' || '));
  step(g, 'DOM scan, spinning: only "Auto rest of innings" / "Stop auto" say auto', !autoTextBad(scan.autoSeen).length, autoTextBad(scan.autoSeen).join(' || '));
  step(g, 'ready screen text has no Auto over / skip / reduced / Show result', !new RegExp(BAN, 'i').test(sp.readyText), (sp.readyText.match(new RegExp(BAN, 'ig')) || []).join(', '));
  await H.shot('over1-spinning');
  // G: tap targets while spinning
  const ready = sp.readyBtns; const spinningBtns = await buttons(page);
  const small = (arr) => arr.filter((b) => b.h < 55.5 || b.w < 55.5).map((b) => `${b.text.slice(0, 24) || '(no text)'} ${Math.round(b.w)}x${Math.round(b.h)}`);
  step('G', 'tap targets >= 56 px on the ready wheel screen (SPIN, help, every button)', ready.length > 0 && !small(ready).length, small(ready).join(' | ') || 'no buttons found');
  step('G', 'tap targets >= 56 px while spinning (STOP, help, every button)', spinningBtns.length > 0 && !small(spinningBtns).length, small(spinningBtns).join(' | ') || 'no buttons found');
  const stopB = spinningBtns.filter((b) => /^(STOP|Wait)/i.test(b.text));
  step('G', 'STOP is at least 56 px wide and tall', stopB.length > 0 && stopB.every((b) => b.h >= 55.5 && b.w >= 55.5), stopB.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(','));
  // glow window: a scan inside 3.2 to 3.8 s as well
  await page.evaluate(() => new Promise((ok) => { const w = Math.max(0, window.__wmT0 + 3400 - performance.now()); setTimeout(ok, w); }));
  scan = await domScan(page);
  step(g, 'DOM scan, glow window (t ~3.4 s): nothing banned', !scan.hits.length, scan.hits.join(' || '));
  const glowTxt = (await buttons(page)).map((b) => b.text).join(' | ');
  await H.shot('over1-glow');
  // F: Auto rest of innings while the wheel spins (it is offered after over 1 only; over 1 here: nothing to disable yet)
  const stopped = await stopAt(page, 3.5);
  step('C', 'STOP tap lands (button was live at 3.5 s)', stopped, 'STOP gone or disabled at tap time; buttons: ' + glowTxt);
  const landed = await waitFor(page, (n) => { const s = window.__store.get(); return (s.wheelLog ? s.wheelLog.length : 0) > n && s.last && s.last.wheel; }, logLen(before), 3000);
  step('C', 'after STOP: wheelLog entry + s.last.wheel written', landed, 'no new wheelLog entry within 3 s');
  if (landed) {
    const a = await H.get(); const w = a.last.wheel; const seg = (w.segs || []).find((x) => x.id === w.segId);
    step('C', 'landing is a manual stop (auto false), stop time near 3.5 s', !w.auto && Math.abs(w.t - 3.5) < 0.3, `auto=${w.auto} t=${w.t}`);
    if (seg && /^\d+$/.test(String(seg.label))) step('C', 'ball row total equals the landed label', runsOf(a.last.balls) === Number(seg.label), `balls ${runsOf(a.last.balls)} vs label ${seg.label}`);
    const after = await domScan(page);
    note('C', 'result screen scan (skip allowed there: tap panel / "X skip" only after landing, W-T-122)', after.hits.join(' || ') || 'clean');
    await H.shot('over1-result');
  }
  let nxt = await finishOver(H);
  step('C', 'over 1 closes, next over ready', nxt === 'bowl', 'stage ' + nxt);

  // F: Auto rest of innings after over 1; then start over 2 and look at it while the wheel spins
  if (nxt === 'bowl') {
    const autoPick = await findBtn(page, /Auto rest/i);
    step('F', 'pick screen after over 1 offers "Auto rest of innings", enabled', autoPick.length === 1 && !autoPick[0].dis, (await buttons(page)).map((b) => b.text).join(' | '));
    step('F', 'no "Auto over" button on the pick screen', !(await findBtn(page, /^Auto over/i)).length, 'Auto over still offered');
    step('G', 'Auto rest of innings tap target >= 56 px', autoPick.length === 1 && autoPick[0].h >= 55.5 && autoPick[0].w >= 55.5, autoPick.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(','));
    const b2 = await H.get(); const sp2 = await startSpin(H);
    if (step('F', 'over 2: wheel spinning', sp2.ok, sp2.why)) {
      await H.settle(900);
      const autoSpin = await findBtn(page, /Auto rest/i); const stopAuto = await findBtn(page, /Stop auto/i);
      if (autoSpin.length) step('F', '"Auto rest of innings" is disabled while the wheel spins', autoSpin.every((b) => b.dis), autoSpin.map((b) => b.text + (b.dis ? ' (disabled)' : ' (ENABLED)')).join(' | '));
      else note('F', '"Auto rest of innings" not offered while spinning (hidden, not disabled)', 'SPEC 2h says disabled: lead decides whether hidden is acceptable');
      step('F', 'no "Stop auto" while a manual wheel spins (Auto is not running)', !stopAuto.length, 'Stop auto shown');
      // forced click on any auto control must not stop or change the spinning wheel
      const forced = await page.evaluate(() => { const els = [...document.querySelectorAll('[data-wm="auto-rest"], [data-wm="auto-over"], [data-wm="stop-auto"]')]; els.forEach((e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true }))); return els.length; });
      await H.settle(600);
      const a2 = await H.get();
      step('F', 'forced click on an auto control: wheel still spinning, nothing logged', logLen(a2) === logLen(b2) && (await stopBtnShown(page)), `forced ${forced}; log ${logLen(b2)} -> ${logLen(a2)}; STOP shown ${await stopBtnShown(page)}`);
      const st2 = await stopAt(page, 3.5); await waitFor(page, (n) => (window.__store.get().wheelLog || []).length > n, logLen(b2), 3000); await finishOver(H);
      step('C', 'over 2 STOP lands too', st2, 'STOP not live');
    }
  }
  return H;
}

// ---------------------------------------------------------------- B: untouched for IDLE_S
async function idleCheck() {
  const H = await open('idle'); const page = H.page; const g = 'B';
  const st = await H.toBowl(SEED + '-idle'); if (!step(g, 'idle: reached bowl screen', st === 'bowl', 'stage ' + st)) return H;
  const b0 = await H.get(); const sp = await startSpin(H); if (!step(g, 'idle: SPIN started', sp.ok, sp.why)) return H;
  const t0 = Date.now(); const marks = [];
  for (const frac of [0.25, 0.5, 0.75, 1]) { const w = frac * IDLE_S * 1000 - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); marks.push(Math.round((Date.now() - t0) / 1000) + 's:' + (await stopBtnShown(page) ? 'spin' : 'GONE')); }
  const a = await H.get();
  step(g, `no tap for ${IDLE_S} s: STOP still on screen (never auto-stopped, no coast)`, await stopBtnShown(page), marks.join(' '));
  step(g, `no tap for ${IDLE_S} s: wheelLog unchanged, same over, same stage`, logLen(a) === logLen(b0) && a.stage === b0.stage, `log ${logLen(b0)} -> ${logLen(a)}, stage ${b0.stage} -> ${a.stage}`);
  step(g, `no tap for ${IDLE_S} s: no landed result stored (s.last unchanged)`, JSON.stringify(a.last && a.last.wheel) === JSON.stringify(b0.last && b0.last.wheel), 'a result was stored without a tap');
  const nowTxt = await H.body(); step(g, 'no "skip" / "Auto over" / coast text appeared by itself', !new RegExp(BAN, 'i').test(nowTxt), (nowTxt.match(new RegExp(BAN, 'ig')) || []).join(', '));
  if (FAST) note(g, `short-circuit: waited ${IDLE_S} s, not 60 s`, 'run without E2E_FAST for the real 60 s (test 4c)');
  // and the STOP tap still works after the long wait
  const ok = await clickBtn(page, /^STOP/i); const landed = await waitFor(page, (n) => (window.__store.get().wheelLog || []).length > n, logLen(b0), 3000);
  step(g, `STOP still lands after ${IDLE_S} s`, ok && landed, `tapped ${ok}, landed ${landed}`);
  return H;
}

// ---------------------------------------------------------------- D: reload before STOP
async function reloadCheck() {
  const H = await open('reload'); const page = H.page; const g = 'D';
  const st = await H.toBowl(SEED + '-rl'); if (!step(g, 'reload: reached bowl screen', st === 'bowl', 'stage ' + st)) return H;
  const b0 = await H.get(); const sp = await startSpin(H); if (!step(g, 'reload: spinning', sp.ok, sp.why)) return H;
  await H.settle(1200);
  await H.reload(); await H.settle(1500);
  const a = await H.get(); const body = await H.body(); const btns = await buttons(page);
  step(g, 'reload before STOP: nothing stored (wheelLog length same)', logLen(a) === logLen(b0), `log ${logLen(b0)} -> ${logLen(a)}`);
  step(g, 'reload before STOP: no token spent, no Spokes paid', tokensOf(a) === tokensOf(b0) && spokesOf(a) === spokesOf(b0), `tokens ${tokensOf(b0)} -> ${tokensOf(a)}; spokes ${spokesOf(b0)} -> ${spokesOf(a)}`);
  step(g, 'reload before STOP: same stage and the over is not played', a.stage === 'bowl' && JSON.stringify(a.inn1 && [a.inn1.runs, a.inn1.wk, a.inn1.balls]) === JSON.stringify(b0.inn1 && [b0.inn1.runs, b0.inn1.wk, b0.inn1.balls]), `stage ${a.stage}`);
  const unspun = btns.some((b) => /^(SPIN|BOWL OVER)\b/i.test(b.text) && !b.dis) && !btns.some((b) => /^STOP\b/i.test(b.text));
  step(g, 'reload before STOP: shows an unspun ball (SPIN or BOWL OVER, no STOP, no result)', unspun && !/Landed on/i.test(body), btns.map((b) => b.text).join(' | '));
  // spin again after the reload and land one: proves the unspun ball is playable
  if (unspun) { const sp2 = await startSpin(H); const ok = sp2.ok && (await stopAt(page, 3.5)); const landed = ok && await waitFor(page, (n) => (window.__store.get().wheelLog || []).length > n, logLen(b0), 3000); step(g, 'after the reload the same over spins and STOP lands', landed, sp2.why || 'no landing'); }
  return H;
}

// ---------------------------------------------------------------- E: hidden tab
async function hiddenCheck() {
  const H = await open('hidden'); const page = H.page; const g = 'E';
  const st = await H.toBowl(SEED + '-hid'); if (!step(g, 'hidden: reached bowl screen', st === 'bowl', 'stage ' + st)) return H;
  const b0 = await H.get(); const sp = await startSpin(H); if (!step(g, 'hidden: spinning', sp.ok, sp.why)) return H;
  const setVis = (hidden) => page.evaluate((h) => {
    for (const [k, v] of [['visibilityState', h ? 'hidden' : 'visible'], ['hidden', h]]) Object.defineProperty(document, k, { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event(h ? 'blur' : 'focus')); if (!h) window.dispatchEvent(new Event('pageshow'));
  }, hidden);
  await H.settle(600); await setVis(true);
  // a hidden tab stops requestAnimationFrame: emulate by also holding the page in a throttled state (CDP: page lifecycle hidden)
  let cdp = null; try { cdp = await H.ctx.newCDPSession(page); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).catch(() => {}); } catch (e) { /* optional */ }
  await new Promise((r) => setTimeout(r, HIDDEN_S * 1000));
  if (cdp) await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await setVis(false); await H.settle(900);
  const a = await H.get();
  step(g, `hidden for ${HIDDEN_S} s then visible: STOP still on screen (still spinning)`, await stopBtnShown(page), (await buttons(page)).map((b) => b.text).join(' | '));
  step(g, 'hidden then visible: nothing landed, nothing logged', logLen(a) === logLen(b0), `log ${logLen(b0)} -> ${logLen(a)}`);
  if (FAST) note(g, `short-circuit: hidden ${HIDDEN_S} s, not 20 s`, 'run without E2E_FAST for the real 20 s');
  const ok = await clickBtn(page, /^STOP/i); const landed = await waitFor(page, (n) => (window.__store.get().wheelLog || []).length > n, logLen(b0), 3000);
  step(g, 'hidden then visible: STOP lands', ok && landed, `tapped ${ok}, landed ${landed}`);
  return H;
}

// ---------------------------------------------------------------- run
const opened = [];
try {
  const idleP = guard('B', 'idle check', async () => { opened.push(await idleCheck()); }); // runs its 60 s wait in parallel with the others
  await guard('A', 'main flow', async () => { opened.push(await mainFlow()); });
  await guard('D', 'reload check', async () => { opened.push(await reloadCheck()); });
  await guard('E', 'hidden check', async () => { opened.push(await hiddenCheck()); });
  await idleP;
} catch (e) { step('X', 'script ran without throwing', false, e.stack || String(e)); }
finally { for (const H of opened) if (H) await H.ctx.close().catch(() => {}); await browser.close(); server.close(); }

step('H', 'no request left localhost (non-local requests were aborted)', !blocked.length, blocked.slice(0, 5).join(' | '));
step('H', 'no console / page errors', !allErrs.length, allErrs.slice(0, 5).join(' | '));
const names = { A: 'DOM scan + flow', B: 'idle no tap', C: 'STOP lands', D: 'reload before STOP', E: 'hidden tab', F: 'Auto while spinning', G: 'tap targets', H: 'network + errors', X: 'harness' };
let bad = 0;
console.log(`wheelmatch-pulse e2e seed ${SEED}; viewport ${VP.width}x${VP.height}; idle ${IDLE_S}s hidden ${HIDDEN_S}s${FAST ? ' (FAST short-circuit)' : ''}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.note ? 'NOTE' : r.ok ? 'PASS' : 'FAIL'} [${r.g} ${names[r.g]}] ${r.name}${r.note ? ': ' + r.why : r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length} checks` : `PASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
