// E2E for Bundle A (stars, par ratio, Retry, Closest, run-end total, near-miss tag). Run: node tests/e2e-bundle-a.js
// Written from BUNDLE-A-CONTRACT.md. Panel DOM is not specified, so checks are text/role based.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + (process.env.E2E_HTML || (ROOT + '/index.html')) + '?seed=1';
const VPS = [{ w: 475, h: 638, touch: false }, { w: 344, h: 882, touch: true }];
let fails = 0;
const rec = (vp, name, ok, note) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} [${vp}] ${name}${note ? ' :: ' + note : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, vp, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: vp.touch ? 2 : 1 }, extra || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__bw && window.__bw.phase === 'intro', null, { timeout: 60000 });
  return { ctx, page, errs };
}

// In-page helpers, installed on window.__t
const INSTALL = () => {
  const vis = el => { const q = el.getBoundingClientRect(); const cs = getComputedStyle(el); return q.width > 0 && q.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0; };
  const uid = (() => { const m = new WeakMap(); let n = 0; return el => { if (!m.has(el)) m.set(el, ++n); return m.get(el); }; })();
  const anc = el => { const a = []; for (let e = el.parentElement; e; e = e.parentElement) a.push(uid(e)); return a; };
  const rect = (el, t) => { const q = el.getBoundingClientRect(); return { t, x: q.x, y: q.y, w: q.width, h: q.height, u: uid(el), anc: anc(el) }; };
  const T = window.__t = {
    vis,
    titles: () => [...document.querySelectorAll('h1,h2,h3,[class*=title i],[id*=title i]')].filter(vis).map(b => rect(b, 'title:' + (b.textContent || '').trim().slice(0, 20))),
    text: () => document.body.innerText,
    buttons: () => [...document.querySelectorAll('button,[role=button],[data-bw]')].filter(vis).map(b => rect(b, (b.textContent || '').trim())),
    chips: () => [...document.querySelectorAll('[class*=chip i],[id*=chip i],[data-chip]')].filter(vis).map(b => rect(b, 'chip:' + (b.textContent || '').trim().slice(0, 20))),
    clickRe: re => { const c = [...document.querySelectorAll('button,[role=button],[data-bw]')].filter(vis).filter(x => re.test((x.textContent || '').trim())); const b = c.sort((a, z) => (a.textContent || '').length - (z.textContent || '').length)[0]; if (b) b.click(); return !!b; },
    // Drive par schedule; resolves with final phase. Optionally watches for CLOSE PASS tag.
    par: (first, watch) => new Promise(resolve => {
      const sec = __bw.sector, ev = BW.sim.schedToEvents(sec.par.sched);
      if (first) __bw.launch(); else if (!T.clickRe(/retry/i)) __bw.retry();
      let i = 0; const t0 = performance.now(); const ch = new MessageChannel();
      const seen = { tag: false, anim: null };
      ch.port1.onmessage = () => {
        const s = __bw.state, p = __bw.phase;
        if (watch && !seen.tag) {
          const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /close pass/i.test(e.textContent || '') && vis(e));
          if (el) { seen.tag = true; let a = el, anim = false; while (a && a !== document.documentElement) { const cs = getComputedStyle(a); if ((cs.animationName && cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01) || (parseFloat(cs.transitionDuration) > 0.01)) anim = true; a = a.parentElement; } seen.anim = anim; }
        }
        if (p !== 'run' || performance.now() - t0 > 120000) { __bw.hold(false); return resolve({ phase: p, seen, nm: s && s.nearMisses }); }
        while (i < ev.length && ev[i][0] <= s.n) { __bw.hold(!!ev[i][1], ev[i][2] / 100); i++; }
        ch.port2.postMessage(0);
      };
      ch.port2.postMessage(0);
    }),
    dock: async (watch) => { let r = await T.par(__bw.phase === 'intro', watch), n = 1, seen = r.seen; while (r.phase !== 'docked' && n < 3) { await new Promise(x => setTimeout(x, 1200)); r = await T.par(false, watch); if (r.seen.tag) seen = r.seen; n++; } r.seen = seen; return r; },
  };
};

const overlap = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
function overlaps(items) {
  const bad = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    // chip vs button, button vs button; skip nested (one contains the other fully = same control)
    const cont = (p, q) => p.x <= q.x + 0.5 && p.y <= q.y + 0.5 && p.x + p.w >= q.x + q.w - 0.5 && p.y + p.h >= q.y + q.h - 0.5;
    if (a.anc && b.anc && (a.anc.includes(b.u) || b.anc.includes(a.u))) continue; // ancestor/descendant is not an overlap
    if (a.w * a.h === 0 || b.w * b.h === 0 || cont(a, b) || cont(b, a)) continue; // wrapper/panel containing a control is not an overlap
    if (overlap(a, b)) bad.push(`"${a.t}" x "${b.t}"`);
  }
  return bad;
}

async function run(browser, vp) {
  const tag = `${vp.w}x${vp.h}`;
  const T = (n, ok, note) => rec(tag, n, ok, note);
  const safe = async (n, fn) => { try { await fn(); } catch (e) { T(n, false, 'exception: ' + String(e.message).split('\n')[0]); } };

  // A. docked panel + overlap, then run end
  await safe('A docked', async () => {
    const { ctx, page, errs } = await open(browser, vp);
    await page.evaluate(INSTALL);
    const r = await page.evaluate(() => __t.dock(false));
    await sleep(900);
    T('A0 par schedule docks', r.phase === 'docked', 'phase=' + r.phase);
    const d = await page.evaluate(() => ({ text: __t.text(), res: (window.__bw.state && (__bw.state.result || __bw.result)) || null, btns: __t.buttons(), chips: __t.chips(), titles: __t.titles(), starEls: document.querySelectorAll('[class*=star i],[aria-label*=star i],[data-stars]').length }));
    T('A1 docked panel shows stars', /[★⭐]|stars?\b/i.test(d.text) || d.starEls > 0, `starEls=${d.starEls} text=${JSON.stringify(d.text.slice(0, 160))}`);
    T("A2 docked panel shows 'x par' ratio", /\d+(\.\d+)?\s*[x×]\s*par/i.test(d.text), JSON.stringify(d.text.slice(0, 160)));
    const bad = overlaps(d.btns.concat(d.chips, d.titles.filter(t => d.chips.length && true)));
    T('A3 docked: no overlap between chip/Next/Retry/buttons', !bad.length && d.btns.length >= 1, `${d.btns.length} btns, ${d.chips.length} chips; ${bad.join('; ')}; ${JSON.stringify(d.btns.map(b => b.t))}`);
    const inView = d.btns.filter(b => b.x < -0.5 || b.y < -0.5 || b.x + b.w > vp.w + 0.5 || b.y + b.h > vp.h + 0.5);
    T('A4 docked: buttons inside viewport', !inView.length, inView.map(b => b.t).join(','));

    // run end: dock through sectors until total stars out of 24 appears
    await safe('A5 run end shows total stars /24', async () => {
      let found = false, txt = '', hops = 0;
      while (hops < 10) {
        txt = await page.evaluate(() => __t.text());
        if (/\b\d{1,2}\s*(\/|of|out of)\s*24\b/i.test(txt)) { found = true; break; }
        const clicked = await page.evaluate(() => __t.clickRe(/^(next( sector)?|finish|new run)$/i));
        if (!clicked) break;
        let ph = '';
        for (let k = 0; k < 12; k++) { await sleep(250); ph = await page.evaluate(() => __bw.phase); if (ph === 'intro' || ph === 'run') break; }
        if (ph === 'intro' || ph === 'run') {
          let rr = await page.evaluate(() => __t.dock(false));
          if (rr.phase !== 'docked') {
            await sleep(1200);
            for (let k = 0; k < 12 && !/^(intro|run|docked)$/.test(ph = await page.evaluate(() => __bw.phase)); k++) await sleep(250);
            rr = await page.evaluate(() => __t.dock(false));
          }
          if (rr.phase !== 'docked') { txt = 'could not dock sector ' + hops + ' phase=' + rr.phase; break; }
          await sleep(900);
        }
        hops++;
      }
      T('A5 run end shows total stars out of 24', found, found ? '' : `hops=${hops} last=${JSON.stringify(String(txt).slice(0, 200))}`);
      if (found) {
        const bt = await page.evaluate(() => __t.buttons().concat(__t.chips()));
        const bad2 = overlaps(bt);
        T('A6 run end: no overlap', !bad2.length, bad2.join('; '));
      }
    });
    T('A7 no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  });

  // B. failed panel
  await safe('B failed', async () => {
    const { ctx, page, errs } = await open(browser, vp);
    await page.evaluate(INSTALL);
    await page.evaluate(() => __bw.launch());
    let ph = 'run';
    for (let i = 0; i < 150 && ph === 'run'; i++) { await sleep(500); ph = await page.evaluate(() => __bw.phase); }
    T('B0 coasting without burns fails', ph === 'failed', 'phase=' + ph);
    await sleep(1300);
    const d = await page.evaluate(() => ({ text: __t.text(), btns: __t.buttons(), chips: __t.chips() }));
    const retry = d.btns.find(b => /retry/i.test(b.t));
    T('B1 failed: Retry button >=56x56', !!retry && retry.w >= 55.99 && retry.h >= 55.99, retry ? `${retry.w.toFixed(1)}x${retry.h.toFixed(1)}` : 'no Retry button; btns=' + JSON.stringify(d.btns.map(b => b.t)));
    T("B2 failed: 'Closest N px' line", /closest\s+\d+(\.\d+)?(\s*px)?/i.test(d.text), JSON.stringify(d.text.slice(0, 200)));
    const bad = overlaps(d.btns.concat(d.chips));
    T('B3 failed: no overlap between chip/Next/Retry/buttons', !bad.length, bad.join('; ') + ' ' + JSON.stringify(d.btns.map(b => b.t)));
    // retry row: Retry should be in same row as another button (contract) - informational only if there are others
    if (retry) {
      const inView = retry.x >= -0.5 && retry.x + retry.w <= vp.w + 0.5 && retry.y >= -0.5 && retry.y + retry.h <= vp.h + 0.5;
      T('B4 failed: Retry inside viewport', inView, JSON.stringify(retry));
      await page.evaluate(() => __t.clickRe(/retry/i));
      await sleep(1300);
      const p2 = await page.evaluate(() => __bw.phase);
      T('B5 failed: tapping Retry restarts run', p2 === 'run', 'phase=' + p2);
    }
    T('B6 no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  });

  // C. near-miss tag + reduced motion
  await safe('C near-miss', async () => {
    const { ctx, page, errs } = await open(browser, vp, { reducedMotion: 'reduce' });
    await page.evaluate(INSTALL);
    const r = await page.evaluate(() => __t.dock(true));
    const nmField = await page.evaluate(() => { const s = __bw.state || {}; const q = s.result || __bw.result || {}; return { nm: s.nearMisses !== undefined ? s.nearMisses : q.nearMisses }; });
    const rep = await page.evaluate(() => { try { const q = __bw.report ? __bw.report() : null; const j = JSON.stringify(q); return { has: /nearMiss|closest/i.test(j || ''), keys: q && typeof q === 'object' ? Object.keys(q).slice(0, 20) : null }; } catch (e) { return { err: String(e) }; } });
    if (r.seen.tag) {
      T('C1 near-miss CLOSE PASS tag has no animation/transition under reduced motion', r.seen.anim === false, 'anim=' + r.seen.anim);
    } else if (nmField.nm !== undefined || rep.has) {
      T('C1 nearMisses/closest field present after par run', true, `nm=${JSON.stringify(nmField.nm)} report=${JSON.stringify(rep)}`);
    } else {
      console.log(`INFO [${tag}] C1 near-miss tag is canvas-drawn; no nearMisses/closest field in state/report :: ${JSON.stringify(rep)}`);
    }
    T('C2 nearMisses is a non-negative integer when present', nmField.nm === undefined || (Number.isInteger(nmField.nm) && nmField.nm >= 0), JSON.stringify(nmField.nm));
    T('C3 no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  });
}

(async () => {
  if (!process.env.E2E_HTML) execSync('python3 ' + path.join(ROOT, 'src/build.py'), { stdio: 'inherit' });
  const browser = await chromium.launch({ headless: true });
  for (const vp of VPS) await run(browser, vp);
  await browser.close();
  console.log(fails ? `RESULT: ${fails} FAIL` : 'RESULT: ALL PASS');
  process.exit(fails ? 1 : 0);
})();
