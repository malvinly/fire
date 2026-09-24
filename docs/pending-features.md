# Pending features

New capabilities for the calculator. Bug fixes and accuracy changes are in
[pending-fixes.md](pending-fixes.md). Design choices already made for this work are D-rows in
[DECISIONS.md](DECISIONS.md): where new settings go and what they default to (D81; each feature below names
its placement and default), and keeping the result cards free of extra text (D67). A new design question that
the docs don't answer belongs to the maintainer: ask, don't choose.

Each feature starts with a plain-language explanation of what it is and what you'd see in the app. The
**For implementers** part at the end of each gives code locations and a first version to build. The
workflow for any change is in pending-fixes.md: [How to work on an item](pending-fixes.md#how-to-work-on-an-item)
(tests, engine version, D-numbers, adding `Plan` fields safely) and
[Reproducing the numbers](pending-fixes.md#reproducing-the-numbers). Line numbers were written against commit
`6394336` and have moved since; search for the function name given. The v1 audit's fixes, cited below as
"fix N", have all landed (D63–D80 in DECISIONS.md).

Features are ordered by **importance**: how much each changes a typical user's answer. Numbers come from the
v1 engine on the example plan unless marked *estimate*. Example screen text is illustrative; the final
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
| 6 | Fuller year-by-year table and CSV export | See the bad-market years and the working years, and download them to a spreadsheet. |
| 7 | Upside on the chart | Show how much you might end with in good markets, not only typical and bad ones. |

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

   > **Compared with baseline:** Traditional 2042 (was 2039, **+3 years**; needs $2.76M, was $2.70M) ·
   > Chubby 2046 (was 2043) · Coast unchanged

4. **Clear baseline** removes the strip.

The return adjustment is a new field under **Assumptions (advanced)**: "Returns vs. history (± per year)",
default 0%.

### Why it's worth doing

- It's the quickest way to see which inputs matter for *your* plan, and how sensitive the date is.
- Measured: lowering returns by 1% a year moves the example from 2039 to 2042.
- ProjectionLab and Engaging Data make this kind of comparison easy. Here it takes pen and paper.

### Today

- There is no comparison.
- The "Fees" field (`feeRate`) is subtracted from every year's return, so raising it already works as a
  return cut. That isn't obvious from its label or help text.

### For implementers

- **Where:** results state in `src/App.tsx`; `TierCard` (`src/ui/Results.tsx:51`); `feeRate` is applied in
  `realYears` (`src/engine/returns.ts:38–42`).
- **First version:**
  - Store the current `TierResult`s when "Keep as baseline" is pressed, and render the comparison strip
    between the cards and the warnings panel, not inside `TierCard`. No engine work.
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
(see [Where warnings go](pending-fixes.md#where-warnings-go)), e.g.:

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
  - Social Security: `annualBenefits` (`src/engine/socialSecurity.ts:60`).
  - Tax: `computeTax` (`src/engine/tax.ts`); `FEDERAL` in `src/data/rules.ts` has joint brackets only, so
    single brackets and the single standard deduction must be added. Also add them to
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

- *Estimate:* in the example, about $5k a year of state tax falls on withdrawals and conversions. For
  someone in an exempt state, that's roughly $140k less portfolio needed at a 3.5% withdrawal rate.
- The error leans conservative, so it matters only for people in those states.

### Today

One flat rate (D33), applied to ordinary income plus gains, minus the federal standard deduction. Social
Security is already excluded.

### For implementers

- **Where:** `computeTax` (`src/engine/tax.ts:70`); `stateTax` help (`src/ui/helpText.ts:94`); D33.
- **First version:**
  - Add a `stateRetirementRate` assumption, defaulting to the same value as `stateTaxRate`. Apply it to
    pre-tax withdrawals, RMDs and conversions, and keep the flat rate for gains and other income.
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

- In the example, "You" retires at exactly 55. At the default settings **26.9%** of simulated markets pay
  the 10% penalty at some point before 60 (37.5% in v1, before the 10% fill default). With Rule of 55, many of those penalties wouldn't be real.
- The app counts penalty years as success, so the date may not move much. But the penalty cost is real
  money, and it shrinks the cushion in bad markets.

### Today

- Pre-tax money is penalty-free from the calendar year a person turns 60 (D14, which rounds 59½ up).
  Earlier withdrawals pay 10%.
- Both rules are listed as not modeled in the README.

### For implementers

- **Where:** `ctx.access[i][t] = age >= 60 ? 1 : 0` (`src/engine/context.ts:153`), read in `planDraws`
  (`src/engine/simulate.ts:156`).
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

Today the app shows only the five worst replays, as a list, with two problems:

- the list is labelled by the year the *plan* started (today's equivalent), not the year *retirement*
  started, so "retiring into 1966" appears as 1953 for a 2039 retirement;
- you can't open a replay to see what happened year by year.

### What you'd see

In the detail view:

- A box: **"Replay retiring into year: [1966]"**.
- Choosing a year (or clicking a row of the worst-years list) fills the year-by-year table and the account
  chart with that exact replay: balances, withdrawals, taxes and conversions for each year.

> Retiring into 1966: money lasts until age 91 (runs out in 2078).

### Why it's worth doing

It doesn't change the answer, but it is the most convincing way to trust it. You can see exactly how the
plan copes with a bad decade. FI Calc and cFIREsim both offer it.

### Today

A fixed list of the 5 worst start years; rows aren't clickable. The "Retiring into" column (fix 20, D47)
shows the market year retirement began, which this builds on.

### For implementers

- **Where:** `detailFor` builds `worstHistorical` (`src/engine/solve.ts:315–321`).
  `simulatePath(ctx, e.hist, pathIndex, { record: true })` gives year-by-year records for one historical
  path. Table at `src/ui/Results.tsx:235`.
- **First version:**
  - A worker request `{ type: 'replay', plan, tier, year, marketYear }` that returns records for that
    historical path.
  - Show them in the existing table and `AccountsChart`.
  - Map market year to path index: `marketYear − (retireYear − plan.startYear)` is the whole-plan start
    year (D47).
- **Test:** replaying the worst-years row's start year reproduces its reported failure year.

---

## 6. Fuller year-by-year table and CSV export

### What it is

The detail view has a table showing, for each year of retirement:

- where the spending money came from (Social Security, cash, brokerage, 401(k)/IRA, Roth);
- taxes, penalties and Roth conversions.

Today it shows only **one** market, the typical one, and only **retired** years. The interesting cases are
hidden:

- In the **bad market**, the brokerage can run dry, conversions get cut back and penalties get paid. You
  can see that only as colored bars in a chart, with no numbers.
- **Working years** never appear, so for Coast FIRE the whole coasting period is invisible.
- There is no way to get the numbers into Excel to check them.

### What you'd see

Above the table:

> Show: (•) Typical market ( ) Bad market (1 in 10)   [ ] Include working years   [Download CSV]

The CSV contains exactly what the table shows, one row per year, ready for Excel or Google Sheets.

### Why it's worth doing

Auditability. People who keep their own spreadsheet will trust the date only if they can check it. The bad
market is where the plan's weak spots are (running out of brokerage money, penalties), and today it has no
table. ProjectionLab and cFIREsim both export.

### Today

A typical-market, retired-years-only table; no export of any kind.

### For implementers

- **Where:** `DetailView` (`src/ui/Results.tsx:174`, rows filtered at `:178`, `COLUMNS` at `:154`);
  `detail.medianPath` and `detail.p10Path` are both already computed.
- **First version:**
  - A path toggle and a "working years" checkbox on the existing table.
  - A client-side CSV builder over the visible `YearRecord[]`, downloaded via a Blob link.
  - CSV files are already git-ignored (DEVELOPMENT.md → Privacy); session data never leaves the browser.
- **Depends on:** fix 11, now landed (D73: "typical" and "bad" follow the markets closest to those lines).

---

## 7. Upside on the chart

### What it is

The "savings over time" chart has three lines:

- **typical** (50th percentile: half of simulated markets do better);
- **below average** (25th percentile);
- **significantly below average** (10th percentile: only 1 in 10 markets do worse).

That shows how bad things can get, but not how *good* they can get. In the example, the typical ending
balance is about **$15M** in today's dollars, far more than needed, and nothing on screen says how likely
that is.

### What you'd see

- Two more lines, hidden until you turn them on: **above average** (75th) and **well above average** (90th).
- A one-line summary under the chart:

  > At age 96: 1 in 10 markets end below $74k · half end above $15.1M · 1 in 10 end above $X.

### Why it's worth doing

Deciding whether to work "one more year", or whether you could spend more, depends on how likely you are
to end up with far more than you need, not only on how bad it can get.

### Today

Only the 50th, 25th and 10th percentile lines.

### For implementers

- **Where:** `bands` in `detailFor` (`src/engine/solve.ts:297`); `BandsChart` (`src/ui/charts.tsx:107`).
- **First version:** add `p75` and `p90` to `bands`; draw them behind the existing zoom toggle; add the
  ending-balance summary from the final column.

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

Needs a free multi-country dataset with stocks, bonds, bills and inflation. The Jordà-Schularick-Taylor
Macrohistory Database is one candidate. It would come in through `scripts/build-market-data.ts` and
`market.json`, with the bootstrap in `src/engine/returns.ts` sampling from it.
