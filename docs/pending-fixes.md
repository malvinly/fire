# Pending fixes

Bug fixes and accuracy, clarity and robustness changes. None of these adds a capability; each makes the
calculator more correct or harder to misread. New capabilities are in
[pending-features.md](pending-features.md). Design choices already made for this work are in
[pending-decisions.md](pending-decisions.md).

Source: a five-reviewer audit of v1 (accuracy, planning completeness, competitive features, first-time-user
clarity, robustness). Numbers come from the v1 engine on the example plan unless marked *estimate*. See
[Reproducing the numbers](#reproducing-the-numbers).

## How to work on an item

Read [DESIGN.md](DESIGN.md) (what each result means) and skim [DECISIONS.md](DECISIONS.md) (the D-numbers
cited below) first. [DEVELOPMENT.md](DEVELOPMENT.md) has the layout and scripts. Then:

1. **Follow the decisions.** If an item names a [decision](pending-decisions.md), it has already been
   made; build what it says, and record it as a D-row in DECISIONS.md when the item lands. If the work
   raises a new design question that the docs don't answer, it belongs to the maintainer. Ask; don't
   choose.
2. **Write a failing test first** where the item says how to test it. It goes in the matching file in
   `tests/`; `tests/helpers.ts` has plan builders and fixed-return helpers.
3. **Make the change**, then run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
4. **Update the records:**
   - If results change for the same inputs, bump `DATA_VERSIONS.engine` in `src/engine/assumptions.ts`
     (D59) so saved sessions are flagged for recalculation.
   - Record any judgement call as a new D-number in DECISIONS.md (the next free number is **D63**). Update
     an existing D-row if its behavior changes, and update the "Which way the assumptions lean" table.
   - If the change affects an assumption shown to users, update its row in `describeAssumptions` in
     `src/engine/assumptions.ts` (the "How this works" page) and its help text in `src/ui/helpText.ts`.
   - Remove the item from this file.
5. **Adding a field to `Plan`** (`src/engine/types.ts`) needs care. Session files (`schemaVersion: 1`,
   `src/ui/sessions.ts`) and the browser draft (`loadDraft` in `src/App.tsx`) are loaded as saved, with no
   defaults filled in, so an old file would have the field undefined. Add a small migration that fills
   defaults from `examplePlan()` / `DEFAULT_ASSUMPTIONS` (`src/engine/defaults.ts`), ideally together with fix 9.
6. **Docs rules:** keep docs in neutral voice with no personal financial details. Commit messages carry no
   AI attribution.

Line numbers were written against commit `6394336` and have moved since; search for the function name given.

## Priority

Items are ordered by criticality:

- **P0**: the app gives a wrong or dangerously misleading answer that a user would act on.
- **P1**: materially changes a typical user's answer, or silently breaks on a plausible input.
- **P2**: a wrong answer in a narrower case, or a noticeable clarity gap.
- **P3**: polish and rare edge cases.

## Where warnings go

Decided in [decision 5](pending-decisions.md#5-precision-vs-hedging): **the result cards stay crisp**. They
show the target numbers only, with no caveat text. Every caution goes in one new panel, **"Before you act on
these numbers"**, placed directly below the cards and above "Try a different retirement year" (in
`src/App.tsx`, between the `cards` div and that panel).

- One short line per warning, and **only the lines that apply** to the current results.
- Lines name the tier they apply to ("Traditional 2039 …", "Coast …").
- Fixes 4, 6, 7, 13 (disclaimer), 18 and 19 (today's dollars) each add a line here. Fix 12's longer
  explanation goes in the detail view instead.
- Nothing new is added to `TierCard`.

Example for the example plan:

> **Before you act on these numbers**
> - Traditional 2039 and Chubby 2043 assume you'll have about $2.70M and $3.30M by then. Re-run each year
>   with your real balances.
> - Traditional 2039 is borderline (90.2%); it could be a year later.
> - In 19% of markets the Traditional plan pays a 10% penalty on early 401(k)/IRA withdrawals.
> - Coast assumes you both keep working until 65 with pay covering all spending, and stopping saving
>   includes giving up employer matches.
> - All amounts are in today's dollars. These are estimates, not financial advice. *What this doesn't model →*

---

## P0: wrong or dangerously misleading

---

## P1: materially changes answers or breaks on plausible input

---

## P2: narrower wrong answers, clarity gaps

---

## P3: polish and rare edges

### 22. Warn on dated items outside the plan (robustness)

- **Problem:** some items silently add $0: an ongoing item whose end is before its start, a one-time item in
  a year before the plan, or an item at an age already passed.
- **Where:** `itemYears` in `src/engine/context.ts:77`; `src/ui/DatedItemsEditor.tsx`.
- **Change:** export a helper that returns the item's in-plan years, and show a warning in the editor when
  there are none.

### 23. Recompute `searchPaths` from `paths` (robustness)

- **Problem:** the path-count field keeps a running minimum of `searchPaths` on every keystroke. Typing
  30000 key by key clamps `searchPaths` to 500 on the first "3", and it never recovers.
- **Where:** `src/ui/InputsPanel.tsx:181`.
- **Evidence:** Chubby FIRE number $3,297,400 → $3,335,300.
- **Change:** set `searchPaths = Math.min(DEFAULT_ASSUMPTIONS.searchPaths, paths)` (2,000) instead of the running
  minimum.

### 24. Cancel superseded worker requests (robustness)

- **Problem:**
  - Stale results are discarded correctly, but superseded work still runs.
  - Each year-picker change queues a full detail run on worker 0: 0.73 s at 10k markets, 4.9 s at 50k.
  - A new Calculate waits behind old solves.
- **Where:** `src/worker/client.ts` (it has `terminate` at ~line 34, used only on shutdown); the year picker
  and detail effect in `src/App.tsx`.
- **Evidence:** five "+" clicks at 50k markets queue ~25 s of work.
- **Change:** when a request is superseded, terminate and respawn the worker (or drop queued requests), and
  debounce the year picker.

---

## Checked and correct in v1

- **Arithmetic:** lump-sum and annuity growth match closed form to the cent; timing is consistently start of
  year (D7); fixed-dollar items are deflated correctly.
- **Taxes:** federal brackets, LTCG stacking, Social Security taxation (Pub 915), NIIT, and the 10%/20%
  penalties.
- **Accounts:** Roth ordering and 5-year seasoning; RMD ages and divisors.
- **Social Security:** claiming adjustments, spousal benefit, trust-fund interpolation.
- **Simulation:** bootstrap design (stocks, bonds, cash and inflation from the same year kept together);
  success is monotone in retirement year.
- **Historical benchmark:** 4% over 30 years succeeds in 97.6% of windows at 75/25, consistent with FI Calc.
- **Numeric robustness:** no float drift over 111-year horizons; divide-by-zero is guarded; every solver
  loop terminates.

## Reproducing the numbers

"Example plan" means `examplePlan(2026)` from `src/engine/defaults.ts`: plan start 2026, 10,000 simulated
markets, seed 20260924. Baseline results with the 10% bracket-fill default (fix 5), after fixes 1–5:

| Tier | Earliest year | FIRE number | Penalty rate at that year |
|---|---|---|---|
| Traditional | 2039 | $2,627,800 | 22.5% |
| Chubby | 2043 | $3,270,900 | 0% |
| Coast | stop saving now | $774,400 needed today | — |

v1 (12% fill) gave Traditional 2039 / $2,695,200 (37.5% penalty rate), Chubby 2043 / $3,297,400 and Coast $783,000.

Probes are easiest as a throwaway Vitest file **outside the repo**, run with the repo's dependencies:

```ts
// <scratch>/probe.test.ts
import { test } from 'vitest';
import { examplePlan } from 'C:/code/github/fire/src/engine/defaults';
import { makeEngine, solveTier, detailFor } from 'C:/code/github/fire/src/engine/solve';

test('probe', () => {
  const plan = examplePlan(2026);
  // plan.assumptions.bracketFill = '10';   // change inputs here
  const e = makeEngine(plan);
  const r = solveTier(e, 'traditional');
  const d = detailFor(e, 'traditional', 2039);
  console.log(r.earliest?.year, r.fireNumber, d.success, d.penaltyRate);
});
```

```ts
// <scratch>/vitest.config.mts
export default { test: { include: ['*.test.ts'], testTimeout: 600000 }, server: { fs: { strict: false } } };
```

Run it with `npx --prefix C:/code/github/fire vitest run --root <scratch> --reporter=verbose`. One
`solveTier` takes about 7 s at 10k markets; `detailFor` takes about 0.7 s.
