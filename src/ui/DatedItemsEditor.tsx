import { itemYearsInPlan, planYears } from '../engine/context';
import type { DatedItem, DatedTiming, Plan } from '../engine/types';
import { FIELD_LIMITS } from '../engine/validate';
import { Help, NumberField, SelectField, TextField } from './fields';
import { whose } from './format';
import { HELP } from './helpText';
import { Icon } from './icons';

type Update = (fn: (draft: Plan) => void) => void;

function newItem(plan: Plan): DatedItem {
  return {
    id: crypto.randomUUID(),
    label: 'New item',
    direction: 'expense',
    amount: 10_000,
    frequency: 'ongoing',
    start: { kind: 'year', year: plan.startYear },
    fixedDollars: false,
    taxable: true,
  };
}

export function DatedItemsEditor({ plan, update }: { plan: Plan; update: Update }) {
  const edit = (id: string, fn: (it: DatedItem) => void) =>
    update((d) => {
      const it = d.datedItems.find((x) => x.id === id);
      if (it) fn(it);
    });

  return (
    <>
      <p className="muted">
        In today's dollars. Ongoing items you already pay today (e.g. a mortgage) are covered by your paycheck
        until you retire and are taken out of the Traditional and Chubby spending defaults automatically. Anything
        else dated before retirement (a roof, a car, a home sale) comes out of or goes into your cash and
        brokerage savings that year. Tip: split a mortgage into principal & interest (fixed dollars, ends at
        payoff) and property tax & insurance (rises with inflation, no end).
      </p>
      {plan.datedItems.map((it) => (
        <div key={it.id} className="item">
          <div className="item-head">
            <TextField label="Name" help={HELP.itemLabel} value={it.label} onChange={(v) => edit(it.id, (x) => { x.label = v; })} />
            <button className="btn small with-icon" aria-label={`Remove ${it.label}`} onClick={() => update((d) => { d.datedItems = d.datedItems.filter((x) => x.id !== it.id); })}>
              <Icon name="trash" />Remove
            </button>
          </div>
          <div className="row">
            <SelectField<'expense' | 'income'> label="Type" help={HELP.itemType} value={it.direction}
              options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income / inflow' }]}
              onChange={(v) => edit(it.id, (x) => { x.direction = v; })} />
            <SelectField<DatedItem['frequency']> label="How often" help={HELP.itemFrequency} value={it.frequency}
              options={[{ value: 'ongoing', label: 'Every year' }, { value: 'oneTime', label: 'One time' }, { value: 'recurring', label: 'Every N years' }]}
              onChange={(v) => edit(it.id, (x) => { x.frequency = v; if (v === 'recurring') x.everyYears ??= 10; })} />
            <NumberField label="Amount (each time)" help={HELP.itemAmount} {...FIELD_LIMITS.money} rangeMessage="Can’t be negative. Choose Expense or Income under Type instead." value={it.amount} onChange={(v) => edit(it.id, (x) => { x.amount = v ?? 0; })} />
          </div>
          <div className="row">
            <TimingField label={it.frequency === 'oneTime' ? 'When' : 'Starts'} help={HELP.itemStart} plan={plan} value={it.start}
              onChange={(t) => t && edit(it.id, (x) => { x.start = t; })} />
            {it.frequency !== 'oneTime' && (
              <TimingField label="Last year" help={HELP.itemEnd} plan={plan} value={it.end} optional
                onChange={(t) => edit(it.id, (x) => { x.end = t; })} />
            )}
            {it.frequency === 'recurring' && (
              <NumberField label="Repeats every … years" help={HELP.itemEvery} kind="int" {...FIELD_LIMITS.everyYears} value={it.everyYears ?? 1}
                onChange={(v) => edit(it.id, (x) => { x.everyYears = Math.max(1, v ?? 1); })} />
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={it.fixedDollars} onChange={(e) => edit(it.id, (x) => { x.fixedDollars = e.target.checked; })} />
            <Help text={HELP.itemFixed}>Fixed dollars (doesn't rise with inflation, e.g. mortgage payment)</Help>
          </label>
          {outsidePlan(plan, it) && <p className="warn">{outsidePlan(plan, it)}</p>}
          {it.direction === 'income' && (
            <label className="check">
              <input type="checkbox" checked={it.taxable !== false} onChange={(e) => edit(it.id, (x) => { x.taxable = e.target.checked; })} />
              <Help text={HELP.itemTaxable}>Taxed as income (untick for a home sale or a cash gift)</Help>
            </label>
          )}
        </div>
      ))}
      <button className="btn small" onClick={() => update((d) => { d.datedItems.push(newItem(d)); })}>+ Add dated item</button>
    </>
  );
}

/** A warning when the item adds nothing to the plan, or null (D79). */
function outsidePlan(plan: Plan, item: DatedItem): string | null {
  try {
    if (itemYearsInPlan(plan, item).length) return null;
    const { startYear, endYear } = planYears(plan);
    return `This item adds nothing: it has no year inside the plan (${startYear}–${endYear}). Check when it starts and ends.`;
  } catch {
    return null; // the plan itself is invalid; its own fields say why
  }
}

function TimingField({ label, help, plan, value, onChange, optional }: {
  label: string;
  help: string;
  plan: Plan;
  value: DatedTiming | undefined;
  onChange: (t: DatedTiming | undefined) => void;
  optional?: boolean;
}) {
  type Kind = 'year' | 'you' | 'spouse' | 'none';
  const kind: Kind = !value ? 'none' : value.kind === 'year' ? 'year' : value.person;
  const options: { value: Kind; label: string }[] = [
    ...(optional ? [{ value: 'none' as Kind, label: 'Plan end' }] : []),
    { value: 'year', label: 'Calendar year' },
    { value: 'you', label: `${whose(plan.you.name)} age` },
    { value: 'spouse', label: `${whose(plan.spouse.name)} age` },
  ];
  const setKind = (k: Kind) => {
    if (k === 'none') onChange(undefined);
    else if (k === 'year') onChange({ kind: 'year', year: value?.kind === 'year' ? value.year : plan.startYear });
    else onChange({ kind: 'age', person: k, age: value?.kind === 'age' ? value.age : plan.startYear - plan[k].birthYear });
  };
  return (
    <>
      <SelectField<Kind> label={label} help={help} value={kind} options={options} onChange={setKind} />
      {value && (
        <NumberField label={value.kind === 'year' ? 'Year' : 'Age'} help={HELP.itemWhen} kind="int" {...(value.kind === 'age' ? FIELD_LIMITS.age : FIELD_LIMITS.year)}
          value={value.kind === 'year' ? value.year : value.age}
          onChange={(v) => onChange(value.kind === 'year' ? { ...value, year: v ?? value.year } : { ...value, age: v ?? value.age })} />
      )}
    </>
  );
}
