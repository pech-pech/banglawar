/* training-view: screen 5, the training week list. render(el, vm, dispatch, open). Reads trainingVM only.
   trainingVM = { tp, week, done, total, coachLine,
     drillCost?: 15,
     rows: [{ id, name, bench, role:'Opener'|'Middle'|'Lower', type:'Fast'|'Medium'|'Spin', ability, max, grade, pips,
              status:'drill'|'+n'|'peak'|'done', gainRating?: 'batPower'|'batSkill'|'bowlSpeed'|'bowlSkill' }] }
   Taps: a row -> `sheet:player {id}`; the coach row -> `sheet:coaches {}`; End week -> command EndWeek.
   `open(name, arg)` is optional; app.js maps it to the sheet modules. */
import { esc, ico, btn, ctaBar, gradeChip, abilityCell } from './dom.js';
import { bindActs } from './dom.js';

export const ROLE_ICON = { opener: 'roleOpener', middle: 'roleMiddle', lower: 'roleLower' };
export const TYPE_ICON = { fast: 'typeFast', medium: 'typeMedium', spin: 'typeSpin' };
export const RATING_ICON = { batPower: 'batPower', batSkill: 'batSkill', bowlSpeed: 'bowlSpeed', bowlSkill: 'bowlSkill' };
export const RATING_WORD = { batPower: 'Batting Power', batSkill: 'Batting Skill', bowlSpeed: 'Bowling Speed', bowlSkill: 'Bowling Skill' };
export const roleIcon = (r) => ROLE_ICON[String(r || '').toLowerCase()] || 'roleMiddle';
export const typeIcon = (t) => TYPE_ICON[String(t || '').toLowerCase()] || 'typeMedium';
const cap = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
/** A decorative icon (the words beside it carry the meaning). */
export const deco = (name, size) => ico(name, size || 20).replace('<img', '<img aria-hidden="true"');
/** Icon + word, kept together. */
export const iw = (name, word) => '<span class="tr-iw">' + deco(name, 20) + '<span>' + esc(word) + '</span></span>';
/** TP chip: tp icon, number, word (dom.tpChip draws a coin, and coins are cut from milestone 0). */
export const tp = (n) => '<span class="c-chip chip m0-tp tr-tp" aria-label="' + esc(n) + ' training points">' + deco('tp', 20) + '<b>' + esc(n) + '</b><span>TP</span></span>';
/** 2A: the Peak tag, icon + word. */
export const peak = () => '<span class="c-tag m0-peak tr-peak" aria-label="At peak">' + deco('peak', 20) + '<span>Peak</span></span>';

function status(r) {
  const s = String(r.status || '');
  if (s === 'drill') return '<span class="tr-st tr-st--todo">Not drilled</span>';
  if (s === 'peak') return peak();
  if (s === 'done') return '<span class="c-tag c-tag--done tr-st">Done</span>';
  if (s.charAt(0) === '+') return '<span class="c-tag tr-st">' + (r.gainRating ? deco(RATING_ICON[r.gainRating] || 'train', 20) : '') + '<span>' + esc(s) + '</span></span>';
  return '<span class="c-tag tr-st">' + esc(s) + '</span>';
}

function rowHtml(r) {
  const peakNow = r.status === 'peak';
  const hidden = r.grade == null || r.grade === '' || r.grade === '?';
  const label = r.name + (r.bench ? ', bench' : '') + ', ' + cap(r.role) + ', ' + cap(r.type) + ', ability ' + r.ability + (r.max ? ', capped at potential' : '') +
    (hidden ? ', grade hidden, ' + (r.pips || 0) + ' of 5 drills' : ', grade ' + r.grade) +
    ', ' + (r.status === 'drill' ? 'not drilled yet' : r.status === 'peak' ? 'at peak, drills cannot raise him' : r.status === 'done' ? 'done this week' : 'drilled ' + r.status);
  return '<li class="c-row m0-row c-row--tap tr-row' + (r.bench ? ' m0-row--bench' : '') + (peakNow ? ' tr-row--peak' : '') + '" role="button" tabindex="0"' +
    ' data-act="sheet:player" data-arg="' + esc(JSON.stringify({ id: r.id })) + '" aria-label="' + esc(label) + '">' +
    '<span class="c-row__body"><span class="tr-name-line"><span class="c-row__title name tr-name">' + esc(r.name) + '</span>' + (r.bench ? '<span class="c-tag tr-bench">Bench</span>' : '') + '</span>' +
    '<span class="c-row__sub tr-sub">' + deco(roleIcon(r.role), 20) + deco(typeIcon(r.type), 20) + status(r) + '</span>' +
    (peakNow ? '<span class="c-row__sub tr-peaksub">At peak: drills can’t raise him</span>' : '') +
    (r.max && !hidden ? '<span class="c-row__sub tr-capsub">Capped at potential ' + esc(r.ability) + '</span>' : '') + '</span>' +
    '<span class="c-row__end tr-end">' + abilityCell(r.ability, !!r.max) + gradeChip(r.grade, r.pips) + '</span></li>';
}

export function render(el, vm, dispatch, open) {
  const rows = vm.rows || [];
  const legend = Object.keys(RATING_WORD).map((k) => '<span class="tr-leg">' + deco(RATING_ICON[k], 20) + '<span>' + esc(RATING_WORD[k]) + '</span></span>').join('');
  el.innerHTML =
    '<div class="screen tr-screen">' +
    '<div class="c-strip strip tr-top"><span>' + deco('train', 24) + ' Training · Week ' + esc(vm.week) + '</span><span class="c-strip__right tr-tpw">' + tp(vm.tp) + '</span></div>' +
    '<div class="tr-count" role="status">' + deco('done', 20) + '<span>' + esc(vm.done) + ' of ' + esc(vm.total) + ' drilled</span><span class="tr-hint">Each drill costs ' + esc(vm.drillCost || 15) + ' TP</span></div>' +
    '<ul class="c-list m0-list tr-list" aria-label="Your squad">' +
    '<li class="c-row m0-row c-row--tap tr-coachrow" role="button" tabindex="0" data-act="sheet:coaches" aria-label="Coaches. ' + esc(vm.coachLine) + '">' +
    '<span class="tr-coachico">' + deco('coach', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">Coaches</span><span class="c-row__sub">' + esc(vm.coachLine) + '</span></span></li>' +
    rows.map(rowHtml).join('') + '</ul>' +
    '<div class="tr-legend" aria-label="What the rating icons mean">' + legend + '</div>' +
    ctaBar(btn('End week', 'EndWeek', { kind: 'cta' })) +
    '</div>';
  bindActs(el.firstElementChild, dispatch, open);
}
