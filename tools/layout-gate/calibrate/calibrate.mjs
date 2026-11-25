#!/usr/bin/env node
// Calibration: run the layout gate on Chart school at the buggy (PR 126) and fixed (PR 127) commits.
// Usage: node tools/layout-gate/calibrate/calibrate.mjs [--buggy 9d23ac3] [--fixed f7e77c5] [--out <scratch>] [--sizes id,id] [--no-sheets]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const gate = path.join(repo, 'tools', 'layout-gate', 'gate.mjs');
const shim = path.join(here, 'chart-school-shim.js');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const buggy = opt('--buggy', '9d23ac3');
const fixed = opt('--fixed', 'f7e77c5');
const out = opt('--out', fs.mkdtempSync(path.join(os.tmpdir(), 'lg-calib-out-')));
const sizes = opt('--sizes');
const noSheets = args.includes('--no-sheets');

// Known PR 126 bugs: how each is recognised in the report (check id + detail/sel regex).
const BUGS = [
  { id: 'right-only', name: 'chart uses only right part of card', test: (i) => ['fill-empty', 'svg-empty-half'].includes(i.check) },
  { id: 'dup-192', name: 'stacked duplicate price tags (the "192" bug)', test: (i) => i.check === 'dup-label' && /duplicate "\d+"/.test(i.detail) },
  { id: 'support-axis', name: '"support" label over axis', test: (i) => ['text-overlap', 'text-over-mark', 'dup-label', 'clipped'].includes(i.check) && /"support"/i.test(i.detail) },
  { id: 'pick-marks', name: '"your pick" label over marks', test: (i) => ['text-over-mark', 'text-overlap'].includes(i.check) && /pick/i.test(i.detail) },
];

function run(commit) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `lg-calib-${commit}-`));
  const tar = spawnSync('sh', ['-c', `git archive ${commit} pages | tar -x -C "${tmp}"`], { cwd: repo, encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`git archive ${commit} failed: ${tar.stderr}`);
  const marker = { version: 1, entry: 'index.html', minStates: 3, canvas: false, webgl: false, settleMs: 150, soft: [], waivers: [] };
  fs.writeFileSync(path.join(tmp, 'pages', 'chart-school', 'layout-gate.json'), JSON.stringify(marker, null, 2));
  const o = path.join(out, commit);
  fs.mkdirSync(o, { recursive: true });
  const a = [gate, '--game', 'chart-school', '--pages', path.join(tmp, 'pages'), '--shim', shim, '--out', o];
  if (sizes) a.push('--sizes', sizes);
  if (noSheets) a.push('--no-sheets');
  const r = spawnSync('node', a, { cwd: repo, encoding: 'utf8', timeout: 20 * 60 * 1000 });
  const rp = path.join(o, 'layout-report.json');
  if (!fs.existsSync(rp)) throw new Error(`no report for ${commit} (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
  return { commit, exit: r.status, line: (r.stdout.match(/Layout gate:.*/) || [''])[0], report: JSON.parse(fs.readFileSync(rp, 'utf8')), dir: o };
}

const pad = (s, n) => String(s).padEnd(n);
const results = [buggy, fixed].map(run);

const checks = [...new Set(results.flatMap((r) => r.report.issues.map((i) => i.check)))].sort();
console.log(`\nout: ${out}`);
for (const r of results) console.log(`${r.commit}: exit ${r.exit}  ${r.line}`);
console.log('\n' + pad('check', 20) + results.map((r) => pad(`${r.commit} HARD/SOFT`, 20)).join(''));
const cnt = (r, c, sev) => r.report.issues.filter((i) => i.check === c && i.severity === sev && !i.waived).length;
for (const c of checks) console.log(pad(c, 20) + results.map((r) => pad(`${cnt(r, c, 'HARD')}/${cnt(r, c, 'SOFT')}`, 20)).join(''));
console.log(pad('TOTAL', 20) + results.map((r) => pad(`${r.report.counts.hard}/${r.report.counts.soft}`, 20)).join(''));

console.log('\nKnown PR 126 bugs caught (issue count; first match):');
for (const b of BUGS) {
  console.log(pad(b.name, 40) + results.map((r) => {
    const m = r.report.issues.filter((i) => !i.waived && b.test(i));
    return pad(`${r.commit}: ${m.length ? 'CAUGHT x' + m.length : 'missed'}`, 24);
  }).join(''));
}

const fx = results[1].report.issues.filter((i) => i.severity === 'HARD' && !i.waived);
console.log(`\nFixed-commit HARD hits (likely false alarms): ${fx.length}`);
const seen = new Set();
for (const i of fx) { const k = `${i.check}|${i.detail}`; if (seen.has(k)) continue; seen.add(k); console.log(`  ${i.check} @${i.size}/${i.state}: ${i.detail} [${i.sel}]`); if (seen.size >= 40) break; }
fs.writeFileSync(path.join(out, 'calibration-summary.json'), JSON.stringify(results.map((r) => ({ commit: r.commit, exit: r.exit, summary: r.report.summary, counts: r.report.counts, verdict: r.report.verdict })), null, 2));
process.exit(0);
