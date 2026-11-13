/* trial-card: a found player on trial. Home card + sheet (Q1: Sign / Decline). Reads trialVM(s) only (shape in build/r9/UI-CLUB.md).
   Sign -> SignTrial, Decline -> DeclineTrial. Wage and squad max are shown in words; Sign is disabled with the reason when the squad is full. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { letterOfStep } from '../core/letters.js';
import { strongHtml } from './training-view.js';

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function trialCardHtml(vm) {
  if (!vm || !(vm.player || vm.coach)) return '';
  const coach = !vm.player && vm.coach;
  const p = vm.player || vm.coach;
  return '<button type="button" class="c-btn c-card cl-card cl-trial" data-act="sheet:trial" aria-label="' + esc((coach ? 'Trial coach: ' : 'Trial player: ') + (p.name || 'new') + '. Tap to sign or decline.') + '">' +
    icoDeco(coach ? 'coach' : 'team', 24) + '<span class="cl-card__t"><b>' + (coach ? 'Trial coach: ' : 'Trial player: ') + esc(p.name || 'New player') + '</b><small>Sign or decline</small></span></button>';
}

export function renderTrial(root, vm, dispatch) {
  const coach = !!(vm && !vm.player && vm.coach);
  const p = vm && (vm.player || vm.coach);
  if (!p) { root.innerHTML = '<div class="screen cl-screen"><p class="cl-note" role="status">' + icoDeco('info', 24) + '<span>Nobody is on trial right now.</span></p></div>'; return root; }
  const full = vm.canSign === false || vm.squadFull === true;
  const stats = Array.isArray(p.lines) ? p.lines : [];
  root.innerHTML = '<div class="screen cl-screen cl-trialsheet"><h3 class="cl-h" tabindex="-1">' + icoDeco(coach ? 'coach' : 'team', 24) + '<span>' + esc(p.name || (coach ? 'New coach' : 'New player')) + '</span>' +
    (coach ? '<span class="c-tag" aria-label="Grade ' + esc(letterOfStep(p.step)) + '">' + esc(letterOfStep(p.step)) + '</span>' : p.grade != null ? '<span class="c-tag" aria-label="Grade ' + esc(p.grade) + '">' + esc(p.grade) + '</span>' : '') + '</h3>' +
    '<ul class="cl-facts">' + (coach ? '<li>' + icoDeco('coach', 24) + '<span>Coach. Helps training when strong in the week\'s focus.</span></li>' + (p.strong && p.strong.length ? '<li class="t2-strong">' + strongHtml(p.strong) + '</li>' : '') : '') + (p.role ? '<li>' + icoDeco('info', 24) + '<span>' + esc(p.role) + '</span></li>' : '') +
    stats.map((l) => '<li>' + icoDeco('info', 24) + '<span>' + esc(l) + '</span></li>').join('') +
    '<li>' + icoDeco('coin', 24) + '<span>' + (Number(vm.wage) ? 'Wage: ' + fmt(vm.wage) + ' Coins a match' : 'No wage') + '</span></li>' +
    '</ul>' +
    (full ? '<p class="cl-note cl-note--warn" role="status">' + icoDeco('lock', 24) + '<span>' + esc(vm.why || (coach ? 'No free coach slot. Decline, or release a coach first.' : 'The squad is full. Decline, or make room first.')) + '</span></p>' : '') +
    '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-act="SignTrial"' + (full ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('done', 24) + '<span>Sign</span></button>' +
    '<button type="button" class="c-btn" data-cl-act="DeclineTrial">' + icoDeco('close', 24) + '<span>Decline</span></button></div></div>';
  if (!root.__clBound) {
    root.__clBound = true;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-cl-act]');
      if (!t || !root.contains(t) || t.disabled) return;
      dispatch(t.getAttribute('data-cl-act'), {});
    });
  }
  return root;
}

export function openTrial(vm, dispatch) {
  const host = document.createElement('div');
  let close;
  renderTrial(host, vm, (n, a) => { dispatch(n, a); if (close) close(); });
  close = openSheet(vm && !vm.player && vm.coach ? 'Trial coach' : 'Trial player', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
