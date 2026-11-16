// Toss wheel ring (CONTRACT-A sec 5 row shape). 10 slices, w = 1.0 each (10%), sum 10.000.
// Random mean 2.50: 30% none, 40% +2.5, 30% +5.
const NONE = 'No boost, +1 Spoke';
const KIND = [NONE, NONE, NONE, '+2.5%', '+5%', '+2.5%', '+2.5%', '+5%', '+5%', '+2.5%'];

export const TOSS_SLICES = Object.freeze(KIND.map((label, id) => {
  const value = label === NONE ? 0 : label === '+2.5%' ? 2.5 : 5;
  const tier = value === 0 ? 'low' : value === 5 ? 'top' : 'mid';
  return Object.freeze({ id, w: 1.0, value, label, tier, gold: value === 5 });
}));
