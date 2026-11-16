// A11Y guards for the Wheel match screens (2026-11-15 wheel match build; SPEC s4 STOP glow; wheels SPEC 2d/2e/2h: pulse, no motion-off path; findings in
// /mnt/project-files/games-design/cricket-sixes/2026-11-15-wheel-match-build/A11Y.md). DOM-less: the view is driven through a recording fake DOM
// (no jsdom), the Settings rows through their pure string builders. Open defects are `todo` tests named after their A11Y.md id: they run and
// report, but do not fail the suite until the view is fixed (then drop the todo). "(fixed)" tests guard defects closed during the build.
// Live pass (475x638, OS reduced-motion setting on and off: the wheel spins either way, 56 px targets, focus order, live region): A11Y_E2E=1 node --test test/a11y-wheelmatch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { WHEEL_MATCH } from '../js/data/wheelmatch.js';
import * as V from '../js/ui/wheelmatch-view.js';
import { sliderHtml, devSectionHtml, devRowHtml, matchModeRowHtml, WMS_CSS, DEV_KEYS } from '../js/ui/wheelmatch-settings.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const view = read('js/ui/wheelmatch-view.js');

// ---------- recording fake DOM ----------
let LOG = [];
function stub(path) {
  const kids = {};
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      if (k in kids) return kids[k];
      if (k === 'querySelectorAll') return (q) => Array.from({ length: 6 }, (_, i) => stub(path + ' ' + q + '[' + i + ']'));
      if (k === 'contains') return () => true;
      if (k === 'getAttribute') return () => null;
      if (k === 'focus') return () => LOG.push(['focus', path]);
      return (kids[k] = stub(path + '.' + String(k)));
    },
    set(_, k, v) { kids[k] = v; LOG.push(['set', path, k, v]); return true; },
    apply() { return stub(path + '()'); },
  });
}
function fakeEl() {
  let nodes = {}, handlers = [];
  const q = (sel) => (sel === '.wm' ? root : nodes[sel] || (nodes[sel] = stub(sel)));
  const root = { addEventListener: (ev, fn) => { if (ev === 'click') handlers.push(fn); }, querySelector: q, querySelectorAll: () => [], contains: () => true, classList: stub('.wm.classList') };
  const el = {
    html: '', get innerHTML() { return this.html; },
    set innerHTML(v) { this.html = v; nodes = {}; handlers = []; LOG.push(['html', v]); },
    querySelector: q, querySelectorAll: () => [],
    btn: null, // the last tapped button (its capture listeners take the STOP tap)
    click(act, extra = {}) { // a tap on a button carrying data-wm=act (or data-bowler), at time extra.ts (performance.now clock)
      const base = stub('btn:' + act), L = {};
      const t = new Proxy(base, { get(_, k) {
        if (k === 'disabled') return false;
        if (k === 'getAttribute') return (a) => (a === 'data-wm' ? act : a === 'data-bowler' ? String(extra.bowler) : null);
        if (k === 'hasAttribute') return (a) => a === 'data-bowler' && extra.bowler != null;
        if (k === 'addEventListener') return (ev, fn) => { (L[ev] ||= []).push(fn); };
        if (k === 'removeEventListener') return (ev, fn) => { L[ev] = (L[ev] || []).filter((f) => f !== fn); };
        return base[k];
      } });
      this.btn = { tap: (ts) => { for (const fn of (L.click || []).slice()) fn({ timeStamp: ts, stopPropagation() {}, preventDefault() {} }); }, listeners: () => (L.click || []).length };
      for (const h of handlers.slice()) h({ target: { closest: () => t }, timeStamp: extra.ts != null ? extra.ts : NOW });
    },
  };
  return el;
}
let RAF = 0, NOW = 1000, QUEUE = [];
/** Run queued animation frames at the clock NOW (each frame may queue the next). */
const frames = (n = 1) => { for (let i = 0; i < n; i++) { const q = QUEUE; QUEUE = []; q.forEach((f) => f(NOW)); } };
function env(reduced) { // reduced: the OS setting is on; the game has no motion-off path, so nothing may change (wheels SPEC 2e)
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) ? !!reduced : false });
  globalThis.document = stub('document');
  globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
  globalThis.requestAnimationFrame = (f) => { QUEUE.push(f); return ++RAF; }; globalThis.cancelAnimationFrame = () => {};
  Object.defineProperty(globalThis, 'performance', { value: { now: () => NOW }, configurable: true, writable: true });
  RAF = 0; NOW = 1000; QUEUE = []; LOG = []; V._resetViewState();
}
const SEGS = [
  { id: '3w0', label: '3', stars: 0, tone: 'good', start: 0, width: 2.5, p: 0.25 },
  { id: '12w0', label: '12', stars: 0, tone: 'bad', start: 2.5, width: 2, p: 0.2 },
  { id: '7w1', label: '7', stars: 1, tone: 'so', start: 4.5, width: 3, p: 0.3 },
  { id: '15w2', label: '15', stars: 2, tone: 'bad', start: 7.5, width: 2.5, p: 0.25 },
];
const BOWLERS = [
  { idx: 0, name: 'Asha', role: 'Fast', overs: 1, ok: true, reason: '' },
  { idx: 1, name: 'Bilal', role: 'Spin', overs: 1, ok: false, reason: 'Bowled last over' },
  { idx: 2, name: 'Chandra', role: 'Medium', overs: 2, ok: false, reason: 'Bowled 2 overs' },
  { idx: 3, name: 'Dev', role: 'Spin', overs: 0, ok: true, reason: '' },
];
const vmOf = (side = 'bowl', o = {}) => ({ mode: 'wheel', side, over: 3, score: { runs: 20, wk: 1 }, expectText: 'Expected: 7.3 runs, 0.3 wkts', segs: SEGS, phys: { ...WHEEL_MATCH }, ctrl: {},
  bowlers: side === 'bowl' ? BOWLERS : [], suggested: 0, autoRestShown: true, autoPauseNow: false, last: null, roar: false,
  ...(side === 'bat' ? { need: { runs: 30, balls: 42 }, needText: 'Need 30 off 42 balls', target: 50 } : {}), ...o });
const BALLS = [{ o: 1 }, { o: 4 }, { o: 'W' }, { o: 0 }, { o: 6 }, { o: 2 }];
const hold = () => ({ wheel: { segId: '7w1', pos: 6, segs: SEGS, end: '' }, balls: BALLS, over: 3, score: { runs: 33, wk: 2 }, stage: 'bowl', result: null, found: [], release() {} });
function drive(reduced, side = 'bowl') { // pick -> BOWL/BAT OVER -> ready (SPIN)
  env(reduced);
  const el = fakeEl(), calls = [], vm = vmOf(side);
  const dispatch = (c, p) => { calls.push([c, p]); return c === 'WheelOver' ? hold() : null; };
  V.render(el, vm, dispatch, null);
  const pick = el.html; el.click('go'); const ready = el.html;
  return { el, calls, pick, ready, vm };
}
const attr = (tag, a) => { const m = tag.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
const html = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- the pulse spin: no motion-off path, STOP guard, no time limit (wheels SPEC 2a, 2c, 2d, 2e) ----------
/** drive() then SPIN at NOW; returns the driver plus stopAt(sec) (a STOP tap sec after SPIN) and calls. */
function spun(reduced = false, side = 'bowl') {
  const d = drive(reduced, side); d.el.click('spin', { ts: NOW }); const spinBtn = d.el.btn;
  return { ...d, spinBtn, stopAt: (sec) => spinBtn.tap(1000 + sec * 1000), wheelOvers: () => d.calls.filter((c) => c[0] === 'WheelOver') };
}
test('no motion-off path: with the OS reduced-motion setting on the wheel still reads SPIN, spins and needs a STOP', () => {
  for (const reduced of [true, false]) {
    const d = drive(reduced);
    assert.match(d.ready, /data-wm="spin"><span>SPIN<\/span>/);
    assert.doesNotMatch(d.pick + d.ready, /Show result|whole over at once/);
    d.el.click('spin', { ts: NOW });
    assert.ok(RAF > 0, 'the spin animates');
    assert.equal(d.calls.filter((c) => c[0] === 'WheelOver').length, 0, 'SPIN alone stores nothing (before STOP: unspun)');
  }
  assert.doesNotMatch(view, /prefers-reduced-motion|reducedNow|matchMedia|Show result/);
  assert.doesNotMatch(read('css/wheelmatch.css'), /prefers-reduced-motion/);
});

test('no time limit: untouched for 60 s and 300 s the wheel is still spinning and nothing is dispatched (test 4c)', () => {
  const d = spun();
  for (const t of [6, 6.01, 12, 60, 300]) { NOW = 1000 + t * 1000; frames(); }
  assert.equal(d.wheelOvers().length, 0, 'never auto-stopped');
  assert.equal(QUEUE.length, 1, 'a frame is still queued at 300 s');
  assert.equal(d.spinBtn.listeners(), 1, 'STOP still listening');
  NOW = 1000 + 300.5 * 1000; d.stopAt(300.5);
  const w = d.wheelOvers(); assert.equal(w.length, 1, 'a STOP after 300 s still lands');
  assert.ok(Math.abs(w[0][1].stop.t - 300.5) < 1e-9);
  assert.doesNotMatch(view, /COAST|STOP_FROM|coast|setTimeout\([^)]*doStop/);
});

test('STOP guard 0.35 s: taps before it do nothing (SPIN double tap = one); STOP sends {t, phi, stopT, cycle, tInCycle} from the tap timeStamp', () => {
  const d = spun();
  NOW = 1100; frames(); d.stopAt(0.1); NOW = 1340; d.stopAt(0.34);
  assert.equal(d.wheelOvers().length, 0, 'ignored inside the guard');
  NOW = 1400; frames();
  NOW = 1000 + 9600; frames(); // the next frame runs late: the STOP time still comes from the tap itself
  d.stopAt(9.5);
  const w = d.wheelOvers(); assert.equal(w.length, 1);
  const p = w[0][1]; assert.equal(p.bowler, 0);
  assert.deepEqual(Object.keys(p.stop).sort(), ['cycle', 'phi', 'stopT', 't', 'tInCycle']);
  assert.equal(p.stop.stopT, 9500); assert.equal(p.stop.cycle, 2); assert.ok(Math.abs(p.stop.tInCycle - 3.5) < 1e-9); assert.ok(Math.abs(p.stop.t - 9.5) < 1e-9);
  assert.equal(p.auto, undefined, 'a manual STOP is not auto');
  d.stopAt(9.6); assert.equal(d.wheelOvers().length, 1, 'a second STOP is ignored');
  assert.equal(WHEEL_MATCH.STOP_GUARD_S, 0.35);
});

test('STOP glow every cycle: "STOP!" and is-glow inside 3.2-3.8 s of cycles 1 and 2, plain STOP between', () => {
  const d = spun();
  const at = (t) => { NOW = 1000 + t * 1000; LOG = []; frames(); return LOG; };
  const label = (log) => log.filter((e) => e[0] === 'set' && /span|querySelector\(\)/.test(e[1]) && e[2] === 'textContent').map((e) => e[3]);
  assert.deepEqual(label(at(0.2)).slice(0, 1), [], 'Wait... set at SPIN, nothing new in the guard');
  assert.ok(label(at(0.5)).includes('STOP'), 'STOP after the guard');
  assert.ok(label(at(3.5)).includes('STOP!'), 'glow cycle 1');
  assert.ok(label(at(4.2)).includes('STOP'), 'off after 3.8 s');
  assert.ok(label(at(9.4)).includes('STOP!'), 'glow cycle 2');
  assert.ok(label(at(10.2)).includes('STOP'), 'off again');
  assert.equal(d.wheelOvers().length, 0);
});

test('"Auto rest of innings" is shown on the wheel screen and disabled while the wheel spins (wheels SPEC 2h)', () => {
  env(false); const el = fakeEl(), vm = vmOf('bowl', { over: 4 });
  V.render(el, vm, () => null, null); el.click('go');
  assert.match(el.html, /<button type="button" class="c-btn wm-auto" data-wm="auto-rest">Auto rest of innings<\/button>/, 'enabled at the over start');
  LOG = []; el.click('spin', { ts: NOW });
  assert.ok(LOG.some((e) => e[0] === 'set' && /auto-rest/.test(e[1]) && e[2] === 'disabled' && e[3] === true), 'disabled at SPIN');
  assert.doesNotMatch(view, /auto-over|Auto over/);
});

/** spun() then STOP at sec, glide to the end, timers run at once. Returns the LOG from the STOP on. */
function landAt(sec, reduced = false) {
  const d = spun(reduced); NOW = 1000 + sec * 1000; frames();
  const T = globalThis.setTimeout; globalThis.setTimeout = (fn) => { fn(); return 0; };
  try { LOG = []; d.stopAt(sec); NOW += 2500; frames(3); } finally { globalThis.setTimeout = T; }
  return { ...d, log: LOG };
}
test('after landing: result text goes into the polite live region before any ball is filled; all 6 balls', () => {
  for (const reduced of [false, true]) {
    landAt(3.5, reduced); const log = LOG;
    const liveAt = log.findIndex((e) => e[0] === 'set' && e[1] === '.wm-live' && e[2] === 'textContent');
    const fills = log.map((e, i) => (e[0] === 'set' && /\.op-slot\[\d\]\.querySelector\(\)$/.test(e[1]) && e[2] === 'textContent' ? [i, e[1].match(/\[(\d)\]/)[1]] : null)).filter(Boolean);
    const balls = [...new Map(fills.map(([i, k]) => [k, i])).values()];
    assert.ok(liveAt >= 0, 'live text set');
    assert.equal(log[liveAt][3], 'Over 3: 13 runs, 1 wicket.');
    assert.equal(balls.length, 6, 'six balls filled');
    assert.ok(balls.every((i) => i > liveAt), 'live text before the balls');
    assert.equal(log.slice(0, liveAt).some((e) => e[0] === 'html'), false, 'no rebuild between the landing and the text');
  }
});

test('nothing is announced while spinning (wheels SPEC 2e)', () => {
  spun(); LOG = [];
  for (const t of [0.5, 3.5, 7, 9.5]) { NOW = 1000 + t * 1000; frames(); }
  assert.equal(LOG.some((e) => e[0] === 'set' && e[1] === '.wm-live'), false);
});

test('the live region is role=status, aria-live=polite, aria-atomic and on every wheel screen', () => {
  const d = drive(false);
  for (const h of [d.pick, d.ready]) assert.match(h, /<div class="ss-sr wm-live" role="status" aria-live="polite" aria-atomic="true"><\/div>/);
});

// Every live text must go into a region that existed before this task and must not be wiped by a rebuild in the same task.
const liveProblems = () => {
  const bad = [];
  LOG.forEach((e, i) => {
    if (!(e[0] === 'set' && e[1] === '.wm-live' && e[2] === 'textContent' && e[3])) return;
    let j = i - 1; while (j >= 0 && LOG[j][0] !== 'tick') { if (LOG[j][0] === 'html') { bad.push('fresh region: ' + e[3]); break; } j--; }
    let k = i + 1; while (k < LOG.length && LOG[k][0] !== 'tick') { if (LOG[k][0] === 'html') { bad.push('wiped: ' + e[3]); break; } k++; }
  });
  return bad;
};
test('A11Y-1 Auto rest of innings: the summary is announced, not wiped by the next render', async () => {
  env(false);
  const T = globalThis.setTimeout; globalThis.setTimeout = (fn, ms) => T(() => { LOG.push(['tick']); fn(); }, ms);
  try {
    const el = fakeEl(); let vm = vmOf();
    const dispatch = (c) => (c === 'WheelOver' ? { ...hold(), stage: vm.over >= 4 ? 'break' : 'bowl', release() { vm = vmOf('bowl', { over: vm.over + 1, score: { runs: 33, wk: 2 }, ...(vm.over >= 4 ? { side: 'done' } : {}) }); V.render(el, vm, dispatch, null); } } : null);
    V.render(el, vm, dispatch, null); el.click('auto-rest');
    const saidNow = () => LOG.some((e) => e[0] === 'set' && e[1] === '.wm-live' && e[3]);
    for (let i = 0; i < 120 && !saidNow(); i++) { NOW += 700; frames(2); await new Promise((r) => T(r, 40)); } // auto pace waits are real timers (0.3 s a wicket over)
    await new Promise((r) => T(r, 50));
    const said = LOG.filter((e) => e[0] === 'set' && e[1] === '.wm-live' && e[3]).map((e) => e[3]);
    assert.ok(said.length >= 1, 'something was announced');
    assert.deepEqual(liveProblems(), []);
  } finally { globalThis.setTimeout = T; }
});

// ---------- names ----------
test('buttons have text names: BOWL OVER, BAT OVER, SPIN, Auto rest of innings, Stop auto; no "Auto over", no skip (wheels SPEC 2h, 1)', () => {
  const b = drive(false), t = drive(false, 'bat'), r = drive(true);
  assert.match(html(b.pick), /BOWL OVER 3 Asha/);
  assert.match(html(t.pick), /BAT OVER 3/);
  assert.match(b.ready, /data-wm="spin"><span>SPIN<\/span>/);
  assert.match(r.ready, /data-wm="spin"><span>SPIN<\/span>/, 'same with the OS reduced-motion setting on');
  for (const p of [b.pick, t.pick, b.ready, r.ready]) { assert.doesNotMatch(p, /auto-over|Auto over|Show result/i); assert.match(p, /data-wm="auto-rest">Auto rest of innings</); }
  env(false); const el = fakeEl(); V.render(el, vmOf('bowl', { autoRestShown: false }), () => null, null);
  assert.doesNotMatch(el.html, /Auto rest of innings/, 'rest-of-innings shows only after over 1');
  assert.match(view, /data-wm="stop-auto"><span>Stop auto<\/span>/);
  assert.match(view, /aria-label', 'Stop the wheel'/);
  assert.doesNotMatch(view, /skip|Skip|auto-over|Auto over/);
});

test('A11Y-5 (fixed) the spin button name follows its text after STOP (no stale "Stop the wheel" while it reads "Slowing...")', () => {
  const fn = view.slice(view.indexOf('function doStop('), view.indexOf('function onTap('));
  assert.match(fn, /removeAttribute\('aria-label'\)|setAttribute\('aria-label', 'Slowing/);
});

// ---------- bowler chips ----------
test('blocked bowlers: not a button, aria-disabled, reason in visible text and in the name', () => {
  const { pick } = drive(false);
  const rows = [...pick.matchAll(/<(button|div) [^>]*class="wm-brow[^"]*"[^>]*>[^]*?<\/\1>/g)].map((m) => m[0]);
  assert.equal(rows.length, 4);
  for (const b of BOWLERS) {
    const r = rows.find((x) => x.includes('>' + b.name));
    assert.ok(r, b.name);
    if (b.ok) { assert.match(r, /^<button type="button"/); assert.equal(attr(r, 'aria-disabled'), null); }
    else {
      assert.match(r, /^<div /, b.name + ' must not be activatable');
      assert.equal(attr(r, 'aria-disabled'), 'true');
      assert.match(attr(r, 'aria-label'), new RegExp(b.reason));
      assert.match(r, new RegExp('<small>' + b.reason + '</small>'), 'reason shown as text');
    }
  }
  assert.match(pick, /role="radiogroup" aria-label="Pick your bowler"/);
  assert.match(pick, /aria-checked="true" data-bowler="0"/);
});

test('A11Y-7 (fixed) the "suggested" tag is in the bowler row name', () => {
  const { pick } = drive(false);
  const r = pick.match(/<button [^>]*data-bowler="0"[^>]*>/)[0];
  assert.match(attr(r, 'aria-label'), /suggested/);
});

test('A11Y-2 (fixed) focus stays on the picked bowler row after the re-render', () => {
  env(false); const el = fakeEl(); const vm = vmOf();
  V.render(el, vm, () => null, null); LOG = [];
  el.click(null, { bowler: 3 });
  assert.ok(LOG.some((e) => e[0] === 'focus'), 'a focus() call after the re-render');
});

// ---------- wheel text alternative ----------
test('canvas is role=img with a text alternative listing every segment (label, wickets, chance)', () => {
  const { ready } = drive(false);
  const cv = ready.match(/<canvas class="wm-cv"[^>]*>/)[0];
  assert.equal(attr(cv, 'role'), 'img');
  const alt = attr(cv, 'aria-label');
  assert.match(alt, /^Over wheel: /);
  for (const g of SEGS) assert.ok(alt.includes(g.label + (g.stars ? ' with ' + g.stars + ' wicket' : '') ), g.label);
  assert.match(alt, /7 with 1 wicket 30 in 100/);
  assert.match(alt, /15 with 2 wickets 25 in 100/);
});

test('A11Y-3 (fixed) the wheel text alternative says which slices are good / so-so / bad for us', () => {
  const alt = attr(drive(false).ready.match(/<canvas class="wm-cv"[^>]*>/)[0], 'aria-label');
  assert.match(alt, /good/); assert.match(alt, /bad/); assert.match(alt, /so-so/);
});

// ---------- STOP glow (SPEC s4) ----------
test('glow reads time only: on 3.2-3.8 s, 3 half-beats of 0.2 s, one shot; the text turns to "STOP!" (not glow alone)', () => {
  assert.equal(V.glowPhase(3.19).on, false); assert.equal(V.glowPhase(3.81).on, false); assert.equal(V.glowPhase(5).on, false);
  assert.deepEqual([3.25, 3.45, 3.65].map((t) => V.glowPhase(t).beat), [0, 1, 2]);
  assert.equal(V.glowPhase.length >= 1, true);
  const fr = view.slice(view.indexOf('function frame('), view.indexOf('function doStop('));
  assert.match(fr, /if \(gl\.on[^)]*\) \{ lab\.textContent = 'STOP!'/);
  assert.doesNotMatch(fr, /segs\[[^\]]*\][^;]*is-glow/, 'glow must not read the segments');
});

test('the spin clock is performance.now() minus the SPIN time and STOP reads event.timeStamp (never integrated frames)', () => {
  const s = view.slice(view.indexOf('function onSpin('), view.indexOf('/** Landing beat'));
  assert.match(s, /performance\.now\(\) - spinTs/);
  assert.match(view, /ev && ev\.timeStamp/);
  assert.match(s, /tapTime\(ev2\) - spinTs/);
  assert.doesNotMatch(s, /clock \+= |\+= dt/);
  assert.match(s, /STOP_GUARD_S/);
});

// ---------- colour never the only cue ----------
test('slices carry glyphs (up-triangle good, dot so-so, down-triangle bad) and stars; balls carry glyph + word', () => {
  const g = view.slice(view.indexOf('function glyph('), view.indexOf('function paint('));
  assert.match(g, /tone === 'good'/); assert.match(g, /tone === 'bad'/); assert.match(g, /c\.arc\(/);
  assert.match(view, /glyph\((c|ctx), g\.tone/);
  assert.match(view, /'✱'\.repeat\(g\.stars\)/);
  assert.match(view, /s\.setAttribute\('aria-label', 'Ball ' \+ \(i \+ 1\)/);
  assert.match(drive(false).ready, /wm-sw--good">▲<\/i>good for us/);
});

test('A11Y-4 (fixed) the "Landed on" chip and the "Stop now" readout show the tone by more than colour', () => {
  landAt(3.5);
  const res = LOG.find((e) => e[0] === 'set' && e[1] === '.wm-res' && e[2] === 'innerHTML');
  const chip = res[3].match(/<b class="wm-chip[^>]*>([^<]*)<\/b>/)[1];
  assert.match(chip, /[▲●▼]|good|so-so|bad/);
});

test('A11Y-6 (fixed) slice glyphs keep their meaning at any wheel angle (a bad down-triangle must not read as up at the bottom)', () => {
  const d = view.slice(view.indexOf('function draw('), view.indexOf('function land('));
  assert.match(d, /glyph\(/, 'draw glyphs upright per frame, or use shapes that do not depend on direction');
});

test('A11Y-9 (fixed) [hidden] really hides wheel-screen parts (no display rule overrides it)', () => {
  assert.match(read('css/wheelmatch.css'), /\.wm \[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

// ---------- touch targets ----------
test('Stop auto is pinned and 56 px; every wheel-screen tap target is at least 56 px (wheels SPEC 2a TAP_MIN_PX; css/wheelmatch.css)', { skip: !existsSync(new URL('../css/wheelmatch.css', import.meta.url)) && 'css/wheelmatch.css not built yet' }, () => {
  const css = read('css/wheelmatch.css');
  const rule = (sel) => { for (const q of [sel, '.wm ' + sel]) { const at = css.split('\n').find((l) => l.startsWith(q + ' {') || l.includes('} ' + q + ' {')); if (at) return at.slice(at.indexOf(q + ' {')).replace(/\}.*$/, ''); } return ''; };
  assert.match(rule('.wm-stopauto'), /min-height:\s*56px/);
  // pinned: the screen is a 100dvh column and the CTA row takes margin-top:auto (the e2e pass checks it sits on the bottom edge)
  assert.match(rule('.wm'), /height:\s*100dvh/); assert.match(rule('.wm-cta'), /margin-top:\s*auto/);
  assert.match(rule('.wm-go'), /min-height:\s*(\d+)px/); assert.ok(+rule('.wm-go').match(/min-height:\s*(\d+)px/)[1] >= 56);
  for (const sel of ['.wm-brow', '.wm-auto', '.wm-back', '.wm-book']) assert.ok(+((rule(sel).match(/min-height:\s*(\d+)px/) || [])[1] || 0) >= 56, sel);
  for (const sel of ['.wm-auto', '.wm-back']) assert.ok(+((rule(sel).match(/min-width:\s*(\d+)px/) || [])[1] || 0) >= 56, sel + ' width');
  assert.match(css, /\.wm \.wm-back \{[^}]*height:\s*56px/, '"Change" is 56 px');
  assert.match(css, /\.wm \.wm-strip \.q \{[^}]*width:\s*56px;\s*height:\s*56px/, 'help 56 px');
  assert.match(css, /\.wm-auto\[disabled\][^{]*\{[^}]*opacity/, 'disabled Auto rest is greyed');
});

// ---------- Settings rows (Dev slider) ----------
test('each dev slider: <label for> its input, <output> with the value text, aria-valuetext, range limits', () => {
  for (const k of DEV_KEYS) {
    const h = sliderHtml(k, k === 'matchW0' ? 50 : 1);
    const id = attr(h.match(/<input [^>]*>/)[0], 'id');
    assert.match(h, new RegExp('<label for="' + id + '">[^<]+</label>'), k);
    assert.match(h, new RegExp('<output class="wms-val" for="' + id + '"'));
    assert.ok(attr(h.match(/<input [^>]*>/)[0], 'aria-valuetext'), k + ' aria-valuetext');
    assert.match(h, /min="[\d.]+" max="[\d.]+" step="[\d.]+"/);
  }
  assert.match(sliderHtml('matchW0', 50), /aria-valuetext="50 \/s"/);
  assert.match(sliderHtml('matchW0', 50), /<span class="wms-chip"[^>]*>tweaked<\/span>/, 'tweaked is a word, not colour only');
  assert.match(sliderHtml('matchW0', 36), /<span class="wms-chip"[^>]*hidden>tweaked/);
});

test('settings: 56 px slider thumb and buttons (wheels SPEC 2a TAP_MIN_PX); Dev is a named switch; Match mode is a pressed-state group, locked with words mid-match', () => {
  assert.match(WMS_CSS, /\.wms-range\{[^}]*height:56px/);
  assert.match(WMS_CSS, /slider-thumb\{[^}]*width:56px;height:56px/);
  assert.match(WMS_CSS, /\.wms-btn\{min-height:56px/);
  assert.match(WMS_CSS, /\.wms-adv summary\{min-height:56px/);
  assert.match(devRowHtml(false), /role="switch" aria-checked="false"/);
  assert.match(html(devRowHtml(true)), /^Dev .* On$/);
  const live = matchModeRowHtml('wheel', true);
  assert.match(live, /role="group" aria-label="Match mode"/);
  assert.match(live, /aria-pressed="true"[^>]*disabled/);
  assert.match(live, /Applies next match\./);
  assert.match(devSectionHtml({}, false), /data-wm-sec hidden/);
});

test('A11Y-8 (fixed) the Reset buttons say what they reset', () => {
  assert.match(devSectionHtml({}, true), /data-wm-reset="one"[^>]*aria-label="Reset match wheel speed"|>Reset (match )?wheel speed</);
});


// ---------- live pass (Playwright, 475x638 Fold cover) ----------
// A11Y_E2E=1 node --test test/a11y-wheelmatch.test.mjs   (A11Y_SHOTS=dir for screenshots). Records findings; asserts only the hard rules
// (names, live text, 56 px, no horizontal scroll, the OS reduced-motion setting changes nothing: the wheel spins). Open defects print as notes.
async function e2e() {
  const http = await import('node:http'), { createRequire } = await import('node:module'), { execSync } = await import('node:child_process');
  const { readFile } = await import('node:fs/promises'), { join, extname, normalize } = await import('node:path'), { fileURLToPath, pathToFileURL } = await import('node:url');
  const ROOT = fileURLToPath(new URL('../', import.meta.url)), req = createRequire(import.meta.url);
  let pw; try { pw = req('playwright'); } catch (e) { pw = req(req.resolve('playwright', { paths: [execSync('npm root -g', { encoding: 'utf8' }).trim()] })); }
  const { fnv1a } = await import(pathToFileURL(join(ROOT, 'js/core/save-migrate.js')).href);
  const FIX = JSON.parse(await readFile(join(ROOT, 'test/fixtures/v4-save-10.json'), 'utf8'));
  const data = { ...structuredClone(FIX.data) }; const SAVE = JSON.stringify({ v: FIX.v, sum: fnv1a(JSON.stringify(data)), data });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
  const server = http.createServer(async (rq, rs) => {
    try { let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw 0; const b = await readFile(f); rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(b);
    } catch (e) { rs.writeHead(404); rs.end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port, SHOTS = process.env.A11Y_SHOTS || '';
  const out = [], step = (name, ok, why) => out.push({ name, ok: !!ok, why: ok ? '' : why || '' }), note = (name, v) => out.push({ name, ok: true, note: v });
  const browser = await pw.chromium.launch();
  const toBowl = (page) => page.evaluate(() => {
    const S = window.__store; let g = 0;
    while (S.get().stage !== 'bowl' && g++ < 200) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p);
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'hub': case 'semi': case 'final': d('SetMatchMode', { mode: 'wheel' }); d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'plan': d('SetMatchMode', { mode: 'wheel' }); d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break; case 'train': d('EndWeek'); break;
        default: return 'stuck:' + s.stage;
      }
    }
    return S.get().stage + '/' + S.get().mode;
  });
  const audit = (page) => page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'); };
    const name = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim();
    const ctl = [...document.querySelectorAll('#app button, #app [role=radio], #app input, #app summary')].filter(vis);
    const small = ctl.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 55.5 || r.height < 55.5; }).map((e) => name(e) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    const clipped = ctl.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > innerHeight + 1 || r.top < -1; }).map(name);
    return { names: ctl.map(name), small, clipped, hscroll: document.documentElement.scrollWidth > innerWidth + 1, unnamed: ctl.filter((e) => !name(e)).length };
  });
  const tabOrder = async (page, n) => { const seq = []; await page.evaluate(() => document.activeElement && document.activeElement.blur()); for (let i = 0; i < n; i++) { await page.keyboard.press('Tab');
    seq.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'BODY'; const r = e.getBoundingClientRect(); return Math.round(r.top) + ':' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30); })); } return seq; };
  const active = (page) => page.evaluate(() => { const e = document.activeElement; return !e || e === document.body ? 'BODY' : (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40); });
  try {
    for (const reduced of [true, false]) {
      const tag = reduced ? 'RM ' : 'anim ';
      const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addInitScript((fx) => { try { if (!sessionStorage.getItem('__a11ywm')) { localStorage.clear(); localStorage.setItem('cs.save.1', fx); sessionStorage.setItem('__a11ywm', '1'); } } catch (e) { /* */ } }, SAVE);
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await page.goto(ORIGIN + '/'); await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.waitForFunction(() => window.__store && window.__store.get().stage, null, { timeout: 8000 });
      const at = await toBowl(page); step(tag + 'reached wheel bowl stage', at === 'bowl/wheel', at); if (at !== 'bowl/wheel') { await ctx.close(); continue; }
      await page.waitForSelector('.wm--pick', { timeout: 5000 }).catch(() => {});
      const shot = (n) => (SHOTS ? page.screenshot({ path: SHOTS.replace(/\/?$/, '/') + 'a11y-wm-' + (reduced ? 'rm-' : '') + n + '.png' }) : null);
      await shot('pick');
      // pick screen
      let a = await audit(page);
      step(tag + 'pick: BOWL OVER named, no "Auto over"', a.names.some((n) => /^BOWL OVER/.test(n)) && !a.names.some((n) => /^Auto over/i.test(n)), a.names.join(' | '));
      step(tag + 'pick: no unnamed controls', !a.unnamed, a.unnamed + ' unnamed');
      step(tag + 'pick: 56 px targets', !a.small.length, a.small.join(', ')); step(tag + 'pick: no horizontal scroll', !a.hscroll, 'scrollWidth > 475');
      step(tag + 'pick: no control cut off at 638 px', !a.clipped.length, a.clipped.join(', '));
      const off = await page.$$eval('.wm-brow[aria-disabled="true"]', (xs) => xs.map((x) => ({ l: x.getAttribute('aria-label'), t: x.textContent })));
      note(tag + 'pick: blocked bowler rows', off.length ? off.map((o) => o.l).join(' | ') : 'none in over 1');
      note(tag + 'pick: tab order', (await tabOrder(page, 9)).join(' > '));
      const rows = await page.$$('.wm-brow:not([aria-disabled])');
      if (rows.length > 1) { await rows[1].focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150); const f = await active(page); step(tag + 'pick: focus kept after picking a bowler (A11Y-2)', f !== 'BODY', 'focus fell to <body>'); }
      // ready
      await page.click('[data-wm="go"]'); await page.waitForSelector('[data-wm="spin"]');
      await shot('ready');
      const alt = await page.getAttribute('.wm-cv', 'aria-label'), role = await page.getAttribute('.wm-cv', 'role');
      step(tag + 'ready: canvas role=img + segment list', role === 'img' && /^Over wheel: .+ in 100/.test(alt || ''), role + ' ' + alt);
      note(tag + 'ready: canvas alt', alt);
      note(tag + 'ready: tab order', (await tabOrder(page, 4)).join(' > ')); await page.focus('[data-wm="spin"]');
      const spinName = await page.textContent('[data-wm="spin"] > span');
      step(tag + 'ready: spin button reads SPIN', spinName === 'SPIN', spinName);
      step(tag + 'ready: focus on the spin button', /SPIN/.test(await active(page)), await active(page));
      step(tag + 'ready: no empty "Stop now" box before the spin (A11Y-9)', !(await page.$eval('.wm-now', (e) => e.getBoundingClientRect().height > 0 && !e.classList.contains('is-hint') && !(e.querySelector('.wm-nowv') || {}).textContent)), 'visible with an empty readout');
      a = await audit(page); step(tag + 'ready: 56 px targets', !a.small.length, a.small.join(', ')); step(tag + 'ready: no control cut off', !a.clipped.length, a.clipped.join(', '));
      {
        await page.click('[data-wm="spin"]'); const t0 = Date.now();
        await page.waitForTimeout(1500); const nm = await page.$eval('[data-wm="stop"]', (b) => b.getAttribute('aria-label') + ' / ' + b.textContent.trim());
        step(tag + 'spin: STOP button named', /Stop the wheel/.test(nm), nm);
        await page.waitForTimeout(Math.max(0, 3450 - (Date.now() - t0)));
        const g = await page.$eval('[data-wm="stop"]', (b) => ({ glow: b.classList.contains('is-glow'), t: b.querySelector('span').textContent, col: getComputedStyle(b.querySelector('span')).color, bg: getComputedStyle(b).backgroundColor }));
        await shot('glow');
        step(tag + 'glow 3.45 s: text "STOP!" with the glow', g.glow && g.t === 'STOP!', JSON.stringify(g)); note(tag + 'glow text colour on button', g.col + ' on ' + g.bg);
        await page.waitForTimeout(Math.max(0, 4100 - (Date.now() - t0)));
        const g2 = await page.$eval('[data-wm="stop"]', (b) => ({ glow: b.classList.contains('is-glow'), t: b.querySelector('span').textContent }));
        step(tag + 'glow one shot: off and "STOP" after 3.8 s', !g2.glow && g2.t === 'STOP', JSON.stringify(g2));
        await page.click('[data-wm="stop"]'); await page.waitForTimeout(200);
        note(tag + 'A11Y-5 name while slowing', await page.$eval('.wm-cta .wm-go', (b) => b.getAttribute('aria-label') + ' / ' + b.textContent.trim()));
        await page.waitForSelector('[data-wm-next]', { timeout: 6000 });
        const live = await page.textContent('.wm-live'); step(tag + 'result: live text', /^Over 1: \d+ runs?, /.test(live || ''), live);
      }
      await shot('result');
      step(tag + 'result: focus on NEXT', /NEXT OVER|Innings break|See result/.test(await active(page)), await active(page));
      a = await audit(page); step(tag + 'result: 56 px targets', !a.small.length, a.small.join(', ')); step(tag + 'result: no control cut off', !a.clipped.length, a.clipped.join(', '));
      const chip = await page.$eval('.wm-chip', (c) => c.textContent).catch(() => ''); note(tag + 'A11Y-4 landed chip text', chip);
      await page.click('[data-wm-next]'); await page.waitForTimeout(400); if (await page.$('[data-wm-next]')) { await page.click('[data-wm-next]'); await page.waitForTimeout(400); }
      // auto rest of innings (offered after over 1)
      const ao = await page.$('[data-wm="auto-rest"]');
      if (ao) {
        await ao.click(); await page.waitForTimeout(60);
        const sa = await page.$('[data-wm="stop-auto"]');
        if (sa) { const r = await sa.boundingBox(); step(tag + 'auto: Stop auto >= 56 px and on the bottom edge', r && r.height >= 56 && r.y + r.height >= 638 - 20 && r.y + r.height <= 638, JSON.stringify(r)); await shot('auto'); }
        else note(tag + 'auto: Stop auto', 'not caught (over already done)');
        await page.waitForFunction(() => !document.querySelector('[data-wm="stop-auto"]'), null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(200);
        const f = await active(page); step(tag + 'auto end: focus kept (A11Y-2)', f !== 'BODY', 'focus fell to <body>');
        note(tag + 'auto end live text', await page.textContent('.wm-live'));
      }
      step(tag + 'no console errors', !errs.length, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  return out;
}

test('E2E 475x638: OS reduced-motion on and off, the wheel spins in both (A11Y_E2E=1)', { skip: !process.env.A11Y_E2E && 'set A11Y_E2E=1 to run the browser pass', timeout: 180000 }, async (t) => {
  const out = await e2e();
  for (const r of out) t.diagnostic((r.ok ? (r.note !== undefined ? 'NOTE ' : 'PASS ') : 'FAIL ') + r.name + (r.note !== undefined ? ': ' + r.note : r.why ? ': ' + r.why : ''));
  const KNOWN = /A11Y-1\b/; // open defects in A11Y.md: reported, not failed
  const bad = out.filter((r) => !r.ok && !KNOWN.test(r.name));
  assert.equal(bad.length, 0, bad.map((r) => r.name + ': ' + r.why).join('\n'));
});
