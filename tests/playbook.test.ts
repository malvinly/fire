// "What to do each year after you retire" (D93): the engine's withdrawal rules as steps, phase by phase.
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import { mixInYear, mixPercents, type Allocation } from '../src/engine/mix';
import type { Detail } from '../src/engine/solve';
import type { Plan, YearRecord } from '../src/engine/types';
import { buildPlaybook, exampleLine, type Playbook } from '../src/ui/playbook';
import { fidelityPlan } from './helpers';

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
  const endYear = Math.max(plan.you.birthYear, plan.spouse.birthYear) + plan.assumptions.endAge; // the younger spouse, as planYears
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
const actions = (plan: Plan, d: Detail, year: number) => buildPlaybook(plan, d).phases.find((p) => p.year === year)!.steps.map((s) => s.action);

describe('phases', () => {
  test('the example couple (born 1984 and 1986) retiring at 57 and 55 gets every milestone in order, merged when they share a year', () => {
    const plan = fidelityPlan();
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
    const plan = fidelityPlan();
    plan.you.birthYear = 1970;
    plan.spouse.birthYear = 1972;
    const d = detail(plan, 2035); // ages 65 and 63
    expect(titles(plan, d)).toEqual(['2035 You retire · You turn 65', '2037 You start Social Security (age 67) · Spouse turns 65', '2039 Spouse starts Social Security (age 67)', '2045 You turn 75', '2047 Spouse turns 75']);
    const retire = buildPlaybook(plan, d).phases[0];
    const order = retire.steps.find((s) => s.items)!.items!;
    expect(order).toEqual(['Cash.', 'Brokerage. You pay tax only on the growth, at the low capital-gains rate.', 'The 401(k)/IRA, beyond the yearly amount above.', 'Roth.']);
    expect(stepText(plan, d, 2035)).toContain('Spend what you need from it and move whatever is left over into a Roth IRA');
    expect(stepText(plan, d, 2035)).toContain('Buy your own health insurance until Spouse turns 65');
    // You turn 65 in the retirement year itself: the Medicare step joins the routine, just before the tax step.
    const steps = actions(plan, d, 2035);
    const medicare = steps.findIndex((s) => s.startsWith('You move to Medicare'));
    expect(medicare).toBeGreaterThan(0);
    expect(steps[medicare + 1]).toContain('Set aside the tax');
  });

  test('a spouse already past the required-withdrawal age on the day you retire gets that step in the routine, not a phase', () => {
    const plan = fidelityPlan();
    plan.you.birthYear = 1960; // 75 in 2035
    plan.spouse.birthYear = 1955; // 73 in 2028
    const d = detail(plan, 2030);
    expect(titles(plan, d)).toEqual(['2030 You retire · Spouse’s required withdrawals', '2032 Social Security cut', '2035 You turn 75']);
    const steps = actions(plan, d, 2030);
    const rmd = steps.findIndex((s) => s.startsWith('Take the required minimum withdrawal from Spouse’s 401(k)/IRA every year'));
    expect(steps[rmd - 1]).toBe('You both already collect Social Security.');
    expect(steps[rmd + 1]).toContain('Set aside the tax');
    expect(stepText(plan, d, 2030)).not.toContain('Apply for Social Security');
  });

  test('Coast gets a "stop saving" phase before retirement', () => {
    const plan = fidelityPlan();
    expect(titles(plan, detail(plan, 2049, 2030))[0]).toBe('2030 Stop saving, keep working');
  });

  test('Coast with contributions kept while coasting gets a "cut back" phase listing what each person keeps (D94)', () => {
    const plan = fidelityPlan();
    plan.you.coastContributions = { pretax: 6_000, employerMatch: 3_000, roth: 0, hsa: 4_000 };
    plan.spouse.coastContributions = { pretax: 0, employerMatch: 0, roth: 2_000, hsa: 0 };
    const d = detail(plan, 2049, 2030);
    expect(titles(plan, d)[0]).toBe('2030 Cut back saving, keep working');
    expect(actions(plan, d, 2030)[0]).toBe(
      'Keep only these contributions and stop every other addition to savings: You $6,000 to pre-tax 401(k)/IRA (earning a $3,000 employer match) and $4,000 to an HSA; Spouse $2,000 to Roth 401(k)/IRA.');
    expect(stepText(plan, d, 2030)).toContain('what you keep saving and the savings you already have keep growing until you retire in 2049');
  });

  test('a Social Security cut after retirement is its own phase when someone already collects before it', () => {
    const plan = fidelityPlan();
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
    const plan = fidelityPlan();
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
      'If those run out while you are under 59½, the 401(k)/IRA is next, then Roth growth, both with the 10% penalty. The results above count how often that happens. (The IRS has exceptions, such as the Rule of 55, that the plan doesn’t count on.)',
    ]);
    expect(text).toContain('Buy your own health insurance until each of you turns 65');
  });

  test('healthcare figures include healthcare inflation, as the engine charges them', () => {
    const plan = fidelityPlan(); // $16,000 each before 65, $7,500 after, rising 1.5% a year faster than prices
    const d = detail(plan, 2041);
    const text = stepText(plan, d, 2041);
    expect(text).toContain('about $40,000 a year for it in 2041, in today’s dollars (it rises 1.5% a year faster than prices');
    expect(text).not.toContain('$32,000');
    expect(stepText(plan, d, 2049)).toContain('Health insurance for you goes from about $22,500 to about $10,600 a year in 2049, in today’s dollars.');
  });

  test('with conversions off there is no January step, and turning 60 only reorders the accounts', () => {
    const plan = fidelityPlan();
    plan.assumptions.bracketFill = 'none';
    const d = detail(plan, 2041);
    expect(stepText(plan, d, 2041)).not.toContain('Each January');
    expect(stepText(plan, d, 2044)).not.toContain('leftover');
    expect(stepText(plan, d, 2044)).toContain('your 401(k)/IRA now comes after brokerage and before Roth');
  });

  test('an account funded only by kept-while-coasting contributions is in the routine; Traditional ignores the kept amounts (D94)', () => {
    const plan = fidelityPlan(); // no HSA balance or contribution today
    plan.you.coastContributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 3_000 };
    const coast = buildPlaybook(plan, detail(plan, 2049, 2030));
    expect(coast.phases[1].steps.some((s) => s.action === 'Pay medical bills from the HSA before any other account.')).toBe(true);
    const traditional = buildPlaybook(plan, detail(plan, 2041));
    expect(traditional.phases[0].steps.some((s) => s.action.includes('HSA'))).toBe(false);
  });

  test('accounts the household does not have are left out', () => {
    const plan = fidelityPlan(); // no HSA
    plan.household.cash = plan.household.cashContribution = 0;
    const pb = buildPlaybook(plan, detail(plan, 2041));
    expect(pb.phases[0].steps.some((s) => s.action.includes('HSA'))).toBe(false);
    expect(pb.phases[0].steps.find((s) => s.items)!.items).not.toContain('Cash.');
  });
});

describe('households that lack an account kind (found in the planner review)', () => {
  test('a spouse with no 401(k)/IRA and no Roth gets no "turns 60" phase; a Roth-only household hears about Roth growth, not a 401(k)', () => {
    const plan = fidelityPlan();
    plan.spouse.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    plan.spouse.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    expect(titles(plan, detail(plan, 2041))).not.toContain('2046 Spouse turns 60');

    const rothOnly = fidelityPlan();
    for (const q of [rothOnly.you, rothOnly.spouse]) {
      q.balances = { pretax: 0, roth: 300_000, rothBasis: 200_000, hsa: 0 };
      q.contributions = { pretax: 0, employerMatch: 0, roth: 10_000, hsa: 0 };
    }
    const d = detail(rothOnly, 2041);
    expect(stepText(rothOnly, d, 2044)).toContain('Your Roth, growth included, can now be used with no penalty.');
    expect(stepText(rothOnly, d, 2044)).not.toContain('401(k)');
    const order = buildPlaybook(rothOnly, d).phases[0].steps.find((s) => s.items)!.items!;
    expect(order[order.length - 1]).toContain('Roth growth is next, with the 10% penalty');
  });

  test('one spouse over 60 with a 401(k)/IRA, the other under 60 with none: convert the leftover, no penalty line', () => {
    const plan = fidelityPlan();
    plan.you.birthYear = 1970;
    plan.spouse.birthYear = 1980;
    plan.spouse.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    plan.spouse.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    const d = detail(plan, 2032); // You 62, Spouse 52
    const text = stepText(plan, d, 2032);
    expect(text).toContain('Spend what you need from it and move whatever is left over into a Roth IRA.');
    expect(text).not.toContain('Don’t spend');
    const order = buildPlaybook(plan, d).phases[0].steps.find((s) => s.items)!.items!;
    expect(order).toEqual(['Cash.', 'Brokerage. You pay tax only on the growth, at the low capital-gains rate.', 'Your 401(k)/IRA, beyond the yearly amount above.', 'Roth.']);
  });

  test('contributions that never happen do not count as having an account', () => {
    const plan = fidelityPlan();
    plan.spouse.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 }; // still contributes $25,000 a year, but saving stops at once
    expect(titles(plan, detail(plan, 2041, 2026))).not.toContain('2046 Spouse turns 60');
    expect(titles(plan, detail(plan, 2041))).toContain('2046 Spouse turns 60');
  });

  test('when Spouse is the older one: start with Spouse’s account, and "you are" under 59½', () => {
    const plan = fidelityPlan();
    plan.you.birthYear = 1986;
    plan.spouse.birthYear = 1984;
    const d = detail(plan, 2045); // You 59, Spouse 61
    const text = stepText(plan, d, 2045);
    expect(text).toContain('Start with Spouse’s account, the older of you, because it opens up penalty-free first; then yours.');
    expect(text).toContain('Don’t spend the part taken from your 401(k)/IRA while you are under 59½: move it straight into your Roth IRA');
    expect(text).toContain('Spend what you need from Spouse’s withdrawal and convert only the leftover.');
    const order = buildPlaybook(plan, d).phases[0].steps.find((s) => s.items)!.items!;
    expect(order[order.length - 1]).toContain('If those run out while you are under 59½, your 401(k)/IRA is next');
    expect(titles(plan, d)[1]).toBe('2046 You turn 60');
  });

  test('a couple born the same year: no "older of you", and the HSA step appears once', () => {
    const plan = fidelityPlan();
    plan.spouse.birthYear = plan.you.birthYear; // both 1984
    plan.you.balances.hsa = 20_000;
    const d = detail(plan, 2041);
    expect(stepText(plan, d, 2041)).toContain('Start with your account; then Spouse’s.');
    expect(stepText(plan, d, 2041)).not.toContain('older of you');
    expect(titles(plan, d)).toContain('2049 You turn 65 · Spouse turns 65');
    expect(actions(plan, d, 2049).filter((s) => s.startsWith('HSA money can now also be spent'))).toHaveLength(1);
  });

  test('with a ten-year age gap the penalty line names the younger spouse, not "you"', () => {
    const plan = fidelityPlan();
    plan.you.birthYear = 1972;
    plan.spouse.birthYear = 1982;
    const order = buildPlaybook(plan, detail(plan, 2034)).phases[0].steps.find((s) => s.items)!.items!;
    expect(order[order.length - 1]).toContain('while Spouse is under 59½, Spouse’s 401(k)/IRA is next');
  });
});

describe('the routine also covers the budget, rebalancing and dated items', () => {
  test('the retirement routine opens with the budget and ends with rebalancing and recalculating', () => {
    const plan = fidelityPlan();
    const steps = buildPlaybook(plan, detail(plan, 2041)).phases[0].steps.map((s) => s.action);
    expect(steps[0]).toBe('Live on about $76,500 a year plus healthcare, in today’s dollars.');
    expect(steps.slice(-2)).toEqual([
      'Once a year, put every invested account back to 70% stocks / 25% bonds / 5% cash (cash stays cash).',
      'Once a year, enter your real balances here and recalculate.',
    ]);
  });

  test('dated items after retirement become phases: an ongoing cost ending, income starting, a one-time sale', () => {
    const plan = fidelityPlan();
    plan.datedItems = [
      { id: 'm', label: 'Mortgage', direction: 'expense', amount: 30_000, frequency: 'ongoing', start: { kind: 'year', year: 2026 }, end: { kind: 'year', year: 2045 }, fixedDollars: true },
      { id: 'h', label: 'Home sale', direction: 'income', amount: 400_000, frequency: 'oneTime', start: { kind: 'year', year: 2050 }, fixedDollars: false, taxable: false },
      { id: 'p', label: 'Pension', direction: 'income', amount: 24_000, frequency: 'ongoing', start: { kind: 'age', person: 'you', age: 65 }, fixedDollars: true, taxable: true },
      { id: 'c', label: 'A car', direction: 'expense', amount: 35_000, frequency: 'recurring', start: { kind: 'year', year: 2030 }, everyYears: 10, fixedDollars: false },
    ];
    const d = detail(plan, 2041);
    const t = titles(plan, d);
    expect(t).toContain('2046 Spouse turns 60 · Mortgage ends');
    expect(t).toContain('2049 You turn 65 · Pension starts');
    expect(t).toContain('2050 Home sale arrives');
    expect(stepText(plan, d, 2046)).toContain('Mortgage is paid off: about $30,000 a year (in the dollars of when it began) less to cover.');
    expect(stepText(plan, d, 2049)).toContain('It is taxed as income, so it uses up room under the 10% bracket');
    expect(stepText(plan, d, 2050)).toContain('It is not taxed');
    const routine = buildPlaybook(plan, d).phases[0].steps.map((s) => s.action);
    expect(routine[0]).toBe('Live on about $76,500 a year plus healthcare and your dated items, in today’s dollars.');
    expect(routine[1]).toBe('Plan for A car about every 10 years, about $35,000 each time.');
  });

  test('a recurring cost that ends before retirement is not in the routine', () => {
    const plan = fidelityPlan();
    plan.datedItems = [
      { id: 't', label: 'Tuition', direction: 'expense', amount: 20_000, frequency: 'recurring', start: { kind: 'year', year: 2030 }, end: { kind: 'year', year: 2040 }, everyYears: 2, fixedDollars: false },
    ];
    expect(actions(plan, detail(plan, 2041), 2041).some((s) => s.includes('Tuition'))).toBe(false);
    plan.datedItems[0].end = { kind: 'year', year: 2041 };
    expect(actions(plan, detail(plan, 2041), 2041)).toContain('Plan for Tuition about every 2 years, about $20,000 each time.');
  });

  test('an ongoing cost starting after retirement, income that ends, recurring income and a one-time cost', () => {
    const plan = fidelityPlan();
    plan.datedItems = [
      { id: 'c', label: 'Care', direction: 'expense', amount: 20_000, frequency: 'ongoing', start: { kind: 'year', year: 2045 }, fixedDollars: false },
      { id: 'w', label: 'Consulting', direction: 'income', amount: 30_000, frequency: 'ongoing', start: { kind: 'year', year: 2042 }, end: { kind: 'year', year: 2047 }, fixedDollars: false, taxable: true },
      { id: 'r', label: 'Royalties', direction: 'income', amount: 5_000, frequency: 'recurring', start: { kind: 'year', year: 2043 }, everyYears: 3, fixedDollars: false, taxable: true },
      { id: 'o', label: 'a new roof', direction: 'expense', amount: 25_000, frequency: 'oneTime', start: { kind: 'year', year: 2050 }, fixedDollars: false },
    ];
    const d = detail(plan, 2041);
    const t = titles(plan, d);
    expect(t).toContain('2045 Care starts');
    expect(t).toContain('2048 Consulting ends');
    expect(t).toContain('2050 Pay for a new roof');
    expect(actions(plan, d, 2045)).toContain('Care: about $20,000 a year more to cover.');
    expect(actions(plan, d, 2048)).toContain('Consulting stops: about $30,000 a year less coming in.');
    expect(actions(plan, d, 2043)[0]).toBe('Royalties: about $5,000 every 3 years. Whatever you don’t need goes into the brokerage account.');
    expect(actions(plan, d, 2050)).toContain('Pay for a new roof: about $25,000.');
  });
});

describe('asset mix over time (D97)', () => {
  const A: Allocation = { stocks: 0.7, bonds: 0.25, cash: 0.05 };
  const B: Allocation = { stocks: 0.4, bonds: 0.5, cash: 0.1 };
  /** "Your own" mix: `first` at first, `later` from You's age `end`, moved in equal yearly steps at ages `start` … `end`. */
  function own(first: Allocation, later: Allocation, start: number, end: number): Plan {
    const plan = examplePlan(2026); // You born 1984
    plan.assumptions.mixPlan = 'own';
    plan.assumptions.allocation = { ...first };
    plan.assumptions.laterAllocation = { ...later };
    plan.assumptions.shiftStartAge = start;
    plan.assumptions.shiftEndAge = end;
    return plan;
  }
  const phase = (plan: Plan, d: Detail, year: number) => buildPlaybook(plan, d).phases.find((p) => p.year === year)!;
  /** The step that tells the mix: the only one that names "every invested account". */
  const mixStep = (plan: Plan, d: Detail, year: number) => {
    const found = phase(plan, d, year).steps.filter((s) => s.action.includes('every invested account'));
    expect(found).toHaveLength(1);
    return found[0];
  };
  const text = (pb: Playbook) => pb.phases.flatMap((p) => p.steps.flatMap((s) => [s.action, s.why ?? '', ...(s.items ?? [])])).join('\n');
  const DRIFT = 'Drifting toward more stocks raises the risk in a bad market; toward less lowers growth.';
  const TAX_WORKING = 'the results already count the capital-gains tax on that sale, paid from the brokerage account itself.';
  const TAX_YEARLY = 'Each move sells some of what the brokerage account holds; the results already count the capital-gains tax on that sale in the year’s tax bill, so set it aside with the rest of the tax.';
  const TAX_THIS_YEAR = 'This move sells some of what the brokerage account holds; the results already count the capital-gains tax on that sale in this year’s tax bill, so set it aside with the rest of the tax.';
  const INSIDE = 'Inside the 401(k)/IRA and Roth, moving costs no tax.';
  const OWN_PATH = 'This is the path you entered: 70% stocks / 25% bonds / 5% cash at first, moving to 40% stocks / 50% bonds / 10% cash in equal steps, one in each year you are 50 to 59.';
  const switchPath = (age: number) => `This is the path you entered: 70% stocks / 25% bonds / 5% cash at first, switching to 40% stocks / 50% bonds / 10% cash in the year you turn ${age}.`;
  const SWITCH = 'Move every invested account from 70% stocks / 25% bonds / 5% cash to 40% stocks / 50% bonds / 10% cash this year (cash stays cash). From now on, put every invested account back to that mix once a year.';

  test('Fidelity: one fixed mix, named as the FI Planner’s, and no mix phases', () => {
    const plan = fidelityPlan();
    const d = detail(plan, 2041);
    expect(mixStep(plan, d, 2041)).toEqual({
      action: 'Once a year, put every invested account back to 70% stocks / 25% bonds / 5% cash (cash stays cash).',
      why: `This is the mix Fidelity’s FI Planner uses. The results assume this mix in every account, every year. ${DRIFT}`,
    });
    expect(titles(plan, d).filter((t) => t.includes('asset mix'))).toEqual([]);
    expect(text(buildPlaybook(plan, d))).not.toContain('capital-gains tax on that sale');
  });

  test('your own mix entered twice is a fixed mix, with today’s wording', () => {
    const plan = own({ stocks: 0.6, bonds: 0.4, cash: 0 }, { stocks: 0.6, bonds: 0.4, cash: 0 }, 50, 59);
    const d = detail(plan, 2041);
    expect(mixStep(plan, d, 2041)).toEqual({
      action: 'Once a year, put every invested account back to 60% stocks / 40% bonds (cash stays cash).',
      why: `The results assume this mix in every account, every year. ${DRIFT}`,
    });
    expect(titles(plan, d).filter((t) => t.includes('asset mix'))).toEqual([]);
  });

  test('your own mix with one switch before retirement: a switch phase, then the fixed routine says it is done', () => {
    const plan = own(A, B, 50, 50); // 2034
    const d = detail(plan, 2041);
    expect(titles(plan, d).slice(0, 2)).toEqual(['2034 Switch to a new asset mix', '2041 You retire']);
    expect(phase(plan, d, 2034).steps).toEqual([{
      action: SWITCH,
      why: `Until now the results assume 70% stocks / 25% bonds / 5% cash in every account. ${switchPath(50)} The results assume this mix in every account from now on. ` +
        `This move sells some of what the brokerage account holds; ${TAX_WORKING} ${INSIDE}`,
    }]);
    expect(mixStep(plan, d, 2041)).toEqual({
      action: 'Once a year, put every invested account back to 40% stocks / 50% bonds / 10% cash (cash stays cash).',
      why: `${switchPath(50)} The move to this mix is done: the results assume it in every account, every year from now on. ${DRIFT}`,
    });
  });

  test('your own mix with one switch in the retirement year: the routine makes the move, taxed in that year’s bill', () => {
    const plan = own(A, B, 57, 57); // 2041
    const d = detail(plan, 2041);
    expect(titles(plan, d).filter((t) => t.includes('asset mix'))).toEqual([]);
    const steps = phase(plan, d, 2041).steps;
    expect(steps.at(-2)).toEqual({
      action: SWITCH,
      why: `${switchPath(57)} The results assume this mix in every account, every year from now on. ${TAX_THIS_YEAR} ${INSIDE} ${DRIFT}`,
    });
    expect(steps.at(-3)!.action).toContain('Set aside the tax');
    expect(steps.at(-1)!.action).toBe('Once a year, enter your real balances here and recalculate.');
  });

  test('your own mix with one switch after retirement: the routine keeps the first mix, and the switch is its own phase (joined to a milestone that year)', () => {
    const plan = own(A, B, 65, 65); // 2049, the year You turn 65
    const d = detail(plan, 2041);
    expect(mixStep(plan, d, 2041)).toEqual({
      action: 'Once a year, put every invested account back to 70% stocks / 25% bonds / 5% cash (cash stays cash), until the switch to 40% stocks / 50% bonds / 10% cash in 2049.',
      why: `${switchPath(65)} The results assume this mix in every account until then. ${DRIFT}`,
    });
    expect(titles(plan, d)).toContain('2049 You turn 65 · Switch to a new asset mix');
    expect(mixStep(plan, d, 2049)).toEqual({
      action: SWITCH,
      why: `${switchPath(65)} The results assume this mix in every account, every year from now on. ${TAX_THIS_YEAR} ${INSIDE}`,
    });
  });

  test('your own mix in yearly steps spanning retirement: start phase, a yearly routine step with the coming years, and a last-change phase', () => {
    const plan = own(A, B, 50, 59); // 3 points a year from 2034 through 2043
    const d = detail(plan, 2041);
    expect(titles(plan, d)).toEqual([
      '2034 Start shifting the asset mix', '2041 You retire', '2043 Last change to the asset mix', '2044 You turn 60', '2046 Spouse turns 60',
      '2049 You turn 65', '2051 You start Social Security (age 67) · Spouse turns 65', '2053 Spouse starts Social Security (age 67)', '2059 You turn 75', '2061 Spouse turns 75',
    ]);
    expect(phase(plan, d, 2034).steps).toEqual([{
      action: 'Each year until you retire, move every invested account to that year’s mix (cash stays cash): 67% stocks / 28% bonds / 5% cash in 2034, ' +
        'then about 3 percentage points a year from stocks into bonds and cash, to 46% stocks / 45% bonds / 9% cash in 2041, the year you retire.',
      why: `Until now the results assume 70% stocks / 25% bonds / 5% cash in every account. ${OWN_PATH} The results assume that year’s mix in every account each year. ` +
        `Each move sells some of what the brokerage account holds; ${TAX_WORKING} ${INSIDE}`,
    }]);
    expect(mixStep(plan, d, 2041)).toEqual({
      action: 'Once a year, move every invested account to that year’s mix (cash stays cash): 46% stocks / 45% bonds / 9% cash this year, ' +
        'then about 3 percentage points a year from stocks into bonds and cash through 2043, and 40% stocks / 50% bonds / 10% cash from then on.',
      why: `${OWN_PATH} Mix by year (stocks / bonds / cash): 2042: 43 / 48 / 9 · 2043: 40 / 50 / 10. The results assume that year’s mix in every account. ${TAX_YEARLY} ${INSIDE} ${DRIFT}`,
    });
    expect(mixStep(plan, d, 2043)).toEqual({
      action: 'Move every invested account to 40% stocks / 50% bonds / 10% cash this year, the last step of the shift (cash stays cash). From now on, put every invested account back to that mix once a year.',
      why: `${OWN_PATH} The results assume this mix in every account, every year from now on. ${TAX_THIS_YEAR} ${INSIDE}`,
    });
  });

  test('Vanguard on the example plan retiring in 2040: the shift is under way before, goes on after, and ends in 2056', () => {
    const plan = examplePlan(2026); // You born 1984: 65 in 2049; the path moves every year from 2025 through 2056
    expect(plan.assumptions.mixPlan).toBe('vanguard');
    const d = detail(plan, 2040);
    expect(titles(plan, d)).toEqual([
      '2027 Keep shifting the asset mix', '2040 You retire', '2044 You turn 60', '2046 Spouse turns 60', '2049 You turn 65',
      '2051 You start Social Security (age 67) · Spouse turns 65', '2053 Spouse starts Social Security (age 67)', '2056 Last change to the asset mix', '2059 You turn 75', '2061 Spouse turns 75',
    ]);
    const VANGUARD = 'This follows Vanguard’s Target Retirement path, tied to the year you turn 65 (2049).';
    const FUND = 'A target-date fund dated near 2049, the year you turn 65, follows about this path and makes these moves for you; ' +
      'with separate stock and bond funds, you make them yourself.';
    expect(phase(plan, d, 2027).ages).toBe('You 43 · Spouse 41');
    expect(phase(plan, d, 2027).steps).toEqual([{
      action: 'Each year until you retire, move every invested account to that year’s mix (cash stays cash): 86% stocks / 14% bonds in 2027, ' +
        'then about 1.5 percentage points a year from stocks into bonds, to 66% stocks / 34% bonds in 2040, the year you retire.',
      why: `The shift is already under way: the results assume your accounts hold 87% stocks / 13% bonds in 2026, the plan’s first year. ${VANGUARD} ${FUND} ` +
        `The results assume that year’s mix in every account each year. Each move sells some of what the brokerage account holds; ${TAX_WORKING} ${INSIDE}`,
    }]);
    expect(mixStep(plan, d, 2040)).toEqual({
      action: 'Once a year, move every invested account to that year’s mix (cash stays cash): 66% stocks / 34% bonds this year, ' +
        'then about 1.5 to 3 percentage points a year from stocks into bonds through 2056, and 30% stocks / 70% bonds from then on.',
      why: `${VANGUARD} ${FUND} Mix by year (stocks / bonds): 2041: 65 / 35 · 2042: 63 / 37 · 2043: 62 / 38 · 2044: 60 / 40 · 2045: 58 / 42 · … · 2056: 30 / 70. ` +
        `The results assume that year’s mix in every account. ${TAX_YEARLY} ${INSIDE} ${DRIFT}`,
    });
    expect(phase(plan, d, 2056).steps).toEqual([{
      action: 'Move every invested account to 30% stocks / 70% bonds this year, the last step of the shift (cash stays cash). From now on, put every invested account back to that mix once a year.',
      why: `This is where Vanguard’s Target Retirement path ends, 7 years after you turn 65. ${FUND} The results assume this mix in every account, every year from now on. ${TAX_THIS_YEAR} ${INSIDE}`,
    }]);
    // The routine's last step stays last.
    expect(phase(plan, d, 2040).steps.at(-1)!.action).toBe('Once a year, enter your real balances here and recalculate.');
  });

  test('Vanguard with "You" already past 72: the path has ended, so one fixed 30 / 70 mix', () => {
    const plan = examplePlan(2026);
    plan.you.birthYear = 1950; // 76; the path ended in 2022
    plan.spouse.birthYear = 1952;
    const d = detail(plan, 2026);
    expect(mixStep(plan, d, 2026)).toEqual({
      action: 'Once a year, put every invested account back to 30% stocks / 70% bonds (cash stays cash).',
      why: `This follows Vanguard’s Target Retirement path, tied to the year you turn 65 (2015). The move to this mix is done: the results assume it in every account, every year from now on. ${DRIFT}`,
    });
    expect(titles(plan, d).filter((t) => t.includes('asset mix'))).toEqual([]);
  });

  test('only Vanguard’s path says a target-date fund makes the moves; own mixes and Fidelity don’t', () => {
    const says = (plan: Plan, year: number) => buildPlaybook(plan, detail(plan, year)).phases
      .flatMap((ph) => ph.steps.filter((s) => s.action.includes('every invested account')).map((s) => (s.why ?? '').includes('target-date fund')));
    const vanguard = examplePlan(2026);
    expect(says(vanguard, 2040)).toEqual([true, true, true]); // before retirement, the routine, the last change
    const atLastMove = examplePlan(2026);
    expect(says(atLastMove, 2056)).toEqual([true, true]); // the move in the retirement year itself
    vanguard.you.birthYear = 1950; // the path ended before the plan: a fixed mix, nothing to move
    vanguard.spouse.birthYear = 1952;
    expect(says(vanguard, 2026)).toEqual([false]);
    for (const plan of [own(A, B, 50, 59), own(A, B, 65, 65), own(A, B, 57, 57), fidelityPlan()]) {
      expect(says(plan, 2041).every((x) => !x)).toBe(true);
    }
  });

  test('Coast with a shifting mix: the phases before retirement stay in year order, and a shared year is one phase', () => {
    const plan = examplePlan(2026);
    expect(titles(plan, detail(plan, 2049, 2030)).slice(0, 3)).toEqual(['2027 Keep shifting the asset mix', '2030 Stop saving, keep working', '2049 You retire · You turn 65']);
    expect(mixStep(plan, detail(plan, 2049, 2030), 2027).action).toContain('to 50% stocks / 50% bonds in 2049, the year you retire.');
    const pb = buildPlaybook(plan, detail(plan, 2049, 2027));
    expect(pb.phases[0].year).toBe(2027);
    expect(pb.phases[0].title).toBe('Stop saving, keep working · Keep shifting the asset mix');
    expect(pb.phases[0].steps.map((s) => s.action.slice(0, 20))).toEqual(['Stop adding to savin', 'Each year until you ']);
    expect(new Set(pb.phases.map((p) => p.year)).size).toBe(pb.phases.length);
  });

  test('the brokerage tax is told only to a household with a brokerage account, naming only the accounts it has', () => {
    const none = examplePlan(2026);
    none.household.taxable = none.household.taxableBasis = none.household.taxableContribution = 0;
    const t = text(buildPlaybook(none, detail(none, 2040)));
    expect(t).not.toMatch(/capital-gains tax on that sale|moving costs no tax/);
    expect(t).toContain('Once a year, move every invested account to that year’s mix');

    const brokerageOnly = examplePlan(2026);
    brokerageOnly.assumptions.bracketFill = 'none';
    for (const q of [brokerageOnly.you, brokerageOnly.spouse]) {
      q.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
      q.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    }
    const b = text(buildPlaybook(brokerageOnly, detail(brokerageOnly, 2040)));
    expect(b).toContain(TAX_YEARLY);
    expect(b).toContain(TAX_WORKING);
    expect(b).not.toContain('moving costs no tax');

    const withHsa = examplePlan(2026);
    withHsa.you.balances.hsa = 20_000;
    expect(text(buildPlaybook(withHsa, detail(withHsa, 2040)))).toContain('Inside the 401(k)/IRA, Roth and HSA, moving costs no tax.');
  });

  test('without a brokerage account, a mix step hears a conditional sentence when money can reach one before its last move', () => {
    // The example plan without a brokerage account: required withdrawals start in 2059 and 2061, after the last move
    // (2056), and both claim Social Security after retiring, so nothing can reach a brokerage account in time (see above).
    const plan = examplePlan(2026);
    plan.household.taxable = plan.household.taxableBasis = plan.household.taxableContribution = 0;
    plan.spouse.birthYear = 1975; // required withdrawals from 2050 (age 75), before the path ends in 2056
    const d = detail(plan, 2040);
    const IF_RMD = 'If money from unspent required withdrawals goes into a brokerage account by then, each move sells some of that too, ' +
      'and the results count the capital-gains tax on it. Inside the 401(k)/IRA and Roth, moving costs no tax.';
    expect(mixStep(plan, d, 2040).why).toContain(IF_RMD);
    expect(mixStep(plan, d, 2056).why).toContain(IF_RMD.replace('each move', 'this move'));
    // The moves before retirement (through 2040) come before any money can arrive.
    expect(mixStep(plan, d, 2027).why).not.toMatch(/capital-gains|moving costs no tax/);

    // Social Security claimed while still working (D49) and a dated income item are named too, only where they apply.
    plan.spouse.socialSecurity.claimAge = 62; // 2037, while working
    plan.datedItems = [{ id: 'p', label: 'Pension', direction: 'income', amount: 20_000, frequency: 'ongoing', start: { kind: 'year', year: 2045 }, fixedDollars: false, taxable: true }];
    expect(mixStep(plan, d, 2027).why).toContain(' If money from Social Security received while you still work goes into a brokerage account by then, each move sells some of that too');
    expect(mixStep(plan, d, 2040).why).toContain(' If money from unspent required withdrawals, Social Security received while you still work or Pension goes into a brokerage account by then');
  });

  test('every mix shown adds up to 100 and is the engine’s mix for the year it names', () => {
    const plans: [Plan, Detail][] = [];
    const ex = examplePlan(2026);
    for (const y of [2027, 2035, 2040, 2049, 2052, 2060]) plans.push([ex, detail(ex, y)]);
    for (const [s, e] of [[50, 59], [45, 70], [57, 57], [65, 65], [30, 45]]) {
      const p = own(A, B, s, e);
      plans.push([p, detail(p, 2041)]);
      const back = own(B, { stocks: 0.83, bonds: 0.12, cash: 0.05 }, s, e); // toward more stocks
      plans.push([back, detail(back, 2041)]);
    }
    let shown = 0;
    for (const [plan, d] of plans) {
      const pb = buildPlaybook(plan, d);
      for (const ph of pb.phases) {
        for (const s of ph.steps) {
          const t = `${s.action} ${s.why ?? ''}`;
          // A zero cash share is left out ("66% stocks / 34% bonds"), as in the inputs panel (mixLabel).
          for (const m of t.matchAll(/(\d+)% stocks \/ (\d+)% bonds(?: \/ (\d+)% cash)?/g)) {
            expect(m[3], t).not.toBe('0');
            expect(+m[1] + +m[2] + +(m[3] ?? 0), t).toBe(100);
            shown++;
          }
          for (const m of t.matchAll(/(\d+)% stocks \/ (\d+)% bonds(?: \/ (\d+)% cash)? (in (\d{4})|this year)/g)) {
            const year = m[5] ? +m[5] : ph.year;
            expect([+m[1], +m[2], +(m[3] ?? 0)], `${year}: ${t}`).toEqual(mixPercents(mixInYear(plan, year)));
          }
          const list = /Mix by year \(stocks \/ bonds( \/ cash)?\): ([^.]*)\./.exec(t);
          if (list) {
            for (const m of list[2].matchAll(/(\d{4}): (\d+) \/ (\d+)(?: \/ (\d+))?/g)) {
              expect(m[4] !== undefined, t).toBe(list[1] !== undefined); // three numbers exactly when the heading names cash
              expect(+m[2] + +m[3] + +(m[4] ?? 0)).toBe(100);
              expect([+m[2], +m[3], +(m[4] ?? 0)]).toEqual(mixPercents(mixInYear(plan, +m[1])));
            }
          }
        }
      }
    }
    expect(shown).toBeGreaterThan(50);
    // A shift toward more stocks says so.
    const back = own(B, A, 50, 59);
    expect(mixStep(back, detail(back, 2041), 2041).action).toContain('from bonds and cash into stocks through 2043');
  });
});

describe('example lines from the typical market', () => {
  test('each retired phase quotes its first year, until money runs out', () => {
    const plan = fidelityPlan();
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

  test('the social security claim quotes that person’s benefit for a full year at that year’s payable share', () => {
    const plan = fidelityPlan();
    const d = detail(plan, 2041, 2041, [record(2051, plan, { socialSecurity: 15_000 }), record(2052, plan, { socialSecurity: 30_000 })]);
    expect(stepText(plan, d, 2051)).toContain('From then on your benefit adds about $22K a year in today’s dollars, so you take that much less from the accounts.');
    expect(stepText(plan, d, 2051)).toContain('The amount already assumes only 73% of the full benefit is paid by then');
  });

  test('each claim quotes that person’s own benefit at their claim age plus any spousal top-up, at that year’s payable share', () => {
    const plan = fidelityPlan(); // $2,500 a month each at full retirement age (67 for both)
    plan.spouse.socialSecurity.claimAge = 70; // 24% more than at 67; claims in 2056, payable share about 72.7% in 2057
    const d = detail(plan, 2041);
    expect(stepText(plan, d, 2051)).toContain('your benefit adds about $22K a year'); // 2,500 × 12 × 1.0 × 0.735
    expect(stepText(plan, d, 2056)).toContain('Spouse’s benefit adds about $27K a year'); // 2,500 × 12 × 1.24 × 0.727
    expect(stepText(plan, d, 2056)).not.toContain('$49K');

    // A spouse with no work record gets the spousal top-up: half of the other's full benefit, once the other has claimed.
    const single = fidelityPlan();
    single.spouse.socialSecurity.manualPia = 0;
    const ds = { ...detail(single, 2041), pia: [2_500, 0] as [number, number] };
    expect(stepText(single, ds, 2053)).toContain('Spouse’s benefit adds about $11K a year'); // 1,250 × 12 × 1.0 × 0.729
    // Claiming before the other spouse: the top-up is named separately and waits.
    single.spouse.socialSecurity.claimAge = 62; // 2048, before You claim in 2051
    const early = { ...detail(single, 2041), pia: [2_500, 0] as [number, number] };
    expect(stepText(single, early, 2048)).toContain('A spousal top-up of about $9K a year comes once you claim too.');
    expect(stepText(single, early, 2048)).not.toContain('benefit adds');
  });

  test('a required withdrawal is shown as part of the 401(k)/IRA money', () => {
    const plan = fidelityPlan();
    const r = record(2060, plan, { withdrawals: { cash: 0, taxable: 0, roth: 0, pretax: 40_000, hsa: 0 }, rmd: 30_000, reinvested: 10_000, socialSecurity: 50_000 });
    expect(exampleLine(r)).toBe('In the typical market of the table below, 2060: spent $90K; $50K from Social Security; $40K from 401(k)/IRA; $30K of that required by the IRS; $10K not needed and reinvested.');
  });
});
