/* swap-offer: the "Swap N Spokes for M Coins?" confirm outside the Workshop (season-end screen). Same words and sheet as the Workshop's.
   swapCardHtml(sw, note) -> markup (a card with one button, data-swap-open), or '' when nothing to offer and no note.
   bindSwap(el, sw, dispatch, o) wires the button; o.auto = open the confirm once now (dismissable: Back or Escape; the card stays so it can be reopened).
   Reads the swapVM shape {open, spokes, coins, rate}. */
import { esc } from './dom.js';
import { openSheet } from './sheet.js';
import { swapSheetHtml } from './workshop-view.js';
import { spokeIcon } from './wheel-look.js';

export function swapCardHtml(sw, note) {
  if (!(sw && sw.open) && !note) return '';
  return '<div class="c-card wk-swap" data-swap-card>' + spokeIcon(22) + '<span>' + (sw && sw.open ? 'Spare Spokes: swap ' + esc(sw.rate || 2) + ' for 1 Coin' : esc(note)) + '</span>' +
    (sw && sw.open ? '<button type="button" class="c-btn c-btn--gold" data-swap-open>Swap ' + esc(sw.spokes) + ' Spokes for ' + esc(sw.coins) + ' Coins</button>' + (note ? '<p class="wk-swapnote" role="status">' + esc(note) + '</p>' : '') : '') + '</div>';
}

/** Open the confirm sheet. onDone(note) runs on a Yes, just before dispatch('SwapSpokes') redraws the screen. */
export function openSwapConfirm(sw, dispatch, onDone) {
  const close = openSheet('Swap Spokes', swapSheetHtml(sw.spokes, sw.rate), { returnFocus: ['[data-swap-open]', '#app button'] });
  const body = document.querySelector('.sheet-fixed .c-sheet__body'); if (!body) return close;
  const y = body.querySelector('[data-wk-swap-yes]'); if (y) y.focus();
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-wk-swap-yes')) { close(); if (onDone) onDone('Swapped ' + sw.spokes + ' Spokes for ' + sw.coins + ' Coins.'); dispatch('SwapSpokes', {}); } // the note is kept first: the dispatch redraws the screen
    else if (t.hasAttribute('data-wk-swap-back')) close();
  });
  return close;
}

const asked = new Set(); // season keys already offered this page load: the confirm opens by itself once, then only from the button
export function bindSwap(el, sw, dispatch, o) {
  const b = el.querySelector('[data-swap-open]'); if (!b || !sw || !sw.open) return;
  b.addEventListener('click', () => openSwapConfirm(sw, dispatch, o && o.onDone));
  const key = o && o.key != null ? String(o.key) : '';
  if (o && o.auto && key && !asked.has(key)) { asked.add(key); openSwapConfirm(sw, dispatch, o.onDone); }
}
