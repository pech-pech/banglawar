// Pep wheel ring (CONTRACT-A sec 5 row shape). 12 slices, sum 10.000, one gold (the 10%).
// Random mean 5.2745. Names are filled by the UI; label is a placeholder '+x%'.
const BOOST = [5, 7.5, 5, 2.5, 2.5, 5, 7.5, 10, 7.5, 5, 2.5, 2.5];
const W_GOLD = 0.96;
const W_REST = (10 - W_GOLD) / 11;

export const PEP_SLICES = Object.freeze(BOOST.map((value, id) => Object.freeze({
  id,
  w: value === 10 ? W_GOLD : W_REST,
  value,
  label: '+' + value + '%',
  tier: value > 5 ? 'top' : value < 5 ? 'low' : 'mid', // SPEC 2f, median 5: 7.5 and 10 top, 5 mid, 2.5 low
  gold: value === 10,
})));

// Which of the six players (1..6) sits on ring index i (0-based) for ring offset 0..5.
export const PEP_SLOT_OF = (i, offset) => (((i + offset) % 6) + 6) % 6 + 1;

export const PEP_MAX_NAME = 10;

// Names over PEP_MAX_NAME chars are cut to the surname (last word).
export function pepName(full) {
  const s = String(full == null ? '' : full).trim();
  if (s.length <= PEP_MAX_NAME) return s;
  const parts = s.split(/\s+/);
  return parts[parts.length - 1];
}
