// Book badge (P6 section 4, F7 A): finds since the Book was last opened. Session only: a module variable, never in the store or the save (a reload clears it).
let count = 0;

/** Current count of new finds. */
export function badgeCount() { return count; }
/** Add n finds (over panel: found.length; season-end notebook gift: 1). */
export function addFinds(n) { const k = Math.floor(Number(n)); if (k > 0) count += k; return count; }
/** The Book was opened: no badge until the next find. */
export function clearBadge() { count = 0; }
/** Badge text: '' for 0 (no badge), '1'..'9', '9+' for 10 or more. Pure. Defaults to the current count. */
export function badgeText(n = count) { const k = Math.floor(Number(n)) || 0; return k <= 0 ? '' : k >= 10 ? '9+' : String(k); }
/** Screen-reader words for the count, e.g. "1 new in Book" ('' for 0). Pure. */
export function badgeAria(n = count) { const t = badgeText(n); return t ? (t === '9+' ? 'more than 9' : t) + ' new in Book' : ''; }
