# Pending features

New capabilities for the calculator. Design choices already made for this work are D-rows in
[DECISIONS.md](DECISIONS.md): where new settings go and what they default to (D81; each feature below names
its placement and default), and keeping the result cards free of extra text (D67). A new design question that
the docs don't answer belongs to the maintainer: ask, don't choose.

Each feature starts with a plain-language explanation of what it is and what you'd see in the app. The
**For implementers** part at the end of each gives code locations and a first version to build. The
workflow for any change is in DEVELOPMENT.md: [Making a change](DEVELOPMENT.md#making-a-change)
(tests, engine version, D-numbers, adding `Plan` fields safely) and
[Reproducing the numbers](DEVELOPMENT.md#reproducing-the-numbers). Line numbers were checked at engine
version 7; if they have moved, search for the name given. The v1 audit's fixes and the later ones have all
landed (D63–D87 in DECISIONS.md).

Features are ordered by **importance**: how much each changes a typical user's answer. Numbers come from the
current engine (version 7) on the example plan unless marked *estimate* or *v1*. Example screen text is illustrative; the final
wording is up to whoever builds it.

**Any feature that adds a `Plan` or `Assumptions` field** must fill in that field's default for older
session files and drafts: a new assumption is filled automatically by `migratePlan` (`src/engine/migrate.ts`,
D65); any other field needs a line there and a check in `src/engine/validate.ts` (D71).

## Summary

| # | Feature | In one sentence |
|---|---|---|
| 1 | Compare with a baseline, and "what if returns are lower" | See how a change moves your answer, and test a worse-than-history future. |
| 2 | Fuller year-by-year table | See the bad-market years and the working years, not only the typical market's retired years. |
| 3 | Export a report for AI review | Download every calculated result as one Markdown file written for an AI chat to read and give feedback on. |
| 4 | Measured Roth-conversion bracket suggestion | Recalculate at each bracket option and say which gives your plan the best chance and the most left in a bad market. |

---

## 1. Compare with a baseline, and "what if returns are lower"

### What it is

Two small additions for asking "what if?":

- **A baseline.** Today, when you change an input and press Calculate, the old answer disappears. To compare
  "claim Social Security at 67 vs 70", you have to write the first answer down. A baseline keeps the old
  answer on screen next to the new one.
- **A return adjustment.** Every result assumes future markets behave like US history since 1871, which
  has been unusually good. A return adjustment lets you ask "what if returns are 1% a year lower than
  history?" It is one number that shifts every simulated year's return up or down.

### What you'd see

1. Press Calculate. Under the cards, a new button: **Keep as baseline**.
2. Change something, e.g. set the return adjustment to −1%, and press Calculate again.
3. The cards show the new answers as usual. A one-line strip directly under them compares with the
   baseline (the cards themselves stay unchanged, per D67):

   > **Compared with baseline:** Traditional 2042 (was 2040, **+2 years**; needs $2.72M, was $2.52M) ·
   > Chubby 2046 (was 2043) · Coast stop saving in 2030 (was now; needs $1.13M today, was $804k)

4. **Clear baseline** removes the strip.

The return adjustment is a new field under **Assumptions (advanced)**: "Returns vs. history (± per year)",
default 0%.

Its help text also covers international funds. The app's only stock history is the US market, so money in a
fund like VXUS is treated as US stocks. Over the long run, stocks outside the US have returned roughly 2
percentage points a year less than US stocks after inflation, so the help suggests a lower setting when part
of your stocks are international. For example, with 70% in stocks and a third of that international: about
−0.5% (70% × ⅓ × 2 points). This replaces adding international market data (declined, D89).

### Why it's worth doing

- It's the quickest way to see which inputs matter for *your* plan, and how sensitive the date is.
- Measured (raising the fee by 1%, which is the same thing): the example's Traditional date moves from 2040
  to 2042 and its number from $2.52M to $2.72M; Chubby moves from 2043 to 2046, and Coast from stopping now
  to 2030.
- ProjectionLab and Engaging Data make this kind of comparison easy. Here it takes pen and paper.

### Today

- There is no comparison.
- The "Fees" field (`feeRate`) is subtracted from every year's return, so raising it already works as a
  return cut. That isn't obvious from its label or help text.

### For implementers

- **Where:** results state in `src/App.tsx`; `TierCard` (`src/ui/Results.tsx:70`). `feeRate` is subtracted
  in `realYears` (`src/engine/returns.ts:46`, used by the simulated and historical markets) and in
  `averageRealReturns` (`src/engine/solve.ts:232`, the FIRE number's projection in `projectState`). The fee
  leaves each market's 10-year yield (`bondYield`, D82) alone, so bond interest is taxed the same; whether
  lower returns should also mean lower taxed yields is a question for the maintainer.
- **First version:**
  - Store the current `TierResult`s when "Keep as baseline" is pressed, and render the comparison strip
    between the cards and the warnings panel, not inside `TierCard`. No engine work.
  - Results from a stale saved session (the recalculate banner, D59/D85) came from older data or an older
    engine. Whether they can be kept as a baseline is a question for the maintainer, since the comparison
    would mix the model change with the input change.
  - Add `returnAdjustment` to `Assumptions`, applied on the same code path as `feeRate`, with its own
    How-this-works row and help text (including the international-funds guidance above).
  - Two texts already say international funds are simulated as US stocks. Add to each that the new setting
    is where to account for them, e.g. "…as US stocks; if you hold some, lower 'Returns vs. history'
    (Assumptions, advanced)":
    - the stocks field's help (`stocks` in `src/ui/helpText.ts`);
    - the "Markets" row under "What this doesn't model" (`describeAssumptions`,
      `src/engine/assumptions.ts`), which also says lower returns are "planned".
  - Side-by-side comparison of saved session files comes later.
- **Test:** a return adjustment of −1% gives the same results as raising the fee by 1%.

---

## 2. Fuller year-by-year table

### What it is

The detail view has a table showing, for each year of retirement:

- where the spending money came from (Social Security, cash, brokerage, 401(k)/IRA, Roth);
- taxes, penalties and Roth conversions.

Today it shows only **one** market, the typical one, and only **retired** years. The interesting cases are
hidden:

- In the **bad market**, the brokerage can run dry, conversions get cut back and penalties get paid. You
  can see that only as colored bars in a chart, with no numbers.
- **Working years** never appear, so for Coast FIRE the whole coasting period is invisible.

### What you'd see

Above the table:

> Show: (•) Typical market ( ) Bad market (1 in 10)   [ ] Include working years

### Why it's worth doing

The bad market is where the plan's weak spots are (running out of brokerage money, penalties), and today it
has no table. Seeing the working years makes Coast FIRE's coasting period, and the savings built before
retirement, something you can check.

### Today

A typical-market, retired-years-only table.

### For implementers

- **Where:** `DetailView` (`src/ui/Results.tsx:242`, rows filtered at `:246`, `COLUMNS` at `:197`);
  `detail.medianPath` and `detail.p10Path` are both already computed. Working years record Reinvested as 0
  and have no wages or contributions columns, so the caption's money-in = money-out identity doesn't hold for
  them; the caption needs a working-years version. A stale session's saved detail already holds both
  `medianPath` and `p10Path`, so the toggle works without recalculating (D85).
- **First version:** a path toggle and a "working years" checkbox on the existing table.
- **Depends on:** D73, now landed ("typical" and "bad" follow the markets closest to those lines).

---

## 3. Export a report for AI review

### What it is

A button that downloads everything the calculator worked out for your plan as one Markdown (`.md`) file,
written for an AI chat (such as Claude or ChatGPT) to read. You attach the file to a chat and ask for
feedback on your targets, your savings, when you can retire and where the plan is weak.

The file is laid out for an AI, not for printing:

- **Headings** for each part, so the AI can find and cite them.
- **Tables** for numbers, with the unit in each column header.
- **Exact whole-dollar amounts** ($2,518,400, not $2.52M), so the AI's arithmetic matches the app's.
- **"Not available"** written out where there's no value, never a blank cell.
- **A one-line explanation under each table** saying what it shows.

### What you'd see

A button in the top bar, next to **Plans…**: **Export for AI review**. It's available only when the
results on screen are a complete, current calculation. While it's unavailable it says why:

- no results yet, or still calculating: "Calculate first";
- the inputs have changed since the results were calculated: "Calculate again to export";
- a saved session opened with the "older data or an older version" banner (D59): "Recalculate to export".
  These results can't be recalculated as they are (D85), and a report mixing them with new detail would
  describe two different calculations.

Pressing it takes a few seconds (it works out the detail for every FIRE type, see below), then downloads
`YYYY-MM-DD FIRE report.private.md`. The `.private.` in the name keeps the file out of git if it's saved inside
the project (DEVELOPMENT.md → Privacy).

The file contains, in order:

1. **How to read this report.** A short guide for the AI, written so it doesn't misread the numbers:
   - every amount is in today's dollars (after inflation);
   - "success" means the money lasts until the younger person turns the plan-to age, and the success target
     is the share of markets that must succeed (default 90%);
   - each chance of success is the lower of two tests: simulated markets and real US history since 1871;
   - "typical market" is the 50th percentile and "bad market" the 10th (1 in 10 do worse);
   - what Coast, Traditional and Chubby FIRE each mean here;
   - withdrawals that pay the 10% early-withdrawal penalty still count as successes (D68).
2. **Your household.** Ages, salaries, contributions, balances by account, spending, healthcare, dated items,
   and each person's Social Security claim age and the benefit calculated for it.
3. **Assumptions.** Every row of How this works, marked default or changed, including "What this doesn't
   model" (D75), so the AI knows the model's limits.
4. **Results.** Each FIRE type's headline numbers in one table: spending, earliest date and ages, FIRE
   number, current savings, chance of success today and at the earliest date, the 4% rule check (D44), and
   the typical and bad-market balances at the earliest date.
5. **Before you act on these numbers.** Every line of the warnings panel (D67).
6. **One section per FIRE type**, at its earliest date:
   - chance of success from each test;
   - how often the early-withdrawal penalty is paid;
   - savings over time (50th, 25th and 10th percentiles, every year);
   - what happens in the markets that fail (D74);
   - the worst historical starting years;
   - the year-by-year tables for the typical and the bad market, working years included, with every column
     the engine records.

   If the detail view is open for a different year ("Try a different retirement year"), that detail comes
   too, labelled with its year.
7. **Questions to ask.** Suggested prompts, for example "Which inputs move my earliest date the most?", "How
   exposed am I to a bad first decade of retirement?", "Is my Chubby spending realistic next to my current
   spending?", "What would you check before relying on this?"

**Privacy.** The report describes your finances, so it leaves out anything not needed to judge the plan:

- the two people are called "You" and "Spouse", not by the names entered;
- no session name or birth months;
- Social Security appears as the calculated benefits, not the year-by-year earnings history.

Dated items keep the labels you typed, since those tell the AI what each item is.

### Why it's worth doing

- The app gives numbers but can't talk them through. An AI chat can explain what drives your date, point out
  weak spots, and suggest what to try next in the app. It can do that only if it has every number and knows
  what each one means.
- The explanation section keeps it from making the usual mistakes, such as treating today's dollars as future
  dollars or a 90% target as a 90% forecast.
- Copying numbers by hand from the cards and tables loses the detail and invites typos.

### Today

No export of any kind. A session file (`.json`) holds the inputs and saved results, but it has personal
details (names, earnings history), holds detail for only one FIRE type, and doesn't say what its fields mean.

### For implementers

- **Where:**
  - Button and when it's enabled: `src/App.tsx` (top bar; `staleData`, `inputsChanged`, `results.done`).
  - Report builder: a new `src/ui/report.ts`, a plain function from the calculated plan (`results.plan`), the
    `TierResult`s, a `Detail` per type, `beforeYouAct` (`src/ui/warnings.ts`) and `describeAssumptions`
    (`src/engine/assumptions.ts`) to a string. Unit-tested, no React (D87).
  - Download: a Blob link like `downloadJson` (`src/ui/sessions.ts:227`), with type `text/markdown`.
- **First version:**
  - For each FIRE type with an earliest date (Coast: its stop-saving year), request `detailFor` at that year.
    Reuse the on-screen detail when it matches (`detailMatches`, `src/ui/sessions.ts:102`). Don't send these
    through the single detail worker in `src/worker/client.ts`: any newer request replaces it (D80), so the
    export and the on-screen detail would cancel each other. Use the solver workers or a dedicated request.
  - A FIRE type without results (no earliest date in the searched years, or Chubby spending left empty) gets
    a line saying so instead of a section.
  - `reinvested` can be missing (D83); write "not available", not 0. Working years record Reinvested as 0
    and have no wages or contributions columns; say so in the year-by-year table's explanation.
  - Keep the "How to read this report" text next to the builder, with the plan-to age, success target and
    market years filled in from the plan and `MARKET`, not hard-coded.
- **Test:** with the example plan, the report has a section for each FIRE type and its numbers match the
  `TierResult`s and `Detail`s; it contains neither person's name nor any earnings-history amount; a stale
  or out-of-date result can't be exported. Check the file size on the example plan and note it here.

---

## 4. Measured Roth-conversion bracket suggestion

### What it is

Every retired year, the plan takes money out of the 401(k)/IRA up to the top of a chosen tax bracket and converts
what spending doesn't need to Roth (D29). The setting is **Yearly Roth conversions: fill up to** under
Assumptions (advanced), with the options Off, 10%, 12%, 22% and 24%. It defaults to 10% because 10% did best when
measured on the example plan.

The best bracket differs by household. A large pre-tax balance can face required withdrawals (RMDs) later that
are taxed at 24% or more, and then converting more each year, at a higher rate now, can leave more money overall.
This feature works the answer out for your plan: it recalculates the detail at each bracket option and says which
one gives the best chance your money lasts and the most left at the end in a bad market.

### What you'd see

In the "What to do each year after you retire" timeline, in the first phase where the IRS requires withdrawals
(or under the detail view's stats), a line naming the option that does better than your current setting:

> Filling the 12% bracket instead: chance your money lasts 91% (now 94%), bad-market end savings $410K (now $365K)

If one option gives the best chance and another the most bad-market end savings, both are named. Nothing is
shown when the current setting is already best on both. The app still doesn't change the setting itself: a
trade-off like the one above is the reader's call.

### Why it's worth doing

- The setting applies one bracket to every household, but the right one depends on the size of the pre-tax
  balance, Social Security and spending. Few users will try every option and compare the results by hand.
- The choice matters. On the example plan at its 2040 date, 10% gives a 93.6% chance and $1.29M at the end of a
  bad market; Off gives 93.4% and $1.26M, 12% gives 93.0% and $1.03M, and 22% gives 91.2% and $0.37M. Numbers
  for a household with a large pre-tax balance, the case this feature is for, are not measured yet (*estimate*).
- A heuristic tip was tried and removed (D93). It compared the tax rate on the bad market's required withdrawals
  with the fill rate. On the example plan it suggested 22%, which contradicts D29's measured result, and when the
  two rates were equal it still said paying the rate now can beat paying it later, an advantage that does not
  exist. Measuring each option avoids both problems.

### Today

- The setting defaults to 10% (D29). Plans saved with the old default keep 12%.
- To compare options, the user changes the setting, recalculates, and writes down the chance of success and the
  bad-market line for each one.

### For implementers

- **Where:**
  - `detailFor` in `src/engine/solve.ts` gives a detail's chance of success (`success.combined`) and the
    bad-market line (`bands.p10`; its last value is the end savings).
  - The detail worker in `src/worker/client.ts`: a newer request replaces the current one (D80), so the extra
    runs must be part of the same request or use the solver workers.
  - Results state in `src/App.tsx`; the timeline builder `buildPlaybook` in `src/ui/playbook.ts`.
- **First version:**
  - When the detail is calculated, rerun it at each other bracket option (Off, 10, 12, 22, 24) with every other
    input unchanged. The quick-search sample (`searchPaths`, D5) is enough for the comparison; re-check the winner
    on all markets before showing it.
  - Show the line in the timeline's first required-withdrawal phase or under the detail's stats, not on the result
    cards (D67). No new setting.
- **Test:** on the example plan the comparison agrees with D29: 10% beats 12% and Off, on both the chance of
  success and the bad-market end savings (engine 7 numbers above).
