// @ts-check
/* wheels/find: split from wm-spins.js (w2 wheel glue). */
import { openWheel } from '../wheel-view.js'; // wa1 find: Find is a big wheel
import { stopOf } from './shared.js';

const FIND_WORD = { coins: 'Coins', player: 'a trial player', coach: 'a trial coach' };
/** The Find card from what was really paid (a Player / Coach cell can fall back to Coins). */
export function findLine(p) {
  if (p.type === 'coins') { const n = (p.coins | 0).toLocaleString('en'), b = p.bonus | 0; return { big: 'Found ' + n + ' Coins', chip: 'Coins', line: b > 0 ? 'Booster bonus: +' + b + ' Coins' : '', say: 'You found ' + n + ' Coins' + (b > 0 ? ', including ' + b + ' Booster bonus Coins' : '') + '.', gold: !!p.jackpot }; }
  const w = FIND_WORD[p.type] || 'something';
  return { big: 'Found ' + w, chip: 'Trial', say: 'You found ' + w + '.', gold: !!p.jackpot };
}
/** Find (wa1, agent "find"): the big wheel (openWheel, like the Spotlight). get() -> the option's wheel data (slices, widths, golds, labels, phys, pending, tokens);
    pick = dispatch('PickActivity', {id, stop}); useToken(kind) = dispatch('UseToken', {wheel:'find', kind}). One SPIN + STOP, the find blocks are gold. */
export function spinFind({ get, look, pick, useToken, onCollect, title }) {
  const r = get(), word = (p) => (p && p.find ? (FIND_WORD[p.type] || 'something') : 'Nothing');
  const asWheel = (p) => (p ? { ...p, gain: p.find ? 1 : 0, jackpot: !!p.find } : p); // the wheel reads index / gain / jackpot
  return openWheel({
    title: title || 'Find', cardHtml: '<p class="dr-hint">Stop on a gold block to find Coins, a player or a coach. The tick shows where it will land.</p>',
    slices: r.slices, widths: r.widths, jackpotIndex: r.jackpotIndex, golds: r.golds, aims: r.aims, labels: r.labels, phys: r.phys,
    guide: !!r.guide, zone: r.zone || 0, chime: !!r.chime, look, plainResult: true, jpText: 'FOUND!', tokName: 'Find',
    pending: asWheel(r.pending), onSpin: (stop) => pick(stopOf(stop)), getPending: () => asWheel(get().pending),
    describe: (p) => {
      const d = p.find ? findLine(p) : { big: 'Nothing this time', say: 'No find this time. Next week, maybe.' };
      const line = [p.second ? 'Second Cheer: one more look!' : '', d.line || ''].filter(Boolean).join(' ');
      return { ...d, chip: p.find ? d.chip : '', line };
    },
    outcome: (kind, b, q) => { const nm = { respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge' }[kind] || 'Token'; return q.find && !(b && b.find) ? nm + ': found ' + word(q) + '!' : nm + ': still nothing'; },
    tokens: r.tokens || [], getTokens: () => { const x = get(); return (x.tokens || []).map((t) => (x.tokLeft != null ? { ...t, left: x.tokLeft, ...(t.count != null ? { count: Math.min(t.count | 0, x.tokLeft) } : {}) } : t)); }, // wa1 fixfind: xN never above the uses left this season
    onToken: useToken ? (kind) => useToken(kind) : undefined,
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
