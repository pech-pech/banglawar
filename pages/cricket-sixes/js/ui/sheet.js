/* sheet.js: one bottom sheet at a time. openSheet(title, html, {onClose}) -> close(). html is trusted markup built by the caller. */
let current = null;

export function openSheet(title, html, opts) {
  const onClose = opts && opts.onClose;
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
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove(); sheet.remove();
    if (current === close) current = null;
    if (opener && opener.isConnected && opener.focus) opener.focus();
    if (typeof onClose === 'function') onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const f = sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
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
