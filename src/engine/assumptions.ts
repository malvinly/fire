// Builds the "How this works" content from the plan actually being run. Values come from the plan and the
// data tables; the explanatory text is hand-written and must be reviewed on each data update
// (docs/UPDATE_DATA_PROMPT.md). Each row: what, the value used, default or yours, why, and the source.

import { FEDERAL, LIMITS, RULES_YEAR, SOCIAL_SECURITY, rmdStartAge } from '../data/rules';
import { CHUBBY_SPENDING_FACTOR, DEFAULT_ASSUMPTIONS, EXAMPLE_CLAIM_AGE, FIDELITY_SPENDING_FACTOR, chubbyDefaultSpending, datedExpensesToday, fidelityDefaultSpending } from './defaults';
import { MARKET } from './returns';
import type { Plan } from './types';

export interface AssumptionRow {
  group: string;
  label: string;
  value: string;
  status: 'default' | 'changed' | 'fixed';
  why: string;
  source?: { label: string; url?: string };
  decision?: string;
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;

/**
 * Saved with every session; a session whose copy differs is flagged "recalculate" (src/ui/sessions.ts).
 * `engine`: bump whenever a code change alters results for the same inputs.
 */
export const DATA_VERSIONS = {
  marketThrough: MARKET.lastYear,
  marketGenerated: MARKET.generated,
  rulesYear: RULES_YEAR,
  wageIndexYear: SOCIAL_SECURITY.awiLatestYear,
  trusteesReport: 2026,
  engine: 4,
};

export function describeAssumptions(plan: Plan): AssumptionRow[] {
  const a = plan.assumptions;
  const d = DEFAULT_ASSUMPTIONS;
  const st = (same: boolean): AssumptionRow['status'] => (same ? 'default' : 'changed');
  const fid = { label: 'Fidelity FI Planner methodology', url: 'https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/FI_Planner_Methodology.pdf' };
  const tf = a.ssTrustFund;
  const alloc = a.allocation;
  const allocSame = alloc.stocks === d.allocation.stocks && alloc.bonds === d.allocation.bonds && alloc.cash === d.allocation.cash;
  const tfSame = JSON.stringify(tf) === JSON.stringify(d.ssTrustFund);

  return [
    // Confidence
    { group: 'Confidence', label: 'Success target', value: pct(a.targetSuccess, 0), status: st(a.targetSuccess === d.targetSuccess),
      why: 'A plan "succeeds" if money never runs out. 90% = Fidelity\'s "significantly below average market" standard.', source: fid, decision: 'D2' },
    { group: 'Confidence', label: 'Plan ends when the younger spouse reaches', value: `age ${a.endAge}`, status: st(a.endAge === d.endAge),
      why: 'Fidelity plans to age 96. Using the younger spouse is the longest (safest) horizon.', source: fid, decision: 'D2' },
    { group: 'Confidence', label: 'Market paths', value: `${a.paths.toLocaleString()} simulated markets + every real stretch of history since ${MARKET.firstYear}`, status: st(a.paths === d.paths),
      why: 'Simulated markets are stitched together from random multi-year stretches of real history (a “block bootstrap”). Each FIRE result must pass both the simulated and the real past markets; the lower result counts.', decision: 'D3' },
    { group: 'Confidence', label: 'Simulated markets: chunk size', value: `${a.blockLength} years`, status: st(a.blockLength === d.blockLength),
      why: 'Random multi-year chunks of real history keep crashes, inflation spells and recoveries together.', decision: 'D4' },
    { group: 'Confidence', label: 'Quick-search sample', value: `${a.searchPaths.toLocaleString()} markets (final answers re-checked on all)`, status: st(a.searchPaths === d.searchPaths),
      why: 'Keeps a full recalculation to seconds.', decision: 'D5' },
    { group: 'Confidence', label: 'Random seed', value: String(a.seed), status: st(a.seed === d.seed),
      why: 'Any number; the same number always gives the same results.', decision: 'D4' },

    // Markets
    { group: 'Markets', label: 'Asset mix', value: `${pct(alloc.stocks, 0)} stocks / ${pct(alloc.bonds, 0)} bonds / ${pct(alloc.cash, 0)} cash, reset to this mix each year`, status: st(allocSame),
      why: "Fidelity's FI Planner mix. Applies to every invested account.", source: fid, decision: 'D8' },
    { group: 'Markets', label: 'Fund fees', value: pct(a.feeRate, 2), status: st(a.feeRate === d.feeRate),
      why: 'Subtracted from returns every year.', decision: 'D8' },
    { group: 'Markets', label: 'Historical data', value: `${MARKET.firstYear}–${MARKET.lastYear}, January to January`, status: 'fixed',
      why: 'Stocks: S&P 500 total return. Bonds: 10-year Treasury. Inflation: CPI.', source: { label: 'Robert Shiller, ie_data.xls', url: 'https://shillerdata.com/' }, decision: 'D10' },
    { group: 'Markets', label: 'Cash returns', value: 'Short-term Treasury rates from 1928; before that the 10-year Treasury yield', status: 'fixed',
      why: 'No free T-bill series exists before 1928; yield curves were fairly flat then.', source: { label: 'Aswath Damodaran, histretSP.xls', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histret.html' }, decision: 'D11' },
    { group: 'Markets', label: "Today's dollars", value: 'All amounts are after inflation', status: 'fixed',
      why: "Each historical year's actual inflation converts returns, so no inflation forecast is needed. Amounts fixed in actual dollars — brokerage cost basis, Roth contributions and conversions — shrink with inflation, so gains and early Roth access are counted at today's value.", decision: 'D6, D63' },
    { group: 'Markets', label: 'Timing', value: 'Contributions and withdrawals at the start of each year', status: 'fixed',
      why: 'Same convention as FI Calc; slightly conservative for withdrawals.', decision: 'D7' },

    // Work & spending
    { group: 'Work & spending', label: 'Real wage growth', value: pct(a.wageGrowth), status: st(a.wageGrowth === d.wageGrowth),
      why: 'Salaries and contributions grow this much above inflation until work stops (Fidelity assumption).', source: fid, decision: 'D15' },
    { group: 'Work & spending', label: 'Traditional FIRE spending', value: usd(plan.household.traditionalSpending),
      status: plan.household.traditionalSpending === fidelityDefaultSpending(plan) ? 'default' : 'changed',
      why: `Default is ${FIDELITY_SPENDING_FACTOR} × (current spending − ${usd(datedExpensesToday(plan))} of dated items you already pay today) (Fidelity: ~15% less in retirement). Healthcare and dated items are added separately.`, source: fid, decision: 'D18' },
    { group: 'Work & spending', label: 'Chubby FIRE spending', value: plan.household.chubbySpending ? usd(plan.household.chubbySpending) : 'not set',
      status: plan.household.chubbySpending === chubbyDefaultSpending(plan) ? 'default' : 'changed',
      why: `Default is ${CHUBBY_SPENDING_FACTOR.toFixed(1)} × (current spending − ${usd(datedExpensesToday(plan))} of dated items you already pay today): a step up from today's lifestyle, between Traditional and Fat FIRE. Healthcare and dated items are added separately.`, decision: 'D57' },
    { group: 'Work & spending', label: 'Coast FIRE: stop working at', value: `your age ${plan.household.coastRetireAge}`, status: st(plan.household.coastRetireAge === 65),
      why: 'Coast = stop contributing now, keep working (paycheck covers spending) until this age, then Traditional spending.' },
    { group: 'Work & spending', label: 'While working', value: 'Paycheck covers all spending', status: 'fixed',
      why: 'The portfolio only receives contributions until the retirement date.', decision: 'D16' },
    { group: 'Work & spending', label: 'Dated items', value: `${plan.datedItems.length} item(s)`, status: 'fixed',
      why: 'Ongoing items already paid today are part of the paycheck budget until retirement. Everything else dated before retirement is paid from (or saved to) cash and brokerage savings, with tax on any gains; a cost savings can’t cover counts as running out. Fixed-dollar items shrink with inflation. Income is taxed as ordinary income unless marked untaxed (a home sale, a cash gift).', decision: 'D17, D19, D66' },

    // Healthcare
    { group: 'Healthcare', label: 'Healthcare inflation', value: `${pct(a.healthcareInflation)} above inflation`, status: st(a.healthcareInflation === d.healthcareInflation),
      why: 'Healthcare costs have historically outpaced general inflation.', decision: 'D21' },
    { group: 'Healthcare', label: 'ACA subsidies', value: 'Not modeled (full price)', status: 'fixed',
      why: 'Conservative. Subsidies depend on yearly income from withdrawals; planned for v2.', decision: 'D21' },

    // Social Security
    { group: 'Social Security', label: 'Benefit formula', value: `${SOCIAL_SECURITY.awiLatestYear + 2} bend points ${usd(SOCIAL_SECURITY.bendPoints[0])} / ${usd(SOCIAL_SECURITY.bendPoints[1])}, earnings indexed to the ${SOCIAL_SECURITY.awiLatestYear} wage index`, status: 'fixed',
      why: 'SSA’s formula: your top 35 years of pay, adjusted for wage growth; years after you stop working count as zero.', source: { label: 'SSA benefit formula', url: 'https://www.ssa.gov/oact/cola/piaformula.html' }, decision: 'D24' },
    { group: 'Social Security', label: 'Trust fund cut', value: `100% until ${tf.startYear}, then ${pct(tf.startPct, 0)} falling to ${pct(tf.endPct, 0)} by ${tf.endYear}`, status: st(tfSame),
      why: 'Plans conservatively for the retirement trust fund’s officially projected shortfall. Set both shares to 100% for no cut.', source: { label: '2026 Trustees Report', url: 'https://www.ssa.gov/oact/trsum/' }, decision: 'D26' },
    { group: 'Social Security', label: 'Claim ages', value: `${plan.you.name} ${plan.you.socialSecurity.claimAge}, ${plan.spouse.name} ${plan.spouse.socialSecurity.claimAge}`,
      status: st(plan.you.socialSecurity.claimAge === EXAMPLE_CLAIM_AGE && plan.spouse.socialSecurity.claimAge === EXAMPLE_CLAIM_AGE),
      why: 'Early claiming reduces, delayed claiming (to 70) increases benefits; spousal top-up included.', decision: 'D25' },

    // Taxes & accounts
    { group: 'Taxes & accounts', label: 'Federal tax', value: `${RULES_YEAR} married filing jointly, standard deduction ${usd(FEDERAL.standardDeduction)}`, status: 'fixed',
      why: 'Brackets, 0/15/20% capital gains, tax on part of Social Security, and the 3.8% extra tax on investment income for high earners. While working, only the extra tax that Social Security or RMDs add on top of wages is counted (D49).', source: { label: 'IRS 2026 inflation adjustments', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill' }, decision: 'D32' },
    { group: 'Taxes & accounts', label: 'State tax', value: pct(a.stateTaxRate), status: st(a.stateTaxRate === d.stateTaxRate),
      why: 'Flat rate on taxable income excluding Social Security. Use the rate of the state you expect to retire in (0% for no-income-tax states).', decision: 'D33' },
    { group: 'Taxes & accounts', label: 'Yearly Roth conversions', value: a.bracketFill === 'none' ? 'Off' : `Fill the ${a.bracketFill}% bracket every retired year`, status: st(a.bracketFill === d.bracketFill),
      why: 'Pre-tax money up to the top of this bracket is withdrawn; what you don\'t spend is converted to Roth and usable after 5 years.', decision: 'D29' },
    { group: 'Taxes & accounts', label: 'Before 59½', value: 'cash → brokerage → Roth contributions → Roth conversions 5+ years old → 401(k)/IRA with 10% penalty', status: 'fixed',
      why: 'Penalized withdrawals are allowed as a last resort and flagged, not treated as failure.', decision: 'D27' },
    { group: 'Taxes & accounts', label: 'Required minimum distributions (RMDs)', value: `${plan.you.name} from ${rmdStartAge(plan.you.birthYear)}, ${plan.spouse.name} from ${rmdStartAge(plan.spouse.birthYear)} (IRS Uniform Lifetime Table)`, status: 'fixed',
      why: 'Surplus RMD money is reinvested in the taxable account.', decision: 'D31' },
    { group: 'Taxes & accounts', label: 'Contribution limits', value: `401(k) ${usd(LIMITS.employee401k)}, IRA ${usd(LIMITS.ira)}, HSA family ${usd(LIMITS.hsaFamily)}`, status: 'fixed',
      why: 'Contributions are capped at these limits every year (catch-ups from 50, HSA from 55); money above a limit is not saved elsewhere. The limits stay flat in today’s dollars.', decision: 'D15' },
  ];
}
