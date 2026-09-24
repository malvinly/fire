// Layer 2: historical backtest vs. FI Calc, and bootstrap sanity.
import { describe, expect, test } from 'vitest';
import { bootstrapPaths, historicalPaths, MARKET } from '../src/engine/returns';
import { simulatePath } from '../src/engine/simulate';
import { ctxFor, simplePlan } from './helpers';

function historicalSuccess(alloc: { stocks: number; bonds: number; cash: number }, fee: number) {
  const plan = simplePlan({ years: 30 });
  const ctx = ctxFor(plan);
  const paths = historicalPaths(30, alloc, fee);
  let ok = 0;
  for (let p = 0; p < paths.n; p++) if (simulatePath(ctx, paths, p).success) ok++;
  return { rate: ok / paths.n, n: paths.n, ok };
}

/**
 * FI Calc reference (ficalc.app defaults: $1M, $40k constant real spending, 30 years, 80/15/5), checked
 * 2026-09-24 with data through 2024. Refresh both numbers from ficalc.app on each data update.
 */
const FICALC = { succeeded: 121, windows: 125 };

describe('historical rolling windows', () => {
  test('market data covers 1871 through at least 2025', () => {
    expect(MARKET.firstYear).toBe(1871);
    expect(MARKET.lastYear).toBeGreaterThanOrEqual(2025);
  });

  test(`matches FI Calc's failed-window count (${FICALC.succeeded} of ${FICALC.windows} succeed)`, () => {
    // Our data may run a year or two further than FI Calc's, adding windows; compare failures, allowing two
    // windows for bond/cash data differences.
    const r = historicalSuccess({ stocks: 0.8, bonds: 0.15, cash: 0.05 }, 0);
    expect(r.n).toBe(MARKET.lastYear - 30 - 1871 + 2);
    expect(Math.abs(r.n - r.ok - (FICALC.windows - FICALC.succeeded))).toBeLessThanOrEqual(2);
  });

  test('famous bad start years fail a 30-year 5% withdrawal', () => {
    const plan = simplePlan({ years: 30, spending: 50_000 });
    const ctx = ctxFor(plan);
    const paths = historicalPaths(30, { stocks: 0.75, bonds: 0.25, cash: 0 }, 0);
    const failed = new Set<number>();
    for (let p = 0; p < paths.n; p++) if (!simulatePath(ctx, paths, p).success) failed.add(paths.startYears![p]);
    expect(failed.has(1966)).toBe(true);
    expect(failed.has(1929) || failed.has(1937)).toBe(true);
  });
});

describe('bootstrap', () => {
  test('1-year blocks reproduce the historical average real return', () => {
    const alloc = { stocks: 1, bonds: 0, cash: 0 };
    const paths = bootstrapPaths(4_000, 50, alloc, 0, 1, 7);
    const mean = paths.portfolio.reduce((s, v) => s + v, 0) / paths.portfolio.length;
    const hist = MARKET.years.map((y) => (1 + y.stocks) / (1 + y.inflation) - 1);
    const histMean = hist.reduce((s, v) => s + v, 0) / hist.length;
    expect(Math.abs(mean - histMean)).toBeLessThan(0.003);
  });

  test('same seed → identical paths; different seed → different', () => {
    const alloc = { stocks: 0.7, bonds: 0.25, cash: 0.05 };
    const a = bootstrapPaths(10, 20, alloc, 0.001, 5, 42);
    const b = bootstrapPaths(10, 20, alloc, 0.001, 5, 42);
    const c = bootstrapPaths(10, 20, alloc, 0.001, 5, 43);
    expect(Array.from(a.portfolio)).toEqual(Array.from(b.portfolio));
    expect(Array.from(a.portfolio)).not.toEqual(Array.from(c.portfolio));
  });

  test('blocks keep consecutive historical years together', () => {
    const years = MARKET.years;
    const paths = bootstrapPaths(1, 5, { stocks: 1, bonds: 0, cash: 0 }, 0, 5, 1);
    const real = years.map((y) => (1 + y.stocks) / (1 + y.inflation) - 1);
    const start = real.findIndex((v) => Math.abs(v - paths.portfolio[0]) < 1e-12);
    for (let t = 1; t < 5; t++) expect(paths.portfolio[t]).toBeCloseTo(real[(start + t) % real.length], 12);
  });
});
