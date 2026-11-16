// @ts-check
/* wheels/scout: split from wm-spins.js (w2 wheel glue). */
import { openReel } from '../reel-view.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** wa1: the words for a Scout result. A Lucky Lift can add a step to an Extra name, so both can show. */
export function scoutWords(p) {
  const st = p.steps | 0, stw = '+' + st + (st === 1 ? ' step' : ' steps');
  if (p.extra && st > 0) return { big: 'One more name, top name ' + stw, say: 'The scouts found one more name, and the best name goes up ' + stw.slice(1) + '.', short: 'one more name, ' + stw };
  if (p.extra) return { big: 'One more name on the list', say: 'The scouts found one more name.', short: 'one more name' };
  return { big: 'Top name ' + stw, say: 'The best name on the list goes up ' + stw.slice(1) + '.', short: stw };
}
/** Scout: reveal reel when the list opens. get() -> vm.spin; dispatch('ScoutSpin'). */
export function spinScout({ get, look, dispatch, onCollect }) {
  const s = get();
  return openReel({
    mode: 'reveal', title: 'The scouts', cardHtml: '<p class="dr-hint">What do the scouts bring?</p>', plan: { total: revealT(3, s) }, cells: s.cells, look: dialLook(look), pending: s.pending,
    ...tokProps(get, dispatch, 'scout', 'Scout'), tokVal: TOKVAL.scout, tokText: (p) => scoutWords(p).short,
    onSpin: () => dispatch('ScoutSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = scoutWords(p); return { big: w.big, say: w.say, gold: !p.extra && !!p.jackpot }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
