/* club-money-view: the money sheet. renderClubMoney(root, state, dispatch, opts) draws Coins / Fans / Medals, the last match lines and the Fans bars.
   Reads state.econ and js/core/economy.js only. opts.income = a matchIncome() result for the last match (optional; else the newest ledger line).
   openClubMoney(state, dispatch, opts) puts it in a bottom sheet. Digits are fine here: Coins, Fans and Medals are currencies, not ratings. */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import * as eco from '../core/economy.js';

export const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtSigned = (n) => (n < 0 ? '-' : n > 0 ? '+' : '') + fmt(Math.abs(n));
const econOf = (s) => (s && s.econ) || {};

/** One currency tile: icon, number, plain word. */
function tile(icon, n, word) {
  return '<div class="ec-tile" role="group" aria-label="' + esc(fmt(n) + ' ' + word) + '">' + icoDeco(icon, 24) + '<b class="ec-num">' + esc(fmt(n)) + '</b><span class="ec-word">' + esc(word) + '</span></div>';
}

/** A bar of n segments, `on` filled. Always paired with words by the caller. */
function segs(on, n, cls) {
  let h = '';
  for (let i = 0; i < n; i++) h += '<i class="ec-seg' + (i < on ? ' is-on' : '') + '"></i>';
  return '<span class="ec-segs ' + (cls || '') + '" aria-hidden="true">' + h + '</span>';
}

/** The two Fans bars: Crowd (toward the next stadium gate), then Club Legend (10 segments a tier). */
export function fansBarsHtml(s) {
  let b = null;
  try { b = eco.fansBars(s); } catch (_) { b = null; }
  if (!b) return '';
  const crowd = b.crowd || { fill: 0, next: null };
  const fill = Math.max(0, Math.min(1, Number(crowd.fill) || 0));
  const on = Math.round(fill * 10);
  const legend = b.legend || { tier: 0, segments: 0 };
  const seg = Math.max(0, Math.min(10, Number(legend.segments) || 0));
  const crowdWords = crowd.next ? (fill >= 1 ? 'Full. Enough Fans to start ' + crowd.next : on + ' of 10 segments full. Fills toward ' + crowd.next) : 'Full. You have the biggest stadium';
  const open = b.showLegend !== false;
  const legendWords = !open ? 'Opens when the Crowd is full' : (legend.name ? legend.name + '. ' : '') + 'Tier ' + fmt(legend.tier + 1) + ', ' + seg + ' of 10 segments. Each Legacy Project adds one';
  return '<section class="ec-bars" aria-label="Fans bars">' +
    '<div class="ec-bar"><span class="ec-bar__h">' + icoDeco('fan', 24) + '<b>Crowd</b></span>' + segs(on, 10, 'ec-segs--crowd') + '<span class="ec-bar__t">' + esc(crowdWords) + '</span></div>' +
    '<div class="ec-bar"><span class="ec-bar__h">' + icoDeco('medal', 24) + '<b>Club Legend</b></span>' + segs(open ? seg : 0, 10, 'ec-segs--legend') + '<span class="ec-bar__t">' + esc(legendWords) + '</span></div></section>';
}

function lineRow(label, n, kind) {
  const word = n > 0 ? 'in' : n < 0 ? 'out' : 'none';
  return '<li class="ec-line ec-line--' + kind + '"><span class="ec-line__l">' + esc(label) + '</span><b class="ec-line__v">' + esc(fmtSigned(n)) + '</b><span class="ec-sr">' + (n ? (n > 0 ? ' Coins in' : ' Coins out') : ' no change') + '</span></li>';
}

/** Last match money lines from a matchIncome() shape: gate, winBonus, shop in; wages, upkeep out; net; fans. */
export function incomeHtml(inc) {
  if (!inc) return '<p class="ec-note">' + icoDeco('info', 24) + '<span>No match played yet. Money lines show here after your first match.</span></p>';
  const out = (n) => -Math.abs(Number(n) || 0);
  const net = Number(inc.net) || 0;
  return '<ul class="ec-lines" aria-label="Last match money">' +
    lineRow('Gate money', Number(inc.gate) || 0, 'in') + lineRow('Win bonus', Number(inc.winBonus) || 0, 'in') + lineRow('Shop', Number(inc.shop) || 0, 'in') +
    lineRow('Player wages', out(inc.wages), 'out') + lineRow('Ground upkeep', out(inc.upkeep), 'out') +
    '<li class="ec-line ec-line--net"><span class="ec-line__l">' + icoDeco(net < 0 ? 'alert' : 'coin', 24) + ' ' + (net < 0 ? 'Lost this match' : 'Kept this match') + '</span><b class="ec-line__v">' + esc(fmtSigned(net)) + '</b></li>' +
    (inc.fans ? '<li class="ec-line ec-line--fans"><span class="ec-line__l">' + icoDeco('fan', 24) + ' New Fans</span><b class="ec-line__v">' + esc(fmtSigned(Number(inc.fans))) + '</b></li>' : '') + '</ul>';
}

export function renderClubMoney(root, state, dispatch, opts) {
  const e = econOf(state);
  const inc = (opts && opts.income) || (Array.isArray(e.ledger) ? e.ledger.slice().reverse().find((x) => x && x.k === 'match') : null);
  const useInc = inc && typeof inc === 'object' && 'net' in inc ? inc : null;
  const arrears = Number(e.arrears) || 0;
  root.innerHTML = '<div class="screen ec-screen ec-money">' +
    '<div class="ec-tiles">' + tile('coin', e.coins, 'Coins') + tile('fan', e.fans, 'Fans') + tile('medal', e.medals, 'Medals') + '</div>' +
    (arrears > 0 ? '<p class="ec-note ec-note--warn" role="status">' + icoDeco('alert', 24) + '<span>Wages are behind by ' + esc(fmt(arrears)) + ' Coins. Building, signing and training wait until the Coins are paid.</span></p>' : '') +
    '<h3 class="ec-h">Last match</h3>' + incomeHtml(useInc) +
    '<h3 class="ec-h">Fans</h3><p class="ec-note">' + icoDeco('info', 24) + '<span>Fans only go up. They open the next stadium.</span></p>' + fansBarsHtml(state) +
    '</div>';
  return root;
}

export function openClubMoney(state, dispatch, opts) {
  const host = document.createElement('div');
  renderClubMoney(host, state, dispatch, opts);
  return openSheet('Club money', host.innerHTML);
}
