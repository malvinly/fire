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

### 13. Disclose limitations in the app (clarity)

- **Problem:**
  - "How this works" lists only the ACA limitation. There is no not-advice disclaimer anywhere in the UI.
  - Several limitations are documented only for developers:
    - one retirement year for both spouses, both alive throughout (D13);
    - no Rule of 55 / 72(t);
    - flat state tax;
    - US-only data.
  - The DECISIONS "Which way the assumptions lean" table gives the wrong reason for D13. Survivor modeling
    leans optimistic because of two Social Security checks and joint tax brackets, not because "spending
    never drops" (that part leans conservative).
- **Where:**
  - `describeAssumptions` in `src/engine/assumptions.ts` (rows such as line 94), rendered by
    `src/ui/HowItWorks.tsx`.
  - `docs/DECISIONS.md:117`.
- **Change:**
  - Add a "What this doesn't model" group. It should cover:
    - the features not yet built (see [pending-features.md](pending-features.md));
    - things deliberately left out: ACA premium subsidies, separate retirement years per spouse, flexible
      spending / guardrails, IRMAA, asset location and per-state tax rules.
  - Add a D13 row.
  - Make the last line of the [warnings panel](#where-warnings-go) a disclaimer that links to the new group:
    "These are estimates, not financial advice. *What this doesn't model →*"
  - Fix the lean-table wording.

### 14. Search limit for age-gap couples (accuracy)

- **Problem:** the earliest-date search stops at the *first* person's age 75 (D43). The result therefore
  depends on who is entered as "You".
- **Where:** `solveTier`, `src/engine/solve.ts:250–251`. "Not reachable" text: `src/ui/Results.tsx:83`.
- **Evidence:**
  - You 74, spouse 58: Traditional says "Not reachable".
  - `detailFor` at later years gives 2030: 88%, 2032: 96%.
  - Swapping the two birth years gives earliest 2031.
  - For someone already past 75, the card says "Even retiring when You is 75…", which is false.
- **Change:**
  - Use the younger spouse's birth year + 75 (or `endYear − 1`) as the limit, and update D43.
  - Make the text name the limit actually used.
- **Test:** the solver result is the same with `you` and `spouse` swapped.

### 15. Coast number and today's account mix (accuracy)

- **Problem:**
  - Coast "Needed today" scales *today's* account mix up or down (`scaleState`).
  - A tiny balance held all in cash therefore prices the whole number as T-bills.
  - An all-zero balance uses the D50 rule (taxable at full basis), so the result jumps between $0 and $1.
- **Where:** `scaleState` in `src/engine/simulate.ts:54`; `minPortfolio` in `src/engine/solve.ts:203`; D50.
- **Evidence:**

  | Balances today | Coast "Needed today" |
  |---|---|
  | All zero | $676k |
  | $1 in cash only | **$3.02M** |
  | $1 in HSA | $743k |
  | $1 in pre-tax | $779k |

  A realistic case: a $20k emergency fund and nothing invested gives $3.02M.
- **Change:**
  - When today's balance is small, or mostly cash, scale a standard mix instead: D50's taxable, or the
    projected mix of contributions.
  - Show which mix the number assumes. Update D50.
- **Test:** Coast number with $1 in cash is within a few percent of the all-zero result.

### 16. Input ranges and warnings (robustness)

- **Problem:** many fields accept values that give confident nonsense instead of a warning.
- **Where:**
  - `NumberField` supports `min`, `max` and `warn` props (`src/ui/fields.tsx:52`); most money and rate
    fields in `src/ui/InputsPanel.tsx` don't set them.
  - Coast age field: `InputsPanel.tsx`.
  - Year picker: `src/App.tsx:256`.
- **Evidence:**
  - Coast age 200: "You can stop saving now", needs $900. Coast age 30 for a 42-year-old gives "Not
    reachable".
  - Negative pre-tax gives negative RMDs, and the plan still runs.
  - State tax at 60%: the tax loop failed to converge in 3,176 of 102,949 retired years, leaving up to $113k
    of tax unpaid. With realistic inputs it always converged.
  - Fees above 100% make balances negative. Negative trust-fund % gives negative Social Security.
  - The year picker past the plan end reports 100%.
- **Change:** block impossible values and warn on unusual ones
  ([decision 6](pending-decisions.md#6-validation-strictness)).
  - **Block** (the field won't accept the value, and says why):
    - negative balances, contributions or spending. The message says to enter debts as a dated expense,
      e.g. loan payments;
    - fees and tax rates below 0% or above 100%;
    - trust-fund percentage outside 0–100%;
    - coast age at or below You's current age, or at or past the plan end;
    - year picker past `endYear − 1`.
  - **Warn but allow** (a message under the field, like the existing end-age warning):
    - fees above 3%;
    - state tax above 15%;
    - healthcare growth above +10% or below 0% a year.
  - Fix 9's `validatePlan()` should reject blocked values in loaded files too.

### 17. Social Security wage growth (accuracy)

- **Problem:**
  - Earnings are indexed to a fixed wage-index year, with no real growth in the national wage index after
    it (D24; leans conservative).
  - The benefit formula scales with the wage-index level in the year a person turns 60. The benefit in
    today's dollars is therefore understated by about (1 + real wage growth)^(years until 60).
  - Manual mode has the same bias, because SSA statement figures are wage-indexed.
  - Salaries in the model grow 1.5% real while the national index grows 0%, which is inconsistent.
  - D24 calls the effect "slightly".
- **Where:** `computePia` in `src/engine/socialSecurity.ts:11–25`; `SOCIAL_SECURITY` in
  `src/data/rules.ts`; D24.
- **Evidence:** *Estimate.* Real wage-index growth 1985–2024 was about 0.90%/yr (wage index ÷ CPI).
  - Benefits come out ~22% low at age 40 and ~11% at 50.
  - Raising the example PIA from $2,500 to $3,000 (+20%) cuts the Traditional FIRE number from $2,695,200 to
    $2,563,300 (−4.9%). The retirement year is unchanged.
- **Change** ([decision 1](pending-decisions.md#1-which-way-to-correct)): make the growth rate a visible
  setting whose default keeps today's behavior.
  - Add an `ssWageGrowth` assumption: "Social Security wage growth above inflation", **default 0%**, in
    "Assumptions (advanced)" ([decision 2](pending-decisions.md#2-where-new-settings-go)).
  - Multiply the benefit by (1 + g)^(birthYear + 60 − awiLatestYear), and grow the taxable maximum the same
    way. At g = 0 the results must be identical to today's.
  - Add a How-this-works row and help text stating the size of the effect and the Trustees' intermediate
    assumption (~1.1%) as a reference. Update D24 to replace "slightly" with the size.
  - This adds an `Assumptions` field; see step 5 of [How to work on an item](#how-to-work-on-an-item).
- **Test:** g = 0 reproduces today's benefits exactly. g = 1.1% raises a 40-year-old's benefit by about
  (1.011)^20 ≈ 24%.

---

## P3: polish and rare edges

### 18. Mark borderline results (clarity)

- **Problem:** the earliest year can shift with the random seed when success at that year sits just over
  the target.
- **Where:** `successAtEarliest` in `TierResult`; `TierCard`.
- **Evidence:**

  | Seed | Traditional result |
  |---|---|
  | 20260924 (default), 1, 2, 3 | 2039 |
  | 4 | 2040 |

  At 2039 the simulated-market chance is 90.2%.
- **Change:** when combined success at the earliest year is within ~1.5 points of the target, add a line to
  the [warnings panel](#where-warnings-go): "{Tier} {year} is borderline ({success}); it could be a year
  later." Not on the card.

### 19. Today's dollars and the Social Security label (clarity)

- **Today's dollars:** the card figures (`src/ui/Results.tsx:83–120`) say "today's dollars" only in hover
  help. Say it once, in the last line of the [warnings panel](#where-warnings-go) ("All amounts are in
  today's dollars."), rather than adding labels to the cards.
- **Social Security in statement mode:** the detail label (`Results.tsx:201`) says "based on working until
  {year}". In statement mode the figure is exactly the entered `manualPia` (`src/engine/context.ts:88`), so
  it doesn't depend on that year. Use different text in manual mode.

### 20. Worst-years table: show when retirement began (clarity)

- **Problem:** rows are keyed to the plan's start year (whole-plan replay, D47). "Retiring into 1966"
  therefore appears as start year 1953 for a 2039 retirement.
- **Where:** `src/ui/Results.tsx:235`; the list is built in `detailFor` (`src/engine/solve.ts:315–321`).
- **Change:** add a column for the market year retirement began: `startYear + (retireYear − plan.startYear)`.
- **Related:** D47, [feature 5](pending-features.md#5-replay-any-historical-year).

### 21. Social Security first-year months (accuracy)

- **Problem:** the first year of benefits pays `13 − birthMonth` months.
  - SSA pays each month's benefit the following month, so at most `12 − birthMonth` months arrive that
    calendar year.
  - At 62, entitlement starts the month after the birthday month, which is one month fewer again.
- **Where:** `annualBenefits` in `src/engine/socialSecurity.ts:67` (own benefit) and `:77` (spousal).
- **Evidence:** a June-born claimant at 62 is paid 7 months in the first year; cash actually received is 5.
  That overpays $2–5k once.
- **Change:** use `12 − birthMonth` (and one fewer at 62), or document the convention in a D-row. Update
  `tests/socialSecurity.test.ts`.

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
