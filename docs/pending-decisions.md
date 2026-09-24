# Pending decisions

Choices to settle before building some items in [pending-fixes.md](pending-fixes.md) and
[pending-features.md](pending-features.md). In each one, the reviewers of the v1 audit pulled in different
directions. They are ordered by how much other work depends on them.

**These are the maintainer's calls.** A session working on a blocked item should lay out the options (with
numbers, if it can run them) and ask. It should not pick one. Once a decision is made:

1. record it as a new D-number in [DECISIONS.md](DECISIONS.md);
2. remove it from this file;
3. drop the "Blocked by" note from the items it unblocks.

The project's stated stance, from [DESIGN.md](DESIGN.md) and the README, is **conservative**: plans must
survive a "significantly below average" market (Fidelity's 90% standard), with no dependence on part-time
work. Several decisions below are about how far to push that stance.

## 1. Which way to correct

The corrections point in opposite directions:

| Direction | Items |
|---|---|
| Move answers **later** | [Fixes](pending-fixes.md) 1 (basis deflation), 3 (tax dated income), 8 (tax dividends and interest) |
| Move answers **earlier** | Fix 17 (SS wage growth); [features](pending-features.md) 3 (state exemptions), 4 (Rule of 55) |

- **Fix only the optimistic errors:** conservative choices stack on top of the 90% target and the
  Fidelity-style defaults.
- **Fix both:** the answer stays honest, but dates may come out earlier than v1's.

The current tally of leans is the "Which way the assumptions lean" table in DECISIONS.md.

- **Options:**
  - (a) fix everything, and let the 90% target carry the conservatism;
  - (b) fix optimistic errors only, and leave conservative ones documented;
  - (c) fix both, but make the conservative ones user-visible switches.
- **Blocks:** fix 17 (whether to scale SS up or only state the size in D24). It also frames features 3 and 4.
- **Not blocked:** fixes 1, 3 and 8 are wrong numbers under any option.

## 2. More inputs vs. fewer surprises

Fix 3 (taxable-income checkbox) and features 1 (return adjustment), 2 (survivor test), 3 (separate state
rate) and 4 (Rule of 55 checkbox) all add inputs. Fix 2 shows the current input count already lets example values leak
into results: most sections start collapsed, and a first-time user edits only People.

Each new input needs a default that is safe to leave untouched.

- **Options:**
  - (a) accept more inputs with safe defaults;
  - (b) put new inputs behind the existing "Assumptions (advanced)" section;
  - (c) add fewer inputs: choose which of these ship.
- **Blocks:** nothing outright. It shapes the UI for fix 3 and features 1–4.

## 3. Roth conversion default

On the example plan, 12% does worse than 10% or off, both at the 90% target and at the median:

| Fill | Needed | Penalty rate | Bad-market end | Median end |
|---|---|---|---|---|
| Off | $2.631M | 15.7% | $291k | $14.77M |
| 10% | $2.622M | 19.0% | $365k | $15.35M |
| 12% (default) | $2.695M | 37.5% | $74k | $15.09M |

But v1 doesn't model what conversions protect against: survivor single-filer brackets (feature 2), IRMAA,
and large RMDs late in life. Tuning the default against v1's own metric would push it toward converting too
little.

The 12% default was chosen as the "tax-efficient default" (D28/D29, `bracketFill` in
`src/engine/defaults.ts`).

- **Options:**
  - (a) change the default to 10%;
  - (b) auto-pick the best fill per plan (≈5 extra detail runs);
  - (c) keep 12%, with fix 5's corrected help text;
  - (d) decide after feature 2, when the survivor case can show conversions' benefit.
- **Blocks:** any change to D28/D29. Fix 5's help-text correction doesn't need to wait.

## 4. Penalty paths as success

Plans that pay the 10% early-withdrawal penalty count as successes today ("flagged, not failure"; see the
Accounts item in DESIGN.md and the penalty help text in the detail view). Showing the penalty rate on the
card (fix 6) is uncontroversial.

- Counting heavy penalty use as failure would move dates later.
- Adding Rule of 55 (feature 4) would move them earlier, by removing penalties that wouldn't really apply.
- **Options:**
  - (a) keep as is;
  - (b) add a threshold (e.g. penalties above X% of a year's spending count as failure);
  - (c) decide after feature 4.
- **Blocks:** nothing directly. It interacts with fix 6 and feature 4.

## 5. Precision vs. hedging

Fixes 4, 12 and 18 add caveats to the cards. The power-user view wants one crisp number and a comparison (feature 1).

- **Options:**
  - (a) hedges on the card, precision in the detail view;
  - (b) a range (e.g. "2039–2040") instead of one year when borderline;
  - (c) a single "caveats" line per card.
- **Blocks:** the exact wording of fixes 4, 12 and 18.

## 6. Validation strictness

Hard limits (fix 16) prevent nonsense but block some legitimate edge uses, such as entering debt as a
negative balance or a high-tax locale. `NumberField` already supports `min`, `max` and `warn`
(`src/ui/fields.tsx`); the end-age field is an example of a warning.

- **Options:**
  - (a) clamp everything;
  - (b) warn everywhere;
  - (c) warn where a real case exists and clamp the rest (e.g. warn on negative balances, clamp fees at 0–100%).
- **Blocks:** fix 16. Fix 9 (validating session files) should reject structurally broken files either way.
