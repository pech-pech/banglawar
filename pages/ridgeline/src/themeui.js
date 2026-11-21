// Ridgeline theme picker: DOM only. Mounted on the start screen and in settings.
import { DEFAULT_THEME, THEME_ORDER, THEMES } from './themes.js';

const KEY = 'ridgeline.theme.v1';
const STYLE_ID = 'rl-themepicker-style';

// One-time migration: phones with 'snow' (or any older pick) saved move to the new default look once, then the pick is theirs.
const MIGRATE_FLAG = 'rl-dune-default-v1';
export function migrateDefaultTheme() {
  try {
    if (localStorage.getItem(MIGRATE_FLAG)) return false;
    localStorage.setItem(MIGRATE_FLAG, '1'); // flag first: a failed second write must never re-run this and override a later pick
    localStorage.setItem(KEY, 'dune');
    return true;
  } catch (e) { return false; /* storage unavailable: DEFAULT_THEME applies */ }
}
migrateDefaultTheme();

export function getThemeId() {
  try { const q = new URLSearchParams(location.search); if (q.get('still') === '1') { const t = q.get('theme'); if (t && Object.prototype.hasOwnProperty.call(THEMES, t)) return t; } } catch (e) { /* ignore */ }
  try {
    const v = localStorage.getItem(KEY);
    if (v && Object.prototype.hasOwnProperty.call(THEMES, v)) return v;
  } catch (e) { /* storage unavailable */ }
  return DEFAULT_THEME;
}

export function setThemeId(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(THEMES, id)) return false;
  try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
  return true;
}

const hex = (n) => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0');

const CSS = `
.rl-tp{box-sizing:border-box;width:100%;max-width:100%;padding:10px 12px 12px;border-radius:14px;
  background:rgba(12,16,28,.72);border:1px solid rgba(255,255,255,.14);color:#fff;
  font:600 14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.rl-tp *{box-sizing:border-box}
.rl-tp-label{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.rl-tp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}
@media (min-width:521px){.rl-tp-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
.rl-tp-chip{position:relative;display:flex;align-items:center;gap:6px;min-width:0;min-height:56px;padding:6px 6px;margin:0;
  border-radius:12px;border:2px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:#fff;
  font:inherit;text-align:left;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.rl-tp-chip:focus-visible{outline:3px solid #fff;outline-offset:2px}
.rl-tp-chip[aria-checked="true"]{border-color:var(--rl-accent,#fff);background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 2px var(--rl-accent,#fff)}
.rl-tp-sw{flex:none;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:28px;height:28px;
  border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,.5)}
.rl-tp-sw i{display:block}
.rl-tp-name{flex:1 1 0;min-width:0;white-space:normal;overflow-wrap:break-word;word-break:normal;font-size:13px;line-height:1.15}
.rl-tp-check{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;display:none;align-items:center;justify-content:center;
  background:var(--rl-accent,#fff);color:#000;font-size:12px;font-weight:900;line-height:1}
.rl-tp-chip[aria-checked="true"] .rl-tp-check{display:flex}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function createThemePicker(rootEl, { onChange } = {}) {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'rl-tp';
  const labelId = 'rl-tp-label-' + Math.random().toString(36).slice(2, 8);
  const label = document.createElement('div');
  label.className = 'rl-tp-label';
  label.id = labelId;
  label.textContent = 'Theme';
  const grid = document.createElement('div');
  grid.className = 'rl-tp-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-labelledby', labelId);
  el.append(label, grid);

  const chips = [];
  THEME_ORDER.forEach((id) => {
    const t = THEMES[id];
    if (!t) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rl-tp-chip';
    b.dataset.theme = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    if (t.uiAccent) b.style.setProperty('--rl-accent', t.uiAccent);
    const sw = document.createElement('span');
    sw.className = 'rl-tp-sw';
    sw.setAttribute('aria-hidden', 'true');
    [t.sky, t.groundHigh, t.rock, t.gate].forEach((c) => {
      const i = document.createElement('i');
      i.style.background = hex(c);
      sw.appendChild(i);
    });
    const name = document.createElement('span');
    name.className = 'rl-tp-name';
    name.textContent = t.name || id;
    const ck = document.createElement('span');
    ck.className = 'rl-tp-check';
    ck.setAttribute('aria-hidden', 'true');
    ck.textContent = '✓';
    b.append(sw, name, ck);
    grid.appendChild(b);
    chips.push(b);
  });

  function refresh() {
    const cur = getThemeId();
    chips.forEach((b) => {
      const on = b.dataset.theme === cur;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  function choose(id, focus) {
    setThemeId(id);
    refresh();
    if (focus) { const b = chips.find((c) => c.dataset.theme === id); if (b) b.focus(); }
    if (typeof onChange === 'function') onChange(id);
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.rl-tp-chip');
    if (b && grid.contains(b)) choose(b.dataset.theme, false);
  });
  grid.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.rl-tp-chip');
    if (!b) return;
    const i = chips.indexOf(b);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % chips.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + chips.length) % chips.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = chips.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); choose(b.dataset.theme, false); return; }
    if (n >= 0) { e.preventDefault(); choose(chips[n].dataset.theme, true); }
  });

  refresh();
  if (rootEl) rootEl.appendChild(el);
  return { el, refresh };
}
