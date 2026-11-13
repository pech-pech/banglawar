// @ts-check
// Plan view (PROTO-SCREENS screen 1): who bowls each of the 10 overs, and the field for each phase.
// render(el, vm, dispatch). Reads only planVM (contract section 5):
//   {overs:[{over, phase, bowler|null, warn}], bowlers:[{i, name, bowl, ability, set}], fields, valid, reason}
// Optional VM fields: sub (context line, e.g. "vs Brackwell CC"). Edits are view state until Start, which dispatches SetPlan {overs, fields} then NewMatch.
// Rules mirror the match: every bowler 1-2 overs, never two in a row. The words show on the slot that breaks one.
import { esc, icoDeco } from './dom.js';
import { abilityLine } from './letters-ui.js';
import { openGlossary } from './glossary-sheet.js';

const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const PHASES = [{ name: 'Early', range: '1-3', from: 1, to: 3 }, { name: 'Middle', range: '4-7', from: 4, to: 7 }, { name: 'Late', range: '8-10', from: 8, to: 10 }];
const FIELD = { A: { word: 'Attack', icon: 'fieldAttack' }, P: { word: 'Protect', icon: 'fieldProtect' } };
const OVERS = 10;

/**
 * Warn word per slot (null = fine), every broken rule as a plain line naming its bowler, and the first one as `reason`.
 * Rules: 1-2 overs each, never two in a row. Both overs of a back-to-back pair are flagged.
 * @param {(number|null)[]} overs @param {any[]} bowlers
 */
export function check(overs, bowlers) {
  const warn = overs.map(() => null);
  const nm = (i) => ((bowlers.find((b) => b.i === i) || {}).name) || 'A bowler';
  const seen = {};
  const problems = [];
  // back-to-back runs: flag every over in the run
  for (let k = 0; k < overs.length;) {
    const b = overs[k];
    if (b == null) { k++; continue; }
    let e = k; while (e + 1 < overs.length && overs[e + 1] === b) e++;
    if (e > k) {
      for (let j = k; j <= e; j++) warn[j] = 'Twice in a row';
      problems.push(`${nm(b)}: twice in a row (overs ${k + 1}-${e + 1})`);
    }
    k = e + 1;
  }
  overs.forEach((b, k) => {
    if (b == null) return;
    seen[b] = (seen[b] || 0) + 1;
    if (seen[b] > 2 && !warn[k]) warn[k] = '3rd over';
  });
  Object.keys(seen).forEach((i) => {
    if (seen[i] > 2) problems.push(`${nm(Number(i))}: ${seen[i]} overs (max 2)`);
  });
  const open = overs.filter((b) => b == null).length;
  let reason = problems.length ? problems[0] + '. Pick someone else.' : '';
  if (!reason && open) reason = `${open} over${open > 1 ? 's' : ''} still to set.`;
  if (!reason) {
    const none = bowlers.find((b) => !seen[b.i]);
    if (none) reason = `${nm(none.i)} has no over yet. Everyone bowls at least 1.`;
  }
  return { warn, problems, reason, valid: !reason };
}

/** vm.overs[].bowler may be an index or null. @param {any} vm */
/** Hint with its action part in bold, e.g. "Suggested by matchups. <b>Tap any over to change.</b>" */
function helpHtml(hint) {
  const h = hint || 'Tap an over, then tap who bowls it. Tap a phase to switch its field.';
  const i = h.indexOf('Tap ');
  return i > 0 ? esc(h.slice(0, i)) + '<b>' + esc(h.slice(i)) + '</b>' : esc(h);
}

function initial(vm) {
  const overs = Array.from({ length: OVERS }, (_, k) => {
    const o = (vm.overs || [])[k]; const b = o ? o.bowler : null;
    return typeof b === 'number' ? b : null;
  });
  const fields = (vm.fields && vm.fields.length === 3 ? vm.fields : ['P', 'P', 'P']).slice();
  return { overs, fields, sel: overs.indexOf(null), nudge: false }; // a full (pre-filled) plan starts with no over selected, so a first tap can't change it
}

/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  const E = /** @type {any} */ (el);
  let st = E.__pl;
  if (!st || !el.querySelector('.pl-root')) st = E.__pl = initial(vm);
  E.__plVM = vm; E.__plDispatch = dispatch;
  const bowlers = vm.bowlers || [];
  const { warn, problems, reason, valid } = check(st.overs, bowlers);
  const count = (i) => st.overs.filter((b) => b === i).length;
  const nameOf = (i) => (bowlers.find((b) => b.i === i) || {}).name || '';
  const slot = (k) => {
    const b = st.overs[k], w = warn[k], on = st.sel === k;
    const face = b == null ? '<span class="pl-empty">Pick</span>' : `<span class="pl-nm name">${esc(nameOf(b))}</span>`;
    return `<button type="button" class="pl-slot${on ? ' is-selected' : ''}${w ? ' is-warn' : ''}${b == null ? ' is-empty' : ''}" data-slot="${k}" aria-pressed="${on}" ` +
      `aria-label="Over ${k + 1}, ${b == null ? 'no bowler yet' : esc(nameOf(b))}${w ? '. Problem: ' + w : ''}${on ? '. Selected. Tap a bowler below.' : ''}">` +
      `<span class="pl-n">${k + 1}${w ? '<i class="pl-bang" aria-hidden="true">!</i>' : ''}</span>${face}</button>`;
  };
  const band = (ph, pi) => {
    const f = FIELD[st.fields[pi]] || FIELD.P;
    const slots = []; for (let o = ph.from; o <= ph.to; o++) slots.push(slot(o - 1));
    return `<div class="pl-band"><button type="button" class="pl-field" data-field="${pi}" aria-label="${ph.name} overs ${ph.range}: ${f.word} field. Tap to switch.">` +
      `<b>${ph.name}</b><span>${icoDeco(f.icon, 16)}${f.word}</span></button>` +
      `<div class="pl-slots pl-slots--${slots.length}">${slots.join('')}</div></div>`;
  };
  const chip = (b) => {
    const n = count(b.i);
    return `<button type="button" class="pl-chip" data-bowler="${b.i}" aria-label="${esc(b.name)}, ${esc(b.bowl)} bowler, bowling ${abilityLine(b.ability).say}, ${n} of 2 overs set. Tap to give him the selected over.">` +
      `${icoDeco(TYPE_ICON[b.bowl] || 'typeMedium', 24)}<span class="pl-cn"><span class="name">${esc(b.name)}</span><small>${esc(b.bowl)}</small><small>${abilityLine(b.ability).html}</small></span>` +
      `<span class="pl-set${n === 0 || n > 2 ? ' is-low' : ''}" aria-hidden="true">${n}/2</span></button>`;
  };
  const sub = vm.sub || 'Their innings first, then you chase.';
  el.innerHTML =
    `<div class="pl-root">` +
    `<header class="strip c-dark pl-strip"><span class="mid"><b>Bowling plan</b><span>${esc(sub)}</span></span>` +
    `<button type="button" class="q" data-gloss aria-label="Cricket words explained">?</button></header>` +
    `<p class="pl-help${st.nudge ? ' is-nudge' : ''}" role="status">${st.nudge ? '<b>Tap an over first.</b> Then tap who bowls it.' : helpHtml(vm.hint)}</p>` +
    `<div class="pl-grid">${PHASES.map(band).join('')}</div>` +
    `<div class="pl-bowlers" role="group" aria-label="Your six bowlers">${bowlers.map(chip).join('')}</div>` +
    (problems.length ? `<ul class="pl-warns list-flat" role="alert" aria-label="Problems with the plan">${problems.map((t) => `<li><i class="pl-bang" aria-hidden="true">!</i><span>${esc(t)}</span></li>`).join('')}</ul>` : '') +
    `<div class="ctabar pl-cta"><div class="pl-why" id="pl-why" role="status">${esc(valid ? 'Plan is ready.' : problems.length > 1 ? `${problems.length} problems to fix. See the list above.` : reason)}</div>` +
    `<button type="button" class="c-btn c-btn--primary c-btn--cta" data-start aria-describedby="pl-why"${valid ? '' : ' disabled aria-disabled="true"'}>Start match</button></div>` +
    `</div>`;
  if (!E.__plBound) {
    E.__plBound = true;
    el.addEventListener('click', (e) => {
      const S = E.__pl, V = E.__plVM, D = E.__plDispatch;
      if (!S || !V || !el.querySelector('.pl-root')) return;
      const t = /** @type {HTMLElement} */ (e.target).closest('button'); if (!t || !el.contains(t)) return;
      let focus = null;
      if (t.hasAttribute('data-gloss')) { openGlossary(); return; }
      if (t.hasAttribute('data-start')) {
        if (!t.disabled && check(S.overs, V.bowlers || []).valid) { D('SetPlan', { overs: S.overs.slice(), fields: S.fields.slice() }); D('NewMatch', {}); }
        return;
      }
      if (t.hasAttribute('data-slot')) { S.nudge = false; S.sel = Number(t.getAttribute('data-slot')); focus = `[data-slot="${S.sel}"]`; }
      else if (t.hasAttribute('data-field')) { const pi = Number(t.getAttribute('data-field')); S.fields[pi] = S.fields[pi] === 'P' ? 'A' : 'P'; focus = `[data-field="${pi}"]`; }
      else if (t.hasAttribute('data-bowler')) {
        const b = Number(t.getAttribute('data-bowler'));
        if (S.sel < 0) { S.nudge = true; render(el, E.__plVM || V, D); return; } // nothing selected yet: ask for an over, change nothing
        S.overs[S.sel] = S.overs[S.sel] === b ? null : b;
        const next = S.overs.findIndex((x, k) => x == null && k > S.sel); // jump to the next open over, if any
        if (S.overs[S.sel] != null && next > -1) S.sel = next;
        focus = `[data-bowler="${b}"]`;
      }
      if (!t.hasAttribute('data-slot')) D('EditPlan', { overs: S.overs.slice(), fields: S.fields.slice() }); // the store keeps the player's edits so a re-open never overwrites them
      render(el, E.__plVM || V, D);
      if (focus) { const f = el.querySelector(focus); if (f) /** @type {HTMLElement} */ (f).focus(); }
    });
  }
}
