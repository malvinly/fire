# Design

What the calculator does, the research behind it, and how each result is defined. Individual
assumptions and implementation choices are listed in [DECISIONS.md](DECISIONS.md).

## Research: what the reference tools do

| Tool | Known for | Gap this app fills |
|---|---|---|
| FI Calc (free) | Historical backtesting on Shiller data since 1871; many withdrawal strategies | No Monte Carlo, taxes, Social Security |
| cFIREsim / FIRECalc | Community-validated historical backtesters | No taxes; dated UI |
| Engaging Data | Monte Carlo, Social Security, Coast FIRE calculator | No historical backtest |
| ProjectionLab | Year-by-year cash flow, Monte Carlo + historical, taxes | Weaker Roth-conversion/SS tools; paid |
| Boldin | Deep tax modeling (Roth conversions, IRMAA), SS & spousal | No historical simulation; 1,000 MC runs |
| Fidelity FI Planner | 90% confidence ("significantly below average"), 3% SWR, age 96, 70/25/5 | Uses one conservative constant return — ignores sequence risk; excludes Social Security |

Key research points:
- 4% is a 30-year rule. Early retirees face 50–60 years; ERN's series puts safe rates near 3.25–3.5%.
- Historical backtests are real but one small sample; Monte Carlo explores unseen paths but depends on
  assumptions. Block bootstrap of real history is the middle ground. (Kitces; Income Lab.)

## Core design

1. **Engine** — year-by-year simulation; FIRE numbers are solved outputs. 25× shown as a sanity check in the detail view.
2. **Success** — money never runs out before the *younger* spouse reaches the end age (default 96,
   editable). Target 90% (editable). A market that survives only by paying the early-withdrawal penalty
   still counts, and the results say how often that happens (D68). Results show Fidelity's three market
   conditions as 50th/25th/10th percentile bands.
3. **Returns** — block bootstrap (main) + every historical window (cross-check); **stricter of the two**.
   US data only (D89). Real (today's) dollars throughout.
4. **FIRE types** — Traditional (default spending = 0.85 × current), Chubby (a higher spending level; default
   spending = 1.2 × current), both after taking out ongoing dated items already paid today (D18, D57); Coast (stop contributing now; work until a chosen age, default 65; then
   Traditional spending).
5. **Household** — two people, each with their own age, salary, accounts and Social Security, sharing one
   retirement year.
6. **Healthcare** — per person, pre-65 (full-price ACA) and 65+ phases, +1.5%/yr above inflation.
7. **Social Security** — computed from each earnings record (zeros after retirement) with manual fallback; national wage
   growth above inflation editable (default 0%);
   claim age 62–70; spousal benefit; trust-fund cut 78% (2032) → 62% (2100), per the 2026 Trustees Report.
8. **Accounts** — pre-tax, Roth (contributions tracked), HSA per person; household taxable (with basis)
   and cash. Pre-59½ order: cash → taxable → Roth contributions → seasoned conversions → penalized pre-tax
   (flagged, not failure). RMDs.
9. **Taxes** — real federal MFJ rules + one editable flat state rate (default 5%).
   Roth ladder fills to a chosen bracket (default 10%). Brokerage dividends (2% of the stock share) and
   interest (bonds at each market's January 10-year yield, at least 4%; cash, in the brokerage or the cash
   account, at that market's T-bill rate) are taxed every year and reinvested (D70, D82).
10. **Spending changes** — user-defined dated items (year or age; one-time / yearly / every N years;
    inflows allowed, taxed as income unless marked otherwise; fixed-dollar flag for mortgages). Before retirement, items already paid today are left
    to the paycheck; others are paid from (or saved to) cash and brokerage savings (D17).
11. **App** — TypeScript/React web app that runs entirely in the browser: published as a static site on
    GitHub Pages and runnable locally (D90); engine UI-free in Web Workers; historical data bundled and
    refreshed yearly by script.
12. **Plans** (called "sessions" in the code and file format) — one JSON file per plan in a chosen folder (download and upload in browsers without
    folder access); Save / Save as new; unsaved work is kept as a browser draft. Results calculated with older
    data or an older engine are flagged "recalculate" (D59): until recalculated, only the saved detail view is
    shown, for the FIRE type and year it was saved for (D85), and saving them again keeps their old versions
    so they still open as stale (D86).
13. **Results** — headline is the earliest retirement date per FIRE type, with target numbers only on the
    cards; every caution goes in a "Before you act on these numbers" panel directly below them (D67). Below
    it, "Try a different retirement year" (a FIRE type and a year) drives the charts and tables; a typed year
    is applied once it is a whole year in range (D84).
14. **Transparency** — generated "How this works" page listing every assumption with source.
15. **Testing** — deterministic, historical vs. FI Calc, Social Security vs. SSA, taxes, account rules,
    headline numbers, properties, and the UI's logic kept in plain functions; React wiring is checked in the
    browser (D87). The layers are listed in [DEVELOPMENT.md](DEVELOPMENT.md#tests).
16. **Changing the model** — errors that flatter results are fixed outright; errors that hurt them are fixed
    behind a setting that defaults to today's behavior. New settings sit where they belong (People or the
    item for personal facts, Assumptions for economic ones), and an untouched one never makes a plan look
    better (D81).

## How each result is defined

- **Success rate (a scenario)** — share of paths where spending is fully met every year to the end age.
  Reported for bootstrap and history separately; the *combined* rate is the lower of the two.
- **Earliest date (Traditional/Chubby)** — smallest household retirement year whose combined success
  ≥ target when the *whole plan* is simulated from today (so bad markets while saving count).
  Searched up to the younger spouse's age 75.
- **FIRE number (Traditional/Chubby)** — smallest total portfolio *at the earliest date* (today's
  dollars) that passes when retirement starts then (retirement-only simulation). Account mix at that date
  comes from a projection at long-run average returns, scaled up or down; both methods start at average
  inflation (D51).
- **Expected savings by then** — typical (50th) and significantly-below-average (10th percentile) balance at the
  earliest date from the whole-plan simulation. Shown next to the FIRE number so the date and the number
  can be read together (D54).
- **Coast "earliest"** — smallest year contributions can stop while still working until the coast
  age and passing. **Coast number** — smallest portfolio *today* that passes if contributions stop
  today.
- **Success today** — retire (or stop contributing) this year.
- **Detail view** — for a chosen FIRE type and year: bands, penalty-withdrawal rate, each person's Social
  Security at full retirement age, what happens in the markets that fail (D74), the 4% rule check
  (Traditional and Chubby), the "significantly below average" path's account balances, worst historical start
  years, and a year-by-year table of the typical path's retired years. The typical and bad paths are the ones
  closest to their bands over the first 10 retired years (D73). In the table, money in (Social Security, other
  income, the "From …" columns) equals spending, taxes and penalty plus "Reinvested": the unspent part of a
  required withdrawal, or income beyond the year's need, which goes into the brokerage account (D83). For a
  stale session, only the saved detail is shown, and only for the FIRE type and year it was saved for (D85).

## Checked and correct in v1

What the five-reviewer audit of v1 verified. Its fixes and the later ones are D63–D87 in
[DECISIONS.md](DECISIONS.md).

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

## Planned changes

Planned work is in [pending-features.md](pending-features.md), ordered by importance: new capabilities such
as comparing with a baseline, lower-than-history returns, a fuller year-by-year table and a report export for
AI review. Design choices already made for that work are D-rows in [DECISIONS.md](DECISIONS.md) (D81 for new
settings, D67 for warnings); features considered and declined are D89. How to make a change is in [DEVELOPMENT.md](DEVELOPMENT.md#making-a-change).
