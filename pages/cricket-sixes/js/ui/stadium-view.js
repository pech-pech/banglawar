/* stadium-view: the stadium and the seven fixed facility slots (Stands, Gym, Shop, Nets, Pitch, Academy, Scout).
   renderStadium(root, state, dispatch) draws into root. Tapping a slot opens a plain confirm panel inside the view; "Yes, build" dispatches
   startBuild { what } (what = a buildOptions() key: a facility id or 'stadium'). The view only reads state.econ and buildOptions(). openStadium() = same in a sheet. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { fmt, fansBarsHtml } from './club-money-view.js';
import * as eco from '../core/economy.js';

export const SLOTS = [
  { id: 'stands', name: 'Stands', icon: 'fan', does: 'more Fans and seats' },
  { id: 'gym', name: 'Gym', icon: 'train', does: 'more training points each match' },
  { id: 'shop', name: 'Shop', icon: 'shop', does: 'more Coins each match' },
  { id: 'nets', name: 'Nets', icon: 'batSkill', does: 'better drills' },
  { id: 'pitch', name: 'Pitch', icon: 'home', does: 'a small bonus for one kind of bowler' },
  { id: 'academy', name: 'Academy', icon: 'team', does: 'better young players to sign' },
  { id: 'scout', name: 'Scout', icon: 'scout', does: 'a clearer look at rivals and recruits' },
];
/* Effect by level 0..5 (GAME-DESIGN.md, Stadium and facilities). Plain words; digits are Fans, Coins, TP, not ratings. */
export const EFFECT = {
  stands: ['none', '+5 Fans, seats as built', '+10 Fans, +10% seats', '+15 Fans, +20% seats', '+20 Fans, +30% seats', '+25 Fans, +40% seats'],
  shop: ['none', '+6 Coins', '+12 Coins', '+22 Coins', '+34 Coins', '+50 Coins'],
  nets: ['none', 'drills +0', 'drills +3', 'drills +6', 'drills +9', 'drills +12'],
  gym: ['none', '+17 TP', '+20 TP', '+23 TP', '+26 TP', '+29 TP'],
  pitch: ['none', 'bonus +1', 'bonus +1', 'bonus +2', 'bonus +2', 'bonus +3'],
  academy: ['none', '1 offered', 'better odds', 'choose from 2', 'better odds', 'choose from 3'],
  scout: ['none', 'blur +/-16', 'blur +/-13', 'blur +/-10', 'blur +/-7', 'blur +/-4'],
};
/** "now -> next" in words, e.g. "Now +12 Coins, next +22 Coins a match". */
export function effectLine(id, lvl) {
  const t = EFFECT[id]; if (!t) return '';
  const now = t[Math.min(5, lvl)];
  return lvl >= 5 ? 'Now ' + now + ' (top)' : 'Now ' + now + ', next ' + t[lvl + 1];
}
const SEATS = [0, 500, 650, 900, 1250, 1700];
const econOf = (s) => (s && s.econ) || {};
const opts = (s) => { try { return eco.buildOptions(s) || []; } catch (_) { return []; } };

function pips(level, max) {
  let h = '';
  for (let i = 1; i <= max; i++) h += '<i class="ec-pip' + (i <= level ? ' is-on' : '') + '"></i>';
  return '<span class="ec-pips" aria-hidden="true">' + h + '</span>';
}
const levelWord = (l) => (l > 0 ? 'Level ' + l + ' of 5' : 'Not built');

function slotBtn(slot, s, optList) {
  const e = econOf(s), lvl = (e.fac && e.fac[slot.id]) || 0, b = e.build;
  const building = b && b.what === slot.id;
  const o = optList.find((x) => x.what === slot.id);
  let state, tag;
  if (building) { state = 'Building: ' + b.left + (b.left === 1 ? ' match' : ' matches') + ' left'; tag = 'build'; }
  else if (!o) { state = 'Top level'; tag = 'done'; }
  else if (o.ok) { state = (lvl ? 'Upgrade' : 'Build') + ' for ' + fmt(o.coins) + ' Coins'; tag = 'upgrade'; }
  else { state = o.why || 'Locked'; tag = 'lock'; }
  return '<button type="button" class="c-btn ec-slot' + (lvl ? '' : ' is-empty') + (building ? ' is-building' : '') + '" data-econ-pick="' + slot.id + '" aria-label="' +
    esc(slot.name + ', ' + levelWord(lvl) + '. ' + effectLine(slot.id, lvl) + '. ' + state) + '">' + icoDeco(slot.icon, 24) + '<span class="ec-slot__n">' + esc(slot.name) + '</span>' + pips(lvl, 5) + '<span class="ec-slot__e">' + esc(effectLine(slot.id, lvl)) + '</span>' +
    '<span class="ec-slot__s">' + icoDeco(tag, 16) + '<span>' + esc(state) + '</span></span></button>';
}

function stadiumHead(s, optList) {
  const e = econOf(s), lvl = e.stadium || 1, o = optList.find((x) => x.what === 'stadium'), b = e.build;
  const building = b && b.what === 'stadium';
  let act;
  if (building) act = '<p class="ec-note">' + icoDeco('build', 24) + '<span>Building level ' + esc(b.level) + ': ' + esc(b.left) + (b.left === 1 ? ' match' : ' matches') + ' left. You can still play.</span></p>';
  else if (!o) act = '<p class="ec-note">' + icoDeco('done', 24) + '<span>Biggest stadium. Nothing more to build here.</span></p>';
  else act = '<button type="button" class="c-btn ec-big' + (o.ok ? ' c-btn--primary' : '') + '" data-econ-pick="stadium">' + icoDeco(o.ok ? 'upgrade' : 'lock', 24) +
    '<span class="ec-big__t"><span>Next stadium: level ' + esc(o.level) + '</span><small>' + (o.ok ? fmt(o.coins) + ' Coins' : esc(o.why || 'Not ready yet')) + '</small></span></button>';
  return '<section class="c-card ec-stad" aria-label="Stadium">' + '<h3 class="c-strip c-strip--light"><span>' + icoDeco('home', 24) + ' Stadium level ' + esc(lvl) + '</span><span class="c-strip__right">' + fmt(SEATS[lvl] || 0) + ' seats</span></h3>' +
    '<p class="ec-stad__line">League ' + esc(lvl) + ' needs stadium level ' + esc(lvl) + '. A facility cannot be higher than the stadium.</p>' + act + '</section>';
}

/** The plain confirm panel for one build. */
function confirmHtml(id, s, optList) {
  const e = econOf(s), slot = SLOTS.find((x) => x.id === id);
  const name = id === 'stadium' ? 'Stadium' : slot.name;
  const o = optList.find((x) => x.what === id);
  const back = '<button type="button" class="c-btn ec-back" data-econ-back="1">' + icoDeco('close', 24) + '<span>No, go back</span></button>';
  if (!o) return '<div class="screen ec-screen ec-confirm"><h3 class="ec-h">' + esc(name) + '</h3><p class="ec-note">' + icoDeco('done', 24) + '<span>Nothing more to build here.</span></p>' + back + '</div>';
  const left = (Number(e.coins) || 0) - (Number(o.coins) || 0);
  const need = Number(o.fansGate) || 0;
  const fansLine = need ? '<li>' + icoDeco('fan', 24) + '<span>Fans needed to start: ' + fmt(need) + ' (you have ' + fmt(e.fans) + ')' + '</span></li>' : '';
  const ok = !!o.ok;
  return '<div class="screen ec-screen ec-confirm"><h3 class="ec-h">Build ' + esc(name) + ' level ' + esc(o.level) + '?</h3>' +
    (slot ? '<p class="ec-note">' + icoDeco(slot.icon, 24) + '<span>' + esc(name) + ' gives ' + esc(slot.does) + '. ' + esc(effectLine(id, o.level - 1)) + '.</span></p>' : '') +
    '<ul class="ec-facts"><li>' + icoDeco('coin', 24) + '<span>Cost: ' + fmt(o.coins) + ' Coins</span></li>' +
    '<li>' + icoDeco('build', 24) + '<span>Takes ' + (o.matches ? o.matches + (o.matches === 1 ? ' match' : ' matches') : 'no matches. It is ready now') + '</span></li>' + fansLine +
    '<li>' + icoDeco('coin', 24) + '<span>Coins after: ' + (ok ? fmt(left) : 'not enough or locked') + '</span></li></ul>' +
    (ok ? '' : '<p class="ec-note ec-note--warn" role="status">' + icoDeco('lock', 24) + '<span>' + esc(o.why || 'Not ready yet.') + '</span></p>') +
    '<div class="ec-actions"><button type="button" class="c-btn c-btn--primary" data-econ-act="startBuild" data-what="' + esc(id) + '"' + (ok ? '' : ' disabled aria-disabled="true"') + '>' + icoDeco('build', 24) + '<span>Yes, build</span></button>' + back + '</div></div>';
}

export function renderStadium(root, state, dispatch) {
  const optList = opts(state);
  const pick = root.__ecPick || null;
  if (pick && (pick === 'stadium' || SLOTS.some((x) => x.id === pick))) root.innerHTML = confirmHtml(pick, state, optList);
  else {
    root.__ecPick = null;
    const e = econOf(state);
    root.innerHTML = '<div class="screen ec-screen ec-stadium">' + '<p class="ec-purse" aria-label="' + esc(fmt(e.coins) + ' Coins, ' + fmt(e.fans) + ' Fans') + '">' + icoDeco('coin', 24) + '<b>' + fmt(e.coins) + '</b> Coins ' + icoDeco('fan', 24) + '<b>' + fmt(e.fans) + '</b> Fans</p>' +
      stadiumHead(state, optList) + '<h3 class="ec-h">Facilities</h3><div class="ec-slots">' + SLOTS.map((x) => slotBtn(x, state, optList)).join('') + '</div>' + fansBarsHtml(state) + '</div>';
  }
  if (!root.__ecBound) {
    root.__ecBound = true;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-econ-pick],[data-econ-back],[data-econ-act]');
      if (!t || !root.contains(t) || t.disabled) return;
      if (t.hasAttribute('data-econ-pick')) { root.__ecPick = t.getAttribute('data-econ-pick'); renderStadium(root, root.__ecState, dispatch); const y = root.querySelector('.ec-actions .c-btn,.ec-back'); if (y) y.focus(); }
      else if (t.hasAttribute('data-econ-back')) { const was = root.__ecPick; root.__ecPick = null; renderStadium(root, root.__ecState, dispatch); const b = root.querySelector('[data-econ-pick="' + was + '"]'); if (b) b.focus(); }
      else { const what = t.getAttribute('data-what'); root.__ecPick = null; dispatch('startBuild', { what }); }
    });
  }
  root.__ecState = state;
  return root;
}

export function openStadium(state, dispatch) {
  const host = document.createElement('div');
  let close;
  const wrap = (name, arg) => { dispatch(name, arg); if (close) close(); };
  renderStadium(host, state, wrap);
  close = openSheet('Stadium', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
