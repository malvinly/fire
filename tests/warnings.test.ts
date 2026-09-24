// The "Before you act on these numbers" panel below the result cards (D67).
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import type { Success, TierResult } from '../src/engine/solve';
import { beforeYouAct } from '../src/ui/warnings';

const ok: Success = { bootstrap: 0.95, historical: 0.96, combined: 0.95, binding: 'bootstrap' };

function tier(t: TierResult['tier'], year: number | null, fireNumber: number | null, extra: Partial<TierResult> = {}): TierResult {
  return {
    tier: t, spending: 80_000, currentBalance: 880_000, successToday: ok, simpleNumber: 2_700_000,
    earliest: year === null ? null : { year, ageYou: year - 1984, ageSpouse: year - 1986 },
    fireNumber, successAtEarliest: year === null ? null : ok, projectedAtEarliest: null, ...extra,
  };
}

const texts = (lines: ReturnType<typeof beforeYouAct>) => lines.map((l) => l.text);

describe('savings needed by the earliest date (fix 4)', () => {
  test('Traditional and Chubby share one line naming each year and amount', () => {
    const lines = beforeYouAct(examplePlan(2026), {
      traditional: tier('traditional', 2039, 2_695_200), chubby: tier('chubby', 2043, 3_297_400), coast: tier('coast', 2026, 783_000),
    });
    expect(texts(lines)).toContain(
      'Traditional 2039 and Chubby 2043 assume you’ll have about $2.70M and $3.30M by then. Re-run each year with your real balances.');
  });

  test('a tier with no reachable date is left out', () => {
    const lines = beforeYouAct(examplePlan(2026), { traditional: tier('traditional', 2039, 2_695_200), chubby: tier('chubby', null, null) });
    expect(texts(lines)).toContain('Traditional 2039 assumes you’ll have about $2.70M by then. Re-run each year with your real balances.');
    expect(texts(lines).join(' ')).not.toContain('Chubby');
  });
});
