// Playwright: screenshots of vfx-demo.html at 3 sizes x (full, lite, reduced) @ deviceScaleFactor 2 into
// src/review/shots-beta/vfx-*.png, plus a frame-cost probe (avg and p95 ms over 300 frames per quality,
// CPU throttled 4x via CDP) written into src/review/vfx-beta.md between the PROBE markers.
// Run: NODE_PATH=/opt/node-tools/node_modules node src/test/vfx-shots.js [--noprobe]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'src/review/shots-beta');
fs.mkdirSync(outDir, { recursive: true });
const SIZES = [[475, 638], [344, 882], [816, 568]];
const MODES = [['full', 'full', false], ['lite', 'lite', false], ['reduced', 'full', true]];
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp' };

const srv = http.createServer(function (q, r) {
  let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, function (e, d) { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
}).listen(0, async function () {
  const port = srv.address().port, base = 'http://localhost:' + port + '/src/test/vfx-demo.html';
  const b = await chromium.launch();
  const errs = [];
  // screenshots: step to a moment with plenty going on (mid-flip), plus a second shot
  if (process.argv.indexOf('--probe-only') < 0 && process.argv.indexOf('--probe-only') < 0) for (const [w, h] of SIZES) for (const [name, q, red] of MODES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    p.on('pageerror', e => errs.push(name + ' ' + w + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(name + ' ' + w + ' ' + m.text()); });
    await p.goto(base + '?manual=1&seed=7&q=' + q + (red ? '&reduced=1' : ''));
    await p.evaluate(() => demo.step(1, 1 / 60));
    for (const [tag, frames] of [['a', 100], ['b', 85]]) { // after frame counts ~ 1.7 s and ~3.1 s into the loop
      await p.evaluate(n => demo.step(n, 1 / 60), frames);
      await p.screenshot({ path: path.join(outDir, 'vfx-' + w + 'x' + h + '-' + name + '-' + tag + '.png') });
    }
    await p.close();
  }
  console.log('shots done; errors:', JSON.stringify(errs));
  // probe
  if (process.argv.indexOf('--noprobe') < 0) {
    const rows = [];
    for (const [w, h] of SIZES) for (const q of ['full', 'lite', 'off']) {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.goto(base + '?manual=1&seed=7&q=' + q);
      await p.evaluate(() => demo.step(60, 1 / 60));
      const ms = await p.evaluate((n) => { const a = []; for (let i = 0; i < n; i++) a.push(demo.timeOne(1 / 60)); return a; }, w === 475 ? 300 : 120);
      const stats = await p.evaluate(() => demo.stats());
      ms.sort((x, y) => x - y);
      const avg = ms.reduce((s, v) => s + v, 0) / ms.length, p95 = ms[Math.floor(ms.length * 0.95)], med = ms[Math.floor(ms.length / 2)];
      console.log('row', w, h, q, avg.toFixed(1), p95.toFixed(1)); rows.push('| ' + w + 'x' + h + ' | ' + q + ' | ' + avg.toFixed(2) + ' | ' + med.toFixed(2) + ' | ' + p95.toFixed(2) + ' | ' + stats.particles + ' (peak ' + stats.peak + ') |');
      await p.close();
    }
    const table = '(300 frames at 475x638, 120 frames at the other sizes to keep the run under 10 min; 4x CPU throttle; headless software raster, no GPU)\n\n| size | quality | avg ms | median ms | p95 ms | particles |\n|---|---|---|---|---|---|\n' + rows.join('\n');
    console.log(table);
    const f = path.join(root, 'src/review/vfx-beta.md');
    let md = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    const a = '<!--PROBE-->', z = '<!--/PROBE-->';
    const block = a + '\n' + table + '\n' + z;
    if (md.indexOf(a) >= 0) md = md.replace(new RegExp(a + '[\\s\\S]*?' + z), block); else md += '\n' + block + '\n';
    fs.writeFileSync(f, md);
  }
  await b.close(); srv.close();
});
