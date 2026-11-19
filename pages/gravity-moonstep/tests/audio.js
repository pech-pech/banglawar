'use strict';
// MoonAudio offline-render check. Run: node tests/audio.js
// Renders every cue in headless Chromium via OfflineAudioContext and asserts -18 <= peak dBFS <= -1.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'audio.js'), 'utf8');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('FAIL playwright not available: ' + e.message); process.exit(1); }

const CUES = [
  ['jump', 'A.jump()'], ['land soft', 'A.land(30)'], ['land mid', 'A.land(200)'], ['land hard', 'A.land(400)'],
  ['chain 1', 'A.chain(1)'], ['chain 6', 'A.chain(6)'], ['chain 12', 'A.chain(12)'],
  ['over', 'A.over()'], ['medal bronze', "A.medal('bronze')"], ['medal silver', "A.medal('silver')"],
  ['medal gold', "A.medal('gold')"], ['medal moon', "A.medal('moon')"],
  ['near', 'A.near()'], ['bounce', 'A.bounce()'], ['crumble', 'A.crumble()'], ['tick', 'A.tick()'],
  ['charge', 'A.charge(1)'], ['tide 0.3', 'A.tideLevel(0.3)'], ['tide 1', 'A.tideLevel(1)']
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const res = await page.evaluate(async ({ src, cues }) => {
    const out = [];
    for (const [name, call] of cues) {
      const SR = 44100, LEN = SR * 4;
      let off;
      // Offline context that reports 'running' so cues are not dropped; currentTime is 0 until rendered.
      window.AudioContext = class extends OfflineAudioContext {
        constructor() { super(1, LEN, SR); off = this; }
        get state() { return 'running'; }
        resume() { return Promise.resolve(); }
      };
      const mod = { exports: {} };
      new Function('module', 'window', src)(mod, window);
      const A = mod.exports;
      A.init(); A.setEnabled(true);
      new Function('A', call)(A);
      const buf = await off.startRendering();
      const d = buf.getChannelData(0); let pk = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; }
      out.push([name, pk > 0 ? 20 * Math.log10(pk) : -Infinity]);
    }
    return out;
  }, { src: SRC, cues: CUES });
  await browser.close();
  let fails = 0;
  for (const [n, db] of res) {
    const good = db >= -18 && db <= -1;
    if (!good) fails++;
    console.log((good ? 'PASS ' : 'FAIL ') + n + ' peak ' + db.toFixed(1) + ' dBFS');
  }
  console.log(fails ? fails + ' FAILED' : 'all ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
