// Chase view (innings 2, we bat). Layout B "scoreboard": need strip, batter table vs likely bowlers,
// Intent choice, one-line last over with a Why sheet. render(el, vm, dispatch). vm = chaseVM(s). Views read only the VM.
import { whyLine, outcomeLabel } from './why.js';
import { openSheet } from './sheet.js';
import { openGlossary } from './glossary-sheet.js';
import { POT, gradeAria, newNotes, noteFor } from './grade-notes.js';

const OUT_WORD = { W: 'Out', 6: 'Six', 4: 'Four', 2: '2 runs', 1: '1 run', 0: 'No run' };
const outWord = (o) => OUT_WORD[String(o)] || outcomeLabel(o);
// Plain words for the why line: no "pace", and phase ranges never break at the hyphen.
const plain = (t) => String(t).replace(/medium pace/g, 'medium bowling').replace(/\bpace\b/g, 'fast bowling')
  .replace(/(\d)-(\d)/g, '$1‑$2');

const tipIcon = () => { // its own marker (info icon plus the word), never the best-overs star
  const S = /** @type {any} */ (window).SPR;
  if (!S || !S.iconNames || S.iconNames.indexOf('info') < 0) return '';
  return S.iconImg('info', 16).outerHTML.replace('class="icon"', 'class="icon" aria-hidden="true"').replace(/ alt="[^"]*"/, ' alt=""');
};
let intent = 'R'; // UI state only, never saved. Reset to Steady (R) at the start of every over (12b: neutral default, never the last call)
let intentKey = '';

const INTENTS = [
  { k: 'D', n: 'Defend', s: 'safe', d: 'Defend: play safe. Fewer wickets, fewer big hits.' },
  { k: 'R', n: 'Steady', s: 'small safe runs', d: 'Steady: small safe runs, keep the score moving.' },
  { k: 'A', n: 'Attack', s: 'big hits, risky', d: 'Attack: go for big hits. More runs, more risk.' },
];
const INTENT_NAME = { D: 'Defend', R: 'Steady', A: 'Attack' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const ROLE_WORD = { Opener: 'Opener', Middle: 'Middle order', Lower: 'Lower order' };
const PHASE_WORDS = ['Early overs (1-3)', 'Middle overs (4-7)', 'Last overs (8-10)'];
// Map the matchup label to plain words, a shape and a colour class. Colour is never the only signal.
const RATING = {
  Great: { cls: 'r-good', s: '▲', w: 'Good' },
  Even: { cls: 'r-ok', s: '●', w: 'OK' },
  Bad: { cls: 'r-poor', s: '▼', w: 'Poor' },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ic(name, size = 24) {
  if (!name || !window.SPR || window.SPR.iconNames.indexOf(name) < 0) return '';
  const im = window.SPR.iconImg(name, size);
  im.alt = '';
  im.setAttribute('aria-hidden', 'true');
  im.className = 'ico';
  return im.outerHTML;
}

/** Likely next AI bowlers: the longest preview list at the crease, first two. */
function likelyBowlers(vm) {
  let best = [];
  (vm.crease || []).forEach((b) => { if ((b.previews || []).length > best.length) best = b.previews; });
  const cols = best.slice(0, 2).map((p) => ({ name: p.name, bowl: p.bowl }));
  while (cols.length < 2) cols.push({ name: null, bowl: null }); // no preview: a "?" column
  return cols;
}

function gradeBox(g) { // letter only; the column head says "Potential grade"
  const hidden = !g || g === '?';
  return '<span class="gr m0-gr-' + (hidden ? 'q' : esc(g)) + '" aria-label="' + esc(gradeAria(g)) + '"><b>' + (hidden ? '?' : esc(g)) + '</b></span>';
}

function ratingBox(b, bw) {
  const p = bw.name ? (b.previews || []).find((x) => x.name === bw.name) : null;
  if (!p) {
    return '<div class="rbox r-unk" aria-label="' + esc(b.name + ' vs ' + (bw.name || 'another bowler') + ': not known yet') + '">' +
      '<span class="s" aria-hidden="true">?</span><span class="w">Not known yet</span></div>';
  }
  const r = RATING[p.label] || RATING.Even;
  return '<div class="rbox ' + r.cls + '" aria-label="' + esc(b.name + ' vs ' + bw.name + ': ' + r.w) + '">' +
    '<span class="s" aria-hidden="true">' + r.s + '</span><span class="w">' + r.w + '</span></div>';
}

function batterRow(b, cols, st) {
  const best = (b.previews || []).some((p) => p.inPhase);
  const role = ROLE_WORD[b.bat] || b.bat || '';
  const cells = cols.map((bw) => ratingBox(b, bw)).join('');
  return '<div class="sb-row' + (b.onStrike ? ' is-strike' : '') + '" role="row">' +
    '<div class="pbox">' + ic(ROLE_ICON[b.bat], 24) +
    '<span class="bv-tx"><span class="nm name">' + esc(b.name) + '</span>' +
    '<span class="sub">' + (best ? '<span class="best" aria-label="In best overs now">★</span> ' : '') + esc(role) + '</span>' +
    '<span class="sub ch-ab">Ability ' + esc(b.ability) + '</span>' +
    '<span class="sub" aria-label="' + esc(b.r + ' runs from ' + b.b + ' balls') + '">' + esc(b.r) + (b.r === 1 ? ' run' : ' runs') + ' (' + esc(b.b) + ')</span>' +
    (b.onStrike ? '<span class="sub strike">On strike</span>' : '') + '</span>' +
    gradeBox(b.grade) + noteFor(b.grade, st, esc) + '</div>' + cells + '</div>';
}

// Batter name for a BallRec index.
function batterName(vm, i) {
  const names = vm.batNames || vm.names;
  if (names && names[i] != null) return names[i];
  const c = (vm.crease || []).find((x) => x.i === i);
  return c ? c.name : 'The batter';
}

function ballChip(rec) {
  const cls = rec.o === 'W' ? 'ball w' : rec.o === 6 ? 'ball six' : rec.o === 4 ? 'ball four' : 'ball';
  const txt = rec.o === 'W' ? 'W' : rec.o;
  return '<span class="' + cls + '" aria-label="' + esc(outWord(rec.o)) + '">' + esc(txt) + '</span>';
}

function lastLine(vm) {
  const last = vm.last;
  if (!last || !last.balls || !last.balls.length) {
    return '<div class="last-b"><span class="lt">Last over: none yet. Your first over is next.</span></div>';
  }
  const runs = last.balls.reduce((t, r) => t + (typeof r.o === 'number' ? r.o : 0), 0);
  const wk = last.balls.filter((r) => r.o === 'W').length;
  const sum = runs + (runs === 1 ? ' run' : ' runs') + (wk ? ', ' + wk + ' out' : '');
  return '<div class="last-b"><span class="lt"><b>Last over ' + esc(last.over) + '</b>: ' + esc(sum) +
    '<span class="balls">' + last.balls.slice(0, 6).map(ballChip).join('') + '</span></span>' +
    '<button type="button" class="c-btn why-b" id="why">Why?</button></div>';
}

function whyHtml(vm) {
  const last = vm.last, ai = vm.aiBowler || {};
  const bname = ai.name || 'the bowler';
  return '<p style="margin:0">Over ' + esc(last.over) + ' by <span class="name">' + esc(bname) + '</span>' +
    (ai.bowl ? ' (' + esc(ai.bowl) + ')' : '') + '.</p>' +
    last.balls.map((rec) => {
      const r = ai.bowl ? Object.assign({}, rec, { bowlType: ai.bowl }) : rec;
      return '<div class="why-row">' + ballChip(rec) + '<span><b>' + esc(outWord(rec.o)) + '.</b> ' +
        esc(plain(whyLine(r, batterName(vm, rec.batter), bname))) + '</span></div>';
    }).join('');
}

const ctaText = (over) => 'Bat over ' + over + ': ' + INTENTS.find((o) => o.k === intent).n;

export function render(el, vm, dispatch) {
  const key = vm.target + '|' + vm.over;
  if (key !== intentKey) { intentKey = key; intent = 'R'; }
  const sc = vm.score || {};
  const need = vm.need > 0
    ? 'Need ' + vm.need + ' from ' + vm.ballsLeft + ' ball' + (vm.ballsLeft === 1 ? '' : 's')
    : 'Target reached';
  const phase = String(PHASE_WORDS[vm.phase] || vm.phaseName || '').replace(/ /g, '\u00a0'); // N9: the phase never splits mid-phrase
  const cols = likelyBowlers(vm);
  const notes = newNotes();
  const known = cols.filter((c) => c.name);
  const head = '<div class="sb-head" role="row"><div class="ch-hb0">Batter<small class="bv-hpg">' + POT + '</small></div>' +
    cols.map((bw) => bw.name ? '<div>vs ' + esc(bw.name) + '<small>(' + esc(bw.bowl) + ')</small></div>'
      : '<div>vs ?<small>(not known yet)</small></div>').join('') + '</div>';
  const crease = vm.crease || [];
  const ex = crease.find((b) => b.onStrike) || crease[0];
  const hidden = crease.some((b) => !b.grade || b.grade === '?');
  const ih = vm.intentHint || null;
  const seg = INTENTS.map((o) => {
    const sel = o.k === intent;
    return '<button type="button" class="opt' + (sel ? ' is-selected' : '') + '" data-intent="' + o.k +
      '" role="radio" aria-checked="' + sel + '"><span class="two">' + o.n + '<small>' + o.s + '</small></span></button>';
  }).join('');

  el.innerHTML =
    '<div class="chase-b">' +
    '<header class="strip c-dark" aria-label="Score">' +
    '<span class="score" aria-label="Score ' + esc(sc.runs) + ' runs for ' + esc(sc.wk) + ' out">' + esc(sc.runs) + '/' + esc(sc.wk) + '</span>' +
    '<span class="mid"><b>' + esc(need) + '</b><span>Target ' + esc(vm.target) + ' · Over ' + esc(vm.over) + ' of 10 · ' + esc(phase) + '</span></span>' +
    '<button type="button" class="q" aria-label="Cricket words explained">?</button></header>' +
    '<section class="colL">' +
    '<div class="sb chase" role="table" aria-label="Your batters against their likely bowlers">' + head +
    crease.map((b) => batterRow(b, cols, notes)).join('') + '</div>' +
    '<div class="boxnote">' + (ex ? esc(ex.r + ' (' + ex.b + ') = ' + ex.r + (ex.r === 1 ? ' run' : ' runs') + ' from ' + ex.b + (ex.b === 1 ? ' ball.' : ' balls.')) : '') +
    (crease.some((b) => (b.previews || []).some((p) => p.inPhase)) ? ' <span aria-hidden="true">★</span> = in best overs now.' : '') + '</div>' +
    '</section>' +
    '<section class="colR">' +
    (ih ? '' : '<h2 class="title ask">How should your batters play?</h2>') + // with a chip, the chip heads the choice (saves a row on the small screen)
    (ih ? '<button type="button" class="bv-chip' + (intent === ih.pick ? ' is-on' : '') + '" id="chip" data-intenthint data-chip="' + ih.pick + '" aria-pressed="' + (intent === ih.pick) + '">' + tipIcon() +
      '<span class="bv-chip-t"><b>Tip: ' + (intent === ih.pick ? INTENT_NAME[ih.pick] + ' is on' : 'try ' + INTENT_NAME[ih.pick]) + '</b><span>' + esc(ih.why) + '</span></span></button>' : '') +
    '<div class="seg intent" role="radiogroup" aria-label="Batting style">' + seg + '</div>' +
    '<p class="hint" id="intent-desc">' + esc(INTENTS.find((o) => o.k === intent).d) + '</p>' +
    lastLine(vm) +
    '</section>' +
    '<div class="ctabar"><button type="button" id="play" class="c-btn c-btn--primary c-btn--cta">' + esc(ctaText(vm.over)) + '</button></div>' +
    '</div>';

  const segEl = el.querySelector('.seg.intent');
  const pick = (k) => {
    intent = k;
    segEl.querySelectorAll('[data-intent]').forEach((x) => {
      const on = x.getAttribute('data-intent') === intent;
      x.classList.toggle('is-selected', on);
      x.setAttribute('aria-checked', String(on));
    });
    const chipEl = el.querySelector('#chip');
    if (chipEl) { const on = intent === chipEl.getAttribute('data-chip'); chipEl.classList.toggle('is-on', on); chipEl.setAttribute('aria-pressed', String(on)); chipEl.querySelector('b').textContent = 'Tip: ' + (on ? INTENT_NAME[intent] + ' is on' : 'try ' + INTENT_NAME[chipEl.getAttribute('data-chip')]); }
    el.querySelector('#intent-desc').textContent = INTENTS.find((o) => o.k === intent).d;
    el.querySelector('#play').textContent = ctaText(vm.over);
  };
  segEl.addEventListener('click', (e) => { const b = e.target.closest('[data-intent]'); if (b) pick(b.getAttribute('data-intent')); });
  const chipEl = el.querySelector('#chip');
  if (chipEl) chipEl.addEventListener('click', () => pick(chipEl.getAttribute('data-chip')));
  el.querySelector('.q').addEventListener('click', () => openGlossary());
  const why = el.querySelector('#why');
  if (why) why.addEventListener('click', () => openSheet('Why? Last over', whyHtml(vm)));
  el.querySelector('#play').addEventListener('click', () => dispatch('BowlOver', { intent }));
}
