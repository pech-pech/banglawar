/* workshop-view: the Wheel Workshop (Wheel meta). Wheel front view, four branch spokes with ranks as beads, Spoke count, node list, node sheet.
   render(el, vm, dispatch, open) draws into el. openWorkshop(vm, dispatch, open, arg, refresh) shows it as a full overlay (route "sheet:workshop" from Home).
   vm = workshopVM(s) = { visible, spokes, tier 1..7, material, branches:[{ id:'control'|'fortune'|'specialist'|'craft', name,
         nodes:[{ id, name, rank, max, cost, state:'owned'|'buy'|'short'|'locked'|'max', words, confirm }] }], swap:{ open, coins } }
   Commands: BuyNode {id}, SwapSpokes {}. View state only (module): the picked branch tab. The spin count is never shown; locked reads "Opens later". */
import { esc } from './dom.js';
import { openSheet } from './sheet.js';
import { MATERIALS, MAT_NAME, matOf, rgb, wheelSvg, spokeIcon } from './wheel-look.js';

const BRANCH_ANGLE = { control: -3 * Math.PI / 4, fortune: -Math.PI / 4, specialist: Math.PI / 4, craft: 3 * Math.PI / 4 };
const BRANCH_ORDER = ['control', 'fortune', 'specialist', 'craft'];
const BRANCH_NOTE = { control: 'Control branch', fortune: 'Fortune branch', specialist: 'Specialist branch', craft: 'Craft branch: looks only' };
let swapNote = ''; // the last swap, said once in the swap card (view state)
let picked = null; // the open branch tab (view state, never saved)

const costOf = (n) => (Array.isArray(n.cost) ? (n.cost[Math.min(n.rank || 0, n.cost.length - 1)] || 0) : Number(n.cost) || 0);
const done = (n) => n.state === 'owned' || n.state === 'max';
const beadsHtml = (n) => { let h = ''; for (let i = 0; i < (n.max || 1); i++) h += '<i class="wk-bead' + (i < (n.rank || 0) ? ' is-on' : '') + '"></i>'; return '<span class="wk-beads" aria-hidden="true">' + h + '</span>'; };
const sayRank = (n) => ((n.max || 1) > 1 ? 'rank ' + (n.rank || 0) + ' of ' + n.max : done(n) ? 'Owned' : 'Not owned yet'); // one-rank nodes: no "rank 0 of 1"
/** "Opens with the Gold wheel" when the node waits for a wheel tier; "Opens later" when it waits on another upgrade. */
const opensWith = (n, tier) => (n.tier && tier && n.tier > tier && MATERIALS[n.tier - 1] ? 'Opens with the ' + MAT_NAME[MATERIALS[n.tier - 1]] + ' wheel' : 'Opens later');

export function nodeRowHtml(n, spokes, tier) {
  const c = costOf(n), st = done(n) ? 'owned' : n.state === 'buy' ? 'buy' : n.state === 'short' ? 'short' : 'locked';
  const end = st === 'owned' ? '<span class="wk-end wk-end--ok"><span class="c-ico c-ico--check" aria-hidden="true"></span></span>'
    : st === 'locked' ? '<span class="wk-end wk-end--lock"><span class="c-ico c-ico--lock" aria-hidden="true"></span></span>'
    : '<span class="wk-end wk-end--cost' + (st === 'short' ? ' is-short' : '') + '"><b>' + esc(c) + '</b>' + spokeIcon(20) + '</span>';
  const sub = st === 'locked' ? opensWith(n, tier) : n.words || '';
  const aria = n.name + ', ' + sayRank(n) + '. ' + (st === 'owned' ? 'Owned' : st === 'locked' ? opensWith(n, tier) : st === 'short' ? 'Need ' + c + ' Spokes, you have ' + spokes : 'Costs ' + c + ' Spokes');
  return '<li><button type="button" class="c-btn wk-node wk-node--' + st + '" data-wk-node="' + esc(n.id) + '" aria-label="' + esc(aria) + '">' +
    '<span class="wk-nico" aria-hidden="true">' + (st === 'locked' ? '<span class="c-ico c-ico--lock"></span>' : spokeIcon(26)) + '</span>' +
    '<span class="wk-nt"><b class="wk-nn">' + esc(n.name) + '</b><span class="wk-ns">' + esc(sub) + '</span>' + (n.max > 1 ? beadsHtml(n) : '') + '</span>' + end + '</button></li>';
}

function wheelCard(vm, sel) {
  const tier = Math.max(1, Math.min(7, vm.tier || 1)), mat = vm.material || MATERIALS[tier - 1];
  const beads = BRANCH_ORDER.map((id) => { const b = (vm.branches || []).find((x) => x.id === id), ns = b ? b.nodes : []; return { total: ns.reduce((a, n) => a + (n.max || 1), 0), on: ns.reduce((a, n) => a + (n.rank || 0), 0), sel: id === sel }; });
  const legend = MATERIALS.map((m, i) => '<li class="wk-lg' + (i + 1 === tier ? ' is-now' : '') + '"><i style="background:' + rgb(matOf(m).rim) + '"></i><span>' + MAT_NAME[m] + '</span><b>' + (i + 1 === tier ? 'Now' : i + 1 < tier ? 'Open' : i + 1 === tier + 1 ? 'Next' : 'Locked') + '</b></li>').join('');
  const all = beads.reduce((a, b) => a + b.on, 0), tot = beads.reduce((a, b) => a + b.total, 0);
  return '<div class="c-card wk-wcard"><div class="wk-wv" role="img" aria-label="Your wheel, ' + esc(MAT_NAME[mat] || mat) + ', ' + all + ' of ' + tot + ' ranks owned">' +
    wheelSvg({ mat, spokes: 4, size: 150, angles: BRANCH_ORDER.map((id) => BRANCH_ANGLE[id]), beads }) + '</div><ul class="wk-legend" aria-label="Wheel materials">' + legend + '</ul></div>';
}

export function workshopHtml(vm) {
  const bs = vm.branches || [];
  if (!picked || !bs.some((b) => b.id === picked)) picked = (bs[0] || {}).id;
  const cur = bs.find((b) => b.id === picked) || { nodes: [] }, spokes = Number(vm.spokes) || 0, sw = vm.swap;
  const tabs = bs.map((b) => '<button type="button" class="c-btn wk-tab" data-wk-branch="' + esc(b.id) + '" aria-pressed="' + (b.id === picked) + '"><span>' + esc(b.name) + '</span></button>').join('');
  return '<div class="c-strip strip wk-top"><span class="wk-ttl">Wheel Workshop</span><span class="c-strip__right"><span class="wk-spk" role="status" aria-label="' + spokes + ' Spokes">' + spokeIcon(22) + '<b>' + esc(spokes) + '</b></span>' +
    '<button type="button" class="c-icon-btn" data-wk-close aria-label="Close"><span class="c-ico c-ico--x"></span></button></span></div>' +
    '<div class="wk-body">' + wheelCard(vm, picked) + '<div class="wk-tabs" role="group" aria-label="Branches">' + tabs + '</div>' +
    '<h3 class="wk-bh">' + esc(BRANCH_NOTE[picked] || (cur.name + ' branch')) + '</h3><ul class="wk-list">' + cur.nodes.map((n) => nodeRowHtml(n, spokes, vm.tier)).join('') + '</ul>' +
    (sw && sw.open ? '<div class="c-card wk-swap"><span>Spare Spokes: swap 2 for 1 Coin</span><button type="button" class="c-btn c-btn--gold" data-wk-swap' + (spokes < 2 ? ' disabled aria-disabled="true"' : '') + '>Swap spare Spokes</button>' + (swapNote ? '<p class="wk-swapnote" role="status">' + esc(swapNote) + '</p>' : '') + '</div>' : '') + '</div>';
}

/** Node sheet body: the effect in words, the state line, the buttons. step 'ask' = the confirm step for a costly node. */
export function nodeSheetHtml(n, spokes, step, tier) {
  const c = costOf(n), st = done(n) ? 'owned' : n.state === 'buy' ? 'buy' : n.state === 'short' ? 'short' : 'locked';
  const head = '<div class="wk-sh"><span class="wk-nico" aria-hidden="true">' + (st === 'locked' ? '<span class="c-ico c-ico--lock"></span>' : spokeIcon(32)) + '</span><div><small>' + esc(sayRank(n)) + '</small>' + (n.max > 1 ? beadsHtml(n) : '') + '</div></div>';
  const words = '<p class="wk-sw">' + esc(n.words || '') + '</p>';
  if (st === 'owned') return head + words + '<p class="wk-st">' + (n.state === 'max' || n.rank >= n.max ? 'All ranks owned.' : 'Owned.') + '</p>';
  if (st === 'locked') return head + words + '<p class="wk-st">' + esc(opensWith(n, tier)) + '.</p>';
  if (st === 'short') return head + words + '<p class="wk-st is-short">Need ' + esc(c) + ' Spokes, you have ' + esc(spokes) + '.</p>';
  if (step === 'ask') return head + words + '<p class="wk-st">Buy? This stays for the run.</p><div class="wk-btns"><button type="button" class="c-btn c-btn--gold c-btn--block" data-wk-yes>Yes, buy ' + spokeIcon(20) + esc(c) + '</button><button type="button" class="c-btn c-btn--block" data-wk-back>Back</button></div>';
  return head + words + '<p class="wk-st">Costs ' + esc(c) + ' Spokes. You have ' + esc(spokes) + '.</p><div class="wk-btns"><button type="button" class="c-btn c-btn--gold c-btn--block" data-wk-buy>Buy ' + spokeIcon(20) + esc(c) + '</button></div>';
}

function bind(el) {
  if (el.__wkBound) return; el.__wkBound = true;
  el.addEventListener('click', (e) => {
    const x = el.__wk, t = e.target && e.target.closest ? e.target : null; if (!x || !t) return;
    const br = t.closest('[data-wk-branch]'), nd = t.closest('[data-wk-node]');
    if (br) { picked = br.getAttribute('data-wk-branch'); redraw(el); }
    else if (nd) openNode(el, nd.getAttribute('data-wk-node'));
    else if (t.closest('[data-wk-swap]')) openSwap(el);
    else if (t.closest('[data-wk-close]') && x.close) x.close();
  });
}
function redraw(el, fresh) {
  const x = el.__wk; if (!x) return;
  if (fresh && x.refresh) x.vm = x.refresh() || x.vm;
  const dom = typeof document !== 'undefined' && el.querySelector && el.contains, ae = dom && el.contains(document.activeElement) ? document.activeElement : null;
  const key = ae && ae.getAttribute ? (ae.getAttribute('data-wk-branch') ? '[data-wk-branch="' + ae.getAttribute('data-wk-branch') + '"]' : ae.getAttribute('data-wk-node') ? '[data-wk-node="' + ae.getAttribute('data-wk-node') + '"]' : '') : '';
  const old = dom ? el.querySelector('.wk-body') : null, st = old ? old.scrollTop : 0;
  el.innerHTML = '<div class="wk-screen">' + workshopHtml(x.vm) + '</div>';
  if (!dom) return;
  const nb = el.querySelector('.wk-body'); if (nb) nb.scrollTop = st;
  if (key) { const f = el.querySelector(key); if (f) f.focus(); }
}
/** Swap spare Spokes: the real numbers in a confirm sheet (never silent). All the spare Spokes go in pairs: 36 of 37 Spokes -> 18 Coins. */
export function swapSheetHtml(spokes, rate) {
  const r = rate || 2, coins = Math.floor((Number(spokes) || 0) / r), sp = coins * r;
  return '<p class="wk-st wk-swq">Swap ' + esc(sp) + ' Spokes for ' + esc(coins) + ' Coins?</p><p class="wk-sw">' + esc(r) + ' Spokes make 1 Coin. ' + ((Number(spokes) || 0) - sp > 0 ? 'You keep ' + esc((Number(spokes) || 0) - sp) + '.' : 'You keep none.') + '</p>' +
    '<div class="wk-btns"><button type="button" class="c-btn c-btn--gold c-btn--block" data-wk-swap-yes>Yes, swap ' + esc(sp) + '</button><button type="button" class="c-btn c-btn--block" data-wk-swap-back>Back</button></div>';
}
function openSwap(el) {
  if (typeof document === 'undefined') return;
  const x = el.__wk, rate = (x.vm.swap && x.vm.swap.rate) || 2, spokes = Number(x.vm.spokes) || 0, coins = Math.floor(spokes / rate); if (coins < 1) return;
  if (el.__wkOv) el.__wkOv.inert = true;
  const close = openSheet('Swap Spokes', swapSheetHtml(spokes, rate), { onClose() { if (el.__wkOv) el.__wkOv.inert = false; }, returnFocus: ['[data-wk-swap]', '.wk-tab[aria-pressed="true"]'] });
  const body = document.querySelector('.sheet-fixed .c-sheet__body'); if (!body) return;
  const y = body.querySelector('[data-wk-swap-yes]'); if (y) y.focus();
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-wk-swap-yes')) { close(); x.dispatch('SwapSpokes', {}); swapNote = 'Swapped ' + coins * rate + ' Spokes for ' + coins + ' Coins.'; redraw(el, true); }
    else if (t.hasAttribute('data-wk-swap-back')) close();
  });
}
function findNode(vm, id) { for (const b of vm.branches || []) for (const n of b.nodes) if (n.id === id) return n; return null; }
function openNode(el, id) {
  const x = el.__wk, n = findNode(x.vm, id); if (!n) return;
  const sp = Number(x.vm.spokes) || 0;
  if (el.__wkOv) el.__wkOv.inert = true;
  const close = openSheet(n.name, nodeSheetHtml(n, sp, '', x.vm.tier), { onClose() { if (el.__wkOv) el.__wkOv.inert = false; }, returnFocus: ['[data-wk-node="' + id + '"]', '.wk-tab[aria-pressed="true"]'] });
  const body = document.querySelector('.sheet-fixed .c-sheet__body'); if (!body) return;
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    if (t.hasAttribute('data-wk-buy')) {
      if (n.confirm) { body.innerHTML = nodeSheetHtml(n, sp, 'ask', x.vm.tier); const y = body.querySelector('[data-wk-yes]'); if (y) y.focus(); return; }
      buy();
    } else if (t.hasAttribute('data-wk-yes')) buy();
    else if (t.hasAttribute('data-wk-back')) { body.innerHTML = nodeSheetHtml(n, sp, '', x.vm.tier); }
  });
  function buy() { close(); x.dispatch('BuyNode', { id }); redraw(el, true); }
}

export function render(el, vm, dispatch, open) {
  const old = el.__wk; el.__wk = { vm, dispatch, open, close: old && old.close, refresh: old && old.refresh };
  bind(el); redraw(el);
}

/** The overlay: appended to body below the sheet layer (css .wk-ov z-index 4), the page behind inert. */
export function openWorkshop(vm, dispatch, open, arg, refresh) {
  const app = document.getElementById('app'), wasInert = !!(app && app.inert), opener = document.activeElement;
  const ov = document.createElement('section'); ov.className = 'wk-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Wheel Workshop');
  document.body.appendChild(ov); if (app) app.inert = true; swapNote = '';
  let closed = false;
  function close() { if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); ov.remove(); if (app) app.inert = wasInert; if (opener && opener.isConnected && opener.focus) opener.focus(); }
  function onKey(e) { if (e.key === 'Escape' && !document.querySelector('.sheet-fixed')) { e.preventDefault(); e.stopPropagation(); close(); } }
  document.addEventListener('keydown', onKey, true);
  ov.__wkOv = ov; ov.__wk = { vm, dispatch, open, close, refresh };
  bind(ov); redraw(ov);
  const f = ov.querySelector('.wk-tab[aria-pressed="true"]'); if (f) f.focus();
  return close;
}
