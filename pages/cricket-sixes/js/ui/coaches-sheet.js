/* coaches-sheet: 5d Coaches, a bottom sheet (sheet.js). open(vm, dispatch, open, arg, refresh); vm = coachesVM (selectors.js)
   Uses: coaches:[{ id, name, step, letter, strong:['bat'|'bowl'|'bal'], here, away, picked, helps,
                    course:{ ok, why, cost (Coins), free, spun, pending?:{index,gain,jackpot} } }], slots, free, full.
   NEEDS from CORE-CLUB: course.pending (the stored coursePending result) so the wheel can land on the engine's slice.
   Commands: PickWeekCoach {coachId|null}; CourseSpin {coachId, careful}; RunCourse {coachId}.
   Hand pick every week, "No coach" is allowed. Letters only: no coach number is shown. Course = Coins (price shown, or why-text such as "Need 90 Coins"), coach away 1 week. */
import { openSheet } from './sheet.js';
import { esc } from './dom.js';
import { deco, strongHtml } from './training-view.js';
import { letterOfStep } from '../core/letters.js';
import { openWheel } from './wheel-view.js';
import { scoutBodyHtml, scoutDone, scoutSpinOpen } from './coachpick-view.js';
import { kindFloorGain } from '../core/perks/kind-floor.js';
import { COURSE_SLICES } from '../data/wheel-slices-train.js';

/* Z5 UI slots (SEAMS-S0): fenced, return '' today. Owners: Course T2, job chip + XP bar T5, Clinic button T6. */
/* SLOT:Course start */
/** Course cap (CONTRACT-B COURSE_MAX_STEP 19 = S-, 1 course a season club-wide). Pure text helpers, exported for the test. */
export const COURSE_CAP_STEP = 19;
export const courseSeasonWords = () => 'One course a season: this coach has had his.';
/** The 1-a-season refusal from canCourse (why 'season'). */
export function courseNote(c) {
  if (!c) return '';
  const cr = c.course || {};
  return !cr.ok && cr.why === 'season' ? courseSeasonWords() : '';
}
/** Course ring facts above the coach list: the +4 slice, the +2 thin slice (legend) and any 1-a-season refusal. '' with no coaches. */
export function slotCourse(vm) {
  const cs = (vm && vm.coaches) || []; if (!cs.length) return '';
  const notes = cs.map((c) => { const n = courseNote(c); return n ? '<li>' + esc(c.name) + ': ' + esc(n) + '</li>' : ''; }).join('');
  return '<section class="tr-note t2-course" aria-label="Course wheel"><span>' + deco('info', 20) + '</span><span>Course wheel: a gold +4 slice (12%), a thin +2 slice, the rest +1 or +3. One course a season.</span>' +
    (notes ? '<ul class="t2-course-why">' + notes + '</ul>' : '') + '</section>';
} // owner: T2
/** The Course ring for a coach's course vm: COURSE_SLICES with Kind Floor applied when course.kindFloor is set, or the tree's widths / extra gold (Widener, Extra Gold) when the vm wheel carries them. */
export function courseRing(cr) {
  const kf = !!(cr && cr.kindFloor), vals = COURSE_SLICES.map((r) => r.value), gi = COURSE_SLICES.map((r, i) => (r.gold ? i : -1)).filter((i) => i >= 0);
  const base = COURSE_SLICES.map((r, i) => { const val = kf ? kindFloorGain('course', { slices: vals, golds: gi }, i, r.value, true) : r.value; return { ...r, value: val, label: '+' + val }; }); // Kind Floor: the +1 pieces print and pay +2, never +1.2
  const w = cr && cr.wheel, v = w && w.slices, ws = w && w.widths;
  if (!Array.isArray(v) || !Array.isArray(ws) || v.length !== ws.length || !v.length || (v.length === base.length && ws.every((x, i) => Math.abs(x - base[i].w) < 1e-6))) return base;
  const same = v.length === base.length, golds = w.golds && w.golds.length ? w.golds : [w.jackpotIndex || 0];
  return v.map((x, i) => { const val = same ? base[i].value : x; return { id: i, w: ws[i], value: val, label: '+' + val, tier: val > 1 ? 'top' : 'low', gold: golds.includes(i) }; });
}
/* SLOT:Course end */
/* SLOT:JobChip start */
export function slotJobChip(vm, coach) { return ''; } // owner: T5
/* SLOT:JobChip end */
/* SLOT:XpBar start */
export function slotXpBar(vm, coach) { return ''; } // owner: T5
/* SLOT:XpBar end */
/* SLOT:ClinicBtn start */
export function slotClinicBtn(vm, coach) { return ''; } // owner: T6
/* SLOT:ClinicBtn end */
/* SLOT:Click start */
/** Click slot (S0 lead call 3d): called first in this file's click handlers. Return true when the click was handled (the handler then stops).
 *  ctx = { vm, dispatch, open, close?, refresh?, where }. T5 and T6 add their branches inside their own fence. Today: false, nothing handled. */
export function slotClick(e, ctx) {
  /* SLOT:Click:T5 */
  /* SLOT:Click:T6 */
  return false;
}
/* SLOT:Click end */

function coachHtml(c, vm) {
  const fit = !!c.helps;
  const cr = c.course || {};
  const price = cr.free ? 'Free' : cr.cost != null ? cr.cost + ' Coins' : '';
  return '<section class="tr-coach t2-coach' + (c.picked ? ' is-picked' : '') + '" aria-label="Coach ' + esc(c.name) + ', grade ' + esc(c.letter) + '">' +
    '<div class="tr-coach__head"><span class="tr-coach__ico">' + deco('coach', 36) + '</span><b class="tr-coach__name">' + esc(c.name) + '</b><span class="t2-grade"><span class="ss-sr">Grade </span>' + esc(c.letter) + '</span>' +
    (c.away ? '<span class="c-tag c-tag--locked">Away this week</span>' : c.picked ? '<span class="c-tag c-tag--done">Picked</span>' : '') + '</div>' +
    '<div class="t2-strong">' + strongHtml(c.strong) + '</div>' +
    '<p class="tr-note">' + deco(fit ? 'done' : 'info', 20) + '<span>' + (fit ? 'Helps this week: strong in the focus.' : 'No coach help this week: not strong in the focus.') + '</span></p>' +
    '<div class="t2-cbtns"><button type="button" class="c-btn t2-cb" data-pick="' + esc(c.id) + '" aria-pressed="' + !!c.picked + '"' + (c.away ? ' aria-disabled="true"' : '') + '>Pick this week</button>' +
    '<button type="button" class="c-btn t2-cb" data-course="' + esc(c.id) + '"' + (cr.ok ? '' : ' aria-disabled="true"') + ' aria-label="' + esc('Course for ' + c.name + (price ? ', ' + price : '') + (cr.ok ? (cr.licence ? '. Uses your Licence' : '') + '. He is away 1 week' : '. ' + (cr.why || 'Not now'))) + '">' + deco('upgrade', 20) + '<span>Course' + (price ? ': ' + esc(price) : '') + (cr.licence ? ' (2nd, Licence)' : '') + '</span></button></div>' +
    (cr.ok ? '' : '<p class="tr-note t2-why">' + deco('lock', 20) + '<span>' + esc(cr.why || 'Not now') + '</span></p>') + slotJobChip(vm, c) + slotXpBar(vm, c) + slotClinicBtn(vm, c) + '</section>';
}

export function coachesHtml(vm) {
  const cs = vm.coaches || [], free = Math.max(0, (vm.slots || 3) - cs.length), none = !cs.some((c) => c.picked);
  const lic = vm.licence && vm.licence.held > 0 ? '<p class="tr-note t2-lic">' + deco('done', 20) + '<span>' + esc(vm.licence.line || 'Licence: 2nd course allowed') + '</span></p>' : '';
  return lic + slotCourse(vm) + cs.map((c) => coachHtml(c, vm)).join('') +
    Array.from({ length: free }, () => '<div class="t2-slot" aria-label="Empty coach slot"><span>' + deco('coach', 24) + '</span><span>Empty slot</span></div>').join('') +
    '<button type="button" class="c-btn c-btn--block t2-scout" data-scout="1">' + deco('scout', 20) + '<span>Scout list' + (vm.scout && vm.scout.open ? '' : ' (done this season)') + '</span></button>' +
    '<button type="button" class="c-btn c-btn--block t2-none" data-pick=""' + (none ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>No coach this week</button>' +
    '<p class="tr-note">' + deco('info', 20) + '<span>' + (free ? free + (free === 1 ? ' slot' : ' slots') + ' free.' : 'Full: release one to sign.') + ' A coach helps only when he is strong in this week\'s focus.</span></p>';
}

/** open(vm, dispatch, open, arg, refresh). wa1: arg { course: coachId } starts that coach's course wheel at once, arg { scout: 1 } opens the
 *  scout list at once (the Training tab coach strip uses these, so both flows are the same code as the sheet's buttons). */
export function open(vm, dispatch, openFn, arg, refresh) {
  if (arg && arg.course) { startCourse(vm, arg.course, dispatch, refresh); return () => {}; }
  if (arg && arg.scout) { openScout(vm.scout || (refresh && refresh().scout) || {}, dispatch, refresh); return () => {}; }
  const close = openSheet('Coaches', coachesHtml(vm));
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (!body) return close;
  body.addEventListener('click', (e) => {
    if (slotClick(e, { vm, dispatch, open: openFn, close, refresh, where: 'coaches' })) return;
    const sc = e.target.closest('[data-scout]');
    if (sc) { close(); openScout(vm.scout || (refresh && refresh().scout) || {}, dispatch, refresh); return; }
    const p = e.target.closest('[data-pick]'), c = e.target.closest('[data-course]');
    if (p && p.getAttribute('aria-disabled') !== 'true') { const id = p.getAttribute('data-pick'); close(); dispatch('PickWeekCoach', { coachId: id === '' ? null : id }); }
    else if (c && c.getAttribute('aria-disabled') !== 'true') {
      const id = c.getAttribute('data-course'); if (!(vm.coaches || []).some((x) => x.id === id)) return;
      close(); startCourse(vm, id, dispatch, refresh);
    }
  });
  return close;
}

/** The Course big wheel for one coach (Coins, away 1 week). Does nothing when the course is not allowed now. */
export function startCourse(vm, id, dispatch, refresh) {
  const co = (vm.coaches || []).find((x) => x.id === id); if (!co || !co.course || !co.course.ok) return;
  const cur = () => { const v = refresh ? refresh() : vm, k = (v.coaches || []).find((x) => x.id === id); return k && k.course ? k.course : co.course; };
  const from = co.step, cr0 = co.course;
  const card = '<div class="wh-who"><b class="t2-nm">' + esc(co.name) + '</b><span class="c-tag">Course: away 1 week</span></div><div class="wh-gr"><span class="wh-g hit"><span>Grade</span><b>' + esc(co.letter) + '</b></span><span class="wh-g wh-wide"><span>Strong</span><b class="t2-strong">' + strongHtml(co.strong) + '</b></span></div><p class="dr-hint">The tick shows where it will land.</p>';
  openWheel({
    wheelId: 'course', spinKey: cr0.spinKey || undefined, wobKey: cr0.wobKey || undefined, stored: cr0.stored || undefined, ring: courseRing(cr0), legend: [{ ch: '+2', text: 'thin slice: +2 steps' }], J: 1.2, // CONTRACT-A sec 4: ring + engine J 1.2 (phys.J = after Steady)
    title: 'Course', sub: co.name, cardHtml: card, pending: cr0.pending || null,
    guide: !!cr0.guide, zone: +cr0.zone || 0, chime: !!cr0.chime, tokens: cr0.tokens || [], getTokens: () => cur().tokens || [], look: cr0.look || null, phys: (cr0.wheel && cr0.wheel.phys) || undefined, spokeGain: () => cur().spokeGain || 0, onToken: (kind, careful) => dispatch('UseToken', { wheel: 'course', kind, careful }), // wheel meta: empty when the flag is off
    onSpin: (stop) => dispatch('CourseSpin', { coachId: id, careful: stop, stop }), getPending: () => cur().pending || null, // the handler records the stop (recordStop) and lands the same slice
    describe: (r) => { const to = Math.min(COURSE_CAP_STEP, from + r.gain), paid = to - from, a = letterOfStep(from), b = letterOfStep(to), cut = paid < r.gain; return { big: 'Grade steps', from: a, to: b, paid, line: cut ? '+' + r.gain + ', cut at ' + letterOfStep(COURSE_CAP_STEP) + ': you gain +' + paid : '', breakthrough: !!r.jackpot || a !== b, say: co.name + ' course: ' + (cut ? '+' + r.gain + ', cut at ' + letterOfStep(COURSE_CAP_STEP) + ': you gain +' + paid + '. ' : '') + (a === b ? a + (cut ? ' stays' : ', already top grade') : a + ' to ' + b) + (r.jackpot ? ', jackpot' : '') + '.' }; },
    onCollect: () => dispatch('RunCourse', { coachId: id }),
  });
}

/** The scout list as a sheet (sign, pass, release). Redraws from refresh() after each command. */
export function openScout(sv, dispatch, refresh) {
  const html = (v) => scoutBodyHtml(v) + '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-pass="1">' + scoutDone(v) + '</button>';
  const close = openSheet('Scout list', html(sv));
  const body = document.querySelector('.sheet-fixed .c-sheet__body'); if (!body) return;
  const redraw = () => { const v = refresh ? refresh().scout : null; if (v) body.innerHTML = html(v); };
  const spin = (auto) => scoutSpinOpen(() => (refresh ? refresh().scout : sv), dispatch, redraw, auto);
  spin(true); // wheel meta: the Scout reveal when the list opens (spin is null with the flag off)
  body.addEventListener('click', (e) => {
    if (slotClick(e, { vm: sv, dispatch, close, refresh, where: 'scout' })) return;
    if (e.target.closest('[data-scoutspin]')) { spin(false); return; }
    const t = e.target.closest('[data-act],[data-pass]'); if (!t || t.disabled) return;
    if (t.hasAttribute('data-pass')) { close(); dispatch('PassScout', {}); return; }
    let arg = {}; try { arg = JSON.parse(t.getAttribute('data-arg') || '{}'); } catch (_) { /* none */ }
    dispatch(t.getAttribute('data-act'), arg);
    const v = refresh ? refresh().scout : null; if (v) body.innerHTML = html(v);
  });
}
