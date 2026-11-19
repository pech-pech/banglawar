// node src/test/skin-shots.js : Starfall skin screenshots. Standalone harness page (src/test/skin-harness.html) loads the parts by
// script tag (no ui.js), so it works whatever inline.py currently builds. Serves the game folder over local http so assets load.
// Renders tutorial room 1 + 3 varied shaft rooms mid-play at 475x638, 344x882, 816x568 (dpr 2) -> src/review/shots-beta/skin-<view>-<n>.png
// Also checks: no console errors, draw never throws, hit-rect overlay shot (skin-debug-*.png), mean PL.draw ms.
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, '..', 'review', 'shots-beta');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const VIEWS = [[475, 638], [344, 882], [816, 568]];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, browser = await chromium.launch();
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  for (const [W, H] of VIEWS) {
    if (only && !only.includes(W)) continue;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/src/test/skin-harness.html`);
    const missing = await page.evaluate(() => H_.ready);
    ok(missing.length === 0, `${W}x${H} art loaded (missing: ${missing.join(',') || 'none'})`);
    const pick = await page.evaluate(() => {
      const R = H_.rooms(), all = R.tut.concat(R.shaft), feat = (r) => ({ c: (r.crushers || []).length, k: (r.crumbles || []).length, g: (r.gates || []).length, s: (r.spikes || []).length });
      return { n: all.length, f: all.map(feat), names: all.map((r) => r.name) };
    });
    // scenes: [label, room index, script, run ticks before shot]
    const idx = (fn) => { const i = pick.f.findIndex(fn); return i < 0 ? 0 : i; };
    const scenes = [
      ['tut', 0, [[30, { k: 'flip', dir: 1 }]], 54],
      ['crusher', idx((f, i) => f.c > 0 && i >= 3), [[20, { k: 'flip', dir: 3 }]], 30],
      ['crumble', idx((f, i) => f.k > 0 && i >= 3), [[10, { k: 'flip', dir: 0 }], [60, { k: 'dive' }]], 40],
      ['gate', idx((f, i) => f.g > 0 && f.s > 0 && i >= 3), [[40, { k: 'dive' }]], 30]
    ];
    let msSum = 0, msN = 0;
    for (let n = 0; n < scenes.length; n++) {
      const [label, ri, script, run] = scenes[n];
      const hudOpt = process.env.SKIN_Q ? { quality: process.env.SKIN_Q } : {};
      const ms = await page.evaluate(([ri, script, run, hudOpt]) => {
        const R = H_.rooms(), all = R.tut.concat(R.shaft);
        H_.setup(all[ri], script, run, { path: true, hud: hudOpt });
        H_.draw(Math.max(1, Math.round(run / 2)));  // frames up to the shot moment (2 sim ticks per drawn frame)
        return H_.draw(30);                          // 30 more frames: mean draw ms
      }, [ri, script, run, hudOpt]);
      msSum += ms; msN++;
      await page.screenshot({ path: path.join(OUT, `skin-${W}x${H}-${n + 1}-${label}${process.env.SKIN_Q ? '-' + process.env.SKIN_Q : ''}.png`) });
    }
    // hero close-up: idle on the first ledge, 2x crop of 120x120 css px around the hero
    for (const [label, ri, script, run] of [['hero-idle', 0, [], 200], ['hero-fall', 0, [[10, { k: 'flip', dir: 1 }]], 40], ['hero-flip', 0, [[10, { k: 'flip', dir: 3 }]], 34]]) {
      const p0 = await page.evaluate(([ri, script, run]) => { const R = H_.rooms(), all = R.tut.concat(R.shaft); H_.setup(all[ri], script, run, {}); H_.draw(Math.round(run / 2)); return H_.heroPx(); }, [ri, script, run]);
      const c = { x: Math.max(0, Math.min(W - 120, p0.x - 60)), y: Math.max(0, Math.min(H - 120, p0.y - 60)), width: 120, height: 120 };
      await page.screenshot({ path: path.join(OUT, `skin-${W}x${H}-${label}.png`), clip: c });
    }
    ok(msSum / msN < 250, `${W}x${H} mean PL.draw ${(msSum / msN).toFixed(2)} ms (info only: headless SOFTWARE canvas at dpr 2, not a device number; SKIN_Q=off|lite|full env to compare)`);
    await page.evaluate(() => { PL.Skin.setDebug(true); H_.draw(1); });
    await page.screenshot({ path: path.join(OUT, `skin-${W}x${H}-debug.png`) });
    const st = await page.evaluate(() => PL.Skin.stats());
    ok(st.errors === 0, `${W}x${H} skin draw errors ${st.errors}`);
    ok(errs.length === 0, `${W}x${H} console clean ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
