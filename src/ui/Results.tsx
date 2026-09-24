import { useState, type ReactNode } from 'react';
import { timingYear } from '../engine/context';
import type { Detail, Success, Tier, TierResult } from '../engine/solve';
import type { Plan } from '../engine/types';
import { accountLegend, AccountsChart, BAND_LABELS, BandsChart, useTheme, type Marker } from './charts';
import { Help } from './fields';
import { Icon, TIER_ICONS } from './icons';
import { money, moneyShort, percent } from './format';
import { METHODS_HELP, SUCCESS_HELP } from './helpText';
import type { WarningLine } from './warnings';

export const TIER_NAMES: Record<Tier, string> = { traditional: 'Traditional FIRE', chubby: 'Chubby FIRE', coast: 'Coast FIRE' };

function tierHelp(tier: Tier, plan: Plan): string {
  if (tier === 'traditional') return 'Retire on your normal retirement budget (the Traditional spending you entered).';
  if (tier === 'chubby') return 'Retire on a bigger, more comfortable budget (the Chubby spending you entered).';
  return `Stop saving now, keep working until ${plan.you.name} is ${plan.household.coastRetireAge} with your paychecks covering the bills, then retire on the Traditional budget.`;
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
        {!r.earliest && (
          <p className="muted">
            {isCoast
              ? `Even saving until ${plan.you.name} is ${plan.household.coastRetireAge}, your money lasts in fewer than ${percent(target)} of markets.`
              : `Even retiring when ${plan.you.name} is 75, your money lasts in fewer than ${percent(target)} of markets.`}
          </p>
        )}
      </div>
      <div className="stat-row">
        <div className="stat">
          <Label help={isCoast
            ? 'The smallest total savings today that would let you stop saving now and still reach your target.'
            : 'The total savings (all accounts, today’s dollars) you need on the day you retire for your money to last at your target chance.'}>
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
          <Label help="What your savings are expected to be by then if markets are typical, or bad (only 1 in 10 simulated markets do worse). Today’s dollars.">
            Expected by {r.earliest.year}: typical market · bad market (1 in 10)
          </Label>
          <div className="value">{moneyShort(r.projectedAtEarliest.p50)} · {moneyShort(r.projectedAtEarliest.p10)}</div>
        </div>
      )}
      <div className="stat">
        <Label help={SUCCESS_HELP}>{isCoast ? 'Chance your money lasts if you stop saving this year' : 'Chance your money lasts if you retire this year'}</Label>
        <SuccessBadge s={r.successToday} target={target} />
      </div>
      {r.successAtEarliest && r.earliest && (
        <div className="stat">
          <Label help={SUCCESS_HELP}>…if you {isCoast ? 'stop saving' : 'retire'} in {r.earliest.year}</Label>
          <SuccessBadge s={r.successAtEarliest} target={target} />
          <div><MethodLine s={r.successAtEarliest} /></div>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        4% rule check: 25 × (spending + first-year healthcare) = {moneyShort(r.simpleNumber)}. Ignores taxes and
        Social Security; not used for your date.
      </div>
    </div>
  );
}

/** Cautions about the results, directly below the cards so they are read before acting (D67). */
export function BeforeYouAct({ lines }: { lines: WarningLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="panel warnings">
      <h2 className="with-icon"><Icon name="alert" />Before you act on these numbers</h2>
      <ul>
        {lines.map((l) => <li key={l.key}>{l.text}</li>)}
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
  { label: 'Moved to Roth', help: '401(k)/IRA money converted to Roth this year (you pay tax now). It can be withdrawn tax- and penalty-free 5 years later.' },
  { label: 'Roth available', help: 'Roth money you could take out at the start of the year without tax or penalty: what you put in, conversions at least 5 years old, and all of it once that person is 59½. Conversions only help an early retirement if they show up here before the calendar year their owner turns 60.' },
  { label: 'Required withdrawal', help: 'IRS-required minimum withdrawal from 401(k)/IRA (RMD), from age 75 (73 if born 1951–59). Anything not spent is reinvested.' },
  { label: 'Income taxed', help: 'Federal taxable income after the standard deduction.' },
  { label: 'Federal tax' },
  { label: 'State tax' },
  { label: 'Early-withdrawal penalty', help: '10% penalty on retirement money taken out before 59½, plus 20% on HSA money spent on non-medical costs while the younger of you is under 65.' },
  { label: 'Total savings (end of year)' },
];

export function DetailView({ plan, detail, loading }: { plan: Plan; detail: Detail; loading: boolean }) {
  const theme = useTheme();
  const target = plan.assumptions.targetSuccess;
  const retireYear = detail.scenario.retireYear;
  const retired = detail.medianPath.filter((r) => !r.working);
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
            <Label help={`Each person’s own monthly benefit at full retirement age (67 for most people), based on working until ${retireYear}. Before the adjustment for your claim age, the spousal top-up and the trust-fund cut.`}>
              Social Security at full retirement age (monthly, today’s $)
            </Label>
            <div className="value">{plan.you.name} {money(detail.pia[0])} · {plan.spouse.name} {money(detail.pia[1])}</div>
          </div>
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
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>What’s in each account — bad market (1 in 10)</h2>
          <p className="text-2" style={{ marginTop: 4, marginBottom: 10 }}>
            Usually the brokerage account shrinks first, then Roth, then 401(k)/IRA after 59½.
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
          <table className="data">
            <thead><tr><th>Start year</th><th>Outcome</th><th>Lowest savings</th><th>Savings at the end</th></tr></thead>
            <tbody>
              {detail.worstHistorical.map((w) => (
                <tr key={w.startYear}>
                  <td>{w.startYear}</td>
                  <td>{w.success ? 'Money lasted'
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

      <div className="panel">
        <h2>Year by year in a typical market</h2>
        <p className="text-2" style={{ marginTop: 4, marginBottom: 10 }}>
          Where each year’s spending money comes from and the taxes paid, in today’s dollars. Money in (Social Security,
          other income, the “From …” columns) equals spending plus taxes and penalty.
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
