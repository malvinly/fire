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
version 6; if they have moved, search for the name given. The v1 audit's fixes and the later ones have all
landed (D63–D87 in DECISIONS.md).

Features are ordered by **importance**: how much each changes a typical user's answer. Numbers come from the
current engine (version 6) on the example plan unless marked *estimate* or *v1*. Example screen text is illustrative; the final
wording is up to whoever builds it.

**Any feature that adds a `Plan` or `Assumptions` field** must fill in that field's default for older
session files and drafts: a new assumption is filled automatically by `migratePlan` (`src/engine/migrate.ts`,
D65); any other field needs a line there and a check in `src/engine/validate.ts` (D71).

## Summary

| # | Feature | In one sentence |
|---|---|---|
| 1 | Compare with a baseline, and "what if returns are lower" | See how a change moves your answer, and test a worse-than-history future. |
| 2 | What if one of you dies first | Check the plan still works for the survivor with one Social Security check and single-filer taxes. |
| 3 | State tax exemptions for retirement withdrawals | Stop charging state tax on 401(k)/IRA money in states that don't tax it. |
| 4 | Rule of 55 and 72(t) | Model the two legal ways to take 401(k)/IRA money before 59½ without the 10% penalty. |
| 5 | Replay any historical year | Pick a real year, like 1966, and watch your plan go through it year by year. |
| 6 | Fuller year-by-year table | See the bad-market years and the working years, not only the typical market's retired years. |
| 7 | Upside on the chart | Show how much you might end with in good markets, not only typical and bad ones. |
| 8 | Export a report for AI review | Download every calculated result as one Markdown file written for an AI chat to read and give feedback on. |

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

- **Where:** results state in `src/App.tsx`; `TierCard` (`src/ui/Results.tsx:69`). `feeRate` is subtracted
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
    How-this-works row and help text.
  - Side-by-side comparison of saved session files comes later.
- **Test:** a return adjustment of −1% gives the same results as raising the fee by 1%.

---

## 2. What if one of you dies first

### What it is

Today the plan assumes both of you live to the end (age 96 of the younger one). Real plans usually check the
case where one spouse dies earlier, because three things change for the one left:

- **Social Security:** the household goes from two checks to one. The survivor keeps whichever check is
  larger; the smaller one stops.
- **Taxes:** from the year after the death, the survivor files as single. Single tax brackets are about
  half as wide as joint ones, so the same income is taxed more. This is often called the "widow's
  penalty".
- **Spending:** it usually drops, but not by half (housing costs stay). One person's healthcare cost goes
  away.

### What you'd see

A new optional setting under People: **"Also test: {name} dies at age [__]"**. It's blank (off) by
default. When it's set, a line appears in the "Before you act on these numbers" panel below the cards
(D67 in [DECISIONS.md](DECISIONS.md)), e.g.:

> If You dies at 75: chance the money lasts for Spouse **87%** (below your 90% target)

Blank means no survivor test, as today.

### Why it's worth doing

- *Estimate,* on the example plan (both $2,500/month benefits at 67):
  - the survivor loses about $21k a year of Social Security;
  - the same $85k of 401(k)/IRA withdrawals costs **$13,346** in federal tax as single vs **$9,728** jointly;
  - offsetting that, spending drops (typically 20–30%) and one Medicare cost ends.
- For two similar earners it roughly nets out. It is worse when one benefit is much larger, or when a lot
  of money sits in pre-tax accounts.
- It is also the main reason planners do Roth conversions and delay the higher earner's claim. Without it,
  the app can't show the benefit of either.

### Today

- Not modeled; listed in the README's limitations and D13.
- Listed in the app under How this works → "What this doesn't model" (D75).

### For implementers

- **Where:**
  - Social Security: `annualBenefits` (`src/engine/socialSecurity.ts:70`).
  - The panel line: `beforeYouAct` (`src/ui/warnings.ts`), tested in `tests/warnings.test.ts`.
  - Tax: `computeTax` (`src/engine/tax.ts`). `FEDERAL` in `src/data/rules.ts` is joint-only. Single filers
    also need their own brackets, standard deduction, extra deduction at 65+, Social Security taxation
    thresholds ($25k/$34k), 0%/15% capital-gains thresholds and NIIT threshold ($200k). The bracket-fill top
    (`ctx.fillTop`, `bracketTop`) must switch to the single bracket too. Add them all to
    `docs/UPDATE_DATA_PROMPT.md` so they're refreshed yearly.
  - Spending and healthcare: `buildContext` (`src/engine/context.ts`).
- **First version:**
  - A plan field `survivor: { person, deathAge, spendingDrop }` (off by default).
  - From the year after the death: survivor gets the larger of the two benefits; single brackets apply;
    spending × (1 − `spendingDrop`, default ~25%); the deceased's healthcare line is removed.
  - Report success under that scenario as a line in the warnings panel below the cards.
  - Once this exists, revisit the Roth conversion default (10% since the v1 audit, D29); conversions pay off
    mostly in the
    survivor case.
  - Simplification to record in a D-row: the survivor-benefit reductions for claiming early are ignored.
- **Test:** with the setting off, results are identical to today. With it on, the survivor year uses
  single brackets and one benefit.

---

## 3. State tax exemptions for retirement withdrawals

### What it is

The app charges one flat state tax rate (default 5%) on all taxable retirement income:

- 401(k)/IRA withdrawals;
- Roth conversions;
- capital gains.

But several states don't tax 401(k)/IRA withdrawals, or tax only part of them. For example:

- **Illinois** exempts them entirely but taxes capital gains.
- **Pennsylvania** exempts them after retirement age.
- **Mississippi** exempts retirement income.
- **New York** and **Georgia** exempt a fixed amount per person.

For someone retiring in one of those states, the flat rate overcharges state tax every year.

### What you'd see

Under **Assumptions (advanced)**, next to "State income tax", a second field:

> State tax on 401(k)/IRA withdrawals and Roth conversions: [ 0 ]%
> (Leave equal to the rate above unless your state exempts retirement income.)

Improved help text also says: use your *effective* state rate, not your top bracket.

### Why it's worth doing

- *Estimate:* in the example's typical market, about $3k a year of state tax falls on withdrawals and
  conversions in the first ten retired years, more later as required withdrawals grow. For someone in an
  exempt state, that's roughly $90k less portfolio needed at a 3.5% withdrawal rate.
- The error leans conservative, so it matters only for people in those states.

### Today

One flat rate (D33), applied to ordinary income plus gains, minus the federal standard deduction. Social
Security is already excluded.

### For implementers

- **Where:** `computeTax` (`src/engine/tax.ts:65`); `stateTax` help (`src/ui/helpText.ts:96`); D33.
- **First version:**
  - Add a `stateRetirementRate` assumption, defaulting to the same value as `stateTaxRate`. Apply it to
    pre-tax withdrawals, RMDs and conversions, and keep the flat rate for gains and other income, including
    brokerage interest (`TaxInput.interest`, D70/D82).
  - `computeTax` needs the pre-tax portion passed separately from other ordinary income.
  - Help text now, whether or not the field ships.
- **Test:** with the retirement rate at 0%, state tax falls only on the gains portion.

---

## 4. Rule of 55 and 72(t)

### What it is

Money in a 401(k) or IRA normally carries a **10% penalty** if you take it out before age 59½. There are two
common legal ways around that for early retirees:

- **Rule of 55.** If you leave your job in or after the calendar year you turn 55, you can take money from
  *that employer's* 401(k) without the penalty. It doesn't apply to IRAs, or to 401(k)s from earlier jobs
  (unless you rolled them into the current plan *before* leaving). Income tax still applies.
- **72(t), also called SEPP ("substantially equal periodic payments").** At any age, you can take a fixed
  yearly amount from an IRA without the penalty. The IRS sets the amount by formula from your balance and
  life expectancy. It must continue unchanged for 5 years or until 59½, whichever is longer. Breaking the
  schedule brings back the penalty on everything already taken.

### What you'd see

- **Rule of 55:** a checkbox per person under People: **"Leaves their employer at 55 or later (Rule of
  55)"**. When checked, and that person retires at 55+, their 401(k) money can be used without the
  penalty from the retirement year.
- **72(t) (later):** an option to start fixed penalty-free IRA payments at retirement. The app computes
  the allowed amount and shows it in the year-by-year table.
- Both default to off. The penalty line in the panel below the cards (D68) and the detail view's
  "Markets needing an early-withdrawal penalty" figure would drop accordingly.

### Why it's worth doing

- In the example, "You" retires at 56 and "Spouse" at 54 (2040). At the default settings **8.8%** of
  simulated markets pay the 10% penalty at some point before 60 (26.9% with engine 4's 2039 date, 37.5% in
  v1). Rule of 55 for You alone would remove almost all of them: about 0.1% in a rough check. Spouse retires
  at 54, too young for the rule.
- The app counts penalty years as success, so the date may not move much. But the penalty cost is real
  money, and it shrinks the cushion in bad markets.

### Today

- Pre-tax money is penalty-free from the calendar year a person turns 60 (D14, which rounds 59½ up).
  Earlier withdrawals pay 10%.
- Both rules are listed as not modeled in the README.

### For implementers

- **Where:** `ctx.access[i][t] = age >= 60 ? 1 : 0` (`src/engine/context.ts:194`), read in `planDraws`
  (`src/engine/simulate.ts:190`) for pre-tax money (bracket fill, withdrawals, penalty withdrawals) and in
  `rothAvailable` (:171) and the early-Roth step for Roth money. Rule of 55 covers only the 401(k), so it
  needs its own pre-tax flag rather than setting `ctx.access`, which would also make Roth earnings
  penalty-free.
- **First version (Rule of 55 only):**
  - A per-person `ruleOf55: boolean`. When set and the retirement year's age is ≥ 55, grant access to that
    person's pre-tax balance from the retirement year.
  - Record the simplification in a D-row: the model has one pre-tax bucket per person, so it treats all of
    it as the last employer's 401(k).
  - 72(t) later: it needs the IRS payment calculation (amortization method) and a locked yearly withdrawal.
- **Test:** retiring at 55 with the flag set gives no penalty on that person's pre-tax withdrawals.
- **Related:** D68 (penalty paths count as successes; the panel shows how often).

---

## 5. Replay any historical year

### What it is

Besides simulated markets, the app replays your plan through every real stretch of US market history since
1871. Some starting years are famous for being hard on retirees:

- **1929:** the crash and the Depression.
- **1966:** a decade of high inflation and flat stocks.
- **2000:** two crashes in the first decade.

Experienced FIRE users judge a plan by asking "would I have survived retiring into 1966?"

Today the app shows only the five worst replays, as a list. Each row gives the market year retirement
began ("Retiring into", D47), but you can't open a replay to see what happened year by year, and you can't
pick a year that isn't among the worst five.

### What you'd see

In the detail view:

- A box: **"Replay retiring into year: [1966]"**.
- Choosing a year (or clicking a row of the worst-years list) fills the year-by-year table and the account
  chart with that exact replay: balances, withdrawals, taxes and conversions for each year.

> Retiring into 1966: money lasts through 2082, with $9.3M left in today's dollars.

### Why it's worth doing

It doesn't change the answer, but it is the most convincing way to trust it. You can see exactly how the
plan copes with a bad decade. FI Calc and cFIREsim both offer it.

### Today

A fixed list of the 5 worst start years; rows aren't clickable. The "Retiring into" column (D47) shows
the market year retirement began, which this builds on.

### For implementers

- **Where:** `detailFor` (`src/engine/solve.ts:352`) builds `worstHistorical` (:392).
  `simulatePath(ctx, e.hist, pathIndex, { record: true })` gives year-by-year records for one historical
  path. The worst-years table is at `src/ui/Results.tsx:301`, the year-by-year table at `:333`, and
  `AccountsChart` in `src/ui/charts.tsx:151`. The detail request goes through `src/worker/client.ts`, whose
  single detail worker is replaced by any newer request (D80), so a replay sent there cancels a pending
  detail request and vice versa. Use `YearInput` (`src/ui/fields.tsx:125`, D84) for the year box. A stale
  session is never recalculated (D85): no replay requests while the recalculate banner is up, and
  `detailArea` (`src/ui/sessions.ts:113`) needs a case for it. Keep that logic in plain, unit-tested
  functions (D87).
- **First version:**
  - A worker request `{ type: 'replay', plan, tier, year, marketYear }` that returns records for that
    historical path.
  - Show them in the existing table and `AccountsChart`.
  - Map market year to path index: `marketYear − (retireYear − plan.startYear)` is the whole-plan start
    year (D47).
- **Test:** replaying a worst-years row's start year reproduces its outcome, lowest savings and ending
  savings (in the example at 2039, start year 1962 runs out in 2065).

---

## 6. Fuller year-by-year table

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

- **Where:** `DetailView` (`src/ui/Results.tsx:229`, rows filtered at `:233`, `COLUMNS` at `:184`);
  `detail.medianPath` and `detail.p10Path` are both already computed. Working years record Reinvested as 0
  and have no wages or contributions columns, so the caption's money-in = money-out identity doesn't hold for
  them; the caption needs a working-years version. A stale session's saved detail already holds both
  `medianPath` and `p10Path`, so the toggle works without recalculating (D85).
- **First version:** a path toggle and a "working years" checkbox on the existing table.
- **Depends on:** D73, now landed ("typical" and "bad" follow the markets closest to those lines).

---

## 7. Upside on the chart

### What it is

The "savings over time" chart has three lines:

- **typical** (50th percentile: half of simulated markets do better);
- **below average** (25th percentile);
- **significantly below average** (10th percentile: only 1 in 10 markets do worse).

That shows how bad things can get, but not how *good* they can get. In the example, the typical ending
balance is about **$15.7M** in today's dollars, far more than needed, and nothing on screen says how likely
that is.

### What you'd see

- Two more lines, hidden until you turn them on: **above average** (75th) and **well above average** (90th).
- A one-line summary under the chart:

  > At age 96: 1 in 10 markets end below $1.3M · half end above $15.7M · 1 in 10 end above $57M.

### Why it's worth doing

Deciding whether to work "one more year", or whether you could spend more, depends on how likely you are
to end up with far more than you need, not only on how bad it can get.

### Today

Only the 50th, 25th and 10th percentile lines.

### For implementers

- **Where:** `bands` in `detailFor` (`src/engine/solve.ts:359`); `BandsChart` (`src/ui/charts.tsx:107`);
  `BAND_LABELS` (:35). Detail views saved in session files have only `p50`/`p25`/`p10`, and a stale session
  shows its saved detail (D85). So `resultsReadable` (`src/ui/sessions.ts:68`) must not require the new
  bands, and the chart and summary must work without them.
- **First version:** add `p75` and `p90` to `bands`; draw them behind the existing zoom toggle; add the
  ending-balance summary from the final column.

---

## 8. Export a report for AI review

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

A button in the top bar, next to **Sessions…**: **Export for AI review**. It's available only when the
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

## Lower priority: international market data

### What it is

All market history here is from the US, 1871–2025. The US was the best-performing major stock market of
that period. Other countries had long stretches that were far worse: Japan after 1990, or Germany and Italy
around the World Wars. Planning only on US history leans optimistic, as the DECISIONS "Which way the
assumptions lean" table notes.

### What you'd see

An option under Assumptions: **"Market history: [US only / Developed markets]"**. The second choice builds
the simulated markets from a wider set of countries, making the answer more cautious.

### For implementers

Needs a free multi-country dataset with stocks, bonds, bills, inflation and a long-term government bond
yield for each year, since bond interest is taxed at each market's own yield (`bondYield`, D82). The
Jordà-Schularick-Taylor Macrohistory Database has all five. It would come in through
`scripts/build-market-data.ts` and `market.json`. `bootstrapPaths` and `historicalPaths` already accept a
`years` list, but `averageInflation`, `averageBondInterestRate` and `averageRealReturns`
(`src/engine/solve.ts`, used by `projectState`, the retirement-only runs' starting price level (D51) and the failure summary) read `MARKET.years` directly and
would need the chosen dataset too.

**Watch the page's size.** `src/data/market.json` (22 kB of US data) is bundled into the main page, not just the
engine's worker, because the UI imports `MARKET` from `src/engine/returns.ts` for its first and last year
(`App.tsx`, `helpText.ts`, `HowItWorks.tsx`, `assumptions.ts`). A multi-country dataset could be many times
larger and would land there too. The build warns above 750 kB (`chunkSizeWarningLimit` in `vite.config.ts`;
the main file was 511 kB at engine 6). Keep the new data out of the main page: export the year
range as a small separate constant for the UI so only the worker loads the full data, and check the build
output. Don't just raise the limit.
