// Ball-by-ball over panel. Modal; autoplays one ball per 400 ms; calls onDone when Next is pressed.
// balls: raw over balls ({n, o, ...}) optionally with batName, bowlName, bowlType for the why line.
import { whyLine, outcomeLabel } from './why.js';
import { chipHtml } from './book-sheet.js';
import { icoDeco } from './dom.js';
import { attachBeats } from './beats.js';

export const BALL_MS = 400;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/** Text inside a circle: the number (0 for a dot) or "W" or "W". Pure. */
export function ballGlyph(o) { return String(o); }
/** Word under a circle (colour is never the only signal). Pure. */
export function ballWord(o) { return o === 'W' ? 'OUT' : o === 6 ? 'SIX' : o === 4 ? 'FOUR' : o === 0 ? 'NO RUN' : o === 1 ? '1 RUN' : o === 2 ? '2 RUNS' : String(o); }
/** Pure: runs and wickets in a list of balls. */
export function overTotals(balls) {
  let runs = 0, wk = 0;
  for (const b of balls || []) { if (b.o === 'W') wk += 1; else runs += Number(b.o) || 0; }
  return { runs, wk };
}
/** Pure: "This over: 12 runs, 1 wicket. Score 33 runs, 2 wickets down" */
export function totalLine(balls, score) {
  const t = overTotals(balls);
  return `This over: ${plural(t.runs, 'run')}, ${plural(t.wk, 'wicket')}. Score ${plural(score.runs, 'run')}, ${score.wk} ${score.wk === 1 ? 'wicket' : 'wickets'} down`;
}
const kind = (o) => (o === 'W' ? 'w' : o === 6 ? 's' : o === 4 ? 'f' : 'n');

/**
 * @param {{title:string, balls:any[], score:{runs:number,wk:number}, nextLabel?:string, onDone:()=>void}} o
 * (summaryLines: optional extra plain lines shown under the total line.)
 * found: pairings found this over (selectors.foundVM): a "Pairing found" card with the grade word (never a number) and an Open Book button; onBook() runs after the panel closes.
 */
const ROLE = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' }, TYPE = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
/** One "Pairing found" card listing every cell found this over (one title, one row per find, one saved line). Pure. Takes one find or a list. */
export function foundHtml(list) {
  const fs = Array.isArray(list) ? list : [list];
  const rows = fs.map((f) => {
    const chip = chipHtml({ found: true, rank: f.rank, grade: f.grade, combo: f.combo ? f.combo.name : null, phase: ['Early', 'Middle', 'Late'][f.ph] }, f.bat + ' v ' + f.bowl, true);
    return '<div class="bk-fr"><span class="bk-fn">' + icoDeco(ROLE[f.bat], 20) + '<span>' + esc(f.name) + '</span></span>' + chip +
      (f.combo ? '<span class="bk-fc">' + icoDeco('medal', 16) + 'Combo: ' + esc(f.combo.name) + '</span>' : '') + '</div>';
  }).join('');
  return '<div class="bk-found"><div class="bk-f1">' + icoDeco('book', 24) + (fs.length > 1 ? 'Pairings found' : 'Pairing found') + '</div>' + rows +
    '<p class="bk-fsub">Saved in your Book. Grade is the batter\'s view.</p></div>';
}
/** Plain-words text of the found card, for the polite live region (the region exists first; finish() fills it). Pure. */
export function foundText(list) {
  const fs = Array.isArray(list) ? list : [list];
  return (fs.length > 1 ? 'Pairings found. ' : 'Pairing found. ') + fs.map((f) => f.bat + ' v ' + f.bowl + ', ' + ['early', 'middle', 'late'][f.ph] + ': ' + f.grade + '.' + (f.combo ? ' Combo: ' + f.combo.name + '.' : '')).join(' ') + ' Saved in your Book.';
}
export function playOverPanel({ title, balls, score, summaryLines = [], nextLabel = 'Next over', batKit, found = [], onBook, onDone }) {
  const list = (balls || []).slice(0, 6);
  const root = document.createElement('div');
  root.className = 'op-scrim';
  const hasFound = found.length > 0;
  const slots = Array.from({ length: 6 }, (_, i) => `<li class="op-slot${i >= list.length ? ' is-unused' : ''}" data-i="${i}"><span class="op-circle" aria-hidden="true"></span><span class="op-word" aria-hidden="true"></span></li>`).join('');
  root.innerHTML = `<section class="c-card op-card has-beats${hasFound ? ' has-found' : ''}" role="dialog" aria-modal="true" aria-labelledby="op-title">` +
    `<header class="op-head"><h2 id="op-title" class="op-title">${esc(title)}</h2>` +
    `<button type="button" class="c-icon-btn op-close" aria-label="Close and skip to the end of the over"><span class="c-ico c-ico--x"></span></button></header><div class="bt-slot"></div><ol class="op-circles" aria-label="Balls this over">${slots}</ol>` +
    `<hr class="op-divider"><div class="op-bottom"><h3 class="op-sub">Results this over</h3><ul class="op-lines" aria-live="polite"></ul></div>` +
    `<div class="ss-sr op-found-live" role="status" aria-live="polite" aria-atomic="true"></div><div class="op-foot"></div></section>`;
  document.body.appendChild(root);
  const slotEls = root.querySelectorAll('.op-slot');
  const lines = root.querySelector('.op-lines');
  const foot = root.querySelector('.op-foot');
  const foundLive = root.querySelector('.op-found-live');
  const timers = [];
  const beats = attachBeats(root.querySelector('.bt-slot'), { kit: batKit }); // P10 beats: pictures only, js/ui/beats.js
  let done = false, finished = false, landed = 0;

  function land(i, live) {
    if (i < landed) return; landed = i + 1;
    const b = list[i], k = kind(b.o), slot = slotEls[i];
    const c = slot.querySelector('.op-circle');
    c.textContent = ballGlyph(b.o); slot.classList.add('is-filled', 'k-' + k);
    slot.querySelector('.op-word').textContent = ballWord(b.o);
    slot.setAttribute('aria-label', 'Ball ' + (i + 1) + ': ' + outcomeLabel(b.o));
    const why = whyLine(b, b.batName, b.bowlName);
    const li = document.createElement('li');
    li.className = 'op-line k-' + k;
    li.innerHTML = `<b>Ball ${i + 1}: ${esc(outcomeLabel(b.o).replace(/^./, (x) => x.toUpperCase()))}.</b> ${esc(why)}`;
    lines.appendChild(li);
    if (live) beats.ball(b.o);
  }
  function finish() {
    if (finished) return; finished = true;
    const li = document.createElement('li');
    li.className = 'op-line op-total';
    const t = overTotals(list);
    // First over: the score is the same as this over, so say it once.
    li.textContent = t.runs === score.runs && t.wk === score.wk ? totalLine(list, score).split('. Score')[0] + '.' : totalLine(list, score);
    lines.appendChild(li);
    for (const t of summaryLines) { const x = document.createElement('li'); x.className = 'op-line'; x.textContent = t; lines.appendChild(x); }
    if (hasFound) { foot.classList.add('has-found'); foundLive.textContent = foundText(found); }
    foot.innerHTML = (hasFound ? foundHtml(found) + `<button type="button" class="c-btn c-btn--block op-book">${icoDeco('book', 24)}Open Book</button>` : '') +
      `<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block op-next">${esc(nextLabel)}</button>`;
    foot.querySelector('.op-next').addEventListener('click', exit);
    const bk = foot.querySelector('.op-book');
    if (bk) bk.addEventListener('click', () => { exit(); if (typeof onBook === 'function') onBook(); });
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exit(); } }
  document.addEventListener('keydown', onKey, true);
  function exit() { if (done) return; skip(); beats.stop(); done = true; document.removeEventListener('keydown', onKey, true); root.remove(); onDone && onDone(); }
  /** Land every remaining ball at once so no result is lost. */
  function skip() { timers.forEach(clearTimeout); for (let i = landed; i < list.length; i++) land(i); finish(); }
  root.querySelector('.op-close').addEventListener('click', exit);
  root.querySelector('.op-close').focus();
  // Reduced motion: no paced ball-by-ball reveal; every ball and the total are there at once (nothing changes on a timer)
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { skip(); return { close: exit }; }
  const t0 = performance.now();
  list.forEach((_, i) => timers.push(setTimeout(() => land(i, true), Math.max(0, t0 + (i + 1) * BALL_MS - performance.now()))));
  timers.push(setTimeout(finish, Math.max(0, t0 + (list.length + 1) * BALL_MS - performance.now() - 300)));
  return { close: exit };
}
