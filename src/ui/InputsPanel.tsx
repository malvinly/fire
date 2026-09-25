import { useState } from 'react';
import { LIMITS, TRUST_FUND_DEFAULT } from '../data/rules';
import { CHUBBY_SPENDING_FACTOR, DEFAULT_ASSUMPTIONS, FIDELITY_SPENDING_FACTOR, chubbyDefaultSpending, coastContributionTotal, datedExpensesToday, exampleStatus, fidelityDefaultSpending, searchPathsFor, type ExampleSection } from '../engine/defaults';
import { parseEarnings } from '../engine/earnings';
import { computePia } from '../engine/socialSecurity';
import type { BracketFill, Person, PersonId, Plan } from '../engine/types';
import { planEndYear } from '../engine/context';
import { FIELD_LIMITS, birthYearProblem, coastAgeProblem, coastKeptProblem } from '../engine/validate';
import { DatedItemsEditor } from './DatedItemsEditor';
import { Help, NumberField, Section, SelectField, TextField } from './fields';
import { money, percent, whose } from './format';
import { HELP } from './helpText';

type Update = (fn: (draft: Plan) => void) => void;

const PEOPLE: PersonId[] = ['you', 'spouse'];

// Limits enforced as you type come from FIELD_LIMITS, which also rejects the same values in loaded files (D76).
const L = FIELD_LIMITS;
const NO_DEBT = { ...L.money, rangeMessage: 'Can’t be negative. Enter a debt or money you’ll take out as a dated expense instead (e.g. loan payments).' };
const NOT_NEGATIVE = { ...L.money, rangeMessage: 'Can’t be negative.' };
const RATE = { ...L.rate, rangeMessage: 'Must be between 0% and 100%.' };
const GROWTH = { ...L.growth, rangeMessage: 'Must be between −50% and 50% a year.' };

export function InputsPanel({ plan, update }: { plan: Plan; update: Update }) {
  const h = plan.household;
  const dated = datedExpensesToday(plan);
  // What the spending defaults multiply: today's spending, less dated items already being paid.
  const spendingBase = dated ? `(${money(h.currentSpending)} − ${money(dated)} dated items)` : money(h.currentSpending);
  const a = plan.assumptions;
  const salaries = plan.you.salary + plan.spouse.salary;
  const hsaLimit = LIMITS.hsaFamily + PEOPLE.filter((id) => plan.startYear - plan[id].birthYear >= 55).length * LIMITS.hsaCatchUp;
  const saved =
    PEOPLE.reduce((s, id) => {
      const c = plan[id].contributions;
      return s + c.pretax + c.employerMatch + c.roth + c.hsa;
    }, 0) + h.taxableContribution + h.cashContribution;
  // Fields still holding the example's number get a coloured edge, and their section header a dot (D64).
  const ex = exampleStatus(plan);
  const exampleOf = (path: string) => ex.examples.get(path);
  const flag = (section: ExampleSection) => {
    const n = ex.counts[section];
    return n ? `${n} example number${n === 1 ? '' : 's'}` : undefined;
  };

  return (
    <div>
      <Section title="People" icon="users" open flag={flag('People')}>
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="person-col section-body">
              <TextField label="Name" help={HELP.name} value={plan[id].name} onChange={(v) => update((d) => { d[id].name = v; })} />
              <NumberField label="Birth year" help={HELP.birthYear} kind="int" value={plan[id].birthYear} {...L.year} check={(v) => birthYearProblem(plan, v)} example={exampleOf(`${id}.birthYear`)} onChange={(v) => update((d) => { d[id].birthYear = v ?? d[id].birthYear; })}
                hint={`Age ${plan.startYear - plan[id].birthYear} in ${plan.startYear}`} />
              <NumberField label="Birth month" help={HELP.birthMonth} kind="int" {...L.birthMonth} value={plan[id].birthMonth}
                onChange={(v) => update((d) => { d[id].birthMonth = Math.min(12, Math.max(1, v ?? 1)); })} />
              <NumberField label="Yearly salary (before taxes)" help={HELP.salary} {...NOT_NEGATIVE} value={plan[id].salary} example={exampleOf(`${id}.salary`)} onChange={(v) => update((d) => { d[id].salary = v ?? 0; })} />
            </div>
          ))}
        </div>
        <NumberField label="Plan starts in year" help={HELP.startYear} kind="int" {...L.year} value={plan.startYear} onChange={(v) => update((d) => { d.startYear = v ?? d.startYear; })}
          hint="Balances below are as of the start of this year." />
      </Section>

      <Section title="Balances" icon="wallet" flag={flag('Balances')}>
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="section-body">
              <h3>{plan[id].name}</h3>
              <NumberField label="Pre-tax 401(k)/403(b)/IRA" help={HELP.pretaxBalance} {...NO_DEBT} value={plan[id].balances.pretax} example={exampleOf(`${id}.balances.pretax`)} onChange={(v) => update((d) => { d[id].balances.pretax = v ?? 0; })} />
              <NumberField label="Roth 401(k)/IRA balance" help={HELP.rothBalance} {...NO_DEBT} value={plan[id].balances.roth} example={exampleOf(`${id}.balances.roth`)} onChange={(v) => update((d) => { d[id].balances.roth = v ?? 0; })} />
              <NumberField label="…of which you put in" help={HELP.rothBasis} {...NO_DEBT} value={plan[id].balances.rothBasis} example={exampleOf(`${id}.balances.rothBasis`)}
                onChange={(v) => update((d) => { d[id].balances.rothBasis = v ?? 0; })}
                warn={plan[id].balances.rothBasis > plan[id].balances.roth ? 'More than the Roth total' : null}
                hint="Withdrawable anytime without tax or penalty" />
              <NumberField label="HSA balance" help={HELP.hsaBalance} {...NO_DEBT} value={plan[id].balances.hsa} example={exampleOf(`${id}.balances.hsa`)} onChange={(v) => update((d) => { d[id].balances.hsa = v ?? 0; })} />
            </div>
          ))}
        </div>
        <div className="subhead">Household</div>
        <div className="grid2">
          <NumberField label="Brokerage (non-retirement)" help={HELP.taxable} {...NO_DEBT} value={h.taxable} example={exampleOf('household.taxable')} onChange={(v) => update((d) => { d.household.taxable = v ?? 0; })} />
          <NumberField label="…amount you paid in (cost basis)" help={HELP.taxableBasis} {...NO_DEBT} value={h.taxableBasis} example={exampleOf('household.taxableBasis')} onChange={(v) => update((d) => { d.household.taxableBasis = v ?? 0; })}
            hint="What you paid in; gains above it are taxed when sold" />
          <NumberField label="Cash / emergency fund" help={HELP.cash} {...NO_DEBT} value={h.cash} example={exampleOf('household.cash')} onChange={(v) => update((d) => { d.household.cash = v ?? 0; })} />
        </div>
      </Section>

      <Section title="Yearly contributions" icon="piggyBank" flag={flag('Yearly contributions')}>
        <div className="grid2">
          {PEOPLE.map((id) => {
            const p = plan[id];
            const age = plan.startYear - p.birthYear;
            const limit = LIMITS.employee401k + (age >= 50 ? LIMITS.catchUp401k : 0) + LIMITS.ira + (age >= 50 ? LIMITS.iraCatchUp : 0);
            const employee = p.contributions.pretax + p.contributions.roth;
            return (
              <div key={id} className="section-body">
                <h3>{p.name}</h3>
                <NumberField label="Pre-tax 401(k)/IRA" help={HELP.pretaxContribution} {...NO_DEBT} value={p.contributions.pretax} example={exampleOf(`${id}.contributions.pretax`)} onChange={(v) => update((d) => { d[id].contributions.pretax = v ?? 0; })}
                  warn={employee > limit ? `Above 401(k)+IRA limits (${money(limit)})` : null} />
                <NumberField label="Employer match" help={HELP.employerMatch} {...NO_DEBT} value={p.contributions.employerMatch} example={exampleOf(`${id}.contributions.employerMatch`)} onChange={(v) => update((d) => { d[id].contributions.employerMatch = v ?? 0; })} />
                <NumberField label="Roth 401(k)/IRA" help={HELP.rothContribution} {...NO_DEBT} value={p.contributions.roth} example={exampleOf(`${id}.contributions.roth`)} onChange={(v) => update((d) => { d[id].contributions.roth = v ?? 0; })} />
                <NumberField label="HSA" help={HELP.hsaContribution} {...NO_DEBT} value={p.contributions.hsa} example={exampleOf(`${id}.contributions.hsa`)} onChange={(v) => update((d) => { d[id].contributions.hsa = v ?? 0; })} />
              </div>
            );
          })}
        </div>
        {plan.you.contributions.hsa + plan.spouse.contributions.hsa > hsaLimit && (
          <p className="muted">HSA contributions exceed the family limit ({money(hsaLimit)} with catch-ups at your ages).</p>
        )}
        <div className="grid2">
          <NumberField label="Brokerage" help={HELP.taxableContribution} {...NO_DEBT} value={h.taxableContribution} example={exampleOf('household.taxableContribution')} onChange={(v) => update((d) => { d.household.taxableContribution = v ?? 0; })} />
          <NumberField label="Cash savings" help={HELP.cashContribution} {...NO_DEBT} value={h.cashContribution} example={exampleOf('household.cashContribution')} onChange={(v) => update((d) => { d.household.cashContribution = v ?? 0; })} />
        </div>
        <p className="text-2">
          Savings rate: <b>{percent(salaries > 0 ? saved / salaries : 0, 1)}</b> of gross pay ({money(saved)}/yr). Contributions grow {percent(a.wageGrowth, 1)}/yr above inflation.
        </p>
        <details className="subsection" open={coastContributionTotal(plan) > 0}>
          <summary>Kept while coasting (Coast FIRE only)</summary>
          <p className="text-2">
            What each of you keeps contributing after regular saving stops, until the Coast age under Spending. Leave at 0 to stop saving entirely.
            A common choice is the 401(k) contribution that earns the full employer match, plus the match. Together they can’t exceed what that person saves today.
          </p>
          <div className="grid2">
            {PEOPLE.map((id) => {
              const p = plan[id];
              const c = p.coastContributions;
              const age = plan.startYear - p.birthYear;
              const limit = LIMITS.employee401k + (age >= 50 ? LIMITS.catchUp401k : 0) + LIMITS.ira + (age >= 50 ? LIMITS.iraCatchUp : 0);
              // Refuses a set of kept amounts that adds up to more than today's (D94), checked with the edited field's new value.
              const check = (key: keyof typeof c) => (v: number) => coastKeptProblem(p, { ...c, [key]: v });
              return (
                <div key={id} className="section-body">
                  <h3>{p.name} while coasting</h3>
                  <NumberField label="Pre-tax 401(k)/IRA" help={HELP.coastPretax} {...NO_DEBT} value={c.pretax} check={check('pretax')} onChange={(v) => update((d) => { d[id].coastContributions.pretax = v ?? 0; })}
                    warn={c.pretax + c.roth > limit ? `Above 401(k)+IRA limits (${money(limit)})` : null} />
                  <NumberField label="Employer match" help={HELP.coastEmployerMatch} {...NO_DEBT} value={c.employerMatch} check={check('employerMatch')} onChange={(v) => update((d) => { d[id].coastContributions.employerMatch = v ?? 0; })} />
                  <NumberField label="Roth 401(k)/IRA" help={HELP.coastRoth} {...NO_DEBT} value={c.roth} check={check('roth')} onChange={(v) => update((d) => { d[id].coastContributions.roth = v ?? 0; })} />
                  <NumberField label="HSA" help={HELP.coastHsa} {...NO_DEBT} value={c.hsa} check={check('hsa')} onChange={(v) => update((d) => { d[id].coastContributions.hsa = v ?? 0; })} />
                </div>
              );
            })}
          </div>
          {plan.you.coastContributions.hsa + plan.spouse.coastContributions.hsa > hsaLimit && (
            <p className="muted">Kept HSA contributions exceed the family limit ({money(hsaLimit)} with catch-ups at your ages).</p>
          )}
        </details>
      </Section>

      <Section title="Spending" icon="receipt" flag={flag('Spending')}>
        <NumberField label="Current yearly spending (today)" help={HELP.currentSpending} {...NO_DEBT} value={h.currentSpending} example={exampleOf('household.currentSpending')} onChange={(v) => update((d) => { d.household.currentSpending = v ?? 0; })}
          hint="Everything you spend today, including mortgage and any healthcare you pay yourself." />
        <NumberField label="Traditional FIRE: yearly retirement spending" help={HELP.traditionalSpending} {...NO_DEBT} value={h.traditionalSpending} example={exampleOf('household.traditionalSpending')}
          onChange={(v) => update((d) => { d.household.traditionalSpending = v ?? 0; })}
          hint={
            <>
              Exclude healthcare and anything you add under Dated items (e.g. mortgage) — they're added separately.{' '}
              <button className="link" onClick={() => update((d) => { d.household.traditionalSpending = fidelityDefaultSpending(d); })}>
                Use Fidelity default: {money(fidelityDefaultSpending(plan))} = {percent(FIDELITY_SPENDING_FACTOR)} × {spendingBase}
              </button>
              {' '}If today's spending includes healthcare you pay yourself, subtract that too.
            </>
          } />
        <NumberField label="Chubby FIRE: yearly retirement spending" help={HELP.chubbySpending} {...NO_DEBT} value={h.chubbySpending} allowEmpty example={exampleOf('household.chubbySpending')}
          onChange={(v) => update((d) => { d.household.chubbySpending = v; })}
          warn={h.chubbySpending ? null : 'Required for the Chubby FIRE result'}
          hint={
            <>
              Same exclusions as above.{' '}
              <button className="link" onClick={() => update((d) => { d.household.chubbySpending = chubbyDefaultSpending(d); })}>
                Use default: {money(chubbyDefaultSpending(plan))} = {percent(CHUBBY_SPENDING_FACTOR)} × {spendingBase}
              </button>
              {' '}Clear it to skip Chubby FIRE.
            </>
          } />
        <NumberField label={`Coast FIRE: ${whose(plan.you.name)} age when you both stop working`} help={HELP.coastAge} kind="int" value={h.coastRetireAge} {...L.age} check={(v) => coastAgeProblem(plan, v)}
          onChange={(v) => update((d) => { d.household.coastRetireAge = v ?? 65; })}
          hint="Coast = stop contributing (or cut back to what you keep while coasting, under Yearly contributions), keep working (paycheck covers spending) until this age." />
      </Section>

      <Section title="Healthcare" icon="heartPulse" flag={flag('Healthcare')}>
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="section-body">
              <h3>{plan[id].name}</h3>
              <NumberField label="Health costs before 65 (yearly)" help={HELP.preMedicare} {...NOT_NEGATIVE} value={plan[id].healthcare.preMedicare} example={exampleOf(`${id}.healthcare.preMedicare`)}
                onChange={(v) => update((d) => { d[id].healthcare.preMedicare = v ?? 0; })}
                hint="ACA premium + out-of-pocket, full price (no subsidy)" />
              <NumberField label="Health costs from 65 (yearly)" help={HELP.medicare} {...NOT_NEGATIVE} value={plan[id].healthcare.medicare} example={exampleOf(`${id}.healthcare.medicare`)}
                onChange={(v) => update((d) => { d[id].healthcare.medicare = v ?? 0; })}
                hint="Part B + D + Medigap + out-of-pocket" />
            </div>
          ))}
        </div>
        <p className="muted">Charged only in years you're retired. Grows {percent(a.healthcareInflation, 1)}/yr above inflation.</p>
      </Section>

      <Section title="Social Security" icon="landmark" flag={flag('Social Security')}>
        {PEOPLE.map((id) => (
          <SocialSecurityInputs key={id} id={id} person={plan[id]} ssWageGrowth={a.ssWageGrowth} update={update} examplePia={exampleOf(`${id}.socialSecurity.manualPia`)} />
        ))}
      </Section>

      <Section title="Dated items (mortgage, car, home sale…)" icon="calendarClock">
        <DatedItemsEditor plan={plan} update={update} />
      </Section>

      <Section title="Assumptions (advanced)" icon="sliders">
        <div className="grid2">
          <NumberField label="Plan until the younger of you is age" help={HELP.endAge} kind="int" {...L.endAge} value={a.endAge} onChange={(v) => update((d) => { d.assumptions.endAge = v ?? 96; })}
            warn={planEndYear(plan) <= plan.startYear ? "Must be above the younger spouse's current age" : null} />
          <NumberField label="Required chance of success" help={HELP.targetSuccess} kind="percent" value={a.targetSuccess} {...L.targetSuccess}
            onChange={(v) => update((d) => { d.assumptions.targetSuccess = Math.min(L.targetSuccess.max, Math.max(L.targetSuccess.min, v ?? 0.9)); })} />
          <NumberField label="Stocks share" help={HELP.stocks} kind="percent" {...RATE} value={a.allocation.stocks}
            onChange={(v) => update((d) => { setAllocation(d, 'stocks', v ?? 0); })} />
          <NumberField label="Bonds share" help={HELP.bonds} kind="percent" {...RATE} value={a.allocation.bonds}
            onChange={(v) => update((d) => { setAllocation(d, 'bonds', v ?? 0); })}
            hint={`Cash = the rest (${percent(a.allocation.cash)})`} />
          <NumberField label="Fund fees (expense ratio)" help={HELP.fees} kind="percent" {...RATE} value={a.feeRate} step={0.01}
            warn={a.feeRate > 0.03 ? 'Unusually high: most funds charge under 1%, and fees come off returns every year.' : null} onChange={(v) => update((d) => { d.assumptions.feeRate = v ?? 0; })} />
          <NumberField label="Raises above inflation" help={HELP.wageGrowth} kind="percent" {...GROWTH} value={a.wageGrowth} onChange={(v) => update((d) => { d.assumptions.wageGrowth = v ?? 0; })} />
          <NumberField label="Healthcare cost growth above inflation" help={HELP.healthcareInflation} kind="percent" {...GROWTH} value={a.healthcareInflation}
            warn={a.healthcareInflation > 0.1 ? 'Unusually high: it compounds every year.' : a.healthcareInflation < 0 ? 'Healthcare costs have usually risen faster than other prices.' : null} onChange={(v) => update((d) => { d.assumptions.healthcareInflation = v ?? 0; })} />
          <NumberField label="Social Security wage growth above inflation" help={HELP.ssWageGrowth} kind="percent" {...L.ssWageGrowth}
            rangeMessage="Must be between −5% and 5% a year." value={a.ssWageGrowth} step={0.1}
            onChange={(v) => update((d) => { d.assumptions.ssWageGrowth = v ?? 0; })} />
          <NumberField label="State income tax in retirement" help={HELP.stateTax} kind="percent" {...RATE} value={a.stateTaxRate}
            warn={a.stateTaxRate > 0.15 ? 'Higher than any US state’s top rate (about 13–14%).' : null} onChange={(v) => update((d) => { d.assumptions.stateTaxRate = v ?? 0; })} />
          <SelectField<BracketFill> label="Yearly Roth conversions: fill up to" help={HELP.bracketFill} value={a.bracketFill}
            options={[{ value: 'none', label: 'Off' }, { value: '10', label: '10% bracket' }, { value: '12', label: '12% bracket' }, { value: '22', label: '22% bracket' }, { value: '24', label: '24% bracket' }]}
            onChange={(v) => update((d) => { d.assumptions.bracketFill = v; })} />
          <NumberField label="Number of simulated markets" help={HELP.paths} kind="int" value={a.paths} {...L.paths}
            onChange={(v) => update((d) => { d.assumptions.paths = Math.min(L.paths.max, Math.max(L.paths.min, Math.round(v ?? 10_000))); d.assumptions.searchPaths = searchPathsFor(d.assumptions.paths); })} />
          <NumberField label="Simulated markets: chunk size (years)" help={HELP.blockLength} kind="int" value={a.blockLength} {...L.blockLength}
            onChange={(v) => update((d) => { d.assumptions.blockLength = Math.max(1, Math.round(v ?? 5)); })} />
          <NumberField label="Random seed" help={HELP.seed} kind="int" value={a.seed} onChange={(v) => update((d) => { d.assumptions.seed = Math.round(v ?? 1); })} />
        </div>
        <div className="subhead">Social Security trust fund</div>
        <div className="grid2">
          <NumberField label="Benefit cut starts in (year)" help={HELP.tfStart} kind="int" {...L.year} value={a.ssTrustFund.startYear} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.startYear = v ?? TRUST_FUND_DEFAULT.startYear; })} />
          <NumberField label="Share paid when the cut starts" help={HELP.tfStartPct} kind="percent" {...RATE} value={a.ssTrustFund.startPct} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.startPct = v ?? 0; })} />
          <NumberField label="Cut deepens until (year)" help={HELP.tfEnd} kind="int" {...L.year} value={a.ssTrustFund.endYear} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.endYear = v ?? TRUST_FUND_DEFAULT.endYear; })} />
          <NumberField label="Share paid from then on" help={HELP.tfEndPct} kind="percent" {...RATE} value={a.ssTrustFund.endPct} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.endPct = v ?? 0; })}
            />
        </div>
        <button className="btn small" onClick={() => update((d) => { d.assumptions = structuredClone(DEFAULT_ASSUMPTIONS); })}>
          Reset assumptions to defaults
        </button>
      </Section>
    </div>
  );
}

function setAllocation(d: Plan, key: 'stocks' | 'bonds', v: number) {
  const al = d.assumptions.allocation;
  al[key] = Math.min(1, Math.max(0, v));
  const other = key === 'stocks' ? 'bonds' : 'stocks';
  al[other] = Math.min(al[other], 1 - al[key]);
  al.cash = +(1 - al.stocks - al.bonds).toFixed(6);
}

function SocialSecurityInputs({ id, person, ssWageGrowth, update, examplePia }: { id: PersonId; person: Person; ssWageGrowth: number; update: Update; examplePia: number | undefined }) {
  const ss = person.socialSecurity;
  const [draft, setDraft] = useState('');
  // Same wage-growth setting as the engine (D77), so this matches the detail view.
  const piaNow = ss.earnings.length ? computePia(ss.earnings, new Map(), { wageGrowth: ssWageGrowth, birthYear: person.birthYear }) : null;
  return (
    <div className="item">
      <h3>{person.name}</h3>
      <div className="grid2">
        <SelectField<'record' | 'manual'> label="How to estimate the benefit" help={HELP.ssMode} value={ss.mode}
          options={[{ value: 'record', label: 'Earnings record (recommended)' }, { value: 'manual', label: 'Statement estimate' }]}
          onChange={(v) => update((d) => { d[id].socialSecurity.mode = v; })} />
        <NumberField label="Start Social Security at age" help={HELP.claimAge} kind="int" {...L.claimAge} value={ss.claimAge}
          onChange={(v) => update((d) => { d[id].socialSecurity.claimAge = Math.min(70, Math.max(62, v ?? 67)); })} />
      </div>
      {ss.mode === 'manual' ? (
        <NumberField label="Monthly benefit at full retirement age" help={HELP.manualPia} {...NOT_NEGATIVE} value={ss.manualPia} example={examplePia}
          onChange={(v) => update((d) => { d[id].socialSecurity.manualPia = v ?? 0; })}
          hint="From your SSA statement. Warning: it assumes you keep working until you claim, so it is likely too high for an early retiree." />
      ) : (
        <div className="field">
          <label htmlFor={`earnings-${id}`}><Help text={HELP.earnings}>Your earnings history from ssa.gov</Help></label>
          <textarea id={`earnings-${id}`} rows={4} value={draft} placeholder={'2019  $55,848\n2020  $57,590\n…'} onChange={(e) => setDraft(e.target.value)} />
          <div className="row">
            <button className="btn small" disabled={!draft.trim()}
              onClick={() => { const parsed = parseEarnings(draft); update((d) => { d[id].socialSecurity.earnings = parsed; }); setDraft(''); }}>
              Import
            </button>
            {ss.earnings.length > 0 && (
              <button className="btn small" onClick={() => update((d) => { d[id].socialSecurity.earnings = []; })}>Clear</button>
            )}
          </div>
          <span className="hint">
            {ss.earnings.length
              ? `${ss.earnings.length} years imported (${ss.earnings[0].year}–${ss.earnings[ss.earnings.length - 1].year}). ` +
                `Benefit at full retirement age if you stopped working now: ${money(piaNow)}/mo. ` +
                'The calculator adds your future salary up to each retirement date.'
              : 'No earnings imported yet: the calculator will use only projected future salary.'}
          </span>
        </div>
      )}
    </div>
  );
}
