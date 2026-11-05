// Help text that carries numbers (D97).
import { expect, test } from 'vitest';
import { FIDELITY_MIX } from '../src/data/mixPaths';
import { mixPercents } from '../src/engine/mix';
import { COMMON_MIXES } from '../src/ui/helpText';

test('every common mix in the own-mix help adds up to 100%, and Fidelity’s FI Planner mix is among them (D97)', () => {
  for (const x of COMMON_MIXES) expect(x.mix[0] + x.mix[1] + x.mix[2]).toBe(100);
  expect(COMMON_MIXES.map((x) => x.mix)).toContainEqual(mixPercents(FIDELITY_MIX));
});
