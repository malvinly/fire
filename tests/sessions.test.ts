// Loading session files and the browser draft (D62, D65).
import { describe, expect, test } from 'vitest';
import { DEFAULT_ASSUMPTIONS, examplePlan } from '../src/engine/defaults';
import { planProblems } from '../src/engine/validate';
import { makeSession, parseSession } from '../src/ui/sessions';

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
