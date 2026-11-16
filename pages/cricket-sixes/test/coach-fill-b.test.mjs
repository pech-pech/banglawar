// T5 audit fill-in: T6.4 (strip layouts 3/2/1/0), T11.1 (constants vs SPEC s3), T11.7 (mc line in Copy report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../js/data/coach-weekly.js';
import { coachesVM } from '../js/store/selectors.js';
import { coachStripHtml } from '../js/ui/training-view.js';
import { createLog } from '../js/report/log.js';
import { buildFull } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { coachReportLines } from '../js/report/coach.js';
import { K, game } from './_tr2-fixture.mjs';

const count = (h, re) => (h.match(re) || []).length;

for (const n of [3, 2, 1, 0]) {
  test(`T6.4 job chip + XP bar slots render for ${n} coach(es)`, () => {
    const coaches = Array.from({ length: n }, (_, i) => K({ id: 'k' + i, name: 'Coach ' + i, step: 3 + i, xp: 10 }));
    const s = game({ coaches });
    const vm = coachesVM(s);
    assert.equal(vm.coaches.length, n);
    let html;
    assert.doesNotThrow(() => { html = coachStripHtml({ coaches: vm.coaches, strip: { slots: 3, scoutOpen: false } }, vm); });
    assert.equal(count(html, /data-cw="job"/g), n, 'one job chip per coach');
    assert.equal(count(html, /data-cw="xp"/g), n, 'one XP bar per coach');
    assert.equal(count(html, /class="ct-slot ct-empty"/g), n === 0 ? 0 : 3 - n, 'empty slots fill the rest');
    if (n === 0) { assert.equal(count(html, /class="ct-slot ct-empty ct-none"/g), 1, 'SPEC s10: one No coach slot'); assert.ok(html.includes('No coach')); }
    for (const c of vm.coaches) assert.ok(html.includes('data-coach="' + c.id + '"'));
    if (n === 0) assert.ok(!/cw-chip|cw-xp/.test(html), 'no chip or bar at 0 coaches');
  });
}

test('T11.1 coach constants match SPEC s3', () => {
  const lit = { XP_NETS: 10, XP_NETS_WEAK: 5, XP_MATCH: 6, XP_WIN_MULT: 2, XP_STUDY: 12, XP_SCOUT: 8, XP_MAX_STEP: 21, COURSE_MAX_STEP: 19 };
  for (const [k, v] of Object.entries(lit)) assert.equal(W[k], v, k);
  assert.deepEqual([...W.COACH_JOBS], ['nets', 'match', 'study', 'scout']);
  assert.equal(W.XP_PER_STEP.length, 20);
});

test('T11.1 report line text reads from the stored job counts and xp (not hard-coded)', () => {
  const mk = (n, m, st, sc) => ({ report: { jobs: { nets: 1, match: 1, wins: 1, study: 1, scout: 1, away: 0, xp: { nets: n, match: m, study: st, scout: sc } } } });
  const a = coachReportLines(mk(W.XP_NETS, W.XP_MATCH * W.XP_WIN_MULT, W.XP_STUDY, W.XP_SCOUT))[1];
  assert.ok(a.startsWith('XP gained: nets 10, match 12, study 12, scout 8.'));
  const b = coachReportLines(mk(W.XP_NETS_WEAK, W.XP_MATCH, 0, 0))[1];
  assert.ok(b.startsWith('XP gained: nets 5, match 6, study 0, scout 0.'));
});

test('T11.7 per-match mc survives in the Copy report for a played match', () => {
  const src = readFileSync(new URL('../js/report/report.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/report/log.js', import.meta.url), 'utf8');
  assert.ok(/j\.mc = m\.mc/.test(src) && /m\.mc === undefined/.test(src), 'emit sites present');
  const log = createLog({ storage: null, build: 'rX' });
  const md = { hype: 'low', hypeIdx: 0, toss: 'won', pepId: null, roar: [] };
  log.matchStart({ seed: 's1', stage: 'bowl', fixture: { kind: 'league', round: 1 }, season: { n: 1, league: 1 }, match: { md: { ...md, mc: { id: 'a', name: 'A', bat: 0.03, bowl: 0.015 } } } });
  log.matchStart({ seed: 's2', stage: 'bowl', fixture: { kind: 'league', round: 2 }, season: { n: 1, league: 1 }, match: { md } });
  const ms = log.data().matches;
  for (const m of ms) Object.assign(m, { res: 'won', us: 50, them: 40, wkUs: 1, wkThem: 5, m: { k: 'wk', n: 3 }, fin: 1 });
  const txt = buildFull(log.data(), { build: 'rX', now: Date.UTC(2026, 10, 15), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS, matchday: true }, rid: 1 });
  assert.match(txt, /"mc":\[3,1\.5\]/, 'per-match mc record');
  assert.match(txt, /"mc":0/, 'no-coach match emits mc 0');
  assert.match(txt, /Match coach used 1 of 2 matches/);
});
