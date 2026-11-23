(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // Source: CONTENT-SHEET v4 (sections 1-7, 6b); SLICE-SPEC.md wins on numbers. Stats order PAC/PAS/SHO/DEF, v2 defaults.
  const P = (id, name, role, rarity, pac, pas, sho, def, num, look, sig, starter) =>
    ({ id, name, role, rarity, pac, pas, sho, def, num, look, sig: sig || null, starter: !!starter });

  const PLAYERS = [
    P('tavo', 'Tavo', 'Striker', 'Common', 4, 3, 6, 2, 9, '#9, spiky red-blond hair, hands on hips', null, true),
    P('mirelle', 'Mirelle', 'Playmaker', 'Common', 4, 6, 4, 3, 8, '#8, long braid, arms wide calling for ball', null, true),
    P('pip', 'Pip', 'Winger', 'Common', 6, 4, 3, 3, 11, '#11, tiny, curly hair, mid-sprint lean', null, true),
    P('sunniva', 'Sunniva', 'Winger', 'Common', 5, 5, 3, 4, 7, '#7, shaved side, captain armband, fists up', null, true),
    P('kessan', 'Kessan', 'Anchor', 'Common', 3, 3, 2, 6, 5, '#5, broad, beard, arms folded', null, true),
    P('barro', 'Barro', 'Anchor', 'Common', 3, 4, 2, 5, 4, '#4, bald, round glasses strap, shoulder charge', null, true),
    P('ondra', 'Ondra', 'Keeper', 'Common', 3, 3, 1, 6, 1, '#1, long sleeves, headband, crouch with gloves open', null, true),
    P('lio', 'Lio', 'Striker', 'Rare', 5, 4, 7, 3, 10, '#10, messy fringe, eyes closed, mid-volley',
      { id: 'SIG_LIO', name: 'Dream Volley', text: 'Lio may Shoot from Midfield (normally Attack only); Build still counts' }),
    P('joss', 'Joss', 'Anchor', 'Rare', 4, 4, 3, 8, 3, '#3, tall, cropped hair, slide-tackle pose',
      { id: 'SIG_JOSS', name: 'Sweep Across', notBotChecked: true, text: 'On a defending turn you may play Joss as your card even if he is in the deck or discard, not only in your hand; if you lose that duel the ball stays in its zone. No number' }),
    P('zefa', 'Zefa', 'Winger', 'Epic', 8, 5, 5, 3, 14, '#14, high ponytail with blue tie, glow-edge frame, mid-leap',
      { id: 'SIG_ZEFA', name: 'Wing Switch', text: 'Her won Dribble moves the ball 2 zones, not 1' }),
    P('hadro', 'Hadro', 'Playmaker', 'Epic', 5, 7, 6, 4, 6, '#6, grey streak, finger raised to temple',
      { id: 'SIG_HADRO', name: 'Read the Run', text: "For his next 2 turns (may cross half-time) the opponent's exact stance and attack pick are shown before you choose" }),
    P('ysolde', 'Ysolde', 'Keeper', 'Legend', 4, 6, 3, 9, 1, '#1, gold gloves, long cape-like kit trim, animated crest, leaning dive',
      { id: 'SIG_YSOLDE', name: 'Last Hand', text: 'When a shot against you would score, reroll your Save d6 once and keep the new roll' }),
    P('dessa', 'Dessa', 'Winger', 'Rare', 7, 4, 6, 2, 17, '#17, short fringe, yellow boots, cutting-inside lean',
      { id: 'SIG_DESSA', name: 'Sidestep', text: 'A tie on a duel where Dessa is the attacker and plays Dribble or Shoot goes to her' }),
    P('yenna', 'Yenna', 'Playmaker', 'Rare', 4, 7, 5, 3, 16, '#16, round glasses, low ponytail, one arm out shielding the ball',
      { id: 'SIG_YENNA', name: 'Hold Up', text: 'When Yenna loses an attack duel in your Defence or Midfield zone, you keep the ball in that zone (no turnover)' }),
    P('ruvo', 'Ruvo', 'Striker', 'Rare', 3, 4, 8, 3, 18, '#18, big frame, shaved head, arms up at the penalty spot',
      { id: 'SIG_RUVO', name: 'Follow Up', text: "When Ruvo's Shoot is saved, the ball stays in your Attack zone and you keep the turn (no turnover)" }),
    P('veska', 'Veska', 'Winger', 'Epic', 7, 5, 8, 2, 20, '#20, green sleeves, glow-edge frame, mid-stride shooting stance',
      { id: 'SIG_VESKA', name: 'Twin Run', text: "After Veska's Dribble wins in Midfield, you may play a second hand card this turn, as a Shoot only" }),
    P('brannik', 'Brannik', 'Anchor', 'Epic', 3, 5, 2, 9, 2, '#2, thick beard, red captain tape, sliding block',
      { id: 'SIG_BRANNIK', name: 'Second Tackle', perHalf: true, text: 'Once per half (twice a match): reroll your d6 on a defending duel where Brannik is your card, keep the new roll' }),
    P('tobbin', 'Tobbin', 'Keeper', 'Epic', 3, 5, 1, 8, 13, '#13, orange kit, wide cap, one-arm throw',
      { id: 'SIG_TOBBIN', name: 'Quick Throw', perHalf: true, text: 'Once per half: after you save a shot, your ball starts in your Midfield instead of your Defence' }),
    P('maelis', 'Maelis', 'Striker', 'Legend', 6, 4, 9, 3, 99, '#99, silver boots, animated flame crest, spinning volley',
      { id: 'SIG_MAELIS', name: 'Cold Finish', text: "A tie on Maelis's Shoot goes to her" }),
    P('orlo', 'Orlo', 'Playmaker', 'Legend', 4, 9, 6, 4, 10, '#10, gold armband, animated crest, hands conducting',
      { id: 'SIG_ORLO', name: 'Call for Ball', text: 'On an attacking turn you may play Orlo as your card even if he is in the deck or discard' })
  ];
  const BY_ID = {};
  PLAYERS.forEach(p => { BY_ID[p.id] = p; });

  const NODES = [
    { id: 'A1', tab: 'attack', tier: 1, cost: 1, name: 'Sharp Eye', text: "Once per match, you see the opponent's exact stance (no blur) for one turn", chip: 'Sharp Eye: Press', req: null, fork: null, active: true },
    { id: 'A2', tab: 'attack', tier: 2, cost: 2, name: 'Keep the Thread', text: 'After a lost duel on attack you keep your Build pips', chip: 'Keep the Thread: Build kept (2)', req: 'A1', fork: 'AD2', active: true },
    { id: 'D1', tab: 'defence', tier: 1, cost: 1, name: 'Rebound', text: 'Once per match, reroll your d6 in one defending duel', chip: 'Rebound: rerolled 2 to 5', req: null, fork: null, active: true },
    { id: 'D2', tab: 'defence', tier: 2, cost: 2, name: 'Last Man', text: 'Once per match, a tie on a duel where I am the ATTACKER goes to me', chip: 'Last Man: tie to Tavo', req: 'D1', fork: 'AD2', active: true },
    { id: 'S1', tab: 'squad', tier: 1, cost: 1, name: 'Fresh Hand', text: 'Once per match, between turns, discard your whole hand and draw 3 (costs no turn; fewer than 3 in the deck: draw them, then reshuffle the discard and draw the rest)', chip: 'Fresh Hand ready', req: null, fork: null, active: true },
    { id: 'S2', tab: 'squad', tier: 2, cost: 2, name: 'Fourth Card', text: 'Your hand is 4 cards for the whole match (draw up to 4 after each play)', chip: 'hand of 4', req: 'S1', fork: null, active: true },
    // tier 3 (A-systems f): need the lane's tier-1 node AND any one tier-2 node (reqAny)
    { id: 'A3', tab: 'attack', tier: 3, cost: 3, name: 'Second Look', text: 'Once per match, after you chose a card and an action and saw the odds chip, you may take the pick back: choose another card from your hand and its action. The first card stays in your hand', chip: 'Second Look ready', req: 'A1', reqAny: ['A2', 'D2', 'S2'], fork: null, active: true },
    { id: 'D3', tab: 'defence', tier: 3, cost: 3, name: 'Press Master', text: 'Once per match, when you Press and the club plays a Through ball, the -1 from Press does not apply (Press v Through counts 0). Fires by itself', chip: 'Press Master: Press v Through 0', req: 'D1', reqAny: ['A2', 'D2', 'S2'], fork: null, active: false },
    { id: 'S3', tab: 'squad', tier: 3, cost: 3, name: 'Captain', text: 'Pick one lineup player (pitch or bench) before kick-off. At half-time his once-per-match Trait and once-per-match Signature are ready again', chip: 'Captain: armband', req: 'S1', reqAny: ['A2', 'D2', 'S2'], fork: null, active: false }
  ];

  // CONTENT-SHEET 4b, tiers 4-5 only (greyed, not playable); tier 3 is live in NODES. Tier-2 alternates listed for completeness at tier 2.
  const LOCKED_TREE = [
    { tier: 4,
      attack: { name: 'Long Range', text: 'Shoot allowed from Midfield for anyone, once' },
      defence: { name: 'Sweeper', text: 'A lost duel in Defence zone moves the ball nowhere, once' },
      squad: { name: 'Scout Net', text: "Scout line also shows the opponent's top card" } },
    { tier: 5,
      attack: { name: 'Finisher', text: 'After 2 goals, +1 bonus on Shoot (capstone, only numeric node; counts toward cap +3)' },
      defence: { name: 'Fortress', text: 'After a save, ball goes to your Midfield' },
      squad: { name: 'Big Day', text: 'Home Roar needs 2 Crowd, not 3' } }
  ];

  const TRAITS = {
    Playmaker: { id: 'T_PLAYMAKER', name: 'Spare Ball', text: 'After my won Pass, draw 1 extra card this turn (hand of 4 until I play; after that play no redraw, so the hand falls back to 3; with Fourth Card the hand is 5 for that turn)' },
    Winger: { id: 'T_WINGER', name: 'Quick Feet', text: 'Dribble ignores Press once' },
    Striker: { id: 'T_STRIKER', name: 'Second Strike', text: 'Once per match, reroll my d6 on a Shoot (keep the new roll)' },
    Anchor: { id: 'T_ANCHOR', name: 'Hold Firm', text: 'First lost duel each match, ball stays' },
    Keeper: { id: 'T_KEEPER', name: 'Big Read', text: "Once per match, the first shot that would score against me has the shooter's d6 re-rolled (new roll counts; can stack with Ysolde's Last Hand)" }
  };

  const TWEAK_DEFAULTS = {
    die: 6, halfTurns: 6, handSize: 3, cap: 3, passBonus: 2, buildMax: 2, formCounter: 3, roarAt: 3,
    tellOn: true, coarseChip: false, flatterStarters: false, reducedMotion: false, autoNext: true,
    // Clubs (HARD table, SEASON-SPEC s3; Rotherham 10/9/10 for now, bot may retune)
    c_grimsby_def: 5, c_grimsby_keeper: 7, c_grimsby_atk: 7,
    c_reading_def: 5, c_reading_keeper: 9, c_reading_atk: 9,
    c_bolton_def: 6, c_bolton_keeper: 7, c_bolton_atk: 10,
    c_stockport_def: 7, c_stockport_keeper: 10, c_stockport_atk: 9,
    c_rotherham_def: 10, c_rotherham_keeper: 9, c_rotherham_atk: 10,
    c_wycombe_def: 9, c_wycombe_keeper: 10, c_wycombe_atk: 10,
    c_lincoln_def: 8, c_lincoln_keeper: 10, c_lincoln_atk: 10,
    trailShift: 0.1,
    // Season
    difficulty: 1, seasonGrow: 1, clubMax: 12, otherBase: 0.30, otherTS: 0.03, otherHome: 0.04, otherChances: 4, otherMin: 0.05, otherMax: 0.75,
    normalDrop: 1, easyDrop: 1, cupWinPay: 300, cupLossPay: 100, place34Pay: 50, cupMatchWin: 100, cupMatchLoss: 50,
    shootKicks: 3, oppKickBonus: 2, ruleR: true,
    // Pulls
    openingCoins: 100, openingSP: 3, pullCost: 100, starterRare: 70, starterEpic: 25, starterLegend: 5,
    pityEpic: 10, pityLegend: 30, commonCoins: 25, pityUnowned: true, xpGoal: 10, xpDuel: 3, xpWin: 20, respecCost: 50,
    fxOff: {}
  };

  // admin default: labels, groups, min/max/step ranges (spec gives only the defaults)
  const M = (key, label, group, min, max, step, type) => ({ key, label, group, min, max, step, type: type || 'num' });
  const B = (key, label, group) => ({ key, label, group, min: 0, max: 1, step: 1, type: 'bool' });
  const TWEAK_META = [
    M('die', 'Die sides', 'Rules', 4, 8, 1),
    M('halfTurns', 'Turns per half', 'Rules', 2, 10, 1),
    M('handSize', 'Hand size', 'Rules', 2, 5, 1),
    M('cap', 'Attacker bonus cap', 'Rules', 1, 5, 1),
    M('passBonus', 'Pass bonus', 'Rules', 0, 4, 1),
    M('buildMax', 'Build max', 'Rules', 0, 4, 1),
    M('formCounter', 'Formation counter', 'Rules', 0, 5, 1),
    M('roarAt', 'Crowd needed for Roar', 'Rules', 1, 5, 1),
    B('tellOn', 'Defender tell on', 'Rules'),
    B('coarseChip', 'Coarse odds chip', 'Rules'),
    B('flatterStarters', 'Flatter starters preset', 'Rules'),
    B('reducedMotion', 'Reduced motion', 'Rules'),
    B('autoNext', 'Auto next turn', 'Rules'),
    M('c_grimsby_def', 'Grimsby DEF', 'Clubs', 1, 12, 1),
    M('c_grimsby_keeper', 'Grimsby keeper', 'Clubs', 1, 12, 1),
    M('c_grimsby_atk', 'Grimsby attack', 'Clubs', 1, 12, 1),
    M('c_reading_def', 'Reading DEF', 'Clubs', 1, 12, 1),
    M('c_reading_keeper', 'Reading keeper', 'Clubs', 1, 12, 1),
    M('c_reading_atk', 'Reading attack', 'Clubs', 1, 12, 1),
    M('c_bolton_def', 'Bolton DEF', 'Clubs', 1, 12, 1),
    M('c_bolton_keeper', 'Bolton keeper', 'Clubs', 1, 12, 1),
    M('c_bolton_atk', 'Bolton attack', 'Clubs', 1, 12, 1),
    M('c_stockport_def', 'Stockport DEF', 'Clubs', 1, 12, 1),
    M('c_stockport_keeper', 'Stockport keeper', 'Clubs', 1, 12, 1),
    M('c_stockport_atk', 'Stockport attack', 'Clubs', 1, 12, 1),
    M('c_rotherham_def', 'Rotherham DEF', 'Clubs', 1, 12, 1),
    M('c_rotherham_keeper', 'Rotherham keeper', 'Clubs', 1, 12, 1),
    M('c_rotherham_atk', 'Rotherham attack', 'Clubs', 1, 12, 1),
    M('c_wycombe_def', 'Wycombe DEF', 'Clubs', 1, 12, 1),
    M('c_wycombe_keeper', 'Wycombe keeper', 'Clubs', 1, 12, 1),
    M('c_wycombe_atk', 'Wycombe attack', 'Clubs', 1, 12, 1),
    M('c_lincoln_def', 'Lincoln DEF', 'Clubs', 1, 12, 1),
    M('c_lincoln_keeper', 'Lincoln keeper', 'Clubs', 1, 12, 1),
    M('c_lincoln_atk', 'Lincoln attack', 'Clubs', 1, 12, 1),
    M('trailShift', 'Trailing shift', 'Clubs', 0, 0.3, 0.05),
    { key: 'difficulty', label: 'Difficulty', group: 'Season', type: 'choice', options: ['Easy', 'Normal', 'Hard'], min: 0, max: 2, step: 1 },
    M('seasonGrow', 'Club growth per season', 'Season', 0, 3, 1),
    M('clubMax', 'Club stat max', 'Season', 8, 15, 1),
    M('otherBase', 'Other results base chance', 'Season', 0.1, 0.5, 0.01),
    M('otherTS', 'Other results per TS point', 'Season', 0, 0.08, 0.005),
    M('otherHome', 'Other results home bonus', 'Season', 0, 0.15, 0.01),
    M('otherChances', 'Other results chances', 'Season', 1, 8, 1),
    M('otherMin', 'Other results min chance', 'Season', 0, 0.3, 0.01),
    M('otherMax', 'Other results max chance', 'Season', 0.5, 1, 0.01),
    M('normalDrop', 'Normal: DEF and keeper drop', 'Season', 0, 3, 1),
    M('easyDrop', 'Easy: further drop', 'Season', 0, 3, 1),
    M('cupWinPay', 'Cup won season pay', 'Season', 0, 1000, 10),
    M('cupLossPay', 'Cup lost season pay', 'Season', 0, 500, 10),
    M('place34Pay', '3rd or 4th season pay', 'Season', 0, 300, 10),
    M('cupMatchWin', 'Cup match win pay', 'Season', 0, 500, 10),
    M('cupMatchLoss', 'Cup match loss pay', 'Season', 0, 500, 10),
    M('shootKicks', 'Shootout kicks each', 'Season', 1, 7, 1),
    M('oppKickBonus', 'Club kick bonus', 'Season', 0, 4, 1),
    B('ruleR', 'Kick order rule R', 'Season'),
    M('openingCoins', 'Opening Coins', 'Economy', 0, 300, 10),
    M('openingSP', 'Opening Skill Points', 'Economy', 0, 6, 1),
    M('pullCost', 'Pull cost', 'Pulls', 0, 300, 10),
    M('starterRare', 'Starter pull Rare %', 'Pulls', 0, 100, 5),
    M('starterEpic', 'Starter pull Epic %', 'Pulls', 0, 100, 5),
    M('starterLegend', 'Starter pull Legend %', 'Pulls', 0, 100, 5),
    M('pityEpic', 'Epic pity (pulls)', 'Pulls', 1, 30, 1),
    M('pityLegend', 'Legend pity (pulls)', 'Pulls', 1, 60, 1),
    M('commonCoins', 'Common roll Coins (all maxed)', 'Pulls', 0, 100, 5),
    B('pityUnowned', 'Pity picks unowned player', 'Pulls'),
    M('xpGoal', 'XP per goal', 'Progress', 0, 30, 1),
    M('xpDuel', 'XP per duel won', 'Progress', 0, 10, 1),
    M('xpWin', 'XP per win', 'Progress', 0, 60, 1),
    M('respecCost', 'Respec cost', 'Progress', 0, 200, 10)
  ];

  SD.data = {
    PLAYERS,
    byId: function (pid) { return BY_ID[pid]; },
    FLATTER: {
      tavo: { pac: 5, pas: 2, sho: 6, def: 2 },
      mirelle: { pac: 3, pas: 6, sho: 5, def: 3 },
      pip: { pac: 6, pas: 5, sho: 3, def: 2 },
      kessan: { pac: 2, pas: 5, sho: 1, def: 6 }
    },
    DEFAULT_LINEUP: { keeper: 'ondra', outfield: ['kessan', 'mirelle', 'pip', 'tavo'], bench: ['barro', 'sunniva'] },
    POOL: ['lio', 'joss', 'dessa', 'yenna', 'ruvo', 'zefa', 'hadro', 'veska', 'brannik', 'tobbin', 'ysolde', 'maelis', 'orlo'], // 5 Rare, 5 Epic, 3 Legend
    CLUBS: {
      preston: { id: 'preston', name: 'Proud Preston', label: 'PRESTON', home: true, ts: 5, kit: { a: '#F2F4F8', b: '#1B2A5C' } }, // admin default: Preston ts 5 (not used by the other-results sim, which only simulates the 3 non-Preston fixtures)
      grimsby: { id: 'grimsby', name: 'Iron Grimsby', label: 'GRIMSBY', style: 'Iron Dock', def: 5, keeper: { name: 'Garrick', def: 7 }, atk: 7,
        weights: { pass: 0.30, dribble: 0.50, through: 0.20 }, offPress: 0.30, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Brogan', zone: 0, press: 0.30 }, { name: 'Dunmar', zone: 1, press: 0.60 }, { name: 'Corwin', zone: 2, press: 0.20 }],
        scout: 'Iron Grimsby: sit deep, Dribble about 5 in 10. They mostly Drop, but their midfield man steps up.',
        ts: 2, kit: { a: '#FF8A1F', b: '#2B2F36' }, hint: 'Brogan: Press 30 / Drop 70. Pick the advance he will not counter.' },
      reading: { id: 'reading', name: 'Restless Reading', label: 'READING', style: 'High Press', def: 5, keeper: { name: 'Neve', def: 9 }, atk: 9,
        weights: { pass: 0.20, dribble: 0.25, through: 0.55 }, offPress: 0.65, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Wenna', zone: 0, press: 0.70 }, { name: 'Fenric', zone: 1, press: 0.40 }, { name: 'Isken', zone: 2, press: 0.80 }],
        scout: 'Restless Reading: press high, Through ball about 5 or 6 in 10. They mostly Press, but their midfield man sits back.',
        ts: 5, kit: { a: '#22C7E8', b: '#0D3B8C' }, hint: 'The best advance changes by zone: Press 70 at the back, 40 in midfield.' },
      bolton: { id: 'bolton', name: 'Bold Bolton', label: 'BOLTON', style: 'Patient Pass', def: 6, keeper: { name: 'Ruvane', def: 7 }, atk: 10,
        weights: { pass: 0.50, dribble: 0.25, through: 0.25 }, offPress: 0.65, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Halric', zone: 0, press: 0.65 }, { name: 'Jorun', zone: 1, press: 0.70 }, { name: 'Verrin', zone: 2, press: 0.60 }],
        scout: 'Bold Bolton: patient build, Pass about 5 in 10. They mostly Press, at the back and in midfield.',
        ts: 4, kit: { a: '#E8419B', b: '#4A1236' }, hint: 'Away: no Roar for you, they have the crowd. Through from every zone.' },
      stockport: { id: 'stockport', name: 'Stormy Stockport', label: 'STOCKPORT', style: 'Storm Break', def: 7, keeper: { name: 'Hesper', def: 10 }, atk: 9,
        weights: { pass: 0.10, dribble: 0.30, through: 0.60 }, offPress: 0.43, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Dacre', zone: 0, press: 0.25 }, { name: 'Embrik', zone: 1, press: 0.75 }, { name: 'Quillon', zone: 2, press: 0.30 }],
        scout: 'Stormy Stockport: break fast, Through ball about 6 in 10 and hardly any Pass. They mostly Drop, but their midfield man steps up.',
        ts: 5, kit: { a: '#9BE12B', b: '#1E3A0C' }, hint: 'They hardly Pass: their attack is Dribble or Through. Diamond pays.' },
      rotherham: { id: 'rotherham', name: 'Steel Rotherham', label: 'ROTHERHAM', style: 'Steel Wall', def: 10, keeper: { name: 'Yarrow', def: 9 }, atk: 10,
        weights: { pass: 0.45, dribble: 0.35, through: 0.20 }, offPress: 0.25, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Mordane', zone: 0, press: 0.25 }, { name: 'Kolvan', zone: 1, press: 0.35 }, { name: 'Thessaly', zone: 2, press: 0.15 }],
        scout: 'Steel Rotherham: slow and tight, Pass about 4 or 5 in 10. They mostly Drop, and their back line is hard to beat.',
        ts: 6, kit: { a: '#E5383B', b: '#5F6B73' }, hint: 'A wall: Pass first to build, then advance. Away, so no Roar for you.' },
      wycombe: { id: 'wycombe', name: 'Wild Wycombe', label: 'WYCOMBE', style: 'Wild Swing', def: 9, keeper: { name: 'Zandor', def: 10 }, atk: 10,
        weights: { pass: 0.25, dribble: 0.50, through: 0.25 }, offPress: 0.62, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Lyrel', zone: 0, press: 0.85 }, { name: 'Pashka', zone: 1, press: 0.15 }, { name: 'Nimue', zone: 2, press: 0.85 }],
        scout: 'Wild Wycombe: swing wide, Dribble about 5 in 10. Their back man nearly always Presses, but their midfield man nearly always Drops.',
        ts: 8, kit: { a: '#8F6BFF', b: '#261A55' }, hint: 'Read every zone as the opposite: Press 85 at the back, 15 in midfield.' },
      lincoln: { id: 'lincoln', name: 'Royal Lincoln', label: 'LINCOLN', style: 'Royal Flow', def: 8, keeper: { name: 'Eldric', def: 10 }, atk: 10,
        weights: { pass: 0.30, dribble: 0.35, through: 0.35 }, offPress: 0.53, // admin default: offPress = mean of 3 zone presses
        defenders: [{ name: 'Valdis', zone: 0, press: 0.35 }, { name: 'Rhoswen', zone: 1, press: 0.65 }, { name: 'Caldris', zone: 2, press: 0.60 }],
        scout: 'Royal Lincoln: no weak side, Dribble and Through about 3 or 4 in 10 each. Their back man mostly Drops, but their midfield man mostly Presses.',
        ts: 9, kit: { a: '#FFD23F', b: '#6E1030' }, hint: 'No easy answer: stack small edges to the cap, shoot with a full bonus.' }
    },
    FIXTURES: ['grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'], // = SEASON.order (old code)
    SEASON: {
      order: ['grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'],
      home: [true, true, false, true, false, true, false],
      clubs: ['preston', 'grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'],
      // A-systems a: fixture 0 = Preston's, then the 3 simulated (fixture no 1-3); h = home side
      fixtures: [
        [{ h: 'preston', a: 'grimsby' }, { h: 'reading', a: 'lincoln' }, { h: 'wycombe', a: 'bolton' }, { h: 'rotherham', a: 'stockport' }],
        [{ h: 'preston', a: 'reading' }, { h: 'bolton', a: 'grimsby' }, { h: 'stockport', a: 'lincoln' }, { h: 'wycombe', a: 'rotherham' }],
        [{ h: 'bolton', a: 'preston' }, { h: 'reading', a: 'stockport' }, { h: 'grimsby', a: 'rotherham' }, { h: 'lincoln', a: 'wycombe' }],
        [{ h: 'preston', a: 'stockport' }, { h: 'rotherham', a: 'bolton' }, { h: 'wycombe', a: 'reading' }, { h: 'grimsby', a: 'lincoln' }],
        [{ h: 'rotherham', a: 'preston' }, { h: 'stockport', a: 'wycombe' }, { h: 'bolton', a: 'lincoln' }, { h: 'reading', a: 'grimsby' }],
        [{ h: 'preston', a: 'wycombe' }, { h: 'lincoln', a: 'rotherham' }, { h: 'grimsby', a: 'stockport' }, { h: 'bolton', a: 'reading' }],
        [{ h: 'lincoln', a: 'preston' }, { h: 'wycombe', a: 'grimsby' }, { h: 'rotherham', a: 'reading' }, { h: 'stockport', a: 'bolton' }]
      ],
      cupLine: 'Cup Final: neutral ground, so no crowd for either side. One match, and someone must win.'
    },
    FORMATIONS: {
      Wall: { defVs: { dribble: 3 }, att: {}, text: '+3 to my defending duel against Dribble' },
      Diamond: { defVs: { through: 3 }, att: { pass: 1 }, text: '+3 to my defending duel against Through ball, +1 to my Pass' },
      Spear: { defVs: {}, att: { dribble: 1, shoot: 1 }, text: '+1 to my Dribble and +1 to my Shoot' }
    },
    NODES,
    LOCKED_TREE,
    TRAITS,
    XP: { duelWon: 3, goal: 10, assist: 5, save: 8, win: 20, draw: 12, loss: 12, benchShare: 0.5, levels: [0, 30, 80, 150] },
    PAY: { opening: { coins: 100, sp: 3 }, later: { W: { coins: 100, sp: 2 }, D: { coins: 70, sp: 1 }, L: { coins: 50, sp: 1 } },
      cup: { W: { coins: 100, sp: 2 }, L: { coins: 50, sp: 1 } }, // E3; shootout win = win pay (A-systems d)
      season: { cupWon: 300, cupLost: 100, place34: 50 } }, // E4, mirrors Tweak cupWinPay/cupLossPay/place34Pay
    PULL: { cost: 100, starter: { Rare: 0.70, Epic: 0.25, Legend: 0.05 }, normal: { Common: 0.55, Rare: 0.30, Epic: 0.12, Legend: 0.03 }, pityEpic: 10, pityLegend: 30, maxStars: 5, dupeCoinsAtMax: 25, commonCoins: 25 },
    TROPHY: [{ id: 'm1', label: 'League match 1' }, { id: 'm2', label: 'League match 2' }, { id: 'more', label: '4 more League matches' }, { id: 'cup', label: 'Cup Final', locked: true }],
    NEXT_GOAL: 'Next goal: win 4 more League matches with your squad to unlock the Cup Final.',
    TWEAK_DEFAULTS,
    TWEAK_META
  };
})();
