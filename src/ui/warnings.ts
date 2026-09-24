// Lines for the "Before you act on these numbers" panel directly below the result cards (D67). The cards
// show target numbers only; every caution about them is here, and only the lines that apply are shown.

import type { Tier, TierResult } from '../engine/solve';
import type { Plan } from '../engine/types';
import { moneyShort, percent } from './format';

export interface WarningLine {
  key: string;
  text: string;
  /** Ends the line with a link to the "What this doesn't model" group of How this works (D75). */
  link?: 'limits';
}

/** Share of markets paying the early-withdrawal penalty above which the panel says so (D68). */
export const PENALTY_WARN = 0.05;

/** A date whose success is less than this above the target is called borderline (D78). */
export const BORDERLINE = 0.015;

const SHORT: Record<Tier, string> = { traditional: 'Traditional', chubby: 'Chubby', coast: 'Coast' };

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function beforeYouAct(plan: Plan, tiers: Partial<Record<Tier, TierResult>>): WarningLine[] {
  const lines: WarningLine[] = [];
  const retire = (['traditional', 'chubby'] as const)
    .map((t) => tiers[t])
    .filter((r): r is TierResult => !!r?.earliest && r.fireNumber !== null);

  // The earliest date is a probability seen from today; it holds only if the money is really there (D54).
  if (retire.length) {
    const names = list(retire.map((r) => `${SHORT[r.tier]} ${r.earliest!.year}`));
    const amounts = list(retire.map((r) => moneyShort(r.fireNumber)));
    lines.push({
      key: 'needed',
      text: `${names} ${retire.length > 1 ? 'assume' : 'assumes'} you’ll have about ${amounts} by then. Re-run each year with your real balances.`,
    });
  }

  // A date that only just passes can move with the random seed (D78).
  for (const t of ['traditional', 'chubby', 'coast'] as const) {
    const r = tiers[t];
    if (r?.earliest && r.successAtEarliest && r.successAtEarliest.combined - plan.assumptions.targetSuccess < BORDERLINE) {
      lines.push({ key: `borderline-${t}`, text: `${SHORT[t]} ${r.earliest.year} is borderline (${percent(r.successAtEarliest.combined, 1)}); it could be a year later.` });
    }
  }

  // Penalized early withdrawals count as successes (their cost is already in the balances), so say how often (D68).
  for (const t of ['traditional', 'chubby', 'coast'] as const) {
    const rate = tiers[t]?.penaltyRate;
    if (rate != null && rate > PENALTY_WARN) {
      lines.push({ key: `penalty-${t}`, text: `In ${percent(rate)} of markets the ${SHORT[t]} plan pays a 10% penalty on early 401(k)/IRA withdrawals.` });
    }
  }
  // Coast depends on both paychecks covering everything until the coast age, and stopping saving stops the
  // employer match too (it is zeroed with every other contribution).
  if (tiers.coast) {
    const age = plan.household.coastRetireAge;
    const matches = plan.you.contributions.employerMatch + plan.spouse.contributions.employerMatch > 0;
    lines.push({
      key: 'coast',
      text: `Coast assumes you both keep working until ${plan.you.birthYear + age} (${plan.you.name} ${age}) with pay covering all spending` +
        (matches ? ', and that stopping saving includes giving up employer matches.' : '.'),
    });
  }

  // Always last (D75).
  lines.push({ key: 'disclaimer', text: 'All amounts are in today’s dollars. These are estimates, not financial advice.', link: 'limits' });
  return lines;
}
