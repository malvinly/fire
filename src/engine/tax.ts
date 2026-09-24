import { FEDERAL } from '../data/rules';

export interface TaxInput {
  /** Ordinary income excluding Social Security: pre-tax withdrawals, conversions, RMDs. */
  ordinary: number;
  /** Realized long-term capital gains and qualified dividends. */
  ltcg: number;
  /** Interest income, already included in `ordinary`, that also counts toward the 3.8% NIIT (D70). */
  interest?: number;
  /** Total Social Security benefits received. */
  socialSecurity: number;
  /** Number of spouses aged 65+. */
  over65: number;
  /** Cumulative inflation since the plan start (1 = today). Shrinks non-indexed thresholds in real terms. */
  priceLevel: number;
  stateRate: number;
}

export interface TaxResult {
  federal: number;
  state: number;
  taxableSocialSecurity: number;
  /** Taxable income after deductions, ordinary portion. */
  ordinaryTaxable: number;
  taxableIncome: number;
}

export function deduction(over65: number): number {
  return FEDERAL.standardDeduction + FEDERAL.additional65PerPerson * over65;
}

/** Taxable part of Social Security for married filing jointly (IRS Pub 915 worksheet). */
export function taxableSocialSecurity(otherIncome: number, ss: number, priceLevel: number): number {
  if (ss <= 0) return 0;
  const t1 = FEDERAL.ssThreshold1 / priceLevel;
  const t2 = FEDERAL.ssThreshold2 / priceLevel;
  const provisional = otherIncome + 0.5 * ss;
  if (provisional <= t1) return 0;
  if (provisional <= t2) return Math.min(0.5 * (provisional - t1), 0.5 * ss);
  return Math.min(0.85 * ss, 0.85 * (provisional - t2) + Math.min(0.5 * ss, 0.5 * (t2 - t1)));
}

function ordinaryTax(taxable: number): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of FEDERAL.ordinaryBrackets) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

/** Tax on gains stacked on top of ordinary taxable income. */
function gainsTax(ordinaryTaxable: number, gainsTaxable: number): number {
  const top = ordinaryTaxable + gainsTaxable;
  const at15 = Math.max(0, Math.min(top, FEDERAL.ltcg15Top) - Math.max(ordinaryTaxable, FEDERAL.ltcg0Top));
  const at20 = Math.max(0, top - Math.max(ordinaryTaxable, FEDERAL.ltcg15Top));
  return at15 * 0.15 + at20 * 0.2;
}

export function computeTax(i: TaxInput): TaxResult {
  const taxableSS = taxableSocialSecurity(i.ordinary + i.ltcg, i.socialSecurity, i.priceLevel);
  const ded = deduction(i.over65);
  const ordinaryTaxable = Math.max(0, i.ordinary + taxableSS - ded);
  // Deduction left over after ordinary income reduces gains.
  const gainsTaxable = Math.max(0, i.ltcg - Math.max(0, ded - i.ordinary - taxableSS));
  const agi = i.ordinary + taxableSS + i.ltcg;
  const niit = FEDERAL.niitRate * Math.max(0, Math.min(i.ltcg + (i.interest ?? 0), agi - FEDERAL.niitThreshold / i.priceLevel));
  const federal = ordinaryTax(ordinaryTaxable) + gainsTax(ordinaryTaxable, gainsTaxable) + niit;
  // State: flat rate on federal taxable income, Social Security excluded (D33).
  const state = i.stateRate * Math.max(0, i.ordinary + i.ltcg - ded);
  return { federal, state, taxableSocialSecurity: taxableSS, ordinaryTaxable, taxableIncome: ordinaryTaxable + gainsTaxable };
}

/**
 * Additional ordinary income (pre-tax withdrawals/conversions) that brings ordinary taxable income up to
 * `bracketTop`, given income already in the year. Accounts for extra income making Social Security taxable.
 */
export function bracketRoom(
  bracketTop: number,
  existingOrdinary: number,
  ltcg: number,
  socialSecurity: number,
  over65: number,
  priceLevel: number,
): number {
  const ded = deduction(over65);
  const taxableAt = (w: number) =>
    existingOrdinary + w + taxableSocialSecurity(existingOrdinary + w + ltcg, socialSecurity, priceLevel) - ded;
  if (taxableAt(0) >= bracketTop) return 0;
  // taxableAt rises at 1x-1.85x per dollar, so the answer lies in [ (top - t0)/1.85, top - t0 ].
  const gap = bracketTop - taxableAt(0);
  let lo = gap / 1.85;
  let hi = gap;
  for (let k = 0; k < 40 && hi - lo > 0.5; k++) {
    const mid = (lo + hi) / 2;
    if (taxableAt(mid) > bracketTop) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Upper bound of the bracket taxed at `fill` percent (looked up by rate, not position). */
export function bracketTop(fill: '10' | '12' | '22' | '24'): number {
  const bracket = FEDERAL.ordinaryBrackets.find(([, rate]) => Math.round(rate * 100) === Number(fill));
  if (!bracket) throw new Error(`No ${fill}% bracket in the current tax table`);
  return bracket[0];
}
