(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  const NS = 'http://www.w3.org/2000/svg';

  // L2 Night broadcast stadium (SH-match-L2 look). Pitch runs left->right: my Defence | Midfield | my Attack.
  // Opponent zone z (their view) is screen column 2-z.
  const FILL = {
    own: ['#2f62dc', '#16358f', '#dbe8ff'], gk: ['#0b7d54', '#084a38', '#d9fff0'],
    opp: ['#c8304c', '#7a1228', '#ffd0d8'], ogk: ['#7c45cc', '#43237f', '#eadcff']
  };
  // admin default: opponent shirt numbers copied from the mock (4 defender, 5/6 midfield, 2 spare, keeper 1)
  const OPP_NUMS = [4, 5, 6, 2];
  const S = { el: null, svg: null, ro: null, m: null, g: null, ball: null, busy: 0, raf: 0, timers: [] };

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function noMotion() {
    try {
      const a = SD.app || {};
      if (a.fast || a.reduced) return true;
      if (S.m && S.m.T && S.m.T.reducedMotion) return true;
      return !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function geometry(W, H) {
    // stands take ~30% of the box, never thin (>=46), never so tall that 44px tokens do not fit
    let sy = H < 170 ? Math.max(34, Math.round(H * 0.24)) : Math.max(46, Math.min(Math.round(H * 0.3), 120));
    const Rt = Math.max(15, Math.min(26, W * 0.0645));            // 22.2 at 344 -> 44px tokens
    const need = 4 * Rt + 30 + 26;                                  // two token rows + gaps + zone label strip
    if (H - sy < need) sy = Math.max(H < 170 ? 34 : 46, H - need);
    const PH = H - sy;
    const labelH = 18, y0 = sy + labelH + 4, y1 = H - 4;
    const R = Math.max(12, Math.min(Rt, (y1 - y0 - 4) / 4));
    const yT = y0 + R + 1, yB = y1 - R - 1, yM = (yT + yB) / 2;
    const cw = W / 3;
    const col = c => cw * c;
    const T = (x, y) => ({ x, y });
    const pos = {
      me: { k: T(W * 0.075 + R * 0.1, yM), o0: T(W * 0.235, yT), o1: T(W * 0.385, yT + 2), o2: T(W * 0.385, yB - 2), o3: T(W * 0.735, yT) },
      opp: { k: T(W * 0.925 - R * 0.1, yM), o0: T(W * 0.765, yB), o1: T(W * 0.615, yT + 2), o2: T(W * 0.615, yB - 2), o3: T(W * 0.265, yB) }
    };
    return { W, H, sy, PH, R, yT, yB, yM, cw, col, pos, labelH, rb: Math.max(8, Math.min(12, R * 0.42)) };
  }

  function tok(cx, cy, r, num, cls, ring, extra) {
    const f = FILL[cls], fs = Math.round(r * (String(num).length > 1 ? 0.86 : 1.0));
    return `<g class="tk" data-num="${esc(num)}" data-cls="${cls}"${extra || ''}>` +
      (ring ? `<circle class="ring" cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="${ring}" stroke-width="3"/>` : '') +
      `<ellipse cx="${cx}" cy="${cy + r * 0.9}" rx="${r * 0.9}" ry="${r * 0.25}" fill="#000" opacity=".4"/>` +
      `<circle class="body" cx="${cx}" cy="${cy}" r="${r}" fill="url(#g${cls})" stroke="${f[2]}" stroke-width="2.5"/>` +
      `<text x="${cx}" y="${cy + fs * 0.36}" text-anchor="middle" font-size="${fs}" fill="#fff" font-weight="800">${esc(num)}</text></g>`;
  }
  function ballSvg(r) {
    const p = `${0},${-r * .37} ${r * .4},${-r * .08} ${r * .25},${r * .33} ${-r * .25},${r * .33} ${-r * .4},${-r * .08}`;
    return `<ellipse cx="0" cy="${r * .95}" rx="${r * .9}" ry="${r * .25}" fill="#000" opacity=".45"/>` +
      `<circle r="${r}" fill="#f4f6fb" stroke="#111" stroke-width="2"/><polygon points="${p}" fill="#111"/>`;
  }
  function dieSvg(n, col) {
    const g = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[n] || [];
    return `<rect x="1" y="1" width="30" height="30" rx="7" fill="#12315e" stroke="${col}" stroke-width="2.4"/>` +
      g.map(([x, y]) => `<circle cx="${8 + 8 * x}" cy="${8 + 8 * y}" r="2.7" fill="#fff"/>`).join('');
  }

  // which token slot carries the ball: side + own-view zone -> slot key
  function holderSlot(side, zone) {
    if (side === 'me') return zone === 0 ? 'o0' : zone === 1 ? 'o1' : 'o3';
    return zone === 0 ? 'o0' : zone === 1 ? 'o1' : 'o3';
  }
  function ballPoint(g, side, zone) {
    const t = g.pos[side][holderSlot(side, zone)];
    const dir = side === 'me' ? 1 : -1;
    return { x: t.x + dir * g.R * 0.95, y: t.y + g.R * 0.7 };
  }
  function keeperPoint(g, side) {   // the keeper that SAVES: defending side's keeper
    const t = g.pos[side].k;
    return { x: t.x + (side === 'me' ? 1 : -1) * g.R * 0.9, y: t.y + g.R * 0.5 };
  }

  function numFor(p, fb) { return (p && p.num != null) ? p.num : fb; }

  function build() {
    const el = S.el; if (!el) return;
    let W = el.clientWidth, H = el.clientHeight;
    W = Math.round(W); H = Math.round(H);
    if (W < 80 || H < 60) { S.svg.innerHTML = ''; return; }   // box not laid out yet; ResizeObserver redraws
    const g = S.g = geometry(W, H);
    const m = S.m, svg = S.svg;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const holder = m ? m.holder : 'me', zone = m ? m.zone : 1;
    const bcol = holder === 'me' ? zone : 2 - zone;
    const roar = !!(m && m.roarReady);
    const { sy, PH, R, cw, labelH } = g;
    const roof = Math.round(sy * 0.1) + 3, bY = Math.max(roof + 4, sy - 16);
    let o = `<defs>
 <linearGradient id="sv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03060f"/><stop offset="1" stop-color="#0d1a44"/></linearGradient>
 <linearGradient id="sv-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".7"/><stop offset="1" stop-color="#7fb4ff" stop-opacity=".02"/></linearGradient>
 <pattern id="sv-crowd" width="9" height="8" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="2" fill="#6f86c8"/><circle cx="7" cy="6" r="2" fill="#3e5497"/><circle cx="7" cy="1.5" r="1.2" fill="#ff8aa0"/><circle cx="1.5" cy="6.5" r="1.2" fill="#ffe08a"/></pattern>
 <pattern id="sv-crowdA" width="9" height="8" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="2" fill="#d0607a"/><circle cx="7" cy="6" r="2" fill="#8a2d46"/><circle cx="7" cy="1.5" r="1.2" fill="#ffd0d8"/><circle cx="1.5" cy="6.5" r="1.2" fill="#ff9a62"/></pattern>
 <linearGradient id="sv-cfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a18" stop-opacity=".8"/><stop offset="1" stop-color="#050a18" stop-opacity="0"/></linearGradient>
 <radialGradient id="sv-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#bfe0ff" stop-opacity=".8"/><stop offset="1" stop-color="#6fa8ff" stop-opacity="0"/></radialGradient>
 <radialGradient id="sv-spot" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <linearGradient id="sv-roar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc83a" stop-opacity=".0"/><stop offset="1" stop-color="#ffc83a" stop-opacity=".55"/></linearGradient>
 ${Object.entries(FILL).map(([c, f]) => `<radialGradient id="g${c}" cx=".35" cy=".28" r=".8"><stop offset="0" stop-color="${f[0]}"/><stop offset=".95" stop-color="${f[1]}"/></radialGradient>`).join('')}
 <filter id="sv-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
    o += `<rect width="${W}" height="${H}" fill="url(#sv-sky)"/>`;
    // stands
    o += `<rect y="0" width="${W}" height="${bY}" fill="#0a1535"/><rect y="${roof}" width="${W}" height="${bY - roof}" fill="url(#sv-crowd)" opacity=".9"/>` +
      `<rect x="${W * .76}" y="${roof}" width="${W * .24}" height="${bY - roof}" fill="url(#sv-crowdA)" opacity=".85"/>` +
      `<rect y="${roof}" width="${W}" height="${bY - roof}" fill="url(#sv-cfade)"/>`;
    const t1 = roof + (bY - roof) * .4, t2 = roof + (bY - roof) * .74;
    o += `<g stroke="#0b1633" stroke-width="3" opacity=".95"><line x1="0" y1="${t1}" x2="${W}" y2="${t1}"/><line x1="0" y1="${t2}" x2="${W}" y2="${t2}"/></g>`;
    o += `<rect y="0" width="${W}" height="${roof}" fill="#050a18"/><line x1="0" y1="${roof}" x2="${W}" y2="${roof}" stroke="#2cf0ff" stroke-opacity=".35"/>`;
    // roar glow in the stands
    o += `<rect class="roarglow" y="${roof}" width="${W}" height="${bY - roof}" fill="url(#sv-roar)" opacity="${roar ? 1 : 0}"/>`;
    // floodlights: 4 masts with beams
    const fl = [.1, .34, .66, .9];
    o += `<g filter="url(#sv-blur)">` + fl.map((k, i) => {
      const x = W * k, dir = i < 2 ? 1 : -1;
      return `<polygon points="${x - 14},0 ${x + 14},0 ${x + dir * W * .34 + W * .2},${H * .95} ${x + dir * W * .34 - W * .2},${H * .95}" fill="url(#sv-cone)" opacity=".3"/>`;
    }).join('') + `</g>`;
    fl.forEach(k => {
      const x = W * k;
      o += `<circle cx="${x}" cy="${roof}" r="${Math.max(16, sy * .26)}" fill="url(#sv-glow)" opacity=".9"/>`;
      [-9, 0, 9].forEach(dx => { o += `<circle cx="${x + dx}" cy="${roof - 1}" r="3" fill="#fff"/>`; });
    });
    // sponsor strip + club names
    o += `<rect y="${bY}" width="${W}" height="16" fill="#071029"/><g font-size="12" font-weight="800" letter-spacing="2"><text x="10" y="${bY + 12.5}" fill="#2cf0ff">PRESTON</text><text x="${W - 10}" y="${bY + 12.5}" text-anchor="end" fill="#ff9fb0">${esc(((m && m.club && (m.club.label || m.club.name)) || 'OPPONENT').toUpperCase())}</text></g>`;
    // pitch
    o += `<rect y="${sy}" width="${W}" height="${PH}" fill="#0a5a2c"/><g>`;
    for (let i = 0; i < 8; i += 2) o += `<rect x="${W * i / 8}" y="${sy}" width="${W / 8}" height="${PH}" fill="#0e6b34"/>`;
    o += `<rect y="${sy}" width="${W}" height="${PH}" fill="url(#sv-spot)"/><rect y="${sy}" width="${W}" height="${Math.max(6, PH * .1)}" fill="#04120d" opacity=".35"/></g>`;
    const zc = ['#ffc83a', '#2cf0ff', '#ff4d6d'], zo = [.07, .08, .08];
    for (let c = 0; c < 3; c++) o += `<rect x="${cw * c}" y="${sy}" width="${cw}" height="${PH}" fill="${zc[c]}" opacity="${zo[c]}"/>`;
    o += `<rect class="bzone" data-zone="${bcol}" x="${cw * bcol}" y="${sy}" width="${cw}" height="${PH}" fill="#2cf0ff" opacity=".2"/>`;
    // markings
    const bw = cw * .5, bh = PH * .62;
    o += `<g fill="none" stroke="#e8fff0" stroke-width="2" opacity=".6"><rect x="1" y="${sy + 1}" width="${W - 2}" height="${PH - 2}"/>` +
      `<rect x="1" y="${sy + (PH - bh) / 2}" width="${bw * .45}" height="${bh}"/><rect x="${W - 1 - bw * .45}" y="${sy + (PH - bh) / 2}" width="${bw * .45}" height="${bh}"/>` +
      `<circle cx="${W / 2}" cy="${sy + PH / 2}" r="${PH * .22}" opacity=".5"/></g>`;
    const zl = (x, on) => `<line x1="${x}" y1="${sy}" x2="${x}" y2="${H}" stroke="#2cf0ff" stroke-width="${on ? 3 : 1.5}" opacity="${on ? 1 : .5}"/>`;
    o += zl(cw, bcol === 0 || bcol === 1) + zl(cw * 2, bcol === 1 || bcol === 2);
    // goals
    const gh = PH * .34;
    o += `<g fill="rgba(255,255,255,.14)" stroke="#fff" stroke-width="2"><rect x="0" y="${sy + PH / 2 - gh / 2}" width="5" height="${gh}"/><rect x="${W - 5}" y="${sy + PH / 2 - gh / 2}" width="5" height="${gh}"/></g>`;
    // zone labels
    const lab = (name, c, on) => {
      const w = name.length * 9.2 + 14;
      return `<g class="zl" data-zone="${c}"><rect x="${cw * c + cw / 2 - w / 2}" y="${sy + 3}" width="${w}" height="${labelH}" rx="3" fill="${on ? '#2cf0ff' : 'rgba(5,10,24,.9)'}" stroke="${on ? '#2cf0ff' : 'rgba(120,170,255,.45)'}"/>` +
        `<text x="${cw * c + cw / 2}" y="${sy + 3 + 13}" text-anchor="middle" font-size="12" letter-spacing="1" fill="${on ? '#031018' : '#dfe8ff'}">${name}</text></g>`;
    };
    o += lab('DEFENCE', 0, bcol === 0) + lab('MIDFIELD', 1, bcol === 1) + lab('ATTACK', 2, bcol === 2);
    // direction arrow
    o += `<path d="M${W * .5 - 14},${H - 8} h24 m-6,-5 l6,5 l-6,5" stroke="#e8fff0" stroke-opacity=".35" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    // crowd meter (stands, top-left under the roof) + roar tag
    const need = (m && m.T && m.T.roarAt) || 3, crowd = m ? Math.min(need, m.crowd | 0) : 0;
    const mw = 76 + need * 15;
    o += `<g class="cm" data-crowd="${crowd}"><rect x="8" y="${roof + 4}" width="${mw}" height="20" rx="4" fill="rgba(5,10,24,.92)" stroke="${roar ? '#ffc83a' : 'rgba(120,170,255,.5)'}"/>` +
      `<text x="14" y="${roof + 18}" font-size="12" letter-spacing="1" fill="${roar ? '#ffc83a' : '#a9b8d8'}">${roar ? 'ROAR' : 'CROWD'}</text>`;
    for (let i = 0; i < need; i++) {
      const on = roar || i < crowd;
      o += `<circle cx="${14 + 68 + i * 15}" cy="${roof + 14}" r="5" fill="${on ? '#ffc83a' : 'none'}" stroke="#ffc83a" stroke-width="2"/>`;
    }
    o += `</g>`;
    // tokens
    const P = g.pos, setup = m && m.setup, me = [];
    const keeperP = m ? m.keeper : null, outf = (setup && setup.outfield) || [];
    const FALL = [5, 8, 11, 9];
    const used = new Set([1]);
    const myNums = outf.map((p, i) => { let n = numFor(p, FALL[i]); if (used.has(n)) n = FALL[i]; used.add(n); return n; });
    const ring = roar ? '#ffc83a' : null;
    const facing = holder === 'me' ? (zone === 2 ? 'o0' : zone === 1 ? 'o2' : 'o3') : null;
    const facingK = false;
    ['o0', 'o1', 'o2', 'o3'].forEach((k, i) => { o += tok(P.opp[k].x, P.opp[k].y, R, OPP_NUMS[i], 'opp', facing === k ? '#ffffff' : null, ` data-side="opp" data-slot="${k}"`); });
    o += tok(P.opp.k.x, P.opp.k.y, R, 1, 'ogk', null, ` data-side="opp" data-slot="k"`);
    o += tok(P.me.k.x, P.me.k.y, R, numFor(keeperP, 1), 'gk', ring, ` data-side="me" data-slot="k"`);
    ['o0', 'o1', 'o2', 'o3'].forEach((k, i) => { o += tok(P.me[k].x, P.me[k].y, R, myNums[i] != null ? myNums[i] : FALL[i], 'own', ring, ` data-side="me" data-slot="${k}"`); });
    // ball
    const bp = S.ballAt && S.keepBall ? S.ballAt : ballPoint(g, holder, zone);
    S.ballAt = bp; S.keepBall = false;
    o += `<g id="sv-ball" class="ball" transform="translate(${bp.x},${bp.y})">${ballSvg(g.rb)}</g>`;
    o += `<g id="sv-fx"></g>`;
    svg.setAttribute('data-ball-zone', ['Defence', 'Midfield', 'Attack'][zone]);
    svg.setAttribute('data-holder', holder);
    svg.classList.toggle('roar', roar);
    svg.innerHTML = o;
    S.ball = svg.querySelector('#sv-ball');
  }

  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }

  function setBall(p) { S.ballAt = p; if (S.ball) S.ball.setAttribute('transform', `translate(${p.x},${p.y})`); }

  const scene = {
    mount(el) {
      if (S.ro) { try { S.ro.disconnect(); } catch (e) { } }
      clearTimers();
      S.el = el;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.querySelectorAll('#sv').forEach(n => n.remove());
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'sv'); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Night stadium, pitch in three zones');
      svg.setAttribute('preserveAspectRatio', 'none');
      el.insertBefore(svg, el.firstChild);
      S.svg = svg; S.m = null; S.ballAt = null; S.keepBall = false;
      build();
      if (typeof ResizeObserver !== 'undefined') {
        S.ro = new ResizeObserver(() => { if (!S.busy) { S.keepBall = false; S.ballAt = null; } build(); });
        S.ro.observe(el);
      }
    },
    update(m) {
      S.m = m;
      if (!S.svg) return;
      clearTimers(); S.busy = 0;
      S.ballAt = null;
      build();
    },
    play(ev) {
      const m = S.m;
      if (!S.svg || !ev) return Promise.resolve();
      if (noMotion()) return Promise.resolve();
      clearTimers();
      const g = S.g, svg = S.svg, fx = svg.querySelector('#sv-fx');
      if (!g || !fx || !S.ball) return Promise.resolve();
      const aft = ev.after || { holder: m ? m.holder : 'me', zone: m ? m.zone : 1 };
      const start = S.ballAt || ballPoint(g, ev.side, ev.zone);
      const end = ballPoint(g, aft.holder, aft.zone);
      let mid = null, label = null;
      if (ev.goal) {
        const scorer = ev.goal;           // ball into the net of the other side
        mid = { x: scorer === "me" ? g.W - 12 : 12, y: g.yM }; label = 'GOAL';
      } else if (ev.save) {
        mid = keeperPoint(g, ev.side === 'me' ? 'opp' : 'me'); label = 'SAVE';
      }
      const d = ev.dice || {}, da = d.att || 1, db = d.def || 1;
      const attCol = ev.side === 'me' ? '#3f7dff' : '#ff6f86', defCol = ev.side === 'me' ? '#ff6f86' : '#3f7dff';
      const dx = g.W / 2 - 38, dy = g.sy + g.PH / 2 - 16;
      const dice = document.createElementNS(NS, 'g');
      dice.setAttribute('class', 'dice');
      fx.appendChild(dice);
      const showDice = (a, b) => {
        dice.innerHTML = `<rect x="${dx - 6}" y="${dy - 6}" width="88" height="44" rx="8" fill="rgba(5,10,24,.88)" stroke="rgba(120,170,255,.5)"/>` +
          `<g transform="translate(${dx},${dy})">${dieSvg(a, attCol)}</g><g transform="translate(${dx + 44},${dy})">${dieSvg(b, defCol)}</g>`;
      };
      const T0 = performance.now(), DUR = 600, ROLL = 260;
      S.busy = 1;
      return new Promise(res => {
        let last = 0, done = false;
        const fin = () => {
          if (done) return; done = true;
          S.busy = 0; setBall(end); S.keepBall = true;
          S.timers.push(setTimeout(() => { if (dice.parentNode) dice.remove(); const f = fx.querySelector('.flash'); if (f) f.remove(); }, 450));
          res();
        };
        const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const step = now => {
          const t = now - T0;
          if (t < ROLL) { if (now - last > 55) { last = now; showDice(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)); } }
          else if (!dice.dataset.f) { dice.dataset.f = 1; showDice(da, db); }
          // ball: starts at ROLL*0.5, ends at DUR
          const bt = Math.max(0, Math.min(1, (t - ROLL * 0.5) / (DUR - ROLL * 0.5)));
          if (mid) {
            if (bt < .55) setBall(lerp(start, mid, ease(bt / .55)));
            else {
              if (label && !fx.querySelector('.flash')) {
                const fl = document.createElementNS(NS, 'g'); fl.setAttribute('class', 'flash');
                const tw = label.length * 17 + 24;
                fl.innerHTML = `<rect x="${g.W / 2 - tw / 2}" y="${g.sy + g.PH / 2 - 20}" width="${tw}" height="40" rx="6" fill="${ev.goal ? '#ffc83a' : '#2cf0ff'}"/>` +
                  `<text x="${g.W / 2}" y="${g.sy + g.PH / 2 + 9}" text-anchor="middle" font-size="26" font-weight="800" letter-spacing="3" fill="#031018">${label}</text>`;
                fx.appendChild(fl);
              }
              setBall(lerp(mid, end, ease((bt - .55) / .45)));
            }
          } else setBall(lerp(start, end, ease(bt)));
          if (t >= DUR) return fin();
          S.raf = requestAnimationFrame(step);
        };
        showDice(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6));
        S.raf = requestAnimationFrame(step);
        S.timers.push(setTimeout(fin, DUR + 120));   // safety if rAF is throttled (hidden tab)
      });
    }
  };
  SD.ui = SD.ui || {};
  SD.ui.scene = scene;
})();
