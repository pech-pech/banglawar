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
const TAG_CLASS = { Great: 'c-tag--go', Bad: 'c-tag--warn' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ic(name, size = 24) {
  if (!name || !window.SPR || window.SPR.iconNames.indexOf(name) < 0) return '';
  const im = window.SPR.iconImg(name, size);
  im.alt = '';
  im.setAttribute('aria-hidden', 'true');
  return im.outerHTML;
}

function gradeTag(g) {
  const hidden = !g || g === '?';
  const label = hidden ? 'Potential hidden. Grade shows after 5 drills' : 'Potential ' + g;
  return '<span class="c-tag" title="' + (hidden ? 'Grade shows after 5 drills' : 'Potential ' + esc(g)) +
    '" aria-label="' + esc(label) + '">' + (hidden ? '?' : esc(g)) + '</span>';
}

function previewTag(p) {
  const star = p.inPhase ? '<span aria-hidden="true">★</span>' : '';
  const aria = p.name + ', ' + (p.bowl || '') + ', ' + p.label + (p.inPhase ? ', in phase' : '');
  return '<span class="c-tag ' + (TAG_CLASS[p.label] || '') + '" aria-label="' + esc(aria) + '">' +
    ic(TYPE_ICON[p.bowl], 20) + '<span class="name name-fb">' + esc(p.name) + '</span> ' + esc(p.label) + star + '</span>';
}

function batterRow(b) {
  const role = ROLE_ICON[b.bat] ? b.bat : '';
  const hidden = !b.grade || b.grade === '?';
  const prev = (b.previews || []).map(previewTag).join('');
  return '<div class="c-row batter' + (b.onStrike ? ' is-strike' : '') + '" style="min-height:56px;flex-wrap:wrap">' +
    ic(ROLE_ICON[role], 24) +
    '<div class="c-row__body"><span class="c-row__title"><span class="name">' + esc(b.name) + '</span></span>' +
    (b.onStrike ? '<span class="c-row__sub">On strike</span>' : '') +
    (hidden ? '<span class="c-row__sub">Grade shows after 5 drills</span>' : '') +
    (prev ? '<span class="c-row__sub" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' + prev + '</span>' : '') +
    '</div><div class="c-row__end">' + gradeTag(b.grade) +
    '<span class="c-row__val" style="font-size:var(--c-fs-m)">' + esc(b.r) + ' (' + esc(b.b) + ')</span></div></div>';
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
  const cls = rec.o === 'W' ? 'c-tag c-tag--warn' : (rec.o === 6 || rec.o === 4) ? 'c-tag c-tag--go' : 'c-tag';
  const txt = rec.o === 'W' ? 'W' : rec.o === 0 ? '\u00b7' : rec.o;
  return '<span class="' + cls + '" aria-label="' + esc(lab) + '">' + (rec.o === 'W' ? ic('wicket', 20) : '') +
    '<b>' + esc(txt) + '</b></span>';
}

function lastBlock(vm) {
  const last = vm.last;
  if (!last || !last.balls || !last.balls.length) return '';
  const ai = vm.aiBowler || {};
  const bname = ai.name || 'the bowler';
  const rows = last.balls.slice(0, 6).map((rec) =>
    '<div class="c-row ball-row" style="min-height:56px">' +
    '<span class="c-row__val">' + esc(rec.n) + '</span>' + ballBadge(rec) +
    '<div class="c-row__body why" style="white-space:normal">' + esc(whyLine(rec, batterName(vm, rec.batter), bname)) + '</div></div>').join('');
  return '<section class="c-card" aria-label="Last over"><h2 style="margin:0 0 8px">Last over</h2>' +
    '<div class="c-strip">Over ' + esc(last.over) + ' by <span class="name name-fb">' + esc(bname) + '</span>' +
    (ai.bowl ? '<span class="c-strip__right">' + esc(ai.bowl) + ' ' + ic(TYPE_ICON[ai.bowl], 20) + '</span>' : '') + '</div>' + rows + '</section>';
}

export function render(el, vm, dispatch) {
  const need = vm.need > 0 ? 'Need ' + vm.need + ' off ' + vm.ballsLeft : 'Target reached';
  const seg = INTENTS.map((o) => {
    const sel = o.k === intent;
    return '<button type="button" class="c-seg__opt' + (sel ? ' is-selected' : '') + '" data-intent="' + o.k +
      '" aria-pressed="' + sel + '" aria-label="' + o.n + ': ' + o.d + '" style="min-height:56px;flex:1">' +
      ic(o.ic, 24) + ' ' + o.n + '</button>';
  }).join('');
  const desc = INTENTS.find((o) => o.k === intent).d;
  const sc = vm.score || {};
  const wide = window.matchMedia && window.matchMedia('(min-width: 600px)').matches;

  const crease = '<section class="c-card" aria-label="At the crease"><h2 style="margin:0 0 8px">At the crease</h2>' +
    (vm.crease || []).map(batterRow).join('') + '</section>';
  const picker = '<section class="c-card" aria-label="Intent"><h2 style="margin:0 0 8px">Over ' + esc(vm.over) + ': pick an Intent</h2>' +
    '<div class="c-seg" role="group" aria-label="Batting Intent" style="display:flex">' + seg + '</div>' +
    '<p class="muted" id="intent-desc" style="margin:8px 0 0">' + esc(desc) + '</p></section>';
  const last = lastBlock(vm);
  const cols = wide
    ? '<div class="col">' + crease + '</div><div class="col" style="display:flex;flex-direction:column;gap:var(--c-sp-3)">' + picker + last + '</div>'
    : '<div class="col" style="display:flex;flex-direction:column;gap:var(--c-sp-3)">' + crease + picker + last + '</div>';

  el.innerHTML =
    '<div class="screen chase">' +
    '<header class="strip c-strip" aria-label="Score">' +
    '<span>Target ' + esc(vm.target) + '</span><span>' + esc(sc.runs) + '/' + esc(sc.wk) + '</span>' +
    '<span>Ov ' + esc(sc.overs) + '</span><span class="c-strip__right">' + esc(vm.phaseName) + '</span></header>' +
    '<h2 class="need">' + esc(need) + '</h2>' +
    '<div class="two-col">' + cols + '</div>' +
    '<div class="cta"><button type="button" id="play" class="c-btn c-btn--primary c-btn--cta c-btn--block">Play over ' +
    esc(vm.over) + '</button></div>' +
    '</div>';

  const segEl = el.querySelector('.c-seg');
  segEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-intent]');
    if (!b) return;
    intent = b.getAttribute('data-intent');
    segEl.querySelectorAll('[data-intent]').forEach((x) => {
      const on = x.getAttribute('data-intent') === intent;
      x.classList.toggle('is-selected', on);
      x.setAttribute('aria-pressed', String(on));
    });
    el.querySelector('#intent-desc').textContent = INTENTS.find((o) => o.k === intent).d;
  });
  el.querySelector('#play').addEventListener('click', () => dispatch('BowlOver', { intent }));
}
