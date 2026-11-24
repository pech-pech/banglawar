# CONTRACT btb-lessons-1 (lead, 2026-11-24). Single source for all makers. "admin default" = guess, keep going, never stop to ask.
Spec: /mnt/project-files/games-design/bad-trade-bazaar/BUILD-BRIEF-lessons-1.md + GAME-DESIGN.md "STEP A RESULT" rules 1-7 + "Red team" fixes.
Reference rule code (port, do not import): /mnt/project-files/games-design/bad-trade-bazaar/2026-11-24-lessons/sim/core-lots.mjs (lots) + core-lessons.mjs (carry, scars, shop).
PRINCIPLE: profit is the motive. No code path pays cash for a loss. Scar payouts <= cover <= 50% of net cash lost.
Folder: pages/bad-trade-bazaar/. ES modules, no deps, no Math.random in core. Look A Night bazaar stays (reuse style.css tokens/colors). Fold first: 344x882 and 475x638, touch targets >= 56px tall on buy/sell, >= 44px elsewhere, no horizontal scroll.

## FILE OWNERS (one owner per file; never edit another owner's file; code to this contract)
| Maker | Files |
|---|---|
| CORE | core.js |
| REPORT | report.js (new) |
| HOUSE | house.js, sw.js, manifest.webmanifest |
| RUN-UI | ui.js, index.html, style.css |
| DAY-UI | ui-day.js (new), day.css (new) |
| BOTS | tools/bots.mjs |
| E2E | tools/e2e.mjs |
RUN-UI may drop the old #screen-slot markup. CONTRACT.md / CONTRACT-tune-1.md stay as history.

## 1. core.js API (exact names)
```
export const BUILD = 'btb-lessons-1';
export const SLOTS = ['Calm', 'Middle', 'Wild'];
export const TIERS = ['Dune Lane', 'Copper Row', 'Saffron Court', 'Pearl Gate']; // stall sign per tier, admin default names
export const GOODS = [ // id, name, kind, tier (1-4), slot (0 Calm,1 Middle,2 Wild), base unit price
 {id:0,name:'Dune Millet',kind:'food',tier:1,slot:0,base:10},{id:1,name:'Lantern Oil',kind:'fuel',tier:1,slot:1,base:25},{id:2,name:'Ember Pepper',kind:'spice',tier:1,slot:2,base:60},
 {id:3,name:'Hill Wool',kind:'cloth',tier:2,slot:0,base:30},{id:4,name:'Tinker Copper',kind:'metal',tier:2,slot:1,base:75},{id:5,name:'Peacock Dye',kind:'dye',tier:2,slot:2,base:180},
 {id:6,name:'Kiln Tiles',kind:'craft',tier:3,slot:0,base:90},{id:7,name:'Brass Lanterns',kind:'metal craft',tier:3,slot:1,base:220},{id:8,name:'Sun Saffron',kind:'spice',tier:3,slot:2,base:540},
 {id:9,name:'Moon Silver',kind:'metal',tier:4,slot:0,base:250},{id:10,name:'Amber Resin',kind:'incense',tier:4,slot:1,base:650},{id:11,name:'Sea Pearls',kind:'gem',tier:4,slot:2,base:1600}];
export const SCARS = [ // lesson scars, type = slot*2 + (big?1:0)
 {type:0,slot:0,big:false,name:'Calm Nick'},{type:1,slot:0,big:true,name:'Calm Shield'},{type:2,slot:1,big:false,name:'Middle Nick'},
 {type:3,slot:1,big:true,name:'Middle Shield'},{type:4,slot:2,big:false,name:'Wild Nick'},{type:5,slot:2,big:true,name:'Wild Shield'}];
export const PERKS = [ // 9 perks (Eye dropped). scope 'global' or slot index 0/1/2
 {key:'seed',name:'Bigger Purse-Belt',scope:'global'},{key:'fee',name:'Friendly Tax-Man',scope:'global'},{key:'scales',name:'Lucky Scales',scope:'global'},
 {key:'streak',name:'Hot Streak',scope:'global'},{key:'clean',name:'Clean Slate',scope:'global'},{key:'tycoon',name:'Patient Merchant',scope:'global'},
 {key:'spec0',name:'Calm Specialist',scope:0},{key:'spec1',name:'Middle Specialist',scope:1},{key:'wild',name:'Wild Specialist',scope:2}];
export const DEFAULTS = {
 runSec:180, tickMs:1000, buyLockMs:300, longPressMs:450, startCash:100, lots:3, maxPerGood:3,
 slotVol:[0.010,0.018,0.030], tierVol:[1,1.15,1.30,1.45], volScale:1, K:0.08, M:0.8, regimeMin:10, regimeMax:25, pUp:0.35, pDown:0.35,
 saleCut:0.015, lossLine:0.04, holdSec:15, endScar:true, dumpSec:3,
 lessonRate:0.5, stopLine:[0.04,0.06,0.08], lessonSlots:2, lessonsOn:true,
 perkSlots:3, shopOn:true, priceScale:0.7, streakMax:4,
 perkVal:{seed:8,fee:0.5,scales:0.25,streak:0.15,clean:0.35,tycoon:0.6,spec0:0.8,spec1:0.8,wild:0.8},
 price:{seed:20,fee:20,scales:35,streak:40,clean:45,tycoon:50,spec0:25,spec1:30,wild:40}, // x priceScale 0.7 => 14..35 (M card 5)
 tierUnlock:[0,200,500,1200], bustCash:5,
 run1Seed:'btb-run1-s1', sameMarkets:true, protoMinTrades:4, protoTarget:1.30
};
export function mkConfig(partial)            // deep merge onto DEFAULTS (objects merged per key, arrays copied); never mutates input
export function hash(str); export function mulberry32(a)   // copy unchanged from current core.js
export function perkPrice(key, c)            // round2(c.price[key]*c.priceScale)
export function perkText(key, c)             // kid words: 'Every win pays +25%' / 'Start each day +$8' / 'Wins on the Calm good pay +80%'
export function scarText(type, c)            // 'Losing Calm sale: fee waived' / 'Losing Calm sale past 4%: rest paid back'
export function newProfile(salt)             // {v:2,salt,cash:null,day:0,stall:1,maxTier:1,picks:[0,1,2],cover:[0,0,0,0,0,0],owned:[0,0,0,0,0,0],lessons:[],perksOwned:[],perks:[],days:[],ledger:{lossCash:0,coverGranted:0,paid:0}}
export function dayCash(profile, c)          // profile.cash ?? c.startCash
export function unlockedGoods(profile, c)    // GOODS with tier <= profile.maxTier
export function setPick(profile, slot, goodId, c)  // bool; good.slot===slot && unlocked
export function togglePerk(profile, key, c)  // bool; slot/unslot an OWNED perk, max c.perkSlots
export function toggleLesson(profile, type, c)// bool; slot/unslot an OWNED scar (owned[type]===1), max c.lessonSlots
export function canBuyPerk(profile, key, c)  // shopOn && !owned && dayCash - price >= c.bustCash (admin default: shopping can never bust you)
export function buyPerk(profile, key, c)     // bool; profile.cash = dayCash - price; perksOwned.push; auto-slot if a power slot is free
export function daySeed(profile, c)          // c.sameMarkets || profile.day===0 ? c.run1Seed : `btb-${profile.salt}-d${profile.day+1}`
export function newDay(profile, c)           // -> State (below). startCash = dayCash + (seed perk slotted ? perkVal.seed : 0)
export function lotsOf(state, i); export function freeLots(state)  // freeLots = c.lots - state.lots.length
export function canBuy(state, i)             // !over && t<runSec && freeLots>0 && lotsOf(i).length<maxPerGood && cash/freeLots>1
export function buyPreview(state, i)         // lot cost = cash/freeLots (0 if !canBuy)
export function buy(state, i)                // -> lot | null. lot={id,good:i,qty,buyPrice,cost,t}. qty=cost/price. Pushes event {k:'buy',i,cost}
export function sellPreview(state, i, which='best') // -> {pnl, loss, refund, scarType|null, lotId} | null ; no mutation
export function sell(state, i, which='best') // which 'best'|'worst' (tap / long-press). -> {loss,pnl,refund,scarType,lotId}|null
export function tick(state)                  // t++; at t>=runSec: bell, auto-sell every lot (best first), over=true, event {k:'bell'}
export function endDay(profile, state)       // -> Summary (below); mutates profile
export function newStall(profile, c)         // bust reset: cash=null(->startCash), stall++, maxTier=1, picks=[0,1,2], perksOwned=[], perks=[], cover all 0 (owned kept), lessons kept
```
State = {c, seed, day, t, cash, startCash, goods:[GOODS obj x3 from profile.picks], px:[3][runSec+1], lots:[], nextLotId, over, trades, losing, deliberate, has(key), lessons:[types], cover (SAME array ref as profile.cover, drains live), earned:[6], drops:[{type,net,t}], streak, lostToday, paid, lossCash, events:[]}
- Market: series per slot i exactly like core-lots.mjs `series()` with p0 = goods[i].base and vol = slotVol[i]*tierVol[goods[i].tier-1]*volScale, rng key `seed+':stock'+i` (same shape across tiers = fair test). Price floor Math.max(0.005*p0, ...) (admin default), round 2 decimals.
- Sell math: port doSell from core-lots.mjs with: (a) no 'eye'; (b) FEE-LESSON FIX: small-scar refund r = min(qty*p*saleCut, qty*(buyPrice-p), cashLoss-refund, cover[small]); (c) deliberate += 1 when a MANUAL losing sale happens with t - lot.t < c.dumpSec (admin default meaning of "deliberate"); (d) per-slot perks spec0/spec1/wild key on slot i; (e) events pushed: {k:'sell',i,pnl,loss}, {k:'paid',type,amount} per scar refund > 0, {k:'drop',type,net} on a scar drop.
- Gains only on cash profit > 0 after the cut (rule 7). Loss = sale price below buy price.
Summary = {day, stall, seed, goods:[names], startCash, endCash, profit (endCash-startCash, may be <0), rate (profit/startCash), trades, losing, deliberate, paid, drops:[{type,net}], grew:[{type,add}] (cover added to a type already owned before today), newScars:[types first owned today], unlocked:[tier numbers newly opened], bust (endCash < bustCash), perks:[slotted keys], lessons:[slotted types], coverAfter:[6]}
endDay: cover[type] += earned[type]; owned=1; ledger update; profile.cash = state.cash; profile.day++; tiers: for k=2..4 if cash >= tierUnlock[k-1] && maxTier<k -> maxTier=k; profile.days.push(summary). No floor, never adds cash (rule 6).

## 2. report.js (REPORT) imports core.js
```
export function protoCheck(profile, c) // -> {status:'PASS'|'MISS'|'VOID'|'WAIT', day1Rate, medRate, ratio, reason}
  // uses profile.days of the CURRENT stall only. WAIT if < 5 days. day1 = first day of stall. med = median rate of days 3,4,5.
  // VOID if !c.sameMarkets, day1.trades < c.protoMinTrades, day1.deliberate > 0, or day1.rate <= 0 (reason says which). PASS if med/day1 >= c.protoTarget.
export function report(profile, c)     // multi-line text for Copy report:
  // `Bad Trade Bazaar ${BUILD} | stall ${stall} | day ${day} | cash ${cash}`; `markets: same (seed ${run1Seed})` or `markets: new each day`
  // `config: default` or `config: DEV ${JSON of keys differing from DEFAULTS}`
  // per day: dayLine(...)
  // `PROTO ${status} day1 ${%} med3-5 ${%} ratio ${%} target 130% ${reason}` and `VOID rule: day 1 needs >= 4 trades, 0 deliberate losses, profit > 0, same markets`
  // `cover: ${6 numbers}  ledger lost ${} granted ${} paid ${}` and `INVARIANT ok|BROKEN (paid <= granted <= 50% lost)`
export function dayLine(summary, c)    // `D${n} ${goods.join('/')} start ${..} end ${..} profit ${+x.xx} (${rate%}) trades ${} losing ${} deliberate ${} paid ${} scars ${name:+cover..} perks ${keys} lessons ${names}`
```

## 3. house.js (HOUSE): storage + Tweak menu + SW register
- Storage keys bump: 'btb-profile-v2', 'btb-config-v2', 'btb-presets-v2'; preset code prefix 'BTB2:'. Every read/write in try/catch; bad JSON -> null. Keep export names: loadProfile, saveProfile, loadConfig(DEFAULTS), saveConfig, diffConfig, isDev, presetCode, parsePresetCode, listPresets, savePreset, loadPreset, deletePreset, copyText, registerSW, mountSettings.
- loadConfig/diffConfig/isDev handle nested objects (perkVal, price) and arrays (slotVol, tierVol, stopLine, tierUnlock) by deep compare; loadConfig deep-merges saved over DEFAULTS.
- mountSettings(rootEl, {DEFAULTS, getConfig, setConfig, getReport, onResetProgress, onClose}): EVERY number in DEFAULTS editable (arrays: one input per element labelled e.g. 'stopLine Calm', 'tierUnlock tier 2'; objects: one per key e.g. 'price scales'); booleans as toggles; strings (run1Seed) as text. Group headers: Day & market, Lots & sale, Lessons, Shop & perks, Goods ladder, Test. Changed rows highlighted; per-row reset. Keep Copy report + Save preset side by side, preset list (load/delete), Copy preset code, paste preset code + Apply, Reset all, Reset progress (calls onResetProgress, two-tap confirm, no browser dialog). Note 'Changes apply from the next day'.
- sw.js: VERSION = 'btb-lessons-1'; CORE list adds './ui-day.js', './day.css', './report.js'. Network-first stays.

## 4. index.html + ui.js + style.css (RUN-UI)
index.html: screens `<main id="screen-X" class="screen">` for X in start, morning, run, end, shop. morning/end/shop mains are EMPTY (DAY-UI fills them). Load `day.css` after style.css. `#build-id` = BUILD (set from JS too). `#dev-badge` on HUD whenever house.isDev(config). `#settings` dialog as now. Start screen: title, one line pitch 'Trade bazaar goods for one day. Profit buys power. Losses teach lessons.', `#btn-play`, `#btn-settings-start`, `#build-id`.
ui.js owns: boot, config/profile load-save, router `go(name)` (body.dataset.screen=name, exactly one .screen.active), game loop (tickMs from config, `?tick=N` override kept), start screen (`#btn-play` -> day.showMorning(); go('morning'); label 'Continue: day N' when profile.day>0), run screen, settings mount, toasts, `window.__btb`.
Run screen ids: `#hud-day` ('Day N'), `#hud-timer`, `#hud-cash`, `#hud-lots` ('Lots 2/3 free'), `#btn-settings`, `#build-strip` with `#strip-power-0..2` and `#strip-lesson-0..1` (perk / scar short names; lesson shows 'covers $X.XX' live), rows `#row-0..2` each: good name + kind, live price, spark canvas `#spark-0..2`, held lots `#lots-0..2` ('2 lots +$1.20'), `#buy-0..2` ('BUY $33.33'), `#sell-0..2` (tap = best lot, long-press >= longPressMs = worst lot; face shows preview pnl of best lot; chip '+Calm Nick' when the sale would drop a scar, 'lesson pays $x' when a slotted lesson would refund). `#toast` role=status: 'Lesson paid you $X.XX', 'New lesson: Calm Nick', 'Closing bell'.
ctx.startDay() (from morning): state = core.newDay(profile, config); go('run'). On bell (state.over): core.endDay, save profile, `day.showEnd(summary)`, go('end'). ctx.newStall(): core.newStall + save + day.showMorning() + go('morning').
ui.js does `import * as day from './ui-day.js'` and `day.initDay(ctx)` once (ctx in section 5).
window.__btb = { getState:()=>state, getProfile:()=>profile, getConfig:()=>config, setConfig(partial) (merge+save+rerender), tick(n) (advance n ticks now, runs bell), go(name), setCash(n) (profile.cash=n, save, re-render current day screen), report:()=>report(profile,config), BUILD }.
End screens ignore taps for 600 ms after showing (L-PV-9). Safe-area insets kept.

## 5. ui-day.js + day.css (DAY-UI)
```
export function initDay(ctx)   // ctx = { core, report /* report.js module */, house, getProfile(), saveProfile(), getConfig(), go(name), startDay(), newStall(), toast(msg) }
export function showMorning()  // render #screen-morning (caller then go('morning'))
export function showEnd(summary)
export function showShop()
```
- #screen-morning ("Open the stall"): `Day N` + stall sign TIERS[maxTier-1] + `#morning-cash`; tier bar `#tier-bar` ('Next stall: 160 / 200', hidden at tier 4); 3 slot pickers: slot s shows buttons `.pick[data-slot=s][data-good=id]` for unlocked goods of that slot (name, kind, unit price, tier), aria-pressed on current pick, tap -> core.setPick; build: owned perks as `.perk-chip[data-key]` (aria-pressed = slotted, tap -> core.togglePerk), owned scars as `.lesson-chip[data-type]` (shows 'covers $X.XX', greyed 'lesson spent' at cover 0; tap -> core.toggleLesson); `#btn-shop-morning` (opens shop); `#btn-open-stall` -> ctx.startDay().
- #screen-end ("Closing bell"): top to bottom (Fold 475x638: 1+2 above the fold): (1) `#end-cash` end cash big = the score, (2) `#end-profit` day profit + rate ('+$12.40 (12.4%)', red if negative), (3) `#end-scars`: drops ('New lesson: Calm Nick covers $1.20'), grew ('Calm Nick grew +$0.40'), lesson paid total, (4) `#end-unlock` if a tier opened ('New goods at Copper Row'), (5) `#end-proto` short PROTO line from report.protoCheck, (6) `#btn-shop` (Shop), `#btn-next-day` (-> showMorning + go('morning')), `#btn-copy-report` (house.copyText(report.report(...)) then toast 'Report copied'). If summary.bust: 'Stall bust: under $5' and `#btn-new-stall` (ctx.newStall()) instead of next day. A small `#btn-new-stall-shop` sits at the bottom of the shop screen too (must-have 9 reset; second tap within 3 s confirms, no browser dialog).
- #screen-shop ("Profit shop"): `#shop-cash` (carried cash), 9 perks `.perk[data-key]` with name, scope tag (Global / Calm good / Middle good / Wild good), perkText, price, button `.perk-buy` (disabled with reason 'Need $X' or 'Owned'); after buy: toast 'Bought Lucky Scales', re-render. Owned perks get `.perk-slot` button Slot / Unslot (core.togglePerk), power slots row on top shows 3 slots. `#btn-shop-done` -> showMorning + go('morning').
- Copy: plain kid words, no jargon. Money: '$' + 2 decimals everywhere.
- day.css: only selectors under #screen-morning, #screen-end, #screen-shop; reuse CSS vars from style.css :root. Touch targets >= 44px; no horizontal overflow at 344 px.

## 6. tools/bots.mjs (BOTS): node tools/bots.mjs [markets=200] [days=6] [--quick]
Drive core.js only via its exported API. Market k career: c = mkConfig({run1Seed:'btb-m'+k}) (sameMarkets on). Bots (port from sim-lessons.mjs / attack.mjs in the sim folder): strong (trend rider: buy after +4% over 3 ticks, sell 3% off peak, never below buy unless bell), skilled, casual, human, farmer (dumps on purpose to farm scars), churn. Shop bot: strict rank order scales, spec of its most-traded slot, tycoon, fee, clean, streak, seed, rest; buy when cash - price >= 100. Lesson slots: two highest cover. Goods: highest unlocked tier (strong/skilled), lowest (casual/human).
Gates (one PASS/FAIL line each + numbers; exit 1 on any FAIL):
- G-A: strong/skilled/human, career with one deliberate instant loss on day 1 (buy then sell next tick at a loss) vs twin without, shop buys held equal (loss twin replays the clean twin's perk purchases on the same days): count of markets where loss twin day-6 cash >= clean twin must be 0. Invariant every career: total paid <= total cover granted <= 0.5 * total net cash lost (+1e-9).
- G-B: strong bot ratio (median days 3-5 rate / day1 rate), median over markets >= 1.30 with shop on; with shopOn:false print ratio, PASS if 0.85..1.15.
- G-C: farmer median day-6 cash < 100; per-sale assert: losing sale proceeds <= lot.cost and refund <= cover before the sale.
- G-D: each scar type slotted with cover 50: sale return vs sale price non-decreasing across buy price (scan 0.9..1.1 x buy, step 0.001, every slot) = fee-lesson fix check.
- G-E: G-A + invariant again with tierUnlock [0,110,130,150] and a bust path (force cash 4, newStall): 0 cases, invariant holds, newStall gives cash 100 and cover 0.
--selftest prints a 1-day strong trace. --quick = 40 markets.

## 7. tools/e2e.mjs (E2E): node tools/e2e.mjs
Playwright (require('playwright'), chromium.launch() no options), static server over pages/ like now, URL `/bad-trade-bazaar/?tick=3600000`. Sizes 344x882 and 475x638, fresh context each (clipboard perms granted). Steps: start -> #btn-play -> morning (3 slot groups of .pick, #btn-open-stall) -> run: #buy-0 x3 (stack 3 lots), #sell-0 tap, #sell-0 long-press (worst lot), #buy-1, __btb.tick(200) -> end: #end-cash + #end-profit inside viewport, #btn-copy-report -> __btb.setCash(200) -> #btn-shop -> buy cheapest enabled .perk-buy -> #btn-shop-done -> morning has a .perk-chip aria-pressed=true -> settings open, change one value -> #dev-badge visible; Save preset; close -> bust: __btb.setCash(3), open stall, __btb.tick(200) -> #btn-new-stall visible -> tap -> morning, #morning-cash shows $100.00. Every screen: one .screen.active, no horizontal overflow, no console errors/pageerrors, buy/sell >= 56px tall, text >= 12px. Screenshots /tmp/btb-e2e/<w>x<h>-<screen>.png. PASS/FAIL per step, exit 1 on fail.

## 8. Done-when (each maker): your files parse (node --check / import in node) and you self-test what you can, then reply in max 3 lines + file paths. Do NOT git commit. Do NOT edit files you don't own. FM wins conflicts: if contract and reality clash, pick the simplest reading, mark `// admin default`, keep going.
