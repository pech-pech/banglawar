# CONTRACT-BUILD: Squad Duel slice (CG-20261123-002), build sq-slice-1
Lead-owned. Every maker reads THIS file + its own slice section + the source docs it names. Do not edit other owners' files. Nobody stops to ask: label a guess `// admin default:` and keep going. FM wins conflicts (a maker's working code beats a reviewer note).

Spec docs (read-only, folder `S=/mnt/project-files/games-design/concepts/CG-20261123-002/`):
- `S/SLICE-SPEC.md` = the ONE number sheet (wins on any number). `S/CONTENT-SHEET.md` v4 = names/content.
- `S/work/B-bot5.md` section "ENGINE RULES" rules 1-11 (rule 12 Marked man NOT used). Reference engine `S/work/bot/bot.js` function `match5` (lines ~884-1130; RULE5.H2, tell "B"). Bot names: Anvils = Iron Grimsby, Lanterns = Restless Reading.
- Look: `S/looks/SH-match-L2.html` (+ PNGs `S/looks/SH-match-L2-344-*.png`), `S/looks/L2-night-broadcast.html`.

M's must-haves (word for word, never cut): 1 Football manager genre. 2 Stadium scene turn based matches. 3 Progression system and skill tree. 4 Gacha hero collector (collect players by pulls, in-game coins only, no real money).

## 0. Layout and module pattern
Game folder: `pages/squad-duel/` (served at https://pech-pech.github.io/banglawar/squad-duel/). Plain classic `<script>` files, NO modules, NO build step, NO network at runtime, no CDN.
Every JS file is wrapped exactly like this so it also loads in Node (`require`) for bots:
```js
(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.engine = { /* ... */ };          // your namespace only
})();
```
Look things up lazily at call time (`SD.effects`, `SD.odds`...), never at load time, so load order does not matter and each file self-tests alone with stubs.
Script order in index.html: js/rng.js, js/data.js, js/odds.js, js/club-ai.js, js/fx-nodes.js, js/fx-players.js, js/engine.js, js/progress.js, js/gacha.js, ui/scene.js, ui/match.js, ui/manager.js, ui/meta-a.js, ui/meta-b.js, ui/tweak.js, js/app.js.
CSS files: css/base.css (integrator: tokens + shell), css/manager.css, css/match.css (match.js owner), css/scene.css, css/meta-a.css, css/meta-b.css, css/tweak.css. Font: fonts/atkinson-400.woff2, fonts/atkinson-700.woff2 (integrator copies from pages/cricket-sixes/kit/skins/scorebook/fonts/atkinson-hyperlegible-latin-{400,700}-normal.woff2), family name `"Atkinson"`.
Tokens (L2 Night broadcast, from the mock), defined on :root in base.css: `--bg:#050a18 --navy:#0a1330 --glass:rgba(14,24,52,.88) --line:rgba(120,170,255,.32) --neon:#2cf0ff --gold:#ffc83a --txt:#f2f6ff --dim:#a9b8d8 --red:#ff4d6d --ink:#031018 --home:#3f7dff --away:#ff6f86 --good:#7dffb0`. Rarity frame colours: `--r-common:#a9b8d8 --r-rare:#3f7dff --r-epic:#b46bff --r-legend:#ffc83a`. Each UI css file scopes its rules under its root id.

Screen target: Fold cover 344x882 first (475x638 second). No page scroll on any screen (inner panels may scroll only in Manager squad list and Tweak). Every touch target >= 56x56 CSS px incl. the gear. Respect safe-area insets. `prefers-reduced-motion` and Tweak `reducedMotion` cut all animation incl. SVG/canvas. URL params: `?seed=N` (new game seed), `?fast=1` (no animation delays, for tests), `?reset=1` (wipe save).

## 1. Ids, rng and seeds (js/rng.js, maker A)
```
SD.rng.make(seed:uint32) -> R  // mulberry32, identical to bot.js mulberry32
  R.next() -> float [0,1)   R.int(n) -> 0..n-1   R.d6() -> 1..6 (= 1+floor(next()*6))
  R.shuffle(arr) -> arr (in place, exactly bot.js shuffle5: for i=len-1..1, j=floor(next()*(i+1)))
  R.pick(arr)   R.state() -> uint32   R.clone() -> R (independent copy at same state, for peeking)
SD.rng.hash(...parts) -> uint32  // FNV-1a over String(parts.join('|'))
SD.rng.matchSeed(gameSeed, matchNo) -> uint32 = hash(gameSeed,'match',matchNo)
SD.rng.pullSeed(gameSeed, pullNo) -> uint32 = hash(gameSeed,'pull',pullNo)
SD.rng.newGameSeed() -> uint32 from Date.now() (only when no ?seed)
```
Per match streams (engine): `main = make(seed)`, `deck = make((seed ^ 0xA5A5A5A5)>>>0)`, `fxr = make((seed ^ 0x5EED5EED)>>>0)` (rerolls only). Each turn the engine draws from `main` exactly 4 numbers in this order, always: `ua` (club action), `us` (club stance), `da` (attacker d6), `db` (defender d6). This keeps parity with bot.js match5.

## 2. Data (js/data.js, maker E) — copy from CONTENT-SHEET v4, nothing invented
```
SD.data.PLAYERS: [{ id:'tavo', name:'Tavo', role:'Striker'|'Playmaker'|'Winger'|'Anchor'|'Keeper',
   rarity:'Common'|'Rare'|'Epic'|'Legend', pac, pas, sho, def, num:9, look:'#9, spiky red-blond hair...',
   sig: null | { id:'SIG_LIO', name:'Dream Volley', text:'...exact rule text...' }, starter:true|false }]  // 12 players, CONTENT-SHEET section 1, v2 default stats
SD.data.byId(pid) -> player
SD.data.FLATTER: { tavo:{pac:5,pas:2,sho:6,def:2}, mirelle:{...}, pip:{...}, kessan:{...} }  // Tweak preset 'Flatter starters'
SD.data.DEFAULT_LINEUP: { keeper:'ondra', outfield:['kessan','mirelle','pip','tavo'], bench:['barro','sunniva'] }
SD.data.POOL: ['lio','joss','zefa','hadro','ysolde']      // pull pool (Rare 2, Epic 2, Legend 1)
SD.data.CLUBS: { preston:{ id:'preston', name:'Proud Preston', label:'PRESTON', home:true },
  grimsby:{ id:'grimsby', name:'Iron Grimsby', label:'GRIMSBY', style:'Iron Dock', def:4, keeper:{name:'Garrick', def:7}, atk:7,
     weights:{pass:.30, dribble:.50, through:.20}, offPress:.30,
     defenders:[{name:'Brogan', zone:0, press:.30},{name:'Dunmar', zone:1, press:.60},{name:'Corwin', zone:2, press:.20}],
     scout:'Iron Grimsby: sit deep, Dribble about 5 in 10. They mostly Drop, but their midfield man steps up.' },
  reading:{ id:'reading', name:'Restless Reading', label:'READING', style:'High Press', def:5, keeper:{name:'Neve',def:8}, atk:7, weights:{pass:.20,dribble:.25,through:.55}, offPress:.65,
     defenders:[{name:'Wenna',zone:0,press:.70},{name:'Fenric',zone:1,press:.40},{name:'Isken',zone:2,press:.80}], scout:'Restless Reading: press high, Through ball about 5 or 6 in 10. They mostly Press, but their midfield man sits back.' } }
  // defenders[z].zone = MY ball zone (0 my Defence, 1 my Midfield, 2 my Attack). Club def/keeper/atk are overridden by T keys (section 9).
SD.data.FIXTURES: ['grimsby','reading']          // match 1, match 2; Preston home both
SD.data.FORMATIONS: { Wall:{ defVs:{dribble:3}, att:{}, text:'+3 to my defending duel against Dribble' },
  Diamond:{ defVs:{through:3}, att:{pass:1}, text:'+3 to my defending duel against Through ball, +1 to my Pass' }, Spear:{ defVs:{}, att:{dribble:1, shoot:1}, text:'+1 to my Dribble and +1 to my Shoot' } }  // the 3 is T.formCounter
SD.data.NODES: [{ id:'A1', tab:'attack', tier:1, cost:1, name:'Sharp Eye', text:'...', req:null, fork:null, active:true },
  { id:'A2', tab:'attack', tier:2, cost:2, name:'Keep the Thread', req:'A1', fork:'AD2' },
  { id:'D1', tab:'defence', tier:1, cost:1, name:'Rebound' }, { id:'D2', tab:'defence', tier:2, cost:2, name:'Last Man', req:'D1', fork:'AD2' },
  { id:'S1', tab:'squad', tier:1, cost:1, name:'Fresh Hand', active:true }, { id:'S2', tab:'squad', tier:2, cost:2, name:'Fourth Card', req:'S1' }]  // text from CONTENT-SHEET 4a; fork 'AD2' = only one of A2/D2
SD.data.LOCKED_TREE: rows of tiers 3-5 (CONTENT-SHEET 4b) shown greyed only
SD.data.TRAITS: { Playmaker:{id:'T_PLAYMAKER', name:'Spare Ball', text:'...'}, Winger:{id:'T_WINGER', name:'Quick Feet'}, Striker:{id:'T_STRIKER', name:'Second Strike'}, Anchor:{id:'T_ANCHOR', name:'Hold Firm'}, Keeper:{id:'T_KEEPER', name:'Big Read'} }  // texts = CONTENT-SHEET section 5 Level 2; names are admin defaults
SD.data.XP: { duelWon:3, goal:10, assist:5, save:8, win:20, draw:12, loss:12, benchShare:.5, levels:[0,30,80,150] } // levels[i] = total XP for Level i+1
SD.data.PAY: { opening:{coins:100, sp:3}, later:{ W:{coins:100,sp:2}, D:{coins:70,sp:1}, L:{coins:50,sp:1} } }
SD.data.PULL: { cost:100, starter:{Rare:.70, Epic:.25, Legend:.05}, normal:{Common:.55, Rare:.30, Epic:.12, Legend:.03}, pityEpic:10, pityLegend:30, maxStars:5, dupeCoinsAtMax:25 }
SD.data.TROPHY: [{id:'m1', label:'League match 1'}, {id:'m2', label:'League match 2'}, {id:'more', label:'4 more League matches'}, {id:'cup', label:'Cup Final', locked:true}]
SD.data.NEXT_GOAL: 'Next goal: win 4 more League matches with your squad to unlock the Cup Final.'
SD.data.TWEAK_DEFAULTS: { see section 9 }   SD.data.TWEAK_META: [{key, label, group, min, max, step, type:'num'|'bool'}]
```

## 3. Odds (js/odds.js, maker C)
```
SD.odds.duel(gap:int, tieAtt=false, dieN=6) -> p   // P(attacker wins), enumerate dieN^2 (da,db) pairs: da=dieN&&db=1 -> att wins; da=1&&db=dieN -> att loses; else gap+da-db > 0 (>=0 if tieAtt)
SD.odds.table(dieN=6) -> [{gap:-4..+5, p}]  // must equal SLICE-SPEC X1: 2.8, 8.3, 16.7, 27.8, 41.7, 58.3, 72.2, 83.3, 91.7, 97.2 %
SD.odds.attWins(gap, da, db, tieAtt, dieN=6) -> bool   // the single resolve rule; engine uses this
SD.odds.stanceMod(action, stance) -> int    // attacker-gap terms: Press: dribble -1, through +1; Drop: dribble +1, through -1; pass/shoot 0
SD.odds.attackChip(gap, action, pressW, opts) -> { p, pPress, pDrop, pressW }    // p = pressW*duel(gap+mod(press)) + (1-pressW)*duel(gap+mod(drop)); opts.exactStance ('press'|'drop') -> pressW 1/0; opts.tieAtt; opts.ignorePress (press mod treated as 0); opts.dieN
SD.odds.defendChip(rows:[{action, w, gap, tieAtt?}], opts) -> { p /* P I win */, byAction:{pass:p,...} }  // gap = CLUB attacker gap incl. my stance mod
SD.odds.coarse(p) -> 'Long shot'|'Tough'|'Even'|'Good'|'Strong'  // <.2,<.4,<.6,<.8,else; used when T.coarseChip
SD.odds.pct(p) -> e.g. '58%'
```

## 4. Club AI (js/club-ai.js, maker D)
```
SD.clubAI.weights(club, zone /*club's own ball zone*/, trailing:boolean, T) -> {pass, dribble, through, shoot}
  // exactly bot.js clubDist5: trailing -> dribble+T.trailShift, through+T.trailShift, pass=max(0,pass-2*T.trailShift), renormalise; zone<2: shoot 0; zone 2: {pass:wp, shoot:1-wp, dribble:0, through:0}
SD.clubAI.pickAction(w, ua) -> 'pass'|'dribble'|'through'|'shoot'   // cumulative in order pass,dribble,through,shoot; same fall-through as bot.js
SD.clubAI.defender(club, myZone) -> {name, zone, press}
SD.clubAI.pressChance(club, myZone, T) -> p   // T.tellOn=false -> club.offPress for all zones
SD.clubAI.stance(p, us) -> us < p ? 'press' : 'drop'
SD.clubAI.tellText(club, myZone, T) -> 'Dunmar (Midfield): Press 60 / Drop 40'
SD.clubAI.attackTell(club, zone, trailing, T) -> 'Grimsby attack: Pass 30 / Dribble 50 / Through 20'
SD.clubAI.clubStats(club, T) -> {def, keeper, atk}  // from T.grimsbyDef etc.
```

## 5. Engine (js/engine.js, maker B) — port of match5 H2 + hooks
Actions: `'pass','dribble','through','shoot'`. Stats: pass/through PAS, dribble PAC, shoot SHO, defence DEF. Zones in holder's own view: 0 Defence, 1 Midfield, 2 Attack. Sides `'me'|'opp'`.
```
SD.engine.newMatch(setup) -> m
 setup = { seed, matchNo:1|2, club: SD.data.CLUBS.grimsby, formation:'Wall'|'Diamond'|'Spear',
   keeper: P, outfield:[P,P,P,P], bench:[P,P],     // P = { id,name,role,rarity,pac,pas,sho,def,level,sig } effective stats
   nodes:['A1',...], T: tweak values object }
 m = { seed, setup, club, cs:{def,keeper,atk}, T, half:1, turn:1 /*1..T.halfTurns within half*/, turnNo:1 /*1..2*halfTurns*/,
   holder:'me'|'opp', zone:0..2, score:{me:0,opp:0}, crowd:0, roarReady:false, build:{me:0,opp:0},
   deck:[pid], hand:[pid], discard:[pid], handSize:3, cards:{pid:P} /*6 outfield*/, keeper:P,
   fx:[{id,pid?}], once:{} /*key -> true*/, flags:{} /*fx scratch*/, log:[Event], phase:'attack'|'defend'|'halftime'|'full', rng:{main,deck,fxr} }
 Start: deck = shuffle([...outfield ids, ...bench ids]) with rng.deck; draw handSize (pop from end, as bot.js). Half 1: holder 'me', zone 1. Half 2: holder 'opp', zone 1, build reset (score, crowd, deck, hand, discard carry).
 phase = holder==='me' ? 'attack' : 'defend'.

SD.engine.legal(m, pid) -> ['pass','dribble','through'] | ['pass','shoot']  (zone 2), then fx hook 'legal'
SD.engine.tell(m) -> { defender:{name,zone,press}, pressW, exact:null|'press'|'drop', clubPick:null|action, clubW:{...}|null, text }   // fx hook 'tell' may set exact / clubPick (engine peeks this turn's ua/us with rng.main.clone(), never consuming)
SD.engine.previewAttack(m, pid, action) -> { parts:[{k:'Mirelle PAS',v:6},{k:'Playmaker',v:1},{k:'Pass',v:2},{k:'Build',v:1},{k:'Roar',v:1},{k:'Spear',v:1}], capNote:'cap +3'|null,
   myScore /*stat+capped bonus, no dice*/, oppParts:[{k:'Garrick save',v:7}] | [{k:'Brogan DEF',v:4}], oppScore, gap, chip:{p,pPress,pDrop,pressW}, tags:['Sharp Eye: Press'] }
SD.engine.previewDefend(m, pid, stance) -> { rows:[{action,w,gap,p}], chip:{p}, myDef, parts, tags }   // shoot row uses keeper (no card)
SD.engine.playAttack(m, pid, action) -> Event      // only when phase 'attack'
SD.engine.playDefend(m, pid, stance) -> Event      // only when phase 'defend'; if club shoots: keeper saves, card NOT played (stays in hand)
SD.engine.nextPhase(m) -> m.phase   // after an Event: advances turn; sets 'halftime' after the last turn of half 1, 'full' after half 2
SD.engine.startHalf2(m)
SD.engine.actives(m) -> [{id, label, can:boolean}]   SD.engine.use(m, fxId) -> bool   // active abilities (A1 Sharp Eye, S1 Fresh Hand) via def.active
SD.engine.drawTo(m, n)   SD.engine.discardHand(m)   SD.engine.playCard(m, pid)   // deck helpers used by fx; reshuffle discard (incl. card just played) when deck empty, using rng.deck
SD.engine.summary(m) -> { matchNo, club:id, score:{me,opp}, res:'W'|'D'|'L', stats:{ pid:{duelsWon, goals, assists, saves} }, fxUsed:[ids] }
```
Score rules (engine rules 1-11, SLICE-SPEC X1, X16, X17, X21, X22):
- My attack: `myScore = stat + min(T.cap, role + formAtt + (action!=='pass'? build.me : 0) + roar + (action==='pass'? T.passBonus:0))`. role +1: Playmaker pass/through, Winger dribble, Striker shoot. formAtt: Spear dribble+1 shoot+1, Diamond pass+1. roar = roarReady?1:0.
- Club defends my attack: `oppScore = action==='shoot' ? cs.keeper : cs.def` (no roar for them). Gap = myScore - oppScore. Stance mod on dribble/through only (club stance = clubAI.stance(pressChance(myZone), us)).
- Club attacks: `clubScore = cs.atk + min(T.cap, action==='pass' ? T.passBonus : build.opp)`. My defence `myDef = action==='shoot' ? keeper.def + roar : card.def + (Anchor?1:0) + roar + (formation.defVs[action] ? T.formCounter : 0)`. Gap = clubScore - myDef + stanceMod(action, myStance). Club trailing = score.opp < score.me.
- Resolve with SD.odds.attWins(gap, da, db, tieAtt, T.die). Then crowd (me always home): roarReady=false; meWon ? crowd=min(T.roarAt,crowd+1) : max(0,crowd-1); if crowd>=T.roarAt -> roarReady=true, crowd=0.
- Win: shoot -> goal, both builds 0, other side holds, zone 1. pass -> build[holder]=min(T.buildMax,build+1), no move. dribble/through -> zone+1, build[holder]=0. Loss: other side holds, zone = (shoot ? 0 : 1), both builds 0.
- Cards: attack card and defend card (not on club shoot) go to discard, draw back to handSize.
Event = { turnNo, half, turn, side:'me'|'opp', zone, pid|null, action, stance, hand:[pids before play], deck:n, discard:n,
  parts, oppParts, myScore, oppScore, gap, chip:{p}, dice:{att, def}, rerolls:[{who, from, to, by}], tieBy:null|fxId,
  win /*attacker won*/, meWon, goal:null|'me'|'opp', save:bool, cause:'Mirelle Pass 6+3 +d5 = 14 v Brogan 4 +d3 = 7: won, Build 2', tags:[], fxFired:[ids], score:{me,opp}, after:{holder, zone, build} }
`cause` is a short readable line that names every fx that fired ("Rebound: rerolled 2 to 5").

### 5b. Effect hooks (dispatcher in engine.js; definitions in fx-*.js)
Registry: `SD.fxDefs = SD.fxDefs || {}`; each fx file adds `SD.fxDefs[ID] = def`.
```
def = { id, kind:'node'|'trait'|'sig', name, short:'chip tag text', perPlayer:boolean,
  hooks: { handSize(m,ctx,inst), legal(m,ctx,inst), tell(m,ctx,inst), preRoll(m,ctx,inst), roll(m,ctx,inst), after(m,ctx,inst), defendCards(m,ctx,inst), onPlay(m,ctx,inst) },
  active: null | { label, can(m,inst)->bool, use(m,inst)->void } }
inst = { id, pid|null }    // pid = owning player for traits/sigs
```
Collection (engine, at newMatch): nodes -> `{id}`; for each pitch player (4 outfield + keeper) and bench player with `level>=2` -> trait `{id:SD.data.TRAITS[role].id, pid}` (a trait fires only when that player is the card in the duel; keeper trait when the keeper saves); for each outfield/bench/keeper with `sig` -> `{id:sig.id, pid}`. `T.fxOff[id]===true` disables one (bots). Once-per-match key `m.once[id+':'+(pid||'')]` (half-time never resets). Helper for fx files: `SD.engine.onceUsed(m,inst)`, `SD.engine.markOnce(m,inst)`, `SD.engine.fire(m, ctx, inst, causeText)` (pushes fxFired + cause/tag text).
Engine `run(hook, ctx)` = for each inst in m.fx with def.hooks[hook] (and not fxOff): def.hooks[hook](m, ctx, inst). Every hook must check `ctx.preview` and NOT spend once-flags or rng when preview is true.
Hook ctx shapes (engine builds; fx mutates):
- handSize: `{size}` (S2 -> 4).
- legal: `{pid, zone, actions}` (SIG_LIO: Lio in zone 1 adds 'shoot'; keeper saves as usual).
- tell: `{exact:null, clubPick:null, pressW, peek:{stance, clubAction}, preview}` (A1 when activated this turn: exact = peek.stance; SIG_HADRO: for 2 turns after Hadro is played, exact stance and clubPick shown).
- preRoll: `{side, pid, action, stance, ignorePress:false, tieAtt:false, preview}` (T_WINGER: dribble ignores Press once; D2: tieAtt true once when I attack and gap+dice would tie: admin default = auto-fire on the first tie only, so engine passes `wouldTie` in roll instead; D2 lives in roll hook).
- roll: `{side, pid, action, da, db, gap, win, tie:boolean, reroll:(who:'att'|'def')=>newD6 /*uses rng.fxr, updates ctx.da/db*/, recompute:()=>ctx.win, tieAtt:false}` (D1 Rebound: my defending duel lost -> reroll my die once; D2 Last Man: I attack and it is a tie -> win once; T_STRIKER: my shoot lost -> reroll my die once; T_KEEPER: club shot would score -> reroll shooter die once; SIG_YSOLDE Last Hand: club shot would score -> reroll save die once; order: Keeper trait then Last Hand).
- after: `{side, pid, action, win, next:{holder, zone, build:{me,opp}}, extraDraw:0}` engine applies `next` after the hook. (A2: my attack lost -> next.build.me keeps old value; T_ANCHOR: first lost duel with that Anchor as card -> admin default: on my lost attack club gets ball in its Defence (zone 0) not Midfield; on my lost defence the club's ball does not advance (zone unchanged); SIG_JOSS on defence lost -> zone unchanged; SIG_ZEFA won dribble by Zefa -> +2 zones (max 2), once? no: every time, per sheet; T_PLAYMAKER won pass -> extraDraw 1 (hand +1 until next play, no redraw after that play)).
- defendCards: `{cards:[pids]}` (SIG_JOSS Sweep Across: add 'joss' if in deck or discard, once per match; engine removes him from where he is when played).
- onPlay: `{pid, side}` after any card is played (SIG_HADRO starts its 2-turn window).
Active abilities (UI buttons): A1 Sharp Eye (my attack turn, before pick), S1 Fresh Hand (start of any of my turns: discard hand, draw handSize; deck short -> draw rest, reshuffle discard, draw). AUTO (admin default, no button): D1, D2, A2, S2, all traits, all sigs; first legal moment fires them.
fx-nodes.js (maker F1): A1, A2, D1, D2, S1, S2. fx-players.js (maker F2): T_PLAYMAKER, T_WINGER, T_STRIKER, T_ANCHOR, T_KEEPER, SIG_LIO, SIG_JOSS, SIG_ZEFA, SIG_HADRO, SIG_YSOLDE.

## 6. Progress, save, tree (js/progress.js, maker G)
App state `S` (the only saved object, key `localStorage['squadDuel.v1']`, all access try/catch, never write a lower `S.v` over a higher one):
```
S = { v:1, build:'sq-slice-1', seed, step:'manager1'|'match1'|'result1'|'tree'|'pull'|'manager2'|'match2'|'result2'|'end',
  coins:0, sp:0, owned:{ pid:{ stars:0, xp:0, level:1, isNew:false } }, lineup:{keeper, outfield:[4], bench:[2]},
  formation:'Wall', nodes:[], spent:{attack:0,defence:0,squad:0}, pulls:0, pity:{epic:0, legend:0}, lastPull:null, results:[{matchNo, club, me, opp, res}],
  reports:[Event[] per match] }
SD.progress.STEPS = ['manager1','match1','result1','tree','pull','manager2','match2','result2','end']
SD.progress.newState(seed) -> S (7 starters owned, DEFAULT_LINEUP, formation 'Wall')
SD.progress.load() -> S|null    SD.progress.save(S) -> bool    SD.progress.wipe()
SD.progress.levelOf(xp) -> 1..4     SD.progress.xpNext(xp) -> {level, into, need, nextLabel}
SD.progress.statsOf(S, pid, T) -> P (data + T.flatterStarters + Level3/Stars bumps (none reachable in slice, but coded) + level + sig)
SD.progress.matchNo(S) -> 1|2 (from step)
SD.progress.applyMatch(S, summary, T) -> Reward = { coins, sp, xp:{pid:gain}, levelUps:[{pid, level, trait}], opening:boolean }
   // XP: 5 pitch players (incl keeper) get event XP + result XP; bench gets benchShare of result XP only; match 1 = Opening day: T.openingCoins, T.openingSP, every pitch player raised to >= levels[1] (Level 2). Writes S.results.
SD.progress.canBuy(S, nodeId) -> {ok, why}   SD.progress.buy(S, nodeId)   SD.progress.respec(S, tab, T) (T.respecCost Coins, refunds that tab's SP, frees fork)
SD.progress.setLineup(S, lineup) -> {ok, why}  // exactly 1 keeper + 4 outfield + 2 outfield bench, all owned, no dupes
SD.progress.swap(S, slot /*'k'|'o0'..'o3'|'b0'|'b1'*/, pid) -> {ok, why}  // swaps with wherever pid was
SD.progress.squadCount(S) -> {have, of:12}
```

## 7. Gacha (js/gacha.js, maker H)
```
SD.gacha.cost(T) -> T.pullCost      SD.gacha.canPull(S, T) -> {ok, why, have, need}
SD.gacha.oddsFor(S, T) -> {label:'Starter pull: Rare or better. Normal odds from pull 2.'|'Normal odds', table:{Rare:.7,...}}
SD.gacha.pull(S, T) -> PullResult { pullNo, pid, rarity, isNew, stars, dupeCoins, pityBefore, pityAfter, starter:boolean }
   // rng = SD.rng.make(SD.rng.pullSeed(S.seed, S.pulls+1)); starter odds (T.starterRare/Epic/Legend %) on pull 1; normal from pull 2; Common roll = dupe of a random owned starter (+1 star); within a tier equal among POOL players of that rarity; pity Epic by T.pityEpic, Legend by 30 (pull 1 counts); sets owned[pid].isNew=true, S.lastPull, coins -= cost, S.pulls++
SD.gacha.pityText(S, T) -> 'Epic pity 1/10'
```

## 8. UI (all render into `#screen`; app.js clears it and calls `SD.ui.<x>.render(el)`)
UI modules read/write state only via `SD.app`: `SD.app.S` (state), `SD.app.T` (tweak values), `SD.app.go(step)`, `SD.app.save()`, `SD.app.matchSetup()` -> setup, `SD.app.endMatch(m)` (applies rewards, stores report, go('resultN')), `SD.app.lastReward`, `SD.app.fast` (bool), `SD.app.reduced` (bool), `SD.app.toast(msg)`, `SD.app.setScorebug(text|{home,away,hs,as})`.
Step -> module: manager1/manager2 -> SD.ui.manager, match1/match2 -> SD.ui.match, result1/result2 -> SD.ui.result, tree -> SD.ui.tree, pull -> SD.ui.pull, end -> SD.ui.end.
Common: every button is `<button>` >= 56px tall (min-height:56px). Primary action button bottom right. Text min 12px. No emojis as icons (inline SVG ok). For self-test, a UI maker may build a tiny harness html in its own scratchpad that loads the real js/ files that exist plus stubs.

### ui/manager.js + css/manager.css (maker I) — `SD.ui.manager.render(el)`
Root `#mgr`. Header: PROUD PRESTON + opponent chip "v IRON GRIMSBY" (FIXTURES[matchNo-1]). `#scout` = club.scout line. `#mgr-pitch`: 5 slots `.slot[data-slot="k|o0|o1|o2|o3"]` showing a mini card (name, role, top stat, Trait badge if level>=2, `.badge-new` if isNew). `#mgr-bench`: `.slot[data-slot="b0|b1"]`. Formation buttons `#form-wall #form-diamond #form-spear` (aria-pressed) each with its one-line effect. Swap: tap a slot -> `#mgr-squad` panel lists owned players that fit (keeper slot: keepers only; others: outfield) as `.sq-card[data-pid]` -> tap -> SD.progress.swap. `#btn-kickoff` bottom right ("Kick off v Grimsby") -> go('match1'|'match2'). isNew cleared when fielded. Save on every change.

### ui/scene.js + css/scene.css (maker J2) — stadium visual
```
SD.ui.scene.mount(el) -> void        // inline SVG #sv, sized to el (ResizeObserver); night stadium: stands with crowd dots, 4 floodlights with beams, pitch with 3 zone bands (Preston attack left->right: my Defence | Midfield | my Attack), zone labels, broadcast lower-third feel
SD.ui.scene.update(m)                // ball at holder/zone (opp zone z = my zone 2-z), my 4 outfield tokens + keeper, opp facing defender highlighted + opp keeper (circles with shirt number, >=44px at 344), Crowd meter, Roar glow when m.roarReady
SD.ui.scene.play(ev) -> Promise      // dice pair + ball move + goal/save flash (<=700ms; resolves at once when SD.app.fast or SD.app.reduced)
```
### ui/match.js + css/match.css (maker J1) — `SD.ui.match.render(el)`
Creates `m = SD.engine.newMatch(SD.app.matchSetup())`, stores `SD.app.m = m`. Layout top to bottom (copy mock structure/CSS from SH-match-L2.html): `#info` (turn "H1 T3/6", formation tag, `#roar` Crowd pips, `#build` pips), `#scene` (SD.ui.scene.mount), `#tell` (attack: facing defender + Press/Drop bar; defence: club attack weights; exact/peek tags), `#band` (chip: parts, "= total", v opp parts, `#odds` big %, cap note; after resolve: `#cause` line + dice), `.hd` with `#deckcount` "Deck 3" `#disccount` "Discard 0", `#hand` grid of 3 or 4 `.card[data-pid]` (name, role, PAC/PAS/SHO/DEF with the used stat lit, Trait/Sig tag), `#acts` row: attack `#act-pass #act-dribble #act-through #act-shoot` (legal only) or defence `#st-press #st-drop`, ability buttons `#ab-sharp #ab-fresh` (from SD.engine.actives), `#btn-confirm` bottom right (disabled until card + action/stance). Flow: pick card -> pick action -> chip updates live -> Confirm -> engine.play* -> scene.play(ev) -> show cause -> `#btn-next` "Next turn" (T.autoNext: auto after 1200ms; fast: immediate) -> nextPhase. Half-time overlay `#halftime` (score, "Grimsby kick off", `#btn-half`). Full time `#fulltime` (score, stamp WIN/DRAW/LOSS, `#btn-ft` -> SD.app.endMatch(m)). Ignore stray taps while animating and on overlays. Defending turn heading "Grimsby attack: pick a defender card and a stance". Calls SD.app.setScorebug each turn.

### ui/meta-a.js + css/meta-a.css (maker K1) — result + tree
`SD.ui.result.render(el)`: root `#result`; score, res stamp, rows `#rw-coins #rw-sp`, per player XP bar + Level, `.lvl-up` with Trait name/text on Level 2, locked line "Level 3: +1 top stat (n XP to go)" greyed; "Opening day" banner on match 1. Reads SD.app.lastReward + S.results. `#btn-result-next` -> 'tree' after match 1, 'end' after match 2.
`SD.ui.tree.render(el)`: root `#tree`; SP counter `#sp`; tabs `#tab-attack #tab-defence #tab-squad`; nodes `.node[data-id]` (name, cost, text, state owned/buyable/locked/fork-locked) tap -> detail + `#btn-buy`; `#btn-respec` (cost shown, in-page confirm); greyed tiers 3-5 rows; `#btn-tree-next` -> 'pull'.
### ui/meta-b.js + css/meta-b.css (maker K2) — pull + end
`SD.ui.pull.render(el)`: root `#pull`; coins `#coins`; label from gacha.oddsFor; odds table; `#pity` bar; `#btn-pull` (100 Coins); `#pull-reveal` card flip (rarity frame, name, role, stats, Signature move text, NEW or Star pip); `#grid` 4x3 `.slot12[data-pid]` (owned = card, unowned = silhouette + role icon + rarity frame colour only); header `#squad-count` "Squad 8/12"; tap owned slot -> detail (Stars, Level, XP bar, Trait, Sig); `#btn-pull-next` "Pick lineup" -> 'manager2' (enabled after the pull or when cannot afford).
`SD.ui.end.render(el)`: root `#end`; `#squad-count`; `#grid` (same 4x3); `#track` 4 steps `.step[data-id]` (m1/m2 tick / "=" / cross by result; 'more' highlighted; 'cup' locked with an original drawn cup SVG); next-goal line; pull 2 bar "Pull 2: n/100"; `#btn-copy-end` -> SD.tweak.copyReport(); `#btn-restart` (in-page confirm, never alert) -> SD.progress.wipe() + location reload.

### ui/tweak.js + css/tweak.css (maker L)
`SD.tweak.values()` -> T (TWEAK_DEFAULTS merged with saved overrides, key `localStorage['squadDuel.tweak.v1']`), `SD.tweak.isDev()`. `SD.tweak.open()`/`close()`: overlay `#tweak` (from `#gear`), one input per key `[data-key]` from TWEAK_META grouped, `#tw-reset`, `#tw-seed` (shows S.seed + "New game with this seed" input/button), `#btn-copy-report`, `#preset-name` + `#btn-save-preset` + `#preset-list` (load/delete per slot, `localStorage['squadDuel.presets.v1']`), built-in preset "Flatter starters", `#btn-copy-preset` (copies `SDP1:` + base64 JSON of changed keys), `#preset-code` + `#btn-load-code`, `#tw-close`. Values apply at next match start (note shown). Keep `#dev` badge `hidden` attr in sync on every change and at boot (`SD.tweak.syncDev()`). `SD.tweak.report()` -> text; `SD.tweak.copyReport()` (clipboard with textarea fallback, SD.app.toast("Report copied")).
Report text: header (Squad Duel, build id, seed, step, T diffs, lineup, formation, nodes, owned+stars, coins/sp, results); then per match per turn ONE line from S.reports + live SD.app.m.log: `M1 H1 T3 me Z1 | hand Mirelle,Pip,Tavo | card Pip dribble | odds 58% (Press 30) | dice 4 v 2 | won -> Z2 | fx Quick Feet` and defend turns `M1 H2 T2 opp Z1 | hand ... | card Kessan Press | club through | odds 64% | dice 5 v 3 | held`. Then a summary per match: attack picks per card, action share, result.

### index.html, sw.js, manifest.webmanifest, icons, css/base.css, js/app.js, fonts (integrator)
Shell: `#app` > `#top` (56px: `#scorebug`, `#dev` "DEV" badge, `#gear` 56x56 -> SD.tweak.open()), `#screen` (flex 1, min-height 0, overflow hidden), `#toast`. Start screen `#start` in #screen on boot: title SQUAD DUEL, subtitle "Proud Preston", `#build-id` "build sq-slice-1", `#btn-continue` (if save) / `#btn-new`. app.js owns `SD.app` (section 8 API), step router, `matchSetup()` (progress.statsOf per lineup pid + formation + nodes + T + rng.matchSeed(S.seed, matchNo) + club with T stats), `endMatch(m)` (summary -> progress.applyMatch -> S.reports push m.log -> step -> save -> go). Reload resumes the saved step (a match in progress restarts at turn 1 of that match: admin default). PWA: manifest (name "Squad Duel", display fullscreen, orientation portrait, theme #050a18, icons 192/512/maskable made by a python script), sw.js network-first for navigations, cache-first for assets, `VERSION='sq-slice-1'`, caches every shipped file. Add a link card to pages/index.html (copy an existing entry's markup).

## 9. Tweak keys (data.js owns TWEAK_DEFAULTS + TWEAK_META; tweak.js renders; engine/progress/gacha read setup.T / SD.app.T, falling back to defaults)
```
die:6, halfTurns:6, handSize:3, cap:3, passBonus:2, buildMax:2, formCounter:3, roarAt:3,
tellOn:true, coarseChip:false, flatterStarters:false, reducedMotion:false, autoNext:true,
grimsbyDef:4, grimsbyKeeper:7, grimsbyAtk:7, readingDef:5, readingKeeper:8, readingAtk:7,
trailShift:0.1, openingCoins:100, openingSP:3, pullCost:100, starterRare:70, starterEpic:25, starterLegend:5,
pityEpic:10, xpGoal:10, xpDuel:3, xpWin:20, respecCost:50, fxOff:{} (not in META; bots only)
```

## 10. Checkers
- `tests/squad-duel/load.js` (checker 1) requires the pages/squad-duel/js/ files into Node globalThis.SD. `tests/squad-duel/bot.js` (checker 1): BUILD-BRIEF bot gates on the SHIPPED engine (policies: skilled = port of bot.js match5 'dp' policy (getDP6 value tables) to choose, every move executed through SD.engine.playAttack/playDefend; random; lazy role-owner 'ro'; staller). Writes `docs/squad-duel/BOT-GATES.md`: gate, target, measured, seeds, PASS/MISS. Known expected-fail: formation spread v Grimsby (~1).
- `tests/squad-duel/e2e.js` (checker 2): Playwright (preinstalled `require('playwright')`), serves pages/ with a tiny node http server, viewport 344x882 (then 475x638 smoke), `?seed=12345&fast=1&reset=1`, plays the whole slice via the DOM ids above, asserts per screen no page scroll (`document.scrollingElement.scrollHeight<=innerHeight+1`), every visible button >= 56x56, seed replay gives the same report twice, report has per-turn lines, DEV badge after a tweak change, no console errors; screenshots to `docs/squad-duel/shots/`. Writes `docs/squad-duel/E2E.md`.

## 11. Done rules for makers
Self-test your file before returning (Node for js/, a scratch harness for ui/). Return: path(s) + 3 lines (works / admin defaults / NOT done). No git. Touch only your own files (scratch in your own scratchpad).
