// Economy numbers (P8). Source: 2026-11-12/data/tuning.json economy.table (sha 8724ddb6), economy.legacy_project, economy.late_sinks,
// economy.transfer_value, recruit.table (WAGE_*; WAGE_K_SQUAD8 7.0 replaces 5.0 for a squad of 8); GAME-DESIGN.md s2 Promotion/Finals, s3 Currencies/Economy.
// Course price: training SPEC s9. Coach wages are gone (coaches are free in the redo).
export const ECON = {
  source: '2026-11-12/data/tuning.json economy + recruit (sha 8724ddb6); GAME-DESIGN.md s3; SPEC s9',
  START_COINS: 1300,
  COIN_MULT: [1.0, 1.6, 2.4, 3.5, 5.0],   // league 1..5 (tuning economy.table.MULT)
  FAN_MULT: [1.0, 1.25, 1.5, 1.75, 2.0],
  CAP: [0, 500, 650, 900, 1250, 1700],     // seats by stadium level (index = level)
  STADIUM_COST: [0, 0, 390, 700, 1050, 1540],
  STADIUM_FANS: [0, 0, 310, 1140, 2400, 4080],
  STADIUM_BUILD: [0, 0, 1, 2, 2, 3],       // matches
  STANDS_CAP_PCT: [0, 0, 10, 20, 30, 40],
  TICKET: 0.27, FILL_BASE: 0.55, FILL_PER_FAN: 0.2, FILL_MAX: 0.95,
  WIN_BONUS: 70,
  SHOP: [0, 6, 12, 22, 34, 50],
  FAN_WIN: 40, FAN_LOSS: 10,
  FAN_STANDS: [0, 5, 10, 15, 20, 25],
  FIN_COINS: { semi: 100, runner: 250, champ: 500 },
  FAN_FIN: { semi: 20, runner: 60, champ: 160 },
  MEDALS: { semi: 1, runner: 2, champ: 4 },
  TP_FIN: { semi: 75, runner: 200, champ: 400 },   // TP is not held in s.econ: see finalsTp()
  GYM_TP: [0, 17, 20, 23, 26, 29],
  FAC: ['stands', 'shop', 'nets', 'gym', 'pitch', 'academy', 'scout'],
  FAC_COST: {
    stands: [0, 0, 365, 600, 1350, 3000],
    shop: [0, 90, 320, 530, 1200, 2700],
    nets: [0, 0, 210, 350, 800, 1800],
    gym: [0, 70, 265, 430, 950, 2150],
    pitch: [0, 120, 390, 650, 1450, 3200],
    academy: [0, 0, 240, 380, 850, 1950],
    scout: [0, 80, 295, 480, 1100, 2450],
  },
  FAC_OPEN: { stands: 1, shop: 2, nets: 1, gym: 1, pitch: 3, academy: 1, scout: 1 }, // stadium level that opens facility level 1
  FAC_START: { stands: 1, shop: 0, nets: 1, gym: 0, pitch: 0, academy: 1, scout: 0 },
  UPKEEP: 1.0,
  RECRUIT: [300, 480, 720, 1050, 1500],   // next-season recruit envelope by league
  // wages: (WAGE_FLOOR + WAGE_K x (avg/WAGE_REF)^WAGE_P) x potFactor once P is revealed
  WAGE_FLOOR: 4, WAGE_K: 7.0, WAGE_P: 2.0, WAGE_REF: 50,
  REVEAL_AFTER_DRILLS: 1,
  POT_FACTOR: [[90, 0.85], [105.5, 0.92], [117.5, 1.0], [131.5, 1.25], [150, 1.5], [185, 2.0]],
  FEE_PER_POINT: 6, RELEASE_REFUND: 0.5, TRANSFER_PCT: 0.5,
  MIN_SQUAD: 6, MISSED_FOR_SALE: 2,
  RESERVE_PAYDAYS: 5, RESERVE_WAGE_PAYDAYS: 3, // 3 = careful policy wage_paydays (tuning economy.table.TYPES.careful)
  LEDGER_MAX: 40,
  COURSE_FACTOR: [1, 1.25, 1.55, 1.95, 2.5], COURSE_BASE: 24, COURSE_PER_STEP: 6,
  MEDAL_SHOP: [
    { id: 'trophy_cabinet', name: 'Trophy Cabinet (gold trim on the stadium)', medals: 1, once: true },
    { id: 'twin_drill', name: 'Twin Spotlight Pass (two players get the Spotlight wheel next training week)', medals: 2 },
    { id: 'clear_sight', name: 'Clear-sight Scout Report (one trip shows exact ratings)', medals: 3 },
    { id: 'wage_holiday', name: 'Wage Holiday (half wages for one season)', medals: 4 },
    { id: 'master_licence', name: 'Master Coach Licence (one coach may take a second course this season)', medals: 6 },
  ],
  SINKS: [
    { id: 'hall_1', name: 'Hall of Fame wing 1', coins: 700, stadium: 4, needs: null },
    { id: 'hall_2', name: 'Hall of Fame wing 2', coins: 1400, stadium: 4, needs: 'hall_1' },
    { id: 'hall_3', name: 'Hall of Fame wing 3', coins: 2400, stadium: 4, needs: 'hall_2' },
    { id: 'floodlights', name: 'Floodlights', coins: 1200, stadium: 5, needs: null },
    { id: 'big_screen', name: 'Big Screen', coins: 1800, stadium: 5, needs: 'floodlights' },
    { id: 'roof_crest', name: 'Stadium Roof and Crest', coins: 2600, stadium: 5, needs: 'big_screen' },
    { id: 'hall_plaque', name: 'Hall plaque', medals: 3, needs: 'hall_1', repeat: 'retired' },
    { id: 'legends_banner', name: 'Legends Banner', medals: 5, needs: 'hall_2' },
    { id: 'coach_retreat', name: 'Coach Retreat Week', coins: 500, stadium: 4, repeat: 'season' },
  ],
  LEGACY: { price: { 4: 8000, 5: 13000 }, fans: 500, segmentsPerTier: 10,
    names: ['Riverside Orchard', 'Village Green Pavilion', 'Sunrise Nets Hall', 'Old Oak Scoreboard', 'Harbour Lights Terrace', 'Meadow Practice Wing',
      'Windmill Bandstand', 'Lantern Walk', 'Hilltop Clock Tower', 'Brookside Gardens', 'Friendship Gate', 'Cricket Green Museum'] },
  TIER_NAMES: ['Local Hero', 'County Name', 'Regional Star', 'National Treasure', 'Cricket Legend'],
};
