/* sheet.js: one bottom sheet at a time. openSheet(title, html, {onClose, returnFocus}) -> close(). returnFocus: element, selector, list of selectors (first match wins) or function, resolved when the sheet closes; used when the opener is gone. The page behind is inert while a sheet is open. html is trusted markup built by the caller. */
import { releaseInert } from './inert.js';
let current = null;

/** Resolve a returnFocus option to a focusable element, or null. Selectors are tried in order at close time (the screen behind may have redrawn). */
function resolveFocus(rf) {
  if (typeof rf === 'function') rf = rf();
  if (!rf) return null;
  if (typeof rf === 'string') rf = [rf];
  if (Array.isArray(rf)) { for (const q of rf) { const el = document.querySelector(q); if (el) return el; } return null; }
  return rf.isConnected ? rf : null;
}

export function openSheet(title, html, opts) {
  const onClose = opts && opts.onClose, returnFocus = opts && opts.returnFocus;
  if (current) current();
  const opener = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'c-scrim sheet-scrim';
  const sheet = document.createElement('section');
  sheet.className = 'c-sheet c-sheet--dock sheet-fixed';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const tid = 'sheet-title-' + Date.now();
  sheet.setAttribute('aria-labelledby', tid);
  sheet.innerHTML = '<span class="c-sheet__grab"></span><header class="c-sheet__head"><h3 class="c-sheet__title" id="' + tid + '"></h3>' +
    '<button type="button" class="c-icon-btn" aria-label="Close"><span class="c-ico c-ico--x"></span></button></header><div class="c-sheet__body"></div>';
  sheet.querySelector('.c-sheet__title').textContent = title;
  sheet.querySelector('.c-sheet__body').innerHTML = html;
  const btn = sheet.querySelector('.c-icon-btn');
  const app = document.getElementById('app');
    if (app) app.inert = true; // the page behind is not reachable by keyboard or AT while the sheet is open
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove(); sheet.remove();
    if (current === close) current = null;
    releaseInert(app);
    const back = opener && opener.isConnected && opener !== document.body ? opener : resolveFocus(returnFocus);
    if (back && back.focus) back.focus();
    if (typeof onClose === 'function') onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (document.querySelector('.dr-ov')) return; /* a dial / reel over the sheet owns Escape (closes alone) */ e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const f = sheet.querySelectorAll('button:not([tabindex="-1"]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  btn.addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
  current = close;
  btn.focus();
  return close;
}
