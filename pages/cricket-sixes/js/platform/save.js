// @ts-check
// The only game file that touches localStorage for game state (js/report keeps its own key).
// Key cs.save.1 plus a .bak holding the save before this one. Every call is caught: private mode, quota, no storage.
import { wrap, unwrap } from '../core/save-migrate.js';

export const KEY = 'cs.save.1';
export const BAK = 'cs.save.1.bak';

/** Browser storage, or null when blocked. */
function browserStorage() {
  try { const s = window.localStorage; s.getItem(KEY); return s; } catch (e) { return null; }
}

/** @param {any} [storage] defaults to window.localStorage; pass null for none (tests, private mode) */
export function createSave(storage = browserStorage()) {
  let blocked = false; // a newer-version save is on disk: never overwrite it
  const get = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return undefined; } };
  const put = (k, v) => { try { storage.setItem(k, v); return true; } catch (e) { return false; } };

  return {
    /**
     * @param {{newGame?:(seed:any)=>any}} [deps]
     * @returns {{state:any, source:'main'|'bak'|'none', from?:number, reason?:string}}
     */
    load(deps) {
      if (!storage) return { state: null, source: 'none', reason: 'unavailable' };
      const main = get(KEY), bak = get(BAK);
      if (main === undefined) return { state: null, source: 'none', reason: 'unavailable' };
      let reason = main == null ? 'empty' : undefined;
      for (const [text, source] of /** @type {const} */ ([[main, 'main'], [bak, 'bak']])) {
        if (text == null) continue;
        const r = unwrap(text, deps);
        if (r.ok) return { state: r.state, source, from: r.from };
        if (r.reason === 'newer') { blocked = true; return { state: null, source: 'none', reason: 'newer' }; }
        reason = reason || r.reason;
      }
      return { state: null, source: 'none', reason: reason || 'empty' };
    },
    /** @returns {boolean} true when written */
    save(state) {
      if (!storage || blocked) return false;
      try {
        const text = JSON.stringify(wrap(state));
        const prev = get(KEY);
        if (prev == null || prev === undefined) return put(KEY, text);
        if (!put(KEY, text)) return false; // old main stays readable
        if (prev !== text && unwrap(prev).ok) put(BAK, prev); // never replace a good .bak with a bad copy
        return true;
      } catch (e) { return false; }
    },
    clear() {
      blocked = false;
      try { if (storage) { storage.removeItem(KEY); storage.removeItem(BAK); } } catch (e) { /* private mode */ }
    },
    exportText: (state) => JSON.stringify(wrap(state)),
    importText: (text, deps) => unwrap(text, deps),
  };
}
