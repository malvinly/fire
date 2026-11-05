// The Investments section's logic (D97): what it says under "Asset mix over time", which shift ages it refuses, how a typed share changes a mix, and what "Reset assumptions to defaults" keeps.
// Plain functions so they can be tested (D87). Every mix shown goes through mixPercents, so none adds up to 99 or 101.

import { FIDELITY_MIX, VANGUARD_PATH } from '../data/mixPaths';
import { mixInYear, mixLabel, mixPercents, mixShiftYears, type Allocation } from '../engine/mix';
import { DEFAULT_ASSUMPTIONS } from '../engine/defaults';
import type { Assumptions, Plan } from '../engine/types';
import { FIELD_LIMITS } from '../engine/validate';
import { andList, whose } from './format';

export { mixLabel } from '../engine/mix';

/** "you turn 65" / "Ana turned 65": past tense once the year is before the plan's first year. */
function turns(name: string, age: number, year: number, startYear: number): string {
  const you = whose(name) === 'your'; // the default name, by the same rule as the rest of the UI
  const past = year < startYear;
  return `${you ? 'you' : name} ${past ? 'turned' : you ? 'turn' : 'turns'} ${age}`;
}

/** The sentence under the dropdown for Vanguard's path: its points still ahead, from the plan's first year on. */
export function vanguardSentence(plan: Plan): string {
  const start = plan.startYear;
  const target = plan.you.birthYear + VANGUARD_PATH.targetAge;
  const pts = VANGUARD_PATH.points.map((p) => target + p.years);
  const stocks = (year: number) => `${mixPercents(mixInYear(plan, year))[0]}%`;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let path: string;
  if (start >= last) {
    path = `${stocks(last)} stocks every year (its final mix since ${last})`;
  } else {
    const parts = start <= first ? [`${stocks(first)} stocks until ${first}`] : [`${stocks(start)} stocks in ${start}`];
    for (const y of pts.slice(1)) {
      if (y <= start) continue;
      parts.push(y === last ? `${stocks(y)} from ${y}` : `${stocks(y)} in ${y}`);
    }
    path = andList(parts);
  }
  return `Follows the path Vanguard publishes for its Target Retirement funds, tied to the year ${turns(plan.you.name, VANGUARD_PATH.targetAge, target, start)} (${target}): ${path}; the rest in bonds.`;
}

/** The sentence under the dropdown for Fidelity's fixed mix. */
export function fidelitySentence(): string {
  return `${mixLabel(FIDELITY_MIX)} every year, the mix Fidelity’s FI Planner uses.`;
}

/** The line under the own-mix fields: what the entries mean, in calendar years, and the plan's first year's mix. */
export function ownMixLine(plan: Plan): string {
  const a = plan.assumptions;
  const own: Plan = { ...plan, assumptions: { ...a, mixPlan: 'own' } }; // what the fields describe, whichever choice is in use
  const shifts = mixShiftYears(own);
  if (!shifts) return `${mixLabel(a.allocation)}, held every year.`;
  const move = `from ${mixLabel(a.allocation)} to ${mixLabel(a.laterAllocation)}`;
  const now = `In ${plan.startYear}: ${mixLabel(mixInYear(own, plan.startYear))}.`;
  if (a.shiftStartAge === a.shiftEndAge) {
    return `One switch in ${shifts.first}, the year ${turns(plan.you.name, a.shiftStartAge, shifts.first, plan.startYear)}: ${move}. ${now}`;
  }
  const steps = a.shiftEndAge - a.shiftStartAge + 1;
  return `${steps} equal yearly steps, one in each year from ${shifts.first} to ${shifts.last} (${whose(plan.you.name)} ages ${a.shiftStartAge} to ${a.shiftEndAge}): ${move}. ${now}`;
}

const AGE = FIELD_LIMITS.age;
export const MIX_AGE_RANGE_MESSAGE = `Must be a whole age from ${AGE.min} to ${AGE.max}.`;

/**
 * Why a typed shift age can't be accepted, or null. The plan must never hold a finish age below the start age
 * (validate.ts rejects such a file), so each field refuses an entry that would cross the other.
 */
export function shiftAgeProblem(a: Assumptions, which: 'start' | 'end', age: number): string | null {
  if (!Number.isInteger(age) || age < AGE.min || age > AGE.max) return MIX_AGE_RANGE_MESSAGE;
  if (which === 'start' && age > a.shiftEndAge) return `Can’t be above the finish age (${a.shiftEndAge}). Raise that first.`;
  if (which === 'end' && age < a.shiftStartAge) return `Can’t be below the start age (${a.shiftStartAge}). Lower that first.`;
  return null;
}

/** The dropdown option for Fidelity's fixed mix, e.g. "Fidelity’s fixed mix (70/25/5)". */
export function fidelityOptionLabel(): string {
  return `Fidelity’s fixed mix (${mixPercents(FIDELITY_MIX).join('/')})`;
}

/**
 * The mix after typing a stocks or bonds share: the share is clamped to 0–100%, the other one shrinks if the two would
 * pass 100%, and cash is the rest. Both computed shares are rounded to 6 decimals so that typing the same percents
 * always gives the same numbers (70 and 25 give exactly FIDELITY_MIX); the engine compares mixes exactly.
 */
export function withShare(m: Allocation, key: 'stocks' | 'bonds', v: number): Allocation {
  const next = { ...m, [key]: Math.min(1, Math.max(0, v)) };
  const other = key === 'stocks' ? 'bonds' : 'stocks';
  next[other] = Math.min(next[other], +(1 - next[key]).toFixed(6));
  next.cash = +(1 - next.stocks - next.bonds).toFixed(6);
  return next;
}

/**
 * "Reset assumptions to defaults": everything shown under Assumptions (advanced) back to DEFAULT_ASSUMPTIONS, while
 * the Investments section's fields (mix choice, both own mixes, shift ages, fund fees) stay as entered. A fresh object.
 */
export function resetAdvancedAssumptions(a: Assumptions): Assumptions {
  return {
    ...structuredClone(DEFAULT_ASSUMPTIONS),
    mixPlan: a.mixPlan,
    allocation: { ...a.allocation },
    laterAllocation: { ...a.laterAllocation },
    shiftStartAge: a.shiftStartAge,
    shiftEndAge: a.shiftEndAge,
    feeRate: a.feeRate,
  };
}
