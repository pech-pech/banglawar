(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  const ZONE_NAMES = ['Defence', 'Midfield', 'Attack'];
  const shiftOf = (T) => (T && typeof T.trailShift === 'number' ? T.trailShift : 0.1); // admin default: 0.1 (bot.js)
  const tellOn = (T) => !(T && T.tellOn === false);
  const cap1 = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase();
  // largest-remainder rounding so shown percentages always add to 100
  function pct(arr) {
    const raw = arr.map((x) => x * 100), fl = raw.map(Math.floor);
    let rest = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
    return fl;
  }

  // port of bot.js clubDist5, returned as an object
  function weights(club, zone, trailing, T) {
    const s0 = shiftOf(T), a = club.weights;
    let wp = a.pass, wd = a.dribble, wt = a.through;
    if (trailing) { wd += s0; wt += s0; wp = Math.max(0, wp - 2 * s0); }
    const s = wp + wd + wt; wp /= s; wd /= s; wt /= s;
    return zone < 2 ? { pass: wp, dribble: wd, through: wt, shoot: 0 } : { pass: wp, dribble: 0, through: 0, shoot: 1 - wp };
  }

  // same walk and fall-through as bot.js match5 action pick
  function pickAction(w, ua) {
    const k = ['pass', 'dribble', 'through', 'shoot'], v = k.map((n) => w[n]);
    let acc = 0, act = 0;
    for (let a = 0; a < 4; a++) { acc += v[a]; if (ua < acc) { act = a; break; } act = a; }
    if (v[act] === 0) act = v[3] > 0 ? 3 : 0;
    return k[act];
  }

  function defender(club, myZone) { return club.defenders[myZone]; }
  function pressChance(club, myZone, T) { return tellOn(T) ? club.defenders[myZone].press : club.offPress; }
  function stance(p, us) { return us < p ? 'press' : 'drop'; }

  function tellText(club, myZone, T) {
    const d = defender(club, myZone), zn = ZONE_NAMES[myZone];
    if (!tellOn(T)) return d.name + ' (' + zn + '): stance hidden'; // admin default: tell off shows no numbers
    const [pr, dr] = pct([d.press, 1 - d.press]);
    return d.name + ' (' + zn + '): Press ' + pr + ' / Drop ' + dr;
  }

  function attackTell(club, zone, trailing, T) {
    const w = weights(club, zone, trailing, T), nm = cap1(club.label || club.name) + ' attack: ';
    if (zone < 2) { const p = pct([w.pass, w.dribble, w.through]); return nm + 'Pass ' + p[0] + ' / Dribble ' + p[1] + ' / Through ' + p[2]; }
    const p = pct([w.pass, w.shoot]); return nm + 'Pass ' + p[0] + ' / Shoot ' + p[1];
  }

  function clubStats(club, T) {
    const id = club.id, t = T || {};
    const pick = (suffix, base) => { const v = t[id + suffix]; return typeof v === 'number' ? v : base; };
    return { def: pick('Def', club.def), keeper: pick('Keeper', club.keeper && club.keeper.def), atk: pick('Atk', club.atk) };
  }

  SD.clubAI = { weights, pickAction, defender, pressChance, stance, tellText, attackTell, clubStats };

  // ---- Node self-test: node pages/squad-duel/js/club-ai.js ----
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const assert = require('assert'), C = SD.clubAI;
    const grimsby = { id: 'grimsby', name: 'Iron Grimsby', label: 'GRIMSBY', def: 4, keeper: { name: 'Garrick', def: 7 }, atk: 7, weights: { pass: .30, dribble: .50, through: .20 }, offPress: .30,
      defenders: [{ name: 'Brogan', zone: 0, press: .30 }, { name: 'Dunmar', zone: 1, press: .60 }, { name: 'Corwin', zone: 2, press: .20 }] };
    const reading = { id: 'reading', name: 'Restless Reading', label: 'READING', def: 5, keeper: { name: 'Neve', def: 8 }, atk: 7, weights: { pass: .20, dribble: .25, through: .55 }, offPress: .65,
      defenders: [{ name: 'Wenna', zone: 0, press: .70 }, { name: 'Fenric', zone: 1, press: .40 }, { name: 'Isken', zone: 2, press: .80 }] };
    const T = { trailShift: 0.1, tellOn: true };
    const sum = (w) => w.pass + w.dribble + w.through + w.shoot;
    for (const c of [grimsby, reading]) for (const z of [0, 1, 2]) for (const tr of [false, true]) assert(Math.abs(sum(C.weights(c, z, tr, T)) - 1) < 1e-12);
    let w = C.weights(grimsby, 0, true, T);   // .1/.6/.3 sum 1.0
    assert(Math.abs(w.pass - .1) < 1e-12 && Math.abs(w.dribble - .6) < 1e-12 && Math.abs(w.through - .3) < 1e-12 && w.shoot === 0);
    w = C.weights(grimsby, 2, false, T); assert(w.dribble === 0 && w.through === 0 && Math.abs(w.pass - .3) < 1e-12 && Math.abs(w.shoot - .7) < 1e-12);
    w = C.weights(reading, 1, true, T); assert(Math.abs(w.pass) < 1e-12 && w.shoot === 0 && Math.abs(sum(w) - 1) < 1e-12); // pass .2-.2 = 0
    // pickAction distribution over 10k uniforms
    for (const [c, z, tr] of [[grimsby, 1, false], [reading, 0, true], [grimsby, 2, false]]) {
      const ww = C.weights(c, z, tr, T), cnt = { pass: 0, dribble: 0, through: 0, shoot: 0 }, N = 10000;
      for (let i = 0; i < N; i++) cnt[C.pickAction(ww, (i + .5) / N)]++;
      for (const k in cnt) assert(Math.abs(cnt[k] / N - ww[k]) < 0.002, c.id + z + tr + k);
      if (ww.pass === 0) assert.strictEqual(cnt.pass, 0);
    }
    assert.strictEqual(C.pickAction({ pass: 0, dribble: 0, through: 0, shoot: 1 }, 0.5), 'shoot');
    assert.strictEqual(C.pickAction({ pass: 1, dribble: 0, through: 0, shoot: 0 }, 0.9999999), 'pass');
    assert.strictEqual(C.pickAction({ pass: .5, dribble: .5, through: 0, shoot: 0 }, 1), 'pass'); // ua>=total: falls to last, w=0 -> pass
    assert.strictEqual(C.stance(.6, .59), 'press'); assert.strictEqual(C.stance(.6, .6), 'drop');
    assert.strictEqual(C.tellText(grimsby, 1, T), 'Dunmar (Midfield): Press 60 / Drop 40');
    assert.strictEqual(C.pressChance(reading, 2, { tellOn: false }), .65); assert.strictEqual(C.pressChance(reading, 2, T), .8);
    assert.strictEqual(C.attackTell(grimsby, 1, false, T), 'Grimsby attack: Pass 30 / Dribble 50 / Through 20');
    console.log(C.attackTell(grimsby, 1, true, T), '|', C.attackTell(reading, 2, false, T), '|', C.tellText(reading, 0, { tellOn: false }));
    assert.deepStrictEqual(C.clubStats(grimsby, { grimsbyDef: 5, grimsbyKeeper: 6, grimsbyAtk: 8 }), { def: 5, keeper: 6, atk: 8 });
    assert.deepStrictEqual(C.clubStats(reading, {}), { def: 5, keeper: 8, atk: 7 });
    console.log('club-ai self-test OK');
  }
})();
