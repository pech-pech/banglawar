// node src/test/perf-probe.js [W,H] : JS time per PL.draw call (performance.now around the call) under 4x CDP CPU throttle.
// FLUSH=1 adds the software-raster flush to the timed region. 300 frames at 475x638, dpr 2, per quality (full, lite, off). Reports median and p95. Headless SOFTWARE canvas, NOT a phone number:
// this measures command-recording cost; raster/composite cost is not included (GPU canvas on a device moves that off the JS thread).
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sizes = process.argv[2] ? [process.argv[2].split(',').map(Number)] : [[475, 638]];
const FRAMES = +process.env.FRAMES || 300;
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, browser = await chromium.launch();
  const rows = [];
  for (const [W, H] of sizes) for (const room of ['lab', 'tut']) for (const q of ['full', 'lite', 'off']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/src/test/skin-harness.html`);
    await page.evaluate(() => H_.ready);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const res = await page.evaluate(([q, n, room, flush]) => {
      const R = H_.rooms(), all = R.tut.concat(R.shaft, R.synth || []);
      // 'lab' = synthetic room with 2 crushers, gate, crumble, 3 spike rows, 3 lanterns (worst case); 'tut' = first tutorial room
      const ri = room === 'lab' ? all.length - 1 : 0;
      H_.setup(all[ri], [[20, { k: 'flip', dir: 3 }], [90, { k: 'flip', dir: 1 }], [160, { k: 'dive' }], [240, { k: 'flip', dir: 2 }]], 0, { hud: { quality: q } });
      const cv = document.getElementById('c'), ctx = cv.getContext('2d'), dpr = H_.view.dpr, ts = [];
      for (let i = 0; i < n + 20; i++) {
        H_.run(2);
        const fr = PL.camUpdate(H_.cam, H_.st, H_.view, 1 / 60);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const a = performance.now();
        PL.draw(ctx, H_.view, fr, H_.st, { seed: 1, quality: q });
        let b = performance.now();
        if (flush) { ctx.getImageData(0, 0, 1, 1); b = performance.now(); }   // FLUSH=1: include the software raster of the frame (headless only, not a GPU number)
        if (i >= 20) ts.push(b - a);
        if (!flush && i % 6 === 0) ctx.getImageData(0, 0, 1, 1); // drain the software raster queue outside the timed region
      }
      ts.sort((x, y) => x - y);
      return { med: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * 0.95)], avg: ts.reduce((s, v) => s + v, 0) / ts.length, errs: PL.Skin.stats().errors };
    }, [q, FRAMES, room, !!process.env.FLUSH]);
    rows.push(`| ${W}x${H} | ${room} | ${q} | ${res.med.toFixed(2)} | ${res.p95.toFixed(2)} | ${res.avg.toFixed(2)} | ${res.errs} |`);
    await ctx.close();
  }
  console.log('| size | room | quality | median ms | p95 ms | avg ms | draw errors |\n|---|---|---|---|---|---|---|\n' + rows.join('\n'));
  await browser.close(); srv.close();
})();
