/* recruit-card: season-end recruits on the end screen (s1). Reads endVM(s).recruits only:
   null | { list:[{id,name,role,type,shown,batShown,bowlShown,wage}], full, release:[{id,name,role,type,shown,batShown,bowlShown}], size, max, signed:name|null, passed, left?:name|null }.
   recruitCardHtml(rc) draws it; bindRecruit(el, rc, dispatch) wires it. Sign -> SignRecruit {id} (or, squad full, "Who leaves?" -> pick a row -> "Let X go? Y joins." -> SignRecruit {id, leaveId}); Pass -> PassRecruit {}.
   After signing or passing: one done line only (no toast: QA-VISUAL D3). Rows look like the trial card rows (kit .cl-* / .c-btn). */
import { esc, icoDeco } from './dom.js';
import { shownCell, roleIcon, typeIcon, spoken } from './letters-ui.js';

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ROLE_WORD = { opener: 'Opener', middle: 'Middle order', lower: 'Lower order' };
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const roleWord = (r) => ROLE_WORD[String(r || '').toLowerCase()] || cap(r);
const numOk = (n) => typeof n === 'number' && isFinite(n) && n >= 20;
const kv = (icon, a) => '<span class="cl-rel__k">' + icoDeco(icon, 20) + shownCell(a).html + '</span>';

/** Spoken summary of a player row: role, bowling type, Batting and Bowling letters (or the one overall letter on old view models). */
function said(r) {
  const two = numOk(r.batShown) && numOk(r.bowlShown);
  return roleWord(r.role) + (r.type ? ', ' + cap(r.type) + ' bowler' : '') +
    (two ? ', batting ' + spoken(shownCell(r.batShown).letter) + ', bowling ' + spoken(shownCell(r.bowlShown).letter) : numOk(r.shown) ? ', ability ' + spoken(shownCell(r.shown).letter) : '');
}

/** The inside of a row, as in trial-card relRow: role icon, name, role + type, letters. */
function rowInner(r, extra) {
  const two = numOk(r.batShown) && numOk(r.bowlShown);
  return icoDeco(roleIcon(r.role), 24) +
    '<span class="cl-opt__t"><span class="cl-opt__n">' + esc(r.name) + '</span>' +
    '<span class="cl-opt__s"><span class="cl-rel__k">' + esc(roleWord(r.role)) + '</span>' + (r.type ? '<span class="cl-rel__k">' + icoDeco(typeIcon(r.type), 20) + '<span>' + esc(cap(r.type)) + '</span></span>' : '') + '</span>' +
    (two ? '<span class="cl-opt__s cl-rel__l" aria-hidden="true">' + kv('batSkill', r.batShown) + kv('bowlSkill', r.bowlShown) + '</span>'
      : numOk(r.shown) ? '<span class="cl-opt__s" aria-hidden="true">' + shownCell(r.shown).html + '</span>' : '') +
    (extra || '') + '</span>';
}

function recruitRow(r) {
  const wage = Number(r.wage) ? 'Wage: ' + fmt(r.wage) + ' Coins a match' : 'No wage';
  return '<li class="cl-rc-row"><div class="cl-rc-info" role="group" aria-label="' + esc(r.name + ', ' + said(r) + '. ' + wage) + '">' +
    rowInner(r, '<span class="cl-opt__s" aria-hidden="true"><span class="cl-rel__k">' + icoDeco('coin', 20) + '<span>' + esc(wage) + '</span></span></span>') + '</div>' +
    '<button type="button" class="c-btn c-btn--primary cl-rc-sign" data-rc-sign="' + esc(r.id) + '" aria-label="' + esc('Sign ' + r.name) + '">' + icoDeco('done', 24) + '<span>Sign</span></button></li>';
}

const wageWord = (r) => Number(r.wage) ? 'Wage: ' + fmt(r.wage) + ' Coins a match' : '';

/** D2: a leave row says what a tap does ("Let go", visible) and shows the wage when the vm has one. The tap only opens a confirm step. */
function leaveRow(r) {
  const w = wageWord(r);
  return '<button type="button" class="c-btn cl-opt cl-rel cl-rc-leave" data-rc-leave="' + esc(r.id) + '" aria-label="' + esc('Let ' + r.name + ' go, ' + said(r) + (w ? '. ' + w : '')) + '">' +
    rowInner(r, w ? '<span class="cl-opt__s" aria-hidden="true"><span class="cl-rel__k">' + icoDeco('coin', 20) + '<span>' + esc(w) + '</span></span></span>' : '') +
    '<span class="cl-rc-go" aria-hidden="true">Let go</span></button>';
}

const isDone = (rc) => rc.signed != null || !!rc.passed;
const sizeWord = (rc) => Number(rc.size) ? 'Squad ' + Number(rc.size) + (Number(rc.max) ? '/' + Number(rc.max) : '') : ''; // D5: same "Squad 9/9" as the squad header

/** The card's inside for a mode: null = the list, { id } = "Who leaves?" for that recruit, { id, leave } = "Let X go?" confirm. */
function inner(rc, mode) {
  if (isDone(rc)) {
    const signed = rc.signed != null;
    return '<p class="cl-note cl-done" role="status">' + icoDeco(signed ? 'done' : 'info', 24) + '<span>' +
      esc(signed ? (rc.signed || 'The recruit') + ' joined your squad.' + (rc.left ? ' ' + rc.left + ' left.' : '') : 'You passed on the recruits this season.') + '</span></p>';
  }
  const list = Array.isArray(rc.list) ? rc.list : [];
  const rel = Array.isArray(rc.release) ? rc.release : [];
  const who = mode && list.find((r) => String(r.id) === String(mode.id));
  const gone = who && mode.leave != null && rel.find((r) => String(r.id) === String(mode.leave));
  if (gone) { // D2: one confirm step before a player goes for good
    return '<h3 class="cl-h" tabindex="-1">' + icoDeco('alert', 24) + '<span>' + esc('Let ' + gone.name + ' go?') + '</span></h3>' +
      '<p class="cl-note cl-note--warn">' + icoDeco('info', 24) + '<span>' + esc(who.name + ' joins. ' + gone.name + ' leaves for good.') + '</span></p>' +
      '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-rc-confirm="1">' + icoDeco('done', 24) + '<span>' + esc('Let ' + gone.name + ' go') + '</span></button>' +
      '<button type="button" class="c-btn" data-rc-back="1">' + icoDeco('close', 24) + '<span>Back</span></button></div>';
  }
  if (who) { // D1: a Cancel beside the heading too, so backing out needs no scroll past 9 rows
    return '<div class="cl-rc-head"><h3 class="cl-h" tabindex="-1">' + icoDeco('team', 24) + '<span>Who leaves?</span></h3>' +
      '<button type="button" class="c-btn cl-rc-cancel-top" data-rc-cancel="1">Cancel</button></div>' +
      (rel.length ? '<p class="cl-note">' + icoDeco('info', 24) + '<span>' + esc((sizeWord(rc) ? sizeWord(rc) + ' is full' : 'Squad full') + '. Pick one player to leave so ' + who.name + ' can join. They go for good.') + '</span></p>' +
        '<div class="cl-opts">' + rel.map(leaveRow).join('') + '</div>'
        : '<p class="cl-note cl-note--warn" role="status">' + icoDeco('lock', 24) + '<span>Nobody can leave right now.</span></p>') +
      '<div class="cl-actions"><button type="button" class="c-btn" data-rc-cancel="1">' + icoDeco('close', 24) + '<span>Cancel</span></button></div>';
  }
  return '<h3 class="cl-h" tabindex="-1">' + icoDeco('team', 24) + '<span>Recruits</span></h3>' +
    '<p class="cl-note">' + icoDeco('info', 24) + '<span>' + esc('Sign one for free (wage applies), or pass.' + (sizeWord(rc) ? ' ' + sizeWord(rc) + '.' : '') + (rc.full ? ' Full: one player must leave.' : '')) + '</span></p>' +
    '<ul class="cl-rc-list">' + list.map(recruitRow).join('') + '</ul>' +
    '<div class="cl-actions"><button type="button" class="c-btn" data-rc-pass="1">' + icoDeco('close', 24) + '<span>Pass</span></button></div>';
}

export function recruitCardHtml(rc) {
  if (!rc || (!isDone(rc) && !(Array.isArray(rc.list) && rc.list.length))) return '';
  return '<section class="c-card cl-screen cl-recruits" data-rc aria-label="Recruits">' + inner(rc, null) + '</section>';
}

/** Wire the card inside el (call after each render of el). dispatch(cmd, payload) as views get it. */
export function bindRecruit(el, rc, dispatch) {
  const card = el && el.querySelector && el.querySelector('[data-rc]');
  if (!card || !rc || isDone(rc)) return;
  const focusHead = () => { const h = el.querySelector('[data-rc] .cl-h') || el.querySelector('[data-rc] .cl-done'); if (h && h.focus) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus(); } };
  const show = (mode) => { card.innerHTML = inner(rc, mode); focusHead(); };
  const find = (arr, id) => (arr || []).find((x) => String(x.id) === String(id));
  const focusSel = (sel) => { const b = card.querySelector(sel); if (b && b.focus) b.focus(); else focusHead(); };
  const attr = (v) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));
  let picked = null, leaving = null;
  card.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-rc-sign],[data-rc-leave],[data-rc-confirm],[data-rc-back],[data-rc-cancel],[data-rc-pass]');
    if (!t || !card.contains(t) || t.disabled) return;
    if (t.hasAttribute('data-rc-sign')) {
      const r = find(rc.list, t.getAttribute('data-rc-sign')); if (!r) return;
      const id = r.id; // the vm's own id (number or string), not the attribute text
      if (rc.full) { picked = id; show({ id }); return; }
      dispatch('SignRecruit', { id });
      focusHead();
    } else if (t.hasAttribute('data-rc-leave')) {
      const gone = find(rc.release, t.getAttribute('data-rc-leave'));
      if (picked == null || !gone) return;
      leaving = gone.id; show({ id: picked, leave: leaving });
    } else if (t.hasAttribute('data-rc-confirm')) {
      const id = picked, leaveId = leaving;
      if (id == null || leaveId == null || !find(rc.release, leaveId)) return;
      dispatch('SignRecruit', { id, leaveId });
      focusHead();
    } else if (t.hasAttribute('data-rc-back')) { // back to "Who leaves?", focus on the row that was picked
      const was = leaving; leaving = null; show({ id: picked });
      if (was != null) focusSel('[data-rc-leave="' + attr(was) + '"]');
    } else if (t.hasAttribute('data-rc-cancel')) { // D6: focus returns to the Sign button that opened "Who leaves?"
      const was = picked; picked = null; leaving = null; show(null);
      if (was != null) focusSel('[data-rc-sign="' + attr(was) + '"]');
    } else if (t.hasAttribute('data-rc-pass')) {
      dispatch('PassRecruit', {});
      focusHead();
    }
  });
}
