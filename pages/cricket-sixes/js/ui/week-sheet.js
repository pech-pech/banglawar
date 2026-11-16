/* week-sheet: "This week" sheet (H2 3.8). Lists what waits on the home: free facility, trial player, fan activity, next unlock, squad notice.
   weekItems/chipWord are pure; openWeek draws the sheet. It opens nothing by itself. noticeGone + DismissNotice live here (moved out of hub-view). */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';

let noticeGone = false; // view state: the squad-of-8 line is gone once tapped (the store command, if any, clears it for good)

/** @returns {Array<{key:'free'|'trial'|'activity'|'unlock'|'notice', word:string, act?:string}>} */
export function weekItems(v) {
  v = v || {};
  const out = [];
  if (v.freePick && v.freePick.pending) out.push({ key: 'free', word: 'Free facility: pick one', act: 'sheet:freepick' });
  const t = v.trial || (v.activities && v.activities.trial);
  if (t && (t.player || t.coach)) {
    const p = t.player || t.coach;
    out.push({ key: 'trial', word: (t.player ? 'Trial player: ' : 'Trial coach: ') + (p.name || 'New'), act: 'sheet:trial' });
  }
  const a = v.activities;
  if (a && !a.picked && a.available !== false) out.push({ key: 'activity', word: 'Fan activity: pick one, or rest', act: 'sheet:activities' });
  if (v.unlock) out.push({ key: 'unlock', word: 'Next unlock: ' + v.unlock.name + ', ' + v.unlock.left + ' drill' + (v.unlock.left > 1 ? 's' : '') + ' to go' });
  const n = v.notice;
  if (n && !noticeGone) {
    const k = Number(n.moved) || 0;
    out.push({ key: 'notice', word: n.line || 'The squad is now 8.' + (k ? ' ' + k + ' player' + (k === 1 ? '' : 's') + ' moved on.' : '') });
  }
  return out;
}

/** Chip word: first item that is not the unlock, else "This week"; " · N" when more than one; null when empty. */
export function chipWord(items) {
  if (!items || !items.length) return null;
  const f = items.find((i) => i.key !== 'unlock');
  return (f ? f.word : 'This week') + (items.length > 1 ? ' · ' + items.length : '');
}

const ICON = { free: 'upgrade', trial: 'team', activity: 'pennant', unlock: 'train', notice: 'info' };

export function openWeek(vm, dispatch, open) {
  const items = weekItems(vm);
  const row = (i) => {
    const tap = i.act || i.key === 'notice';
    const tag = tap ? 'button type="button"' : 'div';
    const end = tap ? 'button' : 'div';
    return '<' + tag + ' class="c-btn c-card wk-row" data-wk="' + i.key + '"' + (i.key === 'notice' ? ' role="status"' : '') + '>' +
      icoDeco(ICON[i.key] || 'info', 24) + '<span class="wk-txt">' + esc(i.word) + (i.key === 'notice' ? ' <small>Tap to close</small>' : '') + '</span></' + end + '>';
  };
  let close;
  close = openSheet('This week', items.length ? '<div class="wk-list">' + items.map(row).join('') + '</div>' : '<p class="wk-none">Nothing waiting.</p>');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (body) body.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-wk]');
    if (!b) return;
    const it = items.find((i) => i.key === b.getAttribute('data-wk'));
    if (!it) return;
    if (it.key === 'notice') { noticeGone = true; dispatch('DismissNotice', {}); b.remove(); if (!body.querySelector('[data-wk]')) close(); return; }
    if (it.act && open) { close(); open(it.act.replace(/^sheet:/, '')); }
  });
  return close;
}
