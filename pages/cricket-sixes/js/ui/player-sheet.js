/* player-sheet: 5a Player sheet and 5b Drill result, both bottom sheets (sheet.js).
   open(vm, dispatch, open)       vm = playerVM(id)
   openResult(vm, dispatch, open) vm = drillResultVM
   playerVM = { id, name, bench, age, role, type, grade, pips, peak, max, potential|null, previews, tp, drillCost,
     ability:{bat, bowl, overall},
     ratings:[{key:'batPower'|'batSkill'|'bowlSpeed'|'bowlSkill', val, limit}],   limit = highest a drill can take it now
     limitLine, capLine|null,                                                    plain-words lines
     drills:[{id, name, rating, goodPlus, coachLine, room|null, locked, reason|null}],
     node:{cost|null, label} }
   drillResultVM = { id, name, grade, pips, drillName, word:'Okay'|'Good'|'Great', rating, gain, before, after,
     odds:{okay, good, great}, cut:boolean, coachLine, coachXp, tp, left, next:{id,name}|null }
   Commands: Drill {playerId, drillId} then open('result', {id}); `sheet:tree {id}` opens the skill tree.
   Closing is always safe: nothing here keeps state. */
import { openSheet } from './sheet.js';
import { esc, btn, gradeChip, abilityCell, bindActs } from './dom.js';
import { roleIcon, typeIcon, deco, iw, peak, RATING_ICON, RATING_WORD } from './training-view.js';

const cap = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
const pct = (v) => Math.max(0, Math.min(100, (Number(v) || 0) / 99 * 100));
const sheetRoot = () => document.querySelector('.sheet-fixed');

function stat(r) {
  const label = RATING_WORD[r.key] || r.key;
  return '<div class="c-stat c-stat--mid tr-stat" aria-label="' + esc(label + ' ' + r.val + (r.limit != null ? ', limit ' + r.limit : '')) + '">' +
    '<span class="c-stat__label tr-statl">' + deco(RATING_ICON[r.key] || 'train', 24) + '<span>' + esc(label) + '</span></span>' +
    '<span class="c-stat__track"><i class="c-stat__fill" style="--v:' + pct(r.val) + '%"></i>' +
    (r.limit != null ? '<i class="c-stat__mark" style="--m:' + pct(r.limit) + '%"></i>' : '') + '</span>' +
    '<b class="c-stat__val">' + esc(r.val) + '</b></div>';
}

function drillBtn(vm, d) {
  const locked = !!d.locked;
  const body = '<span class="tr-drill__ico">' + deco(locked ? 'lock' : (RATING_ICON[d.rating] || 'train'), 24) + '</span>' +
    '<span class="tr-drill__txt"><b class="tr-drill__name">' + esc(d.name) + '</b>' +
    '<span class="tr-drill__sub">' + (locked ? esc(d.reason || 'Locked') : 'Good+ ' + esc(d.goodPlus) + '% · ' + esc(d.coachLine || 'No coach here')) + '</span>' +
    (!locked && d.room ? '<span class="tr-drill__sub">' + esc(d.room) + '</span>' : '') + '</span>' +
    '<span class="tr-drill__cost">' + (locked ? '' : deco('tp', 20) + '<b>' + esc(vm.drillCost || 15) + '</b>') + '</span>';
  return '<button type="button" class="c-btn tr-drill' + (locked ? ' is-disabled' : '') + '"' + (locked ? ' disabled aria-disabled="true"' : '') +
    ' data-act="Drill" data-arg="' + esc(JSON.stringify({ playerId: vm.id, drillId: d.id })) + '" aria-label="' +
    esc(d.name + (locked ? ', locked: ' + (d.reason || '') : ', good or better ' + d.goodPlus + ' percent, ' + (d.coachLine || 'no coach here') + ', costs ' + (vm.drillCost || 15) + ' training points')) + '">' + body + '</button>';
}

export function playerHtml(vm) {
  const hidden = vm.grade == null || vm.grade === '' || vm.grade === '?';
  const a = vm.ability || {};
  const lines = [];
  lines.push('<div class="tr-who">' + (vm.age != null ? '<span>Age ' + esc(vm.age) + '</span>' : '') +
    '<span class="tr-iw">' + deco(roleIcon(vm.role), 20) + '<span>' + esc(cap(vm.role)) + '</span></span>' +
    '<span class="tr-iw">' + deco(typeIcon(vm.type), 20) + '<span>' + esc(cap(vm.type)) + '</span></span>' +
    (vm.previews != null ? '<span>Sees ' + esc(vm.previews) + (Number(vm.previews) === 1 ? ' matchup' : ' matchups') + '</span>' : '') +
    (vm.bench ? '<span class="c-tag tr-bench">Bench</span>' : '') + '</div>');
  lines.push('<div class="tr-abil"><span class="tr-abil__cell"><small>Ability <span class="tr-of">/200</span></small>' + abilityCell(a.overall, !!vm.max) + '</span>' +
    '<span class="tr-abil__cell"><small>Potential grade</small>' + gradeChip(vm.grade, vm.pips) + (hidden ? '' : '<small class="tr-grow">how high he can grow</small>') + '</span>' +
    '<span class="tr-abil__cell"><small>Potential <span class="tr-of">/200</span></small>' + (hidden || vm.potential == null ? '<b class="tr-q">?</b>' : '<b>' + esc(vm.potential) + '</b>') + '</span></div>');
  lines.push('<p class="tr-note">' + deco('info', 20) + '<span>Ability and Potential use a 20 to 200 scale that blends the four ratings (each rating is 1 to 99).</span></p>');
  if (vm.peak) lines.push('<div class="tr-banner">' + peak() + '<span>Drills can’t raise this player now. Skill nodes still work.</span></div>');
  if (hidden) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>? = not known yet. Shows after 1 practice drill (' + esc(vm.pips || 0) + ' of 1 done).</span></p>');
  lines.push('<div class="tr-stats">' + (vm.ratings || []).map(stat).join('') + '</div>');
  if (vm.limitLine) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>' + esc(vm.limitLine) + '</span></p>');
  if (vm.capLine) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>' + esc(vm.capLine) + '</span></p>');
  lines.push('<div class="tr-h"><b>Pick a drill</b><span class="tr-hcost">' + deco('tp', 20) + esc(vm.drillCost || 15) + ' each</span></div>');
  lines.push('<div class="tr-drills">' + (vm.drills || []).map((d) => drillBtn(vm, d)).join('') + '</div>');
  const n = vm.node || {};
  lines.push('<button type="button" class="c-btn tr-tree" data-act="sheet:tree" data-arg="' + esc(JSON.stringify({ id: vm.id })) + '">' + deco('upgrade', 24) +
    '<span>Skill tree</span>' + (n.cost != null ? '<span class="tr-treecost">' + deco('tp', 20) + '<b>' + esc(n.cost) + '</b></span>' : '') + '</button>');
  return lines.join('');
}

export function open(vm, dispatch, openFn) {
  const close = openSheet(vm.name, playerHtml(vm));
  const root = sheetRoot();
  if (!root) return close;
  root.classList.add('tr-tall');
  bindActs(root, (cmd, arg) => {
    close();
    dispatch(cmd, arg);
    if (cmd === 'Drill' && openFn) openFn('result', { id: arg.playerId });
  }, (name, arg) => { close(); if (openFn) openFn(name, arg); });
  return close;
}

export function resultHtml(vm) {
  const before = Number(vm.before) || 0, gain = Number(vm.gain) || 0;
  const words = [['Okay', vm.odds && vm.odds.okay], ['Good', vm.odds && vm.odds.good], ['Great', vm.odds && vm.odds.great]];
  const hit = words.map((w) => '<span class="c-tag tr-odd' + (w[0] === vm.word ? ' c-tag--done tr-odd--hit' : '') + '"' + (w[0] === vm.word ? ' aria-label="' + w[0] + ' ' + esc(w[1]) + ' percent, this is what you got"' : '') + '>' +
    esc(w[0]) + ' ' + esc(w[1]) + '%</span>').join('');
  return '<div class="tr-res">' +
    (vm.revealed ? '<div class="tr-reveal" role="status">' + deco('medal', 36) + '<span class="tr-reveal__t">Potential grade found: ' + gradeChip(vm.grade, 5) + '</span></div>' : '') +
    '<div class="tr-res__head"><small>' + esc(vm.name) + ' · ' + (vm.grade == null || vm.grade === '?' ? 'Potential grade not known yet' : 'Potential grade ' + esc(vm.grade)) + '</small><h4 class="tr-res__word">' + esc(vm.drillName) + ': ' + esc(vm.word) + '</h4></div>' +
    '<div class="tr-res__gain"><span class="c-tag tr-gaintag">' + deco(RATING_ICON[vm.rating] || 'train', 20) + '<span>+' + esc(gain) + '</span></span><b>' + esc(RATING_WORD[vm.rating] || '') + ' ' + esc(vm.before) + ' to ' + esc(vm.after) + '</b></div>' +
    '<div class="c-stat c-stat--mid tr-stat"><span class="c-stat__label">' + deco(RATING_ICON[vm.rating] || 'train', 24) + '</span><span class="c-stat__track"><i class="c-stat__fill" style="--v:' + pct(before) + '%"></i><i class="c-stat__gain" style="--v:' + pct(before) + '%;--g:' + pct(gain) + '%"></i></span><b class="c-stat__val">' + esc(vm.after) + '</b></div>' +
    '<div class="tr-odds" role="group" aria-label="Chances">' + hit + '</div>' +
    (vm.cut ? '<p class="tr-note">' + deco('info', 20) + '<span>Cut short: the balance limit trimmed the gain.</span></p>' : '') +
    '<p class="tr-note">' + deco('coach', 20) + '<span>' + esc(vm.coachLine) + (vm.coachXp ? ' · ' + esc(vm.coachXp) : '') + '</span></p>' +
    '<p class="tr-left">' + iw('tp', vm.tp + ' TP left') + iw('train', vm.left + ' still to drill') + '</p>' +
    '<div class="tr-res__btns">' +
    (vm.next ? btn('Next: ' + vm.next.name, 'sheet:player', { kind: 'primary', arg: { id: vm.next.id } }) : '') +
    btn('Back to list', 'sheet:close') + '</div></div>';
}

export function openResult(vm, dispatch, openFn) {
  const close = openSheet('Drill result', resultHtml(vm));
  const root = sheetRoot();
  if (!root) return close;
  bindActs(root, dispatch, (name, arg) => { close(); if (name !== 'close' && openFn) openFn(name, arg); });
  return close;
}
