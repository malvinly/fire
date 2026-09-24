import { SOCIAL_SECURITY, fullRetirementAgeMonths } from '../data/rules';
import type { EarningsYear } from './types';

/**
 * Primary insurance amount (monthly, today's dollars) from an earnings record (D24).
 * `history`: nominal taxed earnings from the SSA record. `futureEarnings`: projected real earnings by
 * calendar year; this function caps them at the taxable maximum. Years present in both use the history value.
 * Earnings are indexed to AWI[awiLatestYear] and the bend points must be the ones for first eligibility in
 * awiLatestYear + 2 — SSA derives both from the same wage index (see src/data/rules.ts).
 * `wage`: real growth of the national wage index after awiLatestYear (D77). Later earnings then count relative to
 * the higher wage level (the taxable maximum rises with it), and the benefit scales with the wage level in the
 * year the person turns 60. Growth 0 gives exactly the result without it.
 */
export function computePia(history: EarningsYear[], futureEarnings: Map<number, number>, wage?: { wageGrowth: number; birthYear: number }): number {
  const { awi, awiLatestYear, taxableMax, bendPoints } = SOCIAL_SECURITY;
  const g = wage?.wageGrowth ?? 0;
  const byYear = new Map<number, number>();
  // The taxable maximum for year y follows the wage index two years earlier (2026's max is set from AWI 2024).
  for (const [y, v] of futureEarnings) byYear.set(y, Math.min(v, taxableMax * Math.pow(1 + g, y - awiLatestYear - 2)));
  for (const e of history) byYear.set(e.year, e.amount);
  const indexed: number[] = [];
  for (const [y, v] of byYear) {
    if (v <= 0) continue;
    const factor = y < awiLatestYear && awi[y] ? awi[awiLatestYear] / awi[y] : 1 / Math.pow(1 + g, Math.max(0, y - awiLatestYear));
    indexed.push(v * factor);
  }
  indexed.sort((a, b) => b - a);
  const top35 = indexed.slice(0, 35).reduce((s, v) => s + v, 0);
  const aime = Math.floor(top35 / 420);
  return piaFromAime(aime, bendPoints) * wageLevelAt60(g, wage?.birthYear ?? awiLatestYear + 60);
}

/** How much higher the national wage level is in the year a person turns 60 than in the wage-index year (D77). */
export function wageLevelAt60(wageGrowth: number, birthYear: number): number {
  return wageGrowth === 0 ? 1 : Math.pow(1 + wageGrowth, birthYear + 60 - SOCIAL_SECURITY.awiLatestYear);
}

export function piaFromAime(aime: number, [b1, b2]: readonly [number, number]): number {
  const pia = 0.9 * Math.min(aime, b1) + 0.32 * Math.max(0, Math.min(aime, b2) - b1) + 0.15 * Math.max(0, aime - b2);
  return Math.floor(pia * 10) / 10; // SSA rounds down to the dime
}

/** Factor applied to the worker's own PIA when claiming at `claimAge` (whole years). */
export function ownClaimFactor(birthYear: number, claimAge: number): number {
  const months = claimAge * 12 - fullRetirementAgeMonths(birthYear);
  if (months >= 0) return 1 + Math.min(months, 70 * 12 - fullRetirementAgeMonths(birthYear)) * (2 / 3 / 100);
  const early = -months;
  return 1 - (Math.min(early, 36) * 5) / 9 / 100 - (Math.max(0, early - 36) * 5) / 12 / 100;
}

/** Factor applied to the spousal benefit (50% of the other's PIA) when claimed at `claimAge`. No delayed credits. */
export function spousalClaimFactor(birthYear: number, claimAge: number): number {
  const months = claimAge * 12 - fullRetirementAgeMonths(birthYear);
  if (months >= 0) return 1;
  const early = -months;
  return 1 - (Math.min(early, 36) * 25) / 36 / 100 - (Math.max(0, early - 36) * 5) / 12 / 100;
}

export interface ClaimantInput {
  birthYear: number;
  birthMonth: number;
  claimAge: number;
  pia: number;
}

/**
 * Annual household Social Security by calendar year, before the trust-fund cut, in today's dollars.
 * Returns per-person annual amounts for `year`.
 */
export function annualBenefits(a: ClaimantInput, b: ClaimantInput, year: number): [number, number] {
  return [personBenefit(a, b, year), personBenefit(b, a, year)];
}

/**
 * First month (1–12) a claimant is entitled to benefits in the claim year. At 62 it is the month after the
 * birthday month, because you must be 62 for the whole month (D25).
 */
function firstMonth(c: ClaimantInput): number {
  return c.birthMonth + (c.claimAge === 62 ? 1 : 0);
}

/** Months of benefit received in `year`, cash basis: each month's benefit arrives the following month (D25). */
function monthsPaid(year: number, fromYear: number, fromMonth: number): number {
  if (year < fromYear) return 0;
  return year > fromYear ? 12 : Math.max(0, 12 - fromMonth);
}

function personBenefit(self: ClaimantInput, other: ClaimantInput, year: number): number {
  const startYear = self.birthYear + self.claimAge;
  if (year < startYear) return 0;
  const own = self.pia * ownClaimFactor(self.birthYear, self.claimAge);
  let total = own * monthsPaid(year, startYear, firstMonth(self));
  const otherStart = other.birthYear + other.claimAge;
  if (year >= otherStart) {
    const excess = Math.max(0, 0.5 * other.pia - self.pia);
    // Spousal starts when both have filed; its reduction depends on self's age when it starts.
    const spousalStartAge = Math.max(self.claimAge, otherStart - self.birthYear);
    const spousal = excess * spousalClaimFactor(self.birthYear, Math.min(spousalStartAge, 70));
    const fromYear = Math.max(startYear, otherStart);
    const fromMonth = startYear === otherStart ? Math.max(firstMonth(self), firstMonth(other))
      : otherStart > startYear ? firstMonth(other) : firstMonth(self);
    total += spousal * monthsPaid(year, fromYear, fromMonth);
  }
  return total;
}

/** Share of scheduled benefits payable in `year` under the trust-fund assumption (D26). */
export function payableShare(
  year: number,
  tf: { startYear: number; startPct: number; endYear: number; endPct: number },
): number {
  if (year < tf.startYear) return 1;
  if (year >= tf.endYear) return tf.endPct;
  return tf.startPct + ((tf.endPct - tf.startPct) * (year - tf.startYear)) / (tf.endYear - tf.startYear);
}
