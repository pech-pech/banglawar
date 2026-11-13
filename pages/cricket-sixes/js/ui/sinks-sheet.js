/* sinks-sheet: late sinks (Coins), the Medal shop, and the Legacy Project, each with a plain confirm panel.
   renderSinks(root, state, dispatch) draws into root. Dispatches: buySink { id }, buyMedal { id }, buyLegacy {}.
   Reads eco.sinkOptions / medalShop / legacyOffer / fansBars. Item fields used: id, name, coins, medals, ok, why ('Done' = bought). Legacy offer: name, price, fans, ok, why.
   openSinks(state, dispatch) shows it in a bottom sheet. Digits are fine: Coins and Medals are currencies. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { fmt, fansBarsHtml } from './club-money-view.js';
import * as eco from '../core/economy.js';

const econOf = (s) => (s && s.econ) || {};
const safe = (f, s) => { try { return f(s); } catch (_) { return null; } };
/** "Trophy Cabinet (gold trim)" -> { title, note }. */
export function splitName(n) {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(String(n || ''));
  return m ? { title: m[1], note: m[2] } : { title: String(n || ''), note: '' };
}
const isDone = (o) => !o.ok && (o.why === 'Done' || /^Already/.test(o.why || ''));
const medalWords = (n) => fmt(n) + (n === 1 ? ' Medal' : ' Medals');
const priceWords = (o) => (o.medals ? medalWords(o.medals) : fmt(o.coins) + ' Coins');

function itemBtn(kind, o) {
  const { title, note } = splitName(o.name);
  const done = isDone(o), locked = !done && !o.ok;
  const icon = done ? 'done' : locked ? 'lock' : o.medals ? 'medal' : 'coin';
  const state = done ? (o.why === 'Done' ? 'Bought' : o.why) : locked ? (o.why || 'Locked') : 'Buy for ' + priceWords(o);
  return '<button type="button" class="c-btn ec-item' + (done ? ' is-done' : '') + (locked ? ' is-locked' : '') + '" data-econ-pick="' + kind + ':' + esc(o.id) + '"' + (done ? ' disabled aria-disabled="true"' : '') +
    ' aria-label="' + esc(title + '. ' + state) + '">' + icoDeco(icon, 24) + '<span class="ec-item__t"><span class="ec-item__n">' + esc(title) + '</span>' +
    (note ? '<small>' + esc(note) + '</small>' : '') + '<small class="ec-item__s">' + esc(state) + '</small></span></button>';
}

function list(title, icon, kind, items, empty) {
  return '<h3 class="ec-h">' + icoDeco(icon, 24) + ' ' + esc(title) + '</h3>' +
    (items && items.length ? '<div class="ec-items">' + items.map((o) => itemBtn(kind, o)).join('') + '</div>' : '<p class="ec-note">' + icoDeco('info', 24) + '<span>' + esc(empty) + '</span></p>');
}

function legacyHtml(s) {
  const o = safe(eco.legacyOffer, s);
  if (!o) return '';
  const e = econOf(s);
  const price = Number(o.price) || 0;
  const state = o.ok ? 'Buy for ' + fmt(price) + ' Coins' : (o.why || 'Locked');
  return '<section class="c-card ec-legacy" aria-label="Legacy Project"><h3 class="c-strip c-strip--light"><span>' + icoDeco('home', 24) + ' Legacy Project</span><span class="c-strip__right">' + fmt(e.legacy || 0) + ' built</span></h3>' +
    '<p class="ec-stad__line">Build something for the village. It has no match effect. Each one adds a segment to Club Legend and 500 Fans.</p>' +
    '<button type="button" class="c-btn ec-item' + (o.ok ? '' : ' is-locked') + '" data-econ-pick="legacy:" aria-label="' + esc((o.name || 'Legacy Project') + '. ' + state) + '">' + icoDeco(o.ok ? 'coin' : 'lock', 24) +
    '<span class="ec-item__t"><span class="ec-item__n">' + esc(o.name || 'Next project') + '</span><small class="ec-item__s">' + esc(state) + '</small></span></button></section>';
}

/** Plain confirm for one buy. */
function confirmHtml(pick, s) {
  const [kind, id] = pick.split(':');
  const e = econOf(s);
  let o = null, heading = '';
  if (kind === 'legacy') { o = safe(eco.legacyOffer, s); if (o) { o = Object.assign({}, o, { coins: o.price }); } heading = 'Build ' + (o ? o.name : 'a Legacy Project') + '?'; }
  else {
    o = ((kind === 'medal' ? safe(eco.medalShop, s) : safe(eco.sinkOptions, s)) || []).find((x) => x.id === id);
    heading = o ? 'Buy ' + splitName(o.name).title + '?' : 'Not available';
  }
  const back = '<button type="button" class="c-btn ec-back" data-econ-back="1">' + icoDeco('close', 24) + '<span>No, go back</span></button>';
  if (!o) return '<div class="screen ec-screen ec-confirm"><h3 class="ec-h">' + esc(heading) + '</h3>' + back + '</div>';
  const medals = !!o.medals, ok = !!o.ok && !isDone(o);
  const have = medals ? Number(e.medals) || 0 : Number(e.coins) || 0, cost = medals ? o.medals : Number(o.coins) || 0;
  const after = have - cost;
  const note = splitName(o.name).note;
  return '<div class="screen ec-screen ec-confirm"><h3 class="ec-h">' + esc(heading) + '</h3>' + (note ? '<p class="ec-note">' + icoDeco('info', 24) + '<span>' + esc(note) + '</span></p>' : '') +
    '<ul class="ec-facts"><li>' + icoDeco(medals ? 'medal' : 'coin', 24) + '<span>Cost: ' + fmt(cost) + (medals ? ' Medals' : ' Coins') + '</span></li>' +
    '<li>' + icoDeco(medals ? 'medal' : 'coin', 24) + '<span>' + (medals ? 'Medals' : 'Coins') + ' after: ' + (ok ? fmt(after) : 'not available') + '</span></li>' +
    (kind === 'legacy' ? '<li>' + icoDeco('fan', 24) + '<span>Adds 500 Fans and one Club Legend segment</span></li>' : '') + '</ul>' +
    (!medals && ok ? '<p class="ec-note">' + icoDeco('info', 24) + '<span>The club keeps enough Coins back to pay wages for a few matches.</span></p>' : '') +
    (ok ? '' : '<p class="ec-note ec-note--warn" role="status">' + icoDeco('lock', 24) + '<span>' + esc(o.why || 'Not ready yet.') + '</span></p>') +
    '<div class="ec-actions"><button type="button" class="c-btn c-btn--primary" data-econ-act="' + (kind === 'legacy' ? 'buyLegacy' : kind === 'medal' ? 'buyMedal' : 'buySink') + '" data-id="' + esc(id) + '"' + (ok ? '' : ' disabled aria-disabled="true"') + '>' +
    icoDeco('done', 24) + '<span>Yes, buy</span></button>' + back + '</div></div>';
}

export function renderSinks(root, state, dispatch) {
  const pick = root.__ecPick || null;
  if (pick) root.innerHTML = confirmHtml(pick, state);
  else {
    const e = econOf(state);
    const sinks = (safe(eco.sinkOptions, state) || []).filter((o) => !o.medals);
    const medalSinks = (safe(eco.sinkOptions, state) || []).filter((o) => o.medals);
    const shop = (safe(eco.medalShop, state) || []).concat(medalSinks);
    root.innerHTML = '<div class="screen ec-screen ec-sinks"><p class="ec-purse" aria-label="' + esc(fmt(e.coins) + ' Coins, ' + fmt(e.medals) + ' Medals') + '">' + icoDeco('coin', 24) + '<b>' + fmt(e.coins) + '</b> Coins ' + icoDeco('medal', 24) + '<b>' + fmt(e.medals) + '</b> Medals</p>' +
      list('Ground upgrades', 'build', 'sink', sinks, 'Nothing to buy yet. Ground upgrades open with a bigger stadium.') +
      list('Medal shop', 'medal', 'medal', shop, 'The Medal shop is empty.') + legacyHtml(state) + fansBarsHtml(state) + '</div>';
  }
  if (!root.__ecBound) {
    root.__ecBound = true;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-econ-pick],[data-econ-back],[data-econ-act]');
      if (!t || !root.contains(t) || t.disabled) return;
      if (t.hasAttribute('data-econ-pick')) { root.__ecPick = t.getAttribute('data-econ-pick'); renderSinks(root, root.__ecState, dispatch); const y = root.querySelector('.ec-actions .c-btn,.ec-back'); if (y) y.focus(); }
      else if (t.hasAttribute('data-econ-back')) { const was = root.__ecPick; root.__ecPick = null; renderSinks(root, root.__ecState, dispatch); const b = root.querySelector('[data-econ-pick="' + was + '"]'); if (b) b.focus(); }
      else { const name = t.getAttribute('data-econ-act'), id = t.getAttribute('data-id'); root.__ecPick = null; dispatch(name, name === 'buyLegacy' ? {} : { id }); }
    });
  }
  root.__ecState = state;
  return root;
}

export function openSinks(state, dispatch) {
  const host = document.createElement('div');
  let close;
  renderSinks(host, state, (n, a) => { dispatch(n, a); if (close) close(); });
  close = openSheet('Club extras', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
