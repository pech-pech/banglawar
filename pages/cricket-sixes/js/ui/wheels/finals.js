// @ts-check
/* wheels/finals: split from wm-spins.js (w2 wheel glue). */
import { openReel } from '../reel-view.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** wa1: the words for a Finals prize from what it pays (a Lucky Lift adds Coins to any prize but a Medal; the slice label alone would go stale). */
export function finalsWords(p) {
  const parts = [];
  if (p.medal > 0) parts.push('+' + p.medal + ' Medal'); if (p.coins > 0) parts.push(p.coins + ' Coins'); if (p.tp > 0) parts.push(p.tp + ' TP'); if (p.fans > 0) parts.push(p.fans + ' Fans');
  return parts.length ? parts.join(' + ') : (p.label || 'Prize');
}
/** wa1 fixreel (QA V7): the reason line when the prize is not the cell's label: "Prize Pair: 20 Fans x1.5 = 30" (one part per unit Prize Pair raised). '' when none. */
export function finalsPairLine(p) {
  if (!p || !p.pair || !p.base) return '';
  const x = (v) => Math.floor(v * 1.5 + 0.5), u = [['coins', 'Coins'], ['tp', 'TP'], ['fans', 'Fans']].filter(([k]) => p.base[k] > 0);
  return u.length ? 'Prize Pair: ' + u.map(([k, w]) => p.base[k] + ' ' + w + ' x1.5 = ' + x(p.base[k])).join(', ') : '';
}
/** wa1 fixreel (QA V7): the plain Lucky Lift line ("Lucky Lift: +10 Coins"); other tokens keep the shared line (null = use it). */
export function finalsTokLine(kind, before, q) {
  if (kind !== 'lift') return null;
  const d = (TOKVAL.finals(q || {}) - TOKVAL.finals(before || q || {})) | 0;
  return d > 0 ? 'Lucky Lift: +' + d + ' Coins' : 'Lucky Lift: no bonus';
}
/** Finals prize: reveal reel on the result screen. get() -> vm.finals; dispatch('FinalsSpin'). */
export function spinFinals({ get, look, dispatch, onCollect }) {
  const f = get();
  return openReel({
    mode: 'reveal', title: 'Finals prize', cardHtml: '<p class="dr-hint">Spin for your prize.</p>', plan: { total: revealT(3, f) }, cells: f.cells, look: dialLook(look), pending: f.pending,
    ...tokProps(get, dispatch, 'finals', 'Finals'), tokVal: TOKVAL.finals, tokText: finalsWords, tokLine: finalsTokLine,
    onSpin: () => dispatch('FinalsSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = finalsWords(p), why = finalsPairLine(p); return { big: w, ...(why ? { line: why } : {}), say: 'Finals prize: ' + w + '.' + (why ? ' ' + why.replace('x1.5', 'times one and a half') + '.' : ''), gold: !!p.jackpot }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
