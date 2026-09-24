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
