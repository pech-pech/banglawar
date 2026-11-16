// Z2: ScoutSpin (owner T4). The result is decided at STOP from the slice table (store/wheels/scout.js scoutSliceSpin). A payload with a bad stop (sliceId out of
// range, timing that disagrees with itself) is rejected. No stop (Auto / leave) = a seeded width-weighted draw on the same ring, recorded auto:true.
import { canScoutSpin } from '../wmstore.js';
import { isSliceStop, isBadStop, scoutSliceSpin, scoutAutoStop } from '../wheels/scout.js';
import { scoutList } from '../../core/training.js';

export const scoutSpin = (s, p) => {
  if (!canScoutSpin(s, () => scoutList(s)) || isBadStop(p)) return s;
  return scoutSliceSpin(s, isSliceStop(p) ? p : scoutAutoStop(s));
};
