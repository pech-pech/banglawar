/* trial-card: a found player on trial. Home card + sheet (Q1: Sign / Decline). Reads trialVM(s) only (shape in build/r9/UI-CLUB.md).
   Sign -> SignTrial, Decline -> DeclineTrial. Wage and squad max are shown in words; Sign is disabled with the reason when the squad is full. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { letterOfStep } from '../core/letters.js';
import { strongHtml, strongText } from './training-view.js';
import { shownCell, roleIcon, typeIcon, spoken } from './letters-ui.js';

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function trialCardHtml(vm) {
  if (!vm || !(vm.player || vm.coach)) return '';
  const coach = !vm.player && vm.coach;
  const p = vm.player || vm.coach;
  return '<button type="button" class="c-btn c-card cl-card cl-trial" data-act="sheet:trial" aria-label="' + esc((coach ? 'Trial coach: ' : 'Trial player: ') + (p.name || 'new') + '. Tap to sign or decline.') + '">' +
    icoDeco(coach ? 'coach' : 'team', 24) + '<span class="cl-card__t"><b>' + (coach ? 'Trial coach: ' : 'Trial player: ') + esc(p.name || 'New player') + '</b><small>Sign or decline</small></span></button>';
}

const ROLE_WORD = { opener: 'Opener', middle: 'Middle order', lower: 'Lower order' };
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const roleWord = (r) => ROLE_WORD[String(r || '').toLowerCase()] || cap(r);
const numOk = (n) => typeof n === 'number' && isFinite(n) && n >= 20;
const iw = (icon, word) => '<span>' + icoDeco(icon, 24) + '</span><span>' + esc(word) + '</span>';
/** A letter row: icon + label + letter box (spoken form for readers). */
function letterRow(icon, label, shown) {
  const c = shownCell(shown);
  return '<li class="cl-lrow" aria-label="' + esc(label + ' ' + spoken(c.letter)) + '"><span>' + icoDeco(icon, 24) + '</span><span class="cl-lrow__t">' + esc(label) + c.html + '</span></li>';
}

/** QA3 m1: a release row shows what the trial player shows (role, bowling type, Batting and Bowling letters with their icons), so the two compare.
    Falls back to the one overall letter only when the split letters are missing (old view models). */
function relRow(r) {
  const two = numOk(r.batShown) && numOk(r.bowlShown);
  const say = 'Release ' + r.name + ', ' + roleWord(r.role) + (r.type ? ', ' + cap(r.type) + ' bowler' : '') +
    (two ? ', batting ' + spoken(shownCell(r.batShown).letter) + ', bowling ' + spoken(shownCell(r.bowlShown).letter) : numOk(r.shown) ? ', ability ' + spoken(shownCell(r.shown).letter) : '');
  const kv = (icon, a) => '<span class="cl-rel__k">' + icoDeco(icon, 20) + shownCell(a).html + '</span>';
  return '<button type="button" class="c-btn cl-opt cl-rel" data-cl-relpick="' + esc(r.id) + '" aria-label="' + esc(say) + '">' + icoDeco(roleIcon(r.role), 24) +
    '<span class="cl-opt__t"><span class="cl-opt__n">' + esc(r.name) + '</span>' +
    '<span class="cl-opt__s"><span class="cl-rel__k">' + esc(roleWord(r.role)) + '</span>' + (r.type ? '<span class="cl-rel__k">' + icoDeco(typeIcon(r.type), 20) + '<span>' + esc(cap(r.type)) + '</span></span>' : '') + '</span>' +
    (two ? '<span class="cl-opt__s cl-rel__l" aria-hidden="true">' + kv('batSkill', r.batShown) + kv('bowlSkill', r.bowlShown) + '</span>'
      : numOk(r.shown) ? '<span class="cl-opt__s" aria-hidden="true">' + shownCell(r.shown).html + '</span>' : '') +
    '</span></button>';
}

/** One short line after Sign / Decline: an aria-live status that fades out by itself. Safe to call with no document (tests). */
export function confirmLine(text, icon) {
  if (typeof document === 'undefined' || !text) return null;
  let el = document.getElementById('cl-confirm-line');
  if (!el) {
    el = document.createElement('p'); el.id = 'cl-confirm-line'; el.className = 'cl-toast';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (el.insertAdjacentHTML) el.insertAdjacentHTML('afterbegin', icoDeco(icon || 'done', 24)); // QA3 m3: an icon with the words (decorative)
  if (el.__t) clearTimeout(el.__t);
  el.__t = setTimeout(() => { if (el.parentNode) el.remove(); }, 4500);
  return el;
}

export function renderTrial(root, vm, dispatch) {
  const coach = !!(vm && !vm.player && vm.coach);
  const p = vm && (vm.player || vm.coach);
  root.__clVm = vm;
  if (!p) { root.innerHTML = '<div class="screen cl-screen"><p class="cl-note" role="status">' + icoDeco('info', 24) + '<span>Nobody is on trial right now.</span></p></div>'; return root; }
  const full = vm.canSign === false || vm.squadFull === true;
  const stats = Array.isArray(p.lines) ? p.lines : [];
  const rel = Array.isArray(vm.release) ? vm.release : [];
  const hidden = !coach && (p.grade == null || p.grade === '' || p.grade === '?');
  const mode = root.__clRel || null; // null | 'list' | { id } (confirm)
  const name = esc(p.name || (coach ? 'New coach' : 'New player'));
  let body;
  if (mode && !coach && full) {
    const who = mode !== 'list' && rel.find((r) => r.id === mode.id);
    body = who
      ? '<h3 class="cl-h" tabindex="-1">' + icoDeco('alert', 24) + '<span>Release ' + esc(who.name) + '?</span></h3><p class="cl-note cl-note--warn">' + icoDeco('info', 24) + '<span>' + esc(who.name) + ' leaves your squad for good. This frees a place for ' + name + '.</span></p>' +
        '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-sell="' + esc(who.id) + '">' + icoDeco('done', 24) + '<span>Yes, release ' + esc(who.name) + '</span></button>' +
        '<button type="button" class="c-btn" data-cl-relback="1">' + icoDeco('close', 24) + '<span>No, go back</span></button></div>'
      : '<h3 class="cl-h" tabindex="-1">' + icoDeco('team', 24) + '<span>Who goes?</span></h3>' +
        (rel.length ? '<p class="cl-note">' + icoDeco('info', 24) + '<span>Pick one player to release. Starters can only leave at season end.</span></p><div class="cl-opts">' +
          rel.map(relRow).join('') + '</div>'
          : '<p class="cl-note cl-note--warn" role="status">' + icoDeco('lock', 24) + '<span>Nobody can be released right now. Decline, or try at season end.</span></p>') +
        '<div class="cl-actions"><button type="button" class="c-btn" data-cl-relback="1">' + icoDeco('close', 24) + '<span>Back</span></button></div>';
    root.innerHTML = '<div class="screen cl-screen cl-trialsheet">' + body + '</div>';
    bindTrial(root, dispatch); return root;
  }
  const released = coach ? '' : String(vm.released || root.__clReleased || ''); // saved in s.trial.released (survives close + reload); the DOM copy covers a vm without it
  const size = Number(vm.squadSize) || 0, max = Number(vm.squadMax) || 0;
  const sizeWord = size ? 'Squad now ' + size + (max ? ' of ' + max : '') : 'Squad has a free place';
  if (mode === 'decline' && released) { // QA3 m2: Decline after a release asks first, so a short squad is a choice
    root.innerHTML = '<div class="screen cl-screen cl-trialsheet"><h3 class="cl-h" tabindex="-1">' + icoDeco('alert', 24) + '<span>' + esc(sizeWord) + '</span></h3>' +
      '<p class="cl-note cl-note--warn">' + icoDeco('info', 24) + '<span>' + esc('You released ' + released + '. Sign ' + (p.name || 'the trial player') + ', or keep ' + (size ? size + ' players' : 'a smaller squad') + '?') + '</span></p>' +
      '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-act="SignTrial"' + (full ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('done', 24) + '<span>Sign ' + name + '</span></button>' +
      '<button type="button" class="c-btn" data-cl-act="DeclineTrial" data-cl-sure="1">' + icoDeco('team', 24) + '<span>' + esc(size ? 'Keep ' + size + ', decline' : 'Decline anyway') + '</span></button>' +
      '<button type="button" class="c-btn" data-cl-relback="1">' + icoDeco('close', 24) + '<span>Back</span></button></div></div>';
    bindTrial(root, dispatch); return root;
  }
  const ab = !coach && numOk(p.ability) ? shownCell(p.ability) : null;
  const facts = coach
    ? '<li>' + iw('coach', 'Coach. Helps training when strong in the week\'s focus.') + '</li>' +
      '<li class="cl-strong" aria-label="' + esc(p.strong && p.strong.length ? 'Strong in ' + strongText(p.strong) : 'Strong in nothing special') + '"><span>' + icoDeco('burst', 24) + '</span><span class="cl-strong__t"><span>Strong in</span>' + (p.strong && p.strong.length ? '<span class="t2-strong">' + strongHtml(p.strong) + '</span>' : '<span>Nothing special</span>') + '</span></li>'
    : (p.role ? '<li>' + iw(roleIcon(p.role), roleWord(p.role)) + '</li>' : '') +
      (p.type ? '<li>' + iw(typeIcon(p.type), cap(p.type) + ' bowler') + '</li>' : '') +
      (numOk(p.batShown) ? letterRow('batSkill', 'Batting', p.batShown) : '') + (numOk(p.bowlShown) ? letterRow('bowlSkill', 'Bowling', p.bowlShown) : '') +
      (ab && !numOk(p.batShown) ? letterRow('team', 'Ability', p.ability) : '') +
      '<li>' + (hidden ? iw('info', 'Potential grade: hidden until 1 practice drill.') : '<span>' + icoDeco('info', 24) + '</span><span>Potential grade <b class="lt-in">' + esc(p.grade) + '</b></span>') + '</li>';
  root.innerHTML = '<div class="screen cl-screen cl-trialsheet"><h3 class="cl-h" tabindex="-1">' + icoDeco(coach ? 'coach' : 'team', 24) + '<span>' + name + '</span>' +
    (coach ? '<span class="c-tag cl-grade" aria-label="Grade ' + esc(spoken(letterOfStep(p.step))) + '"><span aria-hidden="true">Grade</span><b aria-hidden="true">' + esc(letterOfStep(p.step)) + '</b></span>' : '') + '</h3>' +
    '<ul class="cl-facts">' + facts +
    stats.map((l) => '<li>' + iw('info', l) + '</li>').join('') +
    '<li>' + icoDeco('coin', 24) + '<span>' + (Number(vm.wage) ? 'Wage: ' + fmt(vm.wage) + ' Coins a match' : 'No wage') + '</span></li>' +
    '</ul>' +
    (released ? '<p class="cl-note cl-done">' + icoDeco('done', 24) + '<span>' + esc(released + ' released. ' + sizeWord + '.') + '</span></p>' : '') +
    (full ? '<p class="cl-note cl-note--warn" role="status">' + icoDeco('lock', 24) + '<span>' + esc(vm.why || (coach ? 'No free coach slot. Decline, or release a coach first.' : 'Squad full: release one first')) + '</span></p>' : '') +
    (full && !coach ? '<div class="cl-actions"><button type="button" class="c-btn" data-cl-relopen="1">' + icoDeco('team', 24) + '<span>Choose who to release</span></button></div>' : '') +
    '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-act="SignTrial"' + (full ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('done', 24) + '<span>Sign</span></button>' +
    '<button type="button" class="c-btn" data-cl-act="DeclineTrial">' + icoDeco('close', 24) + '<span>Decline</span></button></div></div>';
  bindTrial(root, dispatch);
  return root;
}

function bindTrial(root, dispatch) {
  if (root.__clBound) return;
  root.__clBound = true;
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-cl-act],[data-cl-relopen],[data-cl-relpick],[data-cl-relback],[data-cl-sell]');
    if (!t || !root.contains(t) || t.disabled) return;
    const again = () => { renderTrial(root, root.__clVm, dispatch); const h = root.querySelector && root.querySelector('.cl-h'); if (h && h.focus) h.focus(); };
    if (t.hasAttribute('data-cl-relopen')) { root.__clRel = 'list'; again(); }
    else if (t.hasAttribute('data-cl-relpick')) { root.__clRel = { id: t.getAttribute('data-cl-relpick') }; again(); }
    else if (t.hasAttribute('data-cl-relback')) { root.__clRel = root.__clRel && root.__clRel !== 'list' && root.__clRel !== 'decline' ? 'list' : null; again(); }
    else if (t.hasAttribute('data-cl-sell')) {
      const id = t.getAttribute('data-cl-sell'), rel = (root.__clVm && root.__clVm.release) || [], who = rel.find((r) => r.id === id);
      root.__clRel = null; root.__clReleased = who ? who.name : 'A player';
      dispatch('SellPlayer', { id });
      confirmLine(root.__clReleased + ' released.', 'team'); // QA3 m2: say who left (aria-live)
    }
    else {
      const vm = root.__clVm, p = vm && (vm.player || vm.coach), cmd = t.getAttribute('data-cl-act');
      if (cmd === 'DeclineTrial' && (vm && vm.released || root.__clReleased) && vm && vm.player && !t.hasAttribute('data-cl-sure')) { root.__clRel = 'decline'; again(); return; }
      dispatch(cmd, {});
      if (p) confirmLine(cmd === 'SignTrial' ? (p.name + (vm.player ? ' joined your squad.' : ' joined your coaches.')) : ('You declined ' + p.name + '.'));
    }
  });
}

export function openTrial(vm, dispatch, _open, _arg, refresh) {
  const host = document.createElement('div');
  let close;
  renderTrial(host, vm, (n, a) => {
    dispatch(n, a);
    if (n === 'SellPlayer' && refresh) { const v = refresh(); if (v && (v.player || v.coach)) { renderTrial(host, v, () => {}); const h = host.querySelector('.cl-h'); if (h) h.focus(); return; } }
    if (close) close();
  });
  close = openSheet(vm && !vm.player && vm.coach ? 'Trial coach' : 'Trial player', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
