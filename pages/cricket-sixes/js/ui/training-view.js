/* training-view: screen 5, the training week list. render(el, vm, dispatch, open). Reads trainingVM only.
   trainingVM = { tp, week, done, total, coachLine,
     drillCost?: 15,
     rows: [{ id, name, bench, role:'Opener'|'Middle'|'Lower', type:'Fast'|'Medium'|'Spin', ability, max, grade, pips,
              status:'drill'|'+n'|'peak'|'done', gainRating?: 'batPower'|'batSkill'|'bowlSpeed'|'bowlSkill' }] }
   vm.plan (P7): { mode, canRepeat, n, cost, tpLeft, free, byPlayer:{id:{drillId,rating,fresh}}, bulk:{n,total,great,reveals,xp}|null, autoBench, tips }.
   Taps: a row -> `sheet:player {id}`; the coach row -> `sheet:coaches {}`; End week -> command EndWeek.
   `open(name, arg)` is optional; app.js maps it to the sheet modules. */
import { esc, ico, btn, ctaBar } from './dom.js';
import { bindActs } from './dom.js';
import { openSheet } from './sheet.js';
import { DRILLS } from '../data/training.js';
import { coachNoticeHtml } from './coach-notice.js';

export const ROLE_ICON = { opener: 'roleOpener', middle: 'roleMiddle', lower: 'roleLower' };
export const TYPE_ICON = { fast: 'typeFast', medium: 'typeMedium', spin: 'typeSpin' };
export const RATING_ICON = { batPower: 'batPower', batSkill: 'batSkill', bowlSpeed: 'bowlSpeed', bowlSkill: 'bowlSkill' };
export const RATING_WORD = { batPower: 'Batting Power', batSkill: 'Batting Skill', bowlSpeed: 'Bowling Speed', bowlSkill: 'Bowling Skill' };
export const roleIcon = (r) => ROLE_ICON[String(r || '').toLowerCase()] || 'roleMiddle';
export const typeIcon = (t) => TYPE_ICON[String(t || '').toLowerCase()] || 'typeMedium';
const cap = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
/** A decorative icon (the words beside it carry the meaning). */
export const deco = (name, size) => ico(name, size || 20).replace('<img', '<img aria-hidden="true"');
/** Icon + word, kept together. */
export const iw = (name, word) => '<span class="tr-iw">' + deco(name, 20) + '<span>' + esc(word) + '</span></span>';
/** TP chip: tp icon, number, word (dom.tpChip draws a coin, and coins are cut from milestone 0). */
export const tp = (n) => '<span class="c-chip chip m0-tp tr-tp" aria-label="' + esc(n) + ' training points">' + deco('tp', 20) + '<b>' + esc(n) + '</b><span>TP</span></span>';
/** 2A: the Peak tag, icon + word. */
export const peak = () => '<span class="c-tag m0-peak tr-peak" aria-label="At peak">' + deco('peak', 20) + '<span>Peak</span></span>';

const RK = ['batPower', 'batSkill', 'bowlSpeed', 'bowlSkill'];
const DRILL_NAME = Object.fromEntries(DRILLS.list.map((d) => [d.id, d.name]));
/** Under the name: grade box, then one status (planned drill / Auto / peak / drilled +n). Icons carry the meaning; the row label has the words. */
function status(r, plan, auto) {
  const s = String(r.status || '');
  if (s === 'drill') {
    if (plan) return '<span class="tr-planbox' + (plan.fresh ? ' is-new' : '') + '" role="img" aria-label="Plan: ' + esc(DRILL_NAME[plan.drillId]) + (plan.fresh ? ', new this week' : '') + '">' + deco(RATING_ICON[plan.rating], 20) + '</span>';
    return auto ? '<span class="tr-st tr-auto" role="img" aria-label="Auto drill at End week">' + deco('train', 20) + '</span>' : '';
  }
  if (s === 'peak') return '<span class="tr-st tr-peak" role="img" aria-label="At peak">' + deco('peak', 20) + '</span>';
  if (s === 'done') return '<span class="tr-st tr-won" role="img" aria-label="Drilled this week">' + deco('done', 20) + '</span>';
  if (s.charAt(0) === '+') return '<span class="tr-st tr-won" role="img" aria-label="Drilled this week, up ' + esc(s.slice(1)) + '">' + deco('done', 20) + '<b>' + esc(s) + '</b></span>';
  return '';
}

/** Rating box: the 20-200 Ability. A "max" word under it when he is capped at potential. */
function abilBox(r) {
  return '<span class="tr-ovr' + (r.max ? ' is-max' : '') + '" role="img" aria-label="Ability ' + esc(r.ability) + (r.max ? ', max' : '') + '"><b>' + esc(r.ability) + '</b>' + (r.max ? '<small>max</small>' : '') + '</span>';
}

/** The 4-segment block: icon on top, a divider line, the raw 1-99 rating below. Gold = drilled this week, dashed = the planned drill. */
function ratesBlock(r, plan) {
  const R = r.rates || {}, up = String(r.status || '').charAt(0) === '+' ? r.gainRating : null;
  return '<span class="tr-rates">' + RK.map((k) => {
    const cls = k === up ? ' is-up' : plan && plan.rating === k ? ' is-plan' + (plan.fresh ? ' is-new' : '') : '';
    return '<span class="tr-rate' + cls + '"><span class="tr-ri">' + deco(RATING_ICON[k], 24) + '</span><span class="tr-rv">' + esc(R[k] == null ? '' : R[k]) + '</span></span>';
  }).join('') + '</span>';
}

/** Potential grade box: the letter, or "?" until it shows (1 drill). */
function gradeBox(r, hidden) {
  return '<span class="tr-gr' + (hidden ? ' is-hidden' : '') + '" role="img" aria-label="' + (hidden ? 'Potential grade hidden, shows after 1 drill' : 'Potential grade ' + esc(r.grade)) + '">' + (hidden ? '?' : esc(r.grade)) + '</span>';
}

function rowHtml(r, P, first) {
  const plan = P && P.byPlayer && P.byPlayer[r.id], auto = !!(P && P.autoBench && r.bench);
  const peakNow = r.status === 'peak';
  const hidden = r.grade == null || r.grade === '' || r.grade === '?';
  const R = r.rates || {};
  const label = r.name + (r.bench ? ', bench' : '') + ', Ability ' + r.ability + (r.max ? ', capped at potential' : '') + '. ' +
    RK.map((k) => RATING_WORD[k] + ' ' + R[k]).join(', ') + '. ' +
    (hidden ? 'Potential grade hidden, ' + (r.pips || 0) + ' of 1 drill' : 'Potential grade ' + r.grade) +
    ', ' + (r.status === 'drill' ? 'not drilled yet' : r.status === 'peak' ? 'at peak, drills cannot raise him' : r.status === 'done' ? 'done this week' : 'drilled ' + r.status) +
    (plan && r.status === 'drill' ? ', plan: ' + DRILL_NAME[plan.drillId] : '');
  return '<li class="c-row m0-row c-row--tap tr-row' + (r.bench ? ' m0-row--bench' : '') + (peakNow ? ' tr-row--peak' : '') + '" role="button" tabindex="0"' + (first ? ' data-ft="row"' : '') +
    ' data-act="sheet:player" data-arg="' + esc(JSON.stringify({ id: r.id })) + '" aria-label="' + esc(label) + '">' +
    abilBox(r) +
    '<span class="tr-who"><span class="c-row__title name tr-name">' + esc(r.name) + '</span>' +
    '<span class="tr-sub">' + (r.bench ? '<span class="tr-bench" role="img" aria-label="Bench">' + deco('team', 20) + '</span>' : '') + gradeBox(r, hidden) + status(r, plan, auto) + '</span></span>' +
    ratesBlock(r, plan) + '</li>';
}


/* ---- P7+P11: plan card, bulk summary, bench switch, "?" sheet, first-time tips. Every visible string is 6 words or fewer. ---- */
const PER = DRILLS.costTp;
/** TP chip: icon + number, the cost on a button. */
export const chip = (n) => '<span class="tr-chip" aria-label="' + esc(n) + ' Training Points">' + deco('tp', 24) + '<span>' + esc(n) + '</span></span>';

function planCard(vm) {
  const P = vm.plan, rep = P.mode === 'repeat';
  const seg = [['repeat', 'Repeat', 'rematch'], ['suggested', 'Suggested', 'upgrade']].map((o) =>
    '<button type="button" class="c-seg__opt" data-act="SetDrillPlan" data-arg=\'{"plan":"' + o[0] + '"}\' aria-pressed="' + (P.mode === o[0]) + '"' +
    (o[0] === 'repeat' && !P.canRepeat ? ' disabled aria-label="Repeat last week: no last week yet"' : ' aria-label="' + (o[0] === 'repeat' ? 'Repeat last week' : 'Suggested drills') + '"') + '>' + deco(o[2], 20) + '<span>' + o[1] + '</span></button>').join('');
  const none = P.n === 0;
  const word = none ? (vm.done >= vm.total || vm.plan.bulk ? 'All drilled' : 'No TP left') : 'Drill all ' + P.n;
  const goAct = none ? '' : rep ? ' data-act="RepeatWeek"' : ' data-act="DrillAll" data-arg=\'{"plan":"suggested"}\'';
  const aria = none ? word : 'Drill all ' + P.n + ' players, ' + (rep ? "last week's drills" : 'suggested drills') + ', costs ' + P.cost + ' Training Points';
  const note = !P.canRepeat ? 'No last week yet' : P.free ? 'Free this season' : (P.tpLeft - (P.autoBench ? benchSpend(vm) : 0)) + ' TP left after week';
  return '<div class="c-card c-card--inset tr-plan" id="tr-plan"><div class="c-seg" role="group" aria-label="Plan for Drill all">' + seg + '</div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--block tr-go" data-ft="all"' + goAct + (none ? ' disabled aria-disabled="true"' : '') + ' aria-label="' + esc(aria) + '">' +
    '<span class="tr-goL">' + deco('team', 24) + '<span>' + esc(word) + '</span></span>' + (none ? '' : P.free ? '<span class="tr-chip">' + deco('tp', 24) + '<span>0</span></span>' : chip(P.cost)) + '</button>' +
    '<div class="tr-line">' + deco(P.canRepeat ? 'tp' : 'week', 20) + '<span>' + esc(note) + '</span></div></div>';
}

function summaryCard(vm) {
  const b = vm.plan.bulk;
  return '<div class="c-card c-card--hl tr-sum" role="status"><div class="tr-sumh">' + iw('done', b.n + ' drills done') +
    '<span class="c-tag c-tag--done" aria-label="plus ' + b.total + ' rating points in all"><span>+' + b.total + '</span></span></div>' +
    (b.great ? '<div class="tr-line">' + deco('burst', 20) + '<span>' + b.great + ' Great</span></div>' : '') +
    b.reveals.map((r) => '<div class="tr-line">' + deco('medal', 20) + '<span>' + esc(r.name) + ': Potential grade ' + esc(r.grade) + '</span></div>').join('') +
    b.xp.map((x) => '<div class="tr-line">' + deco('coach', 20) + '<span>' + esc(x.coach) + ' XP: ' + esc(x.text) + '</span></div>').join('') + '</div>';
}

function benchStrip(vm) {
  const on = vm.plan.autoBench;
  return '<li class="tr-benchli"><div class="c-strip c-strip--light tr-bench-strip"><span class="tr-iw">' + deco('team', 24) + '<span>Bench</span></span>' +
    '<button type="button" class="c-btn tr-toggle" data-act="AutoBench" data-arg=\'{"on":' + (!on) + '}\' aria-pressed="' + on + '" aria-label="Auto-train bench, ' + (on ? 'on' : 'off') + '. Drills bench players at End week if you have not">' +
    '<span class="tr-box">' + (on ? '<span class="c-ico c-ico--check"></span>' : '') + '</span><span>Auto-train bench</span></button></div>' +
    (on ? '<div class="tr-benchnote">' + deco('train', 20) + '<span>Bench drills at End week</span>' + benchCost(vm) + '</div>' : '') + '</li>';
}

let tipStep = 1;
/** Tips scroll their target into view; put the screen back at the top when they end. */
const toTop = () => { window.scrollTo(0, 0); [document.documentElement, document.body].forEach((e) => { if (e) e.scrollTop = 0; }); document.querySelectorAll('.screen').forEach((e) => { e.scrollTop = 0; }); };
/** Auto-train bench cost at End week: one chip, free from season 2. */
/** QA r2 N3: TP the bench takes at End week (after this plan), so the plan line shows the real balance. */
function benchSpend(vm) {
  const P = vm.plan; if (P.free) return 0;
  const left = Math.max(0, P.tpLeft);
  return Math.min((vm.rows || []).filter((r) => r.bench && r.status === 'drill').length, Math.floor(left / PER)) * PER;
}
function benchCost(vm) {
  const P = vm.plan, n = Math.min((vm.rows || []).filter((r) => r.bench && r.status === 'drill').length, Math.floor(vm.tp / PER));
  return P.free ? '<span class="tr-chip">' + deco('tp', 24) + '<span>0</span></span>' : n ? chip(n * PER) : '';
}
const FOCUS_WORD = { Power: 'Big hitting', Technique: 'Batting', Pace: 'Fast bowling', Craft: 'Bowling accuracy' };
const coachWords = (t) => String(t || '').replace(/: (Power|Technique|Pace|Craft) level/, (m, f) => ': ' + FOCUS_WORD[f] + ' level');
const TIPS = [
  { at: '[data-ft="row"]', text: 'Pick a player.', icons: () => deco('roleMiddle', 24) + deco('typeFast', 24) },
  { at: '[data-ft="row"]', text: 'Pick a drill. 15 TP each.', icons: () => deco('batPower', 24) + chip(PER) },
  { at: '[data-ft="all"]', text: 'Or drill your Six at once.', icons: () => deco('team', 24) + deco('upgrade', 24) },
];
function showTips(el, dispatch) {
  const host = el.firstElementChild; if (!host || host.querySelector('.tr-tip')) return;
  const t = TIPS[tipStep - 1], target = host.querySelector(t.at);
  const layer = document.createElement('div'); layer.className = 'tr-tip'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', 'Training tips, step ' + tipStep + ' of 3');
  const last = tipStep === TIPS.length;
  layer.innerHTML = '<span class="tr-tip__hole" aria-hidden="true"></span><div class="c-card tr-tip__card"><div class="tr-tip__icons">' + t.icons() + '</div><b class="tr-tip__text">' + t.text + '</b>' +
    '<div class="tr-tip__row"><span class="tr-tip__n">' + tipStep + '/3</span><button type="button" class="c-btn" data-tip="skip">Skip</button>' +
    '<button type="button" class="c-btn c-btn--primary" data-tip="next">' + (last ? 'Got it' : 'Next') + '</button></div></div>';
  host.appendChild(layer);
  if (target) {
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect(), hole = layer.querySelector('.tr-tip__hole');
    hole.style.cssText = 'top:' + (r.top - 4) + 'px;left:' + (r.left - 4) + 'px;width:' + (r.width + 8) + 'px;height:' + (r.height + 8) + 'px';
    const card = layer.querySelector('.tr-tip__card'); card.classList.toggle('is-top', r.top > innerHeight / 2);
  }
  layer.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip]'); if (!b) return;
    if (b.getAttribute('data-tip') === 'next' && !last) { tipStep += 1; layer.remove(); showTips(el, dispatch); return; }
    tipStep = 1; layer.remove(); toTop(); dispatch('TipsSeen', {}); toTop();
  });
  const first = layer.querySelector('[data-tip="next"]'); if (first) first.focus();
}

export function render(el, vm, dispatch, open) {
  const rows = vm.rows || [], P = vm.plan || { byPlayer: {}, n: 0, cost: 0 };
  let body = '', benchDone = false;
  rows.forEach((r, i) => {
    if (r.bench && !benchDone) { benchDone = true; body += benchStrip(vm); }
    body += rowHtml(r, P, i === 0);
  });
  el.innerHTML =
    '<div class="screen tr-screen">' +
    '<div class="c-strip strip tr-top"><span>' + deco('train', 24) + ' Week ' + esc(vm.week) + '</span><span class="c-strip__right tr-tpw">' + tp(vm.tp) +
    '<button type="button" class="c-icon-btn tr-help" data-act="sheet:traininghelp" aria-label="Help: what the icons mean" aria-haspopup="dialog">' + deco('why', 24) + '</button></span></div>' +
    coachNoticeHtml(vm.coachNotice) +
    '<div class="tr-count" role="status">' + deco('done', 20) + '<span>' + esc(vm.done) + ' of ' + esc(vm.total) + ' drilled</span></div>' +
    (P.bulk ? summaryCard(vm) : '') + (P.bulk && P.n === 0 ? '' : planCard(vm)) +
    '<ul class="c-list m0-list tr-list" aria-label="Your squad">' +
    '<li class="c-row m0-row c-row--tap tr-coachrow" role="button" tabindex="0" data-act="sheet:coaches" aria-label="Coaches. ' + esc(coachWords(vm.coachLine)) + '">' +
    '<span class="tr-coachico">' + deco('coach', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">Coaches</span><span class="c-row__sub">' + esc(coachWords(vm.coachLine)) + '</span></span></li>' +
    body + '</ul>' +
    ctaBar(btn('End week', 'EndWeek', { kind: 'cta' })) +
    '</div>';
  bindActs(el.firstElementChild, dispatch, open);
  if (P.tips) showTips(el, dispatch);
}

/** "?" sheet (sheet:traininghelp): every explanation, one short line each, plus the icon key. */
export function openHelp() {
  const line = (k, t) => '<div class="tr-hl"><span class="tr-k">' + k + '</span><span>' + esc(t) + '</span></div>';
  const bar = '<span class="tr-bar tr-bar--key"><i style="width:55%"></i><i class="is-gain" style="left:55%;width:25%"></i></span>';
  const n = DRILLS.revealAfter;
  const html = '<div class="tr-help-body">' +
    line(deco('tp', 24), 'Each drill costs ' + PER + ' TP') + line(bar, 'Gold: most he can gain') +
    line('<span class="tr-dash"></span>', 'Dashed: drill he gets next') + line('<span class="c-tag">B</span>', 'Potential: how good he can get') +
    line('<span class="c-tag">?</span>', 'Potential grade shows after ' + n + (n === 1 ? ' drill' : ' drills')) +
    line(deco('peak', 24), 'Peak: drills cannot raise him') + line(deco('lock', 24), 'Full: raise his lowest first') +
    '<div class="tr-hh">Buttons</div>' +
    line(deco('team', 24), 'Drill all: the Six, one tap') + line(deco('rematch', 24), 'Repeat: same as last week') +
    line(deco('upgrade', 24), 'Suggested: lowest rating first') + line(deco('train', 24), 'Auto: bench drills at End week') +
    line(deco('medal', 24), 'Ability: four ratings blended') +
    '<div class="tr-hh">Icons</div>' +
    RK.map((k) => line(deco(RATING_ICON[k], 24), RATING_WORD[k])).join('') +
    [['opener', 'Opener'], ['middle', 'Middle'], ['lower', 'Lower']].map((r) => line(deco(roleIcon(r[0]), 24), r[1] + ' bat')).join('') +
    [['fast', 'Fast'], ['medium', 'Medium'], ['spin', 'Spin']].map((r) => line(deco(typeIcon(r[0]), 24), r[1] + ' bowl')).join('') + '</div>';
  return openSheet('Training help', html);
}
