// @ts-check
// Event hooks (S0 seam Z3): features register listeners on core moments without the core importing them.
// Names: netsRun, matchEnd, endWeek, seasonClose. A listener gets (n, info) where n is the core's fresh DRAFT state
// (already a copy) and mutates it in place; listeners run in register order. No listeners today, and fireHook with none
// registered does nothing at all (no copy, no rng draw), so the core is unchanged until a feature registers.
// Errors: a throwing listener is caught and reported with console.warn, then the next listener runs. Chosen so a bug in
// one feature can never break the core loop (nets, week end, match end, season close); the draft keeps whatever that
// listener changed before it threw.

export const HOOK_NAMES = Object.freeze(['netsRun', 'matchEnd', 'endWeek', 'seasonClose']);
/** Pipe hook names (fired with pipeHook). onHook takes these too. Kept apart from HOOK_NAMES, the event list tests pin. */
export const PIPE_NAMES = Object.freeze(['netsOrder']);
// Pipe hooks (lead call 9): pipeHook(name, value, n, info) passes value through the listeners, each as fn(value, n, info) -> next value
// (undefined = keep the value). netsOrder: value = the trainee id list inside runNets, before any roll. No listeners = value returned as is.

/** @type {Map<string, Array<(n:any, info:any, info2?:any)=>any>>} */
const listeners = new Map([...HOOK_NAMES, ...PIPE_NAMES].map((k) => [k, []]));

/**
 * Register a listener. Unknown name throws. Returns an unregister function (safe to call twice).
 * @param {string} name @param {(n:any, info:any)=>void} fn
 */
export function onHook(name, fn) {
  const list = listeners.get(name);
  if (!list) throw new Error(`onHook: unknown hook "${name}" (known: ${[...HOOK_NAMES, ...PIPE_NAMES].join(', ')})`);
  if (typeof fn !== 'function') throw new Error(`onHook: listener for "${name}" is not a function`);
  list.push(fn);
  return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
}

/**
 * Run the listeners for name on the draft n (mutated in place). Unknown name or no listeners: no-op. Returns n.
 * @param {string} name @param {any} n @param {any} [info]
 */
export function fireHook(name, n, info) {
  const list = listeners.get(name);
  if (!list || !list.length) return n;
  for (const fn of list.slice()) {
    try { fn(n, info); } catch (e) { console.warn(`hook "${name}" listener failed:`, e); }
  }
  return n;
}

/**
 * Pipe value through the listeners for name, in register order: each gets (value, n, info) and returns the next value
 * (undefined keeps the current one). Unknown name or no listeners: returns value unchanged (same reference). A throwing
 * listener is caught and reported like fireHook; the value it was given goes on to the next listener.
 * @template T @param {string} name @param {T} value @param {any} [n] @param {any} [info] @returns {T}
 */
export function pipeHook(name, value, n, info) {
  const list = listeners.get(name);
  if (!list || !list.length) return value;
  let v = value;
  for (const fn of list.slice()) {
    try { const out = /** @type {any} */ (fn)(v, n, info); if (out !== undefined) v = out; } catch (e) { console.warn(`hook "${name}" listener failed:`, e); }
  }
  return v;
}

/** Drop every listener (tests). */
export function clearHooks() { for (const list of listeners.values()) list.length = 0; }
