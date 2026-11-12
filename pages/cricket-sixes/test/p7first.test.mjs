import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C, defaultCoachId } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame, step } from './_season-bot.mjs';
import { GLOSSARY } from '../js/data/glossary.js';
import { createLog } from '../js/report/log.js';
import { buildSummary, buildData } from '../js/report/report.js';
import { saveOf, zLines, sessionStats } from '../js/report/z.js';

const ENV = { build: 'x', now: 0, vp: 'v', errors: 0 };
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 400) step(st); return st.get(); };

test('boot: no coach screen; the game starts at the hub with the candidates still waiting', () => {
  const s = newGame('p7a').get();
  assert.equal(s.stage, 'hub'); assert.equal(s.coachPicked, false); assert.equal(s.coaches.filter((c) => c.candidate).length, 3);
  assert.equal(sel.coachNoticeOf(s), null);
});

test('after match 1 the default coach is picked: helps the most of the six, ties to the first candidate', () => {
  const s = untilTrain('p7b');
  assert.equal(s.stage, 'train'); assert.equal(s.coachPicked, true); assert.equal(s.coaches.length, 1); assert.equal(s.coachPool.length, 3);
  const before = newGame('p7b').get();
  assert.equal(s.coaches[0].id, defaultCoachId(before));
  // tie rule: with all three equal the first candidate wins
  const flat = JSON.parse(JSON.stringify(before)); flat.coaches.forEach((c) => { c.lv = { Power: 3, Technique: 0, Pace: 0, Craft: 0 }; });
  assert.equal(defaultCoachId(flat), flat.coaches[0].id);
  const pool = s.coachPool; assert.ok(pool.every((c) => c.candidate));
  assert.ok(pool.map((c) => c.id).includes(s.coaches[0].id));
  const n = sel.coachNoticeOf(s);
  assert.match(n.line, /^\w+ is your coach\. He is best at .+ practice\.$/); assert.equal(n.canChange, true);
  assert.equal(sel.trainingVM(s).coachNotice.line, n.line);
});

test('Change coach: opens the coach screen with all three, a pick returns to training, once a drill is done it is closed', () => {
  const s = untilTrain('p7c');
  const c = C(s, 'ChangeCoach');
  assert.equal(c.stage, 'coach'); assert.equal(c.coachPicked, false); assert.equal(c.coaches.filter((x) => x.candidate).length, 3);
  assert.equal(sel.coachPickVM(c).picked, s.coaches[0].id); assert.ok(sel.coachPickVM(c).cands.every((x) => /practice$/.test(x.phrase)));
  const other = c.coaches.find((x) => x.id !== s.coaches[0].id);
  const p = C(c, 'PickCoach', { coachId: other.id });
  assert.equal(p.stage, 'train'); assert.equal(p.coachPicked, true); assert.equal(p.coaches[0].id, other.id); assert.equal(p.coachBack, undefined);
  assert.equal(sel.coachNoticeOf(p).name, other.name);
  const d = C(p, 'Drill', { playerId: p.clubs[0].squad[0].id, drillId: 'bp' });
  assert.equal(sel.coachNoticeOf(d), null); assert.equal(C(d, 'ChangeCoach'), d);
  assert.equal(C(newGame('p7c').get(), 'ChangeCoach').stage, 'hub'); // not outside training
});

test('first-match strip: only match 1, over 1, until Skip; Skip is kept once', () => {
  const st = newGame('p7d'); let g = 0;
  while (st.get().stage !== 'bowl' && g++ < 20) step(st);
  let s = st.get(); assert.equal(sel.bowlVM(s).firstStrip, true);
  const k = C(s, 'SeeFirstStrip'); assert.equal(k.seen.firstStrip, 1); assert.equal(sel.bowlVM(k).firstStrip, false); assert.equal(C(k, 'SeeFirstStrip'), k);
  const o = C(s, 'BowlOver', {}); assert.equal(sel.bowlVM(o).firstStrip, false);
});

test('ability numbers on the Call and Chase rows', () => {
  const st = newGame('p7e'); let g = 0;
  while (st.get().stage !== 'bowl' && g++ < 20) step(st);
  const b = sel.bowlVM(st.get()); assert.ok(b.bowlers.every((x) => Number.isInteger(x.bowlAb) && x.bowlAb >= 20));
  while (st.get().stage !== 'chase' && g++ < 200) step(st);
  const c = sel.chaseVM(st.get()); assert.ok(c.crease.every((x) => Number.isInteger(x.batAb) && x.batAb >= 20));
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
  const se = log.data().sessions[0]; assert.equal(se.first, 42000); assert.equal(se.end, 'bowl');
  assert.deepEqual(sessionStats({ sessions: [{ first: 42000, end: 'bowl' }, { first: 20000, end: 'hub' }, { end: 'hub' }] }), { n: 3, started: 2, neverStarted: 1, firstMed: 31, firstMax: 42, ends: { bowl: 1, hub: 2 } });
  assert.match(buildSummary(log.data(), ENV), /median 42 s/);
});

test('report Z3-Z6 from a save, and me/rival are called lastMatch', () => {
  const st = newGame('p7f'); let g = 0; while (st.get().stage !== 'train' && g++ < 400) step(st);
  const s = st.get(), z = saveOf(s);
  assert.equal(z.tp, s.training.tp); assert.equal(z.squad, 10); assert.ok(z.hidden >= 0 && z.hidden <= 10); assert.equal(z.perWeek, null);
  assert.ok(z.lastMatch && z.lastMatch.us === 'Fernhill');
  const t = zLines({ sessions: [{ first: 5000, end: 'train' }] }, z).join('\n');
  for (const w of ['? share:', 'Drills per week: no week finished yet', 'Unspent training points:', 'lastMatch (the save\'s me and rival)', 'Each session ended on: training']) assert.ok(t.includes(w), w);
  const log = createLog({ storage: null, build: 'x' });
  const sum = buildSummary(log.data(), { ...ENV, save: z }); assert.ok(sum.includes('Unspent training points'));
  const j = JSON.parse(buildData(log.data(), { ...ENV, save: z })); assert.equal(j.z.save.lastMatch.us, 'Fernhill'); assert.ok(!('me' in j.z.save) && !('rival' in j.z.save));
  assert.match(zLines({ sessions: [] }, null).join(' '), /no save/);
});

test('report Z on the 2026-11-12 playtest numbers: 15 drills in 2 weeks, 60 TP unspent', () => {
  const z = saveOf({ stage: 'hub', training: { tp: 60, week: 3, drillCount: 15, drilled: {}, weekSummary: { week: 2, gains: [{ total: 1 }, { total: 2 }], reveals: [] } }, clubs: [{ id: 'c0', squad: [{ drillsHere: 6 }] }] });
  assert.equal(z.perWeek, 7.5); assert.equal(z.tp, 60); assert.equal(z.canDrill, 4); assert.equal(z.hiddenShare, 0); assert.equal(z.last.gain, 3);
});
