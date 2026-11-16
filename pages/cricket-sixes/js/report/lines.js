// Z4 report line registry (SEAMS-S0): other threads add lines to a fixed report section without editing report.js.
// reportLines(section, s) -> string[] ; unknown section -> []; a throwing fn is caught and skipped. Empty today, so the report is byte-equal.
export const SECTIONS = ['WHEELS', 'COACHES', 'CLINIC'];
const reg = { WHEELS: [], COACHES: [], CLINIC: [] };

/** Register fn(s) -> string | string[] | null for a section. Unknown sections are ignored. Returns an unregister function. */
export function addReportLines(section, fn) {
  if (!Object.prototype.hasOwnProperty.call(reg, section) || typeof fn !== 'function') return () => {};
  reg[section].push(fn);
  return () => { const i = reg[section].indexOf(fn); if (i >= 0) reg[section].splice(i, 1); };
}

export function reportLines(section, s) {
  if (!Object.prototype.hasOwnProperty.call(reg, section)) return [];
  const out = [];
  for (const fn of reg[section].slice()) {
    try { const r = fn(s); if (Array.isArray(r)) { for (const l of r) if (typeof l === 'string' && l) out.push(l); } else if (typeof r === 'string' && r) out.push(r); } catch (_) { /* skipped */ }
  }
  return out;
}

/** Test only: empty the registry. */
export function _clearReportLines() { for (const k of SECTIONS) reg[k].length = 0; }
