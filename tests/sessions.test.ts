// Loading session files and the browser draft (D62, D65).
import { describe, expect, test } from 'vitest';
import { DEFAULT_ASSUMPTIONS, examplePlan } from '../src/engine/defaults';
import { constantPath } from '../src/engine/returns';
import { simulatePath } from '../src/engine/simulate';
import { planProblems } from '../src/engine/validate';
import type { Detail } from '../src/engine/solve';
import { moneyShort } from '../src/ui/format';
import { detailArea, detailMatches, detailSelection, makeSession, parseSession } from '../src/ui/sessions';
import { ctxFor, simplePlan, START } from './helpers';

function sessionText(edit: (plan: Record<string, unknown>) => void = () => {}): string {
  const s = JSON.parse(JSON.stringify(makeSession('test', examplePlan(2026), null)));
  edit(s.plan);
  return JSON.stringify(s);
}

describe('older plan files', () => {
  test('a missing assumption is filled with its default', () => {
    const s = parseSession(sessionText((plan) => { delete (plan.assumptions as Record<string, unknown>).seed; }));
    expect(s.plan.assumptions.seed).toBe(DEFAULT_ASSUMPTIONS.seed);
  });
});

test('dated income saved before the "taxed" flag existed is taxed (D66)', () => {
  const s = parseSession(sessionText((plan) => {
    plan.datedItems = [
      { id: 'p', label: 'pension', direction: 'income', amount: 20_000, frequency: 'ongoing', start: { kind: 'year', year: 2040 }, fixedDollars: false },
      { id: 'r', label: 'roof', direction: 'expense', amount: 20_000, frequency: 'oneTime', start: { kind: 'year', year: 2030 }, fixedDollars: false },
    ];
  }));
  expect(s.plan.datedItems[0].taxable).toBe(true);
  expect(s.plan.datedItems[1].taxable).toBeUndefined();
});

describe('damaged or out-of-range plans are rejected with a clear message (D71)', () => {
  const cases: [string, (plan: any) => void, RegExp][] = [
    ['missing dated items', (p) => { delete p.datedItems; }, /datedItems/],
    ['a balance saved as text', (p) => { p.household.taxable = '150000'; }, /household\.taxable/],
    ['birth month 0', (p) => { p.you.birthMonth = 0; }, /you\.birthMonth/],
    ['claim age 50', (p) => { p.spouse.socialSecurity.claimAge = 50; }, /spouse\.socialSecurity\.claimAge/],
    ['chunk size 0', (p) => { p.assumptions.blockLength = 0; }, /assumptions\.blockLength/],
    ['0 simulated markets', (p) => { p.assumptions.paths = 0; }, /assumptions\.paths/],
    ['a negative balance', (p) => { p.you.balances.pretax = -5_000; }, /you\.balances\.pretax/],
    ['a tax rate above 100%', (p) => { p.assumptions.stateTaxRate = 1.5; }, /assumptions\.stateTaxRate/],
    ['a trust-fund share below 0%', (p) => { p.assumptions.ssTrustFund.endPct = -0.1; }, /assumptions\.ssTrustFund\.endPct/],
    ['a fractional plan age', (p) => { p.assumptions.endAge = 96.5; }, /assumptions\.endAge/],
    ['an unknown dated-item frequency', (p) => { p.datedItems = [{ id: 'x', label: 'x', direction: 'expense', amount: 1, frequency: 'weekly', start: { kind: 'year', year: 2030 }, fixedDollars: false }]; }, /datedItems\[0\]\.frequency/],
  ];
  for (const [name, edit, field] of cases) {
    test(name, () => {
      expect(() => parseSession(sessionText(edit))).toThrow(field);
    });
  }

  test('a valid plan has no problems', () => {
    expect(planProblems(examplePlan(2026))).toEqual([]);
  });
});

describe('review fixes: what blocks loading and what only blocks Calculate', () => {
  test('a plan whose start year is before a birth year still loads; Calculate is blocked with a reason', () => {
    const s = parseSession(sessionText((p) => { p.startYear = 1980; }));
    expect(s.plan.startYear).toBe(1980);
    expect(planProblems(s.plan).join(' ')).toMatch(/born after the plan starts/);
  });

  test('a stale Coast age loads, and Calculate names both limits', () => {
    const young = parseSession(sessionText((p: any) => { p.household.coastRetireAge = 30; })); // You is 42
    expect(planProblems(young.plan).join(' ')).toMatch(/above You’s current age \(42\)/);
    const late = parseSession(sessionText((p: any) => { p.household.coastRetireAge = 100; }));
    expect(planProblems(late.plan).join(' ')).toMatch(/before the plan ends in 2082/);
  });

  test('a dated item dated absurdly far away is rejected (it would loop over every year)', () => {
    expect(() => parseSession(sessionText((p) => {
      p.datedItems = [{ id: 'x', label: 'x', direction: 'expense', amount: 1, frequency: 'ongoing', start: { kind: 'year', year: -1_000_000_000 }, fixedDollars: false }];
    }))).toThrow(/datedItems\[0\]\.start\.year/);
  });

  test('saved results the results view can’t read are rejected', () => {
    const s = JSON.parse(sessionText());
    s.results = { calculatedAt: 'x', tiers: [{}], detail: {} };
    expect(() => parseSession(JSON.stringify(s))).toThrow(/damaged/);
  });
});

describe('the saved detail view of a stale session is shown only for the choice it was saved for (D85)', () => {
  const saved = (tier: Detail['tier'], retireYear: number, stopContributingYear: number) =>
    ({ tier, scenario: { retireYear, stopContributingYear, baseSpending: 60_000 } }) as Detail;

  test('Coast is saved for its stop-saving year, the others for their retirement year', () => {
    expect(detailSelection(saved('coast', 2050, 2035))).toEqual({ tier: 'coast', year: 2035 });
    expect(detailSelection(saved('traditional', 2040, 2040))).toEqual({ tier: 'traditional', year: 2040 });
  });

  test('matches only the same FIRE type and year', () => {
    const coast = saved('coast', 2050, 2035);
    expect(detailMatches(coast, 'coast', 2035)).toBe(true);
    expect(detailMatches(coast, 'coast', 2050)).toBe(false);
    expect(detailMatches(coast, 'coast', 2036)).toBe(false);
    expect(detailMatches(coast, 'traditional', 2035)).toBe(false);
    expect(detailMatches(saved('chubby', 2042, 2042), 'chubby', 2042)).toBe(true);
  });

  test('no saved detail or no year never matches', () => {
    expect(detailMatches(null, 'traditional', 2040)).toBe(false);
    expect(detailMatches(saved('traditional', 2040, 2040), 'traditional', null)).toBe(false);
  });

  test('stale results show the saved detail only for its own choice, otherwise the note; fresh results show what was fetched', () => {
    const d = saved('traditional', 2040, 2040);
    expect(detailArea(true, d, 'traditional', 2040)).toBe('detail');
    expect(detailArea(true, d, 'traditional', 2041)).toBe('note');
    expect(detailArea(true, d, 'chubby', 2040)).toBe('note');
    expect(detailArea(true, null, 'traditional', 2040)).toBe('note'); // saved without a detail
    // Fresh results: the fetched detail stays on screen (dimmed) while the next selection loads.
    expect(detailArea(false, d, 'traditional', 2041)).toBe('detail');
    expect(detailArea(false, null, 'traditional', 2040)).toBe('none');
  });
});

test('detail saved before the “Reinvested” column existed still opens, and the column shows “—”', () => {
  const ctx = ctxFor(simplePlan());
  const medianPath = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true, stopIdx: 2 }).records!;
  for (const r of medianPath) delete r.reinvested;
  const s = JSON.parse(sessionText());
  s.results = {
    calculatedAt: 'x', tiers: [],
    detail: {
      tier: 'traditional', scenario: { retireYear: START, stopContributingYear: START, baseSpending: 40_000 },
      success: { combined: 1, bootstrap: 1, historical: 1 }, penaltyRate: 0, years: [START, START + 1],
      bands: { p50: [], p25: [], p10: [] }, worstHistorical: [], historicalCount: 0, medianPath, p10Path: medianPath, pia: [0, 0],
    },
  };
  const loaded = parseSession(JSON.stringify(s)).results!.detail!.medianPath;
  expect(loaded).toHaveLength(2);
  expect(loaded[0].reinvested).toBeUndefined();
  expect(moneyShort(loaded[0].reinvested)).toBe('—');
});
