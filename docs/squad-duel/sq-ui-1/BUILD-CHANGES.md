# Build changes: sq-ui-1 (Squad Duel UI fixes, all 46 rows)
PR #117, branch claude/project-thread-skn7qb. UI only; rules/data files byte-identical to main.

## Coverage (RANKED-LIST rows)
IN: 1-46 all. Row 35 light copy (season build replaces end screen). Row 39 without the "Play X in place of Y" button (listed OUT in the ranked list).
LATER/CUT: none.
Admin defaults kept (makers): role jobs one word on manager cards; trait tags show name only on hand cards (full text in title/aria); close-call dot on top two tiles; defend footer "Grimsby keep it, you defend again."; "FROM MATCH 2" node line; trait/locked-tier/signature one-liners written in UI files (data.js frozen).

## Checks
- e2e: 154 PASS, 0 FAIL at 344x882 + 475x638 (band total = cause total every turn incl. Press + Drop; odds on every card before a tap; no text < 12px; #scene stable pick to result; report replay identical).
- Bot gates rerun: 28 PASS / 11 MISS, same verdicts as main (engine unchanged).
- Visual QA first pass: 8 blockers, all fixed (match 2 pitch label + token spread, card text cut, badge/NEW overlap, band names, 475 pitch, tell text at 475/816, turn label at 816). fx turn, keeper turn, WIN and LOSS full-time viewed. No console errors, no page scroll at 344/475/624/704/816.
- Known: at 475x638 the pitch is 105px (tight; players 8/11 touch slightly).

## Code
ui/match.js split into match-help/cards/acts/result/frame + core; contract docs/squad-duel/sq-ui-1/CONTRACT-UI.md. Season hooks: #mode-label, #match[data-side], #match[data-keeper].

Lessons applied: 0 (M text first: rows built as written, OUT items left out), 2 (status every 10 min), 5 (56px targets), 6 (admin defaults labelled), 11 (one QA pass), 14 (results from final run), 18/23 (lead plans, 10 Sonnet makers + QA in parallel, one owner per file).
COST: ~70 agent min (10 makers ~55, QA 8, fixes ~9) v 997 min maker guess. Under-delivery check (R10) done: all 46 rows reported built and covered above.
