// Shared helper (not a test file): the v7 save fixture, loaded through the live load path (platform/save.js -> unwrap -> migrate).
import { readFileSync } from 'node:fs';
import { createSave, KEY } from '../js/platform/save.js';

export const V7_PATH = new URL('./fixtures/v7-save.json', import.meta.url);
export const v7Text = () => readFileSync(V7_PATH, 'utf8');

/** Migrated state of the fixture, via createSave(storage).load(): exactly what the app does at startup. Throws if it does not load. */
export function loadV7() {
  const text = v7Text(), mem = new Map([[KEY, text]]);
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
  const r = createSave(storage).load();
  if (!r.state) throw new Error('v7 fixture did not load: ' + r.reason);
  return r.state;
}
