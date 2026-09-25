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

describe('early-withdrawal penalty rate (D68)', () => {
  test('a tier paying the penalty in more than 5% of markets gets a line; 5% or less, or unknown, does not', () => {
    const lines = texts(beforeYouAct(examplePlan(2026), {
      traditional: tier('traditional', 2039, 2_627_800, { penaltyRate: 0.225 }),
      chubby: tier('chubby', 2043, 3_270_900, { penaltyRate: 0.05 }),
      coast: tier('coast', 2026, 774_400), // a session saved before the rate existed
    }));
    expect(lines).toContain('In 23% of markets the Traditional plan pays a 10% penalty on early 401(k)/IRA withdrawals.');
    expect(lines.filter((l) => l.includes('penalty'))).toHaveLength(1);
  });
});

describe('Coast assumptions (D69)', () => {
  test('Coast names the year work stops and the employer matches given up', () => {
    const plan = examplePlan(2026); // You born 1984, coast age 65 → 2049; $5,000 matches each
    const lines = texts(beforeYouAct(plan, { coast: tier('coast', 2026, 774_400) }));
    expect(lines).toContain('Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that stopping saving includes giving up employer matches.');
  });

  test('with contributions kept while coasting the line names the yearly amount instead (D94)', () => {
    const plan = examplePlan(2026);
    plan.you.coastContributions = { pretax: 6_000, employerMatch: 3_000, roth: 0, hsa: 0 };
    plan.spouse.coastContributions = { pretax: 0, employerMatch: 0, roth: 2_000, hsa: 0 };
    expect(texts(beforeYouAct(plan, { coast: tier('coast', 2026, 774_400) }))).toContain(
      'Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that you keep saving $11,000 a year while coasting (employer match included).');
    plan.you.coastContributions.employerMatch = 0; // today's $5,000 matches are given up
    expect(texts(beforeYouAct(plan, { coast: tier('coast', 2026, 774_400) }))).toContain(
      'Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that you keep saving $8,000 a year while coasting, giving up employer matches.');
    plan.you.contributions.employerMatch = plan.spouse.contributions.employerMatch = 0;
    expect(texts(beforeYouAct(plan, { coast: tier('coast', 2026, 774_400) }))).toContain(
      'Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that you keep saving $8,000 a year while coasting.');
  });

  test('without employer matches the line leaves them out; without a Coast result there is no line', () => {
    const plan = examplePlan(2026);
    plan.you.contributions.employerMatch = plan.spouse.contributions.employerMatch = 0;
    expect(texts(beforeYouAct(plan, { coast: tier('coast', 2026, 774_400) }))).toContain(
      'Coast assumes you both keep working until 2049 (You 65) with pay covering all spending.');
    expect(texts(beforeYouAct(plan, { traditional: tier('traditional', 2039, 2_627_800) })).join(' ')).not.toContain('Coast');
  });
});

describe('borderline results (D78)', () => {
  test('a date passing within 1.5 points of the target is flagged; a comfortable one is not', () => {
    const at = (combined: number): Success => ({ ...ok, combined, bootstrap: combined });
    const lines = texts(beforeYouAct(examplePlan(2026), {
      traditional: tier('traditional', 2039, 2_627_800, { successAtEarliest: at(0.909) }),
      chubby: tier('chubby', 2043, 3_270_900, { successAtEarliest: at(0.924) }),
    }));
    expect(lines).toContain('Traditional 2039 is borderline (90.9%); it could be a year later.');
    expect(lines.join(' ')).not.toContain('Chubby 2043 is borderline');
  });
});

describe('last line (D75)', () => {
  test('the panel always ends with the disclaimer, linking to what the model leaves out', () => {
    const lines = beforeYouAct(examplePlan(2026), { traditional: tier('traditional', 2039, 2_627_800) });
    const last = lines[lines.length - 1];
    expect(last.text).toBe('All amounts are in today’s dollars. These are estimates, not financial advice.');
    expect(last.link).toBe('limits');
  });
});

describe('savings needed by the earliest date (D67)', () => {
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
