// @ts-check
// DEV badge (wheel settings G2): a small "DEV" word on every wheel screen while s.dev.on is true. One fixed, pointer-less element on <body>:
// out of every layout, so it can never change a wheel's size (wheelCap / wheelmatch layout read the stage, not the body). Absent from the DOM when off.
export const BADGE_SEL = '.wh-ov, .wm'; // big wheel, dial, reel (.wh-ov) and the match wheel + Golden Over (.wm, .wm.go)
export const BADGE_TEXT = 'DEV';
export const BADGE_LABEL = 'Dev mode is on';
/** Pure: show the badge? Dev on (same test as devVal) and a wheel screen up. @param {any} s @param {boolean} wheelUp */
export const devBadgeWanted = (s, wheelUp) => !!(s && s.dev && s.dev.on === true && wheelUp);
/** Add / remove the badge to match state + DOM. Idempotent. @param {any} s @param {Document} [doc] */
export function syncDevBadge(s, doc = document) {
  const cur = doc.querySelector('.dev-badge'), want = devBadgeWanted(s, !!doc.querySelector(BADGE_SEL));
  if (!want) { if (cur) cur.remove(); return; }
  const cls = 'dev-badge' + (doc.querySelector('.wh-ov') ? '' : ' is-match'); // match wheel / Golden Over: header text sits top-right, so the badge goes in the free strip under the header (css .is-match)
  if (cur) { cur.className = cls; return; }
  const b = doc.createElement('div');
  b.className = cls; b.setAttribute('role', 'status'); b.setAttribute('aria-label', BADGE_LABEL); b.textContent = BADGE_TEXT;
  doc.body.appendChild(b);
}
/** Keep the badge in step with the store and with wheel screens opening / closing. @param {{get:()=>any, subscribe:(f:any)=>any}} store */
export function mountDevBadge(store, doc = document) {
  const go = () => { try { syncDevBadge(store.get(), doc); } catch (e) { /* cosmetic only */ } };
  store.subscribe(go);
  if (typeof MutationObserver === 'function') new MutationObserver(go).observe(doc.body, { childList: true, subtree: true });
  go();
}
