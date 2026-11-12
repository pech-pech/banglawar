/* coaches-sheet: 5d Coaches, a bottom sheet (sheet.js). open(vm); vm = coachesVM
   coachesVM = { coaches:[{ id, name, here:boolean, foci:[{ key:'Power'|'Technique'|'Pace'|'Craft', drill, level, xp, from, to|null }],
                            boost: string|null }],       boost = "Trees x1.5 while he is here" when any focus is level 3+
                 note }                                   one plain line on how a coach helps (optional)
   from/to = XP cut-offs of his current level (0/30/70/125/190); to = null at the top level. */
import { openSheet } from './sheet.js';
import { esc } from './dom.js';
import { deco } from './training-view.js';

const FOCUS_ICON = { Power: 'batPower', Technique: 'batSkill', Pace: 'bowlSpeed', Craft: 'bowlSkill' };

function focusRow(f) {
  const top = f.to == null;
  const start = !top && (!(f.level > 0) || !(f.to > 0));          // level 0: not started, empty bar
  const xp = Number(f.xp) || 0;
  const v = top ? 100 : start ? 0 : Math.max(0, Math.min(100, xp / f.to * 100));
  const val = top ? 'Top level' : start ? 'Not started' : esc(xp) + '/' + esc(f.to);
  return '<div class="tr-focus"><span class="tr-focus__l">' + deco(FOCUS_ICON[f.key] || 'train', 24) + '<span>' + esc(f.key) + ' ' + esc(f.level) + '</span></span>' +
    '<span class="tr-focus__d">' + esc(f.drill) + '</span>' +
    '<div class="c-stat c-stat--mid tr-xp" aria-label="' + esc(f.key + ' level ' + f.level + ', ' + xp + ' XP' + (top ? ', top level' : start ? ', not started' : ', next level at ' + f.to)) + '">' +
    '<span class="c-stat__label">XP</span><span class="c-stat__track"><i class="c-stat__fill" style="--v:' + v + '%"></i></span>' +
    '<b class="c-stat__val">' + val + '</b></div></div>';
}

export function coachesHtml(vm) {
  const rows = (vm.coaches || []).map((c) =>
    '<section class="tr-coach" aria-label="Coach ' + esc(c.name) + '"><div class="tr-coach__head"><span class="tr-coach__ico">' + deco('coach', 36) + '</span><b class="tr-coach__name">Coach ' + esc(c.name) + '</b>' +
    (c.here ? '<span class="c-tag c-tag--done">Here</span>' : '<span class="c-tag c-tag--locked">Away</span>') + '</div>' +
    (c.foci || []).map(focusRow).join('') +
    (c.boost ? '<p class="tr-note">' + deco('upgrade', 20) + '<span>' + esc(c.boost) + '</span></p>' : '') + '</section>').join('');
  return rows + '<p class="tr-note">' + deco('info', 20) + '<span>' + esc(vm.note || 'A coach helps the drill that matches his focus. Each level adds to the Good chance.') + '</span></p>';
}

export function open(vm) {
  return openSheet('Coaches', coachesHtml(vm));
}
