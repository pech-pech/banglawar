// @ts-check
// Clinic player pick sheet (SPEC s8, s15). open: openClinicPick(state, dispatch, open, arg:{coachId}, refresh, deps?).
// Rows come from core pickable(s) -> [{playerId, ok, why}]; unpickable rows are grey with the reason. Tap a player -> ClinicPick {coachId, playerId},
// then the wheel screen (open('clinicwheel', {coachId, playerId})). "Later" -> ClinicLater {coachId}: the spin stays ready.
// Every tap target is 56 px (css/clinic.css). Letters only (hint letter = the focus stat's letter).
import { openSheet } from './sheet.js';
import { esc } from './dom.js';
import { letterOfRaw } from '../core/letters.js';
import { pickable as corePickable } from '../core/clinic.js';
import { coachList, focusRating } from '../core/training.js';
import { STAT, statKey } from './nets-scene.js';

const RAT = { batPower: 'bp', batSkill: 'bs', bowlSpeed: 'spd', bowlSkill: 'bsk' };

/** The club's own squad (clubs[c0]). @param {any} s */
const squadOf = (s) => ((s.clubs || []).find((/** @type {any} */ c) => c.id === 'c0') || {}).squad || [];

/** Rows for the sheet. @param {any} s @param {{pickable?:Function}} [deps] */
export function pickRows(s, deps) {
  const pk = (deps && deps.pickable) || corePickable, sq = squadOf(s), focus = (s.training && s.training.focus) || 'bat';
  let list = []; try { list = pk(s) || []; } catch (_) { list = []; }
  return list.map((/** @type {any} */ r) => {
    const p = sq.find((/** @type {any} */ x) => x.id === r.playerId) || {};
    let word = '', letter = '';
    try { const k = focusRating(p, focus); word = STAT(RAT[k] || statKey(k)).word; letter = letterOfRaw(p[k]); } catch (_) { /* no hint */ }
    return { playerId: r.playerId, name: p.name || String(r.playerId), word, letter, ok: !!r.ok, why: r.ok ? '' : (r.why === 'At cap' || r.why === 'Skipped, balance' ? 'Rests this week' : String(r.why || 'Cannot gain this week')) };
  });
}

/** Sheet body HTML. @param {{coachName:string, rows:any[]}} m */
export function clinicPickHtml(m) {
  const rows = m.rows || [], any = rows.some((r) => r.ok);
  const li = rows.map((r, i) => {
    const hint = r.word ? esc(r.word) + (r.letter ? ' ' + esc(r.letter) : '') : '';
    const say = r.name + (hint ? ', ' + r.word + (r.letter ? ' ' + r.letter : '') : '') + (r.ok ? '. Tap to pick.' : '. Cannot pick: ' + r.why);
    return '<li><button type="button" class="c-btn cn-row' + (r.ok ? '' : ' is-grey') + '" data-cn="pick" data-pid="' + esc(r.playerId) + '"' + (r.ok ? '' : ' aria-disabled="true" aria-describedby="cn-why-' + i + '"') + ' aria-label="' + esc(say) + '">' +
      '<b class="cn-nm">' + esc(r.name) + '</b>' + (hint ? '<span class="cn-hint" aria-hidden="true">' + hint + '</span>' : '') +
      (r.ok ? '' : '<small class="cn-why" id="cn-why-' + i + '">' + esc(r.why) + '</small>') + '</button></li>';
  }).join('');
  return '<p class="tr-note cn-lead">' + esc((m.coachName || 'The coach') + ' coaches one player this week. Pick who gets the Clinic spin.') + '</p>' +
    (any ? '' : '<p class="cn-none" role="status">No player can gain this week. Your spin stays ready.</p>') +
    '<ul class="cn-list" aria-label="Players">' + li + '</ul>' +
    '<button type="button" class="c-btn c-btn--block cn-later" data-cn="later">Later</button>';
}

/** open(state, dispatch, open, arg, refresh, deps). Returns the close function. */
export function openClinicPick(s, dispatch, openFn, arg, refresh, deps) {
  const coachId = arg && arg.coachId, co = coachList(s).find((/** @type {any} */ c) => c.id === coachId);
  const close = openSheet('Clinic: pick a player', clinicPickHtml({ coachName: co ? co.name : '', rows: pickRows(s, deps) }));
  const body = document.querySelector('.sheet-fixed .c-sheet__body'); if (!body) return close;
  const after = (deps && deps.afterPick) || ((/** @type {any} */ a) => { if (openFn) openFn('clinicwheel', a); });
  body.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement|null} */ (/** @type {any} */ (e.target).closest && /** @type {any} */ (e.target).closest('[data-cn]')); if (!t) return;
    const act = t.getAttribute('data-cn');
    if (act === 'later') { close(); dispatch('ClinicLater', { coachId }); return; }
    if (act === 'pick' && t.getAttribute('aria-disabled') !== 'true') { const playerId = t.getAttribute('data-pid'); close(); dispatch('ClinicPick', { coachId, playerId }); after({ coachId, playerId }); }
  });
  return close;
}
