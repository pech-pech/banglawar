// @ts-check
// Rival hint sheet (P9): the tag chip and its one-line hint, in plain words. Opened from the hub chip; view state only.
import { esc, tagChip } from './dom.js';
import { openSheet } from './sheet.js';

/** @param {{name:string, tag:{chip:string, hint:string}|null}} vm */
export function open(vm) {
  const t = vm && vm.tag;
  return openSheet(vm && vm.name ? vm.name : 'Next rival', '<div class="rv-sheet">' + (t ? tagChip(t) + '<p class="rv-hint">' + esc(t.hint) + '</p>' : '<p class="rv-hint">No style tag.</p>') + '</div>');
}
