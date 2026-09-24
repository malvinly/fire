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

1. **Engine** — year-by-year simulation; FIRE numbers are solved outputs. 25× shown as a sanity check.
2. **Success** — money never runs out before the *younger* spouse reaches the end age (default 96,
   editable). Target 90% (editable). Results show Fidelity's three market conditions as 50th/25th/10th
   percentile bands.
3. **Returns** — block bootstrap (main) + every historical window (cross-check); **stricter of the two**.
   US data only in v1. Real (today's) dollars throughout.
4. **FIRE types** — Traditional (default spending = 0.85 × current), Chubby (a higher spending level; default
   spending = 1.2 × current), both after taking out ongoing dated items already paid today (D18, D57); Coast (stop contributing now; work until a chosen age, default 65; then
   Traditional spending).
5. **Household** — two people, each with their own age, salary, accounts and Social Security, sharing one
   retirement year.
6. **Healthcare** — per person, pre-65 (full-price ACA) and 65+ phases, +1.5%/yr above inflation.
7. **Social Security** — computed from each earnings record (zeros after retirement) with manual fallback;
   claim age 62–70; spousal benefit; trust-fund cut 78% (2032) → 62% (2100), per the 2026 Trustees Report.
8. **Accounts** — pre-tax, Roth (contributions tracked), HSA per person; household taxable (with basis)
   and cash. Pre-59½ order: cash → taxable → Roth contributions → seasoned conversions → penalized pre-tax
   (flagged, not failure). RMDs.
9. **Taxes** — real federal MFJ rules + one editable flat state rate (default 5%).
   Roth ladder fills to a chosen bracket (default 12%).
10. **Spending changes** — user-defined dated items (year or age; one-time / yearly / every N years;
    inflows allowed; fixed-dollar flag for mortgages).
11. **App** — local TypeScript/React web app; engine UI-free in Web Workers; historical data bundled
    and refreshed yearly by script.
12. **Sessions** — one JSON file per session in a chosen folder; Save / Save as new; stale-data notice.
13. **Results** — headline is the earliest retirement date per FIRE type; an adjustable "retire at" date
    below drives the charts and tables.
14. **Transparency** — generated "How this works" page listing every assumption with source.
15. **Testing** — deterministic, historical vs. FI Calc, Social Security vs. SSA, taxes, properties.

## How each result is defined

- **Success rate (a scenario)** — share of paths where spending is fully met every year to the end age.
  Reported for bootstrap and history separately; the *combined* rate is the lower of the two.
- **Earliest date (Traditional/Chubby)** — smallest household retirement year whose combined success
  ≥ target when the *whole plan* is simulated from today (so bad markets while saving count).
  Searched up to the first person's age 75.
- **FIRE number (Traditional/Chubby)** — smallest total portfolio *at the earliest date* (today's
  dollars) that passes when retirement starts then (retirement-only simulation). Account mix at that date
  comes from a projection at long-run average returns, scaled up or down; both methods start at average
  inflation (D51).
- **Projected by then** — typical (50th) and significantly-below-average (10th percentile) balance at the
  earliest date from the whole-plan simulation. Shown next to the FIRE number so the date and the number
  can be read together (D54).
- **Coast "earliest"** — smallest year contributions can stop while still working until the coast
  age and passing. **Coast number** — smallest portfolio *today* that passes if contributions stop
  today.
- **Success today** — retire (or stop contributing) this year.
- **Detail view** — for a chosen FIRE type and year: bands, penalty-withdrawal rate, the "significantly
  below average" path's account balances, worst historical start years, and the median path's tax table.

## Deferred to v2

Survivor modeling (one spouse dies: larger SS benefit continues, spending drops); separate retirement
years per spouse; ACA subsidies + IRMAA (both need yearly MAGI); flexible-spending report ("in the worst
10% you'd cut X% for Y years"); side-by-side session comparison; international market data;
72(t) / Rule of 55; asset location; per-state tax rules.
