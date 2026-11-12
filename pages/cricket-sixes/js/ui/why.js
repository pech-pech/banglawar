// @ts-check
// Plain-English "why" line for one ball. Pure: no DOM, no randomness. Reads rec.pr (ballProbs result).
// Optional on rec: bowlType ('Fast'|'Medium'|'Spin') to say "against spin" and to skip in-phase for wickets by non-Fast bowlers.
import { T } from '../data/match.js';

const WORD = { W: 'Wicket', 6: 'Six', 4: 'Four', 2: '2 runs', 1: '1 run', 0: 'dot' };
/** Word for an outcome (W, 6, 4, 2, 1, 0). Safe for aria-labels. Dot is shown as the "·" glyph, labelled "dot". */
export function outcomeLabel(o) { return WORD[String(o)] || String(o); }

const KIND = { Fast: 'pace', Medium: 'medium pace', Spin: 'spin' };
const PHASE = ['the early overs (1-3)', 'the middle overs (4-7)', 'the death overs (8-10)'];

/** Small deterministic hash of the ball number string (e.g. "8.3"). */
function hashN(n) { let h = 7; const s = String(n == null ? '' : n); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** @returns {{w:number,t:string[]}[]} candidate reasons (2-3 wording variants each) with a weight in probability points */
function reasons(rec, bat, bowl) {
  const pr = rec.pr || {}, e = pr.eff || { bp: 0, bs: 0, spd: 0, bsk: 0 };
  const step = pr.step || 0, o = rec.o, i = rec.intent, f = rec.field;
  const kind = rec.bowlType ? KIND[rec.bowlType] : null;
  const mPts = T.MATCHUP * Math.abs(step), ph = T.PHASE_BONUS;
  const badM = step < 0, greatM = step > 0;
  const against = kind ? ' against ' + kind : ' against ' + bowl;
  const best = (who) => PHASE[rec.ph] ? [`${who} is at his best in ${PHASE[rec.ph]}.`, `${who} loves ${PHASE[rec.ph]}.`, `${PHASE[rec.ph].replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())} suit ${who}.`] : [`${who} is in his best overs.`, `${who} is at his best right now.`];
  const out = [];
  const add = (w, ...t) => { if (w > 0 && t[0]) out.push({ w, t }); };
  if (o === 'W') {
    const k = T.W_K;
    if (badM) add(mPts * k, `Bad matchup for ${bat}${against}.`, `${bat} struggles${against}.`, `Tough matchup: ${bat}${against}.`);
    if (pr.bowlHome && (!rec.bowlType || rec.bowlType === 'Fast')) add(ph * k, ...best(bowl));
    add(T.W_INT[i] || 0, i === 'A' ? `${bat} went for it with Attack.` : '', `Attack mode cost ${bat} his wicket.`, `${bat} swung hard and missed.`);
    add(T.W_FIELD[f] || 0, 'Field up: the gap opened.', 'The field was up and it cost a wicket.', 'With the field up, the batter took a risk.');
    add((e.spd - e.bs - (badM ? mPts : 0)) * k, `${bowl} was too good for ${bat}.`, `${bowl} beat ${bat}.`, `${bat} had no answer to ${bowl}.`);
  } else if (o === 6 || o === 4) {
    const k = T.PW_K, fb = (o === 6 ? T.S6_FIELD : T.S4_FIELD)[f] || 0, ib = (o === 6 ? T.S6_INT : T.S4_INT)[i] || 0;
    if (greatM) add(mPts * k, `Great matchup for ${bat}${against}.`, `${bat} loves facing ${kind ? kind : bowl}.`, `${bat} has the edge${against}.`);
    if (pr.batHome) add(ph * k, ...best(bat));
    add(ib, i === 'A' ? `${bat} was in Attack mode.` : '', `Attack paid off for ${bat}.`, `${bat} went for it and it worked.`);
    add(fb, 'Field up: the gap opened.', 'The field is up, so there was space to hit.', 'With the field up, the ball found the gap.');
    add((e.bp - e.bsk - (greatM ? mPts : 0)) * k, `${bat} outhit ${bowl}.`, `${bat} out-muscled ${bowl}.`, `${bowl} could not stop ${bat}'s power.`);
  } else if (o === 1) {
    const k = T.P1_K;
    if (greatM) add(mPts * k, `Great matchup for ${bat}${against}.`, `${bat} is comfortable${against}.`, `${bat} has the edge${against}.`);
    if (pr.batHome) add(ph * k, ...best(bat));
    add(T.P1_INT[i] || 0, i === 'D' ? `${bat} was playing safe.` : '', `Safe play got ${bat} a single.`, `${bat} kept it simple.`);
    add((e.bs - e.bsk - (greatM ? mPts : 0)) * k, `${bat} read ${bowl} well.`, `${bat} picked the gap off ${bowl}.`, `${bat} played ${bowl} smartly.`);
  } else {
    // dot or 2: the batting side's biggest negative
    const k = T.P1_K;
    if (badM) add(mPts * k, `Bad matchup for ${bat}${against}.`, `${bat} struggles${against}.`, `Tough matchup: ${bat}${against}.`);
    if (pr.bowlHome) add(ph * k, ...best(bowl));
    add(i === 'D' ? -(T.P1_INT.D) + 0.02 : 0, `${bat} was just defending.`, `${bat} played it safe.`, `Defending kept the score still.`);
    add(f === 'P' ? 0.008 : 0, 'The field was back on the rope.', 'Field back: no easy runs.', 'The deep field stopped the runs.');
    add((e.bsk - e.bs - (badM ? mPts : 0)) * k, `${bowl} was too tight for ${bat}.`, `${bowl} bowled tight to ${bat}.`, `${bat} could not get ${bowl} away.`);
  }
  return out;
}

/** One short plain sentence: the biggest reason from rec.pr (no outcome number; the badge shows it). Wording varies by ball number. Pure. */
export function whyLine(rec, batterName, bowlerName) {
  const bat = String(batterName || 'The batter'), bowl = String(bowlerName || 'the bowler');
  const list = reasons(rec, bat, bowl).sort((a, b) => b.w - a.w);
  if (!list.length) return ['Just how the ball fell.', 'A bit of luck either way.'][hashN(rec.n) % 2];
  const t = list[0].t;
  return t[hashN(rec.n) % t.length];
}

/** Tiny self-check. Returns a list of failures (empty = pass). */
export function selfCheck() {
  const bad = [];
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, step: 0, batHome: false, bowlHome: false };
  const t = (name, ok) => { if (!ok) bad.push(name); };
  const a = whyLine({ n: '8.1', o: 4, intent: 'R', field: 'A', pr: { ...base, batHome: true } }, 'Ravi', 'Okoro');
  t('four phase+field', /field/i.test(a) && !/^\d/.test(a));
  const b = whyLine({ n: '2.1', o: 'W', intent: 'R', field: 'N', bowlType: 'Spin', pr: { ...base, step: -1 } }, 'Ravi', 'Okoro');
  t('wicket matchup', /Ravi/.test(b) && /spin/.test(b) && !/^(Out|\d)/.test(b));
  t('dot fallback', whyLine({ n: '1.1', o: 0, intent: 'R', field: 'N', pr: base }, 'A', 'B').length > 5);
  t('no jargon', !/phase/.test(whyLine({ n: '9.2', o: 6, intent: 'R', field: 'N', ph: 2, pr: { ...base, batHome: true } }, 'A', 'B')));
  t('label', outcomeLabel('W') === 'Wicket' && outcomeLabel(6) === 'Six' && outcomeLabel(0) === 'dot');
  return bad;
}
