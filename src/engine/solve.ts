// Turns the simulator into answers: success rates, earliest retirement dates, FIRE numbers (D3, D5).

import { buildContext, planYears, type Context } from './context';
import { bootstrapPaths, constantPath, firstPaths, historicalPaths, MARKET, type ReturnPaths } from './returns';
import { initialState, scaleState, simulatePath, totalBalance, type Mix, type State } from './simulate';
import type { Plan, Scenario, YearRecord } from './types';

export type Tier = 'coast' | 'traditional' | 'chubby';

export interface Success {
  bootstrap: number;
  /** null when history has no complete window of this length. */
  historical: number | null;
  /** The stricter of the two (D3). */
  combined: number;
  binding: 'bootstrap' | 'historical';
}

export interface TierResult {
  tier: Tier;
  spending: number;
  /** Traditional/Chubby: earliest household retirement year. Coast: earliest year you can stop contributing. */
  earliest: { year: number; ageYou: number; ageSpouse: number } | null;
  /** Traditional/Chubby: portfolio needed at `earliest` (today's $). Coast: portfolio needed today. */
  fireNumber: number | null;
  currentBalance: number;
  /** Success if you retire (or, for Coast, stop contributing) this year. */
  successToday: Success;
  successAtEarliest: Success | null;
  /**
   * Share of simulated markets that take retirement money before 59½ with the 10% penalty at the earliest date
   * (they still count as successes, D68). Missing in sessions saved before it existed.
   */
  penaltyRate?: number | null;
  /** Spending ÷ 4% sanity check (spending + first-year healthcare). */
  simpleNumber: number;
  /** Traditional/Chubby: the last year searched for the earliest date (D43). Missing in older sessions. */
  searchLimit?: number;
  /** Coast: the mix any money needed beyond today's balances is assumed to be saved in (D50). */
  coastMix?: Mix;
  /**
   * Bootstrap balance at the start of the earliest year: typical (50th) and significantly below average
   * (10th percentile). Lets the card show how the date and the FIRE number relate (D54).
   */
  projectedAtEarliest: { p50: number; p10: number } | null;
}

export interface WorstWindow {
  startYear: number;
  success: boolean;
  failYear: number | null;
  endBalance: number;
  minBalance: number;
}

export interface Detail {
  tier: Tier;
  scenario: Scenario;
  success: Success;
  penaltyRate: number;
  years: number[];
  bands: { p50: number[]; p25: number[]; p10: number[] };
  worstHistorical: WorstWindow[];
  historicalCount: number;
  medianPath: YearRecord[];
  p10Path: YearRecord[];
  pia: [number, number];
  /**
   * The simulated markets that run out (D74): their share, the median calendar year money runs out, and that
   * year's household Social Security and spending (today's dollars). Null when none fail; missing in sessions
   * saved before it existed.
   */
  failures?: { share: number; medianYear: number; socialSecurity: number; spending: number } | null;
}

export interface Engine {
  plan: Plan;
  boot: ReturnPaths;
  search: ReturnPaths;
  hist: ReturnPaths;
  startYear: number;
  endYear: number;
  len: number;
}

export function makeEngine(plan: Plan): Engine {
  const a = plan.assumptions;
  const { startYear, endYear, len } = planYears(plan);
  const boot = bootstrapPaths(a.paths, len, a.allocation, a.feeRate, a.blockLength, a.seed);
  return {
    plan,
    boot,
    search: firstPaths(boot, a.searchPaths),
    hist: historicalPaths(len, a.allocation, a.feeRate),
    startYear,
    endYear,
    len,
  };
}

export function tierSpending(plan: Plan, tier: Tier): number {
  return tier === 'chubby' ? (plan.household.chubbySpending ?? 0) : plan.household.traditionalSpending;
}

export function coastRetireYear(plan: Plan): number {
  return plan.you.birthYear + plan.household.coastRetireAge;
}

/** Scenario for a tier at a given year (retirement year, or for Coast the stop-contributing year). */
export function scenarioFor(plan: Plan, tier: Tier, year: number): Scenario {
  const baseSpending = tierSpending(plan, tier);
  if (tier === 'coast') {
    const retireYear = coastRetireYear(plan);
    return { stopContributingYear: Math.min(year, retireYear), retireYear, baseSpending };
  }
  return { stopContributingYear: year, retireYear: year, baseSpending };
}

interface RunOpts {
  startIdx?: number;
  startState?: State;
  /**
   * Simulate only from `startIdx` (the retirement year) with `startState`: historical windows then start at
   * the retirement year, and both methods begin at the same average-inflation price level (D51).
   */
  retirementOnly?: boolean;
  totals?: Float64Array;
}

function successRate(ctx: Context, paths: ReturnPaths, opts: RunOpts, shift = 0) {
  let ok = 0;
  let penalty = 0;
  const outcomes = [];
  const startIdx = opts.startIdx ?? 0;
  const initialPriceLevel = opts.retirementOnly ? Math.pow(1 + averageInflation(), startIdx) : undefined;
  for (let p = 0; p < paths.n; p++) {
    const r = simulatePath(ctx, paths, p, {
      startIdx,
      startState: opts.startState,
      pathShift: shift,
      initialPriceLevel,
      totals: opts.totals ? opts.totals.subarray(p * ctx.len, (p + 1) * ctx.len) : undefined,
    });
    if (r.success) ok++;
    if (r.usedPenalty) penalty++;
    outcomes.push(r);
  }
  return { rate: paths.n ? ok / paths.n : 0, penaltyRate: paths.n ? penalty / paths.n : 0, outcomes };
}

/** Historical windows appropriate for a run starting at `startIdx`. */
function histFor(e: Engine, startIdx: number, retirementOnly: boolean): { paths: ReturnPaths; shift: number } {
  if (!retirementOnly || startIdx === 0) return { paths: e.hist, shift: 0 };
  const a = e.plan.assumptions;
  return { paths: historicalPaths(e.len - startIdx, a.allocation, a.feeRate), shift: startIdx };
}

export function evaluate(e: Engine, ctx: Context, opts: RunOpts = {}, full = false): Success {
  const boot = successRate(ctx, full ? e.boot : e.search, opts).rate;
  const h = histFor(e, opts.startIdx ?? 0, !!opts.retirementOnly);
  const historical = h.paths.n > 0 ? successRate(ctx, h.paths, opts, h.shift).rate : null;
  return combine(boot, historical);
}

/**
 * The whole plan from today on every path, both methods (the same answer as `evaluate(e, ctx, {}, true)`), keeping
 * the bootstrap run's penalty rate and per-path outcomes for the callers that report them.
 */
function wholePlanRun(e: Engine, ctx: Context, totals?: Float64Array) {
  const boot = successRate(ctx, e.boot, { totals });
  const hist = e.hist.n > 0 ? successRate(ctx, e.hist, {}) : null;
  return { boot, hist, success: combine(boot.rate, hist ? hist.rate : null) };
}

/** The stricter of the two methods decides (D3). */
function combine(bootstrap: number, historical: number | null): Success {
  const hist = historical ?? Infinity;
  return {
    bootstrap,
    historical,
    combined: Math.min(bootstrap, hist),
    binding: hist < bootstrap ? 'historical' : 'bootstrap',
  };
}

function passes(s: Success, target: number): boolean {
  return s.combined >= target - 1e-9;
}

/** Smallest year in [lo, hi] whose scenario passes, searching on the path subset then confirming on all paths. */
function earliestYear(e: Engine, tier: Tier, lo: number, hi: number): number | null {
  const target = e.plan.assumptions.targetSuccess;
  const ok = (y: number, full: boolean) => passes(evaluate(e, buildContext(e.plan, scenarioFor(e.plan, tier, y)), {}, full), target);
  if (!ok(hi, false)) return null;
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = Math.floor((a + b) / 2);
    if (ok(mid, false)) b = mid;
    else a = mid + 1;
  }
  // Confirm on the full path set; move later if the subset was optimistic.
  for (let y = a; y <= hi; y++) if (ok(y, true)) return y;
  return null;
}

/** Geometric mean historical inflation (used where a single price path is needed, D51). */
export function averageInflation(): number {
  return Math.pow(MARKET.years.reduce((acc, y) => acc * (1 + y.inflation), 1), 1 / MARKET.years.length) - 1;
}

/**
 * Deterministic projection of balances to the start of `idx` using long-run average real returns and average
 * inflation (which shrinks cost basis and Roth principal in today's dollars, D63).
 */
export function projectState(ctx: Context, idx: number): State {
  const a = ctx.plan.assumptions;
  const avg = averageRealReturns(a.allocation, a.feeRate);
  const path = constantPath(ctx.len, avg.portfolio, avg.cash, averageInflation());
  return simulatePath(ctx, path, 0, { stopIdx: idx }).state;
}

export function averageRealReturns(alloc: { stocks: number; bonds: number; cash: number }, feeRate: number) {
  const g = (k: 'stocks' | 'bonds' | 'cash') =>
    Math.pow(MARKET.years.reduce((acc, y) => acc * ((1 + y[k]) / (1 + y.inflation)), 1), 1 / MARKET.years.length) - 1;
  const [s, b, c] = [g('stocks'), g('bonds'), g('cash')];
  return { portfolio: alloc.stocks * s + alloc.bonds * b + alloc.cash * c - feeRate, cash: c };
}

/**
 * The mix new savings go into: today's contributions (employer match to pre-tax), cash savings left out. With no
 * contributions at all, everything goes to the brokerage account at full basis (D50).
 */
export function contributionMix(plan: Plan): Mix {
  const pretax = [plan.you, plan.spouse].map((p) => p.contributions.pretax + p.contributions.employerMatch);
  const roth = [plan.you, plan.spouse].map((p) => p.contributions.roth);
  const hsa = plan.you.contributions.hsa + plan.spouse.contributions.hsa;
  const taxable = plan.household.taxableContribution;
  const sum = pretax[0] + pretax[1] + roth[0] + roth[1] + hsa + taxable;
  if (!(sum > 0)) return { pretax: [0, 0], roth: [0, 0], hsa: 0, taxable: 1 };
  return { pretax: [pretax[0] / sum, pretax[1] / sum], roth: [roth[0] / sum, roth[1] / sum], hsa: hsa / sum, taxable: taxable / sum };
}

/**
 * Smallest total balance built from `base` that passes when simulated from `startIdx`: `base` scaled, or with
 * `extra`, topped up in that mix (D50).
 */
function minPortfolio(e: Engine, ctx: Context, base: State, startIdx: number, retirementOnly: boolean, extra?: Mix): number | null {
  const target = e.plan.assumptions.targetSuccess;
  const ok = (x: number, full: boolean) =>
    passes(evaluate(e, ctx, { startIdx, startState: scaleState(base, x, extra), retirementOnly }, full), target);
  let hi = Math.max(100_000, 25 * (ctx.scenario.baseSpending + ctx.healthcare[Math.min(startIdx, ctx.len - 1)]));
  while (!ok(hi, false)) {
    hi *= 2;
    if (hi > 1e9) return null;
  }
  let lo = 0;
  while (hi - lo > Math.max(1_000, hi * 0.002)) {
    const mid = (lo + hi) / 2;
    if (ok(mid, false)) hi = mid;
    else lo = mid;
  }
  // Confirm on the full path set; the answer must pass there too.
  while (!ok(hi, true)) {
    hi *= 1.02;
    if (hi > 1e9) return null;
  }
  return Math.round(hi / 100) * 100;
}

function agesAt(plan: Plan, year: number) {
  return { year, ageYou: year - plan.you.birthYear, ageSpouse: year - plan.spouse.birthYear };
}

export function solveTier(e: Engine, tier: Tier): TierResult {
  const plan = e.plan;
  const spending = tierSpending(plan, tier);
  const todayCtx = buildContext(plan, scenarioFor(plan, tier, e.startYear));
  const current = totalBalance(initialState(todayCtx));
  const successToday = evaluate(e, todayCtx, {}, true);
  const firstRetiredIdx = Math.min(todayCtx.retireIdx, todayCtx.len - 1);
  const simpleNumber = (spending + todayCtx.healthcare[firstRetiredIdx]) / 0.04;

  if (tier === 'coast') {
    const coastYear = coastRetireYear(plan);
    const earliest = earliestYear(e, tier, e.startYear, Math.max(e.startYear, coastYear));
    const coastMix = contributionMix(plan);
    const fireNumber = minPortfolio(e, todayCtx, initialState(todayCtx), 0, false, coastMix);
    let successAtEarliest: Success | null = null;
    let penaltyRate: number | null = null;
    if (earliest !== null) {
      const run = wholePlanRun(e, buildContext(plan, scenarioFor(plan, tier, earliest)));
      successAtEarliest = run.success;
      penaltyRate = run.boot.penaltyRate;
    }
    return {
      tier, spending, currentBalance: current, successToday, simpleNumber, fireNumber, successAtEarliest, penaltyRate,
      earliest: earliest === null ? null : agesAt(plan, earliest), projectedAtEarliest: null, coastMix,
    };
  }

  // Search up to the younger spouse's age 75 (D43), so the answer doesn't depend on who is entered as "You", but
  // never before the plan start (households already past 75) or past the year before the plan ends.
  const younger = Math.max(plan.you.birthYear, plan.spouse.birthYear);
  const latest = Math.max(e.startYear, Math.min(e.endYear - 1, younger + 75));
  const earliest = earliestYear(e, tier, e.startYear, latest);
  let fireNumber: number | null = null;
  let successAtEarliest: Success | null = null;
  let penaltyRate: number | null = null;
  let projectedAtEarliest: TierResult['projectedAtEarliest'] = null;
  if (earliest !== null) {
    const ctx = buildContext(plan, scenarioFor(plan, tier, earliest));
    const idx = ctx.retireIdx;
    const totals = new Float64Array(e.boot.n * ctx.len);
    const run = wholePlanRun(e, ctx, totals);
    successAtEarliest = run.success;
    penaltyRate = run.boot.penaltyRate;
    projectedAtEarliest = idx === 0 ? { p50: current, p10: current } : balancesAt(totals, e.boot.n, ctx.len, idx - 1);
    fireNumber = minPortfolio(e, ctx, projectState(ctx, idx), idx, true);
  }
  return {
    tier, spending, currentBalance: current, successToday, simpleNumber, fireNumber, successAtEarliest, penaltyRate,
    earliest: earliest === null ? null : agesAt(plan, earliest), projectedAtEarliest, searchLimit: latest,
  };
}

function balancesAt(totals: Float64Array, n: number, len: number, t: number) {
  const col = new Float64Array(n);
  for (let p = 0; p < n; p++) col[p] = totals[p * len + t];
  col.sort();
  return { p50: percentile(col, 0.5), p10: percentile(col, 0.1) };
}

function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Full detail for one tier at one year (retirement year, or Coast stop-contributing year). */
export function detailFor(e: Engine, tier: Tier, year: number): Detail {
  const scenario = scenarioFor(e.plan, tier, year);
  const ctx = buildContext(e.plan, scenario);
  const totals = new Float64Array(e.boot.n * ctx.len);
  const { boot, hist: histRun, success } = wholePlanRun(e, ctx, totals);

  // Percentile bands: 50th / 25th / 10th of balances each year = Fidelity's average / below / significantly below.
  const bands = { p50: [] as number[], p25: [] as number[], p10: [] as number[] };
  const col = new Float64Array(e.boot.n);
  for (let t = 0; t < ctx.len; t++) {
    for (let p = 0; p < e.boot.n; p++) col[p] = totals[p * ctx.len + t];
    col.sort();
    bands.p50.push(percentile(col, 0.5));
    bands.p25.push(percentile(col, 0.25));
    bands.p10.push(percentile(col, 0.1));
  }

  // Representative paths: the market whose savings stay closest (sum of squared log differences) to the typical or
  // bad-market line over the first 10 retired years, where the order of returns matters most (D73).
  const from = Math.min(ctx.retireIdx, ctx.len - 1);
  const to = Math.min(ctx.len, from + 10);
  const closest = (band: number[]) => {
    let best = 0;
    let bestScore = Infinity;
    for (let p = 0; p < e.boot.n; p++) {
      let score = 0;
      for (let t = from; t < to; t++) {
        const diff = Math.log1p(Math.max(0, totals[p * ctx.len + t])) - Math.log1p(Math.max(0, band[t]));
        score += diff * diff;
      }
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  };
  const medianPath = simulatePath(ctx, e.boot, closest(bands.p50), { record: true }).records!;
  const p10Path = simulatePath(ctx, e.boot, closest(bands.p10), { record: true }).records!;

  const worstHistorical: WorstWindow[] = histRun
    ? histRun.outcomes
        .map((o, p) => ({ startYear: e.hist.startYears![p], success: o.success, failYear: o.failYear, endBalance: o.endBalance, minBalance: o.minBalance }))
        .sort((a, b) =>
          a.success !== b.success ? (a.success ? 1 : -1)
          : a.success ? a.endBalance - b.endBalance
          : a.failYear! - b.failYear!)
        .slice(0, 5)
    : [];

  // What the failing markets look like: when money runs out and what is left to live on then.
  const failYears = boot.outcomes.map((o) => o.failYear).filter((y): y is number => y !== null).sort((a, b) => a - b);
  let failures: Detail['failures'] = null;
  if (failYears.length) {
    const medianYear = failYears[Math.floor((failYears.length - 1) / 2)];
    const t = medianYear - ctx.startYear;
    const priceLevel = Math.pow(1 + averageInflation(), t); // fixed-dollar items at average inflation
    failures = {
      share: failYears.length / e.boot.n,
      medianYear,
      socialSecurity: ctx.socialSecurity[t],
      spending: ctx.baseSpending[t] + ctx.healthcare[t] + ctx.realOut[t] + ctx.nominalOut[t] / priceLevel,
    };
  }

  return {
    tier,
    scenario,
    success,
    failures,
    penaltyRate: boot.penaltyRate,
    years: ctx.years,
    bands,
    worstHistorical,
    historicalCount: e.hist.n,
    medianPath,
    p10Path,
    pia: ctx.pia,
  };
}
