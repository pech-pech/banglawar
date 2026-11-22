# CONTRACT: Trivia Duel prototype (CG-20261121-001, working name "Candle Duel")

Read ONLY this file plus your own slice. Plain JS (ES2020), no modules, no libraries, no network calls.
Every JS file is a classic script that starts `var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));`
and ends with `if (typeof module !== 'undefined') module.exports = <your export>;` so Node tests can `require` it.
Build: `src/inline.py` concatenates into one `pages/trivia-duel/index.html` in this ORDER:
`style.css` (in <style>), then scripts: `q-spells.js`, `q-creatures.js`, `q-places.js`, `engine.js`, `tweak.js`, `ui.js`.
Target screen: Galaxy Fold cover portrait 475x638 CSS px (must not break at 344x882). Touch targets >= 56 px tall.
Build id: `TD.BUILD = 'td-proto-1'` (defined in engine.js).

## 1. Question data (7 topics x 60, one file per topic)
See /mnt/project-files/games-design/trivia/2026-11-22-question-bank/CONTRACT.md. Topics: spells, creatures, places, people, objects, school, plot
(files q-spells.js, q-creatures.js, q-places.js, q-people.js, q-objects.js, q-school.js, q-plot.js; ids prefix sp/cr/pl/pe/ob/sc/pt).
`TD.GENERAL` ('general') is an engine-only pseudo topic, not in TD.TOPICS.
Each file: `TD.QUESTIONS = (TD.QUESTIONS || []).concat(LIST);` and exports LIST.
```
{ id: 'sp01',            // prefix sp / cr / pl / pe / ob / sc / pt + 2 digits
  topic: 'spells',       // one of the 7 topic ids
  tier: 'e',             // 'e' easy | 'm' medium | 'h' hard
  q: 'Question text?',   // <= 110 chars, own words, no quoted book text
  a: ['Right', 'Wrong1', 'Wrong2', 'Wrong3'], // a[0] is ALWAYS the right answer; each <= 28 chars; plausible wrongs, same type
  fact: 'Short teaching fact.', // <= 120 chars, own words
  book: 1,               // 1..7: earliest book where the answer is revealed (spoiler lock uses this)
  ch: 7,                 // chapter number, or null if not 100% sure. Never guess a chapter.
  filmKnown: true }      // true only if a film-only viewer could answer it
```
Per file: tiers 3 e, 4 m, 3 h. Books: at least 4 from book 1, at least 2 from books 2-3, at most 4 from books 4-7.
About 6 of 10 filmKnown true. Every fact must be certain from the books; if unsure, pick another question.
Hard = book-only detail a keen reader knows. No question may reveal a later-book twist unless its `book` tag is that book.

## 2. engine.js (pure logic, no DOM) exports `TD.engine`
```
TD.BUILD = 'td-proto-1'
TD.DEFAULTS = {            // every value live-tweakable; tweak.js reads/writes these keys
  timerSec: 15, basePts: 60, speedPts: 20,
  readCps: 18, readBaseSec: 1.0,   // reading time = readBaseSec + chars/readCps (chars = q + all 4 answers)
  graceOn: 1,                      // 1: speed bonus decays only after reading time
  q7Hard: 1,                       // 1: question 7 always hard tier (reviewer option; admin default on)
  wagerMissCost: 50,               // M's pick: missed x2 loses 50 (score floor 0)
  wagerMult: 2,
  rivalWagers: 0,                  // 0: rival plays Q7 at x1 (admin default); 1: rival x2 when behind
  rivalStep: 1,                    // 1..5 ladder step of the rival
  acc1: 0.72, acc2: 0.73, acc3: 0.74, acc4: 0.80, acc5: 0.85,   // rival base accuracy per step
  time1: 6.2, time2: 6.2, time3: 6.3, time4: 5.5, time5: 4.5,   // rival median answer seconds per step
  tierAccE: 0.10, tierAccH: -0.15, // added to rival accuracy by tier (m = 0)
  rivalTimeSpread: 1.5,            // +- uniform seconds around median
  rivalReadFloor: 1,               // 1: rival never answers before reading time
  pickedPerDuel: 4,                // Q1-6: this many from picked topic, rest from other topics
  xpWin: 30, xpLoss: 15, xpDraw: 20, xpPerLevel: 100 }
TD.RIVALS = [ // ladder, canon names (M's pick); look = book-text traits for the code-drawn portrait
  { step:1, name:'Neville Longbottom',   look:{hair:'#5a3b22', hairStyle:'short', face:'round', glasses:0, freckles:0, hat:0, robe:'#2b2b33'} },
  { step:2, name:'Ron Weasley',          look:{hair:'#c4511f', hairStyle:'short', face:'long',  glasses:0, freckles:1, hat:0, robe:'#2b2b33'} },
  { step:3, name:'Ginny Weasley',        look:{hair:'#c4511f', hairStyle:'long',  face:'oval',  glasses:0, freckles:1, hat:0, robe:'#2b2b33'} },
  { step:4, name:'Hermione Granger',     look:{hair:'#6b4426', hairStyle:'bushy', face:'oval',  glasses:0, freckles:0, hat:0, robe:'#2b2b33'} },
  { step:5, name:'Professor McGonagall', look:{hair:'#1c1c1c', hairStyle:'bun',   face:'long',  glasses:'square', freckles:0, hat:'pointed', robe:'#1f4a2e'} } ]
TD.TOPICS = [ {id:'spells', label:'Spells'}, {id:'creatures', label:'Creatures'}, {id:'places', label:'Places'} ]

engine.rng(seed:int) -> fn returning float [0,1)            // mulberry32
engine.readTime(q, cfg) -> seconds
engine.pool(questions, {mode:'movie'|'book', readUpTo:1..7}) -> filtered array (movie => filmKnown only; both => book <= readUpTo)
engine.newMemory() -> { seen:{}, missed:{} }               // ids -> true; JSON-safe
engine.drawQuestion(pool, topic, tier, memory, rnd, excludeIds:Set) -> question|null
   // candidates = pool of that topic, not in excludeIds, not seen. If no unseen left in topic: delete seen for that
   // topic's ids (hold-back refill) and pick missed ones first. Prefer requested tier; fall back to any tier of the
   // topic; then any other topic. Returns null only if pool minus excludeIds is empty.
engine.planDuel(pool, pickedTopic, memory, rnd, cfg) -> array of 6 questions (Q1-6)
   // tiers e,e,m,m,m,h shuffled; cfg.pickedPerDuel from pickedTopic, rest from other topics (alternating), order shuffled.
   // Draws mark nothing; memory changes only via markAnswered.
engine.drawQ7(pool, wagerTopic, memory, rnd, cfg, excludeIds) -> question (tier 'h' if cfg.q7Hard else 'm')
engine.shuffleAnswers(q, rnd) -> { order:[4 indexes into q.a], correctPos:int }
engine.scoreAnswer(correct, tSec, q, cfg, mult, isQ7) -> points
   // right: round((basePts + speed) * mult), speed = speedPts * clamp01(1 - (tSec - g)/(timerSec - g)),
   // g = graceOn ? min(readTime, timerSec-1) : 0. Wrong/timeout: (isQ7 && mult>1) ? -wagerMissCost : 0.
engine.rivalAnswer(q, cfg, rnd) -> { correct, tSec }
   // ALWAYS consumes exactly 2 rnd() calls (accuracy roll, time roll). acc = acc{step} + tier mod, clamp 0.05..0.98.
   // t = time{step} + (r*2-1)*spread; if rivalReadFloor t = max(t, readTime); if t >= timerSec => correct=false, t=timerSec.
engine.rivalWager(playerScore, rivalScore, cfg) -> 1|cfg.wagerMult   // x2 only if cfg.rivalWagers && rival behind
engine.applyScore(total, pts) -> max(0, total + pts)
engine.result(pScore, rScore) -> 'win'|'loss'|'draw'
engine.xpFor(result, cfg) -> int ; engine.levelOf(xp, cfg) -> 1 + floor(xp/xpPerLevel)
engine.markAnswered(memory, q, correct) // seen[id]=true; !correct => missed[id]=true, correct => delete missed[id]
engine.simDuel(opts) -> { pScore, rScore, result, pRight, log, ids:[7 ids] }
   // opts = { questions, cfg, seed, mode, readUpTo, pickedTopic, memory (mutated via markAnswered),
   //          player:{ acc, tSec, tSpread, wager:'x1'|'x2'|'smart' } }
   // 'smart' = x2 when player behind or tied, x1 when ahead. Wager topic = pickedTopic.
   // Player rolls use a SEPARATE rng(seed ^ 0x9e3779b9) so the rival stream never depends on the player.
TD.engine = engine
```
Determinism: per duel `rnd = engine.rng(seed)`. Order: planDuel (Q1-6) up front; then per question shuffleAnswers then
rivalAnswer; Q7: drawQ7, shuffleAnswers, rivalAnswer. The UI must call in exactly this order (same seed = same duel).

## 3. tweak.js exports `TD.tweak`
```
tweak.cfg              // live config, copy of TD.DEFAULTS merged with saved localStorage 'td.cfg'
tweak.isDev() -> bool  // any value differs from TD.DEFAULTS
tweak.set(key, value)  // updates cfg, saves 'td.cfg', refreshes #dev-badge visibility
tweak.open(container, onChange)  // renders Tweak panel: one row per DEFAULTS key (label, number input),
   // Reset all, preset row: name input + "Save preset" + "Copy report" side by side, saved presets list (Load/Delete),
   // "Copy preset code" (base64 JSON of diffs), paste box + "Apply code". Presets in localStorage 'td.presets'
   // as {name: diffs}. All storage in try/catch.
tweak.diffs() -> object of keys differing from DEFAULTS
tweak.lastState         // ui.js sets this to the last duel state; panel's Copy report uses it
tweak.report(state) -> string   // build id, seed, mode, readUpTo, picked + wager topic, rival step + name, cfg diffs,
   // per question line, mults, scores, result, navigator.userAgent, innerWidth x innerHeight. NEVER the player name.
tweak.copy(text) -> Promise     // navigator.clipboard, textarea + execCommand fallback
```
state = `{ seed, mode, readUpTo, pickedTopic, wagerTopic, pMult, rMult, rivalStep, log:[ {n, id, tier, topic, pRight, pT,
pPts, rRight, rT, rPts} ], pScore, rScore, result }`

## 4. ui.js exports `TD.ui`; calls `TD.ui.start()` on DOMContentLoaded (browser only)
Root `<div id="app">`. Screens `<section class="screen" id="scr-...">`, one has class `.active`:
- `scr-home`: title "Candle Duel", name input `#in-name` (max 14), 4 seal colour swatches (.swatch), Mode toggle
  `#btn-mode-movie` / `#btn-mode-book`, "Read up to book" stepper `#in-readto` (1..7, with - / + buttons),
  topic tiles `.btn-topic[data-topic]` showing level + XP, rival card (canvas portrait + name + "Rival n/5"),
  `#btn-play`, gear `#btn-settings`. Build id small at bottom. Warn line if pool for picked topic < 7.
- `scr-duel`: topbar: player seal + `#p-score`, "Q n/7" (`#q-num`), rival mini portrait + `#r-score`;
  `#timer-bar`; parchment card `#q-text`; 4 `.btn-ans[data-pos]`. Tap: lock, right = .ans-right, wrong = .ans-wrong
  and show right one, rival result chip + both time chips, points pops, `#q-fact` (shown when player wrong),
  `#btn-next` (auto-advance 2.5 s after a right answer). While open, a rival "answered" seal chip appears at rival
  tSec but does not show right/wrong until the player locks or time runs out.
- `scr-wager` (before Q7): 3 topic buttons, `#btn-x1` / `#btn-x2`, text "Miss on x2 loses N points", scores, `#btn-wager-go`.
- `scr-result`: "You got k of 7", banner (.banner-win/.banner-loss/.banner-draw), scores, XP gained, topic level,
  `#btn-rematch` (same rival, new seed), `#btn-home`, `#btn-report`. Seed shown.
- `scr-settings`: `#tweak-root` (tweak.open), seed field `#in-seed` (blank = random), `#btn-reset-progress`, `#btn-back`.
- `#dev-badge` fixed top-right, visible when TD.tweak.isDev().
`TD.ui.drawPortrait(canvas, look, sizePx)`: code-drawn on canvas from look traits: dark roundel with gold rim, robe
shoulders, face shape, hair by hairStyle (short/long/bushy/bun), freckle dots, square glasses, pointed hat. No images.
Seed: `in-seed` value if set, else `Date.now() % 1e9` per duel. Save: localStorage 'td.save' =
{ v:1, name, seal, mode, readUpTo, topicXp:{spells,creatures,places}, memory, rivalStep } (try/catch; ignore save with v > 1).
Rival step: +1 on win (max 5), never falls. Whole duel XP to picked topic. Rival step also sets tweak cfg.rivalStep.
Timer via requestAnimationFrame + performance.now(); timeout = wrong, pT = timerSec. End screens ignore taps 400 ms.
prefers-reduced-motion: no pulses/animations.

## 5. style.css
Candlelit parchment: body bg dark stone `#16130f` + soft radial warm glow; gold `#d9a441`; parchment `#efe2c2` cards,
ink `#2a1d10`; wax-seal round buttons deep red `#8e1b1b` with gold rim; answers = parchment strips.
Font `Georgia, 'Times New Roman', serif`, no web fonts. CSS vars on :root. Safe-area inset padding.
scr-duel fits 475x638 with no scroll; question 19 px, answers 17 px, min-height 56 px.
Classes: .screen .active .btn .btn-seal .btn-ans .ans-right .ans-wrong .ans-dim .card .topbar .chip .pop .row .col
.grow .small .muted .gold .banner-win .banner-loss .banner-draw .swatch .sel .topic-tile .tweak-row .tweak-panel #dev-badge.

## 6. Shell / PWA (shell.html, inline.py, sw.js, manifest.webmanifest, mkicons.py)
shell.html: `<!--STYLE-->` and `<!--SCRIPTS-->` markers, `<div id="app"></div>`, title "Candle Duel", viewport meta
with viewport-fit=cover. inline.py writes `pages/trivia-duel/index.html` with manifest link, theme-color, icons, SW
registration. sw.js network-first for navigations, VERSION 'td-proto-1'. Manifest "Candle Duel", portrait, fullscreen.
mkicons.py (Pillow) draws a wax seal with a candle -> icon-192.png, icon-512.png, icon-maskable-512.png.
No book or film words in title, manifest or meta.

## Admin defaults (not in M's picks; labelled and tweakable)
Q1-6 = 4 picked + 2 others; Q7 = wager topic. Rival Q7 at x1. Tie = draw. Timeout = wrong. Score floor 0.
All XP to picked topic. Q7 hard ON (reviewer option). Rival numbers = first guesses for the sim to tune.
