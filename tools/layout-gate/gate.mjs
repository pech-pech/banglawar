#!/usr/bin/env node
// PGS layout gate CLI (CONTRACT.md section 7). Exports SIZES and runGate(options).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gameHash } from './hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SIZES = [
  { id: 'fold-cover-344x882', w: 344, h: 882, device: 'Fold cover', mobile: true, eye: true },
  { id: 'fold-cover-475x638', w: 475, h: 638, device: 'Fold cover', mobile: true },
  { id: 'fold-open-704x823', w: 704, h: 823, device: 'Fold open portrait', mobile: true },
  { id: 'fold-open-882x704', w: 882, h: 704, device: 'Fold open landscape', mobile: true },
  { id: 's23u-384x824', w: 384, h: 824, device: 'Galaxy S23 Ultra', mobile: true },
  { id: 'desk-1366x768', w: 1366, h: 768, device: 'Desktop', mobile: false },
  { id: 'desk-1920x1080', w: 1920, h: 1080, device: 'Desktop', mobile: false },
];

const STANDALONE_SHIM = `(() => {
  const orig = window.matchMedia.bind(window);
  const re = /display-mode\\s*:\\s*(standalone|fullscreen)/;
  window.matchMedia = function (q) {
    const r = orig(q);
    if (!re.test(String(q))) return r;
    return new Proxy(r, {
      get(t, k) {
        if (k === 'matches') return true;
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  };
  try { Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true }); } catch (e) {}
})();`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.map': 'application/json',
};

function startServer(root) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(base, p);
      if (f !== base && !f.startsWith(base + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) {
        if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'x.js'))('playwright');
}

const readOpt = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms))]);

function applyWaivers(issue, waivers, sizeId, state) {
  if (issue.waived) return;
  for (const w of waivers) {
    if (w.check !== issue.check) continue;
    if (w.state && w.state !== '*' && w.state !== state) continue;
    if (w.size && w.size !== '*' && w.size !== sizeId) continue;
    if (w.match && !String(issue.detail || '').includes(w.match)) continue;
    issue.waived = w.reason || 'waived';
    return;
  }
}

async function runSize(browser, sz, ctx) {
  const { url, marker, scripts, shot } = ctx;
  const out = { issues: [], states: [], notChecked: new Set(), ignored: 0, shots: [] };
  const context = await browser.newContext({
    viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 1, hasTouch: sz.mobile, isMobile: sz.mobile,
    serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  const add = (state, i) => {
    const issue = { size: sz.id, state, check: i.check, severity: i.severity || 'HARD', detail: i.detail || '', sel: i.sel || '', box: i.box || [0, 0, 0, 0], waived: i.waived || null };
    if (issue.severity === 'HARD' && issue.waived == null && (marker.soft || []).includes(issue.check)) issue.severity = 'SOFT';
    applyWaivers(issue, marker.waivers || [], sz.id, state);
    out.issues.push(issue);
  };
  try {
    for (const s of [STANDALONE_SHIM, scripts.hook, scripts.shim]) if (s) await context.addInitScript({ content: s });
    const page = await context.newPage();
    let current = '(load)';
    let loading = true;
    const seen = new Set();
    const loadErr = (d) => { if (!seen.has(d)) { seen.add(d); add(current, { check: 'load-error', severity: 'HARD', detail: d.slice(0, 300), sel: 'window' }); } };
    page.on('pageerror', (e) => loadErr('pageerror: ' + (e && e.message || e)));
    page.on('console', (m) => {
      if (!loading || m.type() !== 'error') return;
      const u = m.location() && m.location().url || '';
      if (/favicon/.test(u)) return;
      if (/Failed to load resource/i.test(m.text())) return; // failed subresource (e.g. version.json 404): not a page error; failed main document is caught by goto
      loadErr('console.error: ' + m.text());
    });
    const takeShot = async (label) => {
      if (!shot) return;
      try { out.shots.push({ state: label, buf: await page.screenshot({ type: 'jpeg', quality: 70 }) }); } catch {}
    };
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      if (resp && resp.status() >= 400) { add('(load)', { check: 'load-error', severity: 'HARD', detail: 'main document HTTP ' + resp.status(), sel: 'window' }); return out; }
    } catch (e) {
      add('(load)', { check: 'load-error', detail: 'navigation failed: ' + e.message.split('\n')[0], sel: 'window' });
      return out;
    }
    for (const [key, name, src] of [['probe', 'probe.js', scripts.probe], ['canvas', 'canvas-probe.js', scripts.canvas]]) {
      if (src) { try { await page.addScriptTag({ content: src }); } catch {} }
      const fn = key === 'probe' ? '__pgsLayoutProbe' : '__pgsCanvasProbe';
      const ok = await page.evaluate((f) => typeof window[f] === 'function', fn).catch(() => false);
      if (!ok) out.notChecked.add(name);
    }
    const hasLayout = !out.notChecked.has('probe.js');
    const hasCanvas = !out.notChecked.has('canvas-probe.js');

    try {
      await page.waitForFunction(() => !!window.__test, null, { timeout: 10000 });
      await page.evaluate((ms) => Promise.race([Promise.resolve(window.__test.ready), new Promise((_, r) => setTimeout(() => r(new Error('ready timeout')), ms))]).then((v) => { if (v === false) throw new Error('ready is false'); }), 10000);
    } catch (e) {
      add('(load)', { check: 'contract', detail: 'window.__test missing or never ready within 10s (' + e.message.split('\n')[0] + ')', sel: 'window.__test' });
      await takeShot('(load)');
      return out;
    }
    loading = false;
    let states;
    try {
      states = await page.evaluate(async () => {
        const t = window.__test;
        if (typeof t.seed === 'function') await t.seed(1);
        return await t.states();
      });
      if (!Array.isArray(states)) throw new Error('states() did not return an array');
    } catch (e) {
      add('(load)', { check: 'contract', detail: 'states() failed: ' + e.message.split('\n')[0], sel: 'window.__test.states' });
      await takeShot('(load)');
      return out;
    }
    out.states = states;
    const minStates = marker.minStates ?? 3;
    if (states.length < minStates) add('(load)', { check: 'contract', detail: `only ${states.length} states, need >= ${minStates}`, sel: 'window.__test.states' });

    for (const name of states) {
      current = name;
      try {
        await page.evaluate((n) => window.__test.goto(n), name);
      } catch (e) {
        add(name, { check: 'contract', detail: `goto(${name}) threw: ${e.message.split('\n')[0]}`, sel: 'window.__test.goto' });
        await takeShot(name);
        continue;
      }
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(marker.settleMs ?? 150);
      const run = async (fn) => {
        try { return (await page.evaluate((f) => window[f]({}), fn)) || []; }
        catch (e) { add(name, { check: 'contract', detail: `${fn} threw: ${e.message.split('\n')[0]}`, sel: fn }); return []; }
      };
      if (hasLayout) for (const i of await run('__pgsLayoutProbe')) add(name, i);
      if (hasCanvas) for (const i of await run('__pgsCanvasProbe')) add(name, i);
      const ign = await page.evaluate(() => document.querySelectorAll('[data-layout=ignore]').length).catch(() => 0);
      out.ignored = Math.max(out.ignored, ign);
      await takeShot(name);
    }
  } finally {
    await context.close().catch(() => {});
  }
  return out;
}

async function renderSheet(browser, sz, shots, issues, file) {
  const tw = Math.round(sz.w * 0.25), th = Math.round(sz.h * 0.25);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cells = shots.map((s) => {
    const hard = issues.filter((i) => i.size === sz.id && i.state === s.state && i.severity === 'HARD' && !i.waived).length;
    return `<figure class="${hard ? 'bad' : ''}"><img width="${tw}" height="${th}" src="data:image/jpeg;base64,${s.buf.toString('base64')}"><figcaption>${esc(s.state)}${hard ? ` <b>${hard} HARD</b>` : ''}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#222;color:#eee;font:13px sans-serif}h1{font-size:14px;margin:0 0 10px}.g{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;outline:3px solid #444}figure.bad{outline-color:#e11}img{display:block;background:#fff}figcaption{padding:3px 5px;background:#111}b{color:#f55}</style><h1>${esc(sz.id)} (${sz.w}x${sz.h}, 25%)</h1><div class="g">${cells}</div>`;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 400 } });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.screenshot({ path: file, fullPage: true });
  } finally { await ctx.close(); }
}

export async function runGate(options = {}) {
  const pages = path.resolve(options.pages || 'pages');
  const game = options.game;
  if (!game) throw Object.assign(new Error('--game required'), { usage: true });
  const gameDir = path.join(pages, game);
  if (!fs.existsSync(gameDir)) throw Object.assign(new Error(`game dir not found: ${gameDir}`), { usage: true });
  const probeDir = path.resolve(options.probeDir || HERE);
  const sizeIds = options.sizes ? (Array.isArray(options.sizes) ? options.sizes : String(options.sizes).split(',')) : null;
  let sizes = SIZES;
  if (sizeIds) {
    sizes = sizeIds.map((id) => SIZES.find((s) => s.id === id));
    const bad = sizeIds.filter((id, i) => !sizes[i]);
    if (bad.length) throw Object.assign(new Error('unknown size: ' + bad.join(',')), { usage: true });
  }
  const markerFile = path.join(gameDir, 'layout-gate.json');
  // admin default: missing marker means defaults (CI checks marker presence separately)
  const marker = { version: 1, entry: 'index.html', minStates: 3, canvas: false, webgl: false, settleMs: 150, soft: [], waivers: [], ...(fs.existsSync(markerFile) ? JSON.parse(fs.readFileSync(markerFile, 'utf8')) : {}) };
  const out = path.resolve(options.out || path.join(gameDir, 'qa', 'layout'));
  fs.mkdirSync(out, { recursive: true });
  const sheets = options.sheets !== false;

  const scripts = {
    hook: readOpt(path.join(probeDir, 'canvas-hook.js')),
    shim: options.shim ? fs.readFileSync(path.resolve(options.shim), 'utf8') : null,
    probe: readOpt(path.join(probeDir, 'probe.js')),
    canvas: readOpt(path.join(probeDir, 'canvas-probe.js')),
    shot: sheets,
  };
  const notChecked = new Set();
  if (!scripts.hook) notChecked.add('canvas-hook.js');
  if (marker.webgl) notChecked.add('webgl-scene');

  let served = null;
  let base = options.base;
  if (!base) { served = await startServer(pages); base = served.url; }
  base = base.replace(/\/$/, '');
  const url = `${base}/${game}/${marker.entry}?layoutgate=1`;

  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true });
  let results;
  try {
    results = await Promise.all(sizes.map((sz) => runSize(browser, sz, { url, marker, scripts, shot: sheets })));
    if (sheets) await Promise.all(sizes.map((sz, i) => results[i].shots.length ? renderSheet(browser, sz, results[i].shots, results[i].issues, path.join(out, `sheet-${sz.id}.png`)) : null));
  } finally {
    await browser.close().catch(() => {});
    if (served) served.server.close();
  }

  const all = [];
  const stateSet = [];
  let ignored = 0;
  results.forEach((r) => {
    r.notChecked.forEach((n) => notChecked.add(n));
    ignored = Math.max(ignored, r.ignored);
    for (const s of r.states) if (!stateSet.includes(s)) stateSet.push(s);
    all.push(...r.issues);
  });
  const hard = all.filter((i) => i.severity === 'HARD' && !i.waived).length;
  const soft = all.filter((i) => i.severity === 'SOFT' && !i.waived).length;
  const waived = all.filter((i) => i.waived).length;
  const wmap = new Map();
  for (const i of all) if (i.waived) { const k = i.check + '\0' + i.waived; wmap.set(k, (wmap.get(k) || 0) + 1); }
  const waiverList = [...wmap].map(([k, count]) => { const [check, reason] = k.split('\0'); return { check, reason, count }; });
  // cap 50 per size x state, HARD first
  const groups = new Map();
  for (const i of all) { const k = i.size + '\0' + i.state; (groups.get(k) || groups.set(k, []).get(k)).push(i); }
  const rank = (i) => (i.waived ? 2 : i.severity === 'HARD' ? 0 : 1);
  const issues = [];
  for (const g of groups.values()) issues.push(...g.sort((a, b) => rank(a) - rank(b)).slice(0, 50));
  const verdict = hard ? 'FAIL' : 'PASS';
  let commit = null;
  try { commit = execSync('git rev-parse HEAD', { cwd: gameDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const summary = `Layout gate: ${verdict}, ${sizes.length} sizes x ${stateSet.length} states, ${hard} fail, ${soft} soft, ${waived} waived`;
  const report = {
    gate: 'pgs-layout-gate', version: 1, game, gameHash: gameHash(gameDir), commit, createdAt: new Date().toISOString(), verdict,
    sizes: sizes.map((s) => s.id), states: stateSet, counts: { hard, soft, waived, ignored }, issues, waivers: waiverList,
    notChecked: [...notChecked], summary,
  };
  fs.writeFileSync(path.join(out, 'layout-report.json'), JSON.stringify(report, null, 2));
  return report;
}

function parseArgs(argv) {
  const o = { sheets: true };
  const val = (i, f) => { if (i + 1 >= argv.length) throw Object.assign(new Error(`${f} needs a value`), { usage: true }); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') o.game = val(i++, a);
    else if (a === '--pages') o.pages = val(i++, a);
    else if (a === '--base') o.base = val(i++, a);
    else if (a === '--sizes') o.sizes = val(i++, a);
    else if (a === '--out') o.out = val(i++, a);
    else if (a === '--shim') o.shim = val(i++, a);
    else if (a === '--probe-dir') o.probeDir = val(i++, a);
    else if (a === '--no-sheets') o.sheets = false;
    else if (a === '--json') o.json = true;
    else throw Object.assign(new Error('unknown arg ' + a), { usage: true });
  }
  return o;
}

async function main() {
  try {
    const o = parseArgs(process.argv.slice(2));
    const r = await runGate(o);
    console.log(r.summary);
    if (o.json) console.log(JSON.stringify(r, null, 2));
    process.exit(r.verdict === 'PASS' ? 0 : 1);
  } catch (e) {
    console.error('layout-gate error: ' + (e && e.message || e));
    if (e && e.usage) console.error('usage: node gate.mjs --game <name> [--pages pages] [--base url] [--sizes id,id] [--out dir] [--shim file.js] [--no-sheets] [--json]');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
