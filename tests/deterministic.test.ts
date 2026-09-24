// Layer 1: fixed returns, no volatility — the engine must match hand arithmetic exactly.
import { describe, expect, test } from 'vitest';
import { constantPath } from '../src/engine/returns';
import { buildContext, itemYearsInPlan } from '../src/engine/context';
import type { DatedItem, DatedTiming } from '../src/engine/types';
import { initialState, simulatePath } from '../src/engine/simulate';
import { ctxFor, noYields, simplePlan, START } from './helpers';

describe('cash flow with constant returns', () => {
  test('spending r/(1+r) of the portfolio lasts forever with start-of-year withdrawals', () => {
    const r = 0.04;
    const plan = simplePlan({ spending: (1_000_000 * r) / (1 + r) });
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, r), 0, { record: true });
    expect(res.success).toBe(true);
    for (const rec of res.records!) expect(rec.balances.total).toBeCloseTo(1_000_000, 4);
  });

  test('at 0% return, $1M at $40k/yr lasts exactly 25 years', () => {
    const ok = ctxFor(simplePlan({ years: 25 }));
    expect(simulatePath(ok, constantPath(ok.len, 0), 0).success).toBe(true);
    const fail = ctxFor(simplePlan({ years: 26 }));
    const res = simulatePath(fail, constantPath(fail.len, 0), 0);
    expect(res.success).toBe(false);
    expect(res.failYear).toBe(START + 25);
  });

  test('25x spending survives 30 years at a 4% real return; 20x does not at 0%', () => {
    const ctx = ctxFor(simplePlan({ roth: 25 * 40_000 }));
    expect(simulatePath(ctx, constantPath(ctx.len, 0.04), 0).success).toBe(true);
    const low = ctxFor(simplePlan({ roth: 20 * 40_000 }));
    expect(simulatePath(low, constantPath(low.len, 0), 0).success).toBe(false);
  });

  test('coast: balance needed today = retirement need discounted at the real return', () => {
    const r = 0.05;
    const coastYears = 10;
    const perpetuity = (40_000 * (1 + r)) / r; // needed at retirement for withdrawals forever
    const needToday = perpetuity / Math.pow(1 + r, coastYears);
    const plan = simplePlan({ roth: needToday, years: 60 });
    const scenario = { stopContributingYear: START, retireYear: START + coastYears, baseSpending: 40_000 };
    const ctx = ctxFor(plan, scenario);
    const res = simulatePath(ctx, constantPath(ctx.len, r), 0, { record: true });
    expect(res.success).toBe(true);
    expect(res.records![coastYears - 1].balances.total).toBeCloseTo(perpetuity, 2);
    expect(res.endBalance).toBeCloseTo(perpetuity, 2);
    // 1% less today reaches retirement 1% short (0.99 × 840,000). Each retired year B ← (B − 40,000) × 1.05,
    // so the 8,400 gap to the perpetuity grows 5% a year: after the 50 retired years (t = 10…59) the balance is
    // 840,000 − 8,400 × 1.05^50 ≈ 743,674 — still positive, but never self-sustaining.
    const short = ctxFor(simplePlan({ roth: needToday * 0.99, years: 60 }), scenario);
    const res99 = simulatePath(short, constantPath(short.len, r), 0);
    expect(res99.success).toBe(true);
    expect(res99.endBalance).toBeCloseTo(perpetuity - 0.01 * perpetuity * 1.05 ** 50, 2);
  });

  test('contributions grow with wages and stop at the stop-contributing year', () => {
    const plan = simplePlan({ roth: 0 });
    plan.you.contributions.roth = 10_000;
    plan.assumptions.wageGrowth = 0.01;
    const scenario = { stopContributingYear: START + 3, retireYear: START + 5, baseSpending: 0 };
    const ctx = ctxFor(plan, scenario);
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true });
    expect(res.records![4].balances.total).toBeCloseTo(10_000 * (1 + 1.01 + 1.0201), 6);
  });

  test('fixed-dollar items shrink with inflation; real items do not', () => {
    const plan = simplePlan({ spending: 0 });
    plan.datedItems = [
      { id: 'm', label: 'mortgage', direction: 'expense', amount: 10_000, frequency: 'ongoing', start: { kind: 'year', year: START }, end: { kind: 'year', year: START + 1 }, fixedDollars: true },
      { id: 'c', label: 'car', direction: 'expense', amount: 5_000, frequency: 'oneTime', start: { kind: 'year', year: START + 1 }, fixedDollars: false },
    ];
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0, 0, 0.1), 0, { record: true });
    expect(res.records![0].spending).toBeCloseTo(10_000, 6);
    expect(res.records![1].spending).toBeCloseTo(10_000 / 1.1 + 5_000, 6);
    expect(res.records![2].spending).toBeCloseTo(0, 6);
  });

  test('recurring and age-based items land in the right years', () => {
    const plan = simplePlan({ spending: 0 });
    plan.datedItems = [
      { id: 'r', label: 'car', direction: 'expense', amount: 1_000, frequency: 'recurring', everyYears: 10, start: { kind: 'age', person: 'you', age: 66 }, fixedDollars: false },
    ];
    const ctx = ctxFor(plan);
    const years = ctx.years.filter((_, t) => ctx.realOut[t] > 0);
    expect(years).toEqual([START + 1, START + 11, START + 21]);
  });
});

describe('amounts fixed in nominal dollars are deflated each year (D63)', () => {
  // 5% real return, 3% inflation. The engine works in today's dollars, so cost basis, Roth principal and
  // conversion amounts (fixed nominal dollars) must shrink with the price level.
  const r = 0.05;
  const inflation = 0.03;

  test('a sale after 20 years realizes the true gain share: 1 − 100,000 / (265,330 × 1.806) = 79.1%', () => {
    const plan = simplePlan({ roth: 0 });
    plan.household.taxable = plan.household.taxableBasis = 100_000;
    const ctx = noYields(buildContext(plan, { stopContributingYear: START + 20, retireYear: START + 20, baseSpending: 40_000 }));
    const rec = simulatePath(ctx, constantPath(ctx.len, r, r, inflation), 0, { record: true }).records![20];
    expect(rec.working).toBe(false);
    const real = 100_000 * (1 + r) ** 20; // 265,329.77
    const priceLevel = (1 + inflation) ** 20; // 1.806
    const gainShare = 1 - 100_000 / (real * priceLevel);
    expect(gainShare).toBeCloseTo(0.791, 3);
    expect(rec.capitalGains / rec.withdrawals.taxable).toBeCloseTo(gainShare, 6);
  });

  test('Roth contributions withdrawable tax-free shrink with inflation', () => {
    const plan = simplePlan({ roth: 100_000, spending: 50_000 });
    plan.you.birthYear = plan.spouse.birthYear = START - 50;
    plan.assumptions.endAge = 80;
    const ctx = ctxFor(plan);
    const s = simulatePath(ctx, constantPath(ctx.len, 0, 0, inflation), 0, { stopIdx: 1 }).state;
    expect(s.roth[0]).toBeCloseTo(50_000, 6); // 0% real return: the real balance is unchanged
    expect(s.rothPrincipal[0]).toBeCloseTo(50_000 / (1 + inflation), 6);
  });

  test('a conversion becomes spendable 5 years later at its deflated value', () => {
    const plan = simplePlan({ roth: 0, spending: 0 });
    plan.you.birthYear = plan.spouse.birthYear = START - 50;
    plan.assumptions.endAge = 80;
    const ctx = ctxFor(plan);
    const start = initialState(ctx);
    start.roth[0] = start.rothPrincipal[0] = start.conversions[0][0] = 30_000;
    const path = constantPath(ctx.len, 0, 0, inflation);
    const seasoned = 30_000 / (1 + inflation) ** 5; // 25,878.26
    const after5 = simulatePath(ctx, path, 0, { startState: start, stopIdx: 5 }).state;
    expect(after5.rothPrincipal[0]).toBeCloseTo(seasoned, 6);
    // Year 5, spending 28,000: only the deflated 25,878.26 comes out free of penalty; the rest is Roth earnings.
    const ctx28 = buildContext(plan, { stopContributingYear: START, retireYear: START, baseSpending: 28_000 });
    const rec = simulatePath(ctx28, path, 0, { startIdx: 5, startState: after5, record: true, stopIdx: 6 }).records![0];
    expect(Math.abs(rec.withdrawals.roth - rec.penaltyWithdrawals - seasoned)).toBeLessThan(1);
    expect(rec.penaltyWithdrawals).toBeGreaterThan(2_000);
  });
});

describe('deflation reaches conversions still inside the 5-year window (D63)', () => {
  test('two years after a conversion, only the other principal is spendable, all at today\u2019s value', () => {
    const plan = simplePlan({ roth: 0, spending: 0 });
    plan.you.birthYear = plan.spouse.birthYear = START - 50;
    plan.assumptions.endAge = 80;
    const ctx = ctxFor(plan);
    const s = initialState(ctx);
    s.roth[0] = s.rothPrincipal[0] = 50_000; // 30,000 contributed + a 20,000 conversion this year
    s.conversions[0][0] = 20_000;
    const recs = simulatePath(ctx, constantPath(ctx.len, 0, 0, 0.03), 0, { startState: s, record: true, stopIdx: 3 }).records!;
    // (50,000 − 20,000) / 1.03² = 28,277.88. Without deflating the conversion it would be 50,000/1.03² − 20,000 = 27,129.
    expect(recs[2].seasonedRoth).toBeCloseTo(30_000 / 1.03 ** 2, 6);
  });
});

describe('dated items outside the plan (fix 22)', () => {
  const plan = simplePlan(); // plan 2026–2055
  const item = (start: DatedTiming, end?: DatedTiming): DatedItem => ({
    id: 'x', label: 'x', direction: 'expense', amount: 1_000, frequency: end ? 'ongoing' : 'oneTime', start, end, fixedDollars: false,
  });

  test('items that add nothing have no years in the plan', () => {
    expect(itemYearsInPlan(plan, item({ kind: 'year', year: 2030 }, { kind: 'year', year: 2028 }))).toEqual([]); // ends before it starts
    expect(itemYearsInPlan(plan, item({ kind: 'year', year: 2020 }))).toEqual([]); // one time, before the plan
    expect(itemYearsInPlan(plan, item({ kind: 'age', person: 'you', age: 50 }))).toEqual([]); // at an age already passed
  });

  test('items inside the plan list their years, cut to the plan', () => {
    expect(itemYearsInPlan(plan, item({ kind: 'year', year: 2054 }, { kind: 'year', year: 2070 }))).toEqual([2054, 2055]);
  });
});
