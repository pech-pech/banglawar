// @ts-check
// Tiny store. State is plain JSON; commands are pure (state, payload) -> new state.
import { applyCommand } from './commands.js';

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
