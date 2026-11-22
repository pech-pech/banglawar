var TD = (typeof window!=='undefined'?(window.TD=window.TD||{}):(global.TD=global.TD||{})); TD.ui = TD.ui || {};
// ui-end.js: wager + result screens, look A "Arena". Logic (pMult, wagerTopic, buttons) lives in ui-core.
(function () {
  'use strict';
  var ui = TD.ui;
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function cfg() { return (ui.cfg && ui.cfg()) || { wagerMult: 2, wagerMissCost: 50, xpPerLevel: 100 }; }
  function rival(st) { try { return ui.rivalOf(st.rivalStep); } catch (e) { return { name: 'Rival' }; } }
  function sv() { return ui.save || {}; } // ui.save is the live save object; core also sets st.name / st.seal
  function pName(st) { return (st && st.name) || sv().name || 'You'; }
  function pSeal(st) { return (st && st.seal != null) ? st.seal : (sv().seal || 0); }
  function side(kind, st, score, cls) {
    var av = null;
    try { av = kind === 'p' ? TD.avatar.player(pName(st), pSeal(st), 64) : TD.avatar.rival(st.rivalStep, 64); } catch (e) {}
    return h('div', { class: 'side ' + (cls || '') }, [
      av || h('div', { class: 'av av-' + (kind === 'p' ? 'player' : 'rival'), text: (kind === 'p' ? pName(st) : rival(st).name).charAt(0) }),
      h('div', { class: 'nm', text: kind === 'p' ? pName(st) : rival(st).name }),
      h('div', { class: 'sc', text: String(score) })
    ]);
  }

  // ---------- wager ----------
  ui.buildWager = function () {
    var s = $('scr-wager');
    s.innerHTML = '';
    s.appendChild(h('div', { class: 'rb wager-title', text: 'FINAL QUESTION' }));
    s.appendChild(h('div', { class: 'res', id: 'wager-scores' }));
    s.appendChild(h('div', { class: 'wager-lbl', text: 'Pick the topic for question 7' }));
    var row = h('div', { class: 'wager-topics' });
    (TD.TOPICS || []).forEach(function (t) {
      var ic = null;
      try { ic = TD.avatar.topic(t.id, 44); } catch (e) {}
      row.appendChild(h('button', { class: 'btn-wtopic', 'data-topic': t.id, type: 'button' }, [ic, h('span', { text: t.label })]));
    });
    s.appendChild(row);
    s.appendChild(h('div', { class: 'wager-lbl', text: 'Risk it?' }));
    s.appendChild(h('div', { class: 'wager-mult' }, [
      h('button', { id: 'btn-x1', class: 'btn-mult', type: 'button', text: 'x1 safe' }),
      h('button', { id: 'btn-x2', class: 'btn-mult', type: 'button', text: 'x2 wager' })
    ]));
    s.appendChild(h('div', { id: 'wager-note', class: 'wager-note' }));
    s.appendChild(h('div', { class: 'btns' }, [h('button', { id: 'btn-wager-go', class: 'btn p', type: 'button', text: 'GO' })]));
  };

  ui.renderWager = function (st) {
    var c = cfg();
    var sc = $('wager-scores');
    sc.innerHTML = '';
    sc.appendChild(side('p', st, st.pScore));
    sc.appendChild(side('r', st, st.rScore));
    var t = document.querySelectorAll('#scr-wager .btn-wtopic');
    for (var i = 0; i < t.length; i++) t[i].classList.toggle('sel', t[i].getAttribute('data-topic') === st.wagerTopic);
    $('btn-x1').classList.toggle('sel', st.pMult === 1);
    $('btn-x2').classList.toggle('sel', st.pMult !== 1);
    $('wager-note').textContent = 'Right on x' + c.wagerMult + ' scores double. Miss on x' + c.wagerMult + ' loses ' + c.wagerMissCost + '.';
  };

  // ---------- result ----------
  ui.buildResult = function () {
    var s = $('scr-result');
    s.innerHTML = '';
    s.appendChild(h('div', { id: 'res-banner', class: 'rb' }));
    s.appendChild(h('div', { id: 'res-scores', class: 'res' }));
    s.appendChild(h('div', { class: 'bd' }, [h('h4', { id: 'res-k' }), h('div', { id: 'res-cells', class: 'cells' })]));
    s.appendChild(h('div', { class: 'xp' }, [h('span', { id: 'res-xp' }), h('span', { id: 'res-lv' })]));
    s.appendChild(h('div', { class: 'btns' }, [
      h('button', { id: 'btn-rematch', class: 'btn p', type: 'button', text: 'Rematch' }),
      h('button', { id: 'btn-home', class: 'btn s', type: 'button', text: 'Home' }),
      h('button', { id: 'btn-report', class: 'btn-report', type: 'button', text: 'Copy report' })
    ]));
    s.appendChild(h('div', { id: 'res-seed', class: 'res-seed' }));
  };

  ui.renderResult = function (st, xpGain, topicLevel) {
    var r = st.result;
    var b = $('res-banner');
    b.className = 'rb ' + (r === 'win' ? 'banner-win' : r === 'loss' ? 'banner-loss' : 'banner-draw');
    b.textContent = r === 'win' ? 'WIN' : r === 'loss' ? 'LOSS' : 'DRAW';
    var sc = $('res-scores');
    sc.innerHTML = '';
    sc.appendChild(side('p', st, st.pScore, r === 'win' ? 'win' : ''));
    sc.appendChild(side('r', st, st.rScore, r === 'loss' ? 'win' : ''));
    var log = st.log || [], k = 0, cells = $('res-cells');
    cells.innerHTML = '';
    log.forEach(function (l, i) {
      if (l.pRight) k++;
      var cell = h('div', { class: 'c ' + (l.pRight ? 'g' : 'r') }, [
        document.createTextNode(String(i + 1)),
        h('small', { text: (l.pPts < 0 ? '' : '+') + l.pPts })
      ]);
      if (i === 6 && st.pMult > 1) cell.appendChild(h('small', { class: 'c-x2', text: 'x' + st.pMult }));
      cells.appendChild(cell);
    });
    $('res-k').textContent = k + ' OF 7 RIGHT';
    $('res-xp').textContent = '+' + xpGain + ' XP';
    var lbl = ui.topicLabel ? ui.topicLabel(st.pickedTopic) : st.pickedTopic;
    $('res-lv').textContent = lbl + ' Lv ' + topicLevel;
    $('res-seed').textContent = 'Seed ' + st.seed;
    $('btn-report').textContent = 'Copy report';
  };
})();
