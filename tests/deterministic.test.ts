// Layer 1: fixed returns, no volatility — the engine must match hand arithmetic exactly.
import { describe, expect, test } from 'vitest';
import { constantPath } from '../src/engine/returns';
import { simulatePath } from '../src/engine/simulate';
import { ctxFor, simplePlan, START } from './helpers';

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
    // 1% less today fails before the end of a long plan.
    const short = ctxFor(simplePlan({ roth: needToday * 0.99, years: 60 }), scenario);
    expect(simulatePath(short, constantPath(short.len, r), 0).endBalance).toBeLessThan(perpetuity);
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
