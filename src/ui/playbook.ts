// "What to do each year after you retire": the withdrawal plan the engine follows (D27–D31), told as steps a
// financial novice can follow, each with the reason for it (D93). Pure function of the plan and the detail view's
// data so it can be tested; `PlaybookPanel` in Results.tsx draws it as a timeline.

import { VANGUARD_PATH } from '../data/mixPaths';
import { FEDERAL, RULES_YEAR, rmdStartAge } from '../data/rules';
import { timingYear } from '../engine/context';
import { mixInYear, mixPercents, mixShiftYears, shiftShare } from '../engine/mix';
import { RUN_OUT_SHORTFALL } from '../engine/simulate';
import { ownClaimFactor, payableShare, spousalClaimFactor } from '../engine/socialSecurity';
import type { Detail } from '../engine/solve';
import { bracketTop } from '../engine/tax';
import type { DatedItem, Plan, YearRecord } from '../engine/types';
import { andList, money, moneyShort, nameIs, whose } from './format';
import { mixLabel } from './mixText';

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
  /** Health insurance before and after 65 as entered: today's dollars at the plan start, before healthcare inflation. */
  preMedicare: number;
  medicareCost: number;
  hasPretax: boolean;
  hasRoth: boolean;
}

const isYou = (name: string) => whose(name) === 'your';
/** "turn" for the default name "You", "turns" for a real name. */
const verb = (name: string, base: string) => (isYou(name) ? base : `${base}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "you" / "Alex" for the middle of a sentence. */
const who = (name: string) => (isYou(name) ? 'you' : name);
/** "yours" / "Alex’s" at the end of a sentence. */
const yours = (name: string) => (isYou(name) ? 'yours' : whose(name));
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A percentage with up to one decimal ("1.5%"). */
const pct1 = (x: number) => `${Math.round(x * 1000) / 10}%`;
/** Amounts under this are noise once rounded to $K ("$0K"), so the text leaves them out. */
const MIN_SHOWN = 500;

/**
 * What each person keeps contributing while coasting (D94), e.g. "You $6,000 to pre-tax 401(k)/IRA (earning a
 * $3,000 employer match) and $4,000 to an HSA; Spouse $2,000 to Roth 401(k)/IRA"; null when nothing is kept.
 */
function keptContributions(plan: Plan): string | null {
  const people = (['you', 'spouse'] as const).map((id) => {
    const p = plan[id];
    const c = p.coastContributions;
    const parts: string[] = [];
    if (c.pretax > 0) parts.push(`${money(c.pretax)} to pre-tax 401(k)/IRA${c.employerMatch > 0 ? ` (earning a ${money(c.employerMatch)} employer match)` : ''}`);
    else if (c.employerMatch > 0) parts.push(`a ${money(c.employerMatch)} employer match`);
    if (c.roth > 0) parts.push(`${money(c.roth)} to Roth 401(k)/IRA`);
    if (c.hsa > 0) parts.push(`${money(c.hsa)} to an HSA`);
    return parts.length ? `${p.name} ${andList(parts)}` : null;
  }).filter((s): s is string => s !== null);
  return people.length ? people.join('; ') : null;
}

export function buildPlaybook(plan: Plan, detail: Detail): Playbook {
  const a = plan.assumptions;
  const retireYear = detail.scenario.retireYear;
  const endYear = detail.years[detail.years.length - 1];
  const fill = a.bracketFill;
  // Contributions only count if some are made: none are when saving stops, or retirement comes, at the plan start.
  const contributes = Math.min(detail.scenario.stopContributingYear, retireYear) > plan.startYear;
  // Coast: the contributions kept while coasting land between the stop year and retirement (D94).
  const coasts = detail.scenario.stopContributingYear < retireYear;
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
      hasPretax: p.balances.pretax > 0 || (contributes && p.contributions.pretax + p.contributions.employerMatch > 0) ||
        (coasts && p.coastContributions.pretax + p.coastContributions.employerMatch > 0),
      hasRoth: p.balances.roth > 0 || (contributes && p.contributions.roth > 0) || (coasts && p.coastContributions.roth > 0),
    };
  });
  const h = plan.household;
  const has = {
    cash: h.cash > 0 || (contributes && h.cashContribution > 0),
    taxable: h.taxable > 0 || (contributes && h.taxableContribution > 0),
    pretax: people.some((p) => p.hasPretax),
    roth: people.some((p) => p.hasRoth),
    hsa: plan.you.balances.hsa + plan.spouse.balances.hsa > 0 || (contributes && plan.you.contributions.hsa + plan.spouse.contributions.hsa > 0) ||
      (coasts && plan.you.coastContributions.hsa + plan.spouse.coastContributions.hsa > 0),
  };
  const converting = fill !== 'none' && has.pretax;
  if (converting) {
    has.roth = true;
    for (const p of people) if (p.hasPretax) p.hasRoth = true; // conversions land in the owner's Roth
  }
  const ages = (year: number) => people.map((p) => `${p.name} ${year - p.birthYear}`).join(' · ');
  const under60At = (year: number) => people.filter((p) => p.sixty > year);
  const older = people[0].birthYear <= people[1].birthYear ? people[0] : people[1];
  const younger = older === people[0] ? people[1] : people[0];
  const sameAge = people[0].birthYear === people[1].birthYear;
  /** A healthcare input in `year`: it rises faster than prices, as context.ts charges it; today's dollars, to the $100. */
  const hcIn = (amount: number, year: number) =>
    Math.round((amount * Math.pow(1 + a.healthcareInflation, year - plan.startYear)) / 100) * 100;

  const phases: Phase[] = [];

  // Coast: the years between stopping (or cutting back, D94) contributions and retiring.
  const stop = detail.scenario.stopContributingYear;
  if (coasts) {
    const kept = keptContributions(plan);
    phases.push(kept
      ? {
        year: stop, title: 'Cut back saving, keep working', ages: ages(stop),
        steps: [{
          action: `Keep only these contributions and stop every other addition to savings: ${kept}.`,
          why: `Your paychecks cover all the bills, and what you keep saving and the savings you already have keep growing until you retire in ${retireYear}.`,
        }],
      }
      : {
        year: stop, title: 'Stop saving, keep working', ages: ages(stop),
        steps: [{
          action: 'Stop adding to savings, including the 401(k) contribution that earns the employer match.',
          why: `Your paychecks cover all the bills, and the savings you already have keep growing untouched until you retire in ${retireYear}.`,
        }],
      });
  }

  // Asset mix over time (D97): every invested account holds the year's mix (mix.ts). The plan starts with the
  // accounts already holding the first year's mix; every later year whose mix differs from the year before is a move,
  // which in the brokerage account sells holdings and is taxed that year (`shiftGain` in simulate.ts).
  //
  // Two kinds of first/last year, not to be mixed up:
  //   - `moveYears`, `firstMove`, `lastMove`: the moves inside the plan's years (from its second year to its last),
  //     the years the engine moves and taxes (`ctx.mixShift`). Every step and phase is placed and worded from these.
  //   - `pathYears` (`mixShiftYears`): the path's own first and last move, not limited to the plan. Used only to say
  //     whether the shift was already under way before the plan, whether it had already ended (the routine's "done"),
  //     and whether the path is a single switch.
  const mixIn = (year: number) => mixInYear(plan, year);
  const mixOf = (year: number) => mixLabel(mixIn(year));
  const moved = (year: number) => shiftShare(mixIn(year - 1), mixIn(year));
  const moveYears: number[] = [];
  for (let y = plan.startYear + 1; y <= endYear; y++) if (moved(y) > 0) moveYears.push(y);
  const firstMove = moveYears.length ? moveYears[0] : undefined;
  const lastMove = moveYears.length ? moveYears[moveYears.length - 1] : undefined;
  const pathYears = mixShiftYears(plan);
  const singleSwitch = pathYears !== null && pathYears.first === pathYears.last;
  const movesIn = (from: number, to: number) => moveYears.filter((y) => y >= from && y <= to);
  /** "about 1.5 percentage points a year", or "about 1.5 to 3 …" when the yearly move varies (Vanguard's path). */
  const perYear = (years: number[]) => {
    const pts = years.map((y) => {
      const x = moved(y) * 100;
      return Math.max(0.1, x >= 1 ? Math.round(x * 2) / 2 : Math.round(x * 10) / 10);
    });
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    return `about ${lo === hi ? lo : `${lo} to ${hi}`} percentage points a year`;
  };
  /** "from stocks into bonds", "from bonds and cash into stocks", …, as the mix moves between the two years. */
  const direction = (from: number, to: number) => {
    const x = mixIn(from);
    const y = mixIn(to);
    const kinds = ['stocks', 'bonds', 'cash'] as const;
    return `from ${andList(kinds.filter((k) => y[k] < x[k] - 1e-9))} into ${andList(kinds.filter((k) => y[k] > x[k] + 1e-9))}`;
  };
  const you = plan.you;
  const turnsAt = (age: number) => `the year ${who(you.name)} ${verb(you.name, 'turn')} ${age}`;
  const pathName = a.mixPlan === 'vanguard'
    ? `This follows Vanguard’s Target Retirement path, tied to ${turnsAt(VANGUARD_PATH.targetAge)} (${you.birthYear + VANGUARD_PATH.targetAge}).`
    : a.mixPlan === 'fidelity'
      ? 'This is the mix Fidelity’s FI Planner uses.'
      : `This is the path you entered: ${mixLabel(a.allocation)} at first, ` + (a.shiftStartAge === a.shiftEndAge
        ? `switching to ${mixLabel(a.laterAllocation)} in ${turnsAt(a.shiftStartAge)}.`
        : `moving to ${mixLabel(a.laterAllocation)} in equal steps, one in each year ${nameIs(you.name)} ${a.shiftStartAge} to ${a.shiftEndAge}.`);
  // A target-date fund makes Vanguard's moves itself; only someone holding separate funds makes them by hand.
  const fundNote = a.mixPlan === 'vanguard'
    ? ` A target-date fund dated near ${you.birthYear + VANGUARD_PATH.targetAge}, ${turnsAt(VANGUARD_PATH.targetAge)}, follows about this path and ` +
      'makes these moves for you; with separate stock and bond funds, you make them yourself.'
    : '';
  const vanguardEnd = VANGUARD_PATH.points[VANGUARD_PATH.points.length - 1].years;
  const pathEnd = a.mixPlan === 'vanguard'
    ? `This is where Vanguard’s Target Retirement path ends, ${vanguardEnd} years after ${who(you.name)} ${verb(you.name, 'turn')} ${VANGUARD_PATH.targetAge}.`
    : pathName;
  const drift = 'Drifting toward more stocks raises the risk in a bad market; toward less lowers growth.';
  // Only a brokerage account pays tax on a move (D97); the others are named only when the household has them (D93).
  const taxFree = [has.pretax && '401(k)/IRA', has.roth && 'Roth', has.hsa && 'HSA'].filter((k): k is string => !!k);
  const inside = taxFree.length ? ` Inside the ${andList(taxFree)}, moving costs no tax.` : '';
  // A household with no brokerage account today can still get one: the engine saves Social Security and required
  // withdrawals received while working (D49), and deposits unspent required withdrawals and dated income (D17, D30).
  // The year money can first arrive, and what it is; a move can tax it only in a later year, once it has grown.
  const sources: { year: number; what: string }[] = [];
  if (!has.taxable) {
    const rmdYears = people.filter((p) => p.hasPretax).map((p) => Math.max(p.rmd, plan.startYear));
    if (rmdYears.length) sources.push({ year: Math.min(...rmdYears), what: 'unspent required withdrawals' });
    const ssWorking = people.map((p) => Math.max(p.claim, plan.startYear)).filter((y) => y < retireYear);
    if (ssWorking.length) sources.push({ year: Math.min(...ssWorking), what: 'Social Security received while you still work' });
    for (const it of plan.datedItems) {
      if (it.direction === 'income') sources.push({ year: Math.max(timingYear(plan, it.start), plan.startYear), what: it.label });
    }
  }
  /**
   * The tax on the moves through year `upTo` (" Each move sells …"). Without a brokerage account: a conditional
   * sentence when money can reach one before `upTo`, else "".
   */
  const moveTax = (moves: 'each' | 'this', retired: boolean, upTo: number) => {
    const Each = moves === 'each' ? 'Each' : 'This';
    if (!has.taxable) {
      const can = sources.filter((s) => s.year < upTo).map((s) => s.what);
      if (!can.length) return '';
      const either = can.length === 1 ? can[0] : `${can.slice(0, -1).join(', ')} or ${can[can.length - 1]}`;
      return ` If money from ${either} goes into a brokerage account by then, ${Each.toLowerCase()} move sells some of that too, and the results count the capital-gains tax on it.${inside}`;
    }
    return ` ${Each} move sells some of what the brokerage account holds; the results already count the capital-gains tax on that sale` +
      (retired
        ? ` in ${moves === 'each' ? 'the' : 'this'} year’s tax bill, so set it aside with the rest of the tax.`
        : ', paid from the brokerage account itself.') + inside;
  };
  /** A single move in `year`: the switch, or the last step of a longer shift. */
  const moveAction = (year: number) => (singleSwitch
    ? `Move every invested account from ${mixOf(year - 1)} to ${mixOf(year)} this year (cash stays cash).`
    : `Move every invested account to ${mixOf(year)} this year, the last step of the shift (cash stays cash).`) +
    ' From now on, put every invested account back to that mix once a year.';

  // A mix that moves before retirement: a phase in the first year it moves (never the plan's first year).
  if (firstMove !== undefined && lastMove !== undefined && firstMove < retireYear) {
    const P = firstMove;
    const underWay = pathYears !== null && pathYears.first < P;
    const shifting = underWay ? 'Keep shifting the asset mix' : 'Start shifting the asset mix';
    let title: string;
    let action: string;
    let each = true;
    if (lastMove >= retireYear) {
      title = shifting;
      action = `Each year until you retire, move every invested account to that year’s mix (cash stays cash): ${mixOf(P)} in ${P}, then ` +
        `${perYear(movesIn(P + 1, retireYear))} ${direction(P - 1, retireYear)}, to ${mixOf(retireYear)} in ${retireYear}, the year you retire.`;
    } else if (lastMove === P) {
      title = singleSwitch ? 'Switch to a new asset mix' : 'Last change to the asset mix';
      action = moveAction(P);
      each = false;
    } else {
      title = shifting;
      action = `Each year from ${P} through ${lastMove}, move every invested account to that year’s mix (cash stays cash): ${mixOf(P)} in ${P}, then ` +
        `${perYear(movesIn(P + 1, lastMove))} ${direction(P - 1, lastMove)}, to ${mixOf(lastMove)} in ${lastMove}. ` +
        'From then on, put every invested account back to that mix once a year.';
    }
    const before = underWay
      ? `The shift is already under way: the results assume your accounts hold ${mixOf(plan.startYear)} in ${plan.startYear}, the plan’s first year.`
      : `Until now the results assume ${mixOf(P - 1)} in every account.`;
    const step: Step = {
      action,
      why: `${before} ${pathName}${fundNote} ${each ? 'The results assume that year’s mix in every account each year.' : 'The results assume this mix in every account from now on.'}` +
        moveTax(each ? 'each' : 'this', false, Math.min(lastMove, retireYear)),
    };
    const same = phases.find((ph) => ph.year === P); // Coast's stop year: one phase per year (the timeline keys on it)
    if (same) {
      same.title += ` · ${title}`;
      same.steps.push(step);
    } else {
      phases.push({ year: P, title, ages: ages(P), steps: [step] });
      phases.sort((x, y) => x.year - y.year);
    }
  }

  // Retirement: the yearly routine, as it stands on the day you retire.
  const steps: Step[] = [];
  const recurring = plan.datedItems.filter((it) => it.direction === 'expense' && it.frequency === 'recurring' &&
    (!it.end || timingYear(plan, it.end) >= retireYear));
  const extras = plan.datedItems.length ? ' and your dated items' : '';
  steps.push({
    action: `Live on about ${money(detail.scenario.baseSpending)} a year plus healthcare${extras}, in today’s dollars.`,
    why: 'This is the budget the results are based on. Raise it with inflation each year: every figure here is in today’s dollars. ' +
      'Spending more than this, especially in the first years or in a bad market, is what runs money out early.',
  });
  for (const it of recurring) {
    steps.push({
      action: `Plan for ${it.label} about every ${Math.max(1, it.everyYears ?? 1)} years, about ${money(it.amount)} each time.`,
      why: 'It is part of the spending the results assume, paid in the same order as everything else.',
    });
  }
  if (has.hsa) {
    steps.push({
      action: 'Pay medical bills from the HSA before any other account.',
      why: 'That money is never taxed when it goes to healthcare, and no other account works that way.',
    });
  }
  const buying = people.filter((p) => p.medicare > retireYear && p.preMedicare > 0);
  if (buying.length) {
    const cost = hcIn(buying.reduce((s, p) => s + p.preMedicare, 0), retireYear);
    const until = buying.length === 2 ? 'until each of you turns 65' : `until ${who(buying[0].name)} ${verb(buying[0].name, 'turn')} 65`;
    steps.push({
      action: `Buy your own health insurance ${until}, when Medicare takes over.`,
      why: `The plan budgets about ${money(cost)} a year for it in ${retireYear}, in today’s dollars` +
        (a.healthcareInflation > 0 ? ` (it rises ${pct1(a.healthcareInflation)} a year faster than prices, so look at this again each year)` : '') +
        ', at full price with no subsidy, on top of your regular spending.',
    });
  }
  if (converting) {
    const top = bracketTop(fill);
    const under = under60At(retireYear);
    let why = 'This money is taxed whenever it comes out. Taking some every year while your income is low means it is taxed at the lowest rate, ' +
      `instead of piling up and being taxed at a higher rate later. For ${RULES_YEAR} the top of the bracket is about ${money(top + FEDERAL.standardDeduction)} ` +
      `of income for a married couple (the ${money(FEDERAL.standardDeduction)} standard deduction plus the ${money(top)} bracket), minus any other income you ` +
      'already expect that year, such as a pension, interest or the taxable part of Social Security. Look the numbers up each year; the IRS ' +
      'raises them with inflation.';
    if (people.every((p) => p.hasPretax)) {
      why += sameAge
        ? ` Start with ${whose(older.name)} account; then ${yours(younger.name)}.`
        : ` Start with ${whose(older.name)} account, the older of you, because it opens up penalty-free first; then ${yours(younger.name)}.`;
    }
    steps.push({ action: `Each January, take money out of the 401(k)/IRA up to the top of the ${fill}% tax bracket.`, why });
    const convertWhy = 'Ask the brokerage for a “Roth conversion”. Spending that money would cost a 10% penalty; converting it costs only the income tax, ' +
      'and after 5 years it can be spent with no tax or penalty at all.';
    if (under.length === 2) {
      steps.push({ action: 'Don’t spend it while you are both under 59½: move it straight into a Roth IRA and write down the year.', why: convertWhy });
    } else if (under.length === 1 && under[0].hasPretax) {
      const p = under[0];
      const other = p === people[0] ? people[1] : people[0];
      steps.push({
        action: `Don’t spend the part taken from ${whose(p.name)} 401(k)/IRA while ${nameIs(p.name)} under 59½: move it straight ` +
          `into ${whose(p.name)} Roth IRA and write down the year.` +
          (other.hasPretax ? ` Spend what you need from ${whose(other.name)} withdrawal and convert only the leftover.` : ''),
        why: convertWhy,
      });
    } else {
      steps.push({
        action: 'Spend what you need from it and move whatever is left over into a Roth IRA.',
        why: 'A “Roth conversion”: the money grows tax-free from then on, and it shrinks the withdrawals the IRS will require later.',
      });
    }
  }
  // Only someone under 60 who has a 401(k)/IRA or Roth is limited in what they can spend.
  const underWithMoney = under60At(retireYear).filter((p) => p.hasPretax || p.hasRoth);
  const anyUnder60 = underWithMoney.length > 0;
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
  if (anyUnder60) {
    const under = underWithMoney;
    const whoUnder = under.length === 2 ? 'you are' : nameIs(under[0].name);
    const account = under.length === 2 ? 'the 401(k)/IRA' : `${whose(under[0].name)} 401(k)/IRA`;
    const next = under.some((p) => p.hasPretax) ? `${account} is next, then Roth growth, both` : 'Roth growth is next,';
    items.push(`If those run out while ${whoUnder} under 59½, ${next} with the 10% penalty. The results above count how often that happens. ` +
      '(The IRS has exceptions, such as the Rule of 55, that the plan doesn’t count on.)');
  }
  steps.push({
    action: `For everything else you need this year, take money in this order, moving to the next account only when the one before is empty${
      has.hsa ? ' (the HSA stays for medical bills)' : ''}:`,
    items,
    why: 'Cash and brokerage cost the least tax to spend. Roth money grows tax-free, so it is worth the most if it is left alone the longest.',
  });
  const collecting = people.filter((p) => p.claim < retireYear);
  if (collecting.length) {
    const names = collecting.length === 2 ? 'You both already collect' : `${cap(who(collecting[0].name))} already ${verb(collecting[0].name, 'collect')}`;
    steps.push({ action: `${names} Social Security.`, why: 'It covers part of each year, and the accounts cover the rest.' });
  }
  // Milestones in the retirement year itself are inserted here, after Social Security and before the tax (`add` below).
  const atRetire = steps.length;
  steps.push({
    action: 'Set aside the tax on what you take out, and pay it with your return in April or in four estimated payments during the year.',
    why: 'The money you take out has to cover the tax on it too; the plan’s withdrawals include it.',
  });
  // The mix from the retirement year on (D97): fixed, one move this year, a later switch, or a move every year.
  const after = lastMove !== undefined ? movesIn(retireYear + 1, lastMove) : [];
  const retireMove = moveYears.includes(retireYear);
  if (lastMove === undefined || lastMove < retireYear) {
    steps.push({
      action: `Once a year, put every invested account back to ${mixOf(retireYear)} (cash stays cash).`,
      why: (a.mixPlan === 'fidelity'
        ? `${pathName} The results assume this mix in every account, every year.`
        : pathYears !== null && pathYears.last <= retireYear
          ? `${pathName} The move to this mix is done: the results assume it in every account, every year from now on.`
          : 'The results assume this mix in every account, every year.') + ` ${drift}`,
    });
  } else if (lastMove === retireYear) {
    steps.push({
      action: moveAction(retireYear),
      why: `${pathName}${fundNote} The results assume this mix in every account, every year from now on.${moveTax('this', true, retireYear)} ${drift}`,
    });
  } else if (!retireMove && after.length === 1) {
    steps.push({
      action: `Once a year, put every invested account back to ${mixOf(retireYear)} (cash stays cash), until the switch to ${mixOf(lastMove)} in ${lastMove}.`,
      why: `${pathName} The results assume this mix in every account until then. ${drift}`,
    });
  } else {
    const from = retireMove || after[0] === retireYear + 1 ? '' : ` from ${after[0]}`;
    const starting = retireMove && firstMove === retireYear ? ' starting this year,' : ''; // no phase before it says so
    const shown = after.length <= 8 ? after : [...after.slice(0, 5), after[after.length - 1]];
    const noCash = shown.every((y) => mixPercents(mixIn(y))[2] === 0); // then the list leaves cash out, as mixLabel does
    const byYear = shown.map((y) => `${y}: ${mixPercents(mixIn(y)).slice(0, noCash ? 2 : 3).join(' / ')}`);
    if (shown.length < after.length) byYear.splice(5, 0, '…');
    steps.push({
      action: `Once a year,${starting} move every invested account to that year’s mix (cash stays cash): ${mixOf(retireYear)} this year, then ` +
        `${perYear(after)} ${direction(retireYear, lastMove)}${from} through ${lastMove}, and ${mixOf(lastMove)} from then on.`,
      why: `${pathName}${fundNote} Mix by year (stocks / bonds${noCash ? '' : ' / cash'}): ${byYear.join(' · ')}. The results assume that year’s mix in every account.` +
        `${moveTax('each', true, lastMove)} ${drift}`,
    });
  }
  steps.push({
    action: 'Once a year, enter your real balances here and recalculate.',
    why: 'Markets will not follow any single simulated path. If the chance your money lasts falls, spending is the lever to adjust early.',
  });
  const retirePhase: Phase = { year: retireYear, title: 'You retire', ages: ages(retireYear), steps };
  phases.push(retirePhase);

  // Milestones after retirement, grouped by year (D93). Those in the retirement year join the routine. Earlier ones are
  // already in it (Medicare in the insurance step, Social Security in "already collect", dated items in the budget)
  // and are dropped; a required withdrawal already due is passed in as the retirement year.
  const later = new Map<number, { title: string; steps: Step[] }[]>();
  const retireSteps: Step[] = [];
  const retireTitles: string[] = [];
  const add = (year: number, title: string, steps: Step[]) => {
    if (year < retireYear || year > endYear) return;
    if (year === retireYear) {
      retireSteps.push(...steps);
      retireTitles.push(title);
      return;
    }
    const list = later.get(year) ?? [];
    list.push({ title, steps });
    later.set(year, list);
  };
  for (const p of people) {
    const other = p === people[0] ? people[1] : people[0];
    // Turning 60 in the retirement year itself needs no step: the routine's withdrawal order already treats the money as open.
    if ((p.hasPretax || p.hasRoth) && p.sixty > retireYear) {
      const what = p.hasPretax && p.hasRoth ? `401(k)/IRA and all of ${whose(p.name)} Roth` : p.hasPretax ? '401(k)/IRA' : 'Roth, growth included,';
      const list: Step[] = [{
        action: `${cap(whose(p.name))} ${what} can now be used with no penalty.`,
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
        ? ` Health insurance for ${who(p.name)} goes from about ${money(hcIn(p.preMedicare, p.medicare))} to about ` +
          `${money(hcIn(p.medicareCost, p.medicare))} a year in ${p.medicare}, in today’s dollars.`
        : ''),
    }];
    // Once, with the younger of you; for a couple born the same year, with the second of the two.
    if (has.hsa && (other.medicare < p.medicare || (other.medicare === p.medicare && p === people[1]))) {
      med.push({
        action: 'HSA money can now also be spent on anything else.',
        why: 'Once you are both 65 it is taxed like 401(k)/IRA money, with no penalty. The plan still uses it for medical bills first.',
      });
    }
    add(p.medicare, `${p.name} ${verb(p.name, 'turn')} 65`, med);

    let ssWhy = '';
    // This person's benefit for a full year after the prorated claim year (D25, D26): their own benefit at their
    // claim age plus the spousal top-up (half the other's full benefit, less their own), which the engine pays only
    // once the other spouse has claimed too.
    const i = p === people[0] ? 0 : 1;
    const share = payableShare(p.claim + 1, a.ssTrustFund);
    const own = detail.pia[i] * 12 * ownClaimFactor(p.birthYear, p.claimAge);
    const excess = Math.max(0, 0.5 * detail.pia[1 - i] - detail.pia[i]) * 12;
    const spousal = excess * spousalClaimFactor(p.birthYear, Math.min(70, Math.max(p.claimAge, other.claim - p.birthYear)));
    const otherFiled = other.claim <= p.claim + 1;
    const total = (own + (otherFiled ? spousal : 0)) * share;
    const quoted = total >= MIN_SHOWN;
    if (quoted) {
      ssWhy += `From then on ${whose(p.name)} benefit adds about ${moneyShort(total)} a year in today’s dollars, so you take that much less from the accounts.`;
    }
    if (!otherFiled && spousal * share >= MIN_SHOWN) {
      ssWhy += ` A spousal top-up of about ${moneyShort(spousal * share)} a year comes once ${who(other.name)} ${verb(other.name, 'claim')} too.`;
    }
    if (converting) ssWhy += ` It also counts as income, so there is less room under the ${fill}% bracket and the yearly 401(k)/IRA withdrawal shrinks.`;
    if (share < 1) {
      ssWhy += ` The ${quoted ? 'amount' : 'plan'} already assumes only ${pct(share)} of the full benefit is paid by then, in case Congress does not fix the shortfall ` +
        'in Social Security’s trust fund. If it does, you will get more.';
    }
    add(p.claim, `${p.name} ${verb(p.name, 'start')} Social Security (age ${p.claimAge})`, [{
      action: `Apply for Social Security up to 4 months before ${who(p.name)} ${verb(p.name, 'turn')} ${p.claimAge}.`,
      why: ssWhy.trim() || undefined,
    }]);

    // A required withdrawal already due on the day you retire is part of the routine: it is taken every year.
    if (p.hasPretax) {
      add(Math.max(p.rmd, retireYear), p.rmd < retireYear ? `${whose(p.name)} required withdrawals` : `${p.name} ${verb(p.name, 'turn')} ${p.rmdAge}`, [{
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
  for (const it of plan.datedItems) datedPhases(plan, it, retireYear, converting ? fill : null, add);
  // The mix's last move after retirement (D97); `add` joins it to a milestone in the same year.
  if (lastMove !== undefined && lastMove > retireYear) {
    add(lastMove, singleSwitch ? 'Switch to a new asset mix' : 'Last change to the asset mix', [{
      action: moveAction(lastMove),
      why: `${pathEnd}${fundNote} The results assume this mix in every account, every year from now on.${moveTax('this', true, lastMove)}`,
    }]);
  }
  steps.splice(atRetire, 0, ...retireSteps);
  retirePhase.title = ['You retire', ...retireTitles].join(' · ');
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
  const ranOut = detail.medianPath.find((r) => !r.working && r.shortfall > RUN_OUT_SHORTFALL)?.year;
  for (const phase of phases) {
    if (phase.year < retireYear || (ranOut !== undefined && phase.year >= ranOut)) continue;
    const r = detail.medianPath.find((x) => x.year === phase.year);
    if (r && !r.working) phase.example = exampleLine(r);
  }
  return { phases };
}

/**
 * A dated item's milestones after retirement (D17): income starting or ending, a one-time cost, an ongoing cost
 * starting or ending. `add` drops those before retirement (already part of the budget); an ongoing item that ends
 * before retirement never reaches it, so it gets no "ends" step.
 */
function datedPhases(plan: Plan, it: DatedItem, retireYear: number, fill: string | null, add: (year: number, title: string, steps: Step[]) => void) {
  const start = timingYear(plan, it.start);
  const last = it.frequency === 'ongoing' && it.end ? timingYear(plan, it.end) : null;
  const ends = last !== null && last >= retireYear ? last + 1 : null;
  const fixed = it.fixedDollars ? ' (a fixed amount, so it buys less each year)' : '';
  const began = it.fixedDollars ? ' (in the dollars of when it began)' : '';
  if (it.direction === 'income') {
    const taxed = it.taxable !== false;
    const every = Math.max(1, it.everyYears ?? 1);
    const each = it.frequency === 'oneTime' ? '' : it.frequency === 'recurring' && every > 1 ? ` every ${every} years` : ' a year';
    add(start, `${it.label} ${it.frequency === 'oneTime' ? 'arrives' : 'starts'}`, [{
      action: `${it.label}: about ${money(it.amount)}${each}${fixed}. Whatever you don’t need goes into the brokerage account.`,
      why: taxed
        ? `It is taxed as income${fill ? `, so it uses up room under the ${fill}% bracket and the yearly 401(k)/IRA withdrawal shrinks` : ''}.`
        : 'It is not taxed, so it goes straight to savings or spending.',
    }]);
    if (ends !== null) {
      add(ends, `${it.label} ends`, [{
        action: `${it.label} stops: about ${money(it.amount)} a year${began} less coming in.`,
        why: 'The plan takes that much more from the accounts from now on.',
      }]);
    }
    return;
  }
  if (it.frequency === 'oneTime') {
    add(start, `Pay for ${it.label}`, [{
      action: `Pay for ${it.label}: about ${money(it.amount)}${fixed}.`,
      why: 'It comes out in the same order as any other spending: cash first, then brokerage, and so on.',
    }]);
    return;
  }
  if (it.frequency !== 'ongoing') return;
  add(start, `${it.label} starts`, [{
    action: `${it.label}: about ${money(it.amount)} a year more to cover${it.fixedDollars ? ' (a fixed amount, so it costs less each year in today’s dollars)' : ''}.`,
    why: 'It comes out in the same order as any other spending: cash first, then brokerage, and so on.',
  }]);
  if (ends !== null) {
    add(ends, `${it.label} ends`, [{
      action: `${it.label} is paid off: about ${money(it.amount)} a year${began} less to cover.`,
      why: 'The plan takes that much less from the accounts from now on.',
    }]);
  }
}

/** "In the typical market of the table below, 2041: spent $92K; $12K from cash; …" */
export function exampleLine(r: YearRecord): string {
  const parts: string[] = [`spent ${moneyShort(r.spending)}`];
  const put = (amount: number, label: string) => { if (amount >= MIN_SHOWN) parts.push(`${moneyShort(amount)} ${label}`); };
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
