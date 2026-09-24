import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import type { Plan, Scenario } from '../src/engine/types';

export const START = 2026;

/**
 * A plan with no taxes, Social Security or healthcare: both spouses 65, everything in Roth contributions.
 * Lets tests compare the engine with hand arithmetic.
 */
export function simplePlan(opts: { years?: number; roth?: number; spending?: number } = {}): Plan {
  const years = opts.years ?? 30;
  const plan = examplePlan(START);
  for (const p of [plan.you, plan.spouse]) {
    p.birthYear = START - 65;
    p.salary = 0;
    p.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    p.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    p.socialSecurity = { mode: 'manual', earnings: [], manualPia: 0, claimAge: 67 };
    p.healthcare = { preMedicare: 0, medicare: 0 };
  }
  plan.you.balances.roth = plan.you.balances.rothBasis = opts.roth ?? 1_000_000;
  plan.household = {
    ...plan.household,
    taxable: 0, taxableBasis: 0, cash: 0, taxableContribution: 0, cashContribution: 0,
    traditionalSpending: opts.spending ?? 40_000,
  };
  plan.assumptions = {
    ...plan.assumptions,
    endAge: 65 + years - 1,
    feeRate: 0,
    stateTaxRate: 0,
    bracketFill: 'none',
    healthcareInflation: 0,
    wageGrowth: 0,
  };
  return plan;
}

export function retiredNow(plan: Plan): Scenario {
  return { stopContributingYear: START, retireYear: START, baseSpending: plan.household.traditionalSpending };
}

export function ctxFor(plan: Plan, scenario: Scenario = retiredNow(plan)) {
  return buildContext(plan, scenario);
}
