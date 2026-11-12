// Settings sheet: copy report, copy short summary, build stamp, clear data (with confirm). Nothing leaves the phone.
import { openSheet } from '../ui/sheet.js';

const two = (n) => (n < 10 ? '0' : '') + n;
export const stampOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); };

/** Gear button markup: the kit's pixel gear when sprites.js has it, else a plain word. */
export function gearButton() {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'c-icon-btn st-gear'; b.setAttribute('aria-label', 'Settings and playtest report');
  const S = window.SPR;
  if (S && S.iconNames && S.iconNames.indexOf('settings') >= 0) { const img = S.iconImg('settings', 24); img.setAttribute('alt', ''); img.setAttribute('aria-hidden', 'true'); b.appendChild(img); }
  else b.textContent = 'Set';
  return b;
}

/** Copy text. Returns true if the clipboard took it; false means the caller should show the selectable fallback. */
export async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* blocked: fall through */ }
  return false;
}

/** @param {{summary:()=>string, full:()=>string, stamp:()=>string, count:()=>number, clear:()=>void, flush:()=>void}} rep */
export function openSettings(rep) {
  rep.flush();
  const html =
    '<div class="st-body">' +
    '<button type="button" class="c-btn c-btn--primary st-act" data-st="full">Copy report</button>' +
    '<button type="button" class="c-btn st-act" data-st="short">Copy short summary</button>' +
    '<p class="st-status" role="status" aria-live="polite"></p>' +
    '<div class="st-fallback" hidden><p>Copy blocked. Press and hold the text, choose Select all, then Copy.</p><textarea readonly rows="6" aria-label="Report text"></textarea></div>' +
    '<p class="st-stamp"></p>' +
    '<div class="st-clear"><button type="button" class="c-btn st-act" data-st="clear">Clear report data</button></div>' +
    '<p class="st-note">Nothing leaves your phone. Paste the report in chat.</p></div>';
  openSheet('Settings', html);
  const root = document.querySelector('.sheet-fixed .st-body'); if (!root) return;
  const status = root.querySelector('.st-status'), fb = root.querySelector('.st-fallback'), ta = fb.querySelector('textarea');
  root.querySelector('.st-stamp').textContent = rep.stamp();
  const say = (t) => { status.textContent = t; };
  async function copy(text, label) {
    fb.hidden = true;
    if (await copyText(text)) { say(label + ' copied.'); return; }
    ta.value = text; fb.hidden = false; ta.focus(); ta.select(); say('Copy was blocked. Text is selected below.');
    try { document.execCommand('copy'); } catch (e) { /* the textarea is the fallback */ }
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-st]'); if (!b) return;
    const k = b.getAttribute('data-st');
    if (k === 'full') copy(rep.full(), 'Report');
    else if (k === 'short') copy(rep.summary(), 'Short summary');
    else if (k === 'clear') {
      const box = root.querySelector('.st-clear');
      box.innerHTML = '<p class="st-q">Clear ' + rep.count() + ' saved matches?</p><div class="st-two"><button type="button" class="c-btn st-act" data-st="yes">Yes, clear</button><button type="button" class="c-btn st-act" data-st="no">Keep</button></div>';
      box.querySelector('[data-st="no"]').focus();
    } else if (k === 'yes' || k === 'no') {
      if (k === 'yes') { rep.clear(); say('Report data cleared.'); fb.hidden = true; }
      root.querySelector('.st-clear').innerHTML = '<button type="button" class="c-btn st-act" data-st="clear">Clear report data</button>';
    }
  });
}
