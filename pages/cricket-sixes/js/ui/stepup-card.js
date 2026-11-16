// Step-up card (CONTRACT-B s7): pure queue logic + html. No DOM, no rng. One card per pending step-up.
import { coachList } from '../core/training.js';
import { letterOfStep } from '../core/letters.js';

const esc = (/** @type {any} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
const int0 = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Queue of cards: each coach contributes stepUpPending entries, in coachList order. @param {any} state @returns {{coachId:string, name:string, letter:string}[]} */
export function pendingStepUps(state) {
  /** @type {{coachId:string, name:string, letter:string}[]} */
  const out = [];
  for (const c of coachList(state || {})) {
    const n = int0(c.stepUpPending);
    for (let i = 0; i < n; i++) out.push({ coachId: c.id, name: c.name, letter: letterOfStep(c.step) });
  }
  return out;
}

/** @param {{coachId:string, name:string, letter:string}} e */
export function stepUpHtml(e) {
  return `<div class="cw-stepup" role="dialog" aria-label="Coach step up"><p class="cw-stepup-t">Coach ${esc(e.name)} is now ${esc(e.letter)}</p><button type="button" class="cw-stepup-ok" data-cw="stepup-ok" data-coach="${esc(e.coachId)}">OK</button></div>`;
}

/** A card waits behind a wheel, running match overs and the nets scene. @param {{wheelOpen?:boolean, matchLive?:boolean, netsScene?:boolean}} ui */
export const canShowStepUp = (ui) => !(ui && (ui.wheelOpen || ui.matchLive || ui.netsScene));

/** Consume one pending card on draft n (never below 0). Returns the new count. @param {any} n @param {string} coachId */
export function consumeStepUp(n, coachId) {
  const c = (n.coaches || []).find((/** @type {any} */ k) => k.id === coachId);
  if (!c) return 0;
  c.stepUpPending = Math.max(0, int0(c.stepUpPending) - 1);
  return c.stepUpPending;
}
