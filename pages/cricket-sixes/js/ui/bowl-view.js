// @ts-check
// Innings 1 Call screen: M bowls. render(el, vm, dispatch). Reads only bowlVM; DOM via innerHTML with escaped text.
import { whyLine, outcomeLabel } from './why.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, size) => {
  const S = /** @type {any} */ (window).SPR;
  if (!S || !S.iconNames || S.iconNames.indexOf(name) < 0) return '<span class="bv-ph" aria-hidden="true"></span>';
  return S.iconImg(name, size || 24).outerHTML.replace('class="icon"', 'class="icon" aria-hidden="true"').replace(/ alt="[^"]*"/, ' alt=""');
};
const TYPE = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const ROLE = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const GCLS = { Great: ' c-tag--go', Even: '', Bad: ' c-tag--warn' };
const BADGE = { W: 'W', 6: '6', 4: '4', 2: '2', 1: '1', 0: '·' };

function crease(vm) {
  return (vm.crease || []).map((b) =>
    `<div class="c-row bv-seat" aria-label="${esc(b.name)}${b.onStrike ? ', on strike' : ''}">` +
    ic(ROLE[b.bat] || 'roleMiddle') + `<span class="c-row__body"><b class="c-row__title name">${esc(b.name)}</b></span>` +
    (b.onStrike ? '<span class="c-tag" aria-label="On strike">Strike</span>' : '') +
    `<span class="c-row__end">${esc(b.r)} (${esc(b.b)})</span></div>`).join('');
}

function lastBlock(vm) {
  const L = vm.last; if (!L) return '';
  const bw = typeof L.bowler === 'number' ? (vm.bowlers || []).find((x) => x.i === L.bowler) : null;
  const bowlerName = (bw && bw.name) || (L.bowler && L.bowler.name) || L.bowlerName || 'The bowler';
  const fld = L.field === 'P' ? 'Protect' : 'Attack';
  const rows = (L.balls || []).slice(0, 6).map((r) => {
    const bn = r.batterName || (vm.batNames && vm.batNames[r.batter]) || (L.batters && L.batters[r.batter]) || (r.batter && r.batter.name) || 'The batter';
    return `<div class="c-row ball-row"><b class="c-row__val" aria-label="${esc(outcomeLabel(r.o))}">${esc(BADGE[String(r.o)] != null ? BADGE[String(r.o)] : r.o)}</b>` +
      `<span class="c-row__body"><span class="c-row__sub why">${esc(r.n)}. ${esc(whyLine(r, bn, bowlerName))}</span></span></div>`;
  }).join('');
  return `<section class="c-card" aria-label="Over ${esc(L.over)}"><div class="c-strip"><span>Over ${esc(L.over)}</span>` +
    `<span class="c-strip__right">${ic(TYPE[bw && bw.bowl] || 'overs', 20)} <span class="name">${esc(bowlerName)}</span>, ${fld} field</span></div>${rows}</section>`;
}

function reason(b, vm) {
  if (b.overs >= 2) return '2 overs';
  if (vm.last && vm.last.bowler === b.i) return 'bowled last';
  return 'resting';
}

function chip(b, vm) {
  const sel = vm.call && vm.call.bowler === b.i, ok = b.eligible;
  const g = b.grade || '?';
  const prev = (b.previews || []).map((p) =>
    `<span class="c-tag${GCLS[p.label] || ''}">${esc(p.label)}${p.inPhase ? ' ★' : ''} <span class="name">${esc(p.name)}</span></span>`).join('');
  return `<div class="c-chip${sel ? ' is-selected' : ''}${ok ? '' : ' is-disabled'}">` +
    `<button class="c-chip__pick" data-bowler="${b.i}" aria-pressed="${sel ? 'true' : 'false'}"${ok ? '' : ' disabled'}` +
    ` aria-label="${esc(b.name)}, ${esc(b.bowl)}, ${esc(b.overs)} overs bowled, grade ${esc(g)}${ok ? '' : ', ' + reason(b, vm)}">` +
    `<span class="bv-r1">${ic(TYPE[b.bowl] || 'typeMedium')}<b class="c-chip__name name">${esc(b.name)}</b>` +
    `<span class="muted" style="margin:0 6px">${esc(b.overs)}/2 ov</span><span class="c-tag"${g === '?' ? ' title="Grade shows after 5 drills"' : ''}>${esc(g)}</span></span>` +
    (g === '?' ? '<span class="c-row__sub">Grade shows after 5 drills</span>' : '') +
    (ok ? (prev ? `<span class="bv-prev">${prev}</span>` : '') : `<span class="c-row__sub">${esc(reason(b, vm))}</span>`) + '</button></div>';
}

/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  const sc = vm.score || {}, fld = vm.call && vm.call.field;
  el.__bvDispatch = dispatch; el.__bvVM = vm;
  const seg = (k, lbl, icon) => `<button class="c-seg__opt${fld === k ? ' is-selected' : ''}" data-field="${k}" aria-pressed="${fld === k ? 'true' : 'false'}">${ic(icon)} ${lbl}</button>`;
  el.innerHTML =
    `<div class="screen bv"><div class="c-strip" role="status"><span><b>${esc(sc.runs)}/${esc(sc.wk)}</b></span>` +
    `<span class="c-strip__right">Ov ${esc(sc.overs)} · ${esc(vm.phaseName)}</span></div>` +
    `<div class="two-col"><div class="bv-left">` +
    `<section class="c-card" aria-label="Call"><h2>Over ${esc(vm.over)}: pick a bowler</h2>` +
    (vm.bowlers || []).map((b) => chip(b, vm)).join('') +
    `<h2>Field</h2><div class="c-seg" role="group" aria-label="Field">${seg('A', 'Attack', 'fieldAttack')}${seg('P', 'Protect', 'fieldProtect')}</div></section></div>` +
    `<div class="bv-right"><section class="c-card" aria-label="At the crease"><h2>At the crease</h2>${crease(vm)}</section>` +
    lastBlock(vm) + `</div></div>` +
    `<div class="cta"><button class="c-btn c-btn--primary c-btn--cta c-btn--block" data-bowl${vm.canBowl === false ? ' disabled' : ''}>Bowl over ${esc(vm.over)}</button></div></div>`;
  if (!el.__bvBound) {
    el.__bvBound = true;
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest('button'); if (!t || t.disabled || !el.contains(t)) return;
      const d = el.__bvDispatch, v = el.__bvVM; if (!d || !v) return;
      if (t.hasAttribute('data-bowler')) d('MakeCall', { bowler: Number(t.getAttribute('data-bowler')), field: v.call && v.call.field });
      else if (t.hasAttribute('data-field')) d('MakeCall', { bowler: v.call && v.call.bowler, field: t.getAttribute('data-field') });
      else if (t.hasAttribute('data-bowl')) d('BowlOver', {});
    });
  }
}
