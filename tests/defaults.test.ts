// Default spending levels (D18, D57).
import { describe, expect, test } from 'vitest';
import { MIX_SOURCES } from '../src/data/mixPaths';
import { describeAssumptions } from '../src/engine/assumptions';
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

describe('Asset mix over time: defaults and the How-this-works row (D97)', () => {
  const row = (plan: ReturnType<typeof examplePlan>) => {
    const rows = describeAssumptions(plan).filter((r) => r.label.startsWith('Asset mix'));
    expect(rows).toHaveLength(1);
    return rows[0];
  };
  const shiftWhy = 'When the mix changes, the brokerage account pays capital-gains tax on what it sells; retirement accounts and the HSA move tax-free.';
  const vanguardWhy = 'The path’s points come from Vanguard’s prospectus. It is tied to age 65, not to your retirement year, because Vanguard’s research paper “Choice of equity landing points can benefit target-date investors” designs it around retiring at 65.';
  const resetWhy = 'Every invested account holds the year’s mix and is put back to it each year.';

  test('new plans follow Vanguard’s path; your own mix starts as a fixed 70/25/5 with Vanguard’s timing', () => {
    expect(DEFAULT_ASSUMPTIONS).toMatchObject({
      mixPlan: 'vanguard', allocation: { stocks: 0.7, bonds: 0.25, cash: 0.05 }, laterAllocation: { stocks: 0.7, bonds: 0.25, cash: 0.05 },
      shiftStartAge: 40, shiftEndAge: 72,
    });
    expect('retiredAllocation' in DEFAULT_ASSUMPTIONS).toBe(false);
  });

  test('Vanguard (default): the target year, and this year’s, the target year’s and the final mix', () => {
    const plan = examplePlan(2026); // You born 1984: 65 in 2049; 2026 is 23 years before
    expect(row(plan)).toEqual({
      group: 'Markets', label: 'Asset mix', status: 'default', decision: 'D8, D97, D98', source: MIX_SOURCES.vanguard,
      value: 'Vanguard’s Target Retirement path with 2049 as its target year (You: age 65): 87% stocks / 13% bonds in 2026, 50% stocks / 50% bonds in 2049, and 30% stocks / 70% bonds from 2056 on',
      why: `${resetWhy} ${shiftWhy} ${vanguardWhy}`,
    });
  });

  test('Vanguard: the wording still reads when the plan starts before the path moves, past the target year or past its end', () => {
    const at = (age: number) => {
      const plan = examplePlan(2026);
      plan.you.birthYear = 2026 - age;
      return row(plan).value;
    };
    const head = (target: number) => `Vanguard’s Target Retirement path with ${target} as its target year (You: age 65): `;
    expect(at(30)).toBe(`${head(2061)}90% stocks / 10% bonds until 2036, 50% stocks / 50% bonds in 2061, and 30% stocks / 70% bonds from 2068 on`);
    expect(at(68)).toBe(`${head(2023)}41% stocks / 59% bonds in 2026, and 30% stocks / 70% bonds from 2030 on`);
    expect(at(65)).toBe(`${head(2026)}50% stocks / 50% bonds in 2026, and 30% stocks / 70% bonds from 2033 on`);
    expect(at(72)).toBe(`${head(2019)}30% stocks / 70% bonds every year from now on`);
    expect(at(80)).toBe(`${head(2011)}30% stocks / 70% bonds every year from now on`);
  });

  test('Fidelity: 70/25/5 every year, no shift', () => {
    const plan = examplePlan(2026);
    plan.assumptions.mixPlan = 'fidelity';
    expect(row(plan)).toEqual({
      group: 'Markets', label: 'Asset mix', status: 'changed', decision: 'D8, D97', source: MIX_SOURCES.fidelity,
      value: '70% stocks / 25% bonds / 5% cash every year (Fidelity’s FI Planner mix)', why: resetWhy,
    });
  });

  test('your own: a fixed mix, one switch, or yearly steps', () => {
    const plan = examplePlan(2026);
    plan.you.name = 'Ana';
    plan.assumptions.mixPlan = 'own';
    plan.assumptions.allocation = { stocks: 0.6, bonds: 0.4, cash: 0 };
    plan.assumptions.laterAllocation = { stocks: 0.6, bonds: 0.4, cash: 0 };
    expect(row(plan)).toEqual({ group: 'Markets', label: 'Asset mix', status: 'changed', decision: 'D8, D97', value: '60% stocks / 40% bonds every year', why: resetWhy });
    plan.assumptions.laterAllocation = { stocks: 0.4, bonds: 0.5, cash: 0.1 };
    plan.assumptions.shiftStartAge = plan.assumptions.shiftEndAge = 65;
    expect(row(plan)).toMatchObject({ value: '60% stocks / 40% bonds until 2048, then 40% stocks / 50% bonds / 10% cash from 2049 (Ana: age 65)', why: `${resetWhy} ${shiftWhy}` });
    plan.assumptions.shiftStartAge = 55;
    expect(row(plan)).toMatchObject({
      value: '60% stocks / 40% bonds until 2038, then 11 equal yearly steps from 2039 to 2049 (Ana: ages 55 to 65), reaching 40% stocks / 50% bonds / 10% cash',
      status: 'changed',
    });
    expect(row(plan).source).toBeUndefined();
  });
});
