# Project Volley: economy baseline (2026-11-10, for M)

Source: `node bot.js 200` from pages/volley/src (the new "Economy" section at the end of BOT-RESULTS.txt). Human bot, 50 careers x 30 runs
(10 of them play on until everything is maxed). After each run the bot banks the credits and buys the cheaper of rifle / Conditioning first. No economy number was changed.

## Current numbers
- Income per run: a full clear pays 334 (7 combat x 24, cache 95, boss 24 + 47). Dying early pays 24 per cleared combat room: stage 3 = 48, stage 6 = 96, stage 7 = 120, stage 8 = 144.
- Prices: rifle 250 x level (L1 to L2 is 250, total to L10 11,250). Conditioning ladder 250, 325, 375, 450, 500 ... 30 buys cost 86,850 in total.
- Power per buy: rifle +8 ATK (+5% at L2, less later); Conditioning +40 HP (+6.7%), or +3% ATK, or +3% fire rate. Fully maxed = ATK x1.92, HP 1000, fire x1.30.
- Human bot (clears about 90% with no upgrades, so it is a strong player): it wins 1,479 of 1,500 career runs, so it earns 334 almost every time.
  - Credits per run: median 334, p10 334, p90 334. The 21 losses paid 120 median (p10 96, p90 144).
  - First upgrade: after run 1 (the first 334 buys one 250 item). 5th upgrade: after run 5 (p90 6). 10th upgrade: after run 14 (p90 15).
  - Clear rate by run number: runs 1-5 94.0%, 6-10 99.2%, 11-15 100%, 16-20 99.6%, 21-25 100%, 26-30 98.8%.
  - Power at the start of run n (ATK / HP / fire): run 2 156 / 600 / 1.00; run 5 166 / 640 / 1.00; run 10 175 / 640 / 1.06; run 20 187 / 720 / 1.09; run 30 209 / 720 / 1.09.
  - Time to max: rifle 10 after run 74; all Conditioning 10 (so everything) after run 294. Both at 334 per run, so a player who dies often takes longer.
- Reading: for a bot that clears, one run buys one thing and 5 runs buy five, about 4% ATK-equivalent each. The bot cannot say how it feels, because it almost never loses.

## What a player who dies early sees (arithmetic from the same prices, not simulated)
| Player pattern | Credits/run | Runs to 1st buy (250) | Runs to 5th buy (1,650 total) | Runs to 10th buy (about 4,650) |
|---|---|---|---|---|
| dies at stage 3 every run | 48 | 6 | 35 | 97 |
| dies at stage 6 every run | 96 | 3 | 18 | 49 |
| dies at stage 7-8 | 120-144 | 2 | 12-14 | 33-39 |
| clears every run | 334 | 1 | 5 | 14 |
(From the review: M's driven run earned 96, so run 2 gives 192, still short of 250. The first buy lands on run 3.)

## Candidate target bands (to set after M's two Fold runs)
Measures: runs to the first buy, to the 5th buy, and the power of the first buy. The bands are proposals; M decides.
- A. "Run 2 always feels stronger": first buy by run 2 even for a stage-3 death; 5th buy by run 6-8 for a median loser; each early buy is at least +5% damage or +40 HP.
  Feel: steady, every sitting shows progress, the chapter is outgrown fast. Max by roughly run 100 for a clearing player. Needs cheaper early prices or a first-clear/consolation credit (a balance change).
- B. "Earned by run 3" (about what the current numbers give a stage-6 player): first buy by run 3 for a stage-6 death, 5th buy by run 5 for a clearing player, 10th by run 14.
  Feel: the first upgrade is a small event after a few tries; players who clear feel a buy every run. Keeps today's numbers. Risk: a stage-3 death player waits 6 runs and may feel nothing.
- C. "Slow burn": first buy by run 4-6, 5th by run 15-20, rifle 10 around run 100+ for a median player.
  Feel: upgrades are milestones, runs are decided by skill, much less "I got stronger". Keeps P2 gear and talents as the main power source. Needs price increases of about 1.5x or income cuts.
Not recommended without child-safety review: anything with timers, or any way to pay for credits (none in the design).

## Ask of M (two Fold runs)
Play two runs, note the stage you die at and whether run 2 felt stronger. If run 2 felt flat after dying at stage 3-6, band A or a consolation credit is the likely target; if it felt fine, band B holds and no change is needed.
