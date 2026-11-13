// @ts-check
// Letter grades on screen (SPEC s4): the engine keeps numbers, the screen shows a letter and a no-digit fill bar.
// A letter is F- .. S+ (21 steps). The bar has 4 ticks per step; a Normal gain moves a tick, sometimes a step.
import { letterOfRaw, letterOfShown, ticksOfRaw } from '../core/letters.js';
import { esc, icoDeco } from './dom.js';

/** Spoken form: "B minus", "A plus", "C". @param {string} L */
export const spoken = (L) => String(L).replace(/\+$/, ' plus').replace(/-$/, ' minus');

/** Tick strip: 4 small blocks, the first `lit` filled. Decorative: the letter beside it carries the meaning. @param {number} lit 0..4 */
export function ticks(lit) {
  const n = Math.max(0, Math.min(4, lit | 0));
  let h = '';
  for (let i = 0; i < 4; i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>';
  return '<span class="lt-bar" aria-hidden="true">' + h + '</span>';
}

/** The letter box. `key` is the base letter (A..S) used for the shape class. @param {string} L */
export function letterBox(L, o) {
  o = o || {};
  const base = String(L).charAt(0);
  return '<span class="lt-box lt-' + esc(base) + (o.cls ? ' ' + o.cls : '') + '"><b>' + esc(L) + '</b></span>';
}

/** Letter + tick bar for a shown ability (20..200). @param {number} a */
export function shownChip(a, o) { const L = letterOfShown(a); return { letter: L, html: letterBox(L, o) }; }

/** Letter + bar for a raw rating (1..99). Returns html and the spoken letter. @param {number} r */
export function rawCell(r, o) {
  const L = letterOfRaw(r);
  return { letter: L, html: '<span class="lt-cell">' + letterBox(L, o) + ticks(ticksOfRaw(r)) + '</span>' };
}

/** Letter + bar for a shown ability. @param {number} a */
export function shownCell(a, o) {
  const L = letterOfShown(a);
  // a shown 20..200 maps back to raw 1..99 for the tick position
  const raw = 1 + (Number(a) - 20) * 98 / 180;
  return { letter: L, html: '<span class="lt-cell">' + letterBox(L, o) + ticks(ticksOfRaw(raw)) + '</span>' };
}

export const letterOf = letterOfShown;
export const letterOfRawRating = letterOfRaw;

/** One line "Ability B+ ▮▮▯▯" for a shown ability (20..200): letter then four ticks. Returns { html, say }. @param {number} a */
export function abilityLine(a, label) {
  const L = letterOfShown(a), raw = 1 + (Number(a) - 20) * 98 / 180;
  return { letter: L, say: spoken(L), html: '<span class="lt-line">' + (label === '' ? '' : esc(label || 'Ability') + ' ') + '<span class="lt-cell"><b class="lt-in">' + esc(L) + '</b>' + ticks(ticksOfRaw(raw)) + '</span></span>' };
}

/** Soft bench slots (SPEC s6): the first two bench players are "Bench batter" and "Bench bowler", picked by who is better at which.
 *  A hint tick shows when he fits the slot. Never blocks anything. @param {any[]} bench players with .id .bat .bowl (shown scale)
 *  @returns {Map<any,{label:string, fit:boolean}>} */
export function benchSlots(bench) {
  const m = new Map(), b = bench.slice(0, 2);
  const lean = (p) => (Number(p.bat) || 0) - (Number(p.bowl) || 0);
  if (b.length === 2) {
    const bt = lean(b[1]) > lean(b[0]) ? b[1] : b[0], bw = bt === b[0] ? b[1] : b[0];
    m.set(bt.id, { label: 'Bench batter', fit: lean(bt) >= 0 });
    m.set(bw.id, { label: 'Bench bowler', fit: lean(bw) <= 0 });
  } else if (b.length === 1) {
    const l = lean(b[0]);
    m.set(b[0].id, { label: l >= 0 ? 'Bench batter' : 'Bench bowler', fit: true });
  }
  bench.slice(2).forEach((p) => m.set(p.id, { label: 'Bench', fit: false }));
  return m;
}
/** The hint tick for a fit: icon plus the word, so it is not colour alone. */
export const fitTick = () => '<span class="sq-fit">' + icoDeco('done', 14) + 'Fit</span>';

/** Shared tiny icon helpers so sheets do not depend on the training view. */
export const deco = (name, size) => icoDeco(name, size || 20);
export const iw = (name, word) => '<span class="tr-iw">' + deco(name, 20) + '<span>' + esc(word) + '</span></span>';
const ROLE_ICON = { opener: 'roleOpener', middle: 'roleMiddle', lower: 'roleLower' };
const TYPE_ICON = { fast: 'typeFast', medium: 'typeMedium', spin: 'typeSpin' };
export const roleIcon = (r) => ROLE_ICON[String(r || '').toLowerCase()] || 'roleMiddle';
export const typeIcon = (t) => TYPE_ICON[String(t || '').toLowerCase()] || 'typeMedium';
/** Shown to a player who tries to sign or take a graduate with 8 already (SPEC s6). */
export const SQUAD_FULL = 'Squad full: release one first';
