// Feel strip (REPORT-V2 s5): result screen only, at most 2 one-tap questions per match, 3 buttons plus Skip (56 px chips).
// Codes: tr training (Q1), wh wheel (Q5), ec spend (Q3), pk picks (Q2, fallback). Answers go to log.feel(code, answer, fact) as 'sk' (skipped), 'n/a' (not asked), 'off'.
export const QUESTIONS = {
  tr: { text: 'Training this week: did anything happen?', opts: ['Nothing', 'Some', 'Exciting'] },
  wh: { text: 'The wheel stop: was the timing fair?', opts: ['Too fast', 'Fair', 'Too slow', 'Luck only'] },
  ec: { text: 'Your last spend: did it matter?', opts: ['Mattered', 'Meh', 'Wish I had saved'] },
  pk: { text: 'Your picks this match', opts: ['Clearly', 'A bit', 'No'] },
};
export const PRIORITY = ['wh', 'ec', 'tr', 'pk'];
export const SKIP = '-';
const SKIPPED = ['sk', '-'];

/**
 * Questions to ask on this finished match record, in order (max 2). ctx = the report log data (feelLog, nets, spins, buys); without it only pk can fire.
 * Rules: first 2 matches of a build up to 2, then 1 a match until tr/wh/ec have 3 answers each, then 1 every 3rd match; skipped twice in a row pauses 5 matches;
 * answered pauses 2 matches; never after a loss by more than 40 runs.
 */
export function planFeel(m, ctx) {
  if (!m || !m.res) return [];
  if (m.res === 'lost' && m.m && m.m.n > 40) return [];
  const have = Object.keys(m.feel || {}).filter((c) => QUESTIONS[c]);
  const nb = m.nb || 1, log = ((ctx && ctx.feelLog) || []).filter((x) => !x.b || x.b === m.build);
  const answered = (c) => log.filter((x) => x.f === c && x.v && !SKIPPED.includes(x.v) && x.v !== 'n/a' && x.v !== 'off').length;
  const cap = nb <= 2 ? 2 : PRIORITY.slice(0, 3).some((c) => answered(c) < 3) ? 1 : nb % 3 === 0 ? 1 : 0;
  let room = cap - have.length; if (room <= 0) return [];
  const lastOf = (c) => { const l = log.filter((x) => x.f === c && x.id !== m.id); return l[l.length - 1] || null; };
  const paused = (c) => {
    const l = log.filter((x) => x.f === c && x.id !== m.id), a = l[l.length - 1], b = l[l.length - 2];
    if (a && b && SKIPPED.includes(a.v) && SKIPPED.includes(b.v) && m.id - a.id < 5) return true;
    return !!(a && !SKIPPED.includes(a.v) && a.v !== 'n/a' && m.id - a.id <= 2);
  };
  const since = (c, list) => { const l = lastOf(c), q = l ? l.q || 0 : 0; return ((ctx && ctx[list]) || []).some((r) => (r.q || 0) > q && (!r.b || r.b === m.build)); };
  const fired = { wh: since('wh', 'spins'), ec: since('ec', 'buys'), tr: since('tr', 'nets') };
  const out = [];
  for (const c of PRIORITY.slice(0, 3)) if (fired[c] && !paused(c) && !have.includes(c) && out.length < room) out.push(c);
  if (!out.length && !have.length && !paused('pk') && !have.includes('pk')) out.push('pk');
  return out;
}

/** Next unanswered question key for a finished match record, or null. */
export function nextQuestion(m, ctx) { return planFeel(m, ctx)[0] || null; }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Draw (or remove) the strip above the CTA on the result screen. onAnswer(code, answer, fact). ctx = log data (pass log.data() for the trigger rules). */
export function drawFeel(screenEl, m, onAnswer, ctx) {
  const old = screenEl.querySelector('.rp-feel'); if (old) old.remove();
  const q = nextQuestion(m, ctx); if (!q) return;
  const fact = q === 'ec' && ctx && ctx.buys && ctx.buys.length ? String(ctx.buys[ctx.buys.length - 1].item || '') : null;
  const box = document.createElement('section');
  box.className = 'rp-feel'; box.setAttribute('aria-label', 'Quick question');
  box.innerHTML = '<p class="rp-q">' + esc(QUESTIONS[q].text) + (fact ? ' <b>' + esc(fact) + '</b>' : '') + '</p><div class="rp-opts">' +
    QUESTIONS[q].opts.map((o) => '<button type="button" class="c-btn rp-chip" data-a="' + esc(o) + '">' + esc(o) + '</button>').join('') +
    '<button type="button" class="c-btn rp-chip rp-skip" data-a="' + SKIP + '">Skip</button></div>';
  box.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return; // empty taps do nothing
    onAnswer(q, b.getAttribute('data-a'), fact);
    drawFeel(screenEl, m, onAnswer, ctx);
  });
  const cta = screenEl.querySelector('.cta');
  screenEl.insertBefore(box, cta || null);
}
