// @ts-check
// Squad view: pick six from ten, in batting order. Bench rows are marked "Bench".
// render(el, vm, dispatch). Reads only squadVM (contract section 5):
//   {players:[{id,name,bat,bowl,ability,grade,pips,peak,max,order|null}], count, valid, reason}
// Optional VM fields used when present: title, sub (context line), and per player role ('Opener'|'Middle'|'Lower') and type ('Fast'|'Medium'|'Spin').
// The tick-offs are view state (never saved); "Confirm my six" dispatches SetSix {ids} once, in batting order.
import { esc, icoDeco } from './dom.js';
import { openGlossary } from './glossary-sheet.js';

const SIX = 6;
const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const ROLE_WORD = { Opener: 'Opener', Middle: 'Middle', Lower: 'Lower order' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const DRILLS = 'not known yet. Shows after 1 practice drill';

/** @param {number} n */
function pips(n) {
  const k = Math.max(0, Math.min(1, n | 0));
  let h = '';
  for (let i = 0; i < 1; i++) h += `<u class="sq-pp${i < k ? ' on' : ''}"></u>`;
  return `<span class="sq-pips" role="img" aria-label="${k} of 1 practice drill done, then the potential grade shows">${h}<span class="sq-pipn" aria-hidden="true">${k}/1 drill</span></span>`;
}

/** Plain reason for the confirm button. @param {number} n */
function reasonFor(n, flash) {
  if (flash) return flash;
  if (n < SIX) { const k = SIX - n; return `Pick ${k} more player${k > 1 ? 's' : ''} to play.`; }
  return 'Tap a player to swap them out.';
}

/** @param {any} p @param {number} pos index in the batting order or -1 @param {number} maxBat @param {number} maxBowl */
function row(p, pos, maxBat, maxBowl) {
  const on = pos > -1;
  const hidden = !p.grade || p.grade === '?';
  const role = ROLE_WORD[p.role] || '';
  const type = p.type || '';
  const subHtml = (role ? esc(role) : '') + (role && type ? ' · ' : '') + (type ? `${icoDeco(TYPE_ICON[type], 14)}${esc(type)}` : '');
  const label = `${p.name}${role ? ', ' + role : ''}${type ? ', ' + type + ' bowler' : ''}, batting ${p.bat}, bowling ${p.bowl}, ` +
    (hidden ? 'potential grade ' + DRILLS + `, ${p.pips | 0} of 1 drill` : 'potential grade ' + p.grade) +
    (p.bat === maxBat ? ', best batter' : '') + (p.bowl === maxBowl ? ', best bowler' : '') + (p.peak ? ', at peak' : '') + (on ? `. Picked, bats number ${pos + 1}. Tap to take out.` : '. On the bench. Tap to pick.');
  return `<button type="button" class="sq-row${on ? ' is-selected' : ' sq-row--bench'}" role="checkbox" aria-checked="${on}" data-id="${esc(p.id)}" aria-label="${esc(label)}">` +
    `<div class="pbox sq-pbox">${icoDeco(ROLE_ICON[p.role] || 'roleMiddle', 26)}` +
    `<span class="nm name sq-nm">${on ? `<b class="sq-ord" aria-hidden="true">${pos + 1}</b>` : '<span class="sq-bench">Bench</span>'}${esc(p.name)}</span>` +
    `<span class="sub sq-sub">${subHtml}</span>${hidden ? pips(p.pips) : ''}</div>` +
    `<div class="sq-nbox${p.bat === maxBat ? ' hi' : ''}"><b>${esc(p.bat)}</b>${p.bat === maxBat ? '<small class="sq-best">Best</small>' : ''}</div>` +
    `<div class="sq-nbox${p.bowl === maxBowl ? ' hi' : ''}"><b>${esc(p.bowl)}</b>${p.bowl === maxBowl ? '<small class="sq-best">Best</small>' : ''}</div>` +
    `<div class="sq-nbox sq-gq${hidden ? ' sq-unk' : ''}"><b aria-hidden="true">${hidden ? '?' : esc(p.grade)}</b>${p.peak ? '<small>Peak</small>' : ''}</div></button>`;
}

/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  const E = /** @type {any} */ (el);
  const players = vm.players || [];
  const byId = new Map(players.map((p) => [p.id, p]));
  // Fresh visit (my root is not in the DOM): start from the order the store holds. Otherwise keep the view's own picks.
  let st = E.__sq;
  if (!st || !el.querySelector('.sq-root')) {
    const order = players.filter((p) => p.order != null).sort((a, b) => a.order - b.order).map((p) => p.id);
    st = E.__sq = { order, flash: '' };
  }
  st.order = st.order.filter((id) => byId.has(id));
  E.__sqVM = vm; E.__sqDispatch = dispatch;
  const maxBat = Math.max(...players.map((p) => p.bat)), maxBowl = Math.max(...players.map((p) => p.bowl));
  const picked = st.order.map((id) => byId.get(id));
  const bench = players.filter((p) => !st.order.includes(p.id));
  const n = picked.length, ok = n === SIX;
  const reason = reasonFor(n, st.flash);
  const title = vm.title || 'Pick your six';
  const sub = vm.sub || `Choose ${SIX} of ${players.length}. First pick bats first.`;
  el.innerHTML =
    `<div class="sq-root">` +
    `<header class="strip c-dark sq-strip"><span class="mid"><b>${esc(title)}</b><span>${esc(sub)}</span></span>` +
    `<span class="score sq-cnt" aria-live="polite">${n} of ${SIX} picked</span>` +
    `<button type="button" class="q" data-gloss aria-label="Cricket words explained">?</button></header>` +
    `<div class="sq-cols" aria-hidden="true"><span>Player · drills</span><span>Bat</span><span>Bowl</span><span>Potential grade</span></div>` +
    `<div class="sq-list" role="group" aria-label="Squad of ${players.length}">` +
    picked.map((p, i) => row(p, i, maxBat, maxBowl)).join('') +
    (bench.length ? `<div class="sq-benchhd">Bench: ${bench.length} not playing</div>` : '') +
    bench.map((p) => row(p, -1, maxBat, maxBowl)).join('') + `</div>` +
    `<div class="ctabar sq-cta"><div class="sq-why" id="sq-why" role="status">${esc(reason)}</div>` +
    `<button type="button" class="c-btn c-btn--primary c-btn--cta" data-confirm aria-describedby="sq-why"${ok ? '' : ' disabled aria-disabled="true"'}>Confirm my six</button></div>` +
    `</div>`;
  if (!E.__sqBound) {
    E.__sqBound = true;
    el.addEventListener('click', (e) => {
      const S = E.__sq, V = E.__sqVM, D = E.__sqDispatch;
      if (!S || !V || !el.querySelector('.sq-root')) return;
      const t = /** @type {HTMLElement} */ (e.target).closest('button'); if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-gloss')) { openGlossary(); return; }
      if (t.hasAttribute('data-confirm')) { if (!t.disabled && S.order.length === SIX) D('SetSix', { ids: S.order.slice() }); return; }
      const id = t.getAttribute('data-id'); if (id == null) return;
      const pid = (V.players.find((p) => String(p.id) === id) || {}).id;
      const k = S.order.indexOf(pid);
      if (k > -1) { S.order.splice(k, 1); S.flash = ''; }
      else if (S.order.length < SIX) { S.order.push(pid); S.flash = ''; }
      else S.flash = 'Six already picked. Tap one of them first.';
      render(el, V, D);
      const again = el.querySelector(`[data-id="${CSS.escape(id)}"]`); if (again) /** @type {HTMLElement} */ (again).focus();
    });
  }
}
