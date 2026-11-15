// @ts-check
// P13: "your call vs the other call" on the over result. Same-dice replay of the over with another call, then compare EXPECTED runs and wickets (not the dice).
// Pure: never mutates `before`, nothing is stored in game state.
import { applyCommand } from './commands.js';
import { overExpect } from '../core/match.js';

const BOWL = { A: 'Attack', P: 'Protect' };
const CHASE = { D: 'Defend', R: 'Steady', A: 'Attack' };
const WK = 0.10;
const EPS = 1e-9;


/**
 * Hint wording per P13 spec 2.3.
 * @param {'b'|'c'} stage @param {string} mine @param {string} alt @param {number} dr mine minus alt expected runs @param {number} dw mine minus alt expected wickets
 * @returns {{text:string, say:string}}
 */
export function hintText(stage, mine, alt, dr, dw) {
  const names = stage === 'b' ? BOWL : CHASE;
  const M = names[mine], A = names[alt];
  const n = Math.round(Math.abs(dr));
  const wk = Math.abs(dw) >= WK;
  const bowl = stage === 'b';
  const parts = [];
  if (n > 0) {
    if (bowl) parts.push(`${dr < 0 ? 'saved' : 'cost'} ${n} ${n === 1 ? 'run' : 'runs'}`);
    else parts.push(`${dr < 0 ? '-' : '+'}${n} ${n === 1 ? 'run' : 'runs'}`);
  }
  if (wk) parts.push(bowl ? (dw > 0 ? 'more wickets' : 'fewer wickets') : (dw > 0 ? 'more risk' : 'less risk'));
  const text = parts.length ? `${M}: ${parts.join(', ')} vs ${A}` : `${M}: about the same as ${A}`;
  // say: what the OTHER call would have given with the same balls.
  const alter = dr < 0 ? 'more' : 'fewer';
  const r = n > 0 ? ` about ${n} ${alter} ${n === 1 ? 'run' : 'runs'}` : ' about the same runs';
  const w = wk ? (bowl ? ` and ${dw > 0 ? 'fewer' : 'more'} wickets` : ` and ${dw > 0 ? 'less' : 'more'} wicket risk`) : '';
  const say = `Your call ${M}. With the same balls, ${A} would have ${bowl ? 'conceded' : 'given'}${r}${w}.`;
  return { text, say };
}

/** Pick the chase alternative: of the two other intents, the one with the larger |dr|; tie -> Steady (R). */
function chaseAlt(mine, drOf) {
  const others = ['D', 'R', 'A'].filter((k) => k !== mine);
  let best = others[0], bd = Math.abs(drOf(best));
  for (const k of others.slice(1)) {
    const d = Math.abs(drOf(k));
    if (d > bd + EPS || (Math.abs(d - bd) <= EPS && k === 'R')) { best = k; bd = d; }
  }
  return best;
}

/**
 * @param {any} before state before the BowlOver @param {any} after state after it
 * @param {{flag?:boolean, onError?:(e:any)=>void}} [opts]
 * @returns {{stage:'b'|'c', mine:string, alt:string, dr:number, dw:number, text:string, say:string}|null}
 */
export function callCompare(before, after, opts = {}) {
  try {
    if (opts.flag === false || !before || !after || !after.last || !after.last.balls) return null;
    const stage = before.stage === 'bowl' ? 'b' : before.stage === 'chase' ? 'c' : null;
    if (!stage) return null;
    const L = after.last;
    if (L.balls.length < 6) return null;
    const mx = overExpect(L.balls);
    /** @param {any} st */
    const ex = (st) => (st && st.last && st.last.balls.length >= 6 ? overExpect(st.last.balls) : null);
    if (stage === 'b') {
      const mine = L.field, alt = mine === 'A' ? 'P' : 'A';
      if (mine !== 'A' && mine !== 'P') return null;
      const ax = ex(applyCommand({ ...before, call: { bowler: L.bowler, field: alt } }, 'BowlOver', {}));
      if (!ax) return null;
      const dr = mx.xr - ax.xr, dw = mx.xw - ax.xw;
      return { stage, mine, alt, dr, dw, ...hintText(stage, mine, alt, dr, dw) };
    }
    const mine = L.intent;
    if (!CHASE[mine]) return null;
    /** @type {Record<string, any>} */
    const xs = {};
    for (const k of ['D', 'R', 'A']) {
      if (k === mine) continue;
      const x = ex(applyCommand(before, 'BowlOver', { intent: k }));
      if (!x) return null;
      xs[k] = x;
    }
    const alt = chaseAlt(mine, (k) => mx.xr - xs[k].xr);
    const dr = mx.xr - xs[alt].xr, dw = mx.xw - xs[alt].xw;
    return { stage, mine, alt, dr, dw, ...hintText(stage, mine, alt, dr, dw) };
  } catch (e) {
    if (opts.onError) opts.onError(e);
    return null;
  }
}
