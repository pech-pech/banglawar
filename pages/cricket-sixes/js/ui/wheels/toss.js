// @ts-check
/* wheels/toss: split from wm-spins.js (w2 wheel glue). */
import { openDial } from '../dial-view.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** Toss: a coin flip reveal. get() -> vm.wm.toss; dispatch('TossSpin'). */
export function spinToss({ get, look, dispatch, onCollect }) {
  const t = get();
  return openDial({
    mode: 'reveal', kind: 'coin', title: 'The toss', cardHtml: '<p class="dr-hint">Toss the coin.</p>', plan: { total: revealT(2.5, t) }, slices: t.slices, look: dialLook(look), pending: t.pending,
    ...tokProps(get, dispatch, 'toss', 'Toss'), tokVal: TOKVAL.toss, tokText: (p) => (p.index === 0 ? 'Won toss' : p.sport || p.boostPct ? 'Good sport' : 'Rival won') + (p.boostPct ? ' +' + p.boostPct + '%' : ''),
    onSpin: () => dispatch('TossSpin', {}), getPending: () => get().pending,
    describe: (p) => p.index === 0
      ? { big: 'You won the toss', chip: '+' + p.boostPct + '%', say: 'You won the toss, plus ' + p.boostPct + ' percent for your team.' }
      : { big: 'Rival won the toss', line: 'Good sport: +1 Spoke' + (p.boostPct ? ' and +' + p.boostPct + '% for your team' : ''), chip: p.boostPct ? '+' + p.boostPct + '%' : '', say: 'Rival won the toss. Good sport' + (p.boostPct ? ', plus ' + p.boostPct + ' percent' : '') + '.' },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
