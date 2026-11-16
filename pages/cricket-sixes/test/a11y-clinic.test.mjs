// Static guards for the Clinic screens (SPEC 2026-11-16-coach-weekly s8; same style as a11y-train.test.mjs): markup and CSS rules that must not drift.
// Behaviour (focus trap, live result, reduced motion) is checked live at 344x780 in the e2e run. Files are read inside each test, so a file that
// has not landed fails only its own tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clinicResultText } from '../js/ui/wheels/clinic.js';
import { CLINIC_SLICE_ORDER } from '../js/data/clinic.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SRC = ['js/ui/clinic-pick-sheet.js', 'js/ui/boost-chip.js', 'js/ui/wheels/clinic.js', 'js/core/clinic.js', 'js/core/clinic-boost.js', 'js/core/clinic-hooks.js', 'js/store/spins/clinic.js', 'js/data/clinic.js', 'css/clinic.css', 'js/report/clinic.js'];
const slotText = (file) => { const m = read(file).match(/\/\* SLOT:ClinicBtn start \*\/([^]*?)\/\* SLOT:ClinicBtn end \*\//); return m ? m[1] : ''; };
const px = (v) => (/^(\d+(?:\.\d+)?)px$/.test(v.trim()) ? parseFloat(v) : NaN);

/** CSS rules as [{sel, body}] (media blocks are flattened; keyframes skipped). */
function rules(css) {
  const out = [], flat = css.replace(/\/\*[^]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(flat))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const decl = (body, prop) => { const m = body.match(new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;]+)', 'i')); return m ? m[1].trim() : null; };
/** cn- classes that sit on a <button>, role=button or <a> in a source (a control). */
function controlClasses(src) {
  const set = new Set();
  for (const m of src.matchAll(/<(?:button|a)\b[^>]*?class=["']([^"']*)["']/g)) for (const c of m[1].split(/\s+/)) if (/^cn-[\w-]*[a-z0-9]$/.test(c)) set.add(c);
  for (const m of src.matchAll(/role=["']button["'][^>]*?class=["']([^"']*)["']|class=["']([^"']*)["'][^>]*?role=["']button["']/g)) for (const c of (m[1] || m[2] || '').split(/\s+/)) if (/^cn-[\w-]*[a-z0-9]$/.test(c)) set.add(c);
  return set;
}
/** Min tap height a class gets from the CSS: the largest min-height/height of any rule whose selector ends in that class (px). */
function tapOf(css, cls) {
  let best = 0;
  for (const r of rules(css)) {
    if (!r.sel.split(',').some((x) => new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![\\w-])(?::[a-z-]+(?:\\([^)]*\\))?)*\\s*$').test(x.trim()))) continue;
    for (const p of ['min-height', 'height']) { const v = decl(r.body, p); if (v && px(v) > best) best = px(v); }
  }
  return best;
}

test('every cn- control (pick sheet, boost chip, wheel screen, slot output) is a 56 px tap target in clinic.css', () => {
  const css = read('css/clinic.css');
  const srcs = ['js/ui/clinic-pick-sheet.js', 'js/ui/boost-chip.js', 'js/ui/wheels/clinic.js', 'js/ui/training-view.js', 'js/ui/coaches-sheet.js'].map((f) => (/view|sheet\.js$/.test(f) && /training-view|coaches-sheet/.test(f) ? slotText(f) : read(f)));
  const ctrl = new Set(); srcs.forEach((t) => controlClasses(t).forEach((c) => ctrl.add(c)));
  assert.ok(ctrl.size >= 2, 'found the Clinic controls: ' + [...ctrl].join(','));
  for (const c of ctrl) assert.ok(tapOf(css, c) >= 56, `.${c} needs min-height >= 56px (got ${tapOf(css, c)})`);
});

test('every .cn-*btn / -row / -pick / -chip-btn rule in clinic.css that sets a height keeps it >= 56 px', () => {
  for (const r of rules(read('css/clinic.css'))) {
    if (!/\.cn-[\w-]*(btn|row|pick|go|stop|later)\b/.test(r.sel)) continue;
    for (const p of ['min-height', 'height']) { const v = decl(r.body, p); if (v && /^\d+(\.\d+)?px$/.test(v.trim())) assert.ok(px(v) >= 56, `${r.sel} { ${p}: ${v} }`); }
  }
});

test('the ClinicBtn slot bodies (training view and coaches sheet) output a cn- button, labelled, and nothing without coach.id', () => {
  for (const f of ['js/ui/training-view.js', 'js/ui/coaches-sheet.js']) {
    const t = slotText(f);
    assert.ok(t.trim(), f + ' slot body present');
    assert.match(t, /<button[^>]*class="[^"]*\bcn-/, f + ' cn- button');
    assert.match(t, /coach\.id|!coach/, f + ' guards a missing coach.id');
    assert.match(t, /aria-label|<span|>[A-Za-z]/, f + ' has words, not only an icon');
    assert.equal(/[^a-zA-Z]ico\(/.test(t.replace(/icoDeco\(/g, '')), false, f + ' uses bare ico(');
  }
});

test('no "perk" or "bond" word anywhere in the Clinic files', () => {
  for (const f of SRC) { let t; try { t = read(f); } catch (e) { assert.fail(f + ' missing'); } assert.equal(/perk|bond/i.test(t), false, f + ' has perk/bond'); }
  for (const f of ['js/ui/training-view.js', 'js/ui/coaches-sheet.js']) assert.equal(/perk|bond/i.test(slotText(f)), false, f + ' slot');
  for (let i = 0; i < CLINIC_SLICE_ORDER.length; i++) assert.equal(/perk|bond/i.test(clinicResultText(i)), false);
});

test('class prefix is cn- (never ct-slot, cl-) in clinic.css and the Clinic markup', () => {
  const css = read('css/clinic.css');
  // the subject (last compound) of every selector must be a cn- class; an existing parent (.ct-slot > .cn-btn) is fine as context
  for (const r of rules(css)) for (const part of r.sel.split(',')) {
    const last = part.trim().split(/[\s>+~]+/).pop(), cls = [...last.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]);
    for (const c of cls) assert.ok(/^cn-/.test(c) || /^(is-|sr-only)/.test(c), 'subject class .' + c + ' in ' + part.trim());
  }
  for (const f of ['js/ui/clinic-pick-sheet.js', 'js/ui/boost-chip.js', 'js/ui/wheels/clinic.js']) assert.equal(/class="[^"]*\b(ct-slot|cl-)/.test(read(f)), false, f);
});

test('wheel result: read once in an aria-live polite status region; visible text equals what is said', () => {
  const w = read('js/ui/wheels/clinic.js');
  assert.match(w, /aria-live['"],\s*['"]polite/);
  assert.match(w, /role['"],\s*['"]status/);
  for (let i = 0; i < CLINIC_SLICE_ORDER.length; i++) assert.match(clinicResultText(i), /^Landed: .+\.$/);
});

test('Auto: no auto-stop timer; where an Auto control exists it is disabled (and aria-disabled) while the wheel spins', () => {
  const w = read('js/ui/wheels/clinic.js'), p = read('js/ui/clinic-pick-sheet.js');
  assert.equal(/setInterval\(|auto\s*:\s*true/.test(w), false, 'no auto-stop in the Clinic wheel');
  for (const t of [w, p]) {
    const hasAuto = /<button[^>]*>\s*Auto\b|class="[^"]*cn-auto|data-auto/i.test(t);
    if (hasAuto) assert.match(t, /aria-disabled|disabled/, 'Auto control must be disabled while spinning');
  }
});

test('clinic.css: no hex colours (tokens only), nothing flashes, animation only under no-preference, no infinite loops', () => {
  const css = read('css/clinic.css');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[^]*?\*\//g, '')), false, 'hex colour in clinic.css');
  assert.equal(/infinite/.test(css), false, 'infinite animation');
  assert.equal(/blink|flash/i.test(css.replace(/\/\*[^]*?\*\//g, '')), false, 'flashing');
  const anim = css.replace(/\/\*[^]*?\*\//g, '');
  if (/animation\s*:/.test(anim) || /@keyframes/.test(anim)) assert.match(anim, /@media \(prefers-reduced-motion: no-preference\)[^]*(animation|@keyframes)/);
  for (const m of anim.matchAll(/(?:^|[;{\s])animation(?:-duration)?\s*:\s*[^;]*?(\d*\.?\d+)(ms|s)\b/g)) assert.ok((m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])) >= 300, 'a flash-fast animation: ' + m[0]);
});

test('clinic.css: text on a gold or filled background uses an ink token, never white-on-gold or gold-on-white', () => {
  for (const r of rules(read('css/clinic.css'))) {
    const bg = decl(r.body, 'background(?:-color)?'), fg = decl(r.body, 'color');
    if (!bg || !fg) continue;
    if (/var\(--gold\)/.test(bg)) assert.equal(/var\(--white\)/.test(fg), false, r.sel + ': white on gold');
    if (/var\(--white\)/.test(bg)) assert.equal(/var\(--gold\)/.test(fg), false, r.sel + ': gold on white');
  }
});

test('focus stays visible: no outline:none without a replacement on cn- controls', () => {
  for (const r of rules(read('css/clinic.css'))) if (/outline\s*:\s*(none|0)\b/.test(r.body)) assert.match(r.body, /box-shadow|border|outline-offset/, r.sel + ' removes the focus ring');
});

test('the pick sheet is a modal dialog with Escape and a labelled list of players', () => {
  const t = read('js/ui/clinic-pick-sheet.js');
  assert.match(t, /role="dialog"|aria-modal|openSheet|sheet\.js/);
  assert.match(t, /Escape|openSheet|sheet\.js/);
  assert.match(t, /aria-label|<h2|<legend/);
});
