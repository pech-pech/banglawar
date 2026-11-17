// Wheel match copy report (SPEC s14): header mode:W|C and off:, the W line from s.wheelLog, n/a W fields, CLEAN kind "wheel",
// classic bands not applied to wheel matches, classic report unchanged apart from its mode piece.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { suggestedBowler } from '../js/store/wheelmatch-store.js';
import { createLog } from '../js/report/log.js';
import { buildText, buildData, buildSummary, cleanOf } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { wheelStats, wheelLine, modeOf, modeHeader, kindOf } from '../js/report/wmatch.js';

const B = 'sixes-wm';
const ENV = { build: B, now: Date.UTC(2026, 10, 15, 12, 0), vp: 'screen 475x638', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 2 };
const r1 = (x) => Math.round(x * 10) / 10;

/** Play one wheel match through the log like hooks.js does: aimed STOPs on odd overs (t spread over the buckets), auto on even ones. */
function playWheel(seed) {
  const log = createLog({ storage: null, now: () => 1000, build: B });
  let s = C(null, 'NewMatch', { seed, mode: 'wheel' }); log.matchStart(s);
  const T = [2.0, 3.5, 4.4, 6.0, 3.3];
  let g = 0;
  while (s.stage !== 'done' && g++ < 60) {
    if (s.stage === 'break') { s = C(s, 'StartChase'); continue; }
    const inn = s.stage === 'bowl' ? s.inn1 : s.inn2, auto = inn.over % 2 === 0;
    const p = auto ? { auto: true } : { stop: { t: T[inn.over % T.length], phi: (inn.over * 0.37) % 10 }, ...(s.stage === 'bowl' ? { bowler: suggestedBowler(s) } : {}) };
    const n = C(s, 'WheelOver', p); assert.notEqual(n, s, 'WheelOver moved'); log.over(s, n, { th: 1200, wheel: true }); s = n;
  }
  assert.equal(s.stage, 'done');
  return { log, s };
}
/** A classic match through the log (BowlOver path). */
function playClassic(seed) {
  const log = createLog({ storage: null, now: () => 1000, build: B });
  let s = C(null, 'NewMatch', { seed }); log.matchStart(s); let g = 0;
  while (s.stage !== 'done' && g++ < 60) {
    if (s.stage === 'break') { s = C(s, 'StartChase'); continue; }
    const n = C(s, 'BowlOver', s.stage === 'chase' ? { intent: 'R' } : {}); log.over(s, n, { th: 1000 }); s = n;
  }
  return { log, s };
}

test('W line math matches s.wheelLog (careful = log.careful, auto out of the stop stats, landed vs expected for us)', () => {
  const { log, s } = playWheel('wmr-1');
  const m = log.data().matches[0], L = s.wheelLog;
  assert.equal(m.mo, 'W'); assert.ok(m.res);
  assert.equal(m.ov.length, L.length);
  const aimed = L.filter((e) => !e.auto), bk = (k) => aimed.filter((e) => e.bucket === k).length;
  const dOf = (es) => { let dr = 0, dw = 0; for (const e of es) { const xr = r1(e.xr), xw = Math.round(e.xw * 100) / 100; if (e.inn === 2) { dr += e.runs - xr; dw += xw - e.wk; } else { dr += xr - e.runs; dw += e.wk - xw; } } return [r1(dr), r1(dw)]; };
  const [dr, dw] = dOf(aimed), [adr, adw] = dOf(L.filter((e) => e.auto)); // REVIEW F10: aimed overs only; auto apart
  const w = wheelStats([m]);
  assert.deepEqual(w, { n: L.length, b: L.filter((e) => e.inn === 1).length, a: L.filter((e) => e.inn === 2).length, auto: L.filter((e) => e.auto).length,
    c: aimed.filter((e) => e.careful).length, e: bk('e'), l: bk('l'), o: bk('o'), dr, dw, guide: L.some((e) => e.guide), adr, adw });
  assert.ok(w.auto > 0 && w.auto < w.n);
  const line = wheelLine(w);
  assert.match(line, /^Wheel: \d+ spun \(\d+ bowl, \d+ bat\), auto \d+\. Stops careful \d+( \(\d+% of \d+ aimed overs\))? \/ early \d+ \/ late \d+ \/ coast \d+\. Landed vs expected [+-]\d+\.\d runs, wickets [+-]\d+\.\d( \(\+ = good for us\))?\. Aim Guide (on|off)\. Auto overs landed vs expected [+-]\d+\.\d runs, wickets [+-]\d+\.\d\.$/);
  // over rows: runs match the log; no field / intent calls
  for (let i = 0; i < L.length; i++) { assert.equal(m.ov[i].r, L[i].runs); assert.equal(m.ov[i].f, null); assert.equal(m.ov[i].i, null); assert.equal(m.ov[i].wa, L[i].auto ? 1 : 0); }
});

test('wheel report: header mode:W off:-9, W line, n/a W fields, CLEAN kind wheel, no classic bands', () => {
  const { log } = playWheel('wmr-2');
  const t = buildText(log.data(), ENV), lines = t.split('\n');
  assert.match(lines[0], / \| mode:W off:-9 \| #2 \| /);
  assert.match(lines[0], /CLEAN: YES/);
  assert.ok(lines.some((l) => /^ Wheel: \d+ spun/.test(l)), 'W line');
  assert.match(t, / M1 \S+ [WLT] .*\| field n\/a W \| intent n\/a W \| att early n\/a W \|.*\| fit n\/a W \|/);
  assert.match(t, /Calls: n\/a W\. Same field n\/a W\. Call hints n\/a W\. Why opens n\/a W\./);
  const mSec = t.slice(t.indexOf('MATCH CALLS'), t.indexOf('ECONOMY'));
  assert.doesNotMatch(mSec, /\[sim/, 'no classic band notes on a wheel-only window');
  assert.doesNotMatch(mSec, /Per match win/);
  const j = JSON.parse(buildData(log.data(), ENV));
  assert.equal(j.kind, 'wheel'); assert.equal(j.clean, 1); assert.equal(j.M[0].mo, 'W'); assert.equal(j.wl.length, 13); assert.deepEqual(j.M[0].wl, j.wl);
  assert.match(buildSummary(log.data(), ENV), /MATCH \d+W \d+L, wheel \d+ spun, careful \d+/);
});

test('classic match through the log: mode:C off:+1.9, no W line, no n/a W; same text as a record without a mode apart from that piece', () => {
  const { log } = playClassic('wmr-3');
  const d = log.data(), m = d.matches[0];
  assert.equal(m.mo, 'C');
  const t = buildText(d, ENV);
  assert.match(t.split('\n')[0], / \| mode:C off:\+1\.9 \| #2 \| /);
  assert.doesNotMatch(t, /n\/a W|Wheel: \d+ spun/);
  const bare = { ...d, matches: d.matches.map((x) => { const y = { ...x }; delete y.mo; return y; }) };
  assert.equal(buildText(bare, ENV), t.replace(' | mode:C off:+1.9', ''));
  const j0 = JSON.parse(buildData(bare, ENV)), j1 = JSON.parse(buildData(d, ENV));
  assert.equal(j0.kind, undefined); assert.equal(j1.kind, 'classic'); delete j1.kind; assert.deepEqual(j1, j0);
});

test('CLEAN: W and C in one window = mode switched; wheelMatch flag is a kind, not a flag change; mixed window keeps classic lines on classic matches', () => {
  const w = playWheel('wmr-4').log.data().matches[0], c = playClassic('wmr-5').log.data().matches[0];
  w.id = 1; c.id = 2; w.seed = 'a'; c.seed = 'b';
  assert.deepEqual(cleanOf([w, c], ENV).why, ['mode switched']);
  assert.deepEqual(cleanOf([w], { ...ENV, flags: { ...FLAG_DEFAULTS, wheelMatch: true } }).why, []);
  const t = buildText({ sessions: [], matches: [w, c] }, ENV);
  assert.match(t.split('\n')[0], /mode:W\+C off:-9\/\+1\.9/);
  assert.match(t, /Wheel: \d+ spun .* Classic lines below read the classic matches only\./);
  assert.match(t, /Calls: Attack in overs 1-7/);
  assert.equal(JSON.parse(buildData({ sessions: [], matches: [w, c] }, ENV)).kind, 'mixed');
});

test('mode helpers: env mode when the window has no match; old records without a mode print nothing', () => {
  assert.equal(modeOf([], 'wheel'), 'W'); assert.equal(modeOf([], 'classic'), 'C'); assert.equal(modeOf([{}], undefined), null);
  assert.equal(modeHeader('W'), 'mode:W off:-9'); assert.equal(modeHeader('C'), 'mode:C off:+1.9'); assert.equal(modeHeader(null), null);
  assert.equal(kindOf('W'), 'wheel'); assert.equal(kindOf('C'), 'classic');
  assert.match(buildText({ sessions: [], matches: [] }, { ...ENV, matchMode: 'wheel' }).split('\n')[0], /mode:W off:-9/);
});
