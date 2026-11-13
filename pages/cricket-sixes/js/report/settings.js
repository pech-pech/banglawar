// Settings sheet: copy report, copy short summary, build stamp, clear data (with confirm). Nothing leaves the phone.
import { openSheet } from '../ui/sheet.js';
import { THEMES, themeOf } from '../ui/theme.js';

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

/** @param {{summary:()=>string, full:()=>string, stamp:()=>string, count:()=>number, clear:()=>void, flush:()=>void, copied?:(text:string,size:string)=>any, last?:()=>any}} rep
 *  look = { get, set, dispatch?, state? }: dispatch = store.dispatch, state = store.get (r9 match day rows). */
export function openSettings(rep, look) {
  rep.flush();
  const html =
    '<div class="st-body">' +
    (look ? '<div class="st-theme" role="group" aria-label="Theme"><span class="st-theme__lbl">Theme</span><div class="c-seg st-theme__seg">' +
      THEMES.map((t) => '<button type="button" class="c-seg__opt" data-theme="' + t.id + '" aria-pressed="' + (themeOf(look.get()) === t.id) + '">' + t.label + '</button>').join('') + '</div></div>' : '') +
    '<p class="st-status" role="status" aria-live="polite"></p>' +
    '<button type="button" class="c-btn c-btn--primary st-act" data-st="full">Copy report (full)</button>' +
    '<button type="button" class="c-btn st-act" data-st="short">Copy short</button>' +
    '<button type="button" class="c-btn st-act" data-st="last">Copy last again</button>' +
    '<div class="st-fallback" hidden><p>Copy blocked (the report window did not move). Press and hold the text, choose Select all, then Copy.</p><textarea readonly rows="6" aria-label="Report text"></textarea></div>' +
    '<p class="st-stamp"></p>' +
    '<div class="st-clear"><button type="button" class="c-btn st-act" data-st="clear">Clear report data</button></div>' +
    '<p class="st-note">Nothing leaves your phone. Paste the report in chat.</p></div>';
  openSheet('Settings', html);
  const root = document.querySelector('.sheet-fixed .st-body'); if (!root) return;
  const status = root.querySelector('.st-status'), fb = root.querySelector('.st-fallback'), ta = fb.querySelector('textarea');
  root.querySelector('.st-stamp').textContent = rep.stamp();
  const say = (t) => { status.textContent = t; try { status.scrollIntoView({ block: 'nearest' }); } catch (e) { /* older browsers */ } }; // m11: the line sits above the copy buttons so it is on screen at 344x780
  // r9: Auto match day and Features rows (UI-MD). Settings stay usable if the import or the mount fails.
  if (look && look.dispatch) {
    import('../ui/matchday-settings.js').then((m) => { try { const st = look.state ? look.state() : {}; if (m.mountMatchdaySettings) m.mountMatchdaySettings(root, { features: st && st.features, auto: st && st.autoMatchday }, look.dispatch); } catch (e) { /* settings stay usable */ } }).catch(() => {});
  }
  async function copy(text, label, size) {
    fb.hidden = true;
    if (await copyText(text)) { try { if (size && rep.copied) rep.copied(text, size); } catch (e) { /* the marker is best effort */ } say(/^Copied/.test(label) ? label : label + ' copied.'); return; } // the marker moves only after the clipboard took the text (W2)
    ta.value = text; fb.hidden = false; ta.focus(); ta.select(); say('Copy was blocked. Text is selected below.');
    try { document.execCommand('copy'); } catch (e) { /* the textarea is the fallback */ }
  }
  root.addEventListener('click', (e) => {
    const th = look && e.target.closest && e.target.closest('[data-theme]');
    if (th) {
      look.set(th.getAttribute('data-theme'));
      root.querySelectorAll('[data-theme]').forEach((o) => { const on = o === th; o.setAttribute('aria-pressed', String(on)); o.classList.toggle('is-selected', on); });
      return;
    }
    const b = e.target.closest && e.target.closest('[data-st]'); if (!b) return;
    const k = b.getAttribute('data-st');
    if (k === 'full') copy(rep.full(), 'Report', 'f');
    else if (k === 'short') copy(rep.summary(), 'Short summary', 's');
    else if (k === 'last') { const l = rep.lastText ? rep.lastText() : rep.last && rep.last(); if (l && l.text) copy(l.text, 'Copied the last report again.'); else say('Nothing copied yet.'); }
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
