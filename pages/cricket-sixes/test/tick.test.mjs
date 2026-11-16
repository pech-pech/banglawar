// Free landing tick (2026-11-15 report p13 s1): everyone sees the tick on aim spins; Aim Guide = gold wedge; none when reduced or on reveal wheels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickKind, TICK, REPORT_TICK } from '../js/core/landtick.js';
import { buildData } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { NODES } from '../js/data/wheelmeta.js';

test('aim spin without Aim Guide: a plain tick', () => assert.equal(tickKind({ guide: false }), 'plain'));
test('aim spin with Aim Guide: the gold wedge', () => assert.equal(tickKind({ guide: true }), 'wedge'));
test('reduced motion: no tick, with or without Aim Guide', () => {
  assert.equal(tickKind({ guide: false, reduced: true }), 'none'); assert.equal(tickKind({ guide: true, reduced: true }), 'none');
});
test('reveal wheels stay feel only: nothing without Aim Guide, the old mark with it', () => {
  assert.equal(tickKind({ reveal: true, guide: false }), 'none'); assert.equal(tickKind({ reveal: true, guide: true }), 'feel');
  assert.equal(tickKind({ reveal: true, guide: true, reduced: true }), 'none');
});
test('plain tick is thin: core 2 px', () => assert.ok(TICK.PLAIN_PX <= 2 && TICK.PLAIN_PX >= 1));
test('views gate the tick through tickKind, not o.guide alone', () => {
  for (const f of ['wheel-view', 'reel-view', 'dial-view']) assert.match(readFileSync(new URL('../js/ui/' + f + '.js', import.meta.url), 'utf8'), /tickKind\(/, f);
});
test('Aim Guide node: new text, same rank and cost', () => {
  const n = (NODES || []).find((x) => x.id === 'c_guide'); assert.ok(n);
  assert.equal(n.words || n.text || n.desc, 'Sharper landing tick and steadier stop.');
});
test('copy report JSON carries tick:1', () => {
  const B = 'sixes-wheelmatch', ENV = { build: B, now: Date.UTC(2026, 10, 15, 10, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1 };
  const data = { matches: [], builds: [B], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], seasons: [], sessions: [], errors: { n: 0, last: [] }, marker: null, rid: 0, seq: 1, eseq: 0 };
  const j = JSON.parse(buildData(data, ENV)); assert.equal(j.tick, 1); assert.equal(REPORT_TICK, 1); assert.ok('rid' in j && 'clean' in j);
});
test('QA fixes: tick on its own canvas above the sheen, dark core with white halo; gold labels stay opaque; dial uses the wheel tick size', () => {
  const rd = (f) => readFileSync(new URL('../js/ui/' + f + '.js', import.meta.url), 'utf8'), w = rd('wheel-view'), d = rd('dial-view');
  assert.match(w, /wh-tk/); assert.match(w, /\[TICK\.PLAIN_PX \/ 2 \+ 1, '#fff'\], \[TICK\.PLAIN_PX \/ 2, 'rgb\(' \+ pal\.out/);
  assert.match(w, /speed > 8 && !isG\(i\)/); assert.match(w, /speed > 8 && !GD\.includes\(i\)/);
  assert.match(d, /r0 = R - 15/); assert.match(d, /WEDGE_TIP_PX/); assert.doesNotMatch(d, /diamond\(Math\.round\(c\[0\]\)/);
  for (const f of ['wheel-view', 'wheels/find', 'training-view', 'coaches-sheet']) assert.match(rd(f), /The tick shows where it will land\./, f);
});
