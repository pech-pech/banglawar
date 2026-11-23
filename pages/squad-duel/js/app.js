(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  const BUILD = 'sq-ui-1';
  const doc = typeof document !== 'undefined' ? document : null;
  const qs = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : new URLSearchParams('');

  const STEP_MODULE = { manager1: 'manager', manager2: 'manager', match1: 'match', match2: 'match',
    result1: 'result', result2: 'result', tree: 'tree', pull: 'pull', end: 'end' };
  const STEPS = ['manager1', 'match1', 'result1', 'tree', 'pull', 'manager2', 'match2', 'result2', 'end'];

  function $(id) { return doc && doc.getElementById(id); }
  function tweakDefaults() { return (SD.data && SD.data.TWEAK_DEFAULTS) || {}; }

  const app = SD.app = {
    build: BUILD,
    S: null,
    m: null,
    lastReward: null,
    fast: qs.get('fast') === '1',
    _toastTimer: 0,

    // T always reflects the latest saved Tweak values (changes apply at next match start).
    get T() {
      try { if (SD.tweak && SD.tweak.values) return SD.tweak.values(); } catch (e) { /* fall through */ }
      return Object.assign({}, tweakDefaults());
    },
    get reduced() {
      let r = qs.get('reduced') === '1';
      try { if (!r && globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) r = true; } catch (e) {}
      try { if (!r && this.T.reducedMotion) r = true; } catch (e) {}
      return r;
    },

    toast(msg) {
      const el = $('toast'); if (!el) return;
      el.textContent = String(msg);
      el.classList.add('show');
      clearTimeout(app._toastTimer);
      app._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    },

    clearToast() {
      clearTimeout(app._toastTimer);
      const el = $('toast');
      if (el) { el.classList.remove('show'); el.textContent = ''; }
    },

    shortName(n, fallback) {
      const raw = String(n == null ? fallback : n).trim();
      const D = SD.data, clubs = (D && D.CLUBS) || {};
      for (const k in clubs) if (clubs[k] && (clubs[k].name === raw || clubs[k].label === raw)) return String(clubs[k].label || raw).toUpperCase();
      if (/^proud preston$/i.test(raw)) return 'PRESTON';
      const w = raw.split(/\s+/);
      return (w[w.length - 1] || raw).toUpperCase().slice(0, 9);
    },

    setScorebug(v) {
      const el = $('scorebug'); if (!el) return;
      el.textContent = '';
      if (v && typeof v === 'object') {
        const mk = (cls, t) => { const s = doc.createElement('span'); s.className = cls; s.textContent = t; return s; };
        el.append(mk('sb-team sb-home', app.shortName(v.home, 'PRESTON')), mk('sb-score', v.hs != null ? v.hs : 0),
          mk('sb-score', v.as != null ? v.as : 0), mk('sb-team sb-away', app.shortName(v.away, '')));
      } else el.textContent = v == null ? 'SQUAD DUEL' : String(v);
    },

    save() {
      try { if (app.S && SD.progress && SD.progress.save) return SD.progress.save(app.S); } catch (e) {}
      return false;
    },

    go(step) {
      app.clearToast();
      if (app.S) { app.S.step = step; app.save(); }
      app.render();
    },

    render() {
      const el = $('screen'); if (!el) return;
      app.clearToast();
      el.textContent = '';
      el.scrollTop = 0;
      if (doc) doc.body.classList.toggle('reduced', app.reduced);
      const step = app.S && app.S.step;
      if (!step) return app.renderStart();
      if (!/^match/.test(step)) app.setScorebug('SQUAD DUEL');
      const key = STEP_MODULE[step];
      const mod = key && SD.ui && SD.ui[key];
      if (!mod || typeof mod.render !== 'function') {
        app.toast('missing module ui.' + key);
        return app.fallback(el, 'Missing module: ui.' + key + ' (step ' + step + ')');
      }
      try { mod.render(el); }
      catch (e) {
        console.error('[squad-duel] render ' + step, e);
        app.toast('error in ui.' + key + ': ' + (e && e.message));
        app.fallback(el, 'ui.' + key + ' failed: ' + (e && e.message));
      }
    },

    fallback(el, text) {
      const d = doc.createElement('div'); d.className = 'sd-fallback';
      const p = doc.createElement('p'); p.textContent = text;
      const b = doc.createElement('button'); b.type = 'button'; b.id = 'btn-fallback-start'; b.textContent = 'Back to start';
      b.addEventListener('click', () => { app.S = null; app.render(); });
      d.append(p, b); el.append(d);
    },

    renderStart() {
      const el = $('screen');
      app.setScorebug('SQUAD DUEL');
      const has = !!(app.saved && app.saved.step);
      el.innerHTML = '<section id="start"><h1>SQUAD DUEL</h1><div class="sub">Proud Preston</div>' +
        '<p class="tag">2 matches. Pick, play, pull a new player.</p>' +
        '<div class="btns">' + (has ? '<button type="button" id="btn-continue" class="primary">Continue</button>' : '') +
        '<button type="button" id="btn-new"' + (has ? '' : ' class="primary"') + '>New game</button></div>' +
        '<div id="build-id">build ' + BUILD + '</div></section>';
      const c = $('btn-continue');
      if (c) c.addEventListener('click', () => { app.S = app.saved; app.saved = null; app.go(app.S.step); });
      const n = $('btn-new');
      n.addEventListener('click', () => {
        if (has && !app._confirmNew) { app._confirmNew = true; n.textContent = 'Tap again: erase save'; return; }
        app._confirmNew = false;
        app.newGame();
      });
    },

    newGame(seed) {
      if (!SD.progress || !SD.rng) { app.toast('missing module progress/rng'); return; }
      const s = seed != null ? seed : (qs.get('seed') != null && qs.get('seed') !== '' ? (Number(qs.get('seed')) >>> 0) : SD.rng.newGameSeed());
      try { SD.progress.wipe(); } catch (e) {}
      app.S = SD.progress.newState(s);
      app.S.build = BUILD;
      app.S.step = 'manager1';
      app.m = null; app.lastReward = null;
      app.go('manager1');
    },

    matchNo() {
      const S = app.S;
      try { if (SD.progress && SD.progress.matchNo) return SD.progress.matchNo(S); } catch (e) {}
      return /2$/.test(S.step) ? 2 : 1;
    },

    matchSetup() {
      const S = app.S, T = app.T, P = SD.progress, D = SD.data;
      const matchNo = app.matchNo();
      const clubId = D.FIXTURES[matchNo - 1];
      const base = D.CLUBS[clubId];
      const club = JSON.parse(JSON.stringify(base));
      // admin default: club stats come from T keys (grimsbyDef etc.); fall back to data values.
      const pre = clubId === 'reading' ? 'reading' : 'grimsby';
      const num = (v, d) => (typeof v === 'number' ? v : d);
      club.def = num(T[pre + 'Def'], base.def);
      club.atk = num(T[pre + 'Atk'], base.atk);
      club.keeper = Object.assign({}, base.keeper, { def: num(T[pre + 'Keeper'], base.keeper.def) });
      const L = S.lineup;
      const st = pid => P.statsOf(S, pid, T);
      return {
        seed: SD.rng.matchSeed(S.seed, matchNo), matchNo, club, formation: S.formation,
        keeper: st(L.keeper), outfield: L.outfield.map(st), bench: L.bench.map(st),
        nodes: (S.nodes || []).slice(), T
      };
    },

    endMatch(m) {
      const S = app.S, T = app.T;
      const summary = SD.engine.summary(m);
      app.m = m;
      app.lastReward = SD.progress.applyMatch(S, summary, T);
      (S.reports = S.reports || []).push((m.log || []).slice());
      app.go('result' + summary.matchNo);
    },

    boot() {
      if (qs.get('reset') === '1') { try { SD.progress && SD.progress.wipe(); } catch (e) {} }
      let saved = null;
      try { saved = SD.progress && SD.progress.load ? SD.progress.load() : null; } catch (e) {}
      app.saved = saved && saved.step && STEPS.indexOf(saved.step) >= 0 ? saved : null;
      if (doc) doc.body.classList.toggle('reduced', app.reduced);
      const gear = $('gear');
      if (gear) gear.addEventListener('click', () => {
        if (SD.tweak && SD.tweak.open) SD.tweak.open(); else app.toast('missing module tweak');
      });
      try { SD.tweak && SD.tweak.syncDev && SD.tweak.syncDev(); } catch (e) { console.error(e); }
      app.S = null;
      app.render();
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
    }
  };

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', app.boot);
    else app.boot();
  }
})();
