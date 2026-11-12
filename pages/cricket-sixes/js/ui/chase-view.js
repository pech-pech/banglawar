// Chase view (innings 2, we bat): Intent screen plus last-over result.
// render(el, vm, dispatch). vm = chaseVM(s). Views read only the VM.
import { whyLine, outcomeLabel } from './why.js';

let intent = 'R'; // UI state only, never saved

const INTENTS = [
  { k: 'D', n: 'Defend', ic: 'fieldProtect', d: 'Safer: fewer boundaries, more singles.' },
  { k: 'R', n: 'Rotate', ic: 'runs', d: 'Normal odds.' },
  { k: 'A', n: 'Attack', ic: 'fieldAttack', d: 'Risky: more boundaries, more wickets.' },
];
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const LABEL_CLASS = { Great: 'chip-great', Even: 'chip-even', Bad: 'chip-bad' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ic(name, size = 24) {
  if (!name || !window.SPR || window.SPR.iconNames.indexOf(name) < 0) return '';
  const im = window.SPR.iconImg(name, size);
  im.alt = '';
  im.setAttribute('aria-hidden', 'true');
  return im.outerHTML;
}

function gradeChip(g) {
  const shown = g && g !== '?' ? g : '?';
  const label = shown === '?' ? 'Potential hidden' : 'Potential ' + shown;
  return '<span class="chip chip-grade" aria-label="' + label + '">' + esc(shown) + '</span>';
}

function previewChip(p) {
  const star = p.inPhase ? '<span aria-hidden="true">★</span>' : '';
  const aria = p.name + ', ' + (p.bowl || '') + ', ' + p.label + (p.inPhase ? ', in phase' : '');
  return '<span class="chip ' + (LABEL_CLASS[p.label] || 'chip-even') + '" aria-label="' + esc(aria) + '">' +
    ic(TYPE_ICON[p.bowl], 24) + '<span class="name">' + esc(p.name) + '</span> ' + esc(p.label) + star + '</span>';
}

function batterCard(b) {
  const role = ROLE_ICON[b.bat] ? b.bat : '';
  const strike = b.onStrike ? '<span class="chip" aria-label="On strike">On strike</span>' : '';
  const prev = (b.previews || []).map(previewChip).join('');
  return '<div class="card batter' + (b.onStrike ? ' is-strike' : '') + '" style="min-height:56px">' +
    '<div class="row" style="flex-wrap:wrap;gap:6px;align-items:center">' +
    ic(ROLE_ICON[role], 24) +
    '<b class="name">' + esc(b.name) + '</b>' + gradeChip(b.grade) + strike +
    '<span class="muted" style="margin-left:auto">' + esc(b.r) + ' (' + esc(b.b) + ')</span></div>' +
    (prev ? '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">' + prev + '</div>' : '') +
    '</div>';
}

// Batter name for a BallRec index. VM gap: no roster by index; fall back to crease names.
function batterName(vm, i) {
  const names = vm.batNames || vm.names;
  if (names && names[i] != null) return names[i];
  const c = (vm.crease || []).find((x) => x.i === i);
  return c ? c.name : 'The batter';
}

function ballBadge(rec) {
  const lab = outcomeLabel(rec.o);
  const cls = rec.o === 'W' ? 'chip chip-bad' : (rec.o === 6 || rec.o === 4) ? 'chip chip-great' : 'chip';
  return '<span class="' + cls + '" aria-label="' + esc(lab) + '">' + (rec.o === 'W' ? ic('wicket', 24) : '') +
    '<b>' + esc(rec.o === 'W' ? 'W' : rec.o) + '</b></span>';
}

function lastBlock(vm) {
  const last = vm.last;
  if (!last || !last.balls || !last.balls.length) return '';
  const ai = vm.aiBowler || {};
  const bname = ai.name || 'the bowler';
  const rows = last.balls.slice(0, 6).map((rec) =>
    '<div class="ball-row" style="min-height:56px;display:flex;align-items:center;gap:8px">' +
    '<span class="muted">' + esc(rec.n) + '</span>' + ballBadge(rec) +
    '<span class="why">' + esc(whyLine(rec, batterName(vm, rec.batter), bname)) + '</span></div>').join('');
  return '<section class="card" aria-label="Last over">' +
    '<div class="strip">Over ' + esc(last.over) + ' by <span class="name">' + esc(bname) + '</span>' +
    (ai.bowl ? ' (' + esc(ai.bowl) + ') ' + ic(TYPE_ICON[ai.bowl], 24) : '') + '</div>' + rows + '</section>';
}

export function render(el, vm, dispatch) {
  const need = vm.need > 0
    ? 'Need ' + vm.need + ' off ' + vm.ballsLeft
    : 'Target reached';
  const seg = INTENTS.map((o) =>
    '<button type="button" class="seg-opt" data-intent="' + o.k + '" aria-pressed="' + (o.k === intent) +
    '" aria-label="' + o.n + ': ' + o.d + '" style="min-height:56px;flex:1">' + ic(o.ic, 24) + ' ' + o.n + '</button>').join('');
  const desc = INTENTS.find((o) => o.k === intent).d;
  const sc = vm.score || {};

  el.innerHTML =
    '<div class="screen chase">' +
    '<header class="strip" aria-label="Score">' +
    '<span>Target ' + esc(vm.target) + '</span><span>' + esc(sc.runs) + '/' + esc(sc.wk) + '</span>' +
    '<span>Ov ' + esc(sc.overs) + '</span><span>' + esc(vm.phaseName) + '</span></header>' +
    '<h1 class="need" style="margin:8px 0;font-size:24px">' + esc(need) + '</h1>' +
    '<div class="two-col">' +
    '<div class="col"><section aria-label="At the crease"><div class="strip">At the crease</div>' +
    (vm.crease || []).map(batterCard).join('') + '</section>' +
    '<section aria-label="Intent"><div class="strip">Over ' + esc(vm.over) + ': pick an Intent</div>' +
    '<div class="seg" role="group" aria-label="Batting Intent" style="display:flex;gap:6px">' + seg + '</div>' +
    '<p class="muted" id="intent-desc">' + esc(desc) + '</p></section></div>' +
    '<div class="col">' + lastBlock(vm) + '</div></div>' +
    '<div class="cta-bar" style="position:sticky;bottom:0;padding:8px 0 calc(8px + env(safe-area-inset-bottom))">' +
    '<button type="button" class="cta" id="play" style="width:100%;min-height:56px">Play over ' + esc(vm.over) + '</button></div>' +
    '</div>';

  const segEl = el.querySelector('.seg');
  segEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-intent]');
    if (!b) return;
    intent = b.getAttribute('data-intent');
    segEl.querySelectorAll('[data-intent]').forEach((x) =>
      x.setAttribute('aria-pressed', String(x.getAttribute('data-intent') === intent)));
    el.querySelector('#intent-desc').textContent = INTENTS.find((o) => o.k === intent).d;
  });
  el.querySelector('#play').addEventListener('click', () => dispatch('BowlOver', { intent }));
}
