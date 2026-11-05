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
import { describe, expect, test } from 'vitest';
import { buildContext } from '../src/engine/context';
import { examplePlan } from '../src/engine/defaults';
import { mixInYear, mixPercents, type Allocation } from '../src/engine/mix';
import { simulatePath } from '../src/engine/simulate';
import { detailFor, makeEngine, type Tier } from '../src/engine/solve';
import type { Plan, YearRecord } from '../src/engine/types';
import { buildPlaybook, type Playbook } from '../src/ui/playbook';

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

/** The retirement routine (the example plan's default mix shifts before it, so it is not the first phase). */
const retirePhase = (pb: typeof playbook) => {
  const ph = pb.phases.find((x) => x.year === RETIRE)!;
  expect(ph.title.startsWith('You retire')).toBe(true);
  return ph;
};

/** Every action line and lettered item of a playbook. */
const lines = (pb: typeof playbook) => pb.phases.flatMap((ph) => ph.steps.flatMap((s) => [s.action, ...(s.items ?? [])]));
const says = (pb: typeof playbook, re: RegExp) => lines(pb).some((l) => re.test(l));

/** Money left in the account at the end of the year's withdrawals. */
const cashLeft = (y: Year) => y.start.cash - y.r.withdrawals.cash;
const brokerageLeft = (y: Year) => y.start.taxable - y.r.withdrawals.taxable;

test('order step a–c ("Cash", then "Brokerage", then "Roth"): Roth is drawn only once cash and brokerage are empty', () => {
  const items = retirePhase(playbook).steps.find((s) => s.items)!.items!;
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
  const routine = retirePhase(playbook).steps.map((s) => s.action);
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

// Asset mix over time (D97): the mix steps against mix.ts and the engine's yearly shift (`ctx.mixShift`, taxed by
// `shiftGain` in simulate.ts), for each kind of path: Vanguard's (moving before and after retirement), a Coast plan,
// your own mix in yearly steps (spanning retirement, starting the year you retire, moving back toward stocks before
// retirement), one switch (in the retirement year, after it), Fidelity's fixed mix, and a household without a
// brokerage account.
describe('asset mix steps (D97)', () => {
  const A: Allocation = { stocks: 0.7, bonds: 0.25, cash: 0.05 };
  const B: Allocation = { stocks: 0.4, bonds: 0.5, cash: 0.1 };
  const own = (first: Allocation, later: Allocation, start: number, end: number) => (p: Plan) => {
    p.assumptions.mixPlan = 'own';
    p.assumptions.allocation = { ...first };
    p.assumptions.laterAllocation = { ...later };
    p.assumptions.shiftStartAge = start;
    p.assumptions.shiftEndAge = end;
  };
  const cases: { name: string; tier?: Tier; year?: number; set: (p: Plan) => void }[] = [
    { name: 'Vanguard, the example plan', set: () => {} },
    { name: 'Vanguard, Coast stopping in 2030', tier: 'coast', year: 2030, set: () => {} },
    { name: 'own, yearly steps at 50–59 spanning retirement', set: own(A, B, 50, 59) },
    { name: 'own, yearly steps at 55–60 starting the year you retire', set: own(A, B, 55, 60) },
    { name: 'own, back toward stocks at 40–49, before retirement', set: own(B, A, 40, 49) },
    { name: 'own, one switch the year you retire', set: own(A, B, 55, 55) },
    { name: 'own, one switch at 65, after retirement', set: own(A, B, 65, 65) },
    { name: 'Fidelity', set: (p) => { p.assumptions.mixPlan = 'fidelity'; } },
    { name: 'Vanguard, no brokerage account', set: (p) => { p.household.taxable = p.household.taxableBasis = p.household.taxableContribution = 0; } },
    { name: 'Vanguard, no brokerage account, but an older spouse’s large required withdrawals from 2050 are partly reinvested', set: (p) => {
      p.household.taxable = p.household.taxableBasis = p.household.taxableContribution = 0;
      p.spouse.birthYear = 1975;
      p.spouse.balances.pretax = 1_500_000;
    } },
  ];

  /** The years in which the playbook tells the reader to move the mix, read from its mix steps. */
  function claimedMoves(pb: Playbook, retireYear: number): Set<number> {
    const out = new Set<number>();
    const range = (a: number, b: number) => { for (let y = a; y <= b; y++) out.add(y); };
    for (const ph of pb.phases) {
      for (const s of ph.steps) {
        const t = s.action;
        if (!t.includes('every invested account')) continue;
        let m: RegExpExecArray | null;
        if (t.startsWith('Each year until you retire,')) range(ph.year, retireYear);
        else if ((m = /^Each year from (\d{4}) through (\d{4}),/.exec(t))) range(+m[1], +m[2]);
        else if (/^Move every invested account .* this year/.test(t)) out.add(ph.year);
        else if ((m = /until the switch to .* in (\d{4})\.$/.exec(t))) out.add(+m[1]);
        else if ((m = /^Once a year,( starting this year,)? move every invested account to that year’s mix .* this year, then .*?(?: from (\d{4}))? through (\d{4}),/.exec(t))) {
          if (m[1]) out.add(ph.year);
          range(m[2] ? +m[2] : ph.year + 1, +m[3]);
        } else expect(t).toMatch(/^Once a year, put every invested account back to [^,]*\(cash stays cash\)\.$/);
      }
    }
    return out;
  }

  for (const c of cases) {
    test(c.name, () => {
      const p = smallPlan(false);
      c.set(p);
      const e = makeEngine(p);
      const d = detailFor(e, c.tier ?? 'traditional', c.year ?? RETIRE);
      const retireYear = d.scenario.retireYear;
      const pb = buildPlaybook(p, d);
      const ctx = buildContext(p, d.scenario);

      // (a) Every mix stated for a year is the engine's mix that year, in whole percents that add up to 100.
      let stated = 0;
      for (const ph of pb.phases) {
        for (const s of ph.steps) {
          const t = `${s.action} ${s.why ?? ''}`;
          for (const m of t.matchAll(/(\d+)% stocks \/ (\d+)% bonds(?: \/ (\d+)% cash)? (in (\d{4})|this year)/g)) {
            const year = m[5] ? +m[5] : ph.year;
            expect([+m[1], +m[2], +(m[3] ?? 0)], `${year}: ${t}`).toEqual(mixPercents(mixInYear(p, year)));
            stated++;
          }
          for (const m of t.matchAll(/(\d{4}): (\d+) \/ (\d+)(?: \/ (\d+))?/g)) {
            expect([+m[2], +m[3], +(m[4] ?? 0)], `${m[1]}: ${t}`).toEqual(mixPercents(mixInYear(p, +m[1])));
          }
          const fixed = /^Once a year, put every invested account back to (\d+)% stocks \/ (\d+)% bonds(?: \/ (\d+)% cash)?/.exec(s.action);
          if (fixed) expect([+fixed[1], +fixed[2], +(fixed[3] ?? 0)]).toEqual(mixPercents(mixInYear(p, ph.year)));
        }
      }

      // (b) The playbook names a move in exactly the years the engine shifts the mix, and none after its last-change phase.
      const shifted = Array.from(ctx.mixShift, (x, t) => (x > 0 ? p.startYear + t : 0)).filter((y) => y > 0);
      expect([...claimedMoves(pb, retireYear)].sort((x, y) => x - y)).toEqual(shifted);
      const end = pb.phases.find((ph) => /Last change to the asset mix|Switch to a new asset mix/.test(ph.title));
      if (end) expect(Math.max(...shifted)).toBe(end.year);
      if (c.name !== 'Fidelity') expect(stated).toBeGreaterThan(0);

      // (c) In a year with a shift, a brokerage account holding a gain realizes at least that share of it, so the tax
      // sentence is said exactly when the engine can charge the tax.
      const why = (re: RegExp) => pb.phases.some((ph) => ph.steps.some((s) => re.test(s.why ?? '')));
      const says = why(/capital-gains tax on that sale/);
      const saysIf = why(/^.*If money from .* goes into a brokerage account by then/); // no brokerage account today
      let charged = 0;
      for (let path = 0; path < 10; path++) {
        const records = simulatePath(ctx, e.boot, path, { record: true }).records!;
        for (let t = 1; t < ctx.len; t++) {
          if (!(ctx.mixShift[t] > 0)) continue;
          const start = simulatePath(ctx, e.boot, path, { stopIdx: t }).state;
          const gain = start.taxable - start.taxableBasis;
          const r = records[t];
          expect(r.year).toBe(p.startYear + t);
          if (gain > 1) {
            expect(r.capitalGains, `path ${path}, ${r.year}`).toBeGreaterThanOrEqual(ctx.mixShift[t] * gain - 1);
            charged++;
          }
          if (!says && !saysIf) expect(start.taxable, `path ${path}, ${r.year}`).toBe(0);
        }
      }
      expect(says || saysIf).toBe(charged > 0);
      expect(says && saysIf).toBe(false);
      if (saysIf) {
        // The engine's brokerage balance turns positive before the last move year in the markets checked.
        const last = Math.max(...shifted);
        expect(d.medianPath.some((r) => r.year < last && r.balances.taxable > 0)).toBe(true);
      }
    }, 120_000);
  }
});
