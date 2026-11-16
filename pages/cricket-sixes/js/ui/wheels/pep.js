// @ts-check
/* wheels/pep: split from wm-spins.js (w2 wheel glue). */
import { openDial } from '../dial-view.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** Pep slices show the six's names (batting order), not slot numbers (M 2026-11-15 "Replace numbers with players"). Falls back to the number. Pure. */
export const pepSlices = (/** @type {any[]} */ sl, /** @type {string[]} */ names) => (sl || []).map((c, i) => ({ ...c, label: (names && names[i]) || c.label }));
/** Pep: six lights chase. get() -> vm.wm.pep; names = the six's names in batting order. dispatch('PepSpin'). */
export function spinPep({ get, look, dispatch, onCollect, names }) {
  const p0 = get(), who = (p) => (p.slots || [p.index + 1]).map((x) => names[x - 1] || 'Player ' + x);
  return openDial({
    mode: 'reveal', kind: 'lights', title: 'Pep talk', cardHtml: '<p class="dr-hint">Who gets the pep talk?</p>', plan: { total: revealT(2.5, p0) }, slices: pepSlices(p0.slices, names), nameLabels: true, look: dialLook(look), pending: p0.pending,
    ...tokProps(get, dispatch, 'pep', 'Pep'), tokVal: TOKVAL.pep, tokText: (p) => who(p).join(' and '),
    onSpin: () => dispatch('PepSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = who(p).join(' and '); return { big: w + ' got the pep talk', chip: '+5%', say: w + ' got the pep talk, plus 5 percent.', gold: (p.slots || []).length > 1 }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
