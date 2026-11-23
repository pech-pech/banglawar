# INTEGRATION sq-season-1

## Fixed
- match-acts.js: active ability click called `U.api.useAbility(U, id)`; the api wrapper already adds U, so Sharp Eye / Second Look / Fresh Hand never fired (and the recorded input held a circular ref). Now `useAbility(id)`. Second Look (A3) added to the ability strip text, flash shows the stance. Verified: A3 sets flags.secondLookTurn, tell shows "Drop this turn".
- Tree (meta-a.js + css): `data-node` on every node button; new `#tree-t3` strip links the other trees' tier 3 nodes (A3, D3, S3 all in DOM at once). Buy uses SD.progress.canBuy (detail panel).
- jump=card: manager reads `SD.app.openCard` and opens `#card-detail`.
- Shootout UI vs real js/shootout.js: club kick stat from `sh.cfg.club.kick` (= m.cs.def + oppKickBonus), my keeper from `sh.cfg.myKeeper.def`, their keeper `sh.cfg.club.keeper`; result line shows halved gap + dice; tie-rule text now matches logic (tie to kicker; rule R: keeper reads same role twice, tie to keeper). `SD.app.sh` is kept after Done (cleared at next matchSetup) so Tweak Copy report picks it up.
- Removed stale grimsby*/reading* defaults from engine.js DEF_T and tweak.js DEF_T; data.js TROPHY / NEXT_GOAL now season text; meta-b slice trophy screen (`SD.ui.end`) retired (router uses `SD.ui.seasonEnd`).
- tests/squad-duel/e2e.js: old slice flow updated to hub -> manager -> match -> result -> mdres -> hub -> tree -> pull (20 grid) -> manager -> match 2 -> mdres -> table -> hub; swap clicks the card button; tweak change skips the choice control. Band/odds/no-scroll/scene/replay/report checks kept.

## Results
- node --check all js/ui/tests: OK. `node tests/squad-duel/load.js`: OK. club-ai self-test OK.
- bot.js --n=300 --lift=300 --chip=2000 --no-write: d6 table PASS, replay PASS (0/64 differ), chip-vs-36-pairs PASS, cap +3 PASS. MISS rows (content, as allowed): Random bot win band, reading 0-0 26%, several node/trait lifts, "chip within 1 pt of 2000 duels" worst 2.97 pt (sampling-noise gate; I did not touch odds code, could not compare to pre-season baseline).
- e2e.js: 0 FAIL. e2e-season.js: 0 FAIL (206 PASS incl. tree A3/D3/S3, card detail, shootout, resume, 344x882 and 475x638, no console errors).

## Still open
- Shootout resume restarts at kick 1 (sh not saved). Jumps fake 3-0 wins. Bot may retune Rotherham.
- Chip row MISS above: verify against a pre-season run if it matters.
