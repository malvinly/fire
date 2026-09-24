import market from '../data/market.json';

export interface MarketYear {
  year: number;
  stocks: number;
  bonds: number;
  cash: number;
  inflation: number;
  /** January 10-year Treasury yield (D82). */
  bondYield: number;
}

export const MARKET: { firstYear: number; lastYear: number; generated: string; years: MarketYear[] } = market;

/** Real (after-inflation) returns for a set of simulated paths, stored path-major: index = p * len + t. */
export interface ReturnPaths {
  n: number;
  len: number;
  /** Portfolio real return after fees for the chosen allocation. */
  portfolio: Float64Array;
  /** Real return on the cash account. */
  cash: Float64Array;
  inflation: Float64Array;
  /**
   * Nominal 10-year Treasury yield at the start of each year (D82). Single precision: it only sets the taxed bond
   * interest, and a fourth double-precision array would add a third to each worker's memory at 50,000 markets (D60).
   */
  bondYield: Float32Array;
  /** For historical paths, the calendar year each path starts in. */
  startYears?: number[];
}

export interface Allocation {
  stocks: number;
  bonds: number;
  cash: number;
}

interface RealYear {
  portfolio: number;
  cash: number;
  inflation: number;
  bondYield: number;
}

function realYears(alloc: Allocation, feeRate: number, years: MarketYear[] = MARKET.years): RealYear[] {
  return years.map((y) => {
    const deflate = (r: number) => (1 + r) / (1 + y.inflation) - 1;
    const portfolio = alloc.stocks * deflate(y.stocks) + alloc.bonds * deflate(y.bonds) + alloc.cash * deflate(y.cash);
    return {
      portfolio: portfolio - feeRate,
      cash: deflate(y.cash),
      inflation: y.inflation,
      bondYield: y.bondYield,
    };
  });
}

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alloc(n: number, len: number): Omit<ReturnPaths, 'startYears'> {
  return {
    n,
    len,
    portfolio: new Float64Array(n * len),
    cash: new Float64Array(n * len),
    inflation: new Float64Array(n * len),
    bondYield: new Float32Array(n * len),
  };
}

/** Circular block bootstrap of real history (D4). */
export function bootstrapPaths(
  n: number,
  len: number,
  allocation: Allocation,
  feeRate: number,
  blockLength: number,
  seed: number,
  years?: MarketYear[],
): ReturnPaths {
  const hist = realYears(allocation, feeRate, years);
  const N = hist.length;
  const rng = makeRng(seed);
  const out = alloc(n, len);
  for (let p = 0; p < n; p++) {
    let src = 0;
    for (let t = 0; t < len; t++) {
      if (t % blockLength === 0) src = Math.floor(rng() * N);
      else src = (src + 1) % N;
      const h = hist[src];
      const i = p * len + t;
      out.portfolio[i] = h.portfolio;
      out.cash[i] = h.cash;
      out.inflation[i] = h.inflation;
      out.bondYield[i] = h.bondYield;
    }
  }
  return out;
}

/** Every complete historical window of `len` years (D3). Empty if history is shorter than `len`. */
export function historicalPaths(len: number, allocation: Allocation, feeRate: number, years?: MarketYear[]): ReturnPaths {
  const src = years ?? MARKET.years;
  const hist = realYears(allocation, feeRate, src);
  const n = Math.max(0, hist.length - len + 1);
  const out = alloc(n, len);
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < len; t++) {
      const h = hist[p + t];
      const i = p * len + t;
      out.portfolio[i] = h.portfolio;
      out.cash[i] = h.cash;
      out.inflation[i] = h.inflation;
      out.bondYield[i] = h.bondYield;
    }
  }
  return { ...out, startYears: Array.from({ length: n }, (_, p) => src[p].year) };
}

/**
 * A single path with the same real return every year — for tests and the deterministic sanity check. A `bondYield`
 * below the 4% floor (the default 0) taxes bond interest at the floor (D82).
 */
export function constantPath(len: number, portfolio: number, cash = portfolio, inflation = 0, bondYield = 0): ReturnPaths {
  const out = alloc(1, len);
  out.portfolio.fill(portfolio);
  out.cash.fill(cash);
  out.inflation.fill(inflation);
  out.bondYield.fill(bondYield);
  return out;
}

/** Take only the first `n` paths (common random numbers for the solver's search steps, D5). */
export function firstPaths(paths: ReturnPaths, n: number): ReturnPaths {
  if (n >= paths.n) return paths;
  const k = n * paths.len;
  return {
    n,
    len: paths.len,
    portfolio: paths.portfolio.subarray(0, k),
    cash: paths.cash.subarray(0, k),
    inflation: paths.inflation.subarray(0, k),
    bondYield: paths.bondYield.subarray(0, k),
    startYears: paths.startYears?.slice(0, n),
  };
}
