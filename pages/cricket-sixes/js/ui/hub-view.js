/* hub-view: the season home. render(el, vm, dispatch). Reads hubVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, tpChip, ico, icoDeco } from './dom.js';
import { drawClub, drawHead } from './club-canvas.js';
import { openSheet } from './sheet.js';

export function helpBtn(id, label) {
  return '<button type="button" class="c-icon-btn help-btn" data-act="sheet:glossary"' + (id ? ' data-arg="' + esc(JSON.stringify(id)) + '"' : '') +
    ' aria-label="' + esc(label || 'Cricket words (glossary)') + '">?</button>';
}

const TICK = { ok: 'c-tag--done', later: 'c-tag--locked', todo: '' };

function promoHtml(pr, unlock) {
  return '<section class="c-card hb-promo" aria-label="Promotion checklist"><h3 class="c-strip c-strip--light"><span>' + esc(pr.title) + '</span><span class="c-strip__right">' + pr.done + ' of ' + pr.total + ' done</span></h3>' +
    pr.rows.map((r) => '<div class="hb-check">' + ico(r.key === 'rank' ? 'league' : r.key === 'stadium' ? 'home' : 'fan', 24) +
      '<span>' + esc(r.title) + '<span class="sub">' + esc(r.sub) + '</span></span>' + (r.state === 'todo' ? '<span class="hb-state">' + esc(r.tag) + '</span>' : '<span class="c-tag ' + (TICK[r.state] || '') + '">' + esc(r.tag) + '</span>') + '</div>').join('') +
    (unlock ? '<div class="hb-next">' + ico('train', 24) + '<span><b class="lb">Next unlock</b>' + esc(unlock.name) + ': ' + unlock.left + ' drill' + (unlock.left > 1 ? 's' : '') + ' to reveal grade</span></div>' : '') + '</section>';
}

/* One hub tool: 24 px icon with a visible 14 px label under it. */
function toolBtn(label, act, icon, aria, extra) {
  return '<button type="button" class="c-btn hb-tool' + (extra || '') + '" data-act="' + act + '" aria-label="' + esc(aria) + '">' + ico(icon, 24) + '<span class="hb-tl">' + esc(label) + '</span></button>';
}

/* Next rival: ONE 56 px chip row, "Next: Club · Tag". A tagged rival opens a small sheet with the hint; an untagged rival shows no chip (layout stays as before). */
function rivalHtml(next) {
  const t = next && next.tag;
  if (!t) return '';
  return '<button type="button" class="c-btn hb-rival" data-act="sheet:rival" aria-label="Next: ' + esc(next.oppName) + ', ' + esc(t.chip) + '. Tap for the hint.">' + icoDeco('scout', 24) +
    '<span class="hb-rtx name">Next: ' + esc(next.oppName) + ' · ' + esc(t.chip) + '</span></button>';
}

function sixHtml(six) {
  return '<div class="hb-sixhead">Our six · batting order</div><div class="hb-six" role="group" aria-label="Our six, batting order">' + six.map((p, i) => {
    const hid = p.grade === '?';
    return '<button type="button" class="hb-p" data-act="sheet:team" data-arg=\'{"tab":"six"}\' aria-label="' + esc(p.name + ', ' + (hid ? 'grade hidden' : 'grade ' + p.grade) + '. Edit the six') + '">' +
      '<canvas class="hb-head" data-key="' + esc(p.id) + '" aria-hidden="true"></canvas><span class="nm name">' + esc(p.name) + '</span>' +
      '<span class="c-tag' + (hid ? ' c-tag--locked' : '') + '" aria-hidden="true">' + (hid ? '?' : esc(p.grade)) + '</span></button>';
  }).join('') + '</div>';
}

function footHtml(vm, cta) {
  const edits = '<div class="hb-edits"><button type="button" class="c-btn hb-edit" data-act="sheet:team" data-arg=\'{"tab":"six"}\' aria-label="Edit the six: 6 picked">' + ico('team', 24) +
    '<span class="tx"><span>Six</span><small>6 picked</small></span></button>' +
    '<button type="button" class="c-btn hb-edit' + (vm.plan.ok ? '' : ' is-warn') + '" data-act="sheet:team" data-arg=\'{"tab":"overs"}\' aria-label="Edit the overs: ' + esc(vm.plan.word.toLowerCase()) + '">' + ico('overs', 24) +
    '<span class="tx"><span>Overs</span><small>' + (vm.plan.ok ? '' : '! ') + esc(vm.plan.word) + '</small></span></button></div>';
  const go = '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block hb-cta" data-act="' + esc(cta.act || 'StartMatch') + '"' + (cta.disabled ? ' disabled aria-disabled="true"' : '') + '>' + ico('match', 24) +
    '<span class="tx"><span>' + esc(cta.label) + '</span>' + (cta.sub ? '<small>' + esc(cta.sub) + '</small>' : '') + '</span></button>';
  return '<div class="m0-ctabar cta hb-foot">' + edits + (cta.disabled && cta.reason ? '<span class="m0-warn" role="note">' + esc(cta.reason) + '</span>' : '') + go + '</div>';
}

export function render(el, vm, dispatch) {
  const season = vm.season && typeof vm.season === 'object' ? vm.season : { n: vm.season, league: 1 };
  const cta = typeof vm.cta === 'string' ? { label: vm.cta } : (vm.cta || {});
  const run = vm.run || null;
  const head = run ? 'Season ' + run.season + ' of ' + run.of + ' · League ' + run.league : 'League ' + (season.league || 1);
  const sub = run && run.nextChapter ? 'Next chapter: ' + run.nextChapter.name + ' (Season ' + run.nextChapter.season + ')'
    : run ? (vm.phaseWord || 'League') : 'Season ' + (season.n || 1) + ' · ' + (vm.phaseWord || 'League');
  const full = !!(vm.six && vm.promo && vm.plan);
  el.innerHTML =
    '<div class="screen ss ss-hub hb-hub' + (full && vm.next && vm.next.tag ? ' hb-hub--rv' : '') + '">' +
    '<div class="c-strip strip"><span class="ss-strip"><b class="rn-head">' + esc(head) + '</b><small>' + esc(sub) + '</small></span>' + helpBtn('league-table') + '</div>' +
    '<div class="hb-tools">' + toolBtn('Table', 'sheet:table', 'league', 'League table') + toolBtn('Book', 'sheet:book', 'book', 'Pairing Book') + toolBtn('Save', 'sheet:save', 'save', 'Save', ' ss-save') +
    '<span class="c-chip chip m0-tp hb-tool hb-tp" aria-label="' + esc(vm.tp) + ' training points">' + ico('tp', 24) + '<span class="hb-tl"><b>' + esc(vm.tp) + '</b> TP</span></span></div>' +
    (full ? '<div class="hb-scene" aria-label="Your club ground"></div>' + rivalHtml(vm.next) + promoHtml(vm.promo, vm.unlock) + sixHtml(vm.six) : '') +
    (full ? footHtml(vm, cta) : '<div class="m0-ctabar cta hb-foot">' + btn(cta.label || 'Pick your six', cta.act || 'OpenSquad', { kind: 'cta', disabled: cta.disabled, reason: cta.reason }) + '</div>') +
    '</div>';
  const host = el.querySelector('.hb-scene');
  if (host) drawClub(host, { onTap(id, name) { openSheet(name, '<div class="c-card c-card--inset hb-built">' + ico('lock', 24) + '<span>Not built yet. It comes with the stadium.</span></div>'); } });
  [].forEach.call(el.querySelectorAll('canvas.hb-head'), (cv) => drawHead(cv, cv.getAttribute('data-key')));
}
