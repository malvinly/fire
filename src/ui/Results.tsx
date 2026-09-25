import { useState, type ReactNode } from 'react';
import { timingYear } from '../engine/context';
import type { Detail, Success, Tier, TierResult } from '../engine/solve';
import { RUN_OUT_SHORTFALL, type Mix } from '../engine/simulate';
import type { Plan } from '../engine/types';
import { accountLegend, AccountsChart, BAND_LABELS, BandsChart, useTheme, type Marker } from './charts';
import { Help } from './fields';
import { Icon, TIER_ICONS } from './icons';
import { money, moneyShort, nameIs, percent } from './format';
import { METHODS_HELP, SUCCESS_HELP } from './helpText';
import { buildPlaybook } from './playbook';
import type { WarningLine } from './warnings';

export const TIER_NAMES: Record<Tier, string> = { traditional: 'Traditional FIRE', chubby: 'Chubby FIRE', coast: 'Coast FIRE' };

function tierHelp(tier: Tier, plan: Plan): string {
  if (tier === 'traditional') return 'When you could stop working for good and live on savings plus Social Security, spending your Traditional budget each year.';
  if (tier === 'chubby') return 'When you could stop working for good and live on savings plus Social Security, spending your bigger Chubby budget each year.';
  return `Stop adding to savings (employer matches stop too) but keep working until ${nameIs(plan.you.name)} ${plan.household.coastRetireAge}, with paychecks covering the bills. ` +
    'After that, savings pay the same Traditional budget. It comes sooner than Traditional because the money grows untouched longer and has fewer years to last.';
}

/** How the Coast number counts money you don't have yet (D50); shown only when today's total is below it. */
function mixText(mix: Mix | undefined): string {
  if (!mix) return '';
  const parts = [
    [mix.pretax[0] + mix.pretax[1], '401(k)/IRA'], [mix.roth[0] + mix.roth[1], 'Roth'], [mix.hsa, 'HSA'], [mix.taxable, 'brokerage'],
  ] as const;
  const list = parts.filter(([share]) => share > 0.005).map(([share, name]) => `${percent(share)} ${name}`).join(', ');
  return ` If you have less, the difference is counted as if saved the way you contribute today: ${list}.`;
}

/** Names the last year searched, which is the younger spouse's age 75 or the year before the plan ends (D43). */
function notReachable(plan: Plan, limit: number, target: string): string {
  return `Even retiring in ${limit} (${plan.you.name} ${limit - plan.you.birthYear} · ${plan.spouse.name} ${limit - plan.spouse.birthYear}), ` +
    `your money lasts in fewer than ${target} of markets.`;
}

function SuccessBadge({ s, target }: { s: Success | null; target: number }) {
  if (!s) return <span className="muted">—</span>;
  const ok = s.combined >= target - 1e-9;
  const close = !ok && s.combined >= target - 0.1;
  const [color, icon, word] = ok
    ? ['var(--good)', '✓', 'meets your target']
    : close ? ['var(--warning)', '!', `close (within 10 points of ${percent(target)})`] : ['var(--critical)', '✕', 'below your target'];
  return (
    <span className="status">
      <span className="dot" style={{ background: color }} aria-hidden />
      <b>{percent(s.combined)}</b> <span className="muted">{icon} {word}</span>
    </span>
  );
}

function MethodLine({ s }: { s: Success | null }) {
  if (!s) return null;
  return (
    <span className="muted">
      <Help text={METHODS_HELP}>
        <span>
          Simulated markets {percent(s.bootstrap, 1)} · Real past markets {s.historical === null ? 'n/a' : percent(s.historical, 1)} · the lower one counts
        </span>
      </Help>
    </span>
  );
}

function Label({ children, help }: { children: ReactNode; help?: string }) {
  return <div className="label">{help ? <Help text={help}>{children}</Help> : children}</div>;
}

export function TierCard({ r, plan, selected, onSelect }: { r: TierResult | null; plan: Plan; selected: boolean; onSelect: () => void }) {
  const target = plan.assumptions.targetSuccess;
  if (!r) {
    return (
      <div className="card">
        <span className="spinner" /> <span className="muted">Calculating…</span>
      </div>
    );
  }
  const isCoast = r.tier === 'coast';
  const coasting = isCoast && r.fireNumber !== null && r.currentBalance >= r.fireNumber;
  const progress = r.fireNumber ? Math.min(1, r.currentBalance / r.fireNumber) : 0;
  const extras = plan.datedItems.length ? ' + healthcare + dated items' : ' + healthcare';
  const coastYear = plan.you.birthYear + plan.household.coastRetireAge;
  const endAge = plan.assumptions.endAge;
  const verb = isCoast ? 'stop saving' : 'retire';
  return (
    <div className={`card${selected ? ' selected' : ''}`} role="button" tabIndex={0} onClick={onSelect}
      onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && onSelect()} aria-pressed={selected}>
      <div className="card-head">
        <h2 className="with-icon"><Icon name={TIER_ICONS[r.tier]} /><Help text={tierHelp(r.tier, plan)}>{TIER_NAMES[r.tier]}</Help></h2>
        <span className="kicker">{money(r.spending)}/yr{extras}</span>
      </div>
      <div>
        <div className="kicker">
          {isCoast ? 'Earliest year you can stop saving' : `Earliest year you can retire (${percent(target)} chance or better)`}
        </div>
        <div className="hero">
          {coasting ? 'You can stop saving now' : r.earliest ? r.earliest.year : 'Not reachable'}{' '}
          {r.earliest && !coasting && <small>{plan.you.name} {r.earliest.ageYou} · {plan.spouse.name} {r.earliest.ageSpouse}</small>}
        </div>
        {isCoast && (
          <p className="muted">
            Then keep working until {coastYear} ({plan.you.name} {coastYear - plan.you.birthYear} · {plan.spouse.name} {coastYear - plan.spouse.birthYear})
          </p>
        )}
        {!r.earliest && (
          <p className="muted">
            {isCoast
              ? `Even saving until ${nameIs(plan.you.name)} ${plan.household.coastRetireAge}, your money lasts in fewer than ${percent(target)} of markets.`
              // Sessions saved before searchLimit existed were searched to the first person's 75 (the old D43).
              : notReachable(plan, r.searchLimit ?? plan.you.birthYear + 75, percent(target))}
            {' '}{isCoast ? 'Try a later stop-working age under Spending, or lower Traditional spending.' : 'Try lower spending, higher contributions, or a later plan-until age under Assumptions.'}
          </p>
        )}
      </div>
      <div className="stat-row">
        <div className="stat">
          <Label help={isCoast
            ? `The smallest total savings today that would let you stop saving now and still have a ${percent(target)} chance your money lasts.${coasting ? '' : mixText(r.coastMix)}`
            : r.earliest
              ? `The total across all accounts you’d need in ${r.earliest.year} to retire then with a ${percent(target)} chance your money lasts, in today’s dollars. Compare it with the expected savings below.`
              : `The total across all accounts you’d need on the day you retire for a ${percent(target)} chance your money lasts, in today’s dollars.`}>
            {isCoast ? 'Needed today to stop saving' : 'Savings needed when you retire'}
          </Label>
          <div className="value">{moneyShort(r.fireNumber)}</div>
        </div>
        <div className="stat">
          <div className="label">You have today (all accounts)</div>
          <div className="value">{moneyShort(r.currentBalance)}</div>
        </div>
      </div>
      {isCoast && r.fireNumber !== null && (
        <div className="progress" title={`${percent(progress)} of what you need today to stop saving`} aria-label={`${percent(progress)} of what you need today to stop saving`}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {r.projectedAtEarliest && r.earliest && (
        <div className="stat">
          <div className="label">Expected savings by {r.earliest.year}</div>
          <div className="value">
            {moneyShort(r.projectedAtEarliest.p50)} <span className="muted">typical</span> · {moneyShort(r.projectedAtEarliest.p10)} <span className="muted">bad market (1 in 10)</span>
          </div>
        </div>
      )}
      <div className="stat">
        <Label help={`Share of markets in which your money never runs out before the younger of you is ${endAge}. Not a guarantee: in the other markets savings run out, usually late in retirement, leaving Social Security to live on. “This year” shows how far you are from ready today.`}>
          Chance your money lasts
        </Label>
        <div className="chance-row"><span className="label">if you {verb} this year</span><SuccessBadge s={r.successToday} target={target} /></div>
        {r.successAtEarliest && r.earliest && (
          <>
            <div className="chance-row"><span className="label">if you {verb} in {r.earliest.year}</span><SuccessBadge s={r.successAtEarliest} target={target} /></div>
            <div className="method-line"><MethodLine s={r.successAtEarliest} /></div>
          </>
        )}
      </div>
    </div>
  );
}

/** Cautions about the results, directly below the cards so they are read before acting (D67). */
export function BeforeYouAct({ lines, onLimits }: { lines: WarningLine[]; onLimits: () => void }) {
  if (!lines.length) return null;
  return (
    <div className="panel warnings">
      <h2 className="with-icon"><Icon name="alert" />Before you act on these numbers</h2>
      <ul>
        {lines.map((l) => (
          <li key={l.key}>
            {l.text}
            {l.link === 'limits' && <> <button className="link" onClick={onLimits}>What this doesn’t model →</button></>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function markersFor(plan: Plan, d: Detail): Marker[] {
  const m: Marker[] = [];
  const retire = d.scenario.retireYear;
  if (d.tier === 'coast' && d.scenario.stopContributingYear < retire) m.push({ year: d.scenario.stopContributingYear, label: 'Stop saving' });
  m.push({ year: retire, label: 'Retire' });
  for (const id of ['you', 'spouse'] as const) {
    const p = plan[id];
    m.push({ year: p.birthYear + 60, label: `${p.name} 59½` });
    m.push({ year: p.birthYear + 65, label: `${p.name} 65` });
    m.push({ year: p.birthYear + p.socialSecurity.claimAge, label: `${p.name}: Social Security` });
  }
  m.push({ year: plan.assumptions.ssTrustFund.startYear, label: 'Social Security cut' });
  for (const it of plan.datedItems) {
    if (it.fixedDollars && it.direction === 'expense' && it.end) m.push({ year: timingYear(plan, it.end) + 1, label: `${it.label} ends` });
  }
  return m.filter((x) => x.year >= d.years[0] && x.year <= d.years[d.years.length - 1]);
}

const COLUMNS: { label: string; help?: string }[] = [
  { label: 'Year' },
  { label: 'Ages' },
  { label: 'Spending', help: 'Your spending for the year, including healthcare and dated items.' },
  { label: 'Social Security' },
  { label: 'Other income', help: 'Income dated items (home sale, pension…).' },
  { label: 'From cash' },
  { label: 'From brokerage' },
  { label: 'From 401(k)/IRA' },
  { label: 'From Roth' },
  { label: 'From HSA' },
  { label: 'Reinvested', help: 'Money that came in this year but wasn’t needed for spending and taxes: the unspent part of a required withdrawal, or income above what the year needed. It goes into the brokerage account.' },
  { label: 'Moved to Roth', help: '401(k)/IRA money converted to Roth this year (you pay tax now). It can be withdrawn tax- and penalty-free 5 years later.' },
  { label: 'Roth available', help: 'Roth money you could take out at the start of the year without tax or penalty: what you put in, conversions at least 5 years old, and all of it once that person is 59½. Conversions only help an early retirement if they show up here before the calendar year their owner turns 60.' },
  { label: 'Required withdrawal', help: 'IRS-required minimum withdrawal from 401(k)/IRA (RMD), from age 75 (73 if born 1951–59). Anything not spent is reinvested.' },
  { label: 'Income taxed', help: 'Federal taxable income after the standard deduction.' },
  { label: 'Federal tax' },
  { label: 'State tax' },
  { label: 'Early-withdrawal penalty', help: '10% penalty on retirement money taken out before 59½, plus 20% on HSA money spent on non-medical costs while the younger of you is under 65.' },
  { label: 'Total savings (end of year)' },
];

/** The engine's withdrawal rules as a timeline of steps to follow, for a reader with no finance background (D93). */
function PlaybookPanel({ plan, detail }: { plan: Plan; detail: Detail }) {
  const pb = buildPlaybook(plan, detail);
  return (
    <div className="panel playbook">
      <h2>What to do each year after you retire</h2>
      <p className="text-2" style={{ marginTop: 4 }}>
        The steps the calculator assumed when it worked out the results above, in plain words. Money in different kinds of accounts
        is taxed differently, so the order you take it out changes how much tax you pay and whether you owe a penalty. Following this
        order is what keeps the plan on track. It is the model’s plan, not personal advice: a tax preparer can check it against your
        situation. The example lines come from one simulated market and will not match your real years; the steps are what to follow.
      </p>
      <div className="timeline">
        {pb.phases.map((ph) => (
          <div className="tl-item" key={ph.year}>
            <div className="tl-year">{ph.year}</div>
            <div className="tl-marker" aria-hidden />
            <div className="tl-card">
              <h3>{ph.title} <span className="ages">{ph.ages}</span></h3>
              <ol className="steps">
                {ph.steps.map((s, i) => (
                  <li key={i}>
                    <b>{s.action}</b>
                    {s.items && <ol>{s.items.map((it, j) => <li key={j}>{it}</li>)}</ol>}
                    {s.why && <p className="why">{s.why}</p>}
                  </li>
                ))}
              </ol>
              {ph.example && <p className="example">{ph.example}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the markets that fail look like (D74): when money runs out and what is left to live on then. */
function failureText(d: Detail): string | null {
  const f = d.failures;
  if (!f) return null;
  const n = f.medianYear - d.scenario.retireYear + 1;
  if (n < 1) {
    return `In ${percent(f.share)} of simulated markets your savings run out, half of those by ${f.medianYear}: before you retire, because a dated cost is more than your savings can pay.`;
  }
  return `In ${percent(f.share)} of simulated markets your savings run out, half of those not until retirement year ${n} (${f.medianYear}) or later. ` +
    `From then on you’d live on Social Security, about ${moneyShort(f.socialSecurity)}/yr against about ${moneyShort(f.spending)}/yr of spending, unless you cut spending earlier.`;
}

/** Where each person's full-retirement-age benefit comes from: the earnings record depends on the retirement year, a statement estimate doesn't. */
function piaHelp(plan: Plan, retireYear: number): string {
  const source = (id: 'you' | 'spouse') => plan[id].socialSecurity.mode === 'manual'
    ? 'the statement estimate you entered, which doesn’t change with the retirement year'
    : `the earnings record, with work until ${retireYear}`;
  const from = source('you') === source('spouse') ? `From ${source('you')}.` : `${plan.you.name}: from ${source('you')}. ${plan.spouse.name}: from ${source('spouse')}.`;
  const wage = plan.assumptions.ssWageGrowth ? ' Raised for national wage growth above inflation (Assumptions).' : '';
  return `Each person’s own monthly benefit at full retirement age (67 for most people). ${from}${wage} Before your claim age, spousal top-up and trust-fund adjustments.`;
}

/** `simpleNumber`: the selected tier's 4% rule figure (a reference, shown for Traditional and Chubby only). */
export function DetailView({ plan, detail, loading, simpleNumber }: { plan: Plan; detail: Detail; loading: boolean; simpleNumber?: number }) {
  const theme = useTheme();
  const target = plan.assumptions.targetSuccess;
  const retireYear = detail.scenario.retireYear;
  const retired = detail.medianPath.filter((r) => !r.working);
  const runsOut = retired.find((r) => r.shortfall > RUN_OUT_SHORTFALL)?.year;
  const [zoom, setZoom] = useState(false);
  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="panel">
        <h2>
          <Help text="All amounts are adjusted for inflation: $100k in 2050 is shown as what $100k buys today.">
            Your savings over time, in today’s dollars
          </Help>{' '}
          — {TIER_NAMES[detail.tier]}, retiring {retireYear}
        </h2>
        <p className="text-2" style={{ marginTop: 4 }}>
          Your total savings in a typical, a below-average and a bad market, out of {plan.assumptions.paths.toLocaleString()} simulated markets.
        </p>
        <div className="stats-row">
          <div className="stat"><Label help={SUCCESS_HELP}>Chance your money lasts</Label><SuccessBadge s={detail.success} target={target} /></div>
          <div className="stat">
            <Label help="In this share of simulated markets you’d have to take money from a 401(k)/IRA or Roth before 59½ and pay the 10% penalty at least once. The plan still counts as a success.">
              Markets needing an early-withdrawal penalty
            </Label>
            <div className="value">{percent(detail.penaltyRate, 1)}</div>
          </div>
          <div className="stat">
            <Label help={piaHelp(plan, retireYear)}>
              Social Security at full retirement age (monthly, today’s $)
            </Label>
            <div className="value">{plan.you.name} {money(detail.pia[0])} · {plan.spouse.name} {money(detail.pia[1])}</div>
          </div>
          {detail.tier !== 'coast' && simpleNumber !== undefined && (
            <div className="stat">
              <Label help="25 × (spending + first-year healthcare). Ignores taxes and Social Security; not used for your date or “Savings needed”.">
                Rule-of-thumb check (4% rule)
              </Label>
              <div className="value">{moneyShort(simpleNumber)}</div>
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <MethodLine s={detail.success} />
          <label className="check">
            <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
            Zoom in on the weaker markets (the typical line may run off the top)
          </label>
        </div>
        <BandsChart years={detail.years} bands={detail.bands} markers={markersFor(plan, detail)} theme={theme} zoom={zoom} />
        <div className="legend">
          <span><i style={{ background: theme.band[0] }} />{BAND_LABELS.p50}</span>
          <span><i style={{ background: theme.band[1] }} />{BAND_LABELS.p25}</span>
          <span><i style={{ background: theme.band[2] }} />{BAND_LABELS.p10}</span>
          <span className="muted">Fidelity calls these average, below average and significantly below average markets.</span>
        </div>
        {failureText(detail) && <p className="text-2" style={{ marginTop: 8 }}>{failureText(detail)}</p>}
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>What’s in each account — bad market (1 in 10)</h2>
          <p className="text-2" style={{ marginTop: 4, marginBottom: 10 }}>
            One simulated market that stays close to the bad-market line in the first 10 years of retirement. Usually the
            brokerage account shrinks first, then Roth, then 401(k)/IRA after 59½.
          </p>
          <AccountsChart records={detail.p10Path} theme={theme} />
          <div className="legend">
            {accountLegend(theme).map((l) => <span key={l.label}><i style={{ background: l.color, height: 10, width: 10 }} />{l.label}</span>)}
          </div>
        </div>
        <div className="panel">
          <h2>Worst years to have started your plan</h2>
          <p className="text-2" style={{ marginTop: 4, marginBottom: 10 }}>
            {detail.historicalCount > 0
              ? `Your plan replayed as if it began in each of ${detail.historicalCount} past years. “1966” means your first plan year gets 1966’s markets and inflation, and so on.`
              : 'Your plan is longer than any stretch of real history, so only simulated markets are used.'}
          </p>
          <table className="data wrap">
            <thead>
              <tr>
                <th>Start year</th>
                <th><Help text="The market year your first retired year gets in this replay: the start year plus the years until you retire.">Retiring into</Help></th>
                <th>Money</th><th>Lowest savings</th><th>End savings</th>
              </tr>
            </thead>
            <tbody>
              {detail.worstHistorical.map((w) => (
                <tr key={w.startYear}>
                  <td>{w.startYear}</td>
                  <td>{w.startYear + (retireYear - plan.startYear)}</td>
                  <td className={w.success ? undefined : 'wrap'}>{w.success ? 'Lasted'
                    : w.failYear! < retireYear ? `Ran out in ${w.failYear}, before retiring (a dated cost savings couldn’t cover)`
                    : `Ran out in ${w.failYear} (year ${w.failYear! - retireYear + 1} of retirement)`}</td>
                  <td>{moneyShort(w.minBalance)}</td>
                  <td>{moneyShort(w.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PlaybookPanel plan={plan} detail={detail} />

      <div className="panel">
        <h2>Year by year in a typical market</h2>
        <p className="text-2" style={{ marginTop: 4, marginBottom: 10 }}>
          One simulated market that stays close to the typical line in the first 10 years of retirement: where each year’s
          spending money comes from and the taxes paid, in today’s dollars. Money in (Social Security,
          other income, the “From …” columns) equals spending, taxes and penalty plus “Reinvested”
          {runsOut ? `, until savings run out in ${runsOut}` : ''}.
        </p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>{COLUMNS.map((c) => <th key={c.label}>{c.help ? <Help text={c.help}>{c.label}</Help> : c.label}</th>)}</tr>
            </thead>
            <tbody>
              {retired.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td><td>{r.ageYou}/{r.ageSpouse}</td><td>{moneyShort(r.spending)}</td>
                  <td>{moneyShort(r.socialSecurity)}</td><td>{moneyShort(r.otherIncome)}</td>
                  <td>{moneyShort(r.withdrawals.cash)}</td><td>{moneyShort(r.withdrawals.taxable)}</td>
                  <td>{moneyShort(r.withdrawals.pretax)}</td><td>{moneyShort(r.withdrawals.roth)}</td><td>{moneyShort(r.withdrawals.hsa)}</td>
                  <td>{moneyShort(r.reinvested)}</td>
                  <td>{moneyShort(r.conversions)}</td><td>{moneyShort(r.seasonedRoth)}</td><td>{moneyShort(r.rmd)}</td><td>{moneyShort(r.taxableIncome)}</td>
                  <td>{moneyShort(r.federalTax)}</td><td>{moneyShort(r.stateTax)}</td><td>{moneyShort(r.penaltyTax)}</td>
                  <td>{moneyShort(r.balances.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
