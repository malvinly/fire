# Development

Everything needed to change, test or maintain the FIRE Planner. For using it, see the
[README](../README.md).

## Setup

Requires Node 22.18+ (Vite and Vitest need 22.12+, and `npm run data:build` runs the `.ts` script directly,
which Node does without flags from 22.18; Vitest doesn't support 23 or 25). Developed on Node 24.

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:5391 and reloads as you edit.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5391) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the built `dist/` folder (port 4391; same address as the `dist/` launcher) |
| `npm test` | All tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm run data:build` | Rebuild market data (add `-- --refresh` to re-download the spreadsheets) |

## Making a change

Read [DESIGN.md](DESIGN.md) (what each result means) and skim [DECISIONS.md](DECISIONS.md) (the D-numbers
code comments cite) first. Planned work is in [pending-features.md](pending-features.md). Then:

1. **Follow the recorded decisions.** D-rows are settled; D81 says which way to correct an error and where a
   new setting goes and what it defaults to, and D67 where warnings go. If the work raises a new design
   question that the docs don't answer, it belongs to the maintainer. Ask; don't choose.
2. **Write a failing test first.** It goes in the matching file in `tests/`; `tests/helpers.ts` has plan
   builders and fixed-return helpers. Logic that decides what the screen shows goes in plain functions so it
   can be unit-tested; React wiring is checked in the browser (D87).
3. **Make the change**, then run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` (lint
   has 8 older warnings; add none). For a UI change, check it in the browser: `.claude/launch.json` has
   `fire-dev` (the dev server on port 5391) and `fire-built` (the `dist/` preview on 4391). Commit each change
   once its checks pass. Every push to `main` republishes the public site (D90).
4. **Update the records:**
   - If results change for the same inputs, bump `DATA_VERSIONS.engine` in `src/engine/assumptions.ts`
     (D59) so saved sessions are flagged for recalculation, and refresh
     [Reproducing the numbers](#reproducing-the-numbers).
   - Record any judgement call as a new D-number in DECISIONS.md (the next free number is **D91**). Update
     an existing D-row if its behavior changes, and update the "Which way the assumptions lean" table.
   - If the change affects an assumption shown to users, update its row in `describeAssumptions` in
     `src/engine/assumptions.ts` (the "How this works" page) and its help text in `src/ui/helpText.ts`.
   - Remove a finished item from pending-features.md.
5. **Adding a field to `Plan`** (`src/engine/types.ts`) needs care. Session files (`schemaVersion: 1`,
   `src/ui/sessions.ts`) and the browser draft (`loadDraft` in `src/App.tsx`) are loaded as saved. A new
   assumption gets its default from `DEFAULT_ASSUMPTIONS` automatically (`migratePlan` in
   `src/engine/migrate.ts`, D65); any other new field needs a line there, and a check in
   `src/engine/validate.ts` (D71).
6. **Docs rules:** keep docs in neutral voice with no personal financial details. Commit messages carry no
   AI attribution.

## Project layout

```
src/
  App.tsx        page layout and tabs, Calculate, banners, year picker, browser draft (loadDraft)
  main.tsx       entry point
  version.ts     app version (the built commit's date, YYYY.MM.DD, set by vite.config.ts) and the repository URL
  index.css      styles
  engine/        UI-free calculation engine (pure TypeScript, unit-tested)
    types.ts       Plan, assumption and result types
    simulate.ts    one market path, year by year
    solve.ts       success rates, earliest dates, FIRE numbers, detail view
    context.ts     per-scenario precomputation (Social Security, healthcare, dated items…)
    tax.ts         federal/state tax, Social Security taxation, bracket-fill room
    socialSecurity.ts  PIA from earnings, claiming adjustments, spousal, trust-fund cut
    earnings.ts    reads an SSA earnings record (XML statement or pasted table)
    returns.ts     historical windows and block bootstrap
    assumptions.ts the "How this works" content
    defaults.ts    default assumptions and the example plan
    migrate.ts     fills fields missing from older session files and drafts
    validate.ts    checks loaded plans and inputs before a calculation
  data/
    market.json    generated annual returns and January 10-year yields (committed)
    rules.ts       tax brackets, SSA constants, RMD table (update yearly)
  worker/          engine workers off the main thread: one per FIRE type, one for the detail view (D80)
  ui/              React components (About.tsx, HowItWorks.tsx, InputsPanel.tsx, Results.tsx…), charts, session
                   files, input help text (helpText.ts), field and year parsing (format.ts), the warnings
                   panel's lines (warnings.ts)
public/
  Start FIRE Planner.cmd  double-click launcher, copied into dist/ by the build (not published to the site)
  serve.ps1               tiny localhost-only static server (Windows PowerShell, no Node) used by the launcher
  favicon.svg             app icon
index.html         page shell and metadata
.github/workflows/pages.yml  tests, builds and publishes dist/ to GitHub Pages on every push to main (D90)
data/raw/          downloaded spreadsheets for the data script (not committed, D12)
.claude/launch.json  preview servers: fire-dev (5391) and fire-built (4391)
scripts/
  build-market-data.ts   rebuilds src/data/market.json from Shiller + Damodaran
tests/             Vitest suites (see below)
docs/
  DESIGN.md              research, core design and how each result is defined
  DECISIONS.md           every judgement call (D-numbers), where to change it
  UPDATE_DATA_PROMPT.md  copy-paste prompt for an LLM to refresh the data
  DEVELOPMENT.md         this file
  pending-features.md    planned new features, by importance
```

Terminology: the UI says "simulated markets" and "real past markets"; the code says bootstrap and
historical paths. `docs/DECISIONS.md` D56 has the full mapping.

## Tests

Layered so each kind of mistake has a test that can catch it:

1. **Deterministic** (`tests/deterministic.test.ts`) — fixed returns; must match hand arithmetic exactly
   (perpetuity, depletion, coast discounting, fixed-dollar items).
2. **Historical vs. FI Calc** (`tests/historical.test.ts`) — $1M / $40k / 30 years / 80-15-5 must match
   FI Calc's 121-of-125 windows within two windows; bootstrap sanity checks.
3. **Social Security vs. SSA** (`tests/socialSecurity.test.ts`) — SSA's published 2026 worked example
   (AIME $5,825 → PIA $2,609.80 → $1,826 at 62).
4. **Taxes** (`tests/tax.test.ts`) — hand-worked 2026 MFJ examples incl. Social Security taxation and NIIT.
5. **Account rules** (`tests/withdrawals.test.ts`, `tests/paths.test.ts`) — 59½ boundary, Roth-ladder
   5-year rule, penalties, RMDs, HSA, two spouses of different ages, Social Security in the simulation,
   healthcare phases, gains/basis, an after-tax cash-flow identity (withdrawals + income = spending + taxes),
   yearly tax on brokerage and cash income with bond interest at each market's 10-year yield (D70, D82), and
   money reinvested in retired years (D83).
6. **Headline numbers** (`tests/solve.test.ts`) — the FIRE number, earliest date and Coast number pass at
   the value shown and fail just below it; stricter-of-two; percentile bands; worst-years ordering.
7. **Properties** (`tests/properties.test.ts`) — more spending never helps, more savings never delays FIRE.
8. **Loading and the UI's logic** (`tests/sessions.test.ts`, `tests/warnings.test.ts`, `tests/format.test.ts`,
   `tests/client.test.ts`) — damaged files rejected and old ones migrated, a stale session's saved detail shown
   only for its own FIRE type and year (D85) and its versions kept when saved (D86), the warnings panel's
   lines, field parsing and limits, money boxes' separators and the pronoun for the default name (D90), the
   year picker's typed text (D84), and superseded worker requests cancelled (D80).
9. **Defaults and earnings records** (`tests/defaults.test.ts`, `tests/earnings.test.ts`) — the 10%
   bracket-fill default (D29), default spending levels (D18, D57), the quick-search sample (D5), fields and sections
   still holding example numbers (D64), and SSA earnings read from the XML statement or pasted rows (including CSV).

## Reproducing the numbers

"Example plan" means `examplePlan(2026)` from `src/engine/defaults.ts`: plan start 2026, 10,000 simulated
markets, seed 20260924. Current results (engine version 7, 10% bracket-fill default):

| Tier | Earliest year | FIRE number | Success at that year | Penalty rate at that year |
|---|---|---|---|---|
| Traditional | 2040 | $2,517,100 | 93.6% | 8.8% |
| Chubby | 2043 | $3,278,500 | 91.8% | 0% |
| Coast | stop saving now | $803,900 needed today | 92.3% | 0% |

Engine 7 (D88, over-limit HSA entries) left these and the panel below unchanged: the example plan has no HSA
contributions. Engine 4 (before D82) gave Traditional 2039 / $2,630,700 (90.3%, 26.9% penalty rate), Chubby 2043 /
$3,274,700 (91.9%) and Coast $803,000 (92.4%). Taxing bond interest at each market's own 10-year yield (D82) moved
Traditional's date, but only just: 2039 still passes on all 10,000 markets (90.2%, 27.4% penalty rate) and now
fails on the 2,000-market search subset, so the earliest date is 2040 (D5). The lower penalty rate and FIRE number
come from the later date, not from the tax change. Chubby's number rose $3,800 and Coast's $900.

v1 (engine 3, 12% fill) gave Traditional 2039 / $2,695,200 (37.5% penalty rate), Chubby 2043 / $3,297,400
and Coast $783,000. The main moves: the 10% fill default (D29) lowered Traditional's number and penalty rate; deflating
basis and Roth principal (D63) and taxing dividends and interest yearly (D70) pushed them back up, and D70
raised Coast's number by about 3%.

Probes are easiest as a throwaway Vitest file **outside the repo**, run with the repo's dependencies:

```ts
// <scratch>/probe.test.ts
import { test } from 'vitest';
import { examplePlan } from 'C:/code/github/fire/src/engine/defaults';
import { makeEngine, solveTier, detailFor } from 'C:/code/github/fire/src/engine/solve';

test('probe', () => {
  const plan = examplePlan(2026);
  // plan.assumptions.bracketFill = '10';   // change inputs here
  const e = makeEngine(plan);
  const r = solveTier(e, 'traditional');
  const d = detailFor(e, 'traditional', 2040);
  console.log(r.earliest?.year, r.fireNumber, d.success, d.penaltyRate);
});
```

```ts
// <scratch>/vitest.config.mts
export default { test: { include: ['*.test.ts'], testTimeout: 600000 }, server: { fs: { strict: false } } };
```

Run it with `npx --prefix C:/code/github/fire vitest run --root <scratch> --reporter=verbose`. One
`solveTier` takes about 7 s at 10k markets; `detailFor` takes about 0.7 s.

The "Before you act on these numbers" panel (D67) for the example plan:

> **Before you act on these numbers**
> - Traditional 2040 and Chubby 2043 assume you'll have about $2.52M and $3.28M by then. Re-run each year
>   with your real balances.
> - In 9% of markets the Traditional plan pays a 10% penalty on early 401(k)/IRA withdrawals.
> - Coast assumes you both keep working until 2049 (You 65) with pay covering all spending, and that stopping
>   saving includes giving up employer matches.
> - All amounts are in today's dollars. These are estimates, not financial advice. *What this doesn't model →*

## Yearly data update

Market data, tax brackets, Social Security constants and the Trustees Report change every year.
Paste [`UPDATE_DATA_PROMPT.md`](UPDATE_DATA_PROMPT.md) into a new LLM coding session in this folder;
it refreshes the data, re-checks the reference tests by hand, and verifies the build. Pushing `main`
then republishes the public site; a local copy needs rebuilding (see the README).

## Privacy

The public site is a static build on GitHub Pages: there is no server side, no analytics and no network
request after the page loads. The browser draft (`localStorage`) lives on the site's origin; the launcher
scripts in `public/` are for the local copy and are removed from the Pages build by the workflow.

Session files hold your financial details. `.gitignore` blocks them (files named `YYYY-MM-DD *.json`,
`sessions/`, `fire-sessions/`), SSA statements (`*.xml`, `*.pdf`), spreadsheets/CSVs, `.env` files,
local Claude settings, and anything in `private/` or named `*.private.*`. Keep your sessions folder outside
the repository anyway.
