// @ts-check
// Rival style tags (P9). Source: 2026-11-12/data/tuning.json ladder.calendar.tags (sha d4fc8393) and data/incoming/p9_values.json (names, kit colours).
// A tag adds its rating offsets to every player of the rival club (clamped 1-99). Flavour plus a hint: no ball term, the rival AI is unchanged.
// bowler_mix (spin_town, pace_attack) is not applied yet: the tuning marks it optional.
export const TAGS = {
  bat_heavy: { bp: 6, bs: 3, spd: -4, bsk: -4, chip: "Bat-heavy", hint: "Big hitters, soft bowling. Protect the field; the plan that wins is steady." },
  spin_town: { bp: 0, bs: 0, spd: -4, bsk: 4, chip: "Spin town", hint: "Spin everywhere. Keep your batters steady, lead with your own spin." },
  pace_attack: { bp: 0, bs: 0, spd: 4, bsk: -4, chip: "Pace attack", hint: "Fast bowlers. Bat steady early, attack late." },
  grinders: { bp: -8, bs: 4, spd: 0, bsk: 0, chip: "Grinders", hint: "Hard to get out, slow to score. Hunt wickets, bat steady." },
};

/** Three named, tagged rivals per league (they replace AI clubs c1..c3). Kit = [main, trim]. */
export const TAGGED_RIVALS = {
  1: [
    { name: "Pebble Lane Pups", tag: 'bat_heavy', kit: ['#E8B923', '#2A5C8A'] },
    { name: "Marsh End Mallards", tag: 'spin_town', kit: ['#2F8F5B', '#F2EAD0'] },
    { name: "Tin Roof Tigers", tag: 'grinders', kit: ['#C4452D', '#2B2B2B'] },
  ],
  2: [
    { name: "Kettle Hill Kites", tag: 'pace_attack', kit: ['#7A3E9D', '#F4D35E'] },
    { name: "Old Mill Otters", tag: 'grinders', kit: ['#8B5A2B', '#9FD3C7'] },
    { name: "Lantern Bay Larks", tag: 'bat_heavy', kit: ['#E07A5F', '#1D3557'] },
  ],
  3: [
    { name: "Copper Ridge Crows", tag: 'spin_town', kit: ['#B87333', '#1B1B1B'] },
    { name: "Quarry Park Quokkas", tag: 'pace_attack', kit: ['#4D908E', '#F9C74F'] },
    { name: "Saltmarsh Swifts", tag: 'bat_heavy', kit: ['#264653', '#E9C46A'] },
  ],
  4: [
    { name: "Windmill Wanderers", tag: 'grinders', kit: ['#6C757D', '#F28482'] },
    { name: "Foxglove Falcons", tag: 'pace_attack', kit: ['#9B2226', '#EEE5D8'] },
    { name: "Harbour Lane Herons", tag: 'spin_town', kit: ['#0A9396', '#FFDD99'] },
  ],
  5: [
    { name: "Granite Gate Giants", tag: 'bat_heavy', kit: ['#3D405B', '#F2CC8F'] },
    { name: "Thistle Down Thunder", tag: 'pace_attack', kit: ['#5E548E', '#E0B1CB'] },
    { name: "Ironbridge Ibis", tag: 'grinders', kit: ['#CA6702', '#001219'] },
  ],
};
