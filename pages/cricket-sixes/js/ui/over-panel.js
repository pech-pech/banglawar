// Ball-by-ball over panel. Modal; autoplays one ball per 400 ms; calls onDone when Next is pressed.
// balls: raw over balls ({n, o, ...}) optionally with batName, bowlName, bowlType for the why line.
import { whyLine, outcomeLabel } from './why.js';
import { cardHtml, gridHtml } from './book-sheet.js';
import { badgeCount, badgeText, badgeAria } from './book-badge.js';
import { icoDeco } from './dom.js';
import { attachBeats } from './beats.js';
import { roarChipHtml } from './matchday-view.js';
export { roarChipHtml };

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
 * found: cells found this over (selectors.foundVM). book: selectors.bookVM for the mini grid (optional).
 * The "New in your Book!" block (P6 2.4) and an Open Book button with the session badge; onBook(cell) runs after the panel closes.
 */
const MAX_CARDS = 2;
/** "New in your Book!" block: up to 2 cards, "and N more in the Book", then the mini grid of this over's phase with the new cells outlined. Pure. Takes one find or a list; book (bookVM) is optional. */
export function foundHtml(list, book) {
  const fs = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!fs.length) return '';
  const more = fs.length - MAX_CARDS;
  return '<div class="bk-found"><p class="bk-new">' + icoDeco('book', 24) + '<span class="bk-new__t">New in your Book!</span></p>' +
    fs.slice(0, MAX_CARDS).map((c) => cardHtml(c)).join('') +
    (more > 0 ? '<p class="bk-more">and ' + more + ' more in the Book</p>' : '') +
    miniHtml(book, fs[0].ph, fs.map((c) => c.i)) + '</div>';
}
/** Mini grid with its heading "Your Book, overs 1-3" (+ "n of 27") and the key line (found.html). Shared by the found panel and the notebook. Pure; '' without a book. */
export function miniHtml(book, ph, newCells) {
  if (!book) return '';
  const p = book.phases && book.phases[ph], ov = p ? (p.overs ? 'overs ' + p.overs : String(p.label || '').toLowerCase()) : '';
  return '<div class="bk-mgw"><p class="bk-mh"><span class="bk-mh__t">Your Book' + (ov ? ', ' + esc(ov) : '') + '</span>' +
    (book.total ? '<span class="bk-mh__n">' + Number(book.found) + ' of ' + Number(book.total) + '</span>' : '') + '</p>' +
    gridHtml(book, ph, -1, { mini: true, newCells }) + '<p class="bk-lg">Word = who wins. Pips = how big. Outlined = new.</p></div>';
}
/** One find in words (PLAN 3.6): "Openers v Spin, overs 1-3: Spin wins. Seen for 18 balls." Gift: "... Coach's notebook." Pure. */
export function findText(c) {
  return c.title + ', overs ' + c.overs + ': ' + c.band + '.' + (c.combo ? ' Combo: ' + c.combo + '.' : '') + (c.seen === false ? " Coach's notebook." : ' Seen for 18 balls.');
}
/** Plain-words text of the found block, for the polite live region (the region exists first; finish() fills it). Pure. */
export function foundText(list) {
  const fs = (Array.isArray(list) ? list : [list]).filter(Boolean);
  return fs.length ? 'New in your Book. ' + fs.map(findText).join(' ') : '';
}
/** Open Book button with the session badge (hidden at 0). Pure. */
export function bookBtnHtml(n) {
  const t = badgeText(n);
  return '<button type="button" class="c-btn c-btn--block op-book">' + icoDeco('book', 24) + '<span>Open Book</span>' +
    (t ? '<span class="op-badge" aria-hidden="true">' + t + '</span><span class="ss-sr"> ' + badgeAria(n) + '</span>' : '') + '</button>';
}
export function playOverPanel({ title, balls, score, summaryLines = [], nextLabel = 'Next over', batKit, found = [], book = null, onBook, onDone, roar = false }) {
  const list = (balls || []).slice(0, 6);
  const root = document.createElement('div');
  root.className = 'op-scrim';
  const hasFound = found.length > 0;
  const slots = Array.from({ length: 6 }, (_, i) => `<li class="op-slot${i >= list.length ? ' is-unused' : ''}" data-i="${i}"><span class="op-circle" aria-hidden="true"></span><span class="op-word" aria-hidden="true"></span></li>`).join('');
  root.innerHTML = `<section class="c-card op-card has-beats${hasFound ? ' has-found' : ''}" role="dialog" aria-modal="true" aria-labelledby="op-title">` +
    `<header class="op-head"><h2 id="op-title" class="op-title">${esc(title)}</h2>` +
    `<button type="button" class="c-icon-btn op-close" aria-label="Close and skip to the end of the over"><span class="c-ico c-ico--x"></span></button></header><div class="bt-slot"></div>${roarChipHtml(roar)}<ol class="op-circles" aria-label="Balls this over">${slots}</ol>` +
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
    const w = slot.querySelector('.op-word'), wt = ballWord(b.o), m = /^(\S+) (RUNS?)$/.exec(wt);
    if (m) { w.textContent = m[1]; w.appendChild(document.createElement('br')); w.appendChild(document.createTextNode(m[2])); } else w.textContent = wt;   // run words always read on two lines (1 / RUN, 2 / RUNS, NO / RUN), in every theme
    slot.setAttribute('aria-label', 'Ball ' + (i + 1) + ': ' + outcomeLabel(b.o));
    const why = whyLine(b, b.batName, b.bowlName);
    const li = document.createElement('li');
    li.className = 'op-line op-ball k-' + k;
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
    if (hasFound) { root.querySelector('.op-card').classList.add('found-shown'); foot.classList.add('has-found'); foundLive.textContent = foundText(found); }
    foot.innerHTML = (hasFound ? foundHtml(found, book) + bookBtnHtml(badgeCount() || found.length) : '') +
      `<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block op-next">${esc(nextLabel)}</button>`;
    foot.querySelector('.op-next').addEventListener('click', exit);
    const bk = foot.querySelector('.op-book');
    if (bk) bk.addEventListener('click', () => { exit(); if (typeof onBook === 'function') onBook(found[0].i); });
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
