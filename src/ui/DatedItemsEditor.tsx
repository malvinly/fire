import type { DatedItem, DatedTiming, Plan } from '../engine/types';
import { Help, NumberField, SelectField, TextField } from './fields';
import { HELP } from './helpText';

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
        Applied from the retirement date on, in today's dollars; anything dated before retirement is ignored
        (your paycheck covers it). Tip: split a mortgage into principal & interest (fixed dollars, ends at payoff)
        and property tax & insurance (rises with inflation, no end). Ongoing items you already pay today are
        taken out of the Fidelity spending default automatically.
      </p>
      {plan.datedItems.map((it) => (
        <div key={it.id} className="item">
          <div className="item-head">
            <TextField label="Name" help={HELP.itemLabel} value={it.label} onChange={(v) => edit(it.id, (x) => { x.label = v; })} />
            <button className="btn small" aria-label={`Remove ${it.label}`} onClick={() => update((d) => { d.datedItems = d.datedItems.filter((x) => x.id !== it.id); })}>
              Remove
            </button>
          </div>
          <div className="row">
            <SelectField<'expense' | 'income'> label="Type" help={HELP.itemType} value={it.direction}
              options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income / inflow' }]}
              onChange={(v) => edit(it.id, (x) => { x.direction = v; })} />
            <SelectField<DatedItem['frequency']> label="How often" help={HELP.itemFrequency} value={it.frequency}
              options={[{ value: 'ongoing', label: 'Every year' }, { value: 'oneTime', label: 'One time' }, { value: 'recurring', label: 'Every N years' }]}
              onChange={(v) => edit(it.id, (x) => { x.frequency = v; })} />
            <NumberField label="Amount (each time)" help={HELP.itemAmount} value={it.amount} onChange={(v) => edit(it.id, (x) => { x.amount = v ?? 0; })} />
          </div>
          <div className="row">
            <TimingField label={it.frequency === 'oneTime' ? 'When' : 'Starts'} help={HELP.itemStart} plan={plan} value={it.start}
              onChange={(t) => t && edit(it.id, (x) => { x.start = t; })} />
            {it.frequency !== 'oneTime' && (
              <TimingField label="Last year" help={HELP.itemEnd} plan={plan} value={it.end} optional
                onChange={(t) => edit(it.id, (x) => { x.end = t; })} />
            )}
            {it.frequency === 'recurring' && (
              <NumberField label="Repeats every … years" help={HELP.itemEvery} kind="int" min={1} value={it.everyYears ?? 10}
                onChange={(v) => edit(it.id, (x) => { x.everyYears = Math.max(1, v ?? 1); })} />
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={it.fixedDollars} onChange={(e) => edit(it.id, (x) => { x.fixedDollars = e.target.checked; })} />
            <Help text={HELP.itemFixed}>Fixed dollars (doesn't rise with inflation, e.g. mortgage payment)</Help>
          </label>
        </div>
      ))}
      <button className="btn small" onClick={() => update((d) => { d.datedItems.push(newItem(d)); })}>+ Add dated item</button>
    </>
  );
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
    { value: 'you', label: `${plan.you.name}'s age` },
    { value: 'spouse', label: `${plan.spouse.name}'s age` },
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
        <NumberField label={value.kind === 'year' ? 'Year' : 'Age'} help={HELP.itemWhen} kind="int"
          value={value.kind === 'year' ? value.year : value.age}
          onChange={(v) => onChange(value.kind === 'year' ? { ...value, year: v ?? value.year } : { ...value, age: v ?? value.age })} />
      )}
    </>
  );
}
