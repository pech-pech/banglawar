# Chart School cs-proto-2: integration round 2 (2026-11-24)
Trigger: M, "Support and resistance lines are drawn at 45 degrees. Fix" (Dorsey BSL/BRL, square boxes, R3 3-way).
Build id: cs-proto-1 -> cs-proto-2 in src/main.js, src/store.js, tools/gen-sheets.js, data/sheets.json, test/e2e.js. sw.js and index.html carry only the CI-stamped `__PGS_BUILD__` (shared SW core, PR #124), so they need no manual bump.

Final run
- node test/engine.test.js: 6084 checks, 0 failed
- node tools/gen-sheets.js: 240 sheets, 240 KB; R3 mix 33/34/33 style balance (see docs/GEN-REPORT.md)
- node test/bots.test.js: PASS, every bot under 40% on every type (R3 random 33.3, common 34.2, first 34.2); 6+ of 7: 0.006% / 0.00% / 0.00%
- node test/solver.test.js: PASS, all types 100% agree (R3 240/240)
- python3 src/build.py: index.html 97.2 KB
- node test/e2e.js at 344x882 and 475x638: 754/754 checks ok, all 8 reading types seen

Fixes
- bots.test.js fallback R3 option texts updated; gen-sheets conventions string now names Dorsey BSL/BRL.
- chart.js (FM): only the ACTIVE trend segment carries a label; older segments are thinner (1px) and 45% opacity, no label.

Visual (qa/344x882-marked-R3.png, 344x882-evidence-w10.png)
Lines are clean 45-degree diagonals; a dim older BSL rises under the O columns, active BRL labelled "resistance" falls after the break. Evidence w10 now shows one label.

Geometry check (script over 240 sheets x 3 weeks = 720 charts, 4171 segments): 0 cases of a resistance segment crossing an X box or a support segment crossing an O box while in force (break columns excluded).
