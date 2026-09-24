// Layer 4: federal tax worked examples (2026 MFJ), computed by hand from IRS tables.
import { describe, expect, test } from 'vitest';
import { bracketRoom, computeTax, taxableSocialSecurity } from '../src/engine/tax';

const base = { ordinary: 0, ltcg: 0, socialSecurity: 0, over65: 0, priceLevel: 1, stateRate: 0 };

describe('federal income tax', () => {
  test('ordinary income only: $100k → taxable $67,800 → $7,640', () => {
    const r = computeTax({ ...base, ordinary: 100_000 });
    expect(r.taxableIncome).toBe(67_800);
    expect(r.federal).toBeCloseTo(2_480 + 0.12 * (67_800 - 24_800), 6);
  });

  test('capital gains stack on ordinary income and stay at 0% under $98,900 taxable', () => {
    expect(computeTax({ ...base, ordinary: 50_000, ltcg: 80_000 }).federal).toBeCloseTo(1_780, 6);
    // $18,900 of gains above the 0% band at 15%.
    expect(computeTax({ ...base, ordinary: 50_000, ltcg: 100_000 }).federal).toBeCloseTo(1_780 + 0.15 * 18_900, 6);
  });

  test('unused standard deduction shelters gains', () => {
    const r = computeTax({ ...base, ordinary: 10_000, ltcg: 50_000 });
    expect(r.taxableIncome).toBe(27_800);
    expect(r.federal).toBe(0);
  });

  test('extra deduction per spouse 65+', () => {
    expect(computeTax({ ...base, ordinary: 35_500, over65: 2 }).taxableIncome).toBe(0);
  });

  test('NIIT: 3.8% of gains above $250k MAGI', () => {
    const r = computeTax({ ...base, ordinary: 300_000, ltcg: 100_000 });
    const withoutGains = computeTax({ ...base, ordinary: 300_000 });
    const expectedGainsTax = 0.15 * 100_000 + 0.038 * 100_000;
    expect(r.federal - withoutGains.federal).toBeCloseTo(expectedGainsTax, 6);
  });

  test('state tax is a flat rate on federal-style taxable income, excluding Social Security', () => {
    const r = computeTax({ ...base, ordinary: 52_200, socialSecurity: 40_000, stateRate: 0.05 });
    expect(r.state).toBeCloseTo(0.05 * 20_000, 6);
  });
});

describe('Social Security taxation (Pub 915, MFJ)', () => {
  test('below $32k provisional income: none taxable', () => {
    expect(taxableSocialSecurity(10_000, 40_000, 1)).toBe(0);
  });
  test('between $32k and $44k: half the excess', () => {
    expect(taxableSocialSecurity(20_000, 40_000, 1)).toBe(4_000);
  });
  test('above $44k: 85% formula', () => {
    expect(taxableSocialSecurity(30_000, 40_000, 1)).toBeCloseTo(0.85 * 6_000 + 6_000, 6);
  });
  test('capped at 85% of benefits', () => {
    expect(taxableSocialSecurity(200_000, 40_000, 1)).toBe(34_000);
  });
  test('thresholds are not indexed: doubling prices halves them in real terms', () => {
    // provisional 30k vs thresholds 16k/22k → 0.85·8k + min(20k, 3k)
    expect(taxableSocialSecurity(10_000, 40_000, 2)).toBeCloseTo(6_800 + 3_000, 6);
  });
});

describe('bracket fill room', () => {
  test('no other income: top of 12% bracket + standard deduction', () => {
    expect(bracketRoom(100_800, 0, 0, 0, 0, 1)).toBeCloseTo(133_000, 0);
  });
  test('Social Security that becomes 85% taxable reduces the room', () => {
    expect(bracketRoom(100_800, 0, 0, 40_000, 0, 1)).toBeCloseTo(99_000, 0);
  });
  test('income already above the target: zero room', () => {
    expect(bracketRoom(24_800, 100_000, 0, 0, 0, 1)).toBe(0);
  });
});
