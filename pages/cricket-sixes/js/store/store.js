// @ts-check
// Tiny store. State is plain JSON; commands are pure (state, payload) -> new state.
import { applyCommand } from './commands.js';

export const V4_SUFFIX = '.v4bak';

/**
 * v5 migration safety (SPEC s7, D): keep ONE copy of the raw v4 save under key + '.v4bak'. Call after a load that
 * reported from === 4 and before the first save() overwrites the key. Never replaces an existing copy; never throws.
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}|null} storage
 * @param {string} key the save key (cs.save.1) @param {number} from version the load migrated from
 * @returns {boolean} true when a copy was written
 */
export function keepV4Copy(storage, key, from) {
  try {
    if (!storage || from !== 4 || storage.getItem(key + V4_SUFFIX) != null) return false;
    const raw = storage.getItem(key);
    if (raw == null || JSON.parse(raw).v !== 4) return false;
    storage.setItem(key + V4_SUFFIX, raw);
    return true;
  } catch (e) { return false; }
}

/**
 * @param {any} [state] initial state (null until a NewMatch is dispatched)
 */
export function createStore(state = null) {
  let s = state;
  /** @type {Set<(s:any)=>void>} */
  const subs = new Set();
  return {
    get: () => s,
    /** @param {string} cmd @param {any} [payload] */
    dispatch(cmd, payload = {}) {
      const next = applyCommand(s, cmd, payload);
      if (next === s) return s;
      s = next;
      subs.forEach((fn) => fn(s));
      return s;
    },
    /** @param {(s:any)=>void} fn @returns {() => void} unsubscribe */
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
