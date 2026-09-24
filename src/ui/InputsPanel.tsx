import { useState } from 'react';
import { LIMITS, TRUST_FUND_DEFAULT } from '../data/rules';
import { DEFAULT_ASSUMPTIONS, chubbyDefaultSpending, datedExpensesToday, fidelityDefaultSpending } from '../engine/defaults';
import { parseEarnings } from '../engine/earnings';
import { computePia } from '../engine/socialSecurity';
import type { BracketFill, Person, PersonId, Plan } from '../engine/types';
import { DatedItemsEditor } from './DatedItemsEditor';
import { Help, NumberField, Section, SelectField, TextField } from './fields';
import { money, percent } from './format';
import { HELP } from './helpText';

type Update = (fn: (draft: Plan) => void) => void;

const PEOPLE: PersonId[] = ['you', 'spouse'];

export function InputsPanel({ plan, update }: { plan: Plan; update: Update }) {
  const h = plan.household;
  const a = plan.assumptions;
  const salaries = plan.you.salary + plan.spouse.salary;
  const hsaLimit = LIMITS.hsaFamily + PEOPLE.filter((id) => plan.startYear - plan[id].birthYear >= 55).length * LIMITS.hsaCatchUp;
  const saved =
    PEOPLE.reduce((s, id) => {
      const c = plan[id].contributions;
      return s + c.pretax + c.employerMatch + c.roth + c.hsa;
    }, 0) + h.taxableContribution + h.cashContribution;

  return (
    <div>
      <Section title="People" icon="users" open>
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="person-col section-body">
              <TextField label="Name" help={HELP.name} value={plan[id].name} onChange={(v) => update((d) => { d[id].name = v; })} />
              <NumberField label="Birth year" help={HELP.birthYear} kind="int" value={plan[id].birthYear} onChange={(v) => update((d) => { d[id].birthYear = v ?? d[id].birthYear; })}
                hint={`Age ${plan.startYear - plan[id].birthYear} in ${plan.startYear}`} />
              <NumberField label="Birth month" help={HELP.birthMonth} kind="int" min={1} max={12} value={plan[id].birthMonth}
                onChange={(v) => update((d) => { d[id].birthMonth = Math.min(12, Math.max(1, v ?? 1)); })} />
              <NumberField label="Yearly salary (before taxes)" help={HELP.salary} value={plan[id].salary} onChange={(v) => update((d) => { d[id].salary = v ?? 0; })} />
            </div>
          ))}
        </div>
        <NumberField label="Plan starts in year" help={HELP.startYear} kind="int" value={plan.startYear} onChange={(v) => update((d) => { d.startYear = v ?? d.startYear; })}
          hint="Balances below are as of the start of this year." />
      </Section>

      <Section title="Balances" icon="wallet">
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="section-body">
              <h3>{plan[id].name}</h3>
              <NumberField label="Pre-tax 401(k)/403(b)/IRA" help={HELP.pretaxBalance} value={plan[id].balances.pretax} onChange={(v) => update((d) => { d[id].balances.pretax = v ?? 0; })} />
              <NumberField label="Roth 401(k)/IRA balance" help={HELP.rothBalance} value={plan[id].balances.roth} onChange={(v) => update((d) => { d[id].balances.roth = v ?? 0; })} />
              <NumberField label="…of which you put in" help={HELP.rothBasis} value={plan[id].balances.rothBasis}
                onChange={(v) => update((d) => { d[id].balances.rothBasis = v ?? 0; })}
                warn={plan[id].balances.rothBasis > plan[id].balances.roth ? 'More than the Roth total' : null}
                hint="Withdrawable anytime without tax or penalty" />
              <NumberField label="HSA balance" help={HELP.hsaBalance} value={plan[id].balances.hsa} onChange={(v) => update((d) => { d[id].balances.hsa = v ?? 0; })} />
            </div>
          ))}
        </div>
        <div className="subhead">Household</div>
        <div className="grid2">
          <NumberField label="Brokerage (non-retirement)" help={HELP.taxable} value={h.taxable} onChange={(v) => update((d) => { d.household.taxable = v ?? 0; })} />
          <NumberField label="…amount you paid in (cost basis)" help={HELP.taxableBasis} value={h.taxableBasis} onChange={(v) => update((d) => { d.household.taxableBasis = v ?? 0; })}
            hint="What you paid in; gains above it are taxed when sold" />
          <NumberField label="Cash / emergency fund" help={HELP.cash} value={h.cash} onChange={(v) => update((d) => { d.household.cash = v ?? 0; })} />
        </div>
      </Section>

      <Section title="Yearly contributions" icon="piggyBank">
        <div className="grid2">
          {PEOPLE.map((id) => {
            const p = plan[id];
            const age = plan.startYear - p.birthYear;
            const limit = LIMITS.employee401k + (age >= 50 ? LIMITS.catchUp401k : 0) + LIMITS.ira + (age >= 50 ? LIMITS.iraCatchUp : 0);
            const employee = p.contributions.pretax + p.contributions.roth;
            return (
              <div key={id} className="section-body">
                <h3>{p.name}</h3>
                <NumberField label="Pre-tax 401(k)/IRA" help={HELP.pretaxContribution} value={p.contributions.pretax} onChange={(v) => update((d) => { d[id].contributions.pretax = v ?? 0; })}
                  warn={employee > limit ? `Above 401(k)+IRA limits (${money(limit)})` : null} />
                <NumberField label="Employer match" help={HELP.employerMatch} value={p.contributions.employerMatch} onChange={(v) => update((d) => { d[id].contributions.employerMatch = v ?? 0; })} />
                <NumberField label="Roth 401(k)/IRA" help={HELP.rothContribution} value={p.contributions.roth} onChange={(v) => update((d) => { d[id].contributions.roth = v ?? 0; })} />
                <NumberField label="HSA" help={HELP.hsaContribution} value={p.contributions.hsa} onChange={(v) => update((d) => { d[id].contributions.hsa = v ?? 0; })} />
              </div>
            );
          })}
        </div>
        {plan.you.contributions.hsa + plan.spouse.contributions.hsa > hsaLimit && (
          <p className="muted">HSA contributions exceed the family limit ({money(hsaLimit)} with catch-ups at your ages).</p>
        )}
        <div className="grid2">
          <NumberField label="Brokerage" help={HELP.taxableContribution} value={h.taxableContribution} onChange={(v) => update((d) => { d.household.taxableContribution = v ?? 0; })} />
          <NumberField label="Cash savings" help={HELP.cashContribution} value={h.cashContribution} onChange={(v) => update((d) => { d.household.cashContribution = v ?? 0; })} />
        </div>
        <p className="text-2">
          Savings rate: <b>{percent(salaries > 0 ? saved / salaries : 0, 1)}</b> of gross pay ({money(saved)}/yr). Contributions grow {percent(a.wageGrowth, 1)}/yr above inflation.
        </p>
      </Section>

      <Section title="Spending" icon="receipt" open>
        <NumberField label="Current yearly spending (today)" help={HELP.currentSpending} value={h.currentSpending} onChange={(v) => update((d) => { d.household.currentSpending = v ?? 0; })}
          hint="Everything you spend today, including mortgage and any healthcare you pay yourself." />
        <NumberField label="Traditional FIRE: yearly retirement spending" help={HELP.traditionalSpending} value={h.traditionalSpending}
          onChange={(v) => update((d) => { d.household.traditionalSpending = v ?? 0; })}
          hint={
            <>
              Exclude healthcare and anything you add under Dated items (e.g. mortgage) — they're added separately.{' '}
              <button className="link" onClick={() => update((d) => { d.household.traditionalSpending = fidelityDefaultSpending(d); })}>
                Use Fidelity default ({money(fidelityDefaultSpending(plan))} = 0.85 × (current − {money(datedExpensesToday(plan))} dated items paid today))
              </button>
              {' '}If today's spending includes healthcare you pay yourself, subtract that too.
            </>
          } />
        <NumberField label="Chubby FIRE: yearly retirement spending" help={HELP.chubbySpending} value={h.chubbySpending} allowEmpty
          onChange={(v) => update((d) => { d.household.chubbySpending = v; })}
          warn={h.chubbySpending ? null : 'Required for the Chubby FIRE result'}
          hint={
            <>
              Same exclusions as above.{' '}
              <button className="link" onClick={() => update((d) => { d.household.chubbySpending = chubbyDefaultSpending(d); })}>
                Use default ({money(chubbyDefaultSpending(plan))} = 1.2 × (current − {money(datedExpensesToday(plan))} dated items paid today))
              </button>
              {' '}Clear it to skip Chubby FIRE.
            </>
          } />
        <NumberField label={`Coast FIRE: ${plan.you.name}'s age when you both stop working`} help={HELP.coastAge} kind="int" value={h.coastRetireAge}
          onChange={(v) => update((d) => { d.household.coastRetireAge = v ?? 65; })}
          hint="Coast = stop contributing, keep working (paycheck covers spending) until this age." />
      </Section>

      <Section title="Healthcare" icon="heartPulse">
        <div className="grid2">
          {PEOPLE.map((id) => (
            <div key={id} className="section-body">
              <h3>{plan[id].name}</h3>
              <NumberField label="Health costs before 65 (yearly)" help={HELP.preMedicare} value={plan[id].healthcare.preMedicare}
                onChange={(v) => update((d) => { d[id].healthcare.preMedicare = v ?? 0; })}
                hint="ACA premium + out-of-pocket, full price (no subsidy)" />
              <NumberField label="Health costs from 65 (yearly)" help={HELP.medicare} value={plan[id].healthcare.medicare}
                onChange={(v) => update((d) => { d[id].healthcare.medicare = v ?? 0; })}
                hint="Part B + D + Medigap + out-of-pocket" />
            </div>
          ))}
        </div>
        <p className="muted">Charged only in years you're retired. Grows {percent(a.healthcareInflation, 1)}/yr above inflation.</p>
      </Section>

      <Section title="Social Security" icon="landmark">
        {PEOPLE.map((id) => (
          <SocialSecurityInputs key={id} id={id} person={plan[id]} update={update} />
        ))}
      </Section>

      <Section title="Dated items (mortgage, car, home sale…)" icon="calendarClock">
        <DatedItemsEditor plan={plan} update={update} />
      </Section>

      <Section title="Assumptions (advanced)" icon="sliders">
        <div className="grid2">
          <NumberField label="Plan until the younger of you is age" help={HELP.endAge} kind="int" value={a.endAge} onChange={(v) => update((d) => { d.assumptions.endAge = v ?? 96; })}
            warn={Math.max(plan.you.birthYear, plan.spouse.birthYear) + a.endAge <= plan.startYear ? "Must be above the younger spouse's current age" : null} />
          <NumberField label="Required chance of success" help={HELP.targetSuccess} kind="percent" value={a.targetSuccess} min={0.5} max={0.99}
            onChange={(v) => update((d) => { d.assumptions.targetSuccess = Math.min(0.99, Math.max(0.5, v ?? 0.9)); })} />
          <NumberField label="Stocks share" help={HELP.stocks} kind="percent" value={a.allocation.stocks}
            onChange={(v) => update((d) => { setAllocation(d, 'stocks', v ?? 0); })} />
          <NumberField label="Bonds share" help={HELP.bonds} kind="percent" value={a.allocation.bonds}
            onChange={(v) => update((d) => { setAllocation(d, 'bonds', v ?? 0); })}
            hint={`Cash = the rest (${percent(a.allocation.cash)})`} />
          <NumberField label="Fund fees (expense ratio)" help={HELP.fees} kind="percent" value={a.feeRate} step={0.01} onChange={(v) => update((d) => { d.assumptions.feeRate = v ?? 0; })} />
          <NumberField label="Raises above inflation" help={HELP.wageGrowth} kind="percent" value={a.wageGrowth} onChange={(v) => update((d) => { d.assumptions.wageGrowth = v ?? 0; })} />
          <NumberField label="Healthcare cost growth above inflation" help={HELP.healthcareInflation} kind="percent" value={a.healthcareInflation} onChange={(v) => update((d) => { d.assumptions.healthcareInflation = v ?? 0; })} />
          <NumberField label="State income tax in retirement" help={HELP.stateTax} kind="percent" value={a.stateTaxRate} onChange={(v) => update((d) => { d.assumptions.stateTaxRate = v ?? 0; })} />
          <SelectField<BracketFill> label="Yearly Roth conversions: fill up to" help={HELP.bracketFill} value={a.bracketFill}
            options={[{ value: 'none', label: 'Off' }, { value: '10', label: '10% bracket' }, { value: '12', label: '12% bracket' }, { value: '22', label: '22% bracket' }, { value: '24', label: '24% bracket' }]}
            onChange={(v) => update((d) => { d.assumptions.bracketFill = v; })} />
          <NumberField label="Number of simulated markets" help={HELP.paths} kind="int" value={a.paths} min={500}
            onChange={(v) => update((d) => { d.assumptions.paths = Math.max(500, Math.round(v ?? 10_000)); d.assumptions.searchPaths = Math.min(d.assumptions.searchPaths, d.assumptions.paths); })} />
          <NumberField label="Simulated markets: chunk size (years)" help={HELP.blockLength} kind="int" value={a.blockLength} min={1}
            onChange={(v) => update((d) => { d.assumptions.blockLength = Math.max(1, Math.round(v ?? 5)); })} />
          <NumberField label="Random seed" help={HELP.seed} kind="int" value={a.seed} onChange={(v) => update((d) => { d.assumptions.seed = Math.round(v ?? 1); })} />
        </div>
        <div className="subhead">Social Security trust fund</div>
        <div className="grid2">
          <NumberField label="Benefit cut starts in (year)" help={HELP.tfStart} kind="int" value={a.ssTrustFund.startYear} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.startYear = v ?? TRUST_FUND_DEFAULT.startYear; })} />
          <NumberField label="Share paid when the cut starts" help={HELP.tfStartPct} kind="percent" value={a.ssTrustFund.startPct} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.startPct = v ?? 0; })} />
          <NumberField label="Cut deepens until (year)" help={HELP.tfEnd} kind="int" value={a.ssTrustFund.endYear} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.endYear = v ?? TRUST_FUND_DEFAULT.endYear; })} />
          <NumberField label="Share paid from then on" help={HELP.tfEndPct} kind="percent" value={a.ssTrustFund.endPct} onChange={(v) => update((d) => { d.assumptions.ssTrustFund.endPct = v ?? 0; })}
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

function SocialSecurityInputs({ id, person, update }: { id: PersonId; person: Person; update: Update }) {
  const ss = person.socialSecurity;
  const [draft, setDraft] = useState('');
  const piaNow = ss.earnings.length ? computePia(ss.earnings, new Map()) : null;
  return (
    <div className="item">
      <h3>{person.name}</h3>
      <div className="grid2">
        <SelectField<'record' | 'manual'> label="How to estimate the benefit" help={HELP.ssMode} value={ss.mode}
          options={[{ value: 'record', label: 'Earnings record (recommended)' }, { value: 'manual', label: 'Statement estimate' }]}
          onChange={(v) => update((d) => { d[id].socialSecurity.mode = v; })} />
        <NumberField label="Start Social Security at age" help={HELP.claimAge} kind="int" min={62} max={70} value={ss.claimAge}
          onChange={(v) => update((d) => { d[id].socialSecurity.claimAge = Math.min(70, Math.max(62, v ?? 67)); })} />
      </div>
      {ss.mode === 'manual' ? (
        <NumberField label="Monthly benefit at full retirement age" help={HELP.manualPia} value={ss.manualPia}
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
