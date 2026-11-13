// @ts-check
// Wheel meta tree: constants + the 42 nodes (71 ranks, 3,340 Spokes). Source: team-numbers/02-TREE-V2.md sections 3 and 4
// and sim/wheel_meta_sim_v2.py (TUNE, NODES). Rank k of a node opens at tier >= node.tier + k - 1. Plain data, no logic.
export const WM = {
  TIERS: [10, 25, 50, 100, 200, 350, 500],
  SPOKE_BASE: { spot: 3, course: 5, hype: 1, toss: 1, pep: 1, find: 2, scout: 4, finals: 5 },
  SPOKE_PER_TIER: 1, SPOT_TOKEN_CAP: 2, SWAP_RATE: 2, GUIDE_SD_FACTOR: 0.727, EXTRA_W: 0.75, CONFIRM_AT: 50,
  MATERIALS: ['wood', 'brass', 'steel', 'silver', 'gold', 'star', 'crystal'],
  // sim TUNE values the core reads (not part of the fixed contract)
  UNIT: { spot: 1, course: 1, hype: 1, toss: 1, pep: 0.5, find: 10, scout: 1, finals: 10 }, // one Booster / Floor unit per wheel
  LIFT: [1, 1, 1, 2, 3], LIFT_COURSE: [0, 1], STREAK_MAX: 1, RESPIN_BELOW: { spot: 3, course: 2 },
};
export const WHEEL_IDS = ['spot', 'course', 'hype', 'toss', 'pep', 'find', 'scout', 'finals'];
const ALL = WHEEL_IDS.slice();
const GOLD = ALL.filter((w) => w !== 'toss'); // wheels with a gold slice
const SC = ['spot', 'course'];
/** @param {string} id @param {string} branch @param {number} tier @param {string} name @param {number[]} cost @param {string} type @param {any} per @param {string[]} scope @param {string} words @param {string[]} [requires] */
const N = (id, branch, tier, name, cost, type, per, scope, words, requires = []) =>
  ({ id, branch, tier, name, max_rank: cost.length, cost, requires, effect: { type, per_rank: per, scope }, words });

export const NODES = [
  // Control (Spotlight and Course)
  N('c_slow', 'control', 1, 'Slow Spin', [10, 25, 60], 'w0_mult', -0.15, SC, 'The wheel turns slower, so it is easier to stop where you want.'),
  N('c_steady', 'control', 2, 'Steady Axle', [20, 40], 'wobble_mult', -0.15, SC, 'The wheel wobbles less when it stops.'),
  N('c_zone', 'control', 2, 'Aim Zone', [20], 'window_add_s', 0.2, SC, 'A softer glow shows a good moment to tap.'),
  N('c_chime', 'control', 4, 'Gold Chime', [40], 'aim_cue', 1, SC, 'A little chime rings as gold comes near the pointer.'),
  N('c_guide', 'control', 6, 'Aim Guide', [130], 'preview_mark', 1, SC, 'A small tick shows where the wheel will stop. Your taps get steadier.'),
  // Fortune
  N('f_wide', 'fortune', 2, 'Widener', [15, 30, 60], 'jackpot_width_add', 0.02, ALL, 'The gold slice gets a bit wider on every wheel.'),
  N('f_boost', 'fortune', 2, 'Booster', [15, 30, 60], 'booster_chance', 0.2, ALL, 'Sometimes one slice shines. If you land on it, it pays one more.'),
  N('f_bigb', 'fortune', 4, 'Big Boost', [55, 95], 'booster_value', 1, ALL, 'The shining slice pays even more.', ['f_boost']),
  N('f_extra', 'fortune', 4, 'Extra Gold', [90], 'extra_slice', 1, GOLD, 'A second, smaller gold slice joins the wheel.'),
  N('f_respin', 'fortune', 3, 'Spin Again', [25, 55, 95], 'respin_tokens_per_season', 1, SC, 'One more Spin Again token each season. Spin again and keep the better.'),
  N('f_nudge', 'fortune', 3, 'Nudge', [45], 'nudge_tokens_per_season', 1, ['spot', 'course', 'hype'], 'A Nudge token each season. Slide to the next slice, but never onto gold.'),
  N('f_two', 'fortune', 5, 'Pick Two', [90], 'pick_two_tokens_per_season', 1, SC, 'A Pick Two token each season. Two tries on one spin, keep the better.'),
  N('f_wild', 'fortune', 6, 'Wild Token', [130], 'wild_tokens_per_season', 1, ALL, 'A Wild token each season. It can stand in for any other token.'),
  N('f_floor', 'fortune', 3, 'Kind Floor', [35], 'floor_value', 1, ['spot', 'course', 'hype', 'toss'], 'The smallest slices pay a little more.'),
  N('f_lift', 'fortune', 5, 'Lucky Lift', [130], 'lift_tokens_per_season', 1, SC, 'A Lucky Lift token each season. A bonus that only adds, never above gold.'),
  // Specialist
  N('sp_spot_n', 'specialist', 2, 'Star Pupil', [25, 55], 'jackpot_width_add', 0.02, ['spot'], 'The Spotlight gold slice gets wider.'),
  N('sp_spot_r', 'specialist', 5, 'Hot Streak', [95], 'streak_value', 1, ['spot'], 'Gold right after gold pays one more.'),
  N('sp_crs_n', 'specialist', 2, 'Good Notes', [20, 35], 'jackpot_width_add', 0.02, ['course'], 'The Course gold slice gets wider.'),
  N('sp_crs_r', 'specialist', 5, 'Second Opinion', [70], 'best_of_two', 1, ['course'], 'Every course gets a free second spin. The better one counts.'),
  N('sp_hyp_n', 'specialist', 3, 'Big Voice', [35, 70], 'rare_width_add', 0.08, ['hype'], 'The biggest Hype slice gets wider.'),
  N('sp_hyp_r', 'specialist', 5, 'Home Crowd', [105], 'floor_value', 'low_to_medium', ['hype'], 'The smallest Hype slices pay like a medium one.'),
  N('sp_tos_n', 'specialist', 3, 'Coin Weight', [35, 70], 'rare_width_add', 0.1, ['toss'], 'The winning Toss slices get wider.'),
  N('sp_tos_r', 'specialist', 5, 'Good Sport', [90], 'consolation', 2.5, ['toss'], 'The good sport slice also gives a small boost.'),
  N('sp_pep_n', 'specialist', 3, 'Pep Voice', [35, 70], 'rare_width_add', 0.08, ['pep'], 'The Double Pep slice gets wider.'),
  N('sp_pep_r', 'specialist', 6, 'Pep Rally', [115], 'neighbour_half', 0.5, ['pep'], 'Every Pep result is one and a half times bigger.'),
  N('sp_fnd_n', 'specialist', 3, 'Sharp Eyes', [35, 70], 'rare_width_add', 0.06, ['find'], 'The find slices get wider.'),
  N('sp_fnd_r', 'specialist', 6, 'Second Cheer', [125], 'cheer_respin', 1, ['find'], 'A cheer slice gives one more free spin.'),
  N('sp_sct_n', 'specialist', 4, 'Top Name', [45], 'jackpot_width_add', 0.1, ['scout'], 'The top name gets a wider slice.'),
  N('sp_sct_r', 'specialist', 6, "Scout's Eye", [80], 'floor_value', 'extra_plus_1', ['scout'], 'Even a quiet look finds one step.'),
  N('sp_fin_n', 'specialist', 4, 'Trophy Polish', [45], 'jackpot_width_add', 0.1, ['finals'], 'The trophy slice gets wider.'),
  N('sp_fin_r', 'specialist', 6, 'Prize Pair', [70], 'neighbour_half', 0.5, ['finals'], 'Coins, TP and Fans prizes are one and a half times bigger. Medals stay the same.'),
  // Craft (looks only, carries to the next run)
  N('k_rim', 'craft', 1, 'Rim Paint', [5, 10, 10], 'cosmetic', 'rim', ALL, 'Paint the rim of your wheel.'),
  N('k_hub', 'craft', 1, 'Hub Cap', [5, 10, 10], 'cosmetic', 'hub', ALL, 'A new cap for the middle of the wheel.'),
  N('k_ptr', 'craft', 2, 'Pointer', [10, 10, 15], 'cosmetic', 'pointer', ALL, 'A new pointer.'),
  N('k_tick', 'craft', 2, 'Tick Sounds', [10, 10, 15], 'cosmetic', 'tick_sound', ALL, 'New tick sounds as the wheel turns.'),
  N('k_trail', 'craft', 3, 'Spin Trail', [15, 20], 'cosmetic', 'trail', ALL, 'A bright trail behind the spin.'),
  N('k_pal', 'craft', 3, 'Slice Colours', [15, 20], 'cosmetic', 'palette', ALL, 'New slice colours that are easy to tell apart.'),
  N('k_spoke', 'craft', 4, 'Spoke Shapes', [20, 30], 'cosmetic', 'spoke_shape', ALL, 'New shapes for the spokes.'),
  N('k_burst', 'craft', 4, 'Landing Burst', [20, 30], 'cosmetic', 'landing_fx', ALL, 'A sparkle burst when the wheel lands.'),
  N('k_stand', 'craft', 5, 'Wheel Stand', [30, 45], 'cosmetic', 'stand', ALL, 'A stand for your wheel.'),
  N('k_name', 'craft', 6, 'Showpiece Name', [70], 'cosmetic', 'engraved_name', ALL, 'Engrave a name on your wheel.'),
  N('k_crystal', 'craft', 7, 'Crystal Wheel', [110], 'cosmetic', 'crystal_material', ALL, 'Your wheel turns to crystal.'),
];
