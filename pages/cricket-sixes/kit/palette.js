/* Palette: MUTED set picked by M 2026-11-12 (first bright set kept in LOOK-CARD.md history). Never hardcode a hex anywhere else:
   use PAL.name in canvas code or var(--name) in CSS. Numbers: 1 lit, 2 shade, 3 deep.
   Skin and hair numbers are different people, not shading. shadow is drawn at 35% alpha only. */
window.PAL = {
  grass1:'#7EB261', grass2:'#629753', grass3:'#407349',
  pitch1:'#D5C79D', pitch2:'#B09C70', dirt:'#8B6C50',
  sky1:'#74B0D2', sky2:'#C2DFEF',
  wood:'#755940', stone1:'#C9CDD2', stone2:'#8E949E',
  roof1:'#C98A5A', roof2:'#915C3D', wall1:'#E3D8B9', wall2:'#BAA787',
  water:'#5596BF', outline:'#2A2238', shadow:'#242B37',
  white:'#FFFFFF', cream:'#F3EBD3',
  skin1:'#EBD0B5', skin2:'#BD9775', skin3:'#765846',
  hair1:'#2D2622', hair2:'#966846',
  kitA1:'#4E6DB9', kitA2:'#334577', kitB1:'#C3614E', kitB2:'#7E3E3A',
  gold:'#D2B357', accent:'#22625D', danger:'#BD5260'
};
/* Toned-down variants for review: add ?pal=soft | muted | dusty to any page URL (now applied on top of the Muted base).
   Each one only lowers saturation (and for dusty, leans 10% toward a warm beige). Names never change. */
(function () {
  if (typeof location === 'undefined') return;
  var m = /[?&]pal=(\w+)/.exec(location.search); if (!m) return;
  var V = { soft: { s: 0.78, l: 1, mix: 0 }, muted: { s: 0.58, l: 0.97, mix: 0 }, dusty: { s: 0.62, l: 1, mix: 0.10 } }[m[1]];
  if (!V) return;
  var warm = [216, 200, 168];
  function conv(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    s *= V.s; l *= V.l;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var out = [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (c, i) {
      var v = Math.round((c * 255) * (1 - V.mix) + warm[i] * V.mix); return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); });
    return '#' + out.join('').toUpperCase();
  }
  Object.keys(window.PAL).forEach(function (k) { if (k !== 'white' && k !== 'outline') window.PAL[k] = conv(window.PAL[k]); });
})();
/* Publish the palette as CSS variables (--grass1 ...) so ui.css follows one palette edit.
   ui.css carries the same values as fallbacks, so it also works if loaded before or without this script. */
(function () {
  if (typeof document === 'undefined') return;
  var st = document.documentElement.style;
  Object.keys(window.PAL).forEach(function (k) { st.setProperty('--' + k, window.PAL[k]); });
})();
