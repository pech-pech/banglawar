// @ts-check
/* wheels/find: split from wm-spins.js (w2 wheel glue). */
import { openWheel } from '../wheel-view.js'; // wa1 find: Find is a big wheel
import { findWheelOpts } from './find-opts.js';

/** The card hint, kept literal here (tick / wm-w2-fix greps). */
const FIND_CARD = '<p class="dr-hint">Stop on a gold block to find Coins, a player or a coach. The tick shows where the pointer will stop.</p>';
const FIND_WORD = { coins: 'Coins', player: 'a trial player', coach: 'a trial coach' };
/** The Find card from what was really paid (a Player / Coach cell can fall back to Coins). */
export function findLine(p) {
  if (p.type === 'coins') { const n = (p.coins | 0).toLocaleString('en'), b = p.bonus | 0; return { big: 'Found ' + n + ' Coins', chip: 'Coins', line: b > 0 ? 'Booster bonus: +' + b + ' Coins' : '', say: 'You found ' + n + ' Coins' + (b > 0 ? ', including ' + b + ' Booster bonus Coins' : '') + '.', gold: !!p.jackpot }; }
  const w = FIND_WORD[p.type] || 'something';
  return { big: 'Found ' + w, chip: 'Trial', say: 'You found ' + w + '.', gold: !!p.jackpot };
}
/** Find (T4 wave 3): the big wheel through openWheel(findWheelOpts(vm, ctx)). get() -> findSpinVM; pick = dispatch('PickActivity', {id, ...{stop}}) (the store decides at STOP and records it);
    useToken(kind) = dispatch('UseToken', {wheel:'find', kind}). One SPIN + STOP: no auto-stop, no skip. A stored result (vm.pending / vm.stored) opens on its result and never re-spins;
    before STOP the wheel is unspun. */
export function spinFind({ get, look, pick, useToken, onCollect, title, wobKey }) {
  const r = get(), pend = r.pending;
  const stored = r.stored || (pend && Number.isFinite(+pend.index) ? { stops: [{ sliceId: pend.index | 0, value: pend.find ? 1 : 0, cycle: 1, tInCycle: 0, stopT: 0, auto: false, respin: 0 }], kept: 0, spent: false } : null);
  const o = findWheelOpts(r, { wheelId: 'find', spinKey: r.spinKey, wobKey, look, title, stored, get, pick: (stop) => pick({ stop }), useToken, onCollect });
  return openWheel({ ...o, cardHtml: FIND_CARD });
}
