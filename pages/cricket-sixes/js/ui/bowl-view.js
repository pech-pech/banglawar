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
const GCLS = { Great: 'chip-great', Even: 'chip-even', Bad: 'chip-bad' };
const BADGE = { W: 'W', 6: '6', 4: '4', 2: '2', 1: '1', 0: '·' };

const STYLE = `
.bv .bv-tap{min-height:56px}
.bv-cols{display:block}
@media (min-width:600px){.bv-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}}
.bv-bowler{display:block;width:100%;text-align:left;box-sizing:border-box;min-width:0;min-height:56px;padding:8px 10px}
.bv-bowler[disabled]{opacity:.55}
.bv-r1,.bv-r2,.bv-prev{display:flex;align-items:center;gap:6px;min-width:0}
.bv-r2,.bv-prev{flex-wrap:wrap;margin-top:4px}
.bv-name{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.bv-ph{display:inline-block;width:24px;height:24px}
.bv-seat{display:flex;align-items:center;gap:8px;min-height:56px;min-width:0}
.bv-sc{margin-left:auto;white-space:nowrap}
.bv-cta{position:sticky;bottom:0;z-index:2;padding:8px 0}
.bv-cta .cta{width:100%;min-height:56px}
.bv .ball-row{display:flex;align-items:flex-start;gap:8px;min-height:44px;min-width:0}
.bv .ball-row .bv-why{flex:1 1 0;min-width:0;overflow-wrap:anywhere}
.bv-badge{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border:2px solid currentColor;box-sizing:border-box}
.bv .seg{display:flex;gap:6px}.bv .seg button{flex:1 1 0;min-height:56px;min-width:0}
`;

function crease(vm) {
  return (vm.crease || []).map((b) =>
    `<div class="row bv-seat" aria-label="${esc(b.name)}${b.onStrike ? ', on strike' : ''}">` +
    ic(ROLE[b.bat] || 'roleMiddle') + `<b class="name bv-name">${esc(b.name)}</b>` +
    (b.onStrike ? '<span class="chip" aria-label="On strike">● Strike</span>' : '') +
    `<span class="bv-sc">${esc(b.r)} (${esc(b.b)})</span></div>`).join('');
}

function lastBlock(vm) {
  const L = vm.last; if (!L) return '';
  const bw = typeof L.bowler === 'number' ? (vm.bowlers || []).find((x) => x.i === L.bowler) : null;
  const bowlerName = (bw && bw.name) || (L.bowler && L.bowler.name) || L.bowlerName || 'The bowler';
  const fld = L.field === 'P' ? 'Protect' : 'Attack';
  const rows = (L.balls || []).slice(0, 6).map((r) => {
    const bn = r.batterName || (vm.batNames && vm.batNames[r.batter]) || (L.batters && L.batters[r.batter]) || (r.batter && r.batter.name) || 'The batter';
    return `<div class="ball-row"><span class="muted">${esc(r.n)}</span>` +
      `<span class="chip bv-badge" aria-label="${esc(outcomeLabel(r.o))}">${esc(BADGE[String(r.o)] != null ? BADGE[String(r.o)] : r.o)}</span>` +
      `<span class="why bv-why">${esc(whyLine(r, bn, bowlerName))}</span></div>`;
  }).join('');
  return `<section class="card" aria-label="Over ${esc(L.over)}"><div class="strip"><span>Over ${esc(L.over)}</span>` +
    `<span>${ic(TYPE[bw && bw.bowl] || 'overs', 20)} ${esc(bowlerName)}, ${fld} field</span></div>${rows}</section>`;
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
    `<span class="chip ${GCLS[p.label] || 'chip-even'}">${esc(p.label)}${p.inPhase ? ' ★' : ''} <span class="name">${esc(p.name)}</span></span>`).join('');
  return `<button class="card row chip bv-bowler${sel ? ' is-selected' : ''}" data-bowler="${b.i}" aria-pressed="${sel ? 'true' : 'false'}"${ok ? '' : ' disabled'}` +
    ` aria-label="${esc(b.name)}, ${esc(b.bowl)}, ${esc(b.overs)} overs bowled, grade ${esc(g)}${ok ? '' : ', ' + reason(b, vm)}">` +
    `<span class="bv-r1">${ic(TYPE[b.bowl] || 'typeMedium')}<b class="name bv-name">${esc(b.name)}</b>` +
    `<span class="muted">${esc(b.overs)}/2</span><span class="chip chip-grade">${esc(g)}</span></span>` +
    (ok ? (prev ? `<span class="bv-prev">${prev}</span>` : '') : `<span class="bv-r2 muted">${esc(reason(b, vm))}</span>`) + '</button>';
}

/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  if (!document.getElementById('bv-style')) {
    const s = document.createElement('style'); s.id = 'bv-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  const sc = vm.score || {}, fld = vm.call && vm.call.field;
  el.__bvDispatch = dispatch; el.__bvVM = vm;
  el.innerHTML =
    `<div class="screen bv"><div class="strip" role="status"><span><b>${esc(sc.runs)}/${esc(sc.wk)}</b></span>` +
    `<span>Ov ${esc(sc.overs)}</span><span>${esc(vm.phaseName)}</span></div>` +
    `<div class="bv-cols two-col"><div class="bv-left">` +
    `<section class="card" aria-label="Call"><div class="strip"><span>Over ${esc(vm.over)}: pick a bowler</span></div>` +
    (vm.bowlers || []).map((b) => chip(b, vm)).join('') +
    `<div class="seg" role="group" aria-label="Field">` +
    `<button class="bv-tap${fld === 'A' ? ' is-selected' : ''}" data-field="A" aria-pressed="${fld === 'A'}">${ic('fieldAttack')} Attack</button>` +
    `<button class="bv-tap${fld === 'P' ? ' is-selected' : ''}" data-field="P" aria-pressed="${fld === 'P'}">${ic('fieldProtect')} Protect</button></div></section></div>` +
    `<div class="bv-right"><section class="card" aria-label="At the crease"><div class="strip"><span>At the crease</span></div>${crease(vm)}</section>` +
    lastBlock(vm) + `</div></div>` +
    `<div class="bv-cta"><button class="cta bv-tap" data-bowl${vm.canBowl === false ? ' disabled' : ''}>Bowl over ${esc(vm.over)}</button></div></div>`;
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
