/* core.js - witch school proto engine. Pure JS, no DOM. Browser + Node. */
const Core = (function () {
  'use strict';
  const BUILD = 'ws-proto-1';
  const TUNE_DEFAULT = { chips: true, chipSec: 2.5, textSize: 'auto', advance: 'tap', steep: false, band: 0.25, test: false, seed: 1 };
  const KEYS = ['c1', 'c2', 'c3'];

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return { next: next, int: function (n) { return Math.floor(next() * n); } };
  }

  function newState(seed) {
    return { seed: seed === undefined ? 1 : seed, path: {}, flags: {}, friends: { sable: 0, ione: 0 }, slot: 'open', ending: null, steep: null, log: [] };
  }
  function clone(s) {
    return {
      seed: s.seed, path: Object.assign({}, s.path), flags: Object.assign({}, s.flags),
      friends: Object.assign({}, s.friends), slot: s.slot, ending: s.ending, steep: s.steep,
      log: (s.log || []).slice()
    };
  }
  function match(when, state) {
    when = when || {};
    for (const k in when) {
      const v = Object.prototype.hasOwnProperty.call(state.path, k) ? state.path[k] : state.flags[k];
      if (v !== when[k]) return false;
    }
    return true;
  }
  function eligible(story, state) {
    if (state.slot === 'end') return [];
    return story.scenes.filter(function (sc) { return sc.slot === state.slot && match(sc.when, state); });
  }
  function resolveEnding(story, state) {
    for (const e of story.endings) if (match(e.when, state)) return e;
    return null;
  }
  function pick(story, state) {
    if (state.slot === 'end') return resolveEnding(story, state);
    return eligible(story, state)[0] || null;
  }
  function findChoice(story, key, id) {
    for (const sc of story.scenes) {
      if (sc.choiceKey !== key || !sc.choices) continue;
      for (const c of sc.choices) if (c.id === id) return c;
    }
    return null;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function render(story, state, line) {
    const names = story.names || {};
    return String(line)
      .replace(/\{c2\}/g, function () { const c = findChoice(story, 'c2', state.path.c2); return c ? c.echo : ''; })
      .replace(/\{c3\}/g, function () { const c = findChoice(story, 'c3', state.path.c3); return c ? c.echo : ''; })
      .replace(/\{friend\}/g, function () { return names[state.path.c1] || cap(state.path.c1 || ''); })
      .replace(/\{pet\}/g, names.pet || 'Pebble');
  }
  function apply(story, state, choiceId) {
    const ns = clone(state);
    let scene = pick(story, state);
    let ch = null;
    if (scene && scene.choices) ch = scene.choices.find(function (c) { return c.id === choiceId; }) || null;
    if (!ch) {
      for (const sc of story.scenes) {
        if (sc.slot !== state.slot || !sc.choices) continue;
        ch = sc.choices.find(function (c) { return c.id === choiceId; });
        if (ch) { scene = sc; break; }
      }
    }
    if (!ch || !scene || !scene.choiceKey) return { state: ns, chip: null };
    ns.path[scene.choiceKey] = ch.id;
    if (ch.friend && Object.prototype.hasOwnProperty.call(ns.friends, ch.friend)) ns.friends[ch.friend] += 1;
    ns.log.push({ slot: state.slot, key: scene.choiceKey, choice: ch.id });
    return { state: ns, chip: ch.chip || null };
  }
  function advance(story, state) {
    const ns = clone(state);
    const i = story.order.indexOf(state.slot);
    if (i < 0 || i >= story.order.length - 1) return ns;
    ns.slot = story.order[i + 1];
    if (ns.slot === 'end') { const e = resolveEnding(story, ns); ns.ending = e ? e.id : null; }
    return ns;
  }
  function steepGrade(hits) { return hits >= 3 ? 'CLEAN' : hits === 2 ? 'WOBBLY' : 'TANGLED'; }

  function tuneDiff(tune) {
    const d = {};
    if (!tune) return d;
    for (const k in TUNE_DEFAULT) if (k in tune && tune[k] !== TUNE_DEFAULT[k]) d[k] = tune[k];
    return d;
  }
  function runLine(state, tuneDiffObj, readMs) {
    const p = KEYS.map(function (k) { return state.path[k] || ''; }).filter(Boolean).join(',');
    return [BUILD, 'seed=' + state.seed, 'path=' + p, 'tune=' + JSON.stringify(tuneDiffObj || {}),
      'end=' + (state.ending || ''), 'ms=' + (readMs || []).join(',')].join('|');
  }

  function readJSON(storage, key, dflt) {
    try { const v = storage.getItem(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; }
  }
  function writeJSON(storage, key, val) {
    try { storage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function loadRuns(storage) { const r = readJSON(storage, 'ws.runs', []); return Array.isArray(r) ? r.slice(-10) : []; }
  function saveRuns(storage, line) {
    const r = loadRuns(storage); r.push(line);
    const out = r.slice(-10); writeJSON(storage, 'ws.runs', out); return out;
  }
  function allPresets(storage) { const p = readJSON(storage, 'ws.presets', {}); return p && typeof p === 'object' ? p : {}; }
  function savePreset(storage, name, tune) {
    const p = allPresets(storage); p[name] = Object.assign({}, tune); return writeJSON(storage, 'ws.presets', p);
  }
  function loadPreset(storage, name) {
    const p = allPresets(storage);
    return p[name] ? Object.assign({}, TUNE_DEFAULT, p[name]) : null;
  }
  function listPresets(storage) { return Object.keys(allPresets(storage)); }
  function deletePreset(storage, name) {
    const p = allPresets(storage); delete p[name]; return writeJSON(storage, 'ws.presets', p);
  }
  function endingsFound(runs) {
    const found = [];
    (runs || []).forEach(function (l) {
      const m = /\|end=([A-Z]+)/.exec(l);
      if (m && found.indexOf(m[1]) < 0) found.push(m[1]);
    });
    return { found: found, total: 4 };
  }

  // ---- analysis ----
  function choiceIds(story) {
    const ids = {};
    KEYS.forEach(function (k) { ids[k] = []; });
    story.scenes.forEach(function (sc) {
      if (sc.choiceKey && sc.choices) sc.choices.forEach(function (c) {
        if (ids[sc.choiceKey] && ids[sc.choiceKey].indexOf(c.id) < 0) ids[sc.choiceKey].push(c.id);
      });
    });
    return ids;
  }
  function combos(story) {
    const ids = choiceIds(story), out = [];
    ids.c1.forEach(function (a) { ids.c2.forEach(function (b) { ids.c3.forEach(function (c) { out.push([a, b, c]); }); }); });
    return out;
  }
  // walk one path; returns {scenes:[{slot,scene,text}], ending, scene2, dead:slot|null, endingObj}
  function walk(story, combo) {
    let st = newState(1);
    const res = { scenes: [], ending: null, scene2: null, dead: null, endingObj: null, state: null };
    const want = { c1: combo[0], c2: combo[1], c3: combo[2] };
    for (let guard = 0; guard < 50 && st.slot !== 'end'; guard++) {
      const sc = pick(story, st);
      if (!sc) { res.dead = st.slot; break; }
      res.scenes.push({ slot: st.slot, scene: sc, state: st });
      if (st.slot === 's2') res.scene2 = sc.id;
      if (sc.choices && sc.choiceKey) st = apply(story, st, want[sc.choiceKey]).state;
      st = advance(story, st);
    }
    if (st.slot === 'end') { const e = pick(story, st); res.endingObj = e; res.ending = e ? e.id : null; if (!e) res.dead = 'end'; res.endState = st; }
    res.state = st;
    return res;
  }
  function wc(s) { return String(s).split(/\s+/).filter(Boolean).length; }

  function lint(story) {
    const P = [];
    if (!story || !Array.isArray(story.scenes) || !Array.isArray(story.order) || !Array.isArray(story.endings)) {
      return { ok: false, problems: ['story missing scenes/order/endings'] };
    }
    const cs = combos(story);
    const usedScenes = {}, usedEnds = {};
    cs.forEach(function (cb) {
      const w = walk(story, cb);
      if (w.dead) P.push('dead end at slot "' + w.dead + '" for path ' + cb.join(','));
      w.scenes.forEach(function (x) {
        usedScenes[x.scene.id] = true;
        let words = 0;
        x.scene.text.forEach(function (l) { words += wc(render(story, w.state, l)); });
        if (x.scene.choices && words > 35) P.push('choice beat "' + x.scene.id + '" has ' + words + ' words (max 35) on path ' + cb.join(','));
        else if (words > 70) P.push('beat "' + x.scene.id + '" has ' + words + ' words (cap 70) on path ' + cb.join(','));
      });
      if (w.ending) usedEnds[w.ending] = true;
      if (w.endingObj) {
        let words = 0; (w.endingObj.text || []).forEach(function (l) { words += wc(render(story, w.endState, l)); });
        if (words > 70) P.push('ending "' + w.endingObj.id + '" has ' + words + ' words (cap 70)');
      }
    });
    // dedupe repeated word-cap messages by scene id
    const seen = {}; const P2 = [];
    P.forEach(function (m) { const k = m.replace(/ on path .*/, ''); if (!seen[k]) { seen[k] = 1; P2.push(m); } });
    const out = P2;
    story.scenes.forEach(function (sc) {
      if (story.order.indexOf(sc.slot) < 0) out.push('scene "' + sc.id + '" in unknown slot "' + sc.slot + '"');
      else if (!usedScenes[sc.id]) out.push('unreachable scene "' + sc.id + '"');
      if (sc.choices) {
        if (!sc.choiceKey) out.push('scene "' + sc.id + '" has choices but no choiceKey');
        sc.choices.forEach(function (c) {
          if (wc(c.label) > 8) out.push('label over 8 words: "' + c.label + '"');
          if (!c.chip) out.push('choice "' + c.id + '" has no chip');
          if (!c.echo) out.push('choice "' + c.id + '" has no echo');
        });
      }
    });
    // unused flags: any when-key that is not a path key and never set
    const whenKeys = {};
    story.scenes.concat(story.endings).forEach(function (o) { Object.keys(o.when || {}).forEach(function (k) { whenKeys[k] = o.id; }); });
    Object.keys(whenKeys).forEach(function (k) { if (KEYS.indexOf(k) < 0) out.push('unused flag "' + k + '" (used in when of "' + whenKeys[k] + '", never set)'); });
    // each slot (except end) must end with default scene
    story.order.forEach(function (slot) {
      if (slot === 'end') return;
      const sl = story.scenes.filter(function (s) { return s.slot === slot; });
      if (!sl.length) out.push('slot "' + slot + '" has no scenes');
    });
    story.endings.forEach(function (e) { if (!usedEnds[e.id]) out.push('ending "' + e.id + '" unreachable'); });
    const last = story.endings[story.endings.length - 1];
    if (last && Object.keys(last.when || {}).length) out.push('last ending is not a default (when:{})');
    story.endings.forEach(function (e) { if (!e.because) out.push('ending "' + e.id + '" has no "because" line'); });
    if (story.steep && story.steep.lines) ['CLEAN', 'WOBBLY', 'TANGLED'].forEach(function (g) { if (!story.steep.lines[g]) out.push('steep line missing: ' + g); });
    return { ok: out.length === 0, problems: out };
  }

  function bot(story) {
    const paths = [], reached = [];
    combos(story).forEach(function (cb) {
      const w = walk(story, cb);
      paths.push({ path: cb, scene2: w.scene2, ending: w.ending });
      if (w.ending && reached.indexOf(w.ending) < 0) reached.push(w.ending);
    });
    return { paths: paths, endings: reached };
  }

  function flipMatrix(story) {
    const ids = choiceIds(story), out = {};
    KEYS.forEach(function (k, ki) {
      const r = { scene2Changed: 0, endingChanged: 0, of: 0 };
      combos(story).forEach(function (cb) {
        const other = ids[k].find(function (v) { return v !== cb[ki]; });
        const fl = cb.slice(); fl[ki] = other;
        const a = walk(story, cb), b = walk(story, fl);
        r.of++;
        if (a.scene2 !== b.scene2) r.scene2Changed++;
        if (a.ending !== b.ending) r.endingChanged++;
      });
      out[k] = r;
    });
    return out;
  }

  const Core = {
    BUILD: BUILD, TUNE_DEFAULT: TUNE_DEFAULT, rng: rng, newState: newState, eligible: eligible, pick: pick,
    render: render, apply: apply, advance: advance, steepGrade: steepGrade, runLine: runLine,
    saveRuns: saveRuns, loadRuns: loadRuns, savePreset: savePreset, loadPreset: loadPreset,
    listPresets: listPresets, deletePreset: deletePreset, tuneDiff: tuneDiff, endingsFound: endingsFound,
    lint: lint, bot: bot, flipMatrix: flipMatrix
  };

  // ---- CLI ----
  if (typeof process !== 'undefined' && process.argv && typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const args = process.argv.slice(2);
    const S = typeof STORY !== 'undefined' ? STORY : require('./story.js');
    let fail = false;
    const want = function (f) { return args.indexOf(f) >= 0 || args.length === 0; };
    if (want('--lint')) {
      const r = lint(S);
      console.log('LINT ' + (r.ok ? 'PASS' : 'FAIL'));
      r.problems.forEach(function (p) { console.log('  - ' + p); });
      if (!r.ok) fail = true;
    }
    if (want('--bot')) {
      const b = bot(S);
      b.paths.forEach(function (p) { console.log('  ' + p.path.join(',') + ' -> ' + p.scene2 + ' -> ' + p.ending); });
      const ok = b.paths.length === 8 && b.paths.every(function (p) { return p.ending; }) && b.endings.length === S.endings.length;
      console.log('BOT ' + (ok ? 'PASS' : 'FAIL') + ' endings reached: ' + b.endings.join(','));
      if (!ok) fail = true;
    }
    if (want('--flip')) {
      const m = flipMatrix(S);
      ['c1', 'c2', 'c3'].forEach(function (k) { console.log('  ' + k + ': scene2Changed ' + m[k].scene2Changed + '/8, endingChanged ' + m[k].endingChanged + '/8'); });
      const ok = m.c2.endingChanged === 8 && m.c3.endingChanged === 8 && m.c1.scene2Changed === 8 && m.c1.endingChanged === 0;
      console.log('FLIP ' + (ok ? 'PASS' : 'FAIL'));
      if (!ok) fail = true;
    }
    process.exitCode = fail ? 1 : 0;
  }
  return Core;
})();
if (typeof module !== 'undefined') module.exports = Core; else window.Core = Core;
