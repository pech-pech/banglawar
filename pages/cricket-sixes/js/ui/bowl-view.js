// @ts-check
// Innings 1 Call screen: M bowls. Layout "B, scoreboard". render(el, vm, dispatch). Reads only bowlVM; DOM via innerHTML with escaped text.
// Styles: css/scoreboard.css (shared) + css/bowl.css (bowl-only overrides, scoped to .bv-*).
import { whyLine, outcomeLabel } from './why.js';
import { openSheet } from './sheet.js';
import { openGlossary } from './glossary-sheet.js';
import { stripHtml } from './first-strip.js';
import { POT, gradeAria, newNotes, noteFor } from './grade-notes.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, size, cls) => {
  const S = /** @type {any} */ (window).SPR;
  if (!S || !S.iconNames || S.iconNames.indexOf(name) < 0) return `<span class="bv-ph${cls ? ' ' + cls : ''}" aria-hidden="true"></span>`;
  let h = S.iconImg(name, size || 24).outerHTML.replace('class="icon"', `class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"`).replace(/ alt="[^"]*"/, ' alt=""');
  if (h.indexOf(' alt=') < 0) h = h.replace('<img', '<img alt=""');
  return h;
};
const TYPE = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const ROLE = { Opener: 'Opener', Middle: 'Middle order', Lower: 'Lower order' };
const NBH = '\u2011'; // non-breaking hyphen, so "(1-3)" never splits
const nb = (t) => String(t).replace(/(\d)-(\d)/g, '$1' + NBH + '$2');
const PHASE = ['Early overs (1-3)', 'Middle overs (4-7)', 'Last overs (8-10)'].map(nb);
const SAY = (o) => (String(o) === '0' ? 'No run' : outcomeLabel(o));
const UNK = 'Not known yet';
const MORE = 'Drill this player to see more matchups';
const BADGE = { W: 'W', 6: '6', 4: '4', 2: '2', 1: '1', 0: '0' };
// vm preview label -> rating box. Shape + word, never colour alone.
const RATE = { Great: ['r-good', '▲', 'Good'], Even: ['r-ok', '●', 'OK'], Bad: ['r-poor', '▼', 'Poor'] };
const FIELD = { A: 'Attack', P: 'Protect' };
const REASON = { 'bowled last': "Bowled last over. Can't bowl now", '2 overs': 'Used both overs', 'must save overs': "Others must bowl first. Can't bowl now" };

function head(vm) { // 'Potential grade' is the column head for the letter boxes (no per-row label)
  const c = (vm.crease || []).slice(0, 2);
  return `<div class="sb-head bv-head" role="presentation"><div class="bv-hb0">Bowler<small class="bv-hpg">${POT}</small></div>` +
    c.map((b) => `<div class="bv-bx${b.onStrike ? ' is-strike' : ''}"><span class="name bv-vs${String(b.name).length > 6 ? ' bv-long' : ''}">${esc(b.name)}</span>` +
      `<small>${esc(ROLE[b.bat] || b.bat)}</small>` +
      `<span class="bv-runs">${esc(b.r)} (${esc(b.b)})</span>` +
      (b.onStrike ? '<span class="strike bv-st">on strike</span>' : '') + `</div>`).join('') + `</div>`;
}

function rbox(b, bat) {
  const p = (b.previews || []).find((x) => x.name === bat.name);
  if (!p) return `<div class="rbox r-unk bv-unk"><span class="s" aria-hidden="true">?</span><span class="w">${UNK}</span></div>`;
  const r = RATE[p.label] || RATE.Even;
  return `<div class="rbox ${r[0]}"><span class="s" aria-hidden="true">${r[1]}</span><span class="w">${r[2]}</span></div>`;
}

function ariaRates(b, crease) {
  return crease.map((bat) => {
    const p = (b.previews || []).find((x) => x.name === bat.name);
    return `against ${bat.name}: ${p ? (RATE[p.label] || RATE.Even)[2] : UNK.toLowerCase() + ', a higher potential grade shows more'}`;
  }).join(', ');
}

function row(b, vm, st) {
  const crease = (vm.crease || []).slice(0, 2);
  const sel = vm.call && vm.call.bowler === b.i, ok = b.eligible;
  const g = b.grade || '?';
  const best = (b.previews || []).some((p) => p.inPhase);
  const star = best ? '<span class="best bv-best" aria-hidden="true">★</span>' : '';
  const pbox = `<div class="pbox"><span class="bv-icw">${sel && ok ? '<span class="bv-tick" aria-hidden="true"></span>' : ''}${ic(TYPE[b.bowl] || 'typeMedium', 24, 'ico')}</span><span class="bv-tx"><span class="nm name">${esc(b.name)}</span>` +
    `<span class="sub">${star}${esc(b.bowl)}</span><span class="sub bv-ab">Ability ${esc(b.ability)}</span><span class="sub bv-ov">${esc(b.overs)} of 2 overs</span></span>` +
    `<span class="gr${g === '?' ? ' bv-gq' : ''}"><b>${esc(g)}</b></span>${noteFor(g, st, esc)}</div>`;
  const label = `${b.name}, ${b.bowl} bowler, ability ${b.ability}, ${b.overs} of 2 overs used, ${gradeAria(g)}` +
    (best ? ', in his best overs now' : '');
  if (!ok) {
    const why = REASON[b.reason] || "Can't bowl now";
    return `<div class="sb-row is-off" role="radio" aria-disabled="true" aria-checked="false" aria-label="${esc(label)}. ${esc(why)}">${pbox}<div class="offnote">${esc(why)}</div></div>`;
  }
  return `<button type="button" class="sb-row${sel ? ' is-selected' : ''}" role="radio" data-bowler="${b.i}" aria-checked="${sel ? 'true' : 'false'}"` +
    ` aria-label="${esc(label)}. ${esc(ariaRates(b, crease))}">${pbox}${crease.map((bat) => rbox(b, bat)).join('')}</button>`;
}

function bowlerName(vm, i) {
  const bw = typeof i === 'number' ? (vm.bowlers || []).find((x) => x.i === i) : null;
  return (bw && bw.name) || (vm.bowlNames && vm.bowlNames[i]) || 'The bowler';
}

function lastLine(vm) {
  const L = vm.last;
  if (!L || !(L.balls || []).length) return `<div class="last bv-last bv-last--none"><span class="bv-last-txt">First over. No balls bowled yet.</span></div>`;
  const balls = L.balls.slice(0, 6);
  const runs = balls.reduce((a, r) => a + (r.o === 'W' ? 0 : Number(r.o) || 0), 0);
  const wk = balls.filter((r) => r.o === 'W').length;
  const chips = balls.map((r) => {
    const k = String(r.o);
    return `<span class="ball${k === 'W' ? ' w' : k === '6' ? ' six' : k === '4' ? ' four' : ''}" role="img" aria-label="${esc(SAY(r.o))}">${esc(BADGE[k] != null ? BADGE[k] : k)}</span>`;
  }).join('');
  return `<div class="last bv-last"><span class="bv-last-txt"><span class="bv-last-k">Last over:</span> ${chips}` +
    `<span class="bv-sum">= ${runs} run${runs === 1 ? '' : 's'}, ${wk} wicket${wk === 1 ? '' : 's'}</span></span>` +
    `<button type="button" class="c-btn bv-why" data-why aria-label="Why did the last over go that way?">Why?</button></div>`;
}

function whyHtml(vm) {
  const L = vm.last; if (!L) return '';
  const bn = bowlerName(vm, L.bowler);
  const head = `<p><b class="name">${esc(bn)}</b> bowled over ${esc(L.over)} with the ${L.field === 'P' ? 'Protect' : 'Attack'} field.</p>`;
  return head + (L.balls || []).slice(0, 6).map((r) => {
    const bat = (vm.batNames && vm.batNames[r.batter]) || 'The batter';
    const k = String(r.o);
    return `<div class="bv-why-row"><span class="ball${k === 'W' ? ' w' : k === '6' ? ' six' : k === '4' ? ' four' : ''}" role="img" aria-hidden="true">${esc(BADGE[k] != null ? BADGE[k] : k)}</span>` +
      `<span>Ball ${esc(String(r.n).split('.').pop())}: <b>${esc(SAY(r.o))}</b>. ${esc(nb(whyLine(r, bat, bn)))}</span></div>`;
  }).join('');
}

/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  const sc = vm.score || {}, fld = vm.call && vm.call.field;
  const E = /** @type {any} */ (el);
  E.__bvDispatch = dispatch; E.__bvVM = vm;
  const selB = (vm.bowlers || []).find((b) => vm.call && b.i === vm.call.bowler && b.eligible);
  const hint = vm.fieldHint || null;
  const seg = (k, icon) => `<button type="button" class="opt${fld === k ? ' is-selected' : ''}" role="radio" data-field="${k}" aria-checked="${fld === k ? 'true' : 'false'}">${ic(icon, 24)}${FIELD[k]}</button>`;
  // 12b: a tappable suggestion chip (info icon + the word "Tip"), never pre-applied. Shape and words carry the state, not colour.
  const on = !!hint && fld === hint.pick;
  // D1: Protect is already the default, so a Protect tip while Protect is set is a plain line, not a tap target.
  const plain = !!hint && hint.pick === 'P' && fld === 'P';
  const chip = plain ? `<p class="bv-keep" data-fieldhint-plain>${esc(hint.why)}</p>` : hint ? `<button type="button" class="bv-chip${on ? ' is-on' : ''}" data-chip="${hint.pick}" data-fieldhint aria-pressed="${on}">` +
    `${ic('info', 24, 'bv-chip-i')}<span class="bv-chip-t"><b>Tip: ${on ? FIELD[hint.pick] + ' field is on' : 'try ' + FIELD[hint.pick] + ' field'}</b><span>${esc(hint.why)}</span></span></button>` : '';
  const notes = newNotes();
  const anyHidden = (vm.bowlers || []).some((b) => b.grade === '?' && b.eligible);
  const anyBest = (vm.bowlers || []).some((b) => (b.previews || []).some((p) => p.inPhase));
  el.innerHTML =
    `<header class="strip c-dark bv-strip" role="status">` +
    `<span class="score" aria-label="${esc(sc.runs)} runs for ${esc(sc.wk)} wickets">${esc(sc.runs)}/${esc(sc.wk)}</span>` +
    `<span class="mid"><b>Over ${esc(vm.over)} of 10</b><span>${esc(PHASE[vm.phase] || vm.phaseName)}</span></span>` +
    `<button type="button" class="q" data-gloss aria-label="Cricket words explained">?</button></header>` +
    `${vm.firstStrip ? stripHtml(esc) : ''}<section class="colL bv-colL">` +
    `<div class="sb bv-sb" role="radiogroup" aria-label="Bowlers">${head(vm)}${(vm.bowlers || []).map((b) => row(b, vm, notes)).join('')}</div>${anyHidden ? `<p class="bv-more" data-more>${MORE}</p>` : ''}</section>` +
    `<section class="colR bv-colR"><div class="seg bv-seg" role="radiogroup" aria-label="Field">${seg('A', 'fieldAttack')}${seg('P', 'fieldProtect')}</div>` +
    chip + lastLine(vm) +
    `<div class="hints bv-hints"><p><b>Attack</b>: more wickets, more runs. <b>Protect</b>: fewer runs.</p>` +
    `<p><b>${POT}</b>: D low to S best.${anyBest ? ' <b class="bv-starkey" aria-hidden="true">★</b> = best overs now.' : ''}</p></div></section>` +
    `<div class="ctabar bv-cta"><button type="button" class="c-btn c-btn--primary c-btn--cta" data-bowl${vm.canBowl === false ? ' disabled' : ''}>` +
    `<span>Bowl over ${esc(vm.over)}${selB ? ':&nbsp;<span class="name">' + esc(selB.name) + '</span>' : ''}</span></button></div>`;
  // D3: bring the pre-filled bowler row into view inside the list only (never the page)
  const selRow = el.querySelector('.bv-sb .sb-row.is-selected'), lst = el.querySelector('.bv-sb');
  if (selRow && lst && lst.scrollHeight > lst.clientHeight) {
    const a = selRow.getBoundingClientRect(), b = lst.getBoundingClientRect();
    if (a.bottom > b.bottom) lst.scrollTop += a.bottom - b.bottom + 4; else if (a.top < b.top) lst.scrollTop -= b.top - a.top + 4;
  }
  // the sticky header must never cut a tile: scroll-padding + snap for the finger, and one nudge here so a tile is whole or fully hidden
  const hdr = lst && lst.querySelector('.bv-head');
  const clearHeader = () => {
    if (!hdr || !hdr.isConnected) return;
    lst.style.setProperty('--bv-hh', (hdr.offsetHeight + 4) + 'px');
    if (lst.scrollTop <= 0) return;
    const hb = hdr.getBoundingClientRect().bottom;
    const cut = [...lst.querySelectorAll('.sb-row')].find((r) => { const q = r.getBoundingClientRect(); return q.top < hb - 0.5 && q.bottom > hb + 0.5; });
    if (cut) { // show it whole when the pre-filled row stays in view, else tuck it fully under the header
      const q = cut.getBoundingClientRect(), up = hb - q.top + 4, lb = lst.getBoundingClientRect().bottom;
      const sel = lst.querySelector('.sb-row.is-selected'), sb = sel && sel.getBoundingClientRect();
      if (!sb || sb.bottom + up <= lb) lst.scrollTop -= up; else {
        const dn = q.bottom - hb + 1, room = lst.scrollHeight - lst.clientHeight - lst.scrollTop;
        if (dn > room) lst.style.paddingBottom = (4 + Math.ceil(dn - room)) + 'px'; // end-of-list room so the last tile can still clear the header
        lst.scrollTop += dn;
      }
    }
  };
  clearHeader(); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(clearHeader);
  // QA r2 D8: dock the first-match card just above the Field bar, so the batters and the bowler named on the CTA stay visible
  const fs = el.querySelector('.fs-strip'), segEl = el.querySelector('.bv-seg');
  if (fs && segEl) { const top = segEl.getBoundingClientRect().top; if (top > 0) fs.style.bottom = Math.max(0, Math.round(window.innerHeight - top + 6)) + 'px'; }
  if (!E.__bvBound) {
    E.__bvBound = true;
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest('button'); if (!t || t.disabled || !el.contains(t)) return;
      const d = E.__bvDispatch, v = E.__bvVM; if (!d || !v || !t.closest('.bv-strip, .fs-strip, .bv-colL, .bv-colR, .bv-cta')) return;
      if (t.hasAttribute('data-bowler')) d('MakeCall', { bowler: Number(t.getAttribute('data-bowler')), field: v.call && v.call.field });
      else if (t.hasAttribute('data-chip')) d('MakeCall', { bowler: v.call && v.call.bowler, field: t.getAttribute('data-chip') });
      else if (t.hasAttribute('data-field')) d('MakeCall', { bowler: v.call && v.call.bowler, field: t.getAttribute('data-field') });
      else if (t.hasAttribute('data-bowl')) d('BowlOver', {});
      else if (t.hasAttribute('data-why')) openSheet('Why did the last over go that way?', whyHtml(v));
      else if (t.hasAttribute('data-gloss')) openGlossary();
      else if (t.hasAttribute('data-strip-skip')) d('SeeFirstStrip', {});
    });
  }
}
