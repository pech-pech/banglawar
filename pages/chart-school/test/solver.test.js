#!/usr/bin/env node
// Independent solver for Chart School (Checker SOLVE). Written from CONTRACT.md text only
// (CHARTING CONVENTIONS C1-C7, READING TYPES R1-R7). Does NOT load src/engine.js.
// Usage: node test/solver.test.js [sheets.json]   exit 1 if any type < 99% agreement.
'use strict';
const fs = require('fs');
const path = require('path');

const LB = Math.log(1.02);
const boxOf = (p) => Math.floor(Math.log(p) / LB + 1e-9);   // highs, closes (C1)
const boxUp = (p) => Math.ceil(Math.log(p) / LB - 1e-9);    // lows (C1)
const priceOf = (b) => Math.pow(1.02, b);

// ---- C2/C3 P&F ----
function pnf(bars) {
  const cols = [];
  let lo = boxUp(bars[0].l), hi = boxOf(bars[0].h);
  if (lo > hi) lo = hi;
  let cur = { d: 1, lo, hi };
  for (let i = 1; i < bars.length; i++) {
    const h = boxOf(bars[i].h), l = boxUp(bars[i].l);
    if (cur.d === 1) {
      if (h > cur.hi) cur.hi = h;                       // Dorsey: high first
      else if (l <= cur.hi - 3) { cols.push(cur); cur = { d: -1, lo: l, hi: cur.hi - 1 }; }
    } else {
      if (l < cur.lo) cur.lo = l;
      else if (h >= cur.lo + 3) { cols.push(cur); cur = { d: 1, lo: cur.lo + 1, hi: h }; }
    }
  }
  cols.push(cur);
  return cols;
}

// ---- C4 signals; R1 ----
const SIGS = ['Double top buy', 'Triple top buy', 'Double bottom sell', 'Triple bottom sell', 'No signal'];
function colSignal(cols, j) {
  const c = cols[j];
  if (j < 2) return null;
  if (c.d === 1 && c.hi >= cols[j - 2].hi + 1) {
    return (j >= 4 && cols[j - 4].hi === cols[j - 2].hi) ? 'Triple top buy' : 'Double top buy';
  }
  if (c.d === -1 && c.lo <= cols[j - 2].lo - 1) {
    return (j >= 4 && cols[j - 4].lo === cols[j - 2].lo) ? 'Triple bottom sell' : 'Double bottom sell';
  }
  return null;
}
function r1(cols) {
  let ans = 'No signal', col = null;
  for (let j = Math.max(0, cols.length - 3); j < cols.length; j++) {
    const s = colSignal(cols, j);
    if (s) { ans = s; col = j; }                        // later column wins
  }
  return { ans, col };
}

// ---- indicators ----
function rsiSeries(c) {
  const out = new Array(c.length).fill(50);             // first value 50 (weeks 0-13 held at 50: admin default)
  if (c.length < 15) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) ag += d; else al -= d; }
  ag /= 14; al /= 14;
  const f = () => (al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al));
  out[14] = f();
  for (let i = 15; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * 13 + Math.max(d, 0)) / 14; al = (al * 13 + Math.max(-d, 0)) / 14;
    out[i] = f();
  }
  return out;
}
function ema(x, n) {
  const k = 2 / (n + 1), o = [x[0]];
  for (let i = 1; i < x.length; i++) o.push(x[i] * k + o[i - 1] * (1 - k));
  return o;
}
function macd(c) {
  const a = ema(c, 12), b = ema(c, 26);
  const m = c.map((_, i) => a[i] - b[i]);
  const s = ema(m, 9);
  return m.map((v, i) => v - s[i]);                      // hist
}

// ---- solve one sheet ----
function solve(sheet) {
  const bars = sheet.bars.map((x) => ({ h: x[0], l: x[1], c: x[2] }));
  const c = bars.map((b) => b.c), W = c.length - 1, n = () => cols.length;
  const cols = pnf(bars);
  const out = { disc: {} };
  const sig = r1(cols);
  out.R1 = sig.ans;
  // R2 / R2b: most recent completed column of each kind
  out.R2 = null; out.R2b = null;
  for (let j = cols.length - 2; j >= 0; j--) if (cols[j].d === -1) { out.R2 = cols[j].lo; break; }
  for (let j = cols.length - 2; j >= 0; j--) if (cols[j].d === 1) { out.R2b = cols[j].hi; break; }
  // R3 (C5)
  const N = cols.length;
  let at = -1, low = Infinity;
  for (let j = Math.max(0, N - 30); j < N; j++) if (cols[j].d === -1 && cols[j].lo < low) { low = cols[j].lo; at = j; }
  out.R3 = null;
  if (at < 0) out.disc.R3 = 'no O column';
  else {
    const line = low - 1 + (N - 1 - at), d = boxOf(c[W]) - line;
    out.R3 = d >= 3 ? 'Above by 3+ boxes' : d >= 1 ? 'Within 2 boxes above' : 'On or below';
  }
  // R4 (C6)
  out.R4 = null;
  if (sig.ans === 'Double top buy' || sig.ans === 'Triple top buy') {
    if (sig.col <= 1) out.disc.R4 = 'signal col <= 1';
    else { const k = cols[sig.col]; out.R4 = k.lo + 3 * (k.hi - k.lo + 1); }
  }
  // R5
  const rsi = rsiSeries(c), rv = rsi[W];
  out.R5 = rv > 70 ? 'Above 70' : rv >= 50 ? '50 to 70' : rv >= 30 ? '30 to 50' : 'Below 30';
  if ([30, 50, 70].some((t) => Math.abs(rv - t) < 1.0)) out.disc.R5 = 'near boundary';
  // R6
  const h = macd(c), hw = h[W], hp = h[W - 1];
  out.R6 = (hw >= 0 ? 'Positive' : 'Negative') + (hw > hp ? ' rising' : ' falling');
  const cb = boxOf(c[W]), bx = priceOf(cb + 1) - priceOf(cb);
  if (Math.abs(hw) < 0.02 * bx || Math.abs(hw - hp) < 0.005 * bx) out.disc.R6 = 'small hist';
  // R7
  let bear = false, bull = false;
  for (const t of [W, W - 1]) {
    if (t < 12) continue;
    let mx = -Infinity, mi = -1, mn = Infinity, ni = -1;
    for (let k = t - 12; k <= t - 1; k++) {
      if (c[k] >= mx) { mx = c[k]; mi = k; }             // latest on ties
      if (c[k] <= mn) { mn = c[k]; ni = k; }
    }
    if (c[t] > mx && rsi[t] < rsi[mi]) bear = true;
    if (c[t] < mn && rsi[t] > rsi[ni]) bull = true;
  }
  if (bear && bull) { out.R7 = null; out.disc.R7 = 'both'; }
  else out.R7 = bear ? 'Bearish' : bull ? 'Bullish' : 'None';
  return out;
}

module.exports = { solve, pnf };

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '..', 'data', 'sheets.json');
  if (!fs.existsSync(file)) { console.error('missing ' + file); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stat = {}, bad = {}, discV = {};
  const T = (t) => (stat[t] = stat[t] || { n: 0, ok: 0 });
  const note = (t, s) => { (bad[t] = bad[t] || []).push(s); };
  for (const sh of data.sheets) {
    const m = solve(sh), a = sh.ans, k2 = sh.r2key;
    const checks = [['R1', m.R1, a.R1], [k2, m[k2], a[k2]], ['R3', m.R3, a.R3],
      ['R4', m.R4, a.R4 == null ? null : a.R4], ['R5', m.R5, a.R5], ['R6', m.R6, a.R6], ['R7', m.R7, a.R7]];
    for (const [t, mine, theirs] of checks) {
      const key = t;
      const s = T(key); s.n++;
      if (mine === theirs) s.ok++; else note(key, sh.id + ' mine=' + mine + ' sheet=' + theirs);
      const dk = key; // discard violation: a shipped answer where solver says discard
      if (m.disc[dk] && theirs != null) { discV[dk] = (discV[dk] || 0) + 1; }
    }
  }
  let fail = false;
  const rows = [];
  for (const t of ['R1', 'R2', 'R2b', 'R3', 'R4', 'R5', 'R6', 'R7']) {
    const s = stat[t]; if (!s) { rows.push(t + ' n=0'); continue; }
    const pct = 100 * s.ok / s.n;
    if (pct < 99) fail = true;
    rows.push(`${t} n=${s.n} agree=${s.ok} ${pct.toFixed(2)}% discardViolations=${discV[t] || 0}` + ((bad[t] || []).length ? ' | ' + bad[t].slice(0, 5).join(' ; ') : ''));
  }
  // pooled R2/R2b and discard summary
  console.log(rows.join('\n'));
  if (process.env.SOLVER_JSON) fs.writeFileSync(process.env.SOLVER_JSON, JSON.stringify({ stat, bad, discV }, null, 1));
  console.log(fail ? 'FAIL: a type is under 99% agreement' : 'PASS: all types >= 99%');
  process.exit(fail ? 1 : 0);
}
