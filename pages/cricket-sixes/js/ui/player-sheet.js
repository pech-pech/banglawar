/* player-sheet: Player sheet, a bottom sheet (sheet.js). open(vm, dispatch, open); vm = playerVM(id)
   Letters only (SPEC s4): Ability and Potential as a letter, the four ratings as letter + 4-tick bar, no digits.
   Per-player drills are gone (one weekly training session now), so this sheet shows the player and opens the skill tree.
   playerVM keeps its numbers (engine); ratings:[{key, val}] val is raw 1..99, ability.overall is shown 20..200. */
import { openSheet } from './sheet.js';
import { esc, gradeChip, abilityCell, bindActs } from './dom.js';
import { rawCell, deco, roleIcon, typeIcon, spoken } from './letters-ui.js';

const cap = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
const RATING_ICON = { batPower: 'batPower', batSkill: 'batSkill', bowlSpeed: 'bowlSpeed', bowlSkill: 'bowlSkill' };
const RATING_WORD = { batPower: 'Batting Power', batSkill: 'Batting Skill', bowlSpeed: 'Bowling Speed', bowlSkill: 'Bowling Skill' };

function stat(r) {
  const label = RATING_WORD[r.key] || r.key, c = rawCell(r.val);
  return '<div class="lt-stat" aria-label="' + esc(label + ' ' + spoken(c.letter)) + '"><span class="tr-iw">' + deco(RATING_ICON[r.key] || 'train', 24) + '<span>' + esc(label) + '</span></span>' + c.html + '</div>';
}

export function playerHtml(vm) {
  const hidden = vm.grade == null || vm.grade === '' || vm.grade === '?';
  const a = vm.ability || {};
  const lines = [];
  lines.push('<div class="tr-who">' + (vm.age != null ? '<span>Age ' + esc(vm.age) + '</span>' : '') +
    '<span class="tr-iw">' + deco(roleIcon(vm.role), 20) + '<span>' + esc(cap(vm.role)) + '</span></span>' +
    '<span class="tr-iw">' + deco(typeIcon(vm.type), 20) + '<span>' + esc(cap(vm.type)) + '</span></span>' +
    (vm.bench ? '<span class="c-tag tr-bench">Bench</span>' : '') + '</div>');
  lines.push('<div class="tr-abil"><span class="tr-abil__cell"><small>Ability</small>' + abilityCell(a.overall, !!vm.max) + '</span>' +
    '<span class="tr-abil__cell"><small>Potential grade</small>' + gradeChip(vm.grade, vm.pips) + (hidden ? '' : '<small class="tr-grow">how high he can grow</small>') + '</span></div>');
  if (vm.peak) lines.push('<div class="tr-banner">' + deco('peak', 20) + '<span>At peak: training can’t raise this player now. Skill nodes still work.</span></div>');
  if (hidden) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>? = not known yet. It shows after he trains once.</span></p>');
  lines.push('<div class="tr-stats">' + (vm.ratings || []).map(stat).join('') + '</div>');
  if (vm.capLine) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>' + esc(vm.capLine) + '</span></p>');
  const n = vm.node || {};
  lines.push('<button type="button" class="c-btn tr-tree" data-act="sheet:tree" data-arg="' + esc(JSON.stringify({ id: vm.id })) + '">' + deco('upgrade', 24) +
    '<span>Skill tree</span>' + (n.cost != null ? '<span class="tr-treecost">' + deco('tp', 20) + '<b>' + esc(n.cost) + '</b></span>' : '') + '</button>');
  return lines.join('');
}

export function open(vm, dispatch, openFn) {
  const close = openSheet(vm.name, playerHtml(vm));
  const root = document.querySelector('.sheet-fixed');
  if (!root) return close;
  root.classList.add('tr-tall');
  bindActs(root, (cmd, arg) => { close(); dispatch(cmd, arg); }, (name, arg) => { close(); if (openFn) openFn(name, arg); });
  return close;
}
