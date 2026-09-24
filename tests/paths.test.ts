// Engine behavior with realistic inputs: taxes that must be paid, two spouses of different ages,
// Social Security, healthcare phases, gains, the Roth ladder's 5-year rule, and working-year income.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { constantPath } from '../src/engine/returns';
import { initialState, simulatePath } from '../src/engine/simulate';
import { annualBenefits, ownClaimFactor, payableShare, spousalClaimFactor } from '../src/engine/socialSecurity';
import { LIMITS } from '../src/data/rules';
import { ctxFor, simplePlan, START } from './helpers';

function retiree(ageYou: number, ageSpouse = ageYou) {
  const plan = simplePlan({ roth: 0 });
  plan.you.birthYear = START - ageYou;
  plan.spouse.birthYear = START - ageSpouse;
  plan.assumptions.endAge = 96;
  return plan;
}

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

  test('benefits and RMDs received while still working are saved to taxable, after tax', () => {
    const plan = simplePlan({ roth: 0 });
    plan.you.birthYear = START - 76; // RMDs and SS already running
    plan.spouse.birthYear = START - 55;
    plan.you.salary = 80_000;
    plan.you.balances.pretax = 500_000;
    plan.you.socialSecurity = { mode: 'manual', earnings: [], manualPia: 2_000, claimAge: 70 };
    plan.assumptions.endAge = 96;
    const ctx = buildContext(plan, { stopContributingYear: START + 3, retireYear: START + 3, baseSpending: 40_000 });
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records![0];
    expect(rec.working).toBe(true);
    expect(rec.rmd).toBeGreaterThan(0);
    expect(rec.socialSecurity).toBeGreaterThan(0);
    expect(rec.federalTax).toBeGreaterThan(0);
    expect(rec.balances.taxable).toBeCloseTo(rec.rmd + rec.socialSecurity - rec.federalTax - 0, 0);
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

describe('dated items and contributions', () => {
  test('income items reduce withdrawals; items before retirement are ignored', () => {
    const plan = retiree(62);
    plan.you.balances.roth = plan.you.balances.rothBasis = 1_000_000;
    plan.datedItems = [
      { id: 'i', label: 'rent', direction: 'income', amount: 10_000, frequency: 'ongoing', start: { kind: 'year', year: START }, fixedDollars: false },
    ];
    const ctx = buildContext(plan, { stopContributingYear: START + 1, retireYear: START + 1, baseSpending: 40_000 });
    const recs = simulatePath(ctx, constantPath(ctx.len, 0), 0, { record: true }).records!;
    expect(recs[0].otherIncome).toBe(0); // working year: ignored
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
});
