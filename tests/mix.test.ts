// "Asset mix over time" (D97): each calendar year's mix under the three choices, and the share each shift sells.
import { describe, expect, test } from 'vitest';
import { FIDELITY_MIX } from '../src/data/mixPaths';
import { mixByYear, planYears } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import { mixInYear, mixLabel, mixPercents, mixShiftYears, shiftShare } from '../src/engine/mix';
import type { Plan } from '../src/engine/types';

const BORN = 1984; // You in examplePlan(2026): 65 in 2049
const AT65 = BORN + 65;

function planWith(edit: (a: Plan['assumptions']) => void): Plan {
  const plan = examplePlan(2026);
  edit(plan.assumptions);
  return plan;
}

describe('Vanguard’s Target Retirement path (the default)', () => {
  const plan = examplePlan(2026);
  const at = (k: number) => mixInYear(plan, AT65 + k);

  test('flat at 90% stocks 25 or more years before 65, flat at 30% from 7 years after; the points themselves exactly', () => {
    expect(plan.you.birthYear).toBe(BORN);
    expect(at(-30)).toEqual({ stocks: 0.9, bonds: 1 - 0.9, cash: 0 });
    expect(at(-25)).toEqual({ stocks: 0.9, bonds: 1 - 0.9, cash: 0 });
    expect(at(-5)).toEqual({ stocks: 0.6, bonds: 1 - 0.6, cash: 0 });
    expect(at(0)).toEqual({ stocks: 0.5, bonds: 0.5, cash: 0 });
    expect(at(7)).toEqual({ stocks: 0.3, bonds: 1 - 0.3, cash: 0 });
    expect(at(30)).toEqual({ stocks: 0.3, bonds: 1 - 0.3, cash: 0 });
  });

  test('straight lines between the points; the rest is bonds, no cash', () => {
    // −25 → −5: 90% → 60%, 1.5 points a year. −5 → 0: 60% → 50%, 2 a year. 0 → 7: 50% → 30%, 20/7 a year.
    const cases: [number, number][] = [[-24, 0.885], [-15, 0.75], [-3, 0.56], [3, 0.5 - 0.2 * 3 / 7]];
    for (const [k, stocks] of cases) {
      const m = at(k);
      expect(m.stocks, String(k)).toBeCloseTo(stocks, 14);
      expect(m.bonds, String(k)).toBe(1 - m.stocks);
      expect(m.cash).toBe(0);
    }
  });

  test('changes from 24 years before 65 to 7 years after', () => {
    expect(mixShiftYears(plan)).toEqual({ first: AT65 - 24, last: AT65 + 7 });
    expect(mixInYear(plan, AT65 - 25)).toEqual(mixInYear(plan, AT65 - 26));
    expect(mixInYear(plan, AT65 - 24)).not.toEqual(mixInYear(plan, AT65 - 25));
    expect(mixInYear(plan, AT65 + 8)).toEqual(mixInYear(plan, AT65 + 7));
  });

  test('follows You, not Spouse', () => {
    const p = examplePlan(2026);
    p.spouse.birthYear = 1950;
    expect(mixInYear(p, 2030)).toEqual(mixInYear(plan, 2030));
    p.you.birthYear = BORN + 1;
    expect(mixInYear(p, 2031)).toEqual(mixInYear(plan, 2030));
  });
});

test('Fidelity: 70/25/5 every year, no shifts', () => {
  const plan = planWith((a) => { a.mixPlan = 'fidelity'; a.allocation = { stocks: 0.2, bonds: 0.8, cash: 0 }; });
  for (const y of [1990, 2026, AT65, 2100]) expect(mixInYear(plan, y)).toEqual(FIDELITY_MIX);
  expect(mixShiftYears(plan)).toBeNull();
});

describe('your own mix: equal yearly steps between two ages of You', () => {
  const A = { stocks: 0.8, bonds: 0.2, cash: 0 };
  const B = { stocks: 0.4, bonds: 0.5, cash: 0.1 };
  const own = (start: number, end: number, first = A, later = B) => planWith((a) => {
    a.mixPlan = 'own';
    a.allocation = { ...first };
    a.laterAllocation = { ...later };
    a.shiftStartAge = start;
    a.shiftEndAge = end;
  });

  test('ages 50–53: four steps, a quarter each, the first in the year You turns 50', () => {
    const plan = own(50, 53);
    const atAge = (age: number) => mixInYear(plan, BORN + age);
    expect(atAge(40)).toEqual(A);
    expect(atAge(49)).toEqual(A);
    for (const [age, w] of [[50, 0.25], [51, 0.5], [52, 0.75]]) {
      const m = atAge(age);
      expect(m.stocks).toBeCloseTo((1 - w) * 0.8 + w * 0.4, 14);
      expect(m.bonds).toBeCloseTo((1 - w) * 0.2 + w * 0.5, 14);
      expect(m.cash).toBeCloseTo(w * 0.1, 14);
    }
    expect(atAge(53)).toEqual(B);
    expect(atAge(54)).toEqual(B);
    expect(atAge(90)).toEqual(B);
    expect(mixShiftYears(plan)).toEqual({ first: BORN + 50, last: BORN + 53 });
  });

  test('the same age twice is one switch in that year', () => {
    const plan = own(65, 65);
    expect(mixInYear(plan, AT65 - 1)).toEqual(A);
    expect(mixInYear(plan, AT65)).toEqual(B);
    expect(mixShiftYears(plan)).toEqual({ first: AT65, last: AT65 });
  });

  test('the same mix twice is a fixed mix whatever the ages', () => {
    const plan = own(40, 72, A, A);
    for (const age of [30, 40, 55, 72, 80]) expect(mixInYear(plan, BORN + age)).toEqual(A);
    expect(mixShiftYears(plan)).toBeNull();
  });

  test('defined before the plan starts too', () => {
    // You were 16 in 2000: before a switch at 30 → the first mix; after one at 10 → the later mix.
    expect(mixInYear(own(30, 30), 2000)).toEqual(A);
    expect(mixInYear(own(10, 10), 2000)).toEqual(B);
  });
});

test('shiftShare: the sum of the shares that shrink', () => {
  expect(shiftShare({ stocks: 0.7, bonds: 0.25, cash: 0.05 }, { stocks: 0.4, bonds: 0.5, cash: 0.1 })).toBeCloseTo(0.3, 15);
  expect(shiftShare({ stocks: 0.4, bonds: 0.5, cash: 0.1 }, { stocks: 0.7, bonds: 0.25, cash: 0.05 })).toBeCloseTo(0.3, 15);
  expect(shiftShare({ stocks: 0.7, bonds: 0.25, cash: 0.05 }, { stocks: 0, bonds: 1, cash: 0 })).toBeCloseTo(0.75, 15);
  expect(shiftShare(FIDELITY_MIX, { ...FIDELITY_MIX })).toBe(0);
  // The same expression order as D96's switch share, so a single switch is bit-identical.
  const [p, n] = [{ stocks: 0.7, bonds: 0.25, cash: 0.05 }, { stocks: 0.4, bonds: 0.5, cash: 0.1 }];
  expect(shiftShare(p, n)).toBe(Math.max(0, p.stocks - n.stocks) + Math.max(0, p.bonds - n.bonds) + Math.max(0, p.cash - n.cash));
});

test('mixByYear: one mix per plan year, the same as mixInYear', () => {
  for (const mixPlan of ['vanguard', 'fidelity', 'own'] as const) {
    const plan = planWith((a) => { a.mixPlan = mixPlan; a.laterAllocation = { stocks: 0.3, bonds: 0.7, cash: 0 }; });
    const mixes = mixByYear(plan);
    const { len } = planYears(plan);
    expect(mixes).toHaveLength(len);
    mixes.forEach((m, t) => expect(m).toEqual(mixInYear(plan, 2026 + t)));
  }
});

describe('mixPercents: whole percents that always add up to 100', () => {
  const sum = (p: number[]) => p[0] + p[1] + p[2];
  test('largest remainder, ties to stocks then bonds', () => {
    expect(mixPercents({ stocks: 0.645, bonds: 0.355, cash: 0 })).toEqual([65, 35, 0]); // not 65/36
    expect(mixPercents({ stocks: 0.885, bonds: 0.115, cash: 0 })).toEqual([89, 11, 0]);
    expect(mixPercents({ stocks: 0.7, bonds: 0.25, cash: 0.05 })).toEqual([70, 25, 5]);
    expect(mixPercents({ stocks: 0.9, bonds: 1 - 0.9, cash: 0 })).toEqual([90, 10, 0]); // 1 − 0.9 = 0.0999…
    expect(mixPercents({ stocks: 0.505, bonds: 0.25, cash: 0.245 })).toEqual([51, 25, 24]); // equal .5 remainders: stocks
  });

  test('awkward blends', () => {
    const vanguard3 = mixInYear(examplePlan(2026), AT65 + 3); // 0.5 − 0.6/7 stocks
    expect(vanguard3.stocks).toBeCloseTo(0.5 - 0.6 / 7, 14);
    expect(mixPercents(vanguard3)).toEqual([41, 59, 0]);
    const blend = mixPercents({ stocks: 0.55, bonds: 0.375, cash: 0.075 });
    expect(sum(blend)).toBe(100);
    expect(blend).toEqual([55, 38, 7]); // .5 remainders tie: bonds before cash
    for (let k = -30; k <= 30; k++) expect(sum(mixPercents(mixInYear(examplePlan(2026), AT65 + k))), String(k)).toBe(100);
  });
});

test('mixLabel: whole percents from mixPercents, a zero cash share left out', () => {
  expect(mixLabel(FIDELITY_MIX)).toBe('70% stocks / 25% bonds / 5% cash');
  expect(mixLabel({ stocks: 0.5, bonds: 0.5, cash: 0 })).toBe('50% stocks / 50% bonds');
  expect(mixLabel({ stocks: 0.9, bonds: 1 - 0.9, cash: 0 })).toBe('90% stocks / 10% bonds');
  expect(mixLabel({ stocks: 0.55, bonds: 0.375, cash: 0.075 })).toBe('55% stocks / 38% bonds / 7% cash');
});
