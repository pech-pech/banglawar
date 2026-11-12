// Glossary bottom sheet (kit c-sheet). openGlossary(id?) -> close function.
import { GLOSSARY, GLOSSARY_GROUPS } from '../data/glossary.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let openClose = null;

export function glossaryButton(id, label = '?') {
  const a = id ? ` data-gloss="${esc(id)}"` : ' data-gloss=""';
  return `<button type="button" class="c-icon-btn"${a} aria-label="Glossary">${esc(label)}</button>`;
}

export function wireGlossary(rootEl) {
  rootEl.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-gloss]');
    if (!t || !rootEl.contains(t)) return;
    e.preventDefault();
    openGlossary(t.getAttribute('data-gloss') || undefined);
  });
}

export function openGlossary(id) {
  if (openClose) openClose();
  const prevFocus = document.activeElement;
  const root = document.createElement('div');
  root.className = 'gloss-root';
  root.style.cssText = 'position:fixed;inset:0;z-index:100';
  const sections = GLOSSARY_GROUPS.map((g) => {
    const items = GLOSSARY.filter((e) => e.group === g).map((e) =>
      `<div class="gloss-entry" id="gloss-${esc(e.id)}" data-id="${esc(e.id)}" style="padding:8px 4px;border-bottom:2px solid var(--stone1)">` +
      `<b>${esc(e.term)}</b>: ${esc(e.short)}<div style="font-size:var(--c-fs-s);line-height:var(--c-lh-s);margin-top:4px">${esc(e.long)}</div></div>`).join('');
    return items ? `<h4 style="margin:12px 0 4px;font:700 var(--c-fs-m)/var(--c-lh-m) var(--c-font)">${esc(g)}</h4>${items}` : '';
  }).join('');
  root.innerHTML =
    '<div class="c-scrim" data-close></div>' +
    '<section class="c-sheet c-sheet--dock" role="dialog" aria-modal="true" aria-label="Glossary" style="max-height:85%;display:flex;flex-direction:column">' +
    '<span class="c-sheet__grab"></span>' +
    '<header class="c-sheet__head"><h3 class="c-sheet__title">Glossary</h3>' +
    '<button type="button" class="c-icon-btn" data-close aria-label="Close"><span class="c-ico c-ico--x"></span></button></header>' +
    `<div class="c-sheet__body" style="display:block;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0;flex:1">${sections}</div></section>`;
  document.body.appendChild(root);

  const body = root.querySelector('.c-sheet__body');
  const closeBtn = root.querySelector('button[data-close]');
  function close() {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    openClose = null;
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (_) { /* ignore */ } }
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey, true);
  openClose = close;

  const target = id ? root.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
  if (target) {
    target.style.background = 'var(--gold)';
    target.classList.add('is-hl');
    body.scrollTop = Math.max(0, target.offsetTop - body.offsetTop - 8);
  }
  closeBtn.focus();
  return close;
}
