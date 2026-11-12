// First-match strip (p7-first, option A): one card, 3 numbered lines, Skip. Shown once per save (state.seen.firstStrip).
// Markup only: the owning view handles the click on [data-strip-skip] and dispatches SeeFirstStrip.
export const STRIP_LINES = [
  'You bowl first. Pick who bowls each over.',
  'Then you bat. Get more runs than they did.',
  'Win or lose, your players earn practice points.',
];

/** @param {(s:string)=>string} esc */
export function stripHtml(esc) {
  return '<section class="fs-strip" aria-label="Your first match">' +
    '<div class="fs-strip__head"><b class="fs-strip__t">Your first match</b>' +
    '<button type="button" class="c-btn fs-strip__skip" data-strip-skip aria-label="Skip the first match tips">Skip</button></div>' +
    '<ol class="fs-strip__list">' + STRIP_LINES.map((l, i) => '<li><b class="fs-strip__n" aria-hidden="true">' + (i + 1) + '</b><span>' + esc(l) + '</span></li>').join('') + '</ol></section>';
}
