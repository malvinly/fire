// The playbook (D93) for fourteen household profiles, run through the real engine and stored as snapshots in
// __snapshots__/. Every profile has a fixed retirement (or Coast stop-saving) year, so a wording or phase-logic
// change moves the steps and an engine change moves only the numbers in them. The profiles run at 400 markets (the
// app uses 10,000), so the example lines' dollar figures differ from the screen and are illustrative. Read a diff
// as a financial planner would (do the steps still make sense for this household?) before accepting it with
// `npx vitest run tests/playbook-profiles.test.ts -u`. That the steps still match what the engine does is checked
// by tests/playbook-engine.test.ts.
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import { detailFor, makeEngine, type Tier } from '../src/engine/solve';
import type { Plan } from '../src/engine/types';
import { buildPlaybook } from '../src/ui/playbook';

function base(): Plan {
  const p = examplePlan(2026);
  p.assumptions.paths = 400;
  p.assumptions.searchPaths = 400;
  return p;
}

/**
 * `year` is the retirement (or Coast stop-saving) year. A, D, E, G, H, J and L use the solver's earliest year at 400
 * markets when they were pinned (engine 7); they stay fixed even if a later engine would find a different year.
 */
const profiles: { name: string; tier?: Tier; year: number; plan: (p: Plan) => void }[] = [
  { name: 'A. The example plan', year: 2039, plan: () => {} },
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
  { name: 'D. Single earner; the spouse has no salary and no accounts', year: 2041, plan: (p) => {
    p.spouse.salary = 0;
    p.spouse.contributions = { pretax: 0, employerMatch: 0, roth: 0, hsa: 0 };
    p.spouse.balances = { pretax: 0, roth: 0, rothBasis: 0, hsa: 0 };
    p.spouse.socialSecurity.manualPia = 0;
    p.you.salary = 180_000;
    p.you.balances.pretax = 700_000;
  } },
  { name: 'E. Roth only: no pre-tax money at all', year: 2038, plan: (p) => {
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
  { name: 'G. Coast FIRE on the example plan', tier: 'coast', year: 2026, plan: () => {} },
  { name: 'H. Yearly Roth conversions off', year: 2039, plan: (p) => { p.assumptions.bracketFill = 'none'; } },
  { name: 'I. Ten-year age gap, 62 and 52 at retirement, with an HSA', year: 2034, plan: (p) => {
    p.you.birthYear = 1972;
    p.spouse.birthYear = 1982;
    p.you.balances.hsa = 30_000;
    p.you.contributions.hsa = 8_000;
  } },
  { name: 'J. Filling the 22% bracket with $2.5M pre-tax', year: 2030, plan: (p) => {
    p.assumptions.bracketFill = '22';
    p.you.balances.pretax = 1_500_000;
    p.spouse.balances.pretax = 1_000_000;
  } },
  { name: 'K. Spending so high that money runs out in the typical market', year: 2035, plan: (p) => { p.household.traditionalSpending = 200_000; } },
  { name: 'L. Dated items: a mortgage until 2045, a home sale in 2050, a pension from 65, a car every 10 years', year: 2039, plan: (p) => {
    p.datedItems = [
      { id: 'm', label: 'Mortgage', direction: 'expense', amount: 30_000, frequency: 'ongoing', start: { kind: 'year', year: 2026 }, end: { kind: 'year', year: 2045 }, fixedDollars: true },
      { id: 'h', label: 'Home sale', direction: 'income', amount: 400_000, frequency: 'oneTime', start: { kind: 'year', year: 2050 }, fixedDollars: false, taxable: false },
      { id: 'p', label: 'Pension', direction: 'income', amount: 24_000, frequency: 'ongoing', start: { kind: 'age', person: 'you', age: 65 }, fixedDollars: true, taxable: true },
      { id: 'c', label: 'A car', direction: 'expense', amount: 35_000, frequency: 'recurring', start: { kind: 'year', year: 2030 }, everyYears: 10, fixedDollars: false },
    ];
  } },
  { name: 'M. The spouse is older than "You": 56 and 62 at retirement', year: 2042, plan: (p) => {
    p.you.birthYear = 1986;
    p.spouse.birthYear = 1980;
  } },
  { name: 'N. Both born the same year, 57 at retirement, with an HSA', year: 2041, plan: (p) => {
    p.you.birthYear = p.spouse.birthYear = 1984;
    p.you.balances.hsa = 20_000;
  } },
];

/** The playbook as text: one line per step, lettered items, the reason in parentheses, the example last. */
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
  }
  return out;
}

describe('the playbook for fourteen household profiles', () => {
  for (const pr of profiles) {
    test(pr.name, () => {
      const plan = base();
      pr.plan(plan);
      const tier = pr.tier ?? 'traditional';
      expect(render(plan, tier, pr.year)).toMatchSnapshot();
    }, 120_000);
  }
});
