/* hub-view: the season home. render(el, vm, dispatch). Reads hubVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, tpChip, icoDeco } from './dom.js';
import { badgeCount, badgeText, badgeAria } from './book-badge.js';
import { spokeIcon } from './wheel-look.js';
import { drawHead } from './club-canvas.js';
import { drawGround } from './ground-canvas.js';
import { openSheet } from './sheet.js';
import { trialCardHtml } from './trial-card.js';
import { pendingCardHtml } from './freepick-view.js';
import { fansGateHtml } from './table-sheet.js';

export function helpBtn(id, label) {
  return '<button type="button" class="c-icon-btn help-btn" data-act="sheet:glossary"' + (id ? ' data-arg="' + esc(JSON.stringify(id)) + '"' : '') +
    ' aria-label="' + esc(label || 'Cricket words (glossary)') + '">?</button>';
}

let noticeGone = false; // view state: the squad-of-8 line is gone once tapped (the store command, if any, clears it for good)
function noticeHtml(n) {
  if (!n || noticeGone) return '';
  const k = Number(n.moved) || 0;
  const txt = n.line || 'The squad is now 8.' + (k ? ' ' + k + ' player' + (k === 1 ? '' : 's') + ' moved on.' : '');
  return '<button type="button" class="hb-notice" data-notice role="status" aria-label="' + esc(txt + ' Tap to dismiss.') + '">' + icoDeco('info', 24) + '<span>' + esc(txt) + '</span><small>Tap to close</small></button>';
}
const sayL = (L) => String(L).replace(/\+$/, ' plus').replace(/-$/, ' minus');
const pairText = (g) => 'Our six <b class="lt-in">' + esc(g.ours) + '</b> · Their six <b class="lt-in">' + esc(g.theirs) + '</b>';
/* Pre-match letter pair (SPEC s5): our six against theirs, letters not numbers. */
function pairHtml(g) {
  if (!g) return '';
  return '<div class="pm-pair" role="group" aria-label="Our six ' + esc(sayL(g.ours)) + ', their six ' + esc(sayL(g.theirs)) + '"><span>Our six <b class="lt-in">' + esc(g.ours) + '</b></span><span>Their six <b class="lt-in">' + esc(g.theirs) + '</b></span></div>';
}

const TICK = { ok: 'c-tag--done', later: 'c-tag--locked', todo: '' };

function promoHtml(pr, unlock) {
  return '<section class="c-card hb-promo" aria-label="Promotion checklist"><h3 class="c-strip c-strip--light"><span>' + esc(pr.title) + '</span><span class="c-strip__right">' + pr.done + ' of ' + pr.total + ' done</span></h3>' +
    pr.rows.filter((r) => r.state !== 'later' || !r.key || r.key === 'rank').map((r) => '<div class="hb-check">' + icoDeco(r.key === 'rank' ? 'league' : r.key === 'stadium' ? 'home' : 'fan', 24) +
      '<span>' + esc(r.title) + '<span class="sub">' + esc(r.sub) + '</span></span>' + (r.state === 'todo' ? '<span class="hb-state">' + esc(r.tag) + '</span>' : '<span class="c-tag ' + (TICK[r.state] || '') + '">' + esc(r.tag) + '</span>') + '</div>').join('') +
    (unlock ? '<div class="hb-next">' + icoDeco('train', 24) + '<span><b class="lb">Next unlock</b>' + esc(unlock.name) + ': ' + unlock.left + ' drill' + (unlock.left > 1 ? 's' : '') + ' to reveal grade</span></div>' : '') + '</section>';
}

/* Next rival: ONE 56 px chip row, "Next: Club · Tag". A tagged rival opens a small sheet with the hint; an untagged rival shows no chip (layout stays as before). */
function rivalHtml(next) {
  const t = next && next.tag;
  if (!t) return '';
  return '<button type="button" class="c-btn hb-rival" data-act="sheet:rival" aria-label="Next: ' + esc(next.oppName) + ', ' + esc(t.chip) + '. Tap for the hint.">' + icoDeco('scout', 24) +
    '<span class="hb-rtx name">Next: ' + esc(next.oppName) + ' · ' + esc(t.chip) + '</span></button>';
}

const fmtN = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* L2 scoreboard: Coins (56 px button, gold edge), TP and Spokes (read-only), three cells in one board. */
function boardHtml(vm) {
  const e = vm.econ, w = vm.workshop;
  const coins = e ? '<button type="button" class="hb-cell hb-cell--coins" data-act="sheet:money" aria-label="Club money: ' + esc(fmtN(e.coins)) + ' Coins">' + icoDeco('coin', 24) + '<span class="hb-cv2"><b>' + esc(fmtN(e.coins)) + '</b><small>Coins</small></span></button>' : '';
  const tp = '<div class="hb-cell hb-cell--tp hb-tp">' + icoDeco('tp', 24) + '<span class="hb-cv2"><b>' + esc(vm.tp) + '</b><small><span aria-hidden="true">TP</span><span class="ss-sr"> training points</span></small></span></div>';
  const sp = w && w.visible ? '<div class="hb-cell hb-cell--spokes">' + spokeIcon(24) + '<span class="hb-cv2"><b>' + esc(w.spokes) + '</b><small>Spokes</small></span></div>' : '';
  return '<div class="hb-board" role="group" aria-label="Club scoreboard">' + coins + tp + sp + '</div>' + fansGateHtml(vm.fansGate, 'hb-fg');
}

function slotHtml(slot, plate) {
  const lk = !plate && slot === 'workshop' ? '<button type="button" class="c-btn hb-plate is-locked" data-plate="workshop" aria-disabled="true" aria-label="Wheel Workshop, opens later">' + icoDeco('lock', 24) + '<span class="hb-pl">Workshop</span><span class="hb-badge" hidden></span></button>' : '';
  const bt = plate && plate.badge ? badgeText(plate.badge) : ''; // P6: Book plate badge (session count, js/ui/book-badge.js)
  const aria = bt ? (plate.aria || plate.word) + ', ' + badgeAria(plate.badge) : plate && plate.aria;
  const p = plate ? '<button type="button" class="c-btn hb-plate" data-plate="' + slot + '" data-act="' + plate.act + '"' + (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + plate.icon + '<span class="hb-pl">' + esc(plate.word) + '</span>' +
    (bt ? '<span class="hb-badge" aria-hidden="true">' + esc(bt) + '</span>' : '<span class="hb-badge" hidden></span>') + '</button>' : lk;
  return '<div class="hb-slot" data-slot="' + slot + '"' + (plate ? '' : ' data-locked="1"') + '><div class="hb-bld"></div>' + p + '</div>';
}

function groundHtml(vm) {
  const w = vm.workshop, a = vm.activities;
  const P = (act, icon, word, aria) => ({ act, icon: icoDeco(icon, 24), word, aria });
  const top = slotHtml('table', P('sheet:table', 'league', 'Table')) + slotHtml('stadium', P('sheet:stadium', 'home', 'Stadium')) + slotHtml('extras', P('sheet:sinks', 'shop', 'Extras'));
  const bot = slotHtml('book', { ...P('sheet:book', 'book', 'Book'), badge: badgeCount() }) +
    slotHtml('workshop', w && w.visible ? { act: 'sheet:workshop', icon: spokeIcon(24), word: 'Wheel Workshop', aria: 'Wheel Workshop, ' + w.spokes + ' Spokes' } : null) +
    slotHtml('fans', a ? P('sheet:activities', 'pennant', 'Fan activity') : null);
  const bubble = a && !a.picked && a.available !== false ? '<div class="hb-bubble" role="status">This week: pick one, or rest. <em>Resting is free.</em></div>' : '';
  return '<div class="hb-ground" aria-label="Your club ground">' + boardHtml(vm) + '<div class="hb-row hb-row--top">' + top + '</div><div class="hb-field"></div>' + bubble + '<div class="hb-row hb-row--bot">' + bot + '</div></div>';
}

/* r9 club cards (flags off: the VMs are absent or off, so nothing is drawn): free facility pending, trial player, this week's fan activity. */
function clubCardsHtml(vm) {
  const h = pendingCardHtml(vm.freePick) + trialCardHtml(vm.trial || (vm.activities && vm.activities.trial));
  return h ? '<div class="cl-cards">' + h + '</div>' : '';
}

function sixHtml(six, pair) {
  return '<div class="hb-sixhead">' + (pair || 'Our six') + ' · batting order</div><div class="hb-six" role="group" aria-label="Our six, batting order">' + six.map((p, i) => {
    const hid = p.grade === '?';
    return '<button type="button" class="hb-p" data-act="sheet:team" data-arg=\'{"tab":"six"}\' aria-label="' + esc(p.name + ', ' + (hid ? 'grade hidden' : 'grade ' + p.grade) + '. Edit the six') + '">' +
      '<canvas class="hb-head" data-key="' + esc(p.id) + '" aria-hidden="true"></canvas><span class="nm name">' + esc(p.name) + '</span>' +
      '<span class="c-tag' + (hid ? ' c-tag--locked' : '') + '" aria-hidden="true">' + (hid ? '?' : esc(p.grade)) + '</span></button>';
  }).join('') + '</div>';
}

function footHtml(vm, cta) {
  const edits = '<div class="hb-edits"><button type="button" class="c-btn hb-edit" data-act="sheet:team" data-arg=\'{"tab":"six"}\' aria-label="Edit the six: 6 picked">' + icoDeco('team', 24) +
    '<span class="tx"><span>Six</span><small>6 picked</small></span></button>' +
    '<button type="button" class="c-btn hb-edit' + (vm.plan.ok ? '' : ' is-warn') + '" data-act="sheet:team" data-arg=\'{"tab":"overs"}\' aria-label="Edit the overs: ' + esc(vm.plan.word.toLowerCase()) + '">' + icoDeco('overs', 24) +
    '<span class="tx"><span>Overs</span><small>' + (vm.plan.ok ? '' : '! ') + esc(vm.plan.word) + '</small></span></button></div>';
  const go = '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block hb-cta" data-act="' + esc(cta.act || 'StartMatch') + '"' + (cta.disabled ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('match', 24) +
    '<span class="tx"><span>' + esc(cta.label) + '</span>' + (cta.sub ? '<small>' + esc(cta.sub) + '</small>' : '') + '</span></button>';
  return '<div class="m0-ctabar cta hb-foot">' + edits + (cta.disabled && cta.reason ? '<span class="m0-warn" role="note">' + esc(cta.reason) + '</span>' : '') + go + '</div>';
}

export function render(el, vm, dispatch) {
  const season = vm.season && typeof vm.season === 'object' ? vm.season : { n: vm.season, league: 1 };
  const cta = typeof vm.cta === 'string' ? { label: vm.cta } : (vm.cta || {});
  const run = vm.run || null;
  const full = !!(vm.six && vm.promo && vm.plan);
  const l1 = run ? 'Season ' + run.season + ' of ' + run.of : 'Season ' + (season.n || 1);
  const l2 = 'League ' + (season.league || (run && run.league) || 1);
  const chap = run && run.nextChapter ? run.nextChapter : null;
  const sub = vm.phaseWord || '';
  const top = '<div class="c-strip strip hb-head"><span class="ss-strip"><b class="rn-head">' + esc(l1) + '</b><b class="hb-lg">' + esc(l2) + '</b>' + (chap ? '' : (sub ? '<small class="hb-sub">' + esc(sub) + '</small>' : '')) + '</span>' +
    '<button type="button" class="c-btn hb-save ss-save" data-act="sheet:save" aria-label="Save">' + icoDeco('save', 24) + '<span>Save</span></button>' + helpBtn('league-table') + '</div>' +
    (chap ? '<div class="hb-chap">Next chapter: <b>' + esc(chap.name) + '</b> (Season ' + esc(chap.season) + ')</div>' : '');
  try { const old = el.querySelector('.hb-ground'); if (old && old.__ground && old.__ground.destroy) old.__ground.destroy(); } catch (e) { /* ignore */ }
  if (!full) {
    el.innerHTML = '<div class="screen ss ss-hub hb-hub">' + top + '<div class="m0-ctabar cta hb-foot">' + btn(cta.label || 'Pick your six', cta.act || 'OpenSquad', { kind: 'cta', disabled: cta.disabled, reason: cta.reason }) + '</div></div>';
    return;
  }
  el.innerHTML =
    '<div class="screen ss ss-hub hb-hub hb-l2' + (vm.next && vm.next.tag ? ' hb-hub--rv' : '') + '">' + top +
    groundHtml(vm) +
    '<div class="hb-more">' + noticeHtml(vm.notice) + rivalHtml(vm.next) + clubCardsHtml(vm) + promoHtml(vm.promo, vm.unlock) + sixHtml(vm.six, vm.gap ? pairText(vm.gap) : '') + '</div>' +
    footHtml(vm, cta) + '</div>';
  const nb = el.querySelector('[data-notice]');
  if (nb) nb.addEventListener('click', () => { noticeGone = true; nb.remove(); dispatch('DismissNotice', {}); });
  const host = el.querySelector('.hb-ground');
  if (host) try { host.__ground = drawGround(host, { levels: (vm.econ && vm.econ.fac) || {}, locked: { workshop: !(vm.workshop && vm.workshop.visible), fans: !vm.activities }, onTap(id, name, lv) {
    openSheet(name, '<div class="c-card c-card--inset hb-built">' + icoDeco(lv > 0 ? 'done' : 'lock', 24) + '<span>' + (lv > 0 ? 'Level ' + lv + '. Build more in Stadium.' : 'Not built yet. Build it in Stadium.') + '</span></div>');
  } }); } catch (e) { /* the ground is decoration: the rest of the hub still works */ }
  [].forEach.call(el.querySelectorAll('canvas.hb-head'), (cv) => drawHead(cv, cv.getAttribute('data-key')));
}
