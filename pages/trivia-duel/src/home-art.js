var TD = (typeof window!=='undefined'?(window.TD=window.TD||{}):(global.TD=global.TD||{})); TD.ui = TD.ui || {};
(function () {
  // Home redesign art paths + gender-aware player avatar + icon helper.
  // Missing files fall back silently to code-drawn visuals.
  var A = TD.ART = TD.ART || {};
  A.playerG = {};
  for (var s = 0; s < 4; s++) {
    A.playerG[s + 'b'] = 'art/player-' + s + '-b.webp';
    A.playerG[s + 'g'] = 'art/player-' + s + '-g.webp';
  }
  var UI_NAMES = ['fil-corner', 'fil-edge', 'ring', 'star', 'ico-boy', 'ico-girl', 'ico-gear', 'ico-film', 'ico-book',
    'ico-flame', 'ico-minus', 'ico-plus', 'gem-0', 'gem-1', 'gem-2', 'gem-3'];
  A.ui = {};
  UI_NAMES.forEach(function (n) { A.ui[n] = 'art/ui-' + n + '.webp'; });
  A.topic = A.topic || {};
  ['spells', 'creatures', 'places', 'people', 'objects', 'school', 'plot'].forEach(function (id) {
    A.topic[id] = 'art/topic-' + id + '.webp';
  });
  // the delivered files are swapped vs the mockup (orange key = objects, magenta scroll = plot)
  A.topic.objects = 'art/topic-plot.webp';
  A.topic.plot = 'art/topic-objects.webp';
  A.bgArena = 'art/bg-arena.webp';

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  TD.ui.gender = function () {
    try {
      if (TD.ui.save && (TD.ui.save.gender === 'b' || TD.ui.save.gender === 'g')) return TD.ui.save.gender;
      if (typeof localStorage !== 'undefined') {
        var j = JSON.parse(localStorage.getItem('td.save') || 'null');
        if (j && (j.gender === 'b' || j.gender === 'g')) return j.gender;
      }
    } catch (e) {}
    return 'b';
  };

  // admin default glyphs / colours
  var GLYPH = { 'ico-boy': '♂', 'ico-girl': '♀', 'ico-gear': '⚙', 'ico-minus': '−', 'ico-plus': '+',
    'ico-flame': '🕯', 'ico-film': '🎬', 'ico-book': '📖', 'star': '★' };
  var GEMCOL = ['#2f7bff', '#19b5a5', '#8a4fe0', '#33b84f'];

  TD.ui.icon = function (name, px) {
    if (typeof document === 'undefined') return null;
    var src = A.ui && A.ui[name];
    var fb = function (node) {
      var f = el('span', 'hc-ico hc-ico-fb');
      var m = /^gem-(\d)$/.exec(name);
      f.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.7) + 'px;line-height:1';
      if (m) { f.textContent = '●'; f.style.color = GEMCOL[+m[1]] || GEMCOL[0]; }
      else f.textContent = GLYPH[name] || '';
      if (node && node.parentNode) node.parentNode.replaceChild(f, node);
      return f;
    };
    if (!src) return fb(null);
    var img = el('img', 'hc-ico');
    img.width = img.height = px; img.alt = ''; img.draggable = false;
    img.style.width = img.style.height = px + 'px';
    var failed = false;
    img.onerror = function () { if (failed) return; failed = true; try { fb(img); } catch (e) {} };
    img.src = src;
    return img;
  };

  // Wrap player avatar: gendered art first, then ORIGINAL avatar (old art, then letter).
  if (TD.avatar && TD.avatar.player && !TD.avatar.player._hcWrapped) {
    var orig = TD.avatar.player;
    var wrapped = function (name, seal, px) {
      var key = (seal | 0) + TD.ui.gender();
      var src = A.playerG && A.playerG[key];
      if (!src || typeof document === 'undefined') return orig(name, seal, px);
      var d = el('div', 'av av-player');
      d.style.width = d.style.height = px + 'px';
      var img = el('img', 'av-img');
      img.width = img.height = px; img.alt = ''; img.draggable = false;
      img.style.width = img.style.height = '100%';
      var failed = false;
      img.onerror = function () {
        if (failed) return; failed = true;
        try {
          var o = orig(name, seal, px);
          if (img.parentNode) img.parentNode.replaceChild(o.firstChild || o, img);
          else d.appendChild(o.firstChild || o);
        } catch (e) {}
      };
      img.src = src;
      d.appendChild(img);
      return d;
    };
    wrapped._hcWrapped = true;
    TD.avatar.player = wrapped;
  }
})();
if (typeof module !== 'undefined') module.exports = { ART: TD.ART, ui: TD.ui };
