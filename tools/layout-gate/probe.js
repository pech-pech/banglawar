/* PGS layout gate: in-page DOM/SVG probe (contract section 6).
 * Plain browser JS, no imports. Defines window.__pgsLayoutProbe(opt) -> Issue[].
 * Pure and synchronous: reads layout, never mutates the page.
 * Guesses not fixed by the contract are labelled "admin default".
 */
(function () {
  'use strict';

  var DEF = { dupPx: 14, tapMin: 48, textMin: 12, fillMin: 0.6, overlapFrac: 0.15 };
  var TAP = 'button,a[href],[role=button],input,select,textarea,[data-act],[onclick]';
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TITLE: 1, META: 1, LINK: 1, HEAD: 1, OPTION: 1, OPTGROUP: 1 };
  var SHAPES = 'rect,circle,path,line,polyline,ellipse,polygon';
  var GEOM = SHAPES + ',image';
  var MAX_TEXT = 400;
  var WORD = /[A-Za-zঀ-৿]{3,}/; // admin default: Bengali letters count as letters

  function probe(o) {
    var opt = {};
    for (var k in DEF) opt[k] = o && o[k] != null ? o[k] : DEF[k];
    // Mobile emulation: wide content makes innerWidth grow to fit it (608 not 344), which would hide h-scroll.
    // documentElement.clientWidth stays at the real layout width, so take the smaller (contract ambiguity, admin default).
    var W = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth), H = window.innerHeight;
    var issues = [], seen = {};
    var visCache = new Map(), csCache = new Map();

    function cs(el) {
      var s = csCache.get(el);
      if (!s) { s = getComputedStyle(el); csCache.set(el, s); }
      return s;
    }
    // style-visible: not display none / visibility hidden / opacity 0 / aria-hidden / ignore, self or ancestor
    function vis(el) {
      if (!el || el.nodeType !== 1) return true;
      var c = visCache.get(el);
      if (c !== undefined) return c;
      var r = true;
      if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('data-layout') === 'ignore') r = false;
      else {
        var s = cs(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) r = false;
        else r = vis(el.parentElement);
      }
      visCache.set(el, r);
      return r;
    }
    function rect(el) {
      var r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    function sized(r) { return r.width >= 1 && r.height >= 1; }
    function area(r) { return r.width * r.height; }
    function inter(a, b) {
      var x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return x > 0 && y > 0 ? x * y : 0;
    }
    function sel(el) {
      var parts = [], n = el;
      for (var i = 0; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement && i < 3; i++, n = n.parentElement) {
        var s = n.tagName.toLowerCase();
        if (n.id) { parts.unshift(s + '#' + n.id); break; }
        var c = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) s += '.' + c.join('.');
        parts.unshift(s);
      }
      return parts.join(' > ') || el.tagName.toLowerCase();
    }
    function waiver(el) {
      var n = el && el.closest ? el.closest('[data-layout-ok]') : null;
      return n ? (n.getAttribute('data-layout-ok') || 'waived (no reason given)') : null;
    }
    function add(check, sev, detail, el, box, el2) {
      var w = waiver(el);
      if (w == null && el2) w = waiver(el2); // admin default: a pair is waived if either side is waived
      var b = [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)];
      var key = check + '|' + sel(el) + '|' + detail + '|' + b.join(',');
      if (seen[key]) return;
      seen[key] = 1;
      var it = { check: check, severity: sev, detail: detail, sel: sel(el), box: b };
      if (w != null) it.waived = w;
      issues.push(it);
    }
    // nearest position:fixed|sticky ancestor (self included), or null
    var fxCache = new Map();
    function fx(el) {
      if (!el || el.nodeType !== 1) return null;
      if (fxCache.has(el)) return fxCache.get(el);
      var s = cs(el), r = (s.position === 'fixed' || s.position === 'sticky') ? el : fx(el.parentElement);
      fxCache.set(el, r);
      return r;
    }
    function inSvg(el) { return !!(el.ownerSVGElement) || el.localName === 'svg' && !!el.parentElement && !!el.parentElement.closest('svg'); }
    function inScrollX(el) {
      for (var n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        var ox = cs(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    }

    // ---- h-scroll
    var de = document.documentElement;
    if (de.scrollWidth > W + 1) {
      add('h-scroll', 'HARD', 'scrollWidth ' + de.scrollWidth + ' > innerWidth ' + W, de, { left: 0, top: 0, width: de.scrollWidth, height: de.scrollHeight });
    }

    // ---- collect text boxes + fixed/sticky + ellipsis
    var tbs = [];
    var rg = document.createRange();
    var all = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP[el.tagName]) continue;
      var isSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
      var s = cs(el);
      if ((s.position === 'fixed' || s.position === 'sticky') && vis(el)) {
        var fr = rect(el);
        if (sized(fr)) {
          var outH = fr.right <= 0 || fr.left >= W;
          var outV = fr.bottom <= 0 || fr.top >= H;
          // admin default: sticky only judged horizontally (a sticky footer below the fold is normal)
          if (outH || (s.position === 'fixed' && outV)) add('offscreen', 'HARD', s.position + ' element outside viewport', el, fr);
        }
      }
      if (tbs.length >= MAX_TEXT) continue;
      if (isSvg) {
        if (el.localName !== 'text' || !vis(el)) continue;
        var st = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!st) continue;
        var sr = rect(el);
        if (sr.width < 2 && sr.height < 2) continue;
        tbs.push({ e: el, b: sr, s: st, svg: true });
      } else {
        if (el.closest('svg')) continue;
        var own = '', b = null, tnodes = null;
        for (var c = el.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 3 || !c.textContent.trim()) continue;
          own += ' ' + c.textContent;
          (tnodes = tnodes || []).push(c);
          rg.selectNodeContents(c);
          var r = rg.getBoundingClientRect();
          if (r.width <= 0 && r.height <= 0) continue;
          if (!b) b = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          else { b.left = Math.min(b.left, r.left); b.top = Math.min(b.top, r.top); b.right = Math.max(b.right, r.right); b.bottom = Math.max(b.bottom, r.bottom); }
        }
        own = own.replace(/\s+/g, ' ').trim();
        if (!own || !b || !vis(el)) continue;
        b.width = b.right - b.left; b.height = b.bottom - b.top;
        if (b.width < 2 && b.height < 2) continue; // sr-only 1x1 text etc.
        tbs.push({ e: el, b: b, s: own, svg: false, tn: tnodes });
        if (s.textOverflow === 'ellipsis' && s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) {
          add('clipped', 'HARD', 'ellipsis truncating "' + own.slice(0, 24) + '" (' + el.scrollWidth + '>' + el.clientWidth + ')', el, rect(el));
        }
      }
    }

    // ---- per text box: offscreen, clipped, text-small
    var clipInfo = new Map();
    function clipper(n) {
      var ci = clipInfo.get(n);
      if (ci === undefined) {
        var ss = cs(n);
        var clips = /hidden|clip/.test(ss.overflowX) || /hidden|clip/.test(ss.overflowY);
        ci = clips ? { r: rect(n), x: /hidden|clip/.test(ss.overflowX), y: /hidden|clip/.test(ss.overflowY) } : null;
        clipInfo.set(n, ci);
      }
      return ci;
    }
    tbs.forEach(function (t) {
      var b = t.b;
      if ((b.left < -1 || b.right > W + 1) && !inScrollX(t.e)) {
        add('offscreen', 'HARD', 'text "' + t.s.slice(0, 24) + '" outside viewport x ' + Math.round(b.left) + '..' + Math.round(b.right), t.e, b);
      }
      // clipped: nearest overflow hidden/clip ancestor (self included) that cuts the text box
      for (var n = t.e; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        var ci = clipper(n);
        if (!ci) continue;
        var ar = ci.r;
        if (inter(b, ar) <= 0) continue; // fully outside = hidden panel, not a cut
        var tolY = Math.max(2, b.height * 0.2); // admin default: glyph box may exceed tight line-height
        var cut = (ci.x && (b.left < ar.left - 2 || b.right > ar.right + 2)) || (ci.y && (b.top < ar.top - tolY || b.bottom > ar.bottom + tolY));
        if (cut) {
          add('clipped', 'HARD', 'text "' + t.s.slice(0, 24) + '" cut by ' + sel(n), t.e, b);
          break;
        }
      }
      // text-small
      if (t.svg) {
        if (b.height < opt.textMin * 0.75) add('text-small', 'HARD', 'svg text "' + t.s.slice(0, 24) + '" glyph box ' + b.height.toFixed(1) + 'px high', t.e, b);
      } else {
        var fs = parseFloat(cs(t.e).fontSize);
        if (fs < opt.textMin) add('text-small', 'HARD', 'font-size ' + fs + 'px < ' + opt.textMin + ' "' + t.s.slice(0, 24) + '"', t.e, b);
      }
    });

    // ---- text-overlap + dup-label (O(n^2) over capped boxes)
    for (var p = 0; p < tbs.length; p++) {
      for (var q = p + 1; q < tbs.length; q++) {
        var A = tbs[p], B = tbs[q];
        if (A.e === B.e || A.e.contains(B.e) || B.e.contains(A.e)) continue;
        var fa = fx(A.e), fb = fx(B.e);
        if (A.s.length > 1 && A.s === B.s &&
          Math.abs(A.b.left - B.b.left) < opt.dupPx && Math.abs(A.b.top - B.b.top) < opt.dupPx * 1.5) {
          add('dup-label', 'HARD', 'duplicate "' + A.s.slice(0, 24) + '"', A.e, A.b, B.e);
        }
        var o = inter(A.b, B.b);
        if (!fa !== !fb) continue; // exactly one side in a fixed/sticky bar: content scrolls out from under it (see under-bar)
        if (o > 0 && o > opt.overlapFrac * Math.min(area(A.b), area(B.b))) {
          add('text-overlap', 'HARD', '"' + A.s.slice(0, 18) + '" x "' + B.s.slice(0, 18) + '"', A.e, A.b, B.e);
        }
      }
    }

    // ---- tap targets
    var taps = document.querySelectorAll(TAP);
    for (var ti = 0; ti < taps.length; ti++) {
      var t2 = taps[ti];
      if (inSvg(t2) && t2.getAttribute('role') !== 'button') continue;
      if (t2.tagName === 'INPUT' && t2.type === 'hidden') continue;
      if (!vis(t2)) continue;
      var tr = rect(t2);
      if (!sized(tr)) continue;
      var tcs = cs(t2);
      if ((tr.left < -1 || tr.right > W + 1) && !inScrollX(t2)) add('offscreen', 'HARD', 'control outside viewport x ' + Math.round(tr.left) + '..' + Math.round(tr.right), t2, tr);
      if (tr.width < opt.tapMin || tr.height < opt.tapMin) {
        add('tap-small', 'HARD', Math.round(tr.width) + 'x' + Math.round(tr.height) + ' < ' + opt.tapMin + ' "' + ((t2.textContent || t2.getAttribute('aria-label') || t2.value || '').trim().slice(0, 16)) + '"', t2, tr);
      }
      var cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || tcs.pointerEvents === 'none') continue;
      var top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      var lab = top.closest ? top.closest('label') : null;
      var ok = top === t2 || t2.contains(top) || top.contains(t2) || (lab && (lab.control === t2 || lab.contains(t2)));
      if (!ok && fx(top) && !fx(t2)) ok = true; // fixed/sticky bar over scrolling content: judged by under-bar at max scroll
      if (!ok) add('tap-covered', 'HARD', 'centre covered by ' + sel(top), t2, tr);
    }

    // per-glyph screen boxes for rotated/skewed svg text; null when axis-aligned (bbox is right)
    function charBoxes(t) {
      var el = t.e;
      if (!el.getNumberOfChars || !el.getScreenCTM) return null;
      var m = el.getScreenCTM();
      if (!m || (Math.abs(m.b) < 0.01 && Math.abs(m.c) < 0.01)) return null;
      var out = [];
      try {
        for (var ci = 0, n = el.getNumberOfChars(); ci < n; ci++) {
          var ex = el.getExtentOfChar(ci);
          var xs = [], ys = [];
          [[ex.x, ex.y], [ex.x + ex.width, ex.y], [ex.x, ex.y + ex.height], [ex.x + ex.width, ex.y + ex.height]].forEach(function (c) {
            xs.push(m.a * c[0] + m.c * c[1] + m.e); ys.push(m.b * c[0] + m.d * c[1] + m.f);
          });
          var r = { left: Math.min.apply(null, xs), right: Math.max.apply(null, xs), top: Math.min.apply(null, ys), bottom: Math.max.apply(null, ys) };
          r.width = r.right - r.left; r.height = r.bottom - r.top;
          if (r.width > 0 && r.height > 0) out.push(r);
        }
      } catch (e) { return null; }
      return out.length ? out : null;
    }

    // ---- text-over-mark
    var marks = document.querySelectorAll('[data-layout=mark]');
    for (var mi = 0; mi < marks.length; mi++) {
      var mk = marks[mi];
      if (!vis(mk)) continue;
      var leaves = mk.matches(GEOM) ? [mk] : Array.prototype.slice.call(mk.querySelectorAll(GEOM + ',canvas,img'));
      if (!leaves.length) leaves = [mk];
      var ml = [];
      leaves.forEach(function (lf) {
        if (!vis(lf)) return;
        var lr = rect(lf);
        var item = { el: lf, r: lr, pts: null };
        // stroke-only paths: bbox is meaningless, sample the outline instead
        if (lf.getTotalLength && lf.getScreenCTM && cs(lf).fill === 'none') {
          try {
            var len = lf.getTotalLength(), m = lf.getScreenCTM(), pts = [];
            for (var si = 0; si <= 48; si++) { var pt = lf.getPointAtLength(len * si / 48); pts.push([m.a * pt.x + m.c * pt.y + m.e, m.b * pt.x + m.d * pt.y + m.f]); }
            item.pts = pts;
          } catch (e) { /* fall back to bbox */ }
        } else if (!sized(lr)) return;
        ml.push(item);
      });
      tbs.forEach(function (t) {
        if (!WORD.test(t.s) || mk.contains(t.e)) return;
        if (!fx(t.e) !== !fx(mk)) return; // fixed bar vs scrolling content
        var cbx = t.svg ? charBoxes(t) : null; // rotated svg text: per-glyph boxes, the bbox of the whole run is far too big
        for (var li = 0; li < ml.length; li++) {
          var it = ml[li], hit = false;
          // a mark drawn in the same group as the text is its own backing plate (label pill), not something it covers
          if (t.svg && it.el.parentNode === t.e.parentNode && !(it.el.compareDocumentPosition(t.e) & 2) && inter(t.b, it.r) >= 0.75 * area(t.b)) continue;
          var boxes = cbx || [t.b];
          for (var bi = 0; bi < boxes.length && !hit; bi++) {
            var tb = boxes[bi];
            if (it.pts) {
              for (var pi = 0; pi < it.pts.length; pi++) { var pp = it.pts[pi]; if (pp[0] >= tb.left && pp[0] <= tb.right && pp[1] >= tb.top && pp[1] <= tb.bottom) { hit = true; break; } }
            } else {
              hit = inter(tb, it.r) > 0.25 * area(tb);
            }
          }
          if (hit) { add('text-over-mark', 'HARD', '"' + t.s.slice(0, 24) + '" over mark ' + it.el.tagName.toLowerCase(), t.e, t.b, mk); break; }
        }
      });
    }

    // ---- fill-empty (SOFT)
    var fills = document.querySelectorAll('[data-layout=fill]');
    for (var fi = 0; fi < fills.length; fi++) {
      var box = fills[fi];
      if (!vis(box)) continue;
      var br = rect(box);
      if (!sized(br)) continue;
      var spans = [];
      var ds = box.querySelectorAll('*');
      for (var di = 0; di < ds.length; di++) {
        var d = ds[di];
        if (SKIP[d.tagName] || !vis(d) || d.closest('defs,clipPath,mask,pattern,symbol,marker')) continue;
        var dsvg = d.namespaceURI === 'http://www.w3.org/2000/svg';
        var hasOwn = false;
        for (var cn = d.firstChild; cn; cn = cn.nextSibling) if (cn.nodeType === 3 && cn.textContent.trim()) { hasOwn = true; break; }
        if (d.children.length && !hasOwn && !(dsvg && d.localName === 'text')) continue; // containers are not content
        var dr = rect(d);
        if (!(dr.width >= 1 || dr.height >= 1)) continue; // thin lines allowed
        if (!hasOwn && dr.width >= br.width * 0.9 && dr.height >= br.height * 0.9) continue; // background
        var x0 = Math.max(dr.left, br.left), x1 = Math.min(dr.right, br.right);
        if (x1 < x0) continue;
        spans.push([x0, x1]);
      }
      spans.sort(function (a, b) { return a[0] - b[0]; });
      var covered = 0, curS = null, curE = null;
      spans.forEach(function (sp) {
        if (curE === null || sp[0] > curE) { if (curE !== null) covered += curE - curS; curS = sp[0]; curE = sp[1]; }
        else curE = Math.max(curE, sp[1]);
      });
      if (curE !== null) covered += curE - curS;
      var frac = covered / br.width, mid = br.left + br.width / 2;
      var left = spans.some(function (sp) { return Math.min(sp[1], mid) - sp[0] > 1; });
      var right = spans.some(function (sp) { return sp[1] - Math.max(sp[0], mid) > 1; });
      if (!spans.length) add('fill-empty', 'SOFT', 'no visible content', box, br);
      else {
        if (frac < opt.fillMin) add('fill-empty', 'SOFT', 'content spans ' + Math.round(frac * 100) + '% of width (min ' + Math.round(opt.fillMin * 100) + '%)', box, br);
        if (!left) add('fill-empty', 'SOFT', 'left half empty', box, br);
        if (!right) add('fill-empty', 'SOFT', 'right half empty', box, br);
      }
    }

    // ---- svg-empty-half (SOFT)
    var svgs = document.querySelectorAll('svg');
    for (var vi = 0; vi < svgs.length; vi++) {
      var sv = svgs[vi];
      if (sv.ownerSVGElement || sv.hasAttribute('data-layout') || sv.closest('[data-layout=fill],[data-layout=mark]') || !vis(sv)) continue;
      var sb = rect(sv);
      if (sb.width < 120 || sb.height < 60) continue;
      var shapes = sv.querySelectorAll(SHAPES), cx2 = [];
      for (var hi = 0; hi < shapes.length; hi++) {
        var sh = shapes[hi];
        if (!vis(sh) || sh.closest('defs,clipPath,mask,pattern,symbol,marker')) continue;
        var hr = rect(sh);
        if (!(hr.width >= 1 || hr.height >= 1)) continue;
        if (hr.width >= sb.width * 0.9 && hr.height >= sb.height * 0.9) continue; // background
        cx2.push((hr.left + hr.right) / 2);
      }
      if (cx2.length <= 8) continue;
      var smid = sb.left + sb.width / 2, nl = 0, nr = 0;
      cx2.forEach(function (x) { if (x < smid) nl++; else nr++; });
      var minHalf = 0.08 * cx2.length;
      if (nl < minHalf || nr < minHalf) add('svg-empty-half', 'SOFT', (nl < minHalf ? 'left' : 'right') + ' half holds ' + Math.min(nl, nr) + ' of ' + cx2.length + ' shapes', sv, sb);
    }

    // ---- under-bar: scroll the main scroller to its end, then see what a fixed/sticky element still covers
    (function () {
      var sc = document.scrollingElement || de;
      if (!(sc.scrollHeight > sc.clientHeight + 1)) {
        var best = null, bestA = 0, cand = document.body ? document.body.querySelectorAll('*') : [];
        for (var ci2 = 0; ci2 < cand.length; ci2++) {
          var ce = cand[ci2], oy = cs(ce).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && ce.scrollHeight > ce.clientHeight + 1 && vis(ce)) {
            var ca = ce.clientWidth * ce.clientHeight;
            if (ca > bestA) { bestA = ca; best = ce; }
          }
        }
        if (best) sc = best;
      }
      var y0 = sc.scrollTop, x0 = sc.scrollLeft;
      try {
        sc.scrollTo({ top: sc.scrollHeight, left: x0, behavior: 'instant' });
        var seenEl = new Set();
        function chk(el, r, what, label) {
          if (fx(el) || seenEl.has(el) || r.width < 1 || r.height < 1) return;
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
          var hit = document.elementFromPoint(cx, cy);
          var bar = hit && fx(hit);
          if (!bar || bar.contains(el) || el.contains(bar)) return;
          seenEl.add(el);
          add('under-bar', 'HARD', what + ' "' + label + '" stays under fixed/sticky ' + sel(bar) + ' at max scroll', el, r);
        }
        var tps = document.querySelectorAll(TAP);
        for (var u = 0; u < tps.length; u++) {
          var te = tps[u];
          if (!vis(te) || (inSvg(te) && te.getAttribute('role') !== 'button') || (te.tagName === 'INPUT' && te.type === 'hidden') || cs(te).pointerEvents === 'none') continue;
          chk(te, rect(te), 'control', (te.textContent || te.getAttribute('aria-label') || te.value || '').trim().slice(0, 20));
        }
        tbs.forEach(function (t) {
          var r;
          if (t.svg) r = rect(t.e);
          else {
            if (!t.tn) return;
            r = null;
            t.tn.forEach(function (nd) {
              rg.selectNodeContents(nd);
              var q = rg.getBoundingClientRect();
              if (q.width <= 0 && q.height <= 0) return;
              r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
            });
            if (!r) return;
            r.width = r.right - r.left; r.height = r.bottom - r.top;
          }
          chk(t.e, r, 'text', t.s.slice(0, 20));
        });
      } finally {
        sc.scrollTo({ top: y0, left: x0, behavior: 'instant' });
      }
    })();

    probe.lastIgnored = document.querySelectorAll('[data-layout=ignore]').length;
    return issues;
  }

  probe.lastIgnored = 0;
  window.__pgsLayoutProbe = probe;
})();
