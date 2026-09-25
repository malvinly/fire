// Hover/focus help for every input (the "?" next to a label). Written for someone who knows 401(k)/Roth/HSA
// basics but isn't a finance expert. Keep each entry accurate to how the engine uses the value.

import { TRUST_FUND_DEFAULT } from '../data/rules';
import { DATA_VERSIONS } from '../engine/assumptions';
import { CHUBBY_SPENDING_FACTOR } from '../engine/defaults';
import { MARKET } from '../engine/returns';

const tf = TRUST_FUND_DEFAULT;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const HELP = {
  // People
  name: 'Used only for labels on screen.',
  birthYear:
    'Sets your age in each year. Penalty-free 401(k)/IRA withdrawals start the calendar year you turn 60, and Medicare-age healthcare costs the year you turn 65.',
  birthMonth: 'Used only to time your first Social Security payment.',
  salary:
    'Yearly pay before taxes and deductions, including a regular bonus. Used to project your Social Security benefit, to show your savings rate, and to tax any Social Security received while you still work. It does not set your spending or contributions. Enter 0 if this person doesn’t work.',
  startYear:
    'Normally the current year. Enter balances as of about today — the model treats them as January 1 and adds a full year of contributions.',

  // Balances
  pretaxBalance:
    'Total now in all traditional (not Roth) retirement accounts: 401(k), 403(b), 457(b), traditional/rollover IRA, SEP. Check your latest statements.',
  rothBalance: 'Total now in all Roth accounts, including growth. Check your latest statements.',
  rothBasis:
    'The part of your Roth balance you put in yourself (not growth). You can take it out anytime without tax or penalty. Add up your Roth IRA contributions over the years (your broker lists them), plus Roth conversions done 5+ years ago. If unsure, enter 0 — the cautious choice.',
  hsaBalance: 'Your current HSA balance. The model pays healthcare costs from the HSA first.',
  taxable:
    'Regular (non-retirement) investment accounts: brokerage, mutual funds, vested company stock. Invested with the same stock/bond mix as everything else. Its dividends and interest are taxed every year.',
  taxableBasis:
    'What you originally paid for those investments; only growth above it is taxed when you sell. Your broker’s positions page shows it as “cost basis” or “total cost”. If unsure: the full balance ignores tax on gains (a bit optimistic); 0 taxes everything (pessimistic).',
  cash: 'Checking, savings, money market and CDs. Earns short-term Treasury rates (not stock returns), taxed every year, and is spent first when you retire.',

  // Contributions (per person)
  pretaxContribution:
    'What you put into traditional 401(k)/403(b)/IRA per year, not counting the employer match — pay stub amount × paychecks per year. Together with Roth it’s capped at the IRS limit each year; anything above the limit is dropped, not saved elsewhere.',
  employerMatch: 'What your employer adds to your 401(k) per year (benefits portal or pay stub). It goes into the pre-tax balance.',
  rothContribution: 'What you put into Roth 401(k) and Roth IRA per year, including backdoor Roth. Adds to the part you can withdraw anytime.',
  hsaContribution: 'Yearly HSA contributions, including anything your employer adds. The household total is capped at the family limit.',
  // Contributions (household)
  taxableContribution: 'New money you add to non-retirement investment accounts each year. Don’t count reinvested dividends.',
  cashContribution: 'New money you add to cash savings each year. Enter 0 if your emergency fund is already where you want it.',

  // Spending
  currentSpending:
    'Everything your household spends in a year, including mortgage and any healthcare you pay yourself; leave out savings and taxes taken from your paycheck. A year of bank/card statements or a budgeting app is the easiest source. On its own it doesn’t change results — it feeds the “Use Fidelity default” button.',
  traditionalSpending:
    'What you expect to spend per year once retired, in today’s dollars and before taxes (the model adds taxes). Leave out healthcare and dated items — they’re added on top. Coast FIRE also uses this after you stop working. If unsure, use the Fidelity default button.',
  chubbySpending: `A more comfortable retirement budget, with the same rules as Traditional. The default is ${pct(CHUBBY_SPENDING_FACTOR - 1)} above today’s spending. Clear it to skip the Chubby result.`,
  coastAge:
    'If you stopped saving now, the age at which you’d both finally stop working. Until then your paychecks cover all spending; after that, Traditional spending applies. Default 65.',

  // Healthcare
  preMedicare:
    'Yearly premiums plus out-of-pocket costs for an ACA marketplace plan at full price (subsidies aren’t modeled). Premiums rise with age, so use your average for the years between retiring and 65: the 2026 US average benchmark silver premium is about $12,500/yr at 55, $16,000 at 60 and $17,500 at 64, plus $2–3k out-of-pocket. Prices vary a lot by state, so browse plans on healthcare.gov for your age and zip code. Only counts in years you’re retired and under 65.',
  medicare:
    'Yearly Medicare Part B + Part D + Medigap (or Advantage) premiums plus out-of-pocket costs. 2026 reference: about $7,500 in all — Part B $2,435, Medigap Plan G about $2,650 at 65, Part D about $400, plus $1,500–2,000 for deductibles, copays, dental and vision. medicare.gov’s plan finder gives prices. Only counts once you’re retired.',

  // Social Security
  ssMode:
    '“Earnings record” computes your benefit from your real work history plus your salary until your retirement date — better for early retirement. “Statement estimate” uses one fixed number from your SSA statement.',
  claimAge:
    'Any age 62–70. Claiming before full retirement age (67 for most people) lowers your monthly check for life; waiting until 70 raises it. The spousal top-up is included automatically.',
  manualPia:
    'The “at full retirement age” monthly amount on your statement (ssa.gov → my Social Security). It assumes you keep working until you claim, so it’s probably too high if you retire early — the earnings record option avoids this. The model adjusts it for your claim age and the trust-fund cut.',
  earnings:
    'Sign in at ssa.gov/myaccount and open your earnings record. Copy the table (year and taxed Social Security earnings) and paste it here, or paste the statement XML download, then press Import. Future years are filled in from your salary until retirement.',

  // Dated items
  itemLabel: 'Just for you, e.g. “Mortgage P&I” or “New car”.',
  itemType:
    'Expense = money going out. Income = money coming in (home sale, pension, part-time work, inheritance). Income is taxed as ordinary income unless you untick “Taxed as income”, so enter it before tax.',
  itemFrequency: 'Every year, one time, or every N years (e.g. a car every 10 years).',
  itemAmount: 'The amount each time it happens — per year for “Every year”, per event otherwise. Today’s dollars, unless “Fixed dollars” is ticked.',
  itemStart:
    'When it happens or begins, as a calendar year or someone’s age. An ongoing cost you already pay today comes out of your paycheck until you retire. Other items before retirement are paid from your cash and brokerage accounts (income is added to them after tax), with tax on any gains. A cost those accounts can’t cover counts as running out of money.',
  itemEnd: 'The last year it applies. “Plan end” means it never stops.',
  itemEvery: 'e.g. 10 for a car every 10 years, starting in the Starts year.',
  itemWhen: 'The calendar year, or that person’s age that year.',
  itemTaxable:
    'Ticked: the model adds this money to that year’s taxable income (federal and state), on top of your withdrawals and Roth conversions. Right for a pension, part-time or consulting pay, rental profit, annuity payments or inherited IRA withdrawals. Enter the amount before tax. Untick for money that isn’t income: selling your home (a married couple usually owes no tax on up to $500,000 of gain), a cash gift or an inheritance of cash.',
  itemFixed:
    'Tick for payments that stay the same in actual dollars, like a fixed-rate mortgage or a fixed pension — their real value shrinks each year with inflation. Leave unticked for costs that rise with prices (property tax, insurance).',

  // Assumptions
  endAge: 'Your money must not run out before the younger of you reaches this age. Fidelity uses 96. Higher is safer and pushes your dates later.',
  targetSuccess:
    'The share of simulated markets in which your money must last. 90% is Fidelity’s standard (it holds up in a “significantly below average” market). Higher is safer but means later dates and bigger numbers.',
  stocks: 'Share of every invested account held in stocks, US or international, reset to this mix each year (not your cash account). International funds such as VXUS are simulated as US stocks. Default 70% (Fidelity).',
  bonds: 'Share held in 10-year US Treasury bonds; the rest is cash. Default 25%.',
  fees: 'Average yearly fund cost plus any advisor fee. Each fund’s page lists its “expense ratio”; broad index funds are about 0.03–0.2%. Default 0.10%.',
  wageGrowth: 'How much faster than inflation your salary and contributions grow each year until you retire. Default 1.5% (Fidelity).',
  healthcareInflation: 'How much faster than general prices healthcare costs rise each year. Default 1.5%.',
  stateTax: 'A flat rate on your taxable retirement income, not counting Social Security. Use the rate of the state you expect to retire in (0 for no-income-tax states). Default 5%.',
  bracketFill:
    'Each retired year, the model takes 401(k)/IRA money up to the top of this federal tax bracket. What you don’t spend moves to Roth (a “Roth conversion”) and can be spent tax- and penalty-free 5 years later. That only helps you retire early if the 5 years end before the calendar year its owner turns 60. After 60, conversions mainly lower later required withdrawals and taxes, but they cost tax now. Off = no conversions. Default 10%.',
  ssWageGrowth:
    'How much faster than prices the national average wage grows. Social Security benefits follow the national wage level in the year you turn 60, so faster wage growth means higher benefits in today’s dollars. Default 0%, the cautious choice, which matches statement estimates. At 1.1% (the Social Security Trustees’ intermediate assumption) a benefit is about 27% higher for someone now 40 and 14% for someone now 50.',
  paths: 'How many simulated markets to test. More gives steadier results but takes longer. Default 10,000 (500 to 50,000).',
  blockLength:
    'Each simulated market is stitched together from random stretches of real history this many years long, so crashes and recoveries stay together. Default 5.',
  seed: 'Any whole number. The same number always gives the same results; change it to see how much results wobble from chance alone.',
  tfStart: `The year the Social Security trust fund is projected to run short. Benefits are paid in full before then. ${tf.startYear} per the ${DATA_VERSIONS.trusteesReport} Trustees Report.`,
  tfStartPct: `Share of scheduled benefits paid when the cut starts. Default ${pct(tf.startPct)}. Set this and “Share paid from then on” to 100% to assume no cut.`,
  tfEnd: `The share falls steadily until this year, then stays flat. Default ${tf.endYear}.`,
  tfEndPct: `Share of benefits paid from that year on. Default ${pct(tf.endPct)}. Set both shares to 0% to leave Social Security out entirely (Fidelity FI Planner style).`,
} as const;

/** Shared explanation of the two ways results are tested. */
export const METHODS_HELP =
  `Simulated markets: thousands of made-up market histories (10,000 by default), each stitched together from random multi-year stretches of real US history since ${MARKET.firstYear}. Real past markets: your plan replayed through every actual stretch of history. Your result must pass both, so the lower number is the one that counts.`;

export const SUCCESS_HELP =
  'The share of markets in which you never run out of money before the younger of you reaches the “plan until” age (96 by default). It is not a guarantee: in the other markets savings run out, usually late in retirement, leaving Social Security to live on. The detail view below says when.';
