#!/usr/bin/env node
'use strict';
// PWA update e2e (contract pgs-update-1 section 8). See README.md.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const PAGES = path.join(REPO, 'pages');

// ---------- args ----------
function parseArgs(argv) {
  const o = { games: [], legacy: true, legacyOnly: false, jobs: 4, timeoutMs: 120000, // admin default
    ref: process.env.PGS_LEGACY_REF || 'origin/main', list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-legacy') o.legacy = false;
    else if (a === '--legacy-only') o.legacyOnly = true;
    else if (a === '--list') o.list = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--jobs') o.jobs = parseInt(argv[++i], 10);
    else if (a.startsWith('--jobs=')) o.jobs = parseInt(a.slice(7), 10);
    else if (a === '--timeout') o.timeoutMs = parseInt(argv[++i], 10) * 1000;
    else if (a.startsWith('--timeout=')) o.timeoutMs = parseInt(a.slice(10), 10) * 1000;
    else if (a.startsWith('--')) throw new Error('unknown flag ' + a);
    else o.games.push(...a.split(',').filter(Boolean));
  }
  if (!(o.jobs >= 1)) throw new Error('--jobs must be >= 1');
  if (!(o.timeoutMs > 0)) throw new Error('--timeout must be > 0 (seconds)');
  return o;
}

function listGames(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_shared' && fs.existsSync(path.join(dir, d.name, 'manifest.webmanifest')))
    .map(d => d.name).sort();
}

// ---------- static server ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
};
function makeServer(initialRoot) {
  const st = { root: initialRoot };
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith('/banglawar/')) { res.writeHead(404); return res.end('404'); }
      p = p.slice('/banglawar/'.length);
      let f = path.resolve(st.root, p);
      if (f !== st.root && !f.startsWith(st.root + path.sep)) { res.writeHead(404); return res.end('404'); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('404'); }
      const buf = fs.readFileSync(f);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'max-age=600', 'Content-Length': buf.length,
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port, setRoot: r => { st.root = r; }, close: () => new Promise(r => server.close(r)),
    closeAll: () => server.closeAllConnections && server.closeAllConnections(),
  })));
}

// ---------- build prep ----------
function tmp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), 'pgs-e2e-' + label + '-')); }
function copyPages(label) {
  const d = tmp(label);
  fs.cpSync(PAGES, d, { recursive: true });
  return d;
}
function stamp(dir, salt, games) {
  execFileSync('python3', [path.join(REPO, 'tools', 'stamp_build.py'), dir, '--salt', salt, '--only', games.join(',')],
    { stdio: ['ignore', 'pipe', 'inherit'] });
}
function buildOf(dir, game) {
  return JSON.parse(fs.readFileSync(path.join(dir, game, 'version.json'), 'utf8')).build;
}
function legacyDir(ref) {
  const d = tmp('L');
  execSync(`git archive ${ref} pages | tar -x -C ${JSON.stringify(d)}`, { cwd: REPO, shell: '/bin/bash', stdio: ['ignore', 'pipe', 'inherit'] });
  return path.join(d, 'pages');
}

// ---------- page helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(page, fn, arg) { try { return await page.evaluate(fn, arg); } catch (e) { return undefined; } }
async function waitUntil(fn, ms, step = 250) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step); }
  return false;
}
async function hasController(page) {
  return ev(page, () => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
}
async function waitController(page, ms = 20000) {
  if (await waitUntil(() => hasController(page), ms / 2)) return true;
  try { await page.reload({ waitUntil: 'load' }); } catch (e) {}
  return !!(await waitUntil(() => hasController(page), ms / 2));
}
const getBuild = page => ev(page, () => window.PGS_BUILD);
async function waitBuild(page, want, ms = 20000) {
  return !!(await waitUntil(async () => (await getBuild(page)) === want, ms));
}
function watch(page, tag, log) {
  page.on('pageerror', e => log(`  [${tag}] pageerror: ${String(e.message).split('\n')[0]}`));
}

// ---------- per-game run ----------
async function runGame(browser, game, ctx, opts) {
  const lines = [];
  let failed = false;
  const log = s => lines.push(s);
  const res = (step, ok, detail) => { if (!ok) failed = true; log(`${ok ? 'PASS' : 'FAIL'} ${game} ${step}${detail ? ' ' + detail : ''}`); return ok; };
  const srv = await makeServer(ctx.A || ctx.L);
  const base = `http://127.0.0.1:${srv.port}/banglawar/${game}/`;
  const contexts = [];
  const newCtx = async init => {
    const c = await browser.newContext({ serviceWorkers: 'allow' });
    if (init) await c.addInitScript(init);
    contexts.push(c);
    return c;
  };
  const body = async () => {
    if (!opts.legacyOnly) {
      const bA = buildOf(ctx.A, game), bB = buildOf(ctx.B, game);
      // 1. first load on A
      srv.setRoot(ctx.A);
      const c1 = await newCtx();
      const p1 = await c1.newPage(); watch(p1, 'A', log);
      await p1.goto(base, { waitUntil: 'load' });
      const ctl = await waitController(p1);
      const gotA = await waitBuild(p1, bA, 10000);
      if (!res('1-first-load', ctl && gotA, `controller=${ctl} build=${await getBuild(p1)} want=${bA}`)) return;
      // 2. update to B
      srv.setRoot(ctx.B);
      try { await p1.reload({ waitUntil: 'load' }); } catch (e) {}
      const t0 = Date.now();
      const gotB = await waitBuild(p1, bB, 20000);
      res('2-update', gotB, `build=${await getBuild(p1)} want=${bB} t=${Date.now() - t0}ms`);
      // 4. offline (B is served and cached)
      if (gotB) {
        // wait until the new SW has installed+activated (its cache holds the page) before cutting the network
        await waitUntil(() => ev(p1, async g => {
          const c = await caches.open('pgs-' + g.game + '-' + g.b);
          return !!(await c.match(g.url, { ignoreSearch: true })) && !!navigator.serviceWorker.controller;
        }, { game, b: bB, url: base + 'index.html' }), 15000);
        await c1.setOffline(true);
        let ok = false;
        for (let t = 0; t < 2 && !ok; t++) { try { await p1.reload({ waitUntil: 'load', timeout: 15000 }); ok = await waitBuild(p1, bB, 10000); } catch (e) { log('  offline reload error (try ' + (t + 1) + '): ' + e.message.split('\n')[0]); await sleep(1000); } } // update.js may auto-reload at the same moment
        res('4-offline', ok, `build=${await getBuild(p1)} want=${bB}`);
        await c1.setOffline(false);
      }
      // 3. toast path (first game only)
      if (opts.toastGame === game) {
        srv.setRoot(ctx.B);
        const bC = buildOf(ctx.C, game);
        const c3 = await newCtx('window.PGS_UPDATE_CFG={autoReloadWindowMs:0};');
        const p3 = await c3.newPage(); watch(p3, 'toast', log);
        await p3.goto(base, { waitUntil: 'load' });
        const ctl3 = await waitController(p3);
        const b3 = await waitBuild(p3, bB, 10000);
        if (!(ctl3 && b3)) res('3-toast', false, `setup controller=${ctl3} build=${await getBuild(p3)} want=${bB}`);
        else {
          srv.setRoot(ctx.C);
          await ev(p3, () => window.PGS_UPDATE && window.PGS_UPDATE.check());
          const shown = await waitUntil(() => ev(p3, () => {
            const t = document.getElementById('pgs-update-toast');
            return !!t && t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== 'hidden' && getComputedStyle(t).display !== 'none';
          }), 20000);
          if (!shown) res('3-toast', false, `toast not visible; build=${await getBuild(p3)}`);
          else {
            try { await p3.click('#pgs-update-reload', { timeout: 5000 }); } catch (e) { log('  click error: ' + e.message.split('\n')[0]); }
            const gotC = await waitBuild(p3, bC, 20000);
            res('3-toast', gotC, `build=${await getBuild(p3)} want=${bC}`);
          }
        }
      }
    }
    // 5. legacy
    if (opts.legacy) {
      srv.setRoot(ctx.L);
      const bB = buildOf(ctx.B, game);
      const c5 = await newCtx();
      const p5 = await c5.newPage(); watch(p5, 'legacy', log);
      const r = await p5.goto(base, { waitUntil: 'load' }).catch(e => null);
      if (!r || r.status() !== 200) { log(`SKIP ${game} 5-legacy game absent at ${opts.ref} (status ${r && r.status()})`); return; }
      const ctl = await waitController(p5, 12000);
      log(`  legacy: old SW controller=${ctl}`);
      srv.setRoot(ctx.B);
      let n = 0, ok = false, seen;
      for (n = 1; n <= 3 && !ok; n++) {
        if (n > 1) await sleep(1000);
        try { await p5.reload({ waitUntil: 'load' }); } catch (e) {}
        ok = await waitBuild(p5, bB, 6000);
        seen = ok ? bB : await getBuild(p5);
      }
      res('5-legacy', ok, `reloads=${ok ? n - 1 : 3} build=${seen} want=${bB}`);
    }
  };
  let timer;
  try {
    await Promise.race([
      body(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${opts.timeoutMs / 1000}s`)), opts.timeoutMs); }),
    ]);
  } catch (e) { res('error', false, e.message.split('\n')[0]); }
  clearTimeout(timer);
  for (const c of contexts) { try { await c.close(); } catch (e) {} }
  srv.closeAll(); await srv.close();
  return { game, lines, failed };
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('usage: node tests/pwa-update/e2e.js [game,...] [--no-legacy] [--legacy-only] [--jobs N] [--timeout SECONDS] [--list]\nenv PGS_LEGACY_REF (default origin/main)');
    return 0;
  }
  const all = listGames(PAGES);
  const games = opts.games.length ? opts.games : all;
  for (const g of games) if (!all.includes(g)) throw new Error('unknown game ' + g + ' (known: ' + all.join(', ') + ')');
  if (opts.list) { console.log(games.join('\n')); return 0; }
  if (opts.legacyOnly && !opts.legacy) throw new Error('--legacy-only conflicts with --no-legacy');
  opts.toastGame = games[0];
  const ctx = {};
  if (!opts.legacyOnly) {
    ctx.A = copyPages('A'); stamp(ctx.A, 'A', games);
    ctx.B = copyPages('B'); stamp(ctx.B, 'B', games);
    ctx.C = copyPages('C'); stamp(ctx.C, 'C', [opts.toastGame]);
  } else {
    // legacy-only still needs a "new" build B to swap to
    ctx.B = copyPages('B'); stamp(ctx.B, 'B', games);
  }
  if (opts.legacy) ctx.L = legacyDir(opts.ref);
  const browser = await chromium.launch();
  const results = [];
  const queue = games.slice();
  const worker = async () => {
    while (queue.length) {
      const g = queue.shift();
      const r = await runGame(browser, g, ctx, opts);
      for (const l of r.lines) console.log(l);
      results.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.jobs, games.length) }, worker));
  await browser.close();
  const bad = results.filter(r => r.failed).map(r => r.game);
  console.log(`\n${games.length - bad.length}/${games.length} games passed` + (bad.length ? `; FAILED: ${bad.join(', ')}` : ''));
  return bad.length ? 1 : 0;
}

if (require.main === module) {
  main().then(c => process.exit(c), e => { console.error('e2e error: ' + e.message); process.exit(2); });
}
module.exports = { parseArgs, makeServer, listGames };
