#!/usr/bin/env node
// Exports ground-truth data tables from the unmodified v7h page so the C# port does not need the sprite manifest:
//   oracle/geometry.json : per vehicle (+ the 4 mixer skins): local body points, wheel radii, topY, probes, plus PHYS
//   oracle/levels.json   : per vehicle x level: ground polyline, flagX/edgeX/minY, zones, rocks, checkpoint, initial props
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { openPage } = require('./record.js');
(async () => {
  const browser = await chromium.launch();
  const { pg, errs } = await openPage(browser, 20261102);
  const out = await pg.evaluate(() => {
    const geometry = { note: 'geo.pts = [rear-bottom, front-bottom, front-top, rear-top, rear wheel, front wheel] in LOCAL space (x forward, y up); resetTruck adds (5, groundY(5)+1.2). r4/r5 = wheel radii. probes = body skid probes [lx, ly, top].', PHYS: JSON.parse(JSON.stringify(PHYS)), G, DT, ITER, WHEEL_R, vehicles: {}, mixerSkins: [] };
    const dump = g => g && { body: g.s.body, oy: g.oy, pts: g.pts, r4: g.r4, r5: g.r5, topY: g.topY, probes: g.probes.map(q => [q.lx, q.ly, q.top ? 1 : 0]) };
    for (const v of ['mixer', 'digger', 'dump', 'dozer', 'crane', 'roller']) { vehicle = v; combo3.skin = 0; geometry.vehicles[v] = dump(vehGeom(v)); }
    for (let s = 0; s < 4; s++) { combo3.skin = s; vehicle = 'mixer'; geometry.mixerSkins.push(dump(vehGeom('mixer'))); }
    combo3.skin = 0;
    const levels = { note: 'pts = ground polyline [[x,y],...] exactly as buildLevel() produced it in V8. zones=[kind,x0,x1] sorted by x0. rocks=[x]. props0 = initial props [kind,x,y,r,m].', LEVEL_WX, levels: {} };
    mode = 'classic'; combo = null;
    for (const v of ['mixer', 'digger', 'dump', 'dozer', 'crane', 'roller']) for (let li = 0; li < 8; li++) {
      vehicle = v; startLevel(li);
      levels.levels[v + ':' + (li + 1)] = { vehicle: v, level: li + 1, weather: wx(), pts: L.pts, flagX: L.flagX, edgeX: L.edgeX, gapL: L.gapL, gapR: L.gapR, gapBottom: L.gapBottom, gapTop: L.gapTop, minY: L.minY,
        zones: (L.zones || []).map(z => [z.kind, z.x0, z.x1]), rocks: (L.rocks || []).map(r => r.x), cp: cp ? { x: cp.x, load: cp.load } : null,
        props0: props.map(b => [b.kind, b.x, b.y, b.r, b.m]), spawn: { x: 5, y: groundY(5) + 1.2 } };
    }
    return { geometry, levels };
  });
  fs.writeFileSync(path.join(__dirname, 'oracle', 'geometry.json'), JSON.stringify(out.geometry, null, 1));
  fs.writeFileSync(path.join(__dirname, 'oracle', 'levels.json'), JSON.stringify(out.levels));
  console.log('geometry.json + levels.json written', Object.keys(out.levels.levels).length, 'levels', errs);
  await browser.close();
})();
