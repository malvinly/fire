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

Line numbers are as of commit `6394336`. If they have moved, search for the function name given.

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

### 1. Deflate tax-basis amounts each year (accuracy)

- **Problem:** Some amounts are fixed in nominal dollars: taxable cost basis, Roth contributions
  (`rothPrincipal`) and Roth conversion amounts (`conversions`). The engine works in today's dollars (D6),
  but it never deflates these amounts. As a result:
  - capital gains are understated;
  - early Roth access is overstated (a $133k conversion is treated as $133k when it seasons 5 years later,
    but it is worth ~$115k in today's dollars at 3% inflation).
  - This is not documented anywhere.
- **Where:**
  - `src/engine/simulate.ts` `simulatePath`, growth step (~lines 440–448): balances are multiplied by the
    real return and `priceLevel` advances, but the three amounts above are not touched.
  - `src/engine/solve.ts` `projectState` (~line 187) calls `constantPath(len, portfolio, cash)` with the
    default 0% inflation. `constantPath` (`src/engine/returns.ts:116`) takes a fourth `inflation` argument.
- **Evidence:** $100k at full basis, 5% real, 3% inflation, sold after 20 years:
  - Real value is $265,330 and the price level is 1.806.
  - The true gain share is 1 − 100,000/(265,330 × 1.806) = **79.1%**. The engine reports **62.3%**.
  - With a patched copy that deflates basis each year (and gives `projectState` average inflation), the
    example plan's Traditional date moves **2039 → 2040**. A plan heavy in taxable savings needs 0.7–1.4% more.
- **Change:**
  - After the growth step, divide `s.taxableBasis`, `s.rothPrincipal[i]` and every `s.conversions[i][k]`
    by `1 + paths.inflation[pi]`.
  - In `projectState`, pass `averageInflation()` (`solve.ts:183`) as the fourth argument to `constantPath`.
  - Add a D-row explaining it.
- **Test:** deterministic test with the 5% real / 3% inflation / 20-year case, asserting that the gain share
  of a sale is 79.1%. Also a Roth-seasoning test: a conversion is spendable at its deflated value.
- **Related:** D6, D42/D51.

### 2. Flag example values still in use (clarity)

- **Problem:**
  - The app starts with an example plan. Only the People section is open; Balances, Contributions,
    Spending, Healthcare, Social Security, Dated items and Assumptions start collapsed.
  - The only warning ("The left side is filled with example numbers…") disappears once results show.
  - "How this works" tags the example claim ages as "yours", because the status is hard-coded `'changed'`.
- **Where:**
  - `src/ui/InputsPanel.tsx`: the `<Section>` calls at lines 32–162 (only People has `open`).
  - `src/ui/fields.tsx` `Section`.
  - `src/App.tsx`: the empty-state text at ~line 219.
  - `src/engine/assumptions.ts:102`: the claim-age row.
  - The example plan itself is `examplePlan()` in `src/engine/defaults.ts`.
- **Evidence:** A 35-year-old couple (both born 1991, salaries $70k and $60k) who edit only People:
  - Coast says **"You can stop saving now"** (needs $560k, "has" the example's $880k).
  - Traditional says 2041.
  - With a real $60k saved, the answers are Coast 2035 and Traditional 2047.
- **Change:**
  - Compare each section's values with `examplePlan()`. While any section still matches, show a persistent
    banner above the results naming those sections. Alternatively, open all sections on first launch.
  - Base the claim-age status on the actual default value.
- **Test:** unit-test the "which sections are untouched" function. Check in the browser that the banner
  appears and clears.

### 3. Tax dated income (accuracy)

- **Problem:**
  - Dated income items (pension, part-time work, rental, inherited IRA) reduce what must be withdrawn,
    but they are never added to taxable income.
  - They also don't use up the bracket-fill room, so the Roth fill converts as if they didn't exist.
  - Before retirement, income items are saved to taxable at full basis, untaxed.
  - The help text says "Income isn't taxed by the model, so enter the after-tax amount". Users can't
    follow that, because the right rate is the engine's own marginal rate after the fill.
- **Where:**
  - `src/engine/simulate.ts`, retired branch: `inflow` (~line 357) is subtracted in `baseNeed` (~line 361),
    but not added in `taxOf` (~line 224) or the `bracketRoom` call (~line 369).
  - Working branch: dated items at ~lines 298–307.
  - `src/engine/context.ts`: builds `realIn`/`nominalIn` (~line 196).
  - `src/engine/types.ts`: `DatedItem` (~line 50).
  - `src/ui/DatedItemsEditor.tsx`.
  - `src/ui/helpText.ts:74`.
- **Evidence:**
  - Couple both 60, $700k pre-tax each, $40k/yr pension, 12% fill, 5% state tax. Tax is understated by
    **$10,800/yr**: the fill already fills the 12% bracket, so each pension dollar is taxed at 22% + 5%.
  - Example plan with a $30k pension from 60, entered gross: 2037 and $2.11M. Entered net of 27%: 2038 and
    $2.24M.
- **Change:**
  - Add `taxable?: boolean` to `DatedItem`: default true for income, and false for home sales and cash
    gifts (explained in the editor).
  - Keep separate taxable-inflow arrays in the context. Add them to ordinary income in `taxOf`, and pass
    them as existing ordinary income to `bracketRoom` so the fill shrinks.
  - While working, include them in the D49 extra-tax calculation.
  - This adds a `Plan` field; see step 5 of [How to work on an item](#how-to-work-on-an-item).
  - Update the help text.
- **Test:** retired year with a $40k taxable pension. Tax equals the tax on (fill + pension). The fill amount
  drops by the pension amount. A non-taxable item leaves tax unchanged.
- **Related:** D17, D29, D49.

### 4. Replace "Your date already allows for bad markets while you save" (clarity)

- **Problem:**
  - The earliest date is a probability seen from today: in 90% of futures the plan works if you retire
    then.
  - The sentence reads as permission to retire on that date whatever the balance. A user who arrives with
    less than "Savings needed" is well below target.
- **Where:** `src/ui/Results.tsx:113` (Traditional/Chubby card). Background is in D54.
- **Evidence:** Example plan, 2039. Arriving with the bad-market balance ($2.06M rather than the $2.70M
  needed) passes in only **~63%** of markets. That was measured with `evaluate(..., { retirementOnly: true })`
  from the projected 2039 account mix, scaled.
- **Change:**
  - Remove the sentence from the card.
  - Add a line to the [warnings panel](#where-warnings-go) for Traditional and Chubby: "{Tier} {year} assumes
    you'll have about {Savings needed} by then. Re-run each year with your real balances."
- **Related:** D54.

### 5. Roth ladder default and help text (accuracy / clarity)

- **Problem:**
  - The help says conversions "build early-retirement access". They only do if they season (5 years)
    before the owner's 59½, which the model treats as the calendar year they turn 60 (D14).
  - Pre-tax money is drawn from the older spouse first (D30).
  - On the example plan the conversions season the year "You" turns 60, so their only effect is conversion
    tax moved into the bridge years.
- **Where:**
  - `src/ui/helpText.ts:95–96` (`bracketFill`).
  - The year-by-year table is `COLUMNS` in `src/ui/Results.tsx:154`; the rows come from `YearRecord` in
    `src/engine/types.ts:117`.
  - Seasoning logic is `unseasoned` in `src/engine/simulate.ts:134`.
- **Evidence:** at the 2039 retirement year:

  | Fill | Needed | Penalty rate | Left in a bad market |
  |---|---|---|---|
  | Off | $2.631M | 15.7% | $291k |
  | 10% | $2.622M | 19.0% | $365k |
  | 12% (default) | $2.695M | 37.5% | $74k |

- **Change:**
  - **Change the default fill from the 12% to the 10% bracket**
    ([decision 3](pending-decisions.md#3-roth-conversion-default)): `bracketFill` in `DEFAULT_ASSUMPTIONS`
    (`src/engine/defaults.ts:15`).
    - Update D28/D29, which call 12% the "tax-efficient default".
    - Bump `DATA_VERSIONS.engine`.
    - Update any test that assumes 12%.
    - This changes the example plan's results, so refresh the baseline in
      [Reproducing the numbers](#reproducing-the-numbers).
  - Fix the help text.
  - Add a "Seasoned Roth available" value to `YearRecord`, filled when recording, and show it as a column.
  - Revisit the default once the survivor test ([feature 2](pending-features.md#2-what-if-one-of-you-dies-first))
    exists.
- **Related:** D14, D28, D29, D30.

---

## P1: materially changes answers or breaks on plausible input

### 6. Show the early-withdrawal penalty rate below the cards (clarity)

- **Problem:** Plans that must pay the 10% early-withdrawal penalty still count as successes (kept that
  way by [decision 4](pending-decisions.md#4-penalty-paths-as-success)). The share of markets where it
  happens appears only in the detail view.
- **Where:**
  - `successRate` already returns `penaltyRate` (`src/engine/solve.ts:133`).
  - `solveTier` (`solve.ts:230`) calls it at the earliest year (~line 260) but drops the value.
  - `TierResult` is at `solve.ts:19`, `TierCard` at `src/ui/Results.tsx:51`, and the detail tile at
    `Results.tsx:195`.
- **Evidence:** 37.5% at the example's headline Traditional date.
- **Change:**
  - Carry `penaltyRate` into `TierResult`.
  - When it is above ~5%, add a line to the [warnings panel](#where-warnings-go): "In X% of markets the
    {tier} plan pays a 10% penalty on early 401(k)/IRA withdrawals." Not on the card.
- **Related:** [decision 4](pending-decisions.md#4-penalty-paths-as-success).

### 7. Coast caveats and the 4% line (clarity)

- **Problem:**
  - "You can stop saving now" depends on both jobs covering all spending until the coast age.
  - Stopping also drops the employer match: `contributing = false` zeroes it along with everything else.
  - The card's "4% rule check" (a retirement-age figure) sits next to "Needed today" and reads as a
    contradiction.
- **Where:**
  - Hero text: `src/ui/Results.tsx:75–76`. 4% line: `Results.tsx:129`.
  - Match: `src/engine/context.ts:161–165`.
  - Coast explanation: `tierHelp` in `src/ui/Results.tsx:13`.
- **Evidence:** the example Coast card shows "You can stop saving now", "Needed today $783K" and
  "4% rule check … $2.74M".
- **Change:**
  - Add a line to the [warnings panel](#where-warnings-go): "Coast assumes you both keep working until
    {coast age} with pay covering all spending, and stopping saving includes giving up employer matches."
  - Move the "4% rule check" line off **all** cards and into the detail view.
    - Show it as a small stat, "Rule-of-thumb check (4% rule)", in the stats row of the savings chart panel
      (`DetailView`, `src/ui/Results.tsx:192`).
    - Show it for Traditional and Chubby only. For Coast it's a retirement-age figure that contradicts
      "Needed today".
    - The current card sentence (25 × (spending + first-year healthcare); ignores taxes and Social
      Security) becomes its "?" help.
    - The value is `simpleNumber` on the selected `TierResult`. Pass it into `DetailView`, or add it to
      `Detail`.

### 8. Tax brokerage dividends and interest yearly (accuracy)

- **Problem:**
  - The taxable account grows untaxed until sold (D34), justified as "most dividends fall in the 0% LTCG
    band". That doesn't hold:
    - the default 12% fill pushes investment income out of the 0% band (D39 says so);
    - wages do too while working;
    - interest from the bond and cash shares is ordinary income and never qualifies for 0%.
  - The cash account's interest is also untaxed.
- **Where:** `src/engine/simulate.ts` growth step (~lines 440–443) and D34.
- **Evidence:** *Estimate.* Assuming a 2.16% yield for 70/25/5, taxed at 24% while working and 18% retired,
  retirement came one year later in 3 of 4 test plans (example Traditional 2039 → 2040).
- **Change:**
  - Before growth, compute a yearly yield on the taxable and cash balances: qualified dividends taxed as
    gains, interest as ordinary income. Add it to basis when reinvested.
  - While working, the paycheck pays the tax (as in D49). In retirement, add it to that year's income for
    `taxOf`.
  - The yield assumptions per asset class need a D-row.
  - Minimum version: correct D34's reasoning and state the size of the effect.
- **Related:** D34, D39, D49, [decision 1](pending-decisions.md#1-which-way-to-correct).

### 9. Validate session files and the local draft (robustness)

- **Problem:**
  - `parseSession` checks only the outer wrapper (`app`, `schemaVersion`, and that `plan` is an object).
  - `loadDraft` checks nothing.
  - There is no React error boundary, so a bad plan blanks the page.
- **Where:** `src/ui/sessions.ts:36`, `src/App.tsx:23`, `src/main.tsx`.
- **Evidence:**
  - A browser draft missing `datedItems` blanks the page on every load until storage is cleared.
  - `household.taxable: "150000"` (text) makes the balance a concatenated string and moves Traditional from
    **2040 to 2027**.
  - The engine also accepts out-of-range values the UI would clamp: `birthMonth: 0`, `claimAge: 50`,
    `blockLength: 0` (every path becomes 1871 history), and `paths: 0` (crash).
- **Change:**
  - Add one `validatePlan()` (types, required fields, ranges) used by both loaders; reject with a clear
    message.
  - Fill defaults for missing optional fields (the migration hook for step 5 of
    [How to work on an item](#how-to-work-on-an-item)).
  - Add an error boundary with a "reset draft" button.
- **Test:** `parseSession` rejects each of the cases above. A plan missing an optional field loads with the
  default filled in.
- **Related:** D62.

### 10. Round whole-number fields (robustness)

- **Problem:** fields with `kind='int'` only set the input's `step`; typed decimals pass straight through.
- **Where:** `NumberField` and its `commit` in `src/ui/fields.tsx:52–68`.
- **Evidence:**
  - End age 96.5 or start year 2026.5 crashes Calculate ("Cannot read properties of undefined (reading
    'portfolio')"), because the year count becomes fractional.
  - Birth year 1984.5 gives NaN.
  - A one-time item at year 2030.5 adds $0.
  - Claim age 62.5 gets the 62.5 reduction but payments start at 63.
- **Change:** `Math.round` the parsed value before `onChange` when `kind === 'int'`. Consider also rounding
  in `planYears`/`buildContext` as a guard.
- **Test:** unit-test `commit` rounding. An engine test with a fractional end age either rounds or rejects
  cleanly.

### 11. Representative paths (accuracy)

- **Problem:**
  - The "typical market" year-by-year table (`medianPath`) and the "bad market" account chart (`p10Path`)
    are picked by ranking paths by *ending* balance.
  - A path that ends typical can be far from typical in the early years, which carry the most sequence
    risk.
- **Where:** `detailFor` in `src/engine/solve.ts:307–311`; used at `src/ui/Results.tsx:178` and `:229`.
- **Evidence:** example Traditional plan, 2039. At the end of 2039:
  - the table's first row shows $4.12M;
  - the chart's typical line (`bands.p50`) shows $3.31M, 24% lower;
  - the card's typical figure is $3.29M.
- **Change:** pick the path closest to `bands.p50`/`bands.p10`, for example by the smallest sum of squared log
  differences over the first 10 retired years. Or keep the method and relabel it "a sample market ending near
  the typical final balance".
- **Test:** the chosen path's first-retired-year balance is within a few percent of `bands.p50` at that index.

---

## P2: narrower wrong answers, clarity gaps

### 12. Say what happens in the other 10% (clarity)

- **Problem:** a 90% badge alone reads as a guarantee, or as a 1-in-10 chance of going broke soon after
  retiring.
- **Where:**
  - The detail view's savings chart panel (`DetailView`, `src/ui/Results.tsx:182`).
  - `SUCCESS_HELP` in `src/ui/helpText.ts`.
  - Per-path `failYear` is in the `outcomes` returned by `successRate` (`src/engine/solve.ts:115–133`);
    `detailFor` already has them for the chosen year.
- **Evidence:** in the example plan, failures occur in retirement year 29 or later, leaving about $40k/yr of
  Social Security against about $110k of spending.
- **Change:**
  - In `detailFor`, compute the median failure year among failed paths for the chosen year.
  - Show a short explanation next to the savings chart, which shows those bad markets. Not on the card, and
    not in the warnings panel ([decision 5](pending-decisions.md#5-precision-vs-hedging)). For example: "In
    about 1 in 10 markets savings run out, typically in retirement year N or later. You'd then live on
    Social Security (~$X/yr) unless you cut spending earlier."

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
markets, seed 20260924. Baseline results with the v1 defaults (12% bracket fill; fix 5 changes it to 10%,
after which these numbers change):

| Tier | Earliest year | FIRE number |
|---|---|---|
| Traditional | 2039 | $2,695,200 |
| Chubby | 2043 | $3,297,400 |

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
