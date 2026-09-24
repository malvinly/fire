// Engine behavior with realistic inputs: taxes that must be paid, two spouses of different ages,
// Social Security, healthcare phases, gains, the Roth ladder's 5-year rule, and working-year income.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { constantPath } from '../src/engine/returns';
import { initialState, simulatePath, totalBalance } from '../src/engine/simulate';
import { annualBenefits, ownClaimFactor, payableShare, spousalClaimFactor } from '../src/engine/socialSecurity';
import { FEDERAL, LIMITS } from '../src/data/rules';
import type { Plan } from '../src/engine/types';
import { ctxFor, simplePlan, START } from './helpers';

function retiree(ageYou: number, ageSpouse = ageYou) {
  const plan = simplePlan({ roth: 0 });
  plan.you.birthYear = START - ageYou;
  plan.spouse.birthYear = START - ageSpouse;
  plan.assumptions.endAge = 96;
  return plan;
}

/** Both 45, $40k spending, 12% fill, $1.5M pre-tax, $90k taxable at full basis (about two years of bridge). */
function ladderPlan() {
  const plan = retiree(45);
  plan.assumptions.bracketFill = '12';
  plan.you.balances.pretax = 1_500_000;
  plan.household.taxable = plan.household.taxableBasis = 90_000;
  return plan;
}

describe('money conservation', () => {
  /**
   * At 0% returns and no inflation, balances move only by the year's flows. Conversions and RMD surpluses
   * move money between accounts and must neither create nor destroy any:
   *   total(t) = total(t−1) − (spending + federal + state + penalty − Social Security − other income).
   * Per-account balances (per person for pre-tax and Roth) never go negative.
   */
  function expectConserved(plan: Plan, years: number) {
    const ctx = ctxFor(plan);
    const path = constantPath(ctx.len, 0, 0, 0);
    const recs = simulatePath(ctx, path, 0, { record: true }).records!;
    let prev = totalBalance(initialState(ctx));
    for (const [t, r] of recs.slice(0, years).entries()) {
      expect(r.working).toBe(false);
      expect(r.shortfall).toBe(0);
      const outflow = r.spending + r.federalTax + r.stateTax + r.penaltyTax - r.socialSecurity - r.otherIncome;
      expect(Math.abs(r.balances.total - (prev - outflow))).toBeLessThan(1);
      prev = r.balances.total;
      const s = simulatePath(ctx, path, 0, { stopIdx: t + 1 }).state;
      for (const v of [s.cash, s.taxable, s.taxableBasis, s.hsa, ...s.pretax, ...s.roth]) expect(v).toBeGreaterThan(-1);
    }
    return recs;
  }

  test('under 59½: bracket fill given up for spending (D52), then early Roth principal and earnings', () => {
    const plan = retiree(50, 48);
    plan.assumptions.bracketFill = '12';
    plan.household.traditionalSpending = 50_000;
    plan.household.taxable = plan.household.taxableBasis = 50_000;
    plan.you.balances.pretax = 300_000;
    plan.spouse.balances.pretax = 60_000; // below the 133k fill room: all of it is planned for conversion
    plan.spouse.balances.roth = 400_000; // no basis: all earnings
    const recs = expectConserved(plan, 14);
    // The scenario reaches the paths it is meant to check:
    expect(recs[1].conversions).toBeLessThan(130_000); // your year-1 fill (133k) partly reclaimed for spending
    expect(recs[2].conversions).toBeLessThan(60_000); // spouse's whole balance planned, most reclaimed
    expect(recs.slice(0, 14).some((r) => r.withdrawals.roth > 0 && r.penaltyWithdrawals > 0 && r.federalTax === 0)).toBe(true);
    expect(recs.slice(0, 14).some((r) => r.withdrawals.roth > 0 && r.penaltyWithdrawals > 0 && r.federalTax > 0)).toBe(true);
  });

  test('a Roth ladder over ten years: conversions, penalized pre-tax, then seasoned conversions', () => {
    const recs = expectConserved(ladderPlan(), 12);
    // Each year's pre-tax draw is exactly the 133k fill (100,800 + 32,200), never more: in the penalized
    // years part of it is spent instead of converted (D52), so income stays inside the 12% bracket.
    const fill = FEDERAL.ordinaryBrackets[1][0] + FEDERAL.standardDeduction;
    for (const r of recs.slice(0, 9)) expect(Math.abs(r.conversions + r.penaltyWithdrawals - fill)).toBeLessThan(1);
    expect(recs[2].penaltyWithdrawals).toBeGreaterThan(0);
    expect(recs[6].withdrawals.roth).toBeGreaterThan(0);
  });

  test('past 59½: RMD surplus, Social Security, state tax, gains, HSA and a one-time income deposit', () => {
    const plan = retiree(74, 70);
    plan.assumptions.bracketFill = '12';
    plan.assumptions.stateTaxRate = 0.05;
    plan.household.traditionalSpending = 130_000;
    plan.household.taxable = 400_000;
    plan.household.taxableBasis = 150_000;
    plan.household.cash = 20_000;
    plan.you.balances.pretax = 900_000;
    plan.spouse.balances.hsa = 30_000;
    plan.you.healthcare.medicare = plan.spouse.healthcare.medicare = 6_000;
    plan.you.socialSecurity = { mode: 'manual', earnings: [], manualPia: 2_500, claimAge: 70 };
    plan.spouse.socialSecurity = { mode: 'manual', earnings: [], manualPia: 1_000, claimAge: 67 };
    plan.datedItems = [
      { id: 'h', label: 'home sale', direction: 'income', amount: 150_000, frequency: 'oneTime', start: { kind: 'year', year: START + 2 }, fixedDollars: false, taxable: false },
    ];
    const recs = expectConserved(plan, 10);
    expect(recs.slice(0, 10).some((r) => r.capitalGains > 0)).toBe(true);
    expect(recs[0].withdrawals.hsa).toBe(12_000);
    expect(recs[2].balances.taxable).toBeGreaterThan(recs[1].balances.taxable); // surplus + unspent RMD deposited
  });
});

describe('after-tax cash flow', () => {
  test('withdrawals + income = spending + every tax, with state tax, gains and Social Security', () => {
    const plan = retiree(68);
    plan.household.traditionalSpending = 200_000; // more than the 12% fill, so taxable is sold too
    plan.household.taxable = 400_000;
    plan.household.taxableBasis = 200_000;
    plan.you.balances.pretax = 800_000;
    plan.you.socialSecurity = { mode: 'manual', earnings: [], manualPia: 2_000, claimAge: 67 };
    plan.assumptions.stateTaxRate = 0.05;
    plan.assumptions.bracketFill = '12';
    const ctx = ctxFor(plan);
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    for (const r of recs.slice(0, 5)) {
      const w = r.withdrawals;
      const inflow = w.cash + w.taxable + w.roth + w.pretax + w.hsa + r.socialSecurity + r.otherIncome;
      const outflow = r.spending + r.federalTax + r.stateTax + r.penaltyTax;
      expect(r.federalTax).toBeGreaterThan(0);
      expect(r.stateTax).toBeGreaterThan(0);
      expect(r.capitalGains).toBeGreaterThan(0);
      expect(inflow).toBeCloseTo(outflow, 0);
    }
  });

  test('realized gains are the sold share above cost basis, and basis shrinks in proportion', () => {
    const plan = retiree(62);
    plan.household.taxable = 100_000;
    plan.household.taxableBasis = 50_000;
    const ctx = ctxFor(plan);
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true, stopIdx: 1 });
    const sold = res.records![0].withdrawals.taxable;
    expect(res.records![0].capitalGains).toBeCloseTo(sold / 2, 6);
    expect(res.state.taxableBasis).toBeCloseTo(50_000 * (1 - sold / 100_000), 6);
  });
});

describe('Roth ladder and early access', () => {
  test('conversions become spendable in the 5th year after, not before', () => {
    const plan = retiree(45);
    plan.assumptions.bracketFill = '12';
    plan.you.balances.pretax = 1_500_000;
    plan.household.taxable = plan.household.taxableBasis = 90_000; // covers about two years
    const ctx = ctxFor(plan);
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    expect(recs[0].conversions).toBeGreaterThan(100_000);
    expect(recs[3].penaltyWithdrawals).toBeGreaterThan(0); // year-0 conversion not yet seasoned
    expect(recs[5].penaltyWithdrawals).toBe(0); // year-0 conversion now spendable
    expect(recs[5].withdrawals.roth).toBeGreaterThan(0);
    // The year-by-year table's "Roth available" column: nothing until the first conversion seasons.
    expect(recs[4].seasonedRoth).toBe(0);
    expect(recs[5].seasonedRoth).toBeCloseTo(recs[0].conversions, 0);
  });

  test('past 59½ the whole Roth balance counts as available', () => {
    const plan = retiree(62);
    plan.you.balances.roth = 100_000; // no contributions recorded: all earnings
    const ctx = ctxFor(plan);
    expect(simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true, stopIdx: 1 }).records![0].seasonedRoth).toBe(100_000);
  });

  test('ladder-year taxes match hand arithmetic: a 12% fill year, then a penalized year', () => {
    const ctx = ctxFor(ladderPlan());
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    const [[top10, r10], [top12, r12]] = FEDERAL.ordinaryBrackets; // 24,800 @10%, 100,800 @12%
    const penalty = FEDERAL.earlyWithdrawalPenalty;
    // Year 0 (both 45, no other income): the fill converts up to the top of the 12% bracket plus the
    // deduction, 100,800 + 32,200 = 133,000. Tax = 10% × 24,800 + 12% × (100,800 − 24,800) = 2,480 + 9,120
    // = 11,600. Spending + tax = 51,600 come from taxable at full basis (no gain, no penalty).
    const fillTax = r10 * top10 + r12 * (top12 - top10);
    expect(fillTax).toBeCloseTo(11_600, 6);
    expect(Math.abs(recs[0].conversions - (top12 + FEDERAL.standardDeduction))).toBeLessThan(1);
    expect(Math.abs(recs[0].federalTax - fillTax)).toBeLessThan(1);
    expect(recs[0].penaltyTax).toBe(0);
    expect(Math.abs(recs[0].withdrawals.taxable - (40_000 + fillTax))).toBeLessThan(1);
    // Year 1: taxable has 90,000 − 51,600 = 38,400 left. The year-0 conversion is unseasoned, so the rest is
    // penalized pre-tax X taken out of this year's planned 133,000 fill instead of converting it (D52): income
    // stays 133,000, so federal tax stays 11,600. 38,400 + X = 40,000 + 11,600 + 0.10 X
    //   → X = 13,200 / 0.9 = 14,666.67; penalty = 0.10 X = 1,466.67; converted = 133,000 − X = 118,333.33.
    const left = 90_000 - (40_000 + fillTax);
    const x = (40_000 - left + fillTax) / (1 - penalty);
    expect(x).toBeCloseTo(14_666.67, 2);
    expect(Math.abs(recs[1].penaltyWithdrawals - x)).toBeLessThan(1);
    expect(Math.abs(recs[1].federalTax - fillTax)).toBeLessThan(1);
    expect(Math.abs(recs[1].penaltyTax - penalty * x)).toBeLessThan(1);
    expect(Math.abs(recs[1].conversions - (top12 + FEDERAL.standardDeduction - x))).toBeLessThan(1);
  });

  test('the ladder gives up this year\'s conversion rather than run short', () => {
    const plan = retiree(50);
    plan.assumptions.bracketFill = '12';
    plan.household.traditionalSpending = 60_000;
    plan.you.balances.pretax = 100_000; // less than the 12% fill room
    const ctx = ctxFor(plan);
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![0];
    expect(rec.shortfall).toBe(0);
    expect(rec.penaltyWithdrawals).toBeGreaterThan(60_000);
  });

  test('age 59 is still penalized; 60 is not', () => {
    const plan = retiree(58);
    plan.you.balances.pretax = 2_000_000;
    const ctx = ctxFor(plan);
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    expect(recs.find((r) => r.ageYou === 59)!.penaltyWithdrawals).toBeGreaterThan(0);
    expect(recs.find((r) => r.ageYou === 60)!.penaltyWithdrawals).toBe(0);
  });

  test('unseasoned conversion principal withdrawn early pays the 10% penalty but no income tax', () => {
    const plan = retiree(50);
    const ctx = ctxFor(plan);
    const s = initialState(ctx);
    s.roth[0] = s.rothPrincipal[0] = 100_000;
    s.conversions[0][0] = 100_000; // converted this year
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { startState: s, record: true, stopIdx: 1 }).records![0];
    expect(rec.federalTax).toBe(0);
    expect(rec.penaltyTax).toBeCloseTo(0.1 * rec.penaltyWithdrawals, 6);
    expect(rec.penaltyWithdrawals).toBeCloseTo(40_000 / 0.9, 0);
  });

  test('before 59½, over three years: penalized pre-tax before Roth, conversions used up oldest-first (D27, D53)', () => {
    const plan = retiree(50); // $40k spending, no fill, no state tax
    plan.datedItems = [
      { id: 'g', label: 'gift', direction: 'income', amount: 40_000, frequency: 'oneTime', start: { kind: 'year', year: START + 4 }, fixedDollars: false, taxable: false },
    ];
    const ctx = ctxFor(plan);
    const s = initialState(ctx);
    s.pretax[0] = 20_000;
    s.roth[0] = 100_000;
    s.rothPrincipal[0] = 60_000; // two conversions (plan years 0 and 2) of 30,000; 40,000 is earnings
    s.conversions[0][0] = 30_000;
    s.conversions[0][2] = 30_000;
    const path = constantPath(ctx.len, 0);
    const run = (stopIdx: number) => simulatePath(ctx, path, 0, { startIdx: 3, startState: s, record: true, stopIdx });
    // The engine's tax loop stops within $0.50, so amounts are checked to the dollar.
    const [y3, y4, y5] = run(6).records!;
    // Year 3: both conversions are unseasoned. Penalized pre-tax comes first: all 20,000 (below the 32,200
    // deduction, so no income tax; 2,000 penalty). Then unseasoned principal R, penalty only:
    //   20,000 + R = 40,000 + 0.1 × (20,000 + R) → 0.9 R = 22,000 → R = 24,444.44; penalty 4,444.44.
    expect(y3.withdrawals.pretax).toBeCloseTo(20_000, 6);
    expect(y3.withdrawals.roth).toBeCloseTo(24_444.44, 0);
    expect(y3.federalTax).toBe(0);
    expect(y3.penaltyTax).toBeCloseTo(4_444.44, 0);
    // Withdrawn conversions leave the history oldest-first: year 0's 30,000 → 5,555.56; year 2's stays 30,000.
    const after3 = run(4).state.conversions[0];
    expect(after3[0]).toBeCloseTo(5_555.56, 0);
    expect(after3[2]).toBeCloseTo(30_000, 6);
    // Year 4: the 40,000 gift pays for the year; nothing is withdrawn.
    expect(y4.withdrawals.roth).toBe(0);
    // Year 5: year 0's conversion is now 5 years old, so its 5,555.56 is free of tax and penalty. Year 2's
    // 30,000 is still unseasoned (10% penalty), then earnings E (income tax + penalty):
    //   5,555.56 + 30,000 + E = 40,000 + 0.1 × (30,000 + E) → 0.9 E = 7,444.44 → E = 8,271.60
    //   (below the deduction: no income tax). Penalized 38,271.60; penalty 3,827.16.
    //   (Within $1: year 3's rounding carries over.)
    expect(Math.abs(y5.penaltyWithdrawals - 38_271.6)).toBeLessThan(1);
    expect(Math.abs(y5.withdrawals.roth - 43_827.16)).toBeLessThan(1);
    expect(Math.abs(y5.penaltyTax - 3_827.16)).toBeLessThan(1);
    expect(y5.federalTax).toBe(0);
  });

  test('Roth earnings withdrawn before 59½ pay income tax and the 10% penalty', () => {
    const plan = retiree(50);
    plan.household.traditionalSpending = 60_000;
    const ctx = ctxFor(plan);
    const s = initialState(ctx);
    s.roth[0] = 200_000; // no principal: every dollar is earnings
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { startState: s, record: true, stopIdx: 1 }).records![0];
    // (Checked to the dollar: the engine's tax loop stops within $0.50.)
    // E = 60,000 + fed + 0.1 E, with taxable income E − 32,200 in the 12% bracket:
    //   fed = 2,480 + 0.12 × (E − 32,200 − 24,800) = 0.12 E − 4,360
    //   → 0.78 E = 55,640 → E = 71,333.33; fed = 4,200; penalty = 7,133.33.
    expect(rec.withdrawals.roth).toBeCloseTo(71_333.33, 0);
    expect(rec.federalTax).toBeCloseTo(4_200, 0);
    expect(rec.penaltyTax).toBeCloseTo(7_133.33, 0);
  });

  test('after 59½, pre-tax is spent before Roth (D28)', () => {
    const plan = retiree(62);
    plan.you.balances.pretax = 500_000;
    plan.you.balances.roth = plan.you.balances.rothBasis = 500_000;
    const ctx = ctxFor(plan);
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![0];
    expect(rec.withdrawals.pretax).toBeGreaterThan(40_000);
    expect(rec.withdrawals.roth).toBe(0);
  });
});

describe('two spouses', () => {
  test('pre-tax comes from the older spouse first', () => {
    const plan = retiree(62, 61);
    plan.assumptions.bracketFill = '12';
    plan.you.balances.pretax = 1_000_000;
    plan.spouse.balances.pretax = 1_000_000;
    const ctx = ctxFor(plan);
    const s = simulatePath(ctx, constantPath(ctx.len, 0), 0, { stopIdx: 1 }).state;
    expect(s.pretax[0]).toBeLessThan(1_000_000);
    expect(s.pretax[1]).toBe(1_000_000);
    const flipped = retiree(61, 62);
    flipped.assumptions.bracketFill = '12';
    flipped.you.balances.pretax = flipped.spouse.balances.pretax = 1_000_000;
    const c2 = ctxFor(flipped);
    const s2 = simulatePath(c2, constantPath(c2.len, 0), 0, { stopIdx: 1 }).state;
    expect(s2.pretax[1]).toBeLessThan(1_000_000);
    expect(s2.pretax[0]).toBe(1_000_000);
  });

  test('a spouse past 59½ withdraws without penalty while the other is under', () => {
    const plan = retiree(55, 62);
    plan.spouse.balances.pretax = 1_000_000;
    const ctx = ctxFor(plan);
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![0];
    expect(rec.penaltyWithdrawals).toBe(0);
    expect(rec.withdrawals.pretax).toBeGreaterThan(0);
  });

  test('spousal benefit when spouses file in different years', () => {
    const hi = { birthYear: 1980, birthMonth: 1, claimAge: 67, pia: 3_000 };
    const lo = { birthYear: 1982, birthMonth: 1, claimAge: 62, pia: 1_000 };
    // Low earner files 2044 (own benefit only); spousal top-up starts 2047 when the high earner files (age 65).
    expect(annualBenefits(hi, lo, 2045)[1]).toBeCloseTo(12 * 1_000 * ownClaimFactor(1982, 62), 6);
    const full = 12 * (1_000 * ownClaimFactor(1982, 62) + 500 * spousalClaimFactor(1982, 65));
    expect(annualBenefits(hi, lo, 2048)[1]).toBeCloseTo(full, 6);
  });

  test('a spousal top-up starting mid-year is prorated by the other spouse\'s birth month', () => {
    const hi = { birthYear: 1980, birthMonth: 4, claimAge: 67, pia: 3_000 }; // files 2047, April birthday
    const lo = { birthYear: 1982, birthMonth: 1, claimAge: 62, pia: 1_000 }; // own benefit since 2044
    // 2047: lo's own benefit all 12 months; the top-up only for the 9 months from April (13 − 4).
    //   own = 1,000 × (1 − 36×5/9% − 24×5/12%) = 1,000 × 0.70 = 700/month
    //   top-up = (1,500 − 1,000) × (1 − 24×25/36%) (lo is 65, 24 months early) = 500 × 0.8333 = 416.67/month
    //   2047 = 700 × 12 + 416.67 × 9 = 8,400 + 3,750 = 12,150; hi's own first year = 3,000 × 9 = 27,000.
    const [hi2047, lo2047] = annualBenefits(hi, lo, 2047);
    expect(lo2047).toBeCloseTo(12_150, 6);
    expect(hi2047).toBeCloseTo(27_000, 6);
  });
});

describe('Social Security in the simulation', () => {
  test('benefits are cut by the trust-fund share in each year', () => {
    const plan = retiree(60);
    for (const p of [plan.you, plan.spouse]) p.socialSecurity = { mode: 'manual', earnings: [], manualPia: 2_000, claimAge: 67 };
    const ctx = ctxFor(plan);
    for (const year of [2034, 2040, 2060]) { // 2033 is the prorated first year
      const scheduled = 2 * 12 * 2_000 * ownClaimFactor(START - 60, 67);
      expect(ctx.socialSecurity[year - START]).toBeCloseTo(scheduled * payableShare(year, plan.assumptions.ssTrustFund), 6);
    }
  });

  test('retiring earlier lowers a benefit computed from earnings', () => {
    const plan = simplePlan();
    plan.you.birthYear = START - 40;
    plan.you.salary = 120_000;
    plan.you.socialSecurity = { mode: 'record', earnings: [], manualPia: 0, claimAge: 67 };
    const early = buildContext(plan, { stopContributingYear: START + 5, retireYear: START + 5, baseSpending: 0 });
    const late = buildContext(plan, { stopContributingYear: START + 20, retireYear: START + 20, baseSpending: 0 });
    expect(early.pia[0]).toBeLessThan(late.pia[0]);
  });

  test('benefits and RMDs received while still working are saved to taxable, after the extra tax they cause (D49)', () => {
    const plan = simplePlan({ roth: 0 });
    plan.you.birthYear = START - 76; // RMDs and SS already running
    plan.spouse.birthYear = START - 55;
    plan.you.salary = 80_000;
    plan.you.balances.pretax = 500_000;
    plan.you.socialSecurity = { mode: 'manual', earnings: [], manualPia: 2_000, claimAge: 70 };
    plan.assumptions.endAge = 96;
    plan.assumptions.stateTaxRate = 0.05;
    const ctx = buildContext(plan, { stopContributingYear: START + 3, retireYear: START + 3, baseSpending: 40_000 });
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![0];
    expect(rec.working).toBe(true);
    // Hand arithmetic for 2026 (you 76, born 1950 so RMDs from 72; spouse 55, no income):
    //   SS  = 2,000 × 1.32 (48 months of delayed credits past FRA 66) × 12 = 31,680 (no trust-fund cut yet)
    //   RMD = 500,000 / 23.7 (Uniform Lifetime, age 76) = 21,097.05
    //   Deduction = 32,200 + 1,650 (one spouse 65+) = 33,850
    //   With them: provisional income 80,000 + 21,097.05 + 15,840 is far above 44,000 → 85% cap = 26,928 of
    //     SS taxable; taxable income 80,000 + 21,097.05 + 26,928 − 33,850 = 94,175.05 (12% bracket)
    //   Without: 80,000 − 33,850 = 46,150 (12% bracket)
    //   Extra federal = 12% × (94,175.05 − 46,150) = 5,763.01
    //   Extra state = 5% × 21,097.05 = 1,054.85 (the state does not tax Social Security)
    //   Saved = 31,680 + 21,097.05 − 5,763.01 − 1,054.85 = 45,959.19
    const ss = 2_000 * 1.32 * 12;
    const rmd = 500_000 / 23.7;
    const extraFederal = 0.12 * ((80_000 + rmd + 0.85 * ss - 33_850) - (80_000 - 33_850));
    const extraState = 0.05 * rmd;
    expect(extraFederal).toBeCloseTo(5_763.01, 2);
    expect(rec.socialSecurity).toBeCloseTo(ss, 6);
    expect(rec.rmd).toBeCloseTo(rmd, 6);
    expect(rec.federalTax).toBeCloseTo(extraFederal, 2);
    expect(rec.stateTax).toBeCloseTo(extraState, 2);
    expect(rec.balances.taxable).toBeCloseTo(ss + rmd - extraFederal - extraState, 2);
    expect(rec.balances.pretax).toBeCloseTo(500_000 - rmd, 6);
  });
});

describe('healthcare', () => {
  test('pre-Medicare cost only in retired years before 65, grown by healthcare inflation; Medicare from 65', () => {
    const plan = simplePlan();
    plan.you.birthYear = START - 60;
    plan.spouse.birthYear = START - 60;
    plan.you.healthcare = { preMedicare: 10_000, medicare: 4_000 };
    plan.spouse.healthcare = { preMedicare: 0, medicare: 0 };
    plan.assumptions.healthcareInflation = 0.02;
    plan.assumptions.endAge = 96;
    const ctx = buildContext(plan, { stopContributingYear: START + 2, retireYear: START + 2, baseSpending: 0 });
    expect(ctx.healthcare[0]).toBe(0); // working
    expect(ctx.healthcare[2]).toBeCloseTo(10_000 * 1.02 ** 2, 6);
    expect(ctx.healthcare[5]).toBeCloseTo(4_000 * 1.02 ** 5, 6); // age 65
  });
});

describe('taxed dated income (D66)', () => {
  const pension = (taxable: boolean): Plan['datedItems'][number] => ({
    id: 'p', label: 'pension', direction: 'income', amount: 40_000, frequency: 'ongoing', start: { kind: 'year', year: START }, fixedDollars: false, taxable,
  });
  function firstYear(items: Plan['datedItems']) {
    const plan = retiree(60);
    plan.assumptions.bracketFill = '12';
    plan.assumptions.stateTaxRate = 0.05;
    plan.you.balances.pretax = 1_500_000;
    plan.datedItems = items;
    const ctx = ctxFor(plan);
    return simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true, stopIdx: 1 }).records![0];
  }
  const fillRoom = FEDERAL.ordinaryBrackets[1][0] + FEDERAL.standardDeduction; // 133,000

  test('a taxed pension is ordinary income: it uses up bracket-fill room and the tax is on fill + pension', () => {
    const rec = firstYear([pension(true)]);
    // Fill shrinks by the pension: 133,000 − 40,000 = 93,000 of pre-tax withdrawn (spent or converted).
    expect(rec.withdrawals.pretax + rec.conversions).toBeCloseTo(fillRoom - 40_000, 0);
    // Tax on 133,000 of ordinary income: 10% × 24,800 + 12% × (100,800 − 24,800) = 11,600; state 5% × 100,800.
    expect(rec.federalTax).toBeCloseTo(11_600, 0);
    expect(rec.stateTax).toBeCloseTo(0.05 * (fillRoom - FEDERAL.standardDeduction), 0);
    expect(rec.ordinaryIncome).toBeCloseTo(fillRoom, 0);
  });

  test('an untaxed inflow (a home sale, a cash gift) leaves the fill and the tax unchanged', () => {
    const none = firstYear([]);
    const rec = firstYear([pension(false)]);
    expect(rec.withdrawals.pretax + rec.conversions).toBeCloseTo(fillRoom, 0);
    expect(rec.federalTax).toBeCloseTo(none.federalTax, 6);
    expect(rec.stateTax).toBeCloseTo(none.stateTax, 6);
  });

  test('taxed income received while working is saved after the extra tax it causes on top of wages', () => {
    const plan = retiree(45);
    plan.you.salary = 150_000; // taxable wages 117,800: the 22% bracket
    plan.assumptions.stateTaxRate = 0.05;
    plan.datedItems = [{ ...pension(true), frequency: 'oneTime', amount: 30_000, start: { kind: 'year', year: START + 1 } }];
    const ctx = buildContext(plan, { stopContributingYear: START + 3, retireYear: START + 3, baseSpending: 0 });
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![1];
    expect(rec.federalTax).toBeCloseTo(0.22 * 30_000, 0);
    expect(rec.stateTax).toBeCloseTo(0.05 * 30_000, 0);
    expect(rec.balances.taxable).toBeCloseTo(30_000 * (1 - 0.22 - 0.05), 0);
  });
});

describe('dated items and contributions', () => {
  test('while working, dated items not in today\'s budget use savings: cash, then taxable with gains tax (D17)', () => {
    const plan = retiree(45);
    plan.you.salary = 150_000; // wages 150,000 → taxable income 150,000 − 32,200 = 117,800, above the 0% gains band
    plan.assumptions.stateTaxRate = 0.05;
    plan.household.cash = 10_000;
    plan.household.taxable = 200_000;
    plan.household.taxableBasis = 100_000; // half of any sale is gain
    const item = (id: string, direction: 'expense' | 'income', amount: number, frequency: 'oneTime' | 'ongoing', year: number, end?: number) => ({
      id, label: id, direction, amount, frequency, start: { kind: 'year' as const, year }, fixedDollars: false,
      ...(end ? { end: { kind: 'year' as const, year: end } } : {}),
    });
    plan.datedItems = [
      item('mortgage', 'expense', 20_000, 'ongoing', START - 5, START + 10), // already paid today: retirement only
      item('roof', 'expense', 50_000, 'oneTime', START + 1),
      item('hoa', 'expense', 5_000, 'ongoing', START + 2), // starts later: not in today's budget
      { ...item('sale', 'income', 30_000, 'oneTime', START + 2), taxable: false }, // a home sale: not income
    ];
    const ctx = buildContext(plan, { stopContributingYear: START + 3, retireYear: START + 3, baseSpending: 0 });
    expect([...ctx.realOut.slice(0, 4)]).toEqual([0, 50_000, 5_000, 25_000]);
    expect(ctx.realIn[2]).toBe(30_000);
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    // Year 1: the roof takes all 10,000 cash, then a taxable sale S pays the other 40,000 plus the sale's own tax.
    // Gain = S/2, all taxed at 15% federal (above the 98,900 band) and 5% state:
    //   S = 40,000 + 0.15 × S/2 + 0.05 × S/2 = 40,000 + 0.1 S → S = 44,444.44; federal 3,333.33; state 1,111.11.
    expect(recs[1].working).toBe(true);
    expect(recs[1].withdrawals.cash).toBe(10_000);
    expect(recs[1].withdrawals.taxable).toBeCloseTo(44_444.44, 0);
    expect(recs[1].capitalGains).toBeCloseTo(22_222.22, 0);
    expect(recs[1].federalTax).toBeCloseTo(3_333.33, 0);
    expect(recs[1].stateTax).toBeCloseTo(1_111.11, 0);
    expect(recs[1].shortfall).toBe(0);
    // Year 2: the 30,000 sale covers the 5,000 fee; the other 25,000 is saved to taxable at full basis.
    // Taxable: 200,000 − 44,444.44 = 155,555.56, + 25,000 = 180,555.56 (0% returns).
    expect(recs[2].balances.taxable).toBeCloseTo(180_555.56, 0);
    expect(recs[2].balances.cash).toBe(0);
  });

  test('a cost before retirement that savings cannot cover fails the path (D17)', () => {
    const plan = retiree(45);
    plan.household.taxable = plan.household.taxableBasis = 10_000;
    plan.datedItems = [
      { id: 'r', label: 'roof', direction: 'expense', amount: 50_000, frequency: 'oneTime', start: { kind: 'year', year: START + 1 }, fixedDollars: false },
    ];
    const ctx = buildContext(plan, { stopContributingYear: START + 3, retireYear: START + 3, baseSpending: 0 });
    const res = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true });
    expect(res.records![1].shortfall).toBeCloseTo(40_000, 6); // 50,000 − 10,000 taxable (no gain, no tax)
    expect(res.success).toBe(false);
    expect(res.failYear).toBe(START + 1);
  });

  test('income items reduce withdrawals; an ongoing item already running today counts only from retirement', () => {
    const plan = retiree(62);
    plan.you.balances.roth = plan.you.balances.rothBasis = 1_000_000;
    plan.datedItems = [
      { id: 'i', label: 'rent', direction: 'income', amount: 10_000, frequency: 'ongoing', start: { kind: 'year', year: START }, fixedDollars: false },
    ];
    const ctx = buildContext(plan, { stopContributingYear: START + 1, retireYear: START + 1, baseSpending: 40_000 });
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    expect(recs[0].otherIncome).toBe(0); // working year: part of today's budget
    expect(recs[1].withdrawals.roth).toBeCloseTo(30_000, 6);
  });

  test('contributions stop growing at the IRS limit', () => {
    const plan = simplePlan();
    plan.you.birthYear = START - 30;
    plan.you.contributions = { pretax: 30_000, employerMatch: 5_000, roth: 0, hsa: 0 };
    plan.assumptions.wageGrowth = 0.015;
    plan.assumptions.endAge = 96;
    const ctx = buildContext(plan, { stopContributingYear: START + 30, retireYear: START + 30, baseSpending: 0 });
    const limitUnder50 = LIMITS.employee401k + LIMITS.ira;
    const t = 15; // age 45
    expect(ctx.contrib.pretax[0][t] - 5_000 * 1.015 ** t).toBeCloseTo(limitUnder50, 6);
  });

  test('catch-ups: 401(k)+IRA from 50, HSA family limit plus one catch-up per spouse from 55', () => {
    const plan = simplePlan();
    plan.you.birthYear = START - 49;
    plan.spouse.birthYear = START - 53;
    for (const p of [plan.you, plan.spouse]) p.contributions = { pretax: 50_000, employerMatch: 0, roth: 0, hsa: 10_000 };
    plan.assumptions.endAge = 96;
    const ctx = buildContext(plan, { stopContributingYear: START + 10, retireYear: START + 10, baseSpending: 0 });
    // You: 49 → 24,500 + 7,500 = 32,000; 50 → 32,000 + 8,000 + 1,100 = 41,100.
    expect(ctx.contrib.pretax[0][0]).toBe(32_000);
    expect(ctx.contrib.pretax[0][1]).toBe(41_100);
    // HSA (20,000 wanted): spouse 53, you 49 → 8,750; spouse 55 (t=2) → 9,750; you reach 55 at t=6 → 10,750.
    expect(ctx.contrib.hsa[1]).toBe(8_750);
    expect(ctx.contrib.hsa[2]).toBe(9_750);
    expect(ctx.contrib.hsa[5]).toBe(9_750);
    expect(ctx.contrib.hsa[6]).toBe(10_750);
  });
});
