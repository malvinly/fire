// Account rules: 59½ access, Roth ladder seasoning, penalties, RMDs, HSA.
import { describe, expect, test } from 'vitest';
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
});
