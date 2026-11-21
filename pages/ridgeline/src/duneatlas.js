// Dune atlas (assets/dune-atlas.webp, 2048 px, straight alpha). Rects are TIGHT opaque bounds [x, y, w, h] in px, y from the TOP,
// measured from dune-atlas.json cells (alpha > 20, 1 px margin) so billboard sizes map to the art, not to the padded cells.
export const ATLAS_SIZE = 2048;
export const ATLAS_URL = new URL('../assets/dune-atlas.webp', import.meta.url).href;
export const CELLS = {"harpC": [1050, 14, 178, 330], "harpD": [1268, 14, 141, 330], "harpE": [1449, 14, 160, 330], "gateFrame": [621, 426, 332, 168], "flagA": [302, 648, 85, 234], "flagB": [465, 670, 98, 212], "reed1": [636, 734, 60, 145], "reed2": [731, 732, 70, 148], "reed3": [838, 659, 99, 221], "rockLump": [1110, 406, 203, 138], "rockTwo": [1360, 418, 188, 122], "rockSlab": [1595, 391, 159, 152], "rockWhale": [1098, 698, 231, 103], "rockPebbles": [1371, 710, 168, 95], "rockShard": [1607, 613, 142, 204], "harpA": [380, 1113, 134, 335], "harpB": [685, 1120, 129, 328], "arch": [285, 1533, 287, 162], "archBroken": [653, 1521, 245, 171]};
// fx quadrant cells ({x,y,w,h}, y from top) for dunefx.js
// cloud/puff rects: bbox of the largest alpha>20 blob per cell (3 px dilated labelling), so each samples only its own art (puff3 overlaps its neighbours, left as is; dust is off)
export const FX_CELLS = {"cloudA": {"x": 1110, "y": 1203, "w": 475, "h": 115}, "cloudB": {"x": 1463, "y": 1151, "w": 336, "h": 80}, "puff1": {"x": 1469, "y": 1325, "w": 308, "h": 157}, "puff2": {"x": 1187, "y": 1400, "w": 173, "h": 107}, "puff3": {"x": 1144, "y": 1544, "w": 332, "h": 192}, "puff4": {"x": 1454, "y": 1536, "w": 301, "h": 164}, "glints": [{"x": 1368, "y": 1140, "w": 52, "h": 52}, {"x": 1140, "y": 1344, "w": 56, "h": 52}, {"x": 1364, "y": 1360, "w": 56, "h": 52}, {"x": 1420, "y": 1308, "w": 44, "h": 48}, {"x": 1704, "y": 1236, "w": 48, "h": 44}, {"x": 1756, "y": 1256, "w": 56, "h": 56}, {"x": 1116, "y": 1484, "w": 56, "h": 56}, {"x": 1216, "y": 1504, "w": 44, "h": 44}, {"x": 1448, "y": 1508, "w": 44, "h": 44}, {"x": 1500, "y": 1484, "w": 44, "h": 48}, {"x": 1604, "y": 1484, "w": 44, "h": 48}, {"x": 1708, "y": 1508, "w": 76, "h": 80}, {"x": 1132, "y": 1532, "w": 48, "h": 48}, {"x": 1396, "y": 1528, "w": 64, "h": 64}, {"x": 1424, "y": 1628, "w": 44, "h": 48}, {"x": 1344, "y": 1720, "w": 48, "h": 48}, {"x": 1508, "y": 1700, "w": 60, "h": 56}]};
// gate art: post centres (px, relative to the tight gateFrame rect) and inner opening between the posts
export const GATE = { w: 332, h: 168, openW: 247 };

// Lazy atlas load: nothing is fetched until a dune view asks for it (loadAtlas()), so other themes never wait on it.
// Resolves to the Image, or to null on any failure or after 6 s (the renderer then keeps the code-built geometry).
let _p = null;
export let ATLAS_IMAGE = null;
export function loadAtlas() {
  if (_p) return _p;
  _p = (async () => {
    if (typeof Image === 'undefined') return null;
    let timer = 0;
    try {
      const img = new Image();
      img.decoding = 'async';
      const done = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('atlas load failed')); });
      img.src = ATLAS_URL;
      await Promise.race([done, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('atlas timeout')), 6000); })]);
      clearTimeout(timer);
      ATLAS_IMAGE = img;
      return img;
    } catch (e) { clearTimeout(timer); console.warn('dune atlas unavailable, using code geometry', e && e.message); return null; }
  })();
  return _p;
}
