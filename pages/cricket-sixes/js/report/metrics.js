// @ts-check
// Pure per-over and per-match measures for the playtest report. No DOM, no storage, no clock.
// One over record is a plain object (short keys keep the stored log small):
//   o over no. | s 'b' bowl innings, 'c' chase | b bowler index | g grade chip | mu matchup 'G' Good, 'O' OK, 'P' Poor, '?' unknown
//   gb Good chips on the chosen bowler | gm most Good chips on any eligible bowler | f field | i intent | r runs | w wickets
//   xr expected runs | xw expected wickets | rr asking rate (chase) | fit [bowler, field, intent] 1/0/null vs the skilled bot
//   th think ms | pw panel wait ms | sk 1 if the over panel was closed early
import { bowlVM, chaseVM } from '../store/selectors.js';
import { skilledBowler, skilledField, skilledIntent } from '../core/skilled.js';

export const OVER_COLS = ['o', 's', 'b', 'g', 'mu', 'gb', 'gm', 'f', 'i', 'r', 'w', 'xr', 'xw', 'rr', 'fit', 'th', 'pw', 'sk'];
const r1 = (x) => Math.round(x * 10) / 10;

/** Chip word for the bowler's previews: sum of matchup steps (Great +1, Bad -1). */
export function matchupOf(previews) {
  if (!previews || !previews.length) return '?';
  const g = previews.reduce((a, p) => a + p.g, 0);
  return g > 0 ? 'G' : g < 0 ? 'P' : 'O';
}

/** Expected runs and wickets of a set of balls, from the probabilities the engine used. */
export function expected(balls) {
  let xr = 0, xw = 0;
  for (const b of balls || []) {
    const p = b.pr && b.pr.p; if (!p) continue;
    xr += 6 * p.six + 4 * p.four + 2 * p.two + p.single; xw += p.wicket;
  }
  return { xr: r1(xr), xw: r1(xw) };
}

/**
 * Over record for a BowlOver that moved `before` to `after`. Call with the state BEFORE the command so the skilled bot sees the same board.
 * @param {any} before @param {any} after @param {{th?:number}} [t]
 */
export function overRecord(before, after, t = {}) {
  const L = after.last, bowling = before.stage === 'bowl';
  const runs = L.balls.reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0);
  const wk = L.balls.filter((b) => b.o === 'W').length;
  const ex = expected(L.balls);
  const rec = { o: L.over, s: bowling ? 'b' : 'c', b: L.bowler, g: null, mu: '?', gb: 0, gm: 0, f: L.field, i: L.intent, r: runs, w: wk,
    xr: ex.xr, xw: ex.xw, rr: null, fit: [null, null, null], th: t.th == null ? null : Math.round(t.th), pw: null, sk: 0 };
  if (bowling) {
    const vm = bowlVM(before);
    const me = vm.bowlers.find((x) => x.i === L.bowler);
    const great = (x) => x.previews.filter((p) => p.label === 'Great').length;
    rec.g = me ? me.grade : '?';
    rec.mu = me ? matchupOf(me.previews) : '?';
    rec.gb = me ? great(me) : 0;
    rec.gm = Math.max(0, ...vm.bowlers.filter((x) => x.eligible).map(great));
    rec.fit = [skilledBowler(before, vm) === L.bowler ? 1 : 0, skilledField(before) === L.field ? 1 : 0, null];
  } else {
    const vm = chaseVM(before);
    rec.rr = r1(vm.need / Math.max(vm.ballsLeft, 1) * 6); // runs needed per over
    rec.fit = [null, null, skilledIntent(before, vm) === L.intent ? 1 : 0];
  }
  return rec;
}

/** Result facts when the match is over (stage 'done'). Margin: wickets in hand when won, runs short when lost. */
export function matchResult(s) {
  const a = s.inn1, b = s.inn2;
  const won = s.result === 'won', lost = s.result === 'lost';
  const m = won ? { k: 'wk', n: 5 - b.wk } : lost ? { k: 'run', n: a.runs - b.runs } : { k: 'run', n: 0 };
  const close = s.result === 'tied' || (won && m.n <= 1) || (lost && m.n <= 6);
  const blow = (lost && m.n > 40) || (won && m.n >= 4); // [guess] band: under 20% of matches
  return { res: s.result, us: b.runs, them: a.runs, wkUs: b.wk, wkThem: a.wk, m, close, blow, dec: Math.max(1, b.over - 1) };
}
