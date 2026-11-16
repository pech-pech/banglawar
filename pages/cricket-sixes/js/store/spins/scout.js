// Z2: ScoutSpin (owner T4). Old commands.js case body, plus the new wheel: a payload with stop.sliceId is decided at STOP from the slice table
// (store/wheels/scout.js scoutSliceSpin); no sliceId = the old reveal spin, unchanged.
import { canScoutSpin, scoutSpin as wmScoutSpin } from '../wmstore.js';
import { isSliceStop, scoutSliceSpin } from '../wheels/scout.js';
import { scoutList } from '../../core/training.js';

export const scoutSpin = (s, p) => {
  if (!canScoutSpin(s, () => scoutList(s))) return s;
  return isSliceStop(p) ? scoutSliceSpin(s, p) : wmScoutSpin(s);
};
