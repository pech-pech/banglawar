// P13 why-short: the inline "Why:" line on the call screens (whyShort, keyBall, lastWhyVM) and the frozen whyLine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { whyShort, keyBall, whyLine, whyCause } from '../js/ui/why.js';
import { matchup } from '../js/core/match.js';
import { MATCH } from '../js/data/match.js';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import { bowlVM, chaseVM, lastWhyVM } from '../js/store/selectors.js';

const KS = ['Fast', 'Medium', 'Spin'], RS = ['Opener', 'Middle', 'Lower'];
const OUTS = ['W', 6, 4, 2, 1, 0], INTS = ['D', 'R', 'A'], FIELDS = ['A', 'P', 'N'];
const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, step: 0, batHome: false, bowlHome: false, pair: 0, p: { wicket: 0.1, six: 0.07, four: 0.15, two: 0.135, single: 0.38 } };

/** Every pr shape that reaches a different branch of pick(). */
function* recs() {
  const effs = [base.eff, { bp: 50, bs: 50, spd: 55, bsk: 50 }, { bp: 55, bs: 55, spd: 50, bsk: 50 }, { bp: 50, bs: 50, spd: 50, bsk: 56 }, { bp: 56, bs: 50, spd: 50, bsk: 50 }];
  for (const step of [-1, 0, 1]) for (const batHome of [false, true]) for (const bowlHome of [false, true])
    for (const eff of effs) for (const wicket of [0.02, 0.1])
      for (const o of OUTS) for (const intent of INTS) for (const field of FIELDS) for (const ph of [0, 1, 2]) for (const bt of [undefined, ...KS])
        yield { n: '5.3', o, intent, field, ph, bowlType: bt, pr: { ...base, step, batHome, bowlHome, eff, p: { ...base.p, wicket }, pair: 13 } };
}

test('whyShort: every template is <= 28 chars over K x R x side x outcome x intent x field x step x home flags', () => {
  let n = 0; const seen = new Set(), causes = new Set();
  for (const rec of recs()) for (const you of ['bowl', 'bat']) for (const K of KS) for (const R of RS) {
    const r = whyShort(rec, { you, K, R, bat: 'Ravi', bowl: 'Okoro' });
    n++; seen.add(r.text); causes.add(r.cause);
    assert.ok(r.text.length > 0 && r.text.length <= 28, `"${r.text}" is ${r.text.length} chars`);
    assert.equal(typeof r.say, 'string'); assert.ok(r.say.length > 0);
  }
  assert.ok(n > 100000, 'sweep ran: ' + n);
  for (const c of ['matchup', 'phase', 'intent', 'field', 'gap', 'odds', 'luck']) assert.ok(causes.has(c), 'cause covered: ' + c);
  assert.ok(seen.size > 20);
});

test('whyShort: matchup arrow flips with the screen; Strong/Weak match the views RATE words', () => {
  for (const bat of RS) for (const bowl of KS) {
    const step = MATCH[`${bat}|${bowl}`];
    if (step === 0) continue;
    const rec = { n: '3.1', o: step < 0 ? 'W' : 4, intent: 'R', field: 'N', ph: 1, pr: { ...base, step } };
    const asBowl = whyShort(rec, { you: 'bowl', K: bowl, R: bat }), asBat = whyShort(rec, { you: 'bat', K: bowl, R: bat });
    assert.equal(asBowl.cause, 'matchup'); assert.equal(asBat.cause, 'matchup');
    // bowl view RATE: matchup('bowl').label Great -> ▲ Strong, Bad -> ▼ Weak. Chase view: matchup('bat').
    const mb = matchup('bowl', { bat }, { bowl }, 1).label, mc = matchup('bat', { bat }, { bowl }, 1).label;
    const word = { Great: ['▲', 'Strong'], Bad: ['▼', 'Weak'] };
    assert.ok(asBowl.text.startsWith(word[mb][0]) && asBowl.text.endsWith(word[mb][1]), `${bowl} vs ${bat}: ${asBowl.text} for ${mb}`);
    assert.ok(asBat.text.startsWith(word[mc][0]) && asBat.text.endsWith(word[mc][1]), `${bat} vs ${bowl}: ${asBat.text} for ${mc}`);
    assert.equal(asBowl.text.includes('▲'), step < 0, 'bowl screen is ▲ when pr.step < 0');
    assert.equal(asBat.text.includes('▲'), step > 0);
    assert.notEqual(asBowl.text[0], asBat.text[0]);
  }
});

test('whyShort: no player name or hidden pairing value in text (names only in say)', () => {
  for (const rec of recs()) {
    if (rec.field !== 'P' || rec.bowlType === 'Medium') continue; // thin the sweep, text does not depend on these
    for (const you of ['bowl', 'bat']) {
      const r = whyShort({ ...rec, pr: { ...rec.pr, pair: 17 } }, { you, K: 'Fast', R: 'Opener', bat: 'Ravi', bowl: 'Okoro' });
      assert.ok(!/Ravi|Okoro|batter|bowler\b/i.test(r.text.replace(/your bowler|their bowler|your batter|their batter/gi, '')), r.text);
      assert.ok(!r.text.includes('17'), r.text);
      assert.ok(!/\d/.test(r.text.replace(/\b[12] runs?\b/, '')), 'only the run count may be a digit: ' + r.text);
      assert.ok(!/pair|cell|hidden/i.test(r.text), r.text);
    }
  }
  const w = whyShort({ n: '1.1', o: 'W', intent: 'R', field: 'N', ph: 0, pr: { ...base, step: -1 } }, { you: 'bowl', K: 'Fast', R: 'Opener', bat: 'Ravi', bowl: 'Okoro' });
  assert.match(w.say, /Ravi/); assert.doesNotMatch(w.text, /Ravi/);
});

// ---- keyBall
const ball = (cat, extra = {}) => {
  const m = {
    matchup: { o: 0, intent: 'R', field: 'N', pr: { ...base, step: -1 } },
    phase: { o: 0, intent: 'R', field: 'N', pr: { ...base, bowlHome: true } },
    intent: { o: 0, intent: 'D', field: 'N', pr: base },
    field: { o: 0, intent: 'R', field: 'P', pr: base },
    gap: { o: 0, intent: 'R', field: 'N', pr: { ...base, eff: { ...base.eff, bsk: 60 } } },
    odds: { o: 'W', intent: 'R', field: 'N', pr: { ...base, p: { ...base.p, wicket: 0.02 } } },
    luck: { o: 4, intent: 'R', field: 'N', pr: base },
  }[cat];
  return { n: '2.1', ph: 1, ...m, ...extra };
};

test('keyBall helper balls have the intended causes', () => {
  for (const c of ['matchup', 'phase', 'intent', 'field', 'gap', 'odds', 'luck']) assert.equal(whyCause(ball(c)), c);
});

test('keyBall: first wicket, else first six, else first four, else most common cause', () => {
  assert.equal(keyBall([]), -1); assert.equal(keyBall(undefined), -1);
  const plain = ball('luck', { o: 0 });
  assert.equal(keyBall([plain, { ...plain, o: 4 }, { ...plain, o: 6 }, { ...plain, o: 'W' }, { ...plain, o: 'W' }, plain]), 3, 'wicket beats six and four');
  assert.equal(keyBall([plain, { ...plain, o: 4 }, { ...plain, o: 6 }, { ...plain, o: 6 }, plain, plain]), 2, 'first six');
  assert.equal(keyBall([plain, plain, { ...plain, o: 4 }, { ...plain, o: 4 }, plain, plain]), 2, 'first four');
  // most common cause: gap x3 beats matchup x1; index of the first ball of that cause
  const g = ball('gap'), m = ball('matchup'), l = ball('luck', { o: 2 });
  assert.equal(whyCause(l), 'luck');
  assert.equal(keyBall([m, g, g, l, g, l]), 1);
});

test('keyBall: ties break matchup > phase > field/intent > gap > luck', () => {
  const c = { matchup: ball('matchup'), phase: ball('phase'), field: ball('field'), intent: ball('intent'), gap: ball('gap'), luck: ball('luck', { o: 2 }) };
  assert.equal(whyCause(c.luck), 'luck');
  assert.equal(keyBall([c.luck, c.gap, c.intent, c.phase, c.matchup]), 4, 'matchup wins a 1-1-1-1-1 tie wherever it sits');
  assert.equal(keyBall([c.luck, c.gap, c.intent, c.phase]), 3, 'phase beats field/intent/gap/luck');
  assert.equal(keyBall([c.luck, c.gap, c.intent]), 2, 'intent beats gap');
  assert.equal(keyBall([c.luck, c.gap, c.field]), 2, 'field beats gap');
  assert.equal(keyBall([c.luck, c.gap]), 1, 'gap beats luck');
  assert.equal(keyBall([c.luck, c.luck, c.gap, c.gap, c.matchup]), 2, 'count first: gap x2 beats matchup x1, first gap ball');
});

test('keyBall: a tie between one-ball causes is decided by rank, not position (matchup last still wins)', () => {
  const a = ball('gap'), b = ball('field'), c = ball('matchup');
  assert.equal(keyBall([a, b, c]), 2);
  assert.equal(keyBall([c, b, a]), 0);
  assert.equal(keyBall([a, b]), 1);
});

// ---- whyLine unchanged
test('whyLine output is unchanged: 200 BallRecs match the snapshot made from origin/main why.js', () => {
  const snap = JSON.parse(readFileSync(new URL('./fixtures/p13-whyline-snap.json', import.meta.url), 'utf8'));
  assert.equal(snap.length, 200);
  for (const { rec, bat, bowl, line } of snap) assert.equal(whyLine(rec, bat, bowl), line, `ball ${rec.n} ${rec.o}`);
  assert.ok(new Set(snap.map((x) => x.rec.o)).size === 6, 'all six outcomes in the snapshot');
});

// ---- lastWhyVM
function nextOver(s, intent = 'R') { return C(s.stage === 'bowl' ? C(s, 'MakeCall', { bowler: s.call.bowler, field: 'P' }) : s, 'BowlOver', { intent }); }
function expectedSay(s, you) {
  const bats = (you === 'bowl' ? s.rival : s.me).players, bowls = (you === 'bowl' ? s.me : s.rival).players;
  const balls = s.last.balls.slice(0, 6), k = keyBall(balls), b = balls[k];
  const bw = bowls[s.last.bowler], bt = bats[b.batter];
  return { k, say: whyLine({ ...b, bowlType: bw.bowl }, bt.name, bw.name), bt, bw, b };
}

test('lastWhyVM: null before the first over, set on bowl and chase after an over', () => {
  let s = C(null, 'NewMatch', { seed: 'p13-why' });
  assert.equal(s.stage, 'bowl');
  assert.equal(lastWhyVM(s), null); assert.equal(bowlVM(s).lastWhy, null);
  s = nextOver(s);
  const v = lastWhyVM(s), e = expectedSay(s, 'bowl');
  assert.ok(v && v.key === e.k && v.say === e.say, 'bowl: key and say');
  assert.ok(v.text.length > 0 && v.text.length <= 28 && !v.text.includes(e.bt.name));
  assert.deepEqual(bowlVM(s).lastWhy, v);
  const sh = whyShort({ ...e.b, bowlType: e.bw.bowl }, { you: 'bowl', K: e.bw.bowl, R: e.bt.bat, bat: e.bt.name, bowl: e.bw.name });
  assert.equal(v.text, sh.text);
  for (let i = 0; i < 40 && s.stage === 'bowl'; i++) s = nextOver(s);
  while (s.stage === 'break') s = C(s, 'StartChase');
  assert.equal(s.stage, 'chase');
  const c0 = chaseVM(s).lastWhy;
  assert.ok(c0 === null || s.last, 'first chase over: no stale line from the other innings or a line for the new last');
  s = nextOver(s, 'A');
  if (s.stage === 'chase' && s.last && s.last.balls.length) {
    const cv = lastWhyVM(s), ce = expectedSay(s, 'bat');
    assert.ok(cv && cv.key === ce.k && cv.say === ce.say, 'chase: key and say');
    assert.equal(cv.text, whyShort({ ...ce.b, bowlType: ce.bw.bowl }, { you: 'bat', K: ce.bw.bowl, R: ce.bt.bat, bat: ce.bt.name, bowl: ce.bw.name }).text);
    assert.deepEqual(chaseVM(s).lastWhy, cv);
  }
});

test('lastWhyVM: whyInline flag off gives null', () => {
  let s = nextOver(C(null, 'NewMatch', { seed: 'p13-why-off' }));
  assert.ok(lastWhyVM(s));
  const was = FLAGS.whyInline; FLAGS.whyInline = false;
  try { assert.equal(lastWhyVM(s), null); assert.equal(bowlVM(s).lastWhy, null); } finally { FLAGS.whyInline = was; }
});
