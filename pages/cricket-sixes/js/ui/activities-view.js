/* activities-view: "This week's fan activity". Home card + sheet. Reads activitiesVM(s) only (shape in build/r9/UI-CLUB.md).
   Tap an activity -> plain confirm (cost, Fans, find chance) -> PickActivity { id }. "Rest week" is free: PickActivity { id: 'rest' }. Never blocked by Coins reserve (warn only). */
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { spinFind } from './wm-spins.js';

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ICON = { street: 'runs', clinic: 'team', signing: 'book', tea: 'shop', sixhit: 'burst', banner: 'pennant' };
const iconOf = (o) => ICON[o.id] || 'fan';

/** One line saying what this week's pick gave (Home card and sheet). */
export function doneLine(d) {
  if (!d) return '';
  if (d.id === 'rest') return 'Rest week. Nothing spent.';
  const f = d.find;
  const t = f && typeof f === 'object' ? f.type : f;
  const find = !t || t === 'none' ? '' : t === 'coins' ? (f.coins != null ? ' Found ' + fmt(f.coins) + ' Coins.' : ' Found some Coins.') : t === 'player' ? ' Found a trial player.' : t === 'coach' ? ' Found a trial coach' + (f.name ? ': ' + f.name : '') + '.' : ' Found something.';
  return (d.name || 'Activity') + ': +' + fmt(d.fans) + ' Fans.' + find;
}

/** Home card. A button that opens the sheet. Returns '' when the feature is off (vm null/on false). */
export function activitiesCardHtml(vm) {
  if (!vm) return '';
  const done = !!(vm.picked || vm.available === false);
  const sub = done ? (doneLine(vm.picked) || 'Done for this week.') : 'Pick one, or rest. Resting is free.';
  return '<button type="button" class="c-btn c-card cl-card cl-act' + (done ? ' is-done' : '') + '" data-act="sheet:activities" aria-label="' + esc('This week\'s fan activity. ' + sub) + '">' +
    icoDeco(done ? 'done' : 'fan', 24) + '<span class="cl-card__t"><b>This week\'s fan activity</b><small>' + esc(sub) + '</small></span></button>';
}

/** vm.pity = { weeks: picked weeks since the last find, of: weeks until a find is sure }. */
function pityLeft(vm) { const p = vm && vm.pity; return p && p.of != null && p.weeks != null ? Math.max(1, p.of - p.weeks) : null; }

function optionBtn(o) {
  const tags = [];
  if (o.repeat) tags.push('Same as last week: half the Fans, no find');
  const find = o.repeat ? '' : o.findPct ? 'Find chance about ' + o.findPct + ' in 100' : '';
  const state = o.warn ? o.warn : '';
  return '<button type="button" class="c-btn cl-opt" data-cl-pick="' + esc(o.id) + '" aria-label="' + esc(o.name + '. ' + o.cost + ' Coins, ' + o.fans + ' Fans. ' + (o.blurb || '') + (tags[0] ? '. ' + tags[0] : '')) + '">' +
    icoDeco(iconOf(o), 24) + '<span class="cl-opt__t"><span class="cl-opt__n">' + esc(o.name) + '</span>' +
    '<span class="cl-opt__s"><span class="cl-nb">' + icoDeco('coin', 16) + fmt(o.cost) + ' Coins</span><span class="cl-nb">' + icoDeco('fan', 16) + '+' + fmt(o.fans) + ' Fans</span>' + (find ? '<span class="cl-nb">' + icoDeco('info', 16) + esc(find) + '</span>' : '') + '</span>' +
    (tags[0] ? '<span class="cl-opt__s">' + icoDeco('info', 16) + esc(tags[0]) + '</span>' : '') +
    (state ? '<span class="cl-opt__s">' + icoDeco('alert', 16) + esc(state) + '</span>' : '') + '</span></button>';
}

function confirmHtml(o, vm) {
  if (o.id === 'rest') {
    return '<div class="screen cl-screen cl-confirm"><h3 class="cl-h" tabindex="-1">Rest this week?</h3><p class="cl-note">' + icoDeco('info', 24) + '<span>No Coins spent, no Fans. Nothing bad happens.</span></p>' +
      '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-act="PickActivity" data-id="rest">' + icoDeco('done', 24) + '<span>Yes, rest</span></button>' +
      '<button type="button" class="c-btn" data-cl-back="1">' + icoDeco('close', 24) + '<span>No, go back</span></button></div></div>';
  }
  const hasCoins = vm.coins != null, left = (Number(vm.coins) || 0) - (Number(o.cost) || 0);
  return '<div class="screen cl-screen cl-confirm"><h3 class="cl-h" tabindex="-1">' + esc(o.name) + '?</h3>' +
    (o.blurb ? '<p class="cl-note">' + icoDeco(iconOf(o), 24) + '<span>' + esc(o.blurb) + '</span></p>' : '') +
    '<ul class="cl-facts"><li>' + icoDeco('coin', 24) + '<span>Cost: ' + fmt(o.cost) + ' Coins</span></li>' +
    '<li>' + icoDeco('fan', 24) + '<span>Fans: +' + fmt(o.fans) + (o.repeat ? ' (half, same as last week)' : '') + '</span></li>' +
    '<li>' + icoDeco('info', 24) + '<span>' + (o.repeat ? 'No find this time.' : 'Find chance about ' + (o.findPct || 0) + ' in 100. Good timing helps. Finds are Coins or a trial player.') + '</span></li>' +
    (hasCoins ? '<li>' + icoDeco('coin', 24) + '<span>Coins after: ' + (o.ok === false ? 'not enough' : fmt(left)) + '</span></li>' : '') + '</ul>' +
    (o.warn ? '<p class="cl-note cl-note--warn" role="status">' + icoDeco('alert', 24) + '<span>' + esc(o.warn) + '</span></p>' : '') +
    (o.ok === false ? '<p class="cl-note cl-note--warn" role="status">' + icoDeco('lock', 24) + '<span>' + esc(o.why || 'Not enough Coins.') + '</span></p>' : '') +
    '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-act="PickActivity" data-id="' + esc(o.id) + '"' + (o.ok === false ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('done', 24) + '<span>Yes, do it</span></button>' +
    '<button type="button" class="c-btn" data-cl-back="1">' + icoDeco('close', 24) + '<span>No, go back</span></button></div></div>';
}

function bind(root, dispatch) {
  if (!root.__clBound) {
    root.__clBound = true;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-cl-pick],[data-cl-back],[data-cl-act],[data-cl-close]');
      if (!t || !root.contains(t) || t.disabled) return;
      if (t.hasAttribute('data-cl-close')) { if (root.__clClose) root.__clClose(); }
      else if (t.hasAttribute('data-cl-pick')) { root.__clPick = t.getAttribute('data-cl-pick'); renderActivities(root, root.__clVm, dispatch); const sc = root.closest && root.closest('.c-sheet__body'); if (sc) sc.scrollTop = 0; const h = root.querySelector('.cl-h'); if (h) h.focus(); }
      else if (t.hasAttribute('data-cl-back')) { const was = root.__clPick; root.__clPick = null; renderActivities(root, root.__clVm, dispatch); const b = root.querySelector('[data-cl-pick="' + was + '"]'); if (b) b.focus(); }
      else {
        const id = t.getAttribute('data-id'); root.__clPick = null;
        const o = ((root.__clVm && root.__clVm.options) || []).find((x) => x.id === id);
        if (o && o.reel && !o.repeat && root.__clReel) root.__clReel(o); // wheel meta: the Find reel; its STOP sends the pick (flag off: o.reel is null, the old tap)
        else dispatch('PickActivity', { id });
      }
    });
  }
}

export function renderActivities(root, vm, dispatch) {
  vm = vm || { options: [] };
  const opts = Array.isArray(vm.options) ? vm.options : [];
  const pick = root.__clPick || null;
  if (root.__clResult) {
    root.innerHTML = '<div class="screen cl-screen cl-result"><h3 class="cl-h" tabindex="-1">' + icoDeco('done', 24) + '<span>Done</span></h3>' +
      '<p class="cl-note" role="status" aria-live="polite">' + icoDeco(root.__clResult.find ? 'fan' : 'done', 24) + '<span>' + esc(root.__clResult.fans) + '</span></p>' +
      (root.__clResult.find ? '<p class="cl-note cl-found" role="status" aria-live="polite">' + icoDeco('scout', 24) + '<span>' + esc(root.__clResult.find) + '</span></p>' : '') +
      '<div class="cl-actions"><button type="button" class="c-btn c-btn--primary" data-cl-close="1">' + icoDeco('done', 24) + '<span>OK</span></button></div></div>';
    const h = root.querySelector && root.querySelector('.cl-h'); if (h && h.focus) h.focus();
    bind(root, dispatch); root.__clVm = vm; return root;
  }
  const found = pick === 'rest' ? { id: 'rest' } : opts.find((o) => o.id === pick);
  if (found && vm.available !== false) root.innerHTML = confirmHtml(found, vm);
  else {
    root.__clPick = null;
    const d = vm.picked || null;
    root.innerHTML = '<div class="screen cl-screen cl-acts">' +
      (vm.coins != null ? '<p class="cl-purse" aria-label="' + esc(fmt(vm.coins) + ' Coins') + '">' + icoDeco('coin', 24) + '<b>' + fmt(vm.coins) + '</b> Coins</p>' : '') +
      (vm.available === false || d ? '<p class="cl-note" role="status">' + icoDeco('done', 24) + '<span>' + esc(doneLine(d) || 'Done for this week.') + ' Next one next week.</span></p>'
        : '<p class="cl-note">' + icoDeco('fan', 24) + '<span>One each week. Each gives Fans and a small find chance. Good timing helps.</span></p>' +
          '<div class="cl-opts">' + opts.map(optionBtn).join('') + '</div>' +
          '<button type="button" class="c-btn cl-opt cl-rest" data-cl-pick="rest">' + icoDeco('week', 24) + '<span class="cl-opt__t"><span class="cl-opt__n">Rest week</span><span class="cl-opt__s">Free. No penalty.</span></span></button>') +
      (pityLeft(vm) != null && !(vm.available === false || d) ? '<p class="cl-note">' + icoDeco('info', 24) + '<span>A find is sure within ' + esc(pityLeft(vm)) + ' more picked ' + (pityLeft(vm) === 1 ? 'week' : 'weeks') + '.</span></p>' : '') + '</div>';
  }
  bind(root, dispatch);
  root.__clVm = vm;
  return root;
}

/** The reveal moment: what this week's pick gave, from the fresh view model (never a flash: the sheet stays until OK). */
export function resultOf(vm) {
  const d = vm && vm.picked; if (!d) return null;
  const f = d.find, ty = f && typeof f === 'object' ? f.type : f;
  const tr = vm.trial || null;
  let find = '';
  if (ty === 'player') find = 'Found a trial player' + (tr && tr.player ? ': ' + tr.player.name : '') + '!';
  else if (ty === 'coach') find = 'Found a trial coach' + (tr && tr.coach ? ': ' + tr.coach.name : '') + '!';
  else if (ty === 'coins') find = f.coins != null ? 'Found ' + fmt(f.coins) + ' Coins!' : 'Found some Coins!';
  const fans = d.id === 'rest' ? 'Rest week. Nothing spent.' : (d.name || 'Activity') + ': +' + fmt(d.fans) + ' Fans.';
  return { fans, find };
}

/** Sheet opener (app.js SHEETS: open(vm, dispatch, open, arg, refresh)). The sheet stays open after a pick to show the result. */
export function openActivities(vm, dispatch, _open, _arg, refresh) {
  const host = document.createElement('div');
  let close;
  renderActivities(host, vm, (n, a) => {
    dispatch(n, a);
    const fresh = n === 'PickActivity' && refresh ? refresh() : null;
    const res = fresh && resultOf(fresh);
    if (res) { host.__clResult = res; host.__clClose = close; renderActivities(host, fresh, () => {}); }
    else if (close) close();
  });
  // wheel meta: the Find reel. The first SPIN sends PickActivity { id, stop }; the stored result is read back from the fresh view model.
  host.__clReel = (o) => {
    const cur = () => { const v = refresh ? refresh() : host.__clVm, x = ((v && v.options) || []).find((y) => y.id === o.id); return (x && x.reel) || o.reel; };
    spinFind({ get: cur, look: (host.__clVm || vm).look, title: o.name, pick: (extra) => dispatchPick('PickActivity', { id: o.id, ...extra }), onCollect: () => { const ok = host.querySelector('[data-cl-close]'); if (ok) ok.focus(); } });
  };
  const dispatchPick = (n, a) => { dispatch(n, a); const fresh = refresh ? refresh() : null, res = fresh && resultOf(fresh); if (res) { host.__clResult = res; host.__clClose = close; renderActivities(host, fresh, () => {}); } };
  close = openSheet('Fan activity', '');
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  body.textContent = '';
  body.appendChild(host);
  return close;
}
