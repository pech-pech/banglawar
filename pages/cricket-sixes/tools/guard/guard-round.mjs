// GUARD round: compare the live tree's classic behaviour with the main snapshot, run unit tests + e2e, append a round to GUARD.md.
// Usage: node tools/guard/guard-round.mjs <liveRoot> <mainRoot> <baselineSnap.json> <workDir> <GUARD.md> [--no-e2e]
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { snap, stateAt, norm } from './classic-snap.mjs';

const [live, main, basePath, work, guardMd] = process.argv.slice(2);
const noE2e = process.argv.includes('--no-e2e');
const t0 = new Date();
const out = [];
const say = (x) => { out.push(x); console.log(x); };
mkdirSync(work, { recursive: true });

// ---- 1. classic hash diff
function diffPaths(a, b, p = '', acc = []) {
  if (acc.length >= 8) return acc;
  if (a === b) return acc;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], p + '.' + k, acc);
    return acc;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) acc.push(`${p || '.'}: main=${JSON.stringify(a)?.slice(0, 60)} live=${JSON.stringify(b)?.slice(0, 60)}`);
  return acc;
}
let hashLine = '';
let regress = false;
try {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const cur = await snap(live, base.N);
  let rawOnly = 0, same = 0, bad = [];
  for (const r of base.runs) {
    const c = cur.runs.find((x) => x.name === r.name);
    if (!c) { bad.push({ name: r.name, idx: -1, why: 'run missing' }); continue; }
    let firstBad = -1;
    const n = Math.max(r.steps.length, c.steps.length);
    for (let i = 0; i < n; i++) {
      const a = r.steps[i], b = c.steps[i];
      if (!a || !b || a[0] !== b[0]) { firstBad = i; break; }
      if (a[2] !== b[2]) { firstBad = i; break; }
      if (a[1] !== b[1]) rawOnly++; else same++;
    }
    if (firstBad >= 0) bad.push({ name: r.name, idx: firstBad, cmd: (r.steps[firstBad] || c.steps[firstBad] || [])[0], why: (r.steps[firstBad] && c.steps[firstBad] && r.steps[firstBad][0] === c.steps[firstBad][0]) ? 'state' : 'command sequence/length' });
  }
  hashLine = `classic hashes: ${base.runs.length - bad.length}/${base.runs.length} runs identical after norm; ${same} states raw-identical, ${rawOnly} differ only in wheel fields (expected)`;
  if (bad.length) {
    regress = true;
    hashLine += `; **${bad.length} runs DIVERGE**`;
    const b0 = bad[0];
    let paths = [];
    if (b0.idx > 0 && b0.why === 'state') {
      const [sa, sb] = [await stateAt(main, b0.name, b0.idx, base.N), await stateAt(live, b0.name, b0.idx, base.N)];
      paths = diffPaths(norm(sa), norm(sb));
    }
    hashLine += `\n  - first: ${b0.name} step ${b0.idx} (${b0.cmd}, ${b0.why})` + paths.map((p) => `\n    - ${p}`).join('');
    hashLine += `\n  - runs: ${bad.slice(0, 6).map((x) => `${x.name}@${x.idx}`).join(', ')}${bad.length > 6 ? ' ...' : ''}`;
  }
} catch (e) {
  hashLine = `classic hashes: live tree did not load/run (${String(e && e.message || e).split('\n')[0].slice(0, 160)}) - likely mid-edit, recheck next round`;
  regress = true;
}
say(hashLine);

// ---- 2. unit tests
const mainFiles = readdirSync(join(main, 'test')).filter((f) => f.endsWith('.test.mjs'));
function unit(root, which = 'all') {
  const files = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).filter((f) => which === 'all' || (which === 'old') === mainFiles.includes(f)).map((f) => 'test/' + f);
  if (!files.length) return { pass: 0, fail: 0, tests: 0, failing: [], files: 0, txt: '' };
  const r = spawnSync('node', ['--test', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
  const txt = (r.stdout || '') + (r.stderr || '');
  const num = (k) => { const m = txt.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')); return m ? +m[1] : NaN; };
  const failing = [...new Set([...txt.matchAll(/^\s*✖ (.+?)(?: \([\d.]+m?s\))?$/gm)].map((m) => m[1].trim()))].filter((x) => !/^failing tests:?$/.test(x));
  return { pass: num('pass'), fail: num('fail'), tests: num('tests'), failing, files: files.length, txt };
}
const mainUnitPath = join(work, 'main-unit.json');
let mu;
if (existsSync(mainUnitPath)) mu = JSON.parse(readFileSync(mainUnitPath, 'utf8'));
else { const u = unit(main); mu = { pass: u.pass, fail: u.fail, failing: u.failing }; writeFileSync(mainUnitPath, JSON.stringify(mu)); }
const lu = unit(live, 'old');
const nu = unit(live, 'new');
writeFileSync(join(work, 'live-unit-last.log'), lu.txt + '\n\n==== NEW FILES ====\n' + nu.txt);
const newFails = lu.failing.filter((x) => !mu.failing.includes(x));
const unitLine = `unit (old files, must match main): ${lu.pass}/${lu.tests} pass, ${lu.fail} fail (${lu.files} files; main ${mu.pass} pass, ${mu.fail} fail)` + (newFails.length || lu.fail ? `; **failures: ${(newFails.length ? newFails : lu.failing).slice(0, 8).join(' | ')}**` : '')
  + `\n  - new wheel test files (${nu.files}): ${nu.pass}/${nu.tests} pass, ${nu.fail} fail${nu.fail ? ' (' + nu.failing.slice(0, 5).join(' | ') + ')' : ''}`;
if (newFails.length || lu.fail > 0 || lu.pass < mu.pass) regress = true;
say(unitLine);

// ---- 3. e2e (playwright scripts, run from the app root; they use window.__store and drive the UI)
let e2eLine = 'e2e: skipped this round';
if (!noE2e) {
  const mainE2e = join(work, 'main-e2e.json');
  const runE2e = (root, tag) => {
    const res = {};
    for (const f of readdirSync(join(root, 'test/e2e')).filter((x) => x.endsWith('.mjs'))) {
      const b = basename(f, '.mjs');
      const r = spawnSync('node', ['test/e2e/' + f], { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: { ...process.env, E2E_SHOTS: join(work, `shots-${tag}`, b) + '/' } });
      const txt = (r.stdout || '') + (r.stderr || '');
      writeFileSync(join(work, `e2e-${tag}-${b}.log`), txt);
      const fails = txt.split('\n').filter((l) => /\bFAIL\b|✗|✖/.test(l)).slice(0, 4).map((l) => l.trim().slice(0, 120));
      res[b] = { code: r.status, fails };
    }
    return res;
  };
  const me = existsSync(mainE2e) ? JSON.parse(readFileSync(mainE2e, 'utf8')) : (() => { const x = runE2e(main, 'main'); writeFileSync(mainE2e, JSON.stringify(x)); return x; })();
  const le = runE2e(live, 'live');
  const worse = Object.keys(me).filter((k) => me[k].code === 0 && le[k] && le[k].code !== 0);
  e2eLine = `e2e: ${Object.keys(le).map((k) => `${k} ${le[k].code === 0 ? 'ok' : 'FAIL(' + le[k].code + ')'}${me[k] && me[k].code !== 0 ? '[main also ' + me[k].code + ']' : ''}`).join(', ')}`;
  if (worse.length) { regress = true; e2eLine += `\n  - **new e2e failures vs main: ${worse.join(', ')}**` + worse.map((k) => le[k].fails.map((l) => `\n    - ${k}: ${l}`).join('')).join(''); }
}
say(e2eLine);

// ---- 4. culprit candidates: what changed in the working tree (vs HEAD), and since last round
const repo = execSync('git rev-parse --show-toplevel', { cwd: live, encoding: 'utf8' }).trim();
const stat = execSync('git status --porcelain -- pages/cricket-sixes', { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean).filter((l) => !l.includes('tools/guard/'));
const hashOf = (f) => { try { return execSync(`git hash-object "${f}"`, { cwd: repo, encoding: 'utf8' }).trim(); } catch (e) { return 'gone'; } };
const fileHashes = Object.fromEntries(stat.map((l) => { const f = l.slice(3); return [f, hashOf(f)]; }));
const prevP = join(work, 'prev-files.json');
const prev = existsSync(prevP) ? JSON.parse(readFileSync(prevP, 'utf8')) : {};
writeFileSync(prevP, JSON.stringify(fileHashes));
const changedSince = Object.keys(fileHashes).filter((f) => prev[f] !== fileHashes[f]).concat(Object.keys(prev).filter((f) => !(f in fileHashes)));
const classicTouch = stat.map((l) => l.slice(3)).filter((f) => /js\/(core|store|data)\//.test(f) && !/wheelmatch/.test(f));
const changeLine = `tree: ${stat.length} changed files vs HEAD; changed since last round: ${changedSince.length ? changedSince.map((f) => f.replace('pages/cricket-sixes/', '')).join(', ') : 'none'}` + (classicTouch.length ? `\n  - shared classic files edited: ${classicTouch.map((f) => f.replace('pages/cricket-sixes/', '')).join(', ')}` : '');
say(changeLine);

const secs = Math.round((Date.now() - t0) / 1000);
const block = `\n### Round ${t0.toISOString().slice(11, 16)} UTC (${secs}s) - ${regress ? 'ATTENTION' : 'clean'}\n- ${hashLine}\n- ${unitLine}\n- ${e2eLine}\n- ${changeLine}\n`;
appendFileSync(guardMd, block);
writeFileSync(join(work, 'last-round.json'), JSON.stringify({ regress, quiet: changedSince.length === 0, at: t0.toISOString() }));
