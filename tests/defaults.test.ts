// Default spending levels (D18, D48).
import { describe, expect, test } from 'vitest';
import { chubbyDefaultSpending, examplePlan, fidelityDefaultSpending } from '../src/engine/defaults';

describe('default spending', () => {
  test('example plan starts at the defaults', () => {
    const plan = examplePlan(2026);
    expect(plan.household.traditionalSpending).toBe(fidelityDefaultSpending(plan));
    expect(plan.household.chubbySpending).toBe(chubbyDefaultSpending(plan));
    expect(plan.household.chubbySpending).toBe(plan.household.currentSpending);
  });

  test('Chubby is 1.0 × the same base as Traditional (dated items paid today excluded)', () => {
    const plan = examplePlan(2026);
    plan.household.currentSpending = 100_000;
    plan.datedItems.push({
      id: 'm', label: 'Mortgage', direction: 'expense', amount: 20_000, frequency: 'ongoing',
      start: { kind: 'year', year: 2020 }, end: { kind: 'year', year: 2040 }, fixedDollars: true,
    });
    expect(chubbyDefaultSpending(plan)).toBe(80_000);
    expect(fidelityDefaultSpending(plan)).toBe(68_000);
  });
});
