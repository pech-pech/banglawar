// Burn Window report: self-check, Copy-report builder, clipboard, best-run storage. UMD: BW.report.
(function (root) {
  'use strict';
  const sim = (typeof module !== 'undefined' && module.exports) ? require('./sim.js') : (root.BW && root.BW.sim);

  function scriptedSector() {
    return {
      id: 'selfcheck', index: 0,
      bodies: [
        sim.makeBody({ id: 'L', kind: 'large', cx: 170, cy: 240 }),
        sim.makeBody({ id: 'M', kind: 'medium', cx: 170, cy: 240, R: 120, w: 0.5, p: 0.7 })
      ],
      gate: { x: 300, y: 420 },
      start: { x: 170, y: 400, vx: 60, vy: 0 },
      fuel0: 60
    };
  }

  function energyDrift() {
    const sector = { bodies: [sim.makeBody({ id: 'L', kind: 'large', cx: 170, cy: 240 })], gate: { x: -999, y: -999 }, start: null, fuel0: 60 };
    const r = 120, v = Math.sqrt(sector.bodies[0].gm * r * r / Math.pow(r * r + sim.C.EPS * sim.C.EPS, 1.5)) * 1.0;
    // circular speed v^2 = r * a(r) with softened accel; start at (170, 240+r), moving +x
    sector.start = { x: 170, y: 240 + r, vx: v, vy: 0 };
    const st = sim.newState(sector, 0);
    const e0 = sim.energy(st, sector, 0);
    const steps = Math.round(60 / sim.C.DT);
    for (let i = 0; i < steps && st.status === 'flying'; i++) sim.step(st, sector, { burn: false, throttle: 1 });
    const e1 = sim.energy(st, sector, st.n * sim.C.DT);
    return Math.abs((e1 - e0) / e0);
  }

  function selfCheck() {
    let ok = false, checksum = null, drift = null;
    try {
      const sector = scriptedSector();
      const sched = [[1, 0.6, 1], [3, 0.4, 0.5], [6, 0.8, 1]];
      const a = sim.runSchedule(sector, sched, { maxSeconds: 20 });
      const b = sim.runSchedule(sector, sched, { maxSeconds: 20 });
      ok = a.checksum === b.checksum; checksum = a.checksum;
      drift = energyDrift();
    } catch (e) { ok = false; }
    return { ok, checksum, energyDrift: drift };
  }

  function build(info) {
    info = info || {};
    const sc = selfCheck();
    return {
      game: 'Burn Window',
      version: 'bw-0.1',
      seed: info.seed,
      renderer: 'Canvas2D',
      device: info.device || {},
      fps: info.fps || {},
      determinism: { ok: sc.ok, checksum: sc.checksum },
      attempts: info.attempts || [],
      inputLog: info.inputLog || [],
      ticks: info.ticks || {},
      energyDrift: sc.energyDrift,
      settings: info.settings || {}
    };
  }

  function copy(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          const ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          document.body.appendChild(ta);
          ta.select(); ta.setSelectionRange(0, ta.value.length);
          const ok = !!document.execCommand('copy');
          document.body.removeChild(ta);
          resolve(ok);
        } catch (e) { resolve(false); }
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
        } else fallback();
      } catch (e) { fallback(); }
    });
  }

  function key(seed, idx) { return 'bw:best:' + seed + ':' + idx; }

  function loadBest(seed, idx) {
    try {
      const raw = root.localStorage.getItem(key(seed, idx));
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && typeof o.fuel === 'number' && Array.isArray(o.events)) return o;
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveBest(seed, idx, fuel, events) {
    try {
      const cur = loadBest(seed, idx);
      if (cur && cur.fuel <= fuel) return false;
      root.localStorage.setItem(key(seed, idx), JSON.stringify({ fuel: fuel, events: events }));
      return true;
    } catch (e) { return false; }
  }

  const api = { selfCheck, build, copy, loadBest, saveBest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.BW = root.BW || {}; root.BW.report = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
