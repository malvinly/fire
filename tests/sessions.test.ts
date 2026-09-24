// Loading session files and the browser draft (D62, D65).
import { describe, expect, test } from 'vitest';
import { DEFAULT_ASSUMPTIONS, examplePlan } from '../src/engine/defaults';
import { makeSession, parseSession } from '../src/ui/sessions';

function sessionText(edit: (plan: Record<string, unknown>) => void = () => {}): string {
  const s = JSON.parse(JSON.stringify(makeSession('test', examplePlan(2026), null)));
  edit(s.plan);
  return JSON.stringify(s);
}

describe('older plan files', () => {
  test('a missing assumption is filled with its default', () => {
    const s = parseSession(sessionText((plan) => { delete (plan.assumptions as Record<string, unknown>).seed; }));
    expect(s.plan.assumptions.seed).toBe(DEFAULT_ASSUMPTIONS.seed);
  });
});

test('dated income saved before the "taxed" flag existed is taxed (D66)', () => {
  const s = parseSession(sessionText((plan) => {
    plan.datedItems = [
      { id: 'p', label: 'pension', direction: 'income', amount: 20_000, frequency: 'ongoing', start: { kind: 'year', year: 2040 }, fixedDollars: false },
      { id: 'r', label: 'roof', direction: 'expense', amount: 20_000, frequency: 'oneTime', start: { kind: 'year', year: 2030 }, fixedDollars: false },
    ];
  }));
  expect(s.plan.datedItems[0].taxable).toBe(true);
  expect(s.plan.datedItems[1].taxable).toBeUndefined();
});
