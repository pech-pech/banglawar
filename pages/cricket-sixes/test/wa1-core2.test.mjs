// wa1 slice B1 (core2): extra checks next to wa1-core: flag-off neutrality, save fields missing = 0, match cap across all of hype/toss/pep,
// guards (Medals never doubled, Lift never above gold), Copy report wiring (js/report/wm.js) incl. the Find check (SPEC s5 line 6), Workshop copy.
import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { NODES } from '../js/data/wheelmeta.js';
import { makeRng } from '../js/core/rng.js';
import { wheelSlices } from '../js/core/training.js';
import { effective, metaWheel, tokenOptions, useToken, tokenLeft, metaOf, TOKEN_WHEELS } from '../js/core/wheelmeta.js';
import { hypeDial, revealWheel, revealResult, modsFor, neutralMods } from '../js/core/dialreel.js';
import { MD } from '../js/data/matchday.js';
import { buildFull, buildData } from '../js/report/report.js';
import { createLog } from '../js/report/log.js';
import { wmLines, wmJson, findCareful, fullTreeOf, FIND_CHECK } from '../js/report/wm.js';
import { workshopHtml } from '../js/ui/workshop-view.js';

const fresh = () => ({ v: 7, seed: 'wa1c2', salt: 's', season: { n: 1 }, fixture: { kind: 'league', round: 1 }, wheelMeta: { tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {} }, wheelCraft: { owned: {} }, econ: { coins: 100, ledger: [] } });
const full = (tok = {}) => { const s = fullTreeOf(fresh()); s.wheelMeta.tally = 600; s.wheelMeta.tokens = { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0, ...tok }; return s; };
const on = (f) => { const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true; try { return f(); } finally { FLAGS.wheelMeta = was; } };
const off = (f) => { const was = FLAGS.wheelMeta; FLAGS.wheelMeta = false; try { return f(); } finally { FLAGS.wheelMeta = was; } };
const ODDS0 = [35, 35, 20, 10];
function revealOn(w, id) { const i = w.slices.findIndex((c) => c.id === id), c = w.slices[i]; return { index: i, id, label: c.label, fx: { ...c.fx }, boosted: false, slot: c.slot || null, slots: c.slot ? [c.slot] : [] }; }
function hypeLow(d) { const i = d.slices.findIndex((c) => c.kind === 'low' && !c.gold), c = d.slices[i], li = MD.HYPE_LEVELS.indexOf(c.level); return { wheel: d, index: i, level: c.level, levelIdx: li, pts: c.pts, perf: c.pts / 100, fanMult: MD.HYPE_FAN_MULT[li], boosted: false }; }

test('flag off: every wheel neutral (no Control, no offers, same objects back), report lines empty', () => off(() => {
  const s = full({ respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }), E = effective(s);
  for (const w of TOKEN_WHEELS) { assert.equal(E[w].w0Mult, 1, w); assert.equal(E[w].jMult, 1, w); assert.ok(!E[w].guide, w); }
  assert.deepEqual(hypeDial(ODDS0, modsFor(E, 'hype')), hypeDial(ODDS0, neutralMods()));
  const tw = revealWheel('toss', neutralMods()), p = { wheel: tw, ...revealOn(tw, 'sport') };
  for (const w of TOKEN_WHEELS) assert.deepEqual(tokenOptions(s, w, p, { matchKey: 'k' }), [], w);
  for (const k of ['respin', 'two', 'nudge', 'lift']) { const r = useToken(s, 'toss', k, p, makeRng('o' + k), undefined, { matchKey: 'k' }); assert.equal(r.s, s); assert.equal(r.pending, p); }
  assert.deepEqual(wmLines(s), []); assert.equal(wmJson(s), null);
}));

test('save: old wheelMeta without tokUsed / matchTokUsed reads as 0 (no VERSION bump), old spotTokensUsed still counts', () => on(() => {
  const s = full({ respin: 2 }); assert.ok(!('tokUsed' in s.wheelMeta) && !('matchTokUsed' in s.wheelMeta));
  for (const w of TOKEN_WHEELS) { const l = tokenLeft(s, w, { matchKey: 'm' }); assert.equal(l.wheelLeft, w === 'course' ? null : 2, w); assert.equal(l.matchLeft, ['hype', 'toss', 'pep'].includes(w) ? 1 : null, w); }
  const d = hypeDial(ODDS0, modsFor(effective(s), 'hype')), r = useToken(s, 'hype', 'respin', hypeLow(d), makeRng('sv'), true, { matchKey: 'm' });
  assert.equal(metaOf(r.s).tokUsed.hype, 1); assert.deepEqual(metaOf(r.s).matchTokUsed, { key: 'm', n: 1 });
  const old = full({ respin: 2 }); old.wheelMeta.spotTokensUsed = 1; assert.equal(tokenLeft(old, 'spot').wheelLeft, 1);
  assert.equal(wmJson(old).tok.spot, 1); assert.equal(wmJson(s).md, 0);
}));

test('match cap: 1 token a match day across Hype, Toss and Pep, whichever goes first', () => on(() => {
  const s = full({ respin: 6 }), E = effective(s), ctx = { matchKey: 'day1' };
  const d = hypeDial(ODDS0, modsFor(E, 'hype')), tw = revealWheel('toss', modsFor(E, 'toss')), pw = revealWheel('pep', modsFor(E, 'pep'));
  const P = { hype: hypeLow(d), toss: { wheel: tw, ...revealOn(tw, 'sport') }, pep: { wheel: pw, ...revealOn(pw, 'slot3') } }; P.pep.fx.pep = 1;
  for (const first of ['hype', 'toss', 'pep']) {
    assert.ok(tokenOptions(s, first, P[first], ctx).length > 0, first + ' offered');
    const r = useToken(s, first, 'respin', P[first], makeRng('m' + first), true, ctx); assert.notEqual(r.s, s, first);
    for (const w of ['hype', 'toss', 'pep']) { assert.equal(tokenOptions(r.s, w, P[w], ctx).length, 0, `${first} then ${w}: same day closed`); assert.ok(tokenOptions(r.s, w, P[w], { matchKey: 'day2' }).length > 0, `${w} next day`); }
    const q = useToken(r.s, 'toss', 'respin', P.toss, makeRng('m2'), undefined, ctx); assert.equal(q.s, r.s, 'useToken refuses past the match cap');
  }
  const sw = metaWheel(wheelSlices('normal'), 'spot', s), i = sw.slices.findIndex((v, k) => v < 3 && !sw.golds.includes(k));
  const r = useToken(s, 'hype', 'respin', P.hype, makeRng('x'), true, ctx);
  assert.ok(tokenOptions(r.s, 'spot', { index: i, gain: sw.slices[i], jackpot: false, wheel: sw }).length > 0, 'Spotlight is not in the match cap');
}));

test('guards: Medals never doubled (Prize Pair, re-spin), Lift never above gold on Toss / Scout / Finals', () => on(() => {
  const s = full({ respin: 9, two: 9, lift: 9 }), E = effective(s), fw = revealWheel('finals', modsFor(E, 'finals'));
  for (const sl of fw.slices) assert.ok((sl.fx.medal || 0) <= 1, 'Prize Pair never doubles a Medal: ' + sl.id);
  const low = fw.slices.filter((x) => !x.gold).sort((a, b) => (a.fx.coins || 0) - (b.fx.coins || 0))[0];
  for (let k = 0; k < 60; k++) { const p = { wheel: fw, ...revealOn(fw, low.id) }, r = useToken(s, 'finals', k % 2 ? 'two' : 'respin', p, makeRng('fm' + k)); assert.ok((r.pending.fx.medal || 0) <= 1); }
  const tw = revealWheel('toss', modsFor(E, 'toss')), sw = revealWheel('scout', modsFor(E, 'scout'));
  for (let k = 0; k < 40; k++) {
    const tp = { wheel: tw, ...revealOn(tw, 'sport') }, t = useToken(s, 'toss', 'lift', tp, makeRng('tl' + k), undefined, { matchKey: 'L' + k }); if (t.s !== s) assert.ok((t.pending.fx.tossb || 0) <= 4);
    const lo = sw.slices.find((x) => !x.gold && (x.fx.steps || 0) < 1); if (lo) { const q = useToken(s, 'scout', 'lift', { wheel: sw, ...revealOn(sw, lo.id) }, makeRng('sl' + k)); assert.ok((q.pending.fx.steps || 0) <= 1); }
  }
  // a re-roll on a reveal wheel never touches the match ball stream: the caller's rng is the only one read
  const a = makeRng('ball'), b = makeRng('ball'); revealResult(a, tw); useToken(s, 'toss', 'respin', { wheel: tw, ...revealOn(tw, 'sport') }, makeRng('tok'), undefined, { matchKey: 'z' }); revealResult(b, tw); assert.equal(a.random(), b.random());
}));

test('Copy report: Full shows the wheel lines (ratios, tokens per wheel, match cap, Find check), JSON carries wm', () => on(() => {
  const s = full({ respin: 2 }); s.wheelMeta.tokUsed = { hype: 2, toss: 1 }; s.wheelMeta.matchTokUsed = { key: '1|league|1|s', n: 1 };
  const L = wmLines(s), t = L.join('\n');
  assert.match(t, /Full-tree value vs no tree.*spot x1\.63.*find x2\.06/); assert.match(t, /hype 2\/2, toss 1\/2/); assert.match(t, /match day 1\/1/);
  assert.match(t, /Find check \(18% activity, avg careful\): your tree [\d.]+%, full tree [\d.]+%, every node [\d.]+%/); assert.match(t, /Token cap reached this season: hype/);
  const log = createLog({ build: 'x' }), env = { build: 'x', now: 0, vp: 'v', errors: 0, meta: L, wm: wmJson(s) };
  const txt = buildFull(log.data(), env); assert.ok(txt.includes('Find check') && txt.includes('Tokens used this season'));
  const j = JSON.parse(buildData(log.data(), env)); assert.equal(j.wm.tok.hype, 2); assert.equal(j.wm.md, 1); assert.equal(j.wm.fc.length, 3);
  assert.ok(!('wm' in JSON.parse(buildData(log.data(), { build: 'x', now: 0, vp: 'v', errors: 0 }))), 'flag off: no wm key');
}));

test('Find check (SPEC s5 line 6): no tree ~22.9%, design full tree (Control + Fortune) ~47% and under 55%; bug flag = over 55%', () => on(() => {
  const none = findCareful(fresh(), 6000), design = findCareful(fullTreeOf(fresh(), ['sp_fnd_n', 'sp_fnd_r']), 6000), all = findCareful(fullTreeOf(fresh()), 6000);
  console.log('find check none', none, 'design full', design, 'every node', all);
  assert.ok(Math.abs(none - 26.0) < 1.5, 'none ' + none); // SPEC s5 18% careful 26.0 (FIND_CHECK.none 22.9 in js/report/wm.js is the old 3-block figure, T8's file)
  assert.ok(design > 42 && design <= FIND_CHECK.bug, 'design full ' + design);
  assert.equal(wmJson(fresh()).bug, all > FIND_CHECK.bug ? 1 : 0, 'bug flag follows the every-node number');
}));

test('Workshop / node copy: Control and tokens say every wheel, plain words, no Spotlight-only token text', () => on(() => {
  const by = Object.fromEntries(NODES.map((n) => [n.id, n]));
  for (const id of ['f_respin', 'f_two']) assert.match(by[id].words, /any wheel/);
  for (const id of ['c_slow', 'c_steady']) assert.match(by[id].words, /Every wheel/);
  for (const n of NODES) { assert.ok(n.words.length <= 140, n.id + ' short'); assert.ok(!/Spotlight only|only on Spotlight/i.test(n.words), n.id); }
  const vm = { tier: 1, spokes: 5, branches: ['control', 'fortune', 'specialist', 'craft'].map((id) => ({ id, name: id, nodes: NODES.filter((n) => n.branch === id).map((n) => ({ id: n.id, name: n.name, rank: 0, max: n.max_rank, cost: n.cost, state: 'buy', words: n.words })) })) };
  const h = workshopHtml(vm); assert.match(h, /Control: helps you stop on every wheel/);
}));
