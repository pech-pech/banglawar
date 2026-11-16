// @ts-check
// Hype dial in the store (S0 Z1, owner T3).
import { effective } from '../../core/wheelmeta.js';
import { hypeDialFor } from '../../core/wheels/hype.js';
import { modsFor } from '../../core/wheels/common.js';
import { actLedgerFor, otherSpeed } from './common.js';

/** The Hype dial for this fixture's match day (Fans, activity ledger, tree). @param {any} s */
export function hypeDialOf(s) { return hypeDialFor(s.econ ? s.econ.fans : 0, actLedgerFor(s), otherSpeed(modsFor(effective(s), 'hype'), s)); }
