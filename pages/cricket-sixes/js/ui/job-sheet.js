// Job sheet (coach weekly): pick this week's job for one coach. Pure string builder, no DOM.
// vm = { coachName, rows:[{ job, ok, why, xp, effect }], focusJob, note2slot }
import { esc } from './dom.js';

const LABEL = { study: 'Study tape', scout: 'Scout', nets: 'Nets', match: 'Match' };

function rowHtml(r, vm) {
  const label = LABEL[r.job] || r.job;
  const xp = '<span class="cw-xp">+' + esc(r.xp) + ' XP</span>';
  const eff = '<span class="cw-eff">' + esc(r.effect || '') + '</span>';
  const head = '<span class="cw-name">' + esc(label) + '</span>' + xp;
  if (r.ok) {
    return '<button type="button" class="cw-row' + (vm.focusJob === r.job ? ' is-focus' : '') + '" data-cw="setjob" data-job="' + esc(r.job) +
      '" data-coach="' + esc(vm.coachName) + '" aria-label="' + esc(label + ', ' + (r.effect || '') + ', ' + r.xp + ' XP') + '">' + head + eff + '</button>';
  }
  return '<div class="cw-row is-off" aria-disabled="true"><span class="cw-name">' + esc(label) + '</span>' + xp + '<span class="cw-why">' + esc(r.why || 'Not this week') + '</span></div>';
}

export function jobSheetHtml(vm) {
  const rows = (vm && vm.rows) || [];
  return '<div class="cw-sheet" role="group" aria-label="Job for ' + esc(vm.coachName) + '">' +
    '<h3 class="cw-title">' + esc(vm.coachName) + ': this week</h3>' +
    rows.map((r) => rowHtml(r, vm)).join('') +
    (vm.note2slot ? '<p class="cw-note">No match duty: only 2 coach slots this week, so Nets and Match are not on offer.</p>' : '') +
    '<button type="button" class="cw-close" data-cw="close">Close</button></div>';
}
