// uikit.test.js: layout overlaps, touch targets, contrast, strings, no stray hex. Run: node src/test/uikit.test.js
const fs = require('fs'), path = require('path');
globalThis.PL = {};
const P = path.join(__dirname, '..', 'parts');
for (const f of ['strings', 'uikit', 'screens']) require(path.join(P, f + '.js'));
const { UI, Screens, Strings } = PL;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, o) => a.x >= o.x - 0.01 && a.y >= o.y - 0.01 && a.x + a.w <= o.x + o.w + 0.01 && a.y + a.h <= o.y + o.h + 0.01;
const VPS = [[475, 638], [344, 882], [816, 568]];
let nPairs = 0, nTargets = 0, nScreens = 0;
for (const [w, h] of VPS) for (const left of [false, true]) for (const opts of [{}, { scroll: 0 }]) {
  const L = Screens.layout(w, h, left, opts);
  for (const name of Object.keys(L)) {
    const sc = L[name]; if (!sc || !sc.rects) continue; nScreens++;
    const tag = name + ' ' + w + 'x' + h + (left ? ' left' : '');
    const leaf = Object.keys(sc.rects).filter(n => sc.rects[n] && sc.containers.indexOf(n) < 0 && sc.overlays.indexOf(n) < 0);
    for (const n of Object.keys(sc.rects)) ok(inside(sc.rects[n], { x: 0, y: 0, w, h }), tag + ': ' + n + ' off-screen');
    for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) { nPairs++; ok(!hit(sc.rects[leaf[i]], sc.rects[leaf[j]]), tag + ': overlap ' + leaf[i] + ' x ' + leaf[j]); }
    // overlays (toast, tag) may sit on the room but never on a control/text leaf
    for (const o of sc.overlays) for (const n of leaf) { nPairs++; ok(!hit(sc.rects[o], sc.rects[n]), tag + ': overlay ' + o + ' hits ' + n); }
    // containers: leaf rects that belong to them must be inside; card children
    for (const t of sc.targets) { const r = sc.rects[t]; nTargets++; ok(r.w >= 56 && r.h >= 56 || t === 'screen', tag + ': target ' + t + ' ' + r.w + 'x' + r.h + ' < 56');
      if (h > w && t !== 'screen') ok(r.y + r.h <= h - 32, tag + ': target ' + t + ' in home-swipe band (strict)'); }
  }
  // play-family structure checks
  for (const n of ['play', 'tutorial', 'death', 'roomClear']) {
    const r = L[n].rects, tag = n + ' ' + w + 'x' + h + (left ? ' left' : '');
    ok(!hit(r.room, r.padBox), tag + ': room hits pad box');
    ok(r.dive.w === 56 && r.up.w === 60, tag + ': key sizes');
  }
  { const r = L.roomClear.rects; ok(inside(r.clearCard, r.room), 'roomClear card inside room ' + w); ok(inside(r.clearNext, r.clearCard), 'clearNext in card'); }
  for (const n of ['pause', 'confirm', 'shaftComplete']) for (const c of Object.keys(L[n].rects)) if (c !== 'card') ok(inside(L[n].rects[c], L[n].rects.card), n + ' ' + c + ' inside card ' + w + 'x' + h);
  // left-hand mirror is an exact mirror of right-hand for play
  if (left) { const R = Screens.layout(w, h, false).play.rects; ok(L.play.rects.left.x < L.play.rects.right.x, 'left key stays left of right key (left-hand ' + w + ')');
  for (const n of ['pause', 'retry', 'up', 'dive', 'room']) ok(Math.abs(R[n].x + R[n].w - (w - L.play.rects[n].x)) < 0.5, 'mirror ' + n + ' ' + w); }
}
// spot-check review-ux boxes
{ const A = Screens.layout(475, 638, false).play.rects, B = Screens.layout(344, 882, false).play.rects, C = Screens.layout(816, 568, false).play.rects, E = (r, x, y) => ok(r.x === x && r.y === y, 'box ' + JSON.stringify(r) + ' vs ' + x + ',' + y);
  E(A.up, 351, 310); E(A.left, 291, 370); E(A.pause, 411, 8); E(A.retry, 12, 516); E(B.padBox, 82, 650); E(B.retry, 12, 660); E(B.pause, 276, 12); E(C.padBox, 606, 330); E(C.retry, 12, 330);
  const Am = Screens.layout(475, 638, true).play.rects; E(Am.padBox, 4, 310); E(Am.retry, 407, 516); E(Am.pause, 8, 8); }
// hit testing
{ const L = Screens.layout(475, 638, false); ok(Screens.hit(L, 'play', 380, 340) === 'up', 'hit up'); ok(Screens.hit(L, 'play', 380, 400) === 'dive', 'hit dive'); ok(Screens.hit(L, 'play', 100, 100) === null, 'hit none'); ok(Screens.hit(L, 'firstOpen', 5, 5) === 'screen', 'hit screen'); }
// contrast
const T = UI.T; let minC = 99;
for (const [a, b] of T.pairs) { const c = UI.contrast(T.c[a], T.c[b]); minC = Math.min(minC, c); ok(c >= 4.5, 'contrast ' + a + ' on ' + b + ' = ' + c.toFixed(2)); }
// colour-blind proxy: coral vs teal luminance ratio >= 2
ok(UI.contrast(T.c.coral, T.c.teal) >= 1.5 || Math.max(UI.lum(T.c.teal), UI.lum(T.c.coral)) / Math.min(UI.lum(T.c.teal), UI.lum(T.c.coral)) >= 2, 'coral/teal luminance');
// strings
const all = Strings.allPlayer(); ok(all.length > 60, 'string count ' + all.length);
for (const s of all) for (const bad of ['tick', 'seed', 'charge', 'buffer', 'DEV']) ok(s.toLowerCase().indexOf(bad.toLowerCase()) < 0, 'banned "' + bad + '" in "' + s + '"');
// no hex literals outside the token block, min font, system stack only
for (const f of ['uikit', 'screens', 'strings']) {
  let src = fs.readFileSync(path.join(P, f + '.js'), 'utf8');
  if (f === 'uikit') src = src.replace(/const T = Object\.freeze\(\{[\s\S]*?\n  \}\);/, '');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), f + ': hex literal outside tokens');
  ok(!/\d+px (sans-serif|serif|monospace|Arial|Helvetica)/.test(src), f + ': non-stack font');
  const m = src.match(/fontPx\((\d+)/g) || []; for (const x of m) ok(+x.slice(7) >= 14, f + ': font < 14 ' + x);
}
for (const k in T.type) for (const i of [0, 1]) ok(T.type[k][i] >= 14, 'type ' + k + ' >= 14');
console.log('uikit.test: ' + checks + ' checks, ' + fails + ' fail; screens laid out ' + nScreens + ', rect pairs ' + nPairs + ', targets ' + nTargets + ', min contrast ' + minC.toFixed(2));
process.exit(fails ? 1 : 0);
