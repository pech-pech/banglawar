// Training week 1 coach notice (p7-first, option B): "Hale is your coach. He is best at ..." + Change. No tap needed; the default stands if ignored.
import { esc } from './dom.js';

/** @param {{name:string, line:string, canChange:boolean}|null|undefined} n */
export function coachNoticeHtml(n) {
  if (!n) return '';
  return '<div class="tr-cnotice" role="status"><span class="tr-cnotice__t">' + esc(n.line) + '</span>' +
    (n.canChange ? '<button type="button" class="c-btn tr-cnotice__btn" data-act="ChangeCoach" aria-label="Change coach">Change</button>' : '') + '</div>';
}
