// @ts-check
// Toss reveal in the store (S0 Z1, owner T3).
import { effective } from '../../core/wheelmeta.js';
import { revealWheel } from '../../core/wheels/reveal.js';
import { modsFor } from '../../core/wheels/common.js';

export const tossWheelOf = (/** @type {any} */ s) => revealWheel('toss', modsFor(effective(s), 'toss'));
