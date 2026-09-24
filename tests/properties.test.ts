// Layer 5: common-sense properties on randomized plans.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import { bootstrapPaths, makeRng } from '../src/engine/returns';
import { simulatePath } from '../src/engine/simulate';
import { makeEngine, scenarioFor, solveTier } from '../src/engine/solve';
import type { Plan } from '../src/engine/types';

function randomPlan(seed: number): Plan {
  const rng = makeRng(seed);
  const pick = (lo: number, hi: number) => lo + (hi - lo) * rng();
  const plan = examplePlan(2026);
  plan.you.birthYear = 2026 - Math.round(pick(30, 55));
  plan.spouse.birthYear = plan.you.birthYear + Math.round(pick(-5, 5));
  for (const p of [plan.you, plan.spouse]) {
    p.balances.pretax = pick(0, 800_000);
    p.balances.roth = pick(0, 200_000);
    p.balances.rothBasis = p.balances.roth * pick(0, 1);
    p.contributions.pretax = pick(0, 24_000);
    p.socialSecurity.manualPia = pick(0, 3_500);
    p.socialSecurity.claimAge = Math.round(pick(62, 70));
  }
  plan.household.taxable = pick(0, 400_000);
  plan.household.taxableBasis = plan.household.taxable * pick(0.3, 1);
  plan.household.traditionalSpending = pick(40_000, 120_000);
  plan.assumptions.paths = 300;
  plan.assumptions.searchPaths = 300;
  return plan;
}

function successRate(plan: Plan, retireYear: number, spending: number) {
  const ctx = buildContext(plan, { stopContributingYear: retireYear, retireYear, baseSpending: spending });
  const a = plan.assumptions;
  const paths = bootstrapPaths(300, ctx.len, a.allocation, a.feeRate, a.blockLength, a.seed);
  let ok = 0;
  for (let p = 0; p < paths.n; p++) if (simulatePath(ctx, paths, p).success) ok++;
  return ok / paths.n;
}

describe('monotonicity', () => {
  test('more spending never raises the success rate', () => {
    for (let s = 1; s <= 8; s++) {
      const plan = randomPlan(s);
      const year = 2026 + Math.round(makeRng(s + 100)() * 15);
      const lo = successRate(plan, year, plan.household.traditionalSpending);
      const hi = successRate(plan, year, plan.household.traditionalSpending * 1.2);
      expect(hi).toBeLessThanOrEqual(lo);
    }
  });

  test('a bigger starting balance never lowers the success rate', () => {
    for (let s = 11; s <= 16; s++) {
      const plan = randomPlan(s);
      const richer = structuredClone(plan);
      richer.household.taxable += 200_000;
      richer.household.taxableBasis += 200_000;
      expect(successRate(richer, 2030, 70_000)).toBeGreaterThanOrEqual(successRate(plan, 2030, 70_000));
    }
  });

  test('more savings never delays the earliest traditional FIRE year', () => {
    for (let s = 21; s <= 23; s++) {
      const plan = randomPlan(s);
      const more = structuredClone(plan);
      more.household.taxableContribution += 20_000;
      const a = solveTier(makeEngine(plan), 'traditional').earliest?.year ?? Infinity;
      const b = solveTier(makeEngine(more), 'traditional').earliest?.year ?? Infinity;
      expect(b).toBeLessThanOrEqual(a);
    }
  }, 120_000);

  test('coast scenario never contributes after the stop year', () => {
    const plan = randomPlan(31);
    const sc = scenarioFor(plan, 'coast', 2030);
    const ctx = buildContext(plan, sc);
    for (let t = 0; t < ctx.len; t++) {
      if (ctx.years[t] >= 2030) expect(ctx.contrib.pretax[0][t] + ctx.contrib.taxable[t]).toBe(0);
    }
  });
});
