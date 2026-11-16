// @ts-check
// Sheet adapter for the Clinic wheel (SHEETS key 'clinicwheel'). open(vm, dispatch, open, arg, refresh): vm = clinicWheelVM; refresh() gives the live vm (fresh state).
// ClinicSpin is dispatched at STOP (one synchronous write); Collect closes the wheel and returns to the screen behind.
import { openClinicWheel } from './wheels/clinic.js';

/** @param {any} vm @param {(c:string, p?:any)=>void} dispatch @param {any} _open @param {any} _arg @param {() => any} [refresh] */
export function openClinicWheelSheet(vm, dispatch, _open, _arg, refresh) {
  const live = () => { try { const v = refresh ? refresh() : vm; return (v && v.s) || vm.s; } catch (_) { return vm.s; } };
  return openClinicWheel({
    state: live, spinKey: vm.spinKey, slot: vm.slot, coachId: vm.coachId, playerId: vm.playerId,
    dispatch: (/** @type {string} */ cmd, /** @type {any} */ p) => dispatch(cmd, p),
  });
}
