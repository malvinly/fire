// Plans saved by older versions (session files, the browser draft) are loaded as saved. Fields added to the
// plan format since then are filled in here so the engine never sees them undefined (D65).

import { DEFAULT_ASSUMPTIONS } from './defaults';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Returns a copy of `raw` with defaults filled in for fields that may be missing from older files: any
 * missing assumption takes its default, and dated income is taxed unless marked otherwise (D66). Everything
 * else is left for validation to accept or reject.
 */
export function migratePlan(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const plan = structuredClone(raw);
  if (isObject(plan.assumptions)) {
    const a = plan.assumptions;
    for (const [key, value] of Object.entries(DEFAULT_ASSUMPTIONS)) if (a[key] === undefined) a[key] = structuredClone(value);
  }
  if (Array.isArray(plan.datedItems)) {
    for (const item of plan.datedItems) if (isObject(item) && item.direction === 'income' && item.taxable === undefined) item.taxable = true;
  }
  return plan;
}
