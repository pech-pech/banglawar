/* training-view: screen 5, the training week (P11 redo). render(el, vm, dispatch, open). Reads trainingVM (selectors.js) only.
   A normal week = 2 taps: Run nets, Done. Focus and Effort are remembered from last week.
   Uses: week, tp, plan{focus,effort,spotlightId,coachId}, efforts[{id,cost}], rows[{id,name,bench,role,type,rates:{batPower,batSkill,bowlSpeed,bowlSkill},status:'train'|'short'|'skip',stat}],
         coaches[{id,name,letter,strong,picked}], preview{cost,trainCount,shortCount,skipCount,hint}, spotlight{wheel:{slices,jackpotIndex},pending|null},
         done, canRun, result{lines:[{id,name,rating,fromRaw,toRaw,word,wheelGain?,breakthrough}],cost,skipped}.
   Commands: SetTrainPlan {focus|effort|spotlightId|coachId}, Spin {careful}, RunNets {}, EndWeek {}. Taps: a row -> sheet:player; coach row -> sheet:coaches. */
import { esc, icoDeco, bindActs, ctaBar } from './dom.js';
import { openSheet } from './sheet.js';
import { letterOfRaw, stepOfRaw } from '../core/letters.js';
import { playNets, lineHtml, skipLine, letterBar, STAT, statKey } from './nets-scene.js';
import { openWheel } from './wheel-view.js';

export const ROLE_ICON = { opener: 'roleOpener', middle: 'roleMiddle', lower: 'roleLower' };
export const TYPE_ICON = { fast: 'typeFast', medium: 'typeMedium', spin: 'typeSpin' };
export const RATING_ICON = { batPower: 'batPower', batSkill: 'batSkill', bowlSpeed: 'bowlSpeed', bowlSkill: 'bowlSkill' };
export const RATING_WORD = { batPower: 'Batting Power', batSkill: 'Batting Skill', bowlSpeed: 'Bowling Speed', bowlSkill: 'Bowling Skill' };
export const roleIcon = (r) => ROLE_ICON[String(r || '').toLowerCase()] || 'roleMiddle';
export const typeIcon = (t) => TYPE_ICON[String(t || '').toLowerCase()] || 'typeMedium';
/** A decorative icon (the words beside it carry the meaning). */
export const deco = (name, size) => icoDeco(name, size || 20);
/** Icon + word, kept together. */
export const iw = (name, word) => '<span class="tr-iw">' + deco(name, 20) + '<span>' + esc(word) + '</span></span>';
/** TP chip: tp icon, number, word. */
export const tp = (n) => '<span class="c-chip chip m0-tp tr-tp" aria-label="' + esc(n) + ' training points">' + deco('tp', 20) + '<b>' + esc(n) + '</b><span>TP</span></span>';
/** The Peak tag, icon + word. */
export const peak = () => '<span class="c-tag m0-peak tr-peak" aria-label="At peak">' + deco('peak', 20) + '<span>Peak</span></span>';
/** TP chip: icon + number, the cost on a button. */
export const chip = (n) => '<span class="tr-chip" aria-label="' + esc(n) + ' Training Points">' + deco('tp', 24) + '<span>' + esc(n) + '</span></span>';

export const FOCUS_WORD = { bat: 'Batting', bowl: 'Bowling', bal: 'Balanced' };
export const FOCUS_ICON = { bat: 'batPower', bowl: 'bowlSpeed', bal: 'team' };
const EFFORT_WORD = { easy: 'Easy', normal: 'Normal', push: 'Push' };
const EFFORT_ICON = { easy: 'week', normal: 'upgrade', push: 'burst' };
/** Strong focus icons + words for a coach: `[bat icon] Batting [ball icon] Bowling`. */
export const strongHtml = (strong) => (strong || []).map((f) => '<span class="t2-fi">' + deco(FOCUS_ICON[f] || 'train', 20) + '<span>' + esc(FOCUS_WORD[f] || f) + '</span></span>').join('');
export const strongText = (strong) => (strong || []).map((f) => FOCUS_WORD[f] || f).join(' and ') || 'none';

const RK = { batPower: 'bp', batSkill: 'bs', bowlSpeed: 'spd', bowlSkill: 'bsk' };
const WORD_KEY = { Power: 'bp', Technique: 'bs', Pace: 'spd', Craft: 'bsk' };
const shortRates = (r) => (r && r.bp == null ? { bp: r.batPower, bs: r.batSkill, spd: r.bowlSpeed, bsk: r.bowlSkill } : r || {});
const rawTwin = (vm) => vm.twin || { held: 0, line: '', wheel: null, pending: null };
/** trainingVM -> the small shape this view draws. */
export function adapt(vm) {
  const rows = (vm.rows || []).map((r) => ({ ...r, state: r.status || r.state, rates: shortRates(r.rates) }));
  const P = vm.plan || { focus: 'bat', effort: 'normal' }, sp = rows.find((r) => r.id === P.spotlightId);
  const costs = {}; (vm.efforts || []).forEach((e) => { costs[e.id] = e.cost; });
  const pc = (vm.coaches || []).find((c) => c.picked) || null, pv = vm.preview || {};
  const wl = vm.spotlight && vm.spotlight.wheel;
  const wheel = sp && wl ? { slices: wl.slices, jackpotIndex: wl.jackpotIndex, widths: wl.widths, player: { id: sp.id, name: sp.name, rates: sp.rates }, stat: WORD_KEY[sp.stat] || 'bp', pending: vm.spotlight.pending || null, guide: !!vm.spotlight.guide, tokens: vm.spotlight.tokens || [], look: vm.spotlight.look || null, phys: wl.phys || null, golds: wl.golds || null, room: vm.spotlight.room != null ? vm.spotlight.room : vm.room } : null;
  const tw = rawTwin(vm), sp2 = tw.held > 0 ? rows.find((r) => r.id === P.spotlight2Id) : null, wl2 = tw.wheel;
  const wheel2 = sp2 && wl2 ? { slices: wl2.slices, jackpotIndex: wl2.jackpotIndex, widths: wl2.widths, player: { id: sp2.id, name: sp2.name, rates: sp2.rates }, stat: WORD_KEY[sp2.stat] || 'bp', pending: tw.pending || null, guide: !!tw.guide, tokens: tw.tokens || [], look: tw.look || null, phys: wl2.phys || null, golds: wl2.golds || null } : null;
  const nets = vm.done && vm.result ? { id: vm.week, cost: vm.result.cost, lines: vm.result.lines.map((l) => ({ ...l, stat: RK[l.rating] || l.rating || WORD_KEY[l.stat] || 'bp' })), skipped: rows.filter((r) => r.state === 'skip').map((r) => ({ id: r.id, name: r.name, why: "Can't gain" })) } : null;
  return { week: vm.week, tp: vm.tp, twin: { held: tw.held, line: tw.line, name: sp2 ? sp2.name : null }, wheel2, plan: { ...P, spotlightName: sp ? sp.name : null }, costs: { easy: 10, normal: 13, push: 18, ...costs }, coach: pc, rows, wheel, nets, canRun: vm.canRun !== false,
    preview: { cost: pv.cost || 0, trainN: pv.trainCount != null ? pv.trainCount : pv.trainN, skippedN: pv.skipCount != null ? pv.skipCount : pv.skippedN || 0, shortN: pv.shortCount != null ? pv.shortCount : pv.shortN || 0, hint: pv.hint || null } };
}

let latest = null, runPending = false, lastLive = '';

function announce(text) {
  if (typeof document === 'undefined' || text === lastLive) return;
  let n = document.getElementById('tr-live');
  if (!n) { n = document.createElement('div'); n.id = 'tr-live'; n.className = 'sr-only'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
  if (lastLive !== '') n.textContent = text;
  lastLive = text;
}

const statsStrip = (rates) => ['bp', 'bs', 'spd', 'bsk'].map((k) => {
  const r = rates && rates[k] != null ? rates[k] : 1, st = STAT(k);
  return '<span class="t2-ms" aria-label="' + esc(st.word + ' ' + letterOfRaw(r)) + '">' + deco(st.icon, 20) + '<b>' + esc(letterOfRaw(r)) + '</b></span>';
}).join('');

function rowHtml(r) {
  const word = r.state === 'skip' ? "Can't gain" : r.state === 'short' ? 'Waits: not enough TP' : '';
  const label = r.name + (r.bench ? ', bench' : '') + ', ' + ['bp', 'bs', 'spd', 'bsk'].map((k) => STAT(k).word + ' ' + letterOfRaw((r.rates || {})[k] || 1)).join(', ') + (word ? ', ' + word : '');
  return '<li class="c-row m0-row c-row--tap tr-row t2-row' + (r.bench ? ' m0-row--bench' : '') + (r.state && r.state !== 'train' ? ' is-off' : '') + '">' +
    '<button type="button" class="tr-rowbtn" data-act="sheet:player" data-arg="' + esc(JSON.stringify({ id: r.id })) + '" aria-label="' + esc(label) + '">' +
    '<span class="t2-who"><span class="c-row__title name tr-name">' + esc(r.name) + '</span><span class="t2-sub">' +
    (r.bench ? '<span class="tr-bench" role="img" aria-label="Bench">' + deco('bench', 20) + '</span>' : '') + deco(roleIcon(r.role), 20) + deco(typeIcon(r.type), 20) +
    (word ? '<span class="t2-off">' + deco(r.state === 'skip' ? 'lock' : 'tp', 20) + '<span>' + esc(word) + '</span></span>' : '') + '</span></span>' +
    '<span class="t2-ms-row">' + statsStrip(r.rates) + '</span></button></li>';
}

function seg(group, label, opts, cur) {
  return '<div class="c-seg t2-seg" role="group" aria-label="' + esc(label) + '">' + opts.map((o) =>
    '<button type="button" class="c-seg__opt t2-opt" data-act="SetTrainPlan" data-arg=\'{"' + group + '":"' + o.v + '"}\' aria-pressed="' + (cur === o.v) + '" aria-label="' + esc(o.aria) + '">' + deco(o.ico, 20) + '<span class="t2-ol"><span>' + esc(o.w) + '</span>' + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span></button>').join('') + '</div>';
}

function spotSheet(vm, dispatch, slot) {
  const two = slot === 2, key = two ? 'spotlight2Id' : 'spotlightId', skipId = two ? vm.plan.spotlightId : null;
  const rows = (vm.rows || []).filter((r) => r.id !== skipId), cur = two ? vm.plan.spotlight2Id : vm.plan.spotlightId;
  const item = (id, name, sub) => '<button type="button" class="c-btn c-btn--block t2-pickrow" data-sp="' + esc(id == null ? '' : id) + '" aria-pressed="' + (cur === id || (cur == null && id == null)) + '"><span class="t2-pk"><b>' + esc(name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
  const close = openSheet(two ? 'Second Spotlight' : 'Spotlight wheel', '<p class="tr-note">' + deco('info', 20) + '<span>' + (two ? 'Twin Spotlight Pass: a second player spins his own wheel. Same cost.' : 'One player spins the wheel instead of his normal roll. Same cost.') + '</span></p>' + item(null, two ? 'No second player' : 'No Spotlight', 'Everyone else rolls as usual') +
    rows.filter((r) => r.state !== 'skip').map((r) => item(r.id, r.name, strongOf(r))).join(''));
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (body) body.addEventListener('click', (e) => { const b = e.target.closest('[data-sp]'); if (!b) return; const v = b.getAttribute('data-sp'); close(); dispatch('SetTrainPlan', { [key]: v === '' ? null : v }); });
}
const strongOf = (r) => { const k = ['bp', 'bs', 'spd', 'bsk'].reduce((m, x) => ((r.rates || {})[x] || 0) < ((r.rates || {})[m] || 0) ? x : m, 'bp'); return 'Lowest: ' + STAT(k).word + ' ' + letterOfRaw((r.rates || {})[k] || 1); };

function openSpotlightWheel(dispatch, slot) {
  const two = slot === 2, w = two ? latest.vm.wheel2 : latest.vm.wheel; if (!w) { runPending = true; dispatch('RunNets', {}); return; }
  const st = STAT(w.stat), rates = w.player.rates || {}, raw0 = rates[statKey(w.stat)] != null ? rates[statKey(w.stat)] : 1;
  const pr = w.player;
  const card = '<div class="wh-who"><b class="t2-nm">' + esc(pr.name) + '</b><span class="c-tag">Wheel is yours this week</span></div><div class="wh-gr">' +
    ['bp', 'bs', 'spd', 'bsk'].map((k) => '<span class="wh-g' + (k === statKey(w.stat) ? ' hit' : '') + '">' + deco(STAT(k).icon, 20) + '<span>' + esc(STAT(k).word) + '</span><b>' + esc(letterOfRaw(rates[k] || 1)) + '</b></span>').join('') + '</div>';
  openWheel({
    title: 'Spotlight', sub: 'Week ' + latest.vm.week + (latest.vm.wheel2 ? (two ? ', second spin' : ', first spin') : ''), cardHtml: card, slices: w.slices, jackpotIndex: w.jackpotIndex, widths: w.widths, aim: w.aim, pending: w.pending || null,
    // wheel meta (flag on; empty / null otherwise): guide = Aim Guide tick, tokens = buttons for the waiting result, getTokens = the fresh list after each command, look = craft look
    guide: w.guide, tokens: w.tokens, getTokens: () => { const sp = two ? latest.raw.twin : latest.raw.spotlight; return (sp && sp.tokens) || []; }, look: w.look, phys: w.phys, golds: w.golds,
    onToken: (kind, careful) => dispatch('UseToken', two ? { wheel: 'spot', kind, careful, slot: 2 } : { wheel: 'spot', kind, careful }),
    onSpin: (careful) => dispatch('Spin', two ? { careful, slot: 2 } : { careful }), getPending: () => { const sp = two ? latest.raw.twin : latest.raw.spotlight; return (sp && sp.pending) || null; },
    describe: (p) => {
      const g = p.applied != null ? p.applied : Math.min(p.gain, w.room == null ? 99 : w.room), to = raw0 + g, a = letterOfRaw(raw0), b = letterOfRaw(to), moved = stepOfRaw(to) !== stepOfRaw(raw0);
      return { big: st.word, from: a, to: b, barHtml: moved ? '' : letterBar(to, raw0), breakthrough: !!(p.jackpot || moved),
        say: pr.name + ' ' + st.word + ': wheel plus ' + g + ', ' + (moved ? a + ' to ' + b : a + ', the bar fills') + (p.jackpot ? ', jackpot' : '') + '.' };
    },
    onCollect: () => { if (!two && latest.vm.wheel2) { openSpotlightWheel(dispatch, 2); return; } runPending = true; dispatch('RunNets', {}); },
  });
}

function afterRender(el, vm, dispatch) {
  if (vm.nets && runPending) {
    runPending = false;
    const n = vm.nets;
    playNets({ lines: n.lines, skipped: n.skipped, week: vm.week }, {});
  }
}

export function render(el, rawVm, dispatch, open) {
  const vm = adapt(rawVm); latest = { vm, dispatch, raw: rawVm };
  const P = vm.plan, pv = vm.preview || { cost: 0, trainN: 0, skippedN: 0, shortN: 0, hint: null }, costs = vm.costs || { easy: 10, normal: 13, push: 18 };
  const had = el.contains(document.activeElement) ? document.activeElement : null, key = had && had.getAttribute ? (had.getAttribute('data-act') || '') + (had.getAttribute('data-arg') || '') : '';
  const nets = vm.nets, rows = vm.rows || [];
  const top = '<div class="c-strip strip tr-top"><span>' + deco('train', 24) + '<span class="tr-wk"><span class="tr-nw">Week ' + esc(vm.week) + '</span></span></span><span class="c-strip__right tr-tpw">' + tp(vm.tp) +
    '<button type="button" class="c-icon-btn tr-help" data-act="sheet:traininghelp" aria-label="Help: how training works" aria-haspopup="dialog">' + deco('why', 24) + '</button></span></div>';
  let body, cta;
  if (nets) {
    const g = nets.lines.length, up = nets.lines.filter((l) => letterOfRaw(l.toRaw) !== letterOfRaw(l.fromRaw)).length;
    body = '<div class="c-card c-card--hl t2-sum"><div class="tr-h"><b class="tr-iw">' + deco('done', 20) + '<span>Nets done</span></b></div>' +
      '<p class="tr-note">' + deco('info', 20) + '<span>' + g + ' trained' + (up ? ', ' + up + ' moved up a letter' : '') + (nets.skipped && nets.skipped.length ? ', ' + nets.skipped.length + " can't gain" : '') + '. Cost ' + esc(nets.cost) + ' TP.</span></p></div>' +
      '<ul class="t2-lines" aria-label="Results">' + nets.lines.map((l) => lineHtml(l)).join('') + (nets.skipped || []).map(skipLine).join('') + '</ul>';
    cta = ctaBar('<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="EndWeek" data-ft="done">Done</button>');
  } else {
    const c = vm.coach;
    const coachRow = '<li class="c-row m0-row c-row--tap t2-prow"><button type="button" class="tr-rowbtn" data-act="sheet:coaches" aria-label="' + esc(c ? 'Coach this week: ' + c.name + ', grade ' + c.letter + ', strong in ' + strongText(c.strong) + '. Tap to change' : 'No coach this week. Tap to pick one') + '">' +
      '<span class="tr-coachico">' + deco('coach', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">' + (c ? esc(c.name) + ' <b class="t2-grade">' + esc(c.letter) + '</b>' : 'No coach') + '</span>' +
      '<span class="c-row__sub t2-strong">' + (c ? strongHtml(c.strong) : '<span>Tap to pick this week\'s coach</span>') + '</span></span></button></li>';
    const spotRow = '<li class="c-row m0-row c-row--tap t2-prow"><button type="button" class="tr-rowbtn" data-lo="spotpick" aria-label="' + esc(P.spotlightName ? 'Spotlight: ' + P.spotlightName + '. Tap to change' : 'Spotlight: none. Tap to pick a player for the wheel') + '">' +
      '<span class="tr-coachico">' + deco('burst', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">Spotlight</span><span class="c-row__sub">' + esc(P.spotlightName || 'None (optional)') + '</span></span></button></li>';
    const tw = vm.twin, sp2Row = tw && tw.held > 0 ? '<li class="c-row m0-row c-row--tap t2-prow"><button type="button" class="tr-rowbtn" data-lo="spot2pick"' + (P.spotlightId ? '' : ' aria-disabled="true"') + ' aria-label="' + esc(tw.line + '. ' + (!P.spotlightId ? 'Pick the first Spotlight player first' : tw.name ? 'Second player: ' + tw.name + '. Tap to change' : 'Tap to pick the second player')) + '">' +
      '<span class="tr-coachico">' + deco('burst', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">' + esc(tw.line) + '</span><span class="c-row__sub">' + esc(!P.spotlightId ? 'Pick the first player above' : tw.name || 'None yet') + '</span></span></button></li>' : '';
    const cost = 'Cost ' + pv.cost + ' TP' + (pv.skippedN ? ", " + pv.skippedN + " can't gain" : '');
    body = '<div class="t2-plan">' +
      seg('focus', 'Focus', ['bat', 'bowl', 'bal'].map((f) => ({ v: f, w: FOCUS_WORD[f], ico: FOCUS_ICON[f], aria: FOCUS_WORD[f] + ' focus' })), P.focus) +
      seg('effort', 'Effort', ['easy', 'normal', 'push'].map((f) => ({ v: f, w: EFFORT_WORD[f], ico: EFFORT_ICON[f], sub: costs[f] + ' TP', aria: EFFORT_WORD[f] + ' effort, ' + costs[f] + ' training points each' })), P.effort) + '</div>' +
      '<ul class="c-list m0-list t2-pick" aria-label="This week">' + coachRow + spotRow + sp2Row + '</ul>' +
      '<div class="t2-cost" role="status"><b>' + esc(cost) + '</b>' + (pv.shortN ? '<span>' + deco('tp', 20) + '<span>Short on TP: ' + pv.shortN + ' will wait</span></span>' : '') + (pv.hint ? '<span>' + deco('info', 20) + '<span>' + esc(pv.hint) + '</span></span>' : '') + '</div>' +
      '<ul class="c-list m0-list tr-list" aria-label="Your squad">' + rows.map(rowHtml).join('') + '</ul>';
    cta = ctaBar('<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block t2-run" data-lo="runnets" data-ft="run"' + (pv.trainN && vm.canRun ? '' : ' disabled aria-disabled="true"') + ' aria-label="' + esc(pv.trainN ? 'Run nets, ' + pv.cost + ' training points' : 'Run nets: nobody can train') + '">' +
      '<span class="tr-goL">' + deco('train', 24) + '<span>Run nets</span></span>' + chip(pv.cost) + '</button>');
  }
  el.innerHTML = '<div class="screen tr-screen t2-screen">' + top + body + cta + '</div>';
  const root = el.firstElementChild;
  bindActs(root, dispatch, open);
  root.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-lo]'); if (!t || t.disabled) return; const a = t.getAttribute('data-lo');
    if (a === 'spotpick') spotSheet(vm, dispatch, 1);
    else if (a === 'spot2pick') { if (P.spotlightId) spotSheet(vm, dispatch, 2); }
    else if (a === 'runnets') { if (P.spotlightId) openSpotlightWheel(dispatch); else { runPending = true; dispatch('RunNets', {}); } }
  });
  if (had && key) { const same = [...el.querySelectorAll('[data-act]')].find((n) => ((n.getAttribute('data-act') || '') + (n.getAttribute('data-arg') || '')) === key && !n.disabled); const b = same || el.querySelector('[data-lo="runnets"], [data-ft="done"]'); if (b) b.focus(); }
  announce(nets ? 'Nets done. ' + nets.lines.length + ' trained.' : 'Cost ' + pv.cost + ' TP' + (pv.skippedN ? ', ' + pv.skippedN + " can't gain" : '') + (pv.hint ? '. ' + pv.hint : ''));
  afterRender(el, vm, dispatch);
}

/** "?" sheet (sheet:traininghelp): short plain lines. */
export function openHelp() {
  const line = (k, t) => '<div class="tr-hl"><span class="tr-k">' + k + '</span><span>' + esc(t) + '</span></div>';
  const html = '<div class="tr-help-body">' +
    line(deco('batPower', 24), 'Focus: which ratings train this week') + line(deco('upgrade', 24), 'Effort: Easy 10, Normal 13, Push 18 TP each') +
    line(deco('coach', 24), 'Coach: pick one by hand each week') + line(deco('burst', 24), 'Spotlight: one player spins the wheel') +
    line(deco('lock', 24), "Can't gain: full, so not charged") + line('<span class="t2-ticks"><i class="t2-tk on"></i><i class="t2-tk on"></i><i class="t2-tk"></i><i class="t2-tk"></i></span>', 'Bar: 4 ticks make one letter step') +
    line('<b>C+</b>', 'Letters: F- is lowest, S+ is highest') + '</div>';
  return openSheet('Training help', html);
}
