import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_MS } from '../js/ui/over-panel.js';
test('over panel plays one ball every 400 ms', () => { assert.equal(BALL_MS, 400); });
