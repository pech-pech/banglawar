(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  const KEY_T = 'squadDuel.tweak.v1';
  const KEY_P = 'squadDuel.presets.v1';
  const BUILD = 'sq-slice-1';

  // admin default: fallback copy of CONTRACT section 9, used only when SD.data.TWEAK_DEFAULTS is missing (stubbed self-test).
  const FALLBACK_DEFAULTS = {
    die: 6, halfTurns: 6, handSize: 3, cap: 3, passBonus: 2, buildMax: 2, formCounter: 3, roarAt: 3,
    tellOn: true, coarseChip: false, flatterStarters: false, reducedMotion: false, autoNext: true,
    grimsbyDef: 4, grimsbyKeeper: 7, grimsbyAtk: 7, readingDef: 5, readingKeeper: 8, readingAtk: 7,
    trailShift: 0.1, openingCoins: 100, openingSP: 3, pullCost: 100, starterRare: 70, starterEpic: 25, starterLegend: 5,
    pityEpic: 10, xpGoal: 10, xpDuel: 3, xpWin: 20, respecCost: 50, fxOff: {}
  };
  const BOOLS = { tellOn: 1, coarseChip: 1, flatterStarters: 1, reducedMotion: 1, autoNext: 1 };
  const GROUPS = {
    Match: ['die', 'halfTurns', 'handSize', 'cap', 'passBonus', 'buildMax', 'formCounter', 'roarAt', 'trailShift'],
    Display: ['tellOn', 'coarseChip', 'reducedMotion', 'autoNext'],
    Clubs: ['grimsbyDef', 'grimsbyKeeper', 'grimsbyAtk', 'readingDef', 'readingKeeper', 'readingAtk'],
    Squad: ['flatterStarters'],
    Rewards: ['openingCoins', 'openingSP', 'xpGoal', 'xpDuel', 'xpWin', 'respecCost'],
    Pulls: ['pullCost', 'starterRare', 'starterEpic', 'starterLegend', 'pityEpic']
  };

  // ---------- helpers ----------
  function lsGet(k) { try { return globalThis.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { globalThis.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function parse(s, dflt) { try { const o = JSON.parse(s); return (o && typeof o === 'object') ? o : dflt; } catch (e) { return dflt; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaults() {
    const d = SD.data && SD.data.TWEAK_DEFAULTS;
    return clone(d && typeof d === 'object' ? d : FALLBACK_DEFAULTS);
  }
  function meta() {
    const m = SD.data && SD.data.TWEAK_META;
    if (Array.isArray(m) && m.length) return m;
    const d = FALLBACK_DEFAULTS, out = [];
    Object.keys(GROUPS).forEach(function (g) {
      GROUPS[g].forEach(function (k) {
        if (!(k in d)) return;
        const isB = !!BOOLS[k];
        out.push({ key: k, label: k, group: g, min: 0, max: isB ? 1 : 1000, step: (k === 'trailShift' ? 0.05 : 1), type: isB ? 'bool' : 'num' });
      });
    });
    return out;
  }
  function metaOf(k) { return meta().find(function (x) { return x.key === k; }) || null; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function b64enc(s) {
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
    return Buffer.from(s, 'utf8').toString('base64');
  }
  function b64dec(s) {
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(s)));
    return Buffer.from(s, 'base64').toString('utf8');
  }
  function toast(msg) { try { if (SD.app && SD.app.toast) SD.app.toast(msg); } catch (e) { /* ignore */ } }

  // ---------- state: overrides = only changed keys ----------
  function loadOverrides() { return parse(lsGet(KEY_T), {}); }
  function saveOverrides(o) { lsSet(KEY_T, JSON.stringify(o)); }
  function coerce(key, v) {
    const d = defaults();
    if (!(key in d) || key === 'fxOff') return undefined;
    const mt = metaOf(key);
    if (typeof d[key] === 'boolean') return (v === true || v === 1 || v === 'true' || v === '1');
    let n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return undefined;
    if (mt && isFinite(mt.min)) n = Math.max(mt.min, n);
    if (mt && isFinite(mt.max)) n = Math.min(mt.max, n);
    return n;
  }
  function cleanOverrides(o) {
    const d = defaults(), out = {};
    Object.keys(o || {}).forEach(function (k) {
      const v = coerce(k, o[k]);
      if (v !== undefined && !same(v, d[k])) out[k] = v;
    });
    return out;
  }
  function values() {
    const t = Object.assign(defaults(), cleanOverrides(loadOverrides()));
    if (!t.fxOff || typeof t.fxOff !== 'object') t.fxOff = {};
    return t;
  }
  function changed() { return cleanOverrides(loadOverrides()); }
  function isDev() { return Object.keys(changed()).length > 0; }
  function syncDev() {
    try {
      const d = document.getElementById('dev');
      if (d) d.hidden = !isDev();
    } catch (e) { /* ignore */ }
  }
  function setValue(key, v) {
    const o = loadOverrides();
    const c = coerce(key, v);
    if (c === undefined) return false;
    o[key] = c;
    saveOverrides(cleanOverrides(o));
    afterChange();
    return true;
  }
  function afterChange() {
    syncDev();
    try { if (SD.app && typeof SD.app.onTweak === 'function') SD.app.onTweak(values()); } catch (e) { /* ignore */ }
    try { globalThis.dispatchEvent && globalThis.dispatchEvent(new Event('sd-tweak')); } catch (e) { /* ignore */ }
  }
  function replaceAll(o) { saveOverrides(cleanOverrides(o)); afterChange(); }
  function resetAll() { saveOverrides({}); afterChange(); }

  // ---------- presets ----------
  const BUILTIN = [{ name: 'Flatter starters', keys: { flatterStarters: true }, builtin: true }];
  function loadPresets() { return parse(lsGet(KEY_P), {}); }
  function savePresets(p) { return lsSet(KEY_P, JSON.stringify(p)); }
  function cleanName(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24); }
  function savePreset(name) {
    name = cleanName(name);
    if (!name) return { ok: false, why: 'Type a preset name first' };
    if (BUILTIN.some(function (b) { return b.name.toLowerCase() === name.toLowerCase(); })) return { ok: false, why: 'That name is built in' };
    const p = loadPresets();
    p[name] = changed();
    if (!savePresets(p)) return { ok: false, why: 'Could not save on this device' };
    return { ok: true, name: name };
  }
  function loadPreset(name) {
    const b = BUILTIN.find(function (x) { return x.name === name; });
    const keys = b ? b.keys : loadPresets()[name];
    if (!keys) return false;
    replaceAll(keys);
    return true;
  }
  function deletePreset(name) {
    const p = loadPresets();
    if (!(name in p)) return false;
    delete p[name];
    savePresets(p);
    return true;
  }
  function presetCode() { return 'SDP1:' + b64enc(JSON.stringify(changed())); }
  function applyCode(code) {
    code = String(code || '').trim();
    if (code.indexOf('SDP1:') !== 0) return { ok: false, why: 'Code must start with SDP1:' };
    let o;
    try { o = JSON.parse(b64dec(code.slice(5))); } catch (e) { return { ok: false, why: 'Code is not readable' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, why: 'Code is not readable' };
    const clean = cleanOverrides(o);
    replaceAll(clean);
    return { ok: true, n: Object.keys(clean).length };
  }

  // ---------- clipboard ----------
  function copyText(text) {
    function fallback() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(fallback());
  }

  // ---------- report ----------
  function nameOf(pid) {
    if (!pid) return '-';
    try { const p = SD.data && SD.data.byId && SD.data.byId(pid); if (p && p.name) return p.name; } catch (e) { /* ignore */ }
    return String(pid);
  }
  function fxName(id) {
    try { const d = SD.fxDefs && SD.fxDefs[id]; if (d && d.name) return d.name; } catch (e) { /* ignore */ }
    return String(id);
  }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function pct(p) {
    if (typeof p !== 'number' || !isFinite(p)) return '?';
    try { if (SD.odds && SD.odds.pct) return SD.odds.pct(p); } catch (e) { /* ignore */ }
    return Math.round(p * 100) + '%';
  }
  function dice(ev) {
    const d = ev.dice;
    if (!d) return '-';
    let s = d.att + ' v ' + d.def;   // attacker die v defender die
    (ev.rerolls || []).forEach(function (r) { s += ' (reroll ' + r.who + ' ' + r.from + '>' + r.to + (r.by ? ' ' + fxName(r.by) : '') + ')'; });
    return s;
  }
  function eventLine(mNo, ev) {
    const head = 'M' + mNo + ' H' + ev.half + ' T' + ev.turn + ' ' + ev.side + ' Z' + ev.zone;
    const hand = 'hand ' + (ev.hand || []).map(nameOf).join(',');
    const fx = (ev.fxFired && ev.fxFired.length) ? ' | fx ' + ev.fxFired.map(fxName).join(', ')
      : ((ev.tags && ev.tags.length) ? ' | fx ' + ev.tags.join(', ') : '');
    const odds = (ev.chip && typeof ev.chip.p === 'number') ? pct(ev.chip.p) : '?';
    const aft = ev.after || {};
    if (ev.side === 'me') {
      const pw = (ev.chip && typeof ev.chip.pressW === 'number' && (ev.action === 'dribble' || ev.action === 'through'))
        ? ' (Press ' + Math.round(ev.chip.pressW * 100) + ')' : '';
      let res;
      if (ev.goal === 'me') res = 'GOAL ' + (ev.score ? ev.score.me + '-' + ev.score.opp : '');
      else if (ev.win) res = 'won -> Z' + aft.zone;
      else res = 'lost -> opp Z' + aft.zone;
      return head + ' | ' + hand + ' | card ' + nameOf(ev.pid) + ' ' + ev.action +
        ' | odds ' + odds + pw + ' | dice ' + dice(ev) + ' | ' + res.trim() + fx;
    }
    // defend turn: card + my stance, club action, odds = my chance as shown to me (admin default: chip.p is P I win)
    const card = ev.pid ? nameOf(ev.pid) + ' ' + cap(ev.stance) : '- (keeper) ' + cap(ev.stance || '');
    let res;
    if (ev.goal === 'opp') res = 'GOAL against ' + (ev.score ? ev.score.me + '-' + ev.score.opp : '');
    else if (ev.save) res = 'saved';
    else if (ev.meWon) res = 'held';
    else res = 'beaten -> Z' + aft.zone;
    return head + ' | ' + hand + ' | card ' + card + ' | club ' + ev.action +
      ' | odds ' + odds + ' | dice ' + dice(ev) + ' | ' + res.trim() + fx;
  }
  function share(map, total) {
    const keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
    if (!keys.length) return 'none';
    return keys.map(function (k) { return k + ' ' + map[k] + ' (' + Math.round(100 * map[k] / total) + '%)'; }).join(', ');
  }
  function matchSummary(mNo, log, S) {
    const atkCard = {}, atkAct = {}, defCard = {}, defStance = {};
    let atk = 0, def = 0, atkWon = 0, defHeld = 0, goalsFor = 0, goalsAgainst = 0, distinctHand = 0;
    log.forEach(function (ev) {
      if (ev.side === 'me') {
        atk++; if (ev.win) atkWon++;
        const n = nameOf(ev.pid);
        atkCard[n] = (atkCard[n] || 0) + 1;
        atkAct[ev.action] = (atkAct[ev.action] || 0) + 1;
        if ((ev.hand || []).length > 1) distinctHand++;
      } else {
        def++; if (ev.meWon || ev.save) defHeld++;
        if (ev.pid) { const n = nameOf(ev.pid); defCard[n] = (defCard[n] || 0) + 1; }
        if (ev.stance) defStance[ev.stance] = (defStance[ev.stance] || 0) + 1;
      }
      if (ev.goal === 'me') goalsFor++;
      if (ev.goal === 'opp') goalsAgainst++;
    });
    const r = (S && S.results && S.results[mNo - 1]) || null;
    const lines = [];
    lines.push('M' + mNo + ' SUMMARY' + (r ? ' | v ' + r.club + ' ' + r.me + '-' + r.opp + ' ' + r.res : ' | (in progress, goals ' + goalsFor + '-' + goalsAgainst + ')'));
    lines.push('  attack turns ' + atk + ', won ' + atkWon + (atk ? ' (' + Math.round(100 * atkWon / atk) + '%)' : ''));
    lines.push('  attack pick share per card: ' + share(atkCard, atk));
    lines.push('  attack action share: ' + share(atkAct, atk));
    lines.push('  choice check: ' + Object.keys(atkCard).length + ' different cards used over ' + atk + ' attack turns (' + distinctHand + ' turns had a real choice of 2+ cards)');
    lines.push('  defend turns ' + def + ', held/saved ' + defHeld);
    lines.push('  defend pick share per card: ' + share(defCard, Math.max(1, Object.keys(defCard).reduce(function (a, k) { return a + defCard[k]; }, 0))));
    lines.push('  stance share: ' + share(defStance, Math.max(1, def)));
    return lines.join('\n');
  }
  function report() {
    const A = SD.app || {};
    const S = A.S || {};
    const T = values(), D = defaults();
    const out = [];
    out.push('SQUAD DUEL REPORT | build ' + (S.build || BUILD) + ' | seed ' + (S.seed != null ? S.seed : '?') + ' | step ' + (S.step || '?'));
    const diffs = Object.keys(T).filter(function (k) { return k !== 'fxOff' && !same(T[k], D[k]); })
      .map(function (k) { return k + ' ' + D[k] + '->' + T[k]; });
    const fxo = Object.keys(T.fxOff || {}).filter(function (k) { return T.fxOff[k]; });
    out.push('Tweak: ' + (diffs.length ? 'DEV ' + diffs.join(', ') : 'all defaults') + (fxo.length ? ' | fxOff ' + fxo.join(',') : ''));
    const L = S.lineup;
    if (L) out.push('Lineup: GK ' + nameOf(L.keeper) + ' | outfield ' + (L.outfield || []).map(nameOf).join(', ') + ' | bench ' + (L.bench || []).map(nameOf).join(', '));
    out.push('Formation: ' + (S.formation || '?') + ' | nodes ' + ((S.nodes && S.nodes.length) ? S.nodes.join(',') : 'none') +
      (S.spent ? ' | spent a' + S.spent.attack + ' d' + S.spent.defence + ' s' + S.spent.squad : ''));
    if (S.owned) out.push('Owned: ' + Object.keys(S.owned).map(function (k) { const o = S.owned[k]; return nameOf(k) + ' *' + o.stars + ' L' + o.level + ' xp' + o.xp; }).join(', '));
    out.push('Coins ' + (S.coins != null ? S.coins : '?') + ' | SP ' + (S.sp != null ? S.sp : '?') + ' | pulls ' + (S.pulls || 0));
    out.push('Results: ' + ((S.results && S.results.length) ? S.results.map(function (r) { return 'M' + r.matchNo + ' v ' + r.club + ' ' + r.me + '-' + r.opp + ' ' + r.res; }).join('; ') : 'none yet'));
    out.push('Legend: dice = attacker die v defender die; odds = chance shown to me; Z0/1/2 = Defence/Midfield/Attack in holder view.');

    const logs = [];
    (S.reports || []).forEach(function (l, i) { if (Array.isArray(l)) logs[i] = l; });
    const live = A.m;
    if (live && Array.isArray(live.log) && live.log.length) {
      const idx = ((live.setup && live.setup.matchNo) || (logs.length + 1)) - 1;
      if (!logs[idx] || !logs[idx].length) logs[idx] = live.log;
    }
    for (let i = 0; i < logs.length; i++) {
      if (!logs[i]) continue;
      out.push('');
      out.push('--- Match ' + (i + 1) + (S.reports && S.reports[i] ? '' : ' (live)') + ' ---');
      logs[i].forEach(function (ev) { out.push(eventLine(i + 1, ev)); });
      out.push(matchSummary(i + 1, logs[i], S));
    }
    if (!logs.some(Boolean)) out.push('(no matches played yet)');
    return out.join('\n');
  }
  function copyReport() {
    return copyText(report()).then(function (ok) {
      toast(ok ? 'Report copied' : 'Copy failed, select the text and copy by hand');
      return ok;
    });
  }

  // ---------- overlay ----------
  let root = null;
  function msg(t, bad) {
    const m = root && root.querySelector('#tw-msg');
    if (m) { m.textContent = t || ''; m.className = bad ? 'bad' : ''; }
  }
  function markRow(row, key) {
    const d = defaults()[key];
    row.classList.toggle('chg', !same(values()[key], d));
  }
  function buildRows(host) {
    const T = values(), D = defaults();
    const groups = [], gm = {};
    meta().forEach(function (mt) {
      if (mt.key === 'fxOff') return;
      if (!gm[mt.group]) { gm[mt.group] = []; groups.push(mt.group); }
      gm[mt.group].push(mt);
    });
    groups.forEach(function (g) {
      host.appendChild(el('h3', { text: g }));
      gm[g].forEach(function (mt) {
        const row = el('label', { class: 'row', 'data-row': mt.key });
        const lab = el('span', { class: 'lab' }, [el('b', { text: mt.label || mt.key }), el('i', { text: 'default ' + (typeof D[mt.key] === 'boolean' ? (D[mt.key] ? 'on' : 'off') : D[mt.key]) })]);
        let inp;
        if (mt.type === 'bool' || typeof D[mt.key] === 'boolean') {
          inp = el('input', { type: 'checkbox', 'data-key': mt.key });
          inp.checked = !!T[mt.key];
          inp.addEventListener('change', function () { setValue(mt.key, inp.checked); markRow(row, mt.key); });
        } else {
          inp = el('input', { type: 'number', inputmode: 'decimal', 'data-key': mt.key, min: mt.min, max: mt.max, step: mt.step || 1 });
          inp.value = T[mt.key];
          inp.addEventListener('input', function () {
            const v = parseFloat(inp.value);
            if (isFinite(v) && (mt.min == null || v >= mt.min) && (mt.max == null || v <= mt.max)) { setValue(mt.key, v); markRow(row, mt.key); }
          });
          inp.addEventListener('change', function () {
            if (!setValue(mt.key, inp.value)) { /* bad text: restore */ }
            inp.value = values()[mt.key]; markRow(row, mt.key);
          });
        }
        row.appendChild(lab); row.appendChild(inp);
        markRow(row, mt.key);
        host.appendChild(row);
      });
    });
  }
  function refreshInputs() {
    if (!root) return;
    const T = values();
    root.querySelectorAll('[data-key]').forEach(function (i) {
      const k = i.getAttribute('data-key');
      if (i.type === 'checkbox') i.checked = !!T[k]; else i.value = T[k];
      const row = i.closest('.row'); if (row) markRow(row, k);
    });
  }
  function renderPresets() {
    const host = root && root.querySelector('#preset-list');
    if (!host) return;
    host.textContent = '';
    const all = BUILTIN.concat(Object.keys(loadPresets()).sort().map(function (n) { return { name: n, keys: loadPresets()[n] }; }));
    all.forEach(function (p) {
      const n = Object.keys(p.keys || {}).length;
      const row = el('div', { class: 'preset', 'data-name': p.name }, [
        el('span', { class: 'pn' }, [el('b', { text: p.name }), el('i', { text: p.builtin ? 'built in' : (n + ' changed') })]),
        el('button', { type: 'button', class: 'pr-load', text: 'Load' })
      ]);
      row.querySelector('.pr-load').addEventListener('click', function () {
        loadPreset(p.name); refreshInputs(); msg('Loaded "' + p.name + '". Applies at next match start.');
      });
      if (!p.builtin) {
        const del = el('button', { type: 'button', class: 'pr-del', text: 'Delete' });
        let armed = 0;
        del.addEventListener('click', function () {
          if (!armed) { armed = 1; del.textContent = 'Sure?'; del.classList.add('arm'); setTimeout(function () { armed = 0; del.textContent = 'Delete'; del.classList.remove('arm'); }, 3000); return; }
          deletePreset(p.name); renderPresets(); msg('Deleted "' + p.name + '".');
        });
        row.appendChild(del);
      }
      host.appendChild(row);
    });
  }
  function build() {
    const S = (SD.app && SD.app.S) || {};
    const r = el('div', { id: 'tweak', role: 'dialog', 'aria-label': 'Tweak menu' });
    const head = el('div', { class: 'tw-head' }, [
      el('h2', { text: 'Tweak' }),
      el('button', { type: 'button', id: 'tw-close', text: 'Close' })
    ]);
    r.appendChild(head);
    const body = el('div', { class: 'tw-body' });
    body.appendChild(el('p', { class: 'note', text: 'Test values. Changes apply at the next match start. A DEV badge shows while any value is not default.' }));
    body.appendChild(el('p', { id: 'tw-msg', 'aria-live': 'polite' }));

    // report + presets
    body.appendChild(el('h3', { text: 'Report and presets' }));
    const bar = el('div', { class: 'bar' }, [
      el('button', { type: 'button', id: 'btn-copy-report', class: 'pri', text: 'Copy report' }),
      el('button', { type: 'button', id: 'btn-copy-preset', text: 'Copy preset code' })
    ]);
    body.appendChild(bar);
    body.appendChild(el('div', { class: 'name-row' }, [
      el('input', { type: 'text', id: 'preset-name', maxlength: '24', placeholder: 'Preset name', autocomplete: 'off', 'aria-label': 'Preset name' }),
      el('button', { type: 'button', id: 'btn-save-preset', text: 'Save preset' })
    ]));
    body.appendChild(el('div', { id: 'preset-list' }));
    body.appendChild(el('textarea', { id: 'preset-code', rows: '3', placeholder: 'Paste SDP1: code here', 'aria-label': 'Preset code' }));
    body.appendChild(el('button', { type: 'button', id: 'btn-load-code', text: 'Load code' }));

    // seed
    const seed = el('div', { id: 'tw-seed' }, [
      el('h3', { text: 'Seed' }),
      el('p', { class: 'note', text: 'Current seed: ' + (S.seed != null ? S.seed : 'none yet') }),
      el('div', { class: 'name-row' }, [
        el('input', { type: 'number', inputmode: 'numeric', id: 'tw-seed-input', placeholder: 'New seed', 'aria-label': 'New seed' }),
        el('button', { type: 'button', id: 'tw-seed-go', text: 'New game with this seed' })
      ])
    ]);
    body.appendChild(seed);

    const rows = el('div', { class: 'rows' });
    buildRows(rows);
    body.appendChild(rows);
    body.appendChild(el('button', { type: 'button', id: 'tw-reset', text: 'Reset all to default' }));
    r.appendChild(body);

    // events
    r.querySelector('#tw-close').addEventListener('click', close);
    r.querySelector('#tw-reset').addEventListener('click', function () { resetAll(); refreshInputs(); msg('All values reset to default.'); });
    r.querySelector('#btn-copy-report').addEventListener('click', function () { copyReport().then(function (ok) { msg(ok ? 'Report copied.' : 'Copy failed.', !ok); }); });
    r.querySelector('#btn-save-preset').addEventListener('click', function () {
      const res = savePreset(r.querySelector('#preset-name').value);
      if (res.ok) { r.querySelector('#preset-name').value = ''; renderPresets(); msg('Saved "' + res.name + '".'); } else msg(res.why, true);
    });
    r.querySelector('#btn-copy-preset').addEventListener('click', function () {
      const code = presetCode();
      r.querySelector('#preset-code').value = code;
      copyText(code).then(function (ok) { msg(ok ? 'Preset code copied.' : 'Copy failed, copy it from the box.', !ok); });
    });
    r.querySelector('#btn-load-code').addEventListener('click', function () {
      const res = applyCode(r.querySelector('#preset-code').value);
      if (res.ok) { refreshInputs(); msg('Code loaded (' + res.n + ' changed). Applies at next match start.'); } else msg(res.why, true);
    });
    r.querySelector('#tw-seed-go').addEventListener('click', function () {
      const v = parseInt(r.querySelector('#tw-seed-input').value, 10);
      if (!isFinite(v) || v < 0) { msg('Type a whole number seed.', true); return; }
      try { globalThis.location.search = '?seed=' + (v >>> 0) + '&reset=1'; } catch (e) { msg('Could not reload.', true); }
    });
    return r;
  }
  function open() {
    if (root && root.isConnected) return;
    root = build();
    (document.getElementById('app') || document.body).appendChild(root);
    renderPresets();
    try { root.querySelector('#tw-close').focus(); } catch (e) { /* ignore */ }
  }
  function close() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }
  function isOpen() { return !!(root && root.isConnected); }

  // ---------- boot ----------
  function boot() {
    syncDev();
    document.addEventListener('click', function (e) {
      const g = e.target && e.target.closest && e.target.closest('#gear');
      if (g) open();   // open() is idempotent, so app.js binding the gear too is harmless
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  SD.tweak = {
    values: values, isDev: isDev, syncDev: syncDev, open: open, close: close, isOpen: isOpen,
    set: setValue, reset: resetAll, changed: changed,
    report: report, copyReport: copyReport, presetCode: presetCode, applyCode: applyCode,
    savePreset: savePreset, loadPreset: loadPreset, deletePreset: deletePreset
  };
})();
