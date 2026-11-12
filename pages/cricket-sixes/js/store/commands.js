// @ts-check
// Pure commands: (state, payload) -> new state. rng is derived per command from state, never stored.
import { makeRng } from '../core/rng.js';
import { eligibleBowlers, newInnings, playOver } from '../core/match.js';
import { pickBowler, pickIntent, pickField, rivalCall } from '../core/ai.js';
import { makeStartState } from '../data/m0-fixture.js';
import { FLAGS } from '../data/flags.js';

const ovStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Figures snapshot of innings 1 (newInnings resets some player fields before the chase). */
function summarise(s) {
  const inn = s.inn1;
  return {
    runs: inn.runs, wk: inn.wk, balls: inn.balls, overs: ovStr(inn.balls),
    bat: s.rival.players.map((p) => ({ name: p.name, bat: p.bat, r: p.inn.r, b: p.inn.b, out: p.inn.out })),
    bowl: s.me.players.map((p) => ({ name: p.name, bowl: p.bowl, overs: p.overs, r: p.figs.r, w: p.figs.w })),
  };
}

/** Default Call: first eligible bowler, field A. null when no one can bowl. */
function defaultCall(s) {
  const el = eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last);
  return el.length ? { bowler: el[0], field: 'A' } : null;
}

function newMatch(payload) {
  const seed = String(payload && payload.seed != null ? payload.seed : '0');
  const { me, rival } = makeStartState(makeRng(`${seed}|teams`));
  const s = {
    seed, stage: 'bowl', me, rival,
    inn1: newInnings(rival.players, me.players, null),
    inn2: null, call: null, last: null, result: null, inn1Summary: null,
  };
  s.call = defaultCall(s);
  return s;
}

function makeCall(s, p) {
  if (s.stage !== 'bowl') return s;
  const el = eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last);
  if (!p || !el.includes(p.bowler) || (p.field !== 'A' && p.field !== 'P')) return s;
  const n = structuredClone(s);
  n.call = { bowler: p.bowler, field: p.field };
  return n;
}

function bowlOver(s, p) {
  const n = structuredClone(s);
  if (n.stage === 'bowl') {
    const inn = n.inn1;
    const rng = makeRng(`${n.seed}|${n.stage}|${inn.over}`);
    const el = eligibleBowlers(n.me.players, inn.over, inn.last);
    const call = n.call && el.includes(n.call.bowler) ? n.call : defaultCall(n);
    if (!call) return s;
    const good = rivalCall(rng, FLAGS.rivalGoodShare);
    const intent = pickIntent(inn, false, rng, good);
    const over = inn.over;
    const balls = playOver(rng, inn, n.rival.players, n.me.players, call.bowler, intent, call.field);
    n.last = { balls, over, bowler: call.bowler, intent, field: call.field };
    if (inn.done) { n.stage = 'break'; n.call = null; n.inn1Summary = summarise(n); } else n.call = defaultCall(n);
    return n;
  }
  if (n.stage === 'chase') {
    const inn = n.inn2;
    const rng = makeRng(`${n.seed}|${n.stage}|${inn.over}`);
    const intent = p && ['D', 'R', 'A'].includes(p.intent) ? p.intent : 'R';
    const good = rivalCall(rng, FLAGS.rivalGoodShare);
    const batters = [n.me.players[inn.crease[0]], n.me.players[inn.crease[1]]];
    const bowler = pickBowler(n.rival.players, inn, batters, rng, good);
    const field = pickField(inn, batters, rng, good);
    const over = inn.over;
    const balls = playOver(rng, inn, n.me.players, n.rival.players, bowler, intent, field);
    n.last = { balls, over, bowler, intent, field };
    if (inn.done) {
      n.stage = 'done';
      n.result = inn.runs > n.inn1.runs ? 'won' : inn.runs === n.inn1.runs ? 'tied' : 'lost';
    }
    return n;
  }
  return s;
}

function startChase(s) {
  if (s.stage !== 'break') return s;
  const n = structuredClone(s);
  if (!n.inn1Summary) n.inn1Summary = summarise(n);
  n.inn2 = newInnings(n.me.players, n.rival.players, n.inn1.runs);
  n.stage = 'chase'; n.last = null; n.call = null;
  return n;
}

/**
 * @param {any} s current state (may be null)
 * @param {string} cmd NewMatch | MakeCall | BowlOver | StartChase
 * @param {any} [payload]
 */
export function applyCommand(s, cmd, payload = {}) {
  if (cmd === 'NewMatch') return newMatch(payload);
  if (!s || !s.stage) return s;
  switch (cmd) {
    case 'MakeCall': return makeCall(s, payload);
    case 'BowlOver': return bowlOver(s, payload);
    case 'StartChase': return startChase(s);
    default: return s;
  }
}
