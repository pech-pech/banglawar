<!-- claude-projects-attribution: {"github_login":"pech-pech"} -->
_Requested by **M** · [project thread](https://claude.ai/code/project/chan_01KswLgiui8NQuKXbg87c7Vs?thread=cmsg_01KswLgiui8NQuKXbg87c7VsVhof4gbmwEnoYfFDeJt53A)_

## Summary

Adds the Captain's Over (rule A1) to wheel match mode. Once per innings, M can swap one over for a hand-played over of six timing taps. Spec: pages/cricket-sixes/docs/CONTRACT-GO.md.

Pages: https://pech-pech.github.io/banglawar/cricket-sixes/

## Changes

- Engine: rule constants in js/data/golden-over.js, pure rule code in js/core/golden-over.js, store commands GoldenStart, GoldenTap and GoldenCal in js/store/spins/golden.js.
- Save: VERSION 7 to 8 with a migration that adds `golden` and `goldCal` as null. Never downgrades.
- View: Captain's Over button on the over pick screen (56 px), pitch and feedback in js/ui/golden-over-view.js, 10-tap calibration in js/ui/golden-cal.js.
- Look: gold #D2B357 second ring on that over's balls in the over panel and last-over chips.
- Report: Captain's Over block in the Copy report, and one log line per Captain's Over.
- Tools: tools/golden-sim.mjs and tools/golden-overcheck.mjs.
- Frozen: ball and match vectors stay byte-identical when the Captain's Over is not used.

## Test plan

- [ ] Unit tests: TBD (baseline 1773 / 1771 pass / 2 skip)
- [ ] Vectors unchanged: TBD
- [ ] E2E test/e2e/golden-over.mjs at 475x638: TBD
- [ ] Visual QA at 344x882, 475x638, 624x912, 704x783, 704x823, 816x568: TBD
- [ ] Reload mid-over gives the same balls: TBD
- [ ] Sim (1000 matches per setup): TBD

Placeholders: SIM: TBD, QA: TBD, COST: TBD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Lcw2xuVtaT8mwVpx6Q84SS
