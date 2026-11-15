// Wheel match view: pure helpers (ball delay rule, glow phase, label placement narrow/wide, auto pace, glide plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballDelay, ballTimes, glowPhase, labelPlan, autoPace, autoStopWhy, glidePlan, wrapHalf, endMark, overWords } from '../js/ui/wheelmatch-view.js';
import { WHEEL_MATCH, BALL_SPEED, AUTO_PACE } from '../js/data/wheelmatch.js';
import { landingPos, rimAt } from '../js/core/wheelmatch.js';
import { BALL_MS } from '../js/ui/over-panel.js';

test('ball delay: overs 1-3 full for every ball', () => {
  for (const over of [1, 2, 3]) for (const o of [0, 1, 2, 4, 6, 'W']) assert.equal(ballDelay(o, over), BALL_SPEED.full);
});
test('ball delay: from over 4 plain balls 0.2 s, 4/6/W 0.4 s', () => {
  for (const over of [4, 5, 6, 7, 8]) {
    for (const o of [0, 1, 2, 3]) assert.equal(ballDelay(o, over), 0.2, 'plain ' + o + ' over ' + over);
    for (const o of [4, 6, 'W']) assert.equal(ballDelay(o, over), 0.4, 'event ' + o + ' over ' + over);
  }
});
test('ball delay: the last two overs of an innings keep full timing', () => {
  for (const over of [9, 10]) for (const o of [0, 1, 2, 4, 6, 'W']) assert.equal(ballDelay(o, over), BALL_SPEED.full);
});
test('ball times are cumulative; classic BALL_MS untouched', () => {
  const t = ballTimes([{ o: 0 }, { o: 4 }, { o: 1 }], 5);
  assert.deepEqual(t.map((x) => +x.toFixed(2)), [0.2, 0.6, 0.8]);
  assert.equal(BALL_MS, 400);
});

test('glow: off before 3.2 s and after 3.8 s, on inside', () => {
  assert.equal(glowPhase(0).on, false); assert.equal(glowPhase(3.19).on, false); assert.equal(glowPhase(3.81).on, false); assert.equal(glowPhase(6).on, false);
  assert.equal(glowPhase(3.2).on, true); assert.equal(glowPhase(3.5).on, true); assert.equal(glowPhase(3.8).on, true);
});
test('glow: three half-beats of 0.2 s (up, down, up), one shot', () => {
  assert.equal(glowPhase(3.25).beat, 0); assert.equal(glowPhase(3.45).beat, 1); assert.equal(glowPhase(3.65).beat, 2); assert.equal(glowPhase(3.8).beat, 2);
  assert.ok(glowPhase(3.39).level > 0.9, 'beat 0 rises'); assert.ok(glowPhase(3.59).level < 0.1, 'beat 1 falls');
  assert.ok(glowPhase(3.79).level > 0.9, 'beat 2 rises');
  assert.ok(Math.abs(WHEEL_MATCH.GLOW_BEATS * WHEEL_MATCH.GLOW_BEAT - (WHEEL_MATCH.GLOW_HI - WHEEL_MATCH.GLOW_LO)) < 1e-9);
});
test('glow never reads the segments (time is its only input)', () => {
  assert.equal(glowPhase.length, 1);
  const src = readFileSync(new URL('../js/ui/wheelmatch-view.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function glowPhase'), src.indexOf('export function labelPlan'));
  assert.ok(!/segs|tone|seg\b/.test(body));
});

test('labels: wide slice = number outer, stars in a row inside', () => {
  const R = 146, p = labelPlan(0.14 * Math.PI * 2, 1, R);
  assert.equal(p.row, true); assert.ok(p.numR > p.starR); assert.ok(Math.abs(p.numR - R * 0.74) < 1e-9);
});
test('labels: narrow slice with stars (QA 4% "5 **", 5% "3 **") = number inner, stars by the rim', () => {
  for (const pct of [0.04, 0.05]) {
    const p = labelPlan(pct * Math.PI * 2, 2, 146);
    assert.equal(p.row, false, 'narrow at ' + pct); assert.ok(p.starR > p.numR);
    const chord = 2 * p.starR * Math.sin(pct * Math.PI); assert.ok(2 * p.gap <= chord, 'stars fit inside the slice');
  }
});
test('labels: no stars always uses the wide layout; ALL OUT stars shrink to fit', () => {
  assert.equal(labelPlan(0.03 * Math.PI * 2, 0, 146).row, true);
  const p = labelPlan(0.05 * Math.PI * 2, 5, 146), chord = 2 * p.starR * Math.sin(0.05 * Math.PI);
  assert.ok(p.gap * 5 <= chord + 1e-9); assert.ok(p.starHalf <= p.gap * 0.42 + 1e-9);
});
test('labels scale with the wheel radius', () => {
  const a = labelPlan(1, 1, 146), b = labelPlan(1, 1, 73);
  assert.ok(Math.abs(b.font * 2 - a.font) < 1e-9);
});

test('auto pace: 0.6 s an over, 0.9 s with a wicket, an innings end or the last over', () => {
  assert.equal(autoPace([{ o: 1 }, { o: 4 }]), AUTO_PACE.over);
  assert.equal(autoPace([{ o: 1 }, { o: 'W' }]), AUTO_PACE.event);
  assert.equal(autoPace([{ o: 1 }], { end: true }), AUTO_PACE.event);
  assert.equal(autoPace([{ o: 1 }], { lastOver: true }), AUTO_PACE.event);
  assert.equal(AUTO_PACE.over, 0.6); assert.equal(AUTO_PACE.event, 0.9);
});
test('auto stop rule: pause before the last over of a live chase only; Auto over spins one', () => {
  assert.equal(autoStopWhy({ side: 'bat', autoPauseNow: true }, 'rest', 3), 'pause');
  assert.equal(autoStopWhy({ side: 'bowl', autoPauseNow: false }, 'rest', 3), '');
  assert.equal(autoStopWhy({ side: 'bat', autoPauseNow: false }, 'rest', 0), '');
  assert.equal(autoStopWhy({ side: 'bowl' }, 'over', 0), ''); assert.equal(autoStopWhy({ side: 'bowl' }, 'over', 1), 'done');
  assert.equal(autoStopWhy(null, 'rest', 0), 'end');
});

test('glide plan ends exactly on the stored landing and starts at the rim under the pointer', () => {
  const phys = { W0: 36, TAU: 3, D: 2, J: 1.2, COAST: 6, STOP_FROM: 1 }, C = WHEEL_MATCH.CIRC;
  for (const t of [1, 2.5, 3.5, 5.9, 6]) for (const e of [-1.2, 0, 0.7]) {
    const stop = { t, phi: 3.3 }, fin = landingPos(phys, { ...stop, e }), p = glidePlan(phys, stop, fin);
    assert.ok(Math.abs(wrapHalf(p.base - rimAt(phys, t, 3.3))) < 1e-9);
    assert.ok(Math.abs(wrapHalf(p.base + p.dist + p.e - fin, C)) < 1e-9, 'lands on the stored pos');
    assert.ok(Math.abs(p.e - e) < 1e-6, 'wobble recovered ' + t + ' ' + e);
    assert.ok(Math.abs(wrapHalf(p.base + p.dist - landingPos(phys, { ...stop, e: 0 }), C)) < 1e-9, 'no-wobble end = the tick');
  }
});
test('end marks and over words', () => {
  assert.equal(endMark('WIN'), 'WIN'); assert.equal(endMark('AO'), 'ALL OUT'); assert.equal(endMark('TIE'), 'TIE'); assert.equal(endMark('', 'tied'), 'TIE'); assert.equal(endMark(''), '');
  assert.equal(overWords(8, 1), '8 runs, 1 wicket'); assert.equal(overWords(1, 0), '1 run, no wickets');
});
test('index.html links the wheel match styles; the view is lazy-loaded for wheel matches only', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('css/wheelmatch.css'));
  const app = readFileSync(new URL('../js/ui/app.js', import.meta.url), 'utf8');
  assert.ok(/s\.mode === 'wheel'/.test(app) && app.includes("'wheelmatch-view'"));
  assert.ok(!/import .*wheelmatch-view/.test(app), 'classic boot never needs the wheel view');
});
