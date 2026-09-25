// Year-by-year simulation of one market path (D1, D7). Money moves at the start of each year,
// then that year's real return applies. All amounts are today's (real) dollars.

import { FEDERAL } from '../data/rules';
import { bondInterestRate, TAXABLE_YIELDS, type Context } from './context';
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

/** Shares of new money going to each account (sum 1); Roth money is contributions, brokerage money is basis. */
export interface Mix {
  pretax: [number, number];
  roth: [number, number];
  hsa: number;
  taxable: number;
}

/**
 * A state holding `total` in all. Without `extra`, every balance (and basis) is scaled, and a state with no money
 * at all puts the total in the taxable account at full basis (D50). With `extra`, money above today's total is
 * added in that mix instead, so a small or all-cash balance doesn't set the mix of the whole amount (D50).
 */
export function scaleState(s: State, total: number, extra?: Mix): State {
  const out = cloneState(s);
  const current = totalBalance(s);
  if (extra && total > current) {
    const add = total - Math.max(0, current);
    for (const i of [0, 1] as const) {
      out.pretax[i] += add * extra.pretax[i];
      out.roth[i] += add * extra.roth[i];
      out.rothPrincipal[i] += add * extra.roth[i];
    }
    out.hsa += add * extra.hsa;
    out.taxable += add * extra.taxable;
    out.taxableBasis += add * extra.taxable;
    return out;
  }
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

/**
 * A Roth conversion can be withdrawn before 59½ once it is this many years old. Only the last SEASONING_YEARS
 * entries of `State.conversions` are ever read (and deflated, D63); older entries stay in the dollars of the year
 * they left the window and must not be read as today's dollars.
 */
const SEASONING_YEARS = 5;
/** Savings run out in a year that is short of what it needs by more than this many dollars. */
export const RUN_OUT_SHORTFALL = 1;

/** Conversions made in the last 5 years (this year included) — not yet withdrawable before 59½. */
function unseasoned(s: State, i: 0 | 1, t: number): number {
  let sum = 0;
  for (let k = Math.max(0, t - SEASONING_YEARS + 1); k <= t; k++) sum += s.conversions[i][k];
  return sum;
}

/** Roth money person `i` can withdraw without tax or penalty in year `t` (D27). */
function rothAvailable(ctx: Context, s: State, i: 0 | 1, t: number): number {
  return ctx.access[i][t] ? s.roth[i] : Math.min(s.roth[i], Math.max(0, s.rothPrincipal[i] - unseasoned(s, i, t)));
}

/** Withdrawn unseasoned principal leaves the conversion history oldest-first (IRS ordering). */
function consumeConversions(s: State, i: 0 | 1, t: number, amount: number) {
  for (let k = Math.max(0, t - SEASONING_YEARS + 1); k <= t && amount > 0; k++) {
    const take = Math.min(amount, s.conversions[i][k]);
    s.conversions[i][k] -= take;
    amount -= take;
  }
}

/**
 * Fill `d` with withdrawals that cover `need` (D27, D28). Reads `s`, `d.rmd` and `d.fillTarget`; writes the
 * rest of `d`. Order: RMDs and spendable bracket fill → cash → taxable → pre-tax (past 59½) → Roth (all past
 * 59½; seasoned principal before) → pre-tax with penalty (reclaiming this year's conversion first) → early
 * Roth → HSA. src/ui/playbook.ts restates this order for the user in plain language (D93): mirror a change there.
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
    d.rothAccessible[i] = Math.min(remaining, rothAvailable(ctx, s, i, t));
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

/**
 * A path's income rates for one year (D70): `dividendRate` and `interestRate` are the shares of the brokerage
 * balance paid as dividends and interest, `tbill` the nominal T-bill rate the cash account earns.
 */
interface IncomeRates {
  dividendRate: number;
  interestRate: number;
  tbill: number;
}

/**
 * Sets `r` to year `pi` of `paths`: dividends at the fixed yield, bond interest at the market's own January
 * 10-year yield but never below the fixed one (D82), and its T-bill rate for the cash share and the cash account.
 */
function setIncomeRates(ctx: Context, paths: ReturnPaths, pi: number, r: IncomeRates) {
  const mix = ctx.incomeMix;
  r.tbill = Math.max(0, (1 + paths.cash[pi]) * (1 + paths.inflation[pi]) - 1);
  r.dividendRate = mix.stocks * TAXABLE_YIELDS.stockDividends;
  r.interestRate = mix.bonds * bondInterestRate(paths.bondYield[pi]) + mix.cash * r.tbill;
}

/**
 * Yearly income on the money invested this year (D70): brokerage dividends (taxed like long-term gains), and
 * interest from the brokerage account's bonds and cash share and from the cash account (ordinary income).
 */
function investmentIncome(taxable: number, cash: number, r: IncomeRates) {
  const invested = Math.max(0, taxable);
  const dividends = invested * r.dividendRate;
  const brokerageInterest = invested * r.interestRate;
  return { dividends, brokerageInterest, interest: brokerageInterest + Math.max(0, cash) * r.tbill };
}

/**
 * Tax for a retired year given the withdrawals in `d`. `otherOrdinary`: ordinary income that isn't a withdrawal
 * (taxed dated income, D66). Investment income is earned on what stays invested after the withdrawals (D7, D70).
 */
function taxOf(ctx: Context, t: number, d: Draws, s: State, ss: number, priceLevel: number, otherOrdinary: number, rates: IncomeRates) {
  const inv = investmentIncome(s.taxable - d.taxable + d.rmdSurplus + d.surplus, s.cash - d.cash, rates);
  const ordinary = otherOrdinary + inv.interest +
    d.rmd[0] + d.rmd[1] + d.fill[0] + d.fill[1] + d.pretaxExtra[0] + d.pretaxExtra[1] +
    d.pretaxPenalty[0] + d.pretaxPenalty[1] + d.rothPenaltyEarnings[0] + d.rothPenaltyEarnings[1] + d.hsaNonMedical;
  const tax = computeTax({
    ordinary,
    ltcg: d.gain + inv.dividends,
    interest: inv.interest,
    socialSecurity: ss,
    over65: ctx.over65Count[t],
    priceLevel,
    stateRate: ctx.plan.assumptions.stateTaxRate,
  });
  const penalty =
    FEDERAL.earlyWithdrawalPenalty * penalizedAmount(d) + (ctx.hsaPenalty[t] ? FEDERAL.hsaNonMedicalPenalty * d.hsaNonMedical : 0);
  return { ...tax, penalty, ordinary, inv, total: tax.federal + tax.state + penalty };
}

export function simulatePath(ctx: Context, paths: ReturnPaths, p: number, opts: SimOptions = {}): SimResult {
  const startIdx = opts.startIdx ?? 0;
  const stopIdx = opts.stopIdx ?? ctx.len;
  const shift = opts.pathShift ?? 0;
  const s = opts.startState ? cloneState(opts.startState) : initialState(ctx);
  const records: YearRecord[] | undefined = opts.record ? [] : undefined;
  const d = emptyDraws();
  const rates: IncomeRates = { dividendRate: 0, interestRate: 0, tbill: 0 };
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
    setIncomeRates(ctx, paths, pi, rates);
    const ss = ctx.socialSecurity[t];
    const rmd0 = ctx.rmdDivisor[0][t] > 0 ? s.pretax[0] / ctx.rmdDivisor[0][t] : 0;
    const rmd1 = ctx.rmdDivisor[1][t] > 0 ? s.pretax[1] / ctx.rmdDivisor[1][t] : 0;
    // Dated income taxed as ordinary income (D66).
    const taxedIn = ctx.realInTaxed[t] + ctx.nominalInTaxed[t] / priceLevel;
    let rec: YearRecord | undefined;
    const seasonedRoth = records ? rothAvailable(ctx, s, 0, t) + rothAvailable(ctx, s, 1, t) : 0;

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
      // Working-year tax is figured in layers, each as the extra tax on top of the layers before it:
      //   wages → Social Security and RMDs (D49) → taxed dated income (D66) → the gain on a brokerage sale for a
      //   dated cost (D17) → brokerage and cash income (D70).
      // A new kind of working-year income must be added to the `ordinary` of every later layer.
      // Social Security already claimed and RMDs while still working: the paycheck covers spending, so they
      // are saved to taxable after the extra tax they cause on top of wages (D49). Taxed dated income is stacked
      // on top of those and loses its own extra tax (D66).
      let extraFederal = 0;
      let extraState = 0;
      let datedFederal = 0;
      let datedState = 0;
      if (ss > 0 || rmd0 + rmd1 > 0 || taxedIn > 0) {
        const base = { ltcg: 0, over65: ctx.over65Count[t], priceLevel, stateRate: ctx.plan.assumptions.stateTaxRate };
        const without = computeTax({ ...base, ordinary: ctx.wages[t], socialSecurity: 0 });
        const withIt = computeTax({ ...base, ordinary: ctx.wages[t] + rmd0 + rmd1, socialSecurity: ss });
        extraFederal = withIt.federal - without.federal;
        extraState = withIt.state - without.state;
        if (taxedIn > 0) {
          const withDated = computeTax({ ...base, ordinary: ctx.wages[t] + rmd0 + rmd1 + taxedIn, socialSecurity: ss });
          datedFederal = withDated.federal - withIt.federal;
          datedState = withDated.state - withIt.state;
        }
        s.pretax[0] -= rmd0;
        s.pretax[1] -= rmd1;
        const saved = ss + rmd0 + rmd1 - extraFederal - extraState;
        s.taxable += saved;
        s.taxableBasis += saved;
      }
      // Dated items not already in today's budget (D17): inflows are saved to taxable; costs come from cash, then
      // taxable (paying the capital-gains tax on the sale). A cost savings can't cover fails the path.
      const datedIn = ctx.realIn[t] + ctx.nominalIn[t] / priceLevel - datedFederal - datedState;
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
            ordinary: ctx.wages[t] + rmd0 + rmd1 + taxedIn, socialSecurity: ss, over65: ctx.over65Count[t], priceLevel,
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
        if (short > RUN_OUT_SHORTFALL && failYear === null) failYear = ctx.years[t];
      }
      // Brokerage and cash income on what stays invested this year (D70), taxed on top of everything above. The
      // paycheck already covers spending (D16), so the tax comes out of the accounts and the rest is reinvested.
      const inv = investmentIncome(s.taxable, s.cash, rates);
      let invFederal = 0;
      let invState = 0;
      if (inv.dividends + inv.interest > 0) {
        const base = { socialSecurity: ss, over65: ctx.over65Count[t], priceLevel, stateRate: ctx.plan.assumptions.stateTaxRate };
        const ordinary = ctx.wages[t] + rmd0 + rmd1 + taxedIn;
        const before = computeTax({ ...base, ordinary, ltcg: gain });
        const after = computeTax({ ...base, ordinary: ordinary + inv.interest, ltcg: gain + inv.dividends, interest: inv.interest });
        invFederal = after.federal - before.federal;
        invState = after.state - before.state;
        // Each account pays the tax on its own income; the brokerage reinvests the rest at full basis. The income
        // itself is already inside the year's total return (the market data are total returns), so it adds to
        // basis but not to the balance.
        const brokerageIncome = inv.dividends + inv.brokerageInterest;
        const taxFromBrokerage = ((invFederal + invState) * brokerageIncome) / (inv.dividends + inv.interest);
        s.taxable -= taxFromBrokerage;
        s.cash -= Math.min(s.cash, invFederal + invState - taxFromBrokerage);
        s.taxableBasis += Math.max(0, brokerageIncome - taxFromBrokerage);
      }
      if (records) {
        rec = blankRecord(ctx, t, true);
        rec.seasonedRoth = seasonedRoth;
        rec.spending = datedOut;
        rec.otherIncome = datedIn + datedFederal + datedState;
        rec.socialSecurity = ss;
        rec.rmd = rmd0 + rmd1;
        rec.withdrawals.cash = fromCash;
        rec.withdrawals.taxable = fromTaxable;
        rec.capitalGains = gain + inv.dividends;
        rec.federalTax = extraFederal + datedFederal + gainsFederal + invFederal;
        rec.stateTax = extraState + datedState + gainsState + invState;
        rec.shortfall = short;
      }
    } else {
      // The HSA-first, RMD and bracket-fill rules below are restated for the user in plain language in
      // src/ui/playbook.ts (D93): mirror a change there.
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
        // The fill room counts all ordinary income that isn't a withdrawal (keep in step with taxOf). Investment
        // income is estimated on the start-of-year balances here (it depends on this year's withdrawals).
        const interest = investmentIncome(s.taxable, s.cash, rates).interest;
        let room = bracketRoom(ctx.fillTop, rmd0 + rmd1 + taxedIn + interest, 0, ss, ctx.over65Count[t], priceLevel);
        for (const i of order) {
          d.fillTarget[i] = Math.max(0, Math.min(room, s.pretax[i] - d.rmd[i]));
          room -= d.fillTarget[i];
        }
      }

      // Taxes are part of the need, and withdrawals change taxes: iterate to a fixed point.
      planDraws(ctx, s, t, baseNeed, hsaMedical, order, d);
      let tax = taxOf(ctx, t, d, s, ss, priceLevel, taxedIn, rates);
      for (let iter = 0; iter < 20; iter++) {
        planDraws(ctx, s, t, baseNeed + tax.total, hsaMedical, order, d);
        const next = taxOf(ctx, t, d, s, ss, priceLevel, taxedIn, rates);
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
      // Deposits, and this year's brokerage dividends and interest (reinvested; their tax was part of the need), D70.
      // The income is already inside the year's total return, so only the basis grows here.
      s.taxableBasis += deposit + tax.inv.dividends + tax.inv.brokerageInterest;

      const penaltyAmt = penalizedAmount(d);
      if (penaltyAmt > 1) usedPenalty = true;
      if (d.shortfall > RUN_OUT_SHORTFALL && failYear === null) failYear = ctx.years[t];

      if (records) {
        rec = blankRecord(ctx, t, false);
        rec.seasonedRoth = seasonedRoth;
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
        rec.reinvested = deposit;
        rec.rmd = d.rmd[0] + d.rmd[1];
        rec.penaltyWithdrawals = penaltyAmt;
        rec.ordinaryIncome = tax.ordinary + tax.taxableSocialSecurity;
        rec.capitalGains = d.gain + tax.inv.dividends;
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
      for (let k = Math.max(0, t - SEASONING_YEARS + 1); k <= t; k++) s.conversions[i][k] /= inflation;
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
    reinvested: 0,
    seasonedRoth: 0,
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
