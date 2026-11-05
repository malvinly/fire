# Prompt: refresh the FIRE Planner's data

Copy everything below the line into a new session of an LLM coding agent (e.g. Claude Code) started in
this project's folder. It works no matter how many years have passed since the last update.

---

You are updating the data tables of the FIRE Planner in this repository so its calculations use the
latest published numbers. Do not change how the engine works; only refresh data and the tests that
pin data values. Work through every step, verify each against an official source, and finish with a
short report of every value you changed (old → new) and its source URL.

**Ground rule for tests.** Several tests are hand-worked examples (`tests/tax.test.ts`, `tests/paths.test.ts`,
`tests/withdrawals.test.ts`, `tests/socialSecurity.test.ts`, `tests/historical.test.ts`). When new data
makes one fail, recompute the expected value **by hand from the official source** (show the arithmetic in a
comment) — never paste in whatever the engine now outputs. If your hand calculation disagrees with the
engine, stop and report it: that is a bug, not a data update.

**First, orient yourself.** Read `README.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md` (rows D8, D10–D12, D24, D26, D31, D32, D58, D70, D82, D97),
`scripts/build-market-data.ts`, `src/data/rules.ts`, `src/engine/defaults.ts` and
`src/engine/assumptions.ts`. Note today's date; call the current year **Y**. Run `npm install` and
`npm test` to confirm everything passes before you change anything.

**1. Historical market returns** (`src/data/market.json`)
- Open https://shillerdata.com/ and copy the current `ie_data.xls` DOWNLOAD link. If it differs from
  `SHILLER_URL` in `scripts/build-market-data.ts`, update the constant.
- Check `DAMODARAN_URL` (https://pages.stern.nyu.edu/~adamodar/ → Data → Historical returns,
  `histretSP.xls`) still works.
- Run `npm run data:build -- --refresh`. The script stops at the last year that has BOTH a January
  Shiller row for the following year and a Damodaran T-bill value, so `lastYear` may be Y−1 or Y−2.
- Sanity-check: `firstYear` is 1871; no NaN; the newest years look plausible (compare the S&P 500 total
  return for the latest year with a public source within ~2 percentage points; the latest `bondYield`
  should match that January's 10-year Treasury yield (FRED GS10)). If a spreadsheet's column layout
  changed, fix the column indexes in the script (documented in its comments), not the data.
- `tests/paths.test.ts` pins January 1981's `bondYield` at exactly 0.1257 and requires every year's to be
  between 1% and 16% (1946 below 3%), to catch a shifted spreadsheet column. If a refreshed file changes a
  pinned value, check it against FRED GS10 for that January before updating the test.

**2. Federal tax rules** (`src/data/rules.ts` → `FEDERAL`, `LIMITS`, `RULES_YEAR`; the worked examples in
`tests/tax.test.ts`, which hard-code the brackets, deduction, 65+ extra deduction and 0% LTCG threshold; and
in `tests/paths.test.ts`, whose ladder, dated-income and investment-income examples hard-code the brackets
and standard deduction (the 133,000 fill, $11,600 of tax, `32_200`; with one spouse 65+, `33_850`) and whose
catch-up test hard-codes the 401(k)/IRA/HSA limits)
- From the IRS inflation-adjustment release for tax year Y (search "IRS inflation adjustments tax year
  Y", irs.gov newsroom / Rev. Proc.): married-filing-jointly ordinary brackets, standard deduction,
  additional standard deduction per spouse 65+, long-term capital gains 0%/15% thresholds (MFJ).
- 401(k)/IRA/HSA contribution limits and catch-ups for year Y (irs.gov newsroom).
- Check whether Congress changed the law: the Social Security taxation thresholds ($32k/$44k), NIIT
  ($250k, 3.8%), the 10% early-withdrawal penalty, and RMD start ages (SECURE 2.0: 73 for 1951–59
  births, 75 for 1960+). Update `rmdStartAge` and the IRS Uniform Lifetime Table only if they changed
  (and then also the "Required withdrawal" column help in `src/ui/Results.tsx`, which states the ages, and
  the Uniform Lifetime divisors in `tests/withdrawals.test.ts` and `tests/paths.test.ts`).
- Set `RULES_YEAR = Y`. Update the IRS source URL in `src/engine/assumptions.ts` (row "Federal tax").
- If the bracket *rates* themselves changed (not just thresholds), check `bracketTop` in `src/engine/tax.ts`
  and the '10'/'12'/'22'/'24' choices in `src/engine/types.ts` and `src/ui/InputsPanel.tsx`.

**3. Social Security constants** (`src/data/rules.ts` → `SOCIAL_SECURITY`)
- **Pairing rule (read the comment in rules.ts):** the bend points for first-eligibility year E are derived
  from the wage index of year E−2, so always set `awiLatestYear` = E − 2 where E is the year of the bend
  points you use. Always use the pair for year Y (bend points for Y, AWI through Y−2), even if SSA has
  already published next year's pair: the SSA worked-example test below uses year-Y bend points.
- Average wage index series: https://www.ssa.gov/oact/cola/AWI.html — append new years to `awi` and
  extend the year range in its doc comment. (ssa.gov may block scripted downloads; use a browser tool if
  needed.)
- PIA bend points: https://www.ssa.gov/oact/cola/bendpoints.html
- Contribution and benefit base (taxable maximum) for the current year: https://www.ssa.gov/oact/cola/cbb.html
  (also update the `184_500`-style literal in `tests/socialSecurity.test.ts`).
- Update the SSA worked-example test: https://www.ssa.gov/oact/progdata/retirebenefit1.html and
  `retirebenefit2.html` publish "Benefit Calculation Examples for Workers Retiring in Y". Replace the
  case A earnings, AIME, PIA and bend points in `tests/socialSecurity.test.ts` with the new example.
  `computePia` must reproduce SSA's AIME and PIA exactly — if it does not, stop and report why rather
  than loosening the test.

**4. Trust-fund projection** (`src/data/rules.ts` → `TRUST_FUND_DEFAULT`)
- From the latest Social Security Trustees Report (https://www.ssa.gov/oact/trsum/): the OASI trust fund
  depletion year, the percent of scheduled benefits payable at depletion, and the percent payable at
  the end of the 75-year projection (use the report's final projection year as `endYear`).
- If Congress has enacted a fix so no depletion is projected, set `startPct` and `endPct` to 1 and say
  so prominently in the report.
- Update the default-trust-fund test in `tests/socialSecurity.test.ts` and the "2026 Trustees Report"
  wording/URL in `src/engine/assumptions.ts` (`DATA_VERSIONS.trusteesReport` and the row text).

**5. Fidelity defaults** (`src/engine/defaults.ts`)
- Check Fidelity's FI Planner methodology PDF
  (https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/FI_Planner_Methodology.pdf) and
  retirement guidelines: planning age (96), confidence (90%), asset mix (70/25/5: `FIDELITY_MIX` in
  `src/data/mixPaths.ts`, the "Fidelity" choice of "Asset mix over time", D97), spending factor (0.85), wage growth
  (1.5%). Change a default only if Fidelity changed it; note it in the report. If the FI Planner's mix changed,
  update `FIDELITY_MIX` and bump `DATA_VERSIONS.engine` in `src/engine/assumptions.ts` (results change for the same
  inputs), and check the `MIX_SOURCES.fidelity` link still resolves.
- Vanguard's Target Retirement glide path (D97: `VANGUARD_PATH` and `MIX_SOURCES.vanguard` in
  `src/data/mixPaths.ts`, the default "Asset mix over time"). Find the newest Vanguard Target Retirement Funds
  prospectus (SEC EDGAR, filer 752177, form 485BPOS) and re-read its glide-path chart and table (today: 90% stocks
  at 50 and 25 years before the target year, 50% at it, 30% 25 years after), the "within seven years after
  [target year]" sentence (each fund's mix becomes that of the Target Retirement Income Fund, today 30% stocks)
  and the dated funds' target allocations (today they sit within about 1.5 points of stocks of the built-in points
  90% / 60% / 50% / 30% at 25 and 5 years before, at, and 7 years after the target year). If Vanguard changed the
  path, update `VANGUARD_PATH`, the expected values in `tests/mix.test.ts`, the label and URL in `MIX_SOURCES`, and
  D97/D98; and because results change for the same inputs, bump `DATA_VERSIONS.engine` and refresh "Reproducing the
  numbers" in `docs/DEVELOPMENT.md`. Either way, update `MIX_SOURCES.vanguard` to the newest prospectus (its title and date, which the About
  tab and the "How this works" asset-mix row show), re-check
  that Vanguard's research still describes the path for retirement at age 65 (`MIX_SOURCES.vanguardResearch`;
  D98 cites "Choice of equity landing points can benefit target-date investors", May 2025, and "Vanguard's approach
  to target-date funds"), and confirm every `MIX_SOURCES` link and every link in D97 and D98 still resolves. Then read the About tab's asset-mix paragraph and the "How this works" asset-mix row in the app and confirm they
  say only what the new documents support.
- Example healthcare costs (D58: `healthcare` in `examplePlan`, and the `preMedicare` / `medicare` texts in
  `src/ui/helpText.ts`). Pre-65: KFF's average benchmark silver premium for a 40-year-old for year Y
  (search "KFF average benchmark premium Y"), scaled by the federal default age curve to ages 55/60/64;
  keep the same method (average from a mid-50s retirement to 65, plus ~$2–3k out-of-pocket) and the ACA
  out-of-pocket limit for Y. From 65: the Part B standard premium (CMS fact sheet), average Part D premium
  and Medigap Plan G at 65. Round to the nearest $500.
- Common mixes in the "My own mix" stocks help (D97: `COMMON_MIXES` and the note under the list, `HELP.stocksNote`,
  in `src/ui/helpText.ts`; `tests/helpText.test.ts`).
  From each fund's latest fact sheet (the issuer's own PDF, not an aggregator; `pdftotext -layout` reads it):
  stocks, bonds and cash shares for each listed fund. Count TIPS and international bonds as bonds, commodities as
  stocks, short-term and money-market funds as cash; round to whole percents adding to 100. Keep the same
  funds; if one was renamed, update its name, and drop a 2025 fund once it merges into its Income/Retirement
  fund. Update the fact-sheet dates in the comment above the list and in `HELP.stocksNote`, and re-check
  the note's statement of how long each family keeps shifting after its target year against the prospectuses
  (today: Vanguard within 7 years, Fidelity Freedom Index about 15 to 20, BlackRock LifePath Index not at all).

**6. Reference test vs. FI Calc** (`tests/historical.test.ts`)
- Open https://ficalc.app with its defaults ($1,000,000, $40,000 constant-dollar inflation-adjusted,
  30 years, 80% stocks / 15% bonds / 5% cash). Record the success count (e.g. "121 out of 125") in the
  `FICALC` constant and its checked date. The test compares failed windows and allows ±2; if the
  difference is larger, investigate before changing the tolerance.

**7. Text that states data values** — update by hand, then grep for the old numbers to catch leftovers:
- `src/engine/assumptions.ts` (row texts, `DATA_VERSIONS.trusteesReport`). The other `DATA_VERSIONS`
  fields follow the data automatically.
- `src/ui/helpText.ts` (healthcare reference prices, and any other stated value) and `docs/DESIGN.md`.
- The Social Security wage-growth text (`ssWageGrowth` in `src/ui/helpText.ts` and the "Wage growth above
  inflation" row in `src/engine/assumptions.ts`, D77) states the Trustees' intermediate real wage growth
  (1.1%), the benefit rise it implies for someone now 40 and now 50 (27% / 14%) and the 1985–2024 average
  (0.9%). Re-check the rate against the new Trustees Report, extend the average's end year, and recompute the
  two percentages: (1 + g)^(years until that person turns 60).
- The About tab's version line and the "How this works" intro read `DATA_VERSIONS`, so they update themselves
  (the About tab's asset-mix paragraph does not: it follows `src/data/mixPaths.ts`, step 5); confirm
  them in the browser in step 8.
- `docs/DECISIONS.md`: D24–D26, D31–D32, D58 and the "Data update history" table.
- `README.md`: the market-data year range. `docs/DEVELOPMENT.md` (Tests section): the SSA worked example numbers and the FI Calc "121-of-125".
- `docs/DEVELOPMENT.md` (Reproducing the numbers): rerun the probe there, replace the results table and the
  "Before you act on these numbers" example, and say in a sentence that the change comes from the data
  update. Don't bump `DATA_VERSIONS.engine`; the data versions already flag old sessions. The one exception is a
  changed `VANGUARD_PATH` or `FIDELITY_MIX` (step 5): no data version covers them.
- The 4% bond-interest floor and 2% dividend rate (`TAXABLE_YIELDS` in `src/engine/context.ts`, D70, D82) are
  described as close to today's rates. Don't change them; if today's 10-year yield or S&P 500 dividend yield
  has moved far from them, say so in the report.
- Source comments at the top of each block in `src/data/rules.ts`.
- Example: `rg -n "2026|184,500|184_500|1,286|7,749|32,200|32_200|24,800|100,800|133,000|98,900|8,750|8_750" src docs README.md tests`
  and review every hit.

**8. Verify and document**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` must all pass.
- Start the app (`npm run dev`), press Calculate with the example plan, confirm results appear and the
  "How this works" page shows the new data years.
- Add a dated entry to the "Data update history" section at the end of `docs/DECISIONS.md` listing what
  changed. Old plan files will now show "These results were calculated with older data … Recalculate";
  that is expected.
- Tell the user how it reaches them: pushing `main` republishes the public site (the GitHub Pages workflow
  runs the tests and the build); a local copy needs `npm run build` and copying `dist/` again.
- Tell the user: open last year's plan (**Plans…**), **Save as new**, click the banner's "Start plan in
  <year>", update balances, salaries and contributions, then Calculate. Plan files keep their own copy of the
  trust-fund assumption; if the Trustees numbers changed, edit the four trust-fund fields under Assumptions
  in each plan you carry forward ("Reset assumptions to defaults" also works, but resets every other
  field under Assumptions (advanced) too, such as the state tax rate; it leaves the Investments section, the
  asset-mix choice and fund fees, alone, so to take a new mix default pick the choice there).
- Do not commit unless the user asks you to.
