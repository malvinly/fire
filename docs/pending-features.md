# Pending features

Enhancements that add something new to the calculator: new inputs, new modeling or new views, all of which
change or extend the answers it gives. Bug fixes and accuracy changes are in [pending-fixes.md](pending-fixes.md);
choices that need a decision first are in [pending-decisions.md](pending-decisions.md).

Source: a five-reviewer audit of v1. Numbers come from runs of the v1 engine on the example plan (plan start
2026, 10,000 simulated markets, seed 20260924) unless marked *estimate*. This list replaces the "Deferred to
v2" list in [DESIGN.md](DESIGN.md#deferred-to-v2).

Features are ordered by importance, meaning how much each one changes a typical user's answer.

| # | Feature | Size of effect | Minimal version | Done well by |
|---|---|---|---|---|
| 1 | **ACA premium subsidies** (D21) | *Estimate:* for the example plan, ~$410k (15%) less needed and one year earlier with subsidy-aware income. The default 12% fill puts MAGI at $133k, above the $84.6k cliff for two. Subsidy figures are from the reviewer's 2026 numbers, not checked against the source. | **Interim:** help text on pre-65 cost and the fill: "enter the subsidized price and use 10%". **Full:** compute the credit from each year's MAGI (ordinary + gains + untaxed SS), with an option to cap the fill at 400% FPL. | Boldin, ProjectionLab |
| 2 | **Separate retirement year per spouse** | *Estimate:* $350–400k less needed when one spouse works 3 more years with employer health cover. | A retire year per person. Make `working`, wages and contributions per person. Charge pre-65 healthcare only once neither spouse has employer cover. | ProjectionLab, Boldin |
| 3 | **Roth conversion comparison** | At the 2039 retirement year: 12% (default) needs $2.695M, pays the penalty in 37.5% of markets, and ends at $74k in a bad market. 10%: $2.622M, 19.0%, $365k. Off: $2.631M, 15.7%, $291k. | Run the five fill options at the chosen year (~0.7 s each) and show success, penalty rate and bad-market end balance side by side. The default is [decision 3](pending-decisions.md#3-roth-conversion-default). | Boldin, ProjectionLab |
| 4 | **Baseline comparison and sensitivity** | Fee 0.1% → 1.1% (effectively a return haircut) moves the example **2039 → 2042**. Today there's no before/after view. | "Keep as baseline" freezes the current cards and shows deltas after the next Calculate, with no engine work. Add a "return adjustment (±/yr)" field on the existing fee code path. Session comparison later. | ProjectionLab (Plans), Engaging Data |
| 5 | **Flexible spending / guardrails** | *Estimate (literature, not verified):* 10–20% higher starting spending for similar risk. | Start with a report: "in the worst 10% you'd cut X% for Y years". Then an optional guardrail rule. | FI Calc, Boldin |
| 6 | **Survivor scenario** | *Estimate:* roughly neutral for equal earners. Worse with unequal benefits and large pre-tax balances: single-filer tax is $13.3k vs $9.7k joint on the same $85k. | Optional "first death at age X": the larger benefit continues, single filing from the next year, spending drops by a set %, one healthcare line is removed. | Boldin |
| 7 | **State retirement-income exemptions** | *Estimate:* ~$5k/yr (~$140k of portfolio) for IL/PA/MS residents at a 5% rate. | **Interim:** help text: "use your effective rate; much lower if your state exempts retirement withdrawals". **Full:** a separate rate for retirement-account withdrawals. | Boldin |
| 8 | **Rule of 55 / 72(t)** | In the example, "You" retires at exactly 55, and 37.5% of markets pay the early-withdrawal penalty. | A per-person "left employer at 55+" checkbox that makes that 401(k) accessible. 72(t) later. | ProjectionLab |
| 9 | **Historical cycle explorer** | Builds trust; doesn't change the number. | Clickable worst-years rows showing that window's year-by-year table and account chart. Search by retirement market year. | FI Calc, cFIREsim |
| 10 | **Export and fuller tables** | Lets users audit the results. | A typical/bad toggle on the year table, a "show working years" checkbox, and a Download CSV of the visible records. | ProjectionLab, cFIREsim |
| 11 | **Upside bands and ending-balance summary** | Informs one-more-year and spending decisions. | Add 75th/90th percentile lines behind the existing zoom toggle, and an ending-balance 10/50/90 stat. | ProjectionLab, cFIREsim |

## Lower priority

- **IRMAA.** Low impact under the default fill: MAGI stays around $133–145k, below the $218k joint tier.
- **International market data.**
- **Asset location.**
- **Per-state tax rules**, beyond feature 7.
