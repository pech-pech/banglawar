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
import { roleIcon, typeIcon, deco, iw, peak, chip, RATING_ICON, RATING_WORD } from './training-view.js';

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

const SHORT = { week: 'Done', tp: 'No TP', peak: 'Peak', balance: 'Full', max: 'Max' };
/** A drill button (P11): rating icon + name, a bar (now, gold = most he can gain), "up to +N", and the TP chip. */
function drillBtn(vm, d) {
  const locked = !!d.locked, plus = Number(d.plus) || 0, cost = vm.drillCost || 15;
  const bar = '<span class="tr-bar" aria-hidden="true"><i style="width:' + pct(d.now) + '%"></i><i class="is-gain" style="left:' + pct(d.now) + '%;width:' + Math.min(100, plus * 4 / 99 * 100).toFixed(1) + '%"></i></span>';
  const ln = locked
    ? '<span class="tr-dl">' + iw('lock', SHORT[d.why] || 'Full') + chip(cost) + '</span>'
    : '<span class="tr-dl"><b class="tr-v">' + esc(d.now) + '</b>' + bar + '<span class="tr-plus">up to +' + plus + '</span>' + chip(cost) + '</span>';
  return '<button type="button" class="c-btn tr-drill' + (locked ? ' is-disabled' : '') + '"' + (locked ? ' disabled aria-disabled="true"' : '') +
    ' data-act="Drill" data-arg="' + esc(JSON.stringify({ playerId: vm.id, drillId: d.id })) + '" aria-label="' +
    esc(d.name + (locked ? ', ' + (d.reason || 'locked') : ': ' + (RATING_WORD[d.rating] || '') + ' ' + d.now + ', up to plus ' + plus + ', costs ' + cost + ' Training Points')) + '">' +
    '<span class="tr-dh">' + deco(locked ? 'lock' : (RATING_ICON[d.rating] || 'upgrade'), 24) + '<span>' + esc(d.name) + '</span></span>' + ln + '</button>';
}

export function playerHtml(vm) {
  const hidden = vm.grade == null || vm.grade === '' || vm.grade === '?';
  const a = vm.ability || {};
  const lines = [];
  lines.push('<div class="tr-who">' + (vm.age != null ? '<span>Age ' + esc(vm.age) + '</span>' : '') +
    '<span class="tr-iw">' + deco(roleIcon(vm.role), 20) + '<span>' + esc(cap(vm.role)) + '</span></span>' +
    '<span class="tr-iw">' + deco(typeIcon(vm.type), 20) + '<span>' + esc(cap(vm.type)) + '</span></span>' +
    (vm.bench ? '<span class="c-tag tr-bench">Bench</span>' : '') + '</div>');
  lines.push('<div class="tr-abil"><span class="tr-abil__cell"><small>Ability <span class="tr-of">/200</span></small>' + abilityCell(a.overall, !!vm.max) + '</span>' +
    '<span class="tr-abil__cell"><small>Potential grade</small>' + gradeChip(vm.grade, vm.pips) + (hidden ? '' : '<small class="tr-grow">how high he can grow</small>') + '</span>' +
    '<span class="tr-abil__cell"><small>Potential <span class="tr-of">/200</span></small>' + (hidden || vm.potential == null ? '<b class="tr-q">?</b>' : '<b>' + esc(vm.potential) + '</b>') + '</span></div>');
  if (vm.peak) lines.push('<div class="tr-banner">' + peak() + '<span>Drills can’t raise this player now. Skill nodes still work.</span></div>');
  if (hidden) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>? = not known yet. Shows after 1 practice drill (' + esc(vm.pips || 0) + ' of 1 done).</span></p>');
  lines.push('<div class="tr-stats">' + (vm.ratings || []).map(stat).join('') + '</div>');
  if (vm.capLine) lines.push('<p class="tr-note">' + deco('info', 20) + '<span>' + esc(vm.capLine) + '</span></p>');
  lines.push('<div class="tr-h"><b>Pick a drill</b></div>');
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

/** Drill result card (P11): big +N, Was / Now bars (old part, gold gain block at least 6 px a point), grade chip that flashes on a reveal. */
export function resultHtml(vm) {
  const before = Number(vm.before) || 0, gain = Number(vm.gain) || 0, after = Number(vm.after) || before + gain;
  const hidden = vm.grade == null || vm.grade === '?';
  const word = vm.word + (vm.word === 'Great' ? '!' : '');
  const icon = deco(RATING_ICON[vm.rating] || 'upgrade', 48).replace('class="icon"', 'class="icon tr-rico"');
  const wasBar = '<div class="c-stat c-stat--mid tr-stat tr-was" aria-label="Was ' + esc(before) + '"><span class="c-stat__label">Was</span><span class="c-stat__track"><i class="c-stat__fill" style="--v:' + pct(before) + '%"></i></span><b class="c-stat__val">' + esc(before) + '</b></div>';
  const nowBar = '<div class="c-stat c-stat--mid tr-stat tr-now" aria-label="Now ' + esc(after) + ', up ' + esc(gain) + '"><span class="c-stat__label">Now</span><span class="c-stat__track"><i class="c-stat__fill tr-oldpart" style="--v:' + pct(before) + '%"></i>' +
    '<i class="tr-gainblock" style="left:' + pct(before) + '%;--n:' + gain + ';--g:' + pct(gain) + '%"></i></span><b class="c-stat__val tr-nowv">' + esc(after) + '</b></div>';
  return '<div class="tr-res" data-gain="' + gain + '" data-before="' + before + '">' +
    '<div class="tr-res__top"><span class="tr-res__who"><b>' + esc(vm.name) + '</b><span class="tr-iw">' + deco(RATING_ICON[vm.rating] || 'upgrade', 20) + '<span>' + esc(vm.drillName) + '</span></span></span>' +
    '<span class="tr-gradebox' + (vm.revealed ? ' is-reveal' : '') + '">' + gradeChip(vm.grade, hidden ? 0 : 1) + '</span></div>' +
    '<div class="tr-res__big" role="status"><span class="tr-bigico">' + icon + '</span><b class="tr-bignum" aria-label="plus ' + esc(gain) + '">+<span class="tr-bignum__n">' + esc(gain) + '</span></b>' +
    '<span class="c-tag tr-qual' + (vm.word === 'Great' ? ' c-tag--done' : '') + '">' + (vm.word === 'Great' ? deco('burst', 20) : '') + '<span>' + esc(word) + '</span></span></div>' +
    wasBar + nowBar +
    (vm.revealed ? '<p class="tr-reveal-line" role="status">' + deco('medal', 24) + '<span>Potential grade found: ' + esc(vm.grade) + '</span></p>' : '') +
    (vm.cut ? '<p class="tr-note">' + deco('info', 20) + '<span>Balance limit trimmed the gain</span></p>' : '') +
    '<p class="tr-note">' + deco('coach', 20) + '<span>' + esc(vm.coachLine) + (vm.coachXp ? ' · ' + esc(vm.coachXp) : '') + '</span></p>' +
    '<p class="tr-left">' + iw('tp', vm.tp + ' TP left') + iw('done', vm.left + ' to drill') + '</p>' +
    '<div class="tr-res__btns">' +
    (vm.next ? btn('Next: ' + vm.next.name, 'sheet:player', { kind: 'primary', arg: { id: vm.next.id } }) : '') +
    btn('Back to list', 'sheet:close') + '</div></div>';
}

export function openResult(vm, dispatch, openFn) {
  const close = openSheet('Drill result', resultHtml(vm));
  const root = sheetRoot();
  if (!root) return close;
  bindActs(root, dispatch, (name, arg) => { close(); if (name !== 'close' && openFn) openFn(name, arg); });
  stepCount(root);
  return close;
}

/** +N and the Now value step up in three frames (150 ms). Reduced motion: the final frame at once (CSS also drops the bar and flash animation). */
export function stepCount(root) {
  const card = root && root.querySelector('.tr-res');
  if (!card || typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const G = Number(card.getAttribute('data-gain')) || 0, B = Number(card.getAttribute('data-before')) || 0;
  const big = card.querySelector('.tr-bignum__n'), now = card.querySelector('.tr-nowv');
  if (!big || !now || G < 2) return;
  const show = (v) => { if (card.isConnected) { big.textContent = String(v); now.textContent = String(B + v); } };
  show(Math.round(G / 3));
  setTimeout(() => show(Math.round(G * 2 / 3)), 150);
  setTimeout(() => show(G), 300);
}
