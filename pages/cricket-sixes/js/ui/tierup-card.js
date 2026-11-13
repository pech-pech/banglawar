/* tierup-card: shown after a wheel result when a new wheel tier is reached (Wheel meta).
   openTierUp(vm, { dispatch, onTree, onDone }) -> close()
   vm = tierUpVM(s) = { tier 1..7, material:'brass', from?:'wood' (the material before), line?, unlocks?:[node names that open] }. Both buttons dispatch DismissTierUp {}; "See the tree" then calls onTree().
   One slow free turn (no prize): the new wheel turns once and its rim changes material. Reduced motion: the same card, still (before and after side by side, nothing moves).
   Reads once to a screen reader. No spin counts, no odds. */
import { esc } from './dom.js';
import { releaseInert } from './inert.js';
import { MATERIALS, MAT_NAME, sliceWheelSvg } from './wheel-look.js';

const SPOKES = [4, 5, 6, 8, 10, 12, 12]; // bars drawn on the hub per tier (art only; the word Spoke stays for the currency)
const LINE = 'Every spin now drops 1 more Spoke';

export function tierUpHtml(vm) {
  const tier = Math.max(1, Math.min(7, Number(vm.tier) || 1)), mat = vm.material || MATERIALS[tier - 1], from = vm.from || MATERIALS[Math.max(0, tier - 2)];
  const name = MAT_NAME[mat] || mat, extra = String(vm.line || '').replace(/Every spin now drops 1 more Spoke\.?\s*/i, '').trim(), opens = (vm.unlocks || []).filter(Boolean);
  const newLine = 'New: ' + name + ' rim' + (tier > 1 ? ' and studs' : '') + ', ' + SPOKES[tier - 1] + ' bars on the hub';
  // the real wheel with its slices. Tier 1: the plain first wheel (no paint) before, the wooden one after. Later tiers: the last material before.
  const before = tier === 1 ? sliceWheelSvg({ mat: 'wood', bars: SPOKES[0], size: 72, plain: true }) : sliceWheelSvg({ mat: from, bars: SPOKES[tier - 2], size: 72 });
  return '<div class="tu-card c-card"><span class="tu-tag">New wheel</span><h2 class="tu-ttl">' + esc(name) + ' Wheel!</h2>' +
    '<div class="tu-art"><div class="tu-before">' + before + '</div><span class="tu-arr c-ico c-ico--chev" aria-hidden="true"></span>' +
    '<div class="tu-after"><div class="tu-turn">' + sliceWheelSvg({ mat, bars: SPOKES[tier - 1], size: 150 }) + '</div></div></div>' +
    '<ul class="tu-list"><li>' + esc(newLine) + '</li>' + (opens.length ? '<li>Opens: ' + esc(opens.join(', ')) + '</li>' : '') + '<li>' + esc(LINE) + '</li>' + (extra ? '<li>' + esc(extra) + '</li>' : '') + '</ul>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-tu-tree>See the tree</button><button type="button" class="c-btn c-btn--block" data-tu-done>Done</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite">New wheel: ' + esc(name) + '. ' + (opens.length ? 'Opens: ' + esc(opens.join(', ')) + '. ' : '') + esc(LINE) + '.</div>';
}

export function openTierUp(vm, o) {
  o = o || {};
  const app = document.getElementById('app'), opener = document.activeElement;
  const ov = document.createElement('section'); ov.className = 'tu-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'New wheel');
  ov.innerHTML = tierUpHtml(vm); document.body.appendChild(ov); if (app) app.inert = true;
  let closed = false;
  function close(tree) {
    if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); ov.remove(); releaseInert(app);
    if (o.dispatch) o.dispatch('DismissTierUp', {});
    if (tree && o.onTree) o.onTree(); else if (!tree && o.onDone) o.onDone();
    if (!tree && opener && opener.isConnected && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')]; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  ov.querySelector('[data-tu-tree]').addEventListener('click', () => close(true));
  ov.querySelector('[data-tu-done]').addEventListener('click', () => close(false));
  document.addEventListener('keydown', onKey, true);
  ov.querySelector('[data-tu-tree]').focus();
  return () => close(false);
}
