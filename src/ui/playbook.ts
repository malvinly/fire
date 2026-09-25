// "What to do each year after you retire": the withdrawal plan the engine follows (D27–D31), told as steps a
// financial novice can follow, each with the reason for it (D93). Pure function of the plan and the detail view's
// data so it can be tested; `PlaybookPanel` in Results.tsx draws it as a timeline.

import { FEDERAL, RULES_YEAR, rmdStartAge } from '../data/rules';
import type { Detail } from '../engine/solve';
import { bracketTop } from '../engine/tax';
import type { Plan, YearRecord } from '../engine/types';
import { money, moneyShort, whose } from './format';

export interface Step {
  /** What to do, one or two short sentences. */
  action: string;
  /** Why, and the details a reader needs to do it. */
  why?: string;
  /** A lettered list under the action (the withdrawal order). */
  items?: string[];
}

export interface Phase {
  year: number;
  title: string;
  ages: string;
  steps: Step[];
  /** That year in the typical market of the year-by-year table, as one sentence. */
  example?: string;
}

export interface Playbook {
  phases: Phase[];
}

interface Person {
  name: string;
  birthYear: number;
  sixty: number;
  medicare: number;
  claim: number;
  claimAge: number;
  rmd: number;
  rmdAge: number;
  preMedicare: number;
  medicareCost: number;
  hasPretax: boolean;
}

const isYou = (name: string) => /^you$/i.test(name.trim());
/** "turn" for the default name "You", "turns" for a real name. */
const verb = (name: string, base: string) => (isYou(name) ? base : `${base}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "you" / "Alex" for the middle of a sentence. */
const who = (name: string) => (isYou(name) ? 'you' : name);

export function buildPlaybook(plan: Plan, detail: Detail): Playbook {
  const a = plan.assumptions;
  const retireYear = detail.scenario.retireYear;
  const endYear = detail.years[detail.years.length - 1];
  const fill = a.bracketFill;
  const people: Person[] = (['you', 'spouse'] as const).map((id) => {
    const p = plan[id];
    return {
      name: p.name,
      birthYear: p.birthYear,
      sixty: p.birthYear + 60,
      medicare: p.birthYear + 65,
      claim: p.birthYear + p.socialSecurity.claimAge,
      claimAge: p.socialSecurity.claimAge,
      rmd: p.birthYear + rmdStartAge(p.birthYear),
      rmdAge: rmdStartAge(p.birthYear),
      preMedicare: p.healthcare.preMedicare,
      medicareCost: p.healthcare.medicare,
      hasPretax: p.balances.pretax > 0 || p.contributions.pretax > 0 || p.contributions.employerMatch > 0,
    };
  });
  const h = plan.household;
  const has = {
    cash: h.cash > 0 || h.cashContribution > 0,
    taxable: h.taxable > 0 || h.taxableContribution > 0,
    pretax: people.some((p) => p.hasPretax),
    roth: plan.you.balances.roth > 0 || plan.spouse.balances.roth > 0 || plan.you.contributions.roth > 0 || plan.spouse.contributions.roth > 0,
    hsa: plan.you.balances.hsa + plan.spouse.balances.hsa > 0 || plan.you.contributions.hsa + plan.spouse.contributions.hsa > 0,
  };
  const converting = fill !== 'none' && has.pretax;
  if (converting) has.roth = true;
  const ages = (year: number) => people.map((p) => `${p.name} ${year - p.birthYear}`).join(' · ');
  const under60At = (year: number) => people.filter((p) => p.sixty > year);
  const older = people[0].birthYear <= people[1].birthYear ? people[0] : people[1];
  const younger = older === people[0] ? people[1] : people[0];

  const phases: Phase[] = [];

  // Coast: the years between stopping contributions and retiring.
  const stop = detail.scenario.stopContributingYear;
  if (stop < retireYear) {
    phases.push({
      year: stop, title: 'Stop saving, keep working', ages: ages(stop),
      steps: [{
        action: 'Stop adding to savings, including the 401(k) contribution that earns the employer match.',
        why: `Your paychecks cover all the bills, and the savings you already have keep growing untouched until you retire in ${retireYear}.`,
      }],
    });
  }

  // Retirement: the yearly routine, as it stands on the day you retire.
  const steps: Step[] = [];
  if (has.hsa) {
    steps.push({
      action: 'Pay medical bills from the HSA before any other account.',
      why: 'That money is never taxed when it goes to healthcare, and no other account works that way.',
    });
  }
  const buying = people.filter((p) => p.medicare > retireYear && p.preMedicare > 0);
  if (buying.length) {
    const cost = buying.reduce((s, p) => s + p.preMedicare, 0);
    const until = buying.length === 2 ? 'until each of you turns 65' : `until ${who(buying[0].name)} ${verb(buying[0].name, 'turn')} 65`;
    steps.push({
      action: `Buy your own health insurance ${until}, when Medicare takes over.`,
      why: `The plan budgets about ${money(cost)} a year for it in today's dollars, at full price with no subsidy, on top of your regular spending.`,
    });
  }
  if (converting) {
    const top = bracketTop(fill);
    const under = under60At(retireYear);
    let why = 'This money is taxed whenever it comes out. Taking some every year while your income is low means it is taxed at the lowest rate, ' +
      `instead of piling up and being taxed at a higher rate later. For ${RULES_YEAR} the top of the bracket is about ${money(top + FEDERAL.standardDeduction)} ` +
      `of income for a married couple (the ${money(FEDERAL.standardDeduction)} standard deduction plus the ${money(top)} bracket), minus any other income you ` +
      'already expect that year, such as Social Security, a pension or interest. Look the numbers up each year; the IRS raises them with inflation.';
    if (people.every((p) => p.hasPretax)) {
      why += ` Start with ${whose(older.name)} account, the older of you, because it opens up penalty-free first; then ${whose(younger.name)}.`;
    }
    steps.push({ action: `Each January, take money out of the 401(k)/IRA up to the top of the ${fill}% tax bracket.`, why });
    const convertWhy = 'Ask the brokerage for a “Roth conversion”. Spending that money would cost a 10% penalty; converting it costs only the income tax, ' +
      'and after 5 years it can be spent with no tax or penalty at all.';
    if (under.length === 2) {
      steps.push({ action: 'Don’t spend it while you are both under 59½: move it straight into a Roth IRA and write down the year.', why: convertWhy });
    } else if (under.length === 1) {
      const p = under[0];
      steps.push({
        action: `Don’t spend the part taken from ${whose(p.name)} 401(k)/IRA while ${who(p.name)} ${isYou(p.name) ? 'are' : 'is'} under 59½: move it straight ` +
          `into ${whose(p.name)} Roth IRA and write down the year. Spend what you need from ${whose(older.name)} withdrawal and convert only the leftover.`,
        why: convertWhy,
      });
    } else {
      steps.push({
        action: 'Spend what you need from it and move whatever is left over into a Roth IRA.',
        why: 'A “Roth conversion”: the money grows tax-free from then on, and it shrinks the withdrawals the IRS will require later.',
      });
    }
  }
  const anyUnder60 = under60At(retireYear).length > 0;
  const items: string[] = [];
  if (has.cash) items.push('Cash.');
  if (has.taxable) items.push('Brokerage. You pay tax only on the growth, at the low capital-gains rate.');
  const open = people.filter((p) => p.hasPretax && p.sixty <= retireYear);
  if (open.length) {
    const names = open.length === 2 ? 'The' : cap(whose(open[0].name));
    items.push(`${names} 401(k)/IRA${converting ? ', beyond the yearly amount above' : ''}.`);
  }
  if (has.roth) {
    items.push(anyUnder60
      ? 'Roth: only what you put in yourself, and conversions that are 5 or more years old. The growth and newer conversions stay put.'
      : 'Roth.');
  }
  if (anyUnder60 && has.pretax) {
    items.push('If those run out before you are 59½, the 401(k)/IRA is next, with the 10% penalty. The results above count how often that happens.');
  }
  steps.push({
    action: `For everything else you need this year, take money in this order, moving to the next account only when the one before is empty${
      has.hsa ? ' (the HSA stays for medical bills)' : ''}:`,
    items,
    why: 'Cash and brokerage cost the least tax to spend. Roth money grows tax-free, so it is worth the most if it is left alone the longest.',
  });
  const collecting = people.filter((p) => p.claim <= retireYear);
  if (collecting.length) {
    const names = collecting.length === 2 ? 'You both already collect' : `${cap(who(collecting[0].name))} already ${verb(collecting[0].name, 'collect')}`;
    steps.push({ action: `${names} Social Security.`, why: 'It covers part of each year, and the accounts cover the rest.' });
  }
  steps.push({
    action: 'Set aside the tax on what you take out, and pay it with your return in April or in four estimated payments during the year.',
    why: 'The money you take out has to cover the tax on it too; the plan’s withdrawals include it.',
  });
  phases.push({ year: retireYear, title: 'You retire', ages: ages(retireYear), steps });

  // Milestones after retirement, grouped by year.
  const later = new Map<number, { title: string; steps: Step[] }[]>();
  const add = (year: number, title: string, steps: Step[]) => {
    if (year <= retireYear || year > endYear) return;
    const list = later.get(year) ?? [];
    list.push({ title, steps });
    later.set(year, list);
  };
  for (const p of people) {
    const other = p === people[0] ? people[1] : people[0];
    if (p.hasPretax || has.roth) {
      const list: Step[] = [{
        action: `${cap(whose(p.name))} 401(k)/IRA and all of ${whose(p.name)} Roth can now be used with no penalty.`,
        why: `The IRS rule is 59½; the plan counts the year ${who(p.name)} ${verb(p.name, 'turn')} 60.`,
      }];
      if (p.hasPretax) {
        list.push({
          action: (converting ? 'From now on, spend what you need from the yearly withdrawal and move only the leftover into Roth. ' : '') +
            `In the order above, ${whose(p.name)} 401(k)/IRA now comes after brokerage and before Roth.`,
          why: 'Before 59½, spending that money cost a 10% penalty. Now it doesn’t, so it is cheaper to spend than Roth money, which keeps growing tax-free.',
        });
      }
      add(p.sixty, `${p.name} ${verb(p.name, 'turn')} 60`, list);
    }

    const med: Step[] = [{
      action: `${cap(who(p.name))} ${verb(p.name, 'move')} to Medicare. Sign up in the 3 months before the birthday.`,
      why: 'Signing up late carries a lifelong penalty.' + (p.preMedicare > 0 || p.medicareCost > 0
        ? ` Health insurance for ${who(p.name)} goes from about ${money(p.preMedicare)} to about ${money(p.medicareCost)} a year (today's dollars).`
        : ''),
    }];
    if (has.hsa && other.medicare <= p.medicare) {
      med.push({
        action: 'HSA money can now also be spent on anything else.',
        why: 'Once you are both 65 it is taxed like 401(k)/IRA money, with no penalty. The plan still uses it for medical bills first.',
      });
    }
    add(p.medicare, `${p.name} ${verb(p.name, 'turn')} 65`, med);

    let ssWhy = '';
    const full = detail.medianPath.find((r) => r.year === p.claim + 1) ?? detail.medianPath.find((r) => r.year === p.claim);
    if (full && full.socialSecurity > 0) {
      ssWhy += `From then on it brings in about ${moneyShort(full.socialSecurity)} a year in today's dollars, so you take that much less from the accounts.`;
    }
    if (converting) ssWhy += ` It also counts as income, so there is less room under the ${fill}% bracket and the yearly 401(k)/IRA withdrawal shrinks.`;
    const tf = a.ssTrustFund;
    if (tf.startPct < 1 && p.claim >= tf.startYear) {
      ssWhy += ` The amount already assumes a cut to ${Math.round(tf.startPct * 100)}% of the full benefit, in case Congress does not fix the shortfall in Social ` +
        'Security’s trust fund. If it does, you will get more.';
    }
    add(p.claim, `${p.name} ${verb(p.name, 'start')} Social Security (age ${p.claimAge})`, [{
      action: `Apply for Social Security about 3 months before ${who(p.name)} ${verb(p.name, 'turn')} ${p.claimAge}.`,
      why: ssWhy.trim() || undefined,
    }]);

    if (p.hasPretax) {
      add(p.rmd, `${p.name} ${verb(p.name, 'turn')} ${p.rmdAge}`, [{
        action: `Take the required minimum withdrawal from ${whose(p.name)} 401(k)/IRA every year before December 31. Spend it first; whatever you don’t need goes into the brokerage account.`,
        why: 'The IRS now requires it (a “required minimum distribution”, or RMD): about 4% of the balance at first and a slightly bigger share each year, ' +
          'from an IRS table. Your brokerage will tell you the exact figure. Missing it costs a 25% penalty.',
      }]);
    }
  }
  const tf = a.ssTrustFund;
  if (tf.startPct < 1 && people.some((p) => p.claim < tf.startYear)) {
    add(tf.startYear, 'Social Security cut', [{
      action: `Expect smaller Social Security checks from ${tf.startYear}.`,
      why: `The plan counts only ${Math.round(tf.startPct * 100)}% of each check from then on, sliding to ${Math.round(tf.endPct * 100)}% by ${tf.endYear}, ` +
        'in case Congress does not fix the shortfall in the program’s trust fund. If it does, you will get more than planned.',
    }]);
  }
  for (const year of [...later.keys()].sort((x, y) => x - y)) {
    const events = later.get(year)!;
    phases.push({
      year,
      title: events.map((e) => e.title).join(' · '),
      ages: ages(year),
      steps: events.flatMap((e) => e.steps),
    });
  }

  // One line per phase from the typical market, until money runs out there.
  const ranOut = detail.medianPath.find((r) => !r.working && r.shortfall > 1)?.year;
  for (const phase of phases) {
    if (phase.year < retireYear || (ranOut !== undefined && phase.year >= ranOut)) continue;
    const r = detail.medianPath.find((x) => x.year === phase.year);
    if (r && !r.working) phase.example = exampleLine(r);
  }
  return { phases };
}

/** "In the typical market of the table below, 2041: spent $92K; $12K from cash; …" */
export function exampleLine(r: YearRecord): string {
  const parts: string[] = [`spent ${moneyShort(r.spending)}`];
  const put = (amount: number, label: string) => { if (amount > 0.5) parts.push(`${moneyShort(amount)} ${label}`); };
  put(r.socialSecurity, 'from Social Security');
  put(r.otherIncome, 'of other income');
  put(r.withdrawals.hsa, 'from the HSA');
  put(r.withdrawals.cash, 'from cash');
  put(r.withdrawals.taxable, 'from brokerage');
  put(r.withdrawals.pretax, 'from 401(k)/IRA');
  put(r.rmd, 'of that required by the IRS');
  put(r.withdrawals.roth, 'from Roth');
  put(r.conversions, 'moved from 401(k)/IRA to Roth');
  put(r.reinvested ?? 0, 'not needed and reinvested');
  put(r.federalTax + r.stateTax + r.penaltyTax, 'in taxes');
  return `In the typical market of the table below, ${r.year}: ${parts.join('; ')}.`;
}
