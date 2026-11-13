import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame, step } from './_season-bot.mjs';
import { GLOSSARY } from '../js/data/glossary.js';
import { createLog } from '../js/report/log.js';
import { buildSummary, buildData } from '../js/report/report.js';
import { saveOf, zLines, sessionStats } from '../js/report/z.js';

const ENV = { build: 'x', now: 0, vp: 'v', errors: 0 };
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 400) step(st); return st.get(); };

test('boot: no coach screen; the game starts at the hub with the starting coach (P11)', () => {
  const s = newGame('p7a').get();
  assert.equal(s.stage, 'hub'); assert.equal(s.coaches.length, 1); assert.equal(s.coaches[0].step, 4);
  assert.deepEqual(s.coaches[0].strong, ['bat', 'bowl']);
});

test('first-match strip: only match 1, over 1, until Skip; Skip is kept once', () => {
  const st = newGame('p7d'); let g = 0;
  while (st.get().stage !== 'bowl' && g++ < 20) step(st);
  let s = st.get(); assert.equal(sel.bowlVM(s).firstStrip, true);
  const k = C(s, 'SeeFirstStrip'); assert.equal(k.seen.firstStrip, 1); assert.equal(sel.bowlVM(k).firstStrip, false); assert.equal(C(k, 'SeeFirstStrip'), k);
  const o = C(s, 'BowlOver', {}); assert.equal(sel.bowlVM(o).firstStrip, false);
});

test('ability stays a number in the view model (engine); the Call and Chase views print letters', () => {
  const st = newGame('p7e'); let g = 0;
  while (st.get().stage !== 'bowl' && g++ < 20) step(st);
  const b = sel.bowlVM(st.get()); assert.ok(b.bowlers.every((x) => Number.isInteger(x.ability) && x.ability >= 20));
  while (st.get().stage !== 'chase' && g++ < 200) step(st);
  const c = sel.chaseVM(st.get()); assert.ok(c.crease.every((x) => Number.isInteger(x.ability) && x.ability >= 20));
});

test('copy: Potential grade in the glossary, Rotate is Steady (label only, key R stays)', () => {
  const g = (id) => GLOSSARY.find((x) => x.id === id);
  assert.equal(g('grade').term, 'Potential grade'); assert.equal(g('grade').short, 'How high he can grow: D, C, B, A, S.');
  assert.equal(g('grade-hidden').term, 'Potential grade ?'); assert.match(g('grade-hidden').short, /^Not known yet\./);
  assert.equal(g('intent-rotate').term, 'Steady');
  assert.ok(!GLOSSARY.some((x) => /Rotate/.test(x.term + x.short + x.long)));
});

test('report Z1-Z2: time to first Start match and the screen each session ended on', () => {
  let t = 1000; const log = createLog({ storage: null, build: 'x', now: () => t });
  log.stage('hub'); t += 42000; log.matchStart({ seed: 's', stage: 'plan' }); log.stage('bowl');
  const se = log.data().sessions[0]; assert.equal(se.end, 'bowl');
  assert.deepEqual(sessionStats({ sessions: [{ first: 42000, end: 'bowl' }, { first: 20000, end: 'hub' }, { end: 'hub' }] }), { n: 3, started: 2, neverStarted: 1, firstMed: 31, firstMax: 42, ends: { bowl: 1, hub: 2 } });
  assert.doesNotMatch(buildSummary(log.data(), ENV), /First session/); // P0-13: the line is gone, sessionStats keeps reading old logs
});

test('report Z3-Z6 from a save, and me/rival are called lastMatch', () => {
  const st = newGame('p7f'); let g = 0; while (st.get().stage !== 'train' && g++ < 400) step(st);
  const s = st.get(), z = saveOf(s);
  assert.equal(z.tp, s.training.tp); assert.equal(z.squad, 8); assert.ok(z.hidden >= 0 && z.hidden <= 8); assert.equal(z.netsThisWeek, 0);
  assert.ok(z.lastMatch && z.lastMatch.us === 'Fernhill');
  const t = zLines({ sessions: [{ first: 5000, end: 'train' }] }, z).join('\n');
  for (const w of ['? share:', 'Nets runs this week: 0 · Effort: Normal · Focus changes: 0', 'Unspent training points:', 'lastMatch (the save\'s me and rival)', 'Each session ended on: training']) assert.ok(t.includes(w), w);
  const log = createLog({ storage: null, build: 'x' });
  const sum = buildSummary(log.data(), { ...ENV, save: z }); assert.ok(sum.includes('Unspent training points'));
  const j = JSON.parse(buildData(log.data(), { ...ENV, save: z })); assert.equal(j.z.save.lastMatch.us, 'Fernhill'); assert.ok(!('me' in j.z.save) && !('rival' in j.z.save));
  assert.match(zLines({ sessions: [] }, null).join(' '), /no save/);
});

test('report Z4 and Z6 read the nets counters and the week summary', () => {
  const z = saveOf({ stage: 'hub', training: { tp: 60, week: 3, week_: 0, netsWeek: 3, netsRuns: 2, focusChanges: 1, effort: 'push', weekSummary: { week: 2, steps: 7, letters: 2, gains: [{ total: 1 }, { total: 2 }], reveals: [] } }, clubs: [{ id: 'c0', squad: [{ drillsHere: 6 }] }] });
  assert.equal(z.tp, 60); assert.equal(z.perPlayer, 18); assert.equal(z.runCost, 18); assert.equal(z.hiddenShare, 0); assert.equal(z.last.steps, 7);
  const t = zLines({ sessions: [] }, z).join('\n');
  assert.ok(t.includes('Nets runs this week: 1 · Effort: Push · Focus changes: 1'), t);
  assert.ok(t.includes('Last week: +7 steps across the squad, 2 letters gained'), t);
});
