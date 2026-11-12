// "Potential grade" words shared by the Call and Chase screens (p7-first). One note of each kind per render.
export const POT = 'Potential grade';
export const GROW = 'how high he can grow';
export const UNKNOWN_WHY = 'not known yet. Shows after 1 practice drill';

/** aria text for a grade chip. */
export const gradeAria = (g) => (!g || g === '?') ? POT.toLowerCase() + ' ' + UNKNOWN_WHY : POT.toLowerCase() + ' ' + g + ', ' + GROW;

/** Per-render flags: the grow line goes under the first letter chip, the '?' line under the first hidden one. */
export const newNotes = () => ({ grow: false, q: false });

/** Markup of the note for one chip, or '' when this screen already showed it. @param {string} g @param {{grow:boolean,q:boolean}} st @param {(s:string)=>string} esc */
export function noteFor(g, st, esc) {
  if (!g || g === '?') {
    if (st.q) return ''; st.q = true;
    return '<span class="bv-note" data-qnote>? = ' + esc(UNKNOWN_WHY) + ' <span class="bv-pips" aria-hidden="true">▫ 0/1</span></span>';
  }
  if (st.grow) return ''; st.grow = true;
  return '<span class="bv-note" data-grow>' + esc(GROW) + '</span>';
}
