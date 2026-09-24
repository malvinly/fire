import { TRUST_FUND_DEFAULT } from '../data/rules';
import { timingYear } from './context';
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
    .filter((it) => it.direction === 'expense' && it.frequency === 'ongoing')
    .filter((it) => timingYear(plan, it.start) <= plan.startYear && (!it.end || timingYear(plan, it.end) >= plan.startYear))
    .reduce((sum, it) => sum + it.amount, 0);
}

/** Fidelity default for Traditional FIRE spending: 0.85 × (current spending − dated expenses paid today). */
export function fidelityDefaultSpending(plan: Plan): number {
  return Math.round(Math.max(0, plan.household.currentSpending - datedExpensesToday(plan)) * FIDELITY_SPENDING_FACTOR);
}

/** Chubby FIRE: keep today's lifestyle — no Fidelity 15% cut (D48). */
export const CHUBBY_SPENDING_FACTOR = 1;

/** Default for Chubby FIRE spending: 1.0 × (current spending − dated expenses paid today), same base as Traditional. */
export function chubbyDefaultSpending(plan: Plan): number {
  return Math.round(Math.max(0, plan.household.currentSpending - datedExpensesToday(plan)) * CHUBBY_SPENDING_FACTOR);
}

function person(name: string, birthYear: number): Person {
  return {
    name,
    birthYear,
    birthMonth: 6,
    salary: 100_000,
    contributions: { pretax: 20_000, employerMatch: 5_000, roth: 0, hsa: 0 },
    balances: { pretax: 300_000, roth: 50_000, rothBasis: 30_000, hsa: 0 },
    socialSecurity: { mode: 'manual', earnings: [], manualPia: 2_500, claimAge: 67 },
    healthcare: { preMedicare: 9_000, medicare: 6_500 },
  };
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
      chubbySpending: Math.round(90_000 * CHUBBY_SPENDING_FACTOR), // = chubbyDefaultSpending (no dated items) (D48)
      coastRetireAge: 65,
    },
    datedItems: [],
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
  };
}
