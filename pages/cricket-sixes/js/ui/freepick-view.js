/* freepick-view: pick ONE facility, its level 1 is free. Full screen (render(el, vm, dispatch), first launch before Home) and a Home pending card
   for migrated saves (pendingCardHtml + sheet openFreePick). Reads freePickVM(s) only (shape in build/r9/UI-CLUB.md). Dispatches TakeFreePick { what }. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { SLOTS, EFFECT } from './stadium-view.js';

/* Honest labels: say plainly what does nothing yet. Never hidden. */
export const NOTE = {
  stands: 'Recommended: more Fans',
  academy: 'Needs the sign screen. Does nothing yet',
  scout: 'Needs the sign screen. Does nothing yet',
  pitch: 'Pitch types are not in matches yet. Does nothing yet',
};
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function pendingCardHtml(vm) {
  if (!vm || !vm.pending) return '';
  return '<button type="button" class="c-btn c-card cl-card cl-free" data-act="sheet:freepick" aria-label="Free facility: pick one. Tap to choose.">' +
    icoDeco('upgrade', 24) + '<span class="cl-card__t"><b>Free facility: pick one</b><small>Its level 1 costs nothing</small></span></button>';
}

function cardHtml(slot, o, sel) {
  const owned = o && o.owned;
  const note = (o && o.note) || NOTE[slot.id] || (o && o.recommended ? 'Recommended' : '');
  const effect = (o && o.effect) || (EFFECT[slot.id] ? EFFECT[slot.id][1] : slot.does);
  const price = '';
  return '<button type="button" class="c-btn cl-fp' + (sel ? ' is-sel' : '') + (owned ? ' is-owned' : '') + '" data-cl-pick="' + slot.id + '" role="radio" aria-checked="' + (sel ? 'true' : 'false') + '"' + (owned ? ' disabled aria-disabled="true"' : '') +
    ' aria-label="' + esc(slot.name + '. Gives ' + slot.does + '. ' + (owned ? 'You already have it.' : note) + price) + '">' + icoDeco(slot.icon, 24) +
    '<span class="cl-opt__t"><span class="cl-opt__n">' + esc(slot.name) + (sel ? ' ' + '<span class="c-tag c-tag--done">Picked</span>' : '') + '</span>' +
    '<span class="cl-opt__s">' + esc(slot.does) + (effect && effect !== 'none' ? ' (' + esc(effect) + ')' : '') + '</span>' +
    (owned ? '<span class="cl-opt__s">' + icoDeco('done', 16) + 'You already have it</span>' : note ? '<span class="cl-opt__s">' + icoDeco(slot.id === 'stands' ? 'fan' : 'info', 16) + esc(note) + '</span>' : '') + '</span></button>';
}

/** Full screen and sheet body. root.__clPick = chosen facility id (view state). */
export function renderFreePick(root, vm, dispatch) {
  vm = vm || { options: [] };
  const byId = {}; (Array.isArray(vm.options) ? vm.options : []).forEach((o) => { byId[o.id || o.what] = o; });
  const sel = root.__clPick && byId[root.__clPick] && !byId[root.__clPick].owned ? root.__clPick : null;
  const slot = sel ? SLOTS.find((x) => x.id === sel) : null;
  root.innerHTML = '<div class="screen cl-screen cl-fpick"><h3 class="cl-h" tabindex="-1">' + icoDeco('upgrade', 24) + '<span>Pick your free facility</span></h3>' +
    '<p class="cl-note">' + icoDeco('info', 24) + '<span>One facility gets its level 1 free. You buy the rest with Coins.</span></p>' +
    '<div class="cl-fps" role="radiogroup" aria-label="Free facility">' + SLOTS.map((x) => cardHtml(x, byId[x.id], x.id === sel)).join('') + '</div>' +
    '<button type="button" class="c-btn c-btn--primary cl-take" data-cl-act="TakeFreePick"' + (sel ? '' : ' disabled aria-disabled="true"') + '>' + icoDeco('done', 24) + '<span>' + (slot ? 'Take ' + esc(slot.name) + ' free' : 'Tap a facility first') + '</span></button></div>';
  if (!root.__clBound) {
    root.__clBound = true;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-cl-pick],[data-cl-act]');
      if (!t || !root.contains(t) || t.disabled) return;
      if (t.hasAttribute('data-cl-pick')) {
        const id = t.getAttribute('data-cl-pick'); root.__clPick = id; renderFreePick(root, root.__clVm, dispatch);
        const b = root.querySelector('[data-cl-pick="' + id + '"]'); if (b) b.focus();
      } else if (root.__clPick) { const what = root.__clPick; root.__clPick = null; dispatch('TakeFreePick', { what }); }
    });
  }
  root.__clVm = vm;
  return root;
}

/** Stage view: render(el, vm, dispatch). */
export function render(el, vm, dispatch) {
  el.innerHTML = '';
  const host = document.createElement('div');
  host.__clPick = el.__clFpPick || null;
  renderFreePick(host, vm, (n, a) => dispatch(n, a));
  el.appendChild(host);
  return el;
}

export function openFreePick(vm, dispatch) {
  const host = document.createElement('div');
  let close;
  renderFreePick(host, vm, (n, a) => { dispatch(n, a); if (close) close(); });
  close = openSheet('Free facility', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
