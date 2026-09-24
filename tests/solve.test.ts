// The headline numbers: FIRE number, earliest date, Coast number, stricter-of-two, bands, worst windows.
// Search paths = all paths here, so "just enough" and "just short" are exact on the same path set.
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import { constantPath } from '../src/engine/returns';
import { initialState, scaleState, simulatePath } from '../src/engine/simulate';
import {
  averageInflation, detailFor, evaluate, makeEngine, projectState, scenarioFor, solveTier,
} from '../src/engine/solve';
import type { Plan } from '../src/engine/types';

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

describe('Coast FIRE', () => {
  test('the Coast number passes when you stop contributing today and 1% less does not', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'coast', plan.startYear));
    const base = initialState(ctx);
    const run = (x: number) => evaluate(engine, ctx, { startState: scaleState(base, x) }, true);
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

  test('shifting paths without a starting price level is refused', () => {
    const ctx = buildContext(plan, scenarioFor(plan, 'traditional', 2036));
    expect(() => simulatePath(ctx, constantPath(ctx.len, 0), 0, { startIdx: 10, pathShift: 10 })).toThrow();
  });
});
