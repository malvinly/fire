# Pending fixes

Bug fixes and accuracy, clarity and robustness changes. None adds a new capability; each makes the existing
calculator more correct or harder to misread. New capabilities are in
[pending-features.md](pending-features.md); choices that need a decision first are in
[pending-decisions.md](pending-decisions.md).

Source: a five-reviewer audit of v1 (accuracy, planning completeness, competitive features, first-time-user
clarity, robustness). Numbers come from runs of the v1 engine on the example plan (plan start 2026, 10,000
simulated markets, seed 20260924) unless marked *estimate*.

Ordered by criticality:

- **P0**: the app gives a wrong or dangerously misleading answer that a user would act on.
- **P1**: materially changes a typical user's answer, or silently breaks on a plausible input.
- **P2**: a wrong answer in a narrower case, or a noticeable clarity gap.
- **P3**: polish and rare edge cases.

## P0: wrong or dangerously misleading

| # | Fix | Kind | Evidence | Minimal change |
|---|---|---|---|---|
| 1 | **Deflate tax-basis amounts each year.** Taxable basis, Roth contributions and Roth conversion amounts are fixed nominal amounts. They are carried in today's dollars without deflating, so capital gains are understated and early Roth access is overstated. Undocumented (D6 says only "everything is real"). | Accuracy | $100k held 20 yrs at 5% real / 3% inflation: gain share 62.3% instead of 79.1%. With the fix, the example plan's Traditional date moves **2039 → 2040**. | After the growth step in `simulate.ts`, divide `taxableBasis`, `rothPrincipal[i]` and `conversions[i][*]` by `1 + inflation`. Give `projectState` average inflation. Add a deterministic test on the 79.1% case. |
| 2 | **Flag example values still in use.** Only People is open by default. The other sections keep example numbers, and nothing warns about them once results show. "How this works" tags the example claim ages as "yours" (`assumptions.ts:102`). | Clarity | A 35-year-old couple who edit only People is told **"You can stop saving now"** on the example's $880k. With a real $60k saved, the answers are Coast 2035 and Traditional 2047 (not 2041). | Show a persistent banner while any section holds untouched example values, or open every section on first launch. Base the claim-age "yours"/"default" tag on the actual value. |
| 3 | **Tax dated income.** Income items (pension, part-time work, rental, inherited IRA) are never taxed and don't shrink the Roth-ladder bracket room (`simulate.ts:308-311`). The "enter after-tax" tooltip can't be followed, because the right rate is the engine's own marginal rate after the fill. Income before retirement is also saved untaxed. | Accuracy | $40k pension at 60 with the 12% fill: tax is understated by **$10,800/yr**. A $30k pension entered gross makes the example look one year earlier and ~$127k cheaper than it should. | Add a "Taxable as ordinary income" checkbox on income items: default on, off for home sales and cash gifts. Add checked amounts to `ordinary` in `taxOf` and to `existingOrdinary` for the bracket fill. Do the same while working (D49 extra-tax calculation). |
| 4 | **Reword "Your date already allows for bad markets while you save."** (`Results.tsx:113`). The date is a probability seen from today. The sentence reads as permission to retire on that date whatever the balance. | Clarity | Arriving in 2039 with the bad-market balance ($2.06M rather than the $2.70M needed) gives **~63%** success, not 90%. | "If your savings in 2039 are below $2.70M, retiring then is below your 90% target. Re-run every year with your real balances." |
| 5 | **Roth ladder help text.** It says conversions "build early-retirement access", but they help only if they season before the owner's 59½. On the example plan they season the year the owner turns 60, so the only effect is conversion tax moved into the bridge years. | Clarity | At the 2039 retirement year: the 12% default pays the penalty in 37.5% of markets and ends at $74k in a bad market. Off: 15.7% and $291k. | Fix the help text. Add a "seasoned Roth available" column to the year-by-year table. The default setting is [decision 3](pending-decisions.md#3-roth-conversion-default); the side-by-side comparison is [feature 3](pending-features.md). |

## P1: materially changes answers or breaks on plausible input

| # | Fix | Kind | Evidence | Minimal change |
|---|---|---|---|---|
| 6 | **Show the early-withdrawal penalty rate on the card** when it's above ~5%. Note that Rule of 55 / 72(t) aren't modeled. | Clarity | 37.5% of markets pay the 10% penalty at the example's headline date, but only the detail view says so. | Carry `penaltyRate` into `TierResult` and add one line on the card. |
| 7 | **Coast caveats on the card.** Both jobs must cover all spending until the coast age, and "stop saving" includes giving up the employer match (`context.ts` zeroes it). Relabel or hide the 4% line for Coast. | Clarity | "You can stop saving now" sits next to "4% rule check $2.74M" and "Needed today $783K", which read as a contradiction. | Add a visible subline under the Coast result, and hide or relabel the 4% line ("needed at 65"). |
| 8 | **Tax brokerage dividends and interest yearly** (D34). The D34 reason ("0% LTCG band") doesn't hold under the default 12% fill or while working. It never applies to bond and cash interest, which is ordinary income. | Accuracy | *Estimate:* retirement is one year later in 3 of 4 test plans. | Tax a yearly yield on the taxable and cash balances: qualified dividends as gains, interest as ordinary income, reinvested into basis. At minimum, correct D34's reason and state the size. |
| 9 | **Validate session files and the local draft.** `parseSession` checks only the wrapper and `loadDraft` checks nothing. There is no React error boundary. | Robustness | A draft missing `datedItems` blanks the page on every load. `"150000"` stored as text concatenates and moves the date **2040 → 2027**. | One `validatePlan()` (types, required fields, ranges) used by both, plus an error boundary with a "reset draft" button. |
| 10 | **Round whole-number fields** in `NumberField` (`fields.tsx`); `kind='int'` only sets `step`. | Robustness | End age 96.5 or start year 2026.5 crashes Calculate ("reading 'portfolio'"). An item in year 2030.5 adds $0. Claim age 62.5 is half-applied. | `Math.round` before `onChange` when `kind === 'int'`. |
| 11 | **Representative paths.** The "typical market" year-by-year table and the "bad market" account chart are chosen by *ending* balance (`solve.ts:307-311`), not by the typical path through retirement. | Accuracy | The first retired year shows $4.12M, against the chart's typical $3.31M (+24%), in the years with the most sequence risk. | Pick the path closest to the p50/p10 band over the first 10 retired years, or relabel it "a sample market that ends near the typical final balance". |

## P2: narrower wrong answers, clarity gaps

| # | Fix | Kind | Evidence | Minimal change |
|---|---|---|---|---|
| 12 | **Say what happens in the other 10%.** | Clarity | A 90% badge alone reads as a guarantee, or as a 1-in-10 chance of going broke soon. The example's failures come in retirement year 29 or later. | One line from `outcomes`: when failures typically occur and what's left (Social Security only). |
| 13 | **Disclose limitations in the app.** Add a "What this doesn't model" block on How this works, drawn from the feature list, and a one-line not-advice disclaimer under the cards. Add a D13 row (one retirement year; both spouses alive throughout). In DECISIONS.md's lean table, fix the survivor reason: it leans optimistic because of two SS checks and joint brackets, not because "spending never drops". | Clarity | The UI discloses only ACA, and there is no disclaimer anywhere. | As described. |
| 14 | **Search limit for age-gap couples.** The earliest-date search stops at the first person's age 75 (D43, `solve.ts:251`), so the result depends on who is entered as "You". | Accuracy | You 74 / spouse 58: "Not reachable". Swapped: 2031. | Limit the search by the younger spouse's age 75 (or `endYear − 1`). Fix the "Not reachable" text for people already past 75. |
| 15 | **Coast number and today's account mix.** "Needed today" scales today's mix (`scaleState`), so a tiny cash-only balance prices the whole number as T-bills. | Accuracy | All zero: $676k. $1 in cash: **$3.02M**. $1 in pre-tax: $779k. | Use a standard or projected-contribution mix when today's balance is small or mostly cash, and show which mix is assumed. |
| 16 | **Input ranges and warnings.** Balances, contributions and spending ≥ 0; fees 0–5%; state 0–15%; healthcare growth −5% to +10%; trust fund 0–100%; coast age between current age and plan end; year picker ≤ `endYear − 1`. | Robustness | Coast age 200: "stop saving now", needs $900. Negative pre-tax gives negative RMDs. State tax at 60% leaves tax unpaid in 3% of years. The year picker past the plan end reports 100%. | Warnings or clamps per [decision 6](pending-decisions.md#6-validation-strictness). |
| 17 | **Social Security wage growth** (D24, leans conservative). The model assumes no real growth in the national wage index. | Accuracy | *Estimate:* benefits are ~22% low at 40 and ~11% at 50. A +20% PIA lowers the example FIRE number by 4.9%. | Scale by (1 + real AWI growth)^(years to 60), e.g. the Trustees' ~1.1%, and grow the taxable max the same way. Or state the size in D24. See [decision 1](pending-decisions.md#1-which-way-to-correct). |

## P3: polish and rare edges

| # | Fix | Kind | Evidence / change |
|---|---|---|---|
| 18 | **Mark borderline results** | Clarity | Seed 4 gives 2040 instead of 2039. When success at the earliest year is within ~1.5 points of target, show "borderline — could be a year later". |
| 19 | **Label card figures "today's $"** and fix the Social Security detail label in statement mode | Clarity | Only hover help says figures are in today's dollars. Statement mode says "based on working until 2039" about a fixed figure the user entered. |
| 20 | **Worst-years table: add "retirement began in market year"** | Clarity | Rows are keyed to the plan start (D47), so retiring into 1966 appears as 1953. |
| 21 | **Social Security first-year months** | Accuracy | The first year pays `13 − birthMonth` months. Cash actually received is at most `12 − birthMonth` (one fewer at 62). Overpays $2–5k once. |
| 22 | **Warn on dated items outside the plan** | Robustness | An item with end before start, or at an age already passed, silently adds $0. |
| 23 | **Recompute `searchPaths` from `paths`** | Robustness | Typing 30000 key by key leaves the quick search at 500 (+$38k on Chubby). |
| 24 | **Cancel superseded worker requests; debounce the year picker** | Robustness | Five "+" clicks at 50k markets queue ~25 s of work. |

## Checked and correct in v1

- **Arithmetic:** lump-sum and annuity growth, start-of-year timing, and fixed-dollar deflation.
- **Taxes:** federal, LTCG stacking, SS taxation, NIIT and penalty math.
- **Accounts:** Roth ordering and seasoning, RMDs.
- **Social Security:** claiming adjustments, spousal benefit, trust-fund cut.
- **Simulation:** bootstrap design, solver monotonicity, and historical 4%/30-year rates (75/25: 97.6%) against FI Calc.
- **Numeric robustness:** no float drift over 111-year horizons, divide-by-zero is guarded, and the solver always terminates.
