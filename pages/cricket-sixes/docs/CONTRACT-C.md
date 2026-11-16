# CONTRACT-C: Home replan H2 (thread T7, task C0.1)
Author: tech director, 2026-11-16. Read against `origin/main` 8e7db1f, `pages/cricket-sixes/`. Plan: `../2026-11-16-home-replan/PLAN-H2.md` (FINAL, M PICKS 1A/2A/3A, strip V3). Frozen when S0 posts it; changes go through S0's lead (TASK-BOARD 7d.2). Where this page and PLAN-H2 differ, THIS page wins (corrections are marked FIX).

## 1. VM fields (hub stage = `clubVM` + `decorate()` in app.js)
| Field | Type | New? | Writer (task) | Note |
|---|---|---|---|---|
| `six[]` `{id:string, name:string, grade:string ('?' hidden), pips:number, bat:number, bowl:number}` | array(6) | bat/bowl NEW | T7 C1.2, `clubVM` six map | `bat: shownBat(p), bowl: shownBowl(p)` (shown 20..200, imported at selectors L4). View prints only `shownCell(p.bat).html`, never raw |
| `plan` `{word:'Saved'|'Suggested'|'Fix it', ok:boolean, reason:string}` | object | no | - | |
| `cta` `{label, act, disabled?:boolean, reason?:string, sub?:string}` | object | no | - | START markup byte-equal |
| `econ` `{coins, stadium:0..5, fac:{[id]:number}, fans}` | object | no | decorate | `econ.fac` feeds `drawBanner` |
| `fansGate` `{text, pct:0..100, ready, hidden, next:number|null, fans:number, gate:number, left:number}` | object | fans/gate/left NEW | T7 C1.2, `fansGateVM` | `left = max(0, gate - fans)`; hidden branch returns `fans:0, gate:0, left:0`. Existing `text` strings unchanged (fans-gate + tfc tests) |
| `workshop {visible, spokes}`, `activities {picked, available, trial?}|null`, `trial`, `freePick {pending}|null` | | no | decorate | null with flags off |
| `notice`, `unlock {name, left}|null`, `promo {title, done, total, rows[]}`, `gap {ours, theirs}`, `next`, `run`, `tp`, `club.weeksLeft` | | no | - | STRIP reads promo/gap/club |
| `matchPlan` `{clinic:0|1|2|3}` | object | NEW | T7 C1.2, decorate | `vm.matchPlan = { clinic: Math.max(0, Math.min(3, clinicReadyCount(s) | 0)) }` with `import { clinicReadyCount } from '../core/clinic.js'` (S0 Z6 stub returns 0). FIX: PLAN-H2 3.6 used `sel.clinicReadyCount`; the helper lives in `js/core/clinic.js`, not selectors |
| `weekVM(s)` -> `{notice, freePick, trial, activities, unlock}` | selector | NEW | T7 C1.2 | FIX: PLAN-H2 says the week sheet reads the decorated hub vm, but `SHEETS` with `vm:null` passes the data-arg (app.js L124). Register `week: { file: 'week-sheet', fn: 'openWeek', vm: ['weekVM', () => []] }` |
All new fields optional in views: `m0-344x780.mjs:326` renders hub-view with a stub vm lacking them (non-full branch, must not throw).

## 2. Functions and signatures
| Function | File / fence | Signature | Owner |
|---|---|---|---|
| `dockHtml` | hub-view.js, outside fences | `(vm) => string` `.hb-dock` 2x3: table, stadium, extras, book, workshop, fans | C1.1 |
| `bannerHtml` | hub-view.js BANNER | `(vm) => string` `div.hb-banner` > `canvas.hb-bcv` + `button.hb-gb` + `div.hb-band` [`.fg.hb-fg`, `button.hb-week`] | C1.1 stub, C2.4 body |
| `stripHtml` | hub-view.js STRIP | `(vm) => string`, first child of `.hb-colB`, height <= 76 px | C1.1 stub, C2.1 |
| `sixHtml` | hub-view.js SIX | `(vm) => string` (FIX: was `(six, pair)`; pair head moves to STRIP) | C1.1 stub, C2.2 |
| `footHtml` | hub-view.js FOOT | `(vm, cta) => string`, root `div.m0-ctabar.cta.hb-foot` (exactly one) | C1.1 stub, C2.3 |
| `drawBanner` | ground-canvas.js | `(host:Element, opts:{stadium:number, levels:object, gate:fansGateVM, reducedMotion?:boolean}) => {redraw(), destroy(), rects} | null`; null without window/SPR; never throws; stores `host.__banner`; creates no `.hb-fac` | C1.3 |
| `weekItems` | week-sheet.js | `(v:{notice,freePick,trial,activities,unlock}) => Array<{key:'free'|'trial'|'activity'|'unlock'|'notice', word:string, act?:string}>` in that order | C1.4 |
| `openWeek` | week-sheet.js | `(vm, dispatch, open, arg, refresh)` (SHEETS contract) | C1.4 |
| `noticeGone` state + `DismissNotice` | week-sheet.js | moves out of hub-view (L17, L128) | C1.4 |
`drawGround`, `planField`, `layoutField` stay exported, marked `@deprecated (H2)` (hub-l2.test pure tests L173-205). Chip rule: hidden when `weekItems` is empty; word = first item whose key is not `unlock`, else "This week"; count suffix " · N" when N > 1.

## 3. Fences (exact syntax, JS and CSS alike, one start and one end line each, nothing on the same line)
```
/* FENCE:STRIP start */
...
/* FENCE:STRIP end */
```
Names: hub-view.js has STRIP, SIX, FOOT, BANNER. hub.css has STRIP, SIX, FOOT, BANNER, LAYOUT; LAYOUT is the last block in the file and holds every `@media` rule plus `.hb-mid/.hb-colA/.hb-colB/.hb-banner` box sizes. A fence owner writes only between its two lines; imports, `render()` order, wrappers and the destroy guard belong to C1.1. (Same style as S0's `/* SLOT:<NAME> start */`, other prefix so greps never mix.)

## 4. px budget at 344x882 (mock-derived; C0.3 `docs/HOME-HEIGHTS.txt` replaces it with live px)
| Block | px | Rule |
|---|---|---|
| Header `.hb-head` | 64 | gear injected by report/hooks.js into the FIRST `.strip`; the STRIP plate must not use class `strip` or `c-strip` |
| Chapter `.hb-chap` | 34 | live min-height (mock said 24) |
| Board `.hb-board` | 64 | fans line leaves it |
| Banner `.hb-banner` | 186-196 (flex 176-236) | only flex block; band 56 inside |
| Dock `.hb-dock` | 128 | 2 x 56 + gap 6 + pad |
| STRIP | 74 (cap 76) | |
| Squad `.hb-six` | 182 | 3 x 56 + 2 x 6 + pad |
| Footer `.hb-foot` | 140 | Match Plan 56 + START 64 + pad 20 |
| Sum without banner | 686 | leaves 196 for banner at 0 gaps |
Disabled START: `.m0-warn` adds 18-36 px, which can push the banner to 160 (< 176). Rule (C2.3, below 600 px wide): the reason goes into the Match Plan sub-line (red) and `.m0-warn` is not rendered; the text "Fix the overs first." stays in footer markup (hub-l2.test L154-155). 704x783: two columns, no scroll. 475x638: only `.hb-colB` scrolls, `tabindex="0"` + focus ring.

## 5. Badge aria (settled)
Pick: **"N Clinic spins left"** (HANDOFF line 10, coach SPEC S16 line 199, test T16.4). Not PLAN-H2 3.1 "N Clinic spins ready". Why: SPEC T16.4 asserts it, T8 writes C3.4 against SPEC, and SPEC is authoritative over plans (TASK-BOARD header). Markup: badge `<span class="hb-badge" aria-hidden="true">N</span>` (Book pattern), `hidden` attr at 0; the button `aria-label` is `"Match plan: 6 picked, overs suggested, 2 Clinic spins left"`, the Clinic clause only when N > 0. Singular "1 Clinic spin left". Badge colour: red fill, `color: var(--cream)` (SPEC T16.7; Book badge uses `--white`), 2 px dark border, 14 px, right end of the button.
**S16 rename for T5/T6:** any coach/Clinic text, report line or test that names the home button says "Match Plan", never "Six and Overs" / "Six+Overs". SPEC S16 body already says "Match Plan"; `02-REVIEW.md` L24 and HANDOFF-SCREENS L14 still carry the old word (docs only, no code).

## 6. Class names and strings tests rely on (keep exactly)
| Hook | Test |
|---|---|
| source literal `levels: (vm.econ && vm.econ.fac)` in hub-view.js (now in the `drawBanner` call) | r9-fixclub.test.mjs:107 |
| no `this round|next round|a round|each round` in hub-view.js | r9-fixclub.test.mjs:78 |
| source `badge: badgeCount()` and `badgeAria(plate.badge)` in hub-view.js (dockHtml keeps the `plate` object) | book-badge.test.mjs:31-34 |
| app.js source `addFinds(found.length)`, `addFinds(1)`, `name === 'book') {...clearBadge()` | book-badge.test.mjs:35-39 |
| no `esc(p.bat)`, `esc(p.bowl)`, `esc(p.ability)` lines in hub-view.js | letters-ui.test.mjs:81-89 |
| `hb-tp"` with no aria-label; `ss-sr"> training points` | a11y-book.test.mjs:52 |
| `class="fg hb-fg"`, fans text strings, `.fg-bar i` | fans-gate.test.mjs:39-41, e2e tfc.mjs:340-351 |
| `button.hb-plate[data-plate="book"] span.hb-badge` | e2e book-p6.mjs:134, 320-325 |
| `.hb-edit` (first one opens the team sheet); `.c-btn--cta:not([disabled])`; `.m0-ctabar button:not(.hb-edit)` | e2e m0-344x780.mjs:224, p11-flow.mjs:87 |
| `.hb-p[data-act="sheet:team"]` + `data-arg='{"tab":"six"}'` | e2e p11-flow.mjs:265 |
| START classes `c-btn c-btn--primary c-btn--cta c-btn--block hb-cta`; one `m0-ctabar`; non-full branch has no `hb-ground|hb-board|hb-slot|hb-bubble|hb-more`; no inline hex; no inline font-size < 14 | hub-l2.test.mjs:147-170 (rewritten in C3.1, these asserts kept) |
| `.c-strip.strip.hb-head` + `helpBtn()` (`.help-btn`) | report/hooks.js:62-70 gear anchor |
New hooks for C3.1/C3.2: `.hb-mid .hb-colA .hb-colB .hb-banner .hb-gb .hb-band .hb-week .hb-dock .hb-plan canvas.hb-bcv`, dock `data-plate` = table|stadium|extras|book|workshop|fans, Match Plan `data-arg` `{"tab":"six"}` or `{"tab":"overs"}` when `!plan.ok`, `.hb-p` rows with 2 `.lt-cell`.
Retired (hub-l2.test + e2e hub-l2.mjs updated/removed in C3.x): `.hb-ground .hb-row .hb-slot .hb-bld .hb-field .hb-bubble .hb-fac .hb-more .hb-rival .hb-promo .cl-cards canvas.hb-gcv canvas.hb-head`.

## 7. File owners
| File | T7 (thread C) writes | Others |
|---|---|---|
| `js/ui/hub-view.js`, `css/hub.css`, `css/hub-scorebook.css`, `js/ui/ground-canvas.js`, new `js/ui/week-sheet.js`, `test/hub-*.test.mjs`, `test/fans-gate.test.mjs`, `test/e2e/hub-h2.mjs` | all | none |
| `css/letters.css` | `.hb-p .nm` + dead `.hb-p` rules only (C2.2) | none |
| `js/store/selectors.js` | `clubVM` six map, `fansGateVM`, new `weekVM` (C1.2) | T5/T6: append new exports only at file end, never touch `clubVM`, `hubVM`, `fansGateVM`; `clinicReadyCount` is NOT here |
| `js/ui/app.js` | `import { clinicReadyCount }`, the `matchPlan` line in `decorate()` next to the `workshopVM` guard, `week:` SHEETS entry placed right after `freepick:` (C1.2) | T6 if it needs a sheet: one line appended after `workshop:`; T5 none. Nobody else edits `decorate()` |
| `js/core/clinic.js` | read only | S0 stub, T6 body; signature `clinicReadyCount(s) -> int 0..3` frozen |
| `js/report/hooks.js`, `book-badge.js`, `letters-ui.js`, `six-sheet.js` | read only | unchanged |
C3.4 (T16 badge tests on the live count) is T8's, not T7's.

## 8. OPEN
- OPEN-1: T16.4 says "`aria-label` is N Clinic spins left". This contract puts the words inside the button aria-label (badge span aria-hidden). T8 must assert with a substring match on `.hb-plan`; confirm with the S16 owner.
- OPEN-2: singular "1 Clinic spin left" vs SPEC literal "N Clinic spins left". T8 regex `/\b(\d) Clinic spins? left/`. S0 lead to confirm or force plural.
- OPEN-3: STRIP "Goals 0/3" boxes: V3 shows 3; use `promo.total` boxes (can differ from 3) unless M says fixed 3.
- OPEN-4: real heights (C0.3) may shift the 186-196 banner figure; if live sum without banner exceeds 706, the banner floor 176 cannot hold and C2.5 must shrink dock/squad gaps (not tap sizes).
- OPEN-5: Stadium tile "!" badge for `freePick.pending` and Fans tile "!" for pending activity reuse `.hb-badge`; their aria ("Stadium, free stand ready", "Fan activity, pick one") is unreviewed by the screens thread.

## Lead calls (S0 lead, 2026-11-16, settles every OPEN above; FROZEN)
1. T16.4 badge aria is checked on the FOOT Clinic badge element in `hub-view.js`; test lives with C3.4 (T8).
2. Singular: "1 Clinic spin left"; plural "N Clinic spins left"; 0 = badge hidden, no aria.
3. Goals boxes = `promo.total` when present, else 3.
4. Banner floor 176 px stands. C0.3 live height dump decides; if real heights break it, T7 sends M one card, no silent shrink.
5. Stadium and Fans tile "!" badges: keep today's aria unchanged (no scope creep in T7).
6. `js/core/clinic.js` exists after S0 (stub, returns 0). T7 imports it; T6 replaces the body only.
