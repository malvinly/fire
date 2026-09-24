// Checks a plan before the engine sees it (D71). Session files and the browser draft are loaded as saved, so a
// damaged or hand-edited file must be rejected with a clear message instead of producing confident nonsense.
// The input fields (src/ui/InputsPanel.tsx) block the same values as you type, from the same FIELD_LIMITS and
// the same cross-field checks below (D76).

import { planEndYear, planYears } from './context';
import { migratePlan } from './migrate';
import type { Plan } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Each field's own limits, used both by the input fields and by the checks on loaded plans (D76). Values are in
 * stored units (rates as fractions).
 */
export const FIELD_LIMITS = {
  money: { min: 0 },
  rate: { min: 0, max: 1 },
  growth: { min: -0.5, max: 0.5 },
  ssWageGrowth: { min: -0.05, max: 0.05 },
  targetSuccess: { min: 0.5, max: 0.99 },
  paths: { min: 500, max: 50_000 },
  blockLength: { min: 1, max: 200 },
  endAge: { min: 1, max: 130 },
  /** Plan start, birth years, dated-item and trust-fund years. */
  year: { min: 1900, max: 2200 },
  /** Ages for dated items and the Coast age. */
  age: { min: 0, max: 130 },
  claimAge: { min: 62, max: 70 },
  birthMonth: { min: 1, max: 12 },
  everyYears: { min: 1, max: 100 },
} as const;

const L = FIELD_LIMITS;

/**
 * Birth year against the plan start: born no later than the plan starts and at most 120 years before. A
 * cross-field check: it blocks Calculate and the birth-year field, but not loading (moving the plan start can
 * break it without editing the birth year).
 */
export function birthYearProblem(plan: Plan, birthYear: number): string | null {
  if (birthYear > plan.startYear) return `Must not be after the plan starts (${plan.startYear}).`;
  if (birthYear < plan.startYear - 120) return `Must be within 120 years of the plan start (${plan.startYear - 120} or later).`;
  return null;
}

/** The Coast age must be above You's age today and before the plan ends (D76). A cross-field check, like the one above. */
export function coastAgeProblem(plan: Plan, age: number): string | null {
  const name = plan.you.name;
  const ageNow = plan.startYear - plan.you.birthYear;
  const end = planEndYear(plan);
  if (age <= ageNow) return `Must be above ${name}’s current age (${ageNow}).`;
  if (plan.you.birthYear + age >= end) return `Must be before the plan ends in ${end} (${name} ${end - plan.you.birthYear}).`;
  return null;
}

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

const money = L.money;
const rate = L.rate;

function person(c: Checker, plan: Json, id: 'you' | 'spouse') {
  const p = c.obj(plan, id, '');
  if (!p) return;
  const at = `${id}.`;
  c.str(p, 'name', at);
  c.num(p, 'birthYear', at, { int: true, ...L.year });
  c.num(p, 'birthMonth', at, { int: true, ...L.birthMonth });
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
    c.num(ss, 'claimAge', sp, { int: true, ...L.claimAge });
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
  // Bounded so a typo can't make the per-year loops run for billions of years.
  if (t.kind === 'year') c.num(t, 'year', at, { int: true, ...L.year });
  if (t.kind === 'age') {
    c.oneOf(t, 'person', at, ['you', 'spouse']);
    c.num(t, 'age', at, { int: true, ...L.age });
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
  c.num(plan, 'startYear', '', { int: true, ...L.year });
  person(c, plan, 'you');
  person(c, plan, 'spouse');

  const h = c.obj(plan, 'household', '');
  if (h) {
    for (const k of ['taxable', 'taxableBasis', 'cash', 'taxableContribution', 'cashContribution', 'currentSpending', 'traditionalSpending']) {
      c.num(h, k, 'household.', money);
    }
    if (h.chubbySpending !== null) c.num(h, 'chubbySpending', 'household.', money);
    c.num(h, 'coastRetireAge', 'household.', { int: true, ...L.age });
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
    if (it.everyYears !== undefined) c.num(it, 'everyYears', at, { int: true, ...L.everyYears });
    c.bool(it, 'fixedDollars', at);
    c.bool(it, 'taxable', at, true);
  });

  const a = c.obj(plan, 'assumptions', '');
  if (a) {
    const at = 'assumptions.';
    c.num(a, 'endAge', at, { int: true, ...L.endAge });
    c.num(a, 'targetSuccess', at, L.targetSuccess);
    const alloc = c.obj(a, 'allocation', at);
    if (alloc) {
      const parts = ['stocks', 'bonds', 'cash'].map((k) => c.num(alloc, k, `${at}allocation.`, rate) ?? 0);
      if (Math.abs(parts[0] + parts[1] + parts[2] - 1) > 1e-6) c.problems.push(`${at}allocation must add up to 100%.`);
    }
    c.num(a, 'feeRate', at, rate);
    c.num(a, 'wageGrowth', at, L.growth);
    c.num(a, 'healthcareInflation', at, L.growth);
    const paths = c.num(a, 'paths', at, { int: true, ...L.paths });
    c.num(a, 'searchPaths', at, { int: true, min: 1, max: paths ?? L.paths.max });
    c.num(a, 'blockLength', at, { int: true, ...L.blockLength });
    c.num(a, 'seed', at, { int: true });
    c.num(a, 'stateTaxRate', at, rate);
    c.oneOf(a, 'bracketFill', at, ['none', '10', '12', '22', '24']);
    c.num(a, 'ssWageGrowth', at, L.ssWageGrowth);
    const tf = c.obj(a, 'ssTrustFund', at);
    if (tf) {
      c.num(tf, 'startYear', `${at}ssTrustFund.`, { int: true, ...L.year });
      c.num(tf, 'endYear', `${at}ssTrustFund.`, { int: true, ...L.year });
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
  for (const id of ['you', 'spouse'] as const) {
    const why = birthYearProblem(plan, plan[id].birthYear);
    if (why) problems.push(`${plan[id].name}’s birth year (${plan[id].birthYear}): ${why.replace('Must not be after', 'born after')}`);
  }
  if (problems.length) return problems;
  try {
    planYears(plan);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  const coast = coastAgeProblem(plan, plan.household.coastRetireAge);
  if (coast) problems.push(`Coast FIRE age (${plan.household.coastRetireAge}): ${coast}`);
  return problems;
}

/** A loaded plan (session file or browser draft) after filling missing fields, or why it can't be used (D65, D71). */
export function checkLoadedPlan(raw: unknown): { plan: Plan; problems: [] } | { plan: null; problems: string[] } {
  const plan = migratePlan(raw);
  const problems = fieldProblems(plan);
  return problems.length ? { plan: null, problems } : { plan: plan as Plan, problems: [] };
}
