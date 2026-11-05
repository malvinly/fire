// Plans saved by older versions (session files, the browser draft) are loaded as saved. Fields added to the
// plan format since then are filled in here so the engine never sees them undefined (D65).

import { ZERO_CONTRIBUTIONS } from './context';
import { DEFAULT_ASSUMPTIONS } from './defaults';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Returns a copy of `raw` with defaults filled in for fields that may be missing from older files: any
 * missing top-level assumption takes today's default, dated income is taxed unless marked otherwise (D66), and
 * a person without "kept while coasting" contributions keeps none (D94).
 * Everything else is left for validation to accept or reject.
 * A new field whose value for an old file should not be today's default (one that depends on another field,
 * or a default changed later) needs its own line here: `schemaVersion` stays 1, so the file's age is unknown.
 */
export function migratePlan(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const plan = structuredClone(raw);
  if (isObject(plan.assumptions)) {
    const a = plan.assumptions;
    // "Asset mix over time" (D97): a file saved before it keeps the mix it was saved with, not the new Vanguard default.
    if (a.mixPlan === undefined) {
      const alloc = a.allocation;
      if (isObject(a.retiredAllocation)) {
        // A mix after retiring (D96, never published): one switch at 65.
        a.mixPlan = 'own';
        a.laterAllocation = structuredClone(a.retiredAllocation);
        a.shiftStartAge = a.shiftEndAge = 65;
      // A literal on purpose, not FIDELITY_MIX: 70/25/5 is what files saved before D97 held as the then-default. If
      // Fidelity's mix ever changes, those files must still be recognized by this literal, and they then follow the
      // 'fidelity' choice's new mix (the consequence of mapping them to 'fidelity').
      } else if (alloc === undefined || (isObject(alloc) && alloc.stocks === 0.7 && alloc.bonds === 0.25 && alloc.cash === 0.05)) {
        a.mixPlan = 'fidelity'; // a missing mix takes the 70/25/5 default below, as before
      } else if (isObject(alloc)) {
        a.mixPlan = 'own';
        a.laterAllocation = structuredClone(alloc);
      }
      // A malformed mix is left for validation to reject.
    }
    delete a.retiredAllocation;
    for (const [key, value] of Object.entries(DEFAULT_ASSUMPTIONS)) if (a[key] === undefined) a[key] = structuredClone(value);
  }
  for (const id of ['you', 'spouse']) {
    const p = plan[id];
    if (isObject(p) && p.coastContributions === undefined) p.coastContributions = { ...ZERO_CONTRIBUTIONS };
  }
  if (Array.isArray(plan.datedItems)) {
    for (const item of plan.datedItems) if (isObject(item) && item.direction === 'income' && item.taxable === undefined) item.taxable = true;
  }
  return plan;
}
