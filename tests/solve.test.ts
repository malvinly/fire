// The headline numbers: FIRE number, earliest date, Coast number, stricter-of-two, bands, worst windows.
// Search paths = all paths here, so "just enough" and "just short" are exact on the same path set.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import { constantPath, historicalPaths, MARKET, type ReturnPaths } from '../src/engine/returns';
import { initialState, scaleState, simulatePath } from '../src/engine/simulate';
import {
  averageInflation, contributionMix, detailFor, evaluate, makeEngine, projectState, scenarioFor, solveTier,
} from '../src/engine/solve';
import type { Plan } from '../src/engine/types';
import { noYields } from './helpers';

function smallPlan(): Plan {
  const plan = examplePlan(2026);
  plan.assumptions.paths = 400;
  plan.assumptions.searchPaths = 400;
  plan.household.chubbySpending = 110_000;
  return plan;
}

const plan = smallPlan();
const engine = makeEngine(plan);
const target = plan.assumptions.targetSuccess;
const trad = solveTier(engine, 'traditional');
const coast = solveTier(engine, 'coast');

describe('Traditional FIRE', () => {
  test('the earliest year passes and the year before does not', () => {
    const y = trad.earliest!.year;
    expect(y).toBeGreaterThan(plan.startYear);
    const at = evaluate(engine, buildContext(plan, scenarioFor(plan, 'traditional', y)), {}, true);
    const before = evaluate(engine, buildContext(plan, scenarioFor(plan, 'traditional', y - 1)), {}, true);
    expect(at.combined).toBeGreaterThanOrEqual(target);
    expect(before.combined).toBeLessThan(target);
    expect(trad.successAtEarliest!.combined).toBeCloseTo(at.combined, 10);
  });

  test('the FIRE number passes at the earliest date and 1% less does not', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'traditional', trad.earliest!.year));
    const base = projectState(ctx, ctx.retireIdx);
    const run = (x: number) =>
      evaluate(engine, ctx, { startIdx: ctx.retireIdx, startState: scaleState(base, x), retirementOnly: true }, true);
    expect(run(trad.fireNumber!).combined).toBeGreaterThanOrEqual(target);
    expect(run(trad.fireNumber! * 0.99).combined).toBeLessThan(target);
  });

  test('the penalty rate at the earliest date matches the detail view', () => {
    expect(trad.penaltyRate).toBe(detailFor(engine, 'traditional', trad.earliest!.year).penaltyRate);
  });

  test('combined success is the lower of bootstrap and history', () => {
    for (const s of [trad.successToday, trad.successAtEarliest!]) {
      expect(s.combined).toBe(Math.min(s.bootstrap, s.historical ?? Infinity));
      expect(s.binding).toBe((s.historical ?? Infinity) < s.bootstrap ? 'historical' : 'bootstrap');
    }
  });

  test('projected balances at the earliest date are ordered and bracket the FIRE number sensibly', () => {
    const p = trad.projectedAtEarliest!;
    expect(p.p10).toBeLessThanOrEqual(p.p50);
    // At ≥90% success, the typical projected balance should cover what retiring then needs.
    expect(p.p50).toBeGreaterThan(trad.fireNumber! * 0.8);
  });

  test('more spending (Chubby) retires no earlier and needs more', () => {
    const chubby = solveTier(engine, 'chubby');
    expect(chubby.earliest!.year).toBeGreaterThanOrEqual(trad.earliest!.year);
    expect(chubby.fireNumber!).toBeGreaterThan(trad.fireNumber!);
  });
});

describe('search on a path subset, answers confirmed on all paths (D5)', () => {
  // Search on the first 100 of 400 paths. With seed 18 the subset is optimistic about both answers, so the
  // confirm steps must move them; the last assertion of each test checks that they did. If a data update
  // breaks only those last assertions, pick another seed where the subset is optimistic.
  const p = smallPlan();
  p.assumptions.searchPaths = 100;
  p.assumptions.seed = 18;
  const e = makeEngine(p);
  const r = solveTier(e, 'traditional');
  const passes = (s: { combined: number }) => s.combined >= target - 1e-9;

  test('the earliest year passes on all paths; the year before was rejected on the subset or on all paths', () => {
    const y = r.earliest!.year;
    const at = (year: number, full: boolean) =>
      passes(evaluate(e, buildContext(p, scenarioFor(p, 'traditional', year)), {}, full));
    expect(y).toBeGreaterThan(p.startYear);
    expect(at(y, true)).toBe(true);
    const before = { search: at(y - 1, false), full: at(y - 1, true) };
    expect(before.search && before.full).toBe(false);
    expect(before).toEqual({ search: true, full: false }); // the subset alone would have answered a year early
  });

  test('the FIRE number passes on all paths', () => {
    const ctx = buildContext(p, scenarioFor(p, 'traditional', r.earliest!.year));
    const base = projectState(ctx, ctx.retireIdx);
    const run = (x: number, full: boolean) =>
      passes(evaluate(e, ctx, { startIdx: ctx.retireIdx, startState: scaleState(base, x), retirementOnly: true }, full));
    expect(run(r.fireNumber!, true)).toBe(true);
    // One 2% step lower passes the subset but not all paths: the confirm step raised the number.
    expect({ search: run(r.fireNumber! / 1.02, false), full: run(r.fireNumber! / 1.02, true) }).toEqual({ search: true, full: false });
  });
});

describe('Coast FIRE', () => {
  test('the Coast number passes when you stop contributing today and 1% less does not', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'coast', plan.startYear));
    const base = initialState(ctx);
    const run = (x: number) => evaluate(engine, ctx, { startState: scaleState(base, x, contributionMix(plan)) }, true);
    expect(run(coast.fireNumber!).combined).toBeGreaterThanOrEqual(target);
    expect(run(coast.fireNumber! * 0.99).combined).toBeLessThan(target);
  });

  test('a household with no savings yet still gets a Coast number', () => {
    const p = smallPlan();
    for (const id of ['you', 'spouse'] as const) p[id].balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    p.household.taxable = p.household.taxableBasis = p.household.cash = 0;
    const r = solveTier(makeEngine(p), 'coast');
    expect(r.currentBalance).toBe(0);
    expect(r.fireNumber).toBeGreaterThan(0);
  });

  test('a small cash balance does not price the whole Coast number as cash (fix 15, D50)', () => {
    const zero = smallPlan();
    for (const id of ['you', 'spouse'] as const) zero[id].balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    zero.household.taxable = zero.household.taxableBasis = zero.household.cash = 0;
    const oneDollar = structuredClone(zero);
    oneDollar.household.cash = 1;
    const a = solveTier(makeEngine(zero), 'coast').fireNumber!;
    const b = solveTier(makeEngine(oneDollar), 'coast').fireNumber!;
    expect(Math.abs(b / a - 1)).toBeLessThan(0.03);
  });

  test('money needed beyond the current balances is added in the mix you contribute in; less is scaled down', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'coast', plan.startYear));
    const s = initialState(ctx); // example: 880k today
    const mix = contributionMix(plan); // 25k pre-tax each, 15k brokerage
    expect(mix.pretax[0]).toBeCloseTo(25 / 65, 12);
    expect(mix.taxable).toBeCloseTo(15 / 65, 12);
    const up = scaleState(s, 880_000 + 65_000, mix);
    expect(up.pretax[0]).toBeCloseTo(s.pretax[0] + 25_000, 6);
    expect(up.taxable).toBeCloseTo(s.taxable + 15_000, 6);
    expect(up.taxableBasis).toBeCloseTo(s.taxableBasis + 15_000, 6);
    expect(up.cash).toBe(s.cash);
    const down = scaleState(s, 440_000, mix);
    expect(down.cash).toBeCloseTo(s.cash / 2, 6);
  });
});

describe('edge cases', () => {
  test('a household already past 75 that can afford to retire gets this year, not "not reachable"', () => {
    const p = smallPlan();
    p.you.birthYear = p.spouse.birthYear = 2026 - 78;
    p.household.taxable = p.household.taxableBasis = 3_000_000;
    const r = solveTier(makeEngine(p), 'traditional');
    expect(r.earliest?.year).toBe(2026);
  });

  test('an end age below the younger spouse\'s age is a readable error', () => {
    const p = smallPlan();
    p.assumptions.endAge = 30;
    expect(() => makeEngine(p)).toThrow(/Plan to age/);
  });
});

describe('detail view', () => {
  const d = detailFor(engine, 'traditional', trad.earliest!.year);

  test('percentile bands are ordered every year and match a direct computation', () => {
    for (let t = 0; t < d.years.length; t++) {
      expect(d.bands.p10[t]).toBeLessThanOrEqual(d.bands.p25[t]);
      expect(d.bands.p25[t]).toBeLessThanOrEqual(d.bands.p50[t]);
    }
    // Direct median of the end-of-first-year balance.
    const ctx = buildContext(plan, d.scenario);
    const first = Array.from({ length: engine.boot.n }, (_, p) => {
      const totals = new Float64Array(ctx.len);
      simulatePath(ctx, engine.boot, p, { totals, stopIdx: 1 });
      return totals[0];
    }).sort((a, b) => a - b);
    const mid = (first[199] + first[200]) / 2;
    expect(d.bands.p50[0]).toBeCloseTo(mid, 6);
  });

  test('the year-by-year and account charts follow a market close to the typical and bad-market lines (D73)', () => {
    const t = d.scenario.retireYear - d.years[0]; // first retired year
    const at = (recs: typeof d.medianPath) => recs.find((r) => r.year === d.years[t])!.balances.total;
    expect(Math.abs(at(d.medianPath) / d.bands.p50[t] - 1)).toBeLessThan(0.05);
    expect(Math.abs(at(d.p10Path) / d.bands.p10[t] - 1)).toBeLessThan(0.05);
  });

  test('the markets that fail: their share, the median year money runs out, and Social Security then (fix 12)', () => {
    const f = d.failures!;
    expect(f.share).toBeCloseTo(1 - d.success.bootstrap, 12);
    const ctx = buildContext(plan, d.scenario);
    const fails = Array.from({ length: engine.boot.n }, (_, p) => simulatePath(ctx, engine.boot, p).failYear)
      .filter((y): y is number => y !== null).sort((a, b) => a - b);
    expect(f.medianYear).toBe(fails[Math.floor((fails.length - 1) / 2)]);
    expect(f.socialSecurity).toBeCloseTo(ctx.socialSecurity[f.medianYear - plan.startYear], 6);
    expect(f.spending).toBeGreaterThan(plan.household.traditionalSpending);
  });

  test('worst historical windows: failures first, earliest failure first', () => {
    const w = d.worstHistorical;
    for (let i = 1; i < w.length; i++) {
      if (!w[i - 1].success && !w[i].success) expect(w[i - 1].failYear!).toBeLessThanOrEqual(w[i].failYear!);
      if (w[i - 1].success) expect(w[i].success).toBe(true);
    }
  });
});

describe('price level in retirement-only runs', () => {
  test('fixed-dollar items are deflated by the starting price level given', () => {
    const p = smallPlan();
    p.datedItems = [{ id: 'm', label: 'mortgage', direction: 'expense', amount: 20_000, frequency: 'ongoing',
      start: { kind: 'year', year: 2026 }, fixedDollars: true }];
    const ctx = buildContext(p, scenarioFor(p, 'traditional', 2036));
    const level = Math.pow(1 + averageInflation(), 10);
    const rec = simulatePath(ctx, constantPath(ctx.len, 0), 0, {
      startIdx: 10, startState: projectState(ctx, 10), initialPriceLevel: level, record: true,
    }).records![0];
    expect(rec.spending - rec.healthcare).toBeCloseTo(p.household.traditionalSpending + 20_000 / level, 6);
  });

  test('retirement-only runs: windows start at the retirement year, both legs at the average price level (D47, D51)', () => {
    // Independent re-computation of evaluate(…, retirementOnly) from simulatePath and historicalPaths.
    const p = smallPlan();
    p.datedItems = [{ id: 'm', label: 'mortgage', direction: 'expense', amount: 30_000, frequency: 'ongoing',
      start: { kind: 'year', year: 2026 }, fixedDollars: true }]; // makes the price level matter
    const e = makeEngine(p);
    const ctx = buildContext(p, scenarioFor(p, 'traditional', 2046));
    const idx = ctx.retireIdx;
    expect(idx).toBe(20);
    const startState = scaleState(projectState(ctx, idx), 2_000_000);
    const level = Math.pow(1 + averageInflation(), idx);
    const rate = (paths: ReturnPaths, pathShift: number, initialPriceLevel: number) => {
      let ok = 0;
      for (let q = 0; q < paths.n; q++) {
        if (simulatePath(ctx, paths, q, { startIdx: idx, startState, pathShift, initialPriceLevel }).success) ok++;
      }
      return ok / paths.n;
    };
    const windows = historicalPaths(ctx.len - idx, p.assumptions.allocation, p.assumptions.feeRate);
    expect(windows.n).toBe(MARKET.years.length - (ctx.len - idx) + 1);
    const s = evaluate(e, ctx, { startIdx: idx, startState, retirementOnly: true }, true);
    expect(s.historical).toBe(rate(windows, idx, level));
    expect(s.bootstrap).toBe(rate(e.boot, 0, level));
    // The scenario is sensitive to the price level, so the wrong one would show above.
    expect(rate(windows, idx, 1)).not.toBe(s.historical);
    expect(rate(e.boot, 0, 1)).not.toBe(s.bootstrap);
  });

  test('shifting paths without a starting price level is refused', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'traditional', 2036));
    expect(() => simulatePath(ctx, constantPath(ctx.len, 0), 0, { startIdx: 10, pathShift: 10 })).toThrow();
  });
});

describe('review follow-ups', () => {
  test('the FIRE number\u2019s projection deflates cost basis and Roth principal at average inflation (D63)', () => {
    const p = smallPlan();
    p.household.taxableContribution = 0;
    const ctx = noYields(buildContext(p, scenarioFor(p, 'traditional', 2036)));
    const s = projectState(ctx, 10);
    const level = (1 + averageInflation()) ** 10;
    expect(s.taxableBasis).toBeCloseTo(100_000 / level, 4);
    expect(s.rothPrincipal[0]).toBeCloseTo(30_000 / level, 4);
  });

  test('the penalty rate is the share of simulated markets that paid the penalty, counted path by path', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'traditional', trad.earliest!.year));
    let paid = 0;
    for (let p = 0; p < engine.boot.n; p++) if (simulatePath(ctx, engine.boot, p).usedPenalty) paid++;
    expect(trad.penaltyRate).toBe(paid / engine.boot.n);
    expect(paid).toBeGreaterThan(0);
  });

  test('Roth contributions in the mix top up both the Roth balance and its withdrawable principal (D50)', () => {
    const p = smallPlan();
    p.you.contributions.roth = 10_000; // mix: 50k pre-tax, 10k Roth, 15k brokerage
    const mix = contributionMix(p);
    expect(mix.roth[0]).toBeCloseTo(10 / 75, 12);
    const s = initialState(buildContext(p, scenarioFor(p, 'coast', p.startYear)));
    const up = scaleState(s, 880_000 + 75_000, mix);
    expect(up.roth[0]).toBeCloseTo(s.roth[0] + 10_000, 6);
    expect(up.rothPrincipal[0]).toBeCloseTo(s.rothPrincipal[0] + 10_000, 6);
  });
});

describe('fractional years (fix 10)', () => {
  test('a fractional "plan to age" is rejected with a readable message instead of crashing', () => {
    const p = smallPlan();
    p.assumptions.endAge = 96.5;
    expect(() => makeEngine(p)).toThrow(/whole number/);
  });
});

describe('age-gap couples (fix 14)', () => {
  test('the earliest date does not depend on who is entered as "You"', () => {
    const p = smallPlan();
    p.you.birthYear = 2026 - 74;
    p.spouse.birthYear = 2026 - 58;
    const swapped = structuredClone(p);
    [swapped.you, swapped.spouse] = [swapped.spouse, swapped.you];
    const a = solveTier(makeEngine(p), 'traditional');
    const b = solveTier(makeEngine(swapped), 'traditional');
    expect(a.earliest).not.toBeNull();
    expect(a.earliest!.year).toBe(b.earliest!.year);
    expect(a.searchLimit).toBe(2026 - 58 + 75); // the younger spouse's age 75
  });
});
