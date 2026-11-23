(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  const BUILD = 'sq-season-1';
  const doc = typeof document !== 'undefined' ? document : null;
  const qs = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : new URLSearchParams('');

  const STEP_MODULE = { hub: 'hub', table: 'table', mdres: 'mdres', cupintro: 'cupintro', end: 'seasonEnd', shootout: 'shootout',
    manager: 'manager', match: 'match', result: 'result', tree: 'tree', pull: 'pull' };
  const STEPS = ['hub', 'table', 'manager', 'match', 'result', 'mdres', 'tree', 'pull', 'cupintro', 'shootout', 'end'];

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
        if (v.tag) { const t = mk('sb-tag', v.tag); t.style.cssText = 'flex:0 0 auto;font-size:12px;letter-spacing:.06em;color:var(--gold);border:1px solid var(--gold);border-radius:6px;padding:1px 6px'; el.append(t); }
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
      if (step !== 'match') app.setScorebug('SQUAD DUEL');
      const key = STEP_MODULE[step];
      let mod = key && SD.ui && SD.ui[key];
      if ((!mod || typeof mod.render !== 'function') && step === 'end' && SD.ui && SD.ui.end) mod = SD.ui.end;
      if ((!mod || typeof mod.render !== 'function') && app.fallbackHub[step]) return app.fallbackHub[step](el);
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
      if (SD.ui && SD.ui.start && typeof SD.ui.start.render === 'function') {
        try { SD.ui.start.render(el); return; } catch (e) { console.error('[squad-duel] ui.start', e); el.textContent = ''; }
      }
      const has = !!(app.saved && app.saved.step);
      el.innerHTML = '<section id="start"><h1>SQUAD DUEL</h1><div class="sub">Proud Preston</div>' +
        '<p class="tag">A season of 7 matches and a Cup Final.</p>' +
        '<div class="btns">' + (has ? '<button type="button" id="btn-continue" class="primary">Continue</button>' : '') +
        '<button type="button" id="btn-new"' + (has ? '' : ' class="primary"') + '>New game</button></div>' +
        '<div id="build-id">build ' + BUILD + '</div></section>';
      const c = $('btn-continue');
      if (c) c.addEventListener('click', () => app.continueGame());
      const n = $('btn-new');
      n.addEventListener('click', () => {
        if (has && !app._confirmNew) { app._confirmNew = true; n.textContent = 'Tap again: erase save'; return; }
        app._confirmNew = false;
        app.newGame();
      });
    },

    // Minimal stand-ins used only when a season UI module is missing (so the flow stays playable).
    fallbackHub: {
      hub(el) {
        const S = app.S, f = SD.season && SD.season.fixtureFor ? SD.season.fixtureFor(S) : null;
        el.innerHTML = '<section id="hub"><h2>Hub</h2><p id="hub-opp">' + (f ? 'Next: matchday ' + f.md + ' v ' + f.clubId : 'League done') + '</p>' +
          '<div class="btns"><button type="button" id="hub-play" class="primary">Play</button><button type="button" id="hub-lineup">Squad</button>' +
          '<button type="button" id="hub-tree">Skills</button><button type="button" id="hub-pull">Pull</button><button type="button" id="hub-table">Table</button></div></section>';
        const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
        on('hub-play', () => app.play()); on('hub-lineup', () => app.go('manager')); on('hub-tree', () => app.go('tree'));
        on('hub-pull', () => app.go('pull')); on('hub-table', () => app.go('table'));
      },
      table(el) { app.fallbackHub.simple(el, 'table', 'Table'); },
      mdres(el) { app.fallbackHub.simple(el, 'mdres', 'Matchday results'); },
      cupintro(el) {
        el.innerHTML = '<section id="cupintro"><h2>Cup Final</h2><p>' + ((SD.season && SD.season.cupLine && SD.season.cupLine()) || '') + '</p><button type="button" id="btn-cup-kick" class="primary">Kick off</button></section>';
        $('btn-cup-kick').addEventListener('click', () => app.go('match'));
      },
      end(el) {
        el.innerHTML = '<section id="season-end"><h2>Season over</h2><button type="button" id="btn-next-season" class="primary">Next season</button></section>';
        $('btn-next-season').addEventListener('click', () => app.nextSeason());
      },
      shootout(el) {
        el.innerHTML = '<section id="shootout"><h2>Shootout</h2><button type="button" id="btn-sh-done" class="primary">Skip</button></section>';
        $('btn-sh-done').addEventListener('click', () => app.endShootout({ score: { me: 1, opp: 0 } }));
      },
      simple(el, id, title) {
        el.innerHTML = '<section id="' + id + '"><h2>' + title + '</h2><button type="button" id="btn-hub" class="primary">Back</button></section>';
        $('btn-hub').addEventListener('click', () => app.toHub());
      }
    },

    continueGame() {
      if (!app.saved) return;
      app.S = app.saved; app.saved = null;
      app.ensureSeason();
      app.lastMd = app.S.lastMd || null; app.lastShoot = app.S.lastShoot || null; app.lastReward = app.S.lastReward || null;
      let step = app.S.step;
      if ((step === 'result' || step === 'shootout') && !app.m) {
        // m is not saved: rebuild a finished/level match from the live input log, else fall forward.
        const L = app.S.live;
        if (L && L.setup && SD.ui && SD.ui.match && SD.ui.match.rebuild) {
          try { app.m = SD.ui.match.rebuild(L.setup, L.inputs); } catch (e) { console.error('rebuild', e); }
        }
        if (step === 'result' && !app.m) return app.afterResult();
        if (step === 'shootout' && !app.m) step = 'hub';
      }
      app.go(step);
    },

    ensureSeason() {
      const S = app.S;
      if (S && !S.season && SD.season && SD.season.newSeason) S.season = SD.season.newSeason(S, 1);
    },

    newGame(seed) {
      if (!SD.progress || !SD.rng) { app.toast('missing module progress/rng'); return; }
      const s = seed != null ? seed : (qs.get('seed') != null && qs.get('seed') !== '' ? (Number(qs.get('seed')) >>> 0) : SD.rng.newGameSeed());
      try { SD.progress.wipe(); } catch (e) {}
      app.S = SD.progress.newState(s);
      app.S.build = BUILD;
      app.ensureSeason();
      app.m = null; app.lastReward = null; app.lastMd = null; app.lastShoot = null;
      app.go('hub');
    },

    // True when the next match is the Cup Final (league done, not yet played).
    isCupNext() {
      const S = app.S, se = S && S.season;
      return !!(se && se.md >= 7 && !(se.cup && se.cup.played));
    },

    matchSetup() {
      const S = app.S, T = app.T, P = SD.progress, D = SD.data;
      app.ensureSeason();
      const SE = SD.season, hasSeason = !!(SE && SE.fixtureFor && S.season);
      let clubId, md, mode = 'home', homeSide = 'me', cup = false;
      if (hasSeason) {
        const fx = SE.fixtureFor(S);
        if (fx) { clubId = fx.clubId; md = fx.md; mode = fx.mode; homeSide = fx.home ? 'me' : 'opp'; }
        else {
          cup = true; md = 8; mode = 'neutral'; homeSide = 'none';
          const g = SE.cupGate(S); clubId = (S.season.cup && S.season.cup.opp) || (g && g.opp) || D.FIXTURES[0];
        }
      } else { md = (SD.progress.matchNo ? SD.progress.matchNo(S) : 1); clubId = D.FIXTURES[md - 1] || D.FIXTURES[0]; }
      let club;
      if (hasSeason && SE.clubFor) club = SE.clubFor(S, clubId, T, md);
      else club = JSON.parse(JSON.stringify(D.CLUBS[clubId]));
      const L = S.lineup, st = pid => P.statsOf(S, pid, T);
      const no = hasSeason ? S.season.no : 1;
      const hasS3 = (S.nodes || []).indexOf('S3') >= 0;
      return {
        seed: SD.rng.matchSeed(S.seed, no * 16 + md), matchNo: md, md, season: no, club, formation: S.formation,
        keeper: st(L.keeper), outfield: L.outfield.map(st), bench: L.bench.map(st),
        nodes: (S.nodes || []).slice(), T, mode, homeSide, cup, captain: hasS3 ? (S.captain || null) : null
      };
    },

    endMatch(m) {
      const s = m.score;
      if (m.setup && m.setup.cup && s.me === s.opp) {
        app.m = m; app.go('shootout'); return;
      }
      app.finishMatch(m, null);
    },

    endShootout(sh) {
      app.finishMatch(app.m, { me: sh.score.me, opp: sh.score.opp });
    },

    finishMatch(m, shoot) {
      const S = app.S, T = app.T;
      app.m = m;
      const summary = SD.engine.summary(m);
      if (summary.season == null) summary.season = m.setup.season;
      if (summary.md == null) summary.md = m.setup.md;
      if (shoot) summary.shoot = shoot;
      app.lastShoot = shoot || null;
      app.lastReward = SD.progress.applyMatch(S, summary, T);
      (S.reports = S.reports || []).push((m.log || []).slice());
      app.lastMd = null;
      if (SD.season && S.season) {
        try {
          if (m.setup.cup) SD.season.recordCup(S, m.score.me, m.score.opp, shoot || null);
          else app.lastMd = SD.season.recordMatchday(S, m.score.me, m.score.opp, T);
        } catch (e) { console.error('season record', e); }
      }
      S.live = null;
      S.lastMd = app.lastMd; S.lastShoot = app.lastShoot; S.lastReward = app.lastReward;
      app.go('result');
    },

    afterResult() {
      const S = app.S;
      if (S && S.season && (S.season.done || (app.m && app.m.setup && app.m.setup.cup))) return app.go('end');
      app.go('mdres');
    },

    toHub() { app.go('hub'); },

    play() {
      const S = app.S, se = S.season;
      if (!se || !SD.season) return app.go('manager');
      if (se.md < 7) return app.go('manager');
      if (!(se.cup && se.cup.played) && SD.season.cupGate(S).reached) return app.go('cupintro');
      app.go('end');
    },

    nextSeason() {
      const S = app.S, T = app.T;
      if (SD.season) {
        try { SD.season.endSeason(S, T); SD.season.nextSeason(S); } catch (e) { console.error('nextSeason', e); }
      }
      S.live = null; app.m = null; app.lastMd = null; app.lastShoot = null; app.lastReward = null;
      app.go('hub');
    },

    // ---- debug / QA
    debug: {
      // Builds a valid state for ?jump=...; wins every league match 3-0 unless a different count is asked.
      fakeLeague(n, me, opp) {
        const S = app.S, T = app.T;
        for (let i = 0; i < n; i++) SD.season.recordMatchday(S, me == null ? 3 : me, opp == null ? 0 : opp, T);
      },
      // Auto-plays n league matches with a simple policy (first card, best legal action), through the real flow.
      simLeague(n) {
        const E = SD.engine;
        for (let i = 0; i < n; i++) {
          if (!SD.season.fixtureFor(app.S)) break;
          const m = E.newMatch(app.matchSetup());
          let guard = 0;
          while (m.phase !== 'full' && guard++ < 200) {
            if (m.phase === 'halftime') { E.startHalf2(m); continue; }
            if (m.phase === 'attack') {
              const pid = m.hand[0], acts = E.legal(m, pid);
              E.playAttack(m, pid, acts.indexOf('pass') >= 0 ? 'pass' : acts[0]);
            } else if (m.phase === 'defend') {
              const dc = (E.defendCards && E.defendCards(m, true)) || m.hand;
              E.playDefend(m, (dc && dc[0]) || m.hand[0], 'drop');
            } else break;
            E.nextPhase(m);
          }
          app.m = m;
          app.finishMatch(m, null);
        }
        return SD.season.place(app.S);
      },
      jump(name) {
        const S = app.S, T = app.T;
        if (!SD.season) return false;
        const league7 = () => { if (S.season.md < 7) app.debug.fakeLeague(7 - S.season.md); };
        if (name === 'table' || name === 'mdres') { app.debug.fakeLeague(2); app.lastMd = S.lastMd = null; }
        if (name === 'cupintro' || name === 'end' || name === 'shootout') league7();
        if (name === 'end') { SD.season.recordCup(S, 2, 1, null); }
        if (name === 'shootout') {
          const m = SD.engine.newMatch(app.matchSetup());
          m.score.me = 1; m.score.opp = 1; m.phase = 'full'; app.m = m;
        }
        if (name === 'card') app.openCard = (S.lineup.outfield && S.lineup.outfield[0]) || null;
        return true;
      }
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
      const jump = qs.get('jump');
      if (jump && SD.progress && SD.rng) {
        const seed = qs.get('seed') !== null && qs.get('seed') !== '' ? (Number(qs.get('seed')) >>> 0) : 1;
        try { SD.progress.wipe(); } catch (e) {}
        app.S = SD.progress.newState(seed); app.S.build = BUILD; app.ensureSeason();
        try { app.debug.jump(jump); } catch (e) { console.error('jump', e); }
        const step = jump === 'card' ? 'manager' : jump;
        app.go(STEPS.indexOf(step) >= 0 ? step : 'hub');
      } else app.render();
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
