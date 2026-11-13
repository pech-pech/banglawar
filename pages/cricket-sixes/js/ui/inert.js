/* inert.js: one rule for "the page behind is inert while an overlay is open".
   Every overlay used to save #app.inert on open and put that saved value back on close; with two overlays open at once
   (tier-up card over the nets scene) the second one saved `true` and restored it later, leaving the whole app dead.
   Now a closing overlay asks the page: is any overlay still up? If not, the app is live again. */
export const OVERLAYS = '.wh-ov, .tu-ov, .wk-ov, .ns-scene, .sheet-fixed'; // wheel + dial/reel (wh-ov), tier-up card, Workshop, nets scene, bottom sheet
/** Call right after the overlay element has been removed. @param {HTMLElement|null} app */
export function releaseInert(app) {
  if (app) app.inert = !!document.querySelector(OVERLAYS);
}
/** Is any overlay open now? */
export const overlayOpen = () => !!document.querySelector(OVERLAYS);
