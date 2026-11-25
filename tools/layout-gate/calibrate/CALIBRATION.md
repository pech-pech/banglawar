# Layout gate calibration: Chart school (SVG), run 2026-11-25

Fixture only. Chart school (`pages/chart-school`) is not gated. Commits: buggy `9d23ac3` (PR 126), fixed `f7e77c5` (PR 127).
Run: `node tools/layout-gate/calibrate/calibrate.mjs` (extracts `pages/` per commit with `git archive`, writes a temp `layout-gate.json`, runs `gate.mjs --shim calibrate/chart-school-shim.js`). Gate with probe.js at the time of the run, 7 sizes x 20 states, settleMs 150, defaults dupPx 14 / tapMin 48 / textMin 12 / fillMin 0.6 / overlapFrac 0.15.

## Verdicts

| commit | verdict | HARD | SOFT |
|---|---|---|---|
| 9d23ac3 buggy | FAIL | 1541 | 266 |
| f7e77c5 fixed | FAIL (see false alarms) | 1414 | 0 |

The fixed commit does not PASS with default thresholds. 1260 of its 1414 HARD hits are two classes that are not layout bugs (text-small, load-error). The rest are mostly one class: content scrolled under the fixed bottom bar.

## Check x commit (HARD/SOFT, all sizes x states)

| check | 9d23ac3 | f7e77c5 |
|---|---|---|
| dup-label | 28/0 | 0/0 |
| clipped | 4/0 | 0/0 |
| fill-empty | 0/266 | 0/0 |
| text-over-mark | 195/0 | 125/0 |
| text-overlap | 45/0 | 24/0 |
| tap-covered | 9/0 | 5/0 |
| text-small | 1253/0 | 1253/0 |
| load-error | 7/0 | 7/0 |

## Known PR 126 bugs

| bug | caught at 9d23ac3 | by | at f7e77c5 |
|---|---|---|---|
| chart uses only right part of card | yes (x266, all 7 sizes) | `fill-empty` SOFT, "content spans 15-58% of width" on `div#pf`/`div#pfs` (needs the calibration `fill` tag on the chart wrapper) | gone |
| stacked duplicate price tags (the "192" bug) | yes (x28; value "146" in the seed used) | `dup-label` HARD, same text at y 203 and 221 | gone |
| "support" label over axis | yes (x96) | `text-overlap`/`text-over-mark` on the "support" text (and axis number) | 13 hits remain, see below |
| "your pick" label over marks | yes (x19) | `text-over-mark` HARD `"your pick" over mark path/circle` | gone |

The buggy commit fails with `dup-label`, `text-overlap`, `text-over-mark`, `clipped`: all four required-class hits present. `fill-empty` stays SOFT as the contract says; it was the only check that saw "uses only right part of card".

## Fixed commit: every HARD hit, grouped (likely false alarms unless marked)

1. `text-small` x1253 (34 distinct strings). Chart school deliberately uses 10-11px captions ("Box 2%", "Accuracy record", legend dots, "Support / resistance"). Same count at both commits, so no discrimination. Likely false alarm at textMin 12 (admin default); a product decision, not a bug.
2. `load-error` x7 (one per size). `404 .../chart-school/version.json`: optional version probe the app tolerates. False alarm; same at both commits.
3. Fixed bottom bar `div#bar` over scrolled content, x108 (`text-over-mark` 103 with detail like `"Submit reading" over mark path`, `tap-covered` 5 on `div.card.q > div.optgrid > button.btn.opt` at desk-1920x1080) plus `text-overlap` pairs where one side is a bar button or the text sits under it (`"Support: which box" x "Skip"`, `"These stocks mostl" x "Journal"`, `"10" x "Next reading"`, `"15" x "Confirm call"`, `"Sector · Energy" x "Copy report"`). Page content scrolls under a fixed action bar by design (main has bottom padding), and the gate measures the page at scrollTop 0 where content that is below the fold still has a box under the bar. Likely false alarm; the same pattern accounts for most hits at the buggy commit too.
4. Possibly real, look at the sheet, not proven: `"support" over mark path/circle` at fold-open-704x823 reading-R2 (box 608,328,39,39); `"resistance" over mark` at fold-open-704x823 reading-R2b; `"entry" over mark` at fold-cover-344x882 outcome-end-2. These are in-chart labels that PR 127 moved off marks; at the wider layout a glyph still falls under the label's box. Because my tag marks every `circle`/`path` in the chart (including pills and arrows, see Shim), part may be label pills tagged as marks.
5. `text-overlap` non-bar: `"0% to 79%" x "Journal"` (s23u desk) and `"21% to 100%" x "Journal"` (fold-cover-475 desk), `"now" x "Submit reading"`: same fixed-bar class once the page is taller than the viewport.

## Threshold and probe suggestions (for the integrator; I did not edit probe.js or gate.mjs)

1. Fixed/sticky occlusion (top item). Ignore overlap, over-mark and tap-covered where the second box is inside a `position:fixed|sticky` element and the first box is in the normal flow and below the fold or only partly visible at scrollTop 0. Cheaper alternative: for text-overlap, text-over-mark and tap-covered require the text centre to be inside the viewport and `elementFromPoint` at the text centre to be the text's own element; if the point is covered by a fixed element, report it only once as `tap-covered`-style "bar covers content" when the content is at max scroll. The gate should also run each state again after `scrollTo(0, scrollHeight)`: an unreachable last control behind the bar is the real bug.
2. `text-small`: keep textMin 12 only for body and control text; for captions allow 10 and decide by M. Alternative: apply `soft:["text-small"]` in the Chart school marker (M's card) so it counts but does not block. Chart school would otherwise never be PASS.
3. `load-error`: ignore HTTP 404/failed fetches of non-document subresources (version.json, favicon, sw.js, manifest) unless the URL matches `.js|.css|.html`; keep `pageerror` and uncaught `console.error`.
4. `fill-empty`: the 60 percent default separated buggy (15-58) from fixed (no hit) in this run with room to spare. Safe to promote SOFT to HARD only after Trivia Duel and Cricket Sixes confirm; marginal hits at the fixed commit appeared only in an earlier seed (49-60 percent at the 475 and 882 sizes), so do not raise fillMin above 0.6.
5. `dup-label` (dupPx 14, 1.5x vertical) caught the stacked tags with no false alarm at the fixed commit: keep.
6. The two hit classes that detected PR 126 bugs without any fixed-commit noise are `dup-label` and `fill-empty` (plus the "your pick" `text-over-mark`). The noisy ones (`text-over-mark`, `text-overlap`, `tap-covered`) all depend on item 1.

## Shim notes (chart-school-shim.js)

- Calibration-only tagging: a MutationObserver adds `data-layout="mark"` to every `circle` and `path` inside `svg[data-cell]` (X and O glyphs, but also pills and arrows) and `data-layout="fill"` to each P&F chart svg and its direct wrapper (`div#pf`, `div#pfs`). A real gated game must author tags itself.
- States (20, fixed order): `desk, reading-R2, marked-R2, reading-R7, marked-R7, reading-S1, marked-S1, call, outcome-mid, outcome-end, summary, reading-R2b, marked-R2b, reading-R5, marked-R5, reading-S2, marked-S2, call-2, outcome-end-2, summary-2`. `states()` discovers the names with a dry replay; `goto(name)` replays clicks from `newRun(seed)` + `go('desk')` (no reload; about 0.1-1.7 s per state).
- Seed: gate calls `seed(1)`; the shim maps it to app seed 39 (`SEED_BASE = 38`, admin default) because seed 1 never shows the Support read (R2) in its first two charts, and the PR 126 "support" label bug only appears there. Both commits use the same chart order.
- Not covered: R1/R3/R4/R6 appear only in other seeds; runend and the settings sheet are not visited.

---

# Re-run after tuning (M8, 2026-11-25)

Probe changes: (1) load-error counts only `pageerror`, console errors that are not "Failed to load resource", and a failed main document (HTTP >= 400 or navigation error). (2) text-overlap, text-over-mark and tap-covered skip a pair when exactly one side is inside a `position:fixed|sticky` ancestor (tap-covered: only when the covering element is the fixed one). (3) New HARD `under-bar`: probe scrolls the main scroller to its max, reports any visible tap target or text whose centre is still hit by a fixed/sticky element, restores scroll. (4) text-over-mark on rotated SVG text uses per-glyph boxes (the bbox of a 45-degree label is mostly empty), and ignores a mark drawn in the same group as the text that already contains >= 75% of the text box (the label's own backing pill).
Same shim, seed, 7 sizes x 20 states.

| commit | verdict | HARD | SOFT |
|---|---|---|---|
| 9d23ac3 buggy | FAIL | 1374 | 266 |
| f7e77c5 fixed | FAIL | 1262 | 0 |

| check | 9d23ac3 | f7e77c5 |
|---|---|---|
| text-small | 1253 | 1253 |
| text-over-mark | 61 | 9 |
| dup-label | 28 | 0 |
| text-overlap | 28 | 0 |
| clipped | 4 | 0 |
| fill-empty (SOFT) | 266 | 0 |
| tap-covered, load-error, under-bar | 0 | 0 |

All 4 PR 126 bugs still caught at 9d23ac3 (right-only x266 SOFT, 192 dup x28, "support" x32, "your pick" x19) and none at f7e77c5.

## text-small stays HARD at 12 px (lead decision)

It is a rule for new builds. Chart school's 10-11 px captions ("Box 2%", "Support / resistance", legend text) are real small text, the identical 1253 hits at both commits are expected, and Chart school is not gated, so it never reaches PASS. Do not read the fixed-commit FAIL as a probe defect.

## Remaining non-text-small HARD at f7e77c5 (9, all text-over-mark; sheet and 3x crops inspected)

- `"resistance" over mark circle` x3 at fold-open-704x823 (reading-R2b, reading-R5, call-2): the diagonal orange "resistance" label starts touching the edge of an O glyph in the last column. Real but minor (first letter grazes a glyph); judged REAL.
- `"entry" over mark path/circle` x6 at outcome-end-2 (344, 475, 882x704, both desks): "entry" sits on an opaque dark pill; a corner of a neighbouring X cell glyph is clipped by the pill, the text itself is clear. Judged FALSE ALARM (intentional opaque label plate). Not fixed further: the plate rule needs the pill path to contain 75% of the text box and here it narrowly does not. Candidate for a `data-layout-ok` waiver in a gated build.
- Previously reported false alarms now gone: fixed-bar `text-over-mark` / `tap-covered` / `text-overlap` pairs (about 150 hits), `"support" over mark` at fold-open-704x823 (rotated-label bbox false alarm), load-error x7 (version.json 404).
