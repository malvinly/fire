# Pending features

Enhancements that add something new to the calculator: new inputs, new modeling or new views, all of which
change or extend the answers it gives. Bug fixes and accuracy changes are in
[pending-fixes.md](pending-fixes.md); choices that must be settled first are in
[pending-decisions.md](pending-decisions.md).

Source: a five-reviewer audit of v1. Numbers come from the v1 engine on the example plan unless marked
*estimate*. How to reproduce them, and the workflow for any change (tests, `DATA_VERSIONS.engine`,
D-numbers, adding `Plan` fields safely), is in pending-fixes.md:
[How to work on an item](pending-fixes.md#how-to-work-on-an-item) and
[Reproducing the numbers](pending-fixes.md#reproducing-the-numbers). Line numbers are as of commit `6394336`.

Features are ordered by **importance**: how much each changes a typical user's answer.

**Any feature that adds a `Plan` or `Assumptions` field** (most of them) must fill that field's default for
older session files and drafts. The first such feature should add the migration hook (see fix 9).

## Summary

| # | Feature | Size of effect | Done well by |
|---|---|---|---|
| 1 | ACA premium subsidies | *Estimate:* ~15% smaller FIRE number, one year earlier | Boldin, ProjectionLab |
| 2 | Separate retirement year per spouse | *Estimate:* $350–400k less needed | ProjectionLab, Boldin |
| 3 | Roth conversion comparison | $70k and 2× the penalty rate on the example | Boldin, ProjectionLab |
| 4 | Baseline comparison and sensitivity | a 1% return cut moves the date 3 years | ProjectionLab, Engaging Data |
| 5 | Flexible spending / guardrails | *Estimate:* 10–20% more starting spending | FI Calc, Boldin |
| 6 | Survivor scenario | depends on the benefit gap | Boldin |
| 7 | State retirement-income exemptions | *Estimate:* ~$140k of portfolio in exempt states | Boldin |
| 8 | Rule of 55 / 72(t) | removes penalties in up to 37.5% of markets | ProjectionLab |
| 9 | Historical cycle explorer | trust, not the number | FI Calc, cFIREsim |
| 10 | Export and fuller tables | auditability | ProjectionLab, cFIREsim |
| 11 | Upside bands | context for one-more-year decisions | ProjectionLab, cFIREsim |

---

### 1. ACA premium subsidies

- **Today:** pre-65 healthcare is charged at full price in every non-working year (D21, D58). The "How this
  works" page says subsidies aren't modeled.
- **Why it matters:**
  - The default 12% Roth fill puts retirement MAGI at about $133k before Social Security. That is above
    400% of the poverty line for two (~$84.6k for 2026 coverage), where the credit is zero now that the
    enhanced credits have expired.
  - A household keeping MAGI under the line would pay about 9.96% of income toward the benchmark plan.
    For a couple of 60 on ~$31.8k of premiums, that's a credit of about $23.8k/yr.
  - Re-solving the example with a 10% fill and ~$6k net cost per person gave 2038 and $2.28M, against
    2039 and $2.70M.
  - *Estimate:* the FPL and 9.96% figures are the reviewer's 2026 numbers, not checked against source.
- **Where:**
  - Healthcare per year: `buildContext`, `src/engine/context.ts:171–181`.
  - Tax: `computeTax` in `src/engine/tax.ts`.
  - The retired-year tax loop: `simulatePath` in `src/engine/simulate.ts` ~lines 357–380. MAGI = ordinary
    + gains + untaxed Social Security.
  - Yearly data: `src/data/rules.ts`, refreshed by `docs/UPDATE_DATA_PROMPT.md`.
- **Minimal version:**
  - **Interim** (no engine change): help text on the pre-65 cost and the fill. "If you'll keep income
    under ~$84.6k (two people), enter the subsidized price from healthcare.gov and use the 10% fill."
  - **Full:**
    - add the FPL and the applicable-percentage table to `rules.ts` and the data-update prompt;
    - compute the credit from each retired pre-65 year's MAGI inside the tax loop (it is circular, since
      a smaller cost means smaller withdrawals and a lower MAGI);
    - add an option to cap the Roth fill at 400% FPL while anyone is under 65.
- **Test:** a year at MAGI $80k gets the expected credit; at $90k it gets zero. The fill cap holds MAGI
  under the line.
- **Related:** D21, D29, D58; [decision 1](pending-decisions.md#1-which-way-to-correct).

### 2. Separate retirement year per spouse

- **Today:** both spouses stop working in the same year (D13). A common real pattern is one spouse working
  a few more years, often for employer health cover. The only workaround is a dated income item, which is
  untaxed (fix 3).
- **Why it matters:** *Estimate:* three extra years on a $100k salary means:
  - ~$76k/yr of spending covered by the paycheck;
  - ~$32k/yr of pre-65 premiums avoided;
  - ~$25k/yr more contributions.

  That is $350–400k less needed when the first spouse stops.
- **Where:**
  - `Scenario` (`src/engine/types.ts:109`) has one `retireYear`.
  - `buildContext` (`src/engine/context.ts`) derives a household `working[t]` and `wages`.
  - `scenarioFor` and `earliestYear` (`src/engine/solve.ts:95`, `:166`) search one year.
  - Year picker: `src/App.tsx`.
- **Minimal version:**
  - Keep the solver searching the *first* spouse's stop year. Add a per-person input "keeps working N more
    years" (default 0).
  - Make `working`, wages and contributions per person in the context.
  - Charge pre-65 healthcare only in years when neither spouse has employer cover (an input).
  - Update D13 and the How-this-works rows.
- **Test:** with N=0, results match today's exactly. With N=3, success at the same first-stop year rises.

### 3. Roth conversion comparison

- **Today:** one bracket-fill setting at a time, with no feedback on whether it helps. On the example
  plan, at the 2039 retirement year:

  | Fill | Needed | Penalty rate | Bad-market end |
  |---|---|---|---|
  | Off | $2.631M | 15.7% | $291k |
  | 10% | $2.622M | 19.0% | $365k |
  | 12% (default) | $2.695M | 37.5% | $74k |
  | 22% | $2.728M (earliest 2040) | 66.1% | $0 |

- **Where:**
  - `detailFor` (`src/engine/solve.ts:288`, ~0.7 s at 10k markets).
  - Worker request types: `src/worker/engine.worker.ts:6–7`.
  - Detail panel: `DetailView` (`src/ui/Results.tsx:174`).
  - Fill options: `bracketFill` in `Assumptions` (`src/engine/types.ts:68`).
- **Minimal version:**
  - A "Compare Roth conversion settings" button in the detail panel.
  - It runs `detailFor` for each fill option at the chosen year, on a copy of the plan with
    `assumptions.bracketFill` changed and spread across the worker pool.
  - It shows success, penalty rate, bad-market end balance and median end balance in a small table.
- **Blocked by:** [decision 3](pending-decisions.md#3-roth-conversion-default) (whether the default
  changes). Fix 5 (help text) can ship first.

### 4. Baseline comparison and sensitivity

- **Today:**
  - Every "what if" means editing inputs, recalculating (~10 s) and remembering the old numbers. There is
    no expected-return input.
  - The fee (`feeRate`) is subtracted from every real return (`realYears`, `src/engine/returns.ts:38–42`),
    so it already works as a return haircut. Fee 0.1% → 1.1% moves the example **2039 → 2042**.
- **Where:** results state in `src/App.tsx`; `TierCard` in `src/ui/Results.tsx:51`; `feeRate` in
  `returns.ts`.
- **Minimal version:**
  - "Keep as baseline" button: store the current `TierResult`s. After the next Calculate, show the baseline
    beside each card with deltas in years and dollars. No engine work.
  - A "Return adjustment (± per year)" assumption, applied on the same code path as `feeRate`, with its own
    How-this-works row.
  - Side-by-side comparison of saved sessions comes later.
- **Test:** return adjustment −1% gives the same results as a fee raised by 1%.

### 5. Flexible spending / guardrails

- **Today:** spending is fixed in real terms (`baseSpending`). A 90% target with rigid spending sizes the
  plan to the worst 10% of paths.
- **Why it matters:** *Estimate (literature, not verified):* modest cuts in bad markets support roughly
  10–20% higher starting spending at similar risk (Guyton-Klinger, Kitces).
- **Where:** spending need in `simulatePath` (`src/engine/simulate.ts` ~line 361); `outcomes` from
  `successRate` (`src/engine/solve.ts:115–133`).
- **Minimal version:**
  - **Step 1 (report only):** for failed paths at the chosen year, compute the smallest uniform spending cut
    from the first bad year that would have avoided failure. Show "in the worst 10% you'd cut X% for Y
    years". This doesn't change success.
  - **Step 2:** an optional guardrail rule (cut Z% when the withdrawal rate exceeds a threshold). This
    changes the success definition and needs a D-row.
- **Related:** [decision 5](pending-decisions.md#5-precision-vs-hedging), fix 12.

### 6. Survivor scenario

- **Today:** both spouses live to the end (D13). Both Social Security checks and joint tax brackets
  continue.
- **Why it matters:** *Estimate,* for the example plan (both PIA $2,500, claiming at 67):
  - the survivor loses ~$21k/yr of Social Security;
  - the same $85k of pre-tax withdrawals costs $13,346 in tax single vs $9,728 joint;
  - spending typically drops 20–30%, and one Medicare cost disappears.

  Roughly neutral for equal earners; worse with unequal benefits and large pre-tax balances.
- **Where:**
  - Social Security: `annualBenefits` in `src/engine/socialSecurity.ts:60`.
  - Tax: `src/engine/tax.ts` and `FEDERAL` in `src/data/rules.ts`, which has joint brackets only, so single
    brackets and the single standard deduction would need adding and refreshing yearly.
  - Healthcare and spending: `buildContext`.
- **Minimal version:** an optional "first death: {person} at age X" input. From the following year:
  - the survivor gets the larger of the two benefits;
  - single brackets apply;
  - spending drops by a set % (default ~25%);
  - one healthcare line is removed.

  Results show success under that scenario.
- **Related:** fix 13 (disclosure).

### 7. State retirement-income exemptions

- **Today:** one flat state rate on ordinary income plus gains, minus the federal standard deduction
  (`computeTax`, `src/engine/tax.ts:70`). Social Security is excluded.
- **Why it matters:** *Estimate:*
  - Illinois fully exempts IRA/401(k) withdrawals and conversions, Pennsylvania does from 59½, and
    Mississippi exempts retirement income. New York and Georgia exempt part.
  - At 5%, that's ~$5k/yr, roughly $140k of portfolio.
  - A flat rate also overstates tax if users enter their top marginal rate.
- **Minimal version:**
  - **Interim:** help text (`stateTax` in `src/ui/helpText.ts:94`): "Use your effective rate. If your state
    exempts retirement-account withdrawals, enter a much lower rate."
  - **Full:** a second assumption, "State rate on retirement-account withdrawals", applied to pre-tax
    withdrawals and conversions, with the flat rate kept for gains and other income.
- **Related:** D33.

### 8. Rule of 55 / 72(t)

- **Today:**
  - Pre-tax money is penalty-free from the calendar year a person turns 60 (D14). Earlier withdrawals pay
    10%.
  - In the example, "You" retires at exactly 55, and 37.5% of markets pay the penalty.
- **Where:** `ctx.access[i][t] = age >= 60 ? 1 : 0` at `src/engine/context.ts:153`, read in `planDraws`
  (`src/engine/simulate.ts:156`).
- **Minimal version:**
  - A per-person "leaves employer at 55 or later" checkbox. When set and the person stops working at 55+,
    that person's pre-tax balance is accessible from the retirement year.
  - This simplifies things: the rule applies only to the last employer's 401(k), not IRAs. Record that in a
    D-row.
  - 72(t) SEPP comes later.
- **Test:** retiring at 55 with the flag gives a 0% penalty rate for that person's withdrawals.
- **Related:** fix 6, [decision 4](pending-decisions.md#4-penalty-paths-as-success).

### 9. Historical cycle explorer

- **Today:** the worst-years table lists 5 whole-plan start years (D47). Rows aren't clickable, and there's
  no way to see a named cycle such as retiring into 1929, 1966 or 2000.
- **Where:** `detailFor` builds `worstHistorical` (`src/engine/solve.ts:315–321`); `simulatePath(..., { record:
  true })` gives year-by-year records; the table is at `src/ui/Results.tsx:235`.
- **Minimal version:**
  - Clickable rows that show that window's year-by-year table and account chart.
  - A "retirement market year" search box.
  - Needs fix 20's market-year column first.

### 10. Export and fuller tables

- **Today:**
  - The year-by-year table shows only the typical path's retired years (`src/ui/Results.tsx:178`).
  - The bad-market path appears only as stacked bars, so its conversions and penalties are invisible.
  - Coast's working and coasting years never appear.
  - There is no CSV, copy or print anywhere.
- **Minimal version:**
  - A typical/bad toggle on the table (same `COLUMNS`) and a "show working years" checkbox.
  - A "Download CSV" button that serializes the visible `YearRecord[]` client-side (Blob download).
  - CSVs are already git-ignored (see DEVELOPMENT.md → Privacy).

### 11. Upside bands and ending-balance summary

- **Today:** bands are 50th/25th/10th only (`detailFor` `bands`, `src/engine/solve.ts:297`; `BandsChart` in
  `src/ui/charts.tsx:107`). There is no view of the chance of ending with far more than needed.
- **Minimal version:**
  - Add p75/p90 to `bands` and show them behind the existing zoom toggle.
  - Add one stat: ending balance at 10th / 50th / 90th percentile.

---

## Lower priority

- **IRMAA.** Low impact under the default fill: MAGI stays around $133–145k, below the $218k joint tier.
  Worth revisiting alongside feature 6 (single thresholds are half).
- **International market data.** US history is the big winner, which leans optimistic (DECISIONS lean
  table).
- **Asset location.** Different mixes per account.
- **Per-state tax rules**, beyond feature 7.
