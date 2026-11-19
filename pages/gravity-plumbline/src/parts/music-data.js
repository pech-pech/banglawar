// music-data.js - PL.musicData: public-domain pieces as compact note strings (own simple arrangements).
// Token: NOTE[+NOTE]:BEATS  (r = rest). Beat unit is per piece (see u). conf = transcription confidence 0..1 (see audio/PROVENANCE.md).
(function (G) {
  'use strict';
  var PL = G.PL = G.PL || {};
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(n); if (!m) return -1;
    return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // parse -> [[startBeat, durBeats, midi], ...] (one row per chord tone)
  function parse(str, shift) {
    var out = [], t = 0, tk = String(str).trim().split(/\s+/), i, j, p, d, ns;
    for (i = 0; i < tk.length; i++) {
      if (!tk[i]) continue;
      p = tk[i].split(':'); d = +p[1];
      if (p[0] !== 'r') { ns = p[0].split('+'); for (j = 0; j < ns.length; j++) out.push([t, d, midi(ns[j]) + (shift || 0)]); }
      t += d;
    }
    return out;
  }
  function len(str) { var s = 0, tk = String(str).trim().split(/\s+/); for (var i = 0; i < tk.length; i++) s += +tk[i].split(':')[1] || 0; return s; }
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' '); }

  // Ode to Joy (Beethoven 1824), D major, 4/4, beat = quarter, 8 bars
  var ODE_A = 'F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 ';
  var ODE_M = ODE_A + 'F#4:1.5 E4:0.5 E4:2 ' + ODE_A + 'E4:1.5 D4:0.5 D4:2';
  var ODE_B = 'D3:4 D3:2 A2:2 D3:4 A2:4 D3:4 D3:2 A2:2 D3:4 A2:2 D3:2';
  // Twinkle (Mozart K.265 theme), C major, 4/4, beat = quarter, 6 lines x 2 bars
  var T1 = 'C5:1 C5:1 G5:1 G5:1 A5:1 A5:1 G5:2 ', T2 = 'F5:1 F5:1 E5:1 E5:1 D5:1 D5:1 C5:2 ', T3 = 'G5:1 G5:1 F5:1 F5:1 E5:1 E5:1 D5:2 ';
  var TW_B1 = 'C3:4 F3:2 C3:2 ', TW_B2 = 'F3:2 C3:2 G2:2 C3:2 ', TW_B3 = 'C3:4 C3:2 G2:2 ';
  // Mountain King phrase (B minor), beat = quarter
  function mk(a, b, c, d, e, f, g) { return a + ':0.5 ' + b + ':0.5 ' + c + ':0.5 ' + d + ':0.5 ' + e + ':0.5 ' + f + ':0.5 ' + g + ':1 '; }
  var MK_B = mk('B3', 'C#4', 'D4', 'E4', 'F#4', 'D4', 'F#4');

  var pieces = {
    canon: { name: 'Canon in D (Pachelbel, c.1690)', key: 'D major', bar: 4, u: 'quarter', bpm: 66, loop: 0, conf: 0.9,
      tracks: [
        { v: 'celesta', g: 0.55, s: rep('F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2', 2) },
        { v: 'pad', g: 0.4, s: rep('D4+F#4+A4:2 C#4+E4+A4:2 D4+F#4+B4:2 C#4+F#4+A4:2 B3+D4+G4:2 D4+F#4+A4:2 B3+D4+G4:2 C#4+E4+A4:2', 2) },
        { v: 'pizz', g: 0.45, s: rep('D3:2 A2:2 B2:2 F#2:2 G2:2 D3:2 G2:2 A2:2', 2) }] },
    gymno: { name: 'Gymnopedie No.1 (Satie, 1888)', key: 'D major (G / D maj7)', bar: 3, u: 'quarter', bpm: 70, loop: 0, conf: 0.7,
      tracks: [
        { v: 'musicbox', g: 0.6, s: 'r:12 r:1 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 F#4:12' },
        { v: 'pizz', g: 0.5, s: rep('G2:1 r:2 D2:1 r:2', 6) },
        { v: 'pad', g: 0.35, s: rep('r:1 B3+D4+F#4:2 r:1 A3+C#4+F#4:2', 6) }] },
    morning: { name: 'Morning Mood, Peer Gynt (Grieg, 1875)', key: 'E major', bar: 6, u: 'eighth', bpm: 168, loop: 0, conf: 0.8,
      tracks: [
        { v: 'musicbox', g: 0.6, s: rep('B4:1 G#4:1 F#4:1 E4:1 F#4:1 G#4:1 B4:1 G#4:1 F#4:1 E4:1 F#4:1 G#4:1 B4:1 G#4:1 B4:1 C#5:1 G#4:1 C#5:1 B4:1 G#4:1 F#4:1 E4:3', 2) },
        { v: 'pad', g: 0.35, s: rep('E3+B3+G#4:12 E3+B3+G#4:6 C#4+E4+G#4:6', 2) }] },
    mountain: { name: 'In the Hall of the Mountain King (Grieg, 1875)', key: 'B minor', bar: 4, u: 'quarter', tempo: [[0, 100], [32, 150]], loop: 0, conf: 0.9,
      tracks: [
        { v: 'pizz', g: 0.55, s: rep(MK_B, 8) },
        { v: 'celesta', g: 0.3, o: 12, s: rep(MK_B, 8) },
        { v: 'pizz', g: 0.4, o: -12, s: rep('B3:1 F#3:1 B3:1 F#3:1', 8) }] },
    ode: { name: 'Ode to Joy (Beethoven, 1824)', key: 'D major', bar: 4, u: 'quarter', bpm: 108, loop: 0, conf: 0.97,
      tracks: [{ v: 'celesta', g: 0.6, s: ODE_M }, { v: 'pad', g: 0.35, s: ODE_B }] },
    twinkle: { name: 'Ah vous dirai-je, Maman (Mozart K.265 theme, c.1781)', key: 'C major', bar: 4, u: 'quarter', bpm: 100, loop: 0, conf: 0.97,
      tracks: [{ v: 'celesta', g: 0.6, s: T1 + T2 + T3 + T3 + T1 + T2 }, { v: 'pad', g: 0.3, s: TW_B1 + TW_B2 + TW_B3 + TW_B3 + TW_B1 + TW_B2 }] },
    elise: { name: 'Fur Elise (Beethoven, 1810) - optional alternate for tier 2', key: 'A minor', bar: 6, u: 'sixteenth', bpm: 350, loop: 0, conf: 0.9,
      tracks: [
        { v: 'musicbox', g: 0.6, s: 'r:4 E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1 E4:1 G#4:1 B4:1 C5:2 r:1 E4:1 E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1 E4:1 C5:1 B4:1 A4:2 r:4' },
        { v: 'pizz', g: 0.45, s: 'r:12 A2:1 E3:1 A3:1 r:3 E2:1 E3:1 G#3:1 r:3 A2:1 E3:1 A3:1 r:3 r:6 A2:1 E3:1 A3:1 r:3 E2:1 E3:1 G#3:1 r:3 A2:1 r:5' }] }
  };
  // stings: one-shots built from a piece: segs = [startBeat,endBeat] pairs played in order; tempo override
  var stings = {
    clear:    { ref: 'ode', segs: [[0, 4]], tempo: [[0, 120]], tr: [0], duck: 1, sparkle: 0 },
    complete: { ref: 'ode', segs: [[0, 32]], tempo: [[0, 200], [28, 190], [31, 120], [32, 90]], stopBgm: 1 },
    bronze:   { ref: 'twinkle', segs: [[8, 16]], tempo: [[0, 192]], tr: [0], duck: 1 },
    silver:   { ref: 'twinkle', segs: [[0, 16]], tempo: [[0, 192]], tr: [0], duck: 1 },
    gold:     { ref: 'twinkle', segs: [[16, 24], [0, 16]], tempo: [[0, 216]], tr: [0], duck: 1 },
    plumb:    { ref: 'twinkle', segs: [[16, 24], [0, 16]], tempo: [[0, 216]], tr: [0], duck: 1, sparkle: 1 }
  };
  var moments = { menu: 'canon', settings: 'canon', tutorial: 'gymno', tier1: 'morning', tier2: 'elise', tier3: 'mountain' };
  PL.musicData = { pieces: pieces, stings: stings, moments: moments, parse: parse, len: len, midi: midi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
