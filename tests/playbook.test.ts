// "What to do each year after you retire" (D93): the engine's withdrawal rules as steps, phase by phase.
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import type { Detail } from '../src/engine/solve';
import type { Plan, YearRecord } from '../src/engine/types';
import { buildPlaybook, exampleLine } from '../src/ui/playbook';

function record(year: number, plan: Plan, over: Partial<YearRecord> = {}): YearRecord {
  return {
    year, ageYou: year - plan.you.birthYear, ageSpouse: year - plan.spouse.birthYear, working: false,
    spending: 90_000, healthcare: 0, socialSecurity: 0, otherIncome: 0,
    withdrawals: { cash: 0, taxable: 0, roth: 0, pretax: 0, hsa: 0 },
    conversions: 0, reinvested: 0, seasonedRoth: 0, rmd: 0, penaltyWithdrawals: 0, ordinaryIncome: 0, capitalGains: 0,
    taxableIncome: 0, federalTax: 0, stateTax: 0, penaltyTax: 0,
    balances: { cash: 0, taxable: 0, pretax: 0, roth: 0, hsa: 0, total: 0 }, shortfall: 0, ...over,
  };
}

/** Only the fields the playbook reads: the scenario, the plan years and the typical market's records. */
function detail(plan: Plan, retireYear: number, stopYear = retireYear, records: YearRecord[] = []): Detail {
  const endYear = plan.spouse.birthYear + plan.assumptions.endAge;
  const years: number[] = [];
  for (let y = plan.startYear; y <= endYear; y++) years.push(y);
  const medianPath = years.map((y) => records.find((r) => r.year === y) ?? record(y, plan, { working: y < retireYear }));
  return {
    tier: 'traditional', scenario: { stopContributingYear: stopYear, retireYear, baseSpending: 76_500 },
    success: { bootstrap: 0.9, historical: 0.9, combined: 0.9, binding: 'bootstrap' }, penaltyRate: 0,
    years, bands: { p50: [], p25: [], p10: [] }, worstHistorical: [], historicalCount: 0, medianPath, p10Path: medianPath, pia: [2_500, 2_500],
  };
}

const titles = (plan: Plan, d: Detail) => buildPlaybook(plan, d).phases.map((p) => `${p.year} ${p.title}`);
const stepText = (plan: Plan, d: Detail, year: number) => buildPlaybook(plan, d).phases.find((p) => p.year === year)!.steps.map((s) => `${s.action} ${s.why ?? ''}`).join(' ');

describe('phases', () => {
  test('the example couple (born 1984 and 1986) retiring at 57 and 55 gets every milestone in order, merged when they share a year', () => {
    const plan = examplePlan(2026);
    expect(titles(plan, detail(plan, 2041))).toEqual([
      '2041 You retire',
      '2044 You turn 60',
      '2046 Spouse turns 60',
      '2049 You turn 65',
      '2051 You start Social Security (age 67) · Spouse turns 65',
      '2053 Spouse starts Social Security (age 67)',
      '2059 You turn 75',
      '2061 Spouse turns 75',
    ]);
  });

  test('milestones already passed on the day you retire are folded into the retirement routine, not listed again', () => {
    const plan = examplePlan(2026);
    plan.you.birthYear = 1970;
    plan.spouse.birthYear = 1972;
    const d = detail(plan, 2035); // ages 65 and 63
    expect(titles(plan, d)).toEqual(['2035 You retire', '2037 You start Social Security (age 67) · Spouse turns 65', '2039 Spouse starts Social Security (age 67)', '2045 You turn 75', '2047 Spouse turns 75']);
    const retire = buildPlaybook(plan, d).phases[0];
    const order = retire.steps.find((s) => s.items)!.items!;
    expect(order).toEqual(['Cash.', 'Brokerage. You pay tax only on the growth, at the low capital-gains rate.', 'The 401(k)/IRA, beyond the yearly amount above.', 'Roth.']);
    expect(stepText(plan, d, 2035)).toContain('Spend what you need from it and move whatever is left over into a Roth IRA');
    expect(stepText(plan, d, 2035)).toContain('Buy your own health insurance until Spouse turns 65');
  });

  test('Coast gets a "stop saving" phase before retirement', () => {
    const plan = examplePlan(2026);
    expect(titles(plan, detail(plan, 2049, 2030))[0]).toBe('2030 Stop saving, keep working');
  });

  test('a Social Security cut after retirement is its own phase when someone already collects before it', () => {
    const plan = examplePlan(2026);
    plan.you.birthYear = 1966;
    plan.spouse.birthYear = 1968;
    plan.you.socialSecurity.claimAge = 62;
    plan.assumptions.ssTrustFund = { startYear: 2034, startPct: 0.78, endYear: 2100, endPct: 0.62 };
    const d = detail(plan, 2027);
    expect(titles(plan, d)).toContain('2034 Social Security cut');
    expect(stepText(plan, d, 2034)).toContain('counts only 78% of each check');
  });
});

describe('the retirement routine', () => {
  test('with both under 59½ and the 10% bracket fill on: convert, spend cash then brokerage then Roth basis, penalty last', () => {
    const plan = examplePlan(2026);
    const d = detail(plan, 2041);
    const retire = buildPlaybook(plan, d).phases[0];
    const text = retire.steps.map((s) => `${s.action} ${s.why ?? ''}`).join(' ');
    expect(text).toContain('up to the top of the 10% tax bracket.');
    expect(text).toContain('For 2026 the top of the bracket is about $57,000 of income for a married couple');
    expect(text).toContain('Start with your account, the older of you');
    expect(text).toContain('Don’t spend it while you are both under 59½');
    expect(retire.steps.find((s) => s.items)!.items).toEqual([
      'Cash.',
      'Brokerage. You pay tax only on the growth, at the low capital-gains rate.',
      'Roth: only what you put in yourself, and conversions that are 5 or more years old. The growth and newer conversions stay put.',
      'If those run out before you are 59½, the 401(k)/IRA is next, with the 10% penalty. The results above count how often that happens.',
    ]);
    expect(text).toContain('Buy your own health insurance until each of you turns 65');
    expect(text).toContain('$32,000 a year');
  });

  test('with conversions off there is no January step, and turning 60 only reorders the accounts', () => {
    const plan = examplePlan(2026);
    plan.assumptions.bracketFill = 'none';
    const d = detail(plan, 2041);
    expect(stepText(plan, d, 2041)).not.toContain('Each January');
    expect(stepText(plan, d, 2044)).not.toContain('leftover');
    expect(stepText(plan, d, 2044)).toContain('your 401(k)/IRA now comes after brokerage and before Roth');
  });

  test('accounts the household does not have are left out', () => {
    const plan = examplePlan(2026); // no HSA
    plan.household.cash = plan.household.cashContribution = 0;
    const pb = buildPlaybook(plan, detail(plan, 2041));
    expect(pb.phases[0].steps.some((s) => s.action.includes('HSA'))).toBe(false);
    expect(pb.phases[0].steps.find((s) => s.items)!.items).not.toContain('Cash.');
  });
});

describe('example lines from the typical market', () => {
  test('each retired phase quotes its first year, until money runs out', () => {
    const plan = examplePlan(2026);
    const d = detail(plan, 2041, 2041, [
      record(2041, plan, { withdrawals: { cash: 12_000, taxable: 60_000, roth: 0, pretax: 0, hsa: 0 }, conversions: 24_000, federalTax: 3_000, stateTax: 1_000 }),
      record(2044, plan, { withdrawals: { cash: 0, taxable: 70_000, roth: 5_000, pretax: 20_000, hsa: 0 }, conversions: 4_000 }),
      record(2046, plan, { shortfall: 50_000 }),
    ]);
    const phases = buildPlaybook(plan, d).phases;
    expect(phases[0].example).toBe('In the typical market of the table below, 2041: spent $90K; $12K from cash; $60K from brokerage; $24K moved from 401(k)/IRA to Roth; $4K in taxes.');
    expect(phases[1].example).toContain('2044: spent $90K; $70K from brokerage; $20K from 401(k)/IRA; $5K from Roth; $4K moved');
    expect(phases.slice(2).every((p) => p.example === undefined)).toBe(true);
  });

  test('the social security claim quotes the first full year, since the claim year is prorated', () => {
    const plan = examplePlan(2026);
    const d = detail(plan, 2041, 2041, [record(2051, plan, { socialSecurity: 15_000 }), record(2052, plan, { socialSecurity: 30_000 })]);
    expect(stepText(plan, d, 2051)).toContain('it brings in about $30K a year');
  });

  test('a required withdrawal is shown as part of the 401(k)/IRA money', () => {
    const plan = examplePlan(2026);
    const r = record(2060, plan, { withdrawals: { cash: 0, taxable: 0, roth: 0, pretax: 40_000, hsa: 0 }, rmd: 30_000, reinvested: 10_000, socialSecurity: 50_000 });
    expect(exampleLine(r)).toBe('In the typical market of the table below, 2060: spent $90K; $50K from Social Security; $40K from 401(k)/IRA; $30K of that required by the IRS; $10K not needed and reinvested.');
  });
});
