# Pending decisions

Choices to settle before building the items in [pending-fixes.md](pending-fixes.md) and
[pending-features.md](pending-features.md). In each one, the reviewers pull in different directions.
They are ordered by how much of the other work depends on them.

## 1. Which way to correct

The corrections point in opposite directions:

| Direction | Items |
|---|---|
| Move answers **later** | [Fixes](pending-fixes.md) 1 (basis deflation), 3 (tax dated income), 8 (tax dividends and interest) |
| Move answers **earlier** | Fix 17 (SS wage growth); [features](pending-features.md) 1 (ACA subsidies), 5 (guardrails), 7 (state exemptions), 8 (Rule of 55) |

- **Fix only the optimistic errors:** conservative choices stack on top of the 90% target and the
  Fidelity-style defaults.
- **Fix both:** the answer stays honest, but dates may come out earlier than v1's.

**Blocks:** fix 17 (whether to scale up SS or just state the size in D24).

## 2. More inputs vs. fewer surprises

Fix 3 (taxable-income checkbox) and features 2 (per-spouse retirement year), 4 (return adjustment) and 7
(separate state rate) all add inputs. Fix 2 shows the current input count already lets example values
leak into results. Each new input needs a default that is safe to leave untouched.

- **Options:** accept more inputs with safe defaults, or put new inputs behind an "advanced" toggle, or
  limit v2 to the highest-impact ones.

## 3. Roth conversion default

On the example plan, 12% does worse than 10% or off, both at the 90% target and at the median:

| Fill | Needed | Penalty rate | Bad-market end | Median end |
|---|---|---|---|---|
| Off | $2.631M | 15.7% | $291k | $14.77M |
| 10% | $2.622M | 19.0% | $365k | $15.35M |
| 12% (default) | $2.695M | 37.5% | $74k | $15.09M |

But v1 doesn't model what conversions protect against: survivor single-filer brackets, IRMAA, and large
RMDs late in life. Tuning the default against v1's own metric would push it toward converting too little.

- **Options:** change the default to 10%; auto-pick the best fill per plan; keep 12% and show the
  comparison (feature 3).
- **Blocks:** the wording of fix 5; feature 3's presentation.

## 4. Penalty paths as success

Plans that pay the 10% early-withdrawal penalty count as successes today ("flagged, not failure").
Showing the penalty rate on the card (fix 6) is uncontroversial.

- Counting heavy penalty use as failure would move dates later.
- Adding Rule of 55 (feature 8) would move them earlier by removing penalties that aren't real.
- **Options:** keep as is; add a threshold above which penalties count as failure; decide after feature 8.

## 5. Precision vs. hedging

Fixes 4, 12 and 18 add caveats to the cards. The power-user view wants one crisp number and a comparison.

- **Options:** hedges on the card and precision in the detail view; a range (e.g. "2039–2040") instead of
  one year; a "confidence" toggle.

## 6. Validation strictness

Hard limits (fix 16) prevent nonsense but block some legitimate edge uses, such as entering debt as a
negative balance or a high-tax locale.

- **Options:** clamp everything; warn everywhere; warn where a real case exists and clamp the rest
  (e.g. warn on negative balances, clamp fees at 100%).
- **Blocks:** fix 16.
