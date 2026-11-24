# CONTRACT-SEASON: Squad Duel build sq-season-1 (season, Cup Final, shootout, more pulls)

Repo root `/home/user/banglawar`, game `pages/squad-duel/`. Base = main after PR 117 (sq-ui-1). Branch `claude/project-thread-086x70`.
SPEC (read only, numbers win): `/mnt/project-files/games-design/squad-duel/2026-11-23-season/SEASON-SPEC.md` v1.1. Long tables in the same folder: `A-systems.md` (fixtures a, sort b, Roar c, shootout d, Level 4 e, tier 3 f, next season g), `B-economy.md` (players a, pulls b, bot rows g), `C-clubs.md` (club paste data a, scout lines c, ladder d; its DEF/keeper/attack numbers are OLD: use SEASON-SPEC section 3), `D-ux.md` + `looks/*.html|png` (U1-U11, table columns 3, shootout 4, grid 5, Copy report 6, Tweak 7). Brief: `BUILD-BRIEF.md`. UI base contract: `docs/squad-duel/sq-ui-1/CONTRACT-UI.md` (match DOM, LOCK-1 card).
`/mnt/project-files` is a network mount: read only, never write there.

## Hard rules (all makers)
- DUEL CORE KEPT: d6, deck hand, zones, actions, stance, cap +3, two halves of 6. Do NOT build P7 options (Wall +1 v Pass, no pick on club Shoot, card-rest).
- Look L2 Night broadcast locked: reuse `css/base.css` vars, fonts, existing components. No images, no paid art. Text >= 12 px, buttons >= 56 px tall, no page scroll at 344x882 and 475x638.
- Seeded RNG only (`SD.rng.make(seed)`, `SD.rng.matchSeed`, hash your own stream tags). Never `Math.random` in game logic.
- Edit ONLY files you own (table below). Need something else? Code to the API here, note it in your return. Missing dependency at runtime: guard with `if (SD.x && SD.x.fn)` and a safe fallback.
- Unclear: pick, label "admin default" in a code comment + your return, keep going. Nobody stops to ask.
- No git commands (lead/integrator commits). No npm installs.
- Self-test: `node --check` your files; logic files: quick node script in `/tmp/sd-<owner>/` using `tests/squad-duel/load.js` (require your new file after `load()` if it is not in ORDER yet). UI files: Playwright shot at 344x882 into `docs/squad-duel/sq-season-1/shots/<owner>-<state>.png` and LOOK at it (`require('playwright')`, `chromium.launch()`; serve `pages/` with `python3 -m http.server <port>`; pick a random port 8100-8999). Other makers edit in parallel: ignore failures clearly in their files.
- Return: changed paths + 3 lines (done, admin defaults, left).

## File owners (one owner per file)
| Owner | Files | Builds |
|---|---|---|
| data | js/data.js | 7 clubs, 8 players, POOL 13, tier-3 NODES, LOCKED_TREE tiers 4-5 only, SEASON consts, PAY, TWEAK_DEFAULTS + TWEAK_META new keys |
| progress | js/progress.js | state v2, Level 4, applyMatch for season/cup, reqAny, squadCount 20, captain |
| gacha | js/gacha.js | pool 13, pity picks unowned, Common skips maxed starters, Legend pity, pull log |
| season | js/season.js (NEW) | fixtures, table, other results, cup gate, season pay, next season, club stats per difficulty, report lines |
| shoot | js/shootout.js (NEW) | shootout rules S7 + rule R + effects list (A-systems d) |
| engine | js/engine.js, js/fx-nodes.js | homeSide, Roar mirror, neutral, kick-off by home, summary fields, new hooks, once-per-half, 3 tier-3 nodes, Captain |
| fxp | js/fx-players.js | 8 Signatures, Wing Switch fix (P6) |
| seasonui | ui/season.js, css/season.css (NEW) | U1 start, U2 hub, U3+U5 table/fixtures, U4 matchday results, U6 cup intro, U8 season end |
| shootui | ui/shootout.js, css/shootout.css (NEW) | U7 shootout |
| meta-a | ui/meta-a.js, css/meta-a.css | result screen flow to season, U11 tree tier 3 |
| meta-b | ui/meta-b.js, css/meta-b.css | U9 pull screen (20 grid, both pity bars, last 5), Copy report season lines (if it builds one) |
| manager | ui/manager.js, css/manager.css | lineup from up to 20, H/A + mode on manager, Captain pick, U10 player card detail, back to hub |
| shell | js/app.js, index.html, sw.js, ui/match.js, ui/match-acts.js, tests/squad-duel/load.js | step router, matchSetup/endMatch for season, cup -> shootout, save/resume, jump params, hide Attack-zone tell row, build id sq-season-1 |
| tweak | ui/tweak.js, css/tweak.css | groups Season, Clubs, Pulls; search; collapse; +/-; choice type; Copy report season lines |
| bot | tests/squad-duel/bot-season.js (NEW), docs/squad-duel/sq-season-1/BOT-SEASON.md | bot gates 1-7 |
| e2e | tests/squad-duel/e2e-season.js (NEW), docs/squad-duel/sq-season-1/E2E.md | one full season path + cup + shootout |

## Shared data shapes
### Clubs (data)
`SD.data.CLUBS[id]` for `preston` + 7 clubs `grimsby, reading, bolton, stockport, rotherham, wycombe, lincoln`. Club shape as shipped (`id, name, label, style, def, keeper{name,def}, atk, weights{pass,dribble,through}, offPress, defenders[3]{name,zone,press}, scout`) plus `ts` (team strength for the other-results sim, SEASON-SPEC 3 TS column; Preston ts per A-systems a), `kit` (`{a:'#hex', b:'#hex'}`, C-clubs a), `hint` (teaching ladder chip text, C-clubs d). Stats = HARD row of SEASON-SPEC section 3 (Grimsby 5/7/7; Rotherham 10/9/10 for now, bot may retune).
`SD.data.SEASON = { order: ['grimsby','reading','bolton','stockport','rotherham','wycombe','lincoln'], home: [true,true,false,true,false,true,false], clubs: [8 ids incl 'preston'], fixtures: 7 arrays of 4 {h, a} (A-systems a; Preston's row each MD matches order/home), cupLine: 'Cup Final: neutral ground, so no crowd for either side. One match, and someone must win.' }`.
`FIXTURES` stays = `SEASON.order` (old code).
### Players (data)
8 new `P(...)` rows from B-economy a (ids: dessa, yenna, ruvo, veska, brannik, tobbin, maelis, orlo), each `sig: {id:'SIG_DESSA'..'SIG_ORLO', name, text, perHalf?: true}`. `POOL` = 13 ids (5 Rare, 5 Epic, 3 Legend).
### Nodes (data)
Add `A3 Second Look`, `D3 Press Master`, `S3 Captain`: `tier:3, cost:3, req:'A1'|'D1'|'S1', reqAny:['A2','D2','S2'], fork:null`, `active` true for A3 only, text/chip from A-systems f. `LOCKED_TREE` keeps tiers 4 and 5 only.
### Tweak keys (data adds defaults + meta; tweak renders)
Season group: `difficulty` (choice 0 Easy / 1 Normal / 2 Hard, default 1), `seasonGrow` 1, `clubMax` 12, `otherBase` 0.30, `otherTS` 0.03, `otherHome` 0.04, `otherChances` 4, `otherMin` 0.05, `otherMax` 0.75, `normalDrop` 1, `easyDrop` 1, `cupWinPay` 300, `cupLossPay` 100, `place34Pay` 50, `cupMatchWin` 100, `cupMatchLoss` 50, `shootKicks` 3, `oppKickBonus` 2, `ruleR` true.
Clubs group: per club `c_<id>_def`, `c_<id>_keeper`, `c_<id>_atk` (range 1-12) REPLACING `grimsbyDef ... readingAtk` (remove old keys), plus `trailShift`.
Pulls group: move `pullCost, starterRare, starterEpic, starterLegend, pityEpic` there, add `pityLegend` 30, `commonCoins` 25, `pityUnowned` true.
Meta type `'choice'` = `{key,label,group,type:'choice',options:['Easy','Normal','Hard'], min:0, max:2, step:1}` (value = index).

### Save state v2 (progress.newState; `KEY` = 'squadDuel.v2')
```
S = { v:2, build, seed, step, coins, sp, owned{pid:{stars,xp,level,isNew}}, lineup, formation, nodes[], spent{}, pulls, pity{epic,legend},
      lastPull, pullLog[] (last 10 pull results, newest first), results[] ({season, md: 1..7 | 'cup', club, me, opp, res:'W'|'D'|'L', shoot:{me,opp}|null}),
      reports[], captain: pid|null, cupsWon: 0, seasonsPlayed: 0,
      season: SD.season.newSeason(S, 1) (lazy: if SD.season missing, null and shell fills it), live: null | {setup, inputs[]} }
```
`load()` returns null for v < 2 (admin default: slice saves do not carry over). `save` never downgrades (keep shipped guard).
### Season object (season owns; stored at S.season)
```
{ no: 1, md: 0 /* matchdays done */, seed, tieOrder: [8 ids], results: [ /* per md */ [ {h,a,hs,as} x4 ] ],
  cup: { opp: null, played: false, me: null, them: null, shoot: null, won: null }, done: false, paid: false }
```

## APIs
### SD.season (js/season.js)
- `newSeason(S, no)` -> season object (no defaults 1). Seed = hash of S.seed + no.
- `fixtureFor(S)` -> `{ md: S.season.md+1, clubId, home: bool, mode: 'home'|'away' }` for the next league match; `null` after MD7.
- `clubFor(S, clubId, T, md)` -> deep-cloned club with def/keeper.def/atk = `T['c_'+id+'_def'|'_keeper'|'_atk']` (fallback data) + (season.no-1)*T.seasonGrow, capped at T.clubMax, minus difficulty (T.difficulty: 2 Hard none; 1 Normal -normalDrop DEF and keeper on MD 2-7 and Cup; 0 Easy a further -easyDrop; never below 1).
- `table(S)` -> rows `[{id,name,label,P,W,D,L,GF,GA,GD,Pts,me:bool,pos}]` sorted S2 (Pts, GD, GF, Preston above level, season.tieOrder).
- `place(S)` -> `{pos, pts}`.
- `recordMatchday(S, me, opp, T)` -> stores Preston score + 3 simulated fixtures (S3 formula with T other* keys, stream (seed, season no, md, fixture no)), md++; returns `{md, mine:{h,a,hs,as}, others:[...], before:{id:pos}, after:{id:pos}, ptsGained}`.
- `cupGate(S)` -> `{reached, opp, pos}` (valid when md === 7).
- `recordCup(S, me, them, shoot /*{me,opp}|null*/)` -> sets cup fields, `won`, S.cupsWon++ if won, season.done = true. Returns cup.
- `seasonPay(S, T)` -> `{coins, why}` (E4). `endSeason(S, T)` applies it once (season.paid) and returns it.
- `nextSeason(S)` -> carries everything, S.seasonsPlayed++, S.season = newSeason(S, no+1).
- `reportLines(S, T)` -> string[] per D-ux 6.
### SD.shootout (js/shootout.js), pure logic, no DOM
- `start(m, T)` -> sh: `{ seed, first:'me'|'opp', score:{me:0,opp:0}, kicks:[], used:[], lastRole:null, done:false, winner:null, fxLeft:[ids] }` (keep a non-enumerable or separate ref to m; sh must JSON-serialise without m). Coin from a seeded stream of `m.seed`. Cards = m.setup.outfield + bench (6). Keeper = m.setup.keeper. Club kick = club DEF + T.oppKickBonus v my keeper DEF (S7).
- `whoKicks(sh)` -> 'me'|'opp'|null. `label(sh)` -> "Kick 2 of 3" or "Sudden death, pair 1" (one text, never both).
- `options(sh)` -> `[{pid,name,role,stat,kind:'SHO'|'PAS',p,ruleR:bool}]` for my unused cards (all 6 used -> reset). p = exact 36-pair odds (gap halved toward zero, tie to kicker unless rule R gives it to keeper, 6v1/1v6 hold).
- `kickMe(sh, pid)` / `kickOpp(sh)` -> kick event `{side, pid|null, stat, vs, dA, dB, scored, chips:[], fx:[]}`; advance; set done/winner (3 each, stop early when unreachable, then sudden-death pairs).
- `oddsOpp(sh)` -> p club scores its next kick. `reportLines(sh)` -> string[].
### Engine (js/engine.js)
- setup fields (from shell): `mode:'home'|'away'|'neutral'`, `homeSide:'me'|'opp'|'none'`, `cup:bool`, `season, md, captain:pid|null`. Missing = home/me (slice behaviour unchanged; old bot gates must read the same).
- Roar mirror per A-systems c: `m.roar = null|'me'|'opp'`, `m.homeSide`; keep `m.roarReady` true only when `m.roar==='me'` (UI reads it); `m.roarClub` true when club has it. Kick-off: home side holds ball half 1, other side half 2; neutral: Preston half 1.
- `summary(m)` adds `mode, cup, level (score equal), season, md`.
- New fx hooks (`run(m, name, ctx)`): `attackCards` (ctx {cards}, like defendCards: Orlo), `after` ctx gains writable `keepBall` (ball stays, no turnover: Hold Up), `keepTurn` (my Shoot saved: ball stays in my Attack zone and I keep the ball: Follow Up), `extraShoot` (Twin Run: engine then sets `m.flags.extraShoot`, next play this turn must be a hand card as Shoot and does not cost a turn), `saveZone` (after my keeper's save: start zone index: Quick Throw), `halfTime` (ctx {}) at startHalf2 (Captain). Export helpers: `onceUsed, markOnce, fire, onceHalfUsed(m,inst), markOnceHalf(m,inst)` (half keys reset at startHalf2).
- Second Look (A3) admin default: active `use(m,'A3')` on my attack turn; engine `secondLookPeek(m)` returns the club's real stance this turn without moving duel rng; UI may then re-pick once. Press Master (D3) passive per A-systems f. Captain (S3): halfTime hook clears the once keys of `setup.captain`'s Trait and Signature; cause "Captain: <move> ready again".
### fx-players
`SD.fxDefs.SIG_DESSA ... SIG_ORLO` exact rules B-economy a, via the hooks above (+ existing `roll`, `preRoll`, `legal`, `after`, `defendCards`). Brannik/Tobbin once per HALF. Wing Switch fix (P6): won Dribble with no second zone gives Build +1.
### Gacha
`pull(S,T)` as shipped plus: pool = data POOL; pity pull picks an UNOWNED player of that rarity if any (`T.pityUnowned`); Common = +1 Star pip on a random starter under maxStars, `T.commonCoins` only when all 7 starters maxed; Legend pity `T.pityLegend`; push to `S.pullLog` (keep 10). New `pity(S,T)` -> `{epic:{n,of}, legend:{n,of}}`; keep `pityText`.
### Progress
`statsOf` adds Level 4 (+1 to best of the other three stats, tie order SHO, PAS, PAC, DEF; Keeper +1 DEF), player stats cap 10. `applyMatch(S, summary, T)` keys by `(season, md)`; Opening day only season 1 MD1; pay E3 (cup: W `cupMatchWin` / L `cupMatchLoss`, using `summary.shoot` when level); XP as shipped (cup level = draw XP). `canBuy` honours `reqAny`. `squadCount` of 20. `setCaptain(S,pid)`.
### Shell (app)
Steps: `start`(no S) | `hub` | `table` | `manager` | `match` | `result` | `mdres` | `tree` | `pull` | `cupintro` | `shootout` | `end`. Router: hub, table, mdres, cupintro -> `SD.ui.hub|table|mdres|cupintro`; end -> `SD.ui.seasonEnd`; shootout -> `SD.ui.shootout`; manager, match, result, tree, pull -> shipped modules. `app.renderStart` delegates to `SD.ui.start.render(el)` when present.
- `app.matchSetup()` from `SD.season.fixtureFor` + `clubFor` (league) or cup (`mode:'neutral', homeSide:'none', cup:true`, md 8); seed `SD.rng.matchSeed(S.seed, S.season.no*16 + md)`; adds `captain: S.nodes has S3 ? S.captain : null`.
- `app.endMatch(m)`: cup and level -> keep `app.m`, go `shootout`. Else `app.finishMatch(m, null)`.
- `app.endShootout(sh)` -> `app.finishMatch(app.m, {me: sh.score.me, opp: sh.score.opp})`.
- `app.finishMatch(m, shoot)`: summary (+shoot), progress.applyMatch, season.recordMatchday or recordCup; `app.lastMd` = recordMatchday return; `app.lastShoot`; go `result`.
- `app.afterResult()` (Result Continue): league -> `mdres`; cup -> `end`.
- `app.toHub()`. Hub Play -> `app.play()`: league -> `manager`; MD7 done + top 2 + cup not played -> `cupintro`; else `end`. Manager Kick off -> `go('match')`. Cupintro Kick off -> `go('manager')` then match (admin default: lineup check before final) or straight `match`.
- `app.nextSeason()` -> season.endSeason + nextSeason, go hub.
- Save/resume (S9): `S.live = {setup (plain JSON), inputs:[...]}` recorded by ui/match.js on every api call; Continue on `match` replays inputs (engine deterministic). Autosave after every turn and spend.
- Debug jumps (e2e/QA): `?jump=hub|table|mdres|cupintro|shootout|end|pull|tree|card` with `?seed=`: builds a valid state (md 7 done, Preston 1st for cup; shootout = a level cup match). `SD.app.debug.simLeague(n)` auto-plays n league matches (simple policy) for tests.
- Build id `sq-season-1` on start screen and sw.js cache; network-first SW kept; new files in index.html + sw.js lists. Old step names from v1 never load (v2 key).
### UI ids (for e2e; keep exactly)
Start `#start #btn-continue #btn-new #build-id`. Hub `#hub #hub-play #hub-lineup #hub-tree #hub-pull #hub-table #hub-track #hub-opp`. Table `#table #tab-table #tab-fix #tbl-rows .tbl-row[data-id] #btn-hub`. Mdres `#mdres #btn-hub`. Cup intro `#cupintro #btn-cup-kick`. Shootout `#shootout .sh-card[data-pid] #sh-kick #sh-label #sh-score #btn-sh-done`. End `#season-end #btn-next-season`. Pull `#pull #btn-pull .grid-cell[data-pid] #pity-epic #pity-legend #btn-pull-back`. Tree `[data-node="A3|D3|S3"] #btn-tree-back`. Manager `#btn-kick` (keep existing kick-off id if different, note it), `#captain-pick`, `#card-detail` (U10). Result Continue button calls `SD.app.afterResult()`.
