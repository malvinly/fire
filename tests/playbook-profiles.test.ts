// The playbook (D93) for twelve household profiles, run through the real engine and stored as snapshots in
// __snapshots__/. A change to the wording, the phase logic or the engine shows up here as a diff to read as a
// financial planner would: do the steps still make sense for this household? Accept a reviewed change with
// `npx vitest run tests/playbook-profiles.test.ts -u`.
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import { detailFor, makeEngine, solveTier, type Tier } from '../src/engine/solve';
import type { Plan } from '../src/engine/types';
import { buildPlaybook } from '../src/ui/playbook';

function base(): Plan {
  const p = examplePlan(2026);
  p.assumptions.paths = 400;
  p.assumptions.searchPaths = 400;
  return p;
}

/** `year` fixes the retirement (or Coast stop-saving) year; without it the solver's earliest year is used. */
const profiles: { name: string; tier?: Tier; year?: number; plan: (p: Plan) => void }[] = [
  { name: 'A. The example plan', plan: () => {} },
  { name: 'B. Modest income, small balances, retiring at 66 and 64', year: 2050, plan: (p) => {
    p.you.salary = p.spouse.salary = 55_000;
    p.you.contributions = { pretax: 5_000, employerMatch: 2_000, roth: 0, hsa: 0 };
    p.spouse.contributions = { pretax: 5_000, employerMatch: 2_000, roth: 0, hsa: 0 };
    p.you.balances = { pretax: 100_000, roth: 10_000, rothBasis: 8_000, hsa: 0 };
    p.spouse.balances = { pretax: 50_000, roth: 0, rothBasis: 0, hsa: 0 };
    p.household = { ...p.household, taxable: 20_000, taxableBasis: 15_000, cash: 15_000, taxableContribution: 2_000, currentSpending: 60_000, traditionalSpending: 51_000 };
    p.you.socialSecurity.manualPia = 2_000;
    p.spouse.socialSecurity.manualPia = 1_800;
  } },
  { name: 'C. High income, $2.4M pre-tax, retiring at 50 and 48 with an HSA', year: 2034, plan: (p) => {
    p.you.salary = p.spouse.salary = 250_000;
    p.you.contributions = { pretax: 24_500, employerMatch: 12_000, roth: 0, hsa: 4_000 };
    p.spouse.contributions = { pretax: 24_500, employerMatch: 12_000, roth: 0, hsa: 4_000 };
    p.you.balances = { pretax: 1_200_000, roth: 100_000, rothBasis: 60_000, hsa: 40_000 };
    p.spouse.balances = { pretax: 1_200_000, roth: 100_000, rothBasis: 60_000, hsa: 20_000 };
    p.household = { ...p.household, taxable: 800_000, taxableBasis: 500_000, cash: 100_000, taxableContribution: 60_000, currentSpending: 180_000, traditionalSpending: 153_000, chubbySpending: 216_000 };
    p.you.socialSecurity.manualPia = p.spouse.socialSecurity.manualPia = 3_800;
  } },
  { name: 'D. Single earner; the spouse has no salary and no accounts', plan: (p) => {
    p.spouse.salary = 0;
    p.spouse.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    p.spouse.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    p.spouse.socialSecurity.manualPia = 0;
    p.you.salary = 180_000;
    p.you.balances.pretax = 700_000;
  } },
  { name: 'E. Roth only: no pre-tax money at all', plan: (p) => {
    for (const q of [p.you, p.spouse]) {
      q.contributions = { pretax: 0, employerMatch: 0, roth: 20_000, hsa: 0 };
      q.balances = { pretax: 0, roth: 400_000, rothBasis: 250_000, hsa: 0 };
    }
  } },
  { name: 'F. Already 63 and 61, retiring now; one already collects Social Security; the trust-fund cut is ahead', year: 2026, plan: (p) => {
    p.you.birthYear = 1963;
    p.spouse.birthYear = 1965;
    p.you.socialSecurity.claimAge = 62;
    p.you.balances.pretax = 900_000;
    p.spouse.balances.pretax = 400_000;
    p.household.taxable = 300_000;
    p.household.taxableBasis = 200_000;
  } },
  { name: 'G. Coast FIRE on the example plan', tier: 'coast', plan: () => {} },
  { name: 'H. Yearly Roth conversions off', plan: (p) => { p.assumptions.bracketFill = 'none'; } },
  { name: 'I. Ten-year age gap, 62 and 52 at retirement, with an HSA', year: 2034, plan: (p) => {
    p.you.birthYear = 1972;
    p.spouse.birthYear = 1982;
    p.you.balances.hsa = 30_000;
    p.you.contributions.hsa = 8_000;
  } },
  { name: 'J. Filling the 22% bracket with $2.5M pre-tax', plan: (p) => {
    p.assumptions.bracketFill = '22';
    p.you.balances.pretax = 1_500_000;
    p.spouse.balances.pretax = 1_000_000;
  } },
  { name: 'K. Spending so high that money runs out in the typical market', year: 2035, plan: (p) => { p.household.traditionalSpending = 200_000; } },
  { name: 'L. Dated items: a mortgage until 2045, a home sale in 2050, a pension from 65, a car every 10 years', plan: (p) => {
    p.datedItems = [
      { id: 'm', label: 'Mortgage', direction: 'expense', amount: 30_000, frequency: 'ongoing', start: { kind: 'year', year: 2026 }, end: { kind: 'year', year: 2045 }, fixedDollars: true },
      { id: 'h', label: 'Home sale', direction: 'income', amount: 400_000, frequency: 'oneTime', start: { kind: 'year', year: 2050 }, fixedDollars: false, taxable: false },
      { id: 'p', label: 'Pension', direction: 'income', amount: 24_000, frequency: 'ongoing', start: { kind: 'age', person: 'you', age: 65 }, fixedDollars: true, taxable: true },
      { id: 'c', label: 'A car', direction: 'expense', amount: 35_000, frequency: 'recurring', start: { kind: 'year', year: 2030 }, everyYears: 10, fixedDollars: false },
    ];
  } },
];

/** The playbook as text: one line per step, lettered items, the reason in parentheses, the example and tip last. */
function render(plan: Plan, tier: Tier, year: number): string {
  const d = detailFor(makeEngine(plan), tier, year);
  const pb = buildPlaybook(plan, d);
  let out = `${tier}, retire ${d.scenario.retireYear}\n`;
  for (const ph of pb.phases) {
    out += `\n## ${ph.year} · ${ph.title} (${ph.ages})\n`;
    ph.steps.forEach((s, i) => {
      out += `${i + 1}. ${s.action}\n`;
      s.items?.forEach((it, j) => { out += `   ${String.fromCharCode(97 + j)}. ${it}\n`; });
      if (s.why) out += `   (${s.why})\n`;
    });
    if (ph.example) out += `> ${ph.example}\n`;
    if (ph.tip) out += `TIP: ${ph.tip}\n`;
  }
  return out;
}

describe('the playbook for twelve household profiles', () => {
  for (const pr of profiles) {
    test(pr.name, () => {
      const plan = base();
      pr.plan(plan);
      const tier = pr.tier ?? 'traditional';
      const year = pr.year ?? solveTier(makeEngine(plan), tier).earliest?.year ?? plan.startYear + 10;
      expect(render(plan, tier, year)).toMatchSnapshot();
    }, 120_000);
  }
});
