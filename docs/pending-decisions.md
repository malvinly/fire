# Decisions for pending work

Design choices made for the work in [pending-fixes.md](pending-fixes.md) and
[pending-features.md](pending-features.md). The maintainer settled all six on 2026-09-24, after the v1
audit's reviewers pulled in different directions.

**How to use this file:**

- These decisions are made. Build what they say.
- When an item that follows a decision lands, record the decision as a D-row in
  [DECISIONS.md](DECISIONS.md), next to the behavior it governs. When every item a decision covers has
  landed, remove the decision from this file.
- A new design question that the docs don't answer belongs to the maintainer. Add it under
  [Open decisions](#open-decisions) with options and a recommendation, and ask. Don't choose.

The project's stance, from [DESIGN.md](DESIGN.md) and the README, is **conservative**: plans must survive
a "significantly below average" market (Fidelity's 90% standard), with no dependence on part-time work.

## Open decisions

None.

---

## 1. Which way to correct

**Question.** The review found errors in both directions. Some make the app too optimistic: fixes 1, 3 and
8 (taxes on sales, dated income and dividends). One makes it too pessimistic: fix 17, where Social
Security is understated because the app assumes national wages never grow faster than prices. The error
is about 22% at age 40 and 11% at 50. Should the pessimistic error be fixed too, or left as extra caution?

**Decided:** fix it, but keep today's behavior as the default. Fix 17 adds a visible "Social Security wage
growth above inflation" setting in Assumptions (advanced), **defaulting to 0%**, which matches today. The
How-this-works page and help text state the size of the effect and the Trustees' ~1.1% assumption as a
reference.

**Why:** the caution becomes something the user can see and change instead of a hidden error, while the
default stays as cautious as v1. Fixes 1, 3 and 8 are wrong numbers and are fixed regardless.

**Applies to:** fixes 1, 3, 8, 17.

## 2. Where new settings go

**Question.** The planned work adds about six settings. The app already lets example values slip into
results unnoticed (fix 2). Where should new settings live, and what should they default to?

**Decided:** place each setting by what it's about, and make an untouched setting either behave like today
or pick the cautious choice.

| Setting | Where | Default |
|---|---|---|
| "Is this income taxed?" (fix 3) | On each dated income item | Taxed |
| Rule of 55 (feature 4) | Under that person in People | Off |
| Survivor test (feature 2) | People | Off (blank) |
| Social Security wage growth (fix 17) | Assumptions (advanced) | 0% |
| Returns vs. history (feature 1) | Assumptions (advanced) | 0% |
| State rate on 401(k)/IRA withdrawals (feature 3) | Assumptions (advanced) | Same as the normal state rate |

**Why:** personal facts sit where a user would look for them. Economic assumptions stay out of the way.
Ignoring a setting can never make a plan look rosier than it is.

**Applies to:** fixes 3, 17; features 1–4. Any future setting should follow the same rule.

## 3. Roth conversion default

**Question.** The app converts 401(k)/IRA money to Roth every retired year, up to the top of a chosen tax
bracket (default 12%). On the example plan, 12% did worse than 10% or no conversions:

| Fill | Needed | Penalty rate | Left in a bad market | Median at the end |
|---|---|---|---|---|
| Off | $2.631M | 15.7% | $291k | $14.77M |
| 10% | $2.622M | 19.0% | $365k | $15.35M |
| 12% (v1 default) | $2.695M | 37.5% | $74k | $15.09M |

But the app doesn't yet count some of the benefits of converting: survivor single-filer taxes, and Roth
money being worth more to heirs.

**Decided:** change the default to the **10% bracket** now, and revisit once the survivor test (feature 2)
exists.

**Why:** 10% did better on every measure on the plan measured, and it still converts some money. The
survivor test adds the main benefit the app is missing; the baseline comparison (feature 1) lets users try
other settings on their own plan.

**Applies to:** fix 5 (which also corrects the help text); D28/D29; feature 2 (revisit).

## 4. Penalty paths as success

**Question.** In bad markets some plans survive only by taking 401(k)/IRA money before 59½ and paying the
10% penalty. Today those count as successes. Should they?

**Decided:** keep counting them as successes, and show how often it happens (fix 6), in the warnings panel
below the cards per decision 5.

**Why:** the simulation already charges the penalty against the balances, so its cost is already reflected
in whether the money lasts. Counting those markets as failures too would punish the same cost twice. What
was missing was visibility.

**Applies to:** fix 6; feature 4 (Rule of 55 will reduce the penalty rate).

## 5. Precision vs. hedging

**Question.** Several fixes add caveats about the headline results: fix 4 (you need the money, not just the
date), fix 12 (what the bad 10% looks like), fix 18 (borderline results), plus the penalty rate (fix 6),
the Coast assumptions (fix 7), the disclaimer (fix 13) and "today's dollars" (fix 19). Should they go on
the result cards?

**Decided:** **the result cards stay crisp:** target numbers only, with no caveat text.
- All the short warnings go in one panel, **"Before you act on these numbers"**, directly below the cards
  and above "Try a different retirement year".
  - It shows only the lines that apply to the current results.
  - The layout and an example are in [Where warnings go](pending-fixes.md#where-warnings-go).
- Fix 12's longer explanation of the bad 10% goes in the detail view, next to the savings chart that shows
  those markets.
- Anything else that reports on results, such as the baseline comparison (feature 1) and the survivor test
  (feature 2), also goes below the cards rather than inside them.

**Why:** the maintainer wants the target numbers easy to read with no extra text. Keeping the warnings
directly below the cards means they're still seen before anyone acts on the numbers; the very bottom of
the page is a long scroll that most people would miss.

**Applies to:** fixes 4, 6, 7, 12, 13, 18, 19; features 1, 2.

## 6. Validation strictness

**Question.** The app accepts almost any typed value and quietly produces nonsense, e.g. coast age 200
gives "Needed today: $900", and a negative balance gives negative required withdrawals. Should bad values be
blocked, or warned about?

**Decided:** **block values that are impossible, and warn about values that are unusual but possible.**
- **Block:** negative balances, contributions or spending (debts go in as a dated expense instead); fees or
  tax rates below 0% or above 100%; trust-fund percentage outside 0–100%; coast age at or below the current
  age, or at or past the plan end; retirement years past the plan end.
- **Warn:** fees above 3%; state tax above 15%; healthcare growth above +10% or below 0% a year.

**Why:** blocking stops the math from producing meaningless answers; warnings keep real edge cases (a
high-tax locale, an unusual fee) possible.

**Applies to:** fix 16; fix 9 (loaded files get the same checks).
