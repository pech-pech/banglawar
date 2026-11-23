# CONTRACT-UI: Squad Duel UI fixes, build sq-ui-1

Rows = RANKED-LIST.md rows 1-46 (`/mnt/project-files/games-design/concepts/CG-20261123-002/ui-review/RANKED-LIST.md`). Build each row exactly as written. Unclear row: read `findings-*.md` in the same folder. Still unclear: pick, label "admin default" in your return note, keep going. Nobody stops to ask.

## Hard rules (all makers)
- UI only. FROZEN, never edit: `js/engine.js`, `js/data.js`, `js/odds.js`, `js/club-ai.js`, `js/fx-*.js`, `js/progress.js`, `js/gacha.js`, `js/rng.js`. Read them freely. No rule, odds, deck, reward or flow change.
- Copy report text stays byte-identical. `ev.cause` and `m.log` untouched. Rows 1-3 change screen text only.
- Look L2 "Night broadcast" locked: use the existing CSS vars and fonts in `css/base.css`, existing colours, no new art, no images.
- Text >= 12 px everywhere you touch. Tappable buttons >= 56x56 CSS px. No page scroll at 344x882, 475x638, 624x912, 704x783, 816x568.
- Edit ONLY files you own (table below). Need something in another file? Do without it, note it in your return.
- Tweak menu, Save preset, Copy report, DEV badge, build id on start screen stay.
- Self-test: `node --check` your files; run `node tests/squad-duel/e2e.js` (serves pages/, ~2 min) and confirm 0 FAIL in checks that touch your screen (other makers work in parallel, so ignore fails clearly on their screens/selectors); take Playwright shots of your screen at 344x882 (and 475x638) into `docs/squad-duel/sq-ui-1/shots/<owner>-<w>-<state>.png` and LOOK at them. Chromium preinstalled: `require('playwright')`, `chromium.launch()`. Read js/app.js for URL params (seed, fast) and tests/squad-duel/e2e.js for how to drive screens by DOM ids.
- Return: changed paths + 3 lines (what done, admin defaults, anything left).

## File owners (one owner per file)
| Owner | Files | Rows |
|---|---|---|
| m-result | ui/match-result.js, css/match-result.css | 1, 2, 3, 10 (fx strip under stamp), 13 |
| m-cards | ui/match-cards.js, css/match-cards.css | 4, 5 (card part), 10 (Winger note on card, FROM DECK tag), 15, 16, 21 |
| m-acts | ui/match-acts.js, css/match-acts.css | 5 (tile part), 7, 8, 9, 11, 12, 17 |
| m-frame | ui/match-frame.js, css/match-frame.css, css/match.css, ui/scene.js, css/scene.css | 6, 14, 18, 20, 22 |
| manager | ui/manager.js, css/manager.css | 23, 24, 25, 26, 27 (card/picker part), 28, 29, 30 |
| meta-a | ui/meta-a.js, css/meta-a.css | 27 (result part), 32, 33, 34, 36 (tree part), 37, 38 |
| meta-b | ui/meta-b.js, css/meta-b.css | 35, 36 (end part), 39, 40, 42, 43, 46 |
| shell | js/app.js, css/base.css, index.html | 19, 31, 41 |
| tweak | ui/tweak.js, css/tweak.css | 44, 45 |
| tests | tests/squad-duel/e2e.js | checks below |
| lead (frozen) | ui/match.js (core), ui/match-help.js, sw.js | none |

## Match screen code layout (scaffold done by lead, behaviour unchanged, e2e 130/130 pass)
Load order: match-help, match-cards, match-acts, match-result, match-frame, match (core).
- `SD.ui.mh` (match-help.js, frozen): `ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf, ready, oddsGrid`.
  - `oddsGrid(U)` -> `{ rows: { pid: { opts: {action|stance: p}, best: {k, p}, close: bool } }, top: {pid, k, p} | null }`. Exact odds for every card in view (attack: legal actions; defend: press/drop). close = top two within 5 points. Use it for rows 4, 5, 7.
- Each part registers `SD.ui.mp.<part> = { ...exports, click }`. Keep every existing export name (core calls them):
  - cards: `cardHTML(U,pid)`, `drawHand(U)` (also owns `#h1`, `#h2` text, `#deckcount`, `#disccount`)
  - acts: `drawTell(U)`, `chipHTML(U)`, `partsLine`, `drawActs(U)` (only called when no result), `drawAbil(U)` (`#abil`)
  - result: `resultTotals(U)`, `stampOf(ev)`, `drawBand(U)` (calls `SD.ui.mp.acts.chipHTML(U)` for the preview), `drawCause(U)` (renders into `#acts` when `U.ev`), `drawFoot(U)` (`#sum`, buttons; not `#abil`)
  - frame: `drawInfo(U)`, `drawOverlays(U)`
- `click(U, btn)`: core calls cards, acts, result, frame `click` in that order for every button tap inside `#match` BEFORE its own handling. Return `true` if you handled it. Use for new buttons only (deck view, overlays, ability flash).
- `U` = `{ m, el, q(id), sel, act, stance, ev, busy, over, newIds, prevHand, api }`. `U.api` = `{ draw, pickCard, pickAct, pickStance, useAbility, undo, confirm, next, startHalf2, finish }`. Private state on U only with your prefix (`U.cards_open`, `U.acts_flash`, ...).
- Core draw order each time: frame.drawInfo, acts.drawTell, result.drawBand, cards.drawHand, (result.drawCause | acts.drawActs), acts.drawAbil, result.drawFoot, frame.drawOverlays.
- DOM skeleton (core, unchanged): `#match > #info, #scene, #tell, #band, #h1(#h1t, .cnt #deckcount #disccount), #hand, #h2, #acts, #foot(#abil, #btn-back, #sum, #btn-confirm, #btn-next), #halftime(.ovp #ht-score #ht-sub #btn-half), #fulltime(.ovp #ft-score #ft-stamp #ft-sub #btn-ft)`. Write only inside containers you own. New overlay elements you append to `#match` yourself (create once, check by id).

## Shared DOM / data hooks (new)
- `#match[data-side]` = `me` (attack turn, or result of my attack) / `opp` (defend turn or its result). SET BY frame.drawInfo every draw; every part may style off it (row 6 red tint lives in css/match-frame.css only).
- `#match[data-keeper]` = `1` when on a defend turn the club may shoot, or the result is a club shot (`ev.side==='opp' && !ev.pid`). Set by frame.drawInfo. "Club may shoot": `SD.clubAI.weights(m.club, m.zone, m.score.opp < m.score.me, m.T).shoot > 0` (same call defendTell uses).
- `#mode-label` (frame, inside #info): empty hidden slot; fill from `m.setup.mode` (`home|away|neutral`) if present. Season build fills it later.
- result band: `#band-my-tot`, `#band-op-tot` (text = the total number only), `#band-stamp` (stamp text), `#fx-strip` (row 10, hidden when nothing fired).
- Totals rule (row 1). Attack (`ev.side==='me'`): `mod = ev.gap - (ev.myScore - ev.oppScore)`; my = `ev.myScore + mod + ev.dice.att`; opp = `ev.oppScore + ev.dice.def`. Defend (`ev.side==='opp'`): `mod = ev.gap - (ev.oppScore - ev.myScore)`; club = `ev.oppScore + mod + ev.dice.att`; my = `ev.myScore + ev.dice.def`. These equal the two `= N` numbers in `ev.cause`. Ties go to the defender unless the tie rule in engine `resolve` / `ev.tieBy` says otherwise (read it).
- fx facts on ev: `ev.rerolls[] {who, from, to, by}`, `ev.fxFired[]` ids, `ev.tieBy`, `ev.tags[]`, fx sentences = `ev.cause` text after the first `'. '`.
- cards: each `.card` gets `.odds` child (text e.g. "Pass 83%", `data-p` = 0..1 of the card's best) before any tap, in attack and defend; `.card.best` on the overall top pair; `.tg.bench` "BENCH" tag on bench cards (pid in `m.setup.bench` ids); `.role-job` text (row 5); deck button `#btn-deck` (in #h1) opens `#deck-sheet` (names A-Z, no order shown).
- acts: `.act .pc` always shows a % once any card is in view; `.close` dot class; `#zone-track` (row 11, Def > Mid > Att); `#st-press .vs`, `#st-drop .vs` lines (row 7); `#keeper-note` (row 8).
- frame: `#turn-pips` (12 pips), `#turn-label` text like "2ND HALF, TURN 1 OF 6", `#ribbon` ("DEFEND: Grimsby have the ball" on defend).

## Fixed heights (row 14) - frame owns, others fit inside
At every viewport: `#info` 64px, `#tell` 52px, `#band` 104px, all `overflow:hidden`. `#scene` takes the remaining flex height and must not change size between pick, result and next turn. Content in #band (chip preview OR die row + stamp + `#fx-strip`) must fit 104px at 344 width; #tell content fits 52px (2 lines max). If frame measures that these break no-scroll at 344x882 or 475x638, frame may change the numbers and states final values in its return note; integrator reconciles.

## Hand card layout (rows 4, 5, 15, 16) - LOCK-1
m-cards renders the card first, before anything else, and saves `docs/squad-duel/sq-ui-1/card-mock/cards-344.png`, `cards-475.png` (attack turn, nothing tapped) and `cards-344-defend.png`. Same L2 look: card frame, colours, fonts unchanged; only new text lines/tags. If it does not fit, collapse in this order: hide rarity word (gem stays) -> shorten role job to 2 words -> stats row keeps all 4. Lead checks the shots and locks.

## Tests (owner: tests) - extend tests/squad-duel/e2e.js, keep all existing checks
1. Band total equals cause total on every turn of a seeded run, both sides, incl. a Press and a Drop (parse the two `= (\d+)` numbers from the last `SD.app.m.log` ev.cause; compare `#band-my-tot`/`#band-op-tot`, mapping by side).
2. Every `.card` shows a non-empty `.odds` before any tap (attack and defend).
3. No page scroll; buttons >= 56x56; no visible text under 12 px (computed font-size on visible text in #screen and #top).
4. `#scene` getBoundingClientRect identical between pick state and result state (+-1px).
5. Report text identical across seed replay (exists; keep).
Run at 344x882 and 475x638. Missing selectors = FAIL with a clear message (makers build in parallel; integrator runs the final suite).
