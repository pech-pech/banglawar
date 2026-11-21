// Dune atlas (assets/dune-atlas.webp, 2048 px, straight alpha). Rects are TIGHT opaque bounds [x, y, w, h] in px, y from the TOP,
// measured from dune-atlas.json cells (alpha > 20, 1 px margin) so billboard sizes map to the art, not to the padded cells.
export const ATLAS_SIZE = 2048;
export const ATLAS_URL = new URL('../assets/dune-atlas.webp', import.meta.url).href;
export const CELLS = {"harpC": [1050, 14, 178, 330], "harpD": [1268, 14, 141, 330], "harpE": [1449, 14, 160, 330], "gateFrame": [621, 426, 332, 168], "flagA": [302, 648, 85, 234], "flagB": [465, 670, 98, 212], "reed1": [636, 734, 60, 145], "reed2": [731, 732, 70, 148], "reed3": [838, 659, 99, 221], "rockLump": [1110, 406, 203, 138], "rockTwo": [1360, 418, 188, 122], "rockSlab": [1595, 391, 159, 152], "rockWhale": [1098, 698, 231, 103], "rockPebbles": [1371, 710, 168, 95], "rockShard": [1607, 613, 142, 204], "harpA": [380, 1113, 134, 335], "harpB": [685, 1120, 129, 328], "arch": [285, 1533, 287, 162], "archBroken": [653, 1521, 245, 171]};
// fx quadrant cells ({x,y,w,h}, y from top) for dunefx.js
export const FX_CELLS = {"cloudA": {"x": 1088, "y": 1184, "w": 520, "h": 132}, "cloudB": {"x": 1444, "y": 1132, "w": 376, "h": 108}, "puff1": {"x": 1460, "y": 1316, "w": 320, "h": 176}, "puff2": {"x": 1180, "y": 1384, "w": 272, "h": 148}, "puff3": {"x": 1144, "y": 1544, "w": 332, "h": 192}, "puff4": {"x": 1452, "y": 1528, "w": 264, "h": 164}, "glints": [{"x": 1368, "y": 1140, "w": 52, "h": 52}, {"x": 1140, "y": 1344, "w": 56, "h": 52}, {"x": 1364, "y": 1360, "w": 56, "h": 52}, {"x": 1420, "y": 1308, "w": 44, "h": 48}, {"x": 1704, "y": 1236, "w": 48, "h": 44}, {"x": 1756, "y": 1256, "w": 56, "h": 56}, {"x": 1116, "y": 1484, "w": 56, "h": 56}, {"x": 1216, "y": 1504, "w": 44, "h": 44}, {"x": 1448, "y": 1508, "w": 44, "h": 44}, {"x": 1500, "y": 1484, "w": 44, "h": 48}, {"x": 1604, "y": 1484, "w": 44, "h": 48}, {"x": 1708, "y": 1508, "w": 76, "h": 80}, {"x": 1132, "y": 1532, "w": 48, "h": 48}, {"x": 1396, "y": 1528, "w": 64, "h": 64}, {"x": 1424, "y": 1628, "w": 44, "h": 48}, {"x": 1344, "y": 1720, "w": 48, "h": 48}, {"x": 1508, "y": 1700, "w": 60, "h": 56}]};
// gate art: post centres (px, relative to the tight gateFrame rect) and inner opening between the posts
export const GATE = { w: 332, h: 168, openW: 247 };

// Load the texture before any view is built (top-level await keeps ?still=1 and theme switches simple).
// Resolves to null on any failure or after 6 s, and the renderer then keeps the code-built geometry.
async function load() {
  if (typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.decoding = 'async';
    const done = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('atlas load failed')); });
    img.src = ATLAS_URL;
    await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('atlas timeout')), 6000))]);
    return img;
  } catch (e) { console.warn('dune atlas unavailable, using code geometry', e && e.message); return null; }
}
export const ATLAS_IMAGE = await load();
