(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.fxDefs = SD.fxDefs || {};
  const D = SD.fxDefs;

  // ---- lazy engine helpers (maker B owns the real ones; local fallbacks keep this file standalone) ----
  const key = (inst) => inst.id + ':' + (inst.pid || '');
  function onceUsed(m, inst) {
    const E = SD.engine;
    if (E && E.onceUsed) return E.onceUsed(m, inst);
    return !!(m.once && m.once[key(inst)]);
  }
  function markOnce(m, inst) {
    const E = SD.engine;
    if (E && E.markOnce) return E.markOnce(m, inst);
    m.once = m.once || {}; m.once[key(inst)] = true;
  }
  // once per HALF (Brannik, Tobbin): engine helpers when present, else local keys that include m.half
  function onceHalfUsed(m, inst) {
    const E = SD.engine;
    if (E && E.onceHalfUsed) return E.onceHalfUsed(m, inst);
    return !!(m.onceHalf && m.onceHalf[key(inst) + ':' + m.half]);
  }
  function markOnceHalf(m, inst) {
    const E = SD.engine;
    if (E && E.markOnceHalf) return E.markOnceHalf(m, inst);
    m.onceHalf = m.onceHalf || {}; m.onceHalf[key(inst) + ':' + m.half] = true;
  }
  function fire(m, ctx, inst, text) {
    const E = SD.engine;
    if (E && E.fire) return E.fire(m, ctx, inst, text);
    ctx.fxFired = ctx.fxFired || []; ctx.fxFired.push(inst.id);
    ctx.causes = ctx.causes || []; ctx.causes.push(text);
  }
  const flags = (m) => (m.flags = m.flags || {});
  const isOwner = (ctx, inst) => !!inst.pid && ctx.pid === inst.pid;
  const isKeeperOwner = (m, inst) => !!inst.pid && !!m.keeper && m.keeper.id === inst.pid;
  const win = (ctx) => (ctx.recompute ? ctx.recompute() : ctx.win);

  // ---------- Level 2 Traits ----------
  D.T_PLAYMAKER = { id: 'T_PLAYMAKER', kind: 'trait', name: 'Playmaker', short: 'Playmaker: +1 card', perPlayer: true, active: null,
    hooks: {
      // after my won Pass by the owner: hand of 4 until I play (engine: extraDraw, no redraw after that play)
      after(m, ctx, inst) {
        if (ctx.side !== 'me' || ctx.action !== 'pass' || !ctx.win || !isOwner(ctx, inst)) return;
        if (ctx.preview) return;
        ctx.extraDraw = (ctx.extraDraw || 0) + 1;
        fire(m, ctx, inst, 'Playmaker: won pass, draw 1 extra card');
      } } };

  D.T_WINGER = { id: 'T_WINGER', kind: 'trait', name: 'Winger', short: 'Winger: ignores Press once', perPlayer: true, active: null,
    hooks: {
      preRoll(m, ctx, inst) {
        if (ctx.side !== 'me' || ctx.action !== 'dribble' || !isOwner(ctx, inst) || onceUsed(m, inst)) return;
        // admin default: only spend it when the club is actually pressing (stance unknown -> treat as press)
        if (ctx.stance && ctx.stance !== 'press') return;
        ctx.ignorePress = true;
        if (ctx.preview) { if (Array.isArray(ctx.tags)) ctx.tags.push('Winger: ignores Press'); return; }
        markOnce(m, inst);
        fire(m, ctx, inst, 'Winger: dribble ignored Press');
      } } };

  D.T_STRIKER = { id: 'T_STRIKER', kind: 'trait', name: 'Striker', short: 'Striker: reroll a missed shot once', perPlayer: true, active: null,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || ctx.action !== 'shoot' || ctx.win || !isOwner(ctx, inst) || onceUsed(m, inst)) return;
        markOnce(m, inst);
        const from = ctx.da, to = ctx.reroll('att');
        const w = win(ctx);
        fire(m, ctx, inst, 'Striker: shot rerolled ' + from + ' to ' + to + (w ? ', now scores' : ', still no'));
      } } };

  D.T_ANCHOR = { id: 'T_ANCHOR', kind: 'trait', name: 'Anchor', short: 'Anchor: first lost duel, ball stays', perPlayer: true, active: null,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.preview || !isOwner(ctx, inst) || onceUsed(m, inst) || !ctx.next) return;
        // admin default: my lost attack -> club gets ball in its Defence (zone 0, not Midfield);
        // my lost defence -> club's ball does not advance (zone unchanged)
        if (ctx.side === 'me' && !ctx.win) {
          if (ctx.next.zone === 0) return;
          ctx.next.zone = 0;
          markOnce(m, inst);
          fire(m, ctx, inst, 'Anchor: lost duel, ball pushed back to their Defence');
        } else if (ctx.side === 'opp' && ctx.win && ctx.action !== 'pass' && ctx.action !== 'shoot') {
          ctx.next.zone = m.zone;
          markOnce(m, inst);
          fire(m, ctx, inst, 'Anchor: lost duel, ball stays in its zone');
        }
      } } };

  D.T_KEEPER = { id: 'T_KEEPER', kind: 'trait', name: 'Keeper', short: 'Keeper: first goal against, shooter rerolls', perPlayer: true, active: null,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'opp' || ctx.action !== 'shoot' || !ctx.win || !isKeeperOwner(m, inst) || onceUsed(m, inst)) return;
        markOnce(m, inst);
        const from = ctx.da, to = ctx.reroll('att');
        const w = win(ctx);
        fire(m, ctx, inst, 'Keeper: shooter rerolled ' + from + ' to ' + to + (w ? ', still scores' : ', saved'));
      } } };

  // ---------- Signature moves ----------
  D.SIG_LIO = { id: 'SIG_LIO', kind: 'sig', name: 'Dream Volley', short: 'Dream Volley: shoot from Midfield', perPlayer: true, active: null,
    hooks: {
      // listing only: never spends anything, so safe in preview and in real calls
      legal(m, ctx, inst) {
        if (!isOwner(ctx, inst) || ctx.zone !== 1 || !ctx.actions) return;
        if (ctx.actions.indexOf('shoot') < 0) ctx.actions.push('shoot');
      } } };

  D.SIG_JOSS = { id: 'SIG_JOSS', kind: 'sig', name: 'Sweep Across', short: 'Sweep Across: play from deck/discard', perPlayer: true, active: null,
    hooks: {
      defendCards(m, ctx, inst) {
        const f = flags(m);
        if (!ctx.preview) f.sweepOffered = false;
        if (onceUsed(m, inst) || !ctx.cards || ctx.cards.indexOf(inst.pid) >= 0) return;
        const inDeck = (m.deck || []).indexOf(inst.pid) >= 0, inDisc = (m.discard || []).indexOf(inst.pid) >= 0;
        if (!inDeck && !inDisc) return;
        ctx.cards.push(inst.pid);
        if (!ctx.preview) f.sweepOffered = true;
      },
      onPlay(m, ctx, inst) {
        if (ctx.preview || ctx.pid !== inst.pid) return;
        const f = flags(m);
        if (f.sweepOffered && !onceUsed(m, inst)) {
          markOnce(m, inst);
          fire(m, ctx, inst, 'Sweep Across: Joss played from outside the hand');
        }
        f.sweepOffered = false;
      },
      // admin default: whenever Joss is the defending card and loses, the club's ball does not advance
      after(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'opp' || !ctx.win || !isOwner(ctx, inst) || !ctx.next) return;
        if (ctx.action === 'shoot' || ctx.next.zone === m.zone) return;
        ctx.next.zone = m.zone;
        fire(m, ctx, inst, 'Sweep Across: lost duel, ball stays in its zone');
      } } };

  D.SIG_ZEFA = { id: 'SIG_ZEFA', kind: 'sig', name: 'Wing Switch', short: 'Wing Switch: dribble moves 2 zones', perPlayer: true, active: null,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || ctx.action !== 'dribble' || !ctx.win || !isOwner(ctx, inst) || !ctx.next) return;
        const z = Math.min(2, m.zone + 2);
        if (z <= ctx.next.zone) {
          // P6 fix: no second zone to move (dribble already reaches Attack) -> Build +1 instead
          const b = ctx.next.build || (ctx.next.build = { me: 0, opp: 0 });
          const nb = Math.min(m.T.buildMax, (b.me || 0) + 1);
          if (nb <= (b.me || 0)) return;
          b.me = nb;
          fire(m, ctx, inst, 'Wing Switch: no second zone, Build +1');
          return;
        }
        ctx.next.zone = z;
        fire(m, ctx, inst, 'Wing Switch: dribble moved 2 zones');
      } } };

  D.SIG_HADRO = { id: 'SIG_HADRO', kind: 'sig', name: 'Read the Run', short: 'Read the Run: stance and pick shown', perPlayer: true, active: null,
    hooks: {
      onPlay(m, ctx, inst) {
        if (ctx.preview || ctx.pid !== inst.pid) return;
        // admin default: window = the next 2 match turns by turnNo (crosses half-time)
        const f = flags(m);
        f.hadroFrom = m.turnNo;
        fire(m, ctx, inst, 'Read the Run: next 2 turns show stance and pick');
      },
      tell(m, ctx, inst) {
        const f = flags(m);
        if (f.hadroFrom == null) return;
        const d = m.turnNo - f.hadroFrom;
        if (d < 1 || d > 2) return;
        if (ctx.peek) {
          if (ctx.peek.stance && !ctx.exact) ctx.exact = ctx.peek.stance;
          if (ctx.peek.clubAction && !ctx.clubPick) ctx.clubPick = ctx.peek.clubAction;
        }
        if (Array.isArray(ctx.tags)) ctx.tags.push('Read the Run');
      } } };

  D.SIG_YSOLDE = { id: 'SIG_YSOLDE', kind: 'sig', name: 'Last Hand', short: 'Last Hand: reroll the save once', perPlayer: true, active: null,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'opp' || ctx.action !== 'shoot' || !ctx.win || !isKeeperOwner(m, inst) || onceUsed(m, inst)) return;
        markOnce(m, inst);
        const from = ctx.db, to = ctx.reroll('def');
        const w = win(ctx);
        fire(m, ctx, inst, 'Last Hand: save rerolled ' + from + ' to ' + to + (w ? ', still beaten' : ', saved'));
      } } };

  // ---------- Season Signatures (B-economy a) ----------
  // tie goes to the owner (preRoll shows it in the chip; roll names the cause when the tie really happened)
  function tieHooks(actions, label) {
    return {
      preRoll(m, ctx, inst) {
        if (ctx.side !== 'me' || !isOwner(ctx, inst) || actions.indexOf(ctx.action) < 0) return;
        ctx.tieAtt = true;
        if (ctx.preview && Array.isArray(ctx.tags)) ctx.tags.push(label + ': ties go to me');
      },
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || !isOwner(ctx, inst) || actions.indexOf(ctx.action) < 0) return;
        if (!ctx.tie || !ctx.win || !ctx.tieAtt) return;
        if (m.turnFx && !m.turnFx.tieBy) m.turnFx.tieBy = inst.id;
        fire(m, ctx, inst, label + ': tie went to ' + ((m.cards && m.cards[inst.pid] && m.cards[inst.pid].name) || 'me'));
      } };
  }
  D.SIG_DESSA = { id: 'SIG_DESSA', kind: 'sig', name: 'Sidestep', short: 'Sidestep: ties on Dribble/Shoot go to Dessa', perPlayer: true, active: null,
    hooks: tieHooks(['dribble', 'shoot'], 'Sidestep') };

  D.SIG_MAELIS = { id: 'SIG_MAELIS', kind: 'sig', name: 'Cold Finish', short: 'Cold Finish: ties on her Shoot go to Maelis', perPlayer: true, active: null,
    hooks: tieHooks(['shoot'], 'Cold Finish') };

  // lost attack duel in Defence or Midfield: ball stays in that zone (no turnover)
  D.SIG_YENNA = { id: 'SIG_YENNA', kind: 'sig', name: 'Hold Up', short: 'Hold Up: lost attack in Defence/Midfield, ball stays', perPlayer: true, active: null,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || ctx.win || !isOwner(ctx, inst) || !ctx.next || m.zone > 1) return;
        ctx.keepBall = true;
        ctx.next.holder = 'me'; ctx.next.zone = m.zone; // belt and braces: same result if the engine also reads keepBall
        fire(m, ctx, inst, 'Hold Up: lost duel, ball stays in ' + (m.zone === 0 ? 'Defence' : 'Midfield'));
      } } };

  // saved Shoot: ball stays in my Attack zone, I keep the turn
  D.SIG_RUVO = { id: 'SIG_RUVO', kind: 'sig', name: 'Follow Up', short: 'Follow Up: saved shot, I keep the ball in Attack', perPlayer: true, active: null,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || ctx.action !== 'shoot' || ctx.win || !isOwner(ctx, inst) || !ctx.next) return;
        ctx.keepTurn = true;
        ctx.next.holder = 'me'; ctx.next.zone = 2;
        fire(m, ctx, inst, 'Follow Up: shot saved, ball stays in Attack and I keep the turn');
      } } };

  // won Dribble in Midfield: a second hand card this turn, Shoot only
  D.SIG_VESKA = { id: 'SIG_VESKA', kind: 'sig', name: 'Twin Run', short: 'Twin Run: won Midfield Dribble, second card as Shoot', perPlayer: true, active: null,
    hooks: {
      after(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'me' || ctx.action !== 'dribble' || !ctx.win || !isOwner(ctx, inst) || m.zone !== 1) return;
        ctx.extraShoot = true;
        fire(m, ctx, inst, 'Twin Run: play a second card now, as a Shoot');
      } } };

  // once per HALF: reroll my d6 on a defending duel where Brannik is my card (keep the new roll)
  D.SIG_BRANNIK = { id: 'SIG_BRANNIK', kind: 'sig', name: 'Second Tackle', short: 'Second Tackle: reroll a defence once per half', perPlayer: true, perHalf: true, active: null,
    hooks: {
      roll(m, ctx, inst) {
        if (ctx.preview || ctx.side !== 'opp' || !isOwner(ctx, inst) || onceHalfUsed(m, inst)) return;
        // admin default: only spend it when the club's attack would win (a reroll of an already-held duel is a waste)
        if (!ctx.win) return;
        markOnceHalf(m, inst);
        const from = ctx.db, to = ctx.reroll('def');
        const w = win(ctx);
        fire(m, ctx, inst, 'Second Tackle: defence rerolled ' + from + ' to ' + to + (w ? ', still beaten' : ', held'));
      } } };

  // once per HALF: after my keeper saves, my ball starts in Midfield (zone 1) instead of Defence
  D.SIG_TOBBIN = { id: 'SIG_TOBBIN', kind: 'sig', name: 'Quick Throw', short: 'Quick Throw: after a save, ball starts in Midfield', perPlayer: true, perHalf: true, active: null,
    hooks: {
      // ctx.zone = start zone index (writable). Engine default 0 (Defence).
      saveZone(m, ctx, inst) {
        if (ctx.preview || !isKeeperOwner(m, inst) || onceHalfUsed(m, inst)) return;
        if ((ctx.zone || 0) >= 1) return;
        markOnceHalf(m, inst);
        ctx.zone = 1; ctx.startZone = 1;
        fire(m, ctx, inst, 'Quick Throw: save thrown out to Midfield');
      } } };

  // play Orlo as my attack card even when he is in the deck or discard (not once)
  D.SIG_ORLO = { id: 'SIG_ORLO', kind: 'sig', name: 'Call for Ball', short: 'Call for Ball: play Orlo from deck/discard', perPlayer: true, active: null,
    hooks: {
      attackCards(m, ctx, inst) {
        const f = flags(m);
        if (!ctx.preview) f.orloOffered = false;
        if (!ctx.cards || ctx.cards.indexOf(inst.pid) >= 0) return;
        const inDeck = (m.deck || []).indexOf(inst.pid) >= 0, inDisc = (m.discard || []).indexOf(inst.pid) >= 0;
        if (!inDeck && !inDisc) return;
        ctx.cards.push(inst.pid);
        if (!ctx.preview) f.orloOffered = true;
      },
      onPlay(m, ctx, inst) {
        if (ctx.preview || ctx.pid !== inst.pid || ctx.side === 'opp') return;
        const f = flags(m);
        if (f.orloOffered) fire(m, ctx, inst, 'Call for Ball: Orlo played from outside the hand');
        f.orloOffered = false;
      } } };
})();
