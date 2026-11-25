// Lists gated games (pages/<g>/layout-gate.json), changed gated games, and new games missing the marker.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MARKER = 'layout-gate.json';

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

export function listGated(pagesDir = 'pages') {
  if (!isDir(pagesDir)) return [];
  return readdirSync(pagesDir)
    .filter((g) => g !== '_shared' && !g.startsWith('.') && isDir(join(pagesDir, g)) && existsSync(join(pagesDir, g, MARKER)))
    .sort();
}

// Paths come back relative to pagesDir (git --relative), so absolute or relative pagesDir both work.
function diffNames(base, pagesDir, filter) {
  const args = ['-C', pagesDir, 'diff', '--name-only', '--relative'];
  if (filter) args.push(`--diff-filter=${filter}`);
  args.push(`${base}...HEAD`, '--', '.');
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Games (top-level dirs under pages/) with any file changed in the diff. Needs git; pagesDir defaults to 'pages'.
export function changedGames(base, pagesDir = 'pages') {
  const games = new Set();
  for (const f of diffNames(base, pagesDir)) {
    const g = f.split('/')[0];
    if (f.includes('/') && g !== '_shared') games.add(g);
  }
  return [...games].sort();
}

export function changedGated(base, pagesDir = 'pages') {
  const gated = new Set(listGated(pagesDir));
  return changedGames(base, pagesDir).filter((g) => gated.has(g));
}

// New games: pages/<g>/index.html added in the diff, with no marker on disk.
export function newGamesMissingMarker(base, pagesDir = 'pages') {
  const out = [];
  for (const f of diffNames(base, pagesDir, 'A')) {
    const m = /^([^/]+)\/index\.html$/.exec(f);
    if (!m || m[1] === '_shared') continue;
    if (!existsSync(join(pagesDir, m[1], MARKER))) out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

function cli(argv) {
  const pagesIdx = argv.indexOf('--pages');
  const pagesDir = pagesIdx >= 0 ? argv[pagesIdx + 1] : 'pages';
  const arg = (f) => argv[argv.indexOf(f) + 1];
  if (argv.includes('--list')) {
    for (const g of listGated(pagesDir)) console.log(g);
    return 0;
  }
  if (argv.includes('--changed')) {
    const base = arg('--changed');
    if (!base) { console.error('usage: --changed <base>'); return 2; }
    for (const g of changedGated(base, pagesDir)) console.log(g);
    return 0;
  }
  if (argv.includes('--check-new')) {
    const base = arg('--check-new');
    if (!base) { console.error('usage: --check-new <base>'); return 2; }
    const missing = newGamesMissingMarker(base, pagesDir);
    if (!missing.length) { console.log('Layout gate: all new games have a layout-gate.json marker'); return 0; }
    console.error(`Layout gate: new game(s) missing ${MARKER}:`);
    for (const g of missing) console.error(`  ${pagesDir}/${g}/${MARKER}`);
    console.error('New games must be gated: add the marker, window.__test and layout tags (see tools/layout-gate/README.md).');
    return 1;
  }
  console.error('usage: gated.mjs --list | --changed <base> | --check-new <base> [--pages pages]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(cli(process.argv.slice(2))); }
  catch (e) { console.error(`gated.mjs: ${e.message}`); process.exit(2); }
}
