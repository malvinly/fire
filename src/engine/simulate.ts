// Year-by-year simulation of one market path (D1, D7). Money moves at the start of each year,
// then that year's real return applies. All amounts are today's (real) dollars.

import { FEDERAL } from '../data/rules';
import type { Context } from './context';
import type { ReturnPaths } from './returns';
import { bracketRoom, computeTax } from './tax';
import type { PathOutcome, YearRecord } from './types';

export interface State {
  cash: number;
  taxable: number;
  taxableBasis: number;
  hsa: number;
  pretax: [number, number];
  roth: [number, number];
  /** Roth contributions + conversions not yet withdrawn (withdrawable tax-free; conversions after 5 years). */
  rothPrincipal: [number, number];
  /** Conversions by year index, for the 5-year seasoning rule. Reduced when unseasoned money is withdrawn. */
  conversions: [Float64Array, Float64Array];
}

export function initialState(ctx: Context): State {
  const { you, spouse, household } = ctx.plan;
  return {
    cash: household.cash,
    taxable: household.taxable,
    taxableBasis: Math.min(household.taxableBasis, household.taxable),
    hsa: you.balances.hsa + spouse.balances.hsa,
    pretax: [you.balances.pretax, spouse.balances.pretax],
    roth: [you.balances.roth, spouse.balances.roth],
    rothPrincipal: [Math.min(you.balances.rothBasis, you.balances.roth), Math.min(spouse.balances.rothBasis, spouse.balances.roth)],
    conversions: [new Float64Array(ctx.len), new Float64Array(ctx.len)],
  };
}

export function cloneState(s: State): State {
  return {
    ...s,
    pretax: [...s.pretax],
    roth: [...s.roth],
    rothPrincipal: [...s.rothPrincipal],
    conversions: [s.conversions[0].slice(), s.conversions[1].slice()],
  };
}

export function totalBalance(s: State): number {
  return s.cash + s.taxable + s.hsa + s.pretax[0] + s.pretax[1] + s.roth[0] + s.roth[1];
}

/**
 * Scale every balance (and basis) so the total equals `total`. A state with no money at all has no mix to
 * scale, so the total is placed in the taxable account at full basis (D50).
 */
export function scaleState(s: State, total: number): State {
  const out = cloneState(s);
  const current = totalBalance(s);
  if (current <= 0) {
    out.taxable = out.taxableBasis = total;
    return out;
  }
  const k = total / current;
  out.cash *= k;
  out.taxable *= k;
  out.taxableBasis *= k;
  out.hsa *= k;
  for (const i of [0, 1] as const) {
    out.pretax[i] *= k;
    out.roth[i] *= k;
    out.rothPrincipal[i] *= k;
    for (let t = 0; t < out.conversions[i].length; t++) out.conversions[i][t] *= k;
  }
  return out;
}

export interface SimOptions {
  startIdx?: number;
  /** Exclusive: stop before this year index and return the state (used for projections). */
  stopIdx?: number;
  startState?: State;
  /** Path year used for plan year t is t - pathShift. */
  pathShift?: number;
  /**
   * Price level (cumulative inflation since the plan start) at `startIdx`. Defaults to the path's own
   * inflation over years [0, startIdx), which requires pathShift = 0. Retirement-only runs pass one value
   * for both bootstrap and history so they describe the same scenario (D51).
   */
  initialPriceLevel?: number;
  /** If given, end-of-year total balance is written at totals[t]. */
  totals?: Float64Array;
  record?: boolean;
}

export interface SimResult extends PathOutcome {
  state: State;
  records?: YearRecord[];
}

/**
 * One retired year's withdrawal plan. `rmd` and `fillTarget` are inputs set by the caller before planDraws;
 * everything else is output. Reused across the tax iterations to avoid allocation.
 */
interface Draws {
  rmd: [number, number];
  /** Bracket-fill amount chosen before spending is known (input). */
  fillTarget: [number, number];
  /** Bracket fill actually taken — lower than the target if the money was needed for spending before 59½. */
  fill: [number, number];
  convert: [number, number];
  rmdSurplus: number;
  cash: number;
  taxable: number;
  gain: number;
  rothAccessible: [number, number];
  pretaxExtra: [number, number];
  pretaxPenalty: [number, number];
  /** Early Roth withdrawals: unseasoned conversion principal (penalty only) and earnings (tax + penalty). */
  rothPenaltyPrincipal: [number, number];
  rothPenaltyEarnings: [number, number];
  hsaNonMedical: number;
  surplus: number;
  shortfall: number;
}

function emptyDraws(): Draws {
  return {
    rmd: [0, 0], fillTarget: [0, 0], fill: [0, 0], convert: [0, 0], rmdSurplus: 0, cash: 0, taxable: 0, gain: 0,
    rothAccessible: [0, 0], pretaxExtra: [0, 0], pretaxPenalty: [0, 0], rothPenaltyPrincipal: [0, 0],
    rothPenaltyEarnings: [0, 0], hsaNonMedical: 0, surplus: 0, shortfall: 0,
  };
}

/** Conversions made in the last 5 years (this year included) — not yet withdrawable before 59½. */
function unseasoned(s: State, i: 0 | 1, t: number): number {
  let sum = 0;
  for (let k = Math.max(0, t - 4); k <= t; k++) sum += s.conversions[i][k];
  return sum;
}

/** Withdrawn unseasoned principal leaves the conversion history oldest-first (IRS ordering). */
function consumeConversions(s: State, i: 0 | 1, t: number, amount: number) {
  for (let k = Math.max(0, t - 4); k <= t && amount > 0; k++) {
    const take = Math.min(amount, s.conversions[i][k]);
    s.conversions[i][k] -= take;
    amount -= take;
  }
}

/**
 * Fill `d` with withdrawals that cover `need` (D27, D28). Reads `s`, `d.rmd` and `d.fillTarget`; writes the
 * rest of `d`. Order: RMDs and spendable bracket fill → cash → taxable → pre-tax (past 59½) → Roth (all past
 * 59½; seasoned principal before) → pre-tax with penalty (reclaiming this year's conversion first) → early
 * Roth → HSA.
 */
function planDraws(ctx: Context, s: State, t: number, need: number, hsaMedical: number, order: readonly [0 | 1, 0 | 1], d: Draws) {
  const access = [ctx.access[0][t], ctx.access[1][t]];
  let remaining = Math.max(0, need);
  d.surplus = Math.max(0, -need);

  // 1. RMDs, then bracket-fill money from people past 59½, are spendable; the rest of the fill is converted.
  const rmdTotal = d.rmd[0] + d.rmd[1];
  const rmdUsed = Math.min(remaining, rmdTotal);
  remaining -= rmdUsed;
  d.rmdSurplus = rmdTotal - rmdUsed;
  for (const i of order) {
    d.fill[i] = d.fillTarget[i];
    const usable = access[i] ? Math.min(remaining, d.fill[i]) : 0;
    remaining -= usable;
    d.convert[i] = d.fill[i] - usable;
  }
  // 2. Cash, 3. taxable.
  d.cash = Math.min(remaining, s.cash);
  remaining -= d.cash;
  d.taxable = Math.min(remaining, s.taxable);
  remaining -= d.taxable;
  d.gain = s.taxable > 0 ? Math.max(0, d.taxable * (1 - s.taxableBasis / s.taxable)) : 0;
  // 4. Pre-tax beyond RMD/fill for people past 59½.
  for (const i of order) {
    d.pretaxExtra[i] = access[i] ? Math.min(remaining, s.pretax[i] - d.rmd[i] - d.fill[i]) : 0;
    remaining -= d.pretaxExtra[i];
  }
  // 5. Roth: everything past 59½, otherwise principal that is not an unseasoned conversion.
  for (const i of order) {
    const avail = access[i] ? s.roth[i] : Math.min(s.roth[i], Math.max(0, s.rothPrincipal[i] - unseasoned(s, i, t)));
    d.rothAccessible[i] = Math.min(remaining, avail);
    remaining -= d.rothAccessible[i];
  }
  // 6. Pre-tax with the 10% penalty for people under 59½. This year's planned conversion is given up first:
  //    spending money beats converting it (D52).
  for (const i of order) {
    d.pretaxPenalty[i] = 0;
    if (access[i]) continue;
    const unfilled = s.pretax[i] - d.rmd[i] - d.fill[i];
    const take = Math.min(remaining, unfilled + d.convert[i]);
    // Spending the planned conversion keeps income inside the chosen bracket (D29); only then more pre-tax.
    const reclaimed = Math.min(take, d.convert[i]);
    d.convert[i] -= reclaimed;
    d.fill[i] -= reclaimed;
    d.pretaxPenalty[i] = take;
    remaining -= take;
  }
  // 7. Early Roth: unseasoned conversion principal (10% penalty only), then earnings (tax + penalty).
  for (const i of order) {
    d.rothPenaltyPrincipal[i] = d.rothPenaltyEarnings[i] = 0;
    if (access[i]) continue;
    const left = s.roth[i] - d.rothAccessible[i];
    const principalLeft = Math.max(0, Math.min(left, s.rothPrincipal[i] - d.rothAccessible[i]));
    d.rothPenaltyPrincipal[i] = Math.min(remaining, principalLeft);
    remaining -= d.rothPenaltyPrincipal[i];
    d.rothPenaltyEarnings[i] = Math.min(remaining, left - d.rothPenaltyPrincipal[i]);
    remaining -= d.rothPenaltyEarnings[i];
  }
  // 8. HSA for non-medical spending.
  d.hsaNonMedical = Math.min(remaining, s.hsa - hsaMedical);
  remaining -= d.hsaNonMedical;
  d.shortfall = remaining;
}

function penalizedAmount(d: Draws): number {
  return d.pretaxPenalty[0] + d.pretaxPenalty[1] + d.rothPenaltyPrincipal[0] + d.rothPenaltyPrincipal[1] +
    d.rothPenaltyEarnings[0] + d.rothPenaltyEarnings[1];
}

function taxOf(ctx: Context, t: number, d: Draws, ss: number, priceLevel: number) {
  const ordinary =
    d.rmd[0] + d.rmd[1] + d.fill[0] + d.fill[1] + d.pretaxExtra[0] + d.pretaxExtra[1] +
    d.pretaxPenalty[0] + d.pretaxPenalty[1] + d.rothPenaltyEarnings[0] + d.rothPenaltyEarnings[1] + d.hsaNonMedical;
  const tax = computeTax({
    ordinary,
    ltcg: d.gain,
    socialSecurity: ss,
    over65: ctx.over65Count[t],
    priceLevel,
    stateRate: ctx.plan.assumptions.stateTaxRate,
  });
  const penalty =
    FEDERAL.earlyWithdrawalPenalty * penalizedAmount(d) + (ctx.hsaPenalty[t] ? FEDERAL.hsaNonMedicalPenalty * d.hsaNonMedical : 0);
  return { ...tax, penalty, ordinary, total: tax.federal + tax.state + penalty };
}

export function simulatePath(ctx: Context, paths: ReturnPaths, p: number, opts: SimOptions = {}): SimResult {
  const startIdx = opts.startIdx ?? 0;
  const stopIdx = opts.stopIdx ?? ctx.len;
  const shift = opts.pathShift ?? 0;
  const s = opts.startState ? cloneState(opts.startState) : initialState(ctx);
  const records: YearRecord[] | undefined = opts.record ? [] : undefined;
  const d = emptyDraws();
  let priceLevel = opts.initialPriceLevel ?? 1;
  if (opts.initialPriceLevel === undefined) {
    if (shift !== 0 && startIdx > 0) throw new Error('initialPriceLevel is required when pathShift is used');
    for (let t = 0; t < startIdx; t++) priceLevel *= 1 + paths.inflation[p * paths.len + t];
  }

  let failYear: number | null = null;
  let usedPenalty = false;
  let minBalance = Infinity;

  for (let t = startIdx; t < stopIdx; t++) {
    const pi = p * paths.len + (t - shift);
    const r = paths.portfolio[pi];
    const rc = paths.cash[pi];
    const ss = ctx.socialSecurity[t];
    const rmd0 = ctx.rmdDivisor[0][t] > 0 ? s.pretax[0] / ctx.rmdDivisor[0][t] : 0;
    const rmd1 = ctx.rmdDivisor[1][t] > 0 ? s.pretax[1] / ctx.rmdDivisor[1][t] : 0;
    let rec: YearRecord | undefined;

    if (ctx.working[t]) {
      // Contributions (zero once contributions stop, e.g. Coast FIRE).
      s.pretax[0] += ctx.contrib.pretax[0][t];
      s.pretax[1] += ctx.contrib.pretax[1][t];
      for (const i of [0, 1] as const) {
        s.roth[i] += ctx.contrib.roth[i][t];
        s.rothPrincipal[i] += ctx.contrib.roth[i][t];
      }
      s.hsa += ctx.contrib.hsa[t];
      s.taxable += ctx.contrib.taxable[t];
      s.taxableBasis += ctx.contrib.taxable[t];
      s.cash += ctx.contrib.cash[t];
      // Social Security already claimed and RMDs while still working: the paycheck covers spending, so they
      // are saved to taxable after the extra tax they cause on top of wages (D49).
      let extraFederal = 0;
      let extraState = 0;
      if (ss > 0 || rmd0 + rmd1 > 0) {
        const base = { ltcg: 0, over65: ctx.over65Count[t], priceLevel, stateRate: ctx.plan.assumptions.stateTaxRate };
        const withIt = computeTax({ ...base, ordinary: ctx.wages[t] + rmd0 + rmd1, socialSecurity: ss });
        const without = computeTax({ ...base, ordinary: ctx.wages[t], socialSecurity: 0 });
        extraFederal = withIt.federal - without.federal;
        extraState = withIt.state - without.state;
        s.pretax[0] -= rmd0;
        s.pretax[1] -= rmd1;
        const saved = ss + rmd0 + rmd1 - extraFederal - extraState;
        s.taxable += saved;
        s.taxableBasis += saved;
      }
      // Dated items not already in today's budget (D17): inflows are saved to taxable; costs come from cash, then
      // taxable (paying the capital-gains tax on the sale). A cost savings can't cover fails the path.
      const datedIn = ctx.realIn[t] + ctx.nominalIn[t] / priceLevel;
      const datedOut = ctx.realOut[t] + ctx.nominalOut[t] / priceLevel;
      let fromCash = 0;
      let fromTaxable = 0;
      let gain = 0;
      let gainsFederal = 0;
      let gainsState = 0;
      let short = 0;
      if (datedIn > datedOut) {
        s.taxable += datedIn - datedOut;
        s.taxableBasis += datedIn - datedOut;
      } else if (datedOut > datedIn) {
        fromCash = Math.min(datedOut - datedIn, s.cash);
        s.cash -= fromCash;
        const need = datedOut - datedIn - fromCash;
        if (need > 0) {
          const gainShare = s.taxable > 0 ? Math.max(0, 1 - s.taxableBasis / s.taxable) : 0;
          const base = {
            ordinary: ctx.wages[t] + rmd0 + rmd1, socialSecurity: ss, over65: ctx.over65Count[t], priceLevel,
            stateRate: ctx.plan.assumptions.stateTaxRate,
          };
          const before = computeTax({ ...base, ltcg: 0 });
          const gainsTax = (sold: number) => {
            const after = computeTax({ ...base, ltcg: sold * gainShare });
            return [after.federal - before.federal, after.state - before.state] as const;
          };
          // The sale also pays its own tax: iterate to a fixed point.
          let sell = need;
          for (let iter = 0; iter < 20; iter++) {
            const [f, st] = gainsTax(Math.min(sell, s.taxable));
            const next = need + f + st;
            const converged = Math.abs(next - sell) < 0.5;
            sell = next;
            if (converged) break;
          }
          fromTaxable = Math.min(sell, s.taxable);
          [gainsFederal, gainsState] = gainsTax(fromTaxable);
          gain = fromTaxable * gainShare;
          if (sell > s.taxable) short = Math.max(0, need + gainsFederal + gainsState - fromTaxable);
          if (fromTaxable > 0) {
            s.taxableBasis *= 1 - fromTaxable / s.taxable;
            s.taxable -= fromTaxable;
          }
        }
        if (short > 1 && failYear === null) failYear = ctx.years[t];
      }
      if (records) {
        rec = blankRecord(ctx, t, true);
        rec.spending = datedOut;
        rec.otherIncome = datedIn;
        rec.socialSecurity = ss;
        rec.rmd = rmd0 + rmd1;
        rec.withdrawals.cash = fromCash;
        rec.withdrawals.taxable = fromTaxable;
        rec.capitalGains = gain;
        rec.federalTax = extraFederal + gainsFederal;
        rec.stateTax = extraState + gainsState;
        rec.shortfall = short;
      }
    } else {
      const inflow = ctx.realIn[t] + ctx.nominalIn[t] / priceLevel;
      const outflow = ctx.baseSpending[t] + ctx.realOut[t] + ctx.nominalOut[t] / priceLevel;
      const hc = ctx.healthcare[t];
      const hsaMedical = Math.min(s.hsa, hc);
      const baseNeed = outflow + hc - hsaMedical - ss - inflow;
      const order: readonly [0 | 1, 0 | 1] = ctx.ages[0][t] >= ctx.ages[1][t] ? [0, 1] : [1, 0];

      d.rmd[0] = rmd0;
      d.rmd[1] = rmd1;
      d.fillTarget[0] = d.fillTarget[1] = 0;
      if (ctx.fillTop > 0) {
        // Bracket room ignores this year's capital gains (they stack above ordinary income, D39).
        let room = bracketRoom(ctx.fillTop, rmd0 + rmd1, 0, ss, ctx.over65Count[t], priceLevel);
        for (const i of order) {
          d.fillTarget[i] = Math.max(0, Math.min(room, s.pretax[i] - d.rmd[i]));
          room -= d.fillTarget[i];
        }
      }

      // Taxes are part of the need, and withdrawals change taxes: iterate to a fixed point.
      planDraws(ctx, s, t, baseNeed, hsaMedical, order, d);
      let tax = taxOf(ctx, t, d, ss, priceLevel);
      for (let iter = 0; iter < 20; iter++) {
        planDraws(ctx, s, t, baseNeed + tax.total, hsaMedical, order, d);
        const next = taxOf(ctx, t, d, ss, priceLevel);
        const converged = Math.abs(next.total - tax.total) < 0.5;
        tax = next;
        if (converged) break;
      }

      // Apply.
      s.cash -= d.cash;
      if (d.taxable > 0) {
        s.taxableBasis *= 1 - d.taxable / s.taxable;
        s.taxable -= d.taxable;
      }
      for (const i of [0, 1] as const) {
        s.pretax[i] -= d.rmd[i] + d.fill[i] + d.pretaxExtra[i] + d.pretaxPenalty[i];
        const rothOut = d.rothAccessible[i] + d.rothPenaltyPrincipal[i] + d.rothPenaltyEarnings[i];
        s.roth[i] -= rothOut;
        s.rothPrincipal[i] = Math.max(0, s.rothPrincipal[i] - d.rothAccessible[i] - d.rothPenaltyPrincipal[i]);
        consumeConversions(s, i, t, d.rothPenaltyPrincipal[i]);
        s.roth[i] += d.convert[i];
        s.rothPrincipal[i] += d.convert[i];
        s.conversions[i][t] += d.convert[i];
      }
      s.hsa -= hsaMedical + d.hsaNonMedical;
      const deposit = d.rmdSurplus + d.surplus;
      s.taxable += deposit;
      s.taxableBasis += deposit;

      const penaltyAmt = penalizedAmount(d);
      if (penaltyAmt > 1) usedPenalty = true;
      if (d.shortfall > 1 && failYear === null) failYear = ctx.years[t];

      if (records) {
        rec = blankRecord(ctx, t, false);
        rec.spending = outflow + hc;
        rec.healthcare = hc;
        rec.socialSecurity = ss;
        rec.otherIncome = inflow;
        rec.withdrawals = {
          cash: d.cash,
          taxable: d.taxable,
          roth: d.rothAccessible[0] + d.rothAccessible[1] + d.rothPenaltyPrincipal[0] + d.rothPenaltyPrincipal[1] +
            d.rothPenaltyEarnings[0] + d.rothPenaltyEarnings[1],
          pretax: d.rmd[0] + d.rmd[1] + d.fill[0] + d.fill[1] - d.convert[0] - d.convert[1] +
            d.pretaxExtra[0] + d.pretaxExtra[1] + d.pretaxPenalty[0] + d.pretaxPenalty[1],
          hsa: hsaMedical + d.hsaNonMedical,
        };
        rec.conversions = d.convert[0] + d.convert[1];
        rec.rmd = d.rmd[0] + d.rmd[1];
        rec.penaltyWithdrawals = penaltyAmt;
        rec.ordinaryIncome = tax.ordinary + tax.taxableSocialSecurity;
        rec.capitalGains = d.gain;
        rec.taxableIncome = tax.taxableIncome;
        rec.federalTax = tax.federal;
        rec.stateTax = tax.state;
        rec.penaltyTax = tax.penalty;
        rec.shortfall = d.shortfall;
      }
    }

    // Growth (invested accounts share one allocation; cash earns T-bills, D8/D9).
    s.cash *= 1 + rc;
    s.taxable *= 1 + r;
    s.hsa *= 1 + r;
    for (const i of [0, 1] as const) {
      s.pretax[i] *= 1 + r;
      s.roth[i] *= 1 + r;
    }
    // Cost basis, Roth principal and conversion amounts are fixed nominal dollars: deflate them so they stay in
    // today's dollars like everything else (D63). Conversions older than 5 years are never read again.
    const inflation = 1 + paths.inflation[pi];
    s.taxableBasis /= inflation;
    for (const i of [0, 1] as const) {
      s.rothPrincipal[i] /= inflation;
      for (let k = Math.max(0, t - 4); k <= t; k++) s.conversions[i][k] /= inflation;
    }
    priceLevel *= inflation;

    const total = totalBalance(s);
    if (opts.totals) opts.totals[t] = failYear === null ? total : 0;
    if (!ctx.working[t] && failYear === null) minBalance = Math.min(minBalance, total);
    if (rec) {
      rec.balances = {
        cash: s.cash, taxable: s.taxable, pretax: s.pretax[0] + s.pretax[1], roth: s.roth[0] + s.roth[1], hsa: s.hsa, total,
      };
      records!.push(rec);
    }
  }

  return {
    success: failYear === null,
    failYear,
    usedPenalty,
    endBalance: failYear === null ? totalBalance(s) : 0,
    minBalance: failYear === null ? (minBalance === Infinity ? totalBalance(s) : minBalance) : 0,
    state: s,
    records,
  };
}

function blankRecord(ctx: Context, t: number, working: boolean): YearRecord {
  return {
    year: ctx.years[t],
    ageYou: ctx.ages[0][t],
    ageSpouse: ctx.ages[1][t],
    working,
    spending: 0,
    healthcare: 0,
    socialSecurity: 0,
    otherIncome: 0,
    withdrawals: { cash: 0, taxable: 0, roth: 0, pretax: 0, hsa: 0 },
    conversions: 0,
    rmd: 0,
    penaltyWithdrawals: 0,
    ordinaryIncome: 0,
    capitalGains: 0,
    taxableIncome: 0,
    federalTax: 0,
    stateTax: 0,
    penaltyTax: 0,
    balances: { cash: 0, taxable: 0, pretax: 0, roth: 0, hsa: 0, total: 0 },
    shortfall: 0,
  };
}
