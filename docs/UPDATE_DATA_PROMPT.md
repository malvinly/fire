# Prompt: refresh the FIRE Planner's data

Copy everything below the line into a new session of an LLM coding agent (e.g. Claude Code) started in
this project's folder. It works no matter how many years have passed since the last update.

---

You are updating the data tables of the FIRE Planner in this repository so its calculations use the
latest published numbers. Do not change how the engine works; only refresh data and the tests that
pin data values. Work through every step, verify each against an official source, and finish with a
short report of every value you changed (old → new) and its source URL.

**Ground rule for tests.** Several tests are hand-worked examples (`tests/tax.test.ts`,
`tests/socialSecurity.test.ts`, `tests/historical.test.ts`). When new data makes one fail, recompute the
expected value **by hand from the official source** (show the arithmetic in a comment) — never paste in
whatever the engine now outputs. If your hand calculation disagrees with the engine, stop and report it:
that is a bug, not a data update.

**First, orient yourself.** Read `README.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md` (rows D10–D12, D24, D26, D31, D32, D58),
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

**2. Federal tax rules** (`src/data/rules.ts` → `FEDERAL`, `LIMITS`, `RULES_YEAR`, and the worked
examples in `tests/tax.test.ts`, which hard-code the brackets, deduction and 0% LTCG threshold)
- From the IRS inflation-adjustment release for tax year Y (search "IRS inflation adjustments tax year
  Y", irs.gov newsroom / Rev. Proc.): married-filing-jointly ordinary brackets, standard deduction,
  additional standard deduction per spouse 65+, long-term capital gains 0%/15% thresholds (MFJ).
- 401(k)/IRA/HSA contribution limits and catch-ups for year Y (irs.gov newsroom).
- Check whether Congress changed the law: the Social Security taxation thresholds ($32k/$44k), NIIT
  ($250k, 3.8%), the 10% early-withdrawal penalty, and RMD start ages (SECURE 2.0: 73 for 1951–59
  births, 75 for 1960+). Update `rmdStartAge` and the IRS Uniform Lifetime Table only if they changed
  (and then also the "Required withdrawal" column help in `src/ui/Results.tsx`, which states the ages).
- Set `RULES_YEAR = Y`. Update the IRS source URL in `src/engine/assumptions.ts` (row "Federal tax").
- If the bracket *rates* themselves changed (not just thresholds), check `bracketTop` in `src/engine/tax.ts`
  and the '10'/'12'/'22'/'24' choices in `src/engine/types.ts` and `src/ui/InputsPanel.tsx`.

**3. Social Security constants** (`src/data/rules.ts` → `SOCIAL_SECURITY`)
- **Pairing rule (read the comment in rules.ts):** the bend points for first-eligibility year E are derived
  from the wage index of year E−2, so always set `awiLatestYear` = E − 2 where E is the year of the bend
  points you use. Always use the pair for year Y (bend points for Y, AWI through Y−2), even if SSA has
  already published next year's pair: the SSA worked-example test below uses year-Y bend points.
- Average wage index series: https://www.ssa.gov/oact/cola/AWI.html — append new years to `awi`.
  (ssa.gov may block scripted downloads; use a browser tool if needed.)
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
  retirement guidelines: planning age (96), confidence (90%), asset mix (70/25/5), spending factor
  (0.85), wage growth (1.5%). Change a default only if Fidelity changed it; note it in the report.
- Example healthcare costs (D58: `healthcare` in `examplePlan`, and the `preMedicare` / `medicare` texts in
  `src/ui/helpText.ts`). Pre-65: KFF's average benchmark silver premium for a 40-year-old for year Y
  (search "KFF average benchmark premium Y"), scaled by the federal default age curve to ages 55/60/64;
  keep the same method (average from a mid-50s retirement to 65, plus ~$2–3k out-of-pocket) and the ACA
  out-of-pocket limit for Y. From 65: the Part B standard premium (CMS fact sheet), average Part D premium
  and Medigap Plan G at 65. Round to the nearest $500.

**6. Reference test vs. FI Calc** (`tests/historical.test.ts`)
- Open https://ficalc.app with its defaults ($1,000,000, $40,000 constant-dollar inflation-adjusted,
  30 years, 80% stocks / 15% bonds / 5% cash). Record the success count (e.g. "121 out of 125") in the
  `FICALC` constant and its checked date. The test compares failed windows and allows ±2; if the
  difference is larger, investigate before changing the tolerance.

**7. Text that states data values** — update by hand, then grep for the old numbers to catch leftovers:
- `src/engine/assumptions.ts` (row texts, `DATA_VERSIONS.trusteesReport`). The other `DATA_VERSIONS`
  fields follow the data automatically.
- `src/ui/helpText.ts` (healthcare reference prices, and any other stated value) and `docs/DESIGN.md`.
- `docs/DECISIONS.md`: D24–D26, D31–D32, D58 and the "Data update history" table.
- `README.md`: the market-data year range. `docs/DEVELOPMENT.md` (Tests section): the SSA worked example numbers and the FI Calc "121-of-125".
- Source comments at the top of each block in `src/data/rules.ts`.
- Example: `rg -n "2026|184,500|184_500|1,286|7,749|32,200|98,900" src docs README.md tests` and review every hit.

**8. Verify and document**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` must all pass.
- Start the app (`npm run dev`), press Calculate with the example plan, confirm results appear and the
  "How this works" page shows the new data years.
- Add a dated entry to the "Data update history" section at the end of `docs/DECISIONS.md` listing what
  changed. Old session files will now show "These results were calculated with older data … Recalculate";
  that is expected.
- Remind the user to rebuild their permanent copy (`npm run build`, then copy `dist/` again if they keep it elsewhere).
- Tell the user: open last year's session, **Save as new**, click the banner's "Start plan in <year>", update
  balances, salaries and contributions, then Calculate. Sessions keep their own copy of the trust-fund
  assumption; if the Trustees numbers changed, edit the four trust-fund fields under Assumptions in each
  session you carry forward ("Reset assumptions to defaults" also works, but resets every other assumption
  too, such as the asset mix and state tax rate).
- Do not commit unless the user asks you to.
