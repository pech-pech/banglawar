// Feel strip: GameUp's questions, one at a time, 56 px chips plus Skip, after the first 2 matches of each build label only. At most 3 taps a match.
export const QUESTIONS = {
  q1: { text: 'Did your picks change how the overs went?', opts: ['Clearly', 'A bit', 'Not really'] },
  q2: { text: 'How was the finish?', opts: ['Tense', 'OK', 'Over too early'] },
  q3: { text: 'Did you know why the overs went that way?', opts: ['Yes', 'Mostly', 'No'] },
  q4: { text: 'The ball-by-ball speed was', opts: ['Too slow', 'About right', 'Too fast'] },
};
export const PLAN = { 1: ['q1', 'q3', 'q4'], 2: ['q1', 'q2', 'q3'] }; // keyed by the match's number within its build label (m.nb)
export const SKIP = '-';

/** Next unanswered question key for a finished match record, or null (not in the first 2 matches of the build, or all answered or skipped). */
export function nextQuestion(m) {
  if (!m || !m.res || !PLAN[m.nb]) return null;
  return PLAN[m.nb].find((q) => !(q in (m.feel || {}))) || null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Draw (or remove) the strip above the CTA on the result screen. onAnswer(q, answer). */
export function drawFeel(screenEl, m, onAnswer) {
  const old = screenEl.querySelector('.rp-feel'); if (old) old.remove();
  const q = nextQuestion(m); if (!q) return;
  const box = document.createElement('section');
  box.className = 'rp-feel'; box.setAttribute('aria-label', 'Quick question');
  box.innerHTML = '<p class="rp-q">' + esc(QUESTIONS[q].text) + '</p><div class="rp-opts">' +
    QUESTIONS[q].opts.map((o) => '<button type="button" class="c-btn rp-chip" data-a="' + esc(o) + '">' + esc(o) + '</button>').join('') +
    '<button type="button" class="c-btn rp-chip rp-skip" data-a="' + SKIP + '">Skip</button></div>';
  box.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return; // empty taps do nothing
    onAnswer(q, b.getAttribute('data-a'));
    drawFeel(screenEl, m, onAnswer);
  });
  const cta = screenEl.querySelector('.cta');
  screenEl.insertBefore(box, cta || null);
}
