import { TRUST_FUND_DEFAULT } from '../data/rules';
import { inTodaysBudget } from './context';
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
  bracketFill: '12',
  ssTrustFund: { ...TRUST_FUND_DEFAULT },
};

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
    balances: { pretax: 300_000, roth: 50_000, rothBasis: 30_000, hsa: 0 },
    socialSecurity: { mode: 'manual', earnings: [], manualPia: 2_500, claimAge: EXAMPLE_CLAIM_AGE },
    healthcare: { preMedicare: 16_000, medicare: 7_500 }, // 2026 US averages (D58)
  };
}

/**
 * Input sections (named as in the inputs panel) where a person's or the household's part still equals the
 * example plan, so example numbers would silently flow into results (D64).
 */
export function untouchedSections(plan: Plan): string[] {
  const ex = examplePlan(plan.startYear);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const anyPerson = (part: (p: Person) => unknown) => (['you', 'spouse'] as const).some((id) => same(part(plan[id]), part(ex[id])));
  const h = plan.household;
  const eh = ex.household;
  const sections: [string, boolean][] = [
    ['People', anyPerson((p) => [p.birthYear, p.salary])],
    ['Balances', anyPerson((p) => p.balances) || same([h.taxable, h.taxableBasis, h.cash], [eh.taxable, eh.taxableBasis, eh.cash])],
    ['Yearly contributions', anyPerson((p) => p.contributions) ||
      same([h.taxableContribution, h.cashContribution], [eh.taxableContribution, eh.cashContribution])],
    ['Spending', same([h.currentSpending, h.traditionalSpending, h.chubbySpending], [eh.currentSpending, eh.traditionalSpending, eh.chubbySpending])],
    ['Healthcare', anyPerson((p) => p.healthcare)],
    ['Social Security', anyPerson((p) => [p.socialSecurity.mode, p.socialSecurity.manualPia, p.socialSecurity.earnings.length])],
  ];
  return sections.filter(([, untouched]) => untouched).map(([name]) => name);
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
