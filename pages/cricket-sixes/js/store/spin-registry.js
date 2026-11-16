// Z2 spin registry: one handler per spin type. Handler = the old commands.js `case` body as (s, a, ctx) => next state,
// where a = the command payload and ctx = the commands.js helpers the case used. Registered by js/store/spins/index.js.
const HANDLERS = new Map();

/** Register (or replace) the handler for a spin type. */
export function registerSpin(type, handler) {
  if (typeof type !== 'string' || !type) throw new Error('registerSpin: type must be a non-empty string');
  if (typeof handler !== 'function') throw new Error(`registerSpin: handler for ${type} must be a function`);
  HANDLERS.set(type, handler);
}

/** The handler for a spin type, or undefined when none is registered. */
export function spinHandler(type) { return HANDLERS.get(type); }

/** Registered spin types, in register order. */
export function spinTypes() { return [...HANDLERS.keys()]; }
