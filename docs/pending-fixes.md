# Pending fixes

Bug fixes and accuracy, clarity and robustness changes. None of these adds a capability; each makes the
calculator more correct or harder to misread. New capabilities are in
[pending-features.md](pending-features.md). The rules for correcting the model and adding settings are D81 in
[DECISIONS.md](DECISIONS.md).

The 24 fixes from the five-reviewer audit of v1 (accuracy, planning completeness, competitive features,
first-time-user clarity, robustness) have all landed; their decisions are D63–D80 in
[DECISIONS.md](DECISIONS.md). New items go under their priority below. See
[Reproducing the numbers](#reproducing-the-numbers) for the example plan's current results.

## How to work on an item

Read [DESIGN.md](DESIGN.md) (what each result means) and skim [DECISIONS.md](DECISIONS.md) (the D-numbers
cited below) first. [DEVELOPMENT.md](DEVELOPMENT.md) has the layout and scripts. Then:

1. **Follow the recorded decisions.** The D-rows an item cites are settled; D81 says which way to correct an
   error and where a new setting goes and what it defaults to, and D67 where warnings go. If the work raises a
   new design question that the docs don't answer, it belongs to the maintainer. Ask; don't choose.
2. **Write a failing test first** where the item says how to test it. It goes in the matching file in
   `tests/`; `tests/helpers.ts` has plan builders and fixed-return helpers.
3. **Make the change**, then run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
4. **Update the records:**
   - If results change for the same inputs, bump `DATA_VERSIONS.engine` in `src/engine/assumptions.ts`
     (D59) so saved sessions are flagged for recalculation.
   - Record any judgement call as a new D-number in DECISIONS.md (the next free number is **D82**). Update
     an existing D-row if its behavior changes, and update the "Which way the assumptions lean" table.
   - If the change affects an assumption shown to users, update its row in `describeAssumptions` in
     `src/engine/assumptions.ts` (the "How this works" page) and its help text in `src/ui/helpText.ts`.
   - Remove the item from this file.
5. **Adding a field to `Plan`** (`src/engine/types.ts`) needs care. Session files (`schemaVersion: 1`,
   `src/ui/sessions.ts`) and the browser draft (`loadDraft` in `src/App.tsx`) are loaded as saved. A new
   assumption gets its default from `DEFAULT_ASSUMPTIONS` automatically (`migratePlan` in
   `src/engine/migrate.ts`, D65); any other new field needs a line there, and a check in
   `src/engine/validate.ts` (D71).
6. **Docs rules:** keep docs in neutral voice with no personal financial details. Commit messages carry no
   AI attribution.


## Priority

Items are ordered by criticality:

- **P0**: the app gives a wrong or dangerously misleading answer that a user would act on.
- **P1**: materially changes a typical user's answer, or silently breaks on a plausible input.
- **P2**: a wrong answer in a narrower case, or a noticeable clarity gap.
- **P3**: polish and rare edge cases.

## Where warnings go

Decided in D67: **the result cards stay crisp**.
They show the target numbers only, with no caveat text. Every caution goes in the **"Before you act on these
numbers"** panel directly below the cards and above "Try a different retirement year". Its lines are built by
`beforeYouAct` in `src/ui/warnings.ts`.

- One short line per warning, and **only the lines that apply** to the current results.
- Lines name the tier they apply to ("Traditional 2039 …", "Coast …").
- Longer explanations go in the detail view (as D74 does for the markets that fail).
- Nothing new is added to `TierCard`.

The panel for the example plan today:

> **Before you act on these numbers**
> - Traditional 2039 and Chubby 2043 assume you'll have about $2.63M and $3.27M by then. Re-run each year
>   with your real balances.
> - Traditional 2039 is borderline (90.3%); it could be a year later.
> - In 27% of markets the Traditional plan pays a 10% penalty on early 401(k)/IRA withdrawals.
> - Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that stopping
>   saving includes giving up employer matches.
> - All amounts are in today's dollars. These are estimates, not financial advice. *What this doesn't model →*

---

## P0: wrong or dangerously misleading

None pending.

---

## P1: materially changes answers or breaks on plausible input

None pending.

---

## P2: narrower wrong answers, clarity gaps

### 25. Bond interest at each market's own yield (accuracy)

- **Problem:** D70 taxes brokerage bond interest at a fixed 4% of the bond share, while the cash share uses each
  market's own T-bill rate. In high-rate stretches (1966–1981 starts, 10-year yields about 5–15%), which often
  decide a 90% answer, bond interest is under-taxed; in the low-rate 1940s it is over-taxed. The fixed 2% dividend
  yield has the same issue, more weakly (history's dividend yields ran 4–6% for long periods).
- **Where:** `TAXABLE_YIELDS` in `src/engine/context.ts`; `investmentIncome` in `src/engine/simulate.ts`;
  `scripts/build-market-data.ts` already parses Shiller's GS10 column (and dividends) but doesn't keep them in
  `src/data/market.json`.
- **Change:** keep the January 10-year yield (and optionally the dividend yield) per year in `market.json`, carry it
  through `ReturnPaths` like `cash`, and use it in `investmentIncome`. Needs `npm run data:build` (network).
- **Test:** a path with a 10% bond yield taxes 10% of the bond share as interest.
- **Source:** adversarial review of the fixes (devil's advocate).

---

## P3: polish and rare edges

### 26. Detail-view caption on money in and out (clarity)

- **Problem:** the year-by-year table says money in equals spending plus taxes and penalty. In a year with an RMD
  that isn't all spent, "From 401(k)/IRA" includes the reinvested surplus, so the two sides differ.
- **Where:** the table caption and the `withdrawals.pretax` record in `src/engine/simulate.ts`.
- **Change:** record the reinvested RMD surplus separately (or subtract it from "From 401(k)/IRA") and say where it went.

### 27. Typing a year into the year picker (robustness)

- **Problem:** the "Retire in" box accepts only complete, valid years, so typing a new year digit by digit is undone
  at the first keystroke; only − / + and selecting-and-replacing work.
- **Where:** the year input in `src/App.tsx`.
- **Change:** keep the typed text locally and apply it when it is a valid year (as `NumberField` does).

### 28. Detail view of a stale session (clarity)

- **Problem:** opening a session whose results came from an older engine shows the saved cards, but the detail view
  is recalculated with the current engine, so the two can disagree until Recalculate.
- **Where:** `openSession` and the detail effect in `src/App.tsx`.
- **Change:** show the saved detail only (no refetch) while the recalculate banner is up, or recalculate on open.

### 29. Stronger detail-view and income-stacking tests (tests)

- **Problem:** the D73 test checks only the first retired year, so the 10-year window could shrink unnoticed; the
  D74 failure-year spending isn't tested with a fixed-dollar item; no test combines Social Security received while
  working with taxed dated income (the D66 layer on top of D49).
- **Where:** `tests/solve.test.ts`, `tests/paths.test.ts`.
- **Source:** adversarial review of the fixes (test skeptic).

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
markets, seed 20260924. Baseline results after all 24 fixes (engine version 4, 10% bracket-fill default):

| Tier | Earliest year | FIRE number | Success at that year | Penalty rate at that year |
|---|---|---|---|---|
| Traditional | 2039 | $2,630,700 | 90.3% | 26.9% |
| Chubby | 2043 | $3,274,700 | 91.9% | 0% |
| Coast | stop saving now | $803,000 needed today | 92.4% | 0% |

v1 (engine 3, 12% fill) gave Traditional 2039 / $2,695,200 (37.5% penalty rate), Chubby 2043 / $3,297,400
and Coast $783,000. The main moves: the 10% fill (fix 5) lowered Traditional's number and penalty rate; deflating
basis and Roth principal (fix 1) and taxing dividends and interest yearly (fix 8) pushed them back up, and fix 8
raised Coast's number by about 3%.

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
