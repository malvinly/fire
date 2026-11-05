// "Asset mix over time" (D97): the mix every invested account holds in each calendar year. It depends only on the
// calendar year (never on the retirement year), so the return paths can carry each year's mix (returns.ts).

import { FIDELITY_MIX, VANGUARD_PATH } from '../data/mixPaths';
import type { Allocation } from './returns';
import type { Plan } from './types';

export type { Allocation } from './returns';

/** Vanguard's stock share `k` years from the target year: straight lines between the points, flat outside them. */
function vanguardStocks(k: number): number {
  const pts = VANGUARD_PATH.points;
  if (k <= pts[0].years) return pts[0].stocks;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i];
    if (k > b.years) continue;
    if (k === b.years) return b.stocks;
    const a = pts[i - 1];
    return a.stocks + ((b.stocks - a.stocks) * (k - a.years)) / (b.years - a.years);
  }
  return pts[pts.length - 1].stocks;
}

const sameMix = (x: Allocation, y: Allocation) => x.stocks === y.stocks && x.bonds === y.bonds && x.cash === y.cash;

/** The mix every invested account holds in calendar `year` under the plan's choice (D97). Defined for any year, also before the plan starts. */
export function mixInYear(plan: Plan, year: number): Allocation {
  const a = plan.assumptions;
  if (a.mixPlan === 'fidelity') return { ...FIDELITY_MIX };
  if (a.mixPlan === 'vanguard') {
    const stocks = vanguardStocks(year - (plan.you.birthYear + VANGUARD_PATH.targetAge));
    return { stocks, bonds: 1 - stocks, cash: 0 };
  }
  // Your own: equal yearly steps from the first mix to the later one, one in each year You are shiftStartAge … shiftEndAge.
  const first = a.allocation;
  const later = a.laterAllocation;
  if (sameMix(first, later)) return { ...first };
  const n = Math.max(1, a.shiftEndAge - a.shiftStartAge + 1);
  const w = Math.min(1, Math.max(0, (year - plan.you.birthYear - a.shiftStartAge + 1) / n));
  if (w === 0) return { ...first };
  if (w === 1) return { ...later };
  return {
    stocks: (1 - w) * first.stocks + w * later.stocks,
    bonds: (1 - w) * first.bonds + w * later.bonds,
    cash: (1 - w) * first.cash + w * later.cash,
  };
}

/**
 * The mix as whole percents [stocks, bonds, cash] that add up to exactly 100 (largest remainder; ties go to stocks,
 * then bonds). Every mix shown to the user goes through it, so none adds up to 99 or 101.
 */
export function mixPercents(m: Allocation): [number, number, number] {
  // Rounded to 1e-9 first so floating noise (1 − 0.9 = 0.09999…) neither floors a whole percent away nor breaks a tie.
  const raw = [m.stocks, m.bonds, m.cash].map((x) => Math.round(x * 100 * 1e9) / 1e9);
  const out = raw.map(Math.floor) as [number, number, number];
  const order = [0, 1, 2].sort((i, j) => (raw[j] - out[j]) - (raw[i] - out[i]) || i - j);
  const left = 100 - out[0] - out[1] - out[2];
  for (let k = 0; k < left; k++) out[order[k % 3]]++;
  return out;
}

/** "70% stocks / 25% bonds / 5% cash"; a zero cash share is left out. */
export function mixLabel(m: Allocation): string {
  const [s, b, c] = mixPercents(m);
  return `${s}% stocks / ${b}% bonds${c ? ` / ${c}% cash` : ''}`;
}

/** The share of an account sold (and the same amount bought) to move from `prev` to `next`: the sum of the shares that shrink. */
export function shiftShare(prev: Allocation, next: Allocation): number {
  return Math.max(0, prev.stocks - next.stocks) + Math.max(0, prev.bonds - next.bonds) + Math.max(0, prev.cash - next.cash);
}

/** The first and last calendar years in which the mix differs from the year before; null for a fixed mix. Not limited to the plan's years. */
export function mixShiftYears(plan: Plan): { first: number; last: number } | null {
  const a = plan.assumptions;
  if (a.mixPlan === 'fidelity') return null;
  if (a.mixPlan === 'vanguard') {
    const target = plan.you.birthYear + VANGUARD_PATH.targetAge;
    const pts = VANGUARD_PATH.points;
    return { first: target + pts[0].years + 1, last: target + pts[pts.length - 1].years };
  }
  if (sameMix(a.allocation, a.laterAllocation)) return null;
  return { first: plan.you.birthYear + a.shiftStartAge, last: plan.you.birthYear + a.shiftEndAge };
}
