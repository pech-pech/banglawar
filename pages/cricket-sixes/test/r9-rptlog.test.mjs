// r9 RPT-LOG: d.seasons, avoidable Poor, win chance + decided over, marker + last text, event lists, match-day fields (tolerated absent).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLog, KEY, CAPS } from '../js/report/log.js';
import { OVER_COLS, winProb, decidedOver, avoidablePoor, mdOf } from '../js/report/metrics.js';
import { createStore } from '../js/store/store.js';
import { step } from './_season-bot.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
// Drive the store through the log the way hooks.js does (same calls, no DOM).
function driven(seed, o = {}) {
  const storage = mem(), log = createLog({ storage, now: (() => { let t = 1000; return () => (t += 10); })(), build: o.build || 'rX' });
  const store = createStore(null); store.dispatch('NewGame', { seed });
  const run = (cmd, p) => {
    const before = store.get(); store.dispatch(cmd, p); const after = store.get();
    if (cmd === 'NewMatch' || (cmd === 'StartMatch' && after.stage === 'bowl')) log.matchStart(after);
    else if (cmd === 'FinishMatch') log.finish(before, after);
    else if (cmd === 'BowlOver' && after !== before) log.over(before, after, { th: 900 });
    if (cmd === 'MakeCall') log.touch(before, after);
    if (cmd !== 'BowlOver') log.command(cmd, p, before, after);
  };
  const proxy = { get: store.get, dispatch: run };
  return { log, store, storage, stepOne: () => step(proxy), proxy, run };
}
const playTo = (h, pred, max = 4000) => { let g = 0; while (g++ < max && !pred(h.store.get()) && h.stepOne()); return h.store.get(); };

test('over rows: pw/sk are no longer columns; bm and wp are', () => {
  assert.ok(!OVER_COLS.includes('pw') && !OVER_COLS.includes('sk'));
  assert.ok(OVER_COLS.includes('bm') && OVER_COLS.includes('wp'));
  const h = driven('rl1'); playTo(h, (s) => s.stage === 'done');
  const m = h.log.data().matches[0], b = m.ov.filter((o) => o.s === 'b'), c = m.ov.filter((o) => o.s === 'c');
  assert.ok(b.length && c.length);
  for (const o of m.ov) { assert.ok(!('pw' in o) && !('sk' in o)); }
  assert.ok(b.every((o) => 'bm' in o && o.wp === null)); assert.ok(c.every((o) => Number.isInteger(o.wp) && o.wp >= 0 && o.wp <= 100));
  assert.ok(b.some((o) => typeof o.bm === 'number'));
  assert.equal(c[c.length - 1].wp, m.res === 'won' ? 100 : m.res === 'lost' ? 0 : 50);
});

test('avoidablePoor: Poor pick with a non-Poor bowler on offer, overs 1-7 only, old rows null', () => {
  assert.equal(avoidablePoor({ s: 'b', o: 3, mu: 'P', bm: 0 }), 1);
  assert.equal(avoidablePoor({ s: 'b', o: 3, mu: 'P', bm: -1 }), 0); // everyone was Poor: forced
  assert.equal(avoidablePoor({ s: 'b', o: 3, mu: 'G', bm: 2 }), 0);
  assert.equal(avoidablePoor({ s: 'b', o: 8, mu: 'P', bm: 2 }), null); // overs 8-10 are forced picks
  assert.equal(avoidablePoor({ s: 'b', o: 3, mu: 'P' }), null);
  assert.equal(avoidablePoor({ s: 'c', o: 3, mu: '?', bm: null }), null);
});

test('win chance: monotone in need and wickets; decided over = first over the winner stays above 90%', () => {
  assert.equal(winProb(0, 12, 3), 100); assert.equal(winProb(5, 0, 3), 0); assert.equal(winProb(5, 12, 0), 0);
  assert.ok(winProb(20, 30, 4) > winProb(40, 30, 4)); assert.ok(winProb(30, 30, 5) > winProb(30, 30, 1)); assert.ok(winProb(30, 60, 4) > winProb(30, 18, 4));
  const row = (o, wp) => ({ s: 'c', o, wp });
  const lost = [row(1, 50), row(2, 30), row(3, 8), row(4, 5), row(5, 0)];
  assert.equal(decidedOver(lost, 'lost'), 3); // 100-wp: 50,70,92,95,100: stays above 90 from over 3
  const close = [row(1, 50), row(2, 70), row(3, 95), row(4, 60), row(5, 100)];
  assert.equal(decidedOver(close, 'won'), 5); // dipped back at over 4
  const flat = [row(1, 50), row(2, 55), row(3, 60)]; assert.equal(decidedOver(flat, 'won'), 3); // never decided early: the last over
  assert.equal(decidedOver([], 'won'), null); assert.equal(decidedOver(lost, 'tied'), 5);
});

test('a finished match stores dec (L4, not over - 1), touched, tun, fl, eco', () => {
  const h = driven('rl2'); playTo(h, (s) => s.stage === 'done'); h.run('FinishMatch');
  const m = h.log.data().matches[0];
  assert.ok(Number.isInteger(m.dec) && m.dec >= 1 && m.dec <= 10);
  assert.equal(m.dec, decidedOver(m.ov, m.res));
  assert.equal(typeof m.tun, 'string'); assert.deepEqual(m.fl, []); assert.equal(m.touched, 0);
  assert.ok(m.eco && m.eco.gate > 0 && m.eco.net === m.eco.gate + m.eco.win + m.eco.shop - m.eco.wage - m.eco.up); // L3: coin split per match
  assert.equal(m.md, undefined); assert.equal(m.settled, undefined); // match-day fields absent when the features are off
});

test('match-day fields are read from the state when present (ENGINE names) and tolerated when absent', () => {
  const log = createLog({ storage: null, build: 'rX' });
  const s = { seed: 'x', stage: 'bowl', match: { md: { hype: 'high', hypeIdx: 2, toss: 'won', pepId: 'p3', hypeFanMult: 1.25, roar: Array.from({ length: 20 }, (_, i) => i === 1 || i === 12) } } };
  assert.equal(mdOf(s).hype, 'high'); assert.equal(mdOf({ stage: 'bowl' }), null);
  log.matchStart(s);
  assert.deepEqual(log.data().matches[0].md, { hype: 'high', hi: 2, toss: 'won', pep: 'p3', fm: 1.25, roar: [1, 12] });
  log.matchStart({ seed: 'y', stage: 'bowl' }); assert.equal(log.data().matches[1].md, undefined);
});

test('marker + last text: copied() moves the window; window() returns only records after it; rid counts up', () => {
  const h = driven('rl3'); playTo(h, (s) => s.stage === 'done'); h.run('FinishMatch');
  let w = h.log.window(); assert.equal(w.matches.length, 1); assert.equal(w.since, null); assert.equal(h.log.nextRid(), 1);
  const rid = h.log.copied('TEXT ONE', 'f'); assert.equal(rid, 1);
  assert.deepEqual(h.log.window().matches, []); assert.equal(h.log.window().since.rid, 1); assert.equal(h.log.nextRid(), 2);
  assert.equal(h.log.lastText().text, 'TEXT ONE'); assert.equal(h.log.lastText().size, 'f');
  playTo(h, (s) => s.stage === 'done' && s.season.round >= 2 || s.season.round >= 2); // a second match
  const d = JSON.parse(h.storage.getItem(KEY)); assert.equal(d.marker.rid, 1); assert.equal(d.lastText.text, 'TEXT ONE'); // persisted
  h.log.copied('TEXT TWO', 's'); assert.equal(h.log.lastText().rid, 2); assert.equal(h.log.lastText().size, 's');
});

test('W4: a new build clears the marker, keeps the last text and the id counter; records go after one build back', () => {
  const storage = mem(); const a = createLog({ storage, build: 'r1' }); a.matchStart({ seed: 'a', stage: 'bowl' }); a.copied('OLD', 'f');
  const b = createLog({ storage, build: 'r2' }); b.matchStart({ seed: 'b', stage: 'bowl' }); // saves
  assert.equal(b.data().marker, null); assert.equal(b.lastText().text, 'OLD'); assert.equal(b.nextRid(), 2);
  assert.equal(b.data().matches.length, 2); assert.equal(b.window().matches.length, 1); assert.equal(b.window().dropped.n, 1); // r1 record counted as dropped (H3)
  const c = createLog({ storage, build: 'r3' }); assert.deepEqual(c.data().matches.map((m) => m.build), ['r2']); // r1 is two builds back
});

test('old logs without the r9 fields load', () => {
  const storage = mem(); storage.setItem(KEY, JSON.stringify({ v: 1, seq: 1, sessions: [], matches: [{ id: 1, build: 'rX', ov: [], res: 'won' }], errors: { n: 0, last: [] }, buildMatches: {} }));
  const log = createLog({ storage, build: 'rX' }); const d = log.data();
  assert.deepEqual([d.seasons, d.nets, d.spins, d.buys, d.weeks, d.feelLog, d.marker, d.lastText], [[], [], [], [], [], [], null, null]);
  assert.equal(log.window().matches.length, 1);
});

test('feel log: 3 states, capped; answer also kept on the match', () => {
  const log = createLog({ storage: null, build: 'rX', caps: { feel: 3 } }); log.matchStart({ seed: 'f', stage: 'bowl' });
  log.feel('tr', 'Some', 'nets 2'); log.feel('wh', '-'); log.feel('ec', 'off');
  const f = log.data().feelLog; assert.deepEqual(f.map((x) => [x.f, x.v]), [['tr', 'Some'], ['wh', 'sk'], ['ec', 'off']]); assert.equal(f[0].fact, 'nets 2');
  assert.equal(log.data().matches[0].feel.tr, 'Some');
});

test('nets, spins, weeks, buys and a season record come from a real season; caps hold', () => {
  const h = driven('rl4'); const st = h.store;
  // train: choose a spotlight, spin, run nets, end week
  let g = 0; while (g++ < 400 && st.get().stage !== 'train') h.stepOne();
  assert.equal(st.get().stage, 'train');
  const six = st.get().clubs[0].six[0];
  h.run('SetTrainPlan', { focus: 'bat', effort: 'normal', spotlightId: six, coachId: st.get().coaches[0].id });
  h.run('Spin', { careful: true }); h.run('RunNets'); h.run('EndWeek');
  const d = h.log.data();
  assert.equal(d.nets.length, 1); const n = d.nets[0];
  assert.equal(n.eff, 'normal'); assert.equal(n.r.reduce((a, b) => a + b, 0), n.r.reduce((a, b) => a + b, 0)); assert.ok(n.r.length === 3 && n.tp1 <= n.tp0 && n.per > 0 && n.s === 1);
  assert.ok(n.q > 0 && n.b === 'rX');
  assert.ok(d.spins.length === 1, "spin logged"); if (d.spins.length) { const sp = d.spins[0]; assert.ok(['c', 'e', 'l', 'o'].includes(sp.bk)); assert.ok(sp.ms > 0); assert.ok(sp.g >= 1); }
  assert.equal(d.weeks.length, 1); assert.equal(d.weeks[0].nets, 1); assert.ok(d.weeks[0].tpEnd >= 0);
  assert.ok(d.seasons.length === 1 && d.seasons[0].n === 1 && d.seasons[0].m6[0] > 0 && d.seasons[0].w + d.seasons[0].l >= 1);
  assert.ok(d.seasons[0].cin.gate > 0 && d.seasons[0].cout.wage > 0);
});

test('buys: a facility build is logged with price, coins before, alternatives and the reserve flag', () => {
  const h = driven('rl5'); const st = h.store; let g = 0;
  while (g++ < 600 && st.get().stage !== 'hub' && st.get().stage !== 'train') h.stepOne();
  const s0 = st.get(), c0 = s0.econ.coins;
  for (const what of ['nets', 'shop', 'stands', 'pitch', 'gym', 'academy', 'scout']) { const b = st.get(); h.run('StartBuild', { what }); if (st.get() !== b) break; }
  const buys = h.log.data().buys;
  assert.ok(buys.length === 1, "buy logged"); if (buys.length) { const x = buys[0]; assert.ok(x.price > 0 && x.c0 === c0 && x.k === 'fac' && (x.alt == null || x.alt >= 0) && [0, 1].includes(x.warn)); }
});

test('lists and seasons obey caps; seasons stay outside the list caps and keep 12', () => {
  const log = createLog({ storage: null, build: 'rX', caps: { nets: 3, spins: 3, buys: 3, weeks: 3 } });
  const before = { training: { tp: 100, week: 1, netsWeek: 1 }, econ: { coins: 100, sinks: {} } }, after = { ...before, econ: { coins: 50, sinks: { x: 1 } } };
  for (let i = 0; i < 6; i++) { log.command('BuySink', { id: 'x' }, before, after); log.command('EndWeek', {}, before, { ...after, training: { tp: 90, week: 2 } }); }
  assert.equal(log.data().buys.length, 3); assert.equal(log.data().weeks.length, 3);
  for (let n = 1; n <= 14; n++) log.season({ stage: 'hub', season: { n, league: 1, table: [{ id: 'c0', w: 1, l: 0, pts: 2 }] }, econ: { stadium: 1, fans: 5, legacy: 0 }, training: { tp: 1 }, clubs: [] });
  assert.equal(log.data().seasons.length, 12); assert.equal(log.data().seasons[0].n, 3); assert.equal(CAPS.seasons, 12);
});

test('club events: activity, trial and free pick are logged (d.club, capped)', () => {
  const log = createLog({ storage: null, build: 'rX', caps: { club: 2 } });
  const b = { econ: { coins: 100, fans: 5 }, trial: { kind: 'player', player: { id: 'p9' }, wage: 12 } };
  log.command('PickActivity', { id: 'rest' }, b, { econ: { coins: 70, fans: 9, act: { hist: [{ find: null }], dry: 1 } } });
  log.command('SignTrial', {}, b, { econ: b.econ, trial: null }); log.command('TakeFreePick', { what: 'nets' }, b, { econ: { coins: 100, fans: 6 } });
  const c = log.data().club; assert.equal(c.length, 2); assert.deepEqual([c[0].k, c[0].who.id, c[0].who.wage, c[1].k, c[1].what], ['sign', 'p9', 12, 'fp', 'nets']);
});
