// Checks a plan before the engine sees it (D71). Session files and the browser draft are loaded as saved, so a
// damaged or hand-edited file must be rejected with a clear message instead of producing confident nonsense.
// The same limits are enforced as you type (src/ui/InputsPanel.tsx); keep the two in step.

import { planYears } from './context';
import type { Plan } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Limits shared with the input fields. */
export const INPUT_LIMITS = { pathsMin: 500, pathsMax: 50_000, targetMin: 0.5, targetMax: 0.99 };

class Checker {
  problems: string[] = [];

  num(obj: Json, key: string, path: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | undefined {
    const v = obj[key];
    const where = `${path}${key}`;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.problems.push(`${where} must be a number (found ${JSON.stringify(v) ?? 'nothing'}).`);
      return undefined;
    }
    if (opts.int && !Number.isInteger(v)) this.problems.push(`${where} must be a whole number (found ${v}).`);
    else if (opts.min !== undefined && v < opts.min) this.problems.push(`${where} must be at least ${opts.min} (found ${v}).`);
    else if (opts.max !== undefined && v > opts.max) this.problems.push(`${where} must be at most ${opts.max} (found ${v}).`);
    return v;
  }

  oneOf(obj: Json, key: string, path: string, values: readonly unknown[]) {
    if (!values.includes(obj[key])) this.problems.push(`${path}${key} must be one of ${values.map((v) => JSON.stringify(v)).join(', ')} (found ${JSON.stringify(obj[key]) ?? 'nothing'}).`);
  }

  str(obj: Json, key: string, path: string) {
    if (typeof obj[key] !== 'string') this.problems.push(`${path}${key} must be text.`);
  }

  bool(obj: Json, key: string, path: string, optional = false) {
    if (optional && obj[key] === undefined) return;
    if (typeof obj[key] !== 'boolean') this.problems.push(`${path}${key} must be true or false.`);
  }

  obj(parent: Json, key: string, path: string): Json | null {
    const v = parent[key];
    if (!isObject(v)) {
      this.problems.push(`${path}${key} is missing or not an object.`);
      return null;
    }
    return v;
  }
}

const money = { min: 0 };
const rate = { min: 0, max: 1 };

function person(c: Checker, plan: Json, id: 'you' | 'spouse', startYear: number) {
  const p = c.obj(plan, id, '');
  if (!p) return;
  const at = `${id}.`;
  c.str(p, 'name', at);
  c.num(p, 'birthYear', at, { int: true, min: startYear - 120, max: startYear });
  c.num(p, 'birthMonth', at, { int: true, min: 1, max: 12 });
  c.num(p, 'salary', at, money);
  const contrib = c.obj(p, 'contributions', at);
  if (contrib) for (const k of ['pretax', 'employerMatch', 'roth', 'hsa']) c.num(contrib, k, `${at}contributions.`, money);
  const bal = c.obj(p, 'balances', at);
  if (bal) for (const k of ['pretax', 'roth', 'rothBasis', 'hsa']) c.num(bal, k, `${at}balances.`, money);
  const ss = c.obj(p, 'socialSecurity', at);
  if (ss) {
    const sp = `${at}socialSecurity.`;
    c.oneOf(ss, 'mode', sp, ['record', 'manual']);
    c.num(ss, 'manualPia', sp, money);
    c.num(ss, 'claimAge', sp, { int: true, min: 62, max: 70 });
    if (!Array.isArray(ss.earnings)) c.problems.push(`${sp}earnings must be a list.`);
    else ss.earnings.forEach((e, i) => {
      if (!isObject(e)) return c.problems.push(`${sp}earnings[${i}] is not a year and amount.`);
      c.num(e, 'year', `${sp}earnings[${i}].`, { int: true });
      c.num(e, 'amount', `${sp}earnings[${i}].`, money);
    });
  }
  const hc = c.obj(p, 'healthcare', at);
  if (hc) for (const k of ['preMedicare', 'medicare']) c.num(hc, k, `${at}healthcare.`, money);
}

function timing(c: Checker, item: Json, key: string, path: string, optional: boolean) {
  const t = item[key];
  if (t === undefined && optional) return;
  if (!isObject(t)) return void c.problems.push(`${path}${key} must be a year or an age.`);
  const at = `${path}${key}.`;
  c.oneOf(t, 'kind', at, ['year', 'age']);
  if (t.kind === 'year') c.num(t, 'year', at, { int: true });
  if (t.kind === 'age') {
    c.oneOf(t, 'person', at, ['you', 'spouse']);
    c.num(t, 'age', at, { int: true, min: 0 });
  }
}

/**
 * Problems with the plan's own fields: missing or mistyped values and values that are impossible on their own
 * (negative money, rates outside 0–100%, a claim age outside 62–70…). A plan loaded from a file or the browser
 * draft is rejected if there are any.
 */
export function fieldProblems(raw: unknown): string[] {
  const c = new Checker();
  if (!isObject(raw)) return ['The plan is missing or not an object.'];
  const plan = raw;
  if (plan.schemaVersion !== 1) c.problems.push('schemaVersion must be 1.');
  const startYear = c.num(plan, 'startYear', '', { int: true, min: 1900, max: 2200 }) ?? 2000;
  person(c, plan, 'you', startYear);
  person(c, plan, 'spouse', startYear);

  const h = c.obj(plan, 'household', '');
  if (h) {
    for (const k of ['taxable', 'taxableBasis', 'cash', 'taxableContribution', 'cashContribution', 'currentSpending', 'traditionalSpending']) {
      c.num(h, k, 'household.', money);
    }
    if (h.chubbySpending !== null) c.num(h, 'chubbySpending', 'household.', money);
    c.num(h, 'coastRetireAge', 'household.', { int: true, min: 0 });
  }

  if (!Array.isArray(plan.datedItems)) c.problems.push('datedItems must be a list.');
  else plan.datedItems.forEach((it, i) => {
    const at = `datedItems[${i}].`;
    if (!isObject(it)) return c.problems.push(`datedItems[${i}] is not a dated item.`);
    c.str(it, 'id', at);
    c.str(it, 'label', at);
    c.oneOf(it, 'direction', at, ['expense', 'income']);
    c.num(it, 'amount', at, money);
    c.oneOf(it, 'frequency', at, ['oneTime', 'ongoing', 'recurring']);
    timing(c, it, 'start', at, false);
    timing(c, it, 'end', at, true);
    if (it.everyYears !== undefined) c.num(it, 'everyYears', at, { int: true, min: 1 });
    c.bool(it, 'fixedDollars', at);
    c.bool(it, 'taxable', at, true);
  });

  const a = c.obj(plan, 'assumptions', '');
  if (a) {
    const at = 'assumptions.';
    c.num(a, 'endAge', at, { int: true, min: 1, max: 130 });
    c.num(a, 'targetSuccess', at, { min: INPUT_LIMITS.targetMin, max: INPUT_LIMITS.targetMax });
    const alloc = c.obj(a, 'allocation', at);
    if (alloc) {
      const parts = ['stocks', 'bonds', 'cash'].map((k) => c.num(alloc, k, `${at}allocation.`, rate) ?? 0);
      if (Math.abs(parts[0] + parts[1] + parts[2] - 1) > 1e-6) c.problems.push(`${at}allocation must add up to 100%.`);
    }
    c.num(a, 'feeRate', at, rate);
    c.num(a, 'wageGrowth', at, { min: -0.5, max: 0.5 });
    c.num(a, 'healthcareInflation', at, { min: -0.5, max: 0.5 });
    const paths = c.num(a, 'paths', at, { int: true, min: INPUT_LIMITS.pathsMin, max: INPUT_LIMITS.pathsMax });
    c.num(a, 'searchPaths', at, { int: true, min: 1, max: paths ?? INPUT_LIMITS.pathsMax });
    c.num(a, 'blockLength', at, { int: true, min: 1, max: 200 });
    c.num(a, 'seed', at, { int: true });
    c.num(a, 'stateTaxRate', at, rate);
    c.oneOf(a, 'bracketFill', at, ['none', '10', '12', '22', '24']);
    const tf = c.obj(a, 'ssTrustFund', at);
    if (tf) {
      c.num(tf, 'startYear', `${at}ssTrustFund.`, { int: true });
      c.num(tf, 'endYear', `${at}ssTrustFund.`, { int: true });
      c.num(tf, 'startPct', `${at}ssTrustFund.`, rate);
      c.num(tf, 'endPct', `${at}ssTrustFund.`, rate);
    }
  }
  return c.problems;
}

/**
 * Every problem that stops a calculation: the field problems, plus ones that depend on several fields and can
 * appear later without any edit (moving the plan start can put the Coast age in the past). Those block
 * Calculate but never stop a plan from loading, so the user can fix them on screen.
 */
export function planProblems(raw: unknown): string[] {
  const problems = fieldProblems(raw);
  if (problems.length) return problems;
  const plan = raw as Plan;
  let endYear: number;
  try {
    endYear = planYears(plan).endYear;
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  const you = plan.you;
  const ageNow = plan.startYear - you.birthYear;
  const coastYear = you.birthYear + plan.household.coastRetireAge;
  if (plan.household.coastRetireAge <= ageNow) {
    problems.push(`Coast FIRE: ${you.name}'s age when you both stop working (${plan.household.coastRetireAge}) must be above ${you.name}'s current age (${ageNow}).`);
  } else if (coastYear >= endYear) {
    problems.push(`Coast FIRE: ${you.name}'s age when you both stop working (${plan.household.coastRetireAge}) must be before the plan ends in ${endYear} (${you.name} ${endYear - you.birthYear}).`);
  }
  return problems;
}
