// Precomputes everything about a plan + scenario that does not depend on market returns, so the
// per-path loop in simulate.ts stays fast.

import { LIMITS, UNIFORM_LIFETIME, rmdStartAge } from '../data/rules';
import { annualBenefits, computePia, payableShare, wageLevelAt60 } from './socialSecurity';
import { bracketTop } from './tax';
import type { DatedItem, DatedTiming, Person, Plan, Scenario } from './types';

/**
 * The lowest yearly income paid out by the brokerage account, as a share of the money in each asset class (D70):
 * stock dividends (qualified, taxed like long-term gains) and bond interest (ordinary income). Each market pays
 * its own January dividend yield and 10-year yield when higher (D82). The cash share of the mix, and the cash
 * account, pay the path's own T-bill rate.
 */
export const TAXABLE_YIELDS = { stockDividends: 0.02, bondInterest: 0.04 };

export interface Context {
  plan: Plan;
  scenario: Scenario;
  startYear: number;
  endYear: number;
  len: number;
  /** Year index (t = calendar year - startYear) of the household retirement year. */
  retireIdx: number;
  years: number[];
  ages: [Int32Array, Int32Array];
  /** 1 while the household still works. Contributions are gated separately: they are zero after the stop year. */
  working: Uint8Array;
  /** Wages taxed while working (salaries minus pre-tax contributions), for taxing SS/RMDs received then. */
  wages: Float64Array;
  /** Per person per year contributions (today's dollars), zero once contributions stop; capped at IRS limits. */
  contrib: {
    pretax: [Float64Array, Float64Array];
    roth: [Float64Array, Float64Array];
    hsa: Float64Array;
    taxable: Float64Array;
    cash: Float64Array;
  };
  baseSpending: Float64Array;
  /** Dated items (D17): every year from retirement on; while working, only items not already part of today's
   *  budget. "real" amounts are today's dollars; "nominal" are fixed-dollar amounts the simulation divides by
   *  the path's price level (D19). Out = expenses, In = income. */
  realOut: Float64Array;
  nominalOut: Float64Array;
  realIn: Float64Array;
  nominalIn: Float64Array;
  /** The part of realIn / nominalIn taxed as ordinary income (D66). */
  realInTaxed: Float64Array;
  nominalInTaxed: Float64Array;
  healthcare: Float64Array;
  /** Household Social Security after the trust-fund cut, today's dollars. */
  socialSecurity: Float64Array;
  /** Number of spouses aged 65+ (0, 1 or 2) — sets the extra standard deduction. */
  over65Count: Uint8Array;
  /** 1 when the person can withdraw from retirement accounts without penalty (D14). */
  access: [Uint8Array, Uint8Array];
  /** RMD divisor, 0 when no RMD is due. */
  rmdDivisor: [Float64Array, Float64Array];
  /** 1 when the younger spouse is under 65 (HSA non-medical penalty, D41). */
  hsaPenalty: Uint8Array;
  fillTop: number; // 0 = no bracket fill
  /**
   * The shares of the brokerage balance that earn dividends (`stocks`), bond interest (`bonds`) and the T-bill
   * rate (`cash`) each year, at that year's yields (D70, D82). The cash account's interest doesn't depend on these.
   */
  yields: { stocks: number; bonds: number; cash: number };
  pia: [number, number];
}

/** The last plan year: the younger spouse reaches the plan-to age (D2). */
export function planEndYear(plan: Plan): number {
  return Math.max(plan.you.birthYear, plan.spouse.birthYear) + plan.assumptions.endAge;
}

export function planYears(plan: Plan): { startYear: number; endYear: number; len: number } {
  const endYear = planEndYear(plan);
  // A fractional year count would make every per-year array the wrong length.
  if (![plan.startYear, plan.you.birthYear, plan.spouse.birthYear, plan.assumptions.endAge].every(Number.isInteger)) {
    throw new Error('Plan start year, birth years and "Plan until … age" must be whole numbers.');
  }
  const len = endYear - plan.startYear + 1;
  if (len < 2) throw new Error(`"Plan to age" (${plan.assumptions.endAge}) must be above the younger spouse's current age.`);
  // A typo (plan start "202", plan to age "960") would otherwise run for hours.
  if (len > 120) throw new Error(`The plan runs ${len} years (${plan.startYear}–${endYear}). Check "Plan starts in year", birth years and "Plan until … age".`);
  return { startYear: plan.startYear, endYear, len };
}

export function timingYear(plan: Plan, t: DatedTiming): number {
  return t.kind === 'year' ? t.year : plan[t.person].birthYear + t.age;
}

/**
 * An ongoing item that is already running at the plan start (a mortgage, rent received) is part of today's
 * budget: the paycheck and today's savings already reflect it, so it only counts from retirement on (D17).
 */
export function inTodaysBudget(plan: Plan, item: DatedItem): boolean {
  return item.frequency === 'ongoing' && timingYear(plan, item.start) <= plan.startYear &&
    (!item.end || timingYear(plan, item.end) >= plan.startYear);
}

function itemYears(plan: Plan, item: DatedItem, endYear: number): number[] {
  const start = timingYear(plan, item.start);
  const end = item.end ? timingYear(plan, item.end) : endYear;
  if (item.frequency === 'oneTime') return [start];
  const step = item.frequency === 'recurring' ? Math.max(1, item.everyYears ?? 1) : 1;
  const out: number[] = [];
  for (let y = start; y <= Math.min(end, endYear); y += step) out.push(y);
  return out;
}

/** The plan years an item falls in; empty when it adds nothing (ends before it starts, or lies outside the plan). */
export function itemYearsInPlan(plan: Plan, item: DatedItem): number[] {
  const { startYear, endYear } = planYears(plan);
  return itemYears(plan, item, endYear).filter((y) => y >= startYear && y <= endYear);
}

function pia(person: Person, startYear: number, stopWorkYear: number, wageGrowth: number, ssWageGrowth: number): number {
  // A statement benefit is in today's wage terms too, so it scales the same way (D77).
  if (person.socialSecurity.mode === 'manual') return person.socialSecurity.manualPia * wageLevelAt60(ssWageGrowth, person.birthYear);
  const future = new Map<number, number>();
  for (let y = startYear; y < stopWorkYear; y++) future.set(y, person.salary * Math.pow(1 + wageGrowth, y - startYear));
  return computePia(person.socialSecurity.earnings, future, { wageGrowth: ssWageGrowth, birthYear: person.birthYear });
}

export function buildContext(plan: Plan, scenario: Scenario): Context {
  const a = plan.assumptions;
  const { startYear, endYear, len } = planYears(plan);
  const people = [plan.you, plan.spouse] as const;
  const f64 = () => new Float64Array(len);
  const retireIdx = clampIdx(scenario.retireYear - startYear, len);
  const stopContribIdx = Math.min(clampIdx(scenario.stopContributingYear - startYear, len), retireIdx);

  const ctx: Context = {
    plan,
    scenario,
    startYear,
    endYear,
    len,
    retireIdx,
    years: Array.from({ length: len }, (_, t) => startYear + t),
    ages: [new Int32Array(len), new Int32Array(len)],
    working: new Uint8Array(len),
    wages: f64(),
    contrib: { pretax: [f64(), f64()], roth: [f64(), f64()], hsa: f64(), taxable: f64(), cash: f64() },
    baseSpending: f64(),
    realOut: f64(),
    nominalOut: f64(),
    realIn: f64(),
    nominalIn: f64(),
    realInTaxed: f64(),
    nominalInTaxed: f64(),
    healthcare: f64(),
    socialSecurity: f64(),
    over65Count: new Uint8Array(len),
    access: [new Uint8Array(len), new Uint8Array(len)],
    rmdDivisor: [f64(), f64()],
    hsaPenalty: new Uint8Array(len),
    fillTop: a.bracketFill === 'none' ? 0 : bracketTop(a.bracketFill),
    yields: { ...a.allocation },
    pia: [0, 0],
  };

  ctx.pia = [
    pia(plan.you, startYear, scenario.retireYear, a.wageGrowth, a.ssWageGrowth),
    pia(plan.spouse, startYear, scenario.retireYear, a.wageGrowth, a.ssWageGrowth),
  ];
  const claimants = people.map((p, i) => ({
    birthYear: p.birthYear,
    birthMonth: p.birthMonth,
    claimAge: p.socialSecurity.claimAge,
    pia: ctx.pia[i],
  }));

  for (let t = 0; t < len; t++) {
    const year = startYear + t;
    const growth = Math.pow(1 + a.wageGrowth, t);
    const hcGrowth = Math.pow(1 + a.healthcareInflation, t);
    const working = t < retireIdx;
    const contributing = t < stopContribIdx;
    ctx.working[t] = working ? 1 : 0;
    let hc = 0;
    let over65 = 0;
    let hsaLimit = LIMITS.hsaFamily;
    people.forEach((p, i) => {
      const age = year - p.birthYear;
      ctx.ages[i][t] = age;
      ctx.access[i][t] = age >= 60 ? 1 : 0;
      if (age >= 65) over65++;
      const rmdAge = rmdStartAge(p.birthYear);
      ctx.rmdDivisor[i][t] = age >= rmdAge ? (UNIFORM_LIFETIME[Math.min(age, 120)] ?? 2) : 0;
      if (age >= 55) hsaLimit += LIMITS.hsaCatchUp;
      const employee = (p.contributions.pretax + p.contributions.roth) * growth;
      const limit = LIMITS.employee401k + LIMITS.ira + (age >= 50 ? LIMITS.catchUp401k + LIMITS.iraCatchUp : 0);
      const k = employee > limit ? limit / employee : 1;
      if (contributing) {
        // Contributions grow with wages, but IRS limits only keep pace with inflation (flat in real terms), D15.
        ctx.contrib.pretax[i][t] = p.contributions.pretax * growth * k + p.contributions.employerMatch * growth;
        ctx.contrib.roth[i][t] = p.contributions.roth * growth * k;
        ctx.contrib.hsa[t] += p.contributions.hsa * growth;
      }
      if (working) {
        const pretaxFromPay = contributing ? p.contributions.pretax * growth * k + p.contributions.hsa * growth : 0;
        ctx.wages[t] += Math.max(0, p.salary * growth - pretaxFromPay);
      }
      if (age >= 65) hc += p.healthcare.medicare * hcGrowth;
      else if (!working) hc += p.healthcare.preMedicare * hcGrowth;
    });
    ctx.over65Count[t] = over65;
    ctx.contrib.hsa[t] = Math.min(ctx.contrib.hsa[t], hsaLimit);
    ctx.hsaPenalty[t] = Math.min(ctx.ages[0][t], ctx.ages[1][t]) < 65 ? 1 : 0;
    if (contributing) {
      ctx.contrib.taxable[t] = plan.household.taxableContribution * growth;
      ctx.contrib.cash[t] = plan.household.cashContribution * growth;
    }
    ctx.healthcare[t] = hc;
    if (!working) ctx.baseSpending[t] = scenario.baseSpending;
    const [s1, s2] = annualBenefits(claimants[0], claimants[1], year);
    ctx.socialSecurity[t] = (s1 + s2) * payableShare(year, a.ssTrustFund);
  }

  // Dated items (D17): from the retirement date on; before it, only those not already in today's budget.
  for (const item of plan.datedItems) {
    const fromIdx = inTodaysBudget(plan, item) ? retireIdx : 0;
    const taxed = item.direction === 'income' && item.taxable !== false;
    for (const y of itemYears(plan, item, endYear)) {
      const t = y - startYear;
      if (t < fromIdx || t >= len) continue;
      const target =
        item.direction === 'expense'
          ? item.fixedDollars ? ctx.nominalOut : ctx.realOut
          : item.fixedDollars ? ctx.nominalIn : ctx.realIn;
      target[t] += item.amount;
      if (taxed) (item.fixedDollars ? ctx.nominalInTaxed : ctx.realInTaxed)[t] += item.amount;
    }
  }
  return ctx;
}

function clampIdx(i: number, len: number): number {
  return Math.max(0, Math.min(len, i));
}
