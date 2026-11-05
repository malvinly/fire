// What the Investments section says about "Asset mix over time" (D97), and which shift ages it refuses.
import { describe, expect, test } from 'vitest';
import { FIDELITY_MIX } from '../src/data/mixPaths';
import { DEFAULT_ASSUMPTIONS, examplePlan } from '../src/engine/defaults';
import type { Plan } from '../src/engine/types';
import { MIX_AGE_RANGE_MESSAGE, fidelityOptionLabel, fidelitySentence, ownMixLine, resetAdvancedAssumptions, shiftAgeProblem, vanguardSentence, withShare } from '../src/ui/mixText';

/** The example plan (2026) with You born in `born` and optionally renamed. */
function planFor(born = 1984, name = 'You'): Plan {
  const plan = examplePlan(2026);
  plan.you.birthYear = born;
  plan.you.name = name;
  return plan;
}

describe('Vanguard sentence', () => {
  test('example plan: You 65 in 2049, this year and the points still ahead', () => {
    expect(vanguardSentence(planFor())).toBe(
      'Follows the path Vanguard publishes for its Target Retirement funds, tied to the year you turn 65 (2049): ' +
        '87% stocks in 2026, 60% in 2044, 50% in 2049 and 30% from 2056; the rest in bonds.',
    );
  });

  test('a real name', () => {
    expect(vanguardSentence(planFor(1984, 'Ana'))).toContain('tied to the year Ana turns 65 (2049): ');
  });

  test('the default name is recognised as the rest of the UI does (whose), spaces and case included', () => {
    expect(vanguardSentence(planFor(1984, ' you '))).toContain('tied to the year you turn 65 (2049): ');
  });

  test('You aged 30: before the path moves, so it starts with the flat stretch', () => {
    expect(vanguardSentence(planFor(1996))).toBe(
      'Follows the path Vanguard publishes for its Target Retirement funds, tied to the year you turn 65 (2061): ' +
        '90% stocks until 2036, 60% in 2056, 50% in 2061 and 30% from 2068; the rest in bonds.',
    );
  });

  test('You aged 68: past 65, one point left', () => {
    expect(vanguardSentence(planFor(1958, 'Ana'))).toBe(
      'Follows the path Vanguard publishes for its Target Retirement funds, tied to the year Ana turned 65 (2023): ' +
        '41% stocks in 2026 and 30% from 2030; the rest in bonds.',
    );
  });

  test('You aged 80: past every point, a fixed mix', () => {
    expect(vanguardSentence(planFor(1946))).toBe(
      'Follows the path Vanguard publishes for its Target Retirement funds, tied to the year you turned 65 (2011): ' +
        '30% stocks every year (its final mix since 2018); the rest in bonds.',
    );
  });
});

test('Fidelity sentence', () => {
  expect(fidelitySentence()).toBe('70% stocks / 25% bonds / 5% cash every year, the mix Fidelity’s FI Planner uses.');
});

describe('own-mix line', () => {
  const own = (edit: (a: Plan['assumptions']) => void, name = 'You') => {
    const plan = planFor(1984, name);
    plan.assumptions.mixPlan = 'own';
    edit(plan.assumptions);
    return plan;
  };

  test('the same mix twice: held every year, whatever the ages', () => {
    expect(ownMixLine(own(() => {}))).toBe('70% stocks / 25% bonds / 5% cash, held every year.');
  });

  test('the same age twice: one switch in that calendar year', () => {
    const plan = own((a) => { a.laterAllocation = { stocks: 0.4, bonds: 0.6, cash: 0 }; a.shiftStartAge = 65; a.shiftEndAge = 65; });
    expect(ownMixLine(plan)).toBe(
      'One switch in 2049, the year you turn 65: from 70% stocks / 25% bonds / 5% cash to 40% stocks / 60% bonds. ' +
        'In 2026: 70% stocks / 25% bonds / 5% cash.',
    );
  });

  test('a switch already behind: past tense, and this year holds the later mix', () => {
    const plan = own((a) => { a.laterAllocation = { stocks: 0.4, bonds: 0.6, cash: 0 }; a.shiftStartAge = 40; a.shiftEndAge = 40; }, 'Ana');
    expect(ownMixLine(plan)).toBe(
      'One switch in 2024, the year Ana turned 40: from 70% stocks / 25% bonds / 5% cash to 40% stocks / 60% bonds. ' +
        'In 2026: 40% stocks / 60% bonds.',
    );
  });

  test('different ages: equal yearly steps, years and ages named', () => {
    const plan = own((a) => { a.laterAllocation = { stocks: 0.3, bonds: 0.7, cash: 0 }; });
    expect(ownMixLine(plan)).toBe(
      '33 equal yearly steps, one in each year from 2024 to 2056 (your ages 40 to 72): from 70% stocks / 25% bonds / 5% cash ' +
        'to 30% stocks / 70% bonds. In 2026: 66% stocks / 29% bonds / 5% cash.',
    );
    expect(ownMixLine(own((a) => { a.laterAllocation = { stocks: 0.3, bonds: 0.7, cash: 0 }; }, 'Ana'))).toContain('(Ana’s ages 40 to 72)');
  });
});

describe('shift ages', () => {
  const a = { ...examplePlan(2026).assumptions, shiftStartAge: 40, shiftEndAge: 72 };

  test('the start may not go above the finish, nor the finish below the start', () => {
    expect(shiftAgeProblem(a, 'start', 73)).toBe('Can’t be above the finish age (72). Raise that first.');
    expect(shiftAgeProblem(a, 'end', 39)).toBe('Can’t be below the start age (40). Lower that first.');
  });

  test('equal ages and ordinary ages are fine', () => {
    expect(shiftAgeProblem(a, 'start', 72)).toBeNull();
    expect(shiftAgeProblem(a, 'end', 40)).toBeNull();
    expect(shiftAgeProblem(a, 'start', 0)).toBeNull();
    expect(shiftAgeProblem(a, 'end', 130)).toBeNull();
  });

  test('outside the age limits or not whole', () => {
    expect(shiftAgeProblem(a, 'start', -1)).toBe(MIX_AGE_RANGE_MESSAGE);
    expect(shiftAgeProblem(a, 'end', 131)).toBe(MIX_AGE_RANGE_MESSAGE);
    expect(shiftAgeProblem(a, 'start', 40.5)).toBe(MIX_AGE_RANGE_MESSAGE);
  });
});

describe('Reset assumptions to defaults', () => {
  const INVESTMENTS = ['mixPlan', 'allocation', 'laterAllocation', 'shiftStartAge', 'shiftEndAge', 'feeRate'] as const;
  const edited = () => {
    const a = structuredClone(DEFAULT_ASSUMPTIONS);
    Object.assign(a, {
      endAge: 100, targetSuccess: 0.95, wageGrowth: 0.02, stateTaxRate: 0, bracketFill: '22', paths: 20_000, seed: 7,
      ssTrustFund: { ...a.ssTrustFund, startPct: 1 },
      mixPlan: 'own', allocation: { stocks: 0.6, bonds: 0.4, cash: 0 }, laterAllocation: { stocks: 0.3, bonds: 0.6, cash: 0.1 },
      shiftStartAge: 50, shiftEndAge: 60, feeRate: 0.005,
    });
    return a;
  };

  test('everything shown under Assumptions (advanced) returns to the defaults; the Investments fields stay', () => {
    const a = edited();
    const r = resetAdvancedAssumptions(a);
    const expected = { ...structuredClone(DEFAULT_ASSUMPTIONS) } as Record<string, unknown>;
    for (const k of INVESTMENTS) expected[k] = a[k];
    expect(r).toEqual(expected);
    for (const k of INVESTMENTS) expect(r[k]).toEqual(a[k]);
    expect(a.endAge).toBe(100); // the input is left alone
  });

  test('a fresh object: nothing shared with DEFAULT_ASSUMPTIONS or the input', () => {
    const a = edited();
    const r = resetAdvancedAssumptions(a);
    expect(r).not.toBe(DEFAULT_ASSUMPTIONS);
    expect(r.ssTrustFund).not.toBe(DEFAULT_ASSUMPTIONS.ssTrustFund);
    expect(r.allocation).not.toBe(a.allocation);
    expect(r.laterAllocation).not.toBe(a.laterAllocation);
  });
});

test('the Fidelity option label is built from FIDELITY_MIX', () => {
  expect(fidelityOptionLabel()).toBe('Fidelity’s fixed mix (70/25/5)');
});

describe('withShare: stocks + bonds within 100%, cash the rest', () => {
  const m = { stocks: 0.6, bonds: 0.4, cash: 0 };

  test('each share is clamped to 0–100%', () => {
    expect(withShare(m, 'stocks', 1.5)).toEqual({ stocks: 1, bonds: 0, cash: 0 });
    expect(withShare(m, 'bonds', -0.2)).toEqual({ stocks: 0.6, bonds: 0, cash: 0.4 });
  });

  test('the other share shrinks so the two never exceed 100%; it is not raised', () => {
    expect(withShare(m, 'stocks', 0.7)).toEqual({ stocks: 0.7, bonds: 0.3, cash: 0 });
    expect(withShare(m, 'bonds', 0.5)).toEqual({ stocks: 0.5, bonds: 0.5, cash: 0 });
    expect(withShare(m, 'stocks', 0.5)).toEqual({ stocks: 0.5, bonds: 0.4, cash: 0.1 });
  });

  test('cash is the rest, rounded to 6 decimals; the input is left alone', () => {
    expect(withShare(m, 'bonds', 0.333).cash).toBe(0.067);
    expect(m).toEqual({ stocks: 0.6, bonds: 0.4, cash: 0 });
  });

  test('entering 70 then 25 gives exactly FIDELITY_MIX, so the engine sees a fixed mix', () => {
    const r = withShare(withShare(m, 'stocks', 70 / 100), 'bonds', 25 / 100);
    expect(r.stocks).toBe(FIDELITY_MIX.stocks);
    expect(r.bonds).toBe(FIDELITY_MIX.bonds);
    expect(r.cash).toBe(FIDELITY_MIX.cash);
  });
});
