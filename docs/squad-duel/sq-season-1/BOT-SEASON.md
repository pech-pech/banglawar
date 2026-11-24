# BOT-SEASON: bot gates 1-7 for build sq-season-1

Written by `node tests/squad-duel/bot-season.js` (maker "bot"), report run 2026-11-23T18:54:19Z. Every move goes through the REAL engine (SD.engine.playAttack / playDefend / use), seasons through SD.season, shootouts through SD.shootout, pulls through SD.gacha.pull, pay through SD.progress.applyMatch. Status: HIT = inside the band, MISS = outside it (reported as a miss, not tuned away), INFO = no band exists, number reported.

Summary: MISS 27, HIT 32, INFO 23.

## Misses (top of the page)

- G1 Signature Sidestep (dessa) alone: grimsby +2.7 (se 0.4, fires 21%), reading +1.5 (se 0.5, fires 14%) (target lift +2 to +12, fires in >= 20% of matches, both clubs) / lift outside +2..+12 on reading fires under 20% on reading
- G1 Signature Hold Up (yenna) alone: grimsby +0.3 (se 0.4, fires 13%), reading +1.0 (se 0.3, fires 10%) (target lift +2 to +12, fires in >= 20% of matches, both clubs) / lift outside +2..+12 on grimsby, reading fires under 20% on grimsby, reading
- G1 Signature Follow Up (ruvo) alone: grimsby +1.9 (se 0.4, fires 33%), reading +1.9 (se 0.3, fires 50%) (target lift +2 to +12, fires in >= 20% of matches, both clubs) / lift outside +2..+12 on grimsby, reading
- G1 Signature Twin Run (veska) alone: grimsby -2.0 (se 1.0, fires 58%), reading -10.5 (se 1.6, fires 94%) second Shoots 0.73/1.60 a match; IF the second Shoot could be declined (bot sets m.played, API has no decline): grimsby +0.5 (se 0.5), reading +0.9 (se 0.5) (target lift +2 to +12, fires in >= 20% of matches, both clubs) / lift outside +2..+12 on grimsby, reading
- G1 Signature Second Tackle (brannik) alone: grimsby +1.8 (se 0.3, fires 14%), reading +2.9 (se 0.3, fires 27%) (target lift +2 to +12, fires in >= 20% of matches, both clubs) / lift outside +2..+12 on grimsby fires under 20% on grimsby
- G1 Signature Quick Throw (tobbin) alone: grimsby +1.4 (se 0.2, fires 26%), reading +1.6 (se 0.3, fires 29%) (target lift +2 to +6, fires in >= 20% of matches, both clubs) / lift outside +2..+6 on grimsby, reading
- G1 Signature Cold Finish (maelis) alone: grimsby +2.3 (se 0.3, fires 12%), reading +6.3 (se 1.1, fires 21%) (target lift +2 to +12, fires in >= 20% of matches, both clubs) /  fires under 20% on grimsby
- G1 Tier-3 node Second Look (A3) alone (other nodes of its lane owned in both arms): grimsby +0.7 (se 0.3, fires 36%), reading -0.1 (se 0.2, fires 13%) (target lift +2 to +12 (admin default band), both clubs) / outside +2..+12 on grimsby, reading. A-systems f flags it as weak (a regret rule)
- G1 Tier-3 node Press Master (D3) alone (other nodes of its lane owned in both arms): grimsby +1.1 (se 0.4, fires 70%), reading +0.8 (se 0.4, fires 83%) (target lift +2 to +12 (admin default band), both clubs) / outside +2..+12 on grimsby, reading. 
- G1 Tier-3 node Captain (S3), captain Tavo (Second Strike) alone (other nodes of its lane owned in both arms): grimsby +2.0 (se 0.2, fires 48%), reading +3.2 (se 0.5, fires 52%) (target lift +2 to +12 (admin default band), both clubs) / outside +2..+12 on grimsby. 
- G1 Level 4 on the 5 pitch players (v Level 3, same lineup): grimsby +1.1 (se 0.4), reading +4.3 (se 1.0); stat rise: mirelle+1 sho tavo+1 pac pip+1 pas kessan+1 pas ondra+1 def (target lift +2 to +12 (admin default band), both clubs) / outside +2..+12
- G1 Club-side Roar cost to Preston: skilled, Preston away v neutral ground (Grimsby, Reading squads of MD1 and MD2): grimsby away -1.8 (se 1.5), Preston Roar at home +5.3, reading away +0.3 (se 1.6), Preston Roar at home +2.4 (target about -2 to -4 (SEASON-SPEC S4 expectation); HIT if -6 to -1) / Preston own Roar worth about +2 (E-bot-season s5) is the home column
- G1 Shootout order is a real puzzle under rule R: best order (look-ahead over the 6 cards) v strongest-first: lincoln: best 30.1, greedy 28.7, strongest-first 28.7, random 22.3 (best - strongest +1.4) / wycombe: best 15.6, greedy 14.6, strongest-first 14.6, random 10.7 (best - strongest +1.0) (target at least 3 points apart (SEASON-SPEC band), both clubs) / A-systems d predicted 7.8 points
- G1 Cup Final win when reached (real 6+6 neutral match + real shootout, best order), by opponent: v lincoln: 74.3 (90 min W 66.3 D 26.4 L 7.3; shootout 30.1) / v wycombe: 67.1 (90 min W 62.6 D 28.6 L 8.8; shootout 15.6) (target 40-55 (SEASON-SPEC band)) / opponent-weighted figure is in gate 4
- G1 Whole new player v default lineup (stats + Trait + move, Level 2), each of the 8: dessa: grimsby +6.3, reading +4.5 / yenna: grimsby +3.4, reading +4.0 / ruvo: grimsby +11.9, reading +24.8 / veska: grimsby +3.4, reading -7.1 / brannik: grimsby +9.4, reading +6.9 / tobbin: grimsby +7.2, reading +9.3 / maelis: grimsby +10.5, reading +37.5 / orlo: grimsby +12.1, reading +21.3 (target B-economy g row 8: +3 to +12, none over +12) / outside the band: ruvo reading +24.8; veska reading -7.1; maelis reading +37.5; orlo grimsby +12.1; orlo reading +21.3
- G2 Hard MD2 reading (H), skilled, expected squad, Diamond: W 57.6 D 28.9 L 13.4; GF 1.19 GA 0.50; 0-0 10.3%; random-card W 20.7 (target 52 +-5) / 0.6 over the band
- G2 Hard MD4 stockport (H), skilled, expected squad, Spear: W 59.6 D 29.4 L 11.0; GF 1.31 GA 0.52; 0-0 10.7%; random-card W 7.7 (target 50 +-5) / 4.6 over the band
- G2 Hard MD5 rotherham (A), skilled, expected squad, Wall: W 58.6 D 31.3 L 10.1; GF 1.41 GA 0.55; 0-0 11.3%; random-card W 6.9 (target 48 +-5) / 5.6 over the band
- G2 Hard MD6 wycombe (H), skilled, expected squad, Wall: W 61.9 D 27.9 L 10.2; GF 1.42 GA 0.51; 0-0 11.5%; random-card W 5.7 (target 46 +-5) / 10.9 over the band
- G2 Hard MD7 lincoln (A), skilled, expected squad, Wall: W 52.5 D 32.3 L 15.2; GF 1.28 GA 0.62; 0-0 10.0%; random-card W 6.4 (target 42 +-5) / 5.5 over the band
- G2 Rotherham MD5 as in data.js (10 / 9 / 10: attack 10 breaks its slow-attack style), skilled, Wall: W 61.0 D 28.8 L 10.3; 0-0 10.4% (target 48 +-5, attack <= 8) / current data row; attack is 10, not <= 8
- G2 Rotherham RETUNE SUGGESTION 1 (lands in 43-53 (best formation, 1000 seeds) with the lowest 0-0): DEF 11 / keeper 11 / attack 8 (Diamond): W 49.4 D 43.4 L 7.3; 0-0 38.0%; GF 0.75 GA 0.16; random-card 8.0 (target MD5 skilled within 5 of 48 (43-53), DEF up to 12, attack <= 8, 0-0 < 20, random-card < half) / lands in the band but 0-0 is 38.0% (over 20)
- G2 Rotherham RETUNE SUGGESTION 2 (0-0 under 20 and closest to 48): DEF 11 / keeper 10 / attack 8 (Wall): W 69.5 D 26.8 L 3.8; 0-0 20.3%; GF 1.22 GA 0.16; random-card 13.8 (target MD5 skilled within 5 of 48 (43-53), DEF up to 12, attack <= 8, 0-0 < 20, random-card < half) / win % 69.5 is outside 43-53
- G4 Season 1 top 2, skilled, expected squad, Hard (real SD.season table + other results, Preston results sampled from engine batches): 67.2 %; mean pts 14.2; champion preston 40, lincoln 32, wycombe 19, rotherham 4, stockport 2, reading 2, bolton 1, grimsby 0 (target 45-60 %)
- G4 Cup Final win when reached (real neutral match + real shootout, best order), skilled expected squad, Hard: 72.3 % (1944 of 2688); opponent share lincoln 51 (win 75), wycombe 32 (win 62), rotherham 8 (win 71), stockport 4 (win 92), reading 4 (win 99), bolton 2 (win 96), grimsby 0 (win 100); shootouts won 21 % of 694 (target 40-55 %)
- G6 Season 1 pulls with results mix 55/25/20 and 40/30/30 (real applyMatch pay, recordMatchday, Cup gate + Cup pay, endSeason E4); loss streak of 7: 55/25/20 7.43, 40/30/30 5.99 (20/30/50 info 4.62); 7 losses -> 4 pulls (target mean 6-8 each; loss streak of 7 gives exactly 4 pulls) / Cup result is a coin at the mix win share; E-bot-season measured a median of 5 pulls by the Cup (SEASON-SPEC E9 MISS 6-8): this row re-checks it through the real pay code
- G7 Every odds chip within 1.2 points of 4000 seeded duels (attack and defence states, home / away / neutral, Level 1, no nodes: no reroll effects): 18 states, worst 1.44 pt, 1 over 1.2 (target max /chip - freq/ <= 1.2 pt (SE of a 4000-trial freq is 0.8 pt)) / home/grimsby/T4/attack: chip 72.2 v 71.0 (d 1.20); away/reading/T12/attack: chip 41.7 v 40.2 (d 1.44)

## Rotherham retune suggestion (MD5, DEF up to 12, attack <= 8, land skilled within 5 of 48 on Hard)

Rotherham RETUNE SUGGESTION 1 (lands in 43-53 (best formation, 1000 seeds) with the lowest 0-0): DEF 11 / keeper 11 / attack 8 (Diamond): W 49.4 D 43.4 L 7.3; 0-0 38.0%; GF 0.75 GA 0.16; random-card 8.0. lands in the band but 0-0 is 38.0% (over 20) [MISS]

Grid (Wall, MD5 expected squad, 300 seeds a cell; DEF 8-12 x keeper 9-12 x attack 6-8; W% / 0-0%): 12/11/8 48.3/37.3, 8/12/7 46.3/49.0, 8/12/6 46.0/53.0, 11/11/8 51.7/35.0, 10/12/7 44.0/54.0, 12/12/6 43.7/55.7, 10/12/6 43.3/56.3, 9/12/6 43.0/55.7, 9/12/7 43.0/54.7, 12/12/7 43.0/52.3, 12/11/7 53.7/43.3, 10/11/8 54.3/35.0, 8/11/8 54.7/37.0, 11/12/7 41.3/55.3. NO cell with attack <= 8 lands in 43-53 AND keeps 0-0 under 20: the expected squad is too strong for a low-attack club unless 0-0 is allowed above 20 (see suggestion rows).

## Gate table


### Gate 1: new content, one item at a time (8 Signatures, 3 tier-3 nodes, Level 4, club-side Roar, rule R, fire rates)

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| Signature Sidestep (dessa) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +2.7 (se 0.4, fires 21%), reading +1.5 (se 0.5, fires 14%) | 4000+4000 paired x 2 clubs | MISS | lift outside +2..+12 on reading fires under 20% on reading |
| Signature Hold Up (yenna) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +0.3 (se 0.4, fires 13%), reading +1.0 (se 0.3, fires 10%) | 1500+1500 paired x 2 clubs | MISS | lift outside +2..+12 on grimsby, reading fires under 20% on grimsby, reading |
| Signature Follow Up (ruvo) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +1.9 (se 0.4, fires 33%), reading +1.9 (se 0.3, fires 50%) | 4000+4000 paired x 2 clubs | MISS | lift outside +2..+12 on grimsby, reading |
| Signature Twin Run (veska) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby -2.0 (se 1.0, fires 58%), reading -10.5 (se 1.6, fires 94%) second Shoots 0.73/1.60 a match; IF the second Shoot could be declined (bot sets m.played, API has no decline): grimsby +0.5 (se 0.5), reading +0.9 (se 0.5) | 1500+1500 paired x 2 clubs | MISS | lift outside +2..+12 on grimsby, reading |
| Signature Second Tackle (brannik) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +1.8 (se 0.3, fires 14%), reading +2.9 (se 0.3, fires 27%) | 4000+4000 paired x 2 clubs | MISS | lift outside +2..+12 on grimsby fires under 20% on grimsby |
| Signature Quick Throw (tobbin) alone | lift +2 to +6, fires in >= 20% of matches, both clubs | grimsby +1.4 (se 0.2, fires 26%), reading +1.6 (se 0.3, fires 29%) | 4000+4000 paired x 2 clubs | MISS | lift outside +2..+6 on grimsby, reading |
| Signature Cold Finish (maelis) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +2.3 (se 0.3, fires 12%), reading +6.3 (se 1.1, fires 21%) | 4000+1500 paired x 2 clubs | MISS |  fires under 20% on grimsby |
| Signature Call for Ball (orlo) alone | lift +2 to +12, fires in >= 20% of matches, both clubs | grimsby +8.1 (se 1.2, fires 96%), reading +7.9 (se 1.4, fires 95%) Orlo played from deck/discard 3.91/4.20 a match | 1500+1500 paired x 2 clubs | HIT |  |
| Tier-3 node Second Look (A3) alone (other nodes of its lane owned in both arms) | lift +2 to +12 (admin default band), both clubs | grimsby +0.7 (se 0.3, fires 36%), reading -0.1 (se 0.2, fires 13%) | 1500+1500 paired x 2 clubs | MISS | outside +2..+12 on grimsby, reading. A-systems f flags it as weak (a regret rule) |
| Tier-3 node Press Master (D3) alone (other nodes of its lane owned in both arms) | lift +2 to +12 (admin default band), both clubs | grimsby +1.1 (se 0.4, fires 70%), reading +0.8 (se 0.4, fires 83%) | 1500+1500 paired x 2 clubs | MISS | outside +2..+12 on grimsby, reading.  |
| Tier-3 node Captain (S3), captain Tavo (Second Strike) alone (other nodes of its lane owned in both arms) | lift +2 to +12 (admin default band), both clubs | grimsby +2.0 (se 0.2, fires 48%), reading +3.2 (se 0.5, fires 52%) | 4000+1500 paired x 2 clubs | MISS | outside +2..+12 on grimsby.  |
| Level 4 on the 5 pitch players (v Level 3, same lineup) | lift +2 to +12 (admin default band), both clubs | grimsby +1.1 (se 0.4), reading +4.3 (se 1.0); stat rise: mirelle+1 sho tavo+1 pac pip+1 pas kessan+1 pas ondra+1 def | 1500+1500 paired x 2 clubs | MISS | outside +2..+12 |
| Club-side Roar mirror in the engine (m.roar, kick-off by home side) | away: only the club gets Roar, club kicks off half 1; home: only Preston; neutral: nobody | Roar mirrored correctly, kick-off correct. grimsby: roar seen away me/opp 0/950, home 1737/0, neutral 0/0; kick-off half1 away {"me":0,"opp":2000} home {"me":2000,"opp":0} neutral {"me":2000,"opp":0}, half2 away {"me":2000,"opp":0} / reading: roar seen away me/opp 0/995, home 1775/0, neutral 0/0; kick-off half1 away {"me":0,"opp":2000} home {"me":2000,"opp":0} neutral {"me":2000,"opp":0}, half2 away {"me":2000,"opp":0} / lincoln: roar seen away me/opp 0/1753, home 1265/0, neutral 0/0; kick-off half1 away {"me":0,"opp":2000} home {"me":2000,"opp":0} neutral {"me":2000,"opp":0}, half2 away {"me":2000,"opp":0} | 2000+2000+2000 x 3 modes | HIT |  |
| Club-side Roar cost to Preston: skilled, Preston away v neutral ground (Grimsby, Reading squads of MD1 and MD2) | about -2 to -4 (SEASON-SPEC S4 expectation); HIT if -6 to -1 | grimsby away -1.8 (se 1.5), Preston Roar at home +5.3, reading away +0.3 (se 1.6), Preston Roar at home +2.4 | 2000+2000 paired | MISS | Preston own Roar worth about +2 (E-bot-season s5) is the home column |
| Club-side Roar on a real away day: Lincoln MD7 squad, away v neutral | information (expect -2 to -4) | away -6.9 (se 1.5), win % away 54.3 v neutral 61.2 v home 62.5 | 2000 paired | INFO |  |
| Shootout order is a real puzzle under rule R: best order (look-ahead over the 6 cards) v strongest-first | at least 3 points apart (SEASON-SPEC band), both clubs | lincoln: best 30.1, greedy 28.7, strongest-first 28.7, random 22.3 (best - strongest +1.4) / wycombe: best 15.6, greedy 14.6, strongest-first 14.6, random 10.7 (best - strongest +1.0) | 4224 shootouts + 4576 shootouts | MISS | A-systems d predicted 7.8 points |
| Rule R lift on the Cup shootout (R on v off, same level matches and dice streams), 2 clubs | R should cost a blind order and a good order little: report. Expect strongest-first to fall most | lincoln: best order -0.1, strongest-first -1.7, random -0.7 / wycombe: best order -0.0, strongest-first -0.9, random -0.2 | 4224+4576 shootouts | INFO | rule R is a puzzle, not a power item: a lift near 0 for the best order is the intended shape |
| Cup Final win when reached (real 6+6 neutral match + real shootout, best order), by opponent | 40-55 (SEASON-SPEC band) | v lincoln: 74.3 (90 min W 66.3 D 26.4 L 7.3; shootout 30.1) / v wycombe: 67.1 (90 min W 62.6 D 28.6 L 8.8; shootout 15.6) | 2000+2000 matches | MISS | opponent-weighted figure is in gate 4 |
| Fire rate table (full-new-content lineup, Hard, skilled) | information | grimsby: A1 52 A3 2 D1 53 D2 19 D3 58 SIG_BRANNIK 6 SIG_MAELIS 25 SIG_ORLO 24 T_KEEPER 7 T_WINGER 57 / reading: A1 54 A3 6 D1 73 D2 20 D3 96 SIG_BRANNIK 10 SIG_MAELIS 41 SIG_ORLO 32 T_KEEPER 27 T_WINGER 35 | 800 x 2 clubs | INFO |  |
| Whole new player v default lineup (stats + Trait + move, Level 2), each of the 8 | B-economy g row 8: +3 to +12, none over +12 | dessa: grimsby +6.3, reading +4.5 / yenna: grimsby +3.4, reading +4.0 / ruvo: grimsby +11.9, reading +24.8 / veska: grimsby +3.4, reading -7.1 / brannik: grimsby +9.4, reading +6.9 / tobbin: grimsby +7.2, reading +9.3 / maelis: grimsby +10.5, reading +37.5 / orlo: grimsby +12.1, reading +21.3 | 800 paired x 2 clubs x 8 | MISS | outside the band: ruvo reading +24.8; veska reading -7.1; maelis reading +37.5; orlo grimsby +12.1; orlo reading +21.3 |

### Gate 2: club ladder on HARD (SEASON-SPEC section 3), Grimsby DEF 5, Rotherham retune

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| data.js club rows = SEASON-SPEC section 3 HARD table (Grimsby 5 / 7 / 7 ... Lincoln 8 / 10 / 10), clubFor Hard = data, engine m.cs = club | no difference | 0 differences (7 clubs, Hard, data -> clubFor -> engine) | - | HIT |  |
| Hard MD1 grimsby (H), skilled, expected squad, Spear | 60 +-5 (MD1 may sit about 54) | W 54.9 D 30.8 L 14.3; GF 1.19 GA 0.55; 0-0 11.3%; random-card W 10.9 | 2000 (+1500 rc) | HIT |  |
| Hard MD2 reading (H), skilled, expected squad, Diamond | 52 +-5 | W 57.6 D 28.9 L 13.4; GF 1.19 GA 0.50; 0-0 10.3%; random-card W 20.7 | 2000 (+1500 rc) | MISS | 0.6 over the band |
| Hard MD3 bolton (A), skilled, expected squad, Diamond | 52 +-5 | W 54.4 D 33.0 L 12.6; GF 1.58 GA 0.91; 0-0 5.6%; random-card W 15.9 | 2000 (+1500 rc) | HIT |  |
| Hard MD4 stockport (H), skilled, expected squad, Spear | 50 +-5 | W 59.6 D 29.4 L 11.0; GF 1.31 GA 0.52; 0-0 10.7%; random-card W 7.7 | 2000 (+1500 rc) | MISS | 4.6 over the band |
| Hard MD5 rotherham (A), skilled, expected squad, Wall | 48 +-5 | W 58.6 D 31.3 L 10.1; GF 1.41 GA 0.55; 0-0 11.3%; random-card W 6.9 | 2000 (+1500 rc) | MISS | 5.6 over the band |
| Hard MD6 wycombe (H), skilled, expected squad, Wall | 46 +-5 | W 61.9 D 27.9 L 10.2; GF 1.42 GA 0.51; 0-0 11.5%; random-card W 5.7 | 2000 (+1500 rc) | MISS | 10.9 over the band |
| Hard MD7 lincoln (A), skilled, expected squad, Wall | 42 +-5 | W 52.5 D 32.3 L 15.2; GF 1.28 GA 0.62; 0-0 10.0%; random-card W 6.4 | 2000 (+1500 rc) | MISS | 5.5 over the band |
| Random-card bot under half of skilled at every matchday (Hard) | rc W < skilled W / 2 at all 7 | MD1 10.9 v 54.9, MD2 20.7 v 57.6, MD3 15.9 v 54.4, MD4 7.7 v 59.6, MD5 6.9 v 58.6, MD6 5.7 v 61.9, MD7 6.4 v 52.5 | 1500 each | HIT |  |
| 0-0 at full time under 20% at every matchday (expected squad, Hard) | < 20 each | MD1 11.3, MD2 10.3, MD3 5.6, MD4 10.7, MD5 11.3, MD6 11.5, MD7 10.0 | 2000 each | HIT | max 11.5 |
| Diagnostic: same ladder with the E-bot-season squad (SP capped at 7, so no tier-3 nodes), Hard | information (where the bands were tuned) | MD1 55.9 (-1.0 with tier 3), MD2 61.3 (-3.7 with tier 3), MD3 54.9 (-0.5 with tier 3), MD4 61.9 (-2.2 with tier 3), MD5 61.4 (-2.8 with tier 3), MD6 60.7 (+1.2 with tier 3), MD7 49.9 (+2.7 with tier 3) | 1500 each | INFO | difference = what tier-3 nodes add (MD7 only: D3 bought at SP 10; at SP 9 nothing new fits) |
| Rotherham MD5 as in data.js (10 / 9 / 10: attack 10 breaks its slow-attack style), skilled, Wall | 48 +-5, attack <= 8 | W 61.0 D 28.8 L 10.3; 0-0 10.4% | 2000 | MISS | current data row; attack is 10, not <= 8 |
| Rotherham RETUNE SUGGESTION 1 (lands in 43-53 (best formation, 1000 seeds) with the lowest 0-0): DEF 11 / keeper 11 / attack 8 (Diamond) | MD5 skilled within 5 of 48 (43-53), DEF up to 12, attack <= 8, 0-0 < 20, random-card < half | W 49.4 D 43.4 L 7.3; 0-0 38.0%; GF 0.75 GA 0.16; random-card 8.0 | 2000 (+1500 rc) | MISS | lands in the band but 0-0 is 38.0% (over 20) |
| Rotherham RETUNE SUGGESTION 2 (0-0 under 20 and closest to 48): DEF 11 / keeper 10 / attack 8 (Wall) | MD5 skilled within 5 of 48 (43-53), DEF up to 12, attack <= 8, 0-0 < 20, random-card < half | W 69.5 D 26.8 L 3.8; 0-0 20.3%; GF 1.22 GA 0.16; random-card 13.8 | 2000 (+1500 rc) | MISS | win % 69.5 is outside 43-53 |

### Gate 3: NORMAL and EASY (never measured before)

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| Normal stats: MD2-7 DEF and keeper -1 v Hard (MD1 same), engine m.cs = club | SEASON-SPEC S10 | 0 differences | - | HIT |  |
| Normal MD1 grimsby (H), skilled, expected squad, Wall | no band (never measured): report; Hard band 60 | W 54.4 D 33.1 L 12.5; 0-0 19.9%; random-card W 13.6; vs Hard -0.5 | 1333 (+800 rc) | INFO |  |
| Normal MD2 reading (H), skilled, expected squad, Diamond | no band (never measured): report; Hard band 52 | W 75.5 D 18.8 L 5.8; 0-0 3.8%; random-card W 30.9; vs Hard +17.9 | 1333 (+800 rc) | INFO |  |
| Normal MD3 bolton (A), skilled, expected squad, Wall | no band (never measured): report; Hard band 52 | W 66.8 D 25.8 L 7.4; 0-0 2.3%; random-card W 20.9; vs Hard +12.4 | 1333 (+800 rc) | INFO |  |
| Normal MD4 stockport (H), skilled, expected squad, Spear | no band (never measured): report; Hard band 50 | W 79.0 D 17.0 L 4.0; 0-0 4.4%; random-card W 15.9; vs Hard +19.3 | 1333 (+800 rc) | INFO |  |
| Normal MD5 rotherham (A), skilled, expected squad, Wall | no band (never measured): report; Hard band 48 | W 73.6 D 21.3 L 5.1; 0-0 4.4%; random-card W 9.0; vs Hard +14.9 | 1333 (+800 rc) | INFO |  |
| Normal MD6 wycombe (H), skilled, expected squad, Wall | no band (never measured): report; Hard band 46 | W 79.4 D 15.8 L 4.9; 0-0 4.5%; random-card W 10.0; vs Hard +17.5 | 1333 (+800 rc) | INFO |  |
| Normal MD7 lincoln (A), skilled, expected squad, Diamond | no band (never measured): report; Hard band 42 | W 70.3 D 21.0 L 8.7; 0-0 3.5%; random-card W 14.0; vs Hard +17.7 | 1333 (+800 rc) | INFO |  |
| Normal: 0-0 under 20% at every matchday | < 20 each | MD1 19.9, MD2 3.8, MD3 2.3, MD4 4.4, MD5 4.4, MD6 4.5, MD7 3.5 | - | HIT |  |
| Normal mean skilled win % MD1-7 v Hard | information (M's first season tells where Normal should sit) | Normal 71.3 v Hard 57.1 (+14.2) | - | INFO |  |
| Easy stats: MD2-7 DEF and keeper -2 v Hard (MD1 -1), engine m.cs = club | SEASON-SPEC S10 | 0 differences | - | HIT |  |
| Easy MD1 grimsby (H), skilled, expected squad, Wall | no band (never measured): report; Hard band 60 | W 75.0 D 19.1 L 5.9; 0-0 7.4%; random-card W 26.5; vs Hard +20.1 | 1333 (+800 rc) | INFO |  |
| Easy MD2 reading (H), skilled, expected squad, Diamond | no band (never measured): report; Hard band 52 | W 85.9 D 11.9 L 2.2; 0-0 1.5%; random-card W 47.4; vs Hard +28.3 | 1333 (+800 rc) | INFO | random-card is not under half of skilled |
| Easy MD3 bolton (A), skilled, expected squad, Diamond | no band (never measured): report; Hard band 52 | W 79.1 D 17.6 L 3.3; 0-0 1.3%; random-card W 36.3; vs Hard +24.7 | 1333 (+800 rc) | INFO |  |
| Easy MD4 stockport (H), skilled, expected squad, Diamond | no band (never measured): report; Hard band 50 | W 92.5 D 6.4 L 1.1; 0-0 2.0%; random-card W 40.6; vs Hard +32.8 | 1333 (+800 rc) | INFO |  |
| Easy MD5 rotherham (A), skilled, expected squad, Wall | no band (never measured): report; Hard band 48 | W 81.5 D 14.6 L 3.9; 0-0 1.7%; random-card W 15.3; vs Hard +22.9 | 1333 (+800 rc) | INFO |  |
| Easy MD6 wycombe (H), skilled, expected squad, Wall | no band (never measured): report; Hard band 46 | W 88.3 D 9.5 L 2.3; 0-0 1.6%; random-card W 15.6; vs Hard +26.4 | 1333 (+800 rc) | INFO |  |
| Easy MD7 lincoln (A), skilled, expected squad, Diamond | no band (never measured): report; Hard band 42 | W 82.2 D 14.3 L 3.5; 0-0 1.7%; random-card W 24.4; vs Hard +29.7 | 1333 (+800 rc) | INFO |  |
| Easy: 0-0 under 20% at every matchday | < 20 each | MD1 7.4, MD2 1.5, MD3 1.3, MD4 2.0, MD5 1.7, MD6 1.6, MD7 1.7 | - | HIT |  |
| Easy mean skilled win % MD1-7 v Hard | information (M's first season tells where Normal should sit) | Easy 83.5 v Hard 57.1 (+26.4) | - | INFO |  |

### Gate 4: season 1 (real table, real shootout)

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| Season 1 top 2, skilled, expected squad, Hard (real SD.season table + other results, Preston results sampled from engine batches) | 45-60 % | 67.2 %; mean pts 14.2; champion preston 40, lincoln 32, wycombe 19, rotherham 4, stockport 2, reading 2, bolton 1, grimsby 0 | 4000 seasons from 2000 matches x 7 MDs | MISS |  |
| Season 1 top 2, never pulls (levels and nodes only), Hard | at least 20 % | 20.8 %; mean pts 10.3 | 4000 seasons | HIT |  |
| Cup Final win when reached (real neutral match + real shootout, best order), skilled expected squad, Hard | 40-55 % | 72.3 % (1944 of 2688); opponent share lincoln 51 (win 75), wycombe 32 (win 62), rotherham 8 (win 71), stockport 4 (win 92), reading 4 (win 99), bolton 2 (win 96), grimsby 0 (win 100); shootouts won 21 % of 694 | 2688 finals | MISS |  |
| Cup Final reached AND won per season (information) | information | reached 67.2 %, won 48.6 % of seasons; never-pull reached 20.8 %, won 7.4 % | 4000 seasons | INFO |  |
| Lincoln top 2 in the 8-club table (skilled Preston) | 50-75 % | 59.9 % (never-pull Preston: 72.0 %) | 4000 seasons | HIT |  |
| No club wins the league over 60 % (skilled Preston) | <= 60 % each | preston 39.9, lincoln 32.3, wycombe 19.1, rotherham 3.8, stockport 2.1, reading 1.8, bolton 0.9, grimsby 0.0 | 4000 seasons | HIT |  |
| 0-0 under 20 % with the expected squad (all 7 MDs, Hard) | < 20 each | MD1 11.3, MD2 10.3, MD3 5.6, MD4 10.7, MD5 11.3, MD6 11.5, MD7 10.0 | 2000 each | HIT | a bare (never levels, no nodes, no pulls) squad: MD1 19.0, MD2 16.7, MD3 8.3, MD4 25.5, MD5 10.5, MD6 11.0, MD7 6.7 (expected to miss at the late clubs: E-bot-season) |

### Gate 5: season 2 under S8

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| Season 2 under S8 (clubs +1 DEF, keeper, attack, max 12): Preston top 2, skilled, squad = 12 real pulls, Level 4, all 8 nodes, Hard | no band yet: report | top 2 79.7 %; Cup reached 79.7 %, won 45.5 % of seasons, won when reached 57.1 %; mean pts 15.8; champion preston 57.1, lincoln 23.4, wycombe 14.6, rotherham 3.5, stockport 0.9, reading 0.4, bolton 0.2; pull players owned after 12 pulls 4.9 of 13 | 4000 seasons over 16 pull paths | INFO | Season 2 is NOT tuned (SEASON-SPEC S8) |
| Cup within 2 seasons, skilled (S1 Cup win + S2 Cup win) | 55-75 % (old band, MISS 90.8 % under the v0 rule; no band for S8) | 72.0 % (S1 48.6 %, S2 45.5 %) | season 1 sim + 4000 | HIT | not a gate under S8; shown against the old band for comparison |

### Gate 6: pulls (B-economy section g rows 1-6 and 10)

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| Tier frequency over seeded pulls from pull 2, pity on | Common 50-54, Rare 27-30, Epic 13.5-16, Legend 4.2-5.6 (SIM 52.0 / 28.4 / 14.8 / 4.9) | Common 52.1, Rare 28.3, Epic 14.8, Legend 4.7 | 198000 pulls (2000 careers) | HIT |  |
| Pity: longest run of pulls with no Epic or Legend; with no Legend | never over 10; never over 30 | Epic+ run 9, Legend run 29 | 198000 pulls | HIT |  |
| Pity pull picks an unowned player when one exists in that rarity | 100 % of pity pulls | 9494 of 9494 (0 breaches) | 9494 pity pulls | HIT |  |
| Each Rare / Epic / Legend player's share inside its rarity over normal (non-pity) rolls | each within 1 point of equal (Rare 20, Epic 20, Legend 33.3) | lio 20.1, joss 19.8, dessa 20.1, yenna 20.0, ruvo 20.0, zefa 20.2, hadro 20.1, veska 20.1, brannik 19.7, tobbin 19.9, ysolde 33.3, maelis 33.8, orlo 32.9 | 85257 non-pity non-Common rolls | HIT |  |
| Common roll never lands on a 5-pip starter while another is under 5; pays 25 only when all 7 are maxed | 0 breaches | 0 breaches in 103249 Common rolls (43999 pips, 59250 paid 25; 500 all-maxed careers) | 103249 Common rolls | HIT |  |
| Season 1 pulls with results mix 55/25/20 and 40/30/30 (real applyMatch pay, recordMatchday, Cup gate + Cup pay, endSeason E4); loss streak of 7 | mean 6-8 each; loss streak of 7 gives exactly 4 pulls | 55/25/20 7.43, 40/30/30 5.99 (20/30/50 info 4.62); 7 losses -> 4 pulls | 2000 seasons x 3 mixes + 1 | MISS | Cup result is a coin at the mix win share; E-bot-season measured a median of 5 pulls by the Cup (SEASON-SPEC E9 MISS 6-8): this row re-checks it through the real pay code |
| Save and replay: pull n = rng(seed, n); same pulls after a JSON save and reload; Coins, pity, owned, pull log restored | identical over 100 seeds | 0 of 100 differ | 100 seeds x 24 pulls | HIT |  |

### Gate 7: slice gates that still apply, replay and save / reload

| Gate | Target | Measured | Seeds | HIT/MISS | Note |
|---|---|---|---|---|---|
| d6 table reproduced from the 36 pairs (SD.odds.table, 10 gaps) | 2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2 | all 10 equal; 2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2 | 36 pairs | HIT |  |
| SD.odds.attWins / duel v independent rule (nat 6 v 1 wins, nat 1 v 6 loses, ties to defender) | 0 mismatches | 0 mismatches in 1296 pair-checks (gap -8..9, both tie flags) | 36 pairs x 36 gaps | HIT |  |
| Shootout kick chip (SD.shootout.pairOdds) v 36-pair enumeration, gap halved toward zero, tie to kicker unless rule R | 0 mismatches | 0 mismatches in 288 stat pairs x 2 tie rules | 36 pairs | HIT |  |
| Every resolved duel re-derived from its Event: win = rule(gap, dice) (Level 1, no nodes; fx-altered duels skipped) | 0 mismatches | 0 of 4320 (0 fx-altered skipped) | 360 matches (home / away / neutral x 3 clubs) | HIT |  |
| Chip parts sum to the shown total, gap = total - opp total (+stance), both sides, all 3 modes (club-side Roar included) | 0 mismatches | 0 in 4320 events | 360 matches (home / away / neutral x 3 clubs) | HIT |  |
| Attack chip equals 36-pair enumeration of its own gap and Press weight (exact, 1e-9) | 0 mismatches | 0 of 2371 shown chips | 360 matches (home / away / neutral x 3 clubs) | HIT |  |
| Cap +3 on d6 respected on every attack (bonus over stat <= 3, incl. Pass +2 and Roar) | max +3 | 0 breaches in 4320 events | 360 matches (home / away / neutral x 3 clubs) | HIT |  |
| Hand is 3 cards on every turn without Fourth Card (and Twin Run second plays keep 3) | 3 | 0 turns with another size | 360 matches (home / away / neutral x 3 clubs) | HIT |  |
| Every odds chip within 1.2 points of 4000 seeded duels (attack and defence states, home / away / neutral, Level 1, no nodes: no reroll effects) | max /chip - freq/ <= 1.2 pt (SE of a 4000-trial freq is 0.8 pt) | 18 states, worst 1.44 pt, 1 over 1.2 | 18 states x 4000 | MISS | home/grimsby/T4/attack: chip 72.2 v 71.0 (d 1.20); away/reading/T12/attack: chip 41.7 v 40.2 (d 1.44) |
| Same chips with Level 2 Traits and nodes A1 D1 owned (once-per-match rerolls: Second Strike, Big Read, Rebound, Hold Firm ...) | information: the chip is the base 36-pair odds; rerolls add on top | 18 states, worst 15.83 pt, 5 over 1.2; states off by over 1.2: home/grimsby/T4/defend: chip 84.2 v 91.8 (d 7.66); home/reading/T6/attack: chip 72.2 v 74.0 (d 1.75); away/grimsby/T5/defend: chip 21.9 v 30.7 (d 8.76); away/reading/T1/defend: chip 24.2 v 34.5 (d 10.38); away/reading/T12/attack: chip 41.7 v 57.5 (d 15.83) | 18 states x 4000 | INFO | if the shipped design says the chip must include rerolls this is a MISS; slice chip text counts base odds only |
| A seed replays identically (full event log + summary; 3 modes x 4 policies, new Signatures, tier-3 nodes, Orlo, Veska fielded) | identical | 0 of 72 replays differ | 72 seeds x2 | HIT |  |
| Save and reload identical: setup as plain JSON + recorded inputs replays the same match (home / away / neutral Cup) | identical | 0 of 24 differ; shootout replay 0 of 4 differ | 24 matches | HIT |  |

## Method and limits

- Policies: skilled = port of the slice `dp` policy (value tables from getDP6, odds from previewAttack / previewDefend, uses Sharp Eye and Second Look when the information is worth it, Fresh Hand, Twin Run second Shoot, Call for Ball via SD.engine.attackCards). The value tables do not model club-side Roar, Hold Up, Follow Up or Quick Throw (the engine applies them, the policy does not plan around them), so skilled is slightly below a perfect player there. random / rc / ro / staller as in tests/squad-duel/bot.js.
- Shootout order policies: `best` = exhaustive order of the kicks still to come with rule R chained and Second Strike odds (maximises expected goals), `greedy` = highest chip now, `strong` = strongest first and blind to rule R, `rand`.
- Expected squad per matchday = E-bot-season section 3 (Level 1/1, 2/1, 2/1, 3/2 ... Cup 4/2; Lio replaces Tavo from MD2, Zefa replaces Pip at MD7, E-bot-season star pips) with SP floor 3, 4, 6, 7, 9, 10, 12 buying D1 D2 S1 S2 A1 D3 A3 S3 in that order while they fit. Formation per matchday re-selected on independent seeds. Season sims sample Preston's score from engine batches and run the real SD.season table, other results, Cup gate and Cup record.
- Pull-path squads for season 2 come from the real gacha (12 pulls, 16 paths), best owned per role, S1 pulls Level 4, S2 pulls Level 3.
- Seeds: first pass of each lift uses 1500 paired seeds; a lift within 2 se of a band edge is re-run at 4000. Win-rate rows use 2000. Smallest counts that answer each row; a full sweep is for release.
- Re-run: `node tests/squad-duel/bot-season.js` (everything) or `--only=sig,nodes3,lvl4,roar,ruler,fire,player,ladder,retune,ladderN,season,season2,pulls,odds,resolve,chip,replay`; `--report` rewrites this file from saved rows (/tmp/sd-bot/rows).
