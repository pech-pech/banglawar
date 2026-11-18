// Settings "Tick" (2026-11-18): Normal / Bold landing tick, per device (its own localStorage key, never in the save or an export). Look only.
// Missing, bad or blocked storage = Normal. The views read getTickStyle() each frame; main.js feeds the Dev tickW / tickL (Bold size) from the store.
import { tickStyle, tickModeOf } from '../core/landtick.js';

export const TICK_KEY = 'sixes.tick';
let mode = null, bw, bl; // mode null = not read yet
const store = () => { try { const s = window.localStorage; s.getItem(TICK_KEY); return s; } catch (e) { return null; } };
/** Saved mode from a storage (or null): 'bold' only for the exact saved word, else 'normal'. @param {any} [st] */
export function readTick(st = store()) { try { return tickModeOf(st ? st.getItem(TICK_KEY) : null); } catch (e) { return 'normal'; } }
/** Current mode (reads storage once). */
export function getTickMode() { if (mode == null) mode = readTick(); return mode; }
/** Set + save the mode. @param {any} m @param {any} [st] */
export function setTickMode(m, st = store()) { mode = tickModeOf(m); try { if (st) st.setItem(TICK_KEY, mode); } catch (e) { /* blocked: this session only */ } return mode; }
/** Bold size from the store (devVal tickW / tickL; non-numbers fall back to the Bold defaults). @param {any} w @param {any} l */
export function setTickDims(w, l) { bw = w; bl = l; }
/** The numbers the four draw sites use right now. */
export const getTickStyle = () => tickStyle(getTickMode(), bw, bl);
/** Test hook: forget the cached mode. */
export function resetTickPref() { mode = null; bw = undefined; bl = undefined; }

/** Settings row html: Tick, Normal / Bold, words + aria-pressed, >= 56 px (css in settings.css). Pure. @param {any} m */
export function tickRowHtml(m) {
  const b = tickModeOf(m) === 'bold', opt = (id, on, sub) => '<button type="button" class="c-seg__opt tk-opt' + (on ? ' is-selected' : '') + '" data-tick="' + id + '" aria-pressed="' + on + '"><b>' + (id === 'bold' ? 'Bold' : 'Normal') + '</b><small>' + sub + (on ? ' (on)' : '') + '</small></button>';
  return '<div class="st-tick" role="group" aria-label="Tick"><span class="st-theme__lbl">Tick</span><div class="c-seg st-tick__seg">' + opt('normal', !b, 'thin landing tick') + opt('bold', b, 'thick, long, bright halo') + '</div></div>';
}
/** Mount the row above the status line of the Settings body. Only the look changes. @param {HTMLElement} root */
export function mountTickRow(root) {
  const d = document.createElement('div'); d.innerHTML = tickRowHtml(getTickMode()); const row = /** @type {HTMLElement} */ (d.firstChild);
  const st = root.querySelector('.st-status'); root.insertBefore(row, st || root.firstChild);
  row.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-tick]'); if (!b) return;
    const m = setTickMode(b.getAttribute('data-tick'));
    row.innerHTML = tickRowHtml(m).replace(/^<div[^>]*>|<\/div>$/g, '');
  });
  return row;
}
