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
import { courseWheel } from '../core/training.js';

function coachHtml(c) {
  const fit = !!c.helps;
  const cr = c.course || {};
  const price = cr.free ? 'Free' : cr.cost != null ? cr.cost + ' Coins' : '';
  return '<section class="tr-coach t2-coach' + (c.picked ? ' is-picked' : '') + '" aria-label="Coach ' + esc(c.name) + ', grade ' + esc(c.letter) + '">' +
    '<div class="tr-coach__head"><span class="tr-coach__ico">' + deco('coach', 36) + '</span><b class="tr-coach__name">' + esc(c.name) + '</b><span class="t2-grade" aria-label="Grade ' + esc(c.letter) + '">' + esc(c.letter) + '</span>' +
    (c.away ? '<span class="c-tag c-tag--locked">Away this week</span>' : c.picked ? '<span class="c-tag c-tag--done">Picked</span>' : '') + '</div>' +
    '<div class="t2-strong">' + strongHtml(c.strong) + '</div>' +
    '<p class="tr-note">' + deco(fit ? 'done' : 'info', 20) + '<span>' + (fit ? 'Helps this week: strong in the focus.' : 'No coach help this week: not strong in the focus.') + '</span></p>' +
    '<div class="t2-cbtns"><button type="button" class="c-btn t2-cb" data-pick="' + esc(c.id) + '" aria-pressed="' + !!c.picked + '"' + (c.away ? ' disabled aria-disabled="true"' : '') + '>' + (c.picked ? 'Picked this week' : 'Pick this week') + '</button>' +
    '<button type="button" class="c-btn t2-cb" data-course="' + esc(c.id) + '"' + (cr.ok ? '' : ' disabled aria-disabled="true"') + ' aria-label="' + esc('Course for ' + c.name + (price ? ', ' + price : '') + (cr.ok ? '. He is away 1 week' : '. ' + (cr.why || 'Not now'))) + '">' + deco('upgrade', 20) + '<span>Course' + (price ? ': ' + esc(price) : '') + '</span></button></div>' +
    (cr.ok ? '' : '<p class="tr-note t2-why">' + deco('lock', 20) + '<span>' + esc(cr.why || 'Not now') + '</span></p>') + '</section>';
}

export function coachesHtml(vm) {
  const cs = vm.coaches || [], free = Math.max(0, (vm.slots || 3) - cs.length), none = !cs.some((c) => c.picked);
  return cs.map((c) => coachHtml(c)).join('') +
    '<button type="button" class="c-btn c-btn--block t2-none" data-pick=""' + (none ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + (none ? 'No coach this week (picked)' : 'No coach this week') + '</button>' +
    '<p class="tr-note">' + deco('info', 20) + '<span>' + (free ? free + (free === 1 ? ' slot' : ' slots') + ' free.' : 'Full: release one to sign.') + ' A coach helps only when he is strong in this week\'s focus.</span></p>';
}

export function open(vm, dispatch, openFn, arg, refresh) {
  const close = openSheet('Coaches', coachesHtml(vm));
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (!body) return close;
  body.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]'), c = e.target.closest('[data-course]');
    if (p && !p.disabled) { const id = p.getAttribute('data-pick'); close(); dispatch('PickWeekCoach', { coachId: id === '' ? null : id }); }
    else if (c && !c.disabled) {
      const id = c.getAttribute('data-course'), co = (vm.coaches || []).find((x) => x.id === id); if (!co) return;
      close();
      const cur = () => { const v = refresh ? refresh() : vm, k = (v.coaches || []).find((x) => x.id === id); return k && k.course ? k.course : co.course; };
      const w = co.course.wheel || courseWheel(co.step), from = co.step;
      const card = '<div class="wh-who"><b class="t2-nm">' + esc(co.name) + '</b><span class="c-tag">Course: away 1 week</span></div><div class="wh-gr"><span class="wh-g hit"><span>Grade</span><b>' + esc(co.letter) + '</b></span><span class="wh-g"><span>Strong</span><b class="t2-strong">' + strongHtml(co.strong) + '</b></span></div>';
      openWheel({
        title: 'Course', sub: co.name, cardHtml: card, slices: w.slices, jackpotIndex: w.jackpotIndex, aim: w.aim, pending: co.course.pending || null, plus: '+',
        onSpin: (careful) => dispatch('CourseSpin', { coachId: id, careful }), getPending: () => cur().pending || null,
        describe: (r) => { const to = Math.min(21, from + r.gain), a = letterOfStep(from), b = letterOfStep(to); return { big: 'Grade steps', from: a, to: b, breakthrough: !!r.jackpot || a !== b, say: co.name + ' course: ' + a + (a === b ? ', already top grade' : ' to ' + b) + (r.jackpot ? ', jackpot' : '') + '.' }; },
        onCollect: () => dispatch('RunCourse', { coachId: id }),
      });
    }
  });
  return close;
}
