# 17 - Visual direction: owner scores after round 1 (decision deferred)

Date: 2026-10-03. Source: the four contact sheets from OpenArt round 1 (28 jobs, Seedream 4.5, 2K; reference only, never shipped). The owner scored each look overall, 1 to 5, one at a time after seeing its sheet. **No direction has been chosen yet; the owner will decide later.**

| Style | Look | Owner score | Notes from the assistant's own review (not the owner's) |
|---|---|---|---|
| A | Cut paper | 3 (mixed) | Calm and dignified; flat fills reproduce easily from Blender; units need a light rim for contrast |
| B | Low-poly diorama | **5 (top candidate)** | Closest to what Blender renders; the model added light flares, soft shadows and small houses against the prompt, so lighting effects must be forced off in the pipeline; risk of a toy look if saturated |
| C | Ink-line board | 4 (good) | Most readable at small size; palette chips came back as hexagons and one tile sheet has a small building |
| D | Quiet gouache poster | 4 (good) | Strongest mood; drifted into full scenes with a sky and a darker ground; weakest in-game readability, better for screens |

Owner-ranked order: B (5), then C and D (4 each), then A (3).

## Cost and records
- 28 jobs charged 15 credits each at list price: 420 credits (balance 4,829 to 4,409). The Plus-plan MCP discount did not apply to these text-to-image jobs.
- Pictures, parameters and ledger lines are in the private, git-ignored `art-src/bd1971-concepts/round-1/` and `art-src/ledger.jsonl` of the main checkout. The audit (`npm run art:audit`) is clean for all 28.
- Contact sheets: `art-src/bd1971-concepts/sheets/`.

## Not decided / next options (nothing is started)
1. Pick one direction (or map in one look, screens in another, for example B for the map and D for menus and remembrance screens).
2. Prepare round 2 for the chosen look (24 jobs, cap 360 list), including the S6/S7 shape studies, which need historian review before they inform any final asset. The spend gate applies again: model, cost, balance, cap, the owner's yes and the owner's unlock.
3. Or go straight to the Blender pilot (spec 14) targeting the chosen look, with no further OpenArt spend.
4. Pipeline notes if B is chosen: flat three-tone shading with lighting effects off, no light flares, no cast shadows beyond a controlled blob shadow, a muted palette (see section 2.6 of 15) and a light rim on units and boats.
