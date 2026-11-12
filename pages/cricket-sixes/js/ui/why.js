// @ts-check
// Plain-English "why" line for one ball. Pure: no DOM, no randomness. Reads rec.pr (ballProbs result).
// Optional on rec: bowlType ('Fast'|'Medium'|'Spin') to say "against spin" and to skip in-phase for wickets by non-Fast bowlers.
import { T } from '../data/match.js';

const WORD = { W: 'Wicket', 6: 'Six', 4: 'Four', 2: '2 runs', 1: '1 run', 0: 'No run' };
/** Word for an outcome (W, 6, 4, 2, 1, 0). Safe for aria-labels. Dot is shown as the "·" glyph, labelled "dot". */
export function outcomeLabel(o) { return WORD[String(o)] || String(o); }

const KIND = { Fast: 'fast bowling', Medium: 'medium bowling', Spin: 'spin' };
const PHASE = ['the early overs (1‑3)', 'the middle overs (4‑7)', 'the last overs (8‑10)'];

/** Small deterministic hash of the ball number string (e.g. "8.3"). */
function hashN(n) { let h = 7; const s = String(n == null ? '' : n); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

const MIN_GAP = 1; // rating points of gap needed before we call it a rating reason

/**
 * Pick the cause of one ball. Priority: grid (|step|>=1 is MATCHUP=5 points, in the outcome's direction),
 * then in-phase home bonus, then intent/field, then rating gap, then luck. Low-chance wickets say "against the odds".
 * @returns {{cat:'matchup'|'phase'|'intent'|'field'|'gap'|'odds'|'luck', t:string[]}}
 */
function pick(rec, bat, bowl) {
  const pr = rec.pr || {}, e = pr.eff || { bp: 0, bs: 0, spd: 0, bsk: 0 };
  const step = pr.step || 0, o = rec.o, i = rec.intent, f = rec.field;
  const kind = rec.bowlType ? KIND[rec.bowlType] : null;
  const gridHit = Math.abs(step) * T.MATCHUP >= 5; // one grid step = 5 rating points
  const badM = step < 0 && gridHit, greatM = step > 0 && gridHit;
  const against = kind ? ' against ' + kind : ' against ' + bowl;
  const best = (who) => PHASE[rec.ph] ? [`${who} is at his best in ${PHASE[rec.ph]}.`, `${who} loves ${PHASE[rec.ph]}.`, `${PHASE[rec.ph].replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())} suit ${who}.`] : [`${who} is in his best overs.`, `${who} is at his best right now.`];
  const bad = [`Bad pairing for ${bat}${against}.`, `${bat} struggles${against}.`, `Tough pairing: ${bat}${against}.`];
  const great = [`Good pairing for ${bat}${against}.`, `${bat} has the edge${against}.`, `${bat} is comfortable${against}.`];
  const R = (cat, ...t) => ({ cat, t });
  const luck = R('luck', 'Just how the ball fell.', 'A bit of luck either way.');
  const pick1 = (inB, fiB, inT, fiT) => (inB >= fiB && inB > 0 ? R('intent', ...inT) : fiB > 0 ? R('field', ...fiT) : null);
  const FUP = ['Field up: the gap opened.', 'The field was up, so there was space to hit.', 'With the field up, the ball found the gap.'];
  if (o === 'W') {
    if (badM) return R('matchup', ...bad);
    if (pr.p && pr.p.wicket < 0.05) return R('odds', `A rare one: ${bowl} got ${bat} against the odds.`, `Against the odds, ${bowl} had ${bat}.`, `${bat} was unlucky; this was a long shot for ${bowl}.`);
    if (pr.bowlHome && (!rec.bowlType || rec.bowlType === 'Fast')) return R('phase', ...best(bowl));
    const r = pick1(T.W_INT[i] || 0, T.W_FIELD[f] || 0,
      [`${bat} went for it with Attack.`, `Attack mode cost ${bat} his wicket.`, `${bat} swung hard and missed.`],
      ['The field was up and it cost a wicket.', 'With the field up, the batter took a risk.', 'Field up: no room for error.']);
    if (r) return r;
    if (e.spd - e.bs >= MIN_GAP) return R('gap', `${bowl} was too good for ${bat}.`, `${bowl} beat ${bat}.`, `${bat} had no answer to ${bowl}.`);
    return luck;
  }
  if (o === 6 || o === 4) {
    if (greatM) return R('matchup', ...great);
    if (pr.batHome) return R('phase', ...best(bat));
    const r = pick1((o === 6 ? T.S6_INT : T.S4_INT)[i] || 0, (o === 6 ? T.S6_FIELD : T.S4_FIELD)[f] || 0,
      [`${bat} was in Attack mode.`, `Attack paid off for ${bat}.`, `${bat} went for it and it worked.`], FUP);
    if (r) return r;
    if (e.bp - e.bsk >= MIN_GAP) return R('gap', `${bat} outhit ${bowl}.`, `${bat} out-muscled ${bowl}.`, `${bowl} could not stop ${bat}'s power.`);
    return luck;
  }
  if (o === 2) {
    // 2-run chance is flat in the model, so only grid, phase and rating can honestly be cited; field/intent are flavour.
    if (greatM) return R('matchup', `Good pairing for ${bat}${against}: they ran two.`, `${bat} has the edge${against} and took two.`, `${bat} read ${kind ? kind : bowl} and ran hard for two.`);
    if (pr.batHome) return R('phase', `${bat} is in his best overs and ran two.`, `${bat} timed it well and took two.`, `Good running from ${bat} for two.`);
    if (e.bs - e.bsk >= MIN_GAP) return R('gap', `${bat} placed it well off ${bowl} and ran two.`, `${bat} found the gap and came back for two.`, `${bat} ran hard for two.`);
    if (f === 'P') return R('field', 'The field was back, so they ran two.', 'With the field deep, there was time for two.', 'Deep field: an easy second run.');
    if (f === 'A') return R('field', 'The field was up and a gap gave two.', 'The ball slipped past the inner ring for two.', 'A gap in the ring gave them two.');
    return luck;
  }
  if (o === 1) {
    if (greatM) return R('matchup', `Good pairing for ${bat}${against}.`, `${bat} is comfortable${against}.`, `${bat} has the edge${against}.`);
    if (pr.batHome) return R('phase', ...best(bat));
    if (i === 'D') return R('intent', `${bat} was playing safe.`, `Safe play got ${bat} a single.`, `${bat} kept it simple.`);
    if (e.bs - e.bsk >= MIN_GAP) return R('gap', `${bat} read ${bowl} well.`, `${bat} picked the gap off ${bowl}.`, `${bat} played ${bowl} smartly.`);
    return i === 'A' ? R('intent', `Even in Attack mode, ${bat} nudged a single.`, `${bat} took what was there in Attack.`, `${bat} kept the strike moving.`)
      : R('intent', `${bat} played steady and took a single.`, `${bat} worked ${bowl} for one.`, `${bat} ticked the score over.`);
  }
  // dot
  if (badM) return R('matchup', ...bad);
  if (pr.bowlHome) return R('phase', ...best(bowl));
  if (i === 'D') return R('intent', `${bat} was just defending.`, `${bat} played it safe.`, `Defending kept the score still.`);
  if (i === 'A') return R('intent', `${bat} went for too much and found no gap.`, `Attack mode: ${bat} swung and missed. No run.`, `${bat} tried to hit out and got nothing.`);
  if (f === 'P') return R('field', 'The field was back on the rope.', 'Field back: no easy runs.', 'The deep field stopped the runs.');
  if (e.bsk - e.bs >= MIN_GAP) return R('gap', `${bowl} was too tight for ${bat}.`, `${bowl} bowled tight to ${bat}.`, `${bat} could not get ${bowl} away.`);
  return R('gap', `${bowl} bowled a good ball to ${bat}.`, `${bat} found no gap against ${bowl}.`, `${bowl} gave ${bat} nothing to hit.`);
}

/** Cause category of a ball's why line: matchup | phase | intent | field | gap | odds | luck. Pure. */
export function whyCause(rec) { return pick(rec, 'The batter', 'the bowler').cat; }

/** One short plain sentence: the biggest reason from rec.pr (no outcome number; the badge shows it). Wording varies by ball number. Pure. */
export function whyLine(rec, batterName, bowlerName) {
  const bat = String(batterName || 'The batter'), bowl = String(bowlerName || 'the bowler');
  const t = pick(rec, bat, bowl).t;
  return t[hashN(rec.n) % t.length];
}

/** Tiny self-check. Returns a list of failures (empty = pass). */
export function selfCheck() {
  const bad = [];
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, step: 0, batHome: false, bowlHome: false };
  const t = (name, ok) => { if (!ok) bad.push(name); };
  const a = whyLine({ n: '8.1', o: 4, intent: 'R', field: 'A', pr: { ...base, batHome: true } }, 'Ravi', 'Okoro');
  t('four phase', /best|loves|suit/i.test(a) && !/^\d/.test(a));
  const a2 = whyLine({ n: '8.1', o: 4, intent: 'R', field: 'A', pr: base }, 'Ravi', 'Okoro');
  t('four field', /field/i.test(a2));
  const b = whyLine({ n: '2.1', o: 'W', intent: 'R', field: 'N', bowlType: 'Spin', pr: { ...base, step: -1 } }, 'Ravi', 'Okoro');
  t('wicket matchup', /Ravi/.test(b) && /spin/.test(b) && !/^(Out|\d)/.test(b));
  t('dot fallback', whyLine({ n: '1.1', o: 0, intent: 'R', field: 'N', pr: base }, 'A', 'B').length > 5);
  t('no jargon', !/phase/.test(whyLine({ n: '9.2', o: 6, intent: 'R', field: 'N', ph: 2, pr: { ...base, batHome: true } }, 'A', 'B')));
  t('label', outcomeLabel('W') === 'Wicket' && outcomeLabel(6) === 'Six' && outcomeLabel(0) === 'No run');
  return bad;
}
