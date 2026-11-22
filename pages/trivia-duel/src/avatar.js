var TD = (typeof window!=='undefined'?(window.TD=window.TD||{}):(global.TD=global.TD||{})); TD.ui = TD.ui || {};
(function () {
  // Art paths; missing files fall back silently to code-drawn visuals.
  TD.ART = TD.ART || {
    rival: { 1: 'art/rival-1.webp', 2: 'art/rival-2.webp', 3: 'art/rival-3.webp', 4: 'art/rival-4.webp', 5: 'art/rival-5.webp' },
    player: { 0: 'art/player-0.webp', 1: 'art/player-1.webp', 2: 'art/player-2.webp', 3: 'art/player-3.webp' },
    topic: { spells: 'art/topic-spells.webp', creatures: 'art/topic-creatures.webp', places: 'art/topic-places.webp' },
    emblem: 'art/emblem.webp', vsBg: 'art/vs-bg.webp'
  };
  // admin default colours (look A guess)
  var PLAYER_COL = ['#2f7bff', '#19b5a5', '#8a4fe0', '#33b84f'];
  var TOPIC_COL = { spells: '#7b4fe0', creatures: '#33b84f', places: '#19b5a5', people: '#e0574f', objects: '#e09a1f', school: '#3f7be0', plot: '#c44fd0', general: '#8a7fd6' };
  var ORANGE = '#ff8a1f';

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function box(cls, px) { var d = el('div', cls); d.style.width = d.style.height = px + 'px'; return d; }
  function pickRival(step) {
    var R = TD.RIVALS || [];
    for (var i = 0; i < R.length; i++) if (R[i].step === step) return R[i];
    return R[0] || { look: {} };
  }

  function drawPortrait(canvas, look, px) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = canvas.height = Math.round(px * dpr);
    canvas.style.width = canvas.style.height = px + 'px';
    var c = canvas.getContext && canvas.getContext('2d');
    if (!c) return;
    c.setTransform(canvas.width / 100, 0, 0, canvas.height / 100, 0, 0);
    c.clearRect(0, 0, 100, 100);
    look = look || {};
    var skin = '#f0c9a0', hair = look.hair || '#4a3020', robe = look.robe || '#3a3a52';
    c.save();
    c.beginPath(); c.arc(50, 50, 50, 0, 7); c.clip();
    c.fillStyle = ORANGE; c.fillRect(0, 0, 100, 100);
    var st = look.hairStyle;
    var fw = look.face === 'round' ? 20 : look.face === 'long' ? 17 : 18.5;
    var fh = look.face === 'round' ? 20 : look.face === 'long' ? 25 : 22;
    var fy = 50;
    c.fillStyle = hair;
    if (st === 'long') { c.beginPath(); c.ellipse(50, 56, fw + 6, 34, 0, 0, 7); c.fill(); }
    if (st === 'bushy') { c.beginPath(); c.ellipse(50, 48, fw + 11, 31, 0, 0, 7); c.fill(); }
    if (st === 'bun') { c.beginPath(); c.arc(50, 18, 9, 0, 7); c.fill(); }
    c.fillStyle = robe; c.beginPath(); c.ellipse(50, 104, 40, 26, 0, 0, 7); c.fill();
    c.fillStyle = skin; c.fillRect(44, 66, 12, 14);
    c.beginPath(); c.ellipse(50, fy, fw, fh, 0, 0, 7); c.fill();
    c.fillStyle = hair;
    c.beginPath(); c.ellipse(50, fy - 3, fw + 1.5, fh - 2, 0, Math.PI, 0); c.fill();
    if (st === 'short') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 1, fw - 3, fh - 12, 0, Math.PI, 0); c.fill(); }
    else if (st === 'long' || st === 'bun') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 1, fw - 3.5, fh - 11, 0, Math.PI, 0); c.fill(); }
    else if (st === 'bushy') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 2, fw - 2.5, fh - 9, 0, Math.PI, 0); c.fill(); }
    if (look.hat === 'pointed') {
      c.fillStyle = '#1d1b2e';
      c.beginPath(); c.moveTo(30, 34); c.lineTo(52, -6); c.lineTo(70, 34); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(50, 34, 28, 5, 0, 0, 7); c.fill();
    }
    c.fillStyle = '#2a1d10';
    c.beginPath(); c.arc(43, fy + 1, 2, 0, 7); c.fill();
    c.beginPath(); c.arc(57, fy + 1, 2, 0, 7); c.fill();
    c.strokeStyle = '#b3443a'; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.arc(50, fy + 9, 5, 0.2, Math.PI - 0.2); c.stroke();
    if (look.freckles) {
      c.fillStyle = 'rgba(160,90,40,0.7)';
      [[41, 8], [44, 10], [39, 11], [56, 10], [59, 8], [61, 11]].forEach(function (p) {
        c.beginPath(); c.arc(p[0], fy + p[1] - 2, 1, 0, 7); c.fill();
      });
    }
    if (look.glasses) {
      c.strokeStyle = '#333'; c.lineWidth = 1.5;
      c.strokeRect(36.5, fy - 4, 11, 9); c.strokeRect(52.5, fy - 4, 11, 9);
      c.beginPath(); c.moveTo(47.5, fy); c.lineTo(52.5, fy); c.stroke();
    }
    c.restore();
  }
  TD.ui.drawPortrait = drawPortrait;

  function imgWithFallback(src, cls, px, onFail) {
    var img = el('img', cls);
    img.width = img.height = px; img.alt = ''; img.draggable = false;
    img.style.width = img.style.height = '100%';
    var failed = false;
    img.onerror = function () { if (failed) return; failed = true; try { onFail(img); } catch (e) {} };
    img.src = src;
    return img;
  }

  var avatar = {
    rival: function (step, px) {
      var d = box('av av-rival', px);
      var src = TD.ART && TD.ART.rival && TD.ART.rival[step];
      var fb = function (img) {
        var cv = el('canvas');
        drawPortrait(cv, pickRival(step).look, px);
        if (img.parentNode) img.parentNode.replaceChild(cv, img); else d.appendChild(cv);
      };
      if (src) d.appendChild(imgWithFallback(src, 'av-img', px, fb)); else fb({});
      return d;
    },
    player: function (name, seal, px) {
      var d = box('av av-player', px);
      var s = seal | 0, col = PLAYER_COL[s] || PLAYER_COL[0];
      var src = TD.ART && TD.ART.player && TD.ART.player[s];
      var fb = function (img) {
        var f = el('div', 'av-fb');
        f.style.cssText = 'width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;background:' + col + ';font-size:' + Math.round(px * 0.5) + 'px';
        f.textContent = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
        if (img.parentNode) img.parentNode.replaceChild(f, img); else d.appendChild(f);
      };
      if (src) d.appendChild(imgWithFallback(src, 'av-img', px, fb)); else fb({});
      return d;
    },
    topic: function (id, px) {
      var src = TD.ART && TD.ART.topic && TD.ART.topic[id];
      var fb = function (img) {
        var f = el('div', 'topic-fb');
        f.style.cssText = 'width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.round(px * 0.25) + 'px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:' + Math.round(px * 0.55) + 'px;background:' + (TOPIC_COL[id] || '#8a7fd6');
        f.textContent = String(id || '?').charAt(0).toUpperCase();
        if (img && img.parentNode) img.parentNode.replaceChild(f, img);
        return f;
      };
      if (!src) return fb({});
      var img = imgWithFallback(src, 'topic-img', px, fb);
      img.style.width = img.style.height = px + 'px';
      return img;
    },
    emblem: function (px) {
      var fb = function (img) {
        var f = el('div', 'emblem-fb');
        f.style.cssText = 'width:' + px + 'px;height:' + px + 'px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#ffd23f;color:#7a4a00;font-size:' + Math.round(px * 0.6) + 'px;line-height:1;box-shadow:0 0 0 3px #ffb300 inset';
        f.textContent = '★';
        if (img && img.parentNode) img.parentNode.replaceChild(f, img);
        return f;
      };
      var src = TD.ART && TD.ART.emblem;
      if (!src) return fb({});
      var img = imgWithFallback(src, 'emblem-img', px, fb);
      img.style.width = img.style.height = px + 'px';
      return img;
    }
  };
  TD.avatar = avatar;
})();
