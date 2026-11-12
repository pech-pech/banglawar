// @ts-check
// Team sheet: one sheet, two tabs. Six = pick who plays and in what order; Overs = who bowls each over (pre-filled from matchups).
// open(vm, dispatch, open, arg, refresh): vm = teamVM; arg = { tab: 'six' | 'overs' }; refresh() returns a fresh teamVM after a dispatch.
// Every change is saved at once (TeamSix, TeamPlan, TeamSuggest), so X and Done both keep it. Done is off while the plan breaks a rule.
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { check } from './plan-view.js';

const ROLE_ICON = { Opener: 'roleOpener', Middle: 'roleMiddle', Lower: 'roleLower' };
const TYPE_ICON = { Fast: 'typeFast', Medium: 'typeMedium', Spin: 'typeSpin' };
const PHASES = [{ name: 'Early', range: '1-3', from: 1, to: 3 }, { name: 'Middle', range: '4-7', from: 4, to: 7 }, { name: 'Late', range: '8-10', from: 8, to: 10 }];
const FIELD = { A: { word: 'Attack', icon: 'fieldAttack' }, P: { word: 'Protect', icon: 'fieldProtect' } };

/** @param {any} vm @param {(cmd:string, payload?:any)=>void} dispatch @param {any} _open @param {any} arg @param {() => any} [refresh] */
export function openTeam(vm, dispatch, _open, arg, refresh) {
  let V = vm, tab = arg && arg.tab === 'overs' ? 'overs' : 'six';
  const st = { out: null, nudge: false, sel: -1, toast: '' };
  const bowlers = () => V.plan.bowlers || [];
  const ovs = () => V.plan.overs.map((o) => (typeof o.bowler === 'number' ? o.bowler : null));
  st.sel = ovs().indexOf(null);
  const sixOrder = () => V.players.filter((p) => p.order != null).sort((a, b) => a.order - b.order);
  const bench = () => V.players.filter((p) => p.order == null);
  const problem = () => check(ovs(), bowlers());
  const sync = () => { if (refresh) V = refresh(); };

  const close = openSheet('Team v ' + (V.opp || 'rival'), '<div class="ts-root"></div>');
  const root = /** @type {HTMLElement} */ (document.querySelector('.sheet-fixed .ts-root'));
  const body = /** @type {HTMLElement} */ (root.parentElement);
  body.classList.add('ts-body'); if (body.parentElement) body.parentElement.classList.add('tr-tall', 'ts-sheet');

  function playerRow(p, on) {
    const hidden = !p.grade || p.grade === '?';
    const picked = st.out === p.id;
    const sub = (p.role ? esc(p.role) : '') + (p.type ? ' · ' + icoDeco(TYPE_ICON[p.type], 14) + esc(p.type) : '');
    const label = p.name + ', ' + (p.role || '') + ', ' + (p.type || '') + ', ability ' + p.ability + ', ' + (hidden ? 'grade hidden' : 'grade ' + p.grade) +
      (on ? '. Playing, bats number ' + (p.order + 1) + '. Tap to swap out.' : '. On the bench. Tap to bring in.') + (picked ? ' Selected.' : '');
    return '<button type="button" class="ts-row' + (picked ? ' is-selected' : '') + (on ? '' : ' ts-row--bench') + '" data-pid="' + esc(p.id) + '" aria-pressed="' + picked + '" aria-label="' + esc(label) + '">' +
      '<span class="ts-ico">' + icoDeco(ROLE_ICON[p.role] || 'roleMiddle', 24) + '</span>' +
      '<span class="ts-nm"><span class="name">' + (on ? '<b class="ts-ord" aria-hidden="true">' + (p.order + 1) + '</b>' : '') + esc(p.name) + (picked ? '<span class="ts-out">' + icoDeco('alert', 14) + 'Out</span>' : '') + '</span><small>' + sub + '</small></span>' +
      '<span class="ts-n"><b>' + esc(p.ability) + '</b></span>' +
      '<span class="ts-n ts-g' + (hidden ? ' is-q' : '') + '"><b>' + (hidden ? '?' : esc(p.grade)) + '</b></span>' +
      '' + '</button>';
  }

  function sixPane() {
    const six = sixOrder(), ben = bench();
    const outName = st.out ? (V.players.find((p) => p.id === st.out) || {}).name : '';
    return '<p class="ts-strip">' + (st.toast ? '<b>' + esc(st.toast) + '</b>' : st.out ? '<b>' + esc(outName) + ' goes out.</b> Tap who comes in below.' : st.nudge ? '<b>Tap who goes out first.</b>' : 'Playing. <b>Tap to swap</b>') + '</p>' +
      '<div class="ts-cols" aria-hidden="true"><span>Player</span><span>Ability</span><span>Potential grade</span></div>' +
      '<div class="ts-list" role="group" aria-label="Playing six">' + six.map((p) => playerRow(p, true)).join('') + '</div>' +
      '<p class="ts-strip">Bench: ' + ben.length + ' not playing</p>' +
      '<div class="ts-list" role="group" aria-label="Bench">' + ben.map((p) => playerRow(p, false)).join('') + '</div>';
  }

  function oversPane() {
    const o = ovs(), fields = V.plan.fields, { warn, problems, reason, valid } = problem();
    const nameOf = (i) => (bowlers().find((b) => b.i === i) || {}).name || '';
    const count = (i) => o.filter((b) => b === i).length;
    const slot = (k) => {
      const b = o[k], w = warn[k], on = st.sel === k;
      return '<button type="button" class="ts-slot' + (on ? ' is-selected' : '') + (w ? ' is-warn' : '') + (b == null ? ' is-empty' : '') + '" data-slot="' + k + '" aria-pressed="' + on + '" aria-label="Over ' + (k + 1) + ', ' + (b == null ? 'no bowler yet' : esc(nameOf(b))) + (w ? '. Problem: ' + w : '') + '">' +
        '<span class="ts-sn">' + (k + 1) + (w ? '<i class="ts-bang" aria-hidden="true">!</i>' : '') + '</span><span class="name ts-sb">' + (b == null ? 'Pick' : esc(nameOf(b))) + '</span></button>';
    };
    const band = (ph, pi) => {
      const f = FIELD[fields[pi]] || FIELD.P, slots = [];
      for (let k = ph.from; k <= ph.to; k++) slots.push(slot(k - 1));
      return '<div class="ts-band"><button type="button" class="ts-field" data-field="' + pi + '" aria-label="' + ph.name + ' overs ' + ph.range + ': ' + f.word + ' field. Tap to switch.">' +
        '<b>' + ph.name + '</b><span>' + icoDeco(f.icon, 16) + f.word + '</span></button><div class="ts-slots ts-slots--' + slots.length + '">' + slots.join('') + '</div></div>';
    };
    const chip = (b) => '<button type="button" class="ts-chip" data-bowler="' + b.i + '" aria-label="' + esc(b.name) + ', ' + esc(b.bowl) + ', ' + count(b.i) + ' of 2 overs. Tap to give him the selected over.">' +
      icoDeco(TYPE_ICON[b.bowl] || 'typeMedium', 24) + '<span class="ts-cn name">' + esc(b.name) + '</span><span class="ts-set' + (count(b.i) === 0 || count(b.i) > 2 ? ' is-low' : '') + '">' + count(b.i) + '/2</span></button>';
    const hint = st.nudge ? '<b>Tap an over first.</b> Then who bowls it.' : V.plan.edited ? 'Your plan. <b>Tap any over to change.</b>' : 'Suggested by matchups. <b>Tap any over to change.</b>';
    const status = valid ? '6 playing. All 10 overs set.' : problems.length > 1 ? problems[0] + '. ' + (problems.length - 1) + ' more to fix.' : reason;
    return '<p class="ts-strip">' + hint + '</p><div class="ts-grid">' + PHASES.map(band).join('') + '</div>' +
      '<p class="ts-strip">Your six bowlers</p><div class="ts-bowlers" role="group" aria-label="Your six bowlers">' + bowlers().map(chip).join('') + '</div>' +
      '<p class="ts-why' + (valid ? '' : ' is-bad') + '" role="status">' + (valid ? '' : '<i class="ts-bang" aria-hidden="true">!</i>') + esc(status) + '</p>';
  }

  function paint(focus) {
    const bad = !problem().valid;
    root.innerHTML = '<div class="c-seg ts-tabs" role="group" aria-label="Team sheet">' +
      '<button type="button" class="c-seg__opt' + (tab === 'six' ? ' is-selected' : '') + '" data-tab="six" aria-pressed="' + (tab === 'six') + '">' + icoDeco('team', 24) + 'Six</button>' +
      '<button type="button" class="c-seg__opt' + (tab === 'overs' ? ' is-selected' : '') + '" data-tab="overs" aria-pressed="' + (tab === 'overs') + '">' + icoDeco('overs', 24) + 'Overs' + (bad ? '<i class="ts-bang" aria-hidden="true">!</i>' : '') + '</button></div>' +
      (tab === 'six' ? sixPane() : oversPane()) +
      '<div class="ts-foot">' + (tab === 'overs' && V.plan.edited ? '<button type="button" class="c-btn" data-suggest>Suggest</button>' : '') +
      '<button type="button" class="c-btn c-btn--primary c-btn--cta" data-done' + (bad ? ' disabled aria-disabled="true"' : '') + '>Done</button></div>';
    if (focus) { const f = /** @type {HTMLElement|null} */ (root.querySelector(focus)); if (f) f.focus(); }
  }

  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest('button'); if (!t || !root.contains(t)) return;
    if (t.hasAttribute('data-done')) { if (!t.hasAttribute('disabled')) close(); return; }
    if (t.hasAttribute('data-tab')) { tab = /** @type {any} */ (t.getAttribute('data-tab')); st.toast = ''; st.nudge = false; paint(); return; }
    if (t.hasAttribute('data-suggest')) { dispatch('TeamSuggest'); sync(); st.sel = -1; paint('[data-done]'); return; }
    if (t.hasAttribute('data-pid')) {
      const id = t.getAttribute('data-pid'), p = V.players.find((x) => String(x.id) === id); if (!p) return;
      st.toast = '';
      if (p.order != null) { st.out = st.out === p.id ? null : p.id; st.nudge = false; paint(`[data-pid="${CSS.escape(String(id))}"]`); return; }
      if (!st.out) { st.nudge = true; paint(`[data-pid="${CSS.escape(String(id))}"]`); return; }
      const ids = sixOrder().map((x) => x.id), out = V.players.find((x) => x.id === st.out);
      ids[ids.indexOf(st.out)] = p.id; // the newcomer takes the same batting place
      dispatch('TeamSix', { ids }); sync();
      st.toast = p.name + ' in for ' + (out ? out.name : 'the other') + '.' + (V.plan.edited ? ' ' + p.name + ' takes his overs.' : ' Overs suggested again.');
      st.out = null; st.nudge = false; st.sel = ovs().indexOf(null);
      paint(`[data-pid="${CSS.escape(String(p.id))}"]`); return;
    }
    // overs tab
    const o = ovs(), fields = V.plan.fields.slice();
    let focus = null;
    if (t.hasAttribute('data-slot')) { st.nudge = false; st.sel = Number(t.getAttribute('data-slot')); focus = `[data-slot="${st.sel}"]`; paint(focus); return; }
    if (t.hasAttribute('data-field')) { const pi = Number(t.getAttribute('data-field')); fields[pi] = fields[pi] === 'P' ? 'A' : 'P'; focus = `[data-field="${pi}"]`; }
    else if (t.hasAttribute('data-bowler')) {
      const b = Number(t.getAttribute('data-bowler'));
      if (st.sel < 0) { st.nudge = true; paint(`[data-bowler="${b}"]`); return; }
      o[st.sel] = o[st.sel] === b ? null : b;
      const next = o.findIndex((x, k) => x == null && k > st.sel);
      if (o[st.sel] != null && next > -1) st.sel = next;
      focus = `[data-bowler="${b}"]`;
    } else return;
    dispatch('TeamPlan', { overs: o, fields }); sync();
    paint(focus);
  });
  paint();
}
