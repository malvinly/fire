// "What to do each year after you retire" (D93, src/ui/playbook.ts) restates the engine's withdrawal rules
// (planDraws and the retired branch of simulatePath in src/engine/simulate.ts) as plain-language steps. Each test
// below pairs one step's wording with the rule it states, checked on the year-by-year records the engine produces for
// the example plan retiring in 2039 (both under 60): the typical and the bad market (medianPath, p10Path), and the
// same plan with HSA contributions, which also exercises the HSA steps and years that draw on brokerage after 60.
// A failure after an engine change means the step's wording no longer describes what the engine does: fix the
// words in playbook.ts (or the engine), not the rule here.
//
// Records: `balances` are end-of-year and nothing changes before the next year, so the previous record's balances
// are this year's starting balances; the year's withdrawals come out of them.
import { expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import { detailFor, makeEngine } from '../src/engine/solve';
import type { Plan, YearRecord } from '../src/engine/types';
import { buildPlaybook } from '../src/ui/playbook';

const RETIRE = 2039;

function smallPlan(hsa: boolean): Plan {
  const p = examplePlan(2026); // You born 1984, Spouse 1986; 10% bracket fill (D29)
  p.assumptions.paths = 400;
  p.assumptions.searchPaths = 400;
  if (hsa) p.you.contributions.hsa = 8_000;
  return p;
}

const plan = smallPlan(false);
const hsaPlan = smallPlan(true);
const detail = detailFor(makeEngine(plan), 'traditional', RETIRE);
const hsaDetail = detailFor(makeEngine(hsaPlan), 'traditional', RETIRE);
const playbook = buildPlaybook(plan, detail);
const hsaPlaybook = buildPlaybook(hsaPlan, hsaDetail);

/** The year each person can use pre-tax money without the penalty (the year they turn 60, D14). */
const sixty = [plan.you.birthYear + 60, plan.spouse.birthYear + 60];
const bothUnder60 = (year: number) => sixty.every((y) => year < y);
const both60 = (year: number) => sixty.every((y) => year >= y);

interface Year {
  label: string;
  r: YearRecord;
  start: YearRecord['balances'];
}

/** Every retired year of the four paths, with its starting balances. */
const years: Year[] = [];
for (const [name, d] of [['example', detail], ['with HSA', hsaDetail]] as const) {
  for (const [market, path] of [['typical', d.medianPath], ['bad', d.p10Path]] as const) {
    path.forEach((r, i) => {
      if (i > 0 && !r.working) years.push({ label: `${name}, ${market} market, ${r.year}`, r, start: path[i - 1].balances });
    });
  }
}

/** Every action line and lettered item of a playbook. */
const lines = (pb: typeof playbook) => pb.phases.flatMap((ph) => ph.steps.flatMap((s) => [s.action, ...(s.items ?? [])]));
const says = (pb: typeof playbook, re: RegExp) => lines(pb).some((l) => re.test(l));

/** Money left in the account at the end of the year's withdrawals. */
const cashLeft = (y: Year) => y.start.cash - y.r.withdrawals.cash;
const brokerageLeft = (y: Year) => y.start.taxable - y.r.withdrawals.taxable;

test('order step a–c ("Cash", then "Brokerage", then "Roth"): Roth is drawn only once cash and brokerage are empty', () => {
  expect(playbook.phases[0].year).toBe(RETIRE);
  const items = playbook.phases[0].steps.find((s) => s.items)!.items!;
  const cash = items.findIndex((it) => it.startsWith('Cash.'));
  const brokerage = items.findIndex((it) => it.startsWith('Brokerage.'));
  const roth = items.findIndex((it) => it.startsWith('Roth:'));
  expect(cash).toBe(0);
  expect(brokerage).toBeGreaterThan(cash);
  expect(roth).toBeGreaterThan(brokerage);

  // The year brokerage runs out, the rest comes from Roth in the same year, so the rule is "emptied this year",
  // not "empty at the start of the year".
  const rothYears = years.filter((y) => y.r.withdrawals.roth > 1);
  expect(rothYears.length).toBeGreaterThan(0);
  for (const y of rothYears) {
    expect(cashLeft(y), y.label).toBeLessThanOrEqual(1);
    expect(brokerageLeft(y), y.label).toBeLessThanOrEqual(1);
  }
});

test('order step d ("If those run out while you are under 59½ … with the 10% penalty"): the penalty is paid only once cash, brokerage and penalty-free Roth are used up', () => {
  expect(says(playbook, /^If those run out while you are under 59½, the 401\(k\)\/IRA is next, .*10% penalty/)).toBe(true);

  // "No penalty while the Roth balance is above $1,000" is not the rule: before 60 only contributions and conversions
  // at least 5 years old are penalty-free (D27), so a large Roth can still leave the penalty as the next step. The
  // bad market pays it in 2043 with $434K in Roth, of which $43K was seasoned. `seasonedRoth` is that
  // penalty-free amount at the start of the year.
  const penaltyYears = years.filter((y) => y.r.penaltyWithdrawals > 1);
  expect(penaltyYears.length).toBeGreaterThan(0);
  for (const y of penaltyYears) {
    expect(cashLeft(y), y.label).toBeLessThanOrEqual(1);
    expect(brokerageLeft(y), y.label).toBeLessThanOrEqual(1);
    expect(y.r.withdrawals.roth, y.label).toBeGreaterThanOrEqual(y.r.seasonedRoth - 1);
  }
});

test('"Each January … up to the top of the 10% bracket" and "Don’t spend it while you are both under 59½": before either is 60, the fill is converted and 401(k)/IRA money is spent only with the penalty', () => {
  const routine = playbook.phases[0].steps.map((s) => s.action);
  expect(routine.some((a) => /^Each January, take money out of the 401\(k\)\/IRA up to the top of the 10% tax bracket/.test(a))).toBe(true);
  expect(routine.some((a) => /while you are both under 59½: move it straight into a Roth IRA/.test(a))).toBe(true);

  const early = years.filter((y) => bothUnder60(y.r.year));
  expect(early.length).toBeGreaterThan(0);
  expect(early.some((y) => y.r.conversions > 1)).toBe(true);
  for (const y of early) {
    // withdrawals.pretax is what was spent (conversions excluded); before 60 all of it beyond an RMD is penalized.
    expect(y.r.withdrawals.pretax - y.r.rmd, y.label).toBeLessThanOrEqual(y.r.penaltyWithdrawals + 1);
  }
});

test('"From now on, spend what you need from the yearly withdrawal and move only the leftover into Roth": once both are 60, nothing is converted in a year that draws on cash, brokerage or Roth', () => {
  expect(says(playbook, /spend what you need from the yearly withdrawal and move only the leftover into Roth/)).toBe(true);

  for (const y of years.filter((x) => x.r.conversions > 1)) expect(y.start.pretax, y.label).toBeGreaterThan(0);
  // Spending more than the fill is observable as a draw on the accounts that come after it. (A year that spends
  // only 401(k)/IRA money can still convert, when spending is below the fill.)
  const beyond = years.filter((y) => both60(y.r.year) && y.r.withdrawals.cash + y.r.withdrawals.taxable + y.r.withdrawals.roth > 1);
  expect(beyond.length).toBeGreaterThan(0);
  for (const y of beyond) expect(y.r.conversions, y.label).toBeLessThanOrEqual(1);
});

test('"Pay medical bills from the HSA before any other account": healthcare comes from the HSA first, and other spending only once everything else is gone', () => {
  expect(says(hsaPlaybook, /^Pay medical bills from the HSA before any other account/)).toBe(true);
  expect(says(hsaPlaybook, /\(the HSA stays for medical bills\)/)).toBe(true);

  const withHsa = years.filter((y) => y.start.hsa > 1);
  expect(withHsa.length).toBeGreaterThan(0);
  for (const y of withHsa) {
    expect(y.r.withdrawals.hsa, y.label).toBeGreaterThanOrEqual(Math.min(y.start.hsa, y.r.healthcare) - 1);
    if (y.r.withdrawals.hsa > y.r.healthcare + 1) {
      expect(y.r.balances.total - y.r.balances.hsa, y.label).toBeLessThanOrEqual(1);
    }
  }
});

test('"Take the required minimum withdrawal … Spend it first; whatever you don’t need goes into the brokerage account"', () => {
  expect(says(playbook, /^Take the required minimum withdrawal from your 401\(k\)\/IRA .*Spend it first; whatever you don.t need goes into the brokerage account/)).toBe(true);

  const rmdYears = years.filter((y) => y.r.rmd > 1);
  expect(rmdYears.length).toBeGreaterThan(0);
  const surplus = rmdYears.filter((y) => y.r.rmd > y.r.spending + y.r.federalTax + y.r.stateTax + y.r.penaltyTax);
  expect(surplus.length).toBeGreaterThan(0);
  for (const y of surplus) {
    const unneeded = y.r.rmd - y.r.spending - y.r.federalTax - y.r.stateTax - y.r.penaltyTax;
    expect(y.r.reinvested ?? 0, y.label).toBeGreaterThanOrEqual(unneeded - 1);
  }
  // Reinvesting means the RMD covered the year: nothing else was drawn, and no 401(k)/IRA money beyond it.
  for (const y of rmdYears.filter((x) => (x.r.reinvested ?? 0) > 1)) {
    expect(y.r.withdrawals.cash + y.r.withdrawals.taxable + y.r.withdrawals.roth, y.label).toBeLessThanOrEqual(1);
    expect(y.r.withdrawals.pretax, y.label).toBeLessThanOrEqual(y.r.rmd + 1);
  }
});
