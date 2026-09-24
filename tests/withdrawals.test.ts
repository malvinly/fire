// Account rules: 59½ access, Roth ladder seasoning, penalties, RMDs, HSA.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { constantPath } from '../src/engine/returns';
import { simulatePath } from '../src/engine/simulate';
import { ctxFor, simplePlan, START } from './helpers';

function earlyRetiree(age: number) {
  const plan = simplePlan({ years: 96 - age + 1, spending: 40_000, roth: 0 });
  for (const p of [plan.you, plan.spouse]) p.birthYear = START - age;
  plan.assumptions.endAge = 96;
  return plan;
}

describe('before 59½', () => {
  test('taxable money is used first; no penalty while it lasts', () => {
    const plan = earlyRetiree(50);
    plan.household.taxable = plan.household.taxableBasis = 500_000;
    plan.you.balances.pretax = 1_000_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true });
    const first = res.records![0];
    expect(first.withdrawals.taxable).toBeCloseTo(40_000, 0);
    expect(first.penaltyWithdrawals).toBe(0);
    expect(res.usedPenalty).toBe(false);
  });

  test('with only pre-tax money and no ladder, withdrawals are penalized but the plan does not fail', () => {
    const plan = earlyRetiree(50);
    plan.you.balances.pretax = 2_000_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0.03), 0, { record: true });
    expect(res.records![0].penaltyWithdrawals).toBeGreaterThan(40_000);
    expect(res.records![0].penaltyTax).toBeCloseTo(0.1 * res.records![0].penaltyWithdrawals, 6);
    expect(res.usedPenalty).toBe(true);
    // From the year you turn 60 there is no penalty.
    const at60 = res.records!.find((r) => r.ageYou === 60)!;
    expect(at60.penaltyWithdrawals).toBe(0);
  });

  test('Roth ladder: conversions become spendable after 5 years, avoiding penalties', () => {
    const plan = earlyRetiree(45);
    plan.assumptions.bracketFill = '12';
    plan.household.taxable = plan.household.taxableBasis = 300_000; // bridges ~7 years
    plan.you.balances.pretax = 1_500_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0.03), 0, { record: true });
    const recs = res.records!;
    expect(recs[0].conversions).toBeGreaterThan(100_000);
    // Once taxable runs out, seasoned conversions pay the bills.
    const afterTaxable = recs.find((r, i) => i >= 5 && r.balances.taxable < 1)!;
    expect(afterTaxable.withdrawals.roth).toBeGreaterThan(0);
    expect(res.usedPenalty).toBe(false);
  });

  test('unseasoned conversions cannot be spent penalty-free', () => {
    const plan = earlyRetiree(45);
    plan.assumptions.bracketFill = '12';
    plan.you.balances.pretax = 1_500_000; // no taxable bridge at all
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0.03), 0, { record: true });
    expect(res.records![0].penaltyWithdrawals + res.records![1].penaltyWithdrawals).toBeGreaterThan(0);
  });
});

describe('required minimum distributions', () => {
  test('begin at 75 for people born 1960+, and the surplus is reinvested in taxable', () => {
    const plan = earlyRetiree(66); // born 1960
    plan.household.traditionalSpending = 0;
    plan.you.balances.pretax = 1_000_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true });
    const recs = res.records!;
    expect(recs.find((r) => r.ageYou === 74)!.rmd).toBe(0);
    const r75 = recs.find((r) => r.ageYou === 75)!;
    expect(r75.rmd).toBeCloseTo(1_000_000 / 24.6, 0);
    expect(r75.balances.taxable).toBeGreaterThan(0);
  });

  test('begin at 73 for people born 1951–1959 and at 72 for 1950 (Uniform Lifetime divisors)', () => {
    for (const [born, startAge, divisor] of [[1950, 72, 27.4], [1951, 73, 26.5], [1959, 73, 26.5]]) {
      const plan = simplePlan();
      plan.startYear = born + 70; // ages 70, 71, 72, …
      plan.you.birthYear = plan.spouse.birthYear = born;
      plan.assumptions.endAge = 96;
      const ctx = buildContext(plan, { stopContributingYear: plan.startYear, retireYear: plan.startYear, baseSpending: 0 });
      const t = startAge - 70;
      expect(ctx.rmdDivisor[0][t - 1]).toBe(0);
      expect(ctx.rmdDivisor[0][t]).toBe(divisor);
    }
  });
});

describe('HSA', () => {
  test('pays healthcare tax-free before other accounts', () => {
    const plan = earlyRetiree(66);
    plan.you.balances.hsa = 50_000;
    plan.you.healthcare.medicare = 10_000;
    plan.you.balances.roth = plan.you.balances.rothBasis = 1_000_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true });
    expect(res.records![0].withdrawals.hsa).toBe(10_000);
    expect(res.records![0].withdrawals.roth).toBeCloseTo(40_000, 6);
  });

  test('non-medical withdrawals pay the 20% penalty until the younger spouse turns 65 (D41)', () => {
    const plan = earlyRetiree(66);
    plan.spouse.birthYear = START - 63;
    plan.household.traditionalSpending = 10_000;
    plan.you.balances.hsa = 100_000; // the only money; income stays under the deduction, so no income tax
    const ctx = ctxFor(plan);
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    // Spouse 63 and 64: X = 10,000 + 0.2 X → X = 12,500, penalty 2,500. Spouse 65: 10,000, no penalty.
    for (const t of [0, 1]) {
      expect(recs[t].withdrawals.hsa).toBeCloseTo(12_500, 0);
      expect(recs[t].penaltyTax).toBeCloseTo(2_500, 0);
    }
    expect(recs[2].withdrawals.hsa).toBe(10_000);
    expect(recs[2].penaltyTax).toBe(0);
    expect(recs.slice(0, 3).every((r) => r.federalTax === 0)).toBe(true);
  });
});
