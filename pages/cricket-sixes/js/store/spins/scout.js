// Z2: ScoutSpin (owner T4). Old commands.js case body.
import { canScoutSpin, scoutSpin as wmScoutSpin } from '../wmstore.js';
import { scoutList } from '../../core/training.js';

export const scoutSpin = (s) => (canScoutSpin(s, () => scoutList(s)) ? wmScoutSpin(s) : s);
