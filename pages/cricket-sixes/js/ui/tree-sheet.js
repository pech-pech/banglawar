/* tree-sheet: 5c Skill tree, a bottom sheet (sheet.js). open(vm, dispatch, open); vm = treeVM(id)
   treeVM = { id, name, tp, blocked: string|null,            blocked = why no node can be bought this week (one a week), else null
     trees:[{ side:'bat'|'bowl', title:'Lower batting', key:'lower', owned, boost:{on:boolean, text},
              nodes:[{ i, name, text, cost, icon?, state:'done'|'next'|'locked', reason: string|null }] }] }   reason = why it cannot be bought now
   Tap a node to read it; the gold button buys the picked node: UnlockNode {playerId, side, node:i}, then open('tree', {id}) re-opens fresh.
   The picked node is view state only (module variable, cleared on close). */
import { openSheet } from './sheet.js';
import { esc, bindActs } from './dom.js';
import { roleIcon, typeIcon, deco } from './letters-ui.js';

let picked = null; // `${side}:${i}`

function chip(side, n, isPicked) {
  const st = n.state;
  const ic = st === 'done' ? 'done' : st === 'locked' ? 'lock' : (n.icon || 'upgrade');
  const word = st === 'done' ? 'Owned' : st === 'next' ? 'Next' : 'Locked';
  const wait = st === 'locked' && n.weekLock;
  return '<button type="button" class="c-chip tr-node tr-node--' + st + (isPicked ? ' is-selected' : '') + '" data-node="' + side + ':' + n.i + '" aria-pressed="' + (isPicked ? 'true' : 'false') + '"' +
    ' aria-label="' + esc(n.name + ', ' + word + (st === 'done' ? '' : ', ' + n.cost + ' training points') + (wait ? '. ' + (n.reason || '') : '')) + '">' +
    deco(ic, 24) + '<span class="tr-node__c">' + (st === 'done' ? 'Owned' : wait ? 'Wait' : esc(n.cost)) + '</span></button>';
}

export function treeHtml(vm, sel) {
  const trees = vm.trees || [];
  const all = [];
  trees.forEach((t) => (t.nodes || []).forEach((n) => all.push({ t, n })));
  const cur = all.filter((x) => x.t.side + ':' + x.n.i === sel)[0] || null;
  let h = '';
  trees.forEach((t) => {
    const wk = (t.nodes || []).filter((n) => n.weekLock)[0];
    h += '<section class="tr-tree-sec" aria-label="' + esc(t.title) + '">' +
      '<div class="tr-h"><b class="tr-iw">' + deco(t.side === 'bat' ? roleIcon(t.key) : typeIcon(t.key), 24) + '<span>' + esc(t.title) + '</span></b><span>' + esc(t.owned) + ' of 5</span></div>' +
      '<p class="tr-note">' + deco('coach', 20) + '<span>' + esc(t.boost && t.boost.text) + '</span></p>' +
      '<div class="tr-nodes">' + (t.nodes || []).map((n) => chip(t.side, n, cur && cur.t === t && cur.n === n)).join('') + '</div>' +
      (wk ? '<p class="tr-wait">' + deco('lock', 20) + '<span>' + esc(wk.reason) + '</span></p>' : '') + '</section>';
  });
  if (cur) {
    const n = cur.n;
    const can = n.state === 'next' && !vm.blocked && !n.reason && vm.tp >= n.cost;
    const why = n.state === 'done' ? 'You own this.' : vm.blocked || n.reason || (vm.tp < n.cost ? 'You need ' + n.cost + ' TP and have ' + vm.tp + '.' : null);
    h += '<div class="c-card c-card--inset tr-info" role="status"><b>' + esc(n.name) + '</b><span>' + esc(n.text) + '</span>' +
      (why && !can ? '<span class="m0-warn">' + esc(why) + '</span>' : '') + '</div>';
    if (n.state !== 'done') {
      h += can
        ? '<button type="button" class="c-btn c-btn--gold c-btn--block tr-buy" data-act="UnlockNode" data-arg="' + esc(JSON.stringify({ playerId: vm.id, side: cur.t.side, node: n.i })) + '">' + deco('upgrade', 24) + '<span>Unlock</span>' + deco('tp', 20) + '<b>' + esc(n.cost) + '</b></button>'
        : '<button type="button" class="c-btn c-btn--block tr-buy is-disabled" disabled aria-disabled="true">' + deco('lock', 24) + '<span>Can’t unlock yet</span></button>';
    }
  } else {
    h += '<p class="tr-note">' + deco('info', 20) + '<span>Tap a skill to see what it does.</span></p>';
  }
  h += '<p class="tr-note">' + deco('week', 20) + '<span>Costs 30, 45, 75, 120, 180 TP, cheapest first. One new skill a week per player. It does not use the drill.</span></p>';
  return h;
}

export function open(vm, dispatch, openFn) {
  let close;
  function draw() {
    const body = document.querySelector('.sheet-fixed .c-sheet__body');
    if (body) body.innerHTML = treeHtml(vm, picked);
  }
  picked = null;
  close = openSheet(vm.name + ': skill trees', treeHtml(vm, picked), { onClose() { picked = null; } });
  const root = document.querySelector('.sheet-fixed');
  if (!root) return close;
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-node]');
    if (!b || !root.contains(b)) return;
    picked = b.getAttribute('data-node') === picked ? null : b.getAttribute('data-node');
    draw();
  });
  bindActs(root, (cmd, arg) => { close(); dispatch(cmd, arg); if (cmd === 'UnlockNode' && openFn) openFn('tree', { id: arg.playerId }); }, (name, arg) => { close(); if (openFn) openFn(name, arg); });
  return close;
}
