# Shaft pick change (beta)
- Cause: T3* took hard rooms only (t13,t16,t17,t19). Crusher rooms need t03 first and share its family, so in 5-room shafts only t17 could fit (100%).
- Rule change: T3* pool = all 8 tier-3 rooms, drawn evenly among those passing the other rules. In shafts with a T3 slot, if no hard room is used yet and one is eligible, T3* draws only from the hard set.
- Kept: first crusher t03, family differs, no crusher after t03, exit rules, seeded determinism. Rest slot pool unchanged (t18,t20,t06,t04); rooms-audit.js now expects that pool.
- Still 0% in 5-room (kept rules force it): t11,t12,t13,t16,t19 (crusher family cannot follow t03; t03 must be in slot 2).
