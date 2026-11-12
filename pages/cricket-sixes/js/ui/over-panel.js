// Ball-by-ball over panel. Modal; autoplays one ball per 800 ms; calls onDone when Next is pressed.
// balls: raw over balls ({n, o, ...}) optionally with batName, bowlName, bowlType for the why line.
import { whyLine, outcomeLabel } from './why.js';

export const BALL_MS = 800;
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
 */
export function playOverPanel({ title, balls, score, summaryLines = [], nextLabel = 'Next over', onDone }) {
  const list = (balls || []).slice(0, 6);
  const root = document.createElement('div');
  root.className = 'op-scrim';
  const slots = Array.from({ length: 6 }, (_, i) => `<li class="op-slot${i >= list.length ? ' is-unused' : ''}" data-i="${i}"><span class="op-circle" aria-hidden="true"></span><span class="op-word" aria-hidden="true"></span></li>`).join('');
  root.innerHTML = `<section class="c-card op-card" role="dialog" aria-modal="true" aria-labelledby="op-title">` +
    `<header class="op-head"><h2 id="op-title" class="op-title">${esc(title)}</h2>` +
    `<button type="button" class="c-icon-btn op-close" aria-label="Close and skip to the end of the over"><span class="c-ico c-ico--x"></span></button></header><ol class="op-circles" aria-label="Balls this over">${slots}</ol>` +
    `<hr class="op-divider"><div class="op-bottom"><h3 class="op-sub">Results this over</h3><ul class="op-lines" aria-live="polite"></ul></div>` +
    `<div class="op-foot"></div></section>`;
  document.body.appendChild(root);
  const slotEls = root.querySelectorAll('.op-slot');
  const lines = root.querySelector('.op-lines');
  const foot = root.querySelector('.op-foot');
  const timers = [];
  let done = false, finished = false, landed = 0;

  function land(i) {
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
  }
  function finish() {
    if (finished) return; finished = true;
    const li = document.createElement('li');
    li.className = 'op-line op-total';
    li.textContent = totalLine(list, score);
    lines.appendChild(li);
    for (const t of summaryLines) { const x = document.createElement('li'); x.className = 'op-line'; x.textContent = t; lines.appendChild(x); }
    foot.innerHTML = `<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block op-next">${esc(nextLabel)}</button>`;
    const btn = foot.querySelector('button');
    btn.addEventListener('click', exit);
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); exit(); } }
  document.addEventListener('keydown', onKey, true);
  function exit() { if (done) return; skip(); done = true; document.removeEventListener('keydown', onKey, true); root.remove(); onDone && onDone(); }
  /** Land every remaining ball at once so no result is lost. */
  function skip() { timers.forEach(clearTimeout); for (let i = landed; i < list.length; i++) land(i); finish(); }
  root.querySelector('.op-close').addEventListener('click', exit);
  root.querySelector('.op-close').focus();
  const t0 = performance.now();
  list.forEach((_, i) => timers.push(setTimeout(() => land(i), Math.max(0, t0 + (i + 1) * BALL_MS - performance.now()))));
  timers.push(setTimeout(finish, Math.max(0, t0 + (list.length + 1) * BALL_MS - performance.now() - 300)));
  return { close: exit };
}
