# CONTRACT tune-1 (build id btb-tune-1)
Ticket: /mnt/project-files/games-design/bad-trade-bazaar/TICKET-tune-1.md. Keep all M rules (1.5% cut, loss = price below buy, scars kept, spare +1 max 10, end auto-sale scar, look A).

## Owners (one owner per file)
- Maker A (Sonnet): core.js (mechanism only, NOT perk/number values), house.js, sw.js, index.html, tools/e2e.mjs.
- Lead (Opus): tools/bots.mjs, then DEFAULTS number values in core.js AFTER Maker A returns.

## New DEFAULTS keys (core.js), appended after run1Seed
- `sameMarkets: false` - fair test mode. When true, runSeed() returns c.run1Seed for EVERY run (all runs replay run 1's markets).
- `firstRefund: 0` - PROPOSE, off by default. On a losing sell that drops a NEW scar (not spare) whose type the player owned 0 of before (state.owned[type] === 0 at sell time), add `firstRefund * (-gain)` to proceeds (gain<0 part only, after the normal refund perk). Must live in evalSell so sellPreview === sell.

## report()
- Header unchanged shape: `Bad Trade Bazaar btb-tune-1 report`.
- New line right after the config line: `markets: same (run 1 seed every run)` when sameMarkets true, else `markets: fresh (run 1 fixed, runs 2+ random)`.
- config diff line keeps working for new keys automatically.

## Build id
BUILD = 'btb-tune-1' in core.js, sw.js VERSION, index.html #build-id, e2e expectations.

## house.js
STEPS add `firstRefund: 0.1`. Check boolean rows render for sameMarkets (endScar already boolean: copy that path). If labels are a map, add: sameMarkets "Same markets every run (fair test)", firstRefund "First scar of a type refunds loss %".

## Tests
- `node tools/bots.mjs --selftest` passes (lead updates its 'btb-slice-1' string check; maker may update that one line too).
- tools/e2e.mjs passes at 344x882 + 475x638; add one e2e step: toggle sameMarkets in Tweak, check report shows `markets: same`.
