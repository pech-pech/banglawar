# Squad Duel build bot: gate table

Build sq-slice-1, shipped engine (pages/squad-duel/js). Run 2026-11-23T16:19:02Z. `node tests/squad-duel/bot.js` (n=3000 win-rate seeds, 4000 paired seeds per lift, 20000 duels per chip state).

Summary: PASS 28, EXPECTED-FAIL 1, MISS 11, INFO 6.

Policies (every move goes through SD.engine.playAttack / playDefend): skilled = match5 dp port (getDP6 hand-aware value tables for the continuation, immediate odds from SD.engine.previewAttack/previewDefend, uses A1 / S1, reads Hadro and Sharp Eye tells, plays Zefa +2 zones, can pull Joss); random; ro = lazy role-owner; staller.

| Gate | Target | Measured | Seeds | Status |
|---|---|---|---|---|
| Default stats shipped equal CONTENT-SHEET s1 (12 players, lineup, clubs, T defaults) | no difference | 0 differences (12 players, lineup, 2 clubs, 16 tweak keys) | - | PASS |
| d6 table reproduced from the 36 pairs (SD.odds.table, 10 gaps) | 2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2 | all 10 equal; 2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2 | 36 pairs | PASS |
| SD.odds.attWins / duel v independent rule (nat 6 v 1 wins, nat 1 v 6 loses, ties to defender) | 0 mismatches | 0 mismatches in 1296 pair-checks (gap -8..9, both tie flags) | 36 pairs x 36 gaps | PASS |
| A seed replays identically (full event log + summary, 4 policies x 2 clubs, fx on) | identical | 0 of 64 replays differ | 64 seeds x2 | PASS |
| Every resolved duel re-derived from its Event: win = rule(gap, dice) (Level 1, no nodes, so no fx duel is skipped) | 0 mismatches | 0 of 7200 (0 fx-altered duels skipped) | 600 matches | PASS |
| Chip parts sum to the shown total, gap = total - opp total (+stance), both sides, both clubs, 3 formations | 0 mismatches | 0 in 7200 events | 600 matches | PASS |
| Attack chip equals 36-pair enumeration of its own gap and Press weight (exact, 1e-9) | 0 mismatches | 0 of 4520 shown chips | 600 matches | PASS |
| Cap +3 on d6 respected on every attack (bonus over stat <= 3, incl. Pass +2) | max +3 | 0 breaches in 7200 events | 600 matches | PASS |
| Hand is 3 cards on every turn without Fourth Card | 3 | 0 turns with another size | 600 matches | PASS |
| Every odds chip within 1 point of 20000 seeded duels (attack and defence states) | max /chip - freq/ <= 1.0 pt | 24 states, worst 0.71 pt, 0 over 1.0 | 24 states x 20000 | PASS |
| Formation spread v Reading (best - worst, skilled wins) | >= 5 | 6.2: Spear 46.7 / Diamond 45.8 / Wall 40.5 | 3000 x 3 | PASS |
| Formation spread v Grimsby (KNOWN MISS, report the number) | >= 5 (expected ~1) | 3.7: Wall 65.1 / Spear 64.6 / Diamond 61.5 (noise at this N is about 1.5 points per row) | 3000 x 3 | EXPECTED-FAIL |
| Best formation differs between the two clubs | differs | Grimsby Wall, Reading Spear | 3000 x 6 | PASS |
| Skilled bot, match 1 v Grimsby (default lineup, Level 1, no nodes, best formation Wall) | 60-70 % wins | W 65.5 D 26.4 L 8.1 | 3000 | PASS |
| Skilled bot, match 2 v Reading (same lineup, bare: the bot5 conditions) | 40-50 % wins | W 46.6 D 34.0 L 19.4 | 3000 | PASS |
| Random bot ("Random": random card, random action / stance), match 1 | 20-45 % wins (floor and ceiling) | W 6.0 D 42.4 L 51.6 | 3000 | MISS |
| Random-card bot ("RC": random card, best action / stance for that card), match 1 | 20-45 % wins (floor and ceiling) | W 21.8 D 43.9 L 34.3 | 3000 | PASS |
| Random-card bot, match 2 (information) | 20-45 reported | W 7.0 D 32.7 L 60.3 | 3000 | INFO |
| Random bot, match 2 (information; same band reported) | 20-45 reported | W 2.2 D 25.1 L 72.8 | 3000 | INFO |
| Lazy role-owner "ro" v skilled, match 1: win points lost by following roles (the choice test) | ro clearly below skilled (info; > 3 pts = the pick matters) | ro 65.1 v skilled 65.5 (gap 0.4) | 3000 | INFO |
| Lazy role-owner "ro" v skilled, match 2 | info | ro 46.4 v skilled 46.6 (gap 0.3) | 3000 | INFO |
| 0-0 at full time, skilled, grimsby | <= 20 % | 14.0 %  (draws 26.4 %, GF 1.15 GA 0.29) | 3000 | PASS |
| Top card share of attack picks, skilled, grimsby | <= 45 % | mirelle 27 / tavo 25 / pip 23 / sunniva 20 / barro 5 / kessan 0 | 3000 (23285 picks) | PASS |
| Advance share of attack picks, skilled, grimsby (Dribble, Through each) | <= 80 % each | Dribble 28 / Through 10 / Pass 35 / Shoot 27 | 3000 | PASS |
| 0-0 at full time, skilled, reading | <= 20 % | 14.4 %  (draws 34.0 %, GF 0.96 GA 0.57) | 3000 | PASS |
| Top card share of attack picks, skilled, reading | <= 45 % | mirelle 26 / pip 25 / tavo 25 / sunniva 20 / barro 4 / kessan 0 | 3000 (21944 picks) | PASS |
| Advance share of attack picks, skilled, reading (Dribble, Through each) | <= 80 % each | Dribble 36 / Through 3 / Pass 33 / Shoot 27 | 3000 | PASS |
| Staller (skilled until ahead, then Pass whenever legal) v skilled: points share on identical seeds | 48-52 (50 = equal) | 49.8  (Grimsby 49.9, Reading 49.6; staller wins 65.0 / 44.7 v skilled 65.5 / 46.6) (engine has no bot opponent, so "v skilled" = staller points / (staller + skilled points) against the same clubs, same seeds) | 3000 x 2 clubs | PASS |
| Information: match 2 as shipped (Level 2 Traits on all 5 pitch players, one 3-SP node set), skilled wins | info (gate band 40-50 is on the bare line above) | grimsby: Level 2 traits only 81.3 / grimsby: L2 + A1,A2 82.0 / grimsby: L2 + D1,D2 88.9 / grimsby: L2 + S1,S2 83.9 / reading: Level 2 traits only 67.7 / reading: L2 + A1,A2 67.6 / reading: L2 + D1,D2 80.8 / reading: L2 + S1,S2 73.5 | 3000 each | INFO |
| Node A1 Sharp Eye alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +0.1 (se 0.3), Reading +0.9 (se 0.3); fires in 75 / 54 % of matches ; bot used {"A1":3008} / {"A1":2154} (below the 2 floor on Grimsby and Reading) | 4000 paired x 2 clubs | MISS |
| Node A2 Keep the Thread (A1 owned in both arms) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | AFTER ENGINE FIX (kept Build now survives to my next attack): Grimsby +0.1 (se 0.1), Reading +0.1 (se 0.1); fires in 35 / 35 % of matches (before fix: +0.0, could never change an outcome) | 4000 paired x 2 clubs | MISS |
| Node D1 Rebound alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +1.8 (se 0.4), Reading +4.0 (se 0.5); fires in 72 / 87 % of matches (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Node D2 Last Man (D1 owned in both arms) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +6.9 (se 0.5), Reading +11.7 (se 0.6); fires in 52 / 55 % of matches | 4000 paired x 2 clubs | PASS |
| Node S1 Fresh Hand alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +1.5 (se 0.5), Reading +2.4 (se 0.6); fires in 67 / 65 % of matches ; bot used {"S1":2682} / {"S1":2615} (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Node S2 Fourth Card (hand of 4; S1 owned in both arms) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +2.6 (se 0.7), Reading +4.0 (se 0.7); passive (hand of 4 every turn) | 4000 paired x 2 clubs | PASS |
| Trait Spare Ball (Mirelle L2) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +0.4 (se 0.3), Reading +2.6 (se 0.4); fires in 77 / 86 % of matches (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Trait Quick Feet (Pip L2) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +1.1 (se 0.3), Reading +1.5 (se 0.3); fires in 73 / 60 % of matches (below the 2 floor on Grimsby and Reading) | 4000 paired x 2 clubs | MISS |
| Trait Second Strike (Tavo L2) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +7.1 (se 0.4), Reading +8.3 (se 0.5); fires in 62 / 67 % of matches | 4000 paired x 2 clubs | PASS |
| Trait Hold Firm (Kessan L2) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +3.4 (se 0.4), Reading +4.4 (se 0.5); fires in 30 / 56 % of matches | 4000 paired x 2 clubs | PASS |
| Trait Big Read (Ondra L2) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +1.9 (se 0.3), Reading +3.2 (se 0.4); fires in 19 / 37 % of matches (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Signature Dream Volley (Lio fielded) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +4.9 (se 0.7), Reading +6.5 (se 0.8); Midfield Shoot picked 1.47 / 1.35 times per match | 4000 paired x 2 clubs | PASS |
| Signature Sweep Across (Joss fielded) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +5.2 (se 0.5), Reading +8.6 (se 0.6); fires in 63 / 69 % of matches | 4000 paired x 2 clubs | PASS |
| Signature Wing Switch (Zefa fielded) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +0.4 (se 0.1), Reading +1.3 (se 0.2); fires in 9 / 18 % of matches (below the 2 floor on Grimsby and Reading) | 4000 paired x 2 clubs | MISS |
| Signature Read the Run (Hadro fielded) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +0.7 (se 0.2), Reading +2.1 (se 0.3); fires in 100 / 100 % of matches (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Signature Last Hand (Ysolde in goal) alone lifts skilled wins | 2-15 pts, none over 15 (both clubs) | Grimsby +1.4 (se 0.2), Reading +2.9 (se 0.3); fires in 6 / 12 % of matches (below the 2 floor on Grimsby) | 4000 paired x 2 clubs | MISS |
| Information: whole pulled player v default lineup (stats + move), skilled wins | info (bot5: Lio 9.2/10.5, Joss 7.9/7.0, Zefa 4.7/5.4, Hadro 1.9/3.0, Ysolde 8.5/9.6) | lio: grimsby +8.4, reading +10.8 / joss: grimsby +6.8, reading +13.3 / zefa: grimsby +4.1, reading +4.5 / hadro: grimsby +0.4, reading +1.6 / ysolde: grimsby +5.1, reading +10.3 | 800 paired | INFO |

Chip states checked:

- grimsby/Wall/T7/defend Z1 press: chip 30.6 v 30.2 (d 0.33)
- grimsby/Wall/T6/attack Z2 shoot: chip 58.3 v 58.3 (d 0.05)
- grimsby/Wall/T5/attack Z1 dribble: chip 80.0 v 80.5 (d 0.52)
- grimsby/Wall/T4/defend Z1 drop: chip 84.2 v 84.1 (d 0.03)
- grimsby/Wall/T5/defend Z1 press: chip 56.7 v 56.5 (d 0.20)
- grimsby/Wall/T6/attack Z0 pass: chip 58.3 v 58.7 (d 0.32)
- grimsby/Wall/T11/attack Z2 shoot: chip 58.3 v 58.6 (d 0.25)
- grimsby/Spear/T9/attack Z0 dribble: chip 93.1 v 93.2 (d 0.18)
- grimsby/Spear/T12/attack Z1 pass: chip 58.3 v 58.5 (d 0.15)
- grimsby/Spear/T8/defend Z1 press: chip 46.1 v 46.8 (d 0.71)
- grimsby/Spear/T1/attack Z1 dribble: chip 88.9 v 88.8 (d 0.12)
- grimsby/Spear/T6/attack Z2 shoot: chip 27.8 v 27.7 (d 0.07)
- grimsby/Spear/T9/attack Z0 dribble: chip 85.8 v 85.9 (d 0.04)
- reading/Wall/T4/attack Z1 through: chip 68.3 v 68.0 (d 0.38)
- reading/Wall/T8/defend Z2 press: chip 41.7 v 42.0 (d 0.36)
- reading/Wall/T7/defend Z1 drop: chip 76.1 v 76.1 (d 0.00)
- reading/Wall/T9/defend Z1 press: chip 12.5 v 12.3 (d 0.23)
- reading/Wall/T8/defend Z2 press: chip 41.7 v 41.2 (d 0.45)
- reading/Wall/T10/attack Z1 pass: chip 91.7 v 91.8 (d 0.16)
- reading/Wall/T5/attack Z1 dribble: chip 73.3 v 73.6 (d 0.29)
- reading/Spear/T12/attack Z2 shoot: chip 41.7 v 41.7 (d 0.04)
- reading/Spear/T2/attack Z2 pass: chip 91.7 v 91.6 (d 0.07)
- reading/Spear/T6/attack Z2 shoot: chip 8.3 v 8.2 (d 0.17)
- reading/Spear/T11/attack Z0 pass: chip 91.7 v 91.7 (d 0.06)

<!-- FINDINGS -->

## Findings (what failed, likely cause, file)

Method notes. Win-rate rows use 3000 seeds (SE about 0.9 pt); lifts use 4000 paired seeds (SE 0.3-0.8). Fx isolation = same seeds with `T.fxOff[id]=true`, pitch Level 2, club-best formation. Skilled bot is not told about A2/D2/Trait rules (it sees them only through previews), so small lifts for once-per-match items are partly "the bot does not plan for it". Formation spread v Grimsby moved 5.3 (n=300) to 3.7 (n=3000): the known miss stays a miss, bigger than bot5's 1.0 but under 5. Option for M: give Diamond a second counter (e.g. +1 DEF v Pass) or lower Wall to +2 so Wall is no longer best v the Dribble-heavy club.

1. FIXED in engine.js (m.flags.keptBuild restored on next possession; lift now +0.1, still under the 2 floor = balance MISS, not a bug). Was: A2 Keep the Thread can never change a result (lift 0.0, se 0.0 in 4000 seeds). Repro: `node` script, seed 1..3000, Reading, Wall, nodes ['A1','A2'], play hand[0]: A2 fires 1252 times and build.me is kept right after, but 0 times is Build still there on my next attack. Cause: `finish()` in `pages/squad-duel/js/engine.js` resets `next.build = {me:0,opp:0}` on EVERY change of possession (a lost defend duel by the club, or a club shot), and A2 (`fx-nodes.js` A2.after) only protects the turn of my own loss. Fix owner: engine.js (finish) + fx-nodes.js (A2 must stash the kept pips in `m.flags` and restore them when I next hold the ball).
2. Match 2 as shipped is far above the 40-50 band: bare 46.6 PASS, but with Level 2 Traits on all 5 pitch players (Opening day) skilled wins 67.7 v Reading (81.3 v Grimsby), and 73.5 / 80.8 with S1+S2 / D1+D2. Traits are individually fine (Second Strike +7/+8, Hold Firm +3/+4) but stack to about +21 points. Likely cause: Trait strength in fx-players.js (T_STRIKER reroll, T_ANCHOR) plus D1/D2 in fx-nodes.js (D2 alone +7/+12). This is a stacked-effect finding, not a loosened gate.
3. Random bot (full random) wins 6.0 % v the 20 floor: the design gate cannot be met by pure random with this Deck-hand engine (bot5 had the same 6.0 / 2.6). Random-card bot (random card, best action) passes at 21.8, but is only 1.8 over the floor. Lazy role-owner "ro" equals skilled (gap +0.4 match 1, +0.3 match 2): the card follows the action, so the PROTO QUESTION ("is picking the player a real choice?") is answered NO by the bot; same as bot5 (0.1 / 0.5).
4. Small lifts, under the 2 floor on at least one club: A1 Sharp Eye (+0.1 / +0.9, using it every time or only on a large gain gives the same), D1 Rebound Grimsby +1.8, S1 Fresh Hand Grimsby +1.5, Spare Ball Grimsby +0.4, Quick Feet +1.1 / +1.5, Big Read Grimsby +1.9, Wing Switch +0.4 / +1.3 (fires in 9 / 18 % of matches), Read the Run +0.7 / +2.1 (bot does not value playing Hadro early to open the window), Last Hand Grimsby +1.4 (fires 6 / 12 %). Likely cause: effects are once-per-match or fire rarely; fx-nodes.js / fx-players.js numbers are correct to the contract, so this is a design-number finding. Passing and under the 15 ceiling: D2, S2, Second Strike, Hold Firm, Dream Volley, Sweep Across. Nothing is over 15.
5. No engine bug blocks the bot: d6 table, seed replay, resolve rule, parts sum, cap +3, hand 3 and the 20,000-duel chip check (worst 0.71 pt over 24 states) all PASS.
