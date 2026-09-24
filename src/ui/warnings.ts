// Lines for the "Before you act on these numbers" panel directly below the result cards (D67). The cards
// show target numbers only; every caution about them is here, and only the lines that apply are shown.

import type { Tier, TierResult } from '../engine/solve';
import type { Plan } from '../engine/types';
import { moneyShort } from './format';

export interface WarningLine {
  key: string;
  text: string;
}

const SHORT: Record<Tier, string> = { traditional: 'Traditional', chubby: 'Chubby', coast: 'Coast' };

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function beforeYouAct(_plan: Plan, tiers: Partial<Record<Tier, TierResult>>): WarningLine[] {
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
  return lines;
}
