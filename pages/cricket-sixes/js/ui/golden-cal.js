// Golden Over calibration: 10 taps on a steady beat; median error (ms) becomes the offset.
import { beat } from './golden-audio.js';

const TAPS = 10;
const LEAD = 800;   // ms from beat start to the scheduled hit (two ticks, then the hit)
const GAP = 350;    // ms rest between beats
const REJECT = 400; // |error| at or above this is a stray tap, not counted in the median

/** Median of errors in whole ms (upper median as the prototype). Empty -> 0. */
export function offsetOf(errs) {
  const a = (errs || []).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  return Math.round(a[Math.floor(a.length / 2)]);
}

const reduced = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
};

export function openCalibration(el, { onDone, onCancel } = {}) {
  const root = document.createElement('div');
  root.className = 'gocal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Calibrate timing');
  root.innerHTML =
    '<p class="gocal-title">Calibrate timing</p>' +
    '<p class="gocal-count" aria-live="polite"></p>' +
    '<div class="gocal-lane" aria-hidden="true"><div class="gocal-band"></div><div class="gocal-ball"></div></div>' +
    '<button type="button" class="gocal-pad">TAP</button>' +
    '<button type="button" class="gocal-cancel">Cancel</button>';
  const count = root.querySelector('.gocal-count');
  const ball = root.querySelector('.gocal-ball');
  const pad = root.querySelector('.gocal-pad');
  const cancel = root.querySelector('.gocal-cancel');
  el.appendChild(root);

  const errs = [];
  let n = 0, hitT = 0, startT = 0, tapped = false, closed = false, timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const close = () => { closed = true; timers.forEach(clearTimeout); timers = []; root.remove(); };

  function ballRun() {
    if (closed) return;
    const now = performance.now();
    startT = now; hitT = now + LEAD; tapped = false;
    count.textContent = `Tap on the beat. ${n + 1} of ${TAPS}`;
    later(() => beat.tick('pre'), 0);
    later(() => beat.tick('pre'), 400);
    later(() => beat.tick('cross'), hitT - performance.now());
    ball.style.transition = 'none';
    ball.style.left = '0%';
    void ball.offsetWidth;
    ball.style.transition = `left ${LEAD}ms linear`;
    ball.style.left = '100%';
  }

  function finish() {
    const off = offsetOf(errs);
    const used = errs.length;
    close();
    if (onDone) onDone(off, used);
  }

  pad.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    beat.prime();
    if (closed || tapped || !hitT) return;
    const t = ev.timeStamp > 0 && Math.abs(ev.timeStamp - performance.now()) < 1000 ? ev.timeStamp : performance.now();
    if (t < startT - 200) return;
    tapped = true;
    const e = t - hitT;
    if (Math.abs(e) < REJECT) errs.push(e);
    n++;
    if (!reduced()) { pad.classList.add('gocal-flash'); later(() => pad.classList.remove('gocal-flash'), 80); }
    if (n >= TAPS) finish(); else later(ballRun, GAP);
  });
  pad.addEventListener('click', (ev) => ev.preventDefault());
  cancel.addEventListener('click', () => { close(); if (onCancel) onCancel(); });

  beat.prime();
  count.textContent = `Tap the pad on the beat. 1 of ${TAPS}`;
  later(ballRun, 600);
  return { close };
}
