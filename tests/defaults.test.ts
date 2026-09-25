// Default spending levels (D18, D57).
import { describe, expect, test } from 'vitest';
import { DEFAULT_ASSUMPTIONS, chubbyDefaultSpending, examplePlan, exampleStatus, searchPathsFor, fidelityDefaultSpending, untouchedSections } from '../src/engine/defaults';

describe('default spending', () => {
  test('Roth conversions fill the 10% bracket by default (D29)', () => {
    expect(DEFAULT_ASSUMPTIONS.bracketFill).toBe('10');
  });

  test('the quick-search sample follows the number of markets, never a past keystroke (D5)', () => {
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

describe('fields still holding example values (D64)', () => {
  const ALL = ['People', 'Balances', 'Yearly contributions', 'Spending', 'Healthcare', 'Social Security'];

  test('the example plan is example everywhere, except fields whose example value is 0', () => {
    const plan = examplePlan(2026);
    expect(untouchedSections(plan)).toEqual(ALL);
    const { examples, fields, counts } = exampleStatus(plan);
    expect(examples.get('you.salary')).toBe(100_000);
    expect(examples.has('you.balances.hsa')).toBe(false); // never checked, so never restored either
    expect(fields.has('you.salary')).toBe(true);
    expect(fields.has('spouse.balances.roth')).toBe(true);
    expect(fields.has('household.cash')).toBe(true);
    expect(fields.has('you.balances.hsa')).toBe(false); // example HSA balance is 0
    expect(fields.has('household.cashContribution')).toBe(false); // example cash savings are 0
    expect(counts).toEqual({ People: 4, Balances: 9, 'Yearly contributions': 5, Spending: 3, Healthcare: 4, 'Social Security': 2 });
  });

  test('a field clears as soon as it changes; a section clears only when every field in it has', () => {
    const plan = examplePlan(2026);
    plan.you.balances.pretax = 60_000;
    let st = exampleStatus(plan);
    expect(st.fields.has('you.balances.pretax')).toBe(false);
    expect(st.fields.has('spouse.balances.pretax')).toBe(true);
    expect(st.counts.Balances).toBe(8);
    expect(untouchedSections(plan)).toEqual(ALL);
    for (const p of [plan.you, plan.spouse]) p.balances = { pretax: 1, roth: 2, rothBasis: 3, hsa: 4 };
    plan.household.taxable = 50_000;
    plan.household.taxableBasis = 40_000;
    plan.household.cash = 20_000;
    st = exampleStatus(plan);
    expect(st.counts.Balances).toBe(0);
    expect(untouchedSections(plan)).toEqual(ALL.filter((s) => s !== 'Balances'));
  });

  test('typing the example number back makes the field an example again', () => {
    const plan = examplePlan(2026);
    plan.you.salary = 70_000;
    const st = exampleStatus(plan);
    expect(st.fields.has('you.salary')).toBe(false);
    expect(st.examples.get('you.salary')).toBe(100_000); // still known, so an emptied box can go back to it
    plan.you.salary = 100_000;
    expect(exampleStatus(plan).fields.has('you.salary')).toBe(true);
  });

  test('moving the plan start on an untouched example still flags People (the salaries are still the example’s)', () => {
    const plan = examplePlan(2026);
    plan.startYear = 2027;
    const st = exampleStatus(plan);
    expect(st.fields.has('you.birthYear')).toBe(false); // the example's birth years moved with the start year
    expect(st.fields.has('you.salary')).toBe(true);
    expect(untouchedSections(plan)).toContain('People');
  });

  test('the statement benefit counts only while the benefit comes from the statement', () => {
    const plan = examplePlan(2026);
    plan.you.socialSecurity.mode = 'record';
    const st = exampleStatus(plan);
    expect(st.examples.has('you.socialSecurity.manualPia')).toBe(false);
    expect(st.fields.has('you.socialSecurity.manualPia')).toBe(false);
    expect(st.fields.has('spouse.socialSecurity.manualPia')).toBe(true);
    expect(st.counts['Social Security']).toBe(1);
  });

  test('a plan with every field edited has none left', () => {
    const plan = examplePlan(2026);
    for (const p of [plan.you, plan.spouse]) {
      p.salary = 80_000;
      p.birthYear -= 1;
      p.balances = { pretax: 1, roth: 2, rothBasis: 1, hsa: 0 };
      p.contributions = { pretax: 1, employerMatch: 1, roth: 0, hsa: 0 };
      p.healthcare = { preMedicare: 1, medicare: 1 };
      p.socialSecurity.manualPia = 1_800;
    }
    plan.household.taxable = 50_000;
    plan.household.taxableBasis = 40_000;
    plan.household.cash = 20_000;
    plan.household.taxableContribution = 5_000;
    plan.household.currentSpending = 80_000;
    plan.household.traditionalSpending = 60_000;
    plan.household.chubbySpending = null;
    expect(untouchedSections(plan)).toEqual([]);
    expect(exampleStatus(plan).fields.size).toBe(0);
  });
});
