// Coach job chip (B3.4): one always-tappable button showing a coach's weekly job. Prefix cw-.
import { esc } from './dom.js';
const WORD = { nets: 'Nets', match: 'Match', study: 'Study', scout: 'Scout', away: 'On course' };
const PATH = {
  nets: 'M4 20L16 4M14 3l7 7M5 21h6',
  match: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5 8c4 2 10 2 14 0M5 16c4-2 10-2 14 0',
  study: 'M4 5h7a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-7v13h7z',
  scout: 'M10 4a6 6 0 100 12 6 6 0 000-12zM15 15l6 6',
  away: 'M5 21V4M5 5h12l-3 4 3 4H5',
};

/** @param {{id:string, job:string, locked?:boolean, why?:string}|null|undefined} coach */
export function chipHtml(coach) {
  if (!coach || !coach.id || !WORD[coach.job]) return '';
  const job = coach.job, word = WORD[job];
  const why = coach.why ? ', ' + coach.why : '';
  const label = word + (coach.locked ? ' (set)' : '') + why;
  return '<button type="button" class="cw-chip cw-chip-' + job + (coach.locked ? ' cw-locked' : '') + '" data-cw="job" data-coach="' + esc(coach.id) + '" aria-label="' + esc(label) + '">' +
    '<svg class="cw-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + PATH[job] + '"/></svg>' +
    '<span class="cw-word">' + word + '</span></button>';
}
