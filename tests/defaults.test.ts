// Default spending levels (D18, D57).
import { describe, expect, test } from 'vitest';
import { DEFAULT_ASSUMPTIONS, chubbyDefaultSpending, examplePlan, searchPathsFor, fidelityDefaultSpending, untouchedSections } from '../src/engine/defaults';

describe('default spending', () => {
  test('Roth conversions fill the 10% bracket by default (decision 3, D29)', () => {
    expect(DEFAULT_ASSUMPTIONS.bracketFill).toBe('10');
  });

  test('the quick-search sample follows the number of markets, never a past keystroke (fix 23, D5)', () => {
    expect(searchPathsFor(30_000)).toBe(2_000);
    expect(searchPathsFor(1_000)).toBe(1_000);
  });

  test('example plan starts at the defaults', () => {
    const plan = examplePlan(2026);
    expect(plan.household.traditionalSpending).toBe(fidelityDefaultSpending(plan));
    expect(plan.household.chubbySpending).toBe(chubbyDefaultSpending(plan));
    expect(plan.household.chubbySpending).toBe(plan.household.currentSpending * 1.2);
  });

  test('Chubby is 1.2 × the same base as Traditional (dated items paid today excluded)', () => {
    const plan = examplePlan(2026);
    plan.household.currentSpending = 100_000;
    plan.datedItems.push({
      id: 'm', label: 'Mortgage', direction: 'expense', amount: 20_000, frequency: 'ongoing',
      start: { kind: 'year', year: 2020 }, end: { kind: 'year', year: 2040 }, fixedDollars: true,
    });
    expect(chubbyDefaultSpending(plan)).toBe(96_000);
    expect(fidelityDefaultSpending(plan)).toBe(68_000);
  });
});

describe('sections still holding example values (fix 2)', () => {
  const ALL = ['People', 'Balances', 'Yearly contributions', 'Spending', 'Healthcare', 'Social Security'];

  test('the example plan is example everywhere', () => {
    expect(untouchedSections(examplePlan(2026))).toEqual(ALL);
  });

  test('a section clears only when no part of it still matches the example', () => {
    const plan = examplePlan(2026);
    plan.you.birthYear = plan.spouse.birthYear = 1991; // People edited: both birth years changed
    plan.you.balances.pretax = 60_000; // Balances: only your part edited, spouse's and household's untouched
    expect(untouchedSections(plan)).toEqual(ALL.filter((s) => s !== 'People'));
    plan.spouse.balances.pretax = 0;
    plan.household.cash = 20_000;
    expect(untouchedSections(plan)).not.toContain('Balances');
  });

  test('a plan with every section edited has none left', () => {
    const plan = examplePlan(2026);
    for (const p of [plan.you, plan.spouse]) {
      p.salary = 80_000;
      p.balances.roth = 10_000;
      p.contributions.pretax = 10_000;
      p.healthcare.preMedicare = 12_000;
      p.socialSecurity.manualPia = 1_800;
    }
    plan.household.taxable = 50_000;
    plan.household.taxableContribution = 5_000;
    plan.household.traditionalSpending = 60_000;
    expect(untouchedSections(plan)).toEqual([]);
  });
});
