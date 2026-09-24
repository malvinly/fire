// Layer 3: Social Security against SSA's published "Benefit Calculation Examples for Workers Retiring in 2026"
// (ssa.gov/oact/progdata/retirebenefit1.html and retirebenefit2.html).
import { describe, expect, test } from 'vitest';
import { computePia, ownClaimFactor, payableShare, piaFromAime, spousalClaimFactor, annualBenefits } from '../src/engine/socialSecurity';
import { SOCIAL_SECURITY, TRUST_FUND_DEFAULT } from '../src/data/rules';
import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';

// Case A: born 1964, nominal covered earnings 1986-2025.
const CASE_A: [number, number][] = [
  [1986, 16196], [1987, 17283], [1988, 18191], [1989, 18971], [1990, 19909], [1991, 20715], [1992, 21850],
  [1993, 22107], [1994, 22770], [1995, 23755], [1996, 24994], [1997, 26533], [1998, 28007], [1999, 29657],
  [2000, 31392], [2001, 32238], [2002, 32660], [2003, 33558], [2004, 35224], [2005, 36621], [2006, 38419],
  [2007, 40281], [2008, 41330], [2009, 40826], [2010, 41914], [2011, 43354], [2012, 44839], [2013, 45544],
  [2014, 47298], [2015, 49085], [2016, 49783], [2017, 51651], [2018, 53677], [2019, 55848], [2020, 57590],
  [2021, 62889], [2022, 66421], [2023, 69560], [2024, 73133], [2025, 75868],
];

describe('PIA', () => {
  test('SSA case A: AIME $5,825 → PIA $2,609.80', () => {
    expect(piaFromAime(5_825, [1_286, 7_749])).toBe(2_609.8);
    const earnings = CASE_A.map(([year, amount]) => ({ year, amount }));
    expect(computePia(earnings, new Map())).toBe(2_609.8);
  });

  test('SSA case B formula: AIME $11,463 with 2021 bend points → $3,317.40 before COLAs', () => {
    expect(piaFromAime(11_463, [996, 6_002])).toBe(3_317.4);
  });

  test('future earnings are capped at the taxable maximum', () => {
    const future = new Map(Array.from({ length: 35 }, (_, i) => [2026 + i, 1_000_000] as [number, number]));
    const capped = new Map(Array.from({ length: 35 }, (_, i) => [2026 + i, 184_500] as [number, number]));
    expect(computePia([], future)).toBe(computePia([], capped));
  });

  test('missing years count as zeros (early retirement lowers the benefit)', () => {
    const full = new Map(Array.from({ length: 35 }, (_, i) => [2000 + i, 60_000] as [number, number]));
    const short = new Map(Array.from({ length: 20 }, (_, i) => [2000 + i, 60_000] as [number, number]));
    expect(computePia([], short)).toBeLessThan(computePia([], full));
  });
});

describe('claiming age', () => {
  test('SSA case A: claiming at 62 with FRA 67 → 70% ($2,609.80 → $1,826)', () => {
    expect(ownClaimFactor(1964, 62)).toBeCloseTo(0.7, 10);
    expect(Math.floor(2_609.8 * ownClaimFactor(1964, 62))).toBe(1_826);
  });
  test('delayed credits: 8%/yr to 70', () => {
    expect(ownClaimFactor(1980, 70)).toBeCloseTo(1.24, 10);
    expect(ownClaimFactor(1980, 67)).toBe(1);
  });
  test('spousal at 62 → 65% of the spousal amount; no delayed credits', () => {
    expect(spousalClaimFactor(1980, 62)).toBeCloseTo(0.65, 10);
    expect(spousalClaimFactor(1980, 70)).toBe(1);
  });
  test('spousal top-up: lower earner gets 50% of the higher PIA once both have filed', () => {
    const hi = { birthYear: 1980, birthMonth: 1, claimAge: 67, pia: 3_000 };
    const lo = { birthYear: 1980, birthMonth: 1, claimAge: 67, pia: 1_000 };
    // Both entitled from January 2047; January's benefit arrives in February, so 11 months that year.
    expect(annualBenefits(hi, lo, 2047)[1]).toBeCloseTo(11 * 1_500, 6);
    expect(annualBenefits(hi, lo, 2048)[1]).toBeCloseTo(12 * 1_500, 6);
  });
  test('first benefit year counts only the months paid that year (each month is paid the month after, D25)', () => {
    const a = { birthYear: 1980, birthMonth: 7, claimAge: 67, pia: 1_200 };
    const b = { birthYear: 1980, birthMonth: 7, claimAge: 67, pia: 1_200 };
    // Entitled from July; July–November arrive August–December: 5 months. December's comes in January.
    expect(annualBenefits(a, b, 2047)[0]).toBeCloseTo(5 * 1_200, 6);
    expect(annualBenefits(a, b, 2048)[0]).toBeCloseTo(12 * 1_200, 6);
  });

  test('at 62 entitlement starts the month after the birthday month', () => {
    const june = { birthYear: 1980, birthMonth: 6, claimAge: 62, pia: 1_000 };
    const december = { birthYear: 1980, birthMonth: 12, claimAge: 62, pia: 1_000 };
    const factor = ownClaimFactor(1980, 62);
    expect(annualBenefits(june, june, 2042)[0]).toBeCloseTo(5 * 1_000 * factor, 6); // July–November, paid Aug–Dec
    // Entitled from January 2043, paid from February: nothing in 2042, 11 months in 2043.
    expect(annualBenefits(december, december, 2042)[0]).toBe(0);
    expect(annualBenefits(december, december, 2043)[0]).toBeCloseTo(11 * 1_000 * factor, 6);
    expect(annualBenefits(december, december, 2044)[0]).toBeCloseTo(12 * 1_000 * factor, 6);
  });
});

describe('trust fund', () => {
  test('100% before 2032, 78% in 2032, linear to 62% in 2100', () => {
    expect(payableShare(2031, TRUST_FUND_DEFAULT)).toBe(1);
    expect(payableShare(2032, TRUST_FUND_DEFAULT)).toBeCloseTo(0.78, 10);
    expect(payableShare(2066, TRUST_FUND_DEFAULT)).toBeCloseTo(0.7, 10);
    expect(payableShare(2150, TRUST_FUND_DEFAULT)).toBeCloseTo(0.62, 10);
  });
});

describe('real growth of the national wage index (D77)', () => {
  const earnings = CASE_A.map(([year, amount]) => ({ year, amount }));
  const future = new Map(Array.from({ length: 20 }, (_, i) => [2026 + i, 90_000] as [number, number]));

  test('0% reproduces the benefit without the setting exactly', () => {
    expect(computePia(earnings, future, { wageGrowth: 0, birthYear: 1964 })).toBe(computePia(earnings, future));
  });

  test('a statement benefit rises by (1 + g) for each year from the wage-index year to the year the person turns 60', () => {
    const plan = examplePlan(2026); // both on statement benefits of $2,500; you born 1984
    plan.assumptions.ssWageGrowth = 0.011;
    const ctx = buildContext(plan, { stopContributingYear: 2040, retireYear: 2040, baseSpending: 0 });
    expect(ctx.pia[0]).toBeCloseTo(2_500 * 1.011 ** (1984 + 60 - 2024), 6); // +24.4% at 42
    expect(ctx.pia[1]).toBeCloseTo(2_500 * 1.011 ** (1986 + 60 - 2024), 6); // +27.2% at 40
  });

  test('pay above the taxable maximum: the maximum rises with national wages, so each year counts as the maximum / (1 + g)²', () => {
    const { taxableMax, bendPoints, awiLatestYear } = SOCIAL_SECURITY;
    const big = new Map(Array.from({ length: 35 }, (_, i) => [2026 + i, 1_000_000] as [number, number]));
    const g = 0.02;
    const aime = Math.floor((35 * taxableMax) / (1 + g) ** 2 / 420);
    const expected = piaFromAime(aime, bendPoints) * (1 + g) ** (1990 + 60 - awiLatestYear);
    expect(Math.abs(computePia([], big, { wageGrowth: g, birthYear: 1990 }) - expected)).toBeLessThan(1);
  });

  test('from an earnings record, future pay counts relative to faster-growing national wages, so the rise is smaller', () => {
    const young = CASE_A.map(([year, amount]) => ({ year: year + 20, amount })).filter((e) => e.year <= 2025);
    const base = computePia(young, future);
    const raised = computePia(young, future, { wageGrowth: 0.011, birthYear: 1984 });
    expect(raised / base).toBeGreaterThan(1.05);
    expect(raised / base).toBeLessThan(1.011 ** (1984 + 60 - 2024));
  });
});
