/* SPR: code-drawn pixel sprites. Needs palette.js and iso.js first.
   People: (x, y) = bottom-centre of the feet in internal px. Buildings: (gx, gy) = back grid corner of the footprint. */
(function () {
  var PAL = window.PAL, ISO = window.ISO, OUT = PAL.outline;

  function hex2rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b), o = [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * t); });
    return '#' + o.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  var px = ISO.px;
  function shadow(ctx, x, y, w) {
    w = w || 10; ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = PAL.shadow;
    ctx.fillRect(x - (w >> 1), y - 1, w, 2); ctx.fillRect(x - (w >> 1) + 1, y + 1, w - 2, 1); ctx.restore();
  }
  function rng(seed) { var s = (seed || 1) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------- people ---------- */
  function person(ctx, x, y, o) {
    var f = o.facing === 'l', ox = Math.round(x) - 6, oy = Math.round(y) - 18, pose = o.pose || 'idle', fr = o.frame || 0;
    var s1 = o.shirt1, s2 = o.shirt2, pn1 = o.pants1 || PAL.white, pn2 = o.pants2 || PAL.stone1;
    var sk1 = PAL['skin' + (o.skin || 1)], sk2 = ({ '#FFD7AE': PAL.skin2, '#D99A62': PAL.skin3 })[sk1.toUpperCase()] || PAL.hair1;
    var hair = o.hair === 2 ? PAL.hair2 : PAL.hair1, dy = 0;
    function P(lx, ly, w, h, c) { px(ctx, ox + (f ? 12 - lx - w : lx), oy + ly, w, h, c); }
    function B(lx, ly, w, h, c) { P(lx - 1, ly - 1, w + 2, h + 2, OUT); P(lx, ly, w, h, c); }
    if (o.shadow !== false) shadow(ctx, Math.round(x), Math.round(y), 10);
    if (pose === 'field') dy = 2;
    // legs
    var L1 = { x: 3, y: 13, h: 4 }, L2 = { x: 7, y: 13, h: 4 };
    if (pose === 'run') { if (fr) { L1.x = 2; L1.h = 3; L2.x = 8; } else { L1.x = 4; L2.x = 6; L2.h = 3; L2.y = 12; } }
    if (pose === 'bat') { L1.x = 2; L2.x = 8; }
    if (pose === 'bowl') { L1.x = 2; L2.x = 8; L2.h = 3; }
    if (pose === 'field') { L1.x = 2; L2.x = 8; L1.y = L2.y = 15; L1.h = L2.h = 2; }
    [L1, L2].forEach(function (L) { B(L.x, L.y, 2, L.h, pn1); P(L.x + 1, L.y, 1, L.h - 1, pn2); P(L.x, L.y + L.h - 1, 2, 1, OUT); });
    // far arm (behind torso)
    var up = pose === 'cheer', ra = pose === 'bowl' || pose === 'signal';
    if (up) { B(1, 3, 1, 6, s1); P(1, 3, 1, 2, sk1); }
    else if (pose === 'run') { B(1, 9 + (fr ? -1 : 1), 1, 3, s1); P(1, 11 + (fr ? -1 : 1), 1, 1, sk1); }
    else { B(1, 9 + dy, 1, 3, s1); P(1, 12 + dy, 1, 1, sk1); }
    // torso
    B(3, 8 + dy, 6, 5, s1); P(8, 8 + dy, 1, 5, s2); P(3, 12 + dy, 6, 1, s2); P(5, 8 + dy, 2, 1, sk1);
    if (o.stripe) P(3, 10 + dy, 6, 1, o.stripe);
    // near arm + props
    if (up) { B(10, 3, 1, 6, s1); P(10, 3, 1, 2, sk1); }
    else if (ra) { B(10, 2, 1, 7, s1); P(10, 2, 1, 2, sk1); if (pose === 'bowl') { B(10, 0, 2, 2, PAL.danger); P(10, 0, 1, 1, PAL.white); } }
    else if (pose === 'bat') {
      B(10, 4, 2, 6, PAL.wood); P(10, 4, 1, 5, PAL.pitch1); P(10, 9, 2, 1, sk1); P(1, 9, 1, 1, sk1);
    }
    else if (pose === 'field') { B(10, 12, 1, 2, s1); P(10, 14, 2, 1, sk1); }
    else if (pose === 'run') { B(10, 9 + (fr ? 1 : -1), 1, 3, s1); P(10, 11 + (fr ? 1 : -1), 1, 1, sk1); }
    else { B(10, 9 + dy, 1, 3, s1); P(10, 12 + dy, 1, 1, sk1); }
    if (o.clip) { B(10, 10, 2, 4, PAL.cream); P(10, 11, 2, 1, OUT); P(10, 13, 2, 1, OUT); }
    // head
    B(3, 1 + dy, 6, 6, sk1); P(8, 1 + dy, 1, 6, sk2); P(3, 6 + dy, 6, 1, sk2);
    P(5, 4 + dy, 1, 1, OUT); P(7, 4 + dy, 1, 1, OUT);
    // hair + hat
    var hat = o.hat || 'none';
    if (hat === 'helmet') {
      B(3, 1 + dy, 6, 3, s2); P(3, 1 + dy, 3, 1, s1); P(8, 4 + dy, 1, 2, OUT); P(9, 4 + dy, 2, 1, OUT);
    } else if (hat === 'cap') {
      var hc = o.hatCol || s1; B(3, 1 + dy, 6, 2, hc); P(3, 1 + dy, 3, 1, PAL.white); B(8, 3 + dy, 3, 1, hc === s1 ? s2 : OUT);
    } else { P(3, 1 + dy, 6, 1, hair); P(3, 2 + dy, 1, 2, hair); if (o.hair === 2) P(8, 2 + dy, 1, 1, hair); }
    if (hat !== 'none') P(3, 3 + dy, 1, 1, hair);
  }
  function kitOf(k) { return k === 'B' ? [PAL.kitB1, PAL.kitB2] : [PAL.kitA1, PAL.kitA2]; }
  function player(ctx, x, y, o) {
    o = o || {}; var k = kitOf(o.kit);
    person(ctx, x, y, { shirt1: k[0], shirt2: k[1], pose: o.pose, hat: o.hat, hatCol: o.hatCol, facing: o.facing, frame: o.frame,
      skin: o.skin, hair: o.hair, shadow: o.shadow, stripe: o.stripe });
  }
  function coach(ctx, x, y, o) {
    o = o || {}; person(ctx, x, y, { shirt1: PAL.accent, shirt2: OUT, pants1: PAL.stone1, pants2: PAL.stone2,
      hat: 'cap', hatCol: PAL.accent, pose: 'idle', facing: o.facing, skin: o.skin || 2, clip: true, hair: 2 });
  }
  function umpire(ctx, x, y, o) {
    o = o || {}; person(ctx, x, y, { shirt1: PAL.white, shirt2: PAL.stone1, pants1: PAL.outline, pants2: PAL.outline, hat: 'cap', hatCol: PAL.white,
      pose: o.signal ? 'signal' : 'idle', facing: o.facing, skin: o.skin || 3, stripe: PAL.stone2 });
  }
  /* a row of n spectators, 4 px each. seed picks colours; t (ms) makes some cheer */
  function crowdRow(ctx, x, y, n, seed, t) {
    var r = rng(seed), cols = [PAL.kitA1, PAL.kitB1, PAL.gold, PAL.white, PAL.accent, PAL.danger, PAL.kitA2, PAL.stone1];
    for (var i = 0; i < n; i++) {
      var c = cols[Math.floor(r() * cols.length)], sk = PAL['skin' + (1 + Math.floor(r() * 3))], hr = r() < 0.5 ? PAL.hair1 : PAL.hair2;
      var cheer = t !== undefined && r() < 0.3 && (Math.floor(t / 300) + i) % 2 === 0, bx = x + i * 4;
      px(ctx, bx, y - 3, 4, 3, c); px(ctx, bx + 1, y - 5, 2, 2, sk); px(ctx, bx + 1, y - 6, 2, 1, hr);
      px(ctx, bx, y, 4, 1, OUT);
      if (cheer) { px(ctx, bx, y - 5, 1, 2, sk); px(ctx, bx + 3, y - 5, 1, 2, sk); }
    }
    return n * 4;
  }
  function stumps(ctx, x, y, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y); shadow(ctx, x, y, 9);
    [-2, 0, 2].forEach(function (d) { px(ctx, x + d - 1, y - 9, 3, 10, OUT); });
    [-2, 0, 2].forEach(function (d) { px(ctx, x + d, y - 8, 1, 8, PAL.cream); });
    if (o.bails !== false) { px(ctx, x - 2, y - 9, 5, 1, PAL.wood); px(ctx, x - 1, y - 9, 1, 1, PAL.gold); px(ctx, x + 1, y - 9, 1, 1, PAL.gold); }
  }
  function ball(ctx, x, y, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y);
    if (o.shadowY !== undefined) shadow(ctx, x, o.shadowY, 4);
    px(ctx, x - 1, y - 2, 3, 5, OUT); px(ctx, x - 2, y - 1, 5, 3, OUT);
    px(ctx, x - 1, y - 1, 3, 3, PAL.danger); px(ctx, x - 1, y - 1, 1, 1, PAL.white);
  }
  function tree(ctx, x, y, o) {
    o = o || {}; var s = o.size || 1; x = Math.round(x); y = Math.round(y); shadow(ctx, x, y, 12 * s);
    px(ctx, x - 2, y - 7 * s, 4, 7 * s + 1, OUT); px(ctx, x - 1, y - 7 * s, 2, 7 * s, PAL.wood);
    var r = 4 * s;
    ISO.disc(ctx, x, y - 10 * s, r + 1, OUT); ISO.disc(ctx, x - r + 1, y - 8 * s, r - 1 + 1, OUT); ISO.disc(ctx, x + r - 1, y - 8 * s, r, OUT);
    ISO.disc(ctx, x, y - 10 * s, r, PAL.grass3); ISO.disc(ctx, x - r + 1, y - 8 * s, r - 1, PAL.grass3); ISO.disc(ctx, x + r - 1, y - 8 * s, r - 1, PAL.grass3);
    ISO.disc(ctx, x - 1, y - 11 * s, r - 1, PAL.grass2); ISO.disc(ctx, x - 2, y - 12 * s, Math.max(1, r - 3), PAL.grass1);
  }
  function flag(ctx, x, y, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y); var c = o.colour || PAL.kitA1, t = o.t || 0, h = o.h || 16;
    px(ctx, x - 1, y - h - 1, 3, h + 2, OUT); px(ctx, x, y - h, 1, h, PAL.stone1);
    var w = 7, wav = Math.floor(t / 250) % 2;
    for (var i = 0; i < w; i++) {
      var off = (i > 2 && wav) ? 1 : 0, hh = 5 - Math.floor(i / 2);
      px(ctx, x + 1 + i, y - h + off - 1, 1, hh + 2, OUT); px(ctx, x + 1 + i, y - h + off, 1, hh, c);
    }
  }
  function floodlight(ctx, x, y, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y); var h = o.h || 34;
    shadow(ctx, x, y, 8); px(ctx, x - 1, y - h, 4, h + 1, OUT); px(ctx, x, y - h, 2, h, PAL.stone2); px(ctx, x, y - h, 1, h, PAL.stone1);
    px(ctx, x - 6, y - h - 8, 14, 8, OUT);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) px(ctx, x - 5 + i * 4, y - h - 7 + j * 4, 3, 3, o.on === false ? PAL.stone1 : (j ? PAL.gold : PAL.white));
  }

  /* ---------- buildings ---------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function win(ctx, face, gx, gy, w, d, z, u) {
    var p = face === 'L' ? ISO.toScreen(gx + u, gy + d, z) : ISO.toScreen(gx + w, gy + u, z);
    px(ctx, p.x - 1, p.y - 1, 4, 5, OUT); px(ctx, p.x, p.y, 2, 3, PAL.sky1); px(ctx, p.x, p.y, 1, 1, PAL.white);
  }
  function door(ctx, gx, gy, w, d, u) {
    var p = ISO.toScreen(gx + u, gy + d, 0);
    px(ctx, p.x - 1, p.y - 7, 5, 7, OUT); px(ctx, p.x, p.y - 6, 3, 6, PAL.wood); px(ctx, p.x + 2, p.y - 3, 1, 1, PAL.gold);
  }
  function roofOn(ctx, gx, gy, w, d, h, rh, c1, c2, over) {
    over = over === undefined ? 0.25 : over;
    ISO.block(ctx, gx - over, gy - over, w + 2 * over, d + 2 * over, 2, { z: h, top: c1, left: c2, right: c2 });
    if (rh > 2) ISO.block(ctx, gx + 0.35, gy + 0.35, w - 0.7, d - 0.7, rh - 2, { z: h + 2, top: c1, left: c2, right: c2 });
  }
  function house(ctx, gx, gy, w, d, h, o) {
    ISO.block(ctx, gx, gy, w, d, h, { top: o.top || o.wall1, left: o.wall1, right: o.wall2 });
    var n = o.windows || 0, i;
    for (i = 0; i < n; i++) win(ctx, 'L', gx, gy, w, d, h * 0.62, (i + 0.5) * w / n - 0.25);
    for (i = 0; i < (o.windowsR === undefined ? n : o.windowsR); i++) win(ctx, 'R', gx, gy, w, d, h * 0.62, (i + 0.5) * d / Math.max(1, (o.windowsR === undefined ? n : o.windowsR)) - 0.25);
    if (o.door !== false) door(ctx, gx, gy, w, d, o.doorU === undefined ? w * 0.5 - 0.2 : o.doorU);
    if (o.roof) roofOn(ctx, gx, gy, w, d, h, o.roofH || 6, o.roof[0], o.roof[1]);
  }
  function sign(ctx, gx, gy, w, d, z, c, glyph) {
    var p = ISO.toScreen(gx + w * 0.5, gy + d, z);
    px(ctx, p.x - 6, p.y - 5, 13, 9, OUT); px(ctx, p.x - 5, p.y - 4, 11, 7, c);
    if (glyph === 'coin') { ISO.disc(ctx, p.x, p.y, 2, OUT); ISO.disc(ctx, p.x, p.y, 1, PAL.gold); }
    if (glyph === 'bell') { px(ctx, p.x - 2, p.y - 2, 5, 3, PAL.white); px(ctx, p.x, p.y + 1, 1, 1, PAL.white); }
    if (glyph === 'dumb') { px(ctx, p.x - 4, p.y - 2, 2, 4, PAL.white); px(ctx, p.x + 3, p.y - 2, 2, 4, PAL.white); px(ctx, p.x - 2, p.y - 1, 5, 2, PAL.white); }
    if (glyph === 'eye') { px(ctx, p.x - 3, p.y - 1, 7, 3, PAL.white); px(ctx, p.x, p.y - 1, 1, 3, OUT); }
    if (glyph === 'book') { px(ctx, p.x - 3, p.y - 2, 7, 5, PAL.white); px(ctx, p.x, p.y - 2, 1, 5, OUT); }
  }
  function pips(ctx, gx, gy, w, d, level, z) { // level pips (gold) on the front-left base so the level is readable at a glance
    var p = ISO.toScreen(gx + w * 0.1, gy + d, z || 0);
    for (var i = 0; i < 5; i++) px(ctx, p.x + 2 + i * 3, p.y + 3 + i, 2, 2, i < level ? PAL.gold : PAL.stone2);
  }

  var FOOT = { stands: { w: 4, d: 2 }, shop: { w: 2, d: 2 }, nets: { w: 3, d: 2 }, gym: { w: 2, d: 2 },
    academy: { w: 3, d: 2 }, scout: { w: 2, d: 2 }, pitch: { w: 2, d: 6 } };
  function lv(l) { return Math.max(1, Math.min(5, l | 0 || 1)); }

  function stands(ctx, gx, gy, level) {
    level = lv(level); var tiers = Math.min(4, level + 0), i, d = 2, sd = d / tiers;
    for (i = 0; i < tiers; i++) {
      var h = 5 + (tiers - i) * 4;
      ISO.block(ctx, gx, gy + i * sd, 4, sd, h, { top: i % 2 ? PAL.stone1 : PAL.kitA1, left: PAL.stone2, right: PAL.stone2 });
      if (level >= 2) crowdRow(ctx, ISO.toScreen(gx + 0.3, gy + (i + 1) * sd, h).x + 0, ISO.toScreen(gx, gy + (i + 1) * sd, h).y + 2 - 0, Math.max(2, 4 - 0), 7 + i * 3 + level);
    }
    if (level >= 3) {
      var rh = 5 + tiers * 4 + 6;
      [[0.2, 0.2], [3.6, 0.2], [0.2, 1.7], [3.6, 1.7]].forEach(function (c) { var a = ISO.toScreen(gx + c[0], gy + c[1], 0), b = ISO.toScreen(gx + c[0], gy + c[1], rh); ISO.line(ctx, a.x, a.y, b.x, b.y, OUT); ISO.line(ctx, a.x + 1, a.y, b.x + 1, b.y, PAL.stone1); });
      ISO.block(ctx, gx - 0.1, gy - 0.1, 4.2, 2.2, 2, { z: rh, top: PAL.roof1, left: PAL.roof2, right: PAL.roof2 });
    }
    if (level >= 5) { var f = ISO.toScreen(gx + 4, gy, 0); flag(ctx, f.x, f.y + 2, { colour: PAL.kitA1, h: 40 }); }
    pips(ctx, gx, gy, 4, 2, level);
  }
  function shop(ctx, gx, gy, level) {
    level = lv(level); var h = 10 + level * 3;
    house(ctx, gx, gy, 2, 2, h, { top: PAL.cream, wall1: PAL.wall1, wall2: PAL.wall2, windows: level >= 3 ? 2 : 1, windowsR: level >= 2 ? 1 : 0, roof: [PAL.roof1, PAL.roof2], roofH: 4 + level, door: false });
    var p = ISO.toScreen(gx, gy + 2, 0), q = ISO.toScreen(gx + 2, gy + 2, 0);
    for (var i = 0; i < 8; i++) px(ctx, p.x + 2 + i * 2, p.y + 1 + i - 8 + (level > 1 ? 0 : 1), 2, 6, i % 2 ? PAL.white : PAL.danger);
    px(ctx, p.x + 2, p.y - 3, 16, 1, OUT);
    sign(ctx, gx, gy, 2, 2, h + 1, PAL.accent, level >= 3 ? 'coin' : 'bell');
    if (level >= 4) { var b = ISO.toScreen(gx + 2.1, gy + 0.3, 0); px(ctx, b.x, b.y - 6, 3, 8, OUT); ISO.disc(ctx, b.x + 1, b.y - 8, 2, PAL.gold); }
    pips(ctx, gx, gy, 2, 2, level);
  }
  function nets(ctx, gx, gy, level) {
    level = lv(level); var lanes = Math.min(3, 1 + (level > 1) + (level > 3)), h = 12 + (level >= 4 ? 2 : 0);
    ISO.tiles(ctx, gx, gy, 3, 2, function (i, j) { return (i % 1 === 0 && j === 0) ? PAL.dirt : PAL.pitch2; });
    for (var l = 0; l < lanes; l++) ISO.tile(ctx, gx + l * (3 / lanes) + 0, gy + 0, PAL.pitch1);
    // back and side mesh
    var B = ISO.toScreen(gx, gy, 0), R = ISO.toScreen(gx + 3, gy, 0), Fr = ISO.toScreen(gx + 3, gy + 2, 0), L = ISO.toScreen(gx, gy + 2, 0);
    var Bt = ISO.toScreen(gx, gy, h), Rt = ISO.toScreen(gx + 3, gy, h), Ft = ISO.toScreen(gx + 3, gy + 2, h), Lt = ISO.toScreen(gx, gy + 2, h);
    ISO.poly(ctx, [[B.x, B.y], [R.x, R.y], [Rt.x, Rt.y], [Bt.x, Bt.y]], PAL.stone1, true);
    ISO.poly(ctx, [[Fr.x, Fr.y], [R.x, R.y], [Rt.x, Rt.y], [Ft.x, Ft.y]], PAL.white, true);
    ISO.poly(ctx, [[L.x, L.y], [B.x, B.y], [Bt.x, Bt.y], [Lt.x, Lt.y]], PAL.white, true);
    var posts = [[0, 0], [3, 0], [3, 2], [0, 2]];
    for (var k = 1; k < lanes; k++) posts.push([k * 3 / lanes, 0]);
    posts.forEach(function (c) { var a = ISO.toScreen(gx + c[0], gy + c[1], 0), b = ISO.toScreen(gx + c[0], gy + c[1], h); px(ctx, a.x - 1, b.y - 1, 3, h + 2, OUT); px(ctx, a.x, b.y, 1, h, PAL.stone1); });
    [[Bt, Rt], [Rt, Ft], [Ft, Lt], [Lt, Bt]].forEach(function (e) { ISO.line(ctx, e[0].x, e[0].y, e[1].x, e[1].y, OUT); });
    if (level >= 4) ISO.block(ctx, gx - 0.1, gy - 0.1, 3.2, 2.2, 1, { z: h, top: PAL.kitA1, left: PAL.kitA2, right: PAL.kitA2 });
    if (level >= 5) { var m = ISO.toScreen(gx + 2.3, gy + 0.4, 0); px(ctx, m.x - 3, m.y - 6, 7, 6, OUT); px(ctx, m.x - 2, m.y - 5, 5, 4, PAL.danger); px(ctx, m.x - 1, m.y - 8, 3, 2, OUT); }
    pips(ctx, gx, gy, 3, 2, level);
  }
  function gym(ctx, gx, gy, level) {
    level = lv(level); var h = 12 + level * 3, wl = PAL.stone1, wr = PAL.stone2;
    house(ctx, gx, gy, 2, 2, h, { top: PAL.white, wall1: wl, wall2: wr, windows: Math.min(2, level), windowsR: 1, door: false });
    ISO.block(ctx, gx - 0.15, gy - 0.15, 2.3, 2.3, 2, { z: h, top: PAL.kitB1, left: PAL.kitB2, right: PAL.kitB2 });
    sign(ctx, gx, gy, 2, 2, h * 0.5, PAL.kitB2, 'dumb');
    door(ctx, gx, gy, 2, 2, 1.6);
    if (level >= 3) ISO.block(ctx, gx + 0.3, gy + 0.3, 1.2, 1.2, 4 + level, { z: h + 2, top: PAL.sky2, left: PAL.water, right: PAL.water });
    if (level >= 4) ISO.block(ctx, gx + 2, gy + 0.3, 1, 1.4, h * 0.45, { top: wl, left: wr, right: wr });
    if (level >= 5) { var p = ISO.toScreen(gx + 1.4, gy + 1.4, h + 8); flag(ctx, p.x, p.y, { colour: PAL.kitB1, h: 10 }); }
    pips(ctx, gx, gy, 2, 2, level);
  }
  function academy(ctx, gx, gy, level) {
    level = lv(level); var h = 12 + level * 2;
    house(ctx, gx, gy, 3, 2, h, { top: PAL.cream, wall1: PAL.wall1, wall2: PAL.wall2, windows: 2 + (level > 2), windowsR: 1, roof: [PAL.kitA1, PAL.kitA2], roofH: 6 + level, doorU: 1.3 });
    var th = h + 6 + level * 3;
    if (level >= 2) {
      ISO.block(ctx, gx + 1, gy + 0.5, 1, 1, th - h, { z: h, top: PAL.wall1, left: PAL.wall2, right: PAL.wall2 });
      ISO.block(ctx, gx + 0.8, gy + 0.3, 1.4, 1.4, 3, { z: th, top: PAL.kitA1, left: PAL.kitA2, right: PAL.kitA2 });
      var c = ISO.toScreen(gx + 1.2, gy + 1.5, th - 6); ISO.disc(ctx, c.x, c.y, 2, OUT); ISO.disc(ctx, c.x, c.y, 1, PAL.white);
    }
    if (level >= 4) ISO.block(ctx, gx + 3, gy + 0.3, 1.2, 1.4, h - 4, { top: PAL.wall1, left: PAL.wall2, right: PAL.wall2 });
    if (level >= 5) { var p = ISO.toScreen(gx + 1.5, gy + 1, th + 3); flag(ctx, p.x, p.y, { colour: PAL.gold, h: 10 }); }
    sign(ctx, gx, gy, 3, 2, h * 0.45, PAL.accent, 'book');
    pips(ctx, gx, gy, 3, 2, level);
  }
  function scout(ctx, gx, gy, level) {
    level = lv(level); var h = 8 + level * 2;
    var th = h + 8 + level * 3, p0 = ISO.toScreen(gx + 0.2, gy + 0.2, 0), p1 = ISO.toScreen(gx + 0.2, gy + 0.2, th - 4);
    px(ctx, p0.x - 1, p1.y, 4, p0.y - p1.y + 1, OUT); px(ctx, p0.x, p1.y, 2, p0.y - p1.y, PAL.wood);
    house(ctx, gx, gy + 0.4, 2, 1.6, h, { top: PAL.dirt, wall1: PAL.wood, wall2: PAL.hair1, windows: 1, windowsR: 0, roof: [PAL.roof1, PAL.roof2], roofH: 5, doorU: 1.2 });
    ISO.block(ctx, gx - 0.2, gy - 0.2, 1, 1, 5, { z: th - 5, top: PAL.wall1, left: PAL.wood, right: PAL.wood });
    ISO.block(ctx, gx - 0.35, gy - 0.35, 1.3, 1.3, 2, { z: th, top: PAL.roof1, left: PAL.roof2, right: PAL.roof2 });
    sign(ctx, gx, gy + 0.4, 2, 1.6, h * 0.5, PAL.accent, 'eye');
    if (level >= 4) { var d = ISO.toScreen(gx + 2, gy + 0.3, 0); ISO.disc(ctx, d.x, d.y - 8, 4, OUT); ISO.disc(ctx, d.x, d.y - 8, 3, PAL.white); ISO.disc(ctx, d.x, d.y - 8, 1, PAL.stone2); px(ctx, d.x, d.y - 5, 1, 5, OUT); }
    pips(ctx, gx, gy + 0.4, 2, 1.6, level);
  }
  function pitch(ctx, gx, gy, level) {
    level = lv(level); var w = 2, d = 6;
    ISO.tiles(ctx, gx - (level >= 3 ? 0 : 0), gy, w, d, function (i, j) { return level === 1 ? PAL.dirt : (j % 2 ? PAL.pitch2 : PAL.pitch1); });
    var a = ISO.toScreen(gx, gy + 0.75, 0), b = ISO.toScreen(gx + 2, gy + 0.75, 0), c = ISO.toScreen(gx, gy + d - 0.75, 0), e = ISO.toScreen(gx + 2, gy + d - 0.75, 0);
    if (level >= 2) { ISO.line(ctx, a.x, a.y, b.x, b.y, PAL.white); ISO.line(ctx, c.x, c.y, e.x, e.y, PAL.white); }
    if (level >= 3) { ISO.tile(ctx, gx, gy + d, PAL.pitch2); ISO.tile(ctx, gx + 1, gy + d, PAL.pitch2); }
    if (level >= 4) [[gx - 1.2, gy - 1], [gx + 3, gy + d + 0.2]].forEach(function (s) { ISO.block(ctx, s[0], s[1], 0.6, 1.6, 8, { top: PAL.white, left: PAL.stone1, right: PAL.stone2 }); });
    if (level >= 5) ISO.block(ctx, gx - 2, gy + 2, 0.8, 2, 14, { top: PAL.cream, left: PAL.wood, right: PAL.hair1 });
    var s1 = ISO.toScreen(gx + 1, gy + 0.75, 0), s2 = ISO.toScreen(gx + 1, gy + d - 0.75, 0);
    stumps(ctx, s1.x, s1.y + 4); stumps(ctx, s2.x, s2.y + 4);
  }
  var BUILD = { stands: stands, shop: shop, nets: nets, gym: gym, academy: academy, scout: scout, pitch: pitch };
  function building(name, ctx, gx, gy, level) { BUILD[name](ctx, gx, gy, level); }
  /* depth-sorted: queue('gym', gx, gy, level) then ISO.flush(ctx) */
  function queue(name, gx, gy, level) {
    var f = FOOT[name]; return ISO.add({ gx: gx, gy: gy, w: f.w, d: f.d, depth: name === 'pitch' ? -1 : undefined, draw: function (ctx) { BUILD[name](ctx, gx, gy, level); } });
  }

  /* ---------- fx ---------- */
  var FONT = { // 3x5 pixel digits and a few signs
    '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001','5':'111100111001111',
    '6':'111100111101111','7':'111001001010010','8':'111101111101111','9':'111101111001111','+':'000010111010000','-':'000000111000000',
    'x':'000101010101000','K':'101101110101101','M':'101111111101101','%':'101001010100101','.':'000000000000010',' ':'000000000000000',
    'W':'101101111111101','R':'110101110101101','4s':'', 'S':'111100111001111','A':'010101111101101','B':'110101110101110','C':'011100100100011',
    'D':'110101101101110','E':'111100110100111','F':'111100110100100','G':'011100101101011','H':'101101111101101','I':'111010010010111',
    'L':'100100100100111','N':'110101101101101','O':'111101101101111','P':'111101111100100','T':'111010010010010','U':'101101101101111','Y':'101101010010010'
  };
  function text(ctx, x, y, str, colour, o) { // tiny 3x5 pixel text with 1px outline; x = left, y = top
    o = o || {}; str = String(str).toUpperCase(); x = Math.round(x); y = Math.round(y);
    var i, k, c, g, ch;
    for (var pass = 0; pass < 2; pass++) for (i = 0; i < str.length; i++) {
      g = FONT[str[i]] || FONT[' ']; if (!g) continue;
      for (k = 0; k < 15; k++) if (g[k] === '1') {
        var gx = x + i * 4 + (k % 3), gy = y + Math.floor(k / 3);
        if (pass === 0) { ctx.fillStyle = o.outline || OUT; ctx.fillRect(gx - 1, gy, 3, 1); ctx.fillRect(gx, gy - 1, 1, 3); }
        else { ctx.fillStyle = colour; ctx.fillRect(gx, gy, 1, 1); }
      }
    }
    return str.length * 4;
  }
  /* floating number: t = 0..1 progress; rises 12 px and fades near the end. For static drawing use t = 0. */
  function popup(ctx, x, y, str, colour, t) {
    t = t || 0; if (t >= 0.85) return; ctx.save();
    var w = String(str).length * 4; text(ctx, Math.round(x - w / 2), Math.round(y - t * 12), str, colour || PAL.gold); ctx.restore();
  }
  function sparkle(ctx, x, y, t, colour) { // t = 0..1; a 4-point star that grows then shrinks
    x = Math.round(x); y = Math.round(y); colour = colour || PAL.white;
    var r = Math.round((t < 0.5 ? t : 1 - t) * 6) || 0; if (t === undefined) r = 2;
    px(ctx, x, y, 1, 1, colour); for (var i = 1; i <= r; i++) { px(ctx, x - i, y, 1, 1, colour); px(ctx, x + i, y, 1, 1, colour); px(ctx, x, y - i, 1, 1, colour); px(ctx, x, y + i, 1, 1, colour); }
  }
  function flash(ctx, W, H, colour, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = colour || PAL.white; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  /* ---------- icons (12x12 maps; keys below) ---------- */
  var K = { o: OUT, g: PAL.gold, G: PAL.roof1, w: PAL.white, r: PAL.danger, b: PAL.water, B: PAL.kitA2, s: PAL.skin1, h: PAL.hair1,
    a: PAL.accent, A: PAL.water, t: PAL.wood, n: PAL.stone2, m: PAL.stone1, R: PAL.roof1, Q: PAL.roof2, c: PAL.cream, d: PAL.grass3, e: PAL.grass1, k: PAL.kitA1, K: PAL.kitA2, l: PAL.kitB1, T: mix(PAL.accent, PAL.white, 0.55) };
  var ICONS = {
    coin: ['....oooo....', '..oogggggo..', '.oggwgggGGo.', '.ogwggoggGo.', 'oggwgoggoGGo', 'ogggggoggGGo', 'ogggggoggGGo', 'oggggggogGGo', '.ogggoogGGo.', '.oggggggGGo.', '..ooGGGGoo..', '....oooo....'],
    tp: ['......ooooo.', '.....obbbbo.', '....obwbbo..', '...obwbbo...', '..obbbbooooo'.slice(0, 12), '..oobbbbbbBo', '....oooobbBo', '.....obbBo..', '.....obBo...', '....obBo....', '....oo......', '............'],
    medal: ['.rr......kk.', '..rr....kk..', '...rr..kk...', '....rrkk....', '...oooooo...', '..ogwgggGo..', '.ogwgggggGo.', '.oggggggGGo.', '.oggggggGGo.', '..ogggGGGo..', '...oooooo...', '............'],
    fan: ['............', 'ss........ss', 'ss..oooo..ss', '.sohhhhhhos.', '.sossssssos.', '..osossoso..', '..ossrrsso..', '...oossoo...', '....llll....', '..llllllll..', '..llllllll..', '............'],
    home: ['....oooo....', '..ooRRRRoo..', '.oRRRRRRRRo.', 'ooRRRRQQRRoo', '.ocwwwwwwco.', '.ocwbbwwwco.', '.ocwbbwootc.'.slice(0, 12), '.ocwwwwotto.', '.ocwwwwotco.', '.oooooooooo.', '............', '............'],
    team: ['............', '..ooo..ooo..', '.ossso.ossso'.slice(0, 12), '.ohhho.ohhho'.slice(0, 12), '.ososo.ososo'.slice(0, 12), '..ooo..ooo..', '.okkko.olllo'.slice(0, 12), 'okkkkkookllo'.slice(0, 12), 'okkkkkookllo'.slice(0, 12), '.ooooo.ooooo'.slice(0, 12), '............', '............'],
    match: ['....oooo....', '..ooowwwoo..', '.owwoooowwo.', '.owrrwwwrwo.', 'owwrwwwwrwwo', 'owrwwwwwrwwo', 'owrwwwwwwrwo', '.owrrwwwrwo.', '.owwwooowwo.', '..oowwwwoo..', '....oooo....', '............'],
    train: ['............', '.oo......oo.', 'onnoooooonno', 'onnoccccoonno'.slice(0, 12), 'onnoccccoonno'.slice(0, 12), 'onnoooooonno', '.oo......oo.', '............', '............', '............', '............', '............'],
    build: ['......oooo..', '.....onnnno.', '....onmmmno.', '.....oonno..', '....otto....', '...otto.....', '..otto......', '.otto.......', 'ootto.......', 'ooo.........', '............', '............'],
    shop: ['....oooo....', '...o....o...', '...o....o...', '.oooooooooo.', 'owwrrwwrrwwo'.slice(0, 12), 'orrwwrrwwrro'.slice(0, 12), 'orrwwrrwwrro'.slice(0, 12), 'orrwwrrwwrro'.slice(0, 12), '.oooooooooo.', '............', '............', '............'],
    more: ['............', '............', '..oo.oo.oo..', '.onno.onno..'.slice(0, 12), '.onno.onno..'.slice(0, 12), '..oo.oo.oo..', '............', '............', '............', '............', '............', '............']
  };
  /* currency icons follow LOOK-CARD: coin = gold disc + three stumps, tp = accent cone with white stripe,
     medal = gold hexagon on kitA1 ribbon, fan = kitA1 pennant with white stripe on a wood stick */
  ICONS.coin = ['....oooo....', '..oggggggo..', '.owggggggGo.', 'ogwgogogoGGo', 'ogggogogoGGo', 'ogggogogoGGo', 'ogggogogoGGo', 'ogggogogoGGo', 'oggggggggGGo', '.oggggggGGo.', '..oGGGGGGo..', '....oooo....'];
  ICONS.tp = ['............', '....oooo....', '....oaao....', '....owwo....', '...oaaaao...', '...owwwwo...', '..oaaaaaao..', '..oaaaaaao..', '.oaaaaaaaao.', 'oooooooooooo', 'oKKKKKKKKKKo', 'oooooooooooo'];
  ICONS.medal = ['.kk......kk.', '..kk....kk..', '...kkkkkk...', '....oooo....', '...oggggo...', '..ogwgggGo..', '.ogwggggggGo'.slice(0, 12), '.oggggggggGo', '..oggggGGo..', '...oGGGGo...', '....oooo....', '............'];
  ICONS.fan = ['.oo.........', '.otoooooooo.', '.otkkkkkkKo.', '.otwwwwwwoo.', '.otkkkkKo...', '.otooooo....', '.oto........', '.oto........', '.oto........', '.oto........', '.oto........', '.ooo........'];
  ICONS.team = ['............', '..oo....oo..', '.osso..osso.', '.osso..osso.', '..oo....oo..', '.okkko.oKKKo'.slice(0, 12), '.okkko.oKKKo'.slice(0, 12), '.okkko.oKKKo'.slice(0, 12), '.onno.onno..', '.oooo.oooo..', '............', '............'];
  /* bench = a plank on two legs (Bench marker); auto = dumbbell over a clock (Auto drill at End week) */
  ICONS.bench = ['............', 'oooooooooooo', 'otttttttttto', 'oooooooooooo', '.o........o.', '.o........o.', 'oooooooooooo', 'otttttttttto', 'oooooooooooo', '.o........o.', '.o........o.', '.oo......oo.'];
  ICONS.auto = ['.oo......oo.', 'onnoooooonno', 'onnoooooonno', '.oo......oo.', '............', '....oooo....', '...owwwwo...', '..owwowwwo..', '..owwowwwo..', '..owwooowo..', '...owwwwo...', '....oooo....'];
  ICONS.more = ['............', '............', '............', '............', '.ooo.ooo.ooo', '.ono.ono.ono', '.ooo.ooo.ooo', '............', '............', '............', '............', '............'];
  ICONS.scout = ['............', '..ooo..ooo..', '.onnno.onnno', '.onnnooonnno', 'onnnnoonnnno', 'onnnnoonnnno', 'obbbboobbbbo', 'obwbboobwbbo', 'obbbboobbbbo', '.oooo..oooo.', '............', '............'];
  ICONS.league = ['............', '..oooooooo..', '.oogwgggGGoo', 'o.ogwggGGo.o', '.ooggggggGoo', '...ogggGGo..', '....oGGo....', '.....oGo....', '....oGGGo...', '..ottttttto.', '..ooooooooo.', '............'];
  /* rating, batting-type and bowling-type icons: bat family (wood bat + mark), ball family (ball + mark); burst = force, ring = precision */
  ICONS.batPower = ['.oo.........', 'otto........', 'octo..o.o.o.', 'octo.ogogogo', 'otto..ogggo.', 'otto.oggGggo', 'otto..ogggo.', 'otto.ogogogo', 'ogo...o.o.o.', 'ogo.........', 'ogo.........', '.o..........'];
  ICONS.batSkill = ['.oo.........', 'otto........', 'octo...ooo..', 'octo..owwwo.', 'otto.owwwwwo', 'otto.owwowwo', 'otto.owwwwwo', 'otto..owwwo.', 'ogo....ooo..', 'ogo.........', 'ogo.........', '.o..........'];
  ICONS.bowlSpeed = ['............', '............', '..ooo..ooo..', '.ogggoorwro.', '.ooooorrwrro', 'oggggorrwrro', '.ooooorrwrro', '.ogggoorwro.', '..ooo..ooo..', '............', '............', '............'];
  ICONS.bowlSkill = ['.......ooo..', '......owwwo.', '.....owwwwwo', '.....owwowwo', '.....owwwwwo', '..ooo.owwwo.', '.orwro.ooo..', 'orrwrro.....', 'orrwrro.....', 'orrwrro.....', '.orwro......', '..ooo.......'];
  ICONS.roleOpener = ['.oooooooooo.', 'oggggggggggo', 'oggggggggggo', '.oooooooooo.', '...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...', '...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...'];
  ICONS.roleMiddle = ['...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...', '.oooooooooo.', 'oggggggggggo', 'oggggggggggo', '.oooooooooo.', '...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...'];
  ICONS.roleLower = ['...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...', '...oooooo...', '...onnnno...', '...onnnno...', '...oooooo...', '.oooooooooo.', 'oggggggggggo', 'oggggggggggo', '.oooooooooo.'];
  ICONS.typeFast = ['............', '............', '............', '........o...', '.ooo...oro..', 'owwwoooorro.', 'owwworrrrrro', 'owwwoooorro.', '.ooo...oro..', '........o...', '............', '............'];
  ICONS.typeMedium = ['............', '............', '......o.....', '.ooo..oGo...', 'owwwo.oGgo..', 'owwwo.oGggo.', 'owwwo.oGgo..', '.ooo..oGo...', '......o.....', '............', '............', '............'];
  ICONS.typeSpin = ['....oooo....', '..ooTTTToo..', '.oTTooooTTo.', '.oTo....oTo.', '.oTo....oTo.', '.oTo...oTTTo', '.ooo....oTo.', 'owwwo....o..', 'owwwo.......', 'owwwo.......', '.ooo........', '............'];
  /* UI glyph icons (second batch) */
  ICONS.fieldAttack = ['............', '....o..o....', '.....oo.....', '....oooo....', '.o.orrrro.o.', '..oorwrroo..', '..oorwrroo..', '.o.orrrro.o.', '....oooo....', '.....oo.....', '....o..o....', '............'];
  ICONS.fieldProtect = ['............', '.oooooooooo.', '.obbbbBBBBo.', '.obwbbBBBBo.', '.obbbbBBBBo.', '.obbbbBBBBo.', '.obbbbBBBBo.', '..obbbBBBo..', '...obbBBo...', '....obBo....', '.....oo.....', '............'];
  ICONS.burst = ['....oooooo..', '...oggggggo.', '..oggggGGo..', '.ogggGGooo..', '.oggggggggo.', '..ooogggGGo.', '...oggGGoo..', '..oggGGo....', '..ogGGo.....', '.ogGoo......', '..oo........', '............'];
  ICONS.lock = ['....oooo....', '...onnnno...', '...on..no...', '...on..no...', '.oooooooooo.', '.oggggggggo.', '.oggggooggo.', '.oggggooggo.', '.ogggggoggGo', '.oGGGGGGGGGo', '.oooooooooo.', '............'];
  ICONS.peak = ['............','....ooooo...','....orrro...','....otooo...','...ootoo....','..oowwwoo...','.oowwwnnoo..','.owwnnnnnoo.','oonnnnmnnnoo','onnnnmmnnnno','onnnmmmmnnno','oooooooooooo'];
  ICONS.done = ['.....oo.....', '...ooddoo...', '..oddddddo..', '.oddddddddo.', '.oddddddwwo.', 'oddwdddwwddo', 'oddwwdwwdddo', '.oddwwwdddo.', '.odddwddddo.', '..oddddddo..', '...ooddoo...', '.....oo.....'];
  ICONS.info = ['.....oo.....', '...oobboo...', '..obbwwbbo..', '.obbbwwbbbo.', '.obbbbbbbbo.', 'obbbwwwbbbbo', 'obbbbwwbbbbo', '.obbbwwbbbo.', '.obbwwwwbbo.', '..obbbbbbo..', '...oobboo...', '.....oo.....'];
  ICONS.close = ['.....oo.....', '...oorroo...', '..orrrrrro..', '.orwwrrrwwo.', '.orrwwrwwro.', 'orrrrwwwrrro', 'orrrrwwwrrro', '.orrwwrwwro.', '.orwwrrrwwo.', '..orrrrrro..', '...oorroo...', '.....oo.....'];
  ICONS.coach = ['............','.......oooo.','....oooorro.','...ooggggro.','oooogwggggoo','ogggwggggGgo','oggggggoGGgo','ogggggGGGGgo','ooooogGGGGoo','....ooGGGoo.','.....ooooo..','............'];
  ICONS.week = ['...o....o...', '.oooooooooo.', '.orrrrrrrro.', '.orrrrrrrro.', '.owwwwwwwwo.', '.ownwnwnwwo.', '.owwwwwwwwo.', '.ownwnwgwwo.', '.owwwwwwwwo.', '.ownwnwnwwo.', '.oooooooooo.', '............'];
  ICONS.why = ['..oooooooo..', '.owwwwwwwwo.', 'owwwbbbbwwwo', 'owwbwwwwbwwo', 'owwwwwwbwwwo', 'owwwwwbwwwwo', 'owwwwwwwwwwo', 'owwwwwbwwwwo', '.owwwwwwwwo.', '.oowooooooo.', '..oo........', '..o.........'];
  ICONS.upgrade = ['....oooo....','...ooeeoo...','..ooeweeoo..','.ooewweedoo.','ooewwweeddo.','oeeeweeeddo.','ooooewedooo.','...oewedo...','...oeeedo...','...oedddo...','...oddddo...','...oooooo...'];
  ICONS.alert = ['....oooo....','...ooggoo...','...ogwgGo...','..oogoGGoo..','..ogwooGGo..','.ooggooGGoo.','.ogggooGGGo.','ooggggggGGoo','oggggoogGGGo','ogggggggGGGo','oGGGGGGGGGGo','oooooooooooo'];
  ICONS.wicket = ['....gggg....', '............', 'ooo.....ooo.', 'oto.....oto.', 'oto...g.oto.', 'oto...t.oto.', 'oto.....oto.', 'oto.o.o.oto.', 'oto.oto.oto.', 'oto.oto.oto.', 'oto.oto.oto.', 'ooo.ooo.ooo.'];
  ICONS.runs = ['.......oooo.', '......orrrro', '......orwrro', '......orrrro', '.....ottooo.', '....ottto...', '...ottto....', '..ottto.....', '.ogtto......', 'ogggo.......', 'oggo........', '.oo.........'];
  ICONS.overs = ['.....oo.....', '...oowwoo...', '..owwwwwwo..', '.orrwrrwrro.', '.orrwrrwrro.', 'owwwwwwwwwwo', 'owwwwwwwwwwo', '.orrwrrwrro.', '.orrwrrwrro.', '..owwwwwwo..', '...oowwoo...', '.....oo.....'];
  /* pennant = gold tour pennant on a wood stick (tours, hall); added QA f-sinks 2026-11-12 */
  ICONS.pennant = ['.oo.........', '.otoo.......', '.otggoo.....', '.otgwggoo...', '.otgwgggGoo.', '.otggggGGGGo', '.otgggGGoo..', '.otgGGoo....', '.otoo.......', '.oto........', '.oto........', '.ooo........'];
  /* rematch = circular arrow, accent ring on outline (same seed rematch button); added QA f-first-session 2026-11-12 */
  ICONS.rematch = ['......oo....', '...oooaoo...', '..oaaaaaao..', '.oaooooaoo..', 'oaoo..oo....', 'oao.......o.', 'oao......oao', 'oao......oao', 'oaoo....ooao', '.oaooooooao.', '..oaaaaaao..', '...oooooo...'];
  ICONS.settings = ['....o..o....', '...onoono...', '.oonnnnnnoo.', '.onnnoonnmo.', '..onoooomo..', 'oonno..omnoo', 'onnno..ommmo', '..onoooomo..', '.onmmoommmo.', '.oommmmmmoo.', '...ommoomo..', '....o..o....'];
  var iconCache = {};
  function icon(name) {
    if (iconCache[name]) return iconCache[name];
    var m = ICONS[name]; if (!m) throw new Error('SPR.icon: unknown icon ' + name);
    var c = document.createElement('canvas'); c.width = 12; c.height = 12; var x = c.getContext('2d');
    for (var j = 0; j < 12; j++) for (var i = 0; i < 12; i++) { var ch = (m[j] || '')[i]; if (ch && ch !== '.' && K[ch]) { x.fillStyle = K[ch]; x.fillRect(i, j, 1, 1); } }
    return (iconCache[name] = c);
  }
  function iconURL(name) { return icon(name).toDataURL(); }
  /* returns an <img> already styled for pixelated scaling, size in CSS px (use a multiple of 12) */
  function iconImg(name, size) {
    var im = new Image(); im.src = iconURL(name); im.width = size || 24; im.height = size || 24; im.className = 'icon'; im.alt = name; return im;
  }

  window.SPR = { mix: mix, shadow: shadow, player: player, coach: coach, umpire: umpire, crowdRow: crowdRow, stumps: stumps, ball: ball,
    tree: tree, flag: flag, floodlight: floodlight, stands: stands, shop: shop, nets: nets, gym: gym, academy: academy, scout: scout, pitch: pitch,
    building: building, queue: queue, footprint: FOOT, popup: popup, text: text, sparkle: sparkle, flash: flash,
    icon: icon, iconURL: iconURL, iconImg: iconImg, iconNames: Object.keys(ICONS), iconMaps: ICONS };
})();
