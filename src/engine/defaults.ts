import { TRUST_FUND_DEFAULT } from '../data/rules';
import { ZERO_CONTRIBUTIONS, inTodaysBudget } from './context';
import type { Assumptions, Person, Plan } from './types';

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  endAge: 96, // Fidelity planning age
  targetSuccess: 0.9, // Fidelity "significantly below average market"
  allocation: { stocks: 0.7, bonds: 0.25, cash: 0.05 }, // Fidelity FI Planner mix
  feeRate: 0.001,
  wageGrowth: 0.015, // Fidelity real wage growth
  healthcareInflation: 0.015,
  paths: 10_000,
  searchPaths: 2_000,
  blockLength: 5,
  seed: 20260924,
  stateTaxRate: 0.05,
  bracketFill: '10', // D29
  ssTrustFund: { ...TRUST_FUND_DEFAULT },
  ssWageGrowth: 0, // as cautious as v1 (D77)
};

/** The solver's quick-search sample for a number of markets: the default 2,000, or all of them if fewer (D5). */
export function searchPathsFor(paths: number): number {
  return Math.min(DEFAULT_ASSUMPTIONS.searchPaths, paths);
}

/** Fidelity: retirement spending about 15% below current spending. */
export const FIDELITY_SPENDING_FACTOR = 0.85;

/**
 * Ongoing dated expenses you are already paying today (e.g. mortgage P&I, property tax). They are part of
 * current spending but are added separately in retirement, so the Fidelity default subtracts them (D18).
 */
export function datedExpensesToday(plan: Plan): number {
  return plan.datedItems
    .filter((it) => it.direction === 'expense' && inTodaysBudget(plan, it))
    .reduce((sum, it) => sum + it.amount, 0);
}

/** Fidelity default for Traditional FIRE spending: 0.85 × (current spending − dated expenses paid today). */
export function fidelityDefaultSpending(plan: Plan): number {
  return Math.round(Math.max(0, plan.household.currentSpending - datedExpensesToday(plan)) * FIDELITY_SPENDING_FACTOR);
}

/** Chubby FIRE: 20% more than today — between Traditional (0.85×) and Fat FIRE (D57). */
export const CHUBBY_SPENDING_FACTOR = 1.2;

/** Default for Chubby FIRE spending: 1.2 × (current spending − dated expenses paid today), same base as Traditional. */
export function chubbyDefaultSpending(plan: Plan): number {
  return Math.round(Math.max(0, plan.household.currentSpending - datedExpensesToday(plan)) * CHUBBY_SPENDING_FACTOR);
}

/** Claim age in the example plan (the full retirement age for anyone born 1960 or later). */
export const EXAMPLE_CLAIM_AGE = 67;

function person(name: string, birthYear: number): Person {
  return {
    name,
    birthYear,
    birthMonth: 6,
    salary: 100_000,
    contributions: { pretax: 20_000, employerMatch: 5_000, roth: 0, hsa: 0 },
    coastContributions: { ...ZERO_CONTRIBUTIONS },
    balances: { pretax: 300_000, roth: 50_000, rothBasis: 30_000, hsa: 0 },
    socialSecurity: { mode: 'manual', earnings: [], manualPia: 2_500, claimAge: EXAMPLE_CLAIM_AGE },
    healthcare: { preMedicare: 16_000, medicare: 7_500 }, // 2026 US averages (D58)
  };
}

/** Input sections (named as in the inputs panel) whose number fields are checked against the example plan (D64). */
export const EXAMPLE_SECTIONS = ['People', 'Balances', 'Yearly contributions', 'Spending', 'Healthcare', 'Social Security'] as const;
export type ExampleSection = (typeof EXAMPLE_SECTIONS)[number];

export interface ExampleStatus {
  /** The example plan's number for every checked field path (e.g. `spouse.balances.roth`, `household.cash`). */
  examples: Map<string, number>;
  /** The checked fields whose value still equals the example's. */
  fields: Set<string>;
  /** How many such fields each section holds. */
  counts: Record<ExampleSection, number>;
}

/**
 * Number fields still holding the example plan's value, so example numbers would silently flow into results
 * (D64). Fields whose example value is 0 are skipped: a real 0 would otherwise look like an example, and a 0
 * can only understate results. The statement benefit counts only while the benefit comes from the statement.
 * Assumptions, claim ages, names and dated items are not checked: their defaults are deliberate. A checked box
 * left empty goes back to its example number (`NumberField`).
 */
export function exampleStatus(plan: Plan): ExampleStatus {
  const ex = examplePlan(plan.startYear);
  const examples = new Map<string, number>();
  const fields = new Set<string>();
  const counts = Object.fromEntries(EXAMPLE_SECTIONS.map((s) => [s, 0])) as Record<ExampleSection, number>;
  const check = (section: ExampleSection, path: string, value: number | null, example: number | null) => {
    if (example === 0 || example === null) return;
    examples.set(path, example);
    if (value !== example) return;
    fields.add(path);
    counts[section]++;
  };
  for (const id of ['you', 'spouse'] as const) {
    const p = plan[id];
    const e = ex[id];
    check('People', `${id}.birthYear`, p.birthYear, e.birthYear);
    check('People', `${id}.salary`, p.salary, e.salary);
    for (const k of ['pretax', 'roth', 'rothBasis', 'hsa'] as const) check('Balances', `${id}.balances.${k}`, p.balances[k], e.balances[k]);
    for (const k of ['pretax', 'employerMatch', 'roth', 'hsa'] as const) {
      check('Yearly contributions', `${id}.contributions.${k}`, p.contributions[k], e.contributions[k]);
    }
    for (const k of ['preMedicare', 'medicare'] as const) check('Healthcare', `${id}.healthcare.${k}`, p.healthcare[k], e.healthcare[k]);
    if (p.socialSecurity.mode === 'manual') {
      check('Social Security', `${id}.socialSecurity.manualPia`, p.socialSecurity.manualPia, e.socialSecurity.manualPia);
    }
  }
  const h = plan.household;
  const eh = ex.household;
  for (const k of ['taxable', 'taxableBasis', 'cash'] as const) check('Balances', `household.${k}`, h[k], eh[k]);
  for (const k of ['taxableContribution', 'cashContribution'] as const) check('Yearly contributions', `household.${k}`, h[k], eh[k]);
  for (const k of ['currentSpending', 'traditionalSpending', 'chubbySpending'] as const) check('Spending', `household.${k}`, h[k], eh[k]);
  return { examples, fields, counts };
}

/** Sections (named as in the inputs panel) with at least one field still holding the example's number (D64). */
export function untouchedSections(plan: Plan): string[] {
  const { counts } = exampleStatus(plan);
  return EXAMPLE_SECTIONS.filter((s) => counts[s] > 0);
}

/** What the household keeps contributing per year while coasting, employer matches included (D94); 0 = stops saving. */
export function coastContributionTotal(plan: Plan): number {
  return [plan.you, plan.spouse].reduce((s, p) => s + p.coastContributions.pretax + p.coastContributions.employerMatch + p.coastContributions.roth + p.coastContributions.hsa, 0);
}

/** Example plan shown on first launch. Every number is a placeholder to overwrite. */
export function examplePlan(startYear = new Date().getFullYear()): Plan {
  return {
    schemaVersion: 1,
    startYear,
    you: person('You', startYear - 42),
    spouse: person('Spouse', startYear - 40),
    household: {
      taxable: 150_000,
      taxableBasis: 100_000,
      cash: 30_000,
      taxableContribution: 15_000,
      cashContribution: 0,
      currentSpending: 90_000,
      traditionalSpending: Math.round(90_000 * FIDELITY_SPENDING_FACTOR), // = fidelityDefaultSpending (no dated items)
      chubbySpending: Math.round(90_000 * CHUBBY_SPENDING_FACTOR), // = chubbyDefaultSpending (no dated items) (D57)
      coastRetireAge: 65,
    },
    datedItems: [],
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
  };
}
