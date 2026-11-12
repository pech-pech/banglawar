// @ts-check
// Plain-English "why" line for one ball. Pure: no DOM, no randomness. Reads rec.pr (ballProbs result).
// Optional on rec: bowlType ('Fast'|'Medium'|'Spin') to say "against spin" and to skip in-phase for wickets by non-Fast bowlers.
import { T } from '../data/match.js';

const WORD = { W: 'Wicket', 6: 'Six', 4: 'Four', 2: '2 runs', 1: '1 run', 0: 'Dot' };
/** Word for an outcome (W, 6, 4, 2, 1, 0). Safe for aria-labels. */
export function outcomeLabel(o) { return WORD[String(o)] || String(o); }

const LEAD = { W: 'Out!', 6: '6.', 4: '4.', 2: '2.', 1: '1.', 0: 'Dot.' };
const KIND = { Fast: 'pace', Medium: 'medium pace', Spin: 'spin' };

/** @returns {{w:number,t:string}[]} candidate reasons with a weight in probability points */
function reasons(rec, bat, bowl) {
  const pr = rec.pr || {}, e = pr.eff || { bp: 0, bs: 0, spd: 0, bsk: 0 };
  const step = pr.step || 0, o = rec.o, i = rec.intent, f = rec.field;
  const kind = rec.bowlType ? KIND[rec.bowlType] : null;
  const mPts = T.MATCHUP * Math.abs(step), ph = T.PHASE_BONUS;
  const badM = step < 0, greatM = step > 0;
  const against = kind ? ' against ' + kind : ' against ' + bowl;
  const out = [];
  const add = (w, t) => { if (w > 0) out.push({ w, t }); };
  if (o === 'W') {
    const k = T.W_K;
    if (badM) add(mPts * k, `Bad matchup for ${bat}${against}.`);
    if (pr.bowlHome && (!rec.bowlType || rec.bowlType === 'Fast')) add(ph * k, `${bowl} is in his phase.`);
    add(T.W_INT[i] || 0, i === 'A' ? `${bat} went for it with Attack.` : '');
    add(T.W_FIELD[f] || 0, 'The field was up.');
    add((e.spd - e.bs - (badM ? mPts : 0)) * k, `${bowl} was too good for ${bat}.`);
  } else if (o === 6 || o === 4) {
    const k = T.PW_K, fb = (o === 6 ? T.S6_FIELD : T.S4_FIELD)[f] || 0, ib = (o === 6 ? T.S6_INT : T.S4_INT)[i] || 0;
    if (greatM) add(mPts * k, `Great matchup for ${bat}${against}.`);
    if (pr.batHome) add(ph * k, `${bat}'s in his phase.`);
    add(ib, i === 'A' ? `${bat} was in Attack mode.` : '');
    add(fb, 'The field is up.');
    add((e.bp - e.bsk - (greatM ? mPts : 0)) * k, `${bat} outhit ${bowl}.`);
  } else if (o === 1) {
    const k = T.P1_K;
    if (greatM) add(mPts * k, `Great matchup for ${bat}${against}.`);
    if (pr.batHome) add(ph * k, `${bat}'s in his phase.`);
    add(T.P1_INT[i] || 0, i === 'D' ? `${bat} was playing safe.` : '');
    add((e.bs - e.bsk - (greatM ? mPts : 0)) * k, `${bat} read ${bowl} well.`);
  } else {
    // dot or 2: the batting side's biggest negative
    const k = T.P1_K;
    if (badM) add(mPts * k, `Bad matchup for ${bat}${against}.`);
    if (pr.bowlHome) add(ph * k, `${bowl} is in his phase.`);
    add(i === 'D' ? -(T.P1_INT.D) + 0.02 : 0, `${bat} was just defending.`);
    add(f === 'P' ? 0.008 : 0, 'The field was back on the rope.');
    add((e.bsk - e.bs - (badM ? mPts : 0)) * k, `${bowl} was too tight for ${bat}.`);
  }
  return out.filter((r) => r.t);
}

/** One short plain sentence: outcome, then the biggest reason from rec.pr. */
export function whyLine(rec, batterName, bowlerName) {
  const bat = String(batterName || 'The batter'), bowl = String(bowlerName || 'the bowler');
  const lead = LEAD[String(rec.o)] || String(rec.o) + '.';
  const list = reasons(rec, bat, bowl).sort((a, b) => b.w - a.w);
  return lead + ' ' + (list.length ? list[0].t : 'Just how the ball fell.');
}

/** Tiny self-check. Returns a list of failures (empty = pass). */
export function selfCheck() {
  const bad = [];
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, step: 0, batHome: false, bowlHome: false };
  const t = (name, ok) => { if (!ok) bad.push(name); };
  const a = whyLine({ o: 4, intent: 'R', field: 'A', pr: { ...base, batHome: true } }, 'Ravi', 'Okoro');
  t('four phase+field', a === "4. Ravi's in his phase." || a === '4. The field is up.');
  const b = whyLine({ o: 'W', intent: 'R', field: 'N', bowlType: 'Spin', pr: { ...base, step: -1 } }, 'Ravi', 'Okoro');
  t('wicket matchup', b === 'Out! Bad matchup for Ravi against spin.');
  t('dot fallback', /^Dot\. /.test(whyLine({ o: 0, intent: 'R', field: 'N', pr: base }, 'A', 'B')));
  t('label', outcomeLabel('W') === 'Wicket' && outcomeLabel(6) === 'Six');
  return bad;
}
