(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.fxDefs = SD.fxDefs || {};
  const E = () => SD.engine || {};              // lazy: engine is written in parallel
  const used = (m, inst) => (E().onceUsed ? E().onceUsed(m, inst) : !!(m.once && m.once[inst.id + ':' + (inst.pid || '')]));
  const mark = (m, inst) => { if (E().markOnce) E().markOnce(m, inst); else { m.once = m.once || {}; m.once[inst.id + ':' + (inst.pid || '')] = true; } };
  const fire = (m, ctx, inst, text) => { if (E().fire) E().fire(m, ctx, inst, text); };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const myTurn = (m) => m.phase === 'attack' || m.phase === 'defend';

  // A1 Sharp Eye (active): once per match, exact opposing stance for the current turn.
  SD.fxDefs.A1 = { id: 'A1', kind: 'node', name: 'Sharp Eye', short: 'Sharp Eye', perPlayer: false,
    hooks: {
      tell(m, ctx) {
        m.flags = m.flags || {};
        if (m.flags.sharpEyeTurn !== m.turnNo) return;
        const st = ctx.peek && ctx.peek.stance;
        if (!st) return;
        ctx.exact = st;
        // admin default: tag text pushed on the ctx for the engine/UI chip; no once or rng touched.
        if (Array.isArray(ctx.tags)) ctx.tags.push('Sharp Eye: ' + cap(st));
        ctx.tag = 'Sharp Eye: ' + cap(st);
      }
    },
    active: {
      label: 'Sharp Eye',
      // admin default: usable only on my attack turn, before the pick, once per match
      can(m, inst) { return m.phase === 'attack' && !used(m, inst) && !(m.flags && m.flags.sharpEyeTurn === m.turnNo); },
      use(m, inst) { m.flags = m.flags || {}; mark(m, inst); m.flags.sharpEyeTurn = m.turnNo; fire(m, {}, inst, 'Sharp Eye: exact stance seen'); }
    } };

  // A2 Keep the Thread: lost attack keeps Build pips.
  SD.fxDefs.A2 = { id: 'A2', kind: 'node', name: 'Keep the Thread', short: 'Keep the Thread', perPlayer: false,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.side !== 'me' || ctx.win || ctx.preview) return;
        const keep = m.build.me;
        if (!(keep > 0) || !ctx.next) return;
        ctx.next.build = ctx.next.build || { me: 0, opp: 0 };
        ctx.next.build.me = keep;
        fire(m, ctx, inst, 'Keep the Thread: Build kept (' + keep + ')');
      }
    }, active: null };

  // D1 Rebound: once per match, my defending duel lost -> reroll my die.
  SD.fxDefs.D1 = { id: 'D1', kind: 'node', name: 'Rebound', short: 'Rebound', perPlayer: false,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'opp' || !ctx.win || used(m, inst)) return;
        mark(m, inst);
        const from = ctx.db;
        ctx.reroll('def');
        if (ctx.recompute) ctx.win = ctx.recompute();
        fire(m, ctx, inst, 'Rebound: rerolled ' + from + ' to ' + ctx.db);
      }
    }, active: null };

  // D2 Last Man: once per match, a tie while I attack goes to me.
  SD.fxDefs.D2 = { id: 'D2', kind: 'node', name: 'Last Man', short: 'Last Man', perPlayer: false,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || !ctx.tie || ctx.win || used(m, inst)) return;
        mark(m, inst);
        ctx.tieAtt = true;
        if (ctx.recompute) ctx.win = ctx.recompute(); else ctx.win = true;
        const c = m.cards && ctx.pid && m.cards[ctx.pid];
        const nm = (c && c.name) || (ctx.pid === (m.keeper && m.keeper.id) && m.keeper.name) || 'me';
        fire(m, ctx, inst, 'Last Man: tie to ' + nm);
      }
    }, active: null };

  // S1 Fresh Hand (active): once per match at the start of any of my turns, redraw the hand.
  SD.fxDefs.S1 = { id: 'S1', kind: 'node', name: 'Fresh Hand', short: 'Fresh Hand ready', perPlayer: false,
    hooks: {},
    active: {
      label: 'Fresh Hand',
      can(m, inst) { return !used(m, inst) && myTurn(m); },
      use(m, inst) {
        mark(m, inst);
        E().discardHand(m);
        // admin default: draw up to the current handSize (3, or 4 with Fourth Card); engine drawTo reshuffles the discard when the deck runs short
        E().drawTo(m, m.handSize || 3);
        fire(m, {}, inst, 'Fresh Hand: hand redrawn');
      }
    } };

  // S2 Fourth Card: hand of 4 for the whole match.
  SD.fxDefs.S2 = { id: 'S2', kind: 'node', name: 'Fourth Card', short: 'hand of 4', perPlayer: false,
    hooks: { handSize(m, ctx) { ctx.size = Math.max(ctx.size || 0, 4); } }, active: null };
})();
